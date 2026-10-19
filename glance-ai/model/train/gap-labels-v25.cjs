// v2.5 labels (batch-005 run, 2026-10-19). Two variants from one script:
//   GLANCE_V25=a  v2.3's gap labels (gap-labels-v23.cjs), but a commitment the person made ("you said you would…", «התחייבת…»)
//                 gets the reference's own class commitment|task instead of a new class dated-commitment|task. The v2 reference
//                 already uses commitment|task for these mails, so v2.3 split one intention over two classes (BATCH-004: the
//                 chooser then read «התחייבת לשלוח… עד» as a reply). Writes train/features-v25a/.
//   GLANCE_V25=b  the same plus v2.4's two changes (deadlines the device does not read, dated notes to self). Writes features-v25b/.
// Labels are template intent, NOT owner-verified.
'use strict';
// v2.4 labels: v2.3 (gap-labels-v23.cjs, unchanged) plus two changes found by batch-004 (glance-ai/labeling/BATCH-004.md):
//   1. a deadline the device's date reader does not read counts as dated: "today", "by end of (the) week", «היום», «סוף השבוע»
//      (core/extract.js parseDate reads "EOD" and «עד סוף היום» but not these; an engine finding for the red team, core/ is not edited);
//   2. a dated note to self (own_commitment_self, direction self, no clock time) is a task, as the product reads a reminder to self.
//      A note to self with a clock time stays unsure (task or calendar is not settled).
// Original v2.3 header follows.
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
// Writes train/features-v24/{train,val,test}.jsonl (+ meta.json) from train/features-v2 and dataset/out-v2/all.jsonl.
// usage: GLANCE_V25=a|b GLANCE_NOW=2026-10-07T12:00:00+03:00 node train/gap-labels-v25.cjs
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'features-v2'), V = process.env.GLANCE_V25 === 'b' ? 'b' : 'a', DST = path.join(HERE, 'features-v25' + V);
const ALL = path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl');
const { FlowExtract: E } = require(path.join(HERE, '..', '..', '..', 'flow-trial-extension', 'core', 'extract.js'));
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const LABEL = {
  request_reply: 'follow-up-ask|draft', reply_with_file: 'follow-up-ask|draft', task_ask: 'follow-up-ask|draft', payment: 'follow-up-ask|draft',
  commitment_reader: 'commitment|task', meeting: 'event|calendar'
};
const DEADLINE = /\b(?:today|tonight|(?:by|before|until)\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week)\b|היום|סוף\s+השבוע/i;
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
    else if (V === 'b' && r.direction === 'self' && f.scenario === 'own_commitment_self') {
      const d = E.parseDate(body, NOW);
      if (!((d && d.iso) || DEADLINE.test(body))) why = 'self-undated';
      else if (E.parseTime && E.parseTime(body)) why = 'self-with-time';
      else { inc(split + ':gap-labelled:own_commitment_self'); out.push(Object.assign({}, f, { y: 'dated-commitment|task', ybin: 1, unsure: false, gap: true })); continue; }
    }
    else if (r.direction !== 'inbound') why = 'not-inbound';
    else if (!LABEL[f.scenario]) why = 'scenario:' + f.scenario;
    else if (f.role !== 'to') why = 'not-on-to';
    else if (!(f.voc === 'own' || f.voc === 'none') || GROUP.test(body)) why = 'group-or-other';
    else {
      const d = E.parseDate(body, NOW);
      if ((!d || !d.iso) && !(V === 'b' && DEADLINE.test(body))) why = 'undated';
      else if (f.scenario === 'meeting' && !(E.parseTime && E.parseTime(body))) why = 'meeting-without-time';
    }
    if (why) { inc(split + ':stays-unsure:' + why.split(':')[0]); out.push(f); continue; }
    inc(split + ':gap-labelled:' + f.scenario);
    out.push(Object.assign({}, f, { y: LABEL[f.scenario], ybin: 1, unsure: false, gap: true }));
  }
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(stats, null, 2));
