import { memoryTypeSchema, type MemoryType } from "@bluebird/shared";
import os from "node:os";
import { z } from "zod";

import type { Db, DbClient } from "../db/pool";
import { withUser } from "../db/pool";
import type { EmbeddingProvider } from "../embeddings/types";
import type { ModelProvider } from "../model/types";
import { sanitizeAssistantText } from "../model/sanitize";

export const MEMORY_IMPORTANCE_MIN = 0.5;
export const MEMORY_CONFIDENCE_MIN = 0.7;
export const MEMORY_DUPLICATE_SCORE = 0.92;
export const MEMORY_OBVIOUS_DUPLICATE_SCORE = 0.96;
const WORKER_INTERVAL_MS = 5_000;
const MAX_CANDIDATES = 8;

const candidateSchema = z.object({
  type: memoryTypeSchema,
  content: z.string().trim().min(1).max(800),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  validFrom: z.string().max(40).nullable().optional(),
});

const candidateResponseSchema = z.object({
  memories: z.array(candidateSchema).max(20),
});

export type MemoryCandidate = z.infer<typeof candidateSchema>;

const EXTRACTION_PROMPT = [
  "[[task]]",
  "You extract durable long-term memories from one exchange with a private AI assistant.",
  "Return only strict JSON with this shape: {\"memories\":[{\"type\":\"preference\",\"content\":\"...\",\"importance\":0.8,\"confidence\":0.9,\"validFrom\":null}]}.",
  "Allowed types: preference, fact, project, goal, relationship, event, habit, instruction, technical_context, professional_context, temporal.",
  "Keep only information worth remembering beyond the current turn: stable preferences, personal facts, ongoing projects, goals, relationships, important events, habits, standing instructions, durable technical or professional context, and time-bound facts.",
  "Write concise third-person statements, not quoted user text: 'Prefers concise answers', 'Works on Project Aurora', 'Has a 50-litre aquarium'. Never store transient small talk, guesses, assistant claims, medical or legal inferences, sensitive conclusions not explicitly stated, or temporary states.",
  "importance and confidence must be numbers from 0 to 1. validFrom is an ISO date when the person explicitly gives one, otherwise null.",
  "Return an empty memories array when nothing is durable. Do not include commentary.",
].join(" ");

const EXTRACTION_GUARD =
  "Extract memories from the user's message below. Do not answer the message. " +
  "Only return the JSON object.";

type MemoryJobRow = {
  id: string;
  attempts: number;
  max_attempts: number;
  payload: unknown;
};

type MemoryJobPayload = {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  assistantMessageId: string;
};

type SourceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
};

type SimilarMemory = {
  id: string;
  content: string;
  type: MemoryType;
  similarity: number;
};

type Adjudication = "duplicate" | "supersede" | "insert";

export type MemoryWorkerDeps = {
  pool: Db;
  model: ModelProvider;
  embeddings: EmbeddingProvider | null;
};

function jsonObject(source: string): unknown {
  const trimmed = source.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseMemoryCandidates(raw: string): MemoryCandidate[] {
  const parsed = candidateResponseSchema.safeParse(jsonObject(sanitizeAssistantText(raw)));
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.memories
    .filter(
      (candidate) =>
        candidate.importance >= MEMORY_IMPORTANCE_MIN &&
        candidate.confidence >= MEMORY_CONFIDENCE_MIN,
    )
    .filter((candidate) => {
      const key = candidate.content.toLocaleLowerCase("en-GB").replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES);
}

function parseAdjudication(raw: string): Adjudication {
  const match = raw.trim().match(/\b(DUPLICATE|SUPERSEDE|INSERT)\b/i);
  if (!match) return "insert";
  const value = match[1].toUpperCase();
  if (value === "DUPLICATE") return "duplicate";
  if (value === "SUPERSEDE") return "supersede";
  return "insert";
}

function parsePayload(value: unknown): MemoryJobPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.userId !== "string" ||
    typeof payload.conversationId !== "string" ||
    typeof payload.sourceMessageId !== "string" ||
    typeof payload.assistantMessageId !== "string"
  ) {
    return null;
  }
  return {
    userId: payload.userId,
    conversationId: payload.conversationId,
    sourceMessageId: payload.sourceMessageId,
    assistantMessageId: payload.assistantMessageId,
  };
}

export async function enqueueMemoryExtraction(
  client: DbClient,
  input: MemoryJobPayload,
): Promise<void> {
  await client.query(
    `INSERT INTO jobs (type, payload, status, run_at)
     VALUES ('memory_extract', $1::jsonb, 'pending', now())
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(input)],
  );
}

async function claimJob(pool: Db, workerId: string): Promise<MemoryJobRow | null> {
  const { rows } = await pool.query<MemoryJobRow>(
    `WITH next_job AS (
       SELECT id
         FROM jobs
        WHERE type = 'memory_extract'
          AND (
            (status = 'pending' AND run_at <= now())
            OR (status = 'running' AND locked_at < now() - interval '15 minutes')
          )
        ORDER BY run_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE jobs AS job
        SET status = 'running',
            attempts = job.attempts + 1,
            locked_at = now(),
            locked_by = $1
       FROM next_job
      WHERE job.id = next_job.id
      RETURNING job.id, job.attempts, job.max_attempts, job.payload`,
    [workerId],
  );
  return rows[0] ?? null;
}

async function completeJob(pool: Db, id: string): Promise<void> {
  await pool.query(
    `UPDATE jobs
        SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL
      WHERE id = $1`,
    [id],
  );
}

async function failJob(pool: Db, job: MemoryJobRow, error: unknown): Promise<void> {
  const failed = job.attempts >= job.max_attempts;
  const category = error instanceof Error ? error.name : "MemoryJobError";
  await pool.query(
    `UPDATE jobs
        SET status = $2,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $3,
            run_at = CASE WHEN $2 = 'pending'
                          THEN now() + make_interval(secs => LEAST(300, 15 * attempts))
                          ELSE run_at END
      WHERE id = $1`,
    [job.id, failed ? "failed" : "pending", category.slice(0, 120)],
  );
}

function laterValidFrom(candidate: MemoryCandidate, fallback: Date): Date {
  if (candidate.validFrom) {
    const parsed = new Date(candidate.validFrom);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

async function adjudicate(
  model: ModelProvider,
  candidate: MemoryCandidate,
  existing: SimilarMemory,
): Promise<Adjudication> {
  if (existing.similarity >= MEMORY_OBVIOUS_DUPLICATE_SCORE) return "duplicate";
  try {
    const raw = await model.complete({
      messages: [
        {
          role: "system",
          content:
            "[[task]]\nYou compare two long-term memories about the same person. " +
            "Reply with exactly one word: DUPLICATE when the new memory adds no lasting change, " +
            "SUPERSEDE when it updates or contradicts the old memory, or INSERT when both can " +
            "remain true. Do not explain.",
        },
        {
          role: "user",
          content:
            `Existing: [${existing.type}] ${existing.content}\n` +
            `New: [${candidate.type}] ${candidate.content}`,
        },
      ],
      thinking: false,
      maxTokens: 8,
    });
    return parseAdjudication(raw);
  } catch {
    return existing.similarity >= 0.94 ? "duplicate" : "insert";
  }
}

async function similarMemories(
  pool: Db,
  userId: string,
  embedding: number[] | null,
): Promise<SimilarMemory[]> {
  if (!embedding || embedding.length === 0) return [];
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<SimilarMemory>(
      `SELECT m.id, m.content, m.type,
              bb_cosine(e.embedding, $1::real[]) AS similarity
         FROM memory_embeddings e
         JOIN memories m ON m.id = e.memory_id
        WHERE m.user_id = $2
          AND m.status = 'active'
          AND (m.valid_until IS NULL OR m.valid_until > now())
        ORDER BY bb_cosine(e.embedding, $1::real[]) DESC
        LIMIT 3`,
      [embedding, userId],
    );
    return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
  });
}

async function storeCandidate(
  deps: MemoryWorkerDeps,
  payload: MemoryJobPayload,
  source: SourceMessage,
  candidate: MemoryCandidate,
): Promise<void> {
  const [embedding] = deps.embeddings
    ? await deps.embeddings.embed([candidate.content])
    : [null];
  const vector = embedding && embedding.length > 0 ? embedding : null;
  const nearby = await similarMemories(deps.pool, payload.userId, vector);
  const best = nearby[0];
  const action =
    best && best.similarity >= MEMORY_DUPLICATE_SCORE
      ? await adjudicate(deps.model, candidate, best)
      : "insert";
  const validFrom = laterValidFrom(candidate, source.created_at);

  await withUser(deps.pool, payload.userId, async (client) => {
    if (action === "duplicate" && best) {
      await client.query(
        `INSERT INTO memory_sources (memory_id, message_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [best.id, source.id],
      );
      return;
    }

    if (action === "supersede" && best) {
      await client.query(
        `UPDATE memories
            SET status = 'invalidated',
                valid_until = $3,
                updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status = 'active'`,
        [best.id, payload.userId, validFrom],
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO memories (
         user_id, type, content, importance, confidence, status,
         valid_from, valid_until, supersedes_memory_id,
         source_conversation_id, metadata
       )
       VALUES ($1, $2, $3, $4, $5, 'active', $6, NULL, $7, $8, $9::jsonb)
       RETURNING id`,
      [
        payload.userId,
        candidate.type,
        candidate.content,
        candidate.importance,
        candidate.confidence,
        validFrom,
        action === "supersede" && best ? best.id : null,
        payload.conversationId,
        JSON.stringify({ source: "post_reply_extraction" }),
      ],
    );
    const memoryId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO memory_sources (memory_id, message_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [memoryId, source.id],
    );
    if (vector && deps.embeddings) {
      await client.query(
        `INSERT INTO memory_embeddings (memory_id, model, embedding)
         VALUES ($1, $2, $3::real[])
         ON CONFLICT (memory_id, model)
         DO UPDATE SET embedding = EXCLUDED.embedding, created_at = now()`,
        [memoryId, deps.embeddings.name, vector],
      );
    }
  });
}

export async function processMemoryJob(
  deps: MemoryWorkerDeps,
  job: MemoryJobRow,
): Promise<void> {
  const payload = parsePayload(job.payload);
  if (!payload) throw new Error("Invalid memory job payload");

  const sources = await withUser(deps.pool, payload.userId, async (client) => {
    const { rows } = await client.query<SourceMessage>(
      `SELECT id, role, content, created_at
         FROM messages
        WHERE user_id = $1
          AND conversation_id = $2
          AND id = ANY($3::uuid[])
          AND role IN ('user', 'assistant')`,
      [
        payload.userId,
        payload.conversationId,
        [payload.sourceMessageId, payload.assistantMessageId],
      ],
    );
    return rows;
  });
  const userMessage = sources.find((row) => row.id === payload.sourceMessageId);
  const assistantMessage = sources.find((row) => row.id === payload.assistantMessageId);
  if (!userMessage || !userMessage.content.trim()) return;

  const raw = await deps.model.complete({
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content:
          `${EXTRACTION_GUARD}\n\n` +
          `User: ${userMessage.content.slice(0, 6000)}\n\n` +
          `The assistant replied: ${(assistantMessage?.content ?? "").slice(0, 2000)}`,
      },
    ],
    thinking: false,
    maxTokens: 1200,
  });
  const candidates = parseMemoryCandidates(raw);
  for (const candidate of candidates) {
    await storeCandidate(deps, payload, userMessage, candidate);
  }
}

export async function runMemoryWorkerOnce(
  deps: MemoryWorkerDeps,
  workerId = `${os.hostname()}:${process.pid}`,
): Promise<boolean> {
  const job = await claimJob(deps.pool, workerId);
  if (!job) return false;
  try {
    await processMemoryJob(deps, job);
    await completeJob(deps.pool, job.id);
  } catch (error) {
    await failJob(deps.pool, job, error);
  }
  return true;
}

export function startMemoryWorker(
  deps: MemoryWorkerDeps,
  intervalMs = WORKER_INTERVAL_MS,
): () => void {
  let stopped = false;
  let running = false;
  const workerId = `${os.hostname()}:${process.pid}`;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (!stopped && (await runMemoryWorkerOnce(deps, workerId))) {
        // Drain queued jobs, then wait for the next interval.
      }
    } catch {
      // A database hiccup must not stop future memory jobs.
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
