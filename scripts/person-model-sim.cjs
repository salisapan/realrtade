#!/usr/bin/env node
// Simulation study for core/person-model.js. There is no real response-time data yet, so this asks the narrower,
// answerable questions. IF people's response times (in business days) are log-normal with person-specific parameters,
//   1. does the model pick better chase days than a fixed rule as it sees more of a person, and no worse for a new person?
//   2. are its probabilities calibrated?
//   3. does counting still-open loops as censored observations help?
//   4. does counting BUSINESS days (weekends are not slowness) beat counting calendar days?
//   5. does partial pooling by organisation help a brand-new person at a company Glance already knows?
// It does NOT show that real people are log-normal. Run: node scripts/person-model-sim.cjs [--json out]
const fs = require('fs');
const path = require('path');
const { FlowPersonModel: P } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'person-model.js'));
const DAY = 86400000;
let s = 20261003;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
function erf(x) { const sg = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return sg * y; }
const Phiinv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (0.5 * (1 + erf(m / Math.SQRT2)) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
const trueQ = (p, q) => Math.exp(p.mu + p.sigma * Phiinv(q));
const draw = (p) => Math.exp(p.mu + p.sigma * gauss());
const person = (mu0) => ({ mu: (mu0 === undefined ? Math.log(2) : mu0) + 0.8 * gauss() * (mu0 === undefined ? 1 : 0.6), sigma: 0.4 + 0.5 * rnd() });

// Business time -> a calendar instant: skip weekends.
function addBiz(startMs, bd) {
  let t = startMs, left = bd;
  for (let i = 0; i < 2000 && left > 0; i++) {
    const d = new Date(t);
    if (d.getDay() === 0 || d.getDay() === 6) { t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); continue; }
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const room = (nextMidnight - t) / DAY;
    if (left <= room) { t += left * DAY; left = 0; } else { left -= room; t = nextMidnight; }
  }
  return t;
}
const NOW = new Date(2026, 9, 5, 12).getTime();   // a Monday noon
const loop = (email, createdOffsetDays, T, now) => {
  const created = now - createdOffsetDays * DAY;
  const resolved = addBiz(created, T);
  return resolved <= now ? { direction: 'theirs', kind: 'reply', counterpart: { email }, status: 'resolved', closedAs: 'replied', createdAt: created, resolvedAt: resolved } : { direction: 'theirs', kind: 'reply', counterpart: { email }, status: 'waiting', createdAt: created };
};
function history(p, email, k, now) { const out = []; for (let j = 0; j < k; j++) out.push(loop(email, (k - j) * 3 + 2, draw(p), now)); return out; }

const N = 3000;
const report = { people: N, chase: {}, calibration: [], censoring: {}, businessClock: {}, pooling: {} };
const DEFAULT_BD = 2;   // the fixed rule: two business days

for (const k of [0, 2, 4, 8, 15]) {
  let fixedIn = 0, modelIn = 0, fixedErr = 0, modelErr = 0, personalised = 0;
  for (let i = 0; i < N; i++) {
    const p = person(), h = history(p, 'p@x.com', k, NOW);
    const sug = P.suggestChaseDays(h, 'p@x.com', 'reply', NOW);
    const model = sug ? sug.days : DEFAULT_BD; if (sug) personalised++;
    const lo = trueQ(p, 0.6), hi = trueQ(p, 0.9), ref = trueQ(p, 0.75);
    if (DEFAULT_BD >= lo && DEFAULT_BD <= hi) fixedIn++;
    if (model >= lo && model <= hi) modelIn++;
    fixedErr += Math.abs(Math.log(DEFAULT_BD / ref)); modelErr += Math.abs(Math.log(model / ref));
  }
  report.chase['k=' + k] = { fixedInWindow: +(fixedIn / N).toFixed(3), modelInWindow: +(modelIn / N).toFixed(3), fixedLogErr: +(fixedErr / N).toFixed(3), modelLogErr: +(modelErr / N).toFixed(3), personalisedShare: +(personalised / N).toFixed(3) };
}

const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, hit: 0 }));
for (let i = 0; i < N * 3; i++) {
  const p = person(), h = history(p, 'p@x.com', 8, NOW), f = P.model(h, 'p@x.com', 'reply', NOW);
  const age = rnd() * 4, horizon = 0.5 + rnd() * 6, T = draw(p);
  if (T <= age) continue;
  const pred = P.pWithin(f, age, horizon), b = Math.min(9, Math.floor(pred * 10));
  bins[b].n++; bins[b].p += pred; bins[b].hit += T <= age + horizon ? 1 : 0;
}
report.calibration = bins.map((b, i) => ({ bin: (i / 10).toFixed(1) + '-' + ((i + 1) / 10).toFixed(1), n: b.n, predicted: b.n ? +(b.p / b.n).toFixed(3) : null, observed: b.n ? +(b.hit / b.n).toFixed(3) : null }));
report.calibrationError = +(report.calibration.reduce((a, b) => a + (b.n ? b.n * Math.abs(b.predicted - b.observed) : 0), 0) / Math.max(1, report.calibration.reduce((a, b) => a + b.n, 0))).toFixed(3);

{ let withErr = 0, withoutErr = 0, cnt = 0;
  for (let i = 0; i < N * 3 && cnt < N; i++) {
    const p = person(); if (trueQ(p, 0.5) < 4) continue; cnt++;
    const h = history(p, 'p@x.com', 8, NOW);
    const f1 = P.model(h, 'p@x.com', 'reply', NOW), f2 = P.model(h.filter((w) => w.status === 'resolved'), 'p@x.com', 'reply', NOW);
    const truth = Math.log(trueQ(p, 0.5)); withErr += Math.abs(f1.mu - truth); withoutErr += Math.abs(f2.mu - truth);
  }
  report.censoring = { slowPeople: cnt, logErrWithCensoring: +(withErr / cnt).toFixed(3), logErrIgnoringOpenLoops: +(withoutErr / cnt).toFixed(3) }; }

// 4. Business clock versus calendar clock. Truth is in business days; weekends make calendar durations noisier.
{ let bizErr = 0, calErr = 0;
  for (let i = 0; i < N; i++) {
    const p = person(), h = history(p, 'p@x.com', 8, NOW), truth = Math.log(trueQ(p, 0.5));
    P.setClock('business'); const fb = P.model(h, 'p@x.com', 'reply', NOW);
    P.setClock('calendar'); const fc = P.model(h, 'p@x.com', 'reply', NOW);
    P.setClock('business');
    bizErr += Math.abs(fb.mu - truth);
    // The calendar fit is in calendar days; convert the truth to the same scale (7 calendar days per 5 business days).
    calErr += Math.abs(fc.mu - (truth + Math.log(7 / 5)));
  }
  report.businessClock = { medianLogErrBusinessClock: +(bizErr / N).toFixed(3), medianLogErrCalendarClock: +(calErr / N).toFixed(3), note: 'calendar error is measured against the truth rescaled by 7/5, the most favourable conversion' }; }

// 5. Partial pooling: companies share a habit (company effect), people deviate from it.
{ const rows = {};
  for (const k of [0, 1, 2]) {
    let pooledIn = 0, plainIn = 0, pooledErr = 0, plainErr = 0;
    for (let i = 0; i < N; i++) {
      const companyMu = Math.log(2) + 0.7 * gauss();
      const colleagues = [0, 1, 2].map((c) => ({ email: 'c' + c + '@corp.com', p: { mu: companyMu + 0.3 * gauss(), sigma: 0.4 + 0.4 * rnd() } }));
      const me = { email: 'new@corp.com', p: { mu: companyMu + 0.3 * gauss(), sigma: 0.4 + 0.4 * rnd() } };
      const h = [];
      colleagues.forEach((c) => h.push.apply(h, history(c.p, c.email, 5, NOW)));
      h.push.apply(h, history(me.p, me.email, k, NOW));
      const lo = trueQ(me.p, 0.6), hi = trueQ(me.p, 0.9), ref = trueQ(me.p, 0.75);
      const pooled = P.suggestChaseDays(h, me.email, 'reply', NOW);
      const plainHist = h.map((w) => w); const plain = P.suggestChaseDays(plainHist.filter((w) => w.counterpart.email === me.email), me.email, 'reply', NOW);
      const pd = pooled ? pooled.days : DEFAULT_BD, qd = plain ? plain.days : DEFAULT_BD;
      if (pd >= lo && pd <= hi) pooledIn++; if (qd >= lo && qd <= hi) plainIn++;
      pooledErr += Math.abs(Math.log(pd / ref)); plainErr += Math.abs(Math.log(qd / ref));
    }
    rows['ownCloses=' + k] = { pooledInWindow: +(pooledIn / N).toFixed(3), unpooledInWindow: +(plainIn / N).toFixed(3), pooledLogErr: +(pooledErr / N).toFixed(3), unpooledLogErr: +(plainErr / N).toFixed(3) };
  }
  report.pooling = rows; }

console.log(JSON.stringify(report, null, 1));
const j = process.argv.indexOf('--json'); if (j > -1) fs.writeFileSync(process.argv[j + 1], JSON.stringify(report, null, 1));
