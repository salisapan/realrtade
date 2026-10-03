// Community learning, client side — portable, no chrome.*, no DOM, no network. DORMANT until the owner
// enables it (docs/community-learning.md): nothing here runs unless the person opted in AND the product ships
// with the switch on. This file only does the mathematics, so it can be tested and simulated.
//
// The idea. Every device learns a little from its owner (core/intent-model.js `learn`): sparse numeric nudges
// to the model, never text. Across thousands of devices those nudges point the same way for the same phrasings
// ("any luck?" is an ask). Sharing them would make the shipped model better for everyone, but the nudges are
// derived from private mail, so they must not be shared in the clear. The recipe, in four steps, each of which
// limits what can leak:
//
//   1. ALLOWLIST   only feature buckets that are common in PUBLIC training text are eligible. A bucket hit by a
//                  rare word, a name or an address is never contributed.
//   2. SKETCH      the sparse update is folded into a small dense "count sketch" (3 rows of 683 = 2,049 numbers)
//                  with random signs: a linear map the server can invert only for coordinates that many people
//                  share. Three independent rows and a median at decode time keep two unrelated features that
//                  happen to share a cell from being mistaken for each other.
//   3. CLIP        the sketch is clipped to a fixed L2 norm C, so no single device can move the result by more
//                  than C (this is also the defence against one malicious device).
//   4. NOISE       Gaussian noise is added ON THE DEVICE to every one of the 2,049 numbers, with the scale that
//                  makes the upload (epsilon, delta)-differentially private. The server never sees the clean
//                  sketch. Averaging N devices shrinks the noise by sqrt(N) while the shared signal stays.
//
// The server (netlify/functions/community-learn) only sums noisy sketches. A coordinate is published only when
// its estimate is many noise-standard-deviations above zero and enough devices took part (k-anonymity).
const FlowCommunity = (() => {
  const ROWS = 3, W = 683;        // count-sketch rows and width
  const M = ROWS * W;             // sketch length (2,049)
  const CLIP = 1.0;               // L2 clip of the sketch = the sensitivity of one device
  const GAIN = 4;                 // the sketch is amplified before clipping so a device uses its whole privacy budget; the decoder divides it back out
  const HEAD = 'act';             // only the speech-act head is shared
  const CLASSES = 4;
  const DIM = 16384;
  const MAX_ENTRIES = 4000;
  const MAX_DELTA = 0.5;          // same cap as the model's own adaptation
  const MIN_COHORT = 200;         // never publish with fewer devices than this
  const Z = 5;                    // a coordinate must be this many noise deviations from zero to be published
  const ENABLED = false;          // the product switch: false until the owner launches (privacy copy changes with it)

  // ---- hashing: two independent FNV-style hashes of a coordinate id ----------------------------------
  function h32(x, seed) {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < 4; i++) { h ^= (x >>> (i * 8)) & 255; h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return h >>> 0;
  }
  const ROW_SEEDS = [[0x9e3779b1, 0x85ebca6b], [0x27d4eb2f, 0x165667b1], [0xc2b2ae35, 0x7f4a7c15]];
  // The cell and the sign of a coordinate in each row.
  const cells = (id) => ROW_SEEDS.map((sd, r) => [r * W + (h32(id, sd[0]) % W), h32(id, sd[1]) & 1 ? 1 : -1]);
  const coordId = (c, idx) => c * DIM + idx;

  // ---- the Gaussian mechanism --------------------------------------------------------------------------
  // Smallest sigma (in units of the sensitivity) so that ONE release is (epsilon, delta)-DP: the analytic
  // Gaussian mechanism (Balle and Wang, 2018), solved numerically. Valid for any epsilon, unlike the textbook
  // formula that needs epsilon < 1.
  function erf(x) { const sg = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  function deltaOf(sigma, eps) {
    const a = 1 / (2 * sigma) - eps * sigma, b = -1 / (2 * sigma) - eps * sigma;
    return Phi(a) - Math.exp(eps) * Phi(b);
  }
  function sigmaFor(eps, delta) {
    if (!(eps > 0) || !(delta > 0) || delta >= 1) return Infinity;
    let lo = 0.05, hi = 200;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (deltaOf(mid, eps) > delta) lo = mid; else hi = mid; }
    return hi;
  }

  // ---- randomness (injectable: tests pass a seeded generator; the browser passes crypto) ----------------
  function cryptoRng() {
    const g = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
    if (!g) throw new Error('no secure randomness: refusing to build a community update');
    return () => { const b = new Uint32Array(2); g.getRandomValues(b); return (b[0] * 2097152 + (b[1] >>> 11)) / 9007199254740992; };
  }
  function gaussian(rng) { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); }

  // ---- the update ------------------------------------------------------------------------------------------
  // adapt: the model's adaptation ({ act: { 'c|idx': delta } }); base: what was already shared (or {}); common:
  // function(idx) -> true for allowlisted buckets. Returns the SPARSE clean delta over allowlisted coordinates.
  function delta(adapt, base, common) {
    const cur = (adapt && adapt[HEAD]) || {}, old = (base && base[HEAD]) || {};
    const out = {};
    Object.keys(cur).forEach((k) => {
      const [c, idx] = k.split('|').map(Number);
      if (!(c >= 0 && c < CLASSES) || !(idx >= 0 && idx < DIM) || !common(idx)) return;
      const d = cur[k] - (old[k] || 0);
      if (Math.abs(d) > 1e-9) out[coordId(c, idx)] = d;
    });
    return out;
  }

  function sketch(sparse) {
    const s = new Float64Array(M);
    Object.keys(sparse).forEach((id) => { const n = Number(id); for (const [cell, sg] of cells(n)) s[cell] += sg * sparse[id]; });
    return s;
  }

  function clipL2(v, c) {
    let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n);
    if (n > c) for (let i = 0; i < v.length; i++) v[i] *= c / n;
    return v;
  }

  // The upload: sketch, clip, noise. eps/delta fix the noise; rng defaults to secure randomness.
  // Returns { v, m, clip, sigma, sketch:[M numbers] } or null when there is nothing to share.
  function buildUpdate(adapt, base, opts) {
    const o = opts || {};
    const common = o.common || (() => false);
    const sparse = delta(adapt, base, common);
    if (!Object.keys(sparse).length) return null;
    const eps = o.epsilon || 4, dl = o.delta || 1e-6;
    const sigma = o.noScale ? 0 : sigmaFor(eps, dl);
    const s0 = sketch(sparse);
    for (let i = 0; i < M; i++) s0[i] *= GAIN;
    const s = clipL2(s0, CLIP);
    const rng = o.rng || cryptoRng();
    const out = new Array(M);
    for (let i = 0; i < M; i++) out[i] = Math.round((s[i] + sigma * CLIP * gaussian(rng)) * 10000) / 10000;
    return { v: 1, m: M, clip: CLIP, sigma: Number(sigma.toFixed(4)), epsilon: eps, delta: dl, sketch: out };
  }

  // What the server may accept: right shape, finite numbers, and no coordinate that noise at this sigma
  // could not plausibly produce (a 10-sigma outlier is an attack or a bug).
  function validUpdate(u) {
    if (!u || u.v !== 1 || u.m !== M || !Array.isArray(u.sketch) || u.sketch.length !== M) return false;
    if (!(u.sigma >= 0) || !(u.clip === CLIP)) return false;
    const bound = CLIP * (1 + 10 * Math.max(u.sigma, 0.01));
    for (let i = 0; i < M; i++) { const x = u.sketch[i]; if (typeof x !== 'number' || !isFinite(x) || Math.abs(x) > bound) return false; }
    return true;
  }

  // ---- decoding (used by the aggregator, in the simulation, and to check a published file) --------------------
  // mean: the average of N noisy sketches; sigma: the per-device noise scale; n: the cohort size.
  // Returns { 'c|idx': estimate } for the coordinates that pass the significance and k-anonymity tests.
  function decode(mean, n, sigma, common, opts) {
    const o = opts || {};
    const minCohort = o.minCohort === undefined ? MIN_COHORT : o.minCohort;
    if (n < minCohort) return {};
    // A published coordinate must clear z noise deviations in the MEDIAN of its three rows (about 1.25x one row's deviation).
    const noiseSd = ((sigma * CLIP) / Math.sqrt(n) / GAIN) * 1.25;
    const z = o.z || Z;
    const floor = Math.max(z * noiseSd, o.floor || 0);
    const est = [];
    for (let c = 0; c < CLASSES; c++) for (let idx = 0; idx < DIM; idx++) {
      if (!common(idx)) continue;
      const id = coordId(c, idx);
      const cs = cells(id);
      const e3 = [cs[0][1] * mean[cs[0][0]], cs[1][1] * mean[cs[1][0]], cs[2][1] * mean[cs[2][0]]].sort((a, b) => a - b);
      const e = e3[1] / GAIN;                          // the median of the three rows
      if (Math.abs(e) >= floor) est.push([c + '|' + idx, e]);
    }
    est.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const out = {};
    est.slice(0, MAX_ENTRIES).forEach(([k, e]) => { out[k] = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, e * (o.boost || 1))); });
    return out;
  }

  // ---- aggregation (server side, and the simulation) -------------------------------------------------------
  // Coordinate-wise mean of N noisy sketches, optionally trimmed (`trim` = fraction dropped from each tail). MEASURED
  // (test/community-corpus.cjs): with local noise this large, trimming does NOT protect against hostile devices that stay
  // inside the clip, because each honest value is mostly noise and an attacker's value hides in the bulk. So the default
  // is no trimming, and the real defences are the clip (bounded influence per device), the per-caller rate limit
  // (a Sybil attack costs uploads), the significance and cohort tests, and the canary on publish. Trimming remains for
  // gross outliers that slip past validation. Returns { mean, n }.
  function trimmedMean(sketches, trim) {
    const n = sketches.length;
    const mean = new Float64Array(M);
    if (!n) return { mean, n: 0 };
    const t = Math.min(Math.floor(n * (trim || 0)), Math.floor((n - 1) / 2));
    if (!t) {                                   // no trimming: a plain mean, no sorting
      for (let i = 0; i < n; i++) { const sk = sketches[i]; for (let j = 0; j < M; j++) mean[j] += sk[j]; }
      for (let j = 0; j < M; j++) mean[j] /= n;
      return { mean, n };
    }
    const col = new Float64Array(n);
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < n; i++) col[i] = sketches[i][j];
      col.sort();
      let sum = 0;
      for (let i = t; i < n - t; i++) sum += col[i];
      mean[j] = sum / (n - 2 * t);
    }
    return { mean, n };
  }

  // A published delta is only ever applied after these checks (shape, size, bounds). The signature check
  // is in src/community.js; this is the part that does not need a key.
  function validDelta(d) {
    if (!d || typeof d !== 'object' || !d.entries || typeof d.entries !== 'object' || typeof d.round !== 'number') return false;
    const keys = Object.keys(d.entries);
    if (keys.length > MAX_ENTRIES) return false;
    for (const k of keys) {
      const m = /^([0-3])\|(\d{1,5})$/.exec(k);
      if (!m || Number(m[2]) >= DIM) return false;
      const v = d.entries[k];
      if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > MAX_DELTA) return false;
    }
    return true;
  }

  return { M, ROWS, W, CLIP, GAIN, HEAD, DIM, MAX_ENTRIES, MAX_DELTA, MIN_COHORT, Z, ENABLED, cells, coordId, sigmaFor, deltaOf, delta, sketch, buildUpdate, validUpdate, trimmedMean, decode, validDelta, cryptoRng, gaussian };
})();

if (typeof module !== 'undefined') module.exports = { FlowCommunity };
