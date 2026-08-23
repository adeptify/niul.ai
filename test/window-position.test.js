const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clampWindowToKeepRectVisible,
  nativeWindowPosition,
  windowPositionForCursor,
  windowPositionForRectGrab,
} = require("../electron/window-position");

const workArea = { x: 0, y: 0, width: 1000, height: 800 };
const cow = { x: 100, y: 200, width: 200, height: 200 };
const minVisible = 50;

test("leaves an on-screen cow where it is", () => {
  assert.deepEqual(clampWindowToKeepRectVisible(40, 30, cow, workArea, minVisible), {
    x: 40,
    y: 30,
  });
});

test("keeps a sliver of the cow inside the work area on every edge", () => {
  assert.deepEqual(clampWindowToKeepRectVisible(-400, 0, cow, workArea, minVisible), {
    x: -250,
    y: 0,
  });
  assert.deepEqual(clampWindowToKeepRectVisible(900, 0, cow, workArea, minVisible), {
    x: 850,
    y: 0,
  });
  assert.deepEqual(clampWindowToKeepRectVisible(0, -400, cow, workArea, minVisible), {
    x: 0,
    y: -350,
  });
  assert.deepEqual(clampWindowToKeepRectVisible(0, 700, cow, workArea, minVisible), {
    x: 0,
    y: 550,
  });
});

test("places the window from the grab offset and then clamps", () => {
  assert.deepEqual(windowPositionForCursor(500, 300, 150, 80, cow, workArea, minVisible), {
    x: 350,
    y: 220,
  });
  assert.deepEqual(windowPositionForCursor(-200, 300, 150, 80, cow, workArea, minVisible), {
    x: -250,
    y: 220,
  });
});

test("keeps the grabbed point under the cursor when the cow flips above the bubble", () => {
  const lowerCow = { x: 100, y: 600, width: 200, height: 200 };
  const upperCow = { x: 100, y: 10, width: 200, height: 200 };
  const cursor = { x: 500, y: 250 };
  const grab = { x: 80, y: 90 };

  assert.deepEqual(
    windowPositionForRectGrab(
      cursor.x,
      cursor.y,
      grab.x,
      grab.y,
      lowerCow,
      workArea,
      minVisible
    ),
    { x: 320, y: -440 }
  );
  assert.deepEqual(
    windowPositionForRectGrab(
      cursor.x,
      cursor.y,
      grab.x,
      grab.y,
      upperCow,
      workArea,
      minVisible
    ),
    { x: 320, y: 150 }
  );
});

test("rejects non-finite cursor math", () => {
  assert.equal(windowPositionForCursor(NaN, 1, 0, 0, cow, workArea), null);
  assert.equal(clampWindowToKeepRectVisible(undefined, 0, cow, workArea), null);
});

test("only passes integer coordinates accepted by Electron's native boundary", () => {
  assert.deepEqual(nativeWindowPosition({ x: 10.4, y: -20.6 }), { x: 10, y: -21 });
  assert.equal(nativeWindowPosition({ x: 0, y: NaN }), null);
  assert.equal(nativeWindowPosition({ x: 0, y: 2147483648 }), null);
  assert.equal(nativeWindowPosition({ x: -2147483649, y: 0 }), null);
});
