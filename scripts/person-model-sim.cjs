#!/usr/bin/env node
// Simulation study for core/person-model.js. There is no real response-time data yet, so this
// asks the narrower, answerable question: IF people's response times are log-normal with
// person-specific parameters (as they are in the model's assumption), does the model
//   1. pick better chase days than a fixed rule as it sees more of a person,
//   2. stay no worse than the fixed rule for a brand-new person (shrinkage works),
//   3. give calibrated probabilities (a "30% chance" happens about 30% of the time),
//   4. gain anything from counting still-open loops as censored observations?
// It does NOT show that real people are log-normal. Run: node scripts/person-model-sim.cjs [--json out]
const fs = require('fs');
const path = require('path');
const { FlowPersonModel: P } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'person-model.js'));
const DAY = 86400000;
let s = 20261003;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const Phiinv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const v = 0.5 * (1 + erf(m / Math.SQRT2)); if (v < p) lo = m; else hi = m; } return (lo + hi) / 2; };
function erf(x) { const sg = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return sg * y; }
const person = () => ({ mu: Math.log(3) + 0.8 * gauss(), sigma: 0.4 + 0.5 * rnd() });
const draw = (p) => Math.exp(p.mu + p.sigma * gauss());
const trueQ = (p, q) => Math.exp(p.mu + p.sigma * Phiinv(q));
const DEFAULT_DAYS = 3;   // "two business days" is about three calendar days

// A history of k earlier loops, one every 3 days, as the store would hold it at `now`.
function history(p, k, now) {
  const out = [];
  for (let j = 0; j < k; j++) {
    const created = now - (k - j) * 3 * DAY - 2 * DAY;
    const T = draw(p) * DAY;
    if (created + T <= now) out.push({ direction: 'theirs', kind: 'reply', counterpart: { email: 'p@x.com' }, status: 'resolved', closedAs: 'replied', createdAt: created, resolvedAt: created + T });
    else out.push({ direction: 'theirs', kind: 'reply', counterpart: { email: 'p@x.com' }, status: 'waiting', createdAt: created });
  }
  return out;
}

const NOW = Date.UTC(2026, 9, 3);
const N = 3000;
const report = { people: N, chase: {}, calibration: [], censoring: {} };

// 1 and 2: chase-day quality. In-window means the chase lands between the person's own 60th and
// 90th percentile of time-to-close: late enough not to nag, early enough to matter.
for (const k of [0, 2, 4, 8, 15]) {
  let fixedIn = 0, modelIn = 0, fixedErr = 0, modelErr = 0, personalised = 0;
  for (let i = 0; i < N; i++) {
    const p = person();
    const h = history(p, k, NOW);
    const sug = P.suggestChaseDays(h, 'p@x.com', 'reply', NOW);
    const model = sug ? sug.days : DEFAULT_DAYS;
    if (sug) personalised++;
    const lo = trueQ(p, 0.6), hi = trueQ(p, 0.9), ref = trueQ(p, 0.75);
    if (DEFAULT_DAYS >= lo && DEFAULT_DAYS <= hi) fixedIn++;
    if (model >= lo && model <= hi) modelIn++;
    fixedErr += Math.abs(Math.log(DEFAULT_DAYS / ref));
    modelErr += Math.abs(Math.log(model / ref));
  }
  report.chase['k=' + k] = { fixedInWindow: +(fixedIn / N).toFixed(3), modelInWindow: +(modelIn / N).toFixed(3), fixedLogErr: +(fixedErr / N).toFixed(3), modelLogErr: +(modelErr / N).toFixed(3), personalisedShare: +(personalised / N).toFixed(3) };
}

// 3: calibration of P(done within h more days | open after a), people with 8 earlier loops.
const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, hit: 0 }));
for (let i = 0; i < N * 3; i++) {
  const p = person();
  const h = history(p, 8, NOW);
  const f = P.model(h, 'p@x.com', 'reply', NOW);
  const age = rnd() * 4, horizon = 0.5 + rnd() * 6;
  const T = draw(p);
  if (T <= age) continue;                                   // the loop was already done: not an open loop at that age
  const pred = P.pWithin(f, age, horizon);
  const b = Math.min(9, Math.floor(pred * 10));
  bins[b].n++; bins[b].p += pred; bins[b].hit += T <= age + horizon ? 1 : 0;
}
report.calibration = bins.map((b, i) => ({ bin: (i / 10).toFixed(1) + '-' + ((i + 1) / 10).toFixed(1), n: b.n, predicted: b.n ? +(b.p / b.n).toFixed(3) : null, observed: b.n ? +(b.hit / b.n).toFixed(3) : null }));
const wsum = report.calibration.reduce((a, b) => a + (b.n ? b.n * Math.abs(b.predicted - b.observed) : 0), 0) / Math.max(1, report.calibration.reduce((a, b) => a + b.n, 0));
report.calibrationError = +wsum.toFixed(3);

// 4: does counting open loops as censored help? Slow people only (median over 6 days), k = 8.
let withErr = 0, withoutErr = 0, cnt = 0;
for (let i = 0; i < N * 3 && cnt < N; i++) {
  const p = person(); if (trueQ(p, 0.5) < 6) continue;
  cnt++;
  const h = history(p, 8, NOW);
  const f1 = P.model(h, 'p@x.com', 'reply', NOW);
  const f2 = P.model(h.filter((w) => w.status === 'resolved'), 'p@x.com', 'reply', NOW);
  const truth = Math.log(trueQ(p, 0.5));
  withErr += Math.abs(f1.mu - truth); withoutErr += Math.abs(f2.mu - truth);
}
report.censoring = { slowPeople: cnt, medianLogErrWithCensoring: +(withErr / cnt).toFixed(3), medianLogErrIgnoringOpenLoops: +(withoutErr / cnt).toFixed(3) };

console.log(JSON.stringify(report, null, 1));
const j = process.argv.indexOf('--json'); if (j > -1) fs.writeFileSync(process.argv[j + 1], JSON.stringify(report, null, 1));
