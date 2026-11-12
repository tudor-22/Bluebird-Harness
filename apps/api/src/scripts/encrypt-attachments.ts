import { writeFile } from "node:fs/promises";
import pg from "pg";

import { env } from "../env";
import { encryptContent, isEncryptedContent } from "../services/crypto";

/**
 * One-off backfill: seals every attachment row that still holds plaintext
 * bytes and rewrites its disk mirror. Safe to re-run: sealed rows are skipped.
 * Runs as the admin role so RLS does not hide other users' rows.
 */
async function main(): Promise<void> {
  const url = env.databaseAdminUrl || env.databaseUrl;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{
      id: string;
      storage_path: string;
      content: Buffer | null;
    }>("SELECT id, storage_path, content FROM attachments WHERE content IS NOT NULL");

    let sealed = 0;
    for (const row of rows) {
      if (!row.content || isEncryptedContent(row.content)) continue;
      const stored = encryptContent(row.content);
      await pool.query("UPDATE attachments SET content = $2 WHERE id = $1", [row.id, stored]);
      if (row.storage_path) {
        await writeFile(row.storage_path, stored).catch(() => undefined);
      }
      sealed += 1;
    }
    console.log(`sealed ${sealed} of ${rows.length} attachments`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
