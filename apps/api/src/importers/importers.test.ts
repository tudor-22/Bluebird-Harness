import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSkillStore } from "../agent/skills";
import { withUser } from "../db/pool";
import { createHarness, type Harness } from "../test/harness";
import { applyImport, describeReport } from "./apply";
import { findHermesHome, hermesEntries, readHermes } from "./hermes";
import { localUserId } from "./index";
import { frontmatter, markdownEntries } from "./markdown";
import { findOpenClaw, parseJson5, readOpenClaw } from "./openclaw";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

/** A scratch copy of the fixtures, with a Hermes state.db built from the SQL fixture. */
async function scratch() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "import-"));
  await cp(FIXTURES, dir, { recursive: true });
  const hermes = join(dir, "hermes-home", ".hermes");
  const db = new DatabaseSync(join(hermes, "state.db"));
  db.exec(await readFile(join(FIXTURES, "hermes-state.sql"), "utf8"));
  db.close();
  return { dir, hermes, openclawHome: join(dir, "openclaw-home"), skillsDir: join(dir, "bluebird-skills") };
}

/** A fingerprint of every file under a folder, to prove the sources were not touched. */
async function fingerprint(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out[relative(root, full)] = createHash("sha1").update(await readFile(full)).digest("hex");
    }
  };
  await walk(root);
  return out;
}

describe("reading Hermes Agent", () => {
  it("splits memory files on the § delimiter", () => {
    expect(hermesEntries("one\n§\ntwo\nlines\n§\n\n§\nthree")).toEqual(["one", "two\nlines", "three"]);
    expect(hermesEntries("\uFEFFonly one, with a § inside")).toEqual(["only one, with a § inside"]);
  });

  it("finds memories and skills, skips bundled skills, and leaves history out unless asked", async () => {
    const { hermes } = await scratch();
    const plan = await readHermes(hermes);
    expect(plan.memories.map((m) => [m.type, m.content])).toEqual([
      ["fact", "Name: Sam. Lives in Lisbon."],
      ["preference", "Prefers short answers in British English."],
      ["preference", "Never schedule meetings before 10:00."],
      ["fact", "Works on Project Aurora, a Rust audio plugin."],
      ["fact", "The user's staging server is staging.example.test and deploys with `make ship`."],
      ["fact", "Tests run with cargo nextest; the plain cargo test runner is too slow on this repo."],
    ]);
    expect(plan.skills.map((s) => [s.name, s.description])).toEqual([["deploy-site", "Build the site and push it to the staging server."]]);
    expect(plan.skipped.map((s) => s.what)).toEqual(["skill research/arxiv", "past conversations in state.db"]);
    expect(plan.messages).toEqual([]);
    const bundled = await readHermes(hermes, { includeBundled: true });
    expect(bundled.skills.map((s) => s.name)).toEqual(["deploy-site", "arxiv"]);
  });

  it("reads only what the person and the agent said in visible sessions", async () => {
    const { hermes } = await scratch();
    const plan = await readHermes(hermes, { history: true });
    expect(plan.sessions).toBe(2);
    expect(plan.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "The reverb tail clicks at 48 kHz."],
      ["assistant", "The buffer is not cleared on sample-rate change."],
      ["user", "Book me a train to Porto."],
      ["assistant", "The 09:09 Alfa Pendular has seats."],
    ]);
    expect(plan.messages[0].at).toBe("2025-11-01T09:00:01.000Z");
    expect(new Set(plan.messages.map((m) => m.key)).size).toBe(4);
  });

  it("finds the home folder the way Hermes does", async () => {
    const { dir, hermes } = await scratch();
    const home = join(dir, "hermes-home");
    expect(await findHermesHome({}, home)).toBe(hermes);
    await writeFile(join(hermes, "active_profile"), "work\n");
    expect(await findHermesHome({}, home)).toBe(join(hermes, "profiles", "work"));
    expect(await findHermesHome({ HERMES_HOME: join(hermes, "profiles", "work") }, home)).toBe(join(hermes, "profiles", "work"));
    await writeFile(join(hermes, "active_profile"), "../escape\n");
    expect(await findHermesHome({}, home)).toBe(hermes);
  });
});

describe("reading OpenClaw", () => {
  it("reads JSON5 config", () => {
    expect(parseJson5("// c\n{ a: 'x', b: [1, 2,], /* d */ c: \"it's\", }")).toEqual({ a: "x", b: [1, 2], c: "it's" });
    expect(parseJson5("{ broken")).toBeNull();
  });

  it("finds the workspace, its memories and skills by precedence", async () => {
    const { openclawHome } = await scratch();
    const location = await findOpenClaw({}, openclawHome);
    expect(location.workspace).toBe(join(openclawHome, ".openclaw", "workspace"));
    const plan = await readOpenClaw(location);
    expect(plan.memories.map((m) => [m.type, m.content])).toEqual([
      ["preference", "Prefer concise progress updates during implementation work."],
      ["preference", "Always write dates as YYYY-MM-DD."],
      ["preference", "Alex is the user's partner; they share a calendar."],
      ["fact", "The home lab runs Proxmox 8 on a single NUC."],
      ["fact", "Decided on 2026-10-20 to move backups to an external disk mounted at /mnt/archive."],
      ["preference", "Prefer replies in Portuguese."],
    ]);
    expect(plan.skills.map((s) => [s.name, s.description])).toEqual([
      ["research", "Workspace research skill"],
      ["weather", "Look up the forecast."],
    ]);
    expect(plan.skills[0].folder).toBe(join(location.workspace, "skills", "research"));
    expect(plan.skipped.map((s) => s.what)).toEqual(["1 daily notes in memory/", "skill workspace/.agents/skills/research"]);

    const withHistory = await readOpenClaw(location, { history: true });
    const daily = withHistory.memories.filter((m) => m.type === "event");
    expect(daily).toEqual([expect.objectContaining({ content: "Fixed the NUC fan curve; it now idles at 900 rpm.", validFrom: "2026-11-01T00:00:00.000Z" })]);
  });

  it("follows OPENCLAW_PROFILE and OPENCLAW_STATE_DIR", async () => {
    expect((await findOpenClaw({ OPENCLAW_PROFILE: "dev" }, "/home/sam")).workspace).toBe("/home/sam/.openclaw-dev/workspace");
    expect((await findOpenClaw({ OPENCLAW_STATE_DIR: "/srv/oc" }, "/home/sam")).workspace).toBe("/srv/oc/workspace");
    expect((await findOpenClaw({}, "/home/sam", "~/elsewhere")).workspace).toBe("/home/sam/elsewhere");
  });

  it("reads Markdown entries and front matter", () => {
    expect(markdownEntries("# Title\n\n- one\n  continued\n- [x] two\n\nA paragraph\nover lines.\n\n| a | b |\n")).toEqual(["one continued", "two", "A paragraph over lines."]);
    expect(frontmatter("---\nname: 'x'\ndescription: |\n  line one\n  line two\n---\nbody")).toEqual({ fields: { name: "x", description: "line one\nline two" }, body: "body" });
  });
});

describe("dry run without a database", () => {
  it("lists everything, writes nothing, and leaves the sources as they were", async () => {
    const { dir, hermes, openclawHome, skillsDir } = await scratch();
    const before = await fingerprint(dir);
    const plans = [await readHermes(hermes, { history: true }), await readOpenClaw(await findOpenClaw({}, openclawHome), { history: true })];
    const report = await applyImport(plans, { pool: null, userId: null, skills: createSkillStore(skillsDir), embeddings: null }, { dryRun: true });
    expect(report.sources.map((s) => s.imported)).toEqual([
      { memories: 6, skills: 1, messages: 4 },
      { memories: 7, skills: 2, messages: 0 },
    ]);
    expect(describeReport(report)).toContain("Dry run: nothing was written.");
    expect(describeReport(report)).not.toContain("\u2014");
    expect(await fingerprint(dir)).toEqual(before);
    await expect(applyImport(plans, { pool: null, userId: null, skills: createSkillStore(skillsDir), embeddings: null }, { dryRun: false })).rejects.toThrow(/database/);
  });
});

describe("importing into Bluebird", () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness();
  });
  afterAll(async () => {
    await harness?.close();
  });

  it("brings in memories, history and skills once, without touching the sources", async () => {
    const { dir, hermes, openclawHome, skillsDir } = await scratch();
    const before = await fingerprint(dir);
    const skills = createSkillStore(skillsDir);
    const plans = async () => [await readHermes(hermes, { history: true }), await readOpenClaw(await findOpenClaw({}, openclawHome))];

    // A dry run against the database writes nothing, not even the account.
    const dryId = await localUserId(harness.pool, true);
    const dry = await applyImport(await plans(), { pool: harness.pool, userId: dryId, skills, embeddings: null }, { dryRun: true });
    expect(dry.sources[0].imported).toEqual({ memories: 6, skills: 1, messages: 4 });
    expect((await harness.pool.query("SELECT count(*)::int AS n FROM memories")).rows[0].n).toBe(0);
    expect(await skills.list()).toEqual([]);

    const userId = await localUserId(harness.pool, false);
    const first = await applyImport(await plans(), { pool: harness.pool, userId, skills, embeddings: null }, { dryRun: false });
    expect(first.sources.map((s) => s.imported)).toEqual([
      { memories: 6, skills: 1, messages: 4 },
      { memories: 6, skills: 2, messages: 0 },
    ]);
    const stored = await withUser(harness.pool, userId, async (client) => {
      const memories = await client.query<{ content: string; metadata: { from: string } }>("SELECT content, metadata FROM memories WHERE user_id = $1 ORDER BY content", [userId]);
      const messages = await client.query<{ role: string; content: string; created_at: Date }>(
        "SELECT role, content, created_at FROM messages WHERE user_id = $1 ORDER BY created_at",
        [userId],
      );
      return { memories: memories.rows, messages: messages.rows };
    });
    expect(stored.memories).toHaveLength(12);
    expect(stored.memories.find((m) => m.content.startsWith("Prefers short"))?.metadata.from).toBe("hermes");
    expect(stored.messages.map((m) => m.content)).toEqual([
      "The reverb tail clicks at 48 kHz.",
      "The buffer is not cleared on sample-rate change.",
      "Book me a train to Porto.",
      "The 09:09 Alfa Pendular has seats.",
    ]);
    expect(stored.messages[0].created_at.toISOString()).toBe("2025-11-01T09:00:01.000Z");
    expect((await skills.list()).map((s) => s.name)).toEqual(["deploy-site", "research", "weather"]);
    expect(await readFile(join(skillsDir, "deploy-site", "scripts", "ship.sh"), "utf8")).toContain("make ship");
    expect((await skills.stats())["deploy-site"]).toMatchObject({ origin: "installed", source: `hermes:${join(hermes, "skills", "my-tools", "deploy-site")}` });

    const again = await applyImport(await plans(), { pool: harness.pool, userId, skills, embeddings: null }, { dryRun: false });
    expect(again.sources.map((s) => s.imported)).toEqual([zeroCounts, zeroCounts]);
    expect(again.sources[0].existing).toEqual({ memories: 6, skills: 1, messages: 4 });

    expect(await fingerprint(dir).then((after) => Object.fromEntries(Object.entries(after).filter(([path]) => !path.startsWith("bluebird-skills"))))).toEqual(before);
  });

  it("answers a dry run over the API for a settings screen", async () => {
    const { hermes } = await scratch();
    const saved = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermes;
    try {
      const token = await harness.signToken({ sub: "import-route", email: "route@example.com", name: "Route" });
      const response = await fetch(`${harness.baseUrl}/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sources: ["hermes"], history: true }),
      });
      expect(response.status).toBe(200);
      const report = (await response.json()) as { dryRun: boolean; sources: { imported: unknown }[] };
      expect(report.dryRun).toBe(true);
      expect(report.sources[0].imported).toMatchObject({ memories: 6, messages: 4 });
      const bad = await fetch(`${harness.baseUrl}/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sources: ["nope"] }),
      });
      expect(bad.status).toBe(400);
    } finally {
      if (saved === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = saved;
    }
  });
});

const zeroCounts = { memories: 0, skills: 0, messages: 0 };
