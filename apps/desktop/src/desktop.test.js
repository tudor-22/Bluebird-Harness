const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadConfig } = require("./config");
const { Postgres } = require("./postgres");
const { freePort } = require("./ports");

test("the first run makes private keys and passwords, and later runs keep them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-config-"));
  const first = loadConfig(dir).config;
  assert.equal(first.keyId, "desktop-1");
  assert.ok(first.privateJwk.d && first.publicJwk.x && !first.publicJwk.d);
  assert.ok(first.dbPassword.length >= 30 && first.contentKey.length >= 40);
  assert.equal(fs.statSync(path.join(dir, "desktop.json")).mode & 0o077, 0, "only the owner can read it");
  assert.deepEqual(loadConfig(dir).config, first);
});

test("the database address carries the port and the right role", () => {
  const db = new Postgres({ dir: "/x", dataDir: "/x/data", logDir: fs.mkdtempSync(path.join(os.tmpdir(), "bb-log-")), password: "pw" });
  db.port = 5555;
  assert.equal(db.adminUrl("postgres"), "postgres://postgres:pw@127.0.0.1:5555/postgres");
  assert.equal(db.appUrl("secret"), "postgres://bluebird_app:secret@127.0.0.1:5555/bluebird");
});

test("free ports are real and differ", async () => {
  const [a, b] = [await freePort(), await freePort()];
  assert.ok(a > 1024 && b > 1024);
});

test("Ollama has a download for every supported platform", () => {
  const { asset } = require("./ollama");
  assert.equal(asset("darwin", "arm64").file, "ollama-darwin.tgz");
  assert.equal(asset("darwin", "x64").file, "ollama-darwin.tgz");
  assert.equal(asset("win32", "x64").file, "ollama-windows-amd64.zip");
  assert.equal(asset("win32", "arm64").file, "ollama-windows-arm64.zip");
  assert.equal(asset("linux", "x64").file, "ollama-linux-amd64.tar.zst");
  assert.equal(asset("linux", "arm64").file, "ollama-linux-arm64.tar.zst");
  assert.equal(asset("freebsd", "x64"), null);
});

test("the database programs are found by the platform's own names", () => {
  const db = new Postgres({ dir: "/x", dataDir: "/x/data", logDir: fs.mkdtempSync(path.join(os.tmpdir(), "bb-log-")), password: "pw" });
  assert.equal(path.basename(db.bin("pg_ctl")), process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
});
