import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for bytes at rest (attachments in Postgres and on the
 * disk mirror). AES-256-GCM with a random IV per payload; the stored format
 * is "bluebird:v1:" | iv (12) | tag (16) | ciphertext. The key lives only in the
 * API's environment, so a database dump or a stolen disk alone reveals
 * nothing. This is encryption at rest, not end-to-end: the API must decrypt
 * to serve the owner and to feed the model.
 */

const PREFIX = "bluebird:v1:";
/** The prefix written by the first versions. Still read, so content sealed then can be opened; never written. */
const LEGACY_PREFIX = "arya:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function contentKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.BLUEBIRD_CONTENT_KEY;
  if (!raw) throw new Error("BLUEBIRD_CONTENT_KEY is not set (32 base64-encoded bytes).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BLUEBIRD_CONTENT_KEY must decode to 32 bytes.");
  cachedKey = key;
  return key;
}

function prefixOf(payload: Buffer): string | null {
  for (const prefix of [PREFIX, LEGACY_PREFIX]) {
    if (payload.length >= prefix.length && payload.subarray(0, prefix.length).toString("utf8") === prefix) return prefix;
  }
  return null;
}

export function isEncryptedContent(payload: Buffer): boolean {
  return prefixOf(payload) !== null;
}

export function encryptContent(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", contentKey(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from(PREFIX, "utf8"), iv, cipher.getAuthTag(), body]);
}

/** Decrypts sealed content; legacy plaintext passes through untouched. */
export function decryptContent(stored: Buffer): Buffer {
  const prefix = prefixOf(stored);
  if (prefix === null) return stored;
  const iv = stored.subarray(prefix.length, prefix.length + IV_BYTES);
  const tag = stored.subarray(prefix.length + IV_BYTES, prefix.length + IV_BYTES + TAG_BYTES);
  const body = stored.subarray(prefix.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", contentKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
