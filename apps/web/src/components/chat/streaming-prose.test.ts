import { describe, expect, it } from "vitest";
import { streamingParts, streamingProse } from "./streaming-prose";

describe("streamingProse", () => {
  it("streams ordinary prose", () => {
    expect(streamingProse("Paris is the capital of France.")).toEqual([
      "Paris is the capital of France.",
    ]);
  });

  it("hides fenced ui specs and code until completion", () => {
    const text = streamingProse(
      'Here is a plan.\n\n```ui\n{"title":"Plan","blocks":[]}\n```\n\nAnd the code:\n\n```ts\nconst x = 1;\n```',
    );
    expect(text).toEqual(["Here is a plan.", "And the code:"]);
  });

  it("shows a complete picture as it streams, and holds back a half-written one", () => {
    expect(
      streamingProse("A picture follows.\n\n![Hotel](https://example.com/hotel.jpg)\n\nMore"),
    ).toEqual(["A picture follows.\n\n![Hotel](https://example.com/hotel.jpg)\n\nMore"]);
    expect(streamingProse("A picture follows.\n\n![Hotel](https://example.com/ho")).toEqual([
      "A picture follows.",
    ]);
  });

  it("holds back loose JSON in prose", () => {
    expect(streamingProse('A plan.\n\n{"title":"Places"')).toEqual(["A plan."]);
  });

  it("shows a placeholder while a panel is being written, then the whole panel", () => {
    const parts = streamingParts(
      'Here.\n\n```ui\n{"blocks":[{"type":"callout","text":"First"},{"type":"callout","text":"Sec',
    );
    expect(parts[0]).toEqual({ kind: "prose", text: "Here." });
    expect(parts[1]).toEqual({ kind: "building", title: "Building visualisation" });
    expect(parts).toHaveLength(2);
  });

  it("leaves maps out of a streaming panel until the reply is finished", () => {
    const parts = streamingParts(
      '```ui\n{"blocks":[{"type":"callout","text":"Route"},{"type":"map","markers":[{"label":"Porto","q":"Porto"}]}]}\n```',
    );
    expect(parts).toEqual([
      { kind: "panel", spec: { blocks: [{ type: "callout", text: "Route" }] } },
    ]);
  });
});
