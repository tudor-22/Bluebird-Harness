import { describe, expect, it } from "vitest";

import { splitFencedBlocks } from "./code-split";

describe("splitFencedBlocks", () => {
  it("separates prose from a fenced block", () => {
    const parts = splitFencedBlocks(
      "Here you go:\n\n```python\nprint(1)\n```\n\nAfter the block.",
    );
    expect(parts).toEqual([
      { kind: "prose", text: "Here you go:" },
      { kind: "code", language: "python", code: "print(1)" },
      { kind: "prose", text: "After the block." },
    ]);
  });

  it("keeps indentation and blank lines inside the block", () => {
    const parts = splitFencedBlocks("```js\nfunction f() {\n\n  return 1;\n}\n```");
    expect(parts[0]).toEqual({
      kind: "code",
      language: "js",
      code: "function f() {\n\n  return 1;\n}",
    });
  });

  it("treats an unclosed fence as a block while streaming", () => {
    const parts = splitFencedBlocks("Counting:\n\n```python\nfor i in");
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ kind: "code", language: "python", code: "for i in" });
  });

  it("handles several blocks and gives each its language", () => {
    const parts = splitFencedBlocks(
      "```bash\nls\n```\n\nmiddle\n\n```json\n{}\n```",
    );
    expect(parts.map((part) => part.kind)).toEqual([
      "code",
      "prose",
      "code",
    ]);
    expect(parts[0]).toMatchObject({ language: "bash" });
    expect(parts[2]).toMatchObject({ language: "json" });
  });

  it("returns plain prose untouched", () => {
    const parts = splitFencedBlocks("Just a normal reply, with `inline` code.");
    expect(parts).toEqual([
      { kind: "prose", text: "Just a normal reply, with `inline` code." },
    ]);
  });

  it("reads a closed ui block as a panel spec", () => {
    const parts = splitFencedBlocks(
      'Breakdown:\n\n```ui\n{"title":"Plan","blocks":[{"type":"text","text":"Hi"}]}\n```',
    );
    expect(parts).toEqual([
      { kind: "prose", text: "Breakdown:" },
      {
        kind: "ui",
        source: '{"title":"Plan","blocks":[{"type":"text","text":"Hi"}]}',
        closed: true,
      },
    ]);
  });

  it("marks a still-open ui block while streaming", () => {
    const parts = splitFencedBlocks('Here:\n\n```ui\n{"title":"Pla');
    expect(parts).toEqual([
      { kind: "prose", text: "Here:" },
      { kind: "ui", source: '{"title":"Pla', closed: false },
    ]);
  });

  it("keeps a ui fence apart from surrounding code fences", () => {
    const parts = splitFencedBlocks(
      '```ui\n{"blocks":[]}\n```\n\n```json\n{"ok":true}\n```',
    );
    expect(parts.map((part) => part.kind)).toEqual(["ui", "code"]);
  });

  it("normalises a fence written on one line", () => {
    const parts = splitFencedBlocks(
      'Here:\n\n```ui {"blocks":[{"type":"text","text":"Hi"}]} ```',
    );
    expect(parts).toEqual([
      { kind: "prose", text: "Here:" },
      { kind: "ui", source: '{"blocks":[{"type":"text","text":"Hi"}]}', closed: true },
    ]);
  });
});

describe("app fences", () => {
  it("keeps the raw HTML of a closed app fence and reads its title", () => {
    const parts = splitFencedBlocks("Here is a tool.\n```app Tip splitter\n<p class='x'>Hi</p>\n```\nDone.");

    expect(parts).toEqual([
      { kind: "prose", text: "Here is a tool." },
      { kind: "app", title: "Tip splitter", source: "<p class='x'>Hi</p>", closed: true },
      { kind: "prose", text: "Done." },
    ]);
  });

  it("marks an app fence that is still streaming as not closed", () => {
    const parts = splitFencedBlocks("```app Dice\n<button>Roll</button>");

    expect(parts).toEqual([
      { kind: "app", title: "Dice", source: "<button>Roll</button>", closed: false },
    ]);
  });
});


describe("app title", () => {
  it("takes a plain first line inside the fence as the title", () => {
    const parts = splitFencedBlocks("```app\nDice Pig\n<h1>Dice Pig</h1>\n```");

    expect(parts).toEqual([
      { kind: "app", title: "Dice Pig", source: "<h1>Dice Pig</h1>", closed: true },
    ]);
  });
});
