import { z } from "zod";
import { reasoningEffortSchema } from "./user";

/** One model installed in the local Ollama server. */
export const localModelSchema = z.object({
  name: z.string(),
  sizeBytes: z.number().nullable(),
  parameterSize: z.string().nullable(),
  family: z.string().nullable(),
  /** Can read images. */
  vision: z.boolean(),
  /** Can listen to audio files. */
  audio: z.boolean(),
  /** Has a thinking phase the reasoning level can steer. */
  thinking: z.boolean(),
  /**
   * The thinking levels this model honours, as its provider documents them.
   * Empty when thinking cannot be adjusted. ["none", "medium"] is an on/off switch.
   */
  thinkingLevels: z.array(reasoningEffortSchema),
  /** Embedding-only models are listed but cannot be chosen for chat. */
  embedding: z.boolean(),
  /** How many tokens of conversation the model takes at once, when the engine says. */
  contextWindow: z.number().nullable().optional(),
});

export type LocalModel = z.infer<typeof localModelSchema>;

export const modelsResponseSchema = z.object({
  /** Whether the local model server answered. */
  reachable: z.boolean(),
  /** Where it was looked for, so the UI can say what to start. */
  serverUrl: z.string(),
  models: z.array(localModelSchema),
  /** The model chat uses now (auto-detected or chosen), or null if none exist. */
  selected: z.string().nullable(),
});

export type ModelsResponse = z.infer<typeof modelsResponseSchema>;

export const selectModelRequestSchema = z.object({ model: z.string().min(1).max(200) }).strict();
export type SelectModelRequest = z.infer<typeof selectModelRequestSchema>;

/** Where an engine runs. "custom" is the person's own chat-completions URL. */
export const engineKindSchema = z.enum(["local", "cloud", "custom"]);
export type EngineKind = z.infer<typeof engineKindSchema>;

export const engineStatusSchema = z.enum([
  /** Answered and has at least one chat model. */
  "ready",
  /** Answered but has no chat models installed. */
  "no-models",
  /** Nothing is listening at the address. */
  "unreachable",
  /** A hosted service that needs an API key before it can be listed. */
  "needs-key",
  /** The service refused the key or the request. */
  "error",
]);
export type EngineStatus = z.infer<typeof engineStatusSchema>;

export const engineInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: engineKindSchema,
  baseUrl: z.string(),
  defaultBaseUrl: z.string(),
  /** Whether an API key is stored. The key itself never leaves the API. */
  hasKey: z.boolean(),
  /** Whether this engine normally needs a key. */
  needsKey: z.boolean(),
  status: engineStatusSchema,
  error: z.string().nullable(),
  /** Chat models the engine reports right now. Empty unless status is ready. */
  models: z.array(localModelSchema),
});
export type EngineInfo = z.infer<typeof engineInfoSchema>;

export const enginesResponseSchema = z.object({
  engines: z.array(engineInfoSchema),
  /** The default model: which engine and which model. Null if none is available. */
  selected: z.object({ engine: z.string(), model: z.string() }).nullable(),
});
export type EnginesResponse = z.infer<typeof enginesResponseSchema>;

export const selectEngineModelRequestSchema = z
  .object({ engine: z.string().min(1).max(40), model: z.string().min(1).max(200) })
  .strict();
export type SelectEngineModelRequest = z.infer<typeof selectEngineModelRequestSchema>;

export const configureEngineRequestSchema = z
  .object({
    /** Empty string restores the default address. */
    baseUrl: z.string().trim().max(300).optional(),
    /** Empty string removes the stored key. */
    apiKey: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.baseUrl !== undefined || value.apiKey !== undefined, {
    message: "Nothing to update.",
  });
export type ConfigureEngineRequest = z.infer<typeof configureEngineRequestSchema>;
