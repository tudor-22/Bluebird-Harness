import {
  type Attachment,
  type Message,
  type MessageRole,
} from "@bluebird/shared";
import type { DbClient } from "../db/pool";
import { attachmentToModelPart, toAttachment, type AttachmentRecord } from "./attachments";
import type { ModelContentPart, ModelMessage } from "../model/types";

type MessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
  metadata: Record<string, unknown>;
};

export type HistoryRow = MessageRow & {
  attachments: AttachmentRecord[] | null;
  seq?: number;
};

export class UnavailableAttachmentsError extends Error {
  constructor() {
    super("One or more attachments are missing or already used.");
  }
}

export function toMessage(row: MessageRow, attachments: AttachmentRecord[]): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    attachments: attachments.map(toAttachment),
    createdAt: row.created_at.toISOString(),
    metadata: row.metadata,
  };
}

const MESSAGE_COLUMNS = "id, conversation_id, role, content, created_at, metadata";

const ATTACHMENT_JSON = `COALESCE(json_agg(json_build_object(
    'id', a.id, 'kind', a.kind, 'mime', a.mime, 'filename', a.filename,
    'size_bytes', a.size_bytes, 'storage_path', a.storage_path,
    'message_id', a.message_id, 'created_at', a.created_at
  ) ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL), '[]')`;

/** The newest stretch of the thread, oldest first: what the UI lists. */
export async function listMessages(
  client: DbClient,
  userId: string,
  conversationId: string,
  limit = 1000,
): Promise<Message[]> {
  const { rows } = await client.query<HistoryRow>(
    `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, m.metadata,
            ${ATTACHMENT_JSON} AS attachments
       FROM (
         SELECT * FROM messages
          WHERE conversation_id = $1 AND user_id = $2
          ORDER BY created_at DESC, seq DESC
          LIMIT $3
       ) m
       LEFT JOIN attachments a ON a.message_id = m.id
      GROUP BY m.id, m.seq, m.conversation_id, m.role, m.content, m.created_at, m.metadata
      ORDER BY m.created_at ASC, m.seq ASC`,
    [conversationId, userId, limit],
  );
  return rows.map((row) => toMessage(row, row.attachments ?? []));
}

export async function createUserMessage(
  client: DbClient,
  userId: string,
  conversationId: string,
  content: string,
  attachmentIds: string[],
  metadata: Record<string, unknown> = {},
): Promise<Message> {
  const { rows } = await client.query<MessageRow>(
    `INSERT INTO messages (conversation_id, user_id, role, content, metadata)
     VALUES ($1, $2, 'user', $3, $4::jsonb)
     RETURNING ${MESSAGE_COLUMNS}`,
    [conversationId, userId, content, JSON.stringify(metadata)],
  );
  const message = rows[0];

  let attachments: AttachmentRecord[] = [];
  if (attachmentIds.length > 0) {
    const claimed = await client.query<AttachmentRecord>(
      `UPDATE attachments
          SET message_id = $1, conversation_id = $2
        WHERE id = ANY($3::uuid[]) AND user_id = $4 AND message_id IS NULL
        RETURNING id, kind, mime, filename, size_bytes, storage_path, message_id, created_at`,
      [message.id, conversationId, attachmentIds, userId],
    );
    if ((claimed.rowCount ?? 0) !== attachmentIds.length) {
      throw new UnavailableAttachmentsError();
    }
    attachments = claimed.rows;
  }

  return toMessage(message, attachments);
}

/** Stores the transcripts of the audio in a user message (pre-pass results). */
export async function saveMessageTranscripts(
  client: DbClient,
  userId: string,
  messageId: string,
  transcripts: string[],
): Promise<void> {
  await client.query(
    `UPDATE messages
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{transcripts}', $3::jsonb)
      WHERE id = $1 AND user_id = $2`,
    [messageId, userId, JSON.stringify(transcripts)],
  );
}

export async function saveMessageImageNotes(
  client: DbClient,
  userId: string,
  messageId: string,
  notes: string[],
): Promise<void> {
  await client.query(
    `UPDATE messages
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{imageNotes}', $3::jsonb)
      WHERE id = $1 AND user_id = $2`,
    [messageId, userId, JSON.stringify(notes)],
  );
}

export async function startAssistantMessage(
  client: DbClient,
  userId: string,
  conversationId: string,
): Promise<Message> {
  const { rows } = await client.query<MessageRow>(
    `INSERT INTO messages (conversation_id, user_id, role, content, metadata)
     VALUES ($1, $2, 'assistant', '', '{"status": "streaming"}'::jsonb)
     RETURNING ${MESSAGE_COLUMNS}`,
    [conversationId, userId],
  );
  return toMessage(rows[0], []);
}

/** Stores a finished assistant message (used by greetings and future jobs). */
export async function createAssistantMessage(
  client: DbClient,
  userId: string,
  conversationId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<Message> {
  const { rows } = await client.query<MessageRow>(
    `INSERT INTO messages (conversation_id, user_id, role, content, metadata)
     VALUES ($1, $2, 'assistant', $3, $4::jsonb)
     RETURNING ${MESSAGE_COLUMNS}`,
    [conversationId, userId, content, JSON.stringify(metadata)],
  );
  return toMessage(rows[0], []);
}

export async function finishAssistantMessage(
  client: DbClient,
  userId: string,
  messageId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<Message | null> {
  const { rows } = await client.query<MessageRow>(
    `UPDATE messages
        SET content = $3, metadata = $4::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING ${MESSAGE_COLUMNS}`,
    [messageId, userId, content, JSON.stringify(metadata)],
  );
  return rows[0] ? toMessage(rows[0], []) : null;
}

export async function touchConversation(
  client: DbClient,
  conversationId: string,
): Promise<void> {
  await client.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [
    conversationId,
  ]);
}

/** The most recent stretch of the thread, oldest first, with attachments. */
export async function loadRecentMessages(
  client: DbClient,
  userId: string,
  conversationId: string,
  limit = 60,
  afterSeq = 0,
): Promise<HistoryRow[]> {
  const { rows } = await client.query<HistoryRow>(
    `SELECT m.id, m.seq, m.conversation_id, m.role, m.content, m.created_at, m.metadata,
            ${ATTACHMENT_JSON} AS attachments
       FROM (
         SELECT * FROM messages
          WHERE conversation_id = $1 AND user_id = $2 AND role IN ('user', 'assistant')
            AND seq > $4
          ORDER BY created_at DESC, seq DESC
          LIMIT $3
       ) m
       LEFT JOIN attachments a ON a.message_id = m.id
      GROUP BY m.id, m.seq, m.conversation_id, m.role, m.content, m.created_at, m.metadata
      ORDER BY m.created_at ASC, m.seq ASC`,
    [conversationId, userId, limit, afterSeq],
  );
  return rows;
}

/** Turns stored rows into model messages (the platform prompt is separate). */
/**
 * `2026-10-09 21:04` in the person's own timezone, so the model can answer
 * questions about when something was said instead of guessing.
 */
export function formatLocalStamp(value: Date | string, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

export async function toModelMessages(
  rows: HistoryRow[],
  options: {
    timeZone?: string;
    /** The current model can listen to audio files. */
    audioSupported?: boolean;
    loadAttachment?: (attachment: AttachmentRecord) => Promise<Buffer | null>;
  } = {},
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  for (const row of rows) {
    const pending = row.role === "assistant" && row.content === "" && row.metadata?.status === "streaming";
    if (pending) continue;

    // Only their own messages carry the marker, and it trails the text: a
    // leading stamp teaches the model to start its replies with a timestamp.
    const stamp =
      options.timeZone && row.role === "user"
        ? formatLocalStamp(row.created_at, options.timeZone)
        : "";
    const attachments = row.attachments ?? [];
    if (attachments.length > 0 && row.role === "user") {
      const parts: ModelContentPart[] = [];
      if (row.content.trim()) parts.push({ type: "text", text: row.content });
      const transcripts = Array.isArray(row.metadata?.transcripts)
        ? (row.metadata.transcripts as string[]).filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
          )
        : [];
      // Images are grounded in a thinking-off pre-pass: with thinking on this
      // build answers "I don't see an image" when an image is in the request.
      const imageNotes = Array.isArray(row.metadata?.imageNotes)
        ? (row.metadata.imageNotes as unknown[]).map((entry) =>
            typeof entry === "string" ? entry : "",
          )
        : [];
      let imageIndex = 0;
      for (const attachment of attachments) {
        // Audio goes to the model only if it can listen; otherwise it is
        // left out and the note below says so.
        if (attachment.kind === "audio" && !options.audioSupported) continue;
        if (attachment.kind === "image") {
          const note = imageNotes[imageIndex]?.trim();
          imageIndex += 1;
          if (note) continue;
        }
        parts.push(await attachmentToModelPart(attachment, options.loadAttachment));
      }
      const described = imageNotes.map((note) => note.trim()).filter(Boolean);
      if (described.length > 0) {
        parts.push({
          type: "text",
          text: `[What the images they sent show: ${described.join(" ")}]`,
        });
      }
      if (transcripts.length > 0) {
        parts.push({
          type: "text",
          text: `[Transcription of the audio they sent: ${transcripts.join(" ")}]`,
        });
      } else if (
        !options.audioSupported &&
        attachments.some((attachment) => attachment.kind === "audio")
      ) {
        parts.push({
          type: "text",
          text: "[They attached an audio file, but the current model cannot listen to audio.]",
        });
      }
      if (stamp) parts.push({ type: "text", text: `(sent ${stamp})` });
      messages.push({ role: row.role, content: parts });
    } else {
      messages.push({
        role: row.role,
        content: stamp ? `${row.content} (sent ${stamp})` : row.content,
      });
    }
  }
  return messages;
}
