'use strict';
// Product-order confusion (gold step -> predicted step) of one model on the two-pass agreement rows of the frozen set, same join and order as run.cjs.
// Diagnosis only: run it on the validation batches (--batches 007,008); a change chosen from it is declared in model/V23.md.
// usage: node scoreboard/confusion.cjs --model name=extra-preds.jsonl [--batches 007,008] [--hard-quiets A] [--source tip|model]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const [name, file] = arg('model').split('=');
const ONLY = arg('batches') ? new Set(arg('batches').split(',')) : null;
const frozen = read(path.join(G, 'labeling', 'frozen-eval.jsonl')).filter((r) => !ONLY || ONLY.has(r.batch));
const overlay = new Set(fs.existsSync(path.join(G, 'labeling', 'owner-convention-overlay.jsonl')) ? read(path.join(G, 'labeling', 'owner-convention-overlay.jsonl')).map((r) => r.id) : []);
const HQ = require(path.join(G, 'model', 'runtime', 'hard-quiets.cjs')); const HARD = HQ[arg('hard-quiets', 'A')] || new Set();
const m = Object.fromEntries(read(path.join(G, file)).map((r) => [r.id, r]));
const STEPS = new Set(['SILENT', 'task', 'calendar', 'draft', 'file_save']);
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const conf = {}, by = { tip: {}, model: {} };
for (const r of frozen) {
  if (overlay.has(r.id) || !(r.agreed && STEPS.has(r.agreed))) continue;
  const x = m[r.id]; const eng = x && (x.vb || x.vp) ? 'SILENT' : r.tip;
  let pred, who;
  if (eng !== 'SILENT') { pred = eng; who = 'tip'; } else if (HARD.has(r.tipReason)) { pred = 'SILENT'; who = 'tip'; } else { pred = step(x && x.pred); who = 'model'; }
  const k = r.agreed + ' -> ' + pred; conf[k] = (conf[k] || 0) + 1;
  if (r.agreed !== 'SILENT' && pred !== 'SILENT' && pred !== r.agreed) by[who][k] = (by[who][k] || 0) + 1;
}
console.log(name, ONLY ? [...ONLY].join(',') : 'all frozen batches');
console.log('confusion', Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ': ' + v).join(' | '));
console.log('wrong actions made by the engine', JSON.stringify(by.tip)); console.log('wrong actions made by the model', JSON.stringify(by.model));
