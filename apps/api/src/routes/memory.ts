import {
  updateMemoryRequestSchema,
  type Memory,
  type MemoryListResponse,
} from "@bluebird/shared";
import type { FastifyInstance } from "fastify";
import { withUser } from "../db/pool";
import type { ServerDeps } from "../deps";
import { UUID_PATTERN } from "./uuid";

type MemoryRow = {
  id: string;
  type: Memory["type"];
  content: string;
  importance: number;
  confidence: number;
  status: Memory["status"];
  valid_from: Date;
  valid_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    importance: row.importance,
    confidence: row.confidence,
    status: row.status,
    validFrom: row.valid_from.toISOString(),
    validUntil: row.valid_until ? row.valid_until.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function memoryRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get<{ Querystring: { includeInvalidated?: string } }>("/memory", async (request) => {
    const user = request.authUser!;
    const includeInvalidated = ["1", "true", "yes"].includes(
      String(request.query?.includeInvalidated ?? "").toLowerCase(),
    );
    const items = await withUser(deps.pool, user.id, async (client) => {
      const { rows } = await client.query<MemoryRow>(
        `SELECT id, type, content, importance, confidence, status,
                valid_from, valid_until, created_at, updated_at
           FROM memories
          WHERE user_id = $1
            AND status IN ('active', 'invalidated')
            AND ($2::boolean OR status = 'active')
          ORDER BY (status = 'active') DESC, importance DESC, updated_at DESC
          LIMIT 200`,
        [user.id, includeInvalidated],
      );
      return rows.map(toMemory);
    });
    const payload: MemoryListResponse = { items };
    return payload;
  });

  app.delete<{ Params: { id: string } }>("/memory/:id", async (request, reply) => {
    const user = request.authUser!;
    const id = request.params.id;
    if (!UUID_PATTERN.test(id)) {
      return reply.status(404).send({ ok: false, error: "Memory not found." });
    }
    const updated = await withUser(deps.pool, user.id, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE memories
            SET status = 'deleted', updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status <> 'deleted'`,
        [id, user.id],
      );
      return (rowCount ?? 0) > 0;
    });
    if (!updated) return reply.status(404).send({ ok: false, error: "Memory not found." });
    return { ok: true as const };
  });

  app.patch<{ Params: { id: string } }>("/memory/:id", async (request, reply) => {
    const user = request.authUser!;
    const id = request.params.id;
    if (!UUID_PATTERN.test(id)) {
      return reply.status(404).send({ ok: false, error: "Memory not found." });
    }
    const parsed = updateMemoryRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.status(400).send({ ok: false, error: issue?.message ?? "Invalid memory." });
    }

    const updated = await withUser(deps.pool, user.id, async (client) => {
      const { rows } = await client.query<MemoryRow>(
        `UPDATE memories
            SET content = COALESCE($3::text, content),
                type = COALESCE($4::text, type),
                updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status <> 'deleted'
          RETURNING id, type, content, importance, confidence, status,
                    valid_from, valid_until, created_at, updated_at`,
        [id, user.id, parsed.data.content ?? null, parsed.data.type ?? null],
      );
      return rows[0] ? toMemory(rows[0]) : null;
    });
    if (!updated) return reply.status(404).send({ ok: false, error: "Memory not found." });
    return updated;
  });
}
