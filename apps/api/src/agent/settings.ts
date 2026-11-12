import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import type { AgentLevel } from "@bluebird/shared";
import { readStored, writeStored } from "../model/settings-store";
import type { AgentSettings } from "./tools";

export type AgentSettingsStore = {
  /** What was chosen: the level, and the optional starting folder. */
  get(): Promise<AgentSettings>;
  /** Saves some settings. A starting folder that does not exist is refused. */
  save(patch: Partial<AgentSettings>): Promise<{ ok: true; settings: AgentSettings } | { ok: false; error: string }>;
  /** Where relative paths and commands start: the chosen folder, or the home folder. */
  folder(settings: AgentSettings): string;
};

export function checkStartFolder(root: string): string | null {
  if (!isAbsolute(root)) return "Give the full path of a folder, such as /Users/you/project.";
  if (!existsSync(root) || !statSync(root).isDirectory()) return "That folder does not exist.";
  return null;
}

const levelOf = (value: unknown): AgentLevel => (value === "ask" || value === "full" ? value : "auto");

export function createAgentSettingsStore(settingsFile: string): AgentSettingsStore {
  const get = async (): Promise<AgentSettings> => {
    const saved = (await readStored(settingsFile)).agent ?? {};
    return {
      ...(saved.root ? { root: saved.root } : {}),
      level: levelOf(saved.level),
      ...(saved.backend && saved.backend.type !== "local" ? { backend: saved.backend } : {}),
    };
  };
  return {
    get,
    async save(patch) {
      if (patch.root !== undefined && patch.root !== "") {
        const problem = checkStartFolder(patch.root);
        if (problem) return { ok: false, error: problem };
      }
      const next: AgentSettings = { ...(await get()), ...patch };
      if (!next.root) delete next.root;
      if (next.backend?.type === "local") delete next.backend;
      const stored = await readStored(settingsFile);
      await writeStored(settingsFile, { ...stored, agent: next });
      return { ok: true, settings: next };
    },
    folder: (settings) =>
      settings.root && checkStartFolder(settings.root) === null ? settings.root : homedir(),
  };
}
