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
  assert.equal(config.configVersion, 9);
  assert.equal(config.petMode, "cow");
  assert.equal(config.herdMode, false);
  assert.equal(config.showPetVisuals, true);
  assert.equal(config.pollMs, 5000);
  assert.equal(config.cowScale, 1.35);
  assert.equal(config.bubbleScale, 0.9);
  assert.equal(config.soundEnabled, false);
  assert.deepEqual(config.market, {
    enabled: true,
    provider: "eastmoney",
    reactionsEnabled: true,
    thresholdPct: 0.1,
  });
});

test("merges partial market preferences with new defaults", () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-config-"));
  fs.writeFileSync(
    path.join(userDataDir, "config.json"),
    JSON.stringify({
      configVersion: 6,
      market: { reactionsEnabled: false, thresholdPct: 0.5 },
    })
  );

  const config = loadConfig(userDataDir);
  assert.deepEqual(config.market, {
    enabled: true,
    provider: "eastmoney",
    reactionsEnabled: false,
    thresholdPct: 0.5,
  });
  assert.equal(config.herdMode, false);
});

test("preserves an enabled herd while upgrading without changing the saved pet mode", () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-config-"));
  fs.writeFileSync(
    path.join(userDataDir, "config.json"),
    JSON.stringify({
      configVersion: 7,
      herdMode: true,
      petMode: "both",
      cowScale: 0.85,
    })
  );

  const config = loadConfig(userDataDir);
  assert.equal(config.configVersion, 9);
  assert.equal(config.herdMode, true);
  assert.equal(config.petMode, "both");
  assert.equal(config.showPetVisuals, true);
  assert.equal(config.cowScale, 0.85);
});

test("preserves an explicit bubble-only preference", () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-config-"));
  fs.writeFileSync(
    path.join(userDataDir, "config.json"),
    JSON.stringify({
      configVersion: 9,
      showPetVisuals: false,
      herdMode: true,
      petMode: "horse",
    })
  );

  const config = loadConfig(userDataDir);
  assert.equal(config.configVersion, 9);
  assert.equal(config.showPetVisuals, false);
  assert.equal(config.herdMode, true);
  assert.equal(config.petMode, "horse");
});
