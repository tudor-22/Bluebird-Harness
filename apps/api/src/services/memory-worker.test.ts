import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EmbeddingProvider } from "../embeddings/types";
import type { ModelProvider } from "../model/types";
import { createHarness, type Harness } from "../test/harness";
import { buildThreadContext } from "./context";
import { runMemoryWorkerOnce } from "./memory";
import { withUser } from "../db/pool";

let harness: Harness;
let token: string;

function vector(cosine: number): number[] {
  const values = Array(1024).fill(0);
  values[0] = cosine;
  values[1] = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  return values;
}

const embeddings: EmbeddingProvider = {
  name: "test-bge",
  async embed(texts) {
    return texts.map((text) =>
      text.includes("Company B")
        ? vector(0.95)
        : text.includes("Company A")
          ? vector(1)
          : vector(1),
    );
  },
};

function modelWith(responses: string[]): ModelProvider {
  let index = 0;
  return {
    name: "test-model",
    async *streamChat() {
      yield* [];
    },
    async complete() {
      const response = responses[index++];
      if (response === undefined) throw new Error("No scripted model response");
      return response;
    },
  };
}

async function send(content: string): Promise<void> {
  const response = await fetch(`${harness.baseUrl}/thread/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  expect(response.status).toBe(200);
  await response.text();
}

beforeAll(async () => {
  harness = await createHarness();
  token = await harness.signToken({
    sub: "memory-worker-user",
    email: "memory@example.com",
    name: "Memory User",
  });
});

afterAll(async () => {
  await harness.close();
});

describe("memory extraction worker", () => {
  it("deduplicates, supersedes temporal facts and retrieves the current memory", async () => {
    const candidateA = JSON.stringify({
      memories: [
        {
          type: "fact",
          content: "Works at Company A.",
          importance: 0.9,
          confidence: 0.95,
          validFrom: null,
        },
      ],
    });
    const candidateB = JSON.stringify({
      memories: [
        {
          type: "fact",
          content: "Works at Company B.",
          importance: 0.9,
          confidence: 0.95,
          validFrom: null,
        },
      ],
    });
    const workerModel = modelWith([candidateA, candidateB, "SUPERSEDE"]);

    await send("I work at Company A.");
    await send("I now work at Company B.");
    expect(await runMemoryWorkerOnce({ pool: harness.pool, model: workerModel, embeddings })).toBe(
      true,
    );
    expect(await runMemoryWorkerOnce({ pool: harness.pool, model: workerModel, embeddings })).toBe(
      true,
    );

    const memories = await harness.pool.query<{
      id: string;
      content: string;
      status: string;
      supersedes_memory_id: string | null;
      valid_until: Date | null;
    }>(
      `SELECT id, content, status, supersedes_memory_id, valid_until
         FROM memories
        ORDER BY created_at`,
    );
    expect(memories.rows).toHaveLength(2);
    expect(memories.rows[0].status).toBe("invalidated");
    expect(memories.rows[0].valid_until).not.toBeNull();
    expect(memories.rows[1].status).toBe("active");
    expect(memories.rows[1].content).toBe("Works at Company B.");
    expect(memories.rows[1].supersedes_memory_id).toBe(memories.rows[0].id);

    const sources = await harness.pool.query<{ count: string }>(
      "SELECT count(*) FROM memory_sources",
    );
    expect(Number(sources.rows[0].count)).toBe(2);
    const jobs = await harness.pool.query<{ status: string }>(
      "SELECT status FROM jobs WHERE type = 'memory_extract' ORDER BY created_at",
    );
    expect(jobs.rows.every((job) => job.status === "done")).toBe(true);

    const user = await harness.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE google_sub = $1",
      ["memory-worker-user"],
    );
    const conversation = await harness.pool.query<{ id: string }>(
      "SELECT id FROM conversations WHERE user_id = $1",
      [user.rows[0].id],
    );
    const context = await withUser(harness.pool, user.rows[0].id, (client) =>
      buildThreadContext(client, {
        userId: user.rows[0].id,
        conversationId: conversation.rows[0].id,
        embeddings,
      }),
    );
    const memoryNote = context.find(
      (message) =>
        typeof message.content === "string" &&
        message.content.includes("Long-term memories"),
    );
    expect(memoryNote?.content).toContain("Works at Company B.");
    expect(memoryNote?.content).not.toContain("Works at Company A.");
  });
});
