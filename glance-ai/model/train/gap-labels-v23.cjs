'use strict';
// v2.3 labels: teach the small model what the rules engine misses.
// The v2 reference label IS the rules engine (0.9.35 on the clean render, plus product overrides), so a model trained on it can at
// best copy the engine. The rows the engine is silent on although they are ask-shaped and addressed to the person ("engine-recall
// gap", reference.unsure) were left out of training as unsure. Many are real asks: "Can I get the budget spreadsheet from you next
// Tuesday?", «נתראה מחר ב-14:30 במשרד».
// This script gives a gap row a label from its template's intent, but only where the product rules would accept that label:
//   - inbound, addressed to the person by name or directly (voc 'own' or 'none'), the person on To (not Cc, not a group greeting:
//     group and Cc mail are profile features, CLAUDE.md "Per-user context", and stay unsure);
//   - the device reads a date in the mail (core/extract.js), and a meeting also a time: an undated ask stays unsure, because whether an
//     undated ask deserves a Do It is the owner's open decision (glance-ai/oss/finetune/MODEL-TRACK.md);
//   - the scenario has one clear label (below); own promises, decisions and anything else stay unsure.
// The labels are template intent, NOT owner-verified. Every gap row keeps gap:true so it is reported apart from the reference rows.
// Writes train/features-v23/{train,val,test}.jsonl (+ meta.json) from train/features-v2 and dataset/out-v2/all.jsonl.
// usage: GLANCE_NOW=2026-10-07T12:00:00+03:00 node train/gap-labels-v23.cjs
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v2'), DST = path.join(HERE, 'features-v23');
const ALL = path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl');
const { FlowExtract: E } = require(path.join(HERE, '..', '..', '..', 'flow-trial-extension', 'core', 'extract.js'));
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const LABEL = {
  request_reply: 'follow-up-ask|draft', reply_with_file: 'follow-up-ask|draft', task_ask: 'follow-up-ask|draft', payment: 'follow-up-ask|draft',
  commitment_reader: 'dated-commitment|task', meeting: 'event|calendar'
};
const GROUP = /\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team|guys|folks)\b|(?:היי|שלום)\s+(?:לכולם|לכולן|צוות|חברים)/i;

const src = {}; for (const r of read(ALL)) src[r.id] = r;
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const stats = {};
const inc = (k) => { stats[k] = (stats[k] || 0) + 1; };
for (const split of ['train', 'val', 'test']) {
  const out = [];
  for (const f of read(path.join(SRC, split + '.jsonl'))) {
    if (!f.unsure) { out.push(f); continue; }
    const r = src[f.id];
    const body = r ? (r.cleanBody || r.body || '') : '';
    let why = null;
    if (!r) why = 'no-source';
    else if (r.direction !== 'inbound') why = 'not-inbound';
    else if (!LABEL[f.scenario]) why = 'scenario:' + f.scenario;
    else if (f.role !== 'to') why = 'not-on-to';
    else if (!(f.voc === 'own' || f.voc === 'none') || GROUP.test(body)) why = 'group-or-other';
    else {
      const d = E.parseDate(body, NOW);
      if (!d || !d.iso) why = 'undated';
      else if (f.scenario === 'meeting' && !(E.parseTime && E.parseTime(body))) why = 'meeting-without-time';
    }
    if (why) { inc(split + ':stays-unsure:' + why.split(':')[0]); out.push(f); continue; }
    inc(split + ':gap-labelled:' + f.scenario);
    out.push(Object.assign({}, f, { y: LABEL[f.scenario], ybin: 1, unsure: false, gap: true }));
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats, null, 2));
