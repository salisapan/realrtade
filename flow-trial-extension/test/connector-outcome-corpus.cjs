// Learning hook: events carry no text, off emits nothing, and each conclusion moves the next offer the expected way
// while the floor stays out of reach. No network.
const assert = require('assert');
const { FlowConnectorOutcome: O } = require('../core/connector-outcome.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const ev = (connector, stage, extra) => O.buildEvent(Object.assign({ connector, closeType: 'task', stage, at: 1000, lang: 'he' }, extra));

ok('a clean event has only the allowed keys', () => {
  const e = ev('notion', 'approved', { latencyMs: 1200, destinationSystem: 'notion/page' });
  assert.deepStrictEqual(Object.keys(e).sort(), ['at', 'closeType', 'connector', 'destinationSystem', 'lang', 'latencyMs', 'stage']);
});
ok('text, address and title cannot ride along (extra keys dropped, sentence-like values rejected)', () => {
  const e = ev('notion', 'approved', { title: 'Send Dana the contract', email: 'dana@x.com', text: 'secret', destinationSystem: 'Send Dana the contract please' });
  const s = JSON.stringify(e);
  ['Dana', 'dana@x.com', 'secret', 'contract'].forEach((w) => assert.ok(s.indexOf(w) < 0, w));
  assert.strictEqual(e.destinationSystem, 'notion');
  assert.strictEqual(O.buildEvent({ connector: 'notion', closeType: 'שלח לדנה', stage: 'approved', at: 1 }), null);
  assert.strictEqual(O.buildEvent({ connector: 'dana@x.com', closeType: 'task', stage: 'approved', at: 1 }), null);
});
ok('switch off emits nothing', () => { assert.strictEqual(O.buildEvent({ connector: 'notion', closeType: 'task', stage: 'offered', at: 1 }, { enabled: false }), null); });
ok('unknown stage or missing time is not an event', () => {
  assert.strictEqual(ev('notion', 'sent'), null);
  assert.strictEqual(O.buildEvent({ connector: 'notion', closeType: 'task', stage: 'offered' }), null);
});
ok('every stage is emittable', () => { O.STAGES.forEach((s) => assert.ok(ev('notion', s), s)); });
ok('list is capped, newest kept', () => {
  let l = []; for (let i = 0; i < O.CAP + 50; i++) l = O.append(l, O.buildEvent({ connector: 'notion', closeType: 'task', stage: 'offered', at: i }));
  assert.strictEqual(l.length, O.CAP); assert.strictEqual(l[l.length - 1].at, O.CAP + 49);
});
ok('destination order: little history keeps the caller order', () => {
  assert.deepStrictEqual(O.destinationOrder([ev('notion', 'approved')], 'task', ['googletasks', 'notion']), ['googletasks', 'notion']);
});
ok('destination order moves toward where this person approves and keeps proven closes', () => {
  const h = [];
  for (let i = 0; i < 4; i++) { h.push(ev('notion', 'approved')); h.push(ev('notion', 'handled')); }
  h.push(ev('googletasks', 'approved')); h.push(ev('googletasks', 'undone')); h.push(ev('googletasks', 'undone'));
  assert.deepStrictEqual(O.destinationOrder(h, 'task', ['googletasks', 'notion']), ['notion', 'googletasks']);
});
ok('close type trust: repeated undo lowers the offer, one hasty undo does not', () => {
  assert.strictEqual(O.offerLevel([ev('notion', 'undone')], 'notion', 'task'), 'normal');
  const few = [ev('notion', 'approved'), ev('notion', 'approved'), ev('notion', 'approved'), ev('notion', 'undone')];
  assert.strictEqual(O.offerLevel(few, 'notion', 'task'), 'normal');
  const mid = [ev('notion', 'approved'), ev('notion', 'approved'), ev('notion', 'undone'), ev('notion', 'undone')];
  assert.strictEqual(O.offerLevel(mid, 'notion', 'task'), 'reduced');
  const bad = [ev('notion', 'approved'), ev('notion', 'undone'), ev('notion', 'undone'), ev('notion', 'undone'), ev('notion', 'undone')];
  assert.strictEqual(O.offerLevel(bad, 'notion', 'task'), 'withhold');
});
ok('trust is per close type and per connector', () => {
  const bad = []; for (let i = 0; i < 6; i++) bad.push(ev('notion', 'undone'));
  assert.strictEqual(O.offerLevel(bad, 'notion', 'file'), 'normal');
  assert.strictEqual(O.offerLevel(bad, 'asana', 'task'), 'normal');
});
ok('vendor failure memory: two read-back failures in the last three means caution; a recovery clears it', () => {
  const f = [ev('notion', 'handled'), ev('notion', 'readback_failed'), ev('notion', 'readback_failed')];
  assert.strictEqual(O.vendorFailure(f, 'notion').caution, true);
  assert.strictEqual(O.vendorFailure(f.concat([ev('notion', 'handled')]), 'notion').caution, false);
  assert.strictEqual(O.vendorFailure([ev('notion', 'readback_failed')], 'notion').caution, false);
});
ok('median latency of proven closes', () => {
  const l = [ev('notion', 'handled', { latencyMs: 900 }), ev('notion', 'handled', { latencyMs: 300 }), ev('notion', 'handled', { latencyMs: 600 }), ev('notion', 'approved', { latencyMs: 9999 })];
  assert.strictEqual(O.medianLatencyMs(l, 'notion'), 600);
});
console.log('\n' + n + ' passed');
