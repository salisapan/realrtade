'use strict';
// Writes hashed feature indices + teacher/spec labels for every dataset file -> train/features/*.jsonl
const fs = require('fs'), path = require('path');
const { featuresOf, DIM } = require('./featurize.cjs');
const { preprocess } = require('../teacher/teacher.cjs');
// Spec corrections (v1c only, training rows only): the two engine bugs found 2026-10-07. Silence-only for negation;
// OneDrive save on Outlook with exactly one attachment becomes the save the owner expects. Everything else = teacher.
const NEG_SAVE = /(\b(?:don'?t|do not|no need to|never|please don'?t)\b[^.!?\n]{0,30}\b(?:save|upload|store|file)\b)|((?:אל\s+ת|אין צורך ל|לא צריך ל)[\u05D0-\u05EA]*\s*(?:לשמור|תשמור|תשמרי|לשמור)?)/i;
function corrected(r) {
  const t = r.teacher;
  if (r.split !== 'train' && r.split !== 'val') return { y: t.label, corrected: false };
  if (t.show && t.primaryStep === 'file_save' && NEG_SAVE.test(r.body)) return { y: 'SILENT', corrected: 'negation' };
  if (r.scenario === 'onedrive_save' && r.surface === 'outlook' && r.direction === 'inbound' && r.attachmentCount === 1) return { y: 'drive-file|file_save', corrected: t.label === 'drive-file|file_save' ? false : 'onedrive' };
  return { y: t.label, corrected: false };
}
const IN = path.join(__dirname, '..', 'dataset', 'out');
const OUT = path.join(__dirname, 'features'); fs.mkdirSync(OUT, { recursive: true });
for (const f of ['train', 'val', 'test', 'gold22', 'adversarial']) {
  const rows = fs.readFileSync(path.join(IN, f + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const lines = rows.map((r) => JSON.stringify({ id: r.id, x: featuresOf(Object.assign({}, r, preprocess(r))), y: r.teacher.label, yc: corrected(r).y, corr: corrected(r).corrected, prov: r.provenance, scenario: r.scenario || r.kind || null, surface: r.surface, lang: r.lang,
    attachmentCount: r.attachmentCount, direction: r.direction }));
  fs.writeFileSync(path.join(OUT, f + '.jsonl'), lines.join('\n') + '\n');
  console.log(f, rows.length);
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ dim: DIM }));
