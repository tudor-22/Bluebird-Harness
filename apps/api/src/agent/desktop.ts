import { join } from "node:path";
import type { DesktopAdapter } from "./desktop/adapter";
import { createLinuxAdapter } from "./desktop/linux";
import { createMacAdapter } from "./desktop/mac";
import { createWindowsAdapter } from "./desktop/windows";
import { lookAt, type ExtraTool, type ToolOutput } from "./tools";
import { ToolError } from "./workspace";

/** The adapter for this operating system, or null when there is none yet. */
export function createDesktop(cacheDir?: string): DesktopAdapter | null {
  if (process.platform === "darwin") return createMacAdapter({ cacheDir: cacheDir ?? join(process.cwd(), ".data", "helpers") });
  if (process.platform === "win32") return createWindowsAdapter();
  if (process.platform === "linux") return createLinuxAdapter();
  return null;
}

export const canUseDesktop = () => ["darwin", "win32", "linux"].includes(process.platform);

const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

const APP = { type: "string", description: "The app's name, such as Finder or Notes, or its bundle id." };
const MARK = { type: "integer", description: "The number in square brackets from desktop_look." };

/**
 * Tools that see and use the apps on this computer. The model reads an outline
 * of an app's window, with numbered marks for buttons, fields and menus, and
 * acts on a mark through the app's own accessibility actions, so nothing needs
 * the mouse unless the app offers no other way. Every tool asks first, because
 * what is on screen can be anything.
 */
export function desktopTools(adapter: DesktopAdapter): ExtraTool[] {
  // The app and window last looked at, so an action can show what it changed.
  let focus: { app: string; window?: number } | null = null;

  const requireMark = (value: unknown, label = "mark") => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new ToolError(`"${label}" must be a mark number from desktop_look.`);
    return value;
  };

  async function outlineOf(app: string, window?: number, extra: Record<string, unknown> = {}): Promise<string> {
    const status = await adapter.status();
    if (!status.ready) throw new ToolError(status.message);
    const look = await adapter.look({ app, window, ...extra });
    focus = { app: look.app || app, window };
    return `${look.app}${window ? ` (window ${window})` : ""}\n\n${look.outline || "(nothing readable; the app may have no open window)"}`;
  }

  /** What changed after an action: a fresh outline of where the model was looking. */
  async function after(note: string, settle = 450): Promise<string> {
    if (!focus) return note;
    await wait(settle);
    try {
      return `${note}\n\n${await outlineOf(focus.app, focus.window)}`;
    } catch {
      return note;
    }
  }

  const tool = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    build: (args: Record<string, unknown>, ctx: Parameters<ExtraTool["prepare"]>[1]) => { summary: string; preview?: string; run: () => Promise<string | ToolOutput> },
  ): ExtraTool => ({
    kind: "exec",
    spec: { name, description, parameters },
    prepare(args, ctx) {
      const built = build(args, ctx);
      // What is on screen can be anything, so even reading asks in Auto.
      return { name, kind: "exec", scope: "desktop", summary: built.summary, preview: built.preview ?? "", autoSafe: false, run: built.run };
    },
  });

  return [
    tool(
      "desktop_apps",
      "List the apps that are running on this computer, and which one is in front.",
      object({}, []),
      () => ({
        summary: "List running apps",
        async run() {
          const apps = await adapter.apps();
          return apps.map((app) => `${app.frontmost ? "*" : " "} ${app.name}${app.hidden ? " (hidden)" : ""}  ${app.bundle}`).join("\n") || "No apps found.";
        },
      }),
    ),
    tool(
      "desktop_look",
      "Read an app's window as an outline: text, and numbered marks for every button, field, checkbox and menu item you can act on. Use it before acting and again after the window changes. Pass mark to look only inside one part, window for a window other than the first, menus to include the menu bar, and actions_only to list just what can be used.",
      object({ app: APP, window: { type: "integer", description: "Window number from 1." }, mark: { type: "integer", description: "Look only inside this mark." }, actions_only: { type: "boolean" }, menus: { type: "boolean" } }, ["app"]),
      (args) => {
        const app = String(args.app ?? "").trim();
        if (!app) throw new ToolError('"app" is required.');
        return {
          summary: `Read ${app}`,
          async run() {
            return outlineOf(app, typeof args.window === "number" ? args.window : undefined, {
              within: typeof args.mark === "number" ? args.mark : undefined,
              actionsOnly: args.actions_only === true,
              menus: args.menus === true,
            });
          },
        };
      },
    ),
    tool(
      "desktop_windows",
      "List an app's windows with their titles and positions.",
      object({ app: APP }, ["app"]),
      (args) => ({
        summary: `List windows of ${String(args.app)}`,
        async run() {
          const windows = await adapter.windows(String(args.app));
          return windows.length ? windows.map((w) => `${w.index}. ${w.title || "(untitled)"}${w.width ? `  ${w.width}x${w.height} at ${w.x},${w.y}` : ""}`).join("\n") : "No windows are open.";
        },
      }),
    ),
    tool(
      "desktop_click",
      "Use a button, link, menu item, checkbox or row by its mark. It uses the app's own press action, without moving the mouse; if the app does not offer one, or mouse is true, it clicks the real mouse at the element. Without a mark, click at screen coordinates x and y.",
      object({ mark: MARK, x: { type: "number" }, y: { type: "number" }, mouse: { type: "boolean", description: "Use the real mouse." }, double: { type: "boolean" }, right: { type: "boolean" } }, []),
      (args) => {
        const hasPoint = typeof args.x === "number" && typeof args.y === "number";
        if (args.mark === undefined && !hasPoint) throw new ToolError("Give a mark, or x and y.");
        const mark = args.mark === undefined ? undefined : requireMark(args.mark);
        return {
          summary: mark !== undefined ? `Click mark ${mark}` : `Click the screen at ${Math.round(Number(args.x))}, ${Math.round(Number(args.y))}`,
          async run() {
            if (mark === undefined) {
              await adapter.click({ x: Number(args.x), y: Number(args.y) }, { double: args.double === true, right: args.right === true });
              return after("Clicked.");
            }
            const useMouse = args.mouse === true || args.double === true || args.right === true;
            if (!useMouse) {
              try {
                await adapter.act(mark);
                return after(`Pressed mark ${mark}.`);
              } catch (error) {
                if (!(error instanceof ToolError) || /out of date|no mark/i.test(error.message)) throw error;
              }
            }
            await adapter.click({ mark }, { double: args.double === true, right: args.right === true });
            return after(`Clicked mark ${mark} with the mouse.`);
          },
        };
      },
    ),
    tool(
      "desktop_type",
      "Type text into the field with the given mark (it is focused first), or into whatever has focus in the given app.",
      object({ mark: MARK, app: APP, input: { type: "string" } }, ["input"]),
      (args) => {
        const text = typeof args.input === "string" ? args.input.slice(0, 4000) : "";
        if (!text) throw new ToolError('"input" is required.');
        if (args.mark === undefined && !args.app) throw new ToolError("Give a mark, or the app to type into.");
        return {
          summary: `Type “${clip(text, 40)}”`,
          preview: text,
          async run() {
            await adapter.type(text, { mark: args.mark === undefined ? undefined : requireMark(args.mark), app: typeof args.app === "string" ? args.app : undefined });
            return after("Typed.");
          },
        };
      },
    ),
    tool(
      "desktop_set_value",
      "Replace the whole value of a text field, slider or similar by its mark. Faster and more exact than typing when the field allows it.",
      object({ mark: MARK, input: { type: "string" } }, ["mark", "input"]),
      (args) => {
        const mark = requireMark(args.mark);
        const text = typeof args.input === "string" ? args.input : "";
        return {
          summary: `Set mark ${mark} to “${clip(text, 40)}”`,
          preview: text.slice(0, 500),
          async run() {
            const value = await adapter.setValue(mark, text);
            return after(`Set the value. It now reads “${clip(value, 80)}”.`);
          },
        };
      },
    ),
    tool(
      "desktop_key",
      "Press keys, such as return, tab, escape, down, cmd+s, cmd+shift+4, or several separated by spaces. Modifiers are cmd, shift, alt and ctrl. Give app to send them to that app.",
      object({ keys: { type: "string" }, app: APP }, ["keys"]),
      (args) => {
        const keys = typeof args.keys === "string" ? args.keys.trim() : "";
        if (!keys) throw new ToolError('"keys" is required.');
        return {
          summary: `Press ${keys}`,
          preview: keys,
          async run() {
            await adapter.key(keys, typeof args.app === "string" ? args.app : undefined);
            return after(`Pressed ${keys}.`);
          },
        };
      },
    ),
    tool(
      "desktop_scroll",
      "Scroll a list, page or document: by mark, or at the middle of the screen.",
      object({ mark: MARK, direction: { type: "string", enum: ["up", "down", "left", "right"] }, amount: { type: "integer", description: "Pixels. Default 400." } }, ["direction"]),
      (args) => ({
        summary: `Scroll ${String(args.direction)}`,
        async run() {
          const amount = typeof args.amount === "number" ? args.amount : 400;
          const direction = String(args.direction);
          await adapter.scroll({
            mark: args.mark === undefined ? undefined : requireMark(args.mark),
            dy: direction === "up" ? amount : direction === "down" ? -amount : 0,
            dx: direction === "left" ? amount : direction === "right" ? -amount : 0,
          });
          return after(`Scrolled ${direction}.`, 300);
        },
      }),
    ),
    tool(
      "desktop_read",
      "Read one element's exact value, title and description by its mark. Secure fields are never read.",
      object({ mark: MARK }, ["mark"]),
      (args) => {
        const mark = requireMark(args.mark);
        return {
          summary: `Read mark ${mark}`,
          async run() {
            const info = await adapter.read(mark);
            return Object.entries(info).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") || "Nothing to read.";
          },
        };
      },
    ),
    tool(
      "desktop_open",
      "Open an app (or bring it to the front), or quit it.",
      object({ app: APP, action: { type: "string", enum: ["open", "quit"], description: "Default open." }, force: { type: "boolean", description: "Force quit." } }, ["app"]),
      (args) => {
        const app = String(args.app ?? "").trim();
        if (!app) throw new ToolError('"app" is required.');
        const quitting = args.action === "quit";
        return {
          summary: `${quitting ? "Quit" : "Open"} ${app}`,
          async run() {
            if (quitting) {
              await adapter.quit(app, args.force === true);
              return `Asked ${app} to quit.`;
            }
            const result = await adapter.launch(app);
            await wait(result.launched ? 1200 : 300);
            focus = { app };
            return after(result.launched ? `Opened ${app}.` : `${app} was already open; brought it to the front.`, 100);
          },
        };
      },
    ),
    tool(
      "desktop_screenshot",
      "Take a screenshot of an app's window, or of the whole screen, and look at it. Use it only for what the outline cannot show, such as a drawing or a video.",
      object({ app: APP, question: { type: "string", description: "What to look for." } }, []),
      (args, ctx) => ({
        summary: args.app ? `Screenshot ${String(args.app)}` : "Screenshot the screen",
        async run(): Promise<string | ToolOutput> {
          const data = await adapter.screenshot(typeof args.app === "string" && args.app ? args.app : undefined);
          return lookAt(ctx, { mime: data.mime, base64: data.base64, label: args.app ? `screenshot of ${String(args.app)}` : "screenshot of the screen", question: typeof args.question === "string" ? args.question.trim() : "" });
        },
      }),
    ),
    tool(
      "desktop_clipboard",
      "Read or replace the text on the clipboard.",
      object({ action: { type: "string", enum: ["get", "set"] }, text: { type: "string", description: "For set." } }, ["action"]),
      (args) => {
        const set = args.action === "set";
        const text = typeof args.text === "string" ? args.text : "";
        if (set && !text) throw new ToolError('"text" is required to set the clipboard.');
        return {
          summary: set ? "Set the clipboard" : "Read the clipboard",
          preview: set ? text.slice(0, 500) : "",
          async run() {
            if (set) {
              await adapter.clipboardSet(text);
              return "Clipboard set.";
            }
            return clip(await adapter.clipboardGet(), 8000) || "The clipboard has no text.";
          },
        };
      },
    ),
  ];
}
