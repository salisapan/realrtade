'use strict';
// Tier-A logging tests: kill switch / consent gate, schema glance-shadow/2, enum guard fuzz, no raw text at rest, ring buffer
// (5,000 / 30 days), consent-off purge + shadowId rotation, tripwires (p95, error rate, weights sha256), timeout, outcome joiner,
// IndexedDB backend (fake-indexeddb), MV3 static safety. Writes test/out/log-tests.json. Exit 1 on any failure.
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = path.join(__dirname, '..', '..');
const { EVAL } = require(path.join(M, '..', 'paths.cjs'));
const P = require('../src/gs-prepare.js'), SW = require('../src/gs-sw.js'), LG = require('../src/gs-log.js');
const { loadCore, optsFor } = require('./core-loader.cjs');
const core = loadCore();
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'weights', 'manifest.json'), 'utf8'));
const loadWeights = (f) => Promise.resolve(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', f))).buffer);
const TAGS = Object.values(man.models).map((m) => m.tag);
const rows = fs.readFileSync(EVAL.v2Test(), 'utf8').trim().split('\n').slice(0, 400).map(JSON.parse);
// timing is covered by bench/; pin prepMs so unit tests don't flake on a cold/loaded box
// (first-ever prepare() includes JIT warm-up and measured >100 ms under load => 'timeout' record)
const SIS = rows.map((r) => Object.assign(P.prepare(r, optsFor(r, core)), { prepMs: 1 }));
const CFG = { verified: true, enabled: true, uploadEnabled: false, modelAllowlist: TAGS, sampleRate: 1, maxMsP95: 50, fetchedAt: '2026-10-08T00:00:00Z' };
const onKv = (extra) => LG.memoryKv(Object.assign({ 'consent.shadow': true, 'shadow.config': CFG }, extra || {}));
let clockMs = Date.parse('2026-10-08T09:00:00Z');
const now = () => clockMs;
const mk = (o) => SW.createRunner(Object.assign({ manifest: man, loadWeights, kv: onKv(), backend: LG.memoryBackend(), ext: '0.9.39', now }, o || {}));
const results = []; let failed = 0;
async function t(name, fn) { try { await fn(); results.push({ name, ok: true }); console.log('ok   ' + name); } catch (e) { failed++; results.push({ name, ok: false, err: String(e && e.stack || e) }); console.log('FAIL ' + name + '\n     ' + (e && e.message)); } }

(async () => {
  await t('off by default: no consent => nothing computed, stored or counted', async () => {
    const kv = LG.memoryKv({}), be = LG.memoryBackend(); const R = mk({ kv, backend: be });
    const o = await R.handle(SIS[0]); assert.strictEqual(o.skipped, 'no-consent'); assert.strictEqual(o.written, 0);
    assert.strictEqual(await be.countRecords(), 0); assert.deepStrictEqual(kv._dump(), {});
  });
  await t('kill switch layers (most restrictive wins)', async () => {
    const cases = [[{ 'shadow.kill': true }, 'kill-local'], [{ 'shadow.config': undefined }, 'no-config'], [{ 'shadow.config': Object.assign({}, CFG, { verified: false }) }, 'no-config'],
      [{ 'shadow.config': Object.assign({}, CFG, { enabled: false }) }, 'config-disabled'], [{ 'shadow.disabledUntil': clockMs + 1000 }, 'tripwire'], [{ 'consent.shadow': false, 'shadow.kill': true }, 'kill-local']];
    for (const [extra, want] of cases) {
      const init = Object.assign({ 'consent.shadow': true, 'shadow.config': CFG }, extra); Object.keys(init).forEach((k) => init[k] === undefined && delete init[k]);
      const be = LG.memoryBackend(); const o = await mk({ kv: LG.memoryKv(init), backend: be }).handle(SIS[0]);
      assert.strictEqual(o.skipped, want, JSON.stringify(extra)); assert.strictEqual(await be.countRecords(), 0);
    }
    const be = LG.memoryBackend(); const R = mk({ kv: onKv({ 'shadow.config': Object.assign({}, CFG, { modelAllowlist: [man.models.v2.tag] }) }), backend: be });
    await R.handle(SIS[0]); const recs = await R.log.readAll(); assert.strictEqual(recs.length, 1); assert.strictEqual(recs[0].candidate.model, man.models.v2.tag);
  });
  await t('happy path: one valid glance-shadow/2 record per model, v2 primary first, no features in tier A', async () => {
    const R = mk(); const o = await R.handle(SIS[0]); assert.strictEqual(o.written, 2);
    const recs = await R.log.readAll();
    assert.deepStrictEqual(recs.map((r) => r.candidate.model), [man.models.v2.tag, man.models.v21.tag]);
    for (const r of recs) { assert.strictEqual(R.log.validate(r), null); assert.ok(!('features' in r)); assert.strictEqual(r.v, 2); assert.match(r.msgKey, /^[0-9a-f]{64}$/); assert.strictEqual(recs[0].msgKey, r.msgKey); }
    assert.deepStrictEqual(recs[0].outcome, { shown: SIS[0].incumbent.show, doIt: false, fetchedBack: null, dismiss: false, undo: false, ignored: null, implicit: null });
  });
  await t('all 400 sample messages produce schema-valid records (800 records)', async () => {
    const R = mk(); let w = 0; for (const si of SIS) w += (await R.handle(si)).written; assert.strictEqual(w, 800);
    const sr = (await R.log.kv.get('shadow.schemaReject'))['shadow.schemaReject'] || 0; assert.strictEqual(sr, 0);
  });
  await t('enum guard: a body/subject string in ANY field never serializes; unknown keys and `features` are rejected', async () => {
    const R = mk(); await R.handle(SIS[1]); const base = (await R.log.readAll())[0];
    const texts = rows.slice(0, 60).flatMap((r) => [r.body, r.subject, r.cleanBody]).filter((s) => s && s.trim()).concat(['invoice', 'please send the W-9', 'שלח לי את החוזה', 'Dana', 'dana@example.com']);
    const leaves = []; (function walk(o, p) { for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object') walk(v, p.concat(k)); else leaves.push(p.concat(k)); } })(base, []);
    let tried = 0;
    for (const p of leaves) for (const s of texts) {
      const r = JSON.parse(JSON.stringify(base)); let o = r; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = s;
      assert.strictEqual(await R.log.serialize(r), null, 'serialized ' + p.join('.') + ' = ' + JSON.stringify(s).slice(0, 40)); tried++;
    }
    for (const extra of [{ features: [1, 2, 3] }, { subject: 'hi' }, { body: 'x' }]) assert.strictEqual(await R.log.serialize(Object.assign({}, base, extra)), null);
    const sr = (await R.log.kv.get('shadow.schemaReject'))['shadow.schemaReject']; assert.strictEqual(sr, tried + 3);
    assert.ok(tried > 1000, 'tried ' + tried);
  });
  await t('no raw text at rest: no body/subject n-gram, address or name in kv, ciphertext or decrypted records', async () => {
    const kv = onKv(), be = LG.memoryBackend(); const R = mk({ kv, backend: be });
    for (const si of SIS.slice(0, 300)) await R.handle(si);
    const raws = await be.allRecords();
    const blob = JSON.stringify(kv._dump()) + raws.map((r) => Buffer.from(r.ct).toString('latin1') + JSON.stringify(r.msgKey)).join('') + JSON.stringify(await R.log.readAll());
    for (const r of rows.slice(0, 300)) {
      const words = String(r.body).replace(/[\r\n\u00a0]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
      for (let i = 0; i + 2 < words.length; i++) { const g = words.slice(i, i + 3).join(' '); assert.ok(!blob.includes(g), 'leaked ' + g); }
      if (r.subject && r.subject.length >= 8) assert.ok(!blob.includes(r.subject), 'subject leaked');
      if (r.from && r.from.email) assert.ok(!blob.includes(r.from.email), 'address leaked');
      if (r.id) assert.ok(!blob.includes('"' + r.id + '"'), 'message id leaked');
    }
    assert.ok(!Buffer.from(raws[0].ct).toString('latin1').includes('glance') && !Buffer.from(raws[0].ct).toString('latin1').includes('incumbent'), 'record not encrypted');
  });
  await t('ring buffer: capped at 5,000 records, oldest dropped; 30-day retention', async () => {
    const be = LG.memoryBackend(); const R = mk({ backend: be });
    for (let i = 0; i < 2550; i++) await R.handle(SIS[i % SIS.length]);    // 5,100 records
    assert.strictEqual(await be.countRecords(), 5000);
    const ids = (await be.allRecords()).map((r) => r.id); assert.strictEqual(ids[0], 101);
    clockMs += 31 * 86400000; await R.handle(SIS[0]);
    assert.strictEqual(await be.countRecords(), 2); clockMs -= 31 * 86400000;
  });
  await t('consent off: purge store, rotate shadowId, consent.log entry (shadow-consent-v2)', async () => {
    const kv = onKv(), be = LG.memoryBackend(); const R = mk({ kv, backend: be });
    await R.handle(SIS[0]); const id1 = (await kv.get('shadow.id'))['shadow.id'];
    await R.log.setConsent(false); assert.strictEqual(await be.countRecords(), 0);
    assert.strictEqual((await R.handle(SIS[0])).skipped, 'no-consent');
    await R.log.setConsent(true); await R.handle(SIS[0]); const id2 = (await kv.get('shadow.id'))['shadow.id'];
    assert.ok(id1 && id2 && id1 !== id2, 'shadowId rotated');
    const log = (await kv.get('consent.log'))['consent.log']; assert.deepStrictEqual(log.map((x) => [x.tier, x.on, x.version]), [['A', false, 'shadow-consent-v2'], ['A', true, 'shadow-consent-v2']]);
  });
  await t('timeout: over 100 ms => candidate null, reason "timeout", still schema-valid', async () => {
    const R = mk(); await R.handle(Object.assign({}, SIS[2], { prepMs: 150 }));
    const recs = await R.log.readAll(); assert.strictEqual(recs.length, 2);
    for (const r of recs) { assert.strictEqual(r.candidate, null); assert.strictEqual(r.reason, 'timeout'); assert.strictEqual(R.log.validate(r), null); }
  });
  await t('tripwire: p95 > maxMsP95 over 200 messages disables shadow for 7 days', async () => {
    const kv = onKv(); const R = mk({ kv }); let tripped = null;
    for (let i = 0; i < 200 && !tripped; i++) tripped = (await R.handle(Object.assign({}, SIS[i], { prepMs: 70 }))).tripped;
    assert.strictEqual(tripped, 'p95'); const s = await kv.get(['shadow.disabledUntil', 'shadow.tripCount', 'shadow.tripReason']);
    assert.ok(s['shadow.disabledUntil'] - clockMs > 6.9 * 86400000); assert.strictEqual(s['shadow.tripCount'], 1);
    assert.strictEqual((await R.handle(SIS[0])).skipped, 'tripwire');
  });
  await t('tripwire: error rate > 1% disables', async () => {
    const kv = onKv(); const R = mk({ kv }); let tripped = null;
    for (let i = 0; i < 220 && !tripped; i++) tripped = (await R.handle(i % 30 === 0 ? Object.assign({}, SIS[i], { x2: null, x21: null }) : SIS[i])).tripped;
    assert.strictEqual(tripped, 'error-rate');
  });
  await t('tripwire: weights sha256 mismatch => no compute, disabled 7 days', async () => {
    const kv = onKv(); const bad = JSON.parse(JSON.stringify(man)); bad.models.v21.sha256 = '0'.repeat(64);
    const R = mk({ kv, manifest: bad }); const o = await R.handle(SIS[0]); assert.strictEqual(o.skipped, 'weights-sha');
    assert.strictEqual((await kv.get('shadow.tripReason'))['shadow.tripReason'], 'weights-sha');
  });
  await t('outcome joiner: receipt/undo booleans merge by msgKey; non-boolean patch rejected', async () => {
    const R = mk(); await R.handle(Object.assign({}, SIS[3], { messageId: 'm-77' }));
    assert.strictEqual(await R.log.recordOutcome(SIS[3].surface, 'm-77', { doIt: true, fetchedBack: true }), true);
    assert.strictEqual(await R.log.recordOutcome(SIS[3].surface, 'm-77', { doIt: 'yes please' }), false);
    const recs = await R.log.readAll(); assert.strictEqual(recs[0].outcome.doIt, true); assert.strictEqual(recs[0].outcome.fetchedBack, true);
  });
  await t('IndexedDB backend (fake-indexeddb): write, encrypt, cap, outcome, purge', async () => {
    let fake; try { fake = require('fake-indexeddb'); } catch (e) { throw new Error('fake-indexeddb missing: cd test && npm i'); }
    const be = LG.idbBackend(fake.indexedDB, 'glance-shadow-test-' + Date.now(), fake.IDBKeyRange);
    const R = mk({ backend: be, maxRecords: 50 });
    for (let i = 0; i < 30; i++) await R.handle(Object.assign({}, SIS[i], { messageId: 'idb-' + i }));
    assert.strictEqual(await be.countRecords(), 50);
    await R.log.recordOutcome(SIS[29].surface, 'idb-29', { dismiss: true });
    const recs = await R.log.readAll(); assert.strictEqual(recs.length, 50); assert.ok(recs.every((r) => R.log.validate(r) === null));
    assert.strictEqual(recs[recs.length - 1].outcome.dismiss, true);
    assert.strictEqual(await be.queueSize(), 0, 'tier A never writes the upload queue');
    await R.log.setConsent(false); assert.strictEqual(await be.countRecords(), 0);
  });
  await t('content-script pre-gate: same kill/consent/config/tripwire order; deterministic sampling', async () => {
    const H = require('../src/gs-hook.js'); const base = { 'consent.shadow': true, 'shadow.config': CFG };
    assert.strictEqual(H.preGate(base, 'm1', clockMs), true);
    assert.strictEqual(H.preGate(Object.assign({}, base, { 'shadow.kill': true }), 'm1', clockMs), false);
    assert.strictEqual(H.preGate(Object.assign({}, base, { 'consent.shadow': false }), 'm1', clockMs), false);
    assert.strictEqual(H.preGate({ 'consent.shadow': true }, 'm1', clockMs), false);
    assert.strictEqual(H.preGate(Object.assign({}, base, { 'shadow.disabledUntil': clockMs + 1 }), 'm1', clockMs), false);
    const half = Object.assign({}, base, { 'shadow.config': Object.assign({}, CFG, { sampleRate: 0.25 }) });
    let on = 0; for (let i = 0; i < 4000; i++) if (H.preGate(half, 'msg-' + i, clockMs)) on++;
    assert.ok(on > 850 && on < 1150, 'sampled ' + on); assert.strictEqual(H.preGate(half, 'msg-7', clockMs), H.preGate(half, 'msg-7', clockMs));
  });
  await t('MV3 static safety: no eval / Function / remote URL / XHR / WebSocket / importScripts in shipped src', async () => {
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'src'))) {
      const s = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const [n, rx] of [['eval', /\beval\s*\(/], ['Function', /new\s+Function|\bFunction\s*\(/], ['http url', /https?:\/\//], ['XHR', /XMLHttpRequest/], ['WebSocket', /WebSocket/], ['importScripts', /importScripts/], ['string timer', /set(?:Timeout|Interval)\s*\(\s*['"`]/]])
        assert.ok(!rx.test(s), f + ' uses ' + n);
    }
  });
  fs.writeFileSync(path.join(__dirname, 'out', 'log-tests.json'), JSON.stringify({ passed: results.filter((r) => r.ok).length, failed, results }, null, 1));
  console.log(JSON.stringify({ passed: results.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})();
