/** Client for the messages-style chat protocol used by the Anthropic API engine. */
import type { ReasoningEffort } from "@bluebird/shared";
import type { ResolvedModel } from "./engines";
import { postModel, sseData } from "./http";
import { loopScore, samplingFor } from "./ollama";
import { levelForTurn, messagesThinking } from "./reasoning";
import type { ModelMessage, ModelStreamEvent, ModelTool, StreamChatOptions } from "./types";

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type TurnMessage = { role: "user" | "assistant"; content: Block[] };

function textOf(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  return (message.content ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** This protocol keeps instructions apart from the conversation and wants alternating turns. */
export function toMessagesFormat(messages: ModelMessage[]): { system: string; messages: TurnMessage[] } {
  const system = messages
    .filter((message) => message.role === "system")
    .map(textOf)
    .filter(Boolean)
    .join("\n\n");

  const turns: TurnMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const blocks: Block[] = [];
    if (message.role === "tool" && message.tool_call_id) {
      blocks.push({ type: "tool_result", tool_use_id: message.tool_call_id, content: textOf(message) || "(no output)" });
    }
    for (const call of message.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.arguments || "{}");
      } catch {
        // The model wrote broken arguments; the call is replayed empty.
      }
      blocks.push({ type: "tool_use", id: call.id, name: call.name, input });
    }
    if (typeof message.content === "string") {
      if (message.content) blocks.push({ type: "text", text: message.content });
    } else {
      for (const part of message.content ?? []) {
        if (part.type === "text" && part.text) blocks.push({ type: "text", text: part.text });
        if (part.type === "image_url") {
          const match = /^data:([^;]+);base64,(.*)$/s.exec(part.image_url.url);
          if (match) {
            blocks.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
          }
        }
      }
    }
    if (blocks.length === 0) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  }
  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", content: [{ type: "text", text: "Hello." }] });
  }
  return { system, messages: turns };
}

const headers = (resolved: ResolvedModel): Record<string, string> => ({
  "x-api-key": resolved.apiKey,
  "anthropic-version": "2023-06-01",
});

function body(
  resolved: ResolvedModel,
  options: {
    messages: ModelMessage[];
    maxTokens?: number;
    chat: boolean;
    stream: boolean;
    thinking?: boolean;
    reasoningEffort?: ReasoningEffort;
    tools?: ModelTool[];
  },
) {
  const sampling = samplingFor({ thinking: false, chat: options.chat });
  const converted = toMessagesFormat(options.messages);
  const level = levelForTurn(resolved.model.thinkingLevels ?? [], Boolean(options.thinking), options.reasoningEffort);
  const plan = messagesThinking(
    resolved.model.name,
    level,
    Math.min(options.maxTokens ?? sampling.max_tokens ?? 4096, 32_000),
  );

  return {
    model: resolved.model.name,
    max_tokens: plan.maxTokens,
    ...(converted.system ? { system: converted.system } : {}),
    messages: converted.messages,
    ...(plan.thinking ? { thinking: plan.thinking } : {}),
    ...(plan.effort ? { output_config: { effort: plan.effort } } : {}),
    ...(plan.sampling ? { temperature: Math.min(sampling.temperature ?? 0.5, 1) } : {}),
    stream: options.stream,
    ...(options.tools?.length
      ? {
          tools: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          })),
        }
      : {}),
  };
}

export async function messagesComplete(
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
    `${resolved.baseUrl}/messages`,
    headers(resolved),
    body(resolved, {
      messages: options.messages,
      maxTokens: options.maxTokens,
      chat: false,
      stream: false,
      thinking: false,
    }),
  );
  const data = (await response.json()) as { content?: { type?: string; text?: string }[] };
  return (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

export async function* messagesStream(
  resolved: ResolvedModel,
  options: StreamChatOptions,
): AsyncGenerator<ModelStreamEvent> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await postModel(
      resolved.engine.name,
      `${resolved.baseUrl}/messages`,
      headers(resolved),
      body(resolved, {
        messages: options.messages,
        maxTokens: options.maxTokens,
        chat: true,
        stream: true,
        thinking: options.thinking,
        reasoningEffort: options.reasoningEffort,
        tools: options.tools,
      }),
      controller.signal,
    );
    if (!response.body) throw new Error("model returned no body");

    const words: string[] = [];
    let counter = 0;
    let promptTokens: number | undefined;
    const uses = new Map<number, { id: string; name: string; arguments: string }>();
    for await (const data of sseData(response.body)) {
      let event: {
        type?: string;
        index?: number;
        content_block?: { type?: string; id?: string; name?: string };
        delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
        message?: { usage?: { input_tokens?: number } };
        usage?: { output_tokens?: number };
        error?: { message?: string };
      };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "error") throw new Error(`model: ${event.error?.message ?? "request failed"}`);
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        uses.set(event.index ?? 0, {
          id: event.content_block.id ?? "",
          name: event.content_block.name ?? "",
          arguments: "",
        });
      }
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        const use = uses.get(event.index ?? 0);
        if (use) use.arguments += event.delta.partial_json ?? "";
      }
      if (event.type === "content_block_stop" && uses.has(event.index ?? 0)) {
        const use = uses.get(event.index ?? 0)!;
        uses.delete(event.index ?? 0);
        yield { type: "tool_call", call: use };
      }
      if (event.type === "message_start") promptTokens = event.message?.usage?.input_tokens;
      if (event.type === "message_delta" && event.usage) {
        yield {
          type: "usage",
          usage: { prompt_tokens: promptTokens, completion_tokens: event.usage.output_tokens },
        };
      }
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "thinking_delta" &&
        event.delta.thinking
      ) {
        yield { type: "reasoning", text: event.delta.thinking };
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        yield { type: "delta", text: event.delta.text };
        words.push(...event.delta.text.toLowerCase().split(/\s+/).filter(Boolean));
        if (++counter % 16 === 0 && words.length >= 40 && loopScore(words) >= 6) {
          controller.abort();
          yield { type: "loop-stop" };
          return;
        }
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}
