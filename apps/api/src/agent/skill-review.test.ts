import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolRecord } from "@bluebird/shared";
import { describe, expect, it } from "vitest";
import { parseDecision, reviewTurn, skillsUsedIn, worthReviewing } from "./skill-review";
import { createSkillStore } from "./skills";

const tool = (name: string, summary = name, status = "complete"): ToolRecord =>
  ({ id: Math.random().toString(36), name, kind: "read", summary, status }) as ToolRecord;
const work = (count: number) => Array.from({ length: count }, (_, at) => tool("run_command", `Run step ${at}`));

const modelSaying = (answer: unknown) => ({ complete: async () => (typeof answer === "string" ? answer : JSON.stringify(answer)) }) as never;
const store = async () => createSkillStore(join(await mkdtemp(join(tmpdir(), "skills-")), "skills"));

const good = {
  action: "create",
  name: "ship-site",
  description: "Build and upload the site",
  body: "1. Run the build.\n2. Upload the dist folder with the deploy command.\n3. Check the page loads.",
  reason: "A repeatable deploy.",
};

describe("worthReviewing", () => {
  it("skips short turns and empty replies", () => {
    expect(worthReviewing({ tools: work(2), reply: "ok", skillsUsed: [] })).toBe(false);
    expect(worthReviewing({ tools: work(6), reply: "", skillsUsed: [] })).toBe(false);
  });
  it("reviews long turns, and shorter ones that used a skill", () => {
    expect(worthReviewing({ tools: work(4), reply: "done", skillsUsed: [] })).toBe(true);
    expect(worthReviewing({ tools: work(2), reply: "done", skillsUsed: ["x"] })).toBe(true);
  });
  it("leaves turns that already saved a skill alone", () => {
    expect(worthReviewing({ tools: [...work(5), tool("skill_save")], reply: "done", skillsUsed: [] })).toBe(false);
  });
});

describe("reviewTurn", () => {
  it("writes a new skill after a long task and marks it learned", async () => {
    const skills = await store();
    const result = await reviewTurn({ model: modelSaying(good), skills }, { request: "ship it", reply: "Shipped.", tools: work(5) });
    expect(result).toMatchObject({ action: "created", name: "ship-site" });
    expect((await skills.get("ship-site"))?.body).toContain("Upload the dist folder");
    expect((await skills.stats())["ship-site"]).toMatchObject({ origin: "learned" });
  });

  it("revises a skill that was used, and keeps the old version", async () => {
    const skills = await store();
    await skills.save({ name: "ship-site", description: "Ship it", body: "1. Build only, which forgets the upload step entirely." });
    const tools = [tool("skill_view", "Load skill ship-site"), ...work(3)];
    const update = { ...good, action: "update", body: "1. Run the build.\n2. Upload with the deploy command, then clear the cache." };
    const result = await reviewTurn({ model: modelSaying(update), skills }, { request: "ship it", reply: "Done.", tools });
    expect(result).toMatchObject({ action: "updated" });
    expect((await skills.get("ship-site"))?.body).toContain("clear the cache");
    const history = await readdir(join(skills.pathOf("ship-site"), "..", "history"));
    expect(history).toHaveLength(1);
    expect(await readFile(join(skills.pathOf("ship-site"), "..", "history", history[0]), "utf8")).toContain("forgets the upload step");
  });

  it("refuses secrets, bad names, thin bodies and nonsense", async () => {
    const skills = await store();
    const run = (answer: unknown) => reviewTurn({ model: modelSaying(answer), skills }, { request: "r", reply: "ok", tools: work(5) });
    expect(await run({ ...good, body: `${good.body}\napi_key = abcdef123456` })).toEqual({ action: "none" });
    expect(await run({ ...good, name: "Bad Name!" })).toEqual({ action: "none" });
    expect(await run({ ...good, body: "short" })).toEqual({ action: "none" });
    expect(await run("not json")).toEqual({ action: "none" });
    expect(await run({ action: "none" })).toEqual({ action: "none" });
    expect(await skills.list()).toEqual([]);
  });

  it("will not overwrite a skill the person wrote through a create", async () => {
    const skills = await store();
    await skills.save({ name: "ship-site", description: "Mine", body: "My own careful steps that must stay as they are." });
    expect(await reviewTurn({ model: modelSaying(good), skills }, { request: "r", reply: "ok", tools: work(5) })).toEqual({ action: "none" });
    expect((await skills.get("ship-site"))?.description).toBe("Mine");
  });
});

describe("helpers", () => {
  it("finds the skills a turn loaded", () => {
    expect(skillsUsedIn([tool("skill_view", "Load skill a-b"), tool("grep")])).toEqual(["a-b"]);
  });
  it("pulls JSON out of chatter", () => {
    expect(parseDecision('Sure: {"action":"none"} done')).toEqual({ action: "none" });
  });
});
