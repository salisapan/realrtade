#!/usr/bin/env node
// Held-out score for core/refund-chase.js (switch REFUND_CHASE, off) on glance-ai/eval-data/refund-chase-heldout-<set>.jsonl.
// Each set is frozen before the code it scores is written or changed; the code is never tuned to a set after it is scored.
// A = today: core/refund-loop.js due() names why a loop is late but prepares no move and no draft.
// B = core/refund-chase.js plan(). Scored: the right next step; every required fact in the draft; and no invented number
// (every digit run in the draft's subject and body must come from the loop: order, amount, the day asked, the merchant's day).
// Run: node scripts/refund-chase-heldout.cjs [v0]
const fs = require('fs');
const path = require('path');
const { FlowRefundChase: C } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'refund-chase.js'));
const SET = process.argv[2] || 'v0';
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'refund-chase-heldout-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const NOW = new Date('2026-11-15T10:00:00').getTime();   // a Sunday
function allowedDigits(l) {
  const out = new Set();
  const add = (v) => String(v || '').split(/\D+/).filter(Boolean).forEach((d) => { out.add(d); out.add(String(Number(d))); });
  add(l.orderNo); add(l.amount != null ? Number(l.amount).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '');
  add(l.amount); add(l.askedAt); add(l.expectIso);
  return out;
}
const t = {};
const add = (arm, lang, k, n) => { const key = arm + '|' + lang; t[key] = t[key] || { moves: 0, none: 0, right: 0, wrongStep: 0, wrongMove: 0, drafts: 0, factsOk: 0, invented: 0 }; t[key][k] += (n || 1); };
const notes = [];
rows.forEach((r) => {
  const p = C.plan(Object.assign({ id: r.id }, r.loop), { enabled: true, now: NOW });
  const got = p ? p.step : 'none';
  ['all', r.lang].forEach((l) => {
    if (r.expect === 'none') { add('A', l, 'none'); add('B', l, 'none'); if (got !== 'none') add('B', l, 'wrongMove'); return; }
    add('A', l, 'moves'); add('B', l, 'moves');
    if (got === r.expect) add('B', l, 'right'); else add('B', l, 'wrongStep');
    if (p && p.draft) {
      add('B', l, 'drafts');
      const text = p.draft.subject + '\n' + p.draft.body;
      if ((r.must || []).every((m) => text.indexOf(m) >= 0)) add('B', l, 'factsOk');
      const ok = allowedDigits(r.loop);
      const bad = (text.match(/\d+/g) || []).filter((d) => !ok.has(d) && !ok.has(String(Number(d))));
      if (bad.length) { add('B', l, 'invented'); if (l === 'all') notes.push(r.id + ' invented ' + bad.join(',')); }
    }
  });
  if (got !== r.expect) notes.push(r.id + ' expected ' + r.expect + ', got ' + got);
  if (p && p.draft && (r.must || []).some((m) => (p.draft.subject + p.draft.body).indexOf(m) < 0)) notes.push(r.id + ' missing ' + r.must.filter((m) => (p.draft.subject + p.draft.body).indexOf(m) < 0).join(','));
});
console.log('| arm | lang | moves due n | right step | wrong step | nothing due n | wrong move | drafts | all facts | invented number |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => { const x = t[arm + '|' + l]; console.log('| ' + arm + ' | ' + l + ' | ' + x.moves + ' | ' + x.right + ' | ' + (arm === 'A' ? x.moves : x.wrongStep) + ' | ' + x.none + ' | ' + x.wrongMove + ' | ' + x.drafts + ' | ' + x.factsOk + ' | ' + x.invented + ' |'); }));
console.log('differences from the label:', notes.join('; ') || 'none');
