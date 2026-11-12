#!/usr/bin/env node
/**
 * Generates the local service-to-service Ed25519 keypair and writes the
 * environment files both apps need in development.
 *
 * - apps/api/.env       ← BLUEBIRD_SERVICE_PUBLIC_KEYS ({"<kid>": <public JWK>})
 * - apps/web/.env.local ← BLUEBIRD_SERVICE_PRIVATE_JWK (base64 JSON), key id, API URL
 *
 * Production keys are generated once per deployment (Phase 4). Re-running
 * rotates the dev key; the private key is never printed.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyId = process.env.BLUEBIRD_SERVICE_KEY_ID ?? "dev-1";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

function upsertEnv(path, values) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (index >= 0) lines[index] = entry;
    else lines.push(entry);
  }
  const content = `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  writeFileSync(path, content);
  console.log(`updated ${path.slice(root.length + 1)}`);
}

const apiEnv = resolve(root, "apps/api/.env");
const webEnv = resolve(root, "apps/web/.env.local");

if (!existsSync(apiEnv)) {
  writeFileSync(
    apiEnv,
    [
      "PORT=4000",
      "HOST=127.0.0.1",
      "DATABASE_URL=postgres://bluebird_app:bluebird_dev_password@127.0.0.1:5432/bluebird",
      "DATABASE_ADMIN_URL=postgres://postgres:postgres@127.0.0.1:5432/bluebird",
      "TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bluebird_test",
      "MODEL_PROVIDER=ollama",
      "OLLAMA_URL=http://127.0.0.1:11434",
      "ATTACHMENTS_DIR=.data/attachments",
      "",
    ].join("\n"),
  );
  console.log("created apps/api/.env");
}

upsertEnv(apiEnv, { BLUEBIRD_SERVICE_PUBLIC_KEYS: JSON.stringify({ [keyId]: publicJwk }) });
upsertEnv(webEnv, {
  BLUEBIRD_SERVICE_KEY_ID: keyId,
  BLUEBIRD_SERVICE_PRIVATE_JWK: b64(privateJwk),
  BLUEBIRD_API_URL: process.env.BLUEBIRD_API_URL ?? "http://127.0.0.1:4000",
});

// Seals attachment bytes at rest. Generated once and kept, since attachments
// already stored cannot be read without the key that sealed them.
if (!/^BLUEBIRD_CONTENT_KEY=.+$/m.test(readFileSync(apiEnv, "utf8"))) {
  upsertEnv(apiEnv, { BLUEBIRD_CONTENT_KEY: randomBytes(32).toString("base64") });
  console.log("generated BLUEBIRD_CONTENT_KEY");
}

console.log(`\nservice key "${keyId}" written. Next: pnpm db:up && pnpm db:migrate && pnpm dev`);
