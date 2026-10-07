'use strict';
// JS int8 runtime vs the python (float) pipeline predictions on the v2 test set.
const fs = require('fs'), path = require('path');
const { make } = require('./glance-close-v2.cjs');
const D = make('v2');
const preds = new Map(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'v2.test-preds.jsonl'), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const rows = fs.readFileSync(path.join(__dirname, '..', 'dataset', 'out-v2', 'test.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
let n = 0, same = 0, maxd = 0; const diffs = [];
for (const r of rows) {
  const py = preds.get(r.id); if (!py) continue;
  const js = D.decide(r); n++;
  if (js.label === py.pred) same++; else if (diffs.length < 5) diffs.push({ id: r.id, js: js.label, py: py.pred, pjs: js.pShow, ppy: py.p });
  maxd = Math.max(maxd, Math.abs(js.pShow - py.p));
}
console.log(JSON.stringify({ n, sameDecision: same, rate: same / n, maxAbsGateDiff: maxd, diffs }, null, 1));
