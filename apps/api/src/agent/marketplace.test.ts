import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMarketplace, parseGithubSource, slugName } from "./marketplace";
import { createSkillStore } from "./skills";

async function temp() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  return mkdtemp(join(process.cwd(), ".data", "market-"));
}

const SKILL = "---\nname: PDF Tools\ndescription: Work with PDFs\nallowed-tools: Bash\n---\n\nUse the script.\n";

describe("source parsing", () => {
  it("understands owner/repo, paths and github addresses", () => {
    expect(parseGithubSource("anthropics/skills")).toMatchObject({ owner: "anthropics", repo: "skills", path: "" });
    expect(parseGithubSource("github:a/b/skills/pdf")).toMatchObject({ path: "skills/pdf" });
    expect(parseGithubSource("https://github.com/a/b/tree/main/skills/pdf/SKILL.md")).toMatchObject({ ref: "main", path: "skills/pdf" });
    expect(() => parseGithubSource("https://evil.example/a/b")).toThrow();
    expect(() => parseGithubSource("a/b/../c")).toThrow();
  });
  it("makes names the store accepts", () => {
    expect(slugName("PDF Tools!")).toBe("pdf-tools");
    expect(slugName("x".repeat(80)).length).toBe(40);
  });
});

describe("the marketplace", () => {
  it("lists skills found in Claude Code and Codex folders and installs the whole folder", async () => {
    const home = await temp();
    await mkdir(join(home, ".claude", "skills", "pdf", "scripts"), { recursive: true });
    await writeFile(join(home, ".claude", "skills", "pdf", "SKILL.md"), SKILL);
    await writeFile(join(home, ".claude", "skills", "pdf", "scripts", "run.py"), "print('hi')");
    await mkdir(join(home, ".codex", "skills", "notes"), { recursive: true });
    await writeFile(join(home, ".codex", "skills", "notes", "SKILL.md"), "---\nname: notes\ndescription: Take notes\n---\nBody");
    const store = createSkillStore(join(home, "store"));
    const market = createMarketplace(store, { home, fetcher: async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) }) });
    const list = await market.browse();
    expect(list.map((s) => s.name)).toEqual(["notes", "pdf-tools"]);
    const pdf = list.find((s) => s.name === "pdf-tools")!;
    expect(await market.install(pdf.id)).toEqual(["pdf-tools"]);
    expect(await readFile(join(home, "store", "pdf-tools", "scripts", "run.py"), "utf8")).toContain("hi");
    expect((await store.get("pdf-tools"))?.description).toBe("Work with PDFs");
    expect((await market.browse()).find((s) => s.name === "pdf-tools")?.installed).toBe(true);
    await expect(market.install("/etc")).rejects.toThrow(/not in a Claude Code or Codex/);
  });

  it("installs a skill from GitHub", async () => {
    const home = await temp();
    const files: Record<string, string> = { "skills/pdf/SKILL.md": SKILL, "skills/pdf/ref.md": "reference", "skills/other/SKILL.md": "---\nname: other\ndescription: d\n---\nx" };
    const fetcher = async (url: string) => {
      if (url.includes("api.github.com")) {
        return { ok: true, status: 200, json: async () => ({ tree: Object.keys(files).map((path) => ({ path, type: "blob", size: files[path].length })) }), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
      }
      const path = decodeURIComponent(url.split("/HEAD/")[1]);
      const body = Buffer.from(files[path] ?? "");
      return { ok: path in files, status: path in files ? 200 : 404, json: async () => ({}), text: async () => body.toString(), arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer };
    };
    const store = createSkillStore(join(home, "store"));
    const market = createMarketplace(store, { home, fetcher });
    expect(await market.install("o/r/skills/pdf")).toEqual(["pdf-tools"]);
    expect(await readFile(join(home, "store", "pdf-tools", "ref.md"), "utf8")).toBe("reference");
    expect((await market.install("o/r")).sort()).toEqual(["other", "pdf-tools"]);
  });
});
