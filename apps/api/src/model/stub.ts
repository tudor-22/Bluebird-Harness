import type { ModelContentPart, ModelMessage, ModelProvider } from "./types";

function describe(message: ModelMessage | undefined): string {
  if (!message) return "(the stub model received no user message)";

  if (typeof message.content === "string") {
    return message.content.trim().length > 0
      ? `You said: “${message.content.trim()}”. (Offline stub reply — unset MODEL_PROVIDER to use a local Ollama model.)`
      : "(the stub model received an empty message)";
  }

  const parts: ModelContentPart[] = Array.isArray(message.content) ? message.content : [];
  const text = parts.find((part) => part.type === "text");
  const images = parts.filter((part) => part.type === "image_url").length;
  const audio = parts.filter((part) => part.type === "input_audio").length;

  const media: string[] = [];
  if (images > 0) media.push(`${images} image${images > 1 ? "s" : ""}`);
  if (audio > 0) media.push(`${audio} audio clip${audio > 1 ? "s" : ""}`);

  const textPart = text && text.type === "text" ? text.text.trim() : "";
  const mediaPart = media.length > 0 ? ` with ${media.join(" and ")}` : "";
  return textPart
    ? `You said: “${textPart}”${mediaPart}. (Offline stub reply.)`
    : `I received your message${mediaPart}. (Offline stub reply.)`;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deterministic offline provider so the whole stack works without a local model. */
export function createStubModelProvider(): ModelProvider {
  return {
    name: "stub",

    async complete({ messages }) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const text = typeof lastUser?.content === "string" ? lastUser.content : "";
      return `Summary of the thread so far: ${text.slice(0, 240)}`;
    },

    async *streamChat({ messages, signal }) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const text = describe(lastUser);

      for (const word of text.split(" ")) {
        if (signal?.aborted) return;
        await delay(12);
        yield { type: "delta", text: `${word} ` };
      }
    },
  };
}
