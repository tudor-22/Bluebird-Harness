import { describe, expect, it } from "vitest";
import { boardTools, detectMode, interleave, researchAllows } from "./modes";

describe("detectMode", () => {
  it("reads /swarm and /research at the start", () => {
    expect(detectMode("/swarm build a landing page")).toEqual({ mode: "swarm", task: "build a landing page" });
    expect(detectMode("/Research: GB10 specs")).toEqual({ mode: "research", task: "GB10 specs" });
    expect(detectMode("please /swarm this").mode).toBeNull();
    expect(detectMode("/researcher x").mode).toBeNull();
  });
});

describe("researchAllows", () => {
  it("is web only", () => {
    expect(researchAllows("browser_open")).toBe(true);
    expect(researchAllows("browser_upload")).toBe(false);
    expect(researchAllows("run_command")).toBe(false);
    expect(researchAllows("write_file")).toBe(false);
  });
});

describe("interleave", () => {
  it("merges streams as items arrive", async () => {
    const slow = async function* () {
      await new Promise((r) => setTimeout(r, 20));
      yield "slow";
    };
    const fast = async function* () {
      yield "fast";
    };
    const got: string[] = [];
    for await (const { value } of interleave([slow(), fast()])) got.push(value);
    expect(got).toEqual(["fast", "slow"]);
  });
});

describe("board", () => {
  it("shows teammates' notes but not your own", async () => {
    const board: { by: string; note: string }[] = [];
    const [post] = boardTools(board, "a");
    const [, read] = boardTools(board, "b");
    await (await post.prepare({ note: "found it" }, {} as never)).run();
    expect(await (await read.prepare({}, {} as never)).run()).toContain("[a] found it");
  });
});
