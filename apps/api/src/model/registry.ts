import { env } from "../env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LocalModel, ModelsResponse } from "@bluebird/shared";
import { levelsFor } from "./reasoning";

export type ModelRegistry = {
  /** Installed models plus the one chat currently uses. */
  snapshot(): Promise<ModelsResponse>;
  /** The model chat should use now, or null when none is installed. */
  resolve(): Promise<LocalModel | null>;
  /** Remembers a choice; throws when the model is not installed. */
  select(name: string): Promise<void>;
};

type Tag = {
  name: string;
  size?: number;
  details?: { family?: string; parameter_size?: string };
};

const LIST_TTL_MS = 5_000;
const LOOKUP_TIMEOUT_MS = 3_000;

function looksLikeEmbeddingName(name: string): boolean {
  return /embed|bge|minilm|e5-|gte-|arctic-embed/i.test(name);
}

async function readSaved(file: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { model?: unknown };
    return typeof parsed.model === "string" && parsed.model ? parsed.model : null;
  } catch {
    return null;
  }
}

/**
 * Talks to a local Ollama server: lists installed models, reads what each can
 * do, and remembers the person's choice in a small settings file. With no
 * choice made it picks the first installed chat model, so a fresh install just
 * works.
 */
export function createOllamaRegistry(config: {
  baseUrl: string;
  /** A model forced by configuration; wins over the saved choice. */
  pinned?: string;
  settingsFile: string;
}): ModelRegistry {
  const capabilityCache = new Map<string, Promise<{ caps: string[] | null; context: number | null }>>();
  let cache: { at: number; reachable: boolean; models: LocalModel[] } | null = null;

  function capabilities(name: string, digestKey: string): Promise<{ caps: string[] | null; context: number | null }> {
    const key = `${name}@${digestKey}`;
    let entry = capabilityCache.get(key);
    if (!entry) {
      entry = fetch(`${config.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name }),
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      })
        .then(async (response) => {
          if (!response.ok) return { caps: null, context: null };
          const data = (await response.json()) as { capabilities?: unknown; model_info?: Record<string, unknown> };
          const caps = Array.isArray(data.capabilities)
            ? data.capabilities.filter((c): c is string => typeof c === "string")
            : null;
          // The model's own limit is under a key named for its architecture, such as llama.context_length.
          const limit = Object.entries(data.model_info ?? {}).find(([k, v]) => k.endsWith(".context_length") && typeof v === "number")?.[1];
          return { caps, context: typeof limit === "number" ? limit : null };
        })
        .catch(() => ({ caps: null, context: null }));
      capabilityCache.set(key, entry);
    }
    return entry;
  }

  async function load(): Promise<{ reachable: boolean; models: LocalModel[] }> {
    if (cache && Date.now() - cache.at < LIST_TTL_MS) return cache;
    let reachable = false;
    let models: LocalModel[] = [];
    try {
      const response = await fetch(`${config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (response.ok) {
        reachable = true;
        const data = (await response.json()) as { models?: Tag[] };
        const tags = Array.isArray(data.models) ? data.models : [];
        models = await Promise.all(
          tags.map(async (tag): Promise<LocalModel> => {
            const { caps, context } = await capabilities(tag.name, String(tag.size ?? 0));
            const embedding = caps
              ? caps.includes("embedding") && !caps.includes("completion")
              : looksLikeEmbeddingName(tag.name);
            const levels = levelsFor({
              engineId: "ollama",
              protocol: "ollama",
              name: tag.name,
              ollamaThinking: caps?.includes("thinking") ?? false,
            });
            return {
              name: tag.name,
              sizeBytes: typeof tag.size === "number" ? tag.size : null,
              parameterSize: tag.details?.parameter_size ?? null,
              family: tag.details?.family ?? null,
              vision: caps?.includes("vision") ?? false,
              audio: caps?.includes("audio") ?? false,
              thinking: levels.length > 0,
              thinkingLevels: levels,
              embedding,
              // Bluebird asks Ollama for a window of its own size, so the smaller of the two is what applies.
              contextWindow: context ? Math.min(context, env.contextTokens) : env.contextTokens,
            };
          }),
        );
      }
    } catch {
      // Ollama is not running; the UI explains how to start it.
    }
    cache = { at: Date.now(), reachable, models };
    return cache;
  }

  async function chosenName(models: LocalModel[]): Promise<LocalModel | null> {
    const chatModels = models.filter((model) => !model.embedding);
    const wanted = config.pinned || (await readSaved(config.settingsFile));
    const match = wanted ? chatModels.find((model) => model.name === wanted) : undefined;
    return match ?? chatModels[0] ?? null;
  }

  return {
    async snapshot() {
      const { reachable, models } = await load();
      const selected = await chosenName(models);
      return { reachable, serverUrl: config.baseUrl, models, selected: selected?.name ?? null };
    },

    async resolve() {
      const { models } = await load();
      return chosenName(models);
    },

    async select(name) {
      cache = null;
      const { models } = await load();
      const found = models.find((model) => model.name === name && !model.embedding);
      if (!found) throw new Error(`"${name}" is not an installed chat model.`);
      await mkdir(dirname(config.settingsFile), { recursive: true });
      await writeFile(config.settingsFile, JSON.stringify({ model: name }, null, 2));
    },
  };
}
