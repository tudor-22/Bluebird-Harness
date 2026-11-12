import { readFile, readdir, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { parseSkill, type SkillStore } from "./skills";
import { ToolError } from "./workspace";

/** Where a skill in the marketplace comes from. Claude Code and Codex skills are the same format: a folder with a SKILL.md. */
export type MarketOrigin = "claude" | "codex" | "github" | "local";

export type MarketSkill = {
  /** What to pass to install: `local:<folder>` or `github:owner/repo/path`. */
  id: string;
  name: string;
  description: string;
  origin: MarketOrigin;
  /** Short label such as "anthropics/skills" or "~/.claude/skills". */
  from: string;
  installed: boolean;
};

const MAX_FILES = 200;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const MAX_SKILLS_AT_ONCE = 25;

/** Public catalogs the marketplace lists. Anyone can also install from any GitHub repository by name or address. */
export const CATALOGS: { repo: string; path: string; origin: MarketOrigin }[] = [
  { repo: "anthropics/skills", path: "skills", origin: "claude" },
  { repo: "openai/skills", path: "skills", origin: "codex" },
];

type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** A name Bluebird accepts: lowercase letters, numbers and dashes, up to 40 characters. */
export function slugName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "skill";
}

/** `owner/repo`, `owner/repo/some/path`, or a github.com address (also /tree/branch/path), as pieces. */
export function parseGithubSource(input: string): { owner: string; repo: string; ref: string; path: string } {
  let text = input.trim().replace(/^github:/i, "");
  const url = /^https?:\/\/(?:www\.)?github\.com\/(.+)$/i.exec(text);
  if (url) text = url[1];
  else if (/^https?:\/\//i.test(text)) throw new ToolError("Only GitHub repositories can be installed from an address.");
  const parts = text.replace(/\.git(?=\/|$)/, "").split("/").filter(Boolean);
  if (parts.length < 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) {
    throw new ToolError('Use "owner/repo", "owner/repo/path/to/skill" or a github.com address.');
  }
  let ref = "HEAD";
  let rest = parts.slice(2);
  if ((rest[0] === "tree" || rest[0] === "blob") && rest.length >= 2) {
    ref = rest[1];
    rest = rest.slice(2);
  }
  const path = rest.join("/");
  if (path.split("/").includes("..")) throw new ToolError("That path is not allowed.");
  return { owner: parts[0], repo: parts[1], ref, path: path.replace(/\/SKILL\.md$/, "") };
}

const defaultFetch: Fetcher = (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });

async function githubTree(fetcher: Fetcher, source: { owner: string; repo: string; ref: string }) {
  const response = await fetcher(`https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "bluebird-skills" },
  });
  if (response.status === 404) throw new ToolError(`GitHub has no repository ${source.owner}/${source.repo} (or that branch).`);
  if (response.status === 403) throw new ToolError("GitHub is limiting requests right now. Try again in a few minutes.");
  if (!response.ok) throw new ToolError(`GitHub answered ${response.status}.`);
  const data = (await response.json()) as { tree?: { path: string; type: string; size?: number }[] };
  return data.tree ?? [];
}

async function rawFile(fetcher: Fetcher, source: { owner: string; repo: string; ref: string }, path: string): Promise<Buffer> {
  const response = await fetcher(
    `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${path.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { "User-Agent": "bluebird-skills" } },
  );
  if (!response.ok) throw new ToolError(`Could not download ${path} (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export type Marketplace = {
  /** Skills found on this computer (Claude Code, Codex) and in the public catalogs. */
  browse(): Promise<MarketSkill[]>;
  /** Install one skill or a folder of skills from a market id, a local folder, or a GitHub source. */
  install(source: string): Promise<string[]>;
};

/** Folders where Claude Code and Codex keep skills, scanned for anything installable. */
export function localRoots(home = homedir()): { dir: string; origin: MarketOrigin; label: string; deep: boolean }[] {
  return [
    { dir: join(home, ".claude", "skills"), origin: "claude", label: "~/.claude/skills", deep: false },
    { dir: join(home, ".claude", "plugins"), origin: "claude", label: "~/.claude/plugins", deep: true },
    { dir: join(home, ".codex", "skills"), origin: "codex", label: "~/.codex/skills", deep: false },
    { dir: join(home, ".agents", "skills"), origin: "codex", label: "~/.agents/skills", deep: false },
  ];
}

/** Every folder under `dir` (to a limited depth) that holds a SKILL.md. */
async function findSkillFolders(dir: string, deep: boolean, depth = 0): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) return [dir];
  if (depth >= (deep ? 7 : 2)) return out;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git" || entry.name === "history") continue;
    out.push(...(await findSkillFolders(join(dir, entry.name), deep, depth + 1)));
    if (out.length > 300) break;
  }
  return out;
}

/** Reads a folder into memory: regular files only, no links, with size limits. */
async function readFolder(folder: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  let total = 0;
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "history" || entry.name === ".stats.json") continue;
      const full = join(dir, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(full);
      else if (info.isFile()) {
        if (info.size > MAX_FILE_BYTES) continue;
        total += info.size;
        if (files.size >= MAX_FILES || total > MAX_TOTAL_BYTES) throw new ToolError("That skill folder is too large to install.");
        files.set(relative(folder, full).split("\\").join("/"), await readFile(full));
      }
    }
  };
  await walk(folder);
  return files;
}

export function createMarketplace(store: SkillStore, options: { fetcher?: Fetcher; home?: string } = {}): Marketplace {
  const fetcher = options.fetcher ?? defaultFetch;
  const home = options.home ?? homedir();
  let remoteCache: { at: number; skills: MarketSkill[] } | null = null;

  const installFiles = async (files: Map<string, Buffer>, fallbackName: string, source: string): Promise<string> => {
    const skillText = files.get("SKILL.md")?.toString("utf8") ?? "";
    const parsed = parseSkill(skillText);
    const name = slugName(parsed.name || fallbackName);
    await store.install(name, files, source);
    return name;
  };

  const remote = async (): Promise<MarketSkill[]> => {
    if (remoteCache && Date.now() - remoteCache.at < 10 * 60_000) return remoteCache.skills;
    const found: MarketSkill[] = [];
    await Promise.all(
      CATALOGS.map(async (catalog) => {
        const [owner, repo] = catalog.repo.split("/");
        const source = { owner, repo, ref: "HEAD" };
        const tree = await githubTree(fetcher, source).catch(() => []);
        const roots = tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(`${catalog.path}/`) && entry.path.endsWith("/SKILL.md")).slice(0, 80);
        await Promise.all(
          roots.map(async (entry) => {
            const folder = dirname(entry.path);
            const text = await rawFile(fetcher, source, entry.path).then((b) => b.toString("utf8")).catch(() => "");
            const parsed = parseSkill(text);
            found.push({
              id: `github:${catalog.repo}/${folder}`,
              name: slugName(parsed.name || basename(folder)),
              description: parsed.description,
              origin: catalog.origin,
              from: catalog.repo,
              installed: false,
            });
          }),
        );
      }),
    );
    remoteCache = { at: Date.now(), skills: found };
    return found;
  };

  const local = async (): Promise<MarketSkill[]> => {
    const found: MarketSkill[] = [];
    const seen = new Set<string>();
    for (const root of localRoots(home)) {
      for (const folder of await findSkillFolders(root.dir, root.deep)) {
        if (seen.has(folder)) continue;
        seen.add(folder);
        const parsed = parseSkill(await readFile(join(folder, "SKILL.md"), "utf8").catch(() => ""));
        found.push({ id: `local:${folder}`, name: slugName(parsed.name || basename(folder)), description: parsed.description, origin: "local", from: root.label, installed: false });
      }
    }
    return found;
  };

  return {
    async browse() {
      const [mine, theirs, have] = await Promise.all([local(), remote(), store.list()]);
      const names = new Set(have.map((skill) => skill.name));
      return [...mine, ...theirs]
        .map((skill) => ({ ...skill, installed: names.has(skill.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async install(input) {
      const text = input.trim();
      if (!text) throw new ToolError("Say what to install: a skill from the list, a folder, or a GitHub repository.");
      // A folder on this computer: only ones the scan can find, so a request cannot copy arbitrary directories.
      if (text.startsWith("local:") || text.startsWith("/") || text.startsWith("~")) {
        const wanted = text.replace(/^local:/, "").replace(/^~(?=\/|$)/, home);
        const known = await local();
        const hit = known.find((skill) => skill.id === `local:${wanted}`);
        if (!hit) throw new ToolError("That folder is not in a Claude Code or Codex skills folder. Copy it there first, or install it from GitHub.");
        const files = await readFolder(wanted);
        return [await installFiles(files, basename(wanted), `local:${wanted}`)];
      }
      const source = parseGithubSource(text);
      const tree = await githubTree(fetcher, source);
      const prefix = source.path ? `${source.path}/` : "";
      const manifests = tree.filter((entry) => entry.type === "blob" && (source.path ? entry.path.startsWith(prefix) || entry.path === `${source.path}` : true) && basename(entry.path) === "SKILL.md");
      const roots = [...new Set(manifests.map((entry) => dirname(entry.path)))].map((root) => (root === "." ? "" : root));
      if (roots.length === 0) throw new ToolError("No SKILL.md was found there.");
      // A path that is itself a skill installs just that skill, whatever is nested under it.
      const chosen = roots.includes(source.path) ? [source.path] : roots.slice(0, MAX_SKILLS_AT_ONCE);
      const installed: string[] = [];
      for (const root of chosen) {
        const own = tree.filter((entry) => entry.type === "blob" && (root ? entry.path.startsWith(`${root}/`) : true));
        // Never take a nested skill's files into its parent.
        const nested = chosen.filter((other) => other !== root && other.startsWith(root ? `${root}/` : ""));
        const files = new Map<string, Buffer>();
        let total = 0;
        for (const entry of own) {
          if (nested.some((other) => entry.path.startsWith(`${other}/`))) continue;
          if ((entry.size ?? 0) > MAX_FILE_BYTES) continue;
          total += entry.size ?? 0;
          if (files.size >= MAX_FILES || total > MAX_TOTAL_BYTES) throw new ToolError("That skill is too large to install.");
          files.set(root ? entry.path.slice(root.length + 1) : entry.path, await rawFile(fetcher, source, entry.path));
        }
        installed.push(await installFiles(files, basename(root) || source.repo, `github:${source.owner}/${source.repo}${root ? `/${root}` : ""}`));
      }
      return installed;
    },
  };
}
