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
  assert.equal(
    shouldIgnoreMouse({
      pointerActive: false,
      overInteractiveSurface: false,
      passthroughReady: false,
    }),
    false
  );
});

test("main process delegates mouse and drag state to one interaction controller", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "electron/main.js"), "utf8");
  assert.match(main, /createWindowInteractions/);
  assert.match(main, /setInterval\(windowInteractions\.refreshMousePassthrough, 16\)/);
  assert.match(main, /windowInteractions\.forceInteractive\(\)/);
  assert.match(main, /windowInteractions\.setInteractiveRegions\(regions\)/);
  assert.doesNotMatch(main, /let (?:windowDrag|ignoreMouseRequested|interactiveRegions)/);
});

test("classic renderer scripts do not collide in the global scope", () => {
  const renderer = path.join(__dirname, "..", "renderer");
  const sources = ["mouse-passthrough.js", "grass-alert.js", "moo.js"].map((file) =>
    fs.readFileSync(path.join(renderer, file), "utf8")
  );
  const context = vm.createContext({ window: {} });

  for (const source of sources) vm.runInContext(source, context);

  assert.doesNotThrow(() => {
    vm.runInContext(
      "const { shouldIgnoreMouse } = window.niulMousePassthrough; const { createGrassAlertTracker } = window.niulGrassAlert;",
      context
    );
  });
});

test("fallback cow skins render the urgent waiting pose", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "styles.css"),
    "utf8"
  );
  assert.match(
    css,
    /data-face-fx="fallback"\]\.is-wait-attention \.cow-fx-eye/
  );
  assert.match(
    css,
    /data-face-fx="fallback"\]\.is-wait-attention \.cow-stage:not\(\.is-speaking\)/
  );
});
