import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createWebEngine } from "./engine";
import { parseKeys } from "./keys";

const FAKE = fileURLToPath(new URL("../fixtures/fake-cdp.mjs", import.meta.url));

async function setup() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "web-engine-"));
  process.env.BB_FAKE_LOG = join(dir, "cdp.log");
  const engine = createWebEngine({ executable: FAKE });
  const log = async () => (await readFile(process.env.BB_FAKE_LOG!, "utf8")).split("\n");
  return { engine, log };
}

let open: ReturnType<typeof createWebEngine> | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe("web engine", () => {
  it("opens a page and returns an outline with numbered marks", async () => {
    const { engine, log } = await setup();
    open = engine;
    const report = await engine.open("https://shop.test/login");
    expect(report.page).toContain("Fake shop");
    expect(report.page).toContain("# Sign in");
    expect(report.page).toContain('[1] textbox "Email"');
    expect(report.page).toContain('[2] button "Continue"');
    expect((await log()).some((line) => line.startsWith("Page.navigate"))).toBe(true);
  });

  it("clicks with real mouse input, by mark or by visible text", async () => {
    const { engine, log } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    const byMark = await engine.click({ mark: 2 });
    expect(byMark.notes.join(" ")).toContain('Clicked button "Continue"');
    await engine.click({ text: "continue" });
    const lines = await log();
    expect(lines.filter((line) => line.includes('"type":"mousePressed"')).length).toBe(2);
    expect(lines.some((line) => line.startsWith("DOM.scrollIntoViewIfNeeded"))).toBe(true);
  });

  it("refuses to click through something that covers the target, unless forced", async () => {
    const { engine } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    await expect(engine.click({ mark: 3 })).rejects.toThrow(/covered by <div#cookie>/);
    await expect(engine.click({ mark: 3 }, { force: true })).resolves.toBeDefined();
  });

  it("types into a field, and refuses something that is not a field", async () => {
    const { engine, log } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    await engine.type({ mark: 1 }, "me@example.com", { submit: true });
    const lines = await log();
    expect(lines.some((line) => line.startsWith("Input.insertText") && line.includes("me@example.com"))).toBe(true);
    expect(lines.some((line) => line.includes('"key":"Enter"'))).toBe(true);
    await expect(engine.type({ mark: 2 }, "x")).rejects.toThrow(/not something you can type into/);
  });

  it("explains stale marks, unknown marks and unknown text", async () => {
    const { engine } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    await expect(engine.click({ mark: 42 })).rejects.toThrow(/There is no mark 42/);
    await expect(engine.click({ text: "Nope" })).rejects.toThrow(/Nothing on the page is labelled "Nope"/);
    await expect(engine.click({ selector: "#missing" })).rejects.toThrow(/No element matches/);
  });

  it("chooses a dropdown option and lists the options when none match", async () => {
    const { engine } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    expect((await engine.select({ mark: 4 }, "Spain")).notes.join(" ")).toContain('Chose "Spain"');
    await expect(engine.select({ mark: 4 }, "Narnia")).rejects.toThrow(/The options are: France \| Spain/);
  });

  it("presses key chords, scrolls and takes screenshots", async () => {
    const { engine, log } = await setup();
    open = engine;
    await engine.open("https://shop.test/login");
    await engine.press("Control+A Tab");
    await engine.scroll("down", 300);
    expect(typeof (await engine.screenshot())).toBe("string");
    const lines = await log();
    expect(lines.some((line) => line.includes('"commands":["selectAll"]'))).toBe(true);
    expect(lines.some((line) => line.includes('"type":"mouseWheel"') && line.includes('"deltaY":300'))).toBe(true);
  });

  it("says plainly when there is no browser to drive", async () => {
    const engine = createWebEngine({ executable: "/definitely/not/chrome" });
    await expect(engine.open("https://example.com/")).rejects.toThrow();
    await engine.close();
  });
});

describe("parseKeys", () => {
  it("parses names, chords and function keys", () => {
    expect(parseKeys("Enter").def.vk).toBe(13);
    expect(parseKeys("Shift+Tab")).toMatchObject({ modifiers: 8 });
    expect(parseKeys("Meta+C").commands).toEqual(["copy"]);
    expect(parseKeys("F5").def.key).toBe("F5");
    expect(parseKeys("a").def.text).toBe("a");
    expect(() => parseKeys("Hyper+X")).toThrow(/modifier/);
    expect(() => parseKeys("Flurb")).toThrow(/Unknown key/);
  });
});
