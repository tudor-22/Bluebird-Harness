import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import { slugName } from "../agent/marketplace";
import { expandHome, findSkillFolders, isDirectory, readText } from "./files";
import { frontmatter, markdownEntries, plainText } from "./markdown";
import { clipMemory, memoryTypeFor, type ImportPlan, type MemoryType, type ReadOptions } from "./types";

/**
 * OpenClaw (openclaw/openclaw) keeps memory as Markdown in the agent's workspace, and config,
 * credentials and sessions in its state folder:
 *
 * - State folder: OPENCLAW_STATE_DIR, else `~/.openclaw`, or `~/.openclaw-<profile>` when
 *   OPENCLAW_PROFILE names a profile other than "default" (docs/concepts/agent-workspace.md).
 * - Workspace: `<state>/workspace` unless `agents.defaults.workspace` (or the main agent's entry)
 *   in `<state>/openclaw.json` says otherwise (docs/concepts/agent-workspace.md).
 * - Memory: `USER.md` (directives about the person), `MEMORY.md` (durable facts and decisions),
 *   per-person `users/<profile-id>/USER.md`, and daily notes in `memory/YYYY-MM-DD*.md`
 *   (docs/concepts/memory.md, docs/concepts/user-model.md, docs/reference/templates/USER.md).
 * - Skills: folders with a SKILL.md in `<workspace>/skills`, `<workspace>/.agents/skills` and
 *   `<state>/skills`, in that order of precedence (docs/tools/skills.md, "Loading order").
 *
 * Sessions live in a per-agent SQLite file whose layout OpenClaw does not document as stable
 * (`agents/<id>/agent/openclaw-agent.sqlite`), so they are not read; daily notes carry the history.
 */

export type OpenClawLocation = { state: string; workspace: string; warnings: string[] };

export async function findOpenClaw(env: NodeJS.ProcessEnv = process.env, home = homedir(), workspaceOverride?: string): Promise<OpenClawLocation> {
  const profile = env.OPENCLAW_PROFILE?.trim();
  const state = env.OPENCLAW_STATE_DIR?.trim()
    ? expandHome(env.OPENCLAW_STATE_DIR.trim(), home)
    : join(home, profile && profile !== "default" ? `.openclaw-${profile}` : ".openclaw");
  const warnings: string[] = [];
  if (workspaceOverride) return { state, workspace: expandHome(workspaceOverride, home), warnings };
  const configPath = env.OPENCLAW_CONFIG_PATH?.trim() ? expandHome(env.OPENCLAW_CONFIG_PATH.trim(), home) : join(state, "openclaw.json");
  const text = await readText(configPath);
  let workspace = join(state, "workspace");
  if (text !== null) {
    const config = parseJson5(text) as { agents?: { defaults?: { workspace?: unknown }; entries?: { main?: { workspace?: unknown } } } } | null;
    if (config === null) warnings.push(`Could not read ${configPath}; using the default workspace. Pass --workspace to choose one.`);
    const configured = config?.agents?.entries?.main?.workspace ?? config?.agents?.defaults?.workspace;
    if (typeof configured === "string" && configured.trim()) workspace = expandHome(configured.trim(), home);
  }
  return { state, workspace, warnings };
}

/**
 * Enough of JSON5 for a config file: comments, trailing commas, unquoted keys and single-quoted
 * strings. Returns null when the text still is not valid.
 */
export function parseJson5(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let value = "";
      i += 1;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === "\\" && i + 1 < text.length) {
          value += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        value += text[i] === '"' ? '\\"' : text[i];
        i += 1;
      }
      out += `"${ch === "'" ? value.replace(/\\'/g, "'") : value}"`;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (/[A-Za-z_$]/.test(ch) && /[{,]\s*$/.test(out)) {
      let key = "";
      while (i < text.length && /[\w$]/.test(text[i])) key += text[i++];
      i -= 1;
      out += `"${key}"`;
    } else {
      out += ch;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}

/**
 * USER.md files made from OpenClaw's template keep its instructions above a "## Directives"
 * heading (docs/reference/templates/USER.md); only the directives are the person's.
 */
export function directivesOnly(text: string): string {
  const match = /^##\s+Directives\s*$/im.exec(text);
  if (!match) return text;
  const rest = text.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const DAILY = /^(\d{4}-\d{2}-\d{2})(?:-[\w-]+)?\.md$/;

function addEntries(plan: ImportPlan, path: string, text: string, fallback: MemoryType, validFrom?: string): void {
  for (const raw of markdownEntries(text)) {
    const entry = plainText(raw);
    if (entry.length < 3 || /^(prefer|always|never)\s*\.\.\.$/i.test(entry)) continue;
    const content = clipMemory(entry);
    if (content.length < entry.length) plan.warnings.push(`A memory in ${basename(path)} was longer than Bluebird keeps and was shortened.`);
    plan.memories.push({ content, type: fallback === "event" ? "event" : memoryTypeFor(content, fallback), file: path, ...(validFrom ? { validFrom } : {}) });
  }
}

/** Everything Bluebird can take from an OpenClaw install. Only reads; nothing is changed. */
export async function readOpenClaw(location: OpenClawLocation, options: ReadOptions = {}): Promise<ImportPlan> {
  const { state, workspace } = location;
  const plan: ImportPlan = { source: "openclaw", root: workspace, memories: [], skills: [], messages: [], sessions: 0, skipped: [], warnings: [...location.warnings] };
  if (!(await isDirectory(workspace)) && !(await isDirectory(state))) {
    plan.warnings.push(`No OpenClaw workspace at ${workspace}.`);
    return plan;
  }

  for (const [file, type] of [
    ["USER.md", "preference"],
    ["MEMORY.md", "fact"],
  ] as const) {
    const path = join(workspace, file);
    const text = await readText(path);
    if (text !== null) addEntries(plan, path, file === "USER.md" ? directivesOnly(text) : text, type);
  }
  for (const entry of await readdir(join(workspace, "users"), { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const path = join(workspace, "users", entry.name, "USER.md");
    const text = await readText(path);
    if (text !== null) addEntries(plan, path, directivesOnly(text), "preference");
  }

  const daily = (await readdir(join(workspace, "memory")).catch(() => [] as string[])).filter((name) => DAILY.test(name)).sort();
  if (daily.length && !options.history) plan.skipped.push({ what: `${daily.length} daily notes in memory/`, why: "use --history to import them" });
  if (options.history) {
    for (const name of daily) {
      const path = join(workspace, "memory", name);
      const text = await readText(path);
      if (text !== null) addEntries(plan, path, text, "event", `${DAILY.exec(name)![1]}T00:00:00.000Z`);
    }
  }

  // Highest precedence first: a name already taken by an earlier folder is the one OpenClaw uses.
  const seen = new Set<string>();
  for (const dir of [join(workspace, "skills"), join(workspace, ".agents", "skills"), join(state, "skills")]) {
    if (!(await isDirectory(dir))) continue;
    for (const folder of await findSkillFolders(dir)) {
      const header = frontmatter((await readText(join(folder, "SKILL.md"))) ?? "");
      const name = slugName(header?.fields.name?.trim() || basename(folder));
      if (seen.has(name)) {
        plan.skipped.push({ what: `skill ${relative(state, folder) || folder}`, why: `a higher-precedence OpenClaw skill is also called ${name}` });
        continue;
      }
      seen.add(name);
      plan.skills.push({ name, description: header?.fields.description ?? "", folder });
    }
  }
  return plan;
}
