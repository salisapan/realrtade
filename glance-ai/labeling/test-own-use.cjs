'use strict';
// Path A ingest. Agents never set ownerVerified. Private text never lands in the aggregate.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const L = require('./lib.cjs');
const I = require('./ingest-own-use.cjs');

const SECRET = 'SECRET_SENTENCE_please_send_the_licence_photo';
const proof = { system: 'google/tasks', externalId: 'task-secret-99', fetchedBack: true, verifiedAt: '2026-10-14T08:00:00Z' };

function ev(extra) {
  return Object.assign({
    closeType: 'follow-up-ask',
    proposed: 'follow-up-ask|draft',
    decision: 'approved',
    proof: Object.assign({}, proof),
    lang: 'en',
    at: '2026-10-14T08:00:00Z',
    maskedSentence: SECRET
  }, extra);
}

const approved = I.ingestEvents([ev({ id: 'e1' })]);
assert.strictEqual(approved.rows.length, 1);
assert.strictEqual(approved.rows[0].labeledBy, 'sali:action');
assert.strictEqual(approved.rows[0].source, 'own-use');
assert.strictEqual(approved.rows[0].ownerVerified, true);
assert.strictEqual(approved.rows[0].maskedSentence, SECRET);
assert.strictEqual(L.isOwnerVerified(approved.rows[0]), true);

const ignoredFlag = I.ingestEvents([ev({ id: 'e2', ownerVerified: true, decision: 'approved', proof: Object.assign({}, proof, { fetchedBack: false }) })]);
assert.strictEqual(ignoredFlag.rows[0].ownerVerified, false, 'the file flag is ignored; missing read-back does not qualify');
assert.strictEqual(L.isOwnerVerified(ignoredFlag.rows[0]), false);

const handled = I.ingestEvents([ev({ id: 'h1', decision: 'handled', closeType: 'dated-commitment' })]);
assert.strictEqual(handled.rows[0].ownerVerified, true);
const handledMiss = I.ingestEvents([ev({ id: 'h2', decision: 'Handled', fetchedBack: false, proof: Object.assign({}, proof, { fetchedBack: false }) })]);
assert.strictEqual(handledMiss.rows[0].decision, 'handled');
assert.strictEqual(handledMiss.rows[0].ownerVerified, false);

const undone = I.ingestEvents([ev({ id: 'u1', decision: 'undo', proof: Object.assign({}, proof, { fetchedBack: false }) })]);
assert.strictEqual(undone.rows[0].decision, 'undone');
assert.strictEqual(undone.rows[0].ownerVerified, true);

const weak = I.ingestEvents([ev({ id: 'i1', decision: 'ignored' })]);
assert.strictEqual(weak.rows[0].ownerVerified, false);

const bools = I.ingestEvents([Object.assign(ev({ id: 'b1' }), { decision: undefined, approved: true })]);
assert.strictEqual(bools.rows[0].decision, 'approved');
assert.strictEqual(bools.rows[0].ownerVerified, true);

let threw = false;
try { I.ingestEvents([ev({ id: 'c1', labeledBy: 'claude', ownerVerified: true })]); }
catch (e) { threw = e.code === 'NOT_OWNER'; }
assert.strictEqual(threw, true, 'claude cannot set ownerVerified');

for (const by of ['cursor', 'cos:david', 'cto', 'agreement:pass1+pass2', 'agent', 'gpt-4', 'grok', 'automation']) {
  let bad = false;
  try { I.ingestEvents([ev({ labeledBy: by, ownerVerified: true })]); }
  catch (e) { bad = e.code === 'NOT_OWNER'; }
  assert.strictEqual(bad, true, by + ' must not set ownerVerified');
}

const hand = I.ingestEvents([ev({ id: 'hand', labeledBy: 'sali', ownerVerified: true })]);
assert.strictEqual(hand.rows.length, 0, 'a hand label is not rewritten into sali:action');
assert.strictEqual(hand.skippedHand, 1);

const dup = I.ingestEvents([ev({ id: 'same' }), ev({ id: 'same', decision: 'undone' })]);
assert.strictEqual(dup.rows.length, 1);
assert.strictEqual(dup.rows[0].decision, 'approved');

const mixed = I.ingestEvents([
  ev({ id: 'old', at: '2026-10-13T08:00:00Z', proof: Object.assign({}, proof, { verifiedAt: '2026-10-13T08:00:00Z' }) }),
  ev({ id: 'new', at: '2026-10-14T08:00:00Z' })
]);
assert.strictEqual(mixed.rows[0].holdOutFromTraining, false);
assert.strictEqual(mixed.rows[1].holdOutFromTraining, true);
assert.strictEqual(mixed.rows[1].ownerVerified, true, 'held out of training, still a label');

const agg = I.buildAggregate({ rows: mixed.rows, exportFound: true, events: 2, asOf: '2026-10-14' });
I.assertNoPrivate(agg, [ev({ id: 'old' }), ev({ id: 'new' })]);
assert.strictEqual(agg.qualifying, 2);
assert.strictEqual(agg.minOwner, 200);
assert.strictEqual(agg.remaining, 198);
assert.strictEqual(agg.byLoopType['follow-up-ask'], 2);
assert.ok(agg.lackingLoopTypes.indexOf('drive-file') >= 0);
assert.ok(agg.lackingLoopTypes.indexOf('calendar-hold') >= 0);
assert.strictEqual(agg.privateTextCommitted, false);
assert.strictEqual(JSON.stringify(agg).indexOf(SECRET), -1);
assert.strictEqual(JSON.stringify(agg).indexOf('task-secret-99'), -1);

const none = I.buildAggregate({ rows: [], exportFound: false, events: 0, asOf: '2026-10-14' });
assert.strictEqual(none.qualifying, 0);
assert.strictEqual(none.remaining, 200);
assert.deepStrictEqual(none.lackingLoopTypes, I.LOOP_TYPES);

let outside = false;
try { I.assertGitignoredPrivate(path.join(os.tmpdir(), 'own-use-labels.jsonl')); }
catch (e) { outside = e.code === 'PRIVACY'; }
assert.strictEqual(outside, true);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'own-use-'));
const exportFile = path.join(tmp, 'export.jsonl');
fs.writeFileSync(exportFile, JSON.stringify(ev({ id: 'cli1', closeType: 'drive-file', decision: 'edited' })) + '\n');
const aggPath = path.join(tmp, 'agg.json');
const cli = cp.spawnSync(process.execPath, [path.join(__dirname, 'ingest-own-use.cjs'), '--export', exportFile, '--aggregate', aggPath, '--private', path.join(I.PRIVATE_DIR, 'own-use-test-secret.jsonl'), '--asOf', '2026-10-14'], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
assert.strictEqual(cli.stdout.indexOf(SECRET), -1);
const written = JSON.parse(fs.readFileSync(aggPath, 'utf8'));
assert.strictEqual(written.qualifying, 1);
assert.strictEqual(written.byLoopType['drive-file'], 1);
assert.ok(written.lackingLoopTypes.indexOf('follow-up-ask') >= 0);
assert.strictEqual(JSON.stringify(written).indexOf(SECRET), -1);
const priv = path.join(I.PRIVATE_DIR, 'own-use-test-secret.jsonl');
assert.ok(fs.existsSync(priv));
const ignore = cp.spawnSync('git', ['check-ignore', '-q', priv], { cwd: path.join(__dirname, '..', '..') });
assert.strictEqual(ignore.status, 0, 'private labels must be gitignored');
fs.rmSync(priv, { force: true });

const agentFile = path.join(tmp, 'agent.jsonl');
fs.writeFileSync(agentFile, JSON.stringify(ev({ labeledBy: 'claude' })) + '\n');
const agentCli = cp.spawnSync(process.execPath, [path.join(__dirname, 'ingest-own-use.cjs'), '--export', agentFile, '--aggregate', path.join(tmp, 'nope.json')], { encoding: 'utf8' });
assert.strictEqual(agentCli.status, 2);
assert.strictEqual(fs.existsSync(path.join(tmp, 'nope.json')), false);

console.log('own-use tests passed');
