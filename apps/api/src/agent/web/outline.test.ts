import { describe, expect, it } from "vitest";
import { buildOutline, type AxNode } from "./outline";

const node = (id: string, role: string, extra: Partial<AxNode> = {}): AxNode => ({
  nodeId: id,
  role: { value: role },
  ...extra,
});

function page(): AxNode[] {
  return [
    node("1", "RootWebArea", { childIds: ["2", "3", "6"], name: { value: "Shop" } }),
    node("2", "banner", { parentId: "1", childIds: ["20"] }),
    node("20", "link", { parentId: "2", name: { value: "Home" }, backendDOMNodeId: 200, properties: [{ name: "url", value: { value: "https://shop.test/" } }] }),
    node("3", "main", { parentId: "1", childIds: ["4", "5", "7", "8", "9"] }),
    node("4", "heading", { parentId: "3", name: { value: "Sign in" }, properties: [{ name: "level", value: { value: 1 } }] }),
    node("5", "textbox", { parentId: "3", name: { value: "Email" }, backendDOMNodeId: 501, value: { value: "me@x.com" }, properties: [{ name: "required", value: { value: true } }] }),
    node("7", "checkbox", { parentId: "3", name: { value: "Remember me" }, backendDOMNodeId: 502, properties: [{ name: "checked", value: { value: "true" } }] }),
    node("8", "button", { parentId: "3", name: { value: "Continue" }, backendDOMNodeId: 503, properties: [{ name: "disabled", value: { value: true } }] }),
    node("9", "generic", { parentId: "3", childIds: ["10"] }),
    node("10", "StaticText", { parentId: "9", name: { value: "Forgot your password?" } }),
    node("6", "generic", { parentId: "1", ignored: true, childIds: ["11"] }),
    node("11", "button", { parentId: "6", name: { value: "Help" }, backendDOMNodeId: 600 }),
  ];
}

describe("buildOutline", () => {
  it("numbers what can be acted on, in reading order, and keeps their page nodes", () => {
    const outline = buildOutline(page());
    expect(outline.marks.map((m) => [m.n, m.role, m.name, m.backendNodeId])).toEqual([
      [1, "link", "Home", 200],
      [2, "textbox", "Email", 501],
      [3, "checkbox", "Remember me", 502],
      [4, "button", "Continue", 503],
      [5, "button", "Help", 600],
    ]);
  });

  it("shows value, flags, links, headings and plain text compactly", () => {
    const { text } = buildOutline(page());
    expect(text).toContain('[1] link "Home" → https://shop.test/');
    expect(text).toContain("# Sign in");
    expect(text).toContain('[2] textbox "Email" = "me@x.com" (required)');
    expect(text).toContain('[3] checkbox "Remember me" (checked)');
    expect(text).toContain('[4] button "Continue" (disabled)');
    expect(text).toContain("Forgot your password?");
    expect(text).toContain("banner");
    expect(text).toContain("main");
    expect(text).not.toContain("generic");
  });

  it("can show only actions", () => {
    const { text } = buildOutline(page(), { actionsOnly: true });
    expect(text).toContain("[2] textbox");
    expect(text).not.toContain("Forgot your password?");
  });

  it("starts numbering where asked and can look inside one part", () => {
    const part = buildOutline(page(), { within: 501, startAt: 10 });
    expect(part.marks.map((m) => m.n)).toEqual([10]);
    expect(part.marks[0].name).toBe("Email");
  });

  it("cuts a long page and says so", () => {
    const many: AxNode[] = [node("1", "RootWebArea", { childIds: Array.from({ length: 200 }, (_, i) => `b${i}`) })];
    for (let i = 0; i < 200; i += 1) many.push(node(`b${i}`, "button", { parentId: "1", name: { value: `Button number ${i}` }, backendDOMNodeId: 1000 + i }));
    const outline = buildOutline(many, { maxChars: 600 });
    expect(outline.truncated).toBe(true);
    expect(outline.text).toContain("outline cut here");
    expect(outline.marks.length).toBeLessThan(200);
  });

  it("uses a link's words when it has no name of its own", () => {
    const nodes = [
      node("1", "RootWebArea", { childIds: ["2"] }),
      node("2", "link", { parentId: "1", backendDOMNodeId: 7, childIds: ["3"] }),
      node("3", "StaticText", { parentId: "2", name: { value: "Read the docs" } }),
    ];
    expect(buildOutline(nodes).marks[0].name).toBe("Read the docs");
  });

  it("does not repeat a text field's content under it", () => {
    const nodes = [
      node("1", "RootWebArea", { childIds: ["2"] }),
      node("2", "textbox", { parentId: "1", name: { value: "Email" }, value: { value: "me@x.com" }, backendDOMNodeId: 5, childIds: ["3"] }),
      node("3", "StaticText", { parentId: "2", name: { value: "me@x.com" } }),
    ];
    const { text } = buildOutline(nodes);
    expect(text.match(/me@x\.com/g)).toHaveLength(1);
  });
});
