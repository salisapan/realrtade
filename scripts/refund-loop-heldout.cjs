#!/usr/bin/env node
// Held-out score for core/refund-loop.js (switch REFUND_LOOP, off) on glance-ai/eval-data/refund-loop-heldout-<set>.jsonl.
// Each set is frozen before the code it scores is written or changed; the code is never tuned to a set after it is scored.
// A = today: the ask goes through core/follow-up.js classifyOutgoing (any loop it opens counts as 'open'); with no loop,
// there is no stage for a reply and nothing to close. B = core/refund-loop.js.
// Run: node scripts/refund-loop-heldout.cjs [v0]
const fs = require('fs');
const path = require('path');
const core = (f) => path.join(__dirname, '..', 'flow-trial-extension', 'core', f);
const { FlowRefundLoop: R } = require(core('refund-loop.js'));
const { FlowFollowUp: F } = require(core('follow-up.js'));
const SET = process.argv[2] || 'v0';
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'refund-loop-heldout-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ON = { enabled: true };
const NOW = new Date('2026-11-08T10:00:00').getTime();
const t = {};
const add = (arm, part, lang, k) => { const key = arm + '|' + part + '|' + lang; t[key] = t[key] || { pos: 0, neg: 0, hit: 0, missed: 0, wrong: 0 }; t[key][k]++; };
const notes = [];
rows.forEach((r) => {
  let a, b;
  if (r.part === 'ask') {
    a = F.classifyOutgoing(r.text, { now: NOW, to: r.to }) ? 'open' : 'none';
    b = R.ask(r.text, Object.assign({ to: r.to, toName: r.toName, now: NOW }, ON)) ? 'open' : 'none';
  } else if (r.part === 'reply') {
    a = 'none';
    const st = R.reply({ id: r.id, status: 'open', stage: 'asked' }, r.text, Object.assign({ now: NOW }, ON));
    b = st ? st.stage : 'none';
  } else {
    a = 'none';
    const loop = Object.assign({ id: r.id, status: 'open', stage: 'asked' }, r.loop);
    const d = R.judge([loop], r.msg, ON);
    b = d && d.verdict !== 'partial' ? d.verdict : 'none';                        // a part counted is not a close
  }
  const pos = r.expect !== 'none';
  ['all', r.lang].forEach((l) => {
    add('A', r.part, l, pos ? 'pos' : 'neg'); add('B', r.part, l, pos ? 'pos' : 'neg');
    if (pos) { add('A', r.part, l, a === r.expect ? 'hit' : 'missed'); add('B', r.part, l, b === r.expect ? 'hit' : 'missed'); }
    else { if (a !== 'none') add('A', r.part, l, 'wrong'); if (b !== 'none') add('B', r.part, l, 'wrong'); }
  });
  if (b !== r.expect) notes.push(r.id + ' expected ' + r.expect + ', got ' + b);
});
console.log('| part | arm | lang | should n | right | missed or wrong kind | should not n | wrong |');
console.log('|---|---|---|---|---|---|---|---|');
['ask', 'reply', 'close'].forEach((p) => ['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => {
  const x = t[arm + '|' + p + '|' + l] || { pos: 0, neg: 0, hit: 0, missed: 0, wrong: 0 };
  console.log('| ' + p + ' | ' + arm + ' | ' + l + ' | ' + x.pos + ' | ' + x.hit + ' | ' + x.missed + ' | ' + x.neg + ' | ' + x.wrong + ' |');
})));
console.log('differences from the label (B):', notes.join('; ') || 'none');
