// Integrity of the synthetic ClickUp loop data (docs/glance-ai/connectors/clickup.md §8): at least 30 labelled synthetic training
// candidates, a disjoint held-out set, nothing owner-verified, nothing private, no overlap with any other evaluation set, and the
// held-out precision gate pinned at 1.00 for the pipeline. This test never trains and never changes weights.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FX = path.join(__dirname, 'fixtures');
const train = require('./fixtures/intent-clickup-synthetic.json');
const held = require('./fixtures/intent-clickup-heldout.json');
const { FlowIntentModel: M } = require('../core/intent-model.js');
const { FlowIntentWeights: W } = require('../core/intent-model-weights.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');
M.load(W);
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK'];
const ACTIONS = ['pay', 'sign', 'approve', 'confirm', 'schedule', 'decide', 'review', 'join', 'complete', 'send', 'reply', 'none'];

ok('at least 30 training candidates and 10 held-out cases', () => { assert.ok(train.length >= 30, train.length); assert.ok(held.length >= 10, held.length); });
ok('every row is labelled, marked synthetic, never owner-verified, and names the tool', () => {
  train.concat(held).forEach((g) => {
    assert.ok(g.t && ACTS.indexOf(g.act) >= 0 && ACTIONS.indexOf(g.action) >= 0 && (g.lang === 'en' || g.lang === 'he'), g.t);
    assert.strictEqual(g.synthetic, true, g.t); assert.strictEqual(g.ownerVerified, false, g.t);
    assert.ok(/^synthetic-/.test(g.src), g.t); assert.strictEqual(g.entities.tool, 'clickup', g.t);
    assert.ok(/clickup/i.test(g.t), g.t);
    if (g.act === 'INFORM' || g.act === 'ACK') assert.strictEqual(g.action, 'none', g.t);
  });
});
ok('both languages and all four acts are present in the training candidates; silence cases are a real share', () => {
  assert.ok(train.some((g) => g.lang === 'he') && train.some((g) => g.lang === 'en'));
  ACTS.forEach((a) => assert.ok(train.some((g) => g.act === a), a));
  assert.ok(train.filter((g) => g.act === 'INFORM' || g.act === 'ACK').length >= 8);
});
ok('the two sets are disjoint and carry no duplicates', () => {
  const a = new Set(train.map((g) => norm(g.t))); assert.strictEqual(a.size, train.length);
  const b = new Set(held.map((g) => norm(g.t))); assert.strictEqual(b.size, held.length);
  held.forEach((g) => assert.ok(!a.has(norm(g.t)), g.t));
});
ok('no sentence is in any other fixture (gold, blind, teacher evals, real-mail, reply sets)', () => {
  const mine = new Set(train.concat(held).map((g) => norm(g.t)));
  fs.readdirSync(FX).filter((f) => /\.json$/.test(f) && !/clickup/.test(f)).forEach((f) => {
    let rows; try { rows = JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')); } catch (e) { return; }
    (Array.isArray(rows) ? rows : []).forEach((r) => { const t = r && (r.t || r.text); if (t) assert.ok(!mine.has(norm(t)), f + ': ' + t); });
  });
});
ok('nothing private: no address, phone number or link in the synthetic text', () => {
  train.concat(held).forEach((g) => { assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(g.t) && !/https?:\/\//.test(g.t) && !/\d{3}[- ]?\d{3,}[- ]?\d{3,}/.test(g.t), g.t); });
});
ok('held-out pipeline precision for ASK and PROMISE is pinned at 1.00 (a gate; never lowered to raise recall)', () => {
  ['ASK', 'PROMISE'].forEach((cls) => {
    let tp = 0, fp = 0;
    held.forEach((g) => { const r = P.recognize(g.t); const p = r.unsure ? 'X' : r.act; if (p === cls) { if (g.act === cls) tp++; else fp++; } });
    assert.strictEqual(fp, 0, cls + ' false positives on the held-out ClickUp set'); assert.ok(tp > 0, cls);
  });
});
console.log('\n' + n + ' passed');
