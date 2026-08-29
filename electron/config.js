const fs = require("fs");
const os = require("os");
const path = require("path");
const { readJson, safeExists } = require("./files");

const DEFAULT_PATH = path.join(__dirname, "..", "config", "runtimes.default.json");

function userConfigPath(userDataDir) {
  return path.join(userDataDir || path.join(os.homedir(), "Library", "Application Support", "牛来"), "config.json");
}

function loadConfig(userDataDir) {
  const defaults = readJson(DEFAULT_PATH, {});
  const userFile = userConfigPath(userDataDir);
  const user = safeExists(userFile) ? readJson(userFile, {}) : {};
  const runtimeIds = new Set([
    ...Object.keys(defaults.runtimes || {}),
    ...Object.keys(user.runtimes || {}),
  ]);
  const runtimes = Object.fromEntries(
    [...runtimeIds].map((id) => [
      id,
      { ...(defaults.runtimes?.[id] || {}), ...(user.runtimes?.[id] || {}) },
    ])
  );
  const merged = {
    ...defaults,
    ...user,
    market: { ...(defaults.market || {}), ...(user.market || {}) },
    quota: {
      ...(defaults.quota || {}),
      ...(user.quota || {}),
      providers: {
        ...(defaults.quota?.providers || {}),
        ...(user.quota?.providers || {}),
      },
    },
    runtimes,
    custom: Array.isArray(user.custom) ? user.custom : defaults.custom || [],
    _path: userFile,
  };
  if ((user.configVersion || 0) < (defaults.configVersion || 1)) {
    for (const key of [
      "pollMs",
      "workingWindowMs",
      "maxOfflineAgeMs",
      "maxSessions",
      "maxSessionsPerRuntime",
      "menuBarMode",
      "petMode",
      "herdMode",
      "showPetVisuals",
      "cowScale",
      "bubbleScale",
      "soundEnabled",
      "market",
      "quota",
    ]) {
      if (!(key in user) && key in defaults) merged[key] = defaults[key];
    }
    if ((user.configVersion || 0) < 5 && Number(user.pollMs) === 2500) {
      merged.pollMs = defaults.pollMs;
    }
    merged.configVersion = defaults.configVersion;
  }
  return merged;
}

function saveConfig(userDataDir, next) {
  const file = userConfigPath(userDataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { _path, ...rest } = next;
  fs.writeFileSync(file, JSON.stringify(rest, null, 2));
  return loadConfig(userDataDir);
}

module.exports = { loadConfig, saveConfig, userConfigPath };
