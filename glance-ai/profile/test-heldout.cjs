'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run, HELD } = require('./run-heldout.cjs');

const text = fs.readFileSync(HELD, 'utf8');
const sha = crypto.createHash('sha256').update(text).digest('hex');
const recorded = fs.readFileSync(HELD + '.sha256', 'utf8').trim();
assert.strictEqual(sha, recorded);
assert.strictEqual(sha, '8dcc096806b0f59c9062be9f07caacf3ffe1c6b5102598c34e92ff5c2170322c');
const state = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'glance-ai', 'STATE.md'), 'utf8');
assert.ok(state.indexOf(sha) >= 0, 'STATE.md is missing the frozen sha');

const rows = text.trim().split('\n').map((line) => JSON.parse(line));
const pairs = new Set(rows.map((r) => r.pairId));
assert.strictEqual(pairs.size, 60);
assert.strictEqual(rows.length, 120);
assert.ok(rows.every((r) => r.labeledBy === 'synthetic-heldout' && r.ownerVerified === false && r.trainingConsent !== true && r.consent === false));
assert.ok(!rows.some((r) => r.labeledBy === 'sali'));
for (const name of ['approver-fyi', 'group-named-other', 'role-in-filename', 'lookalike-vendor', 'stale-preference']) {
  assert.ok(rows.some((r) => r.scenario === name && r.adversarial), name);
}
const he = new Set(rows.filter((r) => r.lang === 'he').map((r) => r.pairId)).size;
const en = new Set(rows.filter((r) => r.lang === 'en').map((r) => r.pairId)).size;
assert.strictEqual(he, 30);
assert.strictEqual(en, 30);

const report = run();
assert.strictEqual(report.heldoutSha256, sha);
assert.strictEqual(report.ownerVerified, 0);
assert.strictEqual(report.hand.pairAccuracy, '65.0% (39/60)');
assert.strictEqual(report.hand.wrongDoIt, '16.7% (10/60)');
assert.strictEqual(report.hand.missedCloseOnRelevant, '18.3% (11/60)');
assert.strictEqual(report.learned.pairAccuracy, '58.3% (35/60)');
assert.strictEqual(report.learned.wrongDoIt, '11.7% (7/60)');
assert.strictEqual(report.learned.missedCloseOnRelevant, '25.0% (15/60)');
assert.strictEqual(report.emptyProfileFlips.shippedPreds, 0);
assert.strictEqual(report.emptyProfileFlips.shippedN, 6982);
assert.ok(report.model.ranked[0].name === 'history_approved');

console.log(JSON.stringify({
  sha: sha.slice(0, 12),
  hand: report.hand.pairAccuracy,
  learned: report.learned.pairAccuracy,
  flips: report.emptyProfileFlips.shippedPreds
}));
