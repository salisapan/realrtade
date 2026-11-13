// v2.7 labels (2026-11-11): v2.6 (features-v26) plus a second gap pass. A row whose reference is SILENT only because the frozen
// 0.9.35 engine is silent, AND the tip engine of this repository is also silent, is a real recall gap: the person would see nothing.
// Where the mail is an ask-shaped template (request_reply, reply_with_file, task_ask, payment, commitment_reader), inbound, the person
// on To, addressed by name or directly (not a group greeting), and the device reads a date or a deadline (and a time, for a meeting),
// it gets the template-intent label, exactly the rules of gap-labels-v25.cjs. Rows the tip engine already acts on are left as they
// are (the product order lets the engine act first). Labels are template intent, NOT owner-verified; no label-set row is used.
// Writes train/features-v27/. usage (after gap-labels-v25.cjs with GLANCE_V25=c): GLANCE_TIP=... GLANCE_NOW=... node train/gap-labels-v27.cjs
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v26'), DST = path.join(HERE, 'features-v27');
const ALL = path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl');
const { FlowExtract: E } = require(path.join(HERE, '..', '..', '..', 'flow-trial-extension', 'core', 'extract.js'));
const eng = require(path.join(HERE, '..', 'teacher', 'engine.cjs')).makeEngine('tip');
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const LABEL = { request_reply: 'follow-up-ask|draft', reply_with_file: 'follow-up-ask|draft', task_ask: 'follow-up-ask|draft', payment: 'follow-up-ask|draft', commitment_reader: 'commitment|task' };
const DEADLINE = /\b(?:today|tonight|(?:by|before|until)\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week)\b|היום|סוף\s+השבוע/i;
const GROUP = /\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team|guys|folks)\b|(?:היי|שלום)\s+(?:לכולם|לכולן|צוות|חברים)/i;
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const src = {}; for (const r of read(ALL)) src[r.id] = r;
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const stats = {}; const inc = (k) => { stats[k] = (stats[k] || 0) + 1; };
for (const split of ['train', 'val', 'test']) {
  const out = [];
  for (const f of read(path.join(SRC, split + '.jsonl'))) {
    const r = src[f.id];
    if (!(r && f.y === 'SILENT' && !f.unsure && !f.gap && LABEL[f.scenario] && r.direction === 'inbound' && f.role === 'to'
      && (f.voc === 'own' || f.voc === 'none') && r.reference && r.reference.source === 'engine-0.9.35' && !(r.reference.ruleCorrected || []).length)) { out.push(f); continue; }
    const body = r.cleanBody || r.body || '';
    if (GROUP.test(body)) { out.push(f); continue; }
    const d = E.parseDate(body, NOW);
    if (!((d && d.iso) || DEADLINE.test(body))) { out.push(f); continue; }
    if (step(eng.teach(Object.assign({}, r, { body })).label) !== 'SILENT') { inc(split + ':tip-acts'); out.push(f); continue; }
    inc(split + ':gap-labelled:' + f.scenario);
    out.push(Object.assign({}, f, { y: LABEL[f.scenario], ybin: 1, unsure: false, gap: true }));
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats, null, 2));
