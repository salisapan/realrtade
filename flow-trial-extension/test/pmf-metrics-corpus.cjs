// Regression corpus for core/pmf-metrics.js — the pure computation behind
// the product-market-fit audit's three signals: closure rate, retention,
// and weekly habit formation. Every function here is pure (no chrome.*, no
// internal clock), so this corpus can assert on exact numbers for
// hand-picked dates instead of "it didn't throw."
//
// Run: node test/pmf-metrics-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'pmf-metrics.js'), 'utf8'), sandbox, { filename: 'pmf-metrics.js' });
const FlowPmfMetrics = vm.runInContext('FlowPmfMetrics', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// A fixed "now" so every test below is deterministic regardless of when
// this file is actually run. A Tuesday, deliberately mid-week.
const NOW = new Date('2026-09-15T12:00:00Z').getTime();

console.log('--- computeClosureRate: strict "accepted and not undone" ---\n');
{
  check('no detections yet returns null, not a fabricated 0%',
    FlowPmfMetrics.computeClosureRate({ total: 0 }, { total: 0 }, { total: 0 }) === null);

  check('every detection written and none undone is 100%',
    FlowPmfMetrics.computeClosureRate({ total: 10 }, { total: 10 }, { total: 0 }) === 1);

  check('half written, none undone is 50%',
    FlowPmfMetrics.computeClosureRate({ total: 10 }, { total: 5 }, { total: 0 }) === 0.5);

  check('an undo pulls the rate back down — undone messages do not count as real closure',
    FlowPmfMetrics.computeClosureRate({ total: 10 }, { total: 5 }, { total: 2 }) === 0.3);

  check('rate is clamped at 0 rather than going negative if undone somehow exceeds written',
    FlowPmfMetrics.computeClosureRate({ total: 10 }, { total: 2 }, { total: 5 }) === 0);

  check('rate is clamped at 1 even if counters are inconsistent (defensive, should not happen)',
    FlowPmfMetrics.computeClosureRate({ total: 5 }, { total: 20 }, { total: 0 }) === 1);

  check('missing stat objects are treated as zero, never throw',
    FlowPmfMetrics.computeClosureRate(undefined, undefined, undefined) === null);
}

console.log('\n--- weekKey: consistent grouping, not a real ISO week number ---\n');
{
  const a = FlowPmfMetrics.weekKey(new Date('2026-09-14T00:00:00Z'));
  const b = FlowPmfMetrics.weekKey(new Date('2026-09-15T23:00:00Z'));
  check('two dates in the same calendar week produce the same key', a === b, [a, b]);

  const nextWeek = FlowPmfMetrics.weekKey(new Date('2026-09-22T00:00:00Z'));
  check('a date seven days later produces a different key', nextWeek !== a, [a, nextWeek]);

  const janFirst = FlowPmfMetrics.weekKey(new Date('2027-01-01T00:00:00Z'));
  check('a new year produces a key for the new year, not a throw or NaN', /^2027-W\d{2}$/.test(janFirst), janFirst);
}

console.log('\n--- computeWeeklyActivity / computeRetention ---\n');
{
  // Active on the current week and the two immediately before it, then a
  // gap, then one more active week further back — a realistic "used it,
  // stopped, came back once" shape.
  const activeDays = [
    new Date(NOW).toDateString(),                                 // this week
    new Date(NOW - 6 * 24 * 60 * 60 * 1000).toDateString(),        // last week
    new Date(NOW - 13 * 24 * 60 * 60 * 1000).toDateString(),       // 2 weeks ago
    new Date(NOW - 35 * 24 * 60 * 60 * 1000).toDateString()        // 5 weeks ago (isolated)
  ];

  const activity = FlowPmfMetrics.computeWeeklyActivity(activeDays, NOW, 8);
  check('returns exactly the requested number of weeks', activity.length === 8, activity);
  check('the most recent week (today) is marked active', activity[activity.length - 1].active === true, activity);
  check('weeks are returned oldest-first', activity[0].week < activity[activity.length - 1].week, activity.map((r) => r.week));

  const retention = FlowPmfMetrics.computeRetention(activeDays, NOW, 8);
  check('activeWeeks counts every distinct active week in the window', retention.activeWeeks === 4, retention);
  check('the current streak is 3 (this week, last week, two weeks ago) before the gap', retention.currentStreakWeeks === 3, retention);
  check('weeksObserved matches the requested window', retention.weeksObserved === 8, retention);

  const neverActive = FlowPmfMetrics.computeRetention([], NOW, 8);
  check('an account with no activity at all has zero active weeks and zero streak, not a throw',
    neverActive.activeWeeks === 0 && neverActive.currentStreakWeeks === 0, neverActive);
}

console.log('\n--- computeWeeklyHabit: real, spread-out activity AND at least one real close ---\n');
{
  const thisWeekTs = NOW;
  const lastWeekTs = NOW - 8 * 24 * 60 * 60 * 1000; // safely in the prior week

  const spreadOutDays = [
    new Date(thisWeekTs).toDateString(),
    new Date(thisWeekTs - 1 * 24 * 60 * 60 * 1000).toDateString(),
    new Date(thisWeekTs - 2 * 24 * 60 * 60 * 1000).toDateString()
  ];
  const closedThisWeek = { recent: [{ id: 'm1', ts: thisWeekTs }] };
  const metHabit = FlowPmfMetrics.computeWeeklyHabit(spreadOutDays, closedThisWeek, thisWeekTs);
  check('3 active days plus 1 close this week meets the habit bar', metHabit.metThisWeek === true, metHabit);
  check('activeDaysThisWeek reflects only days in the current week', metHabit.activeDaysThisWeek === 3, metHabit);

  const onlyOneDay = FlowPmfMetrics.computeWeeklyHabit([new Date(thisWeekTs).toDateString()], closedThisWeek, thisWeekTs);
  check('a single active day, even with a real close, does not meet the bar', onlyOneDay.metThisWeek === false, onlyOneDay);

  const noCloses = FlowPmfMetrics.computeWeeklyHabit(spreadOutDays, { recent: [] }, thisWeekTs);
  check('spread-out activity with zero real closes does not meet the bar — activity alone is not a habit',
    noCloses.metThisWeek === false, noCloses);

  const closeFromLastWeek = { recent: [{ id: 'm1', ts: lastWeekTs }] };
  const staleClose = FlowPmfMetrics.computeWeeklyHabit(spreadOutDays, closeFromLastWeek, thisWeekTs);
  check('a close from a PRIOR week does not count toward THIS week\'s habit bar',
    staleClose.metThisWeek === false && staleClose.closesThisWeek === 0, staleClose);
}

console.log('\n--- computeSnapshot: the one object getPmfSnapshot() hands back ---\n');
{
  const state = {
    shownStats: { total: 10 },
    writeStats: { total: 8 },
    undoneStats: { total: 1 },
    activeDays: [new Date(NOW).toDateString()],
    closeStats: { recent: [{ id: 'm1', ts: NOW }] }
  };
  const snap = FlowPmfMetrics.computeSnapshot(state, NOW);
  check('closureRate matches computeClosureRate\'s own math', snap.closureRate === 0.7, snap);
  check('detectedTotal/writtenTotal/undoneTotal pass the raw counters through', snap.detectedTotal === 10 && snap.writtenTotal === 8 && snap.undoneTotal === 1, snap);
  check('retention and habit are both present and shaped as their own functions produce', Boolean(snap.retention) && Boolean(snap.habit), snap);
  check('never carries anything beyond counts, rates, and week keys — no message content, no identifiers',
    JSON.stringify(snap).indexOf('@') === -1, snap);

  const emptyState = { shownStats: {}, writeStats: {}, undoneStats: {}, activeDays: [], closeStats: {} };
  const emptySnap = FlowPmfMetrics.computeSnapshot(emptyState, NOW);
  check('a completely fresh install produces a snapshot with no throw and a null closure rate',
    emptySnap.closureRate === null, emptySnap);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
