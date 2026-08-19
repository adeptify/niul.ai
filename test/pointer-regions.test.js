const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInteractiveRegions,
  pointInInteractiveRegions,
} = require("../electron/pointer-regions");

test("normalizes valid renderer bounds and drops invalid regions", () => {
  assert.deepEqual(
    normalizeInteractiveRegions([
      { x: "10", y: 20, width: 100, height: 80 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: Number.NaN, y: 0, width: 10, height: 10 },
    ]),
    [{ x: 10, y: 20, width: 100, height: 80 }]
  );
});

test("detects the cursor within an interactive region and safety padding", () => {
  const regions = [{ x: 100, y: 200, width: 80, height: 60 }];
  assert.equal(pointInInteractiveRegions({ x: 120, y: 230 }, regions), true);
  assert.equal(pointInInteractiveRegions({ x: 94, y: 230 }, regions, 8), true);
  assert.equal(pointInInteractiveRegions({ x: 90, y: 230 }, regions, 8), false);
});
