import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolError } from "../workspace";
import type { DesktopAdapter } from "./adapter";
import { createHelperAdapter } from "./helper";

const SOURCE = fileURLToPath(new URL("./native/macos-ax.swift", import.meta.url));

const PREBUILT = fileURLToPath(new URL("./native/bin/Bluebird.app/Contents/MacOS/Bluebird", import.meta.url));
const PREBUILT_SOURCE = fileURLToPath(new URL("./native/bin/macos-ax.source", import.meta.url));

/**
 * The helper to run. A universal, signed build ships with Bluebird, so people need no developer
 * tools; it is used when it matches the source. Otherwise (the source was edited) it is built
 * here with the Xcode command line tools, once per version of the source.
 */
export async function ensureHelper(cacheDir: string): Promise<string> {
  const source = await readFile(SOURCE);
  const key = createHash("sha1").update(source).digest("hex").slice(0, 12);
  const shipped = existsSync(PREBUILT) && (await readFile(PREBUILT_SOURCE, "utf8").catch(() => "")).trim() === key;
  if (shipped) return PREBUILT;
  const binary = join(cacheDir, `bluebird-ax-${key}`);
  if (existsSync(binary)) return binary;
  await mkdir(dirname(binary), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    execFile("swiftc", ["-O", "-swift-version", "5", SOURCE, "-o", binary], { timeout: 180_000 }, (error, _out, stderr) => {
      if (error) reject(new ToolError(`Could not prepare the macOS helper. Install the Xcode command line tools (xcode-select --install). ${String(stderr).slice(0, 300)}`));
      else resolve();
    });
  });
  return binary;
}

const SETTINGS_PANE = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
};
const openedPane = new Set<string>();
/** Opens the right System Settings page, once per run, so the person is not sent hunting for it. */
function openPane(name: keyof typeof SETTINGS_PANE) {
  if (openedPane.has(name)) return;
  openedPane.add(name);
  execFile("/usr/bin/open", [SETTINGS_PANE[name]], () => undefined);
}

const run = (file: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(file, args, { timeout: 15_000 }, (error, _out, stderr) => (error ? reject(new ToolError(String(stderr || error.message).trim().slice(0, 300))) : resolve()));
  });

/** macOS: a Swift helper that reads and drives apps through the accessibility API. */
export function createMacAdapter(options: { helper?: string; cacheDir?: string; guide?: boolean } = {}): DesktopAdapter {
  const guide = options.guide !== false;
  return createHelperAdapter({
    platform: "macos",
    notReady: "Bluebird needs your permission to control apps. In System Settings, Privacy & Security, Accessibility, turn on the switch for Bluebird (or the app that runs it), then try again.",
    statusRequest: guide ? { prompt: true } : undefined,
    onNotReady: guide ? () => openPane("accessibility") : undefined,
    async command() {
      return { file: options.helper ?? (await ensureHelper(options.cacheDir ?? join(process.cwd(), ".data", "helpers"))), args: [] };
    },
    async screenshot(app, call) {
      const dir = await mkdtemp(join(tmpdir(), "bluebird-screen-"));
      const file = join(dir, "shot.jpg");
      try {
        const args = ["-x", "-t", "jpg"];
        if (app) {
          const ids = ((await call({ op: "window_ids", app })).ids ?? []) as number[];
          if (ids[0]) args.push("-l", String(ids[0]));
        }
        await run("/usr/sbin/screencapture", [...args, file]);
        const bytes = await readFile(file).catch(() => null);
        if (!bytes || bytes.length < 500) {
          await call({ op: "request_screen" }).catch(() => undefined);
          if (guide) openPane("screen");
          throw new ToolError("The screenshot came back empty. I opened System Settings: turn on Screen Recording for Bluebird (or the app that runs it), then ask me again.");
        }
        return { base64: bytes.toString("base64"), mime: "image/jpeg" };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  });
}
