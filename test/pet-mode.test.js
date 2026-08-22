const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePetMode,
  petModeProfile,
  prefixPetSpeech,
} = require("../renderer/pet-mode");

test("normalizes unknown pet modes to the existing cow experience", () => {
  assert.equal(normalizePetMode("horse"), "horse");
  assert.equal(normalizePetMode("both"), "both");
  assert.equal(normalizePetMode("unknown"), "cow");
});

test("describes which characters and marathon belong to each mode", () => {
  assert.deepEqual(
    {
      cow: petModeProfile("cow").includesCow,
      horse: petModeProfile("cow").includesHorse,
      marathon: petModeProfile("cow").marathonLabel,
    },
    { cow: true, horse: false, marathon: "哞拉松" }
  );
  assert.deepEqual(
    {
      cow: petModeProfile("both").includesCow,
      horse: petModeProfile("both").includesHorse,
      marathon: petModeProfile("both").marathonLabel,
    },
    { cow: true, horse: true, marathon: "牛马拉松" }
  );
});

test("prefixes ordinary speech without duplicating an animal call", () => {
  assert.equal(prefixPetSpeech("horse", "任务做完了。"), "咴，任务做完了。");
  assert.equal(prefixPetSpeech("both", "任务做完了。"), "哞咴，任务做完了。");
  assert.equal(prefixPetSpeech("cow", "哞，已经说过了。"), "哞，已经说过了。");
});
