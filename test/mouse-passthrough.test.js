const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("does not leak helper declarations into the renderer global scope", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "mouse-passthrough.js"),
    "utf8"
  );
  const context = vm.createContext({ window: {} });

  vm.runInContext(source, context);

  assert.doesNotThrow(() => {
    vm.runInContext(
      "const { shouldIgnoreMouse } = window.niulMousePassthrough;",
      context
    );
  });
});
