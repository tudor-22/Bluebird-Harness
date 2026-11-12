import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { desktopTools } from "./desktop";
import { createMacAdapter } from "./desktop/mac";
import { authorize } from "./policy";
import { prepare, type ToolContext } from "./tools";
import { ToolError } from "./workspace";

const FAKE = fileURLToPath(new URL("./fixtures/fake-ax.mjs", import.meta.url));

async function setup(trusted = true) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "desktop-"));
  process.env.BB_FAKE_LOG = join(dir, "ax.log");
  process.env.BB_FAKE_TRUSTED = trusted ? "1" : "0";
  const adapter = createMacAdapter({ helper: FAKE, guide: false });
  const ctx = { extra: desktopTools(adapter), settings: { level: "ask" } } as unknown as ToolContext;
  const run = async (name: string, args: Record<string, unknown>) => String(await (await prepare(name, args, ctx)).run());
  return { adapter, ctx, run, log: async () => (await readFile(process.env.BB_FAKE_LOG!, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)) };
}

describe("desktop tools", () => {
  it("reads an app as an outline and acts on marks, showing what changed", async () => {
    const { adapter, run, log } = await setup();
    try {
      expect(await run("desktop_apps", {})).toContain("* Notes");
      const looked = await run("desktop_look", { app: "Notes" });
      expect(looked).toContain('[2] button "New Note"');

      const clicked = await run("desktop_click", { mark: 2 });
      expect(clicked).toContain("Pressed mark 2.");
      expect(clicked).toContain('[1] textfield "Search"');

      expect(await run("desktop_set_value", { mark: 1, input: "groceries" })).toContain("groceries");
      await run("desktop_type", { mark: 1, input: "milk" });
      await run("desktop_key", { keys: "cmd+s" });
      expect(await run("desktop_clipboard", { action: "get" })).toBe("copied text");
      expect(await run("desktop_read", { mark: 1 })).toContain("value: hello");

      const ops = (await log()).map((entry) => entry.op);
      expect(ops).toEqual(expect.arrayContaining(["outline", "act", "set_value", "type", "key", "clipboard_get"]));
    } finally {
      await adapter.close();
    }
  });

  it("falls back to the real mouse when an element has no press action, and passes stale marks on", async () => {
    const { adapter, run, log } = await setup();
    try {
      await run("desktop_look", { app: "Notes" });
      expect(await run("desktop_click", { mark: 3 })).toContain("with the mouse");
      expect((await log()).some((entry) => entry.op === "click" && entry.mark === 3)).toBe(true);
      await expect(run("desktop_click", { mark: 99 })).rejects.toThrow(/out of date/);
    } finally {
      await adapter.close();
    }
  });

  it("explains the permission to grant when the app may not read other apps", async () => {
    const { adapter, run } = await setup(false);
    try {
      await expect(run("desktop_look", { app: "Notes" })).rejects.toThrow(/permission to control apps/);
    } finally {
      await adapter.close();
    }
  });

  it("checks its input and always asks before acting, except with Full access", async () => {
    const { adapter, ctx } = await setup();
    try {
      const click = await prepare("desktop_click", { x: 100.4, y: 200 }, ctx);
      expect(click.summary).toBe("Click the screen at 100, 200");
      expect(authorize(click, "auto", new Set(), "/").action).toBe("ask");
      expect(authorize(click, "full", new Set(), "/").action).toBe("allow");
      expect(authorize(await prepare("desktop_look", { app: "Notes" }, ctx), "auto", new Set(), "/").action).toBe("ask");
      expect(authorize(await prepare("desktop_screenshot", {}, ctx), "auto", new Set(), "/").action).toBe("ask");
      await expect(prepare("desktop_click", {}, ctx)).rejects.toThrow(ToolError);
      await expect(prepare("desktop_click", { mark: 0 }, ctx)).rejects.toThrow(/mark number/);
      await expect(prepare("desktop_type", { input: "" }, ctx)).rejects.toThrow(ToolError);
      await expect(prepare("desktop_type", { input: "x" }, ctx)).rejects.toThrow(/mark, or the app/);
      await expect(prepare("desktop_key", { keys: "" }, ctx)).rejects.toThrow(ToolError);
    } finally {
      await adapter.close();
    }
  });
});
