'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { metricsOf, HERE } = require('./lib.cjs');
const { strictGated } = require('./score-owner-gold.cjs');
const { assertDryRunOut, applyOverrides, heldout, ARTIFACTS, SHIPPED_V2 } = require('./retrain-dry-run.cjs');
const { EVAL } = require('../paths.cjs');

const rows = [
  { id: 'a', lang: 'he', y: 'SILENT', pred: 'SILENT' },
  { id: 'b', lang: 'en', y: 'SILENT', pred: 'follow-up-ask|draft' },
  { id: 'c', lang: 'he', y: 'follow-up-ask|draft', pred: 'SILENT' },
  { id: 'd', lang: 'en', y: 'event|calendar', pred: 'calendar-hold|calendar' }
];
const m = metricsOf(rows, (r) => r.y, (r) => r.pred);
assert.strictEqual(m.n, 4);
assert.strictEqual(m.raw.wdi, 1);
assert.strictEqual(m.raw.silent, 2);
assert.strictEqual(m.raw.miss, 1);
assert.strictEqual(m.raw.wact, 1);
assert.strictEqual(m.wrongDoIt, '50.0% (1/2)');
assert.strictEqual(m.heMissed, '100.0% (1/1)');
assert.strictEqual(m.enWrongDoIt, '100.0% (1/1)');

let refused = false;
try { assertDryRunOut(ARTIFACTS); } catch (e) { refused = e.code === 'SHIPPED_PATH'; }
assert.strictEqual(refused, true);
refused = false;
try { assertDryRunOut(path.join(ARTIFACTS, 'nested')); } catch (e) { refused = e.code === 'SHIPPED_PATH'; }
assert.strictEqual(refused, true);
const okOut = assertDryRunOut(path.join(HERE, 'dry-run', 'artifacts'));
assert.ok(okOut.indexOf('model' + path.sep + 'artifacts') < 0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-'));
fs.writeFileSync(path.join(dir, 'meta.json'), '{"dim":4}');
fs.writeFileSync(path.join(dir, 'train.jsonl'), JSON.stringify({ id: 'keep', y: 'SILENT', unsure: true, x: [1] }) + '\n');
fs.writeFileSync(path.join(dir, 'test.jsonl'), [
  JSON.stringify({ id: 'a', y: 'SILENT', unsure: true, x: [1] }),
  JSON.stringify({ id: 'z', y: 'SILENT', unsure: false, x: [2] })
].join('\n') + '\n');
const dest = path.join(dir, 'out');
const hits = applyOverrides(dir, dest, [{ id: 'a', ownerLabel: 'ASK', actionLabel: 'follow-up-ask|draft' }]);
assert.strictEqual(hits.train, 0);
assert.strictEqual(hits.test, 1);
const changed = fs.readFileSync(path.join(dest, 'test.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
assert.strictEqual(changed[0].y, 'follow-up-ask|draft');
assert.strictEqual(changed[0].unsure, false);
assert.strictEqual(changed[1].y, 'SILENT');
const trainKept = JSON.parse(fs.readFileSync(path.join(dest, 'train.jsonl'), 'utf8'));
assert.strictEqual(trainKept.y, 'SILENT');
assert.strictEqual(trainKept.unsure, true);

const pred = path.join(dir, 'preds.jsonl');
fs.writeFileSync(pred, [
  { id: 'a', y: 'SILENT', pred: 'follow-up-ask|draft', predAlone: 'follow-up-ask|draft', lang: 'he' },
  { id: 'b', y: 'SILENT', pred: 'SILENT', predAlone: 'follow-up-ask|draft', lang: 'en' }
].map(JSON.stringify).join('\n') + '\n');
const h = heldout(pred, [{ id: 'a', ownerLabel: 'ASK', actionLabel: 'follow-up-ask|draft' }]);
assert.strictEqual(h.v2Veto.before.raw.wdi, 1);
assert.strictEqual(h.v2Veto.after.raw.wdi, 0);
assert.strictEqual(h.v2Veto.after.raw.miss, 0);
assert.strictEqual(h.v2Alone.before.raw.wdi, 2);
assert.strictEqual(h.overridden, 1);

const cases = new Map(fs.readFileSync(EVAL.shadowCases(), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const llm = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'oss', 'shadow-combined', 'llm-qwen3.5-4b.jsonl'), 'utf8').split('\n').find((l) => l.indexOf('"v2syn-9371"') >= 0));
const gated = strictGated(cases.get('v2syn-9371'), llm.pred);
assert.strictEqual(gated.step, 'SILENT', JSON.stringify(gated));

const shipped = heldout(SHIPPED_V2, []);
assert.strictEqual(shipped.n, 6982);
assert.strictEqual(shipped.v2Veto.before.raw.wdi, 82);
assert.strictEqual(shipped.v2Veto.before.raw.silent, 5727);
console.log('score tests passed');
