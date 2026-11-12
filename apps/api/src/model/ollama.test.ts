import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containsMedia,
  createOllamaModelProvider,
  estimatePromptTokens,
  MAX_REPLY_TOKENS,
  MODEL_CONTEXT_TOKENS,
  ModelUnavailableError,
  HOSTED_WINDOW,
  replyTokenBudget,
  samplingFor,
  thinkValue,
  toOllamaMessages,
} from "./ollama";
import type { ModelRegistry } from "./registry";
import type { ModelMessage } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const llama = {
  name: "llama3.2:3b",
  sizeBytes: 1,
  parameterSize: "3B",
  family: "llama",
  vision: false,
  audio: false,
  thinking: false,
  thinkingLevels: [] as ("none" | "low" | "medium" | "high")[],
  embedding: false,
};

function registry(model: typeof llama | null, reachable = true): ModelRegistry {
  return {
    resolve: async () => model,
    select: async () => undefined,
    snapshot: async () => ({
      reachable,
      serverUrl: "http://ollama.test",
      models: model ? [model] : [],
      selected: model?.name ?? null,
    }),
  };
}

function ndjson(...chunks: object[]): Response {
  return new Response(chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n");
}

describe("sampling", () => {
  it("runs side tasks greedy and chat warmer", () => {
    expect(samplingFor({ thinking: false, chat: false })).toEqual({
      temperature: 0,
      top_p: 1,
      max_tokens: 4096,
    });
    expect(samplingFor({ thinking: false, chat: true }).temperature).toBe(0.3);
    expect(samplingFor({ thinking: true, chat: true }).max_tokens).toBe(MAX_REPLY_TOKENS);
  });
});

describe("reply budget", () => {
  it("never exceeds what is left in the window", () => {
    const small: ModelMessage[] = [{ role: "user", content: "hi" }];
    expect(replyTokenBudget(small)).toBeLessThanOrEqual(MAX_REPLY_TOKENS);
    const huge: ModelMessage[] = [{ role: "user", content: "x".repeat(MODEL_CONTEXT_TOKENS * 6) }];
    expect(replyTokenBudget(huge)).toBe(512);
    expect(estimatePromptTokens(small)).toBeGreaterThan(0);
  });

  it("lets hosted engines write replies long enough for a whole web page", () => {
    const history: ModelMessage[] = [{ role: "user", content: "x".repeat(30_000) }];
    // About 10k tokens of history leaves a local 16k window little room...
    expect(replyTokenBudget(history)).toBeLessThan(7000);
    // ...but a hosted engine's window leaves plenty.
    expect(replyTokenBudget(history, HOSTED_WINDOW)).toBe(32_000);
  });

  it("detects media parts", () => {
    expect(containsMedia([{ role: "user", content: "hi" }])).toBe(false);
    expect(
      containsMedia([
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] },
      ]),
    ).toBe(true);
  });
});

describe("message conversion", () => {
  it("sends images as bare base64 beside the text", () => {
    const converted = toOllamaMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
        ],
      },
    ]);
    expect(converted).toEqual([{ role: "user", content: "what is this?", images: ["QUJD"] }]);
  });
});

describe("thinking", () => {
  it("only sends think to models that support it", () => {
    expect(thinkValue({ name: "llama3.2", thinking: false }, true)).toBeUndefined();
    expect(thinkValue({ name: "qwen3", thinking: true }, true)).toBe(true);
    expect(thinkValue({ name: "qwen3", thinking: true }, false)).toBe(false);
    expect(thinkValue({ name: "gpt-oss:20b", thinking: true }, true, "high")).toBe("high");
  });
});

describe("the Ollama provider", () => {
  it("streams text and reasoning and requests the configured window", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      ndjson(
        { message: { thinking: "hmm" } },
        { message: { content: "Hel" } },
        { message: { content: "lo" } },
        { done: true, prompt_eval_count: 5, eval_count: 2 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOllamaModelProvider({
      baseUrl: "http://ollama.test",
      registry: registry({ ...llama, thinking: true, thinkingLevels: ["none", "medium"] }),
      contextTokens: 8192,
    });

    const events = [];
    for await (const event of provider.streamChat({
      messages: [{ role: "user", content: "hi" }],
      thinking: true,
      reasoningEffort: "high",
    })) {
      events.push(event);
    }

    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text)).toEqual([
      "Hel",
      "lo",
    ]);
    expect(events.some((e) => e.type === "reasoning")).toBe(true);
    expect(events.at(-1)).toEqual({
      type: "usage",
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://ollama.test/api/chat");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("llama3.2:3b");
    expect(body.think).toBe(true);
    expect(body.options.num_ctx).toBe(8192);
    expect(provider.name).toBe("ollama:llama3.2:3b");
  });

  it("completes without streaming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: { content: "done" } })),
    );
    const provider = createOllamaModelProvider({
      baseUrl: "http://ollama.test",
      registry: registry(llama),
    });
    await expect(provider.complete({ messages: [{ role: "user", content: "x" }] })).resolves.toBe(
      "done",
    );
  });

  it("explains how to get a model when none is installed", async () => {
    const provider = createOllamaModelProvider({
      baseUrl: "http://ollama.test",
      registry: registry(null),
    });
    await expect(provider.complete({ messages: [] })).rejects.toThrow(/ollama pull/);
    await expect(provider.complete({ messages: [] })).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("explains how to start Ollama when it is unreachable", async () => {
    const provider = createOllamaModelProvider({
      baseUrl: "http://ollama.test",
      registry: registry(null, false),
    });
    await expect(provider.complete({ messages: [] })).rejects.toThrow(/ollama serve/);
  });
});
