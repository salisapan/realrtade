// The owner-side half of community learning (docs/community-learning.md): turn a round of noisy sketches into a
// signed, canary-checked delta, and verify one. Pure functions; no network; used by aggregate-and-publish.cjs and the tests.
const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const { FlowCommunity: C } = require(path.join(ROOT, 'core', 'community.js'));

// A delta is published only if it does NO HARM on fixed audit sets: precision may not fall by more than
// `maxPrecisionLoss` on any set, and recall may not fall at all on average. The aggregator never trusts itself.
function canary(model, pipeline, sets, entries, opts) {
  const o = opts || {};
  const maxLoss = o.maxPrecisionLoss === undefined ? 0.005 : o.maxPrecisionLoss;
  const measure = () => {
    const out = {};
    for (const [name, set] of Object.entries(sets)) {
      out[name] = {};
      for (const cls of ['ASK', 'PROMISE']) {
        let tp = 0, fp = 0, fn = 0;
        for (const g of set) { const r = pipeline.recognize(g.t); const p = r.unsure ? 'X' : r.act; const w = g.act === cls, h = p === cls; if (w && h) tp++; else if (!w && h) fp++; else if (w && !h) fn++; }
        out[name][cls] = { p: tp + fp ? tp / (tp + fp) : 1, r: tp + fn ? tp / (tp + fn) : 0 };
      }
    }
    return out;
  };
  const saved = model.getCommunity();
  model.setCommunity(null); const before = measure();
  model.setCommunity(entries); const after = measure();
  model.setCommunity(saved);
  let worstPrecision = 0, recallDelta = 0, cells = 0;
  for (const name of Object.keys(before)) for (const cls of ['ASK', 'PROMISE']) {
    worstPrecision = Math.max(worstPrecision, before[name][cls].p - after[name][cls].p);
    recallDelta += after[name][cls].r - before[name][cls].r; cells++;
  }
  recallDelta /= Math.max(cells, 1);
  const pass = worstPrecision <= maxLoss && recallDelta >= 0;
  return { pass, worstPrecisionLoss: Number(worstPrecision.toFixed(4)), meanRecallDelta: Number(recallDelta.toFixed(4)), before, after };
}

// rows: [{ sketch:[...], sigma }] of one round. Returns { ok, reason?, release?, report }.
function buildRelease(rows, opts) {
  const o = opts || {};
  const valid = rows.filter((r) => C.validUpdate({ v: 1, m: C.M, clip: C.CLIP, sigma: r.sigma, sketch: r.sketch }));
  if (valid.length < (o.minCohort === undefined ? C.MIN_COHORT : o.minCohort)) return { ok: false, reason: 'cohort-too-small', report: { received: rows.length, valid: valid.length } };
  const sigma = Math.max.apply(null, valid.map((r) => r.sigma));    // the noisiest device sets the floor, conservatively
  const { mean, n } = C.trimmedMean(valid.map((r) => r.sketch), o.trim || 0);
  const entries = C.decode(mean, n, sigma, o.common, { minCohort: o.minCohort, boost: o.boost || 1 });
  const report = { received: rows.length, valid: valid.length, sigma, published: Object.keys(entries).length };
  if (!report.published) return { ok: false, reason: 'nothing-significant', report };
  let gate = null;
  if (o.model && o.pipeline && o.sets) {
    gate = canary(o.model, o.pipeline, o.sets, entries);
    report.canary = { pass: gate.pass, worstPrecisionLoss: gate.worstPrecisionLoss, meanRecallDelta: gate.meanRecallDelta };
    if (!gate.pass) return { ok: false, reason: 'canary-failed', report };
  }
  const payload = JSON.stringify({ round: o.round || 0, issuedAt: o.now || Date.now(), n, sigma, enabled: true, entries });
  return { ok: true, release: { payload }, report };
}

const signRelease = (payload, privatePem) => crypto.sign('sha256', Buffer.from(payload, 'utf8'), { key: privatePem, dsaEncoding: 'ieee-p1363' }).toString('base64');
function verifyRelease(file, publicJwk) {
  try {
    const key = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
    return crypto.verify('sha256', Buffer.from(file.payload, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(file.sig, 'base64'));
  } catch (e) { return false; }
}

module.exports = { canary, buildRelease, signRelease, verifyRelease };
