import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import {
  attachmentKindForMime,
  isTextMime,
  audioFormatForMime,
  type Attachment,
  type AttachmentKind,
} from "@bluebird/shared";
import { env } from "../env";
import type { Db } from "../db/pool";
import { withUser } from "../db/pool";
import type { ModelContentPart } from "../model/types";
import { decryptContent, encryptContent } from "./crypto";

export type AttachmentRecord = {
  id: string;
  kind: AttachmentKind;
  mime: string;
  filename: string;
  size_bytes: number | string;
  created_at: Date | string;
  storage_path: string;
  message_id: string | null;
};

export class UnsupportedAttachmentError extends Error {}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/webm": "webm",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "application/pdf": "pdf",
};

/** One document cannot eat the whole context window. */
export const PDF_TEXT_LIMIT = 24_000;
/** A text file or folder bundle gets a larger share, as code is dense and rarely padded. */
export const TEXT_FILE_LIMIT = 100_000;

/** Plain text of a PDF, clipped so a long report stays within budget. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const body = String(text ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body.length <= PDF_TEXT_LIMIT) return body;
  return `${body.slice(0, PDF_TEXT_LIMIT)}\n\n[The rest of this document was truncated.]`;
}

export function toAttachment(row: AttachmentRecord): Attachment {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Stores the bytes on disk and registers the row for the signed-in user. */
export async function saveAttachment(
  pool: Db,
  userId: string,
  file: { mime: string; filename: string; buffer: Buffer },
): Promise<Attachment> {
  const kind = attachmentKindForMime(file.mime);
  if (!kind) throw new UnsupportedAttachmentError(`Unsupported attachment type: ${file.mime}`);

  const id = randomUUID();
  const extension = EXTENSIONS[file.mime] ?? "bin";
  const directory = path.resolve(env.attachmentsDir, userId);
  const storagePath = path.join(directory, `${id}.${extension}`);

  // Everything at rest is sealed: the row and the disk mirror both hold the
  // encrypted envelope, and only this API ever decrypts it.
  const stored = encryptContent(file.buffer);
  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, stored);

  const row = await withUser(pool, userId, async (client) => {
    const { rows } = await client.query<AttachmentRecord>(
      `INSERT INTO attachments (id, user_id, kind, mime, filename, size_bytes, storage_path, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, kind, mime, filename, size_bytes, storage_path, message_id, created_at`,
      [id, userId, kind, file.mime, file.filename, file.buffer.byteLength, storagePath, stored],
    );
    return rows[0];
  });

  return toAttachment(row);
}

export async function getAttachmentRecord(
  pool: Db,
  userId: string,
  attachmentId: string,
): Promise<AttachmentRecord | null> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<AttachmentRecord>(
      `SELECT id, kind, mime, filename, size_bytes, storage_path, message_id, created_at
         FROM attachments
        WHERE id = $1 AND user_id = $2`,
      [attachmentId, userId],
    );
    return rows[0] ?? null;
  });
}

export async function deleteAttachment(
  pool: Db,
  userId: string,
  attachmentId: string,
): Promise<"deleted" | "attached" | "missing"> {
  const row = await getAttachmentRecord(pool, userId, attachmentId);
  if (!row) return "missing";
  if (row.message_id) return "attached";

  await withUser(pool, userId, async (client) => {
    await client.query("DELETE FROM attachments WHERE id = $1 AND user_id = $2", [
      attachmentId,
      userId,
    ]);
  });
  await unlink(row.storage_path).catch(() => undefined);
  return "deleted";
}

/** The stored bytes exactly as kept at rest, sealed. */
export async function readStoredBytes(
  pool: Db,
  userId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ content: Buffer | null }>(
      "SELECT content FROM attachments WHERE id = $1 AND user_id = $2",
      [attachmentId, userId],
    );
    return rows[0]?.content ?? null;
  });
}

/** The plaintext bytes for the owner; legacy unsealed rows pass through. */
export async function readAttachmentBytes(
  pool: Db,
  userId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  const stored = await readStoredBytes(pool, userId, attachmentId);
  return stored ? decryptContent(stored) : null;
}

/** Rebuilds a missing file from the database copy. */
export async function restoreAttachmentFile(
  pool: Db,
  userId: string,
  record: AttachmentRecord,
): Promise<boolean> {
  const bytes = await readStoredBytes(pool, userId, record.id);
  if (!bytes || bytes.byteLength === 0) return false;
  await mkdir(path.dirname(record.storage_path), { recursive: true });
  await writeFile(record.storage_path, bytes);
  return true;
}

/**
 * Turns a stored attachment into the content part the model expects.
 * `loadFallback` returns the sealed row bytes for the self-heal path.
 */
export async function attachmentToModelPart(
  row: AttachmentRecord,
  loadFallback?: (attachment: AttachmentRecord) => Promise<Buffer | null>,
): Promise<ModelContentPart> {
  let bytes: Buffer;
  try {
    bytes = decryptContent(await readFile(row.storage_path));
  } catch (error) {
    // The disk mirror is gone: rebuild it from the sealed row and read on.
    const fallback = loadFallback ? await loadFallback(row) : null;
    if (!fallback) throw error;
    bytes = decryptContent(fallback);
    await mkdir(path.dirname(row.storage_path), { recursive: true })
      .then(() => writeFile(row.storage_path, fallback))
      .catch(() => undefined);
  }

  if (row.kind === "image") {
    return {
      type: "image_url",
      image_url: { url: `data:${row.mime};base64,${bytes.toString("base64")}` },
    };
  }

  // Text, code and folder bundles are read as they are, so any model can use them.
  if (row.kind === "document" && isTextMime(row.mime)) {
    const text = bytes.toString("utf8");
    const clipped =
      text.length <= TEXT_FILE_LIMIT
        ? text
        : `${text.slice(0, TEXT_FILE_LIMIT)}\n\n[The rest of this file was truncated.]`;
    return { type: "text", text: `[Attached file: ${row.filename}]\n${clipped}` };
  }

  // PDFs cannot go to the model as bytes: hand it the text instead so it can
  // read, quote and reason over the document.
  if (row.kind === "document") {
    try {
      const text = await extractPdfText(bytes);
      return {
        type: "text",
        text: `[Attached PDF: ${row.filename}]\n${
          text || "No extractable text was found in this PDF."
        }`,
      };
    } catch {
      return {
        type: "text",
        text: `[Attached PDF: ${row.filename}, but its text could not be extracted.]`,
      };
    }
  }

  // Audio goes in as raw base64 (no data: prefix) with an explicit format.
  return {
    type: "input_audio",
    input_audio: { data: bytes.toString("base64"), format: audioFormatForMime(row.mime) },
  };
}
