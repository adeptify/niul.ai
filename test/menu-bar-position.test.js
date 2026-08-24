const assert = require("node:assert/strict");
const test = require("node:test");

const { menuBarPopoverPosition } = require("../electron/menu-bar-position");

test("centers the popover under a top menu bar item", () => {
  assert.deepEqual(
    menuBarPopoverPosition(
      { x: 1000, y: 0, width: 24, height: 24 },
      { width: 360, height: 460 },
      { x: 0, y: 24, width: 1440, height: 876 }
    ),
    { x: 832, y: 29 }
  );
});

test("keeps the popover within the display edges", () => {
  assert.deepEqual(
    menuBarPopoverPosition(
      { x: 1420, y: 0, width: 20, height: 24 },
      { width: 360, height: 460 },
      { x: 0, y: 24, width: 1440, height: 876 }
    ),
    { x: 1072, y: 29 }
  );
});

test("places a bottom tray popover above its item", () => {
  assert.deepEqual(
    menuBarPopoverPosition(
      { x: -900, y: 850, width: 24, height: 24 },
      { width: 360, height: 460 },
      { x: -1280, y: 0, width: 1280, height: 850 }
    ),
    { x: -1068, y: 385 }
  );
});

test("rejects incomplete native geometry", () => {
  assert.equal(menuBarPopoverPosition(null, { width: 360, height: 460 }, {}), null);
});
