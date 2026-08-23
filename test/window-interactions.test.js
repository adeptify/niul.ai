const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowInteractions } = require("../electron/window-interactions");

function fixture({ rejectPosition = false } = {}) {
  const calls = { ignored: [], positions: [], warnings: [] };
  const win = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 100, y: 100, width: 720, height: 960 }),
    getPosition: () => [100, 100],
    setIgnoreMouseEvents: (ignore) => calls.ignored.push(ignore),
    setPosition: (x, y) => {
      if (rejectPosition) throw new TypeError("native rejection");
      calls.positions.push({ x, y });
    },
  };
  const screen = {
    getCursorScreenPoint: () => ({ x: 600, y: 600 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  };
  const controller = createWindowInteractions({
    getWindow: () => win,
    screen,
    logger: { warn: (...args) => calls.warnings.push(args) },
  });
  return { calls, controller };
}

const cowBounds = { x: 100, y: 600, width: 200, height: 200 };

test("transparent space passes through until a drag forces the window interactive", () => {
  const { calls, controller } = fixture();
  controller.setInteractiveRegions([{ x: 0, y: 0, width: 40, height: 40 }]);
  controller.requestMousePassthrough(true);
  assert.equal(calls.ignored.at(-1), true);

  assert.equal(controller.beginDrag({
    originX: 300,
    originY: 700,
    screenX: 320,
    screenY: 710,
    cowBounds,
  }), true);
  assert.equal(controller.isDragging(), true);
  assert.equal(calls.ignored.at(-1), false);

  controller.refreshMousePassthrough();
  assert.equal(calls.ignored.at(-1), false);
  controller.endDrag();
  assert.equal(controller.isDragging(), false);
  assert.equal(calls.ignored.at(-1), true);
});

test("normal drag frames move the window and invalid native coordinates are ignored", () => {
  const { calls, controller } = fixture();
  controller.beginDrag({ originX: 300, originY: 700, cowBounds });
  assert.equal(controller.moveDrag({ screenX: 340, screenY: 730, cowBounds }), true);
  assert.ok(calls.positions.length > 0);
  const before = calls.positions.length;
  assert.equal(controller.moveDrag({ screenX: 340, screenY: 2147483648, cowBounds }), false);
  assert.equal(calls.positions.length, before);
});

test("a native drag rejection is contained and resets the gesture", () => {
  const { calls, controller } = fixture({ rejectPosition: true });
  controller.beginDrag({ originX: 300, originY: 700, cowBounds });
  assert.equal(controller.moveDrag({ screenX: 340, screenY: 730, cowBounds }), false);
  assert.equal(controller.isDragging(), false);
  assert.equal(calls.warnings.length, 1);
});

test("reset clears drag and passthrough state for a closed window", () => {
  const { controller } = fixture();
  controller.beginDrag({ originX: 300, originY: 700, cowBounds });
  controller.reset();
  assert.equal(controller.isDragging(), false);
});
