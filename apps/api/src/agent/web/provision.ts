import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ToolError } from "../workspace";

/**
 * Gives Bluebird a browser of its own when the computer has none, so nobody has
 * to install one. It downloads Google's Chrome for Testing (a plain Chrome build
 * made for automation) into Bluebird's own folder, and never touches an installed browser.
 */

const INDEX = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

export type ChromeTarget = { key: "mac-arm64" | "mac-x64" | "linux64" | "win64"; executable: string[] };

/** Which download fits this computer, or null when Google publishes none (such as Linux on ARM). */
export function chromeTarget(platform: string = process.platform, arch: string = process.arch): ChromeTarget | null {
  if (platform === "darwin") {
    const key = arch === "arm64" ? "mac-arm64" : "mac-x64";
    return { key, executable: [`chrome-${key}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"] };
  }
  if (platform === "linux" && arch === "x64") return { key: "linux64", executable: ["chrome-linux64", "chrome"] };
  if (platform === "win32") return { key: "win64", executable: ["chrome-win64", "chrome.exe"] };
  return null;
}

/** A browser Bluebird downloaded earlier, if there is one. */
export async function managedBrowser(dir: string, target = chromeTarget()): Promise<string | null> {
  if (!target) return null;
  const versions = await readdir(dir).catch(() => [] as string[]);
  for (const version of versions.sort().reverse()) {
    const path = join(dir, version, ...target.executable);
    if (existsSync(path)) return path;
  }
  return null;
}

const run = (file: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(file, args, { timeout: 300_000 }, (error, _out, stderr) => (error ? reject(new Error(String(stderr || error.message).slice(0, 300))) : resolve()));
  });

export type InstallDeps = {
  fetchJson?: (url: string) => Promise<any>;
  download?: (url: string, file: string) => Promise<void>;
  extract?: (zip: string, into: string) => Promise<void>;
};

async function defaultDownload(url: string, file: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`The download failed (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(file));
}

const defaultExtract = (zip: string, into: string) =>
  process.platform === "win32" ? run("tar", ["-xf", zip, "-C", into]) : run("unzip", ["-q", "-o", zip, "-d", into]);

/** Downloads and unpacks the browser for this computer, returning the program to run. */
export async function installBrowser(dir: string, deps: InstallDeps = {}): Promise<string> {
  const target = chromeTarget();
  if (!target) throw new ToolError("There is no browser download for this kind of computer. Install Chrome, Edge or Brave and Bluebird will use it.");
  const existing = await managedBrowser(dir, target);
  if (existing) return existing;
  try {
    const index = await (deps.fetchJson ?? (async (url) => (await fetch(url)).json()))(INDEX);
    const stable = index?.channels?.Stable;
    const link = (stable?.downloads?.chrome as { platform: string; url: string }[] | undefined)?.find((entry) => entry.platform === target.key)?.url;
    if (!stable?.version || !link) throw new Error("Could not find the download.");
    const staging = join(dir, `.installing-${stable.version}`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    const zip = join(staging, "browser.zip");
    await (deps.download ?? defaultDownload)(link, zip);
    await (deps.extract ?? defaultExtract)(zip, staging);
    await rm(zip, { force: true });
    const finalDir = join(dir, stable.version);
    await rm(finalDir, { recursive: true, force: true });
    await rename(staging, finalDir);
    const executable = join(finalDir, ...target.executable);
    if (!existsSync(executable)) throw new Error("The download did not contain a browser.");
    if (process.platform !== "win32") await chmod(executable, 0o755).catch(() => undefined);
    return executable;
  } catch (error) {
    throw new ToolError(`Could not set up the browser: ${(error as Error).message} Check your internet connection and try again, or install Chrome, Edge or Brave.`);
  }
}
