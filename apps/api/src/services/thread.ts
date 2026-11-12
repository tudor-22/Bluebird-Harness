import { unlink } from "node:fs/promises";

import type { Conversation } from "@bluebird/shared";
import type { DbClient } from "../db/pool";
import { toConversation } from "./conversations";

type ConversationRow = {
  id: string;
  title: string;
  mode: "chat" | "work";
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

const SELECT_COLUMNS = "id, title, mode, created_at, updated_at, archived_at";

/**
 * Bluebird keeps one continuous thread per user — the single place every message
 * is stored. Created on first use, then reused forever.
 */
export async function getOrCreateThread(
  client: DbClient,
  userId: string,
): Promise<Conversation> {
  const existing = await client.query<ConversationRow>(
    `SELECT ${SELECT_COLUMNS} FROM conversations WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) return toConversation(existing.rows[0]);

  const inserted = await client.query<ConversationRow>(
    `INSERT INTO conversations (user_id, title, mode)
     VALUES ($1, 'Thread', 'chat')
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${SELECT_COLUMNS}`,
    [userId],
  );
  if (inserted.rows[0]) return toConversation(inserted.rows[0]);

  const raced = await client.query<ConversationRow>(
    `SELECT ${SELECT_COLUMNS} FROM conversations WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return toConversation(raced.rows[0]);
}

/**
 * Clears the whole thread: messages, attachments and their disk mirrors, day
 * summaries, memories and agent sessions. The empty thread row remains, so the
 * next visit starts in the same place with a clean slate.
 */
export async function deleteThread(client: DbClient, userId: string): Promise<void> {
  // Capture the disk mirrors before the attachment rows cascade away.
  const { rows } = await client.query<{ storage_path: string }>(
    "SELECT storage_path FROM attachments WHERE user_id = $1",
    [userId],
  );
  await client.query("DELETE FROM attachments WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM messages WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM day_summaries WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM memories WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM agent_sessions WHERE user_id = $1", [userId]);
  // The greeting claim and rolling summary belong to the cleared thread too.
  await client.query(
    "UPDATE conversations SET metadata = '{}'::jsonb, updated_at = now() WHERE user_id = $1",
    [userId],
  );
  await Promise.all(
    rows.map((row) => unlink(row.storage_path).catch(() => undefined)),
  );
}
