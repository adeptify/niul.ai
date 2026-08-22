(() => {
  const PET_MODES = Object.freeze(["cow", "horse", "both"]);
  const PROFILES = Object.freeze({
    cow: Object.freeze({
      id: "cow",
      label: "牛模式",
      subject: "牛",
      speechPrefix: "哞",
      marathonLabel: "哞拉松",
      includesCow: true,
      includesHorse: false,
    }),
    horse: Object.freeze({
      id: "horse",
      label: "马模式",
      subject: "马",
      speechPrefix: "咴",
      marathonLabel: "马拉松",
      includesCow: false,
      includesHorse: true,
    }),
    both: Object.freeze({
      id: "both",
      label: "牛马模式",
      subject: "牛马",
      speechPrefix: "哞咴",
      marathonLabel: "牛马拉松",
      includesCow: true,
      includesHorse: true,
    }),
  });

  function normalizePetMode(value) {
    return PET_MODES.includes(value) ? value : "cow";
  }

  function petModeProfile(value) {
    return PROFILES[normalizePetMode(value)];
  }

  function prefixPetSpeech(value, message) {
    const text = String(message || "").trim();
    if (!text) return "";
    if (/^(哞|咴|嘶)/.test(text)) return text;
    return `${petModeProfile(value).speechPrefix}，${text}`;
  }

  const api = Object.freeze({
    PET_MODES,
    normalizePetMode,
    petModeProfile,
    prefixPetSpeech,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.niulPetMode = api;
})();
