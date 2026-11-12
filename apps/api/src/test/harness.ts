import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import pg from "pg";
import { createTokenVerifier } from "../auth/service-token";
import { runMigrations } from "../db/migrate";
import { createPool } from "../db/pool";
import type { EngineHub, ResolvedModel } from "../model/engines";
import { createStubModelProvider } from "../model/stub";
import type { ModelProvider } from "../model/types";
import type { AgentRuntime } from "../agent/runtime";
import { buildServer } from "../server";

export type TestUser = { sub: string; email: string; name: string };

// Deterministic content key so the sealed attachment store works in tests.
process.env.BLUEBIRD_CONTENT_KEY ??= Buffer.alloc(32, 7).toString("base64");

function withDatabase(url: string, other: string): string {
  const target = new URL(url);
  const source = new URL(other);
  target.pathname = source.pathname;
  return target.toString();
}

async function ensureDatabase(adminUrl: string, testUrl: string): Promise<void> {
  const name = new URL(testUrl).pathname.replace(/^\//, "");
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    const exists = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if ((exists.rowCount ?? 0) === 0) {
      await pool.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await pool.end();
  }
}

export async function createHarness(
  options: { model?: ModelProvider; agent?: AgentRuntime } = {},
) {
  // Defaults mirror the local native Postgres (pnpm db:up); CI overrides both.
  const adminUrl =
    process.env.DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/bluebird";
  const testUrl =
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/bluebird_test";

  await ensureDatabase(adminUrl, testUrl);
  const testAdminUrl = withDatabase(adminUrl, testUrl);
  await runMigrations(testAdminUrl);

  // Fresh state for every run.
  const adminPool = new pg.Pool({ connectionString: testAdminUrl, max: 1 });
  await adminPool.query("TRUNCATE users CASCADE");
  await adminPool.query("TRUNCATE jobs");
  await adminPool.end();

  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const verifier = createTokenVerifier(
    { "test-1": await exportJWK(publicKey) },
    { issuer: "bluebird-web", audience: "bluebird-api" },
  );
  const pool = createPool(testUrl);
  // Tests choose which model is "selected" instead of probing real engines.
  let current: ResolvedModel | null = null;
  const models: EngineHub = {
    snapshot: async () => ({ engines: [], selected: null }),
    resolve: async () => current,
    findVision: async () => (current?.model.vision ? current : null),
    configure: async () => undefined,
    select: async () => undefined,
  };
  const app = buildServer({
    pool,
    models,
    model: options.model ?? createStubModelProvider(),
    ...(options.agent ? { agent: options.agent } : {}),
    embeddings: null,
    verifyServiceToken: verifier,
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as AddressInfo;

  const signToken = (user: TestUser) =>
    new SignJWT({ email: user.email, name: user.name, picture: null, scp: ["chat"] })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-1" })
      .setIssuer("bluebird-web")
      .setAudience("bluebird-api")
      .setSubject(user.sub)
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(privateKey);

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pool,
    signToken,
    /** Pretends the default model is one that can (or cannot) listen to audio. */
    setAudioModel(audio: boolean | null) {
      current =
        audio === null
          ? null
          : {
              engine: { id: "test", name: "Test", kind: "local", protocol: "chat", defaultBaseUrl: "", needsKey: false },
              baseUrl: "http://test.invalid",
              apiKey: "",
              model: { name: "test-model", sizeBytes: null, parameterSize: null, family: null, vision: false, audio, thinking: false, thinkingLevels: [], embedding: false },
            };
    },
    async close() {
      await app.close();
      await pool.end();
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export type SseEvent = { event: string; data: Record<string, unknown> };

export function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith(":"))
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}";
      return { event, data: JSON.parse(dataLine) as Record<string, unknown> };
    });
}
