// The living icon (core/living-icon.js): one body that breathes, changes shape and closes with a tick, computed from one distance field.
// What is pinned here is what "alive, not a slideshow" means in numbers: no frame jumps, a mid-morph frame is ONE solid body (not two
// half-transparent pictures on top of each other), the rest state still moves, the colours are the Do It blues only, and the toolbar sizes are cheap.
// Run: node test/living-icon-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowLivingIcon: L } = require('../core/living-icon.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const N = 96;
const alphaOf = (px) => { const a = new Float32Array(px.length / 4); for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255; return a; };
const bodyMask = (px) => { const a = alphaOf(px); return a.map((v) => (v > 0.8 ? 1 : 0)); };
const iou = (m1, m2) => { let i = 0, u = 0; for (let k = 0; k < m1.length; k++) { if (m1[k] && m2[k]) i++; if (m1[k] || m2[k]) u++; } return u ? i / u : 1; };
const meanDiff = (p1, p2) => { let s = 0; for (let k = 0; k < p1.length; k++) s += Math.abs(p1[k] - p2[k]); return s / p1.length; };

console.log('--- the engine is portable and the output is what a toolbar takes ---');
const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'living-icon.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('no chrome.*, document or window in the engine', !/\bchrome\.|\bdocument\b|\bwindow\b/.test(src));
[16, 32, 48, 128].forEach((n) => check(n + ' px: an RGBA buffer of n*n*4', L.render(L.pose('ring', 0), n).length === n * n * 4));
const r128 = L.render(L.pose('ring', 0), 128);
check('the background is transparent (corners)', [0, 127, 127 * 128, 128 * 128 - 1].every((i) => r128[i * 4 + 3] < 8));
check('the centre of the ring is open (the hole is see-through)', r128[(64 * 128 + 64) * 4 + 3] < 140, r128[(64 * 128 + 64) * 4 + 3]);
const band = L.render(L.pose('triangle', 0.4), 64, { rows: [20, 30] }), full = L.render(L.pose('triangle', 0.4), 64);
check('a band of rows is exactly the same rows of the full frame (the demo splits frames across workers)', band.length === 10 * 64 * 4 && band.every((v, k) => v === full[20 * 64 * 4 + k]));

console.log('--- only the Do It blues ---');
let bad = 0, seen = 0;
['ring', 'stretch', 'split', 'triangle', 'cube'].forEach((k) => {
  const px = L.render(L.pose(k, 0.7, k === 'ring' ? { tick: 1 } : {}), N);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    seen++;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 12) continue;                                   // the near-white gloss highlight
    let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    h *= 60; if (h < 0) h += 360;
    if (!(b >= r && b >= g && h > 205 && h < 240)) bad++;
  }
});
check('every solid pixel of every shape is blue (hue 205-240) or the white gloss: ' + seen + ' pixels', bad === 0, bad);

console.log('--- alive at rest ---');
const idle = L.createAnimator(); idle.setState('idle', 0); idle.frame(0);
const i1 = L.render(idle.frame(1000), N), i2 = L.render(idle.frame(1700), N);
check('two rest frames 0.7 s apart are not the same picture (it breathes and flows)', meanDiff(i1, i2) > 0.4, meanDiff(i1, i2));
check('and it is still the same ring (it moves, it does not change shape)', iou(bodyMask(i1), bodyMask(i2)) > 0.85, iou(bodyMask(i1), bodyMask(i2)));
check('a settled rest lets the toolbar stop drawing', idle.settled());

console.log('--- working: one body moving through the shapes, never a jump ---');
const a = L.createAnimator(); a.frame(0); a.setState('working', 0);
let prev = L.render(a.frame(0), N), worstStep = 0, worstIou = 1, t = 0, shapesSeen = new Set();
for (; t <= L.HOLD_MS * 5 + 400; t += 1000 / 30) {
  const p = a.frame(t);
  const cur = L.render(p, N);
  worstStep = Math.max(worstStep, meanDiff(prev, cur));
  worstIou = Math.min(worstIou, iou(bodyMask(prev), bodyMask(cur)));
  const top = Object.keys(p.w).sort((x, y) => p.w[y] - p.w[x])[0];
  if (p.w[top] > 0.9) shapesSeen.add(top);
  prev = cur;
}
const CUT = Math.min(meanDiff(L.render(L.pose('ring', 0), N), L.render(L.pose('stretch', 0), N)), meanDiff(L.render(L.pose('triangle', 0), N), L.render(L.pose('cube', 0), N)));
check('at 30 frames a second the biggest step between frames is a small part of a cut from one shape to the next (no jump)', worstStep < CUT * 0.4, { worstStep, cut: CUT });
check('the body overlaps itself from frame to frame (it deforms, it does not teleport)', worstIou > 0.6, worstIou);
check('it really passes through stretch, split, triangle and cube', ['stretch', 'split', 'triangle', 'cube'].every((k) => shapesSeen.has(k)), Array.from(shapesSeen));
check('it is never "settled" while working', !a.settled());

console.log('--- a morph is not a crossfade ---');
const mid = { w: { ring: 0.5, stretch: 0, split: 0, triangle: 0.5, cube: 0 }, tick: 0, t: 0.5, energy: 0, breath: 0 };
const NOGLOW = { glow: 0 };
const morph = L.render(mid, N, NOGLOW);
const A = L.render(L.pose('ring', 0.5, { breath: 0 }), N, NOGLOW), B = L.render(L.pose('triangle', 0.5, { breath: 0 }), N, NOGLOW);
const fade = new Uint8ClampedArray(A.length); for (let k = 0; k < A.length; k++) fade[k] = (A[k] + B[k]) / 2;
const ghost = (px) => { let g = 0, body = 0; for (let k = 3; k < px.length; k += 4) { if (px[k] > 60) body++; if (px[k] > 90 && px[k] < 180) g++; } return g / body; };
check('half-way between ring and triangle the body is solid: few half-transparent "ghost" pixels', ghost(morph) < 0.12, ghost(morph));
check('a crossfade of the two pictures would be full of ghosts (this is what the engine does NOT do)', ghost(fade) > 0.3 && ghost(fade) > ghost(morph) * 3, { fade: ghost(fade), morph: ghost(morph) });

console.log('--- done: the same ring, a tick drawn in its hole ---');
const d = L.createAnimator(); d.frame(0); d.setState('working', 0);
let tt = 0; for (; tt < 1800; tt += 33) d.frame(tt);
const before = L.render(d.frame(tt), N);
d.setState('done', tt);
let jump = 0, last = before;
for (let k = 0; k < 90; k++) { tt += 33; const cur = L.render(d.frame(tt), N); jump = Math.max(jump, meanDiff(last, cur)); last = cur; }
check('switching to done in the middle of a shape is continuous too', jump < CUT * 0.4, { jump, cut: CUT });
const done = L.render(d.frame(tt + 2000), 128);
const at = (x, y) => done[(Math.round((1 - y) / 2 * 128) * 128 + Math.round((x + 1) / 2 * 128)) * 4 + 3];
check('the tick is there, inside the hole', at(-0.07, -0.15) > 200 && at(0.07, 0) > 200, [at(-0.07, -0.15), at(0.07, 0)]);
check('the ring is there around it', at(0.57, 0) > 200 && at(-0.57, 0) > 200);
check('a point of the hole away from the tick stays open', at(-0.18, 0.2) < 140, at(-0.18, 0.2));
for (let k = 0; k < 120; k++) d.frame(tt + 2000 + k * 33);
check('done settles (the toolbar can stop drawing) and keeps the tick', d.settled());
const noTick = L.render(L.pose('ring', 0.3), 128);
check('at rest there is no tick', noTick[(Math.round((1 + 0.15) / 2 * 128) * 128 + Math.round((1 - 0.07) / 2 * 128)) * 4 + 3] < 140);

console.log('--- toolbar cost ---');
let t0 = Date.now(); for (let k = 0; k < 200; k++) L.render(L.pose('cube', k / 30, { energy: 0.4 }), 16); const ms16 = (Date.now() - t0) / 200;
t0 = Date.now(); for (let k = 0; k < 100; k++) L.render(L.pose('cube', k / 30, { energy: 0.4 }), 32); const ms32 = (Date.now() - t0) / 100;
check('a 16 px and a 32 px frame together cost a few milliseconds (12 frames a second is nothing)', ms16 + ms32 < 8, { ms16, ms32 });
console.log('--- the toolbar driver (src/living-toolbar.js): live frames while busy, still at rest, a tick only on a real close ---');
{
  const { FlowLivingToolbar: T } = require('../src/living-toolbar.js');
  const tsrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'living-toolbar.js'), 'utf8');
  check('the driver draws with the engine (setIcon imageData), not from finished frames', /imageData/.test(tsrc) && !/icons\/frame|frames\//.test(tsrc));
  global.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  let clock = 0; const timers = [];
  const realSet = global.setTimeout; global.setTimeout = (fn, ms) => { timers.push({ fn, at: clock + ms }); return timers.length; };
  const calls = [];
  const fake = { action: { setIcon: (x) => { calls.push(x); return Promise.resolve(); } } };
  const run = (ms) => { const end = clock + ms; while (true) { timers.sort((a, b) => a.at - b.at); const n = timers[0]; if (!n || n.at > end) break; timers.shift(); clock = n.at; n.fn(); } clock = end; };
  const bar = T.create(fake, L, { now: () => clock });
  const endA = bar.begin();
  run(3000);
  const live = calls.filter((c) => c.imageData);
  check('working: the icon is redrawn about 12 times a second', live.length >= 30 && live.length <= 40, live.length);
  check('each frame carries a 16 px and a 32 px picture', live.every((c) => c.imageData[16].width === 16 && c.imageData[32].data.length === 32 * 32 * 4));
  const ds = []; for (let k = 1; k < live.length; k++) ds.push(meanDiff(live[k - 1].imageData[32].data, live[k].imageData[32].data));
  check('consecutive toolbar frames change: it moves the whole time it works', ds.filter((x) => x > 0.05).length > ds.length * 0.8, { min: Math.min(...ds), max: Math.max(...ds) });
  endA(true);
  check('a real close switches to done', bar.state === 'done');
  run(12000);
  check('after the tick rests a moment it returns to the ring and stops drawing', bar.state === 'idle' && !bar.drawing);
  check('at rest it puts the static icon back (the service worker may sleep)', !!(calls[calls.length - 1].path));
  calls.length = 0;
  const endB = bar.begin(); run(1500); endB(false);
  const right = bar.state; run(8000);
  check('a draft or a carried loop never reaches done (preparation is not completion)', right === 'idle' && bar.state === 'idle' && !bar.drawing, right);
  check('the watched messages: only a write and a person\'s own close count as a close', T.WATCH['flow:execute-action']({ ok: true }) && T.WATCH['flow:follow-complete']({ ok: true }) && !T.WATCH['flow:follow-draft']({ ok: true }) && !T.WATCH['flow:follow-task']({ ok: true }) && !T.WATCH['flow:execute-action']({ ok: false }));
  const endC = bar.begin(); const endD = bar.begin(); endC(true); run(500);
  check('two things at once: it keeps working until the last one ends', bar.state === 'working');
  endD(false); run(100);
  check('...and then shows done if any of them was a real close', bar.state === 'done');
  run(20000);
  const endE = bar.begin(); run(T.MAX_WORK_MS + 2000);
  check('a call that never answers does not keep the icon busy forever', bar.state === 'idle');
  run(10000); check('...and it stops drawing', !bar.drawing); endE(true);
  global.setTimeout = realSet;
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
