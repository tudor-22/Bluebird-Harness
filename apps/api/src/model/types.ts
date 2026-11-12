import type { ReasoningEffort } from "@bluebird/shared";

export type ModelTextPart = { type: "text"; text: string };
export type ModelImagePart = { type: "image_url"; image_url: { url: string } };
export type ModelAudioPart = {
  type: "input_audio";
  input_audio: { data: string; format: string };
};
export type ModelContentPart = ModelTextPart | ModelImagePart | ModelAudioPart;

/** A function the model asked to call; arguments are the JSON text it wrote. */
export type ModelToolCall = { id: string; name: string; arguments: string };

/** A function the model may call. parameters is a JSON schema. */
export type ModelTool = { name: string; description: string; parameters: Record<string, unknown> };

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ModelContentPart[] | null;
  /** On an assistant message: the calls it made. */
  tool_calls?: ModelToolCall[];
  /** On a tool message: which call this answers. */
  tool_call_id?: string;
};

export type ModelStreamEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; usage: { prompt_tokens?: number; completion_tokens?: number } }
  | { type: "tool_call"; call: ModelToolCall }
  | { type: "loop-stop" };

export type StreamChatOptions = {
  messages: ModelMessage[];
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  /** Functions the model may call this turn. */
  tools?: ModelTool[];
  signal?: AbortSignal;
};

export interface ModelProvider {
  readonly name: string;
  /**
   * Asks any connected model that can see to describe a picture. Null when no
   * connected model can see.
   */
  describeImage?(image: { mime: string; base64: string }, question: string): Promise<string | null>;
  streamChat(options: StreamChatOptions): AsyncGenerator<ModelStreamEvent>;
  /** Non-streaming completion — used for background work such as summaries. */
  complete(options: {
    messages: ModelMessage[];
    thinking?: boolean;
    reasoningEffort?: ReasoningEffort;
    maxTokens?: number;
  }): Promise<string>;
}
