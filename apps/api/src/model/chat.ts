/** Client for engines that speak the common chat-completions protocol: llama.cpp, vLLM, LM Studio, DeepSeek, Qwen, Mistral, Google and custom URLs. */
import type { ResolvedModel } from "./engines";
import { postModel, sseData } from "./http";
import { loopScore, samplingFor } from "./ollama";
import { chatThinkingParams, isEffortFamily } from "./reasoning";
import type { ModelMessage, ModelStreamEvent, ModelTool, StreamChatOptions } from "./types";
import type { ReasoningEffort } from "@bluebird/shared";

function toChatMessages(messages: ModelMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool" && message.tool_call_id) {
      return {
        role: "tool",
        tool_call_id: message.tool_call_id,
        content: typeof message.content === "string" ? message.content : "",
      };
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      return {
        role: "assistant",
        content: typeof message.content === "string" && message.content ? message.content : null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments || "{}" },
        })),
      };
    }
    const role = message.role === "tool" ? "user" : message.role;
    if (typeof message.content === "string" || message.content === null) {
      return { role, content: message.content ?? "" };
    }
    return { role, content: message.content };
  });
}

function requestBody(
  resolved: ResolvedModel,
  options: {
    messages: ModelMessage[];
    thinking: boolean;
    reasoningEffort?: ReasoningEffort;
    maxTokens?: number;
    chat: boolean;
    stream: boolean;
    tools?: ModelTool[];
  },
) {
  const sampling = samplingFor({ thinking: options.thinking, chat: options.chat });
  const name = resolved.model.name;
  const reasoning = ["openai", "custom"].includes(resolved.engine.id) && isEffortFamily(name);
  const maxTokens = options.maxTokens ?? sampling.max_tokens;
  // Thinking settings go out exactly as each provider documents them, and only
  // for models known to accept them.
  const thinkingParams = chatThinkingParams({
    engineId: resolved.engine.id,
    name,
    levels: resolved.model.thinkingLevels ?? [],
    thinking: options.thinking,
    effort: options.reasoningEffort,
  });
  // Qwen only thinks on streamed requests, so a plain completion switches it off.
  if (resolved.engine.id === "qwen" && !options.stream && "enable_thinking" in thinkingParams) {
    thinkingParams.enable_thinking = false;
    delete thinkingParams.thinking_budget;
  }
  return {
    model: name,
    messages: toChatMessages(options.messages),
    stream: options.stream,
    // Reasoning families take their own token field and fix the sampling.
    ...(reasoning
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens, temperature: sampling.temperature, top_p: sampling.top_p }),
    ...thinkingParams,
    ...(options.tools?.length
      ? {
          tools: options.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
          tool_choice: "auto",
        }
      : {}),
  };
}

/**
 * Message content is a string for most providers; Mistral's reasoning models
 * send a list of parts, some of which are the model's thinking.
 */
export function splitContent(content: unknown): { text: string; thinking: string } {
  if (typeof content === "string") return { text: content, thinking: "" };
  if (!Array.isArray(content)) return { text: "", thinking: "" };
  let text = "";
  let thinking = "";
  for (const part of content as { type?: string; text?: string; thinking?: unknown }[]) {
    if (part?.type === "thinking") {
      thinking += Array.isArray(part.thinking)
        ? (part.thinking as { text?: string }[]).map((piece) => piece.text ?? "").join("")
        : typeof part.thinking === "string"
          ? part.thinking
          : "";
    } else if (typeof part?.text === "string") {
      text += part.text;
    }
  }
  return { text, thinking };
}

const authHeaders = (resolved: ResolvedModel): Record<string, string> =>
  resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {};

export async function chatComplete(
  resolved: ResolvedModel,
  options: {
    messages: ModelMessage[];
    thinking?: boolean;
    reasoningEffort?: ReasoningEffort;
    maxTokens?: number;
  },
): Promise<string> {
  const response = await postModel(
    resolved.engine.name,
    `${resolved.baseUrl}/chat/completions`,
    authHeaders(resolved),
    requestBody(resolved, {
      messages: options.messages,
      thinking: options.thinking ?? false,
      reasoningEffort: options.reasoningEffort,
      maxTokens: options.maxTokens,
      chat: false,
      stream: false,
    }),
  );
  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  return splitContent(data.choices?.[0]?.message?.content).text;
}

export async function* chatStream(
  resolved: ResolvedModel,
  options: StreamChatOptions,
): AsyncGenerator<ModelStreamEvent> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await postModel(
      resolved.engine.name,
      `${resolved.baseUrl}/chat/completions`,
      authHeaders(resolved),
      requestBody(resolved, {
        messages: options.messages,
        thinking: Boolean(options.thinking),
        reasoningEffort: options.reasoningEffort,
        maxTokens: options.maxTokens,
        chat: true,
        stream: true,
        tools: options.tools,
      }),
      controller.signal,
    );
    if (!response.body) throw new Error("model returned no body");

    const words: string[] = [];
    let counter = 0;
    // Tool calls arrive in pieces: a name, then the arguments a few characters at a time.
    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    const flush = function* (): Generator<ModelStreamEvent> {
      for (const [index, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        if (call.name) yield { type: "tool_call", call: { ...call, id: call.id || `call_${index}_${Date.now()}` } };
      }
      calls.clear();
    };
    for await (const data of sseData(response.body)) {
      if (data === "[DONE]") break;
      let chunk: {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        choices?: {
          delta?: {
            content?: unknown;
            reasoning_content?: string;
            reasoning?: string;
            tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
          };
        }[];
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`model: ${chunk.error.message ?? "request failed"}`);
      if (chunk.usage) yield { type: "usage", usage: chunk.usage };
      const delta = chunk.choices?.[0]?.delta ?? {};
      for (const piece of delta.tool_calls ?? []) {
        const index = piece.index ?? 0;
        const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
        if (piece.id) call.id = piece.id;
        if (piece.function?.name) call.name += piece.function.name;
        if (piece.function?.arguments) call.arguments += piece.function.arguments;
        calls.set(index, call);
      }
      const parts = splitContent(delta.content);
      const reasoning = (delta.reasoning_content ?? delta.reasoning ?? "") + parts.thinking;
      if (reasoning) yield { type: "reasoning", text: reasoning };
      if (parts.text) {
        yield { type: "delta", text: parts.text };
        words.push(...parts.text.toLowerCase().split(/\s+/).filter(Boolean));
        if (++counter % 16 === 0 && words.length >= 40 && loopScore(words) >= 6) {
          controller.abort();
          yield { type: "loop-stop" };
          return;
        }
      }
    }
    yield* flush();
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}
