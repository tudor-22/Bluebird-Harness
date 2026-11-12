import { describe, expect, it } from "vitest";

import { splitFencedBlocks } from "./code-split";
import { streamingParts } from "./streaming-prose";

const reply = [
  "Start with the update rule.",
  "```text",
  "x = x - lr * grad",
  "```",
  "Then repeat it for a few steps.",
  "```python",
  "for _ in range(3):",
  "    pass",
  "```",
  "That is all.",
].join("\n");

describe("code blocks stay beside the text about them", () => {
  it("keeps prose and code in the order they were written", () => {
    expect(splitFencedBlocks(reply).map((part) => part.kind)).toEqual([
      "prose", "code", "prose", "code", "prose",
    ]);
  });

  it("shows a finished code block in place while the reply streams", () => {
    expect(streamingParts(reply).map((part) => part.kind)).toEqual([
      "prose", "code", "prose", "code", "prose",
    ]);
  });

  it("shows a code block as it is written, in place", () => {
    const partial = "Here it is.\n```python\nfor i in range(3):";
    expect(streamingParts(partial).map((part) => part.kind)).toEqual(["prose", "code"]);
  });
});

describe("a web page that is still being written", () => {
  it("shows its title and a placeholder, and nothing of the half-written code", () => {
    const partial = "Here you go.\n```app Snake Arcade\n<!doctype html><html><body><canvas";
    const parts = streamingParts(partial);
    expect(parts.map((part) => part.kind)).toEqual(["prose", "building"]);
    expect(parts[1]).toMatchObject({ kind: "building", title: "Snake Arcade" });
  });

  it("leaves the finished page to the completed message", () => {
    const done = "Here you go.\n```app Snake Arcade\n<h1>Hi</h1>\n```";
    expect(streamingParts(done).map((part) => part.kind)).toEqual(["prose"]);
  });
});
