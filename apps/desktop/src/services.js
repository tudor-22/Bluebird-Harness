// Starts Bluebird's two programs (the API and the web page) with the app's own Node.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

async function waitFor(url, { seconds = 60, ok = (r) => r.status < 500 } = {}) {
  const until = Date.now() + seconds * 1000;
  let last = "";
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
      if (ok(response)) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${url} did not answer (${last}).`);
}

/**
 * The program that runs the API and the web page. The app's own executable would show a second
 * Dock icon for each one, so the packaged app uses its Helper, which has no Dock presence.
 */
function nodeBinary() {
  if (process.platform !== "darwin") return process.execPath;
  const macos = path.dirname(process.execPath);
  const helper = path.join(macos, "..", "Frameworks", `${path.basename(process.execPath)} Helper.app`, "Contents", "MacOS", `${path.basename(process.execPath)} Helper`);
  return fs.existsSync(helper) ? helper : process.execPath;
}

function child(name, args, options, logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, `${name}.log`), "a");
  const proc = spawn(nodeBinary(), args, {
    ...options,
    env: { ...options.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", out, out],
  });
  proc.name = name;
  return proc;
}

/** The environment shared by both programs. */
function sharedEnv() {
  return { ...process.env, NODE_ENV: "production" };
}

class Services {
  constructor({ layout, config, database, ports }) {
    this.layout = layout;
    this.config = config;
    this.database = database;
    this.ports = ports;
    this.children = [];
    this.exited = [];
  }

  get webUrl() {
    return `http://localhost:${this.ports.web}`;
  }

  /** Makes the database and applies migrations. Returns the migrations just applied. */
  migrate() {
    const { layout, database, config } = this;
    return new Promise((resolve, reject) => {
      const proc = spawn(nodeBinary(), [path.join(layout.api, "db-setup.mjs")], {
        cwd: layout.api,
        env: {
          ...sharedEnv(),
          ELECTRON_RUN_AS_NODE: "1",
          ADMIN_URL: database.adminUrl("postgres"),
          ADMIN_DB_URL: database.adminUrl("bluebird"),
          APP_PASSWORD: config.dbAppPassword,
        },
      });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => (out += d));
      proc.stderr.on("data", (d) => (err += d));
      proc.on("close", (code) => {
        if (code !== 0) return reject(new Error(`Setting up the database failed: ${err.trim().split("\n").slice(-3).join(" ")}`));
        try {
          resolve(JSON.parse(out.trim().split("\n").pop()).applied ?? []);
        } catch {
          resolve([]);
        }
      });
    });
  }

  async start() {
    const { layout, config, database, ports } = this;
    fs.mkdirSync(layout.attachments, { recursive: true });
    const api = child("api", [path.join(layout.api, "dist", "index.js")], {
      cwd: layout.api,
      env: {
        ...sharedEnv(),
        PORT: String(ports.api),
        HOST: "127.0.0.1",
        DATABASE_URL: database.appUrl(config.dbAppPassword),
        WEB_ORIGINS: `http://localhost:${ports.web},http://127.0.0.1:${ports.web}`,
        BLUEBIRD_SERVICE_PUBLIC_KEYS: JSON.stringify({ [config.keyId]: config.publicJwk }),
        BLUEBIRD_CONTENT_KEY: config.contentKey,
        BLUEBIRD_SETTINGS_FILE: layout.settingsFile,
        ATTACHMENTS_DIR: layout.attachments,
        MODEL_PROVIDER: "ollama",
      },
    }, layout.logs);
    const web = child("web", [path.join(layout.web, "apps", "web", "server.js")], {
      cwd: path.join(layout.web, "apps", "web"),
      env: {
        ...sharedEnv(),
        PORT: String(ports.web),
        HOSTNAME: "127.0.0.1",
        BLUEBIRD_API_URL: `http://127.0.0.1:${ports.api}`,
        BLUEBIRD_SERVICE_KEY_ID: config.keyId,
        BLUEBIRD_SERVICE_PRIVATE_JWK: b64(config.privateJwk),
      },
    }, layout.logs);
    for (const proc of [api, web]) {
      proc.on("exit", (code) => this.exited.push({ name: proc.name, code }));
      this.children.push(proc);
    }
    await waitFor(`http://127.0.0.1:${ports.api}/health`, { seconds: 45, ok: (r) => r.status < 500 });
    await waitFor(`${this.webUrl}/chat`, { seconds: 60, ok: (r) => r.status < 500 });
  }

  stop() {
    for (const proc of this.children) {
      try {
        proc.kill();
      } catch {
        // Already gone.
      }
    }
    this.children = [];
  }
}

module.exports = { Services, waitFor, nodeBinary };
