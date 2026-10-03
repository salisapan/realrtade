#!/usr/bin/env node
// Simulation of community learning: does sharing noisy, clipped, sketched model nudges across many devices make the
// shipped model better for a device that has never seen those phrasings, and how many devices and how much privacy
// does that take? Uses the REAL code path (core/intent-model.js learn, core/community.js buildUpdate / trimmedMean / decode).
//
//   node scripts/intent/community-sim.cjs [--json out] [--quick]
//
// The world: the two held-out teacher sets pooled (521 sentences). The even rows are what the simulated users write
// and label (each user labels a few asks and promises the engine missed); the odd rows are a NEW user's mail, never
// shared with anyone. Measured: ask/promise precision and recall of the full pipeline on the odd rows and on the blind set,
// before and after applying the published community layer. Per-device noise is the (epsilon, delta=1e-6) Gaussian mechanism.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const C = require(path.join(ROOT, 'core', 'community.js')).FlowCommunity;
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const pool = fx('intent-teacher-eval.json').concat(fx('intent-teacher-eval-2.json'));
const world = pool.filter((_, i) => i % 2 === 0), newUser = pool.filter((_, i) => i % 2 === 1), blind = fx('intent-blind.json');
const quick = process.argv.includes('--quick');

let seed = 424242;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function prf(set, cls) {
  let tp = 0, fp = 0, fn = 0;
  for (const g of set) { const r = P.recognize(g.t); const p = r.unsure ? 'X' : r.act; const w = g.act === cls, h = p === cls; if (w && h) tp++; else if (!w && h) fp++; else if (w && !h) fn++; }
  return { p: +(tp / (tp + fp || 1)).toFixed(3), r: +(tp / (tp + fn || 1)).toFixed(3), fp, fn };
}
const snap = () => ({ newUser: { ASK: prf(newUser, 'ASK'), PROMISE: prf(newUser, 'PROMISE') }, blind: { ASK: prf(blind, 'ASK'), PROMISE: prf(blind, 'PROMISE') } });

M.setAdaptation({}); M.setCommunity(null);
const baseline = snap();
// What a device can label: asks and promises the engine stayed silent on (its owner then chased or delivered by hand).
const missed = world.filter((g) => (g.act === 'ASK' || g.act === 'PROMISE') && (() => { const r = P.recognize(g.t); return r.unsure || r.act !== g.act; })());
console.log('baseline', JSON.stringify(baseline.newUser), '| missed in the world:', missed.length, 'of', world.filter((g) => g.act === 'ASK' || g.act === 'PROMISE').length);

function oneDevice(eps, labelsPerDevice, noiseless) {
  M.setAdaptation({});
  for (let i = 0; i < labelsPerDevice; i++) { const g = missed[Math.floor(rnd() * missed.length)]; M.learn(g.t, 'act', g.act, 4); }
  const adapt = JSON.parse(JSON.stringify(M.getAdaptation()));
  M.setAdaptation({});
  return C.buildUpdate(adapt, {}, { common: M.isCommon, epsilon: eps, delta: 1e-6, rng: rnd, noScale: noiseless });
}

const out = { baseline, missedInWorld: missed.length, runs: [] };
const Ns = quick ? [200, 1000] : [1000, 5000, 20000, 80000];
const epsList = quick ? ['inf', 8] : ['inf', 16, 8, 4];
const boosts = quick ? [10] : [10];
for (const eps of epsList) for (const N of Ns) {
  const noiseless = eps === 'inf';
  const sigma = noiseless ? 0 : C.sigmaFor(eps, 1e-6);
  const sketches = [];
  for (let i = 0; i < N; i++) { const u = oneDevice(noiseless ? 4 : eps, 3, noiseless); if (u) sketches.push(u.sketch); }
  const { mean, n } = C.trimmedMean(sketches, 0);
  for (const boost of boosts) {
    // With no noise the floor is zero: any coordinate two devices agree on would pass, so a floor of 0.01 stands in for the significance test.
    const entries = C.decode(mean, n, sigma, M.isCommon, { minCohort: 100, boost, floor: noiseless ? 0.01 : 0 });
    M.setAdaptation({}); M.setCommunity(entries);
    const after = snap();
    out.runs.push({ epsilon: eps, devices: N, boost, published: Object.keys(entries).length, newUser: after.newUser, blind: after.blind });
    console.log('eps', String(eps).padEnd(3), 'N', String(N).padStart(5), 'boost', String(boost).padStart(2), 'published', String(Object.keys(entries).length).padStart(4), '| new user ASK P/R', after.newUser.ASK.p, after.newUser.ASK.r, 'PROMISE', after.newUser.PROMISE.p, after.newUser.PROMISE.r, '| blind ASK', after.blind.ASK.p, after.blind.ASK.r, 'PROMISE', after.blind.PROMISE.p, after.blind.PROMISE.r);
  }
}
M.setAdaptation({}); M.setCommunity(null);
const j = process.argv.indexOf('--json'); if (j > -1) fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
