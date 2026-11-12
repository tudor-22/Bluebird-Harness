import { createRequire } from "node:module"; import fs from "node:fs"; import os from "node:os";
const { Client } = createRequire("/Users/tudor/Documents/GitHub/Bluebird-Harness/apps/api/package.json")("pg");
const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/Bluebird/data/desktop.json`, "utf8"));
const c = new Client({ host: "127.0.0.1", port: 49159, user: "postgres", password: cfg.dbPassword, database: "bluebird" }); await c.connect();
const count = async () => { const o = {}; for (const t of ["messages","memories","day_summaries","attachments","jobs","agent_sessions"]) o[t] = (await c.query(`select count(*) from ${t}`)).rows[0].count; return o; };
console.log("before", await count());
if (process.argv[2] === "wipe") {
  await c.query("BEGIN");
  for (const t of ["messages","memories","day_summaries","attachments","jobs","agent_sessions"]) await c.query(`delete from ${t}`);
  await c.query("COMMIT"); console.log("after", await count());
}
await c.end();
