// v2.9 labels (2026-11-11): the conventions the owner delegated to Claude («תעשה את מה שהכי יעיל וחכם»), docs/glance-ai/model-conventions.md.
//   C-7  an ask to DO WORK is a task, not a reply draft: the scenarios task_ask ("Please add a task to book the venue") and create_doc ("create an
//        invoice", "prepare a quote") get `follow-up-ask|task` (inbound, the person on To, addressed by name or directly, not a group greeting).
//   C-18 a reader's promise with no date ("as agreed, you will send the invoice asap") is a task: commitment_reader rows the earlier rules left
//        SILENT (unsure, or an asap row) get `commitment|task`.
// Starts from features-v28 (undated asks act, C-4). Labels are template intent, NOT owner-verified, and no label-set row is used. Writes train/features-v29/.
// usage (after gap-labels-v28.cjs): GLANCE_NOW=... node train/gap-labels-v29.cjs
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v28'), DST = path.join(HERE, 'features-v29');
const ALL = path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const GROUP = /\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team|guys|folks)\b|(?:היי|שלום)\s+(?:לכולם|לכולן|צוות|חברים)/i;
const src = {}; for (const r of read(ALL)) src[r.id] = r;
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const stats = {}; const inc = (k) => { stats[k] = (stats[k] || 0) + 1; };
for (const split of ['train', 'val', 'test']) {
  const out = [];
  for (const f of read(path.join(SRC, split + '.jsonl'))) {
    const r = src[f.id], body = r ? (r.cleanBody || r.body || '') : '';
    const ok = r && r.direction === 'inbound' && f.role === 'to' && (f.voc === 'own' || f.voc === 'none') && !GROUP.test(body);
    if (ok && (f.scenario === 'task_ask' || f.scenario === 'create_doc') && (f.y === 'follow-up-ask|draft' || f.y === 'SILENT')) { inc(split + ':work-ask-task:' + f.scenario); out.push(Object.assign({}, f, { y: 'follow-up-ask|task', ybin: 1, unsure: false, gap: true })); continue; }
    if (ok && f.scenario === 'commitment_reader' && f.y === 'SILENT') { inc(split + ':reader-promise-task'); out.push(Object.assign({}, f, { y: 'commitment|task', ybin: 1, unsure: false, gap: true })); continue; }
    out.push(f);
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats, null, 2));
