const REACTION_BANDS = Object.freeze([0.1, 0.5, 1, 2]);

function directionFor(value) {
  const number = Number(value || 0);
  if (number > 0) return "up";
  if (number < 0) return "down";
  return "flat";
}

function bandKey(id, direction, band) {
  return `${id}:${direction}:${band}`;
}

function rearmAt(band) {
  return band === 0.1 ? 0.05 : band * 0.8;
}

class MarketReactionEngine {
  constructor({
    perIndexCooldownMs = 1_200_000,
    globalCooldownMs = 90_000,
    eventTtlMs = 180_000,
  } = {}) {
    this.perIndexCooldownMs = perIndexCooldownMs;
    this.globalCooldownMs = globalCooldownMs;
    this.eventTtlMs = eventTtlMs;
    this.previous = null;
    this.armed = new Map();
    this.lastTriggeredAt = new Map();
    this.lastGlobalAt = 0;
  }

  seed(snapshot) {
    for (const quote of snapshot?.quotes || []) {
      const magnitude = Math.abs(Number(quote.changePct || 0));
      const direction = directionFor(quote.changePct);
      if (direction === "flat") continue;
      for (const band of REACTION_BANDS) {
        if (magnitude >= band) this.armed.set(bandKey(quote.id, direction, band), false);
      }
    }
    this.previous = snapshot;
  }

  process(snapshot, { now = Date.now(), thresholdPct = 0.1 } = {}) {
    if (!snapshot || snapshot.status !== "fresh" || snapshot.stale) return null;
    if (!this.previous) {
      this.seed(snapshot);
      return null;
    }

    const previousById = new Map((this.previous.quotes || []).map((quote) => [quote.id, quote]));
    const candidates = [];

    for (const quote of snapshot.quotes || []) {
      if (quote.status && quote.status !== "fresh") continue;
      const previous = previousById.get(quote.id);
      if (!previous || (previous.status && previous.status !== "fresh")) continue;
      const direction = directionFor(quote.changePct);
      const previousDirection = directionFor(previous.changePct);
      const magnitude = Math.abs(Number(quote.changePct || 0));
      const previousMagnitude =
        direction !== "flat" && direction === previousDirection
          ? Math.abs(Number(previous.changePct || 0))
          : 0;

      for (const band of REACTION_BANDS) {
        if (magnitude <= rearmAt(band)) {
          this.armed.set(bandKey(quote.id, "up", band), true);
          this.armed.set(bandKey(quote.id, "down", band), true);
        }
      }

      if (direction === "flat") continue;
      const crossed = REACTION_BANDS
        .filter((band) => band >= Number(thresholdPct || 0.1))
        .filter((band) => previousMagnitude < band && magnitude >= band)
        .sort((a, b) => b - a);
      const band = crossed[0];
      if (!band) continue;

      const key = bandKey(quote.id, direction, band);
      const isArmed = this.armed.get(key) !== false;
      const cooledDown = now - (this.lastTriggeredAt.get(key) || 0) >= this.perIndexCooldownMs;
      this.armed.set(key, false);
      if (!isArmed || !cooledDown) continue;

      this.lastTriggeredAt.set(key, now);
      candidates.push({
        id: quote.id,
        name: quote.name,
        shortName: quote.shortName || quote.name,
        direction,
        band,
        changePct: Number(quote.changePct),
        reversal:
          previousDirection !== "flat" &&
          previousDirection !== direction &&
          magnitude >= Number(thresholdPct || 0.1),
        occurredAt: now,
        expiresAt: now + this.eventTtlMs,
      });
    }

    this.previous = snapshot;
    if (!candidates.length || now - this.lastGlobalAt < this.globalCooldownMs) return null;
    candidates.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.band - a.band);
    this.lastGlobalAt = now;
    return {
      ...candidates[0],
      additionalCount: candidates.length - 1,
    };
  }
}

module.exports = {
  REACTION_BANDS,
  MarketReactionEngine,
  directionFor,
  rearmAt,
};
