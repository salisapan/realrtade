'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, loadBatch, loadBatches, validateRow, readJson, HERE } = require('./lib.cjs');
const { ingest, GOLD } = require('./ingest-answers.cjs');

const tiny = [
  { id: 'a', item: 1, lang: 'en', surface: 'gmail', subject: 'Q', body: 'Please send the file.', v2: 'follow-up-ask|draft', engine35: 'SILENT', reference: { label: 'SILENT' } },
  { id: 'b', item: 2, lang: 'he', surface: 'outlook', subject: 'ש', body: 'לידיעה בלבד', v2: 'commitment|task', engine35: 'dated-commitment|task', reference: { label: 'SILENT' } }
].map((r, i) => Object.assign({ item: i + 1 }, r));

function answers(labeledBy, extra, list) {
  return Object.assign({ labeledBy, labeledAt: '2026-10-08T06:40:00.000Z', consent: false, answers: list }, extra || {});
}

const sali = ingest({
  batch: tiny,
  answers: answers('sali', null, [
    { item: 1, mark: '✅', note: 'yes' },
    { id: 'b', mark: '⚙️' }
  ])
});
assert.strictEqual(sali.rows.length, 2);
assert.strictEqual(sali.ownerVerifiedCount, 2);
assert.strictEqual(sali.rows[0].ownerLabel, 'ASK');
assert.strictEqual(sali.rows[0].actionLabel, 'follow-up-ask|draft');
assert.strictEqual(sali.rows[0].expectedAction, 'reply that answers the ask');
assert.strictEqual(sali.rows[0].wrongDoIt, false);
assert.strictEqual(sali.rows[0].ownerVerified, true);
assert.strictEqual(sali.rows[1].actionLabel, 'dated-commitment|task');
assert.strictEqual(sali.rows[1].expectedAction, 'task with the stated due date');
for (const row of sali.rows) assert.deepStrictEqual(validateRow(row), []);

const quiet = ingest({
  batch: tiny,
  answers: answers('sali', null, [{ item: 1, mark: '🤫' }, { item: 2, mark: '❓', note: 'later' }])
});
assert.strictEqual(quiet.rows.length, 1);
assert.strictEqual(quiet.excluded.length, 1);
assert.strictEqual(quiet.excluded[0].id, 'b');
assert.strictEqual(quiet.rows[0].ownerLabel, 'SILENT');
assert.strictEqual(quiet.rows[0].expectedAction, null);
assert.strictEqual(quiet.rows[0].wrongDoIt, true);
assert.strictEqual(quiet.rows[0].actionLabel, null);
assert.deepStrictEqual(validateRow(quiet.rows[0]), []);

let threw = false;
try {
  ingest({ batch: tiny, answers: answers('cos:david', { ownerVerified: true }, [{ item: 1, mark: '✅' }, { item: 2, mark: '🤫' }]) });
} catch (e) { threw = e.code === 'NOT_OWNER'; }
assert.strictEqual(threw, true, 'non-owner ownerVerified must throw');

threw = false;
try {
  ingest({
    batch: tiny,
    answers: answers('cos:david', null, [
      { item: 1, mark: '✅', ownerVerified: true },
      { item: 2, mark: '🤫' }
    ])
  });
} catch (e) { threw = e.code === 'NOT_OWNER'; }
assert.strictEqual(threw, true, 'per-answer ownerVerified must throw');

const cos = ingest({
  batch: tiny,
  preview: true,
  answers: answers('sali', { provisional: true }, [{ item: 1, mark: '✅' }, { item: 2, mark: '🤫' }])
});
assert.strictEqual(cos.rows.every((r) => r.ownerVerified === false), true);
assert.strictEqual(cos.provisional, true);
assert.ok(cos.rows[0].notes.indexOf('provisional / not owner-verified') >= 0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gold-'));
const bad = path.join(dir, 'bad.json');
const out = path.join(dir, 'should-not-exist.jsonl');
fs.writeFileSync(bad, JSON.stringify(answers('cos:david', { ownerVerified: true }, [{ item: 1, mark: '✅' }])));
const cli = spawnSync(process.execPath, [path.join(HERE, 'ingest-answers.cjs'), '--answers', bad, '--batch', path.join(HERE, 'batch-001.json'), '--out', out], { encoding: 'utf8' });
assert.strictEqual(cli.status, 2, cli.stderr);
assert.strictEqual(fs.existsSync(out), false);

const batch = loadBatch(path.join(HERE, 'batch-001.json'));
const prefill = readJson(path.join(HERE, 'batch-001-cos-prefill.answers.json'));
const preview = ingest({ batch, answers: prefill, preview: true });
assert.strictEqual(preview.rows.length, 17);
assert.strictEqual(preview.excluded.length, 2);
assert.deepStrictEqual(preview.excluded.map((e) => e.item).sort((a, b) => a - b), [8, 17]);
assert.strictEqual(preview.ownerVerifiedCount, 0);
assert.ok(preview.excluded.find((e) => e.item === 17).note.indexOf('OneDrive') >= 0 || preview.excluded.find((e) => e.item === 17).note.indexOf('One Drive') >= 0);
const first = preview.rows.find((r) => r.id === 'v2syn-20323');
assert.strictEqual(first.ownerLabel, 'ASK');
assert.strictEqual(first.actionLabel, 'follow-up-ask|draft');
assert.strictEqual(first.labeledBy, 'cos:david');
const silent = preview.rows.find((r) => r.id === 'v2syn-9371');
assert.strictEqual(silent.ownerLabel, 'SILENT');
assert.strictEqual(silent.wrongDoIt, true);
for (const row of preview.rows) assert.deepStrictEqual(validateRow(row), [], row.id);
assert.ok(!preview.rows.some((r) => r.id === 'v2syn-405' || r.id === 'v2syn-24392'));

for (const line of readJsonl(path.join(HERE, 'gold-template.jsonl'))) assert.deepStrictEqual(validateRow(line), [], line.id);

const goldBefore = fs.readFileSync(GOLD, 'utf8');
assert.strictEqual(goldBefore.trim(), '');

const b2 = loadBatch(path.join(HERE, 'batch-002.json'));
assert.strictEqual(b2.length, 20);
assert.ok(b2.every((r) => r.batchName === 'batch-002'));
assert.ok(b2.every((r) => r.ownerAnswer == null && r.reference && r.reference.ownerVerified === false));
assert.strictEqual(new Set(b2.map((r) => r.id)).size, 20);
const b1ids = new Set(batch.map((r) => r.id));
assert.ok(b2.every((r) => !b1ids.has(r.id)));
const empty = readJson(path.join(HERE, 'batch-002.answers.json'));
assert.strictEqual(empty.labeledBy, '');
assert.ok(empty.answers.every((a) => a.mark == null));

function markFor(r) {
  if (r.v2 && r.v2 !== 'SILENT') return '✅';
  if ((r.engineTip || r.engine35) && (r.engineTip || r.engine35) !== 'SILENT') return '⚙️';
  return '🤫';
}
const fake = answers('cos:not-sali', { provisional: true }, b2.map((r) => ({
  item: r.item, id: r.id, mark: r.item === 1 ? '❓' : markFor(r), note: r.item === 1 ? 'skip' : ''
})));
const b2in = ingest({ batch: b2, answers: fake, preview: true });
assert.strictEqual(b2in.ownerVerifiedCount, 0);
assert.strictEqual(b2in.excluded.length, 1);
assert.strictEqual(b2in.excluded[0].id, b2[0].id);
assert.ok(b2in.rows.every((r) => r.ownerVerified === false));
assert.ok(b2in.rows.every((r) => r.labeledBy === 'cos:not-sali'));
assert.ok(b2in.rows.every((r) => r.notes.indexOf('batch-002 item') >= 0));
assert.ok(b2in.rows.every((r) => r.importedFrom.indexOf('labeling/batch-002.json#item-') === 0));
assert.ok(!b2in.rows.some((r) => r.id === b2[0].id));
for (const row of b2in.rows) assert.deepStrictEqual(validateRow(row), [], row.id);

const both = loadBatches([path.join(HERE, 'batch-001.json'), path.join(HERE, 'batch-002.json')]);
assert.strictEqual(both.length, 39);
let amb = false;
try {
  ingest({
    batch: both,
    answers: answers('cos:not-sali', null, [{ item: 1, mark: '🤫' }])
  });
} catch (e) { amb = e.code === 'AMBIGUOUS'; }
assert.strictEqual(amb, true, 'item 1 without an id must fail when both batches are loaded');

const combined = ingest({
  batch: both,
  preview: true,
  answers: answers('cos:not-sali', { provisional: true }, both.map((r) => ({
    id: r.id,
    mark: (r.id === 'v2syn-405' || r.id === b2[0].id) ? '❓' : markFor(r)
  })))
});
assert.strictEqual(combined.ownerVerifiedCount, 0);
assert.ok(combined.rows.every((r) => r.ownerVerified === false));
assert.strictEqual(combined.excluded.length, 2);
assert.ok(combined.excluded.some((e) => e.id === 'v2syn-405'));
assert.ok(combined.excluded.some((e) => e.id === b2[0].id));
assert.ok(combined.rows.some((r) => r.importedFrom.indexOf('batch-001.json') >= 0));
assert.ok(combined.rows.some((r) => r.importedFrom.indexOf('batch-002.json') >= 0));
assert.strictEqual(fs.readFileSync(GOLD, 'utf8'), goldBefore);

const { PREVIEW_DOC, run } = require('./apply-owner-answers.cjs');
const previewBefore = fs.readFileSync(PREVIEW_DOC, 'utf8');
const provBefore = fs.readFileSync(path.join(HERE, 'preview', 'provisional-rows.jsonl'), 'utf8');
const exclBefore = fs.readFileSync(path.join(HERE, 'preview', 'excluded-unsure.jsonl'), 'utf8');
const fakePath = path.join(dir, 'batch-002-fake.answers.json');
fs.writeFileSync(fakePath, JSON.stringify(fake));
const ran = run(['node', 'apply', '--answers', fakePath, '--batch', 'batch-002.json', '--preview', '--no-fit']);
assert.strictEqual(ran.score.ownerVerified, 0);
assert.strictEqual(ran.excluded.length, 1);
assert.strictEqual(fs.readFileSync(PREVIEW_DOC, 'utf8'), previewBefore);
assert.strictEqual(fs.readFileSync(path.join(HERE, 'preview', 'provisional-rows.jsonl'), 'utf8'), provBefore);
assert.strictEqual(fs.readFileSync(path.join(HERE, 'preview', 'excluded-unsure.jsonl'), 'utf8'), exclBefore);
assert.strictEqual(fs.readFileSync(GOLD, 'utf8'), goldBefore);
fs.rmSync(path.join(HERE, 'preview', 'batch-002-score.json'), { force: true });
fs.rmSync(path.join(HERE, 'preview', 'batch-002-provisional-rows.jsonl'), { force: true });
fs.rmSync(path.join(HERE, 'preview', 'batch-002-excluded-unsure.jsonl'), { force: true });
fs.rmSync(path.join(HERE, 'dry-run', 'batch-002-heldout-before-after.json'), { force: true });

console.log('ingest tests passed');
