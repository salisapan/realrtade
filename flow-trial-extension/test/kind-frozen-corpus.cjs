// The kind-level frozen set v0 (glance-ai/labeling/kind-frozen/): hand-written, held out, never trained on and never tuned against. This corpus is a ratchet, not a
// target: no contrast row may be offered (a wrong Do It), and recall on the rows with a close may not fall below what it was when the set was last read. A row that exposes
// a fixable shape moves to the probe set and is replaced here (see the header of the set). Run: node test/kind-frozen-corpus.cjs
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const run = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
check('the kind-frozen run works', run.status === 0, run.stderr && run.stderr.slice(0, 300));
const j = JSON.parse(run.stdout || '{"out":{},"detail":[],"tot":{}}');
const offered = j.detail.filter((d) => d[3] === 'none' && d[4] !== 'none');
check('no contrast row is offered (a wrong Do It)', offered.length === 0, offered.map((d) => d.slice(0, 5)));
check('recall on rows with a close is at least 67 of 89', j.tot.posN === 89 && j.tot.posRight >= 67, j.tot);
check('50 contrast rows', j.tot.negN === 50, j.tot);

// v1: the clean set for the next head (v0 is spent for the V24 head). Aggregate only: its miss list is not read while a model is built.
const run1 = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json', '--v1'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const j1 = JSON.parse(run1.stdout || '{"detail":[],"tot":{}}');
check('v1: no contrast row is offered (a wrong Do It)', j1.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0 && j1.tot.negN === 36, j1.tot);
check('v1: recall on rows with a close is at least 54 of 70', j1.tot.posN === 70 && j1.tot.posRight >= 54, j1.tot);


// As shipped: every Labs switch OFF, the readers behind a switch not called (what a person sees with no setup). A ratchet on the default product: no wrong Do It, and recall may not fall.
const shipped = (flag) => { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { GLANCE_SHIPPED: '1' }) }); return JSON.parse(r.stdout || '{"detail":[],"tot":{}}'); };
const s0 = shipped(''), s1 = shipped('--v1');
check('as shipped: no contrast row is offered, on v0 or v1', s0.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0 && s1.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0, [s0.tot, s1.tot]);
check('as shipped: recall on v0 is at least 28 of 89 and on v1 at least 21 of 70 (with every switch on: 67 and 54)', s0.tot.posRight >= 28 && s1.tot.posRight >= 21, [s0.tot.posRight, s1.tot.posRight]);


// With the first wave the owner turned on (core/labs-seed.js: TASK_ASK, PAYMENT_ASK, BOOKING_NOTICE, SYSTEM_NOTICE) and the rest off: what a non-store install shows after setup-free install.
const wave1 = (flag) => { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { GLANCE_SHIPPED: 'wave1' }) }); return JSON.parse(r.stdout || '{"detail":[],"tot":{}}'); };
const w0 = wave1(''), w1 = wave1('--v1');
check('wave 1: no contrast row is offered, on v0 or v1', w0.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0 && w1.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0, [w0.tot, w1.tot]);
check('wave 1: recall on v0 is at least 54 of 89 and on v1 at least 41 of 70 (all switches on: 67 and 54; none: 28 and 21)', w0.tot.posRight >= 54 && w1.tot.posRight >= 41, [w0.tot.posRight, w1.tot.posRight]);

// Wave 2 (core/labs-seed.js: WORKSPACE_FILE, MEET_LINK, TEAMS_MEETING, ONEDRIVE_NEW_FILE on top of wave 1): a non-store install now reads what every switch on reads on these sets.
const wave2 = (flag) => { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { GLANCE_SHIPPED: 'wave2' }) }); return JSON.parse(r.stdout || '{"detail":[],"tot":{}}'); };
const x0 = wave2(''), x1 = wave2('--v1');
check('wave 2: no contrast row is offered and no wrong Do It, on v0 or v1', x0.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0 && x1.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0 && !x0.tot.wrong && !x1.tot.wrong, [x0.tot, x1.tot]);
check('wave 2: recall on v0 is at least 67 of 89 and on v1 at least 54 of 70 (the same as every switch on)', x0.tot.posRight >= 67 && x1.tot.posRight >= 54, [x0.tot.posRight, x1.tot.posRight]);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
