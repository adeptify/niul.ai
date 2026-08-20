const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldIgnoreMouse } = require("../renderer/mouse-passthrough");

test("passes clicks through transparent space outside interactive surfaces", () => {
  assert.equal(
    shouldIgnoreMouse({ pointerActive: false, overInteractiveSurface: false }),
    true
  );
});

test("keeps visible surfaces and active pointer gestures interactive", () => {
  assert.equal(
    shouldIgnoreMouse({ pointerActive: false, overInteractiveSurface: true }),
    false
  );
  assert.equal(
    shouldIgnoreMouse({ pointerActive: true, overInteractiveSurface: false }),
    false
  );
});
