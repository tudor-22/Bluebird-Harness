import { spawn, type ChildProcess } from "node:child_process";
import { ToolError } from "../workspace";
import type { AppInfo, DesktopAdapter, Look, LookOptions, WindowInfo } from "./adapter";

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export type HelperSpec = {
  platform: string;
  /** What to run, prepared on first use: it may build the helper first. */
  command: () => Promise<{ file: string; args: string[] }>;
  /** What to tell the person when the helper cannot read other apps. */
  notReady: string;
  /** Extra fields for the status request, such as asking the system to show its permission prompt. */
  statusRequest?: Record<string, unknown>;
  /** Called when the helper is not allowed to read other apps, to guide the person to the setting. */
  onNotReady?: () => void;
  /** Platforms whose helper cannot take pictures itself supply their own. */
  screenshot?: (app: string | undefined, call: HelperCall) => Promise<{ base64: string; mime: string }>;
};

export type HelperCall = (request: Record<string, unknown>, timeoutMs?: number) => Promise<any>;

/**
 * An adapter over a helper program that speaks one JSON request per line on
 * stdin and answers one JSON line per request on stdout. Every platform's helper
 * follows this protocol, so the three share all of this code; only the helper
 * differs (Swift on macOS, PowerShell on Windows, Python on Linux).
 */
export function createHelperAdapter(spec: HelperSpec): DesktopAdapter {
  let child: ChildProcess | null = null;
  let nextId = 1;
  const waiting = new Map<number, Pending>();
  let buffer = "";
  let starting: Promise<void> | null = null;
  let prompted = false;

  const failAll = (error: Error) => {
    for (const entry of waiting.values()) entry.reject(error);
    waiting.clear();
  };

  async function start(): Promise<void> {
    const { file, args } = await spec.command();
    const proc = spawn(file, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    child = proc;
    proc.stdout!.setEncoding("utf8");
    proc.stdout!.on("data", (chunk: string) => {
      buffer += chunk;
      let at: number;
      while ((at = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line.startsWith("{")) continue;
        try {
          const message = JSON.parse(line);
          const entry = waiting.get(message.id);
          if (!entry) continue;
          waiting.delete(message.id);
          if (message.ok) entry.resolve(message);
          else entry.reject(new ToolError(String(message.error ?? "The helper failed.")));
        } catch {
          // Not a JSON line.
        }
      }
    });
    proc.on("close", () => {
      if (child === proc) child = null;
      failAll(new ToolError("The desktop helper stopped. Try again."));
    });
    proc.on("error", (error) => failAll(new ToolError(`Could not start the desktop helper: ${error.message}`)));
  }

  const call: HelperCall = async (request, timeoutMs = 20_000) => {
    if (!child) {
      starting ??= start().finally(() => {
        starting = null;
      });
      await starting;
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new ToolError("The app did not answer in time. It may be busy or frozen."));
      }, timeoutMs);
      waiting.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
      child!.stdin!.write(`${JSON.stringify({ id, ...request })}\n`);
    });
  };

  return {
    platform: spec.platform,
    async status(options = {}) {
      // The system's permission prompt is shown once per run, or whenever the person asks for it.
      const ask = options.prompt === true || (options.prompt !== false && !prompted);
      const info = await call({ op: "status", ...(ask ? spec.statusRequest : {}) }, 60_000);
      if (info.trusted) return { ready: true, message: String(info.message || "Ready.") };
      if (ask) {
        prompted = true;
        spec.onNotReady?.();
      }
      return { ready: false, message: String(info.message || spec.notReady) };
    },
    async apps() {
      return (await call({ op: "apps" })).apps as AppInfo[];
    },
    async windows(app) {
      return (await call({ op: "windows", app })).windows as WindowInfo[];
    },
    async look(opts: LookOptions): Promise<Look> {
      const result = await call({ op: "outline", ...opts }, 45_000);
      return { app: result.app, outline: result.outline, marks: result.marks, truncated: result.truncated };
    },
    async act(mark, action) {
      await call({ op: "act", mark, action });
    },
    async click(target, opts = {}) {
      await call({ op: "click", ...target, double: opts.double === true, right: opts.right === true });
    },
    async setValue(mark, text) {
      return String((await call({ op: "set_value", mark, text })).value ?? "");
    },
    async type(text, target = {}) {
      await call({ op: "type", text, ...target });
    },
    async key(keys, app) {
      await call({ op: "key", keys, app });
    },
    async scroll(opts) {
      await call({ op: "scroll", ...opts });
    },
    async read(mark) {
      const { ok: _ok, id: _id, ...rest } = await call({ op: "read", mark });
      return rest as Record<string, string>;
    },
    async launch(app) {
      const result = await call({ op: "launch", app }, 30_000);
      return { launched: result.launched === true };
    },
    async activate(app) {
      await call({ op: "activate", app });
    },
    async quit(app, force) {
      await call({ op: "quit", app, force: force === true });
    },
    async screenshot(app) {
      if (spec.screenshot) return spec.screenshot(app, call);
      const result = await call({ op: "screenshot", app }, 30_000);
      return { base64: String(result.base64), mime: String(result.mime || "image/jpeg") };
    },
    async clipboardGet() {
      return String((await call({ op: "clipboard_get" })).text ?? "");
    },
    async clipboardSet(text) {
      await call({ op: "clipboard_set", text });
    },
    async close() {
      try {
        child?.kill("SIGTERM");
      } catch {
        // Already gone.
      }
      child = null;
    },
  };
}
