const HERD_COUNTS = new Set(["1", "8", "34"]);

function readLaunchOptions(env = process.env) {
  const qaEnabled = env.NIULAI_QA === "1";
  if (!qaEnabled) {
    return { qaEnabled: false, herdPreview: false, herdMode: false, herdCount: "8" };
  }
  return {
    qaEnabled: true,
    herdPreview: env.NIULAI_HERD_PREVIEW === "1",
    herdMode: env.NIULAI_HERD_MODE === "1",
    herdCount: HERD_COUNTS.has(env.NIULAI_HERD_COUNT) ? env.NIULAI_HERD_COUNT : "8",
  };
}

function rendererQuery(options) {
  if (options?.herdPreview) return { herdPreview: "1", herdCount: options.herdCount };
  if (options?.herdMode) return { herdMode: "1" };
  return undefined;
}

module.exports = { readLaunchOptions, rendererQuery };
