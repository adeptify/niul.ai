function shouldIgnoreMouse({ pointerActive = false, overInteractiveSurface = false } = {}) {
  return !pointerActive && !overInteractiveSurface;
}

const mousePassthrough = Object.freeze({ shouldIgnoreMouse });

if (typeof module !== "undefined" && module.exports) {
  module.exports = mousePassthrough;
}

if (typeof window !== "undefined") {
  window.niulMousePassthrough = mousePassthrough;
}
