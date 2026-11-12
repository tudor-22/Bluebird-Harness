import { memoryTypeSchema, type MemoryType } from "@bluebird/shared";
import type { ExtraTool } from "../agent/tools";
import { ToolError } from "../agent/workspace";
import { withUser } from "../db/pool";
import type { ServerDeps } from "../deps";

const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const words = (query: string) =>
  [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2))].slice(0, 8);

/**
 * Tools that let the assistant look after its own memory: write down what it
 * learns about the person on purpose, look it up, drop what is wrong, and
 * search the older conversation. The after-reply extractor still runs; these
 * cover what the assistant knows matters right now.
 */
export function memoryTools(deps: Pick<ServerDeps, "pool" | "embeddings">, userId: string): ExtraTool[] {
  const text = (value: unknown, label: string, max = 800) => {
    if (typeof value !== "string" || !value.trim()) throw new ToolError(`"${label}" is required.`);
    return value.trim().slice(0, max);
  };
  return [
    {
      kind: "write",
      spec: {
        name: "memory_save",
        description:
          "Remember something durable about the person or their work: a preference, a fact, a project, a standing instruction. Write one short third-person sentence, such as 'Prefers answers in British English'. Do not save small talk, guesses or anything sensitive they did not say outright.",
        parameters: object(
          {
            content: { type: "string" },
            type: { type: "string", description: "preference, fact, project, goal, relationship, event, habit, instruction, technical_context, professional_context" },
            importance: { type: "number", description: "0 to 1; how much it should shape later replies." },
          },
          ["content"],
        ),
      },
      prepare(args) {
        const content = text(args.content, "content");
        const parsed = memoryTypeSchema.safeParse(args.type);
        const type: MemoryType = parsed.success ? parsed.data : "fact";
        const importance = typeof args.importance === "number" ? Math.min(1, Math.max(0, args.importance)) : 0.7;
        return {
          name: "memory_save",
          kind: "write",
          summary: `Remember: ${content.slice(0, 100)}`,
          scope: "memory",
          autoSafe: true,
          async run() {
            let vector: number[] | null = null;
            if (deps.embeddings) vector = (await deps.embeddings.embed([content]).catch(() => [[]]))[0] ?? null;
            return withUser(deps.pool, userId, async (client) => {
              const same = await client.query(
                "SELECT 1 FROM memories WHERE user_id = $1 AND status = 'active' AND lower(content) = lower($2) LIMIT 1",
                [userId, content],
              );
              if (same.rowCount) return "Already remembered.";
              const inserted = await client.query<{ id: string }>(
                `INSERT INTO memories (user_id, type, content, importance, confidence, status, valid_from, metadata)
                 VALUES ($1, $2, $3, $4, 0.9, 'active', now(), $5::jsonb) RETURNING id`,
                [userId, type, content, importance, JSON.stringify({ source: "agent_tool" })],
              );
              if (vector && vector.length > 0 && deps.embeddings) {
                await client.query(
                  `INSERT INTO memory_embeddings (memory_id, model, embedding) VALUES ($1, $2, $3::real[])
                   ON CONFLICT (memory_id, model) DO NOTHING`,
                  [inserted.rows[0].id, deps.embeddings.name, vector],
                ).catch(() => undefined);
              }
              return `Remembered (id ${inserted.rows[0].id}).`;
            });
          },
        };
      },
    },
    {
      kind: "read",
      spec: {
        name: "memory_search",
        description: "Look through what is remembered about the person. Returns matching memories with their ids.",
        parameters: object({ query: { type: "string" } }, ["query"]),
      },
      prepare(args) {
        const query = text(args.query, "query", 200);
        return {
          name: "memory_search",
          kind: "read",
          summary: `Search memory for ${query.slice(0, 60)}`,
          scope: "read",
          async run() {
            const terms = words(query);
            const rows = await withUser(deps.pool, userId, async (client) => {
              const { rows } = await client.query<{ id: string; type: string; content: string }>(
                `SELECT id, type, content FROM memories
                  WHERE user_id = $1 AND status = 'active'
                    AND ($2::text[] = '{}' OR EXISTS (SELECT 1 FROM unnest($2::text[]) t WHERE lower(content) LIKE '%' || t || '%'))
                  ORDER BY importance DESC, updated_at DESC LIMIT 12`,
                [userId, terms],
              );
              return rows;
            });
            return rows.length ? rows.map((row) => `[${row.id}] (${row.type}) ${row.content}`).join("\n") : "Nothing remembered matches that.";
          },
        };
      },
    },
    {
      kind: "write",
      spec: {
        name: "memory_forget",
        description: "Forget a memory that is wrong or that the person asked you to drop. Use the id from memory_search.",
        parameters: object({ id: { type: "string" } }, ["id"]),
      },
      prepare(args) {
        const id = text(args.id, "id", 60);
        return {
          name: "memory_forget",
          kind: "write",
          summary: `Forget memory ${id.slice(0, 8)}`,
          scope: "memory",
          autoSafe: true,
          async run() {
            const done = await withUser(deps.pool, userId, async (client) => {
              const { rowCount } = await client.query(
                "UPDATE memories SET status = 'deleted', updated_at = now() WHERE id::text = $1 AND user_id = $2 AND status <> 'deleted'",
                [id, userId],
              );
              return (rowCount ?? 0) > 0;
            });
            if (!done) throw new ToolError("No memory with that id.");
            return "Forgotten.";
          },
        };
      },
    },
    {
      kind: "read",
      spec: {
        name: "recall_chat",
        description:
          "Search the whole past conversation, including what is no longer in view, for something the person said or you did. Use it when they refer to something from earlier that you cannot see.",
        parameters: object({ query: { type: "string" } }, ["query"]),
      },
      prepare(args) {
        const query = text(args.query, "query", 200);
        return {
          name: "recall_chat",
          kind: "read",
          summary: `Search past messages for ${query.slice(0, 60)}`,
          scope: "read",
          async run() {
            const terms = words(query);
            if (terms.length === 0) throw new ToolError("Give a few words to look for.");
            const rows = await withUser(deps.pool, userId, async (client) => {
              const { rows } = await client.query<{ role: string; content: string; created_at: Date }>(
                `SELECT role, content, created_at FROM messages
                  WHERE user_id = $1 AND role IN ('user', 'assistant') AND content <> ''
                    AND (SELECT count(*) FROM unnest($2::text[]) t WHERE lower(content) LIKE '%' || t || '%') >= GREATEST(1, $3)
                  ORDER BY created_at DESC LIMIT 8`,
                [userId, terms, Math.ceil(terms.length / 2)],
              );
              return rows;
            });
            if (rows.length === 0) return "Nothing in the past conversation matches that.";
            return rows
              .map((row) => `${row.created_at.toISOString().slice(0, 16).replace("T", " ")} ${row.role === "user" ? "Person" : "You"}: ${row.content.replace(/\s+/g, " ").slice(0, 400)}`)
              .join("\n");
          },
        };
      },
    },
  ];
}
