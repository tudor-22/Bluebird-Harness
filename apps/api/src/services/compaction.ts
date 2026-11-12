import type { Db } from "../db/pool";
import { withUser } from "../db/pool";
import {
  estimatePromptTokens,
  MODEL_CONTEXT_TOKENS,
  TEMPLATE_SYSTEM_PROMPT_TOKENS,
} from "../model/ollama";
import type { ModelProvider } from "../model/types";

/**
 * Fold older turns into the summary once the history alone fills about 40% of
 * the window. The standing instructions and the reply need the rest.
 */
export const CONTEXT_COMPACT_TRIGGER_TOKENS = Math.floor(MODEL_CONTEXT_TOKENS * 0.4);
/** Recent turns kept verbatim after compaction, so the next reply has footing. */
export const CONTEXT_COMPACT_KEEP_MESSAGES = 8;
/** The recent tail may keep fewer messages when those messages are huge. */
export const CONTEXT_COMPACT_TAIL_TOKENS = Math.floor(MODEL_CONTEXT_TOKENS * 0.15);
/** Bound the summarizer input; the stored summary covers anything older. */
export const CONTEXT_COMPACT_LOOKBACK = 400;
const IMAGE_TOKEN_ESTIMATE = 1600;

const COMPACT_GUARD =
  "Write a factual summary of the messages below in plain text, at most 200 words. " +
  "Do not greet or address anyone, and do not reply to or continue the conversation; " +
  "only write the summary.";

export type CompactionDeps = {
  pool: Db;
  model: ModelProvider;
};

export type CompactionOptions = {
  /** The model's context window in tokens; compaction starts when the history fills most of it. */
  window?: number;
  /** Compact now whatever the size (the /compact command). */
  force?: boolean;
};

/** Share of the window the history may fill before it is folded into a summary. */
export const COMPACT_AT_FRACTION = 0.7;

/** For /compact: fold everything but the last few messages. */
function forcedCutoff(rows: CompactionRow[], keep = 2): number {
  return rows.length <= keep ? 0 : rows.length - keep;
}

export type CompactionInput = {
  userId: string;
  conversationId: string;
};

type CompactionRow = {
  seq: string | number;
  role: "user" | "assistant";
  content: string;
};

type ConversationMeta = {
  summary?: string;
  summaryUntilSeq?: number;
  compactionCount?: number;
};

/** The prompt-token estimate for a run of stored rows. */
export function estimateRowsTokens(rows: CompactionRow[]): number {
  return (
    estimatePromptTokens(
      rows.map((row) => ({
        role: row.role,
        content: row.content,
      })),
    ) + TEMPLATE_SYSTEM_PROMPT_TOKENS
  );
}

/** Returns how many of the oldest rows to fold into the summary. */
export function compactionCutoff(
  rows: CompactionRow[],
  tokens = estimateRowsTokens(rows),
  trigger = CONTEXT_COMPACT_TRIGGER_TOKENS,
  keep = CONTEXT_COMPACT_KEEP_MESSAGES,
  tailTokens = CONTEXT_COMPACT_TAIL_TOKENS,
): number {
  if (rows.length <= 1 || tokens < trigger) return 0;
  let kept = 0;
  let spent = 0;
  for (let index = rows.length - 1; index >= 0 && kept < keep; index -= 1) {
    const row = rows[index];
    const cost = estimatePromptTokens([{ role: row.role, content: row.content }]);
    if (kept > 0 && spent + cost > tailTokens) break;
    spent += cost;
    kept += 1;
  }
  return rows.length - kept;
}

/**
 * Compacts before a reply when the live prompt is close to the input limit.
 * The transcript stays intact in Postgres; only the model context resets to
 * the summary plus the newest turns.
 */
export async function compactThreadIfNeeded(
  deps: CompactionDeps,
  input: CompactionInput,
  options: CompactionOptions = {},
): Promise<{ compacted: boolean; summarizedMessages: number; summaryUntilSeq?: number }> {
  const data = await withUser(deps.pool, input.userId, async (client) => {
    const conversation = await client.query<{ metadata: ConversationMeta }>(
      "SELECT metadata FROM conversations WHERE id = $1 AND user_id = $2",
      [input.conversationId, input.userId],
    );
    const meta = conversation.rows[0]?.metadata ?? {};
    const until = Number(meta.summaryUntilSeq ?? 0);
    const messages = await client.query<CompactionRow>(
      `SELECT seq, role, content FROM (
         SELECT seq, role, content FROM messages
          WHERE user_id = $1 AND conversation_id = $2
            AND role IN ('user', 'assistant') AND content <> ''
            AND seq > $3
          ORDER BY seq DESC
          LIMIT $4
       ) recent
       ORDER BY seq ASC`,
      [input.userId, input.conversationId, until, CONTEXT_COMPACT_LOOKBACK],
    );
    const images = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM attachments a
         JOIN messages m ON m.id = a.message_id
        WHERE m.user_id = $1 AND m.conversation_id = $2
          AND m.seq > $3 AND a.kind = 'image'`,
      [input.userId, input.conversationId, until],
    );
    return {
      meta,
      rows: messages.rows,
      images: Number(images.rows[0]?.count ?? 0),
    };
  });

  const tokens = estimateRowsTokens(data.rows) + data.images * IMAGE_TOKEN_ESTIMATE;
  const window = options.window ?? MODEL_CONTEXT_TOKENS;
  const cutoff = options.force
    ? forcedCutoff(data.rows)
    : compactionCutoff(
        data.rows,
        tokens,
        Math.floor(window * COMPACT_AT_FRACTION),
        CONTEXT_COMPACT_KEEP_MESSAGES,
        Math.floor(window * 0.15),
      );
  if (cutoff === 0) {
    return { compacted: false, summarizedMessages: 0 };
  }

  const older = data.rows.slice(0, cutoff);
  const transcript = older
    .map(
      (row) =>
        `${row.role === "user" ? "User" : "Assistant"}: ${row.content
          .replace(/\s+/g, " ")
          .slice(0, 1200)}`,
    )
    .join("\n");
  const previous = data.meta.summary
    ? `Previous summary:\n${data.meta.summary}\n\n`
    : "";

  const summary = (
    await deps.model.complete({
      messages: [
        {
          role: "system",
          content:
            "[[task]]\nYou compact conversation history for future replies. Keep people, " +
            "preferences, decisions, projects, commitments and open questions. Refer to the assistant " +
            "as it, never with gendered pronouns. Plain text, no markdown, at most 200 words.",
        },
        {
          role: "user",
          content: `${COMPACT_GUARD}\n\n${previous}Messages to fold in:\n${transcript}`,
        },
      ],
      thinking: false,
      maxTokens: 1200,
    })
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  if (!summary) {
    return { compacted: false, summarizedMessages: 0 };
  }

  const last = older[older.length - 1];
  const summaryUntilSeq = Number(last.seq);
  const compactedAt = new Date().toISOString();
  await withUser(deps.pool, input.userId, async (client) => {
    await client.query(
      `UPDATE conversations
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'summary', $3::text,
                'summaryUntilSeq', $4::bigint,
                'compactedAt', $5::text,
                'compactionCount',
                COALESCE((metadata->>'compactionCount')::int, 0) + 1
              ),
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [input.conversationId, input.userId, summary, summaryUntilSeq, compactedAt],
    );
  });

  return {
    compacted: true,
    summarizedMessages: cutoff,
    summaryUntilSeq,
  };
}

/**
 * Tokens the model would be sent for this thread right now: the summary plus
 * the messages after it. Used by the ring once a compaction has made the
 * engine's last reported count out of date.
 */
export async function liveContextTokens(
  pool: Db,
  input: CompactionInput,
): Promise<{ compactedAt: string | null; tokens: number }> {
  return withUser(pool, input.userId, async (client) => {
    const conversation = await client.query<{ metadata: ConversationMeta & { compactedAt?: string } }>(
      "SELECT metadata FROM conversations WHERE id = $1 AND user_id = $2",
      [input.conversationId, input.userId],
    );
    const meta = conversation.rows[0]?.metadata ?? {};
    const rows = await client.query<CompactionRow>(
      `SELECT seq, role, content FROM messages
        WHERE user_id = $1 AND conversation_id = $2
          AND role IN ('user', 'assistant') AND content <> '' AND seq > $3
        ORDER BY seq ASC`,
      [input.userId, input.conversationId, Number(meta.summaryUntilSeq ?? 0)],
    );
    const summary = meta.summary ? [{ seq: 0, role: "assistant" as const, content: meta.summary }] : [];
    return { compactedAt: meta.compactedAt ?? null, tokens: estimateRowsTokens([...summary, ...rows.rows]) };
  });
}
