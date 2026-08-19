const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadConfig } = require("../electron/config");

test("upgrades the legacy scan interval without resetting user preferences", () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-config-"));
  fs.writeFileSync(
    path.join(userDataDir, "config.json"),
    JSON.stringify({
      configVersion: 4,
      pollMs: 2500,
      cowScale: 1.35,
      bubbleScale: 0.9,
      soundEnabled: false,
    })
  );

  const config = loadConfig(userDataDir);
  assert.equal(config.configVersion, 5);
  assert.equal(config.pollMs, 5000);
  assert.equal(config.cowScale, 1.35);
  assert.equal(config.bubbleScale, 0.9);
  assert.equal(config.soundEnabled, false);
});
