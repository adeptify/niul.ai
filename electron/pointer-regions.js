function normalizeInteractiveRegions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 16)
    .map((region) => ({
      x: Number(region?.x),
      y: Number(region?.y),
      width: Number(region?.width),
      height: Number(region?.height),
    }))
    .filter(
      (region) =>
        Number.isFinite(region.x) &&
        Number.isFinite(region.y) &&
        Number.isFinite(region.width) &&
        Number.isFinite(region.height) &&
        region.width > 0 &&
        region.height > 0
    );
}

function pointInInteractiveRegions(point, regions, padding = 0) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const inset = Math.max(0, Number(padding) || 0);
  return regions.some(
    (region) =>
      x >= region.x - inset &&
      x <= region.x + region.width + inset &&
      y >= region.y - inset &&
      y <= region.y + region.height + inset
  );
}

module.exports = { normalizeInteractiveRegions, pointInInteractiveRegions };
