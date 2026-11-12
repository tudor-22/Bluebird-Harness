import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCheckpoint } from "./checkpoints";
import { browserTools, createBrowser } from "./browser";
import { authorize } from "./policy";
import { prepare, type ToolContext } from "./tools";
import { createPaths } from "./workspace";

const FAKE = fileURLToPath(new URL("./fixtures/fake-cdp.mjs", import.meta.url));

async function setup() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "agent-browser-"));
  process.env.BB_FAKE_LOG = join(dir, "cdp.log");
  const browser = createBrowser({ executable: FAKE });
  const ctx: ToolContext = {
    jail: createPaths(dir),
    settings: { level: "ask" },
    reads: new Map(),
    checkpoint: createCheckpoint(join(dir, "cp")),
    extra: browserTools(browser),
    vision: { native: true },
  };
  return { dir, browser, ctx, log: async () => (await readFile(process.env.BB_FAKE_LOG!, "utf8")).split("\n") };
}

describe("browser tools", () => {
  it("opens a page, clicks by mark, types, and takes a screenshot", async () => {
    const { browser, ctx, log } = await setup();
    try {
      const opened = String(await (await prepare("browser_open", { url: "https://shop.test/login" }, ctx)).run());
      expect(opened).toContain("Fake shop");
      expect(opened).toContain('[1] textbox "Email"');

      const clicked = String(await (await prepare("browser_click", { mark: 2 }, ctx)).run());
      expect(clicked).toContain('Clicked button "Continue"');
      await (await prepare("browser_type", { mark: 1, input: "blue birds", submit: true }, ctx)).run();
      const lines = await log();
      expect(lines.some((l) => l.startsWith("Page.navigate") && l.includes("https://shop.test/login"))).toBe(true);
      expect(lines.some((l) => l.includes('"key":"Enter"'))).toBe(true);
      expect(lines.some((l) => l.includes("blue birds"))).toBe(true);

      await expect((await prepare("browser_click", { text: "nothing-here" }, ctx)).run()).rejects.toThrow(/Nothing on the page is labelled/);
      await expect(prepare("browser_click", {}, ctx)).rejects.toThrow(/mark number/);

      const shot = await (await prepare("browser_screenshot", {}, ctx)).run();
      expect(typeof shot).toBe("object");
      if (typeof shot === "object") expect(shot.images[0]).toMatchObject({ mime: "image/jpeg" });
    } finally {
      await browser.close();
    }
  });

  it("asks before it opens a page on this computer, clicks, types or runs script, but reads freely in Auto", async () => {
    const { browser, ctx, dir } = await setup();
    try {
      const open = (url: string) => prepare("browser_open", { url }, ctx);
      const auto = async (name: string, args: Record<string, unknown>) => authorize(await prepare(name, args, ctx), "auto", new Set(), dir).action;
      expect(authorize(await open("https://example.com/"), "auto", new Set(), dir).action).toBe("allow");
      expect(authorize(await open("http://localhost:3000/"), "auto", new Set(), dir).action).toBe("ask");
      expect(authorize(await open("http://192.168.1.5/admin"), "auto", new Set(), dir).action).toBe("ask");
      expect(await auto("browser_click", { text: "Buy" })).toBe("ask");
      expect(await auto("browser_type", { mark: 1, input: "x" })).toBe("ask");
      expect(await auto("browser_press", { keys: "Enter" })).toBe("ask");
      expect(await auto("browser_eval", { script: "document.cookie" })).toBe("ask");
      expect(await auto("browser_look", {})).toBe("allow");
      expect(await auto("browser_scroll", { direction: "down" })).toBe("allow");
      expect(authorize(await open("https://example.com/"), "ask", new Set(), dir).action).toBe("ask");
      expect(authorize(await open("http://localhost:3000/"), "full", new Set(), dir).action).toBe("allow");
      await expect(open("file:///etc/passwd")).rejects.toThrow(/http and https/);
    } finally {
      await browser.close();
    }
  });

  it("says plainly when there is no browser to drive", async () => {
    const browser = createBrowser({ executable: "/definitely/not/chrome" });
    await expect(browser.open("https://example.com/")).rejects.toThrow();
    await browser.close();
  });
});
