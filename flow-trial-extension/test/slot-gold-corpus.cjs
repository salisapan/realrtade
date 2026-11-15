// Slot accuracy (glance-ai/scoreboard/capabilities/slot-run.cjs): of the Do Its the union offers, does each write the RIGHT day, clock, amount and title? Two sets:
// the held-out slot gold (glance-ai/labeling/slot-gold/, never tuned against) and the development rows (slot-dev-v0.cjs, the shapes the held-out set exposed, now fixed).
// A right family with a wrong slot is the worst error a closer can make, so this is a ratchet: no offered row may carry a wrong slot, and the offered count may not fall.
// Run: node test/slot-gold-corpus.cjs
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const run = (flag) => { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'slot-run.cjs'), '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26 }); return { r, j: JSON.parse(r.stdout || '{"wrong":[],"silent":[],"tot":{},"stats":{}}') }; };
const held = run(''), dev = run('--dev');
check('the held-out slot run works', held.r.status === 0, held.r.stderr && held.r.stderr.slice(0, 300));
check('held-out: no offered Do It writes a wrong slot', held.j.wrong.length === 0, held.j.wrong);
check('held-out: at least 37 of 40 rows are offered', held.j.tot.offered >= 37, held.j.tot);
check('held-out: every day, clock, amount, currency, title and old slot checked is right', Object.values(held.j.stats).every(([r, n]) => r === n), held.j.stats);
check('development rows: all offered, all slots right', dev.j.tot.offered === dev.j.tot.n && dev.j.wrong.length === 0, [dev.j.tot, dev.j.wrong, dev.j.silent]);
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
