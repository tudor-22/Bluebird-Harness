/**
 * The model the benchmark's model-driven strategies call. It speaks the Chat Completions API, so
 * it works with Ollama (`/v1`), LM Studio, vLLM, llama.cpp's server, OpenAI and any other service
 * that offers it. Nothing here touches Bluebird's own engine settings or keys.
 */

export type Usage = { inputTokens: number; outputTokens: number };

export type ModelReply = { text: string; usage: Usage; ms: number };

export type BenchModel = {
  readonly name: string;
  /** How the model gives screen positions: image pixels, or 0 to 1000 (Qwen-VL style), or 0 to 1. */
  readonly coords: Coords;
  ask(prompt: string, image?: { mime: string; base64: string }): Promise<ModelReply>;
};

export type Coords = "pixels" | "normalized-1000" | "normalized-1";

export type ModelConfig = { baseUrl: string; model: string; apiKey?: string; coords?: Coords; maxTokens?: number; timeoutMs?: number };

const COORDS: Coords[] = ["pixels", "normalized-1000", "normalized-1"];

/** Reads the model settings from the environment, or null when no model is configured. */
export function modelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelConfig | null {
  const model = env.BENCH_MODEL?.trim();
  if (!model) return null;
  const coords = (env.BENCH_MODEL_COORDS?.trim() || "pixels") as Coords;
  if (!COORDS.includes(coords)) throw new Error(`BENCH_MODEL_COORDS must be one of ${COORDS.join(", ")}.`);
  return {
    baseUrl: (env.BENCH_MODEL_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/+$/, ""),
    model,
    apiKey: env.BENCH_MODEL_KEY?.trim() || undefined,
    coords,
  };
}

export function createBenchModel(config: ModelConfig, fetcher: typeof fetch = fetch): BenchModel {
  return {
    name: config.model,
    coords: config.coords ?? "pixels",
    async ask(prompt, image) {
      const content: unknown = image
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } },
          ]
        : prompt;
      const started = performance.now();
      const response = await fetcher(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, messages: [{ role: "user", content }], temperature: 0, max_tokens: config.maxTokens ?? 200, stream: false }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
      });
      if (!response.ok) throw new Error(`The model answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const raw = data.choices?.[0]?.message?.content;
      const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((part) => (part as { text?: string }).text ?? "").join("") : "";
      return {
        text,
        usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        ms: performance.now() - started,
      };
    },
  };
}

/** The first JSON object in a reply, tolerating code fences and text around it. */
export function firstJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Turns a model's point into image pixels. */
export function toPixels(point: { x: number; y: number }, coords: Coords, size: { width: number; height: number }) {
  if (coords === "normalized-1000") return { x: (point.x / 1000) * size.width, y: (point.y / 1000) * size.height };
  if (coords === "normalized-1") return { x: point.x * size.width, y: point.y * size.height };
  return point;
}
