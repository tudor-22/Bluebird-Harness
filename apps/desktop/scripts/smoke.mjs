// Starts the built app (or the sources) in smoke mode with a fresh data folder, and passes only if the
// database, API and web page all come up. Usage: node scripts/smoke.mjs [path-to-app-executable]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = mkdtempSync(join(tmpdir(), "bluebird-smoke-"));
const exe = process.argv[2] ?? createRequire(join(desktop, "package.json"))("electron");
const args = process.argv[2] ? [`--user-data-dir=${data}`] : [desktop, `--user-data-dir=${data}`];
const child = spawn(exe, args, { env: { ...process.env, BLUEBIRD_SMOKE: "1", BLUEBIRD_SKIP_MODELS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const timer = setTimeout(() => child.kill(), 240_000);
child.on("close", (code) => {
  clearTimeout(timer);
  try {
    rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // A helper still writing as the app quits; the folder is in the temp area and harmless.
  }
  const ok = /BLUEBIRD_SMOKE_OK/.test(out);
  console.log(out.split("\n").filter((l) => /BLUEBIRD_SMOKE/.test(l)).join("\n") || out.slice(-2000));
  process.exit(ok ? 0 : 1);
});
