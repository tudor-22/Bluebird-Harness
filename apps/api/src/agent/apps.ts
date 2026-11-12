import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { fuzzyScore } from "./fuzzy";

/**
 * Every app installed on this computer, so a person can point Bluebird at one
 * with @name. Found the way each system keeps its own list: app bundles on
 * macOS, Start menu shortcuts on Windows, desktop entries on Linux.
 */
export type InstalledApp = {
  /** What the person sees and types: "Safari". */
  name: string;
  /** Stable key for the icon address; never shown. */
  id: string;
  /** Where the app is, or what starts it. */
  location: string;
  /** For Linux, an icon file the desktop entry names. */
  iconFile?: string;
};

const idOf = (location: string) => createHash("sha1").update(location).digest("hex").slice(0, 16);

const dedupe = (apps: InstalledApp[]): InstalledApp[] => {
  const seen = new Set<string>();
  return apps
    .filter((app) => {
      const key = app.name.toLowerCase();
      if (!app.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

// macOS ------------------------------------------------------------------------------------------

const MAC_FOLDERS = ["/Applications", "/System/Applications", "/System/Applications/Utilities", "/Applications/Utilities", join(homedir(), "Applications")];

export async function listMacApps(folders: string[] = MAC_FOLDERS): Promise<InstalledApp[]> {
  const out: InstalledApp[] = [];
  for (const folder of folders) {
    for (const entry of await readdir(folder).catch(() => [] as string[])) {
      if (!entry.endsWith(".app")) continue;
      const location = join(folder, entry);
      out.push({ name: entry.slice(0, -4), id: idOf(location), location });
    }
  }
  return dedupe(out);
}

// Windows ----------------------------------------------------------------------------------------

async function walk(folder: string, depth: number, found: string[]): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const full = join(folder, entry.name);
    if (entry.isDirectory() && depth > 0) await walk(full, depth - 1, found);
    else if (entry.isFile() && /\.lnk$/i.test(entry.name)) found.push(full);
  }
}

const NOT_AN_APP = /uninstall|readme|help|documentation|release notes|license|website|manual/i;

export async function listWindowsApps(
  folders: string[] = [
    join(process.env.ProgramData ?? "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs"),
  ],
): Promise<InstalledApp[]> {
  const shortcuts: string[] = [];
  for (const folder of folders) if (folder) await walk(folder, 3, shortcuts);
  return dedupe(
    shortcuts
      .map((file) => ({ name: basename(file, extname(file)), id: idOf(file), location: file }))
      .filter((app) => !NOT_AN_APP.test(app.name)),
  );
}

// Linux ------------------------------------------------------------------------------------------

/** The fields of a .desktop file that matter here. */
export function parseDesktopEntry(text: string): { name: string; icon?: string; hidden: boolean; type: string } | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[Desktop Entry]");
  if (start === -1) return null;
  const fields: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("[")) break;
    const at = line.indexOf("=");
    if (at > 0 && !/\[[^\]]+\]$/.test(line.slice(0, at))) fields[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  if (!fields.Name) return null;
  return { name: fields.Name, icon: fields.Icon || undefined, hidden: fields.NoDisplay === "true" || fields.Hidden === "true", type: fields.Type ?? "Application" };
}

const LINUX_FOLDERS = [
  "/usr/share/applications",
  "/usr/local/share/applications",
  join(homedir(), ".local/share/applications"),
  "/var/lib/flatpak/exports/share/applications",
  join(homedir(), ".local/share/flatpak/exports/share/applications"),
  "/var/lib/snapd/desktop/applications",
];
const ICON_ROOTS = ["/usr/share/icons/hicolor", "/usr/share/pixmaps", join(homedir(), ".local/share/icons"), "/usr/share/icons/Adwaita", "/usr/share/icons/breeze"];

/** The picture file an icon name stands for, preferring a mid-sized PNG, then an SVG. */
export async function findLinuxIcon(icon: string, roots: string[] = ICON_ROOTS): Promise<string | undefined> {
  if (icon.startsWith("/")) return existsSync(icon) ? icon : undefined;
  const sizes = ["64x64", "48x48", "128x128", "96x96", "256x256", "32x32", "scalable"];
  for (const root of roots) {
    for (const size of sizes) {
      for (const ext of ["png", "svg"]) {
        const candidate = join(root, size, "apps", `${icon}.${ext}`);
        if (existsSync(candidate)) return candidate;
      }
    }
    for (const ext of ["png", "svg", "xpm"]) {
      const flat = join(root, `${icon}.${ext}`);
      if (existsSync(flat) && ext !== "xpm") return flat;
    }
  }
  return undefined;
}

export async function listLinuxApps(folders: string[] = LINUX_FOLDERS, iconRoots: string[] = ICON_ROOTS): Promise<InstalledApp[]> {
  const out: InstalledApp[] = [];
  for (const folder of folders) {
    for (const entry of await readdir(folder).catch(() => [] as string[])) {
      if (!entry.endsWith(".desktop")) continue;
      const location = join(folder, entry);
      const parsed = parseDesktopEntry(await readFile(location, "utf8").catch(() => ""));
      if (!parsed || parsed.hidden || parsed.type !== "Application") continue;
      out.push({ name: parsed.name, id: idOf(location), location, iconFile: parsed.icon ? await findLinuxIcon(parsed.icon, iconRoots) : undefined });
    }
  }
  return dedupe(out);
}

// Listing and searching ---------------------------------------------------------------------------

let cache: { at: number; apps: InstalledApp[] } | null = null;
const TTL_MS = 60_000;

export async function installedApps(): Promise<InstalledApp[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.apps;
  const apps = process.platform === "darwin" ? await listMacApps() : process.platform === "win32" ? await listWindowsApps() : await listLinuxApps();
  cache = { at: Date.now(), apps };
  return apps;
}

/** The apps whose name matches, best first. */
export function matchApps(apps: InstalledApp[], query: string, limit = 6): InstalledApp[] {
  return apps
    .map((app) => ({ app, score: fuzzyScore(query, app.name) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.length - b.app.name.length)
    .slice(0, limit)
    .map((entry) => entry.app);
}

/** An app named exactly (ignoring case), as in @Safari. */
export function findApp(apps: InstalledApp[], name: string): InstalledApp | null {
  const wanted = name.trim().toLowerCase();
  return apps.find((app) => app.name.toLowerCase() === wanted) ?? null;
}

// Icons ------------------------------------------------------------------------------------------

const run = (file: string, args: string[], timeout = 20_000) =>
  new Promise<string>((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => (error ? reject(new Error(String(stderr || error.message).slice(0, 200))) : resolve(stdout)));
  });

const MAC_ICON_SCRIPT = (appPath: string, out: string) => `
ObjC.import('AppKit');
const image = $.NSWorkspace.sharedWorkspace.iconForFile(${JSON.stringify(appPath)});
const small = $.NSImage.alloc.initWithSize($.NSMakeSize(64, 64));
small.lockFocus;
image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 64, 64), $.NSMakeRect(0, 0, 0, 0), 2, 1.0);
small.unlockFocus;
const rep = $.NSBitmapImageRep.imageRepWithData(small.TIFFRepresentation);
rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(${JSON.stringify(out)}, true);
`;

const WINDOWS_ICON_SCRIPT = `
param($Shortcut, $Out)
Add-Type -AssemblyName System.Drawing
$target = $Shortcut
if ($Shortcut -like '*.lnk') { $target = (New-Object -ComObject WScript.Shell).CreateShortcut($Shortcut).TargetPath }
if (-not $target -or -not (Test-Path $target)) { $target = $Shortcut }
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
$icon.ToBitmap().Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
`;

/** A picture of the app's icon, made once and kept, or null when there is none. */
export async function appIcon(app: InstalledApp, cacheDir: string): Promise<{ file: string; mime: string } | null> {
  if (process.platform === "linux") {
    if (!app.iconFile) return null;
    return { file: app.iconFile, mime: app.iconFile.endsWith(".svg") ? "image/svg+xml" : "image/png" };
  }
  await mkdir(cacheDir, { recursive: true });
  const file = join(cacheDir, `${app.id}.png`);
  if (existsSync(file)) return { file, mime: "image/png" };
  try {
    if (process.platform === "darwin") {
      // Some system apps are links; the icon of the real app has no arrow on it.
      const real = await realpath(app.location).catch(() => app.location);
      await run("osascript", ["-l", "JavaScript", "-e", MAC_ICON_SCRIPT(real, file)]);
    }
    else if (process.platform === "win32") {
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `& { ${WINDOWS_ICON_SCRIPT} } -Shortcut '${app.location.replace(/'/g, "''")}' -Out '${file.replace(/'/g, "''")}'`]);
    }
  } catch {
    return null;
  }
  return existsSync(file) ? { file, mime: "image/png" } : null;
}

const MAC_BATCH_SCRIPT = (jobs: { from: string; to: string }[]) => `
ObjC.import('AppKit');
const jobs = ${JSON.stringify(jobs)};
let done = 0;
for (const job of jobs) {
  try {
    const image = $.NSWorkspace.sharedWorkspace.iconForFile(job.from);
    const small = $.NSImage.alloc.initWithSize($.NSMakeSize(64, 64));
small.lockFocus;
image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 64, 64), $.NSMakeRect(0, 0, 0, 0), 2, 1.0);
small.unlockFocus;
const rep = $.NSBitmapImageRep.imageRepWithData(small.TIFFRepresentation);
    rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(job.to, true);
    done += 1;
  } catch (e) {}
}
done;
`;

/**
 * Makes every app's icon ahead of time, in one pass, so the menu never waits for one. Only icons not
 * made yet are made; after the first run this does nothing. Windows and Linux make theirs on demand.
 */
export async function warmAppIcons(apps: InstalledApp[], cacheDir: string): Promise<number> {
  if (process.platform !== "darwin") return 0;
  await mkdir(cacheDir, { recursive: true });
  const jobs: { from: string; to: string }[] = [];
  for (const app of apps) {
    const to = join(cacheDir, `${app.id}.png`);
    if (existsSync(to)) continue;
    jobs.push({ from: await realpath(app.location).catch(() => app.location), to });
  }
  if (jobs.length === 0) return 0;
  await run("osascript", ["-l", "JavaScript", "-e", MAC_BATCH_SCRIPT(jobs)], 120_000).catch(() => undefined);
  return jobs.filter((job) => existsSync(job.to)).length;
}
