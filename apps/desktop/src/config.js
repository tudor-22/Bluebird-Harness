// What the app keeps between launches: secrets made on first run, and choices.
const { generateKeyPairSync, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KEY_ID = "desktop-1";

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Reads the saved config, making the keys and passwords the first time. Kept private to this user. */
function loadConfig(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, "desktop.json");
  let config = load(file);
  if (!config || !config.privateJwk || !config.contentKey || !config.dbPassword) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    config = {
      ...(config ?? {}),
      keyId: KEY_ID,
      publicJwk: publicKey.export({ format: "jwk" }),
      privateJwk: privateKey.export({ format: "jwk" }),
      contentKey: randomBytes(32).toString("base64"),
      dbPassword: randomBytes(18).toString("hex"),
      dbAppPassword: randomBytes(18).toString("hex"),
    };
    save(file, config);
  }
  return { config, save: (next) => save(file, next ?? config) };
}

function save(file, config) {
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

module.exports = { loadConfig, KEY_ID };
