// v3.3 (plan 2, 2026-11-12): v3.2's teacher-only supervision with ONE audit rule applied to the teacher's labels.
// The written labelling rule (labeling/pass-rules.md, `draft`: "asked for ... a payment BACK"; model-conventions C-7: a request for a file or an answer
// back is a draft) makes an ask to pay the SENDER a reply draft. The teacher (Sonnet 5.5 on escalation) broke that rule on the generator's `payment`
// family (pay us): reference draft -> teacher task in 302 of 367 rows, and 78 more reference-silent rows became a task. Here a teacher `task` on a row of
// the generator's `payment` scenario becomes `follow-up-ask|draft`; nothing else changes. Paying a THIRD party stays a task (scenario `third_party`).
// Declared: chosen on 2026-11-12 after the frozen-set confusion (scoreboard/confusion.cjs) showed v3.2's extra wrong actions were draft -> task, and the
// validation batch (007, 008) showed the same three rows; the rule is the written convention, not a fit to the frozen labels. Reads train/features-v32/,
// writes train/features-v33/.
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, process.env.SRC || 'features-v32'), DST = path.join(HERE, process.env.DST || 'features-v33');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
fs.mkdirSync(DST, { recursive: true });
for (const f of ['meta.json', 'test.jsonl']) fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
const st = {};
for (const split of ['train', 'val']) {
  const out = read(path.join(SRC, split + '.jsonl')).map((f) => {
    if (f.teacher === true && !f.unsure && f.scenario === 'payment' && String(f.y).endsWith('|task')) {
      st[split + ':payment task -> draft'] = (st[split + ':payment task -> draft'] || 0) + 1;
      return Object.assign({}, f, { y: 'follow-up-ask|draft', audit: 'payment-back-is-draft' });
    }
    return f;
  });
  fs.writeFileSync(path.join(DST, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify(st));
