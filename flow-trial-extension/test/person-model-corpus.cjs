// The per-person response-time model (core/person-model.js): what it learns, how it shrinks,
// what it ignores, and how the product uses it. Plus a small simulation guard (the full
// study is scripts/person-model-sim.cjs). Run: node test/person-model-corpus.cjs
const fs = require('fs'), path = require('path');
const { FlowPersonModel: P } = require('../core/person-model.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const D = 86400000;
const NOW = new Date('2026-10-05T12:00:00').getTime();   // a Monday
const closed = (days, over) => Object.assign({ direction: 'theirs', kind: 'reply', counterpart: { email: 'a@x.com' }, status: 'resolved', closedAs: 'replied', createdAt: NOW - 90 * D, resolvedAt: NOW - 90 * D + days * D }, over || {});
const open = (ageDays, over) => Object.assign({ direction: 'theirs', kind: 'reply', counterpart: { email: 'a@x.com' }, status: 'waiting', createdAt: NOW - ageDays * D }, over || {});
const fast = [1, 2, 1, 1.5, 2].map((d) => closed(d));
const slow = [6, 8, 5, 9, 7].map((d) => closed(d));

console.log('\n--- a new person behaves exactly as before ---');
check('no history: no personal suggestion (the default stays)', P.suggestChaseDays([], 'a@x.com', 'reply', NOW) === null);
check('one close is not enough to personalise', P.suggestChaseDays([closed(20)], 'a@x.com', 'reply', NOW) === null);
check('unknown person (no email): nothing', P.suggestChaseDays(slow, '', 'reply', NOW) === null);
check('a new person starts from the population prior, not from nothing', (() => { const f = P.model([], 'a@x.com', 'reply', NOW); return f.level === 'prior' && Math.abs(Math.exp(f.mu) - 2) < 0.01; })());

console.log('\n--- it learns that people differ ---');
{
  const f = P.suggestChaseDays(fast, 'a@x.com', 'reply', NOW), s = P.suggestChaseDays(slow, 'a@x.com', 'reply', NOW);
  check('a fast replier gets an early look', f && f.days <= 3 && f.typical < 2.5, f);
  check('a slow replier gets a late look', s && s.days >= 5 && s.typical > 3, s);
  check('they are different by a wide margin', s.days >= 2.5 * f.days, [f.days, s.days]);
  check('personal level only from three real closes', P.model(fast, 'a@x.com', 'reply', NOW).level === 'personal' && P.model(fast.slice(0, 2), 'a@x.com', 'reply', NOW).level === 'learning');
}
console.log('\n--- it shrinks: little data does not mean extreme conclusions ---');
{
  const two = P.suggestChaseDays([closed(20), closed(20)], 'a@x.com', 'reply', NOW);
  const many = P.suggestChaseDays(Array.from({ length: 10 }, () => closed(20)), 'a@x.com', 'reply', NOW);
  check('two 20-day closes are pulled toward the typical, ten are not', two.days < many.days && many.days >= 13, [two.days, many.days]);
}
console.log('\n--- open loops are evidence too (right-censoring) ---');
{
  const base = [4, 5, 6].map((d) => closed(d));
  const withOpen = base.concat([open(25), open(30)]);
  const a = P.model(base, 'a@x.com', 'reply', NOW), b = P.model(withOpen, 'a@x.com', 'reply', NOW);
  check('loops still open after 25 and 30 days push the typical time up', Math.exp(b.mu) > Math.exp(a.mu) * 1.3, [Math.exp(a.mu), Math.exp(b.mu)]);
  check('a loop open under a day says nothing yet', Math.abs(P.model(base.concat([open(0.4)]), 'a@x.com', 'reply', NOW).mu - a.mu) < 1e-9);
  check('an abandoned loop (older than 120 days) is not counted as "slow"', Math.abs(P.model(base.concat([open(200)]), 'a@x.com', 'reply', NOW).mu - a.mu) < 1e-9);
}
console.log('\n--- what it ignores ---');
{
  const ignoredNoise = fast.concat([closed(40, { closedAs: 'manual' }), closed(40, { direction: 'mine' }), closed(40, { direction: 'clock' }), closed(40, { counterpart: { email: 'b@x.com' } }), closed(40, { kind: 'payment' }), closed(40, { resolvedAt: NOW - 95 * D })]);
  check('hand-closed, your own promises, expiries, other people, other kinds and impossible times do not move the fit', Math.abs(P.model(ignoredNoise, 'a@x.com', 'reply', NOW).mu - P.model(fast, 'a@x.com', 'reply', NOW).mu) < 1e-9);
  check('the email match is case-insensitive', P.model(fast, 'A@X.COM', 'reply', NOW).n === 5);
  check('payments learn separately from replies', P.model(fast.map((w) => Object.assign({}, w, { kind: 'payment' })), 'a@x.com', 'payment', NOW).n === 5 && P.model(fast.map((w) => Object.assign({}, w, { kind: 'payment' })), 'a@x.com', 'reply', NOW).n === 0);
  check('a declined loop (they said no) counts as a real close in time', P.model([closed(2, { closedAs: 'declined' }), closed(3), closed(2)], 'a@x.com', 'reply', NOW).n === 3);
}
console.log('\n--- time is counted in business days ---');
{
  const fri = new Date('2026-10-02T12:00:00').getTime(), mon = new Date('2026-10-05T12:00:00').getTime(), sat = new Date('2026-10-03T12:00:00').getTime(), sun = new Date('2026-10-04T12:00:00').getTime();
  check('Friday noon to Monday noon is one business day, not three', Math.abs(P.bizDays(fri, mon) - 1) < 1e-9, P.bizDays(fri, mon));
  check('a weekend is zero', P.bizDays(sat, sun) === 0);
  check('Monday to Thursday is three', Math.abs(P.bizDays(mon, mon + 3 * D) - 3) < 1e-9);
  check('going backwards or standing still is zero', P.bizDays(mon, fri) === 0 && P.bizDays(mon, mon) === 0);
  const friAsk = closed(0, { createdAt: fri, resolvedAt: mon }), thuAsk = closed(0, { createdAt: new Date('2026-09-24T12:00:00').getTime(), resolvedAt: new Date('2026-09-25T12:00:00').getTime() });
  check('a Friday ask answered on Monday is as fast as a Thursday ask answered on Friday', Math.abs(P.observe([friAsk], 'a@x.com', 'reply', mon + D).events[0] - P.observe([thuAsk], 'a@x.com', 'reply', mon + D).events[0]) < 1e-9);
}
console.log('\n--- colleagues: partial pooling by organisation ---');
{
  const mk = (email, days) => days.map((d) => closed(d, { counterpart: { email } }));
  const corpSlow = mk('a@corp.com', [8, 9, 10, 8, 9]).concat(mk('b@corp.com', [9, 10, 8, 9, 10]));
  const sug = P.suggestChaseDays(corpSlow, 'new@corp.com', 'reply', NOW);
  check('a brand-new person at a slow company starts from their colleagues, not from the population', sug && sug.level === 'colleagues' && sug.days > 3, sug);
  check('without colleagues the new person stays on the default', P.suggestChaseDays(mk('a@corp.com', [8, 9, 10, 8, 9]), 'new@corp.com', 'reply', NOW) === null);
  check('a free-mail domain is never pooled: strangers, not colleagues', P.suggestChaseDays(mk('a@gmail.com', [8, 9, 10]).concat(mk('b@gmail.com', [9, 10, 8])), 'new@gmail.com', 'reply', NOW) === null);
  check('a different company is not a colleague', P.suggestChaseDays(corpSlow, 'new@other.com', 'reply', NOW) === null);
  check('colleagues are used only until the person has their own data', (() => { const own = mk('new@corp.com', [1, 1, 1, 1, 1, 1, 1]); const f = P.model(corpSlow.concat(own), 'new@corp.com', 'reply', NOW); return f.n >= 6 && !f.pooled && Math.exp(f.mu) < 2; })());
  check('one real close of their own still leans on the colleagues but moves toward the person', (() => { const a = P.model(corpSlow, 'new@corp.com', 'reply', NOW), b = P.model(corpSlow.concat(mk('new@corp.com', [1])), 'new@corp.com', 'reply', NOW); return b.mu < a.mu && b.pooled; })());
  check('their own closes never leak into the colleagues\' prior', (() => { const own = mk('a@corp.com', [1, 1, 1, 1, 1]); const f = P.domainPrior(corpSlow.concat(own).filter((w) => w.counterpart.email !== 'b@corp.com'), 'a@corp.com', 'reply', NOW); return f === null; })());
  check('domainOf', P.domainOf('Dana@Acme.com') === 'acme.com' && P.domainOf('x@gmail.com') === null && P.domainOf('') === null);
}

console.log('\n--- forecasts ---');
{
  const f = P.model(slow, 'a@x.com', 'reply', NOW);
  check('more days, more probability', P.pWithin(f, 1, 2) < P.pWithin(f, 1, 6) && P.pWithin(f, 1, 6) < P.pWithin(f, 1, 20));
  check('probabilities stay inside [0,1]', [0, 1, 5, 50, 500].every((a) => [0.1, 1, 10, 100].every((h) => { const p = P.pWithin(f, a, h); return p >= 0 && p <= 1; })));
  check('the longer a slow person has already taken, the longer the remaining median (heavy tail)', P.remainingMedian(f, 12) > P.remainingMedian(f, 1) * 0.8);
}
console.log('\n--- risk: which loops will likely miss their date ---');
{
  const iso = (n) => { const d = new Date(NOW + n * D); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const loop = (over) => Object.assign(open(1, { deadlineIso: iso(1) }), over || {});
  const r1 = P.risk(slow, loop(), NOW), r2 = P.risk(fast, loop(), NOW);
  check('a slow person with a date tomorrow is likely to slip', r1 && r1.slip === true && r1.typical > 3, r1);
  check('a fast person with the same date is not', r2 && r2.slip === false && r2.pOnTime > 0.6, r2);
  check('without personal evidence there is no claim', P.risk(fast.slice(0, 2), loop(), NOW) === null);
  check('without a date there is nothing to slip', P.risk(slow, open(1), NOW) === null);
  check('a date already passed is the deadline label, not a forecast', P.risk(slow, loop({ deadlineIso: iso(-2) }), NOW) === null);
  check('your own promise is not a prediction about them', P.risk(slow, loop({ direction: 'mine' }), NOW) === null);
  check('a closed loop is not at risk', P.risk(slow, loop({ status: 'resolved' }), NOW) === null);
  const slowPay = slow.map((w) => Object.assign({}, w, { kind: 'payment' }));
  const sum = F.summarize(slowPay.concat([loop({ id: 'x', kind: 'payment', amount: { value: 4200, currency: 'ILS' } })]), NOW);
  check('the summary counts loops at risk and the money on them', sum.atRisk === 1 && sum.moneyAtRisk[0].value === 4200, sum);
  check('with no history the summary claims nothing', F.summarize([open(1, { deadlineIso: iso(1) })], NOW).atRisk === 0);
}
console.log('\n--- how the product uses it ---');
{
  const ask = { direction: 'theirs', kind: 'reply', chaseIso: '2026-10-07', deadlineIso: null };
  const p = F.personalChase(ask, slow, 'a@x.com', NOW);
  check('a new loop with a slow person is looked at later', p.chaseIso > '2026-10-12' && p.personal && p.personal.n === 5, p);
  check('it lands on a weekday', (() => { const d = new Date(p.chaseIso + 'T12:00:00').getDay(); return d !== 0 && d !== 6; })(), p.chaseIso);
  check('a fast person is looked at sooner than a slow one', F.personalChase(ask, fast, 'a@x.com', NOW).chaseIso < p.chaseIso);
  check('a stated deadline always wins', F.personalChase(Object.assign({}, ask, { deadlineIso: '2026-10-09' }), slow, 'a@x.com', NOW).chaseIso === '2026-10-07');
  check('a new person keeps the default (same object back)', F.personalChase(ask, [], 'a@x.com', NOW) === ask);
  check('your own promises are never personalised', F.personalChase(Object.assign({}, ask, { direction: 'mine' }), slow, 'a@x.com', NOW).chaseIso === '2026-10-07');
  const w = open(2, { nudges: 0, stage: 'waiting' });
  check('after a chase, the next look uses the person (slow: later than the default)', F.recordNudge(w, NOW, slow).chaseIso > F.recordNudge(w, NOW).chaseIso, [F.recordNudge(w, NOW, slow).chaseIso, F.recordNudge(w, NOW).chaseIso]);
  check('after a chase with no history: exactly the default', F.recordNudge(w, NOW, []).chaseIso === F.recordNudge(w, NOW).chaseIso);
  check('the stage is still nudged and the count rises', F.recordNudge(w, NOW, slow).stage === 'nudged' && F.recordNudge(w, NOW, slow).nudges === 1);
}

console.log('\n--- simulation guard (full study: scripts/person-model-sim.cjs) ---');
{
  let s = 777;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const person = () => ({ mu: Math.log(2) + 0.8 * gauss(), sigma: 0.4 + 0.5 * rnd() });
  const erf = (x) => { const sg = x < 0 ? -1 : 1, ax = Math.abs(x), t = 1 / (1 + 0.3275911 * ax); return sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)); };
  const Phiinv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (0.5 * (1 + erf(m / Math.SQRT2)) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  const trueQ = (p, q) => Math.exp(p.mu + p.sigma * Phiinv(q));
  const addBiz = (start, bd) => { let t = start, left = bd; for (let i = 0; i < 2000 && left > 0; i++) { const d = new Date(t); if (d.getDay() === 0 || d.getDay() === 6) { t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); continue; } const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); const room = (nm - t) / D; if (left <= room) { t += left * D; left = 0; } else { left -= room; t = nm; } } return t; };
  let fixedIn = 0, modelIn = 0, new0 = 0, N = 500;
  for (let i = 0; i < N; i++) {
    const p = person(); const hist = [];
    for (let j = 0; j < 8; j++) { const created = NOW - ((8 - j) * 3 + 2) * D; const resolved = addBiz(created, Math.exp(p.mu + p.sigma * gauss())); hist.push(resolved <= NOW ? closed(0, { createdAt: created, resolvedAt: resolved }) : open(0, { createdAt: created })); }
    const lo = trueQ(p, 0.6), hi = trueQ(p, 0.9), sug = P.suggestChaseDays(hist, 'a@x.com', 'reply', NOW), m = sug ? sug.days : 2;
    if (2 >= lo && 2 <= hi) fixedIn++;
    if (m >= lo && m <= hi) modelIn++;
    if (P.suggestChaseDays([], 'a@x.com', 'reply', NOW) === null) new0++;
  }
  check('after eight loops with a person the chase day is in their own sensible window at least twice as often as the fixed rule', modelIn >= 2 * fixedIn, [fixedIn / N, modelIn / N]);
  check('with no history it is the fixed rule for everyone', new0 === N);
}

console.log('\n--- no external reach ---');
check('person-model.js never reaches outside the device', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(|\bdocument\.\w|\bwindow\.\w/.test(fs.readFileSync(path.join(__dirname, '..', 'core', 'person-model.js'), 'utf8')));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
