// Regression corpus for core/classification-metrics.js — the pure
// computation behind item 4's real-usage telemetry: how often the free
// local pass (core/intent.js + core/judgment.js) is enough on its own, how
// often the one remote AI fallback attempt rescues what it missed, and how
// often nothing ever fires at all. Pure (no chrome.*), so this corpus can
// assert on exact numbers instead of "it didn't throw."
//
// Run: node test/classification-metrics-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'classification-metrics.js'), 'utf8'), sandbox, { filename: 'classification-metrics.js' });
const FlowClassificationMetrics = vm.runInContext('FlowClassificationMetrics', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('--- computeSnapshot: zero samples returns null rates, not fabricated 0%s ---\n');
{
  const empty = FlowClassificationMetrics.computeSnapshot({ localFired: 0, localMissed: 0, aiFired: 0, aiMissed: 0, recent: [] });
  check('totalScanned is 0', empty.totalScanned === 0, empty);
  check('localCoverageRate is null, not 0', empty.localCoverageRate === null, empty);
  check('aiCatchRate is null, not 0', empty.aiCatchRate === null, empty);
  check('totalMissRate is null, not 0', empty.totalMissRate === null, empty);

  const missing = FlowClassificationMetrics.computeSnapshot(undefined);
  check('a missing stats object is treated as all-zero, never throws', missing.totalScanned === 0 && missing.localCoverageRate === null, missing);
}

console.log('\n--- computeSnapshot: local pass alone, no AI fallback ever needed ---\n');
{
  const allLocal = FlowClassificationMetrics.computeSnapshot({ localFired: 40, localMissed: 0, aiFired: 0, aiMissed: 0 });
  check('totalScanned sums localFired + localMissed', allLocal.totalScanned === 40, allLocal);
  check('localCoverageRate is 100%', allLocal.localCoverageRate === 1, allLocal);
  check('aiCatchRate is null — no local misses means the fallback was never even reached', allLocal.aiCatchRate === null, allLocal);
  check('totalMissRate is 0% — nothing was ever fully missed', allLocal.totalMissRate === 0, allLocal);
}

console.log('\n--- computeSnapshot: a realistic mixed account ---\n');
{
  // 70 local hits, 30 the local pass missed — of those 30, the AI fallback
  // caught 20 and missed 10.
  const mixed = FlowClassificationMetrics.computeSnapshot({ localFired: 70, localMissed: 30, aiFired: 20, aiMissed: 10 });
  check('totalScanned is 100', mixed.totalScanned === 100, mixed);
  check('localCoverageRate is 70%', mixed.localCoverageRate === 0.7, mixed);
  check('aiCatchRate is 20/30 (two thirds)', Math.abs(mixed.aiCatchRate - (2 / 3)) < 1e-9, mixed);
  check('totalMissRate is 10%', mixed.totalMissRate === 0.1, mixed);
}

console.log('\n--- computeSnapshot: AI fallback never catches anything (all-miss account) ---\n');
{
  const allMiss = FlowClassificationMetrics.computeSnapshot({ localFired: 0, localMissed: 15, aiFired: 0, aiMissed: 15 });
  check('localCoverageRate is 0%, not null — there WERE samples, they just all needed the fallback', allMiss.localCoverageRate === 0, allMiss);
  check('aiCatchRate is 0% — the fallback was reached but caught nothing', allMiss.aiCatchRate === 0, allMiss);
  check('totalMissRate is 100%', allMiss.totalMissRate === 1, allMiss);
}

console.log('\n--- computeSnapshot: every returned rate is clamped into [0, 1] ---\n');
{
  // Defensive only — these counter relationships should never occur in
  // practice (aiFired/aiMissed can never legitimately exceed localMissed,
  // by how storage.js's recordClassificationOutcome increments them
  // together), but a rate must never read out of range even on
  // inconsistent input, the same defensive posture computeClosureRate
  // follows in core/pmf-metrics.js.
  const overshoot = FlowClassificationMetrics.computeSnapshot({ localFired: 5, localMissed: 5, aiFired: 20, aiMissed: 0 });
  check('aiCatchRate is clamped at 1 even if aiFired somehow exceeds localMissed', overshoot.aiCatchRate === 1, overshoot);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
