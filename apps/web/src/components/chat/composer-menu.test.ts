import { describe, expect, it } from "vitest";

import { findTrigger, matchPositions } from "./composer-menu";
import { buildFolderBundle } from "./drop-files";

describe("findTrigger", () => {
  it("opens the slash menu only at the start of the message", () => {
    expect(findTrigger("/ski", 4)).toEqual({ type: "slash", query: "ski", start: 0, end: 4 });
    expect(findTrigger("/", 1)).toEqual({ type: "slash", query: "", start: 0, end: 1 });
    expect(findTrigger("hello /ski", 10)).toBeNull();
    expect(findTrigger("/skills do this", 15)).toBeNull();
  });

  it("opens the file menu for an @ after whitespace or at the start", () => {
    expect(findTrigger("look at @pack", 13)).toEqual({ type: "file", query: "pack", start: 8, end: 13 });
    expect(findTrigger("@a", 2)).toEqual({ type: "file", query: "a", start: 0, end: 2 });
    expect(findTrigger("mail me@example", 15)).toBeNull();
    expect(findTrigger("@src/app.ts and more", 20)).toBeNull();
  });

  it("follows the caret, not the end of the text", () => {
    expect(findTrigger("see @sr and more", 7)).toEqual({ type: "file", query: "sr", start: 4, end: 7 });
  });
});

describe("matchPositions", () => {
  it("marks a contiguous match, or the letters in order", () => {
    expect(matchPositions("ski", "skills")).toEqual([0, 1, 2]);
    expect(matchPositions("sc", "skill-creator")).toEqual([0, 6]);
    expect(matchPositions("zz", "skills")).toEqual([]);
  });
});

describe("buildFolderBundle", () => {
  it("lists the layout and includes text files", () => {
    const bundle = buildFolderBundle("app", [
      { path: "src/main.ts", size: 20, text: "console.log(1)" },
      { path: "logo.png", size: 900, text: null },
    ]);
    expect(bundle).toContain("# Folder: app");
    expect(bundle).toContain("- logo.png (not text)");
    expect(bundle).toContain("### src/main.ts");
    expect(bundle).toContain("console.log(1)");
  });

  it("stops adding file text once the budget is used and says what it left out", () => {
    const big = "x".repeat(8000);
    const files = Array.from({ length: 20 }, (_, i) => ({ path: `f${String(i).padStart(2, "0")}.txt`, size: 8000, text: big }));
    const bundle = buildFolderBundle("big", files);
    expect(bundle.length).toBeLessThan(110_000);
    expect(bundle).toContain("Not included to keep this short");
  });
});
