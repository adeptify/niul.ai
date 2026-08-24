const EDGE_GAP = 8;
const TRAY_GAP = 5;

function finiteBox(value) {
  if (!value || typeof value !== "object") return null;
  const box = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
  };
  return Object.values(box).every(Number.isFinite) && box.width > 0 && box.height > 0
    ? box
    : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function menuBarPopoverPosition(trayBounds, windowSize, workArea) {
  const tray = finiteBox(trayBounds);
  const area = finiteBox(workArea);
  const width = Number(windowSize?.width);
  const height = Number(windowSize?.height);
  if (!tray || !area || !Number.isFinite(width) || !Number.isFinite(height)) return null;

  const centeredX = tray.x + tray.width / 2 - width / 2;
  const x = clamp(centeredX, area.x + EDGE_GAP, area.x + area.width - width - EDGE_GAP);
  const trayIsBelowWorkArea = tray.y >= area.y + area.height / 2;
  const desiredY = trayIsBelowWorkArea
    ? tray.y - height - TRAY_GAP
    : tray.y + tray.height + TRAY_GAP;
  const y = clamp(
    desiredY,
    area.y + TRAY_GAP,
    area.y + area.height - height - TRAY_GAP
  );

  return { x: Math.round(x), y: Math.round(y) };
}

module.exports = { EDGE_GAP, TRAY_GAP, menuBarPopoverPosition };
