let cowAudioContext = null;
let cowSoundEnabled = true;

function setCowSoundEnabled(enabled) {
  cowSoundEnabled = Boolean(enabled);
}

function cowAudio() {
  if (!cowSoundEnabled) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!cowAudioContext) cowAudioContext = new AC();
  return cowAudioContext;
}

function armCowAudio() {
  if (!cowSoundEnabled) return;
  const ctx = cowAudio();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

function mooSpec(kind) {
  if (kind === "short") return { dur: 0.42, startF: 280, peakF: 340, endF: 210, vol: 0.55, peakAt: 0.2 };
  if (kind === "long") return { dur: 1.05, startF: 220, peakF: 305, endF: 155, vol: 0.62, peakAt: 0.22 };
  if (kind === "rise") return { dur: 0.58, startF: 240, peakF: 290, endF: 390, vol: 0.55, peakAt: 0.38 };
  return { dur: 0.72, startF: 245, peakF: 325, endF: 175, vol: 0.58, peakAt: 0.22 };
}

function glide(osc, startF, peakF, endF, now, dur, peakAt) {
  osc.frequency.setValueAtTime(startF, now);
  osc.frequency.linearRampToValueAtTime(peakF, now + dur * peakAt);
  osc.frequency.linearRampToValueAtTime(endF, now + dur);
}

function synthesizeMoo(ctx, kind, offset = 0) {
  const now = ctx.currentTime + Math.max(0, offset);
  const { dur, startF, peakF, endF, vol, peakAt } = mooSpec(kind);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(vol, now + 0.05);
  master.gain.linearRampToValueAtTime(vol * 0.8, now + dur * 0.5);
  master.gain.linearRampToValueAtTime(0, now + dur);
  master.connect(ctx.destination);

  const color = ctx.createBiquadFilter();
  color.type = "lowpass";
  color.Q.value = 0.9;
  color.frequency.setValueAtTime(900, now);
  color.frequency.linearRampToValueAtTime(1400, now + dur * peakAt);
  color.frequency.linearRampToValueAtTime(700, now + dur);
  color.connect(master);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  glide(osc, startF, peakF, endF, now, dur, peakAt);
  osc.connect(color);

  const body = ctx.createOscillator();
  body.type = "triangle";
  glide(body, startF * 0.5, peakF * 0.5, endF * 0.5, now, dur, peakAt);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.45;
  body.connect(bodyGain);
  bodyGain.connect(color);

  const nasal = ctx.createOscillator();
  nasal.type = "sine";
  glide(nasal, startF * 2, peakF * 2, endF * 2, now, dur, peakAt);
  const nasalGain = ctx.createGain();
  nasalGain.gain.value = 0.22;
  nasal.connect(nasalGain);
  nasalGain.connect(master);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.2;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 6;
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(osc.frequency);

  osc.start(now);
  body.start(now);
  nasal.start(now);
  vibrato.start(now);
  osc.stop(now + dur + 0.03);
  body.stop(now + dur + 0.03);
  nasal.stop(now + dur + 0.03);
  vibrato.stop(now + dur + 0.03);
}

function playCowMoo(kind = "medium") {
  if (!cowSoundEnabled) return;
  const ctx = cowAudio();
  if (!ctx) return;
  const start = () => {
    if (kind === "double") {
      synthesizeMoo(ctx, "short", 0);
      synthesizeMoo(ctx, "short", 0.24);
      return;
    }
    synthesizeMoo(ctx, kind, 0);
  };
  if (ctx.state === "running") {
    start();
    return;
  }
  ctx.resume().then(() => {
    if (ctx.state === "running") start();
  }).catch(() => {});
}

function mooKindForLine(line) {
  const text = String(line || "");
  if (text.includes("？")) return "rise";
  if (text.includes("——")) return "long";
  if (text.includes("哞哞")) return "double";
  if (text === "哞。" || text === "哞～") return "short";
  return "medium";
}
