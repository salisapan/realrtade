// E8-lite (plan 2): a sample of TRAINING rows for the teacher (a strong reader under the labelling rules) to label, so the student learns from more than the
// engine-derived reference. Stratified round-robin over scenarios and languages, deterministic, inbound rows of the train split only (never a frozen or hold-out
// row: the frozen texts are checked by text). The teacher sees the mail only (no scenario, no reference, no engine answer).
// usage: node train/make-teacher-sample.cjs --n 320 --out-cases <cases.txt>
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 320), OUT = arg('out-cases');
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const frozen = new Set(read(path.join(G, 'labeling', 'frozen-eval.jsonl')).map((r) => norm(r.body)));
const sealed = new Set(read(path.join(G, 'labeling', 'sealed', 'batch-009.blind.jsonl')).map((r) => norm(r.body)));
const rows = read(path.join(G, 'model', 'dataset', 'out-v2', 'train.jsonl')).filter((r) => r.direction === 'inbound' && !frozen.has(norm(r.body)) && !frozen.has(norm(r.cleanBody)) && !sealed.has(norm(r.body)));
const h = (s) => parseInt(crypto.createHash('sha256').update('teacher:' + s).digest('hex').slice(0, 8), 16);
const by = {}; for (const r of rows.sort((a, b) => h(a.id) - h(b.id))) { const k = r.scenario + '|' + r.lang; (by[k] = by[k] || []).push(r); }
const keys = Object.keys(by).sort(); const pick = []; const seen = new Set();
for (let round = 0; pick.length < N && round < 50; round++) for (const k of keys) { const r = by[k][round]; if (r && !seen.has(norm(r.cleanBody)) && pick.length < N) { seen.add(norm(r.cleanBody)); pick.push(r); } }
const rules = fs.readFileSync(path.join(G, 'labeling', 'pass-rules.md'), 'utf8');
pick.forEach((r, i) => { r._item = i + 1; });
fs.writeFileSync(path.join(G, 'labeling', 'teacher-sample.jsonl'), pick.map((r) => JSON.stringify({ item: r._item, id: r.id, cid: r.cid || null, lang: r.lang, scenario: r.scenario, split: 'train' })).join('\n') + '\n');
let o = rules + '\n\nCASES\n\n';
for (const r of pick) o += '### ITEM ' + r._item + ' [' + r.lang + ', ' + r.surface + ', ' + r.direction + ', attachments=' + (r.attachmentCount || 0) + ']\nFrom: ' + (r.from && r.from.email || '') + '\nTo: ' + (r.to || []).join(', ') + '\nCc: ' + (r.cc || []).join(', ') + '\nSubject: ' + (r.subject || '') + '\n\n' + (r.cleanBody || r.body) + '\n\n';
fs.writeFileSync(OUT, o);
console.log(pick.length, 'rows,', Object.keys(by).length, 'scenario-language strata');
