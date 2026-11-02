'use strict';
// Reference fixes found by the blind batches, applied as a label layer on top of a features directory (the pinned dataset and
// its sha256 stay untouched, because several lab tests freeze numbers on it). Pre-registered in glance-ai/labeling/BATCH-006.md
// before any model was trained on it, and applied the same way to every model that is compared.
//
//   attach-to-invite  "Please attach the X to the <meeting> on <day> at <time>" / «בבקשה לצרף את X לזימון של ה<פגישה> <יום> <שעה>».
//                     The v2 reference (engine 0.9.35) is silent; both blind passes labelled it a reply with the file (draft) in
//                     batch-004 item 35 and batch-006 item 35. Only rows the engine was simply silent on are changed: a row a
//                     product rule silenced (addressed to someone else, Cc-only, ...) stays silent.
//
// usage: node train/ref-fix.cjs <features dir> [<features dir> ...]   writes <dir>f/ next to each (e.g. features-v23 -> features-v23f)
const fs = require('fs'), path = require('path');
const HERE = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ATTACH_INVITE = /\battach the .+ to the .+ on .+ at\b|לצרף את .+ לזימון של/i;
const src = {}; for (const r of read(path.join(HERE, '..', 'dataset', 'out-v2', 'all.jsonl'))) src[r.id] = r;
for (const dir of process.argv.slice(2)) {
  const IN = path.join(HERE, dir), OUT = IN + 'f';
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(IN, 'meta.json'), path.join(OUT, 'meta.json'));
  const stats = {};
  for (const split of ['train', 'val', 'test']) {
    const p = path.join(IN, split + '.jsonl'); if (!fs.existsSync(p)) continue;
    const out = read(p).map((f) => {
      const r = src[f.id];
      if (!r || f.y !== 'SILENT' || f.unsure || r.direction !== 'inbound' || r.scenario !== 'file_place') return f;
      if ((r.reference.ruleCorrected || []).length) return f;
      if (!ATTACH_INVITE.test(r.cleanBody || r.body || '')) return f;
      stats[split] = (stats[split] || 0) + 1;
      return Object.assign({}, f, { y: 'follow-up-ask|draft', ybin: 1, refFix: 'attach-to-invite' });
    });
    fs.writeFileSync(path.join(OUT, split + '.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }
  console.log(dir + 'f', JSON.stringify(stats));
}
