import { fileURLToPath } from "node:url";
import type { DesktopAdapter } from "./adapter";
import { createHelperAdapter } from "./helper";

const SCRIPT = fileURLToPath(new URL("./native/windows-uia.ps1", import.meta.url));

/** Windows: a PowerShell helper that reads and drives apps through UI Automation. No install is needed. */
export function createWindowsAdapter(options: { script?: string; shell?: string } = {}): DesktopAdapter {
  return createHelperAdapter({
    platform: "windows",
    notReady: "Windows could not start UI Automation. Run Bluebird as the same user as the apps you want to use (apps running as administrator need Bluebird to run as administrator too).",
    async command() {
      return {
        file: options.shell ?? "powershell.exe",
        args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", options.script ?? SCRIPT],
      };
    },
  });
}
