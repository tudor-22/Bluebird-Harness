import type { JWK } from "jose";

function readPort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonObject<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Matches the role created by the first migration for local development. */
const DEV_DATABASE_URL = "postgres://bluebird_app:bluebird_dev_password@127.0.0.1:5432/bluebird";

function devDatabaseUrl(): string {
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set.");
  return DEV_DATABASE_URL;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readPort(process.env.PORT, 4000),
  host: process.env.HOST ?? "127.0.0.1",
  // Comma-separated list; the web app falls back to port 3001 when 3000 is taken.
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // The development default is never used by a production build: it must be given an address.
  databaseUrl: process.env.DATABASE_URL ?? devDatabaseUrl(),
  databaseAdminUrl: process.env.DATABASE_ADMIN_URL ?? "",
  serviceIssuer: process.env.BLUEBIRD_SERVICE_ISSUER ?? "bluebird-web",
  serviceAudience: process.env.BLUEBIRD_SERVICE_AUDIENCE ?? "bluebird-api",
  servicePublicKeys: readJsonObject<Record<string, JWK>>(process.env.BLUEBIRD_SERVICE_PUBLIC_KEYS, {}),
  // "ollama" talks to a local Ollama server; "stub" is an offline placeholder.
  modelProvider: process.env.MODEL_PROVIDER ?? "ollama",
  ollamaUrl: (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, ""),
  // The context window requested from Ollama (num_ctx). Raise it if you have the memory.
  contextTokens: readPort(process.env.BLUEBIRD_CONTEXT_TOKENS, 16384),
  // Where the chosen model is remembered between restarts.
  settingsFile: process.env.BLUEBIRD_SETTINGS_FILE ?? ".data/settings.json",
  // "ollama" embeds with a local embedding model (bge-m3); empty disables retrieval.
  embeddingsProvider: process.env.EMBEDDINGS_PROVIDER ?? "ollama",
  embeddingsModel: process.env.EMBEDDINGS_MODEL ?? "bge-m3",
  // Place lookup for maps calls an outside service, so it is off unless enabled.
  // The long panel, chart and app instructions suit large models only. Small
  // local models get confused by them, so they are off unless enabled.
  richUi: process.env.BLUEBIRD_RICH_UI !== "0",
  allowOnline: process.env.BLUEBIRD_ALLOW_ONLINE === "1",
  // Optional default web search key; a key saved in settings takes priority.
  attachmentsDir: process.env.ATTACHMENTS_DIR ?? ".data/attachments",
} as const;
