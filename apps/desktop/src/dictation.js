// Runs the native dictation helper for the page, one session at a time.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

class Dictation {
  constructor(root) {
    this.helper = path.join(root, "native", "dictation");
    this.proc = null;
  }

  get available() {
    return fs.existsSync(this.helper);
  }

  /** Starts listening; `send` gets each event ({type, text?, error?}). */
  start(lang, send) {
    this.stop();
    if (!this.available) {
      send({ type: "error", error: "service-not-allowed" });
      send({ type: "end" });
      return;
    }
    const proc = spawn(this.helper, /^[A-Za-z_-]{2,12}$/.test(lang) ? [lang.replace("-", "_")] : [], { stdio: ["pipe", "pipe", "ignore"] });
    this.proc = proc;
    let buffer = "";
    let ended = false;
    proc.stdout.on("data", (chunk) => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "end") ended = true;
          send(event);
        } catch {
          // Not an event; ignored.
        }
      }
    });
    proc.stdin.on("error", () => undefined);
    proc.on("error", () => {
      if (!ended) send({ type: "error", error: "audio-capture" });
    });
    proc.on("close", () => {
      if (this.proc === proc) this.proc = null;
      if (!ended) send({ type: "end" });
    });
  }

  /** Asks the helper to finish; its last words still arrive before it ends. */
  stop() {
    const proc = this.proc;
    if (!proc) return;
    try {
      proc.stdin.write("stop\n");
      setTimeout(() => proc.kill("SIGTERM"), 4000).unref();
    } catch {
      proc.kill("SIGTERM");
    }
  }
}

module.exports = { Dictation };
