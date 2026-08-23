const test = require("node:test");
const assert = require("node:assert/strict");
const { readLaunchOptions, rendererQuery } = require("../electron/launch-options");

test("normal launches ignore herd QA overrides", () => {
  const options = readLaunchOptions({
    NIULAI_HERD_PREVIEW: "1",
    NIULAI_HERD_MODE: "1",
    NIULAI_HERD_COUNT: "34",
  });
  assert.deepEqual(options, {
    qaEnabled: false,
    herdPreview: false,
    herdMode: false,
    herdCount: "8",
  });
  assert.equal(rendererQuery(options), undefined);
});

test("explicit QA launches preserve preview density and prefer preview over runtime", () => {
  const options = readLaunchOptions({
    NIULAI_QA: "1",
    NIULAI_HERD_PREVIEW: "1",
    NIULAI_HERD_MODE: "1",
    NIULAI_HERD_COUNT: "34",
  });
  assert.deepEqual(rendererQuery(options), { herdPreview: "1", herdCount: "34" });
});

test("explicit QA runtime mode and invalid counts are normalized", () => {
  const options = readLaunchOptions({
    NIULAI_QA: "1",
    NIULAI_HERD_MODE: "1",
    NIULAI_HERD_COUNT: "99",
  });
  assert.equal(options.herdCount, "8");
  assert.deepEqual(rendererQuery(options), { herdMode: "1" });
});
