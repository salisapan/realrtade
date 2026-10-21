#!/usr/bin/env node
// Held-out score for core/outside-signals.js invoiceLoop (switch CARRY.invoices, off), on glance-ai/eval-data/invoice-loop-heldout-v0.jsonl.
// Each file was written and frozen before the code it scores was changed; the code is never tuned to a set after it is scored. A = today's follow loop
// (core/follow-up.js classifyOutgoing), B = A, then invoiceLoop when A opens nothing. Run: node scripts/invoice-loop-heldout.cjs [v0|v1]
const fs = require('fs');
const path = require('path');
const EXT = path.join(__dirname, '..', 'flow-trial-extension', 'core');
const { FlowExtract } = require(path.join(EXT, 'extract.js'));
const { FlowRequestTypes } = require(path.join(EXT, 'request-types.js'));
const { FlowIntentPipeline } = require(path.join(EXT, 'intent-pipeline.js'));
const { FlowFollowUp: F } = require(path.join(EXT, 'follow-up.js'));
const { FlowOutsideSignals: S } = require(path.join(EXT, 'outside-signals.js'));
const NOW = new Date('2026-10-18T10:00:00').getTime();
const ctx = { now: NOW, extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline };
const SET = process.argv[2] || 'v0';   // v0: frozen 2026-10-18 before the first scorer run; v1: frozen 2026-10-20 before the v0-error fixes
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'invoice-loop-heldout-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const t = {};
const add = (arm, lang, k) => { const key = arm + '|' + lang; t[key] = t[key] || { owed: 0, notOwed: 0, opened: 0, missed: 0, wrongLoop: 0, wrongAmount: 0 }; t[key][k]++; };
const misses = [], wrong = [];
rows.forEach((r) => {
  const a = F.classifyOutgoing(r.text, ctx);
  const b = a || S.invoiceLoop(r.text, { enabled: true, now: NOW });
  [['A', a], ['B', b]].forEach(([arm, got]) => ['all', r.lang].forEach((l) => {
    add(arm, l, r.owed ? 'owed' : 'notOwed');
    if (r.owed) { if (got) { add(arm, l, 'opened'); if (!got.amount || Math.abs(got.amount.value - r.amount) > 0.01) add(arm, l, 'wrongAmount'); } else add(arm, l, 'missed'); }
    else if (got) add(arm, l, 'wrongLoop');
  }));
  if (r.owed && !b) misses.push(r.id);
  if (!r.owed && b) wrong.push(r.id + (a ? ' (today too)' : ' (B only)'));
  if (r.owed && b && Math.abs(b.amount.value - r.amount) > 0.01) wrong.push(r.id + ' amount ' + b.amount.value + ' vs ' + r.amount);
});
console.log('| arm | lang | owed (n) | loop opened | missed | not owed (n) | wrong loop | wrong amount |');
console.log('|---|---|---|---|---|---|---|---|');
['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => { const x = t[arm + '|' + l]; console.log('| ' + arm + ' | ' + l + ' | ' + x.owed + ' | ' + x.opened + ' | ' + x.missed + ' | ' + x.notOwed + ' | ' + x.wrongLoop + ' | ' + x.wrongAmount + ' |'); }));
console.log('B missed:', misses.join(', ') || 'none');
console.log('B wrong:', wrong.join(', ') || 'none');
