'use strict';
// int8 JS runtime vs ONNX (float32) on held-out rows: max |Δp| and argmax agreement.
const fs = require('fs'), path = require('path');
const { load } = require('./glance-model.cjs');
const v = process.argv[2] || 'v1';
const M = load(v);
const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', v + '.weights.json'), 'utf8'));
const onnx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', v + '.onnx-probs.json'), 'utf8'));
const rows = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', 'dataset', 'out', 'test.jsonl'), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
let maxd = 0, agree = 0;
for (const o of onnx) {
  const pr = M.predict(rows[o.id]);
  const js = W.classes.map((c) => pr.probs[c.label]);
  js.forEach((p, k) => { maxd = Math.max(maxd, Math.abs(p - o.p[k])); });
  if (js.indexOf(Math.max(...js)) === o.p.indexOf(Math.max(...o.p))) agree++;
}
console.log(JSON.stringify({ variant: v, rows: onnx.length, maxAbsProbDiff: +maxd.toFixed(5), argmaxAgree: agree + '/' + onnx.length }));
