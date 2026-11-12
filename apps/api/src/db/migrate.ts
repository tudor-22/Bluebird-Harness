import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations", import.meta.url));

/** Applies every unapplied .sql file in db/migrations, in name order. */
export async function runMigrations(connectionString: string): Promise<string[]> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  const applied: string[] = [];

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const seen = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if ((seen.rowCount ?? 0) > 0) continue;

      const sql = readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        applied.push(version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  return applied;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_ADMIN_URL (preferred) or DATABASE_URL before migrating.");
    process.exit(1);
  }
  runMigrations(url)
    .then((applied) => {
      console.log(applied.length > 0 ? `applied: ${applied.join(", ")}` : "already up to date");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
