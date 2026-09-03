/**
 * Renders the score straight to PCM and writes public/soundtrack.wav.
 *
 * Everything is synthesized here — no sample library, no network — so the
 * score stays reproducible and the hits stay locked to timeline.ts.
 *
 * Run: node scripts/build-audio.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 48000;
const FPS = 60;
const TOTAL_FRAMES = 2030;

// Mirrors src/timeline.ts. Kept as literals so the script has no TS build step.
const ACT = {
  chaos: { from: 200, duration: 360 },
  doIt: { from: 495 },
  app: { from: 760, duration: 860 },
  results: { from: 1590 },
  outro: { from: 1890 },
};
const COLLAPSE_FRAME = 470;
const CLICK_FRAME = 685;
const STEP_DONE_FRAMES = [230, 372, 524, 646, 778].map((f) => ACT.app.from + f);
const RESULT_CHECK_FRAMES = [20, 30, 40, 50, 60, 70].map((f) => ACT.results.from + f);
const HEADLINE_FRAME = ACT.results.from + 150;

const DUR = TOTAL_FRAMES / FPS;
const N = Math.ceil(DUR * SR);
const L = new Float64Array(N);
const R = new Float64Array(N);

const t = (frame) => frame / FPS;
const idx = (sec) => Math.max(0, Math.min(N - 1, Math.round(sec * SR)));

const add = (sec, sample, value) => {
  const i = idx(sec) + sample;
  if (i < 0 || i >= N) return;
  L[i] += value;
  R[i] += value;
};

/** Exponentially decaying sine — the workhorse for impacts and ticks. */
const tone = (startSec, freq, dur, gain, decay = 6, pan = 0) => {
  const n = Math.round(dur * SR);
  const start = idx(startSec);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-decay * p) * gain;
    const v = Math.sin(2 * Math.PI * freq * p) * env;
    const j = start + i;
    if (j >= N) break;
    L[j] += v * (1 - Math.max(0, pan));
    R[j] += v * (1 + Math.min(0, pan));
  }
};

/** Filtered noise burst — whooshes and paper texture. */
const noise = (startSec, dur, gain, decay = 5, lp = 0.25) => {
  const n = Math.round(dur * SR);
  const start = idx(startSec);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-decay * p) * gain;
    prev = prev * (1 - lp) + (Math.random() * 2 - 1) * lp;
    const j = start + i;
    if (j >= N) break;
    L[j] += prev * env;
    R[j] += prev * env * 0.92;
  }
};

/** Pitch sweep, used for the collapse and the riser into the click. */
const sweep = (startSec, dur, f0, f1, gain, curve = 2) => {
  const n = Math.round(dur * SR);
  const start = idx(startSec);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const f = f0 + (f1 - f0) * Math.pow(p, curve);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.sin(Math.PI * p) * gain;
    const j = start + i;
    if (j >= N) break;
    const v = Math.sin(phase) * env;
    L[j] += v;
    R[j] += v;
  }
};

/** Sustained detuned pad. */
const pad = (startSec, dur, freqs, gain, attack = 0.8, release = 1.2) => {
  const n = Math.round(dur * SR);
  const start = idx(startSec);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const rem = dur - p;
    const env =
      Math.min(1, p / attack) * Math.min(1, Math.max(0, rem / release)) * gain;
    let v = 0;
    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k];
      v += Math.sin(2 * Math.PI * f * p) + 0.35 * Math.sin(2 * Math.PI * (f * 1.004) * p);
    }
    v /= freqs.length * 1.35;
    const j = start + i;
    if (j >= N) break;
    L[j] += v * env;
    R[j] += v * env;
  }
};

// ---- bed: a low pad under the whole film, lifting through the chaos --------
pad(0, DUR, [110, 164.81], 0.055, 1.6, 2.2);
pad(t(ACT.chaos.from), t(ACT.chaos.duration), [220, 277.18], 0.03, 1.2, 1.0);

// ---- chaos texture: sparse clutter that thickens toward the implosion ------
{
  const from = t(ACT.chaos.from);
  const to = t(COLLAPSE_FRAME);
  let cursor = from;
  while (cursor < to) {
    const progress = (cursor - from) / (to - from);
    noise(cursor, 0.05, 0.05 + progress * 0.07, 40, 0.5);
    if (Math.random() < 0.4) tone(cursor, 900 + Math.random() * 1400, 0.05, 0.025, 30);
    cursor += 0.34 - progress * 0.22;
  }
}

// ---- collapse: everything converges ---------------------------------------
sweep(t(COLLAPSE_FRAME) - 0.85, 0.9, 780, 90, 0.16, 2.2);
noise(t(COLLAPSE_FRAME) - 0.5, 0.55, 0.16, 7, 0.35);
tone(t(COLLAPSE_FRAME), 70, 0.7, 0.28, 8);

// ---- the click: the peak of the film --------------------------------------
sweep(t(CLICK_FRAME) - 1.1, 1.1, 160, 1500, 0.1, 2.6);   // riser
noise(t(CLICK_FRAME) - 0.12, 0.16, 0.12, 26, 0.6);        // transient air
tone(t(CLICK_FRAME), 55, 1.5, 0.5, 4.2);                  // sub impact
tone(t(CLICK_FRAME), 110, 0.7, 0.2, 7);
tone(t(CLICK_FRAME) + 0.012, 1760, 0.1, 0.07, 40);        // bright tick
noise(t(CLICK_FRAME) + 0.02, 1.5, 0.09, 2.4, 0.16);       // wash

// ---- execution: a soft pulse plus a tick on every completed step ----------
{
  const from = t(ACT.app.from);
  const to = t(ACT.app.from + ACT.app.duration);
  for (let s = from; s < to; s += 0.5) tone(s, 146.83, 0.16, 0.035, 12);
  const notes = [523.25, 587.33, 659.25, 698.46, 783.99];
  STEP_DONE_FRAMES.forEach((f, i) => {
    tone(t(f), notes[i], 0.5, 0.12, 7);
    tone(t(f), notes[i] * 2, 0.22, 0.05, 14);
    noise(t(f), 0.06, 0.03, 34, 0.7);
  });

  // soft typing texture under the compose-email vignette (step index 2)
  const typeFrom = t(ACT.app.from + 392);
  const typeTo = t(ACT.app.from + 500);
  for (let s = typeFrom; s < typeTo; s += 0.045 + Math.random() * 0.05) {
    noise(s, 0.02, 0.012, 60, 0.85);
  }
}

// ---- results: one note per check, resolving under the headline ------------
{
  const arp = [523.25, 659.25, 783.99, 880, 1046.5, 1174.66];
  RESULT_CHECK_FRAMES.forEach((f, i) => {
    tone(t(f), arp[i], 0.7, 0.11, 5.5);
    tone(t(f), arp[i] * 2, 0.3, 0.04, 12);
  });
  pad(t(HEADLINE_FRAME), 2.6, [261.63, 329.63, 392, 523.25], 0.12, 0.25, 1.4);
  tone(t(HEADLINE_FRAME), 65.41, 1.6, 0.22, 3.4);
}

// ---- outro --------------------------------------------------------------
pad(t(ACT.outro.from), DUR - t(ACT.outro.from), [130.81, 196, 261.63], 0.1, 0.7, 1.6);

// ---- mix: soft-clip, then fade the very edges to avoid pops ---------------
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = peak > 0 ? Math.min(1, 0.82 / peak) : 1;

const fade = Math.round(0.05 * SR);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);

const clip = (v) => Math.tanh(v) * 32767;
for (let i = 0; i < N; i++) {
  let g = norm;
  if (i < fade) g *= i / fade;
  if (i > N - fade) g *= (N - i) / fade;
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(L[i] * g)))), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(R[i] * g)))), 44 + i * 4 + 2);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/soundtrack.wav', buf);
console.log(`wrote public/soundtrack.wav — ${DUR.toFixed(2)}s, ${(buf.length / 1e6).toFixed(1)} MB, peak ${peak.toFixed(2)}`);
