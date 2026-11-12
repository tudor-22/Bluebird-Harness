import {
  DEFAULT_CONVERSATION_TITLE,
  type Conversation,
  type ConversationMode,
} from "@bluebird/shared";
import type { DbClient } from "../db/pool";

type ConversationRow = {
  id: string;
  title: string;
  mode: ConversationMode;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

const SELECT_COLUMNS = "id, title, mode, created_at, updated_at, archived_at";

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
  };
}

export async function createConversation(
  client: DbClient,
  userId: string,
  mode: ConversationMode = "chat",
): Promise<Conversation> {
  const { rows } = await client.query<ConversationRow>(
    `INSERT INTO conversations (user_id, mode)
     VALUES ($1, $2)
     RETURNING ${SELECT_COLUMNS}`,
    [userId, mode],
  );
  return toConversation(rows[0]);
}

export async function listConversations(
  client: DbClient,
  userId: string,
  limit = 60,
): Promise<Conversation[]> {
  const { rows } = await client.query<ConversationRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM conversations
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY updated_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toConversation);
}

export async function getConversation(
  client: DbClient,
  userId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const { rows } = await client.query<ConversationRow>(
    `SELECT ${SELECT_COLUMNS} FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function updateConversation(
  client: DbClient,
  userId: string,
  conversationId: string,
  patch: { title?: string; archived?: boolean },
): Promise<Conversation | null> {
  const params: unknown[] = [userId, conversationId];
  const sets: string[] = [];

  if (patch.title !== undefined) {
    params.push(patch.title);
    sets.push(`title = $${params.length}`);
  }
  if (patch.archived !== undefined) {
    sets.push(patch.archived ? "archived_at = now()" : "archived_at = NULL");
  }
  sets.push("updated_at = now()");

  const { rows } = await client.query<ConversationRow>(
    `UPDATE conversations
        SET ${sets.join(", ")}
      WHERE id = $2 AND user_id = $1
      RETURNING ${SELECT_COLUMNS}`,
    params,
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function deleteConversation(
  client: DbClient,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    "DELETE FROM conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Names a conversation from its first user message, if still unnamed. */
export async function maybeAutoTitle(
  client: DbClient,
  conversationId: string,
  firstContent: string,
  maxLength = 80,
): Promise<void> {
  const title = firstContent.replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (!title) return;
  await client.query(
    `UPDATE conversations
        SET title = $2, updated_at = now()
      WHERE id = $1 AND title = $3`,
    [conversationId, title, DEFAULT_CONVERSATION_TITLE],
  );
}
