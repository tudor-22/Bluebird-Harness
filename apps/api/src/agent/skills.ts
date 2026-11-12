import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { unifiedDiff } from "./diff";
import type { ExtraTool } from "./tools";
import { ToolError } from "./workspace";

/** A reusable how-to the model wrote or was given: a folder with a SKILL.md. */
export type Skill = { name: string; description: string; body: string };

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** SKILL.md files start with a small header: name and description. */
export function parseSkill(text: string): { name?: string; description: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { description: "", body: text.trim() };
  const field = (key: string) => new RegExp(`^${key}:\\s*(.*)$`, "m").exec(match[1])?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { name: field("name"), description: field("description") ?? "", body: match[2].trim() };
}

export function renderSkill(skill: Skill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description.replace(/\n/g, " ")}\n---\n\n${skill.body.trim()}\n`;
}

/** What is kept about how a skill has been used and where it came from. */
export type SkillStats = {
  uses: number;
  lastUsed?: string;
  /** "learned" when Bluebird wrote or revised it by itself after a task. */
  origin?: "learned" | "person" | "installed";
  /** Where an installed skill came from, such as "github:anthropics/skills/skills/pdf". */
  source?: string;
  revisions?: number;
  /** The reason given for the latest automatic change. */
  note?: string;
  updatedAt?: string;
};

export type SkillStore = {
  list(): Promise<Pick<Skill, "name" | "description">[]>;
  stats(): Promise<Record<string, SkillStats>>;
  /** Count a use of the skill. */
  touch(name: string): Promise<void>;
  /** Save a skill written by Bluebird itself, keeping the previous version. */
  learn(skill: Skill, note: string): Promise<{ created: boolean }>;
  get(name: string): Promise<Skill | null>;
  save(skill: Skill): Promise<string>;
  remove(name: string): Promise<boolean>;
  pathOf(name: string): string;
  /** Install a whole skill folder (SKILL.md plus any scripts and references), keeping the previous SKILL.md. */
  install(name: string, files: Map<string, Buffer>, source: string): Promise<{ replaced: boolean }>;
};

export function createSkillStore(directory: string): SkillStore {
  const pathOf = (name: string) => join(directory, name, "SKILL.md");
  const valid = (name: string) => {
    if (!NAME.test(name)) throw new ToolError("A skill name is lowercase letters, numbers and dashes, up to 40 characters.");
    return name;
  };
  const statsFile = join(directory, ".stats.json");
  const readStats = async (): Promise<Record<string, SkillStats>> =>
    JSON.parse(await readFile(statsFile, "utf8").catch(() => "{}")) as Record<string, SkillStats>;
  const writeStats = async (all: Record<string, SkillStats>) => {
    await mkdir(directory, { recursive: true });
    await writeFile(statsFile, JSON.stringify(all, null, 2));
  };
  /** Older versions stay in the skill's own folder so a bad revision can be undone by hand. */
  const keepHistory = async (name: string) => {
    const before = await readFile(pathOf(name), "utf8").catch(() => null);
    if (before === null) return;
    const folder = join(directory, name, "history");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`), before);
    const old = (await readdir(folder)).sort().slice(0, -10);
    for (const file of old) await rm(join(folder, file), { force: true });
  };
  return {
    pathOf: (name) => pathOf(valid(name)),
    stats: readStats,
    async touch(name) {
      if (!NAME.test(name)) return;
      const all = await readStats();
      const entry = all[name] ?? { uses: 0 };
      all[name] = { ...entry, uses: entry.uses + 1, lastUsed: new Date().toISOString() };
      await writeStats(all).catch(() => undefined);
    },
    async learn(skill, note) {
      valid(skill.name);
      const existed = (await stat(pathOf(skill.name)).catch(() => null)) !== null;
      await keepHistory(skill.name);
      await mkdir(join(directory, skill.name), { recursive: true });
      await writeFile(pathOf(skill.name), renderSkill(skill));
      const all = await readStats();
      const entry = all[skill.name] ?? { uses: 0 };
      all[skill.name] = {
        ...entry,
        origin: "learned",
        revisions: (entry.revisions ?? 0) + (existed ? 1 : 0),
        note,
        updatedAt: new Date().toISOString(),
      };
      await writeStats(all);
      return { created: !existed };
    },
    async list() {
      const names = await readdir(directory).catch(() => [] as string[]);
      const out: Pick<Skill, "name" | "description">[] = [];
      for (const name of names.sort()) {
        if (!NAME.test(name)) continue;
        const text = await readFile(pathOf(name), "utf8").catch(() => null);
        if (text === null) continue;
        out.push({ name, description: parseSkill(text).description });
      }
      return out;
    },
    async get(name) {
      if (!NAME.test(name)) return null;
      const text = await readFile(pathOf(name), "utf8").catch(() => null);
      if (text === null) return null;
      const parsed = parseSkill(text);
      return { name, description: parsed.description, body: parsed.body };
    },
    async save(skill) {
      valid(skill.name);
      await mkdir(join(directory, skill.name), { recursive: true });
      await writeFile(pathOf(skill.name), renderSkill(skill));
      return pathOf(skill.name);
    },
    async install(name, files, source) {
      valid(name);
      if (!files.has("SKILL.md")) throw new ToolError("A skill needs a SKILL.md file.");
      const root = join(directory, name);
      const replaced = (await stat(pathOf(name)).catch(() => null)) !== null;
      await keepHistory(name);
      for (const [relative, data] of files) {
        const target = resolve(root, relative);
        if (target !== root && !target.startsWith(root + sep)) throw new ToolError(`Unsafe path in skill: ${relative}`);
        if (relative.split(/[\\/]/).some((part) => part === "history" || part === ".stats.json")) continue;
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, data);
      }
      const all = await readStats();
      all[name] = { ...(all[name] ?? { uses: 0 }), origin: "installed", source, updatedAt: new Date().toISOString() };
      await writeStats(all);
      return { replaced };
    },
    async remove(name) {
      if (!NAME.test(name)) return false;
      const there = await stat(join(directory, name)).catch(() => null);
      if (!there) return false;
      await rm(join(directory, name), { recursive: true, force: true });
      return true;
    },
  };
}

/** The sentence added to the model's instructions: which skills exist. */
export function skillIndex(skills: Pick<Skill, "name" | "description">[]): string {
  if (skills.length === 0) return "";
  return (
    "Skills you can load with skill_view when a task matches: " +
    skills.map((skill) => `${skill.name} (${skill.description || "no description"})`).join("; ") +
    "."
  );
}

const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** Tools for reading, writing and removing skills. */
export function skillTools(store: SkillStore): ExtraTool[] {
  const text = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value.trim()) throw new ToolError(`"${label}" is required.`);
    return value;
  };
  return [
    {
      kind: "read",
      spec: {
        name: "skill_view",
        description: "Load a saved skill: a short how-to for a kind of task. Do this before starting a task a skill covers.",
        parameters: object({ name: { type: "string" } }, ["name"]),
      },
      prepare(args) {
        const name = text(args.name, "name").trim();
        return {
          name: "skill_view",
          kind: "read",
          summary: `Load skill ${name}`,
          scope: "read",
          async run() {
            const skill = await store.get(name);
            if (!skill) throw new ToolError(`No skill called "${name}". The ones that exist are listed in your instructions.`);
            await store.touch(name);
            const folder = dirname(store.pathOf(name));
            const extra = (await readdir(folder).catch(() => [] as string[])).filter((file) => file !== "SKILL.md" && file !== "history" && !file.startsWith("."));
            const more = extra.length ? `\n\nThis skill's folder is ${folder}. Other files in it (read them with read_file, run scripts with run_command): ${extra.join(", ")}.` : "";
            return `# ${skill.name}\n${skill.description}\n\n${skill.body}${more}`;
          },
        };
      },
    },
    {
      kind: "write",
      spec: {
        name: "skill_save",
        description:
          "Save or improve a skill: a short, reusable how-to you worked out, such as the steps and commands for a task the person is likely to repeat. Keep it concrete and under about 60 lines. Saving over an existing name replaces it, so load it first when improving it.",
        parameters: object(
          {
            name: { type: "string", description: "Lowercase letters, numbers and dashes, such as deploy-site." },
            description: { type: "string", description: "One line saying when to use it." },
            content: { type: "string", description: "The how-to, in Markdown." },
          },
          ["name", "description", "content"],
        ),
      },
      async prepare(args, ctx) {
        const name = text(args.name, "name").trim();
        const skill: Skill = { name, description: text(args.description, "description").trim(), body: text(args.content, "content") };
        const path = store.pathOf(name);
        const before = await readFile(path, "utf8").catch(() => "");
        const after = renderSkill(skill);
        return {
          name: "skill_save",
          kind: "write",
          summary: `${before ? "Update" : "Save"} skill ${name}`,
          preview: before ? unifiedDiff(before, after) || "(no change)" : after.split("\n").map((line) => `+${line}`).join("\n"),
          scope: "skill",
          target: path,
          async run() {
            await ctx.checkpoint.save(path);
            await store.save(skill);
            return `${before ? "Updated" : "Saved"} skill ${name}.`;
          },
        };
      },
    },
    {
      kind: "write",
      spec: {
        name: "skill_delete",
        description: "Delete a saved skill.",
        parameters: object({ name: { type: "string" } }, ["name"]),
      },
      async prepare(args, ctx) {
        const name = text(args.name, "name").trim();
        const path = store.pathOf(name);
        if (!(await store.get(name))) throw new ToolError(`No skill called "${name}".`);
        return {
          name: "skill_delete",
          kind: "write",
          summary: `Delete skill ${name}`,
          scope: "skill",
          target: path,
          async run() {
            await ctx.checkpoint.save(path);
            await store.remove(name);
            return `Deleted skill ${name}.`;
          },
        };
      },
    },
  ];
}
