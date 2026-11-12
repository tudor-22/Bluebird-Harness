import { spawn } from "node:child_process";
import type { AgentBackend } from "@bluebird/shared";
import { hasProgram, invocationFor } from "./backend";

export type CommandResult = { output: string; exitCode: number | null; timedOut: boolean; truncated: boolean };

const OUTPUT_LIMIT = 50_000;

/** Bluebird's own keys and database address stay out of what a command can see. */
const APP_SECRET = /^(BLUEBIRD_|DATABASE_URL)/i;

/**
 * Runs a shell command as the person would in a terminal, with a timeout and
 * capped output. The environment is theirs, minus Bluebird's own secrets.
 */
export function runCommand(
  command: string,
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal; backend?: AgentBackend },
): Promise<CommandResult> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !APP_SECRET.test(key)));
  let run;
  try {
    run = invocationFor(options.backend, command, options.cwd);
  } catch (error) {
    return Promise.resolve({ output: (error as Error).message, exitCode: null, timedOut: false, truncated: false });
  }
  const needed = options.backend?.type === "docker" ? "docker" : options.backend?.type === "ssh" ? "ssh" : null;
  const ready = needed ? hasProgram(needed) : Promise.resolve(true);
  return ready.then((found) => {
    if (!found) {
      return { output: `${needed} is not installed on this computer, so commands cannot run there.`, exitCode: null, timedOut: false, truncated: false } as CommandResult;
    }
    return runInvocation(run, env, options);
  });
}

function runInvocation(
  run: ReturnType<typeof invocationFor>,
  env: NodeJS.ProcessEnv,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(run.file, run.args, {
      cwd: run.cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let truncated = false;
    let timedOut = false;
    const take = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      // Keep the tail: the end of the output is what explains a failure.
      if (output.length > OUTPUT_LIMIT * 2) {
        output = output.slice(-OUTPUT_LIMIT);
        truncated = true;
      }
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", kill, { once: true });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      if (output.length > OUTPUT_LIMIT) {
        output = output.slice(-OUTPUT_LIMIT);
        truncated = true;
      }
      resolve({ output, exitCode: code, timedOut, truncated });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ output: `Could not start the command: ${error.message}`, exitCode: null, timedOut: false, truncated: false });
    });
  });
}

/** Commands that are never run, at any level. */
const HARDLINE: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf][a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(\/|~|\$HOME|\/\*|~\/\*)(\s|$)/,
  /:\(\)\s*\{\s*:\s*\|\s*:/,
  /\bmkfs(\.\w+)?\b/,
  /\bdd\s+[^|;&]*\bof=\/dev\/(sd|disk|nvme|hd)/,
  />\s*\/dev\/(sd|disk|nvme|hd)/,
  /\bchmod\s+-R\s+[0-7]*7[0-7]*\s+\//,
  /\b(shutdown|reboot|halt|poweroff)\b/,
];

export function isHardline(command: string): boolean {
  return HARDLINE.some((pattern) => pattern.test(command));
}
