const {
  nativeWindowPosition,
  windowPositionForCursor,
  windowPositionForRectGrab,
} = require("./window-position");
const {
  normalizeInteractiveRegions,
  pointInInteractiveRegions,
} = require("./pointer-regions");

function createWindowInteractions({ getWindow, screen, logger = console }) {
  let drag = null;
  let ignoreRequested = false;
  let mouseEventsIgnored = null;
  let interactiveRegions = [];

  function currentWindow() {
    const win = getWindow();
    return win && !win.isDestroyed() ? win : null;
  }

  function cursorIsOverInteractiveSurface(win) {
    if (!interactiveRegions.length) return true;
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    return pointInInteractiveRegions(
      { x: cursor.x - bounds.x, y: cursor.y - bounds.y },
      interactiveRegions,
      18
    );
  }

  function applyMousePassthrough(ignore) {
    const win = currentWindow();
    if (!win) return;
    const shouldIgnore = Boolean(ignore) && !drag && !cursorIsOverInteractiveSurface(win);
    if (mouseEventsIgnored === shouldIgnore) return;
    try {
      win.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      mouseEventsIgnored = shouldIgnore;
    } catch (error) {
      mouseEventsIgnored = null;
      logger.warn("mouse passthrough update rejected", error);
    }
  }

  function requestMousePassthrough(ignore) {
    ignoreRequested = Boolean(ignore);
    applyMousePassthrough(ignoreRequested);
  }

  function refreshMousePassthrough() {
    applyMousePassthrough(ignoreRequested);
  }

  function forceInteractive() {
    applyMousePassthrough(false);
  }

  function setInteractiveRegions(regions) {
    interactiveRegions = normalizeInteractiveRegions(regions);
    refreshMousePassthrough();
  }

  function displayWorkAreaNear(cursor) {
    const display = screen.getDisplayNearestPoint(cursor);
    return (display || screen.getPrimaryDisplay()).workArea;
  }

  function moveDrag(payload = {}) {
    const win = currentWindow();
    if (!win || !drag) return false;
    const cursor = nativeWindowPosition({ x: payload.screenX, y: payload.screenY });
    if (!cursor) return false;
    const normalizedBounds = normalizeInteractiveRegions([payload.cowBounds])[0];
    if (normalizedBounds) drag.cowBounds = normalizedBounds;
    const workArea = displayWorkAreaNear(cursor);
    const next = drag.cowBounds
      ? windowPositionForRectGrab(
          cursor.x,
          cursor.y,
          drag.grabX,
          drag.grabY,
          drag.cowBounds,
          workArea
        )
      : windowPositionForCursor(
          cursor.x,
          cursor.y,
          drag.offsetX,
          drag.offsetY,
          null,
          workArea
        );
    const nativePosition = nativeWindowPosition(next);
    if (!nativePosition) return false;
    if (drag.lastX === nativePosition.x && drag.lastY === nativePosition.y) return true;
    try {
      win.setPosition(nativePosition.x, nativePosition.y, false);
      drag.lastX = nativePosition.x;
      drag.lastY = nativePosition.y;
      return true;
    } catch (error) {
      logger.warn("window drag frame rejected", error);
      endDrag();
      return false;
    }
  }

  function beginDrag(payload = {}) {
    const win = currentWindow();
    if (!win) return false;
    const origin = nativeWindowPosition({ x: payload.originX, y: payload.originY });
    if (!origin) return false;
    const [windowX, windowY] = win.getPosition();
    const cowBounds = normalizeInteractiveRegions([payload.cowBounds])[0] || null;
    drag = {
      offsetX: origin.x - windowX,
      offsetY: origin.y - windowY,
      grabX: cowBounds ? origin.x - windowX - cowBounds.x : 0,
      grabY: cowBounds ? origin.y - windowY - cowBounds.y : 0,
      cowBounds,
      lastX: windowX,
      lastY: windowY,
    };
    forceInteractive();
    moveDrag(payload);
    return true;
  }

  function endDrag() {
    drag = null;
    refreshMousePassthrough();
  }

  function reset() {
    drag = null;
    ignoreRequested = false;
    mouseEventsIgnored = null;
    interactiveRegions = [];
  }

  return {
    beginDrag,
    endDrag,
    forceInteractive,
    isDragging: () => Boolean(drag),
    moveDrag,
    refreshMousePassthrough,
    requestMousePassthrough,
    reset,
    setInteractiveRegions,
  };
}

module.exports = { createWindowInteractions };
