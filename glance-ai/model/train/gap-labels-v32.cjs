// v3.2 (plan 2, 2026-11-12): CONSISTENT supervision from the teacher. v3.1 mixed about 8,000 teacher-labelled rows with about 18,000 rows still labelled by the
// engine-derived reference, and the teacher disagreed with that reference on about 45% of the rows it saw, so the student learned two conflicting conventions.
//   MODE=residual      the same, restricted to the rows where the rules engine of this repository (tip) is silent and its silence is not a hard quiet: in the
//                      product the model only ever acts there, so the student learns the engine's blind spots, not what the engine already does. Writes features-v32r/.
//   MODE=teacher-only  (default) train only on the teacher-labelled rows (CONTEXT and UNSURE dropped); every other train row is masked (unsure), so the
//                      out-of-fold tau is also chosen on teacher labels only. The teacher labelled train rows only, so the validation split used to pick C is
//                      15% of the teacher threads (by thread id, never split), and the original val rows (engine-derived labels) are left out.
// Starts from features-v31 (built with TEACHER_LABELS=teacher/teacher-labels-final.jsonl). Labels are the teacher's (Haiku 5.5, disagreements escalated to
// Sonnet 5.5), NOT owner-verified; no frozen, validation or sealed text is in the sample. Writes train/features-v32/.
'use strict';
const fs = require('fs'), path = require('path');
const MODE = process.env.MODE || 'teacher-only';
const HERE = __dirname, SRC = path.join(HERE, 'features-v31'), DST = path.join(HERE, MODE === 'residual' ? 'features-v32r' : 'features-v32');
let tipSilent = null;
if (MODE === 'residual') {
  const eng = require(path.join(HERE, '..', 'teacher', 'engine.cjs')).makeEngine('tip');
  const HQ = require(path.join(HERE, '..', 'runtime', 'hard-quiets.cjs'));
  const all = {}; for (const s of ['train', 'val']) for (const r of fs.readFileSync(path.join(HERE, '..', 'dataset', 'out-v2', s + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)) all[r.id] = r;
  tipSilent = (id) => { const r = all[id]; if (!r) return false; const o = eng.teach(Object.assign({}, r, { body: r.cleanBody || r.body })); return o.label === 'SILENT' && HQ.modelMayAct(o.reason); };
}
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
fs.mkdirSync(DST, { recursive: true }); fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
const st = {};
const h = (s) => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
const heldOut = (f) => h('v32-val:' + f.tid) % 100 < 15;
const bump = (k) => { st[k] = (st[k] || 0) + 1; };
const train = [], val = [];
for (const f of read(path.join(SRC, 'train.jsonl'))) {
  const keep = f.teacher === true && !f.unsure && (!tipSilent || tipSilent(f.id));
  if (keep && heldOut(f)) { val.push(f); bump('val:teacher'); continue; }
  if (keep) { train.push(f); bump('train:teacher'); continue; }
  if (heldOut(f)) { bump('dropped:same-thread-as-val'); continue; }
  train.push(Object.assign({}, f, { unsure: true })); bump('train:masked');
}
st['val:original-left-out'] = read(path.join(SRC, 'val.jsonl')).length;
const write = (name, rows) => fs.writeFileSync(path.join(DST, name + '.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
write('train', train); write('val', val); fs.copyFileSync(path.join(SRC, 'test.jsonl'), path.join(DST, 'test.jsonl'));
console.log(JSON.stringify(st));
