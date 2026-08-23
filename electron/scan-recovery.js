function cachedSnapshotAfterFailure(lastSnapshot, error) {
  if (!lastSnapshot) return null;
  return {
    ...lastSnapshot,
    scanError: String(error?.message || error || "Session scan failed"),
  };
}

module.exports = { cachedSnapshotAfterFailure };
