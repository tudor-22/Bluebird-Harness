import { pickLevel, type ReasoningEffort } from "@bluebird/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStream, splitContent } from "./chat";
import { chatThinkingParams, levelsFor } from "./reasoning";
import type { ResolvedModel } from "./engines";

afterEach(() => vi.unstubAllGlobals());

const lv = (engineId: string, name: string, extra: { ollamaThinking?: boolean } = {}) =>
  levelsFor({
    engineId,
    protocol: engineId === "ollama" ? "ollama" : engineId === "anthropic" ? "messages" : "chat",
    name,
    ...extra,
  });

describe("which thinking levels each engine honours", () => {
  it("follows each engine's documentation", () => {
    // OpenAI API: the o-series cannot switch off; GPT-5 can; chat variants cannot think.
    expect(lv("openai", "o3-mini")).toEqual(["low", "medium", "high"]);
    expect(lv("openai", "gpt-5")).toEqual(["none", "low", "medium", "high"]);
    expect(lv("openai", "gpt-5-chat-latest")).toEqual([]);
    expect(lv("openai", "gpt-4o-mini")).toEqual([]);
    // Anthropic API: extended thinking on Claude 3.7 and the 4 family.
    expect(lv("anthropic", "claude-3-7-sonnet-20250219")).toContain("none");
    expect(lv("anthropic", "claude-sonnet-4-20250514")).toContain("high");
    expect(lv("anthropic", "claude-3-5-haiku-20241022")).toEqual([]);
    // Google: Gemini 2.5 Pro cannot switch thinking off, Flash can.
    expect(lv("google", "gemini-2.5-pro")).toEqual(["low", "medium", "high"]);
    expect(lv("google", "gemini-2.5-flash")).toContain("none");
    expect(lv("google", "gemini-1.5-flash")).toEqual([]);
    // Qwen: hybrid models switch; thinking-only and instruct-only models do not.
    expect(lv("qwen", "qwen-plus")).toContain("none");
    expect(lv("qwen", "qwen3-235b-a22b")).toContain("none");
    expect(lv("qwen", "qwen3-235b-a22b-thinking-2507")).toEqual([]);
    expect(lv("qwen", "qwq-plus")).toEqual([]);
    // DeepSeek V4 models have a thinking switch and effort; Mistral documents it per model.
    expect(lv("deepseek", "deepseek-v4-pro")).toEqual(["none", "low", "medium", "high"]);
    expect(lv("deepseek", "deepseek-flash")).toContain("none");
    expect(lv("deepseek", "deepseek-reasoner")).toEqual([]);
    expect(lv("custom", "deepseek-flash")).toContain("none");
    expect(lv("mistral", "mistral-small-2603")).toEqual(["none", "medium"]);
    expect(lv("mistral", "mistral-large-4-0")).toEqual(["low", "medium", "high"]);
    expect(lv("mistral", "magistral-medium-latest")).toEqual([]);
    // Current Claude models: adaptive thinking; the newest cannot be switched off.
    expect(lv("anthropic", "claude-opus-5-5")).toEqual(["low", "medium", "high"]);
    expect(lv("anthropic", "claude-fable-5-1")).toEqual(["low", "medium", "high"]);
    expect(lv("anthropic", "claude-haiku-5-5")).toContain("none");
    // Local engines.
    expect(lv("ollama", "qwen3:8b", { ollamaThinking: true })).toEqual(["none", "medium"]);
    expect(lv("ollama", "gpt-oss:20b", { ollamaThinking: true })).toEqual(["low", "medium", "high"]);
    expect(lv("ollama", "llama3.2:3b", { ollamaThinking: false })).toEqual([]);
    expect(lv("vllm", "Qwen/Qwen3-8B")).toEqual(["none", "medium"]);
    expect(lv("llamacpp", "unsloth/gpt-oss-20b")).toEqual(["low", "medium", "high"]);
    expect(lv("lmstudio", "qwen3-8b")).toEqual([]);
    // A custom address: only well-known reasoning families.
    expect(lv("custom", "o3-mini")).toEqual(["low", "medium", "high"]);
    expect(lv("custom", "gpt-5")).toContain("none");
    expect(lv("custom", "mystery-model")).toEqual([]);
  });

  it("uses the nearest level a model offers", () => {
    expect(pickLevel(["none", "medium"], "high")).toBe("medium");
    expect(pickLevel(["low", "medium", "high"], "none")).toBe("low");
    expect(pickLevel(["none", "low", "medium", "high"], "low")).toBe("low");
    expect(pickLevel([], "high")).toBeNull();
  });
});

describe("request fields for chat-completions engines", () => {
  const params = (engineId: string, name: string, thinking: boolean, effort?: ReasoningEffort) =>
    chatThinkingParams({ engineId, name, levels: lv(engineId, name, { ollamaThinking: true }), thinking, effort });

  it("sends reasoning_effort to the OpenAI API, with minimal or none to switch off", () => {
    expect(params("openai", "o3-mini", true, "high")).toEqual({ reasoning_effort: "high" });
    expect(params("openai", "o3-mini", false)).toEqual({ reasoning_effort: "low" });
    expect(params("openai", "gpt-5", false)).toEqual({ reasoning_effort: "minimal" });
    expect(params("openai", "gpt-5.1", false)).toEqual({ reasoning_effort: "none" });
    expect(params("openai", "gpt-4o", true, "high")).toEqual({});
  });

  it("sends reasoning_effort on a custom address, with minimal or none to switch off", () => {
    expect(params("custom", "o3-mini", true, "high")).toEqual({ reasoning_effort: "high" });
    expect(params("custom", "o3-mini", false)).toEqual({ reasoning_effort: "low" });
    expect(params("custom", "gpt-5", false)).toEqual({ reasoning_effort: "minimal" });
    expect(params("custom", "gpt-5.1", false)).toEqual({ reasoning_effort: "none" });
    expect(params("custom", "plain-model", true, "high")).toEqual({});
  });

  it("sends reasoning_effort to Google, keeping Pro on", () => {
    expect(params("google", "gemini-2.5-flash", false)).toEqual({ reasoning_effort: "none" });
    expect(params("google", "gemini-2.5-pro", false)).toEqual({ reasoning_effort: "low" });
    expect(params("google", "gemini-2.5-flash", true, "high")).toEqual({ reasoning_effort: "high" });
  });

  it("sends enable_thinking and a budget to Qwen", () => {
    expect(params("qwen", "qwen-plus", false)).toEqual({ enable_thinking: false });
    expect(params("qwen", "qwen-plus", true, "low")).toEqual({ enable_thinking: true, thinking_budget: 1024 });
    expect(params("qwen", "qwen-plus", true, "high")).toEqual({ enable_thinking: true, thinking_budget: 16384 });
  });

  it("uses the template switch on llama.cpp and vLLM, and efforts for gpt-oss", () => {
    expect(params("vllm", "Qwen/Qwen3-8B", false)).toEqual({ chat_template_kwargs: { enable_thinking: false, thinking: false } });
    expect(params("llamacpp", "Qwen3-8B", true, "high")).toEqual({ chat_template_kwargs: { enable_thinking: true, thinking: true } });
    expect(params("vllm", "gpt-oss-20b", true, "high")).toEqual({ reasoning_effort: "high" });
  });

  it("sends nothing to engines whose models always think", () => {
    expect(params("deepseek", "deepseek-reasoner", true, "high")).toEqual({});
    expect(params("mistral", "magistral-small", false)).toEqual({});
    const ds = (thinking: boolean, effort?: ReasoningEffort) =>
      chatThinkingParams({
        engineId: "custom",
        name: "deepseek-v4-pro",
        levels: ["none", "low", "medium", "high"],
        thinking,
        effort,
      });
    expect(ds(false)).toEqual({ thinking: { type: "disabled" } });
    expect(ds(true, "low")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "low" });
    expect(ds(true, "medium")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high" });
    expect(ds(true, "high")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" });
    expect(
      chatThinkingParams({ engineId: "mistral", name: "mistral-small-2603", levels: ["none", "medium"], thinking: true }),
    ).toEqual({ reasoning_effort: "high" });
    expect(params("custom", "anything", true, "high")).toEqual({});
  });
});

function resolvedModel(engineId: string, name: string, levels: ReasoningEffort[]): ResolvedModel {
  return {
    engine: { id: engineId, name: engineId, kind: "cloud", protocol: "chat", defaultBaseUrl: "", needsKey: true },
    baseUrl: "http://api.test/v1",
    apiKey: "key",
    model: { name, sizeBytes: null, parameterSize: null, family: null, vision: false, audio: false, thinking: levels.length > 0, thinkingLevels: levels, embedding: false },
  };
}

const sse = (...events: string[]) => new Response(events.map((e) => `data: ${e}\n\n`).join(""));

async function drain(gen: AsyncGenerator<unknown>) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("engine requests", () => {
  it("sends a Qwen thinking budget on a streamed request", async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => sse("[DONE]"));
    vi.stubGlobal("fetch", fetchMock);
    await drain(chatStream(resolvedModel("qwen", "qwen-plus", lv("qwen", "qwen-plus")), {
      messages: [{ role: "user", content: "x" }], thinking: true, reasoningEffort: "medium",
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_thinking).toBe(true);
    expect(body.thinking_budget).toBe(4096);
  });

  it("reads thinking parts out of list content", async () => {
    expect(splitContent("plain")).toEqual({ text: "plain", thinking: "" });
    expect(
      splitContent([
        { type: "thinking", thinking: [{ type: "text", text: "Hmm. " }] },
        { type: "text", text: "Answer." },
      ]),
    ).toEqual({ text: "Answer.", thinking: "Hmm. " });

    vi.stubGlobal("fetch", vi.fn(async () =>
      sse(JSON.stringify({ choices: [{ delta: { content: [{ type: "thinking", thinking: [{ type: "text", text: "Reasoning" }] }, { type: "text", text: "Hi" }] } }] })),
    ));
    const events = await drain(chatStream(resolvedModel("mistral", "magistral-small", []), { messages: [{ role: "user", content: "x" }] }));
    expect(events).toContainEqual({ type: "reasoning", text: "Reasoning" });
    expect(events).toContainEqual({ type: "delta", text: "Hi" });
  });
});
