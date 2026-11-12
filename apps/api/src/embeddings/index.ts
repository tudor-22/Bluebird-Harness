import { env } from "../env";
import { createOllamaEmbeddingProvider } from "./ollama";
import type { EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";

/** Null when embeddings are switched off — retrieval then stands down. */
export function createEmbeddingProvider(): EmbeddingProvider | null {
  if (env.embeddingsProvider === "ollama") {
    return createOllamaEmbeddingProvider({ url: env.ollamaUrl, model: env.embeddingsModel });
  }
  return null;
}
