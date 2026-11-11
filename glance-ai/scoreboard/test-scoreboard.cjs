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
console.log('\n' + n + ' passed');
