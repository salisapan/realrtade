'use strict';
// v2.1 JS int8 runtime vs the python (float) pipeline predictions on the v2 held-out test.
const fs = require('fs'), path = require('path');
const { make } = require('./glance-close-v21.cjs');
const D = make('v21');
const preds = new Map(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'v21.test-preds.jsonl'), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const rows = fs.readFileSync(path.join(__dirname, '..', 'dataset', 'out-v2', 'test.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
let n = 0, same = 0, maxd = 0; const diffs = [];
for (const r of rows) {
  const py = preds.get(r.id); if (!py) continue;
  const js = D.decide(r); n++;
  if (js.label === py.pred) same++; else if (diffs.length < 5) diffs.push({ id: r.id, js: js.label, py: py.pred, pjs: js.pShow, ppy: py.p });
  maxd = Math.max(maxd, Math.abs(js.pShow - py.p));
}
console.log(JSON.stringify({ n, sameDecision: same, rate: same / n, maxAbsGateDiff: maxd, diffs }, null, 1));
