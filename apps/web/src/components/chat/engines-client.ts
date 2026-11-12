import type { EngineInfo, EnginesResponse, LocalModel } from "@bluebird/shared";

/** Reads the engines; null when the backend does not answer sensibly. */
export async function fetchEngines(): Promise<EnginesResponse | null> {
  try {
    const response = await fetch("/api/engines", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<EnginesResponse>;
    return Array.isArray(data.engines) ? (data as EnginesResponse) : null;
  } catch {
    return null;
  }
}

/** Makes this model the default. Returns the fresh list, or null on failure. */
export async function chooseModel(engine: string, model: string): Promise<EnginesResponse | null> {
  try {
    const response = await fetch("/api/models/selected", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, model }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<EnginesResponse>;
    return Array.isArray(data.engines) ? (data as EnginesResponse) : null;
  } catch {
    return null;
  }
}

/** Engines that can answer right now. Anything that cannot is left out. */
export function readyEngines(response: EnginesResponse | null): EngineInfo[] {
  return (response?.engines ?? []).filter(
    (engine) => engine.status === "ready" && engine.models.length > 0,
  );
}

export function selectedModel(
  response: EnginesResponse | null,
): { engine: EngineInfo; model: LocalModel } | null {
  const selected = response?.selected;
  if (!selected) return null;
  const engine = response?.engines.find((item) => item.id === selected.engine);
  const model = engine?.models.find((item) => item.name === selected.model);
  return engine && model ? { engine, model } : null;
}

/** Hugging Face models are long ("hf.co/Org/Name:tag"); show just the name. */
export function shortModelName(name: string): string {
  return name.replace(/^hf\.co\/[^/]+\//, "");
}
