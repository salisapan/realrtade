'use strict';
// Locks the lab-only silence measurements. Provisional / not owner-verified.
// The runtime veto is unchanged: none of these rules is adopted.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { measure, loadJoined, auditCases, qwenStrictZeros } = require('./silence-prototype.cjs');
const { productVeto } = require('../model/runtime/veto-v2.cjs');
const { loadBatch } = require('./lib.cjs');

const rows = loadJoined();
assert.strictEqual(rows.length, 6982);
const rep = measure(rows);
assert.strictEqual(rep.before.raw.wdi, 82);
assert.strictEqual(rep.before.raw.silent, 5727);
assert.strictEqual(rep.before.raw.miss, 637);
assert.strictEqual(rep.before.raw.show, 1255);
assert.strictEqual(rep.before.wrongDoIt, '1.4% (82/5727)');
assert.strictEqual(rep.before.missed, '50.8% (637/1255)');

const expect = {
  'attach-to-invite': { flipped: 13, fixed: 2, newMiss: 11, miss: 648, wdi: 80, delta: 0.876, rejected: false },
  'calendar-hold-attach': { flipped: 2, fixed: 1, newMiss: 1, miss: 638, wdi: 81, delta: 0.08, rejected: false },
  'fee-statement': { flipped: 6, fixed: 1, newMiss: 5, miss: 642, wdi: 81, delta: 0.398, rejected: false },
  'confirmed-amount-engine-silent': { flipped: 3, fixed: 1, newMiss: 2, miss: 639, wdi: 81, delta: 0.159, rejected: false },
  'group-voc': { flipped: 93, fixed: 10, newMiss: 83, miss: 720, wdi: 72, delta: 6.614, rejected: true }
};
for (const [name, e] of Object.entries(expect)) {
  const r = rep.rules[name];
  assert.ok(r, name);
  assert.strictEqual(r.adopted, false, name);
  assert.strictEqual(r.flipped, e.flipped, name);
  assert.strictEqual(r.fixed, e.fixed, name);
  assert.strictEqual(r.newMiss, e.newMiss, name);
  assert.strictEqual(r.after.raw.miss, e.miss, name);
  assert.strictEqual(r.after.raw.wdi, e.wdi, name);
  assert.strictEqual(r.deltaMissedPoints, e.delta, name);
  assert.strictEqual(r.rejected, e.rejected, name);
}
assert.strictEqual(rep.rules['group-voc'].after.missed, '57.4% (720/1255)');
assert.strictEqual(rep.rules['attach-to-invite'].after.heMissed, '49.4% (238/482)');
assert.strictEqual(rep.rules['attach-to-invite'].after.enMissed, '53.0% (410/773)');

const runtime = fs.readFileSync(path.join(__dirname, '..', 'model', 'runtime', 'veto-v2.cjs'), 'utf8');
assert.ok(runtime.indexOf('silence-prototype') < 0);
assert.ok(runtime.indexOf('attach-to-invite') < 0);
const shadow = fs.readFileSync(path.join(__dirname, '..', 'model', 'shadow-pkg', 'src', 'gs-prepare.js'), 'utf8');
assert.ok(shadow.indexOf('silence-prototype') < 0);

const audit = auditCases();
const by = Object.fromEntries(audit.map((r) => [r.id, r]));
assert.strictEqual(by['v2syn-9371'].live.label, 'calendar-hold|calendar');
assert.strictEqual(by['v2syn-9371'].live.veto, null);
assert.strictEqual(by['v2syn-9371'].why.productOnOwn, null);
assert.strictEqual(by['v2syn-9371'].why.unsupported, 'gate:unsupported-kind:attach-to-invite');
assert.strictEqual(by['v2syn-9371'].why.cardVeto, 'calendar-needs-future-engine-date');
const item10 = loadBatch(path.join(__dirname, 'batch-001.json')).find((r) => r.id === 'v2syn-9371');
assert.strictEqual(productVeto(
  { direction: 'inbound', surface: 'gmail', subject: item10.subject || '', body: item10.body, ownNames: ['Sali', 'סאלי'] },
  item10.body,
  'ai.local.flow@gmail.com'
), null);

assert.strictEqual(by['v2rtest-close-families-corpus-128'].live.label, 'confirmed-amount|task');
assert.strictEqual(by['v2rtest-close-families-corpus-128'].why.moneyMovement, false);
assert.strictEqual(by['v2rtest-close-families-corpus-128'].why.offerAcceptance, false);
assert.strictEqual(by['v2rtest-close-families-corpus-128'].live.veto, null);

assert.strictEqual(by['v2syn-6931'].live.label, 'SILENT');
assert.strictEqual(by['v2syn-6931'].live.veto, 'cc-only');
assert.strictEqual(by['v2syn-6931'].live.modelAlone, 'SILENT');
assert.strictEqual(by['v2syn-6931'].liveTip, 'follow-up-ask|draft');

assert.strictEqual(by['v2syn-7013'].live.veto, 'addressed-to-other');
assert.strictEqual(by['v2syn-7013'].live.modelAlone, 'follow-up-ask|draft');
assert.strictEqual(by['v2syn-7013'].live.label, 'SILENT');
assert.strictEqual(by['v2syn-7013'].liveTip, 'follow-up-ask|draft');

assert.strictEqual(by['v2syn-9674'].live.label, 'SILENT');
assert.strictEqual(by['v2syn-9674'].live.veto, null);
assert.strictEqual(by['v2syn-9674'].why.voc, 'group');
assert.strictEqual(by['v2syn-9674'].why.moneyMovement, false);
assert.strictEqual(by['v2syn-9674'].liveTip, 'confirmed-amount|task');

assert.strictEqual(by['v2syn-25034'].liveTip, 'SILENT');
assert.strictEqual(by['v2syn-25034'].live.veto, 'quiet:google');
assert.strictEqual(by['v2syn-25034'].attachmentCount, 1);
assert.strictEqual(by['v2syn-25034'].why.veto.cap.file_save, null);

const qwen = qwenStrictZeros();
assert.ok(qwen.length >= 6);
for (const row of qwen) assert.ok(/^0\.0% \(0\//.test(row.wrongDoIt), row.set + ' ' + row.wrongDoIt);

console.log('silence prototype tests passed');
