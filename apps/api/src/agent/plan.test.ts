import { describe, expect, it } from "vitest";
import { parsePlan, planTools } from "./plan";

describe("plan_update", () => {
  it("keeps one step in progress and fills in missing statuses", () => {
    const items = parsePlan([
      { content: "A", status: "completed" },
      { content: "B", status: "in_progress" },
      { content: "C", status: "in_progress" },
      { content: "D" },
    ]);
    expect(items.map((item) => item.status)).toEqual(["completed", "in_progress", "pending", "pending"]);
  });

  it("rejects an empty list, an empty step and a huge plan", () => {
    expect(() => parsePlan([])).toThrow();
    expect(() => parsePlan([{ content: " ", status: "pending" }])).toThrow();
    expect(() => parsePlan(Array.from({ length: 21 }, () => ({ content: "x", status: "pending" })))).toThrow();
  });

  it("is a read tool that needs no approval and returns the plan for the page", async () => {
    const [tool] = planTools();
    expect(tool.kind).toBe("read");
    const prepared = await tool.prepare({ items: [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }] }, {} as never);
    expect(prepared.summary).toBe("Plan: 1 of 2 done");
    expect(JSON.parse(String(await prepared.run()))).toHaveLength(2);
  });
});

import { draftPlan, looksMultiStep } from "./plan";

describe("planning ahead", () => {
  it("only plans for requests that look like several actions", () => {
    expect(looksMultiStep("what is the capital of France?")).toBe(false);
    expect(looksMultiStep("/compact")).toBe(false);
    expect(looksMultiStep("Use Safari to research the latest Intel Gaudi specs and then send them to me by email")).toBe(true);
    expect(looksMultiStep("1) read the file\n2) fix the bug in the parser so it handles empty input")).toBe(true);
  });

  const says = (text: string) => ({ complete: async () => text });

  it("drafts steps with the first in progress", async () => {
    const items = await draftPlan(says('Sure {"steps":["Open Safari","Find the specs","Email the summary"]}'), "do it");
    expect(items.map((item) => item.status)).toEqual(["in_progress", "pending", "pending"]);
  });

  it("returns no plan for a single action, bad JSON or a failing model", async () => {
    expect(await draftPlan(says('{"steps":[]}'), "x")).toEqual([]);
    expect(await draftPlan(says('{"steps":["only one"]}'), "x")).toEqual([]);
    expect(await draftPlan(says("no json"), "x")).toEqual([]);
  });
});

describe("browser budget", () => {
  it("scales with the kind of task", async () => {
    const { browserBudget } = await import("./plan");
    expect(browserBudget("What is the capital of Peru?")).toBe(8);
    expect(browserBudget("Use your browser and research the latest NVIDIA GB10 specs and send them over via Mail")).toBe(12);
    expect(browserBudget("Go to the site, fill in the form and submit it with my details")).toBe(30);
  });
});
