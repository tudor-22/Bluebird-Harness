import type { EmbeddingProvider } from "./types";

/**
 * Local embeddings through Ollama. The schema stores 1024-dimension vectors,
 * which is what bge-m3 produces; `ollama pull bge-m3` enables retrieval and
 * long-term memory. When the model is missing the calls fail and the
 * callers carry on without retrieval.
 */
export function createOllamaEmbeddingProvider(config: {
  url: string;
  model: string;
}): EmbeddingProvider {
  const base = config.url.replace(/\/+$/, "");

  return {
    name: `ollama:${config.model}`,

    async embed(texts) {
      if (texts.length === 0) return [];
      const response = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, input: texts }),
      });
      if (!response.ok) {
        throw new Error(`embeddings ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      const data = (await response.json()) as { embeddings?: number[][] };
      return data.embeddings ?? [];
    },
  };
}
