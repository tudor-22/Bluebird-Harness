import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolError } from "../workspace";
import { Cdp, type CdpEvent } from "./cdp";
import { parseKeys } from "./keys";
import { buildOutline, type AxNode, type Mark } from "./outline";

export type EngineOptions = {
  /** A Chrome-family program to start, or a way to find or fetch one when it is first needed. */
  executable?: string | (() => Promise<string | undefined>);
  /** Or an already-running browser to attach to, such as http://127.0.0.1:9222. */
  attachTo?: string;
  /** A folder that keeps logins and cookies between runs. Without one, each run starts clean. */
  profileDir?: string;
  /** Show the window instead of running hidden. */
  headed?: boolean;
};

export type Target = { mark?: number; text?: string; selector?: string };

/** What an action tells the model: what happened, then the page as it is now. */
export type Report = { notes: string[]; page: string };

type Tab = { targetId: string; session: string };
type LogEntry = { at: number; kind: "console" | "error" | "request"; text: string };

const SETTLE_MS = 250;
const NAV_WAIT_MS = 15_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const short = (value: string, length = 80) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

/**
 * Drives a real browser through the DevTools Protocol. The model sees an
 * outline of the page with numbered marks, and acts on a mark: the engine
 * brings the element into view, checks that nothing covers it, and then uses
 * real mouse and keyboard input, so pages react as they would to a person.
 */
export function createWebEngine(options: EngineOptions = {}) {
  let child: ChildProcess | null = null;
  let cdp: Cdp | null = null;
  let tmpProfile = "";
  let downloads = "";
  let idleTimer: NodeJS.Timeout | null = null;
  const tabs: Tab[] = [];
  let current: Tab | null = null;
  let marks = new Map<number, Mark>();
  let loading = false;
  let loadWaiters: (() => void)[] = [];
  const logs: LogEntry[] = [];
  const pendingNotes: string[] = [];
  let dialogPolicy: "dismiss" | "accept" = "dismiss";
  const seenDownloads = new Set<string>();

  const note = (text: string) => {
    if (pendingNotes.length < 20) pendingNotes.push(text);
  };
  const log = (kind: LogEntry["kind"], text: string) => {
    logs.push({ at: Date.now(), kind, text: short(text, 300) });
    if (logs.length > 200) logs.shift();
  };

  async function shutdown() {
    if (idleTimer) clearTimeout(idleTimer);
    cdp?.close();
    cdp = null;
    tabs.length = 0;
    current = null;
    marks = new Map();
    try {
      child?.kill("SIGTERM");
    } catch {
      // Already gone.
    }
    child = null;
    if (tmpProfile) await rm(tmpProfile, { recursive: true, force: true }).catch(() => undefined);
    tmpProfile = "";
  }

  function onEvent(event: CdpEvent) {
    const here = current?.session;
    switch (event.method) {
      case "Page.frameStartedLoading":
        if (event.sessionId === here) loading = true;
        break;
      case "Page.loadEventFired":
      case "Page.frameStoppedLoading":
        if (event.sessionId === here) {
          loading = false;
          for (const done of loadWaiters.splice(0)) done();
        }
        break;
      case "Page.javascriptDialogOpening": {
        const { type, message } = event.params as { type: string; message: string };
        const accept = type === "alert" || type === "beforeunload" || dialogPolicy === "accept";
        note(`A ${type} dialog said "${short(String(message), 120)}" and was ${accept ? "accepted" : "dismissed"}.`);
        void cdp?.send("Page.handleJavaScriptDialog", { accept }, event.sessionId).catch(() => undefined);
        break;
      }
      case "Runtime.consoleAPICalled": {
        const args = (event.params.args ?? []) as { value?: unknown; description?: string }[];
        log("console", `${event.params.type}: ${args.map((arg) => String(arg.value ?? arg.description ?? "")).join(" ")}`);
        break;
      }
      case "Runtime.exceptionThrown":
        log("error", event.params.exceptionDetails?.exception?.description ?? event.params.exceptionDetails?.text ?? "Script error");
        break;
      case "Network.loadingFailed":
        if (!event.params.canceled) log("request", `failed: ${event.params.errorText ?? "request failed"}`);
        break;
      case "Network.responseReceived":
        if (event.params.response?.status >= 400) log("request", `${event.params.response.status} ${event.params.response.url}`);
        break;
      case "Browser.downloadWillBegin":
        note(`Downloading ${event.params.suggestedFilename ?? "a file"} to ${downloads}.`);
        seenDownloads.add(String(event.params.suggestedFilename ?? ""));
        break;
      case "Target.targetCreated": {
        const info = event.params.targetInfo as { type: string; targetId: string; openerId?: string };
        if (info.type === "page" && info.openerId && !tabs.some((tab) => tab.targetId === info.targetId)) {
          void attach(info.targetId, true).then(() => note("A new tab opened and is now the one you are looking at.")).catch(() => undefined);
        }
        break;
      }
      case "Target.targetDestroyed": {
        const id = event.params.targetId as string;
        const at = tabs.findIndex((tab) => tab.targetId === id);
        if (at !== -1) {
          tabs.splice(at, 1);
          if (current?.targetId === id) current = tabs[tabs.length - 1] ?? null;
        }
        break;
      }
    }
  }

  async function attach(targetId: string, makeCurrent: boolean): Promise<Tab> {
    const client = cdp!;
    const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
    const tab: Tab = { targetId, session: sessionId };
    tabs.push(tab);
    await Promise.all([
      client.send("Page.enable", {}, sessionId),
      client.send("Runtime.enable", {}, sessionId),
      client.send("DOM.enable", {}, sessionId),
      client.send("Network.enable", {}, sessionId),
      client.send("Accessibility.enable", {}, sessionId),
    ]);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId).catch(() => undefined);
    if (makeCurrent) current = tab;
    return tab;
  }

  async function launch(): Promise<void> {
    let wsUrl: string;
    if (options.attachTo) {
      const response = await fetch(`${options.attachTo.replace(/\/$/, "")}/json/version`).catch(() => null);
      const info = (await response?.json().catch(() => null)) as { webSocketDebuggerUrl?: string } | null;
      if (!info?.webSocketDebuggerUrl) throw new ToolError(`Could not reach a browser at ${options.attachTo}.`);
      wsUrl = info.webSocketDebuggerUrl;
    } else {
      const executable = typeof options.executable === "function" ? await options.executable() : options.executable;
      if (!executable) throw new ToolError("No Chrome, Chromium, Brave or Edge was found. Install one, or set BLUEBIRD_BROWSER to its path.");
      let profile = options.profileDir;
      if (profile) await mkdir(profile, { recursive: true });
      else profile = tmpProfile = await mkdtemp(join(tmpdir(), "bluebird-browser-"));
      const args = [
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1280,800",
        "--disable-features=Translate,MediaRouter",
        ...(options.headed ? [] : ["--headless=new"]),
        "about:blank",
      ];
      child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
      wsUrl = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ToolError("The browser did not start in time.")), 15_000);
        let seen = "";
        child!.stderr!.on("data", (chunk: Buffer) => {
          seen += chunk.toString();
          const match = /DevTools listening on (ws:\/\/\S+)/.exec(seen);
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child!.on("error", (error) => reject(new ToolError(`Could not start the browser: ${error.message}`)));
        child!.on("close", () => reject(new ToolError("The browser stopped at once.")));
      }).catch(async (error) => {
        await shutdown();
        throw error;
      });
    }
    const client = new Cdp();
    await client.connect(wsUrl);
    cdp = client;
    client.on(onEvent);
    downloads = await mkdtemp(join(tmpdir(), "bluebird-downloads-"));
    await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true }).catch(() => undefined);
    await client.send("Target.setDiscoverTargets", { discover: true }).catch(() => undefined);
    const { targetInfos } = await client.send("Target.getTargets");
    const existing = (targetInfos as { type: string; targetId: string }[]).find((target) => target.type === "page");
    const targetId = existing?.targetId ?? (await client.send("Target.createTarget", { url: "about:blank" })).targetId;
    await attach(targetId, true);
  }

  async function ensure(): Promise<{ cdp: Cdp; tab: Tab }> {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void shutdown(), 10 * 60_000);
    idleTimer.unref();
    if (!cdp || cdp.closed) {
      await shutdown();
      await launch();
    }
    if (!current) {
      const { targetId } = await cdp!.send("Target.createTarget", { url: "about:blank" });
      await attach(targetId, true);
    }
    return { cdp: cdp!, tab: current! };
  }

  const send = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const live = await ensure();
    return live.cdp.send(method, params, live.tab.session);
  };

  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new ToolError(short(result.exceptionDetails.exception?.description ?? "The page script failed.", 400));
    return result.result?.value as T;
  }

  /** Waits for a navigation to finish and the page to stop changing for a moment. */
  async function settle(extra = 0): Promise<void> {
    await wait(60);
    if (loading) {
      await new Promise<void>((resolve) => {
        loadWaiters.push(resolve);
        setTimeout(resolve, NAV_WAIT_MS);
      });
    }
    await wait(SETTLE_MS + extra);
  }

  async function axTree(): Promise<AxNode[]> {
    const { nodes } = await send("Accessibility.getFullAXTree");
    return nodes as AxNode[];
  }

  async function describePage(options: { within?: number; actionsOnly?: boolean } = {}): Promise<string> {
    const title = await evaluate<string>("document.title").catch(() => "");
    const url = await evaluate<string>("location.href").catch(() => "");
    const nodes = await axTree();
    const outline = buildOutline(nodes, { within: options.within, actionsOnly: options.actionsOnly });
    let startAt = outline.marks.length + 1;
    const all = [...outline.marks];
    const sections = [outline.text || "(nothing readable on this page yet)"];
    // Same-process frames are read too, so embedded forms and widgets are reachable.
    try {
      const { frameTree } = await send("Page.getFrameTree");
      const children = (frameTree.childFrames ?? []) as { frame: { id: string; url: string } }[];
      for (const child of children.slice(0, 4)) {
        const sub = await send("Accessibility.getFullAXTree", { frameId: child.frame.id }).catch(() => null);
        if (!sub?.nodes?.length) continue;
        const part = buildOutline(sub.nodes as AxNode[], { startAt, actionsOnly: options.actionsOnly, maxChars: 4000 });
        if (part.marks.length === 0 && !part.text.trim()) continue;
        sections.push(`\nframe ${short(child.frame.url, 100)}\n${part.text}`);
        all.push(...part.marks);
        startAt += part.marks.length;
      }
    } catch {
      // Frames are a bonus.
    }
    marks = new Map(all.map((mark) => [mark.n, mark]));
    const header = [`${title || "(untitled)"}`, url];
    if (tabs.length > 1) header.push(`Tab ${tabs.indexOf(current!) + 1} of ${tabs.length}`);
    return `${header.join("\n")}\n\n${sections.join("\n")}`;
  }

  async function report(extraSettle = 0, opts: { within?: number; actionsOnly?: boolean } = {}): Promise<Report> {
    await settle(extraSettle);
    const page = await describePage(opts);
    const notes = pendingNotes.splice(0);
    // A download that finished is worth naming, since the model can then read it.
    const files = await readdir(downloads).catch(() => [] as string[]);
    const done = files.filter((file) => !file.endsWith(".crdownload") && seenDownloads.has(file));
    for (const file of done) {
      notes.push(`Saved download: ${join(downloads, file)}`);
      seenDownloads.delete(file);
    }
    return { notes, page };
  }

  // Finding the page node behind a target ----------------------------------

  async function backendIdFor(target: Target): Promise<{ id: number; label: string }> {
    if (target.mark !== undefined) {
      const mark = marks.get(target.mark);
      if (!mark) throw new ToolError(`There is no mark ${target.mark}. Use browser_look to see the current marks.`);
      return { id: mark.backendNodeId, label: `${mark.role} "${short(mark.name, 40)}"` };
    }
    if (target.text) {
      const needle = target.text.trim().toLowerCase();
      const hits = [...marks.values()].filter((mark) => mark.name.toLowerCase().includes(needle));
      const exact = hits.filter((mark) => mark.name.toLowerCase() === needle);
      const pool = exact.length > 0 ? exact : hits;
      if (pool.length === 0) throw new ToolError(`Nothing on the page is labelled "${target.text}". Use browser_look to see what is there.`);
      if (pool.length > 1) {
        throw new ToolError(`"${target.text}" matches ${pool.length} things: ${pool.slice(0, 6).map((mark) => `[${mark.n}] ${mark.role} "${short(mark.name, 40)}"`).join(", ")}. Use the mark number.`);
      }
      return { id: pool[0].backendNodeId, label: `${pool[0].role} "${short(pool[0].name, 40)}"` };
    }
    if (target.selector) {
      const { root } = await send("DOM.getDocument", { depth: 0 });
      const found = await send("DOM.querySelector", { nodeId: root.nodeId, selector: target.selector }).catch(() => ({ nodeId: 0 }));
      if (!found.nodeId) throw new ToolError(`No element matches the selector ${target.selector}.`);
      const { node } = await send("DOM.describeNode", { nodeId: found.nodeId });
      return { id: node.backendNodeId, label: target.selector };
    }
    throw new ToolError("Say what to act on: a mark number, its visible text, or a CSS selector.");
  }

  async function objectFor(backendNodeId: number): Promise<string> {
    try {
      const { object } = await send("DOM.resolveNode", { backendNodeId });
      return object.objectId as string;
    } catch {
      throw new ToolError("That mark is out of date: the page changed. Use browser_look again.");
    }
  }

  const callOn = async (objectId: string, fn: string, args: unknown[] = []) => {
    const result = await send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: fn,
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new ToolError(short(result.exceptionDetails.exception?.description ?? "The page script failed.", 300));
    return result.result?.value;
  };

  /** The centre of an element on screen, after scrolling it into view and checking nothing covers it. */
  async function aim(target: Target, force = false): Promise<{ x: number; y: number; objectId: string; label: string; id: number }> {
    const { id, label } = await backendIdFor(target);
    await send("DOM.scrollIntoViewIfNeeded", { backendNodeId: id }).catch(() => undefined);
    const objectId = await objectFor(id);
    let quads: number[][];
    try {
      quads = (await send("DOM.getContentQuads", { backendNodeId: id })).quads;
    } catch {
      quads = [];
    }
    const quad = quads.find((q) => Math.abs((q[2] - q[0]) * (q[7] - q[1])) > 1) ?? null;
    if (!quad) throw new ToolError(`${label} is not visible on the page (it has no size or is hidden). Scroll, wait, or open the part of the page that shows it.`);
    const x = Math.round((quad[0] + quad[2] + quad[4] + quad[6]) / 4);
    const y = Math.round((quad[1] + quad[3] + quad[5] + quad[7]) / 4);
    if (!force) {
      const problem = await callOn(
        objectId,
        `function(x, y) {
          if (this.disabled || this.getAttribute("aria-disabled") === "true") return "it is disabled";
          const deep = (px, py) => { let el = document.elementFromPoint(px, py); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(px, py); if (!inner || inner === el) break; el = inner; } return el; };
          const top = deep(x, y);
          if (!top) return "it is outside the visible window";
          if (top === this || this.contains(top) || top.contains(this)) return "";
          const name = top.tagName.toLowerCase() + (top.id ? "#" + top.id : "") + (typeof top.className === "string" && top.className ? "." + top.className.trim().split(/\\s+/)[0] : "");
          return "it is covered by <" + name + ">" + ((top.innerText || "").trim() ? ' "' + top.innerText.trim().slice(0, 40) + '"' : "");
        }`,
        [x, y],
      );
      if (problem) throw new ToolError(`${label} cannot be clicked: ${problem}. Close or move what covers it, then look again.`);
    }
    return { x, y, objectId, label, id };
  }

  const mouse = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, ...extra });

  async function pressKeys(spec: string) {
    const { def, modifiers, commands } = parseKeys(spec);
    const base = { modifiers, key: def.key, code: def.code, windowsVirtualKeyCode: def.vk, nativeVirtualKeyCode: def.vk };
    await send("Input.dispatchKeyEvent", { type: def.text ? "keyDown" : "rawKeyDown", ...base, ...(def.text ? { text: def.text } : {}), ...(commands.length ? { commands } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  // Public actions ---------------------------------------------------------

  return {
    async open(url: string, onDialog?: "accept" | "dismiss"): Promise<Report> {
      if (onDialog) dialogPolicy = onDialog;
      await ensure();
      loading = true;
      const result = await send("Page.navigate", { url });
      if (result.errorText) {
        loading = false;
        throw new ToolError(`Could not open ${url}: ${String(result.errorText).replace(/^net::/, "")}.`);
      }
      return report();
    },

    async look(opts: { mark?: number; actionsOnly?: boolean } = {}): Promise<Report> {
      await ensure();
      let within: number | undefined;
      if (opts.mark !== undefined) {
        const mark = marks.get(opts.mark);
        if (!mark) throw new ToolError(`There is no mark ${opts.mark}. Look at the whole page first.`);
        within = mark.backendNodeId;
      }
      return report(0, { within, actionsOnly: opts.actionsOnly });
    },

    async click(target: Target, opts: { double?: boolean; right?: boolean; force?: boolean; onDialog?: "accept" | "dismiss" } = {}): Promise<Report> {
      if (opts.onDialog) dialogPolicy = opts.onDialog;
      const spot = await aim(target, opts.force);
      const button = opts.right ? "right" : "left";
      await mouse("mouseMoved", spot.x, spot.y);
      for (let count = 1; count <= (opts.double ? 2 : 1); count += 1) {
        await mouse("mousePressed", spot.x, spot.y, { button, clickCount: count });
        await mouse("mouseReleased", spot.x, spot.y, { button, clickCount: count });
      }
      pendingNotes.unshift(`Clicked ${spot.label}.`);
      return report();
    },

    async hover(target: Target): Promise<Report> {
      const spot = await aim(target, true);
      await mouse("mouseMoved", spot.x, spot.y);
      pendingNotes.unshift(`Moved the pointer over ${spot.label}.`);
      return report(200);
    },

    async type(target: Target, text: string, opts: { clear?: boolean; submit?: boolean } = {}): Promise<Report> {
      const spot = await aim(target);
      await mouse("mousePressed", spot.x, spot.y, { button: "left", clickCount: 1 });
      await mouse("mouseReleased", spot.x, spot.y, { button: "left", clickCount: 1 });
      await send("DOM.focus", { backendNodeId: spot.id }).catch(() => undefined);
      const editable = await callOn(spot.objectId, `function() { return !!(this.isContentEditable || "value" in this); }`);
      if (!editable) throw new ToolError(`${spot.label} is not something you can type into.`);
      if (opts.clear !== false) {
        await callOn(
          spot.objectId,
          `function() { this.focus(); if ("select" in this && typeof this.select === "function") this.select(); else { const r = document.createRange(); r.selectNodeContents(this); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }`,
        );
        await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
      if (text) await send("Input.insertText", { text });
      pendingNotes.unshift(`Typed into ${spot.label}.`);
      if (opts.submit) await pressKeys("Enter");
      return report(opts.submit ? 400 : 0);
    },

    async press(keys: string, opts: { onDialog?: "accept" | "dismiss" } = {}): Promise<Report> {
      if (opts.onDialog) dialogPolicy = opts.onDialog;
      await ensure();
      for (const chord of keys.split(/\s+/).filter(Boolean)) await pressKeys(chord);
      pendingNotes.unshift(`Pressed ${keys}.`);
      return report();
    },

    async scroll(direction: "up" | "down" | "left" | "right" | "top" | "bottom", amount = 600, target?: Target): Promise<Report> {
      await ensure();
      if (direction === "top" || direction === "bottom") {
        await evaluate(`window.scrollTo({ top: ${direction === "top" ? 0 : "document.documentElement.scrollHeight"} })`);
      } else {
        let x = 640;
        let y = 400;
        if (target) {
          const spot = await aim(target, true);
          x = spot.x;
          y = spot.y;
        }
        const dx = direction === "left" ? -amount : direction === "right" ? amount : 0;
        const dy = direction === "up" ? -amount : direction === "down" ? amount : 0;
        await mouse("mouseWheel", x, y, { deltaX: dx, deltaY: dy });
      }
      pendingNotes.unshift(`Scrolled ${direction}.`);
      return report(150);
    },

    async select(target: Target, option: string): Promise<Report> {
      const spot = await aim(target, true);
      const chosen = (await callOn(
        spot.objectId,
        `function(wanted) {
          if (this.tagName !== "SELECT") return null;
          const lower = wanted.toLowerCase();
          const options = [...this.options];
          const hit = options.find((o) => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower) || options.find((o) => o.label.toLowerCase().includes(lower));
          if (!hit) return "!" + options.map((o) => o.label).slice(0, 20).join(" | ");
          this.value = hit.value;
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
          return hit.label;
        }`,
        [option],
      )) as string | null;
      if (chosen === null) throw new ToolError(`${spot.label} is not a dropdown. Click it and then click the option instead.`);
      if (chosen.startsWith("!")) throw new ToolError(`No option matches "${option}". The options are: ${chosen.slice(1)}.`);
      pendingNotes.unshift(`Chose "${chosen}" in ${spot.label}.`);
      return report();
    },

    async upload(target: Target, files: string[]): Promise<Report> {
      const { id, label } = await backendIdFor(target);
      await send("DOM.setFileInputFiles", { files, backendNodeId: id }).catch(() => {
        throw new ToolError(`${label} is not a file field.`);
      });
      pendingNotes.unshift(`Attached ${files.length} file${files.length === 1 ? "" : "s"} to ${label}.`);
      return report();
    },

    async waitFor(opts: { text?: string; gone?: string; selector?: string; ms?: number; timeoutMs?: number }): Promise<Report> {
      await ensure();
      const deadline = Date.now() + Math.min(opts.timeoutMs ?? 10_000, 30_000);
      if (opts.ms) await wait(Math.min(opts.ms, 15_000));
      const check = (expression: string) => evaluate<boolean>(expression).catch(() => false);
      const has = (needle: string) => `(document.body && document.body.innerText || "").toLowerCase().includes(${JSON.stringify(needle.toLowerCase())})`;
      if (opts.text || opts.gone || opts.selector) {
        let ok = false;
        while (Date.now() < deadline) {
          ok = true;
          if (opts.text && !(await check(has(opts.text)))) ok = false;
          if (opts.gone && (await check(has(opts.gone)))) ok = false;
          if (opts.selector && !(await check(`!!document.querySelector(${JSON.stringify(opts.selector)})`))) ok = false;
          if (ok) break;
          await wait(250);
        }
        pendingNotes.unshift(ok ? "The wait finished." : "Timed out waiting; here is the page as it is now.");
      }
      return report();
    },

    async history(direction: "back" | "forward" | "reload"): Promise<Report> {
      await ensure();
      if (direction === "reload") {
        loading = true;
        await send("Page.reload");
      } else {
        const { currentIndex, entries } = await send("Page.getNavigationHistory");
        const entry = entries[currentIndex + (direction === "back" ? -1 : 1)];
        if (!entry) throw new ToolError(`There is no page to go ${direction} to.`);
        loading = true;
        await send("Page.navigateToHistoryEntry", { entryId: entry.id });
      }
      return report();
    },

    async tabs(action: "list" | "new" | "switch" | "close", opts: { index?: number; url?: string } = {}): Promise<Report> {
      await ensure();
      const listing = async () => {
        const infos = await Promise.all(
          tabs.map(async (tab, i) => {
            const result = await cdp!.send("Runtime.evaluate", { expression: "document.title + ' | ' + location.href", returnByValue: true }, tab.session).catch(() => null);
            return `${i + 1}${tab === current ? "*" : " "} ${result?.result?.value ?? "(unreadable)"}`;
          }),
        );
        return infos.join("\n");
      };
      if (action === "new") {
        const { targetId } = await cdp!.send("Target.createTarget", { url: opts.url || "about:blank" });
        if (!tabs.some((tab) => tab.targetId === targetId)) await attach(targetId, true);
        else current = tabs.find((tab) => tab.targetId === targetId)!;
        pendingNotes.unshift("Opened a new tab.");
      } else if (action === "switch" || action === "close") {
        const tab = tabs[(opts.index ?? 0) - 1];
        if (!tab) throw new ToolError(`There is no tab ${opts.index}. Tabs are numbered from 1.`);
        if (action === "switch") {
          current = tab;
          await cdp!.send("Target.activateTarget", { targetId: tab.targetId }).catch(() => undefined);
          pendingNotes.unshift(`Switched to tab ${opts.index}.`);
        } else {
          await cdp!.send("Target.closeTarget", { targetId: tab.targetId }).catch(() => undefined);
          await wait(150);
          pendingNotes.unshift(`Closed tab ${opts.index}.`);
        }
      }
      if (action === "list") return { notes: [], page: await listing() };
      const result = await report();
      result.notes.push(`Tabs:\n${await listing()}`);
      return result;
    },

    async run(script: string): Promise<string> {
      await ensure();
      const value = await evaluate(`(async () => { ${/\breturn\b/.test(script) ? script : `return (${script})`} })()`);
      const out = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return short(out ?? "undefined", 6000);
    },

    async screenshot(opts: { mark?: number; full?: boolean } = {}): Promise<string> {
      await ensure();
      const params: Record<string, unknown> = { format: "jpeg", quality: 70 };
      if (opts.mark !== undefined) {
        const mark = marks.get(opts.mark);
        if (!mark) throw new ToolError(`There is no mark ${opts.mark}.`);
        await send("DOM.scrollIntoViewIfNeeded", { backendNodeId: mark.backendNodeId }).catch(() => undefined);
        const { quads } = await send("DOM.getContentQuads", { backendNodeId: mark.backendNodeId });
        const q = quads?.[0] as number[] | undefined;
        if (q) {
          const xs = [q[0], q[2], q[4], q[6]];
          const ys = [q[1], q[3], q[5], q[7]];
          params.clip = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), scale: 1 };
        }
      } else if (opts.full) {
        params.captureBeyondViewport = true;
      }
      const shot = await send("Page.captureScreenshot", params);
      return shot.data as string;
    },

    logs(limit = 40): string {
      if (logs.length === 0) return "Nothing logged yet.";
      return logs.slice(-limit).map((entry) => `${entry.kind}: ${entry.text}`).join("\n");
    },

    /** Cookies for the current page, as name=value with their flags, never the values of secure ones. */
    async cookies(): Promise<string> {
      const { cookies } = await send("Network.getCookies");
      if (!cookies.length) return "No cookies.";
      return (cookies as { name: string; domain: string; httpOnly: boolean; secure: boolean }[])
        .map((cookie) => `${cookie.name} (${cookie.domain}${cookie.httpOnly ? ", httpOnly" : ""}${cookie.secure ? ", secure" : ""})`)
        .join("\n");
    },

    downloadsFolder: () => downloads,
    close: shutdown,
  };
}

export type WebEngine = ReturnType<typeof createWebEngine>;
