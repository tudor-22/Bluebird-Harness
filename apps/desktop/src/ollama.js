// Local models: notice Ollama, install a private copy on request, run it, and fetch a starter model.
// The private copy lives in the app's own data folder, so no administrator rights are needed and
// nothing outside Bluebird is changed. An Ollama the person already has is used as it is.
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const zlib = require("node:zlib");

const URL_BASE = process.env.OLLAMA_HOST_URL || "http://127.0.0.1:11434";
const BASE = "https://ollama.com/download";
/** A small chat model and the embedding model Bluebird uses for memory. */
const STARTER_MODELS = (process.env.BLUEBIRD_STARTER_MODELS || "llama3.2,bge-m3").split(",").map((name) => name.trim()).filter(Boolean);

let home = path.join(os.homedir(), ".bluebird-ollama");
let logDir = os.tmpdir();
let started = null;

/** Where the private copy goes and where its log is written. */
function configure(options) {
  if (options.dir) home = options.dir;
  if (options.logDir) logDir = options.logDir;
}

/** The download for this computer, or null where Ollama has none. */
function asset(platform = process.platform, arch = process.arch) {
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "amd64" : null;
  if (platform === "darwin") return { file: "ollama-darwin.tgz", kind: "tgz" };
  if (!cpu) return null;
  if (platform === "win32") return { file: `ollama-windows-${cpu}.zip`, kind: "zip" };
  if (platform === "linux") return { file: `ollama-linux-${cpu}.tar.zst`, kind: "zst" };
  return null;
}

async function running() {
  try {
    const response = await fetch(`${URL_BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? (await response.json()).models ?? [] : null;
  } catch {
    return null;
  }
}

const exe = process.platform === "win32" ? "ollama.exe" : "ollama";

/** The Ollama program that can be started: the private copy, one on the PATH, or a usual install location. */
function findBinary() {
  const candidates = [path.join(home, exe), path.join(home, "bin", exe)];
  if (process.platform === "darwin") candidates.push("/Applications/Ollama.app/Contents/Resources/ollama", path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"));
  if (process.platform === "win32" && process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"));
  if (process.platform !== "win32") candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama");
  for (const dir of (process.env.PATH || "").split(path.delimiter)) if (dir) candidates.push(path.join(dir, exe));
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/** "ready" when Ollama answers, "installed" when it is there but not running, else "missing". */
async function state() {
  const models = await running();
  if (models) return { state: "ready", models: models.map((m) => m.name) };
  return { state: findBinary() ? "installed" : "missing", models: [] };
}

/** Starts the server in the background and waits until it answers. */
async function start() {
  const binary = findBinary();
  if (!binary) throw new Error("Ollama is not installed.");
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, "ollama.log"), "a");
  const child = spawn(binary, ["serve"], { stdio: ["ignore", log, log], windowsHide: true, env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" } });
  let failed = null;
  child.on("error", (error) => (failed = error));
  child.on("exit", () => {
    if (started === child) started = null;
  });
  started = child;
  for (let i = 0; i < 120; i += 1) {
    if (await running()) return;
    if (failed || child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(failed ? `Ollama could not start: ${failed.message}` : "Ollama did not start.");
}

/** Stops the Ollama this app started. One that was already running is left alone. */
function stop() {
  try {
    started?.kill();
  } catch {
    // Already gone.
  }
  started = null;
}

/** Unpacks with the system's own tar (macOS, Linux and Windows 10 and later all have one). */
function untar(file, dir, kind) {
  return new Promise((resolve, reject) => {
    const args = kind === "zst" ? ["-x", "-f", "-", "-C", dir] : ["-x", "-f", file, "-C", dir];
    const tar = spawn("tar", args, { stdio: [kind === "zst" ? "pipe" : "ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    tar.stderr.on("data", (chunk) => (err += chunk));
    tar.on("error", reject);
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Unpacking Ollama failed: ${err.trim().split("\n").pop()}`))));
    if (kind === "zst") {
      if (typeof zlib.createZstdDecompress !== "function") return reject(new Error("This build cannot unpack Ollama (no zstd)."));
      pipeline(fs.createReadStream(file), zlib.createZstdDecompress(), tar.stdin).catch(reject);
    }
  });
}

/** Downloads Ollama from its own site into the app's data folder. */
async function install(progress) {
  const pick = asset();
  if (!pick) throw new Error(`Ollama has no download for ${process.platform} ${process.arch}. Install it from ollama.com.`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bluebird-ollama-"));
  const archive = path.join(dir, pick.file);
  try {
    const response = await fetch(`${BASE}/${pick.file}`, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`The download failed (${response.status}).`);
    const total = Number(response.headers.get("content-length")) || 0;
    let done = 0;
    const body = Readable.fromWeb(response.body);
    body.on("data", (chunk) => {
      done += chunk.length;
      progress({ done, total });
    });
    await pipeline(body, fs.createWriteStream(archive));
    if (total && done !== total) throw new Error("The download was cut short. Check the connection and try again.");
    progress({ done: total, total, status: "unpacking" });
    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(home, { recursive: true });
    await untar(archive, home, pick.kind);
    const binary = findBinary();
    if (!binary || !binary.startsWith(home)) throw new Error("Ollama did not unpack where expected.");
    if (process.platform !== "win32") fs.chmodSync(binary, 0o755);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Pulls one model, reporting how far along it is. */
async function pull(name, progress) {
  const response = await fetch(`${URL_BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name, stream: true }),
  });
  if (!response.ok || !response.body) throw new Error(`Could not download ${name} (${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      progress({ done: event.completed ?? 0, total: event.total ?? 0, status: event.status });
    }
  }
}

module.exports = { state, start, stop, install, pull, configure, asset, findBinary, STARTER_MODELS };
