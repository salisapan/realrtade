#!/usr/bin/env node
// Held-out score for core/bill-paid.js (switch BILL_PAID, off) on glance-ai/eval-data/bill-paid-heldout-<set>.jsonl.
// Each set is frozen before the code it scores is written or changed; the code is never tuned to a set after it is scored.
// A = today (a Pay task is never closed by a payment signal: every case stays open). B = core/bill-paid.js.
// Run: node scripts/bill-paid-heldout.cjs [v0]
const fs = require('fs');
const path = require('path');
const { FlowBillPaid: B } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'bill-paid.js'));
const SET = process.argv[2] || 'v0';
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'bill-paid-heldout-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const t = {};
const add = (arm, lang, k) => { const key = arm + '|' + lang; t[key] = t[key] || { paid: 0, notPaid: 0, closed: 0, asked: 0, missed: 0, wrongClose: 0, wrongAsk: 0 }; t[key][k]++; };
const notes = [];
rows.forEach((r) => {
  const bill = Object.assign({ id: r.id, status: 'open' }, r.bill);
  const d = B.judge([bill], r.msg, { enabled: true });
  const got = d ? d.verdict : 'none';
  const shouldPay = r.expect !== 'none';
  ['all', r.lang].forEach((l) => {
    ['A', 'B'].forEach((arm) => add(arm, l, shouldPay ? 'paid' : 'notPaid'));
    if (shouldPay) add('A', l, 'missed');
    if (shouldPay) { if (got === 'close') add('B', l, 'closed'); else if (got === 'ask') add('B', l, 'asked'); else add('B', l, 'missed'); }
    else { if (got === 'close') add('B', l, 'wrongClose'); if (got === 'ask') add('B', l, 'wrongAsk'); }
  });
  if (got !== r.expect) notes.push(r.id + ' expected ' + r.expect + ', got ' + got);
});
console.log('| arm | lang | paid n | closed with proof | asked once | missed | not paid n | wrong close | wrong ask |');
console.log('|---|---|---|---|---|---|---|---|---|');
['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => { const x = t[arm + '|' + l]; console.log('| ' + arm + ' | ' + l + ' | ' + x.paid + ' | ' + x.closed + ' | ' + x.asked + ' | ' + x.missed + ' | ' + x.notPaid + ' | ' + x.wrongClose + ' | ' + x.wrongAsk + ' |'); }));
console.log('differences from the label:', notes.join('; ') || 'none');
