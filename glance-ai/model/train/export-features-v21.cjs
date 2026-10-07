'use strict';
// v2.1 features -> train/features-v21/*.jsonl  (x = hashed indices, y = reference label, veto inputs, slice metadata)
const fs = require('fs'), path = require('path');
const { prepare } = require('../runtime/pipeline-v21.cjs');
const { DIM } = require('./featurize-v21.cjs');
const OUT = path.join(__dirname, 'features-v21'); fs.mkdirSync(OUT, { recursive: true });
const sets = { train: '../dataset/out-v21/train.jsonl', val: '../dataset/out-v21/val.jsonl', test: '../dataset/out-v21/test.jsonl', test_v2: '../dataset/out-v2/test.jsonl', adversarial: '../dataset/out-v21/adversarial-v21.jsonl', oss: '../dataset/out-v2/oss-eval.jsonl' };
const only = process.argv.slice(2);
for (const [name, rel] of Object.entries(sets)) {
  if (only.length && !only.includes(name)) continue;
  const p = path.join(__dirname, rel); if (!fs.existsSync(p)) { console.log('skip', name); continue; }
  const rows = fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
  const fd = fs.openSync(path.join(OUT, name + '.jsonl'), 'w');
  for (const r of rows) {
    const P = prepare(r);
    fs.writeSync(fd, JSON.stringify({ id: r.id, x: P.x, tid: r.splitId || r.templateId || r.id, style: r.render ? r.render.style : null, y: r.reference ? r.reference.label : null, ybin: r.gold ? r.gold : null, rule: r.reference ? r.reference.ruleCorrected : [], unsure: Boolean(r.reference && r.reference.unsure), prov: r.provenance, origin: r.frameOrigin || null,
      scenario: r.scenario || null, lang: r.lang, surface: r.surface, direction: r.direction, att: r.attachmentCount, augment: r.augment || null, voc: P.voc, role: P.role,
      shape: P.shape, vb: P.veto.base, vp: P.veto.product, vc: P.veto.cap, eng: P.eng.label }) + '\n');
  }
  fs.closeSync(fd); console.log(name, rows.length);
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ dim: DIM, featurizer: 'train/featurize-v21.cjs' }));
