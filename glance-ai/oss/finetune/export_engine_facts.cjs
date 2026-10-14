'use strict';
// For every v2 train/val row (and the OSS eval rows): engine 0.9.35 own text (quote-stripped, normalized) + engine date.
// The SFT target's "due" is the ENGINE date (the runtime never trusts an LLM date). Read-only on model/.
const fs = require('fs'), path = require('path');
const { analyze } = require('../shadow-combined/engine-plus.cjs');
const { ROOT: AI } = require('../../paths.cjs');
const D = process.env.GLANCE_V2_DATASET || path.join(AI, 'model', 'dataset', 'out-v2');
const out = fs.createWriteStream(__dirname + '/data/engine-facts.jsonl');
for (const f of ['train.jsonl', 'val.jsonl']) {
  for (const line of fs.readFileSync(D + '/' + f, 'utf8').split('\n')) {
    if (!line.trim()) continue; const r = JSON.parse(line);
    if (r.reference && r.reference.unsure) continue;
    const A = analyze(r);
    out.write(JSON.stringify({ id: r.id, split: f.replace('.jsonl', ''), own: A.P.own, body: A.P.c.body, engDate: A.eng.dateIso, engine: A.P.eng.label }) + '\n');
  }
}
out.end(() => console.log('done'));
