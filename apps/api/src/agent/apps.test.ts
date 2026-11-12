import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { findApp, findLinuxIcon, listLinuxApps, listMacApps, matchApps, parseDesktopEntry } from "./apps";
import { buildMentionNote, parseFileMentions } from "./mentions";
import { createPaths } from "./workspace";

describe("finding installed apps", () => {
  it("lists macOS app bundles by name, once each", async () => {
    const a = await mkdtemp(join(tmpdir(), "apps-a-"));
    const b = await mkdtemp(join(tmpdir(), "apps-b-"));
    await mkdir(join(a, "Safari.app"));
    await mkdir(join(a, "Visual Studio Code.app"));
    await mkdir(join(b, "Safari.app"));
    await writeFile(join(a, "notes.txt"), "x");
    const apps = await listMacApps([a, b]);
    expect(apps.map((app) => app.name)).toEqual(["Safari", "Visual Studio Code"]);
  });

  it("reads Linux desktop entries and skips hidden ones and non-apps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "apps-l-"));
    const icons = await mkdtemp(join(tmpdir(), "icons-"));
    await mkdir(join(icons, "64x64", "apps"), { recursive: true });
    await writeFile(join(icons, "64x64", "apps", "firefox.png"), "png");
    await writeFile(join(dir, "firefox.desktop"), "[Desktop Entry]\nType=Application\nName=Firefox\nName[fr]=Navigateur\nIcon=firefox\nExec=firefox\n");
    await writeFile(join(dir, "hidden.desktop"), "[Desktop Entry]\nType=Application\nName=Hidden\nNoDisplay=true\n");
    await writeFile(join(dir, "link.desktop"), "[Desktop Entry]\nType=Link\nName=A Link\n");
    const apps = await listLinuxApps([dir], [icons]);
    expect(apps.map((app) => app.name)).toEqual(["Firefox"]);
    expect(apps[0].iconFile).toBe(join(icons, "64x64", "apps", "firefox.png"));
    expect(parseDesktopEntry("not a desktop file")).toBeNull();
    expect(await findLinuxIcon("missing", [icons])).toBeUndefined();
  });

  it("matches by typed letters and finds an exact name ignoring case", () => {
    const apps = [
      { name: "Safari", id: "1", location: "/a" },
      { name: "Visual Studio Code", id: "2", location: "/b" },
      { name: "Xcode", id: "3", location: "/c" },
    ];
    expect(matchApps(apps, "saf").map((app) => app.name)).toEqual(["Safari"]);
    expect(matchApps(apps, "code").map((app) => app.name)).toContain("Xcode");
    expect(findApp(apps, "safari")?.id).toBe("1");
    expect(findApp(apps, "visual studio code")?.id).toBe("2");
    expect(findApp(apps, "Chrome")).toBeNull();
  });
});

describe("@app mentions", () => {
  const apps = [{ name: "Visual Studio Code", id: "2", location: "/b" }, { name: "Safari", id: "1", location: "/a" }];
  const skills = { get: async () => null };

  it("reads quoted names with spaces next to plain ones", () => {
    expect(parseFileMentions('open @"Visual Studio Code" and @Safari, then @src/app.ts')).toEqual(["Visual Studio Code", "Safari", "src/app.ts"]);
  });

  it("tells the model which app to use and how", async () => {
    const root = await mkdtemp(join(tmpdir(), "apps-m-"));
    const note = await buildMentionNote('use @Safari and @"Visual Studio Code"', createPaths(root), skills, apps);
    expect(note).toContain('use the app "Safari"');
    expect(note).toContain('use the app "Visual Studio Code"');
    expect(note).toContain("desktop_look");
  });

  it("prefers a real file or folder over an app of the same name", async () => {
    const root = await mkdtemp(join(tmpdir(), "apps-m-"));
    await mkdir(join(root, "Safari"));
    const note = await buildMentionNote("@Safari", createPaths(root), skills, apps);
    expect(note).toContain("Folder @Safari");
    expect(note).not.toContain("use the app");
  });
});
