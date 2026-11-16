// v2.8 labels (2026-11-11): owner decision C-4 (docs/glance-ai/model-conventions.md): an UNDATED ASK GETS A DO IT.
// Starts from features-v26 and flips, for the ask scenarios only (request_reply, reply_with_file, task_ask, payment): inbound, the person on To,
// addressed by name or directly, not a group greeting (group, Cc and "Hi all" stay profile features, C-12):
//   1. an ask the v2.3 to v2.6 rules left unsure because it has no date                   -> the template-intent label (draft)
//   2. an ask that only says asap / as soon as possible / בהקדם / מיד (v2.6 labelled it SILENT, C-5) -> the template-intent label
//   3. an ask the frozen 0.9.35 engine and the tip engine are both silent on (no quiet rule fired) -> the template-intent label
// Commitments by the reader without a date, own notes, meetings and everything else are unchanged. Labels are template intent, NOT
// owner-verified, and no row of a blind label set is used. Writes train/features-v28/.
// usage (after gap-labels-v25.cjs with GLANCE_V25=c): GLANCE_TIP=... GLANCE_NOW=... node train/gap-labels-v28.cjs
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v26'), DST = path.join(HERE, 'features-v28');
const ALL = path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl');
const eng = require(path.join(HERE, '..', 'teacher', 'engine.cjs')).makeEngine('tip');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const LABEL = { request_reply: 'follow-up-ask|draft', reply_with_file: 'follow-up-ask|draft', task_ask: 'follow-up-ask|draft', payment: 'follow-up-ask|draft' };
const ASAP = /\b(?:asap|as soon as possible)\b|בהקדם|(?:^|\s)מיד(?:\s|[.,!?]|$)/i;
const GROUP = /\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team|guys|folks)\b|(?:היי|שלום)\s+(?:לכולם|לכולן|צוות|חברים)/i;
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const src = {}; for (const r of read(ALL)) src[r.id] = r;
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const stats = {}; const inc = (k) => { stats[k] = (stats[k] || 0) + 1; };
for (const split of ['train', 'val', 'test']) {
  const out = [];
  for (const f of read(path.join(SRC, split + '.jsonl'))) {
    const r = src[f.id]; const body = r ? (r.cleanBody || r.body || '') : '';
    if (!(r && LABEL[f.scenario] && r.direction === 'inbound' && f.role === 'to' && (f.voc === 'own' || f.voc === 'none') && !GROUP.test(body))) { out.push(f); continue; }
    let why = null;
    if (f.unsure) why = 'undated-unsure';
    else if (f.gap && f.y === 'SILENT' && ASAP.test(body)) why = 'asap';
    else if (!f.gap && f.y === 'SILENT' && r.reference && r.reference.source === 'engine-0.9.35' && !(r.reference.ruleCorrected || []).length
      && step(eng.teach(Object.assign({}, r, { body })).label) === 'SILENT') why = 'engine-silent';
    if (!why) { out.push(f); continue; }
    inc(split + ':' + why);
    out.push(Object.assign({}, f, { y: LABEL[f.scenario], ybin: 1, unsure: false, gap: true }));
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats, null, 2));
