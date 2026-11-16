'use strict';
// node glance-ai/labeling/test-own-use.cjs : path A. A Claude label can never carry sali:action, and a row without read-back proof never qualifies.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const L = require('./lib.cjs'), { convert } = require('./ingest-own-use.cjs');
const G = require('../oss/finetune/promote_gate.cjs');
let n = 0; const t = (name, f) => { f(); n++; console.log('PASS: ' + name); };
const proof = { system: 'google-tasks', externalId: 'abc', fetchedBack: true, verifiedAt: '2026-11-11T10:00:00Z' };
const good = { id: 'o1', lang: 'he', maskedText: 'תוכל לשלוח לי את החשבונית?', proposedStep: 'draft', decision: 'approve', proof };
t('an approve with read-back proof is owner-verified by action', () => {
  const r = convert([good]).rows[0];
  assert.strictEqual(r.ownerVerified, true); assert.strictEqual(r.labeledBy, 'sali:action'); assert.strictEqual(r.source, 'own-use'); assert.strictEqual(r.step, 'draft');
  assert.deepStrictEqual(L.validateRow(Object.assign({}, r)).filter((e) => /ownerVerified true but/.test(e)), []);
});
t('an edit keeps the proposed step (right in kind) and is marked edited', () => { const r = convert([Object.assign({}, good, { id: 'o2', decision: 'edit' })]).rows[0]; assert.strictEqual(r.step, 'draft'); assert.strictEqual(r.edited, true); assert.strictEqual(r.ownerVerified, true); });
t('without read-back proof nothing qualifies', () => {
  for (const p of [undefined, {}, Object.assign({}, proof, { fetchedBack: false }), Object.assign({}, proof, { externalId: '' }), Object.assign({}, proof, { verifiedAt: 'yesterday' })]) {
    const res = convert([Object.assign({}, good, { proof: p })]); assert.strictEqual(res.rows.length, 0); assert.strictEqual(res.excluded['no-read-back-proof'], 1);
  }
});
t('an undo is a negative, never gold: UNSURE, not owner-verified, the wrong step recorded', () => { const r = convert([Object.assign({}, good, { id: 'o3', decision: 'undo' })]).rows[0]; assert.strictEqual(r.step, 'UNSURE'); assert.strictEqual(r.ownerVerified, false); assert.strictEqual(r.negative, 'draft'); });
t('ignored is left out', () => assert.strictEqual(convert([Object.assign({}, good, { decision: 'ignored' })]).rows.length, 0));
t('a Claude or agreement label can never carry the own-use source', () => {
  for (const by of ['claude', 'agreement:claude+claude-pass2', 'cto', 'sali']) {
    assert.strictEqual(L.isOwnUse({ labeledBy: by, source: 'own-use', proof, decision: 'approve' }), by === 'sali:action');
  }
  assert.ok(L.validateRow({ ownerVerified: true, labeledBy: 'claude', source: 'own-use', proof, decision: 'approve' }).some((e) => /ownerVerified true but labeledBy is not the owner/.test(e)));
  assert.strictEqual(L.isOwnUse({ labeledBy: 'sali:action', source: 'own-use', decision: 'approve' }), false, 'no proof');
  assert.strictEqual(L.isOwnUse({ labeledBy: 'sali:action', source: 'manual', proof, decision: 'approve' }), false, 'wrong source');
  assert.strictEqual(L.isOwnUse({ labeledBy: 'sali:action', source: 'own-use', proof, decision: 'undo' }), false, 'an undo is never gold');
});
t('the gate counts an own-use row only with proof; a forged sali:action row does not count', () => {
  const act = (f) => ({ decision: 'act', family: f }), sil = { decision: 'silent' };
  const cases = [{ id: 'a', lang: 'en', gold: { step: 'draft' }, prompt: { body: 'x' } }, { id: 'b', lang: 'en', gold: { step: 'SILENT' }, prompt: { body: 'y' } }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ou-')); const w = (f, rows) => { const p = path.join(dir, f); fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); return p; };
  const base = w('base.jsonl', [{ id: 'a', pred: sil }, { id: 'b', pred: sil }]), cand = w('cand.jsonl', [{ id: 'a', pred: act('reply') }, { id: 'b', pred: sil }]), cf = w('cases.jsonl', cases);
  const mk = (i, extra) => Object.assign({ id: 'o' + i, step: 'SILENT', ownerVerified: true, labeledBy: 'sali:action', source: 'own-use', decision: 'approve', proof }, extra);
  const real = w('real.jsonl', Array.from({ length: 200 }, (_, i) => mk(i)));
  const forged = w('forged.jsonl', Array.from({ length: 200 }, (_, i) => mk(i, { proof: undefined })));
  assert.strictEqual(G.run({ base, cand, cases: cf, labels: real }).ownerVerified, 200);
  assert.strictEqual(G.run({ base, cand, cases: cf, labels: forged }).ownerVerified, 0);
});
console.log('\n' + n + ' passed');
