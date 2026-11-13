import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { slugName } from "../agent/marketplace";
import { exists, expandHome, findSkillFolders, isDirectory, readText } from "./files";
import { frontmatter } from "./markdown";
import { clipMemory, MAX_MESSAGE_CHARS, memoryTypeFor, type ImportPlan, type MemoryItem, type ReadOptions, type SkillItem } from "./types";

/**
 * Hermes Agent (NousResearch/hermes-agent) keeps everything in one home folder:
 *
 * - `memories/MEMORY.md` (the agent's notes) and `memories/USER.md` (the user profile): entries
 *   separated by a line holding only `§` (tools/memory_tool_store.py, ENTRY_DELIMITER = "\n§\n";
 *   the folder is get_hermes_home() / "memories" in tools/memory_tool.py).
 * - `skills/<category>/<name>/SKILL.md`, with YAML front matter (tools/skills_tool.py). Skills
 *   Hermes ships with are listed in `skills/.bundled_manifest` as `name:hash` lines
 *   (tools/skills_sync.py).
 * - `state.db`, SQLite: `sessions` and `messages` tables, with an FTS5 index over messages
 *   (hermes_state_common.py, SCHEMA_SQL and FTS_SQL). Live rows have `active = 1`; rows a
 *   compaction archived keep `compacted = 1` and are still part of the shown history
 *   (hermes_state_messages.py, _DISPLAY_ACTIVE_CLAUSE).
 *
 * The home folder is HERMES_HOME, else `~/.hermes` (`%LOCALAPPDATA%\hermes` on Windows), and a
 * named profile lives in `profiles/<name>` under it, chosen by the `active_profile` file
 * (hermes_constants.py, _platform_default_hermes_home and get_hermes_home).
 */

const ENTRY_DELIMITER = /\r?\n§\r?\n/;
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function findHermesHome(env: NodeJS.ProcessEnv = process.env, home = homedir()): Promise<string> {
  const configured = env.HERMES_HOME?.trim();
  if (configured) {
    const root = expandHome(configured, home);
    return basename(dirname(root)) === "profiles" ? root : activeProfile(root);
  }
  if (process.platform === "win32") {
    const local = env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local");
    const platformRoot = join(local, "hermes");
    if (await isDirectory(platformRoot)) return activeProfile(platformRoot);
  }
  return activeProfile(join(home, ".hermes"));
}

async function activeProfile(root: string): Promise<string> {
  const name = (await readText(join(root, "active_profile")))?.trim();
  if (!name || name === "default" || !PROFILE.test(name)) return root;
  const profile = join(root, "profiles", name);
  return (await isDirectory(profile)) ? profile : root;
}

/** The entries of a Hermes memory file. */
export function hermesEntries(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(ENTRY_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readMemories(root: string, plan: ImportPlan): Promise<void> {
  for (const [file, fallback] of [
    ["USER.md", "fact"],
    ["MEMORY.md", "fact"],
  ] as const) {
    const path = join(root, "memories", file);
    const text = await readText(path);
    if (text === null) continue;
    for (const entry of hermesEntries(text)) {
      const content = clipMemory(entry.replace(/\s+/g, " "));
      if (content.length < entry.replace(/\s+/g, " ").length) plan.warnings.push(`A memory in ${file} was longer than Bluebird keeps and was shortened.`);
      const item: MemoryItem = { content, type: file === "USER.md" ? memoryTypeFor(content, fallback) : fallback, file: path };
      plan.memories.push(item);
    }
  }
}

async function readSkills(root: string, plan: ImportPlan, options: ReadOptions): Promise<void> {
  const dir = join(root, "skills");
  if (!(await isDirectory(dir))) return;
  const manifest = new Set(
    ((await readText(join(dir, ".bundled_manifest"))) ?? "")
      .split(/\r?\n/)
      .map((line) => line.split(":")[0].trim())
      .filter(Boolean),
  );
  // Hermes keeps old organisation mirrors under _org; only the active one is in use.
  const activeOrg = (await readText(join(dir, "_org", ".active_org")))?.trim();
  const skip = (parent: string, name: string) => (parent === dir && name === "_org" && !activeOrg) || (parent === join(dir, "_org") && name !== activeOrg);
  for (const folder of await findSkillFolders(dir, 0, skip)) {
    const text = (await readText(join(folder, "SKILL.md"))) ?? "";
    const header = frontmatter(text);
    const declared = header?.fields.name?.trim() || basename(folder);
    const label = relative(dir, folder) || basename(folder);
    if (!options.includeBundled && (manifest.has(basename(folder)) || manifest.has(declared))) {
      plan.skipped.push({ what: `skill ${label}`, why: "it ships with Hermes (use --include-bundled to import it)" });
      continue;
    }
    const skill: SkillItem = { name: slugName(declared), description: header?.fields.description ?? "", folder };
    plan.skills.push(skill);
  }
}

type Columns = Set<string>;

function columns(db: DatabaseSync, table: string): Columns {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name));
}

/** Reads past conversations from state.db, read-only. Only what the person and the agent said. */
async function readSessions(path: string, plan: ImportPlan): Promise<void> {
  let db: DatabaseSync;
  try {
    // Loaded only here, so a runtime without node:sqlite still imports memories and skills.
    const { DatabaseSync: Database } = await import("node:sqlite");
    db = new Database(path, { readOnly: true });
  } catch (error) {
    plan.warnings.push(`Could not open ${path}: ${(error as Error).message}`);
    return;
  }
  try {
    const messageColumns = columns(db, "messages");
    if (!messageColumns.has("session_id") || !messageColumns.has("content")) {
      plan.warnings.push(`${path} has no messages table Bluebird knows how to read.`);
      return;
    }
    const where = ["m.role IN ('user', 'assistant')", "m.content IS NOT NULL", "trim(m.content) <> ''"];
    if (messageColumns.has("active")) where.push(messageColumns.has("compacted") ? "(m.active = 1 OR m.compacted = 1)" : "m.active = 1");
    // Summaries a compaction wrote are Hermes' own notes, not something either side said.
    if (messageColumns.has("_compressed_summary")) where.push("m._compressed_summary = 0");
    const sessionColumns = columns(db, "sessions");
    const hidden = sessionColumns.has("hidden") ? "AND coalesce(s.hidden, 0) = 0" : "";
    const rows = db
      .prepare(
        `SELECT m.id, m.session_id, m.role, m.content, m.timestamp
           FROM messages m JOIN sessions s ON s.id = m.session_id
          WHERE ${where.join(" AND ")} ${hidden}
          ORDER BY m.session_id, m.id`,
      )
      .all() as { id: number; session_id: string; role: "user" | "assistant"; content: string; timestamp: number }[];
    const sessions = new Set<string>();
    let clipped = 0;
    for (const row of rows) {
      sessions.add(row.session_id);
      const content = row.content.length > MAX_MESSAGE_CHARS ? `${row.content.slice(0, MAX_MESSAGE_CHARS - 1)}…` : row.content;
      if (content !== row.content) clipped += 1;
      plan.messages.push({
        role: row.role,
        content,
        // Hermes stores Unix seconds as a REAL.
        at: new Date(Number(row.timestamp) * 1000).toISOString(),
        session: row.session_id,
        key: `hermes:${createHash("sha1").update(`${row.session_id}:${row.id}`).digest("hex").slice(0, 20)}`,
      });
    }
    plan.sessions = sessions.size;
    if (clipped) plan.warnings.push(`${clipped} very long messages were shortened to ${MAX_MESSAGE_CHARS} characters.`);
  } catch (error) {
    plan.warnings.push(`Could not read sessions from ${path}: ${(error as Error).message}`);
  } finally {
    db.close();
  }
}

/** Everything Bluebird can take from a Hermes home folder. Only reads; nothing is changed. */
export async function readHermes(root: string, options: ReadOptions = {}): Promise<ImportPlan> {
  const plan: ImportPlan = { source: "hermes", root, memories: [], skills: [], messages: [], sessions: 0, skipped: [], warnings: [] };
  if (!(await isDirectory(root))) {
    plan.warnings.push(`No Hermes folder at ${root}.`);
    return plan;
  }
  await readMemories(root, plan);
  await readSkills(root, plan, options);
  const db = join(root, "state.db");
  if (await exists(db)) {
    if (options.history) await readSessions(db, plan);
    else plan.skipped.push({ what: "past conversations in state.db", why: "use --history to import them" });
  }
  return plan;
}
