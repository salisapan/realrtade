// Regression corpus for core/close-quality-metrics.js — the three local
// personal-close signals (success, return, false-Do-It). Pure (no chrome.*),
// so this file can assert that each event is actually recorded, not just
// that a formula doesn't throw.
//
// Run: node test/close-quality-metrics-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'close-quality-metrics.js'), 'utf8'), sandbox, { filename: 'close-quality-metrics.js' });
const FlowCloseQuality = vm.runInContext('FlowCloseQuality', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const DAY_A = 'Mon Sep 14 2026';
const DAY_B = 'Tue Sep 15 2026';

console.log('--- isFullWrite: success is every proposed step actually written ---\n');
{
  check('2 of 2 proposed steps is a full write', FlowCloseQuality.isFullWrite(2, 2) === true);
  check('1 of 2 is a partial, not a success', FlowCloseQuality.isFullWrite(2, 1) === false);
  check('0 of 1 (nothing landed) is not a success', FlowCloseQuality.isFullWrite(1, 0) === false);
  check('0 of 0 is not a success — there was no close to complete', FlowCloseQuality.isFullWrite(0, 0) === false);
  check('missing counts are not a success', FlowCloseQuality.isFullWrite(undefined, undefined) === false);
}

console.log('\n--- success: a full write is recorded once per message ---\n');
{
  const start = FlowCloseQuality.emptyState();
  const frozen = JSON.stringify(start);
  const first = FlowCloseQuality.applyEvent(start, { kind: 'success', messageId: 'm1', day: DAY_A, ts: 10 });
  check('applyEvent does not mutate the state it was given', JSON.stringify(start) === frozen, start);
  check('a full-write success is recorded', first.recorded && first.recorded.kind === 'success' && first.recorded.id === 'm1', first.recorded);
  check('the success counter is 1', first.state.success === 1, first.state);

  const again = FlowCloseQuality.applyEvent(first.state, { kind: 'success', messageId: 'm1', day: DAY_A, ts: 11 });
  check('the same message does not record a second success', again.recorded === null && again.state.success === 1, again);

  const other = FlowCloseQuality.applyEvent(again.state, { kind: 'success', messageId: 'm2', day: DAY_A, ts: 12 });
  check('a different message records its own success', other.recorded && other.state.success === 2, other.state);

  const noId = FlowCloseQuality.applyEvent(other.state, { kind: 'success', day: DAY_A, ts: 13 });
  check('a success with no messageId is ignored', noId.recorded === null && noId.state.success === 2, noId);
}

console.log('\n--- return: Do It again on a later local calendar day ---\n');
{
  const start = FlowCloseQuality.emptyState();
  const firstUse = FlowCloseQuality.applyEvent(start, { kind: 'doIt', messageId: 'm1', day: DAY_A, ts: 1 });
  check('the first Do It ever is not a return', firstUse.recorded === null && firstUse.state.return === 0, firstUse.state);
  check('the first Do It still remembers the day, so a later one can be a return', firstUse.state.lastDoItDay === DAY_A, firstUse.state);

  const sameDay = FlowCloseQuality.applyEvent(firstUse.state, { kind: 'doIt', messageId: 'm2', day: DAY_A, ts: 2 });
  check('another Do It on the same calendar day is not a return', sameDay.recorded === null && sameDay.state.return === 0, sameDay.state);

  const nextDay = FlowCloseQuality.applyEvent(sameDay.state, { kind: 'doIt', messageId: 'm3', day: DAY_B, ts: 3 });
  check('Do It on a later calendar day records exactly one return', nextDay.recorded && nextDay.recorded.kind === 'return' && nextDay.recorded.day === DAY_B, nextDay.recorded);
  check('the return counter is 1', nextDay.state.return === 1, nextDay.state);

  const laterSameDay = FlowCloseQuality.applyEvent(nextDay.state, { kind: 'doIt', messageId: 'm4', day: DAY_B, ts: 4 });
  check('a second Do It on the return day does not count again', laterSameDay.recorded === null && laterSameDay.state.return === 1, laterSameDay.state);

  const noDay = FlowCloseQuality.applyEvent(laterSameDay.state, { kind: 'doIt', messageId: 'm5', ts: 5 });
  check('a Do It with no day is ignored and does not move lastDoItDay', noDay.recorded === null && noDay.state.lastDoItDay === DAY_B, noDay.state);
}

console.log('\n--- false-Do-It: dismiss the chip, or undo after a write ---\n');
{
  const start = FlowCloseQuality.emptyState();
  const dismissed = FlowCloseQuality.applyEvent(start, { kind: 'falseDoIt', messageId: 'm1', reason: 'dismiss', day: DAY_A, ts: 1 });
  check('a chip dismiss records a false-Do-It', dismissed.recorded && dismissed.recorded.kind === 'falseDoIt' && dismissed.recorded.reason === 'dismiss', dismissed.recorded);
  check('the false-Do-It counter is 1', dismissed.state.falseDoIt === 1, dismissed.state);

  const undone = FlowCloseQuality.applyEvent(dismissed.state, { kind: 'falseDoIt', messageId: 'm2', reason: 'undo', day: DAY_A, ts: 2 });
  check('an undo after a write records a false-Do-It', undone.recorded && undone.recorded.reason === 'undo' && undone.state.falseDoIt === 2, undone);

  const again = FlowCloseQuality.applyEvent(undone.state, { kind: 'falseDoIt', messageId: 'm1', reason: 'undo', day: DAY_B, ts: 3 });
  check('the same message is not a second false-Do-It, even if the reason differs', again.recorded === null && again.state.falseDoIt === 2, again.state);

  const quiet = FlowCloseQuality.applyEvent(again.state, { kind: 'falseDoIt', messageId: 'm3', reason: 'quiet-miss', day: DAY_A, ts: 4 });
  check('a speculative quiet-miss is not this metric', quiet.recorded === null && quiet.state.falseDoIt === 2, quiet.state);

  const noReason = FlowCloseQuality.applyEvent(quiet.state, { kind: 'falseDoIt', messageId: 'm4', day: DAY_A, ts: 5 });
  check('a reject with no reason is ignored', noReason.recorded === null && noReason.state.falseDoIt === 2, noReason.state);
}

console.log('\n--- a full write that is later undone counts as both ---\n');
{
  let state = FlowCloseQuality.emptyState();
  state = FlowCloseQuality.applyEvent(state, { kind: 'success', messageId: 'm1', day: DAY_A, ts: 1 }).state;
  const undone = FlowCloseQuality.applyEvent(state, { kind: 'falseDoIt', messageId: 'm1', reason: 'undo', day: DAY_A, ts: 2 });
  check('undo after a recorded success keeps the success and adds the reject',
    undone.state.success === 1 && undone.state.falseDoIt === 1 && undone.recorded.reason === 'undo', undone.state);
}

console.log('\n--- snapshot and Activity line ---\n');
{
  let state = FlowCloseQuality.emptyState();
  const empty = FlowCloseQuality.computeSnapshot(state);
  check('an empty account has three zero counts', empty.success === 0 && empty.return === 0 && empty.falseDoIt === 0, empty);
  check('the Activity line stays blank when nothing has happened', FlowCloseQuality.activityLine(empty) === '', empty);
  check('a missing state does not throw', FlowCloseQuality.computeSnapshot(undefined).success === 0);
  check('an unrecognized event kind is ignored', FlowCloseQuality.applyEvent(state, { kind: 'chip-shown', messageId: 'm' }).recorded === null);

  state = FlowCloseQuality.applyEvent(state, { kind: 'success', messageId: 'm1', day: DAY_A, ts: 1 }).state;
  state = FlowCloseQuality.applyEvent(state, { kind: 'doIt', messageId: 'm1', day: DAY_A, ts: 1 }).state;
  state = FlowCloseQuality.applyEvent(state, { kind: 'doIt', messageId: 'm2', day: DAY_B, ts: 2 }).state;
  state = FlowCloseQuality.applyEvent(state, { kind: 'falseDoIt', messageId: 'm3', reason: 'dismiss', day: DAY_B, ts: 3 }).state;
  const snap = FlowCloseQuality.computeSnapshot(state);
  check('the snapshot reports all three counts', snap.success === 1 && snap.return === 1 && snap.falseDoIt === 1, snap);
  const kinds = (snap.recent || []).map((e) => e.kind).sort();
  check('recent holds one event for each of the three cases', kinds.join(',') === 'falseDoIt,return,success', kinds);
  check('the Activity line names the three counts and the false-close rate',
    FlowCloseQuality.activityLine(snap) === 'Full closes 1 · Returns 1 · Turned down 1 · False-close 50%',
    FlowCloseQuality.activityLine(snap));
  check('one success and one dismiss is a 50% false-close, over the 15% bar',
    snap.falseCloseRate === 0.5 && snap.falseCloseWithinBar === false, snap);
}

console.log('\n--- false-close rate: undo and dismiss, measured against 15% ---\n');
{
  check('the week-1 bar is 15%', FlowCloseQuality.FALSE_CLOSE_BAR === 0.15);
  check('nothing judged yet is not a rate', FlowCloseQuality.falseCloseRate(FlowCloseQuality.emptyState()) === null);

  let stuck = FlowCloseQuality.emptyState();
  for (let i = 1; i <= 6; i++) {
    stuck = FlowCloseQuality.applyEvent(stuck, { kind: 'success', messageId: 's' + i, day: DAY_A, ts: i }).state;
  }
  stuck = FlowCloseQuality.applyEvent(stuck, { kind: 'falseDoIt', messageId: 'd1', reason: 'dismiss', day: DAY_B, ts: 9 }).state;
  const under = FlowCloseQuality.computeSnapshot(stuck);
  check('6 full closes and 1 dismiss is 1/7, within 15%',
    Math.abs(under.falseCloseRate - (1 / 7)) < 1e-9 && under.falseCloseWithinBar === true, under.falseCloseRate);

  let over = FlowCloseQuality.emptyState();
  for (let i = 1; i <= 5; i++) {
    over = FlowCloseQuality.applyEvent(over, { kind: 'success', messageId: 's' + i, day: DAY_A, ts: i }).state;
  }
  over = FlowCloseQuality.applyEvent(over, { kind: 'falseDoIt', messageId: 'd1', reason: 'undo', day: DAY_B, ts: 9 }).state;
  const above = FlowCloseQuality.computeSnapshot(over);
  check('5 full closes and 1 undo is 1/6, over 15%',
    Math.abs(above.falseCloseRate - (1 / 6)) < 1e-9 && above.falseCloseWithinBar === false, above.falseCloseRate);

  let both = FlowCloseQuality.applyEvent(FlowCloseQuality.emptyState(), { kind: 'success', messageId: 'm1', day: DAY_A, ts: 1 }).state;
  both = FlowCloseQuality.applyEvent(both, { kind: 'falseDoIt', messageId: 'm1', reason: 'undo', day: DAY_A, ts: 2 }).state;
  const undone = FlowCloseQuality.computeSnapshot(both);
  check('a full close that is later undone is one false close, not two messages',
    undone.falseCloseRate === 1 && undone.success === 1 && undone.falseDoIt === 1, undone);
  check('the line states that rate',
    FlowCloseQuality.activityLine(undone) === 'Full closes 1 · Returns 0 · Turned down 1 · False-close 100%',
    FlowCloseQuality.activityLine(undone));
}

console.log('\n--- dayKey matches the local calendar day storage.js already uses ---\n');
{
  const local = new Date(2026, 8, 15, 15, 30, 0);
  check('dayKey of a Date is Date#toDateString()', FlowCloseQuality.dayKey(local) === local.toDateString(), FlowCloseQuality.dayKey(local));
  check('dayKey of an existing day string is unchanged', FlowCloseQuality.dayKey(DAY_A) === DAY_A);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
