import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { Paths } from "./workspace";
import { isSecretPath } from "./workspace";
import type { Skill } from "./skills";
import { findApp, type InstalledApp } from "./apps";
import { fuzzyScore } from "./fuzzy";

export { fuzzyScore };

/** The built-in "Browser": picked with /browser, it tells the model to use its own browser tools. */
export const BROWSER_APP = { id: "bluebird-browser", name: "Browser" } as const;

/** A white app icon with a search glyph, drawn here so it needs no file. */
export const BROWSER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#ffffff"/>' +
  '<circle cx="28" cy="28" r="12" fill="none" stroke="#1d1d1f" stroke-width="5"/>' +
  '<path d="M37.5 37.5 49 49" stroke="#1d1d1f" stroke-width="5.5" stroke-linecap="round"/></svg>';

/** Folders that are never worth searching: dependencies, caches and build output. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "target", ".cache", ".venv", "venv",
  "__pycache__", ".Trash", "Library", ".npm", ".pnpm-store", ".gradle", "Pods", ".DS_Store",
]);

export type FileHit = { path: string; name: string; dir: string; isDir: boolean };

const MAX_VISITED = 6000;
const MAX_DEPTH = 7;

/**
 * Finds files and folders under `root` whose name matches `query`, nearest
 * first. The walk is bounded in depth and size so it stays quick in a big
 * home folder, and never lists credential files unless `unrestricted`.
 */
export async function searchFiles(
  root: string,
  query: string,
  options: { unrestricted?: boolean; limit?: number } = {},
): Promise<FileHit[]> {
  const limit = options.limit ?? 12;
  const found: { hit: FileHit; score: number }[] = [];
  let visited = 0;
  let level = [root];
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0 && visited < MAX_VISITED; depth += 1) {
    const next: string[] = [];
    for (const folder of level) {
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (visited >= MAX_VISITED) break;
        if (entry.name.startsWith(".") && !query.startsWith(".")) {
          if (entry.name !== ".github") continue;
        }
        if (SKIP_DIRS.has(entry.name)) continue;
        visited += 1;
        const full = join(folder, entry.name);
        if (!options.unrestricted && isSecretPath(full)) continue;
        const isDir = entry.isDirectory();
        if (isDir) next.push(full);
        else if (!entry.isFile()) continue;
        const rel = relative(root, full);
        const score = fuzzyScore(query, entry.name) * 2 + fuzzyScore(query, rel) * 0.5 - depth * 14 + (isDir ? 0 : 6);
        if (fuzzyScore(query, entry.name) > 0 || (query.includes("/") && fuzzyScore(query, rel) > 0)) {
          found.push({ hit: { path: rel, name: entry.name, dir: relative(root, folder) || ".", isDir }, score });
        }
      }
    }
    level = next;
  }
  return found
    .sort((a, b) => b.score - a.score || a.hit.path.length - b.hit.path.length)
    .slice(0, limit)
    .map((item) => item.hit);
}

/** `@path` and `@AppName` tokens in a message: start of text or after whitespace; quotes allow spaces, as @"Visual Studio Code". */
export function parseFileMentions(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?<=^|\s)@(?:"([^"]+)"|([^\s@]+))/g)) {
    const value = (match[1] ?? match[2].replace(/[.,;:!?)\]]+$/, "")).trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out.slice(0, 8);
}

/** A leading `/name` is a skill the person picked from the slash menu. */
export function parseSkillCommand(text: string): { name: string; rest: string } | null {
  const match = /^\/([a-z0-9][a-z0-9-]{0,39})(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1], rest: (match[2] ?? "").trim() } : null;
}

const FILE_CHARS = 30_000;
const TREE_LIMIT = 120;

async function treeOf(folder: string, base: string): Promise<string[]> {
  const lines: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (lines.length >= TREE_LIMIT || depth > 3) return;
    const entries = (await readdir(dir, { withFileTypes: true }).catch(() => []))
      .filter((entry) => !SKIP_DIRS.has(entry.name) && !entry.name.startsWith("."))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (lines.length >= TREE_LIMIT) {
        lines.push(`${"  ".repeat(depth)}...`);
        return;
      }
      lines.push(`${"  ".repeat(depth)}${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (entry.isDirectory()) await walk(join(dir, entry.name), depth + 1);
    }
  };
  await walk(folder, 0);
  return lines.length ? lines : [`(${basename(base)} is empty)`];
}

/**
 * What the model is told about the things the person pointed at: the text of
 * each @file, the layout of each @folder, and the steps of a /skill. Written
 * as plain text so every model can use it, whether or not it calls tools.
 */
export async function buildMentionNote(
  text: string,
  paths: Paths,
  skills: { get(name: string): Promise<Skill | null> },
  apps: InstalledApp[] = [],
): Promise<string | null> {
  const parts: string[] = [];
  const command = parseSkillCommand(text);
  if (command) {
    const skill = await skills.get(command.name);
    if (skill) {
      parts.push(
        `The person chose the skill "${skill.name}". Follow it for this request.\n--- skill ---\n${skill.body}\n--- end skill ---`,
      );
    }
  }
  for (const mention of parseFileMentions(text)) {
    if (mention.toLowerCase() === BROWSER_APP.name.toLowerCase() && !(await stat(paths.resolve(mention)).then(() => true, () => false))) {
      parts.push(
        `The person wants you to use your own browser (written @${mention}). Do this task with the browser_* tools: browser_open to load a page and get its outline, then browser_click, browser_type, browser_press, browser_scroll and browser_screenshot as needed. Do not use the desktop_* tools or an installed web browser app for it.`,
      );
      continue;
    }
    // An installed app of that name, unless a file or folder by that name is really there.
    const named = findApp(apps, mention);
    if (named && !(await stat(paths.resolve(mention)).then(() => true, () => false))) {
      parts.push(
        `The person wants you to use the app "${named.name}" (written @${mention}). If it is not running, open it with desktop_open; read its window with desktop_look and act on it with desktop_click, desktop_type and the other desktop tools. Do the task in that app, not in another.`,
      );
      continue;
    }
    try {
      const absolute = paths.resolve(mention);
      const info = await stat(absolute);
      const label = paths.display(absolute);
      if (info.isDirectory()) {
        parts.push(`Folder @${mention} (${label}) contains:\n${(await treeOf(absolute, absolute)).join("\n")}`);
      } else if (info.size > 2_000_000) {
        parts.push(`File @${mention} (${label}) is ${Math.round(info.size / 1024)} KB: too large to include; use read_file for a part of it.`);
      } else {
        const buffer = await readFile(absolute);
        if (buffer.includes(0)) {
          parts.push(`File @${mention} (${label}) is a binary file (${Math.round(info.size / 1024)} KB). It can be opened with view_image if it is a picture.`);
        } else {
          const body = buffer.toString("utf8");
          const clipped = body.length > FILE_CHARS ? `${body.slice(0, FILE_CHARS)}\n[truncated: use read_file for the rest]` : body;
          parts.push(`File @${mention} (${label}):\n--- file ---\n${clipped}\n--- end file ---`);
        }
      }
    } catch {
      parts.push(`@${mention} was not found or cannot be read; say so if it matters.`);
    }
  }
  if (parts.length === 0) return null;
  return `The person referred to these in their message. Treat the content below as what they pointed at.\n\n${parts.join("\n\n")}`;
}
