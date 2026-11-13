import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const exists = async (path: string) => (await stat(path).catch(() => null)) !== null;
export const isDirectory = async (path: string) => (await stat(path).catch(() => null))?.isDirectory() === true;
export const readText = async (path: string) => readFile(path, "utf8").catch(() => null);

export function expandHome(path: string, home = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
  return resolve(path);
}

/** Folders that are never skills, or never worth copying: caches, virtual environments, history. */
const NOT_SKILLS = new Set([".git", ".github", ".hub", ".archive", ".venv", "venv", "node_modules", "site-packages", "__pycache__", ".tox", ".nox", ".pytest_cache", ".mypy_cache", ".ruff_cache", "history"]);
/** A skill's own folders: a SKILL.md inside them belongs to the skill, not a new one. */
const SKILL_PARTS = new Set(["references", "templates", "assets", "scripts"]);

/** Every folder under `root` that holds a SKILL.md, sorted, to a limited depth. */
export async function findSkillFolders(root: string, depth = 0, skip: (dir: string, name: string) => boolean = () => false): Promise<string[]> {
  if (depth > 6) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const isSkill = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
  const out = isSkill ? [root] : [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || NOT_SKILLS.has(entry.name) || (isSkill && SKILL_PARTS.has(entry.name)) || skip(root, entry.name)) continue;
    out.push(...(await findSkillFolders(join(root, entry.name), depth + 1, skip)));
  }
  return out;
}
