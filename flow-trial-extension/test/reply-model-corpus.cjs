// The reply-outcome model: it may only HOLD A LOOP OPEN, so what matters is (1) it rarely holds open a real answer, (2) it stops the false
// closes the old assumption made, and (3) it never touches a long substantive reply or a rule-based close.
// The sentences are written by the build-time teacher (scripts/reply/data.py), not by real senders. Run: node test/reply-model-corpus.cjs
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require('../core/reply-model.js').FlowReplyModel;
const F = require('../core/follow-up.js').FlowFollowUp;
const X = require('../core/extract.js').FlowExtract;
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const train = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-train.json'), 'utf8'));
const ev1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-eval.json'), 'utf8'));
const ev2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-eval2.json'), 'utf8'));
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9֐-׿ ]/g, ' ').replace(/\s+/g, ' ').trim();

check('the model is loaded', R.ready());
const trainSet = new Set(train.map((r) => norm(r.t)));
check('no evaluation sentence is in the training data', ev1.concat(ev2).every((r) => !trainSet.has(norm(r.t))), ev1.concat(ev2).filter((r) => trainSet.has(norm(r.t))).map((r) => r.t));
check('the evaluation sets cover both languages and all six kinds', ['en', 'he'].every((l) => R.CLASSES.every((c) => ev1.some((r) => r.lang === l && r.c === c))));

// 1. the decisions the product makes
function decisions(rows) {
  let notN = 0, notOk = 0; const wrong = [];
  rows.forEach((r) => {
    const na = R.notAnAnswer(r.t);
    if (na.p >= 0.9) { notN++; if (r.c !== 'ANSWERED' && r.c !== 'DECLINED' && r.c !== 'HANDBACK') notOk++; else wrong.push([r.c, r.t]); }
  });
  return { notN, notOk, wrong, precision: notN ? notOk / notN : 1 };
}
const d2 = decisions(ev2), d1 = decisions(ev1);
console.log('  confident "not an answer": unseen set n=' + d2.notN + ' precision ' + d2.precision.toFixed(2) + ' | first set n=' + d1.notN + ' precision ' + d1.precision.toFixed(2));
check('on the unseen set, when it holds a loop open it is right at least 88% of the time (and every mistake keeps a loop open, never closes one)', d2.notN >= 15 && d2.precision >= 0.88, d2.wrong);
check('on the first set at least 92%', d1.notN >= 20 && d1.precision >= 0.92, d1.wrong);

// 2. the effect on closing a loop, through the real reply rules
const NOW = new Date(2026, 9, 1, 12).getTime();
const watch = { kind: 'reply', status: 'waiting', direction: 'theirs', what: 'Please confirm the figure', counterpart: { email: 'dana@acme.com' } };
const rows = ev1.concat(ev2);
const closesWith = (useModel) => {
  const saved = R.ready();
  let closes = 0, falseCloses = 0, trueCloses = 0, trueN = 0;
  if (!useModel) R.load(null);
  rows.forEach((r) => {
    const o = F.classifyReply(r.t, watch, { now: NOW, extract: X });
    const real = r.c === 'ANSWERED' || r.c === 'DECLINED';
    if (real) trueN++;
    if (o.outcome === 'closed' || o.outcome === 'declined') { closes++; if (real) trueCloses++; else falseCloses++; }
  });
  if (!useModel) R.load(require('../core/reply-model-weights.js').FlowReplyWeights);
  return { closes, falseCloses, trueCloses, trueN };
};
const before = closesWith(false), after = closesWith(true);
console.log('  without the model: closes ' + before.closes + ', false closes ' + before.falseCloses + ', real answers closed ' + before.trueCloses + '/' + before.trueN);
console.log('  with the model:    closes ' + after.closes + ', false closes ' + after.falseCloses + ', real answers closed ' + after.trueCloses + '/' + after.trueN);
check('it removes at least 60% of the false closes the old assumption made', after.falseCloses <= before.falseCloses * 0.4, [before, after]);
check('and keeps at least 90% of the real answers closing', after.trueCloses >= before.trueCloses * 0.9, [before, after]);
check('it never makes a close more likely: every loop it changes goes from closed to open', after.closes <= before.closes);

// 3. what it must never touch
const long = 'We reviewed the numbers with finance and the vendor can be booked at the lower rate, so go ahead on your side.';
check('a long substantive reply still closes it', F.classifyReply(long, watch, { now: NOW, extract: X }).outcome === 'closed');
check('"Yes, approved." (a rule) still closes it', F.classifyReply('Yes, approved.', watch, { now: NOW, extract: X }).outcome === 'closed');
check('a promised day still moves the day (the rules, not the model)', F.classifyReply("Thanks, I'll get back to you by Friday.", watch, { now: NOW, extract: X }).outcome === 'promised');
const held = F.classifyReply('Still going through the documents, give me a few days.', watch, { now: NOW, extract: X });
check('an interim reply holds the loop open and says why', held.outcome === 'ack' && held.basis === 'model' && /interim/.test(held.why || ''), held);
check('a payment loop is untouched by the model (it already only asks)', F.classifyReply('Alright, thanks.', Object.assign({}, watch, { kind: 'payment' }), { now: NOW, extract: X }).basis !== 'model');
check('with no weights the rules behave exactly as before', (() => { R.load(null); const o = F.classifyReply('Alright, thanks.', watch, { now: NOW, extract: X }); R.load(require('../core/reply-model-weights.js').FlowReplyWeights); return o.basis !== 'model'; })());
console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
