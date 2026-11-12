// The private database: a real PostgreSQL with pgvector, kept inside the app's own data folder.
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const run = promisify(execFile);

class Postgres {
  constructor({ dir, dataDir, logDir, password }) {
    this.dir = dir;
    this.dataDir = dataDir;
    this.logFile = path.join(logDir, "postgres.log");
    this.password = password;
    this.port = 0;
    fs.mkdirSync(logDir, { recursive: true });
  }

  bin(name) {
    return path.join(this.dir, "bin", process.platform === "win32" ? `${name}.exe` : name);
  }

  /** The program's environment. The locale is pinned only while the cluster is made. */
  env(locale) {
    const env = { ...process.env };
    if (locale && locale !== "C" && process.platform !== "win32") Object.assign(env, { LC_ALL: locale, LANG: locale });
    else if (process.platform !== "win32") Object.assign(env, { LC_ALL: "C", LANG: "C" });
    return env;
  }

  get initialised() {
    return fs.existsSync(path.join(this.dataDir, "PG_VERSION"));
  }

  /** Creates the cluster the first time. */
  async init() {
    if (this.initialised) return false;
    fs.mkdirSync(path.dirname(this.dataDir), { recursive: true });
    const pwfile = path.join(path.dirname(this.dataDir), ".pgpass-init");
    fs.writeFileSync(pwfile, this.password, { mode: 0o600 });
    try {
      // Windows has no such locale names: the cluster takes the system's own.
      const locales = process.platform === "win32" ? [null] : process.platform === "darwin" ? ["en_US.UTF-8", "C"] : ["C.UTF-8", "en_US.UTF-8", "C"];
      for (const locale of locales) {
        fs.rmSync(this.dataDir, { recursive: true, force: true });
        try {
          const args = ["-D", this.dataDir, "-U", "postgres", "-A", "scram-sha-256", "--pwfile", pwfile, "-E", "UTF8"];
          if (locale) args.push(`--locale=${locale}`);
          await run(this.bin("initdb"), args, { env: this.env(locale) });
          return true;
        } catch (error) {
          if (locale === "C" || locale === null) throw error;
        }
      }
    } finally {
      fs.rmSync(pwfile, { force: true });
    }
    return true;
  }

  /** Starts the server on the given loopback port and waits until it answers. */
  async start(port) {
    this.port = port;
    // A server left over from a crash is stopped first, so the data folder is not locked.
    await this.stop().catch(() => undefined);
    await run(
      this.bin("pg_ctl"),
      [
        "-D", this.dataDir,
        "-o", `-p ${port} -c listen_addresses=127.0.0.1${process.platform === "win32" ? "" : " -c unix_socket_directories="} -c shared_buffers=128MB -c max_connections=50`,
        "-l", this.logFile,
        "-w", "-t", "60",
        "start",
      ],
      { env: this.env("C") },
    );
  }

  async stop() {
    if (!this.initialised) return;
    await run(this.bin("pg_ctl"), ["-D", this.dataDir, "-m", "fast", "-w", "-t", "30", "stop"], { env: this.env() }).catch(() => undefined);
  }

  adminUrl(database = "bluebird") {
    return `postgres://postgres:${this.password}@127.0.0.1:${this.port}/${database}`;
  }

  appUrl(appPassword, database = "bluebird") {
    return `postgres://bluebird_app:${appPassword}@127.0.0.1:${this.port}/${database}`;
  }
}

module.exports = { Postgres };
