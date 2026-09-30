/**
 * Renders the Hebrew cut's score straight to PCM and writes
 * public/soundtrack-hebrew.wav. Same synthesis approach as build-audio.mjs
 * (the English cut's score): everything is generated here, no sample
 * library, no network.
 *
 * Mirrors src/timelineHebrew.ts as literals so this script has no TS build
 * step — keep the two in sync by hand when timing changes.
 *
 * Run: node scripts/build-audio-hebrew.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 48000;
const FPS = 60;

const ACT = {
  pain: { from: 0, duration: 720 },
  inversion: { from: 690, duration: 600 },
  verticals: { from: 1260, duration: 2580 },
  graph: { from: 3810, duration: 780 },
  close: { from: 4560, duration: 720 },
};
const TOTAL_FRAMES = ACT.close.from + ACT.close.duration; // 5280

const VERT_DURATION = 860;
const VERT_LOCAL = [0, 830, 1660];
const VERTICALS = VERT_LOCAL.map((local) => ({ from: ACT.verticals.from + local, duration: VERT_DURATION }));

const BEAT_LOCAL = { mail: 0, click: 300, shield: 420, confirm: 570, result: 720, holdEnd: 820 };

const CLICK_FRAMES = [...VERTICALS.map((v) => v.from + BEAT_LOCAL.click), ACT.close.from + 200];
const SHIELD_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.shield);
const CONFIRM_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.confirm);
const RESULT_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.result);

const COLLAPSE_FRAME = ACT.pain.from + 600;
const LOGO_SOLID_FRAME = ACT.inversion.from + 300;
const GRAPH_NODE_DELAYS = [0, 8, 16, 24, 32];
const GRAPH_START = ACT.graph.from;
const TAGLINE_FRAME = ACT.close.from + 300 + 150; // matches ClosingHe's taglineStart

const DUR = TOTAL_FRAMES / FPS;
const N = Math.ceil(DUR * SR);
const L = new Float64Array(N);
const R = new Float64Array(N);

const t = (frame) => frame / FPS;
const idx = (sec) => Math.max(0, Math.min(N - 1, Math.round(sec * SR)));

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

/** Pitch sweep, used for the collapse and the riser into each click. */
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
    const env = Math.min(1, p / attack) * Math.min(1, Math.max(0, rem / release)) * gain;
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

// ---- bed: a low pad under the whole film ----------------------------------
pad(0, DUR, [110, 164.81], 0.05, 1.6, 2.2);
pad(t(ACT.pain.from), t(ACT.pain.duration), [220, 277.18], 0.028, 1.2, 1.0);

// ---- Act 1: chaos texture thickening toward the collapse -------------------
{
  const from = t(60);
  const to = t(COLLAPSE_FRAME);
  let cursor = from;
  while (cursor < to) {
    const progress = (cursor - from) / (to - from);
    noise(cursor, 0.05, 0.045 + progress * 0.07, 40, 0.5);
    if (Math.random() < 0.4) tone(cursor, 900 + Math.random() * 1400, 0.05, 0.024, 30);
    cursor += 0.34 - progress * 0.22;
  }
}
sweep(t(COLLAPSE_FRAME) - 0.85, 0.9, 780, 90, 0.15, 2.2);
noise(t(COLLAPSE_FRAME) - 0.5, 0.55, 0.15, 7, 0.35);
tone(t(COLLAPSE_FRAME), 70, 0.7, 0.26, 8);

// ---- Act 2: logo coalescing into solid chrome ------------------------------
pad(t(ACT.inversion.from), t(360), [196, 261.63, 329.63], 0.07, 0.6, 1.6);
tone(t(LOGO_SOLID_FRAME), 523.25, 1.2, 0.16, 3.6);
tone(t(LOGO_SOLID_FRAME), 1046.5, 0.6, 0.08, 6);
noise(t(LOGO_SOLID_FRAME) - 0.1, 0.3, 0.06, 10, 0.4);

// ---- Act 3: the three verticals --------------------------------------------
// A click hit is the loudest, most percussive event; the Shield stinger is a
// deliberately distinct two-note alert; confirm and result are softer and
// resolving, so the four sonic identities never get confused with each other.
CLICK_FRAMES.slice(0, 3).forEach((f) => {
  sweep(t(f) - 0.7, 0.7, 200, 1400, 0.09, 2.4);
  noise(t(f) - 0.1, 0.14, 0.11, 26, 0.6);
  tone(t(f), 58, 1.3, 0.42, 4.4);
  tone(t(f), 116, 0.6, 0.18, 7);
  tone(t(f) + 0.012, 1760, 0.1, 0.06, 40);
});

SHIELD_FRAMES.forEach((f) => {
  tone(t(f), 1046.5, 0.16, 0.15, 11);
  tone(t(f) + 0.09, 830.6, 0.22, 0.14, 9);
  noise(t(f), 0.05, 0.045, 30, 0.6);
});

CONFIRM_FRAMES.forEach((f) => {
  tone(t(f), 659.25, 0.3, 0.09, 10);
  tone(t(f), 987.77, 0.22, 0.05, 14);
});

RESULT_FRAMES.forEach((f) => {
  const arp = [523.25, 659.25, 783.99];
  arp.forEach((freq, i) => tone(t(f) + i * 0.05, freq, 0.6, 0.11, 6));
  tone(t(f), 261.63, 1.0, 0.1, 4);
});

// paperwork texture while each panel fills in, between click and shield
VERTICALS.forEach((v) => {
  const from = t(v.from + BEAT_LOCAL.click + 20);
  const to = t(v.from + BEAT_LOCAL.shield - 10);
  for (let s = from; s < to; s += 0.09 + Math.random() * 0.08) {
    noise(s, 0.02, 0.014, 55, 0.85);
  }
});

// the closing act's [בצע] press (4th of the film)
{
  const f = CLICK_FRAMES[3];
  sweep(t(f) - 0.7, 0.7, 200, 1400, 0.09, 2.4);
  noise(t(f) - 0.1, 0.14, 0.11, 26, 0.6);
  tone(t(f), 58, 1.3, 0.42, 4.4);
  tone(t(f), 116, 0.6, 0.18, 7);
}

// ---- Act 4: knowledge graph settling ---------------------------------------
{
  const notes = [392, 440, 523.25, 587.33, 659.25];
  GRAPH_NODE_DELAYS.forEach((delay, i) => {
    tone(t(GRAPH_START + delay), notes[i], 0.5, 0.09, 6);
  });
  pad(t(GRAPH_START + 60), t(ACT.graph.duration - 60), [220, 277.18, 329.63], 0.09, 1.2, 1.8);
}

// ---- Act 5: closing ---------------------------------------------------------
pad(t(ACT.close.from), DUR - t(ACT.close.from), [130.81, 196, 261.63], 0.1, 0.7, 1.8);
tone(t(TAGLINE_FRAME), 65.41, 1.6, 0.18, 3.2);

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
writeFileSync('public/soundtrack-hebrew.wav', buf);
console.log(
  `wrote public/soundtrack-hebrew.wav — ${DUR.toFixed(2)}s, ${(buf.length / 1e6).toFixed(1)} MB, peak ${peak.toFixed(2)}`,
);
