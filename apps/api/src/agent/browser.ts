import { existsSync } from "node:fs";
import { looksPublic } from "./net";
import { lookAt, type ExtraTool, type ToolOutput } from "./tools";
import { ToolError } from "./workspace";
import { createWebEngine, type Report, type Target, type WebEngine } from "./web/engine";
import { chromeTarget, installBrowser, managedBrowser } from "./web/provision";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
];

/** A Chrome-family browser to drive, from BLUEBIRD_BROWSER or the usual places. */
export function findBrowser(): string | null {
  const wanted = process.env.BLUEBIRD_BROWSER;
  if (wanted && existsSync(wanted)) return wanted;
  return CANDIDATES.find((path) => existsSync(path)) ?? null;
}

/** What the model drives. */
export type BrowserController = WebEngine;

/** Whether there is a way to get a browser on this computer: one installed, one downloaded, or one that can be. */
export const browserSupported = () => Boolean(findBrowser() || process.env.BLUEBIRD_BROWSER_CDP || chromeTarget());

/** True when the first use will have to download a browser, which the person is asked about first. */
export async function needsBrowserDownload(managedDir: string): Promise<boolean> {
  if (findBrowser() || process.env.BLUEBIRD_BROWSER_CDP) return false;
  return (await managedBrowser(managedDir)) === null;
}

/**
 * The browser the tools share, started on first use. It uses, in order, BLUEBIRD_BROWSER, a browser
 * already installed, one Bluebird downloaded earlier, and otherwise downloads one into `managedDir`.
 * Other settings: BLUEBIRD_BROWSER_CDP (attach to a running browser), BLUEBIRD_BROWSER_PROFILE
 * (keep logins), BLUEBIRD_BROWSER_HEADED=1 (show the window).
 */
export function createBrowser(options: { executable?: string; managedDir?: string } = {}): BrowserController {
  return createWebEngine({
    executable:
      options.executable ??
      (async () => {
        const found = findBrowser();
        if (found) return found;
        if (!options.managedDir) return undefined;
        return (await managedBrowser(options.managedDir)) ?? (await installBrowser(options.managedDir));
      }),
    attachTo: process.env.BLUEBIRD_BROWSER_CDP || undefined,
    profileDir: process.env.BLUEBIRD_BROWSER_PROFILE || undefined,
    headed: process.env.BLUEBIRD_BROWSER_HEADED === "1",
  });
}

const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

const TARGET = {
  mark: { type: "integer", description: "The number shown in square brackets in the outline, such as 7." },
  text: { type: "string", description: "Or the visible label of the thing, when the mark is not known." },
  selector: { type: "string", description: "Or a CSS selector, as a last resort." },
};
const DIALOG = { on_dialog: { type: "string", enum: ["accept", "dismiss"], description: "How to answer a confirm or prompt dialog this action opens. Default dismiss." } };

function show(report: Report): string {
  return `${report.notes.length ? `${report.notes.join("\n")}\n\n` : ""}${report.page}`;
}

function targetOf(args: Record<string, unknown>): Target {
  const target: Target = {};
  if (typeof args.mark === "number") target.mark = Math.trunc(args.mark);
  if (typeof args.text === "string" && args.text.trim()) target.text = args.text;
  if (typeof args.selector === "string" && args.selector.trim()) target.selector = args.selector;
  if (target.mark === undefined && !target.text && !target.selector) throw new ToolError("Say what to act on: a mark number, its visible text, or a CSS selector.");
  return target;
}

const describeTarget = (target: Target) => (target.mark !== undefined ? `mark ${target.mark}` : target.text ? `“${target.text.slice(0, 40)}”` : target.selector ?? "");
const dialogOf = (args: Record<string, unknown>) => (args.on_dialog === "accept" || args.on_dialog === "dismiss" ? args.on_dialog : undefined);

/**
 * Tools that drive a real browser. The model reads an outline of the page with
 * numbered marks and acts on the marks. Reading is free; anything that clicks,
 * types or runs script asks first, except in Full access.
 */
export function browserTools(browser: BrowserController, setup: { managedDir?: string } = {}): ExtraTool[] {
  const tool = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    build: (args: Record<string, unknown>, ctx: Parameters<ExtraTool["prepare"]>[1]) => { summary: string; preview?: string; autoSafe: boolean; run: () => Promise<string | ToolOutput> } | Promise<{ summary: string; preview?: string; autoSafe: boolean; run: () => Promise<string | ToolOutput> }>,
  ): ExtraTool => ({
    kind: "exec",
    spec: { name, description, parameters },
    async prepare(args, ctx) {
      const built = await build(args, ctx);
      return { name, kind: "exec", scope: "browser", summary: built.summary, preview: built.preview ?? "", autoSafe: built.autoSafe, run: built.run };
    },
  });
  const url = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) throw new ToolError('"url" is required.');
    const text = value.trim();
    if (!/^https?:\/\//i.test(text)) throw new ToolError("Only http and https addresses can be opened.");
    return text;
  };

  return [
    tool(
      "browser_open",
      "Open a web page in a real browser (with JavaScript) and read it as an outline: headings, text, and numbered marks for every link, button and field. Use it to find things on the web, to read sites that need JavaScript, and to open a local dev server you started. Act on a mark with browser_click, browser_type and the other browser tools; look again after the page changes.",
      object({ url: { type: "string", description: "https://… or http://localhost:3000" }, ...DIALOG }, ["url"]),
      async (args) => {
        const address = url(args.url);
        // With no browser on this computer, the first use downloads one, so the person is asked.
        const download = setup.managedDir ? await needsBrowserDownload(setup.managedDir) : false;
        return {
          summary: download ? "Download a browser (about 200 MB), then open a page" : `Open ${address.length > 70 ? `${address.slice(0, 67)}…` : address}`,
          preview: download ? `Bluebird has no browser to use yet. This downloads Google Chrome for Testing into Bluebird's own folder (it does not change any browser you have), then opens:\n${address}` : address,
          // A public page is safe to read on its own; a page on this computer or its network is not.
          autoSafe: !download && looksPublic(address),
          async run() {
            return show(await browser.open(address, dialogOf(args)));
          },
        };
      },
    ),
    tool(
      "browser_look",
      "Read the open page again as an outline with numbered marks. Pass a mark to look only inside that part (a form, a menu, a dialog), or actions_only to list just what can be clicked or filled.",
      object({ mark: { type: "integer", description: "Look only inside this mark." }, actions_only: { type: "boolean" } }, []),
      (args) => ({
        summary: "Read the open page",
        autoSafe: true,
        async run() {
          return show(await browser.look({ mark: typeof args.mark === "number" ? Math.trunc(args.mark) : undefined, actionsOnly: args.actions_only === true }));
        },
      }),
    ),
    tool(
      "browser_click",
      "Click something on the open page with the real mouse. It scrolls the thing into view first and refuses, saying why, if something such as a cookie banner covers it. Returns what changed and the page afterwards.",
      object({ ...TARGET, double: { type: "boolean" }, right: { type: "boolean", description: "Right-click." }, force: { type: "boolean", description: "Click even if covered." }, ...DIALOG }, []),
      (args) => {
        const target = targetOf(args);
        return {
          summary: `Click ${describeTarget(target)}`,
          preview: describeTarget(target),
          // A click can send a form or buy something, so Auto asks.
          autoSafe: false,
          async run() {
            return show(await browser.click(target, { double: args.double === true, right: args.right === true, force: args.force === true, onDialog: dialogOf(args) }));
          },
        };
      },
    ),
    tool(
      "browser_type",
      "Type into a field on the open page. By default it replaces what is there; pass clear false to add to it. submit presses Enter afterwards.",
      object({ ...TARGET, input: { type: "string", description: "The text to type." }, clear: { type: "boolean" }, submit: { type: "boolean" } }, ["input"]),
      (args) => {
        const target = targetOf(args);
        const input = typeof args.input === "string" ? args.input : "";
        return {
          summary: `Type into ${describeTarget(target)}`,
          preview: `${describeTarget(target)}\n${input.slice(0, 500)}`,
          autoSafe: false,
          async run() {
            return show(await browser.type(target, input, { clear: args.clear !== false, submit: args.submit === true }));
          },
        };
      },
    ),
    tool(
      "browser_press",
      "Press keys on the open page: Enter, Tab, Escape, ArrowDown, Control+A, Shift+Tab, F5, or several separated by spaces such as \"Tab Tab Enter\".",
      object({ keys: { type: "string" }, ...DIALOG }, ["keys"]),
      (args) => {
        const keys = typeof args.keys === "string" ? args.keys.trim() : "";
        if (!keys) throw new ToolError('"keys" is required.');
        return { summary: `Press ${keys}`, preview: keys, autoSafe: false, async run() { return show(await browser.press(keys, { onDialog: dialogOf(args) })); } };
      },
    ),
    tool(
      "browser_scroll",
      "Scroll the open page (or a scrollable part, by mark) up, down, left, right, or to the top or bottom.",
      object({ direction: { type: "string", enum: ["up", "down", "left", "right", "top", "bottom"] }, amount: { type: "integer", description: "Pixels. Default 600." }, mark: { type: "integer" } }, ["direction"]),
      (args) => ({
        summary: `Scroll ${String(args.direction)}`,
        autoSafe: true,
        async run() {
          const direction = String(args.direction) as "up" | "down" | "left" | "right" | "top" | "bottom";
          return show(await browser.scroll(direction, typeof args.amount === "number" ? args.amount : 600, typeof args.mark === "number" ? { mark: Math.trunc(args.mark) } : undefined));
        },
      }),
    ),
    tool(
      "browser_hover",
      "Move the pointer over something, to open a hover menu or tooltip.",
      object(TARGET, []),
      (args) => {
        const target = targetOf(args);
        return { summary: `Hover ${describeTarget(target)}`, autoSafe: true, async run() { return show(await browser.hover(target)); } };
      },
    ),
    tool(
      "browser_select",
      "Choose an option in a dropdown (a select element) by its label or value.",
      object({ ...TARGET, option: { type: "string" } }, ["option"]),
      (args) => {
        const target = targetOf(args);
        const option = String(args.option ?? "");
        return { summary: `Choose “${option.slice(0, 40)}” in ${describeTarget(target)}`, preview: option, autoSafe: false, async run() { return show(await browser.select(target, option)); } };
      },
    ),
    tool(
      "browser_upload",
      "Attach files from this computer to a file field on the open page.",
      object({ ...TARGET, files: { type: "array", items: { type: "string" }, description: "File paths on this computer." } }, ["files"]),
      (args, ctx) => {
        const target = targetOf(args);
        const files = Array.isArray(args.files) ? args.files.map((file) => ctx.jail.resolve(String(file))) : [];
        if (files.length === 0) throw new ToolError('"files" is required.');
        return { summary: `Upload ${files.length} file${files.length === 1 ? "" : "s"}`, preview: files.join("\n"), autoSafe: false, async run() { return show(await browser.upload(target, files)); } };
      },
    ),
    tool(
      "browser_wait",
      "Wait for something on the open page: text to appear (text), text to disappear (gone), a selector to exist, or a number of milliseconds. Returns the page afterwards.",
      object({ text: { type: "string" }, gone: { type: "string" }, selector: { type: "string" }, ms: { type: "integer" }, timeout_ms: { type: "integer", description: "Give up after this long. Default 10000." } }, []),
      (args) => ({
        summary: "Wait for the page",
        autoSafe: true,
        async run() {
          return show(await browser.waitFor({ text: typeof args.text === "string" ? args.text : undefined, gone: typeof args.gone === "string" ? args.gone : undefined, selector: typeof args.selector === "string" ? args.selector : undefined, ms: typeof args.ms === "number" ? args.ms : undefined, timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined }));
        },
      }),
    ),
    tool(
      "browser_history",
      "Go back, go forward or reload the open page.",
      object({ direction: { type: "string", enum: ["back", "forward", "reload"] } }, ["direction"]),
      (args) => ({ summary: `Go ${String(args.direction)}`, autoSafe: true, async run() { return show(await browser.history(String(args.direction) as "back" | "forward" | "reload")); } }),
    ),
    tool(
      "browser_tabs",
      "List, open, switch to or close browser tabs. Tabs are numbered from 1.",
      object({ action: { type: "string", enum: ["list", "new", "switch", "close"] }, index: { type: "integer" }, url: { type: "string" } }, ["action"]),
      (args) => {
        const action = String(args.action) as "list" | "new" | "switch" | "close";
        const address = typeof args.url === "string" && args.url.trim() ? url(args.url) : undefined;
        return {
          summary: `Tabs: ${action}`,
          preview: address ?? "",
          autoSafe: !address || looksPublic(address),
          async run() {
            return show(await browser.tabs(action, { index: typeof args.index === "number" ? args.index : undefined, url: address }));
          },
        };
      },
    ),
    tool(
      "browser_eval",
      "Run JavaScript in the open page and return the result, for reading data the outline does not show. Use it sparingly: it can do anything the page can.",
      object({ script: { type: "string", description: "An expression, or statements with a return." } }, ["script"]),
      (args) => {
        const script = String(args.script ?? "").trim();
        if (!script) throw new ToolError('"script" is required.');
        return { summary: "Run script in the page", preview: script.slice(0, 1500), autoSafe: false, async run() { return browser.run(script); } };
      },
    ),
    tool(
      "browser_screenshot",
      "Take a screenshot of the open page (or one mark, or the whole scrolling page) and look at it. Use it only for things the outline cannot show, such as a chart or an image.",
      object({ mark: { type: "integer" }, full: { type: "boolean" }, question: { type: "string", description: "What to look for." } }, []),
      (args, ctx) => ({
        summary: "Screenshot the open page",
        autoSafe: true,
        async run(): Promise<string | ToolOutput> {
          const data = await browser.screenshot({ mark: typeof args.mark === "number" ? Math.trunc(args.mark) : undefined, full: args.full === true });
          return lookAt(ctx, { mime: "image/jpeg", base64: data, label: "screenshot of the page", question: typeof args.question === "string" ? args.question.trim() : "" });
        },
      }),
    ),
    tool(
      "browser_logs",
      "Read what the page logged: console messages, script errors and failed requests. Useful when a page does not behave.",
      object({}, []),
      () => ({ summary: "Read the page log", autoSafe: true, async run() { return browser.logs(); } }),
    ),
    tool(
      "browser_close",
      "Close the browser when you are done with it.",
      object({}, []),
      () => ({ summary: "Close the browser", autoSafe: true, async run() { await browser.close(); return "Closed."; } }),
    ),
  ];
}
