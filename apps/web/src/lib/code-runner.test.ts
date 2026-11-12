import { describe, expect, it } from "vitest";

import { buildRunDocument, runnerKind } from "./code-runner";

describe("which code can be previewed", () => {
  it("previews web pages and drawings, and nothing else", () => {
    expect(runnerKind("html", "<p>x</p>")).toBe("html");
    expect(runnerKind("HTML", "")).toBe("html");
    expect(runnerKind("svg", "<svg/>")).toBe("svg");
    expect(runnerKind("xml", '<?xml version="1.0"?><svg viewBox="0 0 1 1"/>')).toBe("svg");
    expect(runnerKind("xml", "<config/>")).toBeNull();
    for (const language of [
      "python", "py", "javascript", "js", "typescript", "bash", "sql", "json", "css", "java", "go", undefined,
    ]) {
      expect(runnerKind(language, "x"), String(language)).toBeNull();
    }
  });
});

describe("the document a preview runs in", () => {
  it("blocks every network request", () => {
    for (const kind of ["html", "svg"] as const) {
      const doc = buildRunDocument(kind, "<p>hi</p>");
      expect(doc).toContain("connect-src 'none'");
      expect(doc).toContain("default-src 'none'");
      expect(doc).toContain("<p>hi</p>");
    }
  });
});
