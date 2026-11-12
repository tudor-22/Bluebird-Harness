import { fileURLToPath } from "node:url";
import type { DesktopAdapter } from "./adapter";
import { createHelperAdapter } from "./helper";

const SCRIPT = fileURLToPath(new URL("./native/linux-atspi.py", import.meta.url));

/** Linux: a Python helper that reads and drives apps through AT-SPI (needs python3 with PyGObject and gir1.2-atspi-2.0). */
export function createLinuxAdapter(options: { script?: string; python?: string } = {}): DesktopAdapter {
  return createHelperAdapter({
    platform: "linux",
    notReady: "Turn on accessibility for the desktop (GNOME: Settings, Accessibility, or `gsettings set org.gnome.desktop.interface toolkit-accessibility true`), and install python3-gi and gir1.2-atspi-2.0.",
    async command() {
      return { file: options.python ?? "python3", args: [options.script ?? SCRIPT] };
    },
  });
}
