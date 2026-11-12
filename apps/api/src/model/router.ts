import type { EngineHub, ResolvedModel } from "./engines";
import { chatComplete, chatStream } from "./chat";
import { messagesComplete, messagesStream } from "./messages";
import { createOllamaModelProvider, ModelUnavailableError } from "./ollama";
import { containsAudio } from "./ollama";
import type { ModelProvider, ModelStreamEvent, StreamChatOptions } from "./types";

/**
 * Sends each request to whichever engine and model is the current default,
 * so switching engines in settings takes effect on the very next message.
 */
export function createRoutingProvider(hub: EngineHub): ModelProvider {
  let last = "";

  async function pick(): Promise<ResolvedModel> {
    const resolved = await hub.resolve();
    if (!resolved) {
      throw new ModelUnavailableError(
        "No model is available yet. Open Settings, then Engine, to connect one.",
      );
    }
    last = `${resolved.engine.id}:${resolved.model.name}`;
    return resolved;
  }

  function ollamaFor(resolved: ResolvedModel): ModelProvider {
    return createOllamaModelProvider({
      baseUrl: resolved.baseUrl,
      registry: {
        resolve: async () => resolved.model,
        select: async () => undefined,
        snapshot: async () => ({
          reachable: true,
          serverUrl: resolved.baseUrl,
          models: [resolved.model],
          selected: resolved.model.name,
        }),
      },
    });
  }

  /** Ollama's native chat takes no audio; its chat-completions endpoint can carry it. */
  function listensViaCompat(resolved: ResolvedModel, messages: Parameters<typeof containsAudio>[0]) {
    return resolved.model.audio && containsAudio(messages);
  }
  function compat(resolved: ResolvedModel): ResolvedModel {
    return {
      ...resolved,
      baseUrl: `${resolved.baseUrl}/v1`,
      engine: { ...resolved.engine, protocol: "chat" },
    };
  }

  return {
    async describeImage(image, question) {
      const resolved = await hub.findVision();
      if (!resolved) return null;
      const messages = [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: question },
            { type: "image_url" as const, image_url: { url: `data:${image.mime};base64,${image.base64}` } },
          ],
        },
      ];
      const options = { messages, maxTokens: 700 };
      if (resolved.engine.protocol === "messages") return messagesComplete(resolved, options);
      if (resolved.engine.protocol === "chat") return chatComplete(resolved, options);
      return ollamaFor(resolved).complete(options);
    },

    get name() {
      return last || "none";
    },

    async complete(options) {
      const resolved = await pick();
      if (resolved.engine.protocol === "messages") return messagesComplete(resolved, options);
      if (resolved.engine.protocol === "chat") return chatComplete(resolved, options);
      if (listensViaCompat(resolved, options.messages)) {
        return chatComplete(compat(resolved), options);
      }
      return ollamaFor(resolved).complete(options);
    },

    async *streamChat(options: StreamChatOptions): AsyncGenerator<ModelStreamEvent> {
      const resolved = await pick();
      if (resolved.engine.protocol === "messages") yield* messagesStream(resolved, options);
      else if (resolved.engine.protocol === "chat") yield* chatStream(resolved, options);
      else if (options.tools?.length) {
        // Ollama takes tool calls through its chat-completions endpoint.
        yield* chatStream(compat(resolved), options);
      } else if (listensViaCompat(resolved, options.messages)) {
        yield* chatStream(compat(resolved), options);
      } else yield* ollamaFor(resolved).streamChat(options);
    },
  };
}
