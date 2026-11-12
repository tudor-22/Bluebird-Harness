import { existsSync, statSync } from "node:fs";
import type { AgentBackend, AgentLevel } from "@bluebird/shared";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve as resolvePath, sep } from "node:path";
import type { Checkpoint } from "./checkpoints";
import { unifiedDiff } from "./diff";
import { fetchPage, fetchPicture, pagePictures } from "./net";
import type { ProcessManager } from "./processes";
import { runCommand } from "./sandbox";
import { ToolError, type Paths } from "./workspace";

/** What the tools run with: how much may go ahead unasked, and where relative paths start. */
export type AgentSettings = { level: AgentLevel; root?: string; backend?: AgentBackend };
export const DEFAULT_AGENT: AgentSettings = { level: "auto" };

export type ToolKind = "read" | "write" | "exec";

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
type Def = ToolSpec & { kind: ToolKind };

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_DEFS: Def[] = [
  {
    name: "read_file",
    kind: "read",
    description:
      "Read a text file anywhere on the computer. Output is numbered by line. Long files are cut at 2000 lines or 50 KB: use offset and limit to continue.",
    parameters: obj(
      {
        path: { type: "string", description: "File path: absolute, ~/…, or relative to the starting folder." },
        offset: { type: "integer", description: "First line to read (1-based)." },
        limit: { type: "integer", description: "Maximum lines to read." },
      },
      ["path"],
    ),
  },
  {
    name: "list_dir",
    kind: "read",
    description: "List the files and folders in a folder. Folders end with a slash.",
    parameters: obj(
      {
        path: { type: "string", description: "Folder to list. Defaults to the starting folder." },
        depth: { type: "integer", description: "How many levels to show (1 to 3). Default 1." },
      },
      [],
    ),
  },
  {
    name: "find_files",
    kind: "read",
    description: "Find files by name pattern, such as **/*.ts or src/**/test_*.py.",
    parameters: obj({ pattern: { type: "string", description: "Glob pattern." } }, ["pattern"]),
  },
  {
    name: "grep",
    kind: "read",
    description: "Search file contents with a regular expression. Returns up to 100 matches as path:line: text.",
    parameters: obj(
      {
        pattern: { type: "string", description: "Regular expression." },
        path: { type: "string", description: "Folder or file to search. Defaults to the starting folder." },
        glob: { type: "string", description: "Only search files matching this glob, such as *.ts." },
        ignore_case: { type: "boolean" },
      },
      ["pattern"],
    ),
  },
  {
    name: "view_image",
    kind: "read",
    description:
      "Look at an image file on the computer (png, jpg, webp or gif) and see what is in it. Use it whenever you are asked to describe, read or check a picture or screenshot.",
    parameters: obj(
      {
        path: { type: "string", description: "Image path: absolute, ~/…, or relative to the starting folder." },
        question: { type: "string", description: "What to look for. Defaults to a general description." },
      },
      ["path"],
    ),
  },
  {
    name: "page_images",
    kind: "read",
    description:
      "List the pictures on a public web page: its main share picture first, then the larger pictures in it. Use it on a page you found with the browser (an album page, a product page, a Wikipedia article) to find the right picture, then look at it with fetch_image or show it in your reply.",
    parameters: obj({ url: { type: "string", description: "The page's address, https://…" } }, ["url"]),
  },
  {
    name: "fetch_image",
    kind: "read",
    description:
      "Get a picture from a web address. Without save_to it looks at the picture (like view_image). With save_to it downloads the file to that path on the computer, which asks for approval like any file change. Only public pictures can be fetched.",
    parameters: obj(
      {
        url: { type: "string", description: "The picture's address, https://…" },
        save_to: { type: "string", description: "Where to save it, such as ~/Downloads/cat.jpg. Leave out to just look." },
        question: { type: "string", description: "What to look for when looking. Defaults to a general description." },
      },
      ["url"],
    ),
  },
  {
    name: "write_file",
    kind: "write",
    description:
      "Create a file, or replace a whole file. An existing file must be read with read_file first. Prefer edit_file for changes to existing files.",
    parameters: obj(
      {
        path: { type: "string", description: "File path: absolute, ~/…, or relative to the starting folder." },
        content: { type: "string", description: "The complete new contents." },
      },
      ["path", "content"],
    ),
  },
  {
    name: "edit_file",
    kind: "write",
    description:
      "Change an existing file by replacing exact text. Each oldText must match exactly one place in the file as it is now; include enough surrounding lines to make it unique. Read the file first.",
    parameters: obj(
      {
        path: { type: "string", description: "File path: absolute, ~/…, or relative to the starting folder." },
        edits: {
          type: "array",
          items: obj({ oldText: { type: "string" }, newText: { type: "string" } }, ["oldText", "newText"]),
        },
      },
      ["path", "edits"],
    ),
  },
  {
    name: "run_command",
    kind: "exec",
    description:
      "Run a shell command on the person's computer, like a terminal, starting in the starting folder. Pipes, redirects, &&, and any installed program work. Output is cut to the last 50 KB.",
    parameters: obj(
      {
        command: { type: "string", description: "The shell command." },
        cwd: { type: "string", description: "Folder to run in. Defaults to the starting folder." },
        timeout_seconds: { type: "integer", description: "Stop after this long. Default 60, at most 600." },
        background: {
          type: "boolean",
          description: "Start it and return at once with a process id, for servers, watchers and long jobs. Check on it with process_output.",
        },
      },
      ["command"],
    ),
  },
  {
    name: "process_list",
    kind: "read",
    description: "List the background processes started with run_command, and whether each is still running.",
    parameters: obj({}, []),
  },
  {
    name: "process_output",
    kind: "read",
    description:
      "Read the latest output of a background process. With wait_seconds it waits for new output or for the process to end.",
    parameters: obj(
      {
        id: { type: "string", description: "The process id, such as p1." },
        wait_seconds: { type: "integer", description: "Wait up to this long (at most 30) for something new." },
      },
      ["id"],
    ),
  },
  {
    name: "process_stop",
    kind: "read",
    description: "Stop a background process that you started.",
    parameters: obj({ id: { type: "string", description: "The process id." } }, ["id"]),
  },
  {
    name: "delegate_task",
    kind: "read",
    description:
      "Hand a self-contained job to a helper agent that works on its own and reports back. Use it for research, searching a large codebase, or a side task, so this conversation stays focused. The helper starts with no memory of this conversation, so say everything it needs. It can only look (read, search, browse the web) unless you set can_change to true, in which case its changes still follow the person's approval settings.",
    parameters: obj(
      {
        task: { type: "string", description: "What to do, with all the detail the helper needs, and what to report." },
        can_change: { type: "boolean", description: "Let the helper edit files and run commands too. Default false." },
      },
      ["task"],
    ),
  },
  {
    name: "swarm_run",
    kind: "read",
    description:
      "Start a team of specialised agents (at most 4) that work at the same time on separate parts of one goal and report back together. Only for /swarm requests. Each agent starts with no memory of this conversation, so each brief must be complete. Agents can leave notes for each other on a shared board. Only one agent may use the browser.",
    parameters: obj(
      {
        goal: { type: "string", description: "The overall goal every agent is working towards." },
        agents: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          description: "Up to four agents.",
          items: {
            type: "object",
            properties: {
              role: { type: "string", description: "The specialty, such as researcher, implementer, reviewer or tester." },
              task: { type: "string", description: "A complete brief: what to do, what to report, and what it owns." },
              can_change: { type: "boolean", description: "Let this agent edit files and run commands. Default false." },
              browser: { type: "boolean", description: "Let this agent use the browser. Only one agent may." },
            },
            required: ["role", "task"],
            additionalProperties: false,
          },
        },
      },
      ["goal", "agents"],
    ),
  },
];

/** The names of tools that change nothing, for a helper that may only look. */
export const READ_ONLY_TOOLS = TOOL_DEFS.filter((def) => def.kind === "read").map((def) => def.name);

/** Every tool is offered at every level; the level decides what waits for approval. */
export function toolsFor(options: { extra?: ExtraTool[]; only?: (name: string) => boolean } = {}): ToolSpec[] {
  const core = TOOL_DEFS.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const extra = (options.extra ?? []).map((tool) => tool.spec);
  return [...core, ...extra].filter((tool) => (options.only ? options.only(tool.name) : true));
}

/** A result that also hands pictures to the model. */
export type ToolOutput = { text: string; images: { mime: string; base64: string; label: string }[] };

/** A tool that comes from outside the built-in set: an MCP server, a skill, a schedule. */
export type ExtraTool = {
  spec: ToolSpec;
  kind: ToolKind;
  prepare(args: Record<string, unknown>, ctx: ToolContext): Promise<Prepared> | Prepared;
};

export type ToolContext = {
  /** Tools added from outside. */
  extra?: ExtraTool[];
  /** Commands running in the background. */
  processes?: ProcessManager;
  /** Whether the current model can see, and a way to ask another model that can. */
  vision?: {
    native: boolean;
    describe?: (image: { mime: string; base64: string }, question: string) => Promise<string | null>;
  };
  jail: Paths;
  settings: AgentSettings;
  /** What the model has read, and the file's modified time then. */
  reads: Map<string, number>;
  checkpoint: Checkpoint;
  signal?: AbortSignal;
};

/** A call checked and ready to run: what it will do, and how to do it. */
export type Prepared = {
  name: string;
  kind: ToolKind;
  /** One line for the person: "Edit src/app.ts". */
  summary: string;
  /** The diff or command to show before approval. */
  preview?: string;
  /** The file a write tool changes, as an absolute path. */
  target?: string;
  /** Whether Auto may run this without asking, when the tool itself knows better than the patterns. */
  autoSafe?: boolean;
  /** A key for "always allow" rules. */
  scope: string;
  run(): Promise<string | ToolOutput>;
};

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const READ_LINES = 2000;
const READ_BYTES = 50_000;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".venv", "__pycache__", ".cache", "coverage"]);

const asString = (value: unknown, name: string, optional = false): string => {
  if (typeof value === "string") return value;
  if (optional && value === undefined) return "";
  throw new ToolError(`"${name}" must be a string.`);
};
const asInt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;

async function isText(path: string): Promise<boolean> {
  const buffer = await readFile(path);
  return !buffer.subarray(0, 8000).includes(0);
}

function globToRegex(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else source += ".*";
      } else source += "[^/]*";
    } else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

async function* walk(dir: string, limit = { files: 8000 }): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full, limit);
    } else if (entry.isFile()) {
      if (limit.files-- <= 0) return;
      yield full;
    }
  }
}

/** Shows a picture to the model, or asks another model that can see, or says how to fix it. */
export async function lookAt(
  ctx: ToolContext,
  image: { mime: string; base64: string; label: string; question: string },
): Promise<string | ToolOutput> {
  const question = image.question || "Describe this image in detail: what it shows, any text in it, colours and layout.";
  if (ctx.vision?.native) {
    return { text: `The image ${image.label} is attached in the next message.`, images: [{ mime: image.mime, base64: image.base64, label: image.label }] };
  }
  // The chosen model cannot see: borrow another connected model that can.
  const seen = await ctx.vision?.describe?.({ mime: image.mime, base64: image.base64 }, question);
  if (seen) return `What a vision model sees in ${image.label}:\n${seen}`;
  throw new ToolError(
    "The current model cannot see images and no other connected model can. Connect or choose a vision model in Settings, Engine (such as a Gemini, GPT-4o, Qwen-VL or LLaVA model), then ask again.",
  );
}

/** Checks a call and prepares it. Throws ToolError with a message the model can act on. */
export async function prepare(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<Prepared> {
  const { jail } = ctx;
  switch (name) {
    case "read_file": {
      const path = jail.resolve(asString(args.path, "path"));
      return {
        name,
        kind: "read",
        summary: `Read ${jail.display(path)}`,
        scope: "read",
        async run() {
          const info = await stat(path).catch(() => null);
          if (!info) throw new ToolError(`No such file: ${jail.display(path)}.`);
          if (info.isDirectory()) throw new ToolError(`${jail.display(path)} is a folder: use list_dir.`);
          if (IMAGE_TYPES[extname(path).toLowerCase()]) {
            throw new ToolError(`${jail.display(path)} is an image. Use view_image to look at it.`);
          }
          if (!(await isText(path))) throw new ToolError(`${jail.display(path)} is not a text file.`);
          const lines = (await readFile(path, "utf8")).split("\n");
          ctx.reads.set(path, info.mtimeMs);
          const first = Math.max(1, asInt(args.offset) ?? 1);
          const limit = Math.min(READ_LINES, Math.max(1, asInt(args.limit) ?? READ_LINES));
          const out: string[] = [];
          let bytes = 0;
          let n = first;
          for (; n < first + limit && n <= lines.length; n++) {
            const row = `${n}\t${lines[n - 1]}`;
            bytes += row.length + 1;
            if (bytes > READ_BYTES) break;
            out.push(row);
          }
          const more = n <= lines.length ? `\n[Showing lines ${first}-${n - 1} of ${lines.length}. Continue with offset ${n}.]` : "";
          return (out.join("\n") || "(empty file)") + more;
        },
      };
    }
    case "list_dir": {
      const path = jail.resolve(asString(args.path, "path", true) || ".");
      const depth = Math.min(3, Math.max(1, asInt(args.depth) ?? 1));
      return {
        name,
        kind: "read",
        summary: `List ${jail.display(path)}`,
        scope: "read",
        async run() {
          const out: string[] = [];
          const visit = async (dir: string, level: number) => {
            for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
              if (out.length >= 300) return;
              if (SKIP_DIRS.has(entry.name) && level > 0) continue;
              const rel = relative(path, join(dir, entry.name));
              out.push(entry.isDirectory() ? `${rel}/` : rel);
              if (entry.isDirectory() && level + 1 < depth && !entry.isSymbolicLink()) await visit(join(dir, entry.name), level + 1);
            }
          };
          const info = await stat(path).catch(() => null);
          if (!info?.isDirectory()) throw new ToolError(`${jail.display(path)} is not a folder.`);
          await visit(path, 0);
          return out.length ? out.join("\n") + (out.length >= 300 ? "\n[Listing cut at 300 entries.]" : "") : "(empty folder)";
        },
      };
    }
    case "find_files": {
      const pattern = asString(args.pattern, "pattern");
      const re = globToRegex(pattern);
      return {
        name,
        kind: "read",
        summary: `Find ${pattern}`,
        scope: "read",
        async run() {
          const hits: string[] = [];
          for await (const file of walk(jail.root)) {
            const rel = relative(jail.root, file).split(sep).join("/");
            if (re.test(rel) || (!pattern.includes("/") && re.test(rel.split("/").pop() ?? ""))) hits.push(rel);
            if (hits.length >= 200) break;
          }
          return hits.length ? hits.join("\n") : "No files matched.";
        },
      };
    }
    case "grep": {
      const pattern = asString(args.pattern, "pattern");
      let re: RegExp;
      try {
        re = new RegExp(pattern, args.ignore_case ? "i" : "");
      } catch {
        throw new ToolError("The pattern is not a valid regular expression.");
      }
      const base = jail.resolve(asString(args.path, "path", true) || ".");
      const fileGlob = args.glob ? globToRegex(asString(args.glob, "glob")) : null;
      return {
        name,
        kind: "read",
        summary: `Search for ${pattern}`,
        scope: "read",
        async run() {
          const info = await stat(base).catch(() => null);
          if (!info) throw new ToolError("That path does not exist.");
          const files: AsyncIterable<string> | string[] = info.isDirectory() ? walk(base) : [base];
          const hits: string[] = [];
          for await (const file of files) {
            const rel = relative(jail.root, file).split(sep).join("/");
            if (fileGlob && !fileGlob.test(rel) && !fileGlob.test(rel.split("/").pop() ?? "")) continue;
            let size = 0;
            try {
              size = (await stat(file)).size;
              if (size > 1_000_000 || !(await isText(file))) continue;
            } catch {
              continue;
            }
            const lines = (await readFile(file, "utf8")).split("\n");
            for (let i = 0; i < lines.length && hits.length < 100; i++) {
              if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].slice(0, 300)}`);
            }
            if (hits.length >= 100) break;
          }
          return hits.length ? hits.join("\n") + (hits.length >= 100 ? "\n[Cut at 100 matches.]" : "") : "No matches.";
        },
      };
    }
    case "view_image": {
      const path = jail.resolve(asString(args.path, "path"));
      const question = asString(args.question, "question", true).trim();
      return {
        name,
        kind: "read",
        summary: `View ${jail.display(path)}`,
        scope: "read",
        async run() {
          const mime = IMAGE_TYPES[extname(path).toLowerCase()];
          if (!mime) throw new ToolError(`${jail.display(path)} is not a png, jpg, webp or gif image.`);
          const info = await stat(path).catch(() => null);
          if (!info || !info.isFile()) throw new ToolError(`No such file: ${jail.display(path)}.`);
          if (info.size > IMAGE_MAX_BYTES) throw new ToolError(`${jail.display(path)} is larger than 5 MB.`);
          const base64 = (await readFile(path)).toString("base64");
          return lookAt(ctx, { mime, base64, label: `${jail.display(path)} (${Math.round(info.size / 1024)} KB)`, question });
        },
      };
    }
    case "process_list": {
      return {
        name,
        kind: "read",
        summary: "List background processes",
        scope: "read",
        async run() {
          const all = ctx.processes?.list() ?? [];
          if (all.length === 0) return "No background processes.";
          return all
            .map((p) => `${p.id}  ${p.running ? "running" : `finished (exit ${p.exitCode ?? p.signal ?? "?"})`}  ${Math.round((Date.now() - p.startedAt) / 1000)} s  ${p.command}`)
            .join("\n");
        },
      };
    }
    case "process_output": {
      const id = asString(args.id, "id").trim();
      const wait = asInt(args.wait_seconds) ?? 0;
      return {
        name,
        kind: "read",
        summary: `Read output of ${id}`,
        scope: "read",
        async run() {
          const result = await ctx.processes?.read(id, { waitMs: wait * 1000 });
          if (!result) throw new ToolError(`No background process "${id}". Use process_list.`);
          const state = result.info.running ? "still running" : `finished (exit ${result.info.exitCode ?? result.info.signal ?? "?"})`;
          return `${id} is ${state}.\n${result.output || "(no output yet)"}`;
        },
      };
    }
    case "process_stop": {
      const id = asString(args.id, "id").trim();
      return {
        name,
        kind: "read",
        summary: `Stop ${id}`,
        scope: "read",
        async run() {
          if (!ctx.processes?.stop(id)) throw new ToolError(`"${id}" is not a running background process.`);
          return `Stopped ${id}.`;
        },
      };
    }
    case "page_images": {
      const url = asString(args.url, "url").trim();
      return {
        name,
        kind: "read",
        summary: `Find pictures on ${url.length > 70 ? url.slice(0, 67) + "…" : url}`,
        scope: "read",
        async run() {
          const page = await fetchPage(url, { signal: ctx.signal });
          const pictures = pagePictures(page.html, page.url);
          if (pictures.length === 0) return "No usable pictures were found on that page.";
          return `Pictures on ${page.url} (the first is usually the main one):\n${pictures.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
        },
      };
    }
    case "fetch_image": {
      const url = asString(args.url, "url").trim();
      const saveTo = asString(args.save_to, "save_to", true).trim();
      const question = asString(args.question, "question", true).trim();
      const target = saveTo ? jail.resolve(saveTo, { write: true }) : undefined;
      return {
        name,
        // Saving a download changes files, so it is a write and asks like one.
        kind: target ? "write" : "read",
        summary: target ? `Download ${url.length > 60 ? url.slice(0, 57) + "…" : url} to ${jail.display(target)}` : `Look at ${url.length > 70 ? url.slice(0, 67) + "…" : url}`,
        preview: target ? `${url}\n→ ${target}` : undefined,
        target,
        scope: target ? "edit" : "read",
        async run() {
          const picture = await fetchPicture(url, { signal: ctx.signal });
          const label = `${new URL(picture.url).hostname}${new URL(picture.url).pathname.split("/").pop() ? "/" + new URL(picture.url).pathname.split("/").pop() : ""} (${Math.round(picture.bytes.length / 1024)} KB)`;
          if (target) {
            await ctx.checkpoint.save(target);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, picture.bytes);
            return `Saved ${label} to ${jail.display(target)}.`;
          }
          const seen = await lookAt(ctx, { mime: picture.mime, base64: picture.bytes.toString("base64"), label, question });
          const note = `\nTo show it to the person, put ![short caption](${picture.url}) in your reply.`;
          return typeof seen === "string" ? seen + note : { ...seen, text: seen.text + note };
        },
      };
    }
    case "write_file": {
      const path = jail.resolve(asString(args.path, "path"), { write: true });
      const content = asString(args.content, "content");
      if (content.length > 1_000_000) throw new ToolError("That file is too large to write in one call.");
      const existing = await stat(path).catch(() => null);
      if (existing?.isDirectory()) throw new ToolError(`${jail.display(path)} is a folder.`);
      let before = "";
      if (existing) {
        if (!(await isText(path))) throw new ToolError(`${jail.display(path)} is not a text file.`);
        if (!ctx.reads.has(path)) {
          throw new ToolError(`${jail.display(path)} already exists. Read it with read_file before replacing it.`);
        }
        if (ctx.reads.get(path) !== existing.mtimeMs) {
          throw new ToolError(`${jail.display(path)} changed since you read it. Read it again first.`);
        }
        before = await readFile(path, "utf8");
      }
      const diff = unifiedDiff(before, content);
      return {
        name,
        kind: "write",
        summary: `${existing ? "Replace" : "Create"} ${jail.display(path)}`,
        preview: existing ? diff || "(no change)" : content.split("\n").slice(0, 200).map((line) => `+${line}`).join("\n"),
        scope: "edit",
        target: path,
        async run() {
          await ctx.checkpoint.save(path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content);
          ctx.reads.set(path, (await stat(path)).mtimeMs);
          return `${existing ? "Replaced" : "Created"} ${jail.display(path)} (${content.split("\n").length} lines).`;
        },
      };
    }
    case "edit_file": {
      const path = jail.resolve(asString(args.path, "path"), { write: true });
      const edits = args.edits;
      if (!Array.isArray(edits) || edits.length === 0) throw new ToolError('"edits" must be a list of {oldText, newText}.');
      const info = await stat(path).catch(() => null);
      if (!info || info.isDirectory()) throw new ToolError(`No such file: ${jail.display(path)}. Use write_file to create it.`);
      if (!(await isText(path))) throw new ToolError(`${jail.display(path)} is not a text file.`);
      if (!ctx.reads.has(path)) throw new ToolError(`Read ${jail.display(path)} with read_file before editing it.`);
      if (ctx.reads.get(path) !== info.mtimeMs) {
        throw new ToolError(`${jail.display(path)} changed since you read it. Read it again first.`);
      }
      const before = await readFile(path, "utf8");
      // Every edit is matched against the file as it was, so edits cannot disturb each other.
      const spans: { start: number; end: number; text: string }[] = [];
      edits.forEach((raw, index) => {
        const edit = raw as { oldText?: unknown; newText?: unknown };
        if (typeof edit?.oldText !== "string" || typeof edit?.newText !== "string" || edit.oldText === "") {
          throw new ToolError(`Edit ${index + 1} needs a non-empty oldText and a newText.`);
        }
        const first = before.indexOf(edit.oldText);
        if (first === -1) {
          throw new ToolError(`Edit ${index + 1}: oldText was not found. It must match the file exactly, including spaces and line breaks. Read the file again.`);
        }
        if (before.indexOf(edit.oldText, first + 1) !== -1) {
          throw new ToolError(`Edit ${index + 1}: oldText matches more than one place. Include more surrounding lines so it is unique.`);
        }
        spans.push({ start: first, end: first + edit.oldText.length, text: edit.newText });
      });
      spans.sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) {
        if (spans[i].start < spans[i - 1].end) throw new ToolError("Two edits overlap. Merge them into one.");
      }
      let after = "";
      let cursor = 0;
      for (const span of spans) {
        after += before.slice(cursor, span.start) + span.text;
        cursor = span.end;
      }
      after += before.slice(cursor);
      return {
        name,
        kind: "write",
        summary: `Edit ${jail.display(path)}`,
        preview: unifiedDiff(before, after) || "(no change)",
        scope: "edit",
        target: path,
        async run() {
          await ctx.checkpoint.save(path);
          await writeFile(path, after);
          ctx.reads.set(path, (await stat(path)).mtimeMs);
          return `Edited ${jail.display(path)}: ${spans.length} change${spans.length === 1 ? "" : "s"} applied.`;
        },
      };
    }
    case "run_command": {
      const command = asString(args.command, "command").trim();
      if (!command) throw new ToolError("A command is required.");
      const seconds = Math.min(600, Math.max(1, asInt(args.timeout_seconds) ?? 60));
      // Where it starts: the starting folder, or any folder that exists.
      const where = asString(args.cwd, "cwd", true);
      let cwd = jail.root;
      if (where) {
        const target = resolvePath(jail.root, where.replace(/^~(?=$|\/)/, process.env.HOME ?? jail.root));
        const remote = ctx.settings.backend?.type === "ssh" || ctx.settings.backend?.type === "custom";
        if (!remote && (!existsSync(target) || !statSync(target).isDirectory())) throw new ToolError(`The folder ${where} does not exist.`);
        cwd = target;
      }
      return {
        name,
        kind: "exec",
        summary: `Run ${command.length > 80 ? command.slice(0, 77) + "…" : command}`,
        preview: command,
        scope: commandScope(command),
        async run() {
          if (args.background === true) {
            if (!ctx.processes) throw new ToolError("Background processes are not available here.");
            const started = ctx.processes.start(command, { cwd, backend: ctx.settings.backend });
            return `Started ${started.id} in the background: ${command}\nUse process_output with id "${started.id}" to read its output, and process_stop to end it.`;
          }
          const result = await runCommand(command, { cwd, timeoutMs: seconds * 1000, signal: ctx.signal, backend: ctx.settings.backend });
          const head = result.timedOut ? `Stopped after ${seconds} s.` : `Exit code ${result.exitCode}.`;
          return `${head}${result.truncated ? " (Output cut to the last 50 KB.)" : ""}\n${result.output || "(no output)"}`;
        },
      };
    }
    default: {
      const extra = ctx.extra?.find((tool) => tool.spec.name === name);
      if (extra) return extra.prepare(args, ctx);
      throw new ToolError(`Unknown tool "${name}".`);
    }
  }
}

/** The "always allow" key for a command: its program and subcommand, never a compound line. */
export function commandScope(command: string): string {
  if (/[;&|`$()<>\n]/.test(command)) return `cmd:${command}`;
  const [program, second] = command.split(/\s+/);
  return second && !second.startsWith("-") ? `cmd:${program} ${second}` : `cmd:${program}`;
}
