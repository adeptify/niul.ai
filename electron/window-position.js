const MIN_VISIBLE = 48;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readBox(box) {
  if (!box || typeof box !== "object") return null;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clampWindowToKeepRectVisible(windowX, windowY, rect, workArea, minVisible = MIN_VISIBLE) {
  if (!isFiniteNumber(windowX) || !isFiniteNumber(windowY)) return null;
  const area = readBox(workArea);
  const keep = readBox(rect);
  const visible = Math.max(1, Number(minVisible) || MIN_VISIBLE);
  let x = windowX;
  let y = windowY;

  if (area && keep) {
    const left = x + keep.x;
    const top = y + keep.y;
    const right = left + keep.width;
    const bottom = top + keep.height;
    if (right < area.x + visible) x += area.x + visible - right;
    else if (left > area.x + area.width - visible) x += area.x + area.width - visible - left;
    if (bottom < area.y + visible) y += area.y + visible - bottom;
    else if (top > area.y + area.height - visible) y += area.y + area.height - visible - top;
  } else if (area) {
    if (x + visible > area.x + area.width) x = area.x + area.width - visible;
    if (y + visible > area.y + area.height) y = area.y + area.height - visible;
    if (x + visible < area.x) x = area.x - visible + 1;
    if (y + visible < area.y) y = area.y - visible + 1;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

function windowPositionForCursor(cursorX, cursorY, offsetX, offsetY, rect, workArea, minVisible) {
  if (![cursorX, cursorY, offsetX, offsetY].every(isFiniteNumber)) return null;
  return clampWindowToKeepRectVisible(cursorX - offsetX, cursorY - offsetY, rect, workArea, minVisible);
}

function windowPositionForRectGrab(
  cursorX,
  cursorY,
  grabX,
  grabY,
  rect,
  workArea,
  minVisible
) {
  const keep = readBox(rect);
  if (!keep || ![grabX, grabY].every(isFiniteNumber)) return null;
  return windowPositionForCursor(
    cursorX,
    cursorY,
    keep.x + grabX,
    keep.y + grabY,
    keep,
    workArea,
    minVisible
  );
}

module.exports = {
  MIN_VISIBLE,
  clampWindowToKeepRectVisible,
  windowPositionForCursor,
  windowPositionForRectGrab,
};
