import { spawn, type ChildProcess } from "node:child_process";
import type { AgentBackend } from "@bluebird/shared";
import { invocationFor } from "./backend";

export type ProcessInfo = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  running: boolean;
  exitCode: number | null;
  /** The signal that ended it, when it was stopped. */
  signal: string | null;
};

type Entry = ProcessInfo & { child: ChildProcess; output: string; version: number; waiters: (() => void)[] };

const KEEP = 60_000;
const MAX_RUNNING = 8;

/** The commands the model started in the background: they keep running between messages. */
export type ProcessManager = {
  start(command: string, options: { cwd: string; env?: NodeJS.ProcessEnv; backend?: AgentBackend }): ProcessInfo;
  list(): ProcessInfo[];
  /** The latest output, and whether the process is still running. Waits up to `waitMs` for something new. */
  read(id: string, options?: { tail?: number; waitMs?: number }): Promise<{ info: ProcessInfo; output: string } | null>;
  stop(id: string): boolean;
  killAll(): void;
};

const info = (entry: Entry): ProcessInfo => ({
  id: entry.id,
  command: entry.command,
  cwd: entry.cwd,
  startedAt: entry.startedAt,
  running: entry.running,
  exitCode: entry.exitCode,
  signal: entry.signal,
});

export function createProcessManager(): ProcessManager {
  const entries = new Map<string, Entry>();
  let counter = 0;

  const kill = (entry: Entry) => {
    try {
      if (entry.child.pid) process.kill(-entry.child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    // Anything that ignores the polite request is ended shortly after.
    setTimeout(() => {
      try {
        if (entry.running && entry.child.pid) process.kill(-entry.child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }, 2000).unref();
  };

  return {
    start(command, options) {
      const running = [...entries.values()].filter((entry) => entry.running).length;
      if (running >= MAX_RUNNING) throw new Error(`Already ${MAX_RUNNING} processes are running. Stop one first.`);
      const run = invocationFor(options.backend, command, options.cwd);
      const child = spawn(run.file, run.args, {
        cwd: run.cwd,
        env: options.env ?? process.env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const entry: Entry = {
        id: `p${++counter}`,
        command,
        cwd: options.cwd,
        startedAt: Date.now(),
        running: true,
        exitCode: null,
        signal: null,
        child,
        output: "",
        version: 0,
        waiters: [],
      };
      const wake = () => {
        entry.version++;
        for (const waiter of entry.waiters.splice(0)) waiter();
      };
      const take = (chunk: Buffer) => {
        entry.output += chunk.toString("utf8");
        if (entry.output.length > KEEP * 2) entry.output = entry.output.slice(-KEEP);
        wake();
      };
      child.stdout?.on("data", take);
      child.stderr?.on("data", take);
      child.on("close", (code, signal) => {
        entry.running = false;
        entry.exitCode = code;
        entry.signal = signal;
        wake();
      });
      child.on("error", (error) => {
        entry.output += `Could not start: ${error.message}\n`;
        entry.running = false;
        wake();
      });
      entries.set(entry.id, entry);
      return info(entry);
    },
    list: () => [...entries.values()].map(info),
    async read(id, options = {}) {
      const entry = entries.get(id);
      if (!entry) return null;
      const waitMs = Math.min(30_000, Math.max(0, options.waitMs ?? 0));
      if (waitMs > 0 && entry.running) {
        const seen = entry.version;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, waitMs);
          entry.waiters.push(() => {
            // A little more output may follow straight away.
            clearTimeout(timer);
            setTimeout(resolve, 150);
          });
          if (entry.version !== seen) resolve();
        });
      }
      const tail = Math.min(KEEP, Math.max(200, options.tail ?? 8000));
      return { info: info(entry), output: entry.output.slice(-tail) };
    },
    stop(id) {
      const entry = entries.get(id);
      if (!entry || !entry.running) return false;
      kill(entry);
      return true;
    },
    killAll() {
      for (const entry of entries.values()) if (entry.running) kill(entry);
    },
  };
}
