import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStream } from "./chat";
import { messagesStream, toMessagesFormat } from "./messages";
import { createEngineHub } from "./engines";
import type { ResolvedModel } from "./engines";

afterEach(() => vi.unstubAllGlobals());

const json = (data: unknown, status = 200) => Response.json(data, { status });

/** A world where only the listed base URLs answer; everything else refuses the connection. */
function stubWorld(routes: Record<string, (init?: RequestInit) => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const hit = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      if (!hit) throw new Error("ECONNREFUSED");
      return routes[hit](init);
    }),
  );
}

async function hub() {
  const dir = await mkdtemp(join(tmpdir(), "bluebird-engines-"));
  const file = join(dir, "settings.json");
  return { file, hub: createEngineHub({ settingsFile: file, ollamaUrl: "http://127.0.0.1:11434" }) };
}

describe("the engine hub", () => {
  it("lists only engines that answer and only the models they report", async () => {
    stubWorld({
      "http://127.0.0.1:11434/api/tags": () => json({ models: [{ name: "llama3.2:3b", size: 1 }] }),
      "http://127.0.0.1:11434/api/show": () => json({ capabilities: ["completion"] }),
      "http://127.0.0.1:1234/v1/models": () =>
        json({ data: [{ id: "qwen2.5-7b" }, { id: "text-embedding-nomic" }] }),
    });
    const { hub: h } = await hub();
    const snapshot = await h.snapshot();

    const byId = Object.fromEntries(snapshot.engines.map((e) => [e.id, e]));
    expect(byId.ollama.status).toBe("ready");
    expect(byId.ollama.models.map((m) => m.name)).toEqual(["llama3.2:3b"]);
    expect(byId.lmstudio.status).toBe("ready");
    expect(byId.lmstudio.models.map((m) => m.name)).toEqual(["qwen2.5-7b"]);
    expect(byId.llamacpp.status).toBe("unreachable");
    expect(byId.llamacpp.models).toEqual([]);
    expect(byId.deepseek.status).toBe("needs-key");
    expect(byId.custom.status).toBe("unreachable");
    expect(snapshot.selected).toEqual({ engine: "ollama", model: "llama3.2:3b" });
  });

  it("remembers the chosen default and falls back when it disappears", async () => {
    stubWorld({
      "http://127.0.0.1:11434/api/tags": () => json({ models: [{ name: "a", size: 1 }] }),
      "http://127.0.0.1:11434/api/show": () => json({ capabilities: ["completion"] }),
      "http://127.0.0.1:1234/v1/models": () => json({ data: [{ id: "b" }] }),
    });
    const { hub: h, file } = await hub();
    await h.select("lmstudio", "b");
    expect((await h.snapshot()).selected).toEqual({ engine: "lmstudio", model: "b" });
    await expect(h.select("lmstudio", "missing")).rejects.toThrow(/not available/);
    expect(JSON.parse(await readFile(file, "utf8")).selected).toEqual({ engine: "lmstudio", model: "b" });

    // LM Studio goes away: the default moves to a model that exists.
    stubWorld({
      "http://127.0.0.1:11434/api/tags": () => json({ models: [{ name: "a", size: 1 }] }),
      "http://127.0.0.1:11434/api/show": () => json({ capabilities: ["completion"] }),
    });
    const fresh = createEngineHub({ settingsFile: file, ollamaUrl: "http://127.0.0.1:11434" });
    expect((await fresh.snapshot()).selected).toEqual({ engine: "ollama", model: "a" });
  });

  it("lists a hosted engine once its key is saved, without exposing the key", async () => {
    const seen: (string | null)[] = [];
    stubWorld({
      "https://api.deepseek.com/v1/models": (init) => {
        seen.push(new Headers(init?.headers).get("authorization"));
        return json({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }, { id: "whisper-1" }] });
      },
    });
    const { hub: h, file } = await hub();
    await h.configure("deepseek", { apiKey: "sk-test-123" });
    const snapshot = await h.snapshot();
    const engine = snapshot.engines.find((e) => e.id === "deepseek")!;

    expect(engine.status).toBe("ready");
    expect(engine.hasKey).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("sk-test-123");
    expect(engine.models.map((m) => m.name)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(seen[0]).toBe("Bearer sk-test-123");
    expect(((await stat(file)).mode & 0o777).toString(8)).toBe("600");

    await h.configure("deepseek", { apiKey: "" });
    expect((await h.snapshot()).engines.find((e) => e.id === "deepseek")!.status).toBe("needs-key");
  });

  it("reports a refused key and validates custom addresses", async () => {
    stubWorld({ "https://api.mistral.ai/v1/models": () => json({}, 401) });
    const { hub: h } = await hub();
    await h.configure("mistral", { apiKey: "bad" });
    const mistral = (await h.snapshot()).engines.find((e) => e.id === "mistral")!;
    expect(mistral.status).toBe("error");
    expect(mistral.error).toMatch(/refused/);

    await expect(h.configure("custom", { baseUrl: "not a url" })).rejects.toThrow(/full URL/);
    await expect(h.configure("custom", { baseUrl: "ftp://x.test" })).rejects.toThrow(/http/);
    await expect(h.configure("nope", { apiKey: "x" })).rejects.toThrow(/Unknown engine/);
  });

  it("works with a custom API address", async () => {
    stubWorld({ "http://10.0.0.5:9000/v1/models": () => json({ data: [{ id: "my-model" }] }) });
    const { hub: h } = await hub();
    await h.configure("custom", { baseUrl: "http://10.0.0.5:9000/v1/" });
    const custom = (await h.snapshot()).engines.find((e) => e.id === "custom")!;
    expect(custom.status).toBe("ready");
    expect(custom.baseUrl).toBe("http://10.0.0.5:9000/v1");
    const resolved = await h.resolve();
    expect(resolved?.engine.id).toBe("custom");
    expect(resolved?.model.name).toBe("my-model");
  });

  it("knows where each hosted engine lives", async () => {
    const { hub: h } = await hub();
    const byId = Object.fromEntries((await h.snapshot()).engines.map((e) => [e.id, e]));
    expect(byId.openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(byId.anthropic.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(byId.google.baseUrl).toContain("generativelanguage.googleapis.com");
    expect(byId.openai.status).toBe("needs-key");
    expect(byId.anthropic.status).toBe("needs-key");
  });

  it("lists the OpenAI API's chat models once its key is saved", async () => {
    stubWorld({
      "https://api.openai.com/v1/models": () =>
        json({ data: [{ id: "gpt-4o-mini" }, { id: "whisper-1" }, { id: "o3-mini" }] }),
    });
    const { hub: h } = await hub();
    await h.configure("openai", { apiKey: "sk-test" });
    const engine = (await h.snapshot()).engines.find((e) => e.id === "openai")!;
    expect(engine.status).toBe("ready");
    expect(engine.models.map((m) => m.name)).toEqual(["gpt-4o-mini", "o3-mini"]);
    expect(engine.models.find((m) => m.name === "o3-mini")?.thinking).toBe(true);
  });

  it("lists the Anthropic API's models with its own headers", async () => {
    const seen: Headers[] = [];
    stubWorld({
      "https://api.anthropic.com/v1/models": (init) => {
        seen.push(new Headers(init?.headers));
        return json({ data: [{ id: "claude-sonnet-4-20250514" }, { id: "claude-3-5-haiku-20241022" }] });
      },
    });
    const { hub: h } = await hub();
    await h.configure("anthropic", { apiKey: "key-a" });
    const engine = (await h.snapshot()).engines.find((e) => e.id === "anthropic")!;
    expect(engine.status).toBe("ready");
    expect(engine.models.map((m) => m.name)).toContain("claude-sonnet-4-20250514");
    expect(engine.models.find((m) => m.name === "claude-sonnet-4-20250514")?.thinkingLevels).toContain("high");
    expect(engine.models.find((m) => m.name === "claude-3-5-haiku-20241022")?.thinkingLevels).toEqual([]);
    expect(seen[0].get("x-api-key")).toBe("key-a");
    expect(seen[0].get("anthropic-version")).toBeTruthy();
  });

  it("keeps every engine's key when the person switches to a local model and back", async () => {
    stubWorld({
      "http://127.0.0.1:11434/api/tags": () => json({ models: [{ name: "llama3.2:3b", size: 1 }] }),
      "http://127.0.0.1:11434/api/show": () => json({ capabilities: ["completion"] }),
      "https://api.deepseek.com/v1/models": () => json({ data: [{ id: "deepseek-v4-pro" }] }),
    });
    const { hub: h, file } = await hub();
    await h.configure("deepseek", { apiKey: "sk-keep-me" });
    await h.select("deepseek", "deepseek-v4-pro");
    await h.select("ollama", "llama3.2:3b");

    const stored = JSON.parse(await readFile(file, "utf8"));
    expect(stored.engines.deepseek.apiKey).toBe("sk-keep-me");
    expect(stored.selected).toEqual({ engine: "ollama", model: "llama3.2:3b" });

    // The local engine stops answering: the key is still kept, and nothing is overwritten.
    stubWorld({ "https://api.deepseek.com/v1/models": () => json({ data: [{ id: "deepseek-v4-pro" }] }) });
    const snapshot = await h.snapshot();
    expect(snapshot.engines.find((e) => e.id === "deepseek")?.hasKey).toBe(true);
    expect(JSON.parse(await readFile(file, "utf8")).selected.engine).toBe("ollama");

    // Back to the API with no key typed again.
    await h.select("deepseek", "deepseek-v4-pro");
    expect((await h.resolve())?.apiKey).toBe("sk-keep-me");
  });
});

function resolvedModel(
  engineId: string,
  name: string,
  levels: ("none" | "low" | "medium" | "high")[] = [],
  protocol: "chat" | "messages" = "chat",
): ResolvedModel {
  return {
    engine: { id: engineId, name: engineId, kind: "cloud", protocol, defaultBaseUrl: "", needsKey: true },
    baseUrl: "http://api.test/v1",
    apiKey: "key",
    model: { name, sizeBytes: null, parameterSize: null, family: null, vision: false, audio: false, thinking: levels.length > 0, thinkingLevels: levels, embedding: false },
  };
}

function sse(...events: string[]): Response {
  return new Response(events.map((e) => `data: ${e}\n\n`).join(""));
}

describe("chat-completions engines", () => {
  it("streams text and reasoning and sends the key", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      sse(
        JSON.stringify({ choices: [{ delta: { reasoning_content: "hm" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "Hi" } }] }),
        JSON.stringify({ choices: [{ delta: { content: " there" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
        "[DONE]",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const e of chatStream(resolvedModel("deepseek", "deepseek-chat"), {
      messages: [{ role: "user", content: "hello" }],
    })) {
      events.push(e);
    }
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")).toBe("Hi there");
    expect(events.some((e) => e.type === "reasoning")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer key");
    const body = JSON.parse(String(init?.body));
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.temperature).toBeDefined();
  });

  it("uses reasoning fields for reasoning families on a custom address", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sse("[DONE]"));
    vi.stubGlobal("fetch", fetchMock);
    for await (const _ of chatStream(resolvedModel("custom", "o3-mini", ["low", "medium", "high"]), {
      messages: [{ role: "user", content: "x" }],
      thinking: true,
      reasoningEffort: "high",
    })) {
      void _;
    }
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.reasoning_effort).toBe("high");
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("explains a refused key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const run = async () => {
      for await (const _ of chatStream(resolvedModel("deepseek", "deepseek-chat"), {
        messages: [{ role: "user", content: "x" }],
      })) {
        void _;
      }
    };
    await expect(run()).rejects.toThrow(/refused the API key/);
  });
});

describe("the OpenAI API engine", () => {
  it("uses its reasoning fields for reasoning models", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sse("[DONE]"));
    vi.stubGlobal("fetch", fetchMock);
    for await (const _ of chatStream(resolvedModel("openai", "o3-mini", ["low", "medium", "high"]), {
      messages: [{ role: "user", content: "x" }],
      thinking: true,
      reasoningEffort: "high",
    })) {
      void _;
    }
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.reasoning_effort).toBe("high");
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });
});

describe("the messages-style engine", () => {
  it("moves system notes aside, merges turns and starts with the user", () => {
    const converted = toMessagesFormat([
      { role: "system", content: "Be brief." },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "one" },
      { role: "user", content: [{ type: "text", text: "two" }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] },
      { role: "system", content: "Late note." },
    ]);
    expect(converted.system).toBe("Be brief.\n\nLate note.");
    expect(converted.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const last = converted.messages[2].content;
    expect(last).toHaveLength(3);
    expect(last[2]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
  });

  it("streams text and thinking, sends the key header and a thinking budget", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      sse(
        JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 7 } } }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Let me see." } }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }),
        JSON.stringify({ type: "message_delta", usage: { output_tokens: 2 } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const e of messagesStream(
      resolvedModel("anthropic", "claude-sonnet-4-20250514", ["none", "low", "medium", "high"], "messages"),
      { messages: [{ role: "user", content: "hi" }], thinking: true, reasoningEffort: "high", maxTokens: 4096 },
    )) {
      events.push(e);
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/v1/messages");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("key");
    const body = JSON.parse(String(init?.body));
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 24000 });
    expect(body.max_tokens).toBeGreaterThan(body.thinking.budget_tokens);
    expect(body.temperature).toBeUndefined();
    expect(events).toContainEqual({ type: "reasoning", text: "Let me see." });
    expect(events).toContainEqual({ type: "delta", text: "Hello" });
    expect(events.at(-1)).toEqual({ type: "usage", usage: { prompt_tokens: 7, completion_tokens: 2 } });
  });

  it("reads tool calls from a chat stream and from a messages stream", async () => {
    // Chat-completions: the name and the arguments arrive in pieces.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse(
          JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_file", arguments: '{"pa' } }] } }] }),
          JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.txt"}' } }] } }] }),
          "[DONE]",
        ),
      ),
    );
    const chat = [];
    for await (const e of chatStream(resolvedModel("custom", "some-model"), {
      messages: [{ role: "user", content: "x" }],
      tools: [{ name: "read_file", description: "d", parameters: { type: "object" } }],
    })) chat.push(e);
    expect(chat).toContainEqual({ type: "tool_call", call: { id: "call_1", name: "read_file", arguments: '{"path":"a.txt"}' } });

    // Messages protocol: a tool_use block with streamed JSON.
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) =>
      sse(
        JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "grep" } }),
        JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"pattern":' } }),
        JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"x"}' } }),
        JSON.stringify({ type: "content_block_stop", index: 1 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const e of messagesStream(resolvedModel("anthropic", "claude-opus-5-5", ["low", "medium", "high"], "messages"), {
      messages: [
        { role: "user", content: "find x" },
        { role: "assistant", content: null, tool_calls: [{ id: "tu_0", name: "list_dir", arguments: "{}" }] },
        { role: "tool", tool_call_id: "tu_0", content: "a.txt" },
      ],
      tools: [{ name: "grep", description: "d", parameters: { type: "object" } }],
    })) events.push(e);
    expect(events).toContainEqual({ type: "tool_call", call: { id: "tu_1", name: "grep", arguments: '{"pattern":"x"}' } });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tools[0]).toMatchObject({ name: "grep", input_schema: { type: "object" } });
    expect(body.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "tu_0", input: {} });
    expect(body.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_0" });
  });

  it("uses adaptive thinking and effort on current models", async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => sse());
    vi.stubGlobal("fetch", fetchMock);
    for await (const _ of messagesStream(
      resolvedModel("anthropic", "claude-opus-5-5", ["low", "medium", "high"], "messages"),
      { messages: [{ role: "user", content: "hi" }], thinking: true, reasoningEffort: "low" },
    )) {
      void _;
    }
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.temperature).toBeUndefined();
  });

  it("leaves thinking off for None and for models that cannot think", async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => sse());
    vi.stubGlobal("fetch", fetchMock);
    for (const [name, levels, thinking] of [
      ["claude-sonnet-4-20250514", ["none", "low", "medium", "high"] as const, false],
      ["claude-3-5-haiku-20241022", [] as const, true],
    ] as const) {
      for await (const _ of messagesStream(resolvedModel("anthropic", name, [...levels], "messages"), {
        messages: [{ role: "user", content: "hi" }],
        thinking,
        reasoningEffort: "high",
      })) {
        void _;
      }
    }
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(String(call[1]?.body));
      expect(body.thinking).toBeUndefined();
      expect(body.temperature).toBeDefined();
    }
  });
});
