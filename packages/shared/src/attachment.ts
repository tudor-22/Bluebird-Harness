import { z } from "zod";

export const attachmentKindSchema = z.enum(["image", "audio", "document"]);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const ALLOWED_AUDIO_MIME = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
  "audio/x-flac",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
] as const;
export const ALLOWED_DOCUMENT_MIME = ["application/pdf"] as const;

/** Plain-text formats, read by name so every model can use them, vision or not. */
const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown", markdown: "text/markdown", mdx: "text/markdown",
  csv: "text/csv", tsv: "text/tab-separated-values",
  json: "application/json", jsonl: "application/json",
  xml: "application/xml", html: "text/html", htm: "text/html", svg: "text/plain",
  yaml: "text/plain", yml: "text/plain", toml: "text/plain", ini: "text/plain",
  txt: "text/plain", log: "text/plain", env: "text/plain", conf: "text/plain",
  js: "text/plain", jsx: "text/plain", ts: "text/plain", tsx: "text/plain", mjs: "text/plain", cjs: "text/plain",
  py: "text/plain", rb: "text/plain", go: "text/plain", rs: "text/plain", java: "text/plain", kt: "text/plain",
  swift: "text/plain", c: "text/plain", h: "text/plain", cc: "text/plain", cpp: "text/plain", hpp: "text/plain",
  cs: "text/plain", php: "text/plain", sh: "text/plain", zsh: "text/plain", bash: "text/plain", ps1: "text/plain",
  sql: "text/plain", css: "text/plain", scss: "text/plain", less: "text/plain", vue: "text/plain", svelte: "text/plain",
  lua: "text/plain", r: "text/plain", scala: "text/plain", dart: "text/plain", ex: "text/plain", exs: "text/plain",
  tex: "text/plain", rst: "text/plain", diff: "text/plain", patch: "text/plain", gradle: "text/plain", dockerfile: "text/plain",
};

/** The text type a file name implies, such as `src/app.ts`, or null when it is not plain text. */
export function textMimeForFilename(filename: string): string | null {
  const name = filename.split("/").pop() ?? filename;
  if (/^(dockerfile|makefile|readme|license|\.gitignore|\.npmrc)$/i.test(name)) return "text/plain";
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return extension ? (TEXT_MIME_BY_EXTENSION[extension] ?? null) : null;
}

export function isTextMime(mime: string): boolean {
  const value = mime.toLowerCase().split(";")[0].trim();
  return value.startsWith("text/") || value === "application/json" || value === "application/xml";
}

/** Tuned for the model's guidance and Vercel's ~4.5 MB request body limit. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const IMAGE_MAX_DIMENSION = 2048;

export const attachmentSchema = z.object({
  id: z.uuid(),
  kind: attachmentKindSchema,
  mime: z.string(),
  filename: z.string(),
  sizeBytes: z.number(),
  createdAt: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export function attachmentKindForMime(mime: string): AttachmentKind | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) return "image";
  if ((ALLOWED_AUDIO_MIME as readonly string[]).includes(mime)) return "audio";
  if ((ALLOWED_DOCUMENT_MIME as readonly string[]).includes(mime)) return "document";
  if (isTextMime(mime)) return "document";
  return null;
}

export type AudioFormat = "wav" | "mp3" | "m4a" | "aac" | "ogg" | "flac" | "webm" | "aiff";

/** The format name audio-capable models expect for a stored audio file. */
export function audioFormatForMime(mime: string): AudioFormat {
  const value = mime.toLowerCase();
  if (value.includes("wav") || value.includes("wave")) return "wav";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("aac")) return "aac";
  if (value.includes("ogg") || value.includes("opus")) return "ogg";
  if (value.includes("flac")) return "flac";
  if (value.includes("webm")) return "webm";
  if (value.includes("aiff")) return "aiff";
  return "mp3";
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};

/** Browsers often leave the type blank for audio files, so fall back on the extension. */
export function audioMimeForFilename(filename: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  return extension ? (AUDIO_EXTENSIONS[extension] ?? null) : null;
}

/** The file's own type, or the audio type its extension implies. */
export function resolveMime(mime: string, filename: string): string {
  // Browsers report many source files as blank or octet-stream, or as odd types such as video/mp2t for .ts.
  const text = textMimeForFilename(filename);
  if (text && !mime.startsWith("image/") && !mime.startsWith("audio/") && mime !== "application/pdf") return text;
  if (mime && mime !== "application/octet-stream") return mime;
  return audioMimeForFilename(filename) ?? mime;
}
