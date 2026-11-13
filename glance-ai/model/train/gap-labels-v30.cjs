// v3.0 (plan 2, E8-lite, 2026-11-11): distillation on CPU. A sample of TRAINING rows is labelled by the teacher (a strong reader under the labelling rules,
// `labeling/teacher-labels.jsonl`); those rows get the teacher's label instead of the engine-derived reference, and are repeated K times (default 4) so
// they weigh in against the 30,000 reference rows. CONTEXT and UNSURE answers drop the row from training (unsure). Starts from features-v29. The teacher
// never sees a frozen, hold-out or sealed row (make-teacher-sample.cjs checks the text). Writes train/features-v30/.
// usage: K=4 node train/gap-labels-v30.cjs
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v29'), DST = path.join(HERE, 'features-v30');
const K = Math.max(1, +(process.env.K || 4));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const teacher = Object.fromEntries(read(path.join(HERE, '..', '..', 'labeling', 'teacher-labels.jsonl')).map((r) => [r.id, r]));
const CLS = { draft: 'follow-up-ask|draft', calendar: 'event|calendar', file_save: 'drive-file|file_save' };
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const stats = { relabelled: 0, same: 0, dropped: 0, copies: 0 }; const conf = {};
for (const split of ['train', 'val', 'test']) {
  const out = [];
  for (const f of read(path.join(SRC, split + '.jsonl'))) {
    const t = split === 'train' ? teacher[f.id] : null;
    if (!t) { out.push(f); continue; }
    const step = t.step === 'SILENT' ? 'SILENT' : t.step;
    const refStep = f.y === 'SILENT' ? 'SILENT' : f.y.split('|')[1];
    conf[refStep + '->' + step] = (conf[refStep + '->' + step] || 0) + 1;
    if (step === 'CONTEXT' || step === 'UNSURE') { stats.dropped++; out.push(Object.assign({}, f, { unsure: true })); continue; }
    let y;
    if (step === 'SILENT') y = 'SILENT';
    else if (step === 'task') y = f.y.endsWith('|task') ? f.y : (f.scenario === 'commitment_reader' || f.scenario === 'own_commitment_self' ? 'commitment|task' : 'follow-up-ask|task');
    else y = CLS[step];
    if (!y) { out.push(f); continue; }
    if (y === f.y) stats.same++; else stats.relabelled++;
    const row = Object.assign({}, f, { y, ybin: y === 'SILENT' ? 0 : 1, unsure: false, gap: true, teacher: true });
    for (let i = 0; i < K; i++) { out.push(row); if (i) stats.copies++; }
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats), '\nteacher against the reference (reference step -> teacher step):', JSON.stringify(conf));
