import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type EngineConfig = { baseUrl?: string; apiKey?: string };

/** Everything the person has chosen in settings that must survive a restart. */
export type Stored = {
  engines?: Record<string, EngineConfig>;
  selected?: { engine: string; model: string };
  mcp?: { servers: unknown[] };
  gateway?: { telegram?: unknown; discord?: unknown; slack?: unknown };
  agent?: { root?: string; level?: string; network?: boolean; backend?: import("@bluebird/shared").AgentBackend };
};

export async function readStored(file: string): Promise<Stored> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Stored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeStored(file: string, data: Stored): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  // Keys live in this file, so it stays readable by this account only.
  await chmod(file, 0o600).catch(() => undefined);
}
