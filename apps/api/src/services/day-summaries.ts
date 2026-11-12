import type { Db, DbClient } from "../db/pool";
import { withUser } from "../db/pool";
import type { ModelProvider } from "../model/types";
import { sanitizeAssistantText } from "../model/sanitize";

const MAX_DAYS_PER_RUN = 3;
const MAX_MESSAGES_PER_DAY = 80;
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_SUMMARY_CHARS = 120;

/**
 * The guard in the user turn is what makes this build label the day instead
 * of replying to the conversation it was given.
 */
const DAY_SUMMARY_GUARD =
  "Write one short line, at most 90 characters, capturing what this conversation " +
  "was mainly about. Do not reply to the conversation or give advice; only write the label.";

const DAY_SUMMARY_PROMPT = [
  "[[task]]",
  "You label a finished day in someone's private chat with their AI.",
  "In one short line, at most 90 characters, say what that day's conversation was mainly about.",
  "Plain, warm, specific language, no address to the reader, no quotes, no emoji, no lists, no em dashes.",
  "Example: Talked through music, voice notes and shipping the platform.",
].join(" ");

/** `2026-10-09` in the person's own timezone, so days turn over at their midnight. */
export function dayKeyFor(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export async function listDaySummaries(
  client: DbClient,
  userId: string,
  conversationId: string,
): Promise<Record<string, string>> {
  const { rows } = await client.query<{ day: string; summary: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, summary
       FROM day_summaries
      WHERE user_id = $1 AND conversation_id = $2`,
    [userId, conversationId],
  );
  return Object.fromEntries(rows.map((row) => [row.day, row.summary]));
}

/**
 * Writes the one-line summary for each finished day that lacks one. Runs on
 * the first session of a new day, so yesterday is labelled before it is read.
 */
export async function ensureDaySummaries(
  pool: Db,
  userId: string,
  conversationId: string,
  model: ModelProvider,
): Promise<void> {
  // Short transactions only: model calls happen between them.
  const pending = await withUser(pool, userId, async (client) => {
    const zoneRow = await client.query<{ time_zone: string | null }>(
      `SELECT metadata->'client'->>'timeZone' AS time_zone
         FROM messages
        WHERE user_id = $1 AND conversation_id = $2
          AND metadata->'client'->>'timeZone' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, conversationId],
    );
    const timeZone = zoneRow.rows[0]?.time_zone ?? "UTC";
    const today = dayKeyFor(new Date(), timeZone);
    const days = await client.query<{ day: string }>(
      `SELECT to_char((m.created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day
         FROM messages m
        WHERE m.user_id = $1 AND m.conversation_id = $2
          AND m.role IN ('user', 'assistant') AND m.content <> ''
          AND (m.created_at AT TIME ZONE $3)::date < $4::date
          AND NOT EXISTS (
            SELECT 1 FROM day_summaries d
             WHERE d.conversation_id = m.conversation_id
               AND d.day = (m.created_at AT TIME ZONE $3)::date
          )
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT $5`,
      [userId, conversationId, timeZone, today, MAX_DAYS_PER_RUN],
    );
    return { timeZone, days: days.rows.map((row) => row.day) };
  });

  for (const day of pending.days) {
    const dayMessages = await withUser(pool, userId, async (client) => {
      const rows = await client.query<{ role: string; content: string }>(
        `SELECT role, content
           FROM messages
          WHERE user_id = $1 AND conversation_id = $2
            AND role IN ('user', 'assistant') AND content <> ''
            AND (created_at AT TIME ZONE $3)::date = $4::date
          ORDER BY created_at ASC
          LIMIT $5`,
        [userId, conversationId, pending.timeZone, day, MAX_MESSAGES_PER_DAY],
      );
      return rows.rows;
    });
    if (dayMessages.length === 0) continue;

    const transcript = dayMessages
      .map(
        (row) =>
          `${row.role === "user" ? "User" : "Assistant"}: ${row.content.replace(/\s+/g, " ").slice(0, 240)}`,
      )
      .join("\n")
      .slice(0, MAX_TRANSCRIPT_CHARS);

    let summary = "";
    try {
      const raw = await model.complete({
        messages: [
          { role: "system", content: DAY_SUMMARY_PROMPT },
          { role: "user", content: `${DAY_SUMMARY_GUARD}\n\n${transcript}` },
        ],
        thinking: false,
        maxTokens: 200,
      });
      summary = sanitizeAssistantText(raw).replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY_CHARS);
    } catch {
      continue;
    }
    if (!summary) continue;

    await withUser(pool, userId, async (client) => {
      await client.query(
        `INSERT INTO day_summaries (user_id, conversation_id, day, summary)
         VALUES ($1, $2, $3::date, $4)
         ON CONFLICT (conversation_id, day)
         DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()`,
        [userId, conversationId, day, summary],
      );
    });
  }
}
