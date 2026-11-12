// Gathers everything the app needs into apps/desktop/stage: the API, the web page,
// and a private PostgreSQL with pgvector. electron-builder then packs it into the DMG.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const root = resolve(desktop, "../..");
const stage = join(desktop, "stage");
const quiet = { ...process.env, npm_config_verify_deps_before_run: "false" };
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...options, env: { ...quiet, ...(options.env ?? {}) } });
// The platform being built for. It is this computer's unless TARGET_PLATFORM (darwin, linux, win32) and
// TARGET_ARCH say otherwise, which is how a Linux or Windows installer is staged from a Mac.
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const targetArch = process.env.TARGET_ARCH ?? process.arch;
const win = process.platform === "win32";
const bin = (app, name) => join(root, "apps", app, "node_modules/.bin", win ? `${name}.cmd` : name);
const say = (text) => console.log(`\n== ${text}`);

// REUSE=1 keeps the API and web parts already staged and redoes only the database.
const reuse = process.env.REUSE === "1" && existsSync(join(stage, "web"));
if (!reuse) rmSync(stage, { recursive: true, force: true });
rmSync(join(stage, "api"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

if (!reuse) {
// 1. The API ------------------------------------------------------------------
say("Building the API");
run(bin("api", "tsup"), [], { cwd: join(root, "apps/api"), shell: win });
const apiDeploy = join(stage, "api");
mkdirSync(join(apiDeploy, "dist"), { recursive: true });
cpSync(join(root, "apps/api/dist"), join(apiDeploy, "dist"), { recursive: true });
cpSync(join(root, "apps/api/db"), join(apiDeploy, "db"), { recursive: true });
cpSync(join(desktop, "scripts/db-setup.mjs"), join(apiDeploy, "db-setup.mjs"));
// The API's own packages, at the versions already installed here, in a plain flat node_modules.
// (Only the API's dependencies are copied: never its .env or .data, which hold this computer's own settings.)
const apiPackage = JSON.parse(readFileSync(join(root, "apps/api/package.json"), "utf8"));
const dependencies = {};
for (const name of Object.keys(apiPackage.dependencies)) {
  if (name.startsWith("@bluebird/")) continue; // bundled into dist already
  dependencies[name] = JSON.parse(readFileSync(join(root, "apps/api/node_modules", name, "package.json"), "utf8")).version;
}
writeFileSync(join(apiDeploy, "package.json"), JSON.stringify({ name: "bluebird-api", private: true, type: "module", dependencies }, null, 2));
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: apiDeploy, stdio: "inherit", shell: process.platform === "win32" });

// 2. The web page -------------------------------------------------------------
say("Building the web page");
const distDir = ".next-desktop";
rmSync(join(root, "apps/web", distDir), { recursive: true, force: true });
run(bin("web", "next"), ["build"], { cwd: join(root, "apps/web"), shell: win, env: { ...process.env, BLUEBIRD_STANDALONE: "1", NEXT_DIST_DIR: distDir } });
const standalone = join(root, "apps/web", distDir, "standalone");
if (!existsSync(join(standalone, "apps/web/server.js"))) throw new Error("The web build did not produce a standalone server.");
const webStage = join(stage, "web");
cpSync(standalone, webStage, { recursive: true, dereference: true });
cpSync(join(root, "apps/web", distDir, "static"), join(webStage, "apps/web", distDir, "static"), { recursive: true });
if (existsSync(join(root, "apps/web/public"))) cpSync(join(root, "apps/web/public"), join(webStage, "apps/web/public"), { recursive: true });
// The build bakes this computer's folder paths into the server's settings. Left in, the app would go
// looking for them, and on a Mac that is a "would like to access your Documents folder" prompt.
for (const file of ["apps/web/server.js", `apps/web/${distDir}/required-server-files.json`]) {
  const path = join(webStage, file);
  writeFileSync(path, readFileSync(path, "utf8").split(root).join("/__bluebird__").split(JSON.stringify(root).slice(1, -1)).join("/__bluebird__"));
}
// The page's own caches and sources are not needed to run it.
rmSync(join(webStage, "apps/web", distDir, "cache"), { recursive: true, force: true });

}

// 3. The database -------------------------------------------------------------
// PostgreSQL itself, for the platform this build is for. Embeddings are plain arrays (no extension),
// so nothing else is needed and every platform gets the same database.
say("Preparing PostgreSQL");
const target = `${targetPlatform === "win32" ? "windows" : targetPlatform}-${targetArch}`;
// PG_PACKAGE_DIR points at an unpacked @embedded-postgres package for the target, when it is not installed here.
const pgPackage = process.env.PG_PACKAGE_DIR ?? join(desktop, "node_modules/@embedded-postgres", target);
if (!existsSync(join(pgPackage, "native"))) throw new Error(`No PostgreSQL package is installed for ${target}. Run pnpm install on this platform.`);
const pgStage = join(stage, "postgres");
rmSync(pgStage, { recursive: true, force: true });
cpSync(join(pgPackage, "native"), pgStage, { recursive: true, dereference: true });
// Identical libraries (the package ships each one under several names) become links to one copy.
if (targetPlatform !== "win32" && existsSync(join(pgStage, "lib"))) {
  const seen = new Map();
  const lib = join(pgStage, "lib");
  for (const file of readdirSync(lib).sort((a, b) => b.length - a.length)) {
    const path = join(lib, file);
    const info = statSync(path);
    if (!info.isFile() || info.size < 1_000_000) continue;
    const hash = createHash("sha1").update(readFileSync(path)).digest("hex");
    if (seen.has(hash)) {
      unlinkSync(path);
      symlinkSync(seen.get(hash), path);
    } else seen.set(hash, file);
  }
}
if (targetPlatform !== "win32") for (const bin of ["initdb", "pg_ctl", "postgres"]) chmodSync(join(pgStage, "bin", bin), 0o755);

// 4. Dictation (macOS only) -----------------------------------------------------------
// The web page's image library is a native file for the computer it was built on; other targets go without it.
if (targetPlatform !== process.platform) {
  const pnpmDir = join(stage, "web/node_modules/.pnpm");
  for (const name of existsSync(pnpmDir) ? readdirSync(pnpmDir) : []) {
    if (/^@img\+sharp/.test(name)) rmSync(join(pnpmDir, name), { recursive: true, force: true });
  }
}
if (targetPlatform === "darwin" && process.platform === "darwin") {
  say("Building the dictation helper");
  mkdirSync(join(stage, "native"), { recursive: true });
  execFileSync("swiftc", ["-O", join(desktop, "native/dictation.swift"), "-o", join(stage, "native/dictation"), "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", join(desktop, "native/dictation-info.plist")], { stdio: "inherit" });
}

say(`Staged in ${relative(root, stage)}`);

