const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { loadConfig } = require("./config");
const { layout: makeLayout } = require("./paths");
const { freePort } = require("./ports");
const { Postgres } = require("./postgres");
const { Services } = require("./services");
const ollama = require("./ollama");
const { Dictation } = require("./dictation");

app.setName("Bluebird");

const isMac = process.platform === "darwin";
// BLUEBIRD_SMOKE=1 starts everything, checks it answers, and quits: used to test a build.
const smoke = process.env.BLUEBIRD_SMOKE === "1";
// An AppImage cannot use Chromium's setuid sandbox helper.
if (process.platform === "linux" && process.env.APPIMAGE) app.commandLine.appendSwitch("no-sandbox");

let layout;
let loaded;
let database;
let services;
let dictation;
let setupWindow = null;
let mainWindow = null;
let quitting = false;
const steps = new Map();

// ---- the setup window --------------------------------------------------------

function showSetup() {
  setupWindow = new BrowserWindow({
    width: 580,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Bluebird",
    ...(isMac ? { titleBarStyle: "hiddenInset" } : { autoHideMenuBar: true }),
    backgroundColor: "#1b1b1d",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  setupWindow.once("ready-to-show", () => setupWindow?.show());
  setupWindow.on("closed", () => {
    setupWindow = null;
    // Closing the setup window before the app is open means the person gave up.
    if (!mainWindow && !quitting) app.quit();
  });
  void setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.webContents.on("did-finish-load", () => {
    for (const step of steps.values()) setupWindow?.webContents.send("setup:update", step);
  });
}

let lastWorking = null;

function step(id, title, state, extra = {}) {
  const data = { id, title, state, ...extra };
  if (state === "working") lastWorking = { id, title };
  steps.set(id, data);
  setupWindow?.webContents.send("setup:update", data);
}

/** Shows choices in a step and waits for the person to pick one. */
function ask(id, title, detail, choices) {
  return new Promise((resolve) => {
    step(id, title, "working", { detail, choices });
    const listener = (_event, answer) => {
      if (answer?.step !== id) return;
      ipcMain.removeListener("setup:choice", listener);
      resolve(answer.value);
    };
    ipcMain.on("setup:choice", listener);
  });
}

// ---- starting everything -----------------------------------------------------

async function startServices() {
  const firstRun = !database.initialised;

  step("database", "Private database", "working", { detail: firstRun ? "Creating it on this computer…" : "Starting…" });
  if (firstRun) await database.init();
  const dbPort = await freePort();
  await database.start(dbPort);
  const applied = await services.migrate();
  step("database", "Private database", "done", { detail: applied.length ? "Ready" : "Up to date" });

  step("app", "Bluebird", "working", { detail: "Starting…" });
  await services.start();
  step("app", "Bluebird", "done", { detail: "Running" });
  return firstRun;
}

/** Local models: offered once, never forced. Hosted models can be added later in Settings. */
async function setUpModels() {
  if (loaded.config.modelsAnswered || process.env.BLUEBIRD_SKIP_MODELS === "1") return;
  let current = await ollama.state();
  // Ollama installed but not open: open it, so models already downloaded are found instead of offered again.
  if (current.state === "installed") {
    step("models", "Models", "working", { detail: "Starting Ollama…" });
    try {
      await ollama.start();
      current = await ollama.state();
    } catch {
      // Falls through to the choice below.
    }
  }
  if (current.state === "ready" && current.models.length > 0) {
    step("models", "Models", "done", { detail: `Using Ollama (${current.models.length} installed)` });
    return;
  }
  const hasSettings = fs.existsSync(layout.settingsFile) && /"engines"\s*:\s*\{\s*"/.test(fs.readFileSync(layout.settingsFile, "utf8"));
  if (hasSettings) return;

  const answer = await ask("models", "Models", "Bluebird needs a model to talk to. Run one privately on this computer, or add an online one later.", [
    { label: current.state === "missing" ? "Install Ollama and a starter model" : "Download a starter model", value: "local", primary: true },
    { label: "I'll add my own later", value: "skip" },
  ]);
  loaded.config.modelsAnswered = true;
  loaded.save();
  if (answer === "skip") {
    step("models", "Models", "done", { detail: "Add one in Settings, Engine, whenever you like." });
    return;
  }
  try {
    if (current.state === "missing") {
      step("models", "Models", "working", { detail: "Downloading Ollama…", progress: 0 });
      await ollama.install(({ done, total }) => step("models", "Models", "working", { detail: "Downloading Ollama…", progress: total ? done / total : undefined }));
    }
    if (current.state !== "ready") {
      step("models", "Models", "working", { detail: "Starting Ollama…" });
      await ollama.start();
    }
    for (const name of ollama.STARTER_MODELS) {
      step("models", "Models", "working", { detail: `Downloading ${name}…`, progress: 0 });
      await ollama.pull(name, ({ done, total }) => step("models", "Models", "working", { detail: `Downloading ${name}…`, progress: total ? done / total : undefined }));
    }
    step("models", "Models", "done", { detail: "Ready" });
  } catch (error) {
    step("models", "Models", "error", { detail: `${error.message} You can add a model later in Settings, Engine.` });
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }
}

// ---- the app window ----------------------------------------------------------

function openMain() {
  const origin = new URL(services.webUrl).origin;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: "Bluebird",
    // On a Mac there is no title bar: the page runs to the top edge, with the window buttons floating over it.
    ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 18 } } : { autoHideMenuBar: true }),
    backgroundColor: "#f7f8fa",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload-main.js"), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  // A thin strip along the top edge drags the window, since there is no title bar to grab.
  mainWindow.webContents.on("dom-ready", () => {
    void mainWindow?.webContents.executeJavaScript("document.documentElement.dataset.shell = 'desktop'");
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (!isMac) return;
    void mainWindow?.webContents.insertCSS(
      "html::before { content: ''; position: fixed; top: 0; left: 0; right: 0; height: 14px; z-index: 2147483647; -webkit-app-region: drag; pointer-events: auto; }",
    );
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    setupWindow?.close();
  });
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  // The microphone (dictation) and the clipboard, for Bluebird's own page only.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    const same = contents.getURL().startsWith(origin);
    callback(same && ["media", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission));
  });
  void mainWindow.loadURL(`${origin}/chat`);
}

function buildMenu() {
  const files = isMac ? "Finder" : process.platform === "win32" ? "File Explorer" : "the file manager";
  const template = [
    {
      label: "Bluebird",
      submenu: [
        ...(isMac ? [{ role: "about", label: "About Bluebird" }] : []),
        { type: "separator" },
        ...(isMac ? [{ role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }] : []),
        { role: "quit", label: "Quit Bluebird" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
    { label: "Window", submenu: [{ role: "minimize" }, ...(isMac ? [{ role: "zoom" }, { type: "separator" }, { role: "front" }] : [{ role: "close" }])] },
    {
      label: "Help",
      submenu: [
        { label: `Show Logs in ${files}`, click: () => void shell.openPath(layout.logs) },
        { label: `Show Data in ${files}`, click: () => void shell.openPath(layout.data) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- lifecycle ---------------------------------------------------------------

async function main() {
  layout = makeLayout(app);
  loaded = loadConfig(layout.data);
  ollama.configure({ dir: path.join(layout.data, "ollama"), logDir: layout.logs });
  database = new Postgres({ dir: layout.postgres, dataDir: layout.pgData, logDir: layout.logs, password: loaded.config.dbPassword });
  const ports = { api: await freePort(), web: await freePort() };
  services = new Services({ layout, config: loaded.config, database, ports });

  dictation = new Dictation(layout.root);
  ipcMain.on("dictation:start", (event, lang) => {
    // Only Bluebird's own page may use the microphone this way.
    if (!event.senderFrame?.url.startsWith(services.webUrl)) return;
    dictation.start(lang, (data) => {
      if (!event.sender.isDestroyed()) event.sender.send("dictation:event", data);
    });
  });
  ipcMain.on("dictation:stop", () => dictation.stop());

  buildMenu();
  showSetup();
  try {
    await startServices();
    await setUpModels();
    if (smoke) return await runSmoke();
    openMain();
  } catch (error) {
    const where = lastWorking ?? { id: "error", title: "Bluebird" };
    step(where.id, where.title, "error", { detail: String(error.message ?? error).slice(0, 400) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (smoke) {
      console.error(`BLUEBIRD_SMOKE_FAIL ${String(error.message ?? error)}`);
      process.exitCode = 1;
      return app.quit();
    }
    const { response } = await dialog.showMessageBox({
      type: "error",
      message: "Bluebird could not start",
      detail: `${String(error.message ?? error).slice(0, 600)}\n\nThe logs are in ${layout.logs}.`,
      buttons: ["Show Logs", "Quit"],
      defaultId: 1,
    });
    if (response === 0) await shell.openPath(layout.logs);
    app.quit();
    if (smoke) process.exitCode = 1;
  }
}

/** Checks the running app end to end, prints the result and quits. */
async function runSmoke() {
  const { waitFor } = require("./services");
  const checks = [`http://127.0.0.1:${services.ports.api}/health`, `${services.webUrl}/chat`];
  for (const url of checks) await waitFor(url, { seconds: 30 });
  console.log(`BLUEBIRD_SMOKE_OK ${JSON.stringify({ platform: process.platform, arch: process.arch, web: services.webUrl })}`);
  app.quit();
}

async function shutdown() {
  dictation?.stop();
  ollama.stop();
  services?.stop();
  await database?.stop();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = mainWindow ?? setupWindow;
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(main);
  app.on("window-all-closed", () => {
    if (!smoke) app.quit();
  });
  app.on("activate", () => {
    if (!mainWindow && services?.children.length) openMain();
  });
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    void shutdown().finally(() => app.exit(0));
  });
}
