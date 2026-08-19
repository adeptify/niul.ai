const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_PATH = path.join(__dirname, "..", "config", "runtimes.default.json");

function userConfigPath(userDataDir) {
  return path.join(userDataDir || path.join(os.homedir(), "Library", "Application Support", "niul.ai"), "config.json");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadConfig(userDataDir) {
  const defaults = readJson(DEFAULT_PATH, {});
  const userFile = userConfigPath(userDataDir);
  const user = fs.existsSync(userFile) ? readJson(userFile, {}) : {};
  return {
    ...defaults,
    ...user,
    runtimes: { ...(defaults.runtimes || {}), ...(user.runtimes || {}) },
    custom: Array.isArray(user.custom) ? user.custom : defaults.custom || [],
    _path: userFile,
  };
}

function saveConfig(userDataDir, next) {
  const file = userConfigPath(userDataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { _path, ...rest } = next;
  fs.writeFileSync(file, JSON.stringify(rest, null, 2));
  return loadConfig(userDataDir);
}

module.exports = { loadConfig, saveConfig, userConfigPath };
