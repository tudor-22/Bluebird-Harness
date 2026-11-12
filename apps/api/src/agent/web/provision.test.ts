import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { chromeTarget, installBrowser, managedBrowser } from "./provision";

describe("browser provisioning", () => {
  it("picks the download that fits the computer", () => {
    expect(chromeTarget("darwin", "arm64")?.key).toBe("mac-arm64");
    expect(chromeTarget("darwin", "x64")?.key).toBe("mac-x64");
    expect(chromeTarget("win32", "x64")?.key).toBe("win64");
    expect(chromeTarget("linux", "x64")?.key).toBe("linux64");
    expect(chromeTarget("linux", "arm64")).toBeNull();
  });

  it("downloads once, then reuses what it has", async () => {
    const target = chromeTarget()!;
    const dir = await mkdtemp(join(tmpdir(), "bb-provision-"));
    expect(await managedBrowser(dir)).toBeNull();
    let downloads = 0;
    const deps = {
      fetchJson: async () => ({ channels: { Stable: { version: "1.2.3", downloads: { chrome: [{ platform: target.key, url: "https://example.test/chrome.zip" }] } } } }),
      download: async (_url: string, file: string) => {
        downloads += 1;
        await writeFile(file, "zip");
      },
      extract: async (_zip: string, into: string) => {
        const exe = join(into, ...target.executable);
        await mkdir(join(exe, ".."), { recursive: true });
        await writeFile(exe, "#!/bin/sh\n");
      },
    };
    const first = await installBrowser(dir, deps);
    expect(first).toContain(join("1.2.3", ...target.executable));
    expect(await managedBrowser(dir)).toBe(first);
    expect(await installBrowser(dir, deps)).toBe(first);
    expect(downloads).toBe(1);
  });

  it("explains a failed download in plain words", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-provision-"));
    await expect(installBrowser(dir, { fetchJson: async () => { throw new Error("offline"); } })).rejects.toThrow(/Could not set up the browser: offline/);
  });
});
