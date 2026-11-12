import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMentionNote, fuzzyScore, parseFileMentions, parseSkillCommand, searchFiles } from "./mentions";
import { createPaths } from "./workspace";

async function project() {
  const root = await mkdtemp(join(tmpdir(), "mentions-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "dep"), { recursive: true });
  await writeFile(join(root, "src", "app.ts"), "export const answer = 42;\n");
  await writeFile(join(root, "README.md"), "# Hello\n");
  await writeFile(join(root, ".env"), "SECRET=1\n");
  await writeFile(join(root, "node_modules", "dep", "app.js"), "ignored");
  await writeFile(join(root, "logo.bin"), Buffer.from([0, 1, 2, 3]));
  return root;
}

describe("parseFileMentions", () => {
  it("finds @paths after whitespace and trims trailing punctuation", () => {
    expect(parseFileMentions("read @src/app.ts, then @README.md.")).toEqual(["src/app.ts", "README.md"]);
    expect(parseFileMentions("email me@example.com")).toEqual([]);
  });
});

describe("parseSkillCommand", () => {
  it("reads a leading /skill and the request after it", () => {
    expect(parseSkillCommand("/code-review the diff")).toEqual({ name: "code-review", rest: "the diff" });
    expect(parseSkillCommand("not /a command")).toBeNull();
  });
});

describe("fuzzyScore", () => {
  it("ranks prefix and exact matches above scattered ones", () => {
    expect(fuzzyScore("app", "app.ts")).toBeGreaterThan(fuzzyScore("app", "my-app.ts"));
    expect(fuzzyScore("zzz", "app.ts")).toBe(0);
    expect(fuzzyScore("apt", "app.ts")).toBeGreaterThan(0);
  });
});

describe("searchFiles", () => {
  it("finds files by name, skips dependencies and secrets", async () => {
    const root = await project();
    const hits = await searchFiles(root, "app");
    expect(hits.map((hit) => hit.path)).toContain("src/app.ts");
    expect(hits.map((hit) => hit.path)).not.toContain("node_modules/dep/app.js");
    expect((await searchFiles(root, "env")).map((hit) => hit.name)).not.toContain(".env");
  });

  it("lists everything when nothing is typed yet", async () => {
    const root = await project();
    expect((await searchFiles(root, "")).length).toBeGreaterThan(1);
  });
});

describe("buildMentionNote", () => {
  const skills = { get: async (name: string) => (name === "tidy" ? { name, description: "d", body: "Step one." } : null) };

  it("inlines a mentioned file, lists a folder and loads a skill", async () => {
    const root = await project();
    const paths = createPaths(root);
    const note = await buildMentionNote("/tidy look at @src/app.ts and @src", paths, skills);
    expect(note).toContain("Step one.");
    expect(note).toContain("export const answer = 42;");
    expect(note).toContain("Folder @src");
    expect(note).toContain("app.ts");
  });

  it("explains binary files, missing files and secrets instead of failing", async () => {
    const root = await project();
    const paths = createPaths(root);
    const note = await buildMentionNote("@logo.bin @nope.txt @.env", paths, skills);
    expect(note).toContain("binary file");
    expect(note).toContain("@nope.txt was not found");
    expect(note).toContain("@.env was not found or cannot be read");
    expect(note).not.toContain("SECRET=1");
  });

  it("adds nothing when there is nothing to resolve", async () => {
    const root = await project();
    expect(await buildMentionNote("hello there", createPaths(root), skills)).toBeNull();
  });
});

describe("the built-in Browser", () => {
  it("tells the model to use its own browser tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "mentions-browser-"));
    const note = await buildMentionNote("@Browser find the latest GB10 specs", createPaths(root), { get: async () => null }, []);
    expect(note).toContain("browser_open");
    expect(note).toContain("not use the desktop_* tools");
  });
});
