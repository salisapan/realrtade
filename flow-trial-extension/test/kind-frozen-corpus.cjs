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
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
