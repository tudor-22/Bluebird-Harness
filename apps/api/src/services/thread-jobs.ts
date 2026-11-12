import type { Db } from "../db/pool";
import { withUser } from "../db/pool";
import type { EmbeddingProvider } from "../embeddings/types";
import type { ModelProvider } from "../model/types";
import { HISTORY_WINDOW } from "./context";

const SUMMARY_TRIGGER = 20;
const SUMMARY_BATCH = 80;

/** Without this guard in the user turn, the build replies to the transcript. */
const SUMMARY_GUARD =
  "Write a factual summary of the messages below in plain text, at most 200 words. " +
  "Do not greet or address anyone, and do not reply to or continue the conversation; " +
  "only write the summary.";

export type MaintenanceDeps = {
  pool: Db;
  embeddings: EmbeddingProvider | null;
  model: ModelProvider;
};

export type MaintenanceInput = {
  userId: string;
  conversationId: string;
  messageIds: string[];
};

/**
 * Background upkeep after a reply: embed the new messages for retrieval and,
 * when the archive has grown past the window, refresh the rolling summary —
 * the "context refresh" that keeps the thread usable at any length.
 */
export function scheduleThreadMaintenance(deps: MaintenanceDeps, input: MaintenanceInput): void {
  void maintain(deps, input).catch(() => undefined);
}

async function maintain(deps: MaintenanceDeps, input: MaintenanceInput): Promise<void> {
  if (deps.embeddings) {
    // Embeddings are optional locally; a missing model must not stop summaries.
    await embedMessages(deps, input).catch(() => undefined);
  }
  await refreshSummary(deps, input);
}

async function embedMessages(deps: MaintenanceDeps, input: MaintenanceInput): Promise<void> {
  const embeddings = deps.embeddings;
  if (!embeddings) return;

  const rows = await withUser(deps.pool, input.userId, async (client) => {
    const result = await client.query<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, content, metadata FROM messages
        WHERE user_id = $1
          AND id = ANY($2::uuid[])
          AND (
            content <> ''
            OR metadata->'imageNotes' IS NOT NULL
            OR metadata->'transcripts' IS NOT NULL
          )
          AND NOT EXISTS (SELECT 1 FROM message_embeddings e WHERE e.message_id = messages.id)`,
      [input.userId, input.messageIds],
    );
    return result.rows;
  });
  if (rows.length === 0) return;

  const vectors = await embeddings.embed(rows.map((row) => embedTextFor(row)));
  await withUser(deps.pool, input.userId, async (client) => {
    for (let index = 0; index < rows.length; index++) {
      const vector = vectors[index];
      if (!vector || vector.length === 0) continue;
      await client.query(
        `INSERT INTO message_embeddings (message_id, model, embedding)
         VALUES ($1, $2, $3::real[])
         ON CONFLICT (message_id) DO NOTHING`,
        [rows[index].id, embeddings.name, vector],
      );
    }
  });
}

/** Image content is searchable through its grounding notes, not just the text. */
function embedTextFor(row: { content: string; metadata: Record<string, unknown> }): string {
  const notes = Array.isArray(row.metadata?.imageNotes)
    ? (row.metadata.imageNotes as unknown[]).filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
  const transcripts = Array.isArray(row.metadata?.transcripts)
    ? (row.metadata.transcripts as unknown[]).filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
  const parts = [row.content.trim()];
  if (notes.length > 0) parts.push(`What the images show: ${notes.join(" ")}`);
  if (transcripts.length > 0) parts.push(`Their voice note said: ${transcripts.join(" ")}`);
  const text = parts.filter(Boolean).join("\n\n");
  return text.slice(0, 6000);
}

async function refreshSummary(deps: MaintenanceDeps, input: MaintenanceInput): Promise<void> {
  const data = await withUser(deps.pool, input.userId, async (client) => {
    const conversation = await client.query<{
      metadata: { summary?: string; summaryUntilSeq?: number };
    }>("SELECT metadata FROM conversations WHERE id = $1 AND user_id = $2", [
      input.conversationId,
      input.userId,
    ]);
    const meta = conversation.rows[0]?.metadata ?? {};
    const until = Number(meta.summaryUntilSeq ?? 0);

    const older = await client.query<{ seq: string; role: string; content: string }>(
      `SELECT seq, role, content FROM (
         SELECT seq, role, content FROM messages
          WHERE user_id = $1 AND conversation_id = $2
            AND role IN ('user', 'assistant') AND content <> ''
          ORDER BY seq DESC
          OFFSET $3
          LIMIT $4
       ) older
       WHERE seq > $5
       ORDER BY seq ASC`,
      [input.userId, input.conversationId, HISTORY_WINDOW, SUMMARY_BATCH, until],
    );
    return { meta, older: older.rows };
  });

  if (data.older.length < SUMMARY_TRIGGER) return;

  const transcript = data.older
    .map((row) => `${row.role === "user" ? "User" : "Assistant"}: ${row.content.slice(0, 600)}`)
    .join("\n");
  const previous = data.meta.summary ? `Previous summary:\n${data.meta.summary}\n\n` : "";

  const summary = (
    await deps.model.complete({
      messages: [
        {
          role: "system",
          content:
            "[[task]]\nYou compress conversation history. Write a factual summary of what matters " +
            "for future replies: people, preferences, decisions, projects and open questions. " +
            "Refer to the assistant as it, never with gendered pronouns. " +
            "Plain text, no markdown, at most 200 words.",
        },
        {
          role: "user",
          content: `${SUMMARY_GUARD}\n\n${previous}New messages to fold in:\n${transcript}`,
        },
      ],
      thinking: false,
      maxTokens: 4096,
    })
  ).trim();
  if (!summary) return;

  const lastSeq = Number(data.older[data.older.length - 1].seq);
  await withUser(deps.pool, input.userId, async (client) => {
    await client.query(
      `UPDATE conversations
          SET metadata = jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{summary}', to_jsonb($3::text)),
                '{summaryUntilSeq}',
                to_jsonb($4::bigint)
              ),
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [input.conversationId, input.userId, summary, lastSeq],
    );
  });
}
