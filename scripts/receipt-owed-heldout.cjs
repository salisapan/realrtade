#!/usr/bin/env node
// Held-out score for core/receipt-owed.js (switch RECEIPT_OWED, off) on glance-ai/eval-data/receipt-owed-heldout-<set>.jsonl.
// Each set is frozen before the code it scores is written or changed; the code is never tuned to a set after it is scored.
// A = today: a paid loop opens no receipt loop (every 'open' is missed) and nothing closes one.
// B = core/receipt-owed.js. Two parts: birth (should a closed payment loop open "a receipt is owed"?) and close
// (does this message prove the receipt reached the payer?).
// Run: node scripts/receipt-owed-heldout.cjs [v0]
const fs = require('fs');
const path = require('path');
const { FlowReceiptOwed: R } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'receipt-owed.js'));
const SET = process.argv[2] || 'v0';
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'receipt-owed-heldout-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const t = {};
const add = (arm, part, lang, k) => { const key = arm + '|' + part + '|' + lang; t[key] = t[key] || { pos: 0, neg: 0, hit: 0, missed: 0, wrong: 0 }; t[key][k]++; };
const notes = [];
rows.forEach((r) => {
  let got;
  if (r.part === 'birth') got = R.owe(Object.assign({ id: r.id, threadId: r.id }, r.loop), { enabled: true, profile: r.profile || null }) ? 'open' : 'none';
  else { const owed = Object.assign({ id: r.id, status: 'open', lang: r.lang }, r.owed); const d = R.judge([owed], r.msg, { enabled: true }); got = d ? d.verdict : 'none'; }
  const pos = r.expect !== 'none';
  ['all', r.lang].forEach((l) => {
    ['A', 'B'].forEach((arm) => add(arm, r.part, l, pos ? 'pos' : 'neg'));
    if (pos) { add('A', r.part, l, 'missed'); add('B', r.part, l, got === r.expect ? 'hit' : 'missed'); }
    else if (got !== 'none') add('B', r.part, l, 'wrong');
  });
  if (got !== r.expect) notes.push(r.id + ' expected ' + r.expect + ', got ' + got);
});
console.log('| part | arm | lang | should n | done | missed | should not n | wrong |');
console.log('|---|---|---|---|---|---|---|---|');
['birth', 'close'].forEach((p) => ['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => {
  const x = t[arm + '|' + p + '|' + l] || { pos: 0, neg: 0, hit: 0, missed: 0, wrong: 0 };
  console.log('| ' + p + ' | ' + arm + ' | ' + l + ' | ' + x.pos + ' | ' + x.hit + ' | ' + x.missed + ' | ' + x.neg + ' | ' + x.wrong + ' |');
})));
console.log('differences from the label:', notes.join('; ') || 'none');
