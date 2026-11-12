// Run with the app's own Node: makes the database, applies every migration, and gives the
// app's database role its private password. Safe to run on every launch.
import pg from "pg";
import { runMigrations } from "./dist/db/migrate.js";

const { ADMIN_URL, ADMIN_DB_URL, APP_PASSWORD } = process.env;
if (!ADMIN_URL || !ADMIN_DB_URL || !APP_PASSWORD) {
  console.error("db-setup needs ADMIN_URL, ADMIN_DB_URL and APP_PASSWORD.");
  process.exit(1);
}

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
// A database made by an early version kept its old names: carry it over instead of starting empty.
const has = async (sql) => ((await admin.query(sql)).rowCount ?? 0) > 0;
if ((await has("SELECT 1 FROM pg_roles WHERE rolname = 'arya_app'")) && !(await has("SELECT 1 FROM pg_roles WHERE rolname = 'bluebird_app'"))) {
  await admin.query("ALTER ROLE arya_app RENAME TO bluebird_app");
}
if ((await has("SELECT 1 FROM pg_database WHERE datname = 'arya'")) && !(await has("SELECT 1 FROM pg_database WHERE datname = 'bluebird'"))) {
  await admin.query("ALTER DATABASE arya RENAME TO bluebird");
}
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'bluebird'");
if (exists.rowCount === 0) await admin.query("CREATE DATABASE bluebird");
await admin.end();

let applied;
try {
  applied = await runMigrations(ADMIN_DB_URL);
} catch (error) {
  // A database from a pre-release version stores its search data with an extension this app no longer
  // ships, so it cannot be opened here. Keep it aside, untouched, and start a fresh one.
  if (!/libdir\/vector/.test(String(error?.message ?? error))) throw error;
  const mover = new pg.Client({ connectionString: ADMIN_URL });
  await mover.connect();
  await mover.query(`ALTER DATABASE bluebird RENAME TO "bluebird_before_upgrade_${Date.now()}"`);
  await mover.query("CREATE DATABASE bluebird");
  await mover.end();
  applied = await runMigrations(ADMIN_DB_URL);
}

const db = new pg.Client({ connectionString: ADMIN_DB_URL });
await db.connect();
await db.query(`ALTER ROLE bluebird_app PASSWORD '${APP_PASSWORD.replace(/'/g, "''")}'`);
await db.end();
console.log(JSON.stringify({ applied }));
