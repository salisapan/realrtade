// Community learning (core/community.js, scripts/community/lib.cjs): the privacy mathematics, the aggregation, the canary gate,
// the signature, and the model's community layer. Everything here is DORMANT in the product (FlowCommunity.ENABLED is false).
// Run: node test/community-corpus.cjs
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('../core/community.js').FlowCommunity;
const M = require('../core/intent-model.js').FlowIntentModel;
const P = require('../core/intent-pipeline.js').FlowIntentPipeline;
const lib = require('../../scripts/community/lib.cjs');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
// A good seeded generator (mulberry32): a linear-congruential one has lattice structure that makes Box-Muller noise misbehave.
let seed = 12345;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const allCommon = () => true;

console.log('\n--- the product switch ---');
check('community learning ships OFF', C.ENABLED === false);
check('and the verification key ships empty, so no delta could ever be applied', require('../core/community-key.js').FlowCommunityKey === null);

console.log('\n--- the Gaussian mechanism ---');
{
  check('more privacy (smaller epsilon) means more noise', C.sigmaFor(1, 1e-6) > C.sigmaFor(4, 1e-6) && C.sigmaFor(4, 1e-6) > C.sigmaFor(8, 1e-6));
  check('the noise scale really delivers the delta it was solved for', Math.abs(C.deltaOf(C.sigmaFor(4, 1e-6), 4) - 1e-6) < 1e-8, C.deltaOf(C.sigmaFor(4, 1e-6), 4));
  check('known value: epsilon 8, delta 1e-6 needs sigma about 0.65', Math.abs(C.sigmaFor(8, 1e-6) - 0.653) < 0.01, C.sigmaFor(8, 1e-6));
  check('nonsense parameters give infinite noise, never none', C.sigmaFor(0, 1e-6) === Infinity && C.sigmaFor(4, 0) === Infinity && C.sigmaFor(-1, 1e-6) === Infinity);
  check('the server floor (sigma 0.6) corresponds to epsilon of about 8 or less', C.sigmaFor(8.6, 1e-6) < 0.65 && C.sigmaFor(8, 1e-6) >= 0.6);
}

console.log('\n--- what is eligible to be shared ---');
{
  const adapt = { act: { '0|100': 0.2, '0|101': 0.3, '2|5000': -0.1, '1|7': 0.4 }, topic: { '0|9': 9 }, action: { '3|3': 3 } };
  const d = C.delta(adapt, {}, (idx) => idx !== 101);
  check('only allowlisted buckets of the speech-act head are eligible', Object.keys(d).length === 3 && d[C.coordId(0, 100)] === 0.2 && !(C.coordId(0, 101) in d) && d[C.coordId(2, 5000)] === -0.1, d);
  check('the other heads are never shared', !Object.keys(d).some((k) => Number(k) === C.coordId(3, 3)));
  const d2 = C.delta(adapt, { act: { '0|100': 0.2, '1|7': 0.1 } }, allCommon);
  check('only what is NEW since the last share is eligible', !(C.coordId(0, 100) in d2) && Math.abs(d2[C.coordId(1, 7)] - 0.3) < 1e-9, d2);
  check('malformed keys are ignored, not crashed on', Object.keys(C.delta({ act: { 'x|y': 1, '9|1': 1, '0|99999': 1 } }, {}, allCommon)).length === 0);
  check('nothing new, nothing shared (no upload at all)', C.buildUpdate({ act: {} }, {}, { common: allCommon, rng }) === null && C.buildUpdate(adapt, adapt, { common: allCommon, rng }) === null);
}

console.log('\n--- the upload: sketch, clip, noise ---');
{
  const sparse = {}; for (let i = 0; i < 300; i++) sparse[C.coordId(i % 4, 100 + i)] = 0.4;
  const s = C.sketch(sparse);
  check('the sketch has the fixed width: three rows of 683', s.length === C.M && C.M === 2049 && C.ROWS === 3);
  check('the sketch is linear: a sketch of a sum is the sum of sketches', (() => { const a = { [C.coordId(0, 5)]: 1 }, b = { [C.coordId(0, 5)]: 2 }; const ab = { [C.coordId(0, 5)]: 3 }; const x = C.sketch(a), y = C.sketch(b), z = C.sketch(ab); return x.every((v, i) => Math.abs(v + y[i] - z[i]) < 1e-12); })());
  const u = C.buildUpdate({ act: Object.fromEntries(Object.keys(sparse).map((k) => { const id = Number(k); return [Math.floor(id / 16384) + '|' + (id % 16384), sparse[k]]; })) }, {}, { common: allCommon, rng, noScale: true });
  const norm = Math.sqrt(u.sketch.reduce((a, b) => a + b * b, 0));
  check('without noise, a big update is clipped to norm <= 1', norm <= 1.0001, norm);
  const tiny = C.buildUpdate({ act: { '0|10': 0.001 } }, {}, { common: allCommon, rng, noScale: true });
  check('a tiny update is amplified by the public gain, then left unclipped', Math.abs(Math.sqrt(tiny.sketch.reduce((a, b) => a + b * b, 0)) - 0.001 * C.GAIN * Math.sqrt(C.ROWS)) < 1e-3);
  // Noise statistics: with sigma s the per-coordinate noise has standard deviation s * clip.
  const noisy = Array.from({ length: 40 }, () => C.buildUpdate({ act: { '0|10': 0.2 } }, {}, { common: allCommon, rng, epsilon: 8, delta: 1e-6 }));
  const xs = []; noisy.forEach((n) => n.sketch.forEach((v, i) => { if (!C.cells(C.coordId(0, 10)).some((c) => c[0] === i)) xs.push(v); }));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  check('the noise is zero-mean with the standard deviation the mechanism needs', Math.abs(mean) < 0.02 && Math.abs(sd - C.sigmaFor(8, 1e-6)) < 0.03, { mean, sd, want: C.sigmaFor(8, 1e-6) });
  check('the sigma used is written into the upload so the server can refuse weak noise', noisy[0].sigma > 0.6 && noisy[0].epsilon === 8);
  check('two uploads of the same update differ (the noise is fresh)', JSON.stringify(noisy[0].sketch) !== JSON.stringify(noisy[1].sketch));
  check('secure randomness is the default (no seeded generator reaches production)', (() => { const r = C.cryptoRng(); const a = r(), b = r(); return a >= 0 && a < 1 && a !== b; })());
}

console.log('\n--- what the server will accept ---');
{
  const good = C.buildUpdate({ act: { '0|10': 0.2 } }, {}, { common: allCommon, rng, epsilon: 8 });
  check('a genuine upload is valid', C.validUpdate(good));
  check('wrong width, wrong version, missing parts: refused', !C.validUpdate(null) && !C.validUpdate(Object.assign({}, good, { v: 2 })) && !C.validUpdate(Object.assign({}, good, { m: 1024 })) && !C.validUpdate(Object.assign({}, good, { sketch: good.sketch.slice(1) })));
  check('NaN, Infinity or text in the numbers: refused', !C.validUpdate(Object.assign({}, good, { sketch: good.sketch.map((x, i) => (i === 5 ? NaN : x)) })) && !C.validUpdate(Object.assign({}, good, { sketch: good.sketch.map((x, i) => (i === 5 ? 'x' : x)) })) && !C.validUpdate(Object.assign({}, good, { sketch: good.sketch.map((x, i) => (i === 5 ? Infinity : x)) })));
  check('a coordinate noise could not have produced is an attack or a bug: refused', !C.validUpdate(Object.assign({}, good, { sketch: good.sketch.map((x, i) => (i === 5 ? 500 : x)) })));
  check('a different clip bound is refused', !C.validUpdate(Object.assign({}, good, { clip: 50 })));
}

console.log('\n--- aggregation: robust, and silent when it cannot be sure ---');
{
  // Many devices share one heavy coordinate; everything else is noise.
  const heavyId = C.coordId(0, 321);
  const N = 4000, eps = 8, sigma = C.sigmaFor(eps, 1e-6);
  const mk = (extra) => C.buildUpdate({ act: Object.assign({ '0|321': 0.3 }, extra || {}) }, {}, { common: allCommon, rng, epsilon: eps }).sketch;
  const sketches = Array.from({ length: N }, () => mk());
  const { mean, n } = C.trimmedMean(sketches, 0.05);
  const out = C.decode(mean, n, sigma, allCommon);
  check('a coordinate that every device shares is recovered, with the right sign', out['0|321'] > 0.1, out['0|321']);
  check('and almost nothing else is published: no noise coordinate, and no unrelated feature that merely shares a cell with it', Object.keys(out).length <= 3, Object.keys(out));
  check('too few devices: nothing is published, however clear the signal (k-anonymity)', Object.keys(C.decode(mean, 150, sigma, allCommon)).length === 0);
  check('a coordinate outside the allowlist is never published', C.decode(mean, n, sigma, (idx) => idx !== 321)['0|321'] === undefined);
  check('every published number is capped like on-device learning', Object.values(C.decode(mean, n, sigma, allCommon, { boost: 1000 })).every((v) => Math.abs(v) <= C.MAX_DELTA));
  // Poisoning: hostile devices each send the largest sketch the clip allows, aimed at one coordinate.
  const evilId = C.coordId(1, 777), evil = new Array(C.M).fill(0); C.cells(evilId).forEach(([cell, sg]) => { evil[cell] = sg * (1 / Math.sqrt(C.ROWS)) * 0.999; });
  const withHostile = (frac) => { const a = sketches.slice(); for (let i = 0; i < Math.floor(N * frac); i++) a[i] = evil; return a; };
  const publishes = (frac, trim) => { const r = C.trimmedMean(withHostile(frac), trim); return Math.abs(C.decode(r.mean, r.n, sigma, allCommon)['1|777'] || 0) > 0; };
  check('5% hostile devices cannot make a coordinate publishable: each is bounded by the clip, and the significance test needs more', publishes(0.05, 0) === false && publishes(0.05, 0.05) === false);
  check('a determined attacker with a third of the cohort CAN push one through a plain average (the cost of the attack is the cohort, which is why uploads are rate-limited and the canary exists)', publishes(0.3, 0) === true);
  check('honest finding: trimming does not stop an in-bound attacker under this much noise, so it is off by default (the clip, rate limits, significance test and canary are the defences)', (() => { const e = (trim) => { const r = C.trimmedMean(withHostile(0.1), trim); return Math.abs(r.mean[C.cells(evilId)[0][0]]); }; return e(0.15) >= e(0) * 0.9; })());
  check('and no single device can exceed the clip, so the damage per device is bounded', Math.sqrt(evil.reduce((a, b) => a + b * b, 0)) <= C.CLIP + 1e-9);
}

console.log('\n--- a published delta is validated before it touches the model ---');
{
  check('a good delta passes', C.validDelta({ round: 3, entries: { '0|10': 0.2, '3|16383': -0.5 } }));
  check('too many entries, bad keys, out-of-range indexes and oversized or non-numeric values do not', !C.validDelta({ round: 1, entries: Object.fromEntries(Array.from({ length: 4001 }, (_, i) => ['0|' + i, 0.1])) }) && !C.validDelta({ round: 1, entries: { '4|1': 0.1 } }) && !C.validDelta({ round: 1, entries: { '0|16384': 0.1 } }) && !C.validDelta({ round: 1, entries: { '0|1': 5 } }) && !C.validDelta({ round: 1, entries: { '0|1': 'a' } }) && !C.validDelta({ entries: {} }) && !C.validDelta(null));
}

console.log('\n--- the model\'s community layer ---');
{
  M.setAdaptation({}); M.setCommunity(null);
  const t = 'Is the server back up? Nothing loads on my side.';
  const before = M.predict(t).probs.ASK;
  const idxs = M.features(t, 16384);
  const entries = {}; idxs.forEach((i) => { entries['0|' + i] = 0.05; });
  M.setCommunity(entries);
  const after = M.predict(t).probs.ASK;
  check('a community delta moves the answer', after > before, [before, after]);
  M.setCommunity(null);
  check('removing it restores the shipped behaviour exactly', M.predict(t).probs.ASK === before);
  check('the allowlist is public-text buckets only, about half of them, never all', (() => { let n = 0; for (let i = 0; i < 16384; i++) if (M.isCommon(i)) n++; return n > 3000 && n < 12000; })());
  check('rare features (a hashed name-like token) are mostly NOT eligible', (() => { let eligible = 0, total = 0; ['zzqxv', 'blorptan', 'quillmore', 'vexnarth', 'zibbleton'].forEach((w) => { M.features(w + ' ' + w + ' ' + w, 16384).forEach((i) => { total++; if (M.isCommon(i)) eligible++; }); }); return eligible / total < 0.75; })(), 'informational: buckets collide, so the allowlist is defence in depth, the noise is the guarantee');
}

console.log('\n--- release: canary, signature ---');
{
  const common = M.isCommon, sigma = C.sigmaFor(8, 1e-6);
  const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  const sets = { blind: fx('intent-blind.json'), teacherEval: fx('intent-teacher-eval.json') };
  const rowsOf = (n, entry) => Array.from({ length: n }, () => ({ sigma, sketch: C.buildUpdate({ act: entry }, {}, { common: allCommon, rng, epsilon: 8 }).sketch }));
  check('a round that is too small publishes nothing', lib.buildRelease(rowsOf(50, { '0|321': 0.3 }), { common: allCommon }).reason === 'cohort-too-small');
  check('invalid rows are dropped before counting', lib.buildRelease(rowsOf(150, { '0|321': 0.3 }).concat(Array.from({ length: 200 }, () => ({ sigma, sketch: [1, 2, 3] }))), { common: allCommon }).reason === 'cohort-too-small');
  check('pure noise publishes nothing', (() => { const rows = Array.from({ length: 300 }, () => ({ sigma, sketch: C.buildUpdate({ act: { '0|1': 0.0001 } }, {}, { common: allCommon, rng, epsilon: 8 }).sketch })); return lib.buildRelease(rows, { common: allCommon }).reason === 'nothing-significant'; })());
  const strong = lib.buildRelease(rowsOf(3000, { '0|321': 0.3 }), { common: allCommon, round: 7, now: 1760000000000 });
  check('a clear shared signal is released as one payload', strong.ok && JSON.parse(strong.release.payload).round === 7 && JSON.parse(strong.release.payload).entries['0|321'] > 0, strong.report);
  // A delta that would harm: push a very common ask phrase toward INFORM and ACK.
  M.setCommunity(null);
  const harmful = {}; M.features('Could you please send me the signed contract by Friday?', 16384).forEach((i) => { harmful['0|' + i] = -0.5; harmful['2|' + i] = 0.5; });
  const gate = lib.canary(M, P, sets, harmful);
  check('the canary REFUSES a delta that costs recall', gate.pass === false && gate.meanRecallDelta < 0, gate);
  check('and passes an empty one (no harm)', lib.canary(M, P, sets, {}).pass === true);
  check('the canary leaves the model as it found it', M.getCommunity() === null);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }), jwk = publicKey.export({ format: 'jwk' });
  const file = { payload: strong.release.payload, sig: lib.signRelease(strong.release.payload, pem) };
  check('a signed release verifies with the public key', lib.verifyRelease(file, jwk) === true);
  check('a single changed character breaks it', lib.verifyRelease({ payload: file.payload.replace('"round":7', '"round":8'), sig: file.sig }, jwk) === false);
  check('a different key breaks it', lib.verifyRelease(file, crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })) === false);
  check('garbage never throws', lib.verifyRelease({ payload: 'x', sig: '!!!' }, jwk) === false && lib.verifyRelease(null, jwk) === false);
}

console.log('\n--- the server copy of the maths cannot drift ---');
check('netlify/functions/community-learn/community.js is an exact copy of core/community.js', fs.readFileSync(path.join(__dirname, '..', '..', 'flow-landing', 'netlify', 'functions', 'community-learn', 'community.js'), 'utf8') === fs.readFileSync(path.join(__dirname, '..', 'core', 'community.js'), 'utf8'));
check('community.js never reaches outside the device by itself', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(|\bdocument\.\w|\bwindow\.\w/.test(fs.readFileSync(path.join(__dirname, '..', 'core', 'community.js'), 'utf8')));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
