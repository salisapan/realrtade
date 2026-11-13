'use strict';
// node glance-ai/scoreboard/test-scoreboard.cjs : the baseline reader and the prompt writer (no engine environment needed).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { parse } = require('./baseline/ingest.cjs');
let n = 0; const t = (name, f) => { f(); n++; console.log('PASS: ' + name); };
t('one-word answers', () => {
  assert.deepStrictEqual(parse('silent').pred, { decision: 'silent' });
  assert.deepStrictEqual(parse('Draft.').pred, { decision: 'act', family: 'reply' });
  assert.deepStrictEqual(parse('file_save').pred, { decision: 'act', family: 'file' });
  assert.deepStrictEqual(parse('calendar\nbecause').pred, { decision: 'act', family: 'calendar' });
});
t('JSON answers, fenced or not', () => {
  assert.deepStrictEqual(parse('{"decision":"act","family":"task"}').pred, { decision: 'act', family: 'task' });
  assert.deepStrictEqual(parse('```json\n{"decision":"silent"}\n```').pred, { decision: 'silent' });
});
t('an unreadable answer is silent and flagged, never credited', () => {
  for (const bad of ['', null, 'I think maybe', '{"decision":"act","family":"banana"}']) { const p = parse(bad); assert.strictEqual(p.ok, false); assert.strictEqual(p.pred.decision, 'silent'); }
});
t('the prompt writer makes no model call and never puts a label in the prompt', () => {
  const out = path.join(os.tmpdir(), 'sb-prompts-test.jsonl');
  cp.execFileSync('node', [path.join(__dirname, 'baseline', 'make-prompts.cjs'), '--variant', 'understanding', '--out', out], { stdio: 'pipe' });
  const rows = fs.readFileSync(out, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.length > 100);
  for (const r of rows.slice(0, 50)) { assert.ok(!/ownerLabel|"step"|"agreed"/.test(JSON.stringify(r))); assert.ok(!/@[\w-]+\./.test(r.user) && !/\[object/.test(r.user), 'masked'); assert.ok(r.user.includes('Answer with JSON only')); }
});
t('every label travels with its text: the frozen set, the overlay and the ratchet are joined by text-bound ids', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'labeling', f), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const fr = read('frozen-eval.jsonl'); const ids = new Set(fr.map((r) => r.id));
  assert.ok(fr.length >= 400 && fr.every((r) => typeof r.body === 'string' && r.body.length > 0 && /^b\d{3}-\d+$/.test(r.id)), 'frozen rows carry text');
  for (const f of ['owner-convention-overlay.jsonl', 'regression-wrong-doits.jsonl']) for (const r of read(f)) assert.ok(ids.has(r.id), f + ' row ' + r.id + ' is not in the frozen set (an id-keyed label would be scored against the wrong text)');
  // the frozen text must still equal the text in the batch file it came from
  const batches = {}; for (const b of ['003', '004', '005', '006', '007', '008'].filter((b) => fs.existsSync(path.join(__dirname, '..', 'labeling', 'batch-' + b + '.pass2-labels.jsonl')))) batches[b] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'labeling', `batch-${b}.json`), 'utf8'));
  for (const r of fr) { const row = batches[r.batch].find((x) => x.item === r.item); assert.ok(row && row.body === r.body, r.id + ' text drifted from its batch file'); }
  const fz = fs.readFileSync(path.join(__dirname, '..', 'model', 'train', 'features-frozen', 'frozen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id);
  assert.deepStrictEqual(fz, fr.map((r) => r.id), 'the feature export covers exactly the frozen rows, in order');
});
t('the engine hard-quiet reasons are one list, and a model may not act under them', () => {
  const H = require('../model/runtime/hard-quiets.cjs');
  for (const r of ['quiet:hedge', 'quiet:google', 'own-sender', 'meeting-veto', 'onedrive-target-on-gmail']) assert.strictEqual(H.modelMayAct(r), false, r);
  for (const r of ['intent-null', 'too-short', 'note-to-self', 'no-draft-close']) assert.strictEqual(H.modelMayAct(r), true, r);
  assert.strictEqual(H.modelMayAct('quiet:noise'), true); assert.strictEqual(H.modelMayAct('quiet:noise', H.B), false);
});
t('content ids are stable: same text, same id; another text, another id; the frozen set has one id per row', () => {
  const { cid } = require('../model/dataset/cid.cjs');
  const a = { lang: 'en', surface: 'gmail', direction: 'inbound', from: { email: 'D@x.com' }, subject: 'Hi', cleanBody: 'Could you send  the budget?' };
  assert.strictEqual(cid(a), cid(Object.assign({}, a, { cleanBody: 'Could you send the budget?', from: { email: 'd@x.com' } })), 'whitespace and case of the sender do not change it');
  assert.notStrictEqual(cid(a), cid(Object.assign({}, a, { cleanBody: 'Could you send the invoice?' })));
  assert.notStrictEqual(cid(a), cid(Object.assign({}, a, { lang: 'he' })));
  const fr = fs.readFileSync(path.join(__dirname, '..', 'labeling', 'frozen-eval.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(new Set(fr.map((r) => r.cid)).size, fr.length, 'one content id per frozen row');
});
console.log('\n' + n + ' passed');
