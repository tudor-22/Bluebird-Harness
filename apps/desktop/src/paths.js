const path = require("node:path");

/** Where the staged parts of the app live: inside the app bundle, or next to the sources in development. */
function resourceRoot(app) {
  return app.isPackaged ? path.join(process.resourcesPath, "bluebird") : path.join(__dirname, "..", "stage");
}

function layout(app) {
  const root = resourceRoot(app);
  const data = path.join(app.getPath("userData"), "data");
  return {
    root,
    api: path.join(root, "api"),
    web: path.join(root, "web"),
    postgres: path.join(root, "postgres"),
    data,
    pgData: path.join(data, "postgres"),
    settingsFile: path.join(data, "settings.json"),
    attachments: path.join(data, "attachments"),
    logs: path.join(app.getPath("userData"), "logs"),
  };
}

module.exports = { layout, resourceRoot };
