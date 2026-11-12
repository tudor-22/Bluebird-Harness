import type {
  EngineInfo,
  EngineKind,
  EnginesResponse,
  EngineStatus,
  LocalModel,
} from "@bluebird/shared";
import { levelsFor } from "./reasoning";
import { readStored, writeStored, type Stored } from "./settings-store";
import { createOllamaRegistry } from "./registry";

/** How to talk to an engine. Most speak the common chat-completions protocol. */
export type Protocol = "ollama" | "chat" | "messages";

export type EngineDef = {
  id: string;
  name: string;
  kind: EngineKind;
  protocol: Protocol;
  defaultBaseUrl: string;
  needsKey: boolean;
};

/** Every engine Bluebird can use. Local ones are probed at their usual address. */
export function engineDefs(ollamaUrl: string): EngineDef[] {
  return [
    { id: "ollama", name: "Ollama", kind: "local", protocol: "ollama", defaultBaseUrl: ollamaUrl, needsKey: false },
    { id: "llamacpp", name: "llama.cpp", kind: "local", protocol: "chat", defaultBaseUrl: "http://127.0.0.1:8080/v1", needsKey: false },
    { id: "vllm", name: "vLLM", kind: "local", protocol: "chat", defaultBaseUrl: "http://127.0.0.1:8000/v1", needsKey: false },
    { id: "strata", name: "Strata Engine", kind: "local", protocol: "chat", defaultBaseUrl: "http://127.0.0.1:8090/v1", needsKey: false },
    { id: "lmstudio", name: "LM Studio", kind: "local", protocol: "chat", defaultBaseUrl: "http://127.0.0.1:1234/v1", needsKey: false },
    { id: "deepseek", name: "DeepSeek API", kind: "cloud", protocol: "chat", defaultBaseUrl: "https://api.deepseek.com/v1", needsKey: true },
    { id: "qwen", name: "Qwen API", kind: "cloud", protocol: "chat", defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", needsKey: true },
    { id: "openai", name: "OpenAI API", kind: "cloud", protocol: "chat", defaultBaseUrl: "https://api.openai.com/v1", needsKey: true },
    { id: "anthropic", name: "Anthropic API", kind: "cloud", protocol: "messages", defaultBaseUrl: "https://api.anthropic.com/v1", needsKey: true },
    { id: "mistral", name: "Mistral API", kind: "cloud", protocol: "chat", defaultBaseUrl: "https://api.mistral.ai/v1", needsKey: true },
    { id: "google", name: "Google API", kind: "cloud", protocol: "chat", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", needsKey: true },
    { id: "custom", name: "Custom API", kind: "custom", protocol: "chat", defaultBaseUrl: "", needsKey: false },
  ];
}

export type ResolvedModel = {
  engine: EngineDef;
  baseUrl: string;
  apiKey: string;
  model: LocalModel;
};

export type EngineHub = {
  /** Every engine with its status and the models it reports right now. */
  snapshot(): Promise<EnginesResponse>;
  /** The default model to chat with, or null when no engine has one. */
  resolve(): Promise<ResolvedModel | null>;
  /** A ready model that can look at pictures: the default if it can, otherwise any other. */
  findVision(): Promise<ResolvedModel | null>;
  /** Sets an engine's address or key. An empty string clears the value. */
  configure(id: string, patch: { baseUrl?: string; apiKey?: string }): Promise<void>;
  /** Remembers the default model. Throws if the engine does not offer it. */
  select(engine: string, model: string): Promise<void>;
};

const LIST_TTL_MS = 5_000;
const LOOKUP_TIMEOUT_MS = 4_000;
/** Models that are not for chat: speech, images, embeddings, moderation. */
const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|image|realtime|transcribe|babbage|davinci|rerank/i;
/** Models known to listen to audio. */
const LISTENS_TO_AUDIO = /audio|omni|voxtral|gemini/i;
const LOOKS_VISUAL = /vision|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|pixtral|llava|qwen.*vl|-vl|mistral-(medium|large|small)/i;

/** Windows of well-known hosted models, for services that do not say. Matched by name, most specific first. */
const KNOWN_WINDOWS: [RegExp, number][] = [
  [/gemini/i, 1_048_576],
  [/gpt-4\.1/i, 1_047_576],
  [/gpt-5/i, 400_000],
  [/\bo[134](-|$)/i, 200_000],
  [/gpt-4o|gpt-4-turbo/i, 128_000],
  [/claude/i, 200_000],
  [/deepseek/i, 128_000],
  [/qwen.*(long|turbo)/i, 1_000_000],
  [/qwen/i, 131_072],
  [/mistral|mixtral|codestral|pixtral/i, 128_000],
  [/llama-?3\.[123]|llama3\.[123]/i, 131_072],
];
export function knownContextWindow(name: string): number | null {
  return KNOWN_WINDOWS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/** The window some services list beside each model, under a few common names. */
function listedWindow(item: unknown): number | null {
  const record = item as Record<string, unknown> & { meta?: Record<string, unknown> };
  for (const key of ["context_length", "context_window", "max_context_length", "max_model_len", "max_input_tokens", "inputTokenLimit"]) {
    const value = record[key];
    if (typeof value === "number" && value > 0) return value;
  }
  const trained = record.meta?.n_ctx_train;
  return typeof trained === "number" && trained > 0 ? trained : null;
}

function chatModel(id: string, engine: EngineDef, contextWindow: number | null = null): LocalModel {
  contextWindow ??= knownContextWindow(id);
  const thinkingLevels = levelsFor({ engineId: engine.id, protocol: engine.protocol, name: id });
  return {
    name: id,
    sizeBytes: null,
    parameterSize: null,
    family: null,
    vision: LOOKS_VISUAL.test(id),
    audio: LISTENS_TO_AUDIO.test(id),
    thinking: thinkingLevels.length > 0,
    thinkingLevels,
    embedding: false,
    contextWindow,
  };
}

type Listing = { status: EngineStatus; error: string | null; models: LocalModel[] };

async function listChat(engine: EngineDef, baseUrl: string, apiKey: string): Promise<Listing> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    return { status: "unreachable", error: `Nothing answered at ${baseUrl}.`, models: [] };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: "error", error: "The API key was refused.", models: [] };
  }
  if (!response.ok) {
    return { status: "error", error: `The service answered with HTTP ${response.status}.`, models: [] };
  }
  const data = (await response.json().catch(() => ({}))) as {
    data?: { id?: unknown }[];
    models?: { id?: unknown; name?: unknown }[];
  };
  const raw = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  const windows = new Map<string, number | null>();
  const ids = raw
    .map((item) => {
      const id = typeof item.id === "string" ? item.id : (item as { name?: unknown }).name;
      const clean = typeof id === "string" ? id.replace(/^models\//, "") : "";
      if (clean) windows.set(clean, listedWindow(item));
      return clean;
    })
    .filter((id) => id && !NOT_CHAT.test(id));
  const models = [...new Set(ids)].sort().map((id) => chatModel(id, engine, windows.get(id) ?? null));
  return { status: models.length > 0 ? "ready" : "no-models", error: null, models };
}

async function listMessages(engine: EngineDef, baseUrl: string, apiKey: string): Promise<Listing> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models?limit=100`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    return { status: "unreachable", error: `Nothing answered at ${baseUrl}.`, models: [] };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: "error", error: "The API key was refused.", models: [] };
  }
  if (!response.ok) {
    return { status: "error", error: `The service answered with HTTP ${response.status}.`, models: [] };
  }
  const data = (await response.json().catch(() => ({}))) as { data?: { id?: unknown }[] };
  const models = (Array.isArray(data.data) ? data.data : [])
    .map((item) => (typeof item.id === "string" ? item.id : ""))
    .filter(Boolean)
    .map((id) => ({ ...chatModel(id, engine, knownContextWindow(id)), vision: true, audio: false }));
  return { status: models.length > 0 ? "ready" : "no-models", error: null, models };
}

export function createEngineHub(config: { settingsFile: string; ollamaUrl: string }): EngineHub {
  const defs = engineDefs(config.ollamaUrl);
  const ollamaRegistries = new Map<string, ReturnType<typeof createOllamaRegistry>>();
  const cache = new Map<string, { at: number; listing: Listing }>();

  function baseUrlFor(def: EngineDef, stored: Stored): string {
    const chosen = stored.engines?.[def.id]?.baseUrl?.trim();
    return (chosen || def.defaultBaseUrl).replace(/\/+$/, "");
  }

  async function list(
    def: EngineDef,
    stored: Stored,
  ): Promise<Listing & { baseUrl: string; apiKey: string }> {
    const baseUrl = baseUrlFor(def, stored);
    const apiKey = stored.engines?.[def.id]?.apiKey ?? "";
    const wrap = (listing: Listing) => ({ ...listing, baseUrl, apiKey });

    if (def.needsKey && !apiKey) {
      return wrap({ status: "needs-key", error: null, models: [] });
    }
    if (!baseUrl) {
      return wrap({ status: "unreachable", error: "Enter the address of your API.", models: [] });
    }

    const key = `${def.id}|${baseUrl}|${apiKey.length}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return wrap(hit.listing);

    let listing: Listing;
    if (def.protocol === "ollama") {
      let registry = ollamaRegistries.get(baseUrl);
      if (!registry) {
        registry = createOllamaRegistry({ baseUrl, settingsFile: config.settingsFile });
        ollamaRegistries.set(baseUrl, registry);
      }
      const snapshot = await registry.snapshot();
      const models = snapshot.models.filter((model) => !model.embedding);
      listing = snapshot.reachable
        ? { status: models.length > 0 ? "ready" : "no-models", error: null, models }
        : { status: "unreachable", error: `Nothing answered at ${baseUrl}.`, models: [] };
    } else if (def.protocol === "messages") {
      listing = await listMessages(def, baseUrl, apiKey);
    } else {
      listing = await listChat(def, baseUrl, apiKey);
    }
    cache.set(key, { at: Date.now(), listing });
    return wrap(listing);
  }

  async function all(stored: Stored) {
    return Promise.all(defs.map(async (def) => ({ def, ...(await list(def, stored)) })));
  }

  function choose(
    listed: Awaited<ReturnType<typeof all>>,
    stored: Stored,
  ): { engine: string; model: string } | null {
    const saved = stored.selected;
    if (saved) {
      const hit = listed.find((entry) => entry.def.id === saved.engine);
      if (hit?.status === "ready" && hit.models.some((model) => model.name === saved.model)) {
        return saved;
      }
    }
    // Nothing valid chosen: use the first model that is actually available.
    const first = listed.find((entry) => entry.status === "ready");
    return first ? { engine: first.def.id, model: first.models[0].name } : null;
  }

  return {
    async snapshot() {
      const stored = await readStored(config.settingsFile);
      const listed = await all(stored);
      const engines: EngineInfo[] = listed.map((entry) => ({
        id: entry.def.id,
        name: entry.def.name,
        kind: entry.def.kind,
        baseUrl: entry.baseUrl,
        defaultBaseUrl: entry.def.defaultBaseUrl,
        hasKey: Boolean(entry.apiKey),
        needsKey: entry.def.needsKey,
        status: entry.status,
        error: entry.error,
        models: entry.models,
      }));
      return { engines, selected: choose(listed, stored) };
    },

    async resolve() {
      const stored = await readStored(config.settingsFile);
      const listed = await all(stored);
      const picked = choose(listed, stored);
      if (!picked) return null;
      const entry = listed.find((item) => item.def.id === picked.engine)!;
      const model = entry.models.find((item) => item.name === picked.model)!;
      return { engine: entry.def, baseUrl: entry.baseUrl, apiKey: entry.apiKey, model };
    },

    async findVision() {
      const stored = await readStored(config.settingsFile);
      const listed = await all(stored);
      const picked = choose(listed, stored);
      const ready = listed.filter((entry) => entry.status === "ready");
      const sees = (entry: (typeof ready)[number], name?: string) =>
        entry.models.find((model) => model.vision && !model.embedding && (!name || model.name === name));
      // The chosen model first, then anything else that can see.
      const first = picked ? ready.find((entry) => entry.def.id === picked.engine) : undefined;
      const order = first ? [first, ...ready.filter((entry) => entry !== first)] : ready;
      for (const entry of order) {
        const model = entry === first ? sees(entry, picked!.model) ?? sees(entry) : sees(entry);
        if (model) return { engine: entry.def, baseUrl: entry.baseUrl, apiKey: entry.apiKey, model };
      }
      return null;
    },

    async configure(id, patch) {
      const def = defs.find((item) => item.id === id);
      if (!def) throw new Error(`Unknown engine "${id}".`);
      const stored = await readStored(config.settingsFile);
      const current: NonNullable<Stored["engines"]>[string] = { ...(stored.engines?.[id] ?? {}) };

      if (patch.baseUrl !== undefined) {
        const value = patch.baseUrl.trim();
        if (value) {
          let parsed: URL;
          try {
            parsed = new URL(value);
          } catch {
            throw new Error("The address must be a full URL, such as http://127.0.0.1:8080/v1.");
          }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("The address must start with http:// or https://.");
          }
          current.baseUrl = value;
        } else {
          delete current.baseUrl;
        }
      }
      if (patch.apiKey !== undefined) {
        const value = patch.apiKey.trim();
        if (value) current.apiKey = value;
        else delete current.apiKey;
      }
      const engines = { ...(stored.engines ?? {}) };
      if (Object.keys(current).length > 0) engines[id] = current;
      else delete engines[id];
      cache.clear();
      await writeStored(config.settingsFile, { ...stored, engines });
    },

    async select(engine, model) {
      const stored = await readStored(config.settingsFile);
      const listed = await all(stored);
      const hit = listed.find((entry) => entry.def.id === engine);
      if (!hit || hit.status !== "ready" || !hit.models.some((item) => item.name === model)) {
        throw new Error(`"${model}" is not available from ${hit?.def.name ?? engine} right now.`);
      }
      await writeStored(config.settingsFile, { ...stored, selected: { engine, model } });
    },
  };
}
