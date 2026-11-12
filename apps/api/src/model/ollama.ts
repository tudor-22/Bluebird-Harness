/**
 * Client for a local Ollama server, using its native chat API so the context
 * window (num_ctx) and thinking can be set per request. Everything stays on
 * this machine: the base URL is loopback and nothing is sent anywhere else.
 */
import type { LocalModel, ReasoningEffort } from "@bluebird/shared";
import { env } from "../env";
import { isGptOss, levelForTurn } from "./reasoning";
import type { ModelRegistry } from "./registry";
import type {
  ModelContentPart,
  ModelMessage,
  ModelProvider,
  ModelStreamEvent,
  StreamChatOptions,
} from "./types";

/** Raised when no model can answer; the message is safe to show to the person. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

export type OllamaModelConfig = {
  baseUrl: string;
  registry: ModelRegistry;
  /** Context window requested from Ollama. */
  contextTokens?: number;
};

export type Sampling = {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
};

/** The window requested from Ollama, shared by the prompt and the reply. */
export const MODEL_CONTEXT_TOKENS = env.contextTokens;
/** The largest single reply requested: at most half the window. */
export const MAX_REPLY_TOKENS = Math.max(1024, Math.floor(MODEL_CONTEXT_TOKENS / 2));
export const MIN_REPLY_TOKENS = 512;
const REPLY_SAFETY_TOKENS = 512;
/** The identity prompt is part of the message list now, so nothing is reserved. */
export const TEMPLATE_SYSTEM_PROMPT_TOKENS = 0;

/** Ollama's reasoning levels are low, medium and high. */
export function toModelReasoningEffort(effort: ReasoningEffort): ReasoningEffort {
  return effort;
}

/** Deliberately conservative token estimate: 3 characters per token. */
export function estimatePromptTokens(messages: ModelMessage[]): number {
  let chars = 0;
  let media = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const part of message.content ?? []) {
      if (part.type === "text") chars += part.text.length;
      else media += 1;
    }
  }
  return Math.ceil(chars / 3) + media * 1600 + messages.length * 4;
}

/** The largest reply that still fits inside what is left of the window. */
export function replyTokenBudget(
  messages: ModelMessage[],
  /** Hosted engines keep their own, much larger window; local models use the one requested. */
  window: { context: number; maxReply: number } = {
    context: MODEL_CONTEXT_TOKENS,
    maxReply: MAX_REPLY_TOKENS,
  },
): number {
  const prompt = estimatePromptTokens(messages);
  return Math.min(
    window.maxReply,
    Math.max(MIN_REPLY_TOKENS, window.context - prompt - REPLY_SAFETY_TOKENS),
  );
}

/**
 * Hosted and self-run chat servers manage their own window, which is far larger
 * than the one asked of a local model, so replies there are allowed to be long
 * enough to finish a whole web page.
 */
export const HOSTED_WINDOW = { context: 128_000, maxReply: 32_000 };

/** Thinking replies run a little warmer; side tasks run greedy and deterministic. */
export function samplingFor(opts: { thinking: boolean; chat: boolean }): Sampling {
  if (opts.thinking) return { temperature: 0.6, top_p: 0.95, max_tokens: MAX_REPLY_TOKENS };
  if (opts.chat) return { temperature: 0.3, top_p: 0.9, max_tokens: MAX_REPLY_TOKENS };
  return { temperature: 0, top_p: 1, max_tokens: 4096 };
}

export function containsAudio(messages: ModelMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "input_audio"),
  );
}

export function containsMedia(messages: ModelMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) && message.content.some((part) => part.type !== "text"),
  );
}

type OllamaMessage = { role: string; content: string; images?: string[] };

/** Ollama takes images as bare base64 beside the text; audio is not supported. */
export function toOllamaMessages(messages: ModelMessage[]): OllamaMessage[] {
  return messages.map((message) => {
    if (typeof message.content === "string" || message.content === null) {
      return { role: message.role, content: message.content ?? "" };
    }
    const parts: ModelContentPart[] = message.content;
    const text = parts
      .filter((part): part is Extract<ModelContentPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const images = parts.flatMap((part) => {
      if (part.type !== "image_url") return [];
      const match = /^data:[^;]+;base64,(.*)$/s.exec(part.image_url.url);
      return match ? [match[1]] : [];
    });
    return { role: message.role, content: text, ...(images.length > 0 ? { images } : {}) };
  });
}

/** The `think` value a model understands, or undefined when it has no thinking. */
export function thinkValue(
  model: Pick<LocalModel, "name" | "thinking"> & { thinkingLevels?: ReasoningEffort[] },
  thinking: boolean,
  effort?: ReasoningEffort,
): boolean | ReasoningEffort | undefined {
  if (!model.thinking) return undefined;
  const levels = model.thinkingLevels ?? (isGptOss(model.name) ? ["low", "medium", "high"] : ["none", "medium"]);
  const level = levelForTurn(levels, thinking, effort);
  if (!level) return undefined;
  // gpt-oss models take a level instead of on/off.
  if (isGptOss(model.name)) return level === "none" ? "low" : level;
  return level !== "none";
}

/** Longest run of consecutive identical 5-grams — detects degenerate loops. */
export function loopScore(words: string[]): number {
  if (words.length < 30) return 0;
  let best = 0;
  for (let i = Math.max(0, words.length - 150); i + 10 <= words.length; i++) {
    let run = 1;
    while (i + (run + 1) * 5 <= words.length) {
      const a = words.slice(i + (run - 1) * 5, i + run * 5).join(" ");
      const b = words.slice(i + run * 5, i + (run + 1) * 5).join(" ");
      if (a !== b) break;
      run++;
    }
    if (run > best) best = run;
  }
  return best;
}

export function createOllamaModelProvider(config: OllamaModelConfig): ModelProvider {
  const contextTokens = config.contextTokens ?? MODEL_CONTEXT_TOKENS;
  let lastModel = "";

  async function pickModel(): Promise<LocalModel> {
    const model = await config.registry.resolve();
    if (!model) {
      const snapshot = await config.registry.snapshot();
      throw new ModelUnavailableError(
        snapshot.reachable
          ? "No chat model is installed in Ollama yet. Run `ollama pull llama3.2` (or any chat model), then try again."
          : `Cannot reach Ollama at ${config.baseUrl}. Start it with \`ollama serve\`, then try again.`,
      );
    }
    lastModel = model.name;
    return model;
  }

  function requestBody(
    model: LocalModel,
    options: {
      messages: ModelMessage[];
      thinking: boolean;
      reasoningEffort?: ReasoningEffort;
      maxTokens?: number;
      chat: boolean;
      stream: boolean;
    },
  ) {
    const sampling = samplingFor({ thinking: options.thinking, chat: options.chat });
    const think = thinkValue(model, options.thinking, options.reasoningEffort);
    return {
      model: model.name,
      messages: toOllamaMessages(options.messages),
      stream: options.stream,
      ...(think === undefined ? {} : { think }),
      options: {
        num_ctx: contextTokens,
        temperature: sampling.temperature,
        top_p: sampling.top_p,
        top_k: 40,
        repeat_penalty: 1.05,
        num_predict: options.maxTokens ?? sampling.max_tokens,
      },
    };
  }

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ModelUnavailableError(
        `Cannot reach Ollama at ${config.baseUrl}. Start it with \`ollama serve\`, then try again.`,
      );
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`model ${response.status}: ${detail}`);
    }
    return response;
  }

  return {
    get name() {
      return lastModel ? `ollama:${lastModel}` : "ollama";
    },

    async complete({ messages, thinking = false, reasoningEffort, maxTokens }) {
      const model = await pickModel();
      const response = await post(
        requestBody(model, { messages, thinking, reasoningEffort, maxTokens, chat: false, stream: false }),
      );
      const data = (await response.json()) as { message?: { content?: string } };
      return data.message?.content ?? "";
    },

    async *streamChat(options: StreamChatOptions): AsyncGenerator<ModelStreamEvent> {
      const thinking = Boolean(options.thinking);
      const model = await pickModel();

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await post(
          requestBody(model, {
            messages: options.messages,
            thinking,
            reasoningEffort: options.reasoningEffort,
            maxTokens: options.maxTokens,
            chat: true,
            stream: true,
          }),
          controller.signal,
        );
        if (!response.body) throw new Error("model returned no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const words: string[] = [];
        let buffer = "";
        let guardCounter = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;

            const chunk = JSON.parse(line) as {
              error?: string;
              done?: boolean;
              prompt_eval_count?: number;
              eval_count?: number;
              message?: { content?: string; thinking?: string };
            };
            if (chunk.error) throw new Error(`model: ${chunk.error}`);

            if (chunk.message?.thinking) {
              yield { type: "reasoning", text: chunk.message.thinking };
            }
            const text = chunk.message?.content;
            if (text) {
              yield { type: "delta", text };
              words.push(...text.toLowerCase().split(/\s+/).filter(Boolean));
              if (++guardCounter % 16 === 0 && words.length >= 40 && loopScore(words) >= 6) {
                controller.abort();
                yield { type: "loop-stop" };
                return;
              }
            }
            if (chunk.done) {
              yield {
                type: "usage",
                usage: {
                  prompt_tokens: chunk.prompt_eval_count,
                  completion_tokens: chunk.eval_count,
                },
              };
            }
          }
        }
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
