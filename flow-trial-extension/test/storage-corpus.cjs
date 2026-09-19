// Regression corpus for storage.js — specifically getPending() and
// consumeDailyBriefTrigger(), the two new functions the Morning Brief is
// built on. Both are pure derivations over the same log appendLog/
// hasTerminalOutcome already use, so this also cross-checks that the
// "still open" definition getPending() computes in bulk agrees with
// hasTerminalOutcome's own single-message definition.
//
// Run: node test/storage-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A minimal in-memory chrome.storage.local — mirrors the real API's
// get(keysWithDefaults, cb)/set(patch, cb) shape closely enough that
// storage.js's own get()/set() wrappers work unmodified: any key not yet in
// `store` falls back to the default value passed in, exactly like the real
// API does when `keys` is an object.
let store = {};
// Swappable per test block (default: no listener reachable, matching a bare
// test sandbox with no background page) — see the getInstallId tests below
// for how this simulates background.js actually answering vs. being
// unreachable.
let runtimeMessageHandler = (msg, cb) => { cb(undefined); }; // chrome.runtime.lastError stays unset — real Chrome would set it here, but "response is undefined" alone is already enough for getInstallId's own check to fall back correctly.
const chromeStub = {
  storage: {
    local: {
      get: (keysWithDefaults, cb) => {
        const result = {};
        for (const k of Object.keys(keysWithDefaults)) {
          result[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keysWithDefaults[k];
        }
        cb(result);
      },
      set: (patch, cb) => { Object.assign(store, patch); if (cb) cb(); }
    }
  },
  runtime: {
    sendMessage: (msg, cb) => runtimeMessageHandler(msg, cb)
  }
};

const sandbox = { module: undefined, console, chrome: chromeStub, crypto: { randomUUID: () => 'test-uuid' } };
vm.createContext(sandbox);
// getPmfSnapshot()/consumeWeeklyHabitTrigger() call into FlowPmfMetrics —
// loaded first so it's defined by the time anything in storage.js actually
// invokes it, the same load-order convention the real manifest.json/
// popup.html use for core/ files ahead of src/storage.js.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'pmf-metrics.js'), 'utf8'), sandbox, { filename: 'pmf-metrics.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8'), sandbox, { filename: 'storage.js' });
const FlowStorage = vm.runInContext('FlowStorage', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function run() {
  console.log('--- storage.js: getPending() on an untouched profile ---\n');
  {
    const pending = await FlowStorage.getPending();
    check('an untouched profile has nothing pending', Array.isArray(pending) && pending.length === 0, pending);
  }

  console.log('\n--- storage.js: a shown-with-process entry is pending ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm1', label: 'Log deal update', process: { id: 'reply-track', name: 'Reply & Track', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('a shown process with no later outcome is pending', pending.length === 1 && pending[0].messageId === 'm1', pending);
    check('hasTerminalOutcome agrees this message is not yet resolved', (await FlowStorage.hasTerminalOutcome('m1')) === false);
  }

  console.log('\n--- storage.js: a shown entry with no process snapshot is never surfaced ---\n');
  store = {};
  {
    // Defensive case — a 'shown' entry that (for whatever reason) never got
    // a process snapshot attached must not crash the Brief or show up as an
    // item with nothing to close.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm2', label: 'Log deal update' });
    const pending = await FlowStorage.getPending();
    check('a shown entry without a process snapshot is excluded', pending.length === 0, pending);
  }

  console.log('\n--- storage.js: writing or dismissing closes a pending item ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm3', process: { id: 'schedule', name: 'Schedule It', steps: [] } });
    check('m3 starts pending', (await FlowStorage.getPending()).length === 1);

    await FlowStorage.appendLog({ kind: 'written', messageId: 'm3', where: 'Google Calendar' });
    const pending = await FlowStorage.getPending();
    check('a written outcome removes it from pending', pending.length === 0, pending);
    check('hasTerminalOutcome agrees m3 is now resolved', (await FlowStorage.hasTerminalOutcome('m3')) === true);
  }
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm4', process: { id: 'log-it', name: 'Log It', steps: [] } });
    await FlowStorage.appendLog({ kind: 'dismissed', messageId: 'm4' });
    check('a dismissed outcome removes it from pending', (await FlowStorage.getPending()).length === 0);
  }

  console.log('\n--- storage.js: only the most recent entry per message decides pending ---\n');
  store = {};
  {
    // Re-shown after Gmail rebuilds the node (see scanReadingPane's own
    // comment on this) without a new terminal outcome in between — still
    // pending, and the newer snapshot (not the older one) is what's used.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm5', process: { id: 'schedule', name: 'Schedule It (old)', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm5', process: { id: 'schedule', name: 'Schedule It (new)', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('re-shown with no terminal outcome in between is still exactly one pending item', pending.length === 1, pending);
    check('the most recent snapshot wins', pending[0].process.name === 'Schedule It (new)', pending[0]);
  }

  console.log('\n--- storage.js: several open processes come back oldest-first ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'a', process: { id: 'log-it', name: 'A', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'b', process: { id: 'log-it', name: 'B', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'c', process: { id: 'log-it', name: 'C', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('three open processes come back oldest-still-open first', JSON.stringify(pending.map((p) => p.messageId)) === JSON.stringify(['a', 'b', 'c']), pending.map((p) => p.messageId));
  }

  console.log('\n--- storage.js: mixed open/closed messages ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open1', process: { id: 'log-it', name: 'Open 1', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'closed1', process: { id: 'log-it', name: 'Closed 1', steps: [] } });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'closed1' });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open2', process: { id: 'log-it', name: 'Open 2', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('only the genuinely still-open messages are returned', JSON.stringify(pending.map((p) => p.messageId).sort()) === JSON.stringify(['open1', 'open2']), pending.map((p) => p.messageId));
  }

  console.log('\n--- storage.js: consumeDailyBriefTrigger() fires at most once per day ---\n');
  store = {};
  {
    const first = await FlowStorage.consumeDailyBriefTrigger();
    check('the first call today returns true', first === true);
    const second = await FlowStorage.consumeDailyBriefTrigger();
    check('a second call the same day returns false', second === false);

    // Simulate the next calendar day directly, the same way a real day
    // boundary would change what Date#toDateString() returns.
    store.briefLastShownDate = 'Mon Jan 01 2001';
    const third = await FlowStorage.consumeDailyBriefTrigger();
    check('a call on a new day returns true again', third === true);
    const fourth = await FlowStorage.consumeDailyBriefTrigger();
    check('and is consumed for that new day too', fourth === false);
  }

  console.log('\n--- storage.js: consumeDailyActiveTrigger() is independent of the Brief\'s own daily flag ---\n');
  store = {};
  {
    const briefFirst = await FlowStorage.consumeDailyBriefTrigger();
    check('brief trigger fires once today', briefFirst === true);
    const activeFirst = await FlowStorage.consumeDailyActiveTrigger();
    check('the active-ping trigger is a separate flag — still fires today even though the brief one already did', activeFirst === true, activeFirst);
    const activeSecond = await FlowStorage.consumeDailyActiveTrigger();
    check('a second active-ping call the same day returns false', activeSecond === false);

    store.activeLastTrackedDate = 'Mon Jan 01 2001';
    const activeThird = await FlowStorage.consumeDailyActiveTrigger();
    check('the active-ping trigger also resets on a new day', activeThird === true);
    // And the brief flag, untouched by any of the above, is still consumed
    // for today — confirms the two really are independent stored keys.
    const briefSecond = await FlowStorage.consumeDailyBriefTrigger();
    check('the brief trigger is unaffected by the active-ping trigger being reset', briefSecond === false, briefSecond);
  }

  console.log('\n--- storage.js: markMemoryInsightSeen() ---\n');
  store = {};
  {
    let state = await FlowStorage.get();
    check('no insights are marked seen on an untouched profile', state.memoryInsightsSeen.length === 0, state.memoryInsightsSeen);

    await FlowStorage.markMemoryInsightSeen('reply-track:task');
    state = await FlowStorage.get();
    check('marking an insight seen records it', state.memoryInsightsSeen.includes('reply-track:task'), state.memoryInsightsSeen);

    await FlowStorage.markMemoryInsightSeen('reply-track:task');
    state = await FlowStorage.get();
    check('marking the same insight seen twice does not duplicate it', state.memoryInsightsSeen.filter((k) => k === 'reply-track:task').length === 1, state.memoryInsightsSeen);

    await FlowStorage.markMemoryInsightSeen('schedule-confirm:draft');
    state = await FlowStorage.get();
    check('a different insight is tracked independently', state.memoryInsightsSeen.includes('schedule-confirm:draft') && state.memoryInsightsSeen.includes('reply-track:task'), state.memoryInsightsSeen);
  }

  // ------------------------------------------------------------------
  // Durability under ordinary inbox volume.
  //
  // `log` is capped at 200 and one Do It can append five 'written' rows, so
  // roughly 40 multi-step closes roll the entire window. Every fact below
  // used to be derived from that window, which meant ordinary use silently
  // erased it. These are the four ways that showed up, in severity order.
  // ------------------------------------------------------------------

  const proc = { id: 'reply-track', name: 'Reply & Track', steps: [] };
  // Enough volume to roll the 200-entry window right over.
  async function churn(n) {
    for (let i = 0; i < n; i++) {
      await FlowStorage.appendLog({ kind: 'shown', messageId: 'noise' + Math.random(), label: 'x', process: proc });
    }
  }

  console.log('\n--- storage.js: a completed write stays completed ---\n');
  store = {};
  {
    // The worst case in the product: the chip re-appearing on an email that
    // was already written to Google Tasks, so Do It writes it a SECOND time.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'DEAL', label: 'Log deal', process: proc });
    await FlowStorage.appendLog({ kind: 'clicked', messageId: 'DEAL', label: 'Log deal' });
    // One Do It, three steps -> three rows for one message.
    for (const where of ['Google Calendar', 'Gmail draft', 'Google Tasks']) {
      await FlowStorage.appendLog({ kind: 'written', messageId: 'DEAL', label: 'Log deal', where });
    }
    check('a write is recorded as closed immediately', await FlowStorage.hasTerminalOutcome('DEAL'));

    await churn(250);
    check('...and is STILL closed after the log has rolled over — no duplicate write',
      await FlowStorage.hasTerminalOutcome('DEAL'));
    const state = await FlowStorage.get();
    check('the log itself really did evict it (the test is exercising eviction)',
      !state.log.some((e) => e.messageId === 'DEAL'));
  }

  console.log('\n--- storage.js: a dismissal stays dismissed ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'NOPE', label: 'Nope', process: proc });
    await FlowStorage.appendLog({ kind: 'dismissed', messageId: 'NOPE', label: 'Nope' });
    check('dismiss closes the message', await FlowStorage.hasTerminalOutcome('NOPE'));
    await churn(250);
    check('...and the chip does not come back weeks later', await FlowStorage.hasTerminalOutcome('NOPE'));
    const pending = await FlowStorage.getPending();
    check('a dismissed message never reappears in the Morning Brief',
      !pending.some((e) => e.messageId === 'NOPE'));
  }

  console.log('\n--- storage.js: still-open work survives the log window ---\n');
  store = {};
  {
    // The Brief's headline is "This is waiting to be closed." Dropping an
    // open item makes that a false statement, silently.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'OPEN', label: 'Still open', process: proc });
    await churn(250);
    const pending = await FlowStorage.getPending();
    check('an unresolved process is still listed after the log rolls over',
      pending.some((e) => e.messageId === 'OPEN'), pending.length);
    check('the carried entry keeps the process snapshot Do It needs',
      (pending.find((e) => e.messageId === 'OPEN') || {}).process !== undefined);
    check('oldest-still-open is still first',
      pending.length > 1 && pending[0].messageId === 'OPEN', pending.slice(0, 1));
  }

  console.log('\n--- storage.js: carrying open work is bounded ---\n');
  store = {};
  {
    // Carrying must not let one never-tidied inbox grow storage without end.
    for (let i = 0; i < 400; i++) {
      await FlowStorage.appendLog({ kind: 'shown', messageId: 'open' + i, label: 'x', process: proc });
    }
    const state = await FlowStorage.get();
    check('the log stays bounded (200 window + at most 60 carried)',
      state.log.length <= 260, state.log.length);
    check('...and what it sacrifices is the OLDEST open work, not the newest',
      state.log.some((e) => e.messageId === 'open399') && !state.log.some((e) => e.messageId === 'open0'));
  }

  console.log('\n--- storage.js: a click whose write failed is still open ---\n');
  store = {};
  {
    // Do It clicked, every write failed (expired token, offline). Nothing was
    // written, nothing was dismissed. getPending used to take the first entry
    // of ANY kind as the outcome, so the 'clicked' row closed the message and
    // the Brief — the exact safety net for a failed write — dropped it, while
    // hasTerminalOutcome went on correctly reporting it as open. The two
    // functions claim to share one definition of "still open"; they must.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'FAILED', label: 'Book kickoff', process: proc });
    await FlowStorage.appendLog({ kind: 'clicked', messageId: 'FAILED', label: 'Book kickoff' });
    check('hasTerminalOutcome: nothing was closed', (await FlowStorage.hasTerminalOutcome('FAILED')) === false);
    const pending = await FlowStorage.getPending();
    check('getPending agrees — it is still waiting to be closed',
      pending.some((e) => e.messageId === 'FAILED'), pending);

    // And the moment a write does land, both agree it is closed.
    await FlowStorage.appendLog({ kind: 'written', messageId: 'FAILED', label: 'Book kickoff', where: 'Google Tasks' });
    check('after a successful retry, hasTerminalOutcome closes it', await FlowStorage.hasTerminalOutcome('FAILED'));
    check('after a successful retry, getPending drops it',
      !(await FlowStorage.getPending()).some((e) => e.messageId === 'FAILED'));
  }

  console.log('\n--- storage.js: the write counters never shrink ---\n');
  store = {};
  {
    // "N all-time" that goes DOWN is the product stating something it knows
    // is false. Counted per distinct MESSAGE, not per written row.
    for (let i = 0; i < 20; i++) {
      for (const where of ['Google Calendar', 'Gmail draft', 'Google Tasks']) {
        await FlowStorage.appendLog({ kind: 'written', messageId: 'msg' + i, label: 'x', where });
      }
    }
    let state = await FlowStorage.get();
    check('20 messages x 3 writes each counts as 20, not 60', state.writeStats.total === 20, state.writeStats.total);

    await churn(300);
    state = await FlowStorage.get();
    check('...and is still 20 after the log has rolled over twice', state.writeStats.total === 20, state.writeStats.total);
    check('the log genuinely lost those rows',
      state.log.filter((e) => e.kind === 'written').length === 0);
    check('every counted message kept its timestamp for the weekly figure',
      state.writeStats.recent.length === 20 && state.writeStats.recent.every((w) => w.id && w.ts > 0));
  }

  console.log('\n--- storage.js: an undone write stays closed ---\n');
  store = {};
  {
    // Undo reverses the record in Google; it does not reopen the proposal —
    // the user saw the whole thing happen and chose to keep none of it.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'UND', label: 'x', process: proc });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'UND', label: 'x', where: 'Google Tasks' });
    await FlowStorage.appendLog({ kind: 'undone', messageId: 'UND', label: 'x' });
    check('undo is terminal', await FlowStorage.hasTerminalOutcome('UND'));
    check('an undone process is not re-listed as waiting to be closed',
      !(await FlowStorage.getPending()).some((e) => e.messageId === 'UND'));
  }

  console.log('\n--- storage.js: installs that predate the durable keys ---\n');
  store = {};
  {
    // Someone upgrading has decisions recorded only in their log. Those must
    // keep working — an upgrade that resurrects every old chip is its own bug.
    store = {
      log: [
        { ts: Date.now(), kind: 'dismissed', messageId: 'OLD_NO', label: 'x' },
        { ts: Date.now() - 1, kind: 'shown', messageId: 'OLD_NO', label: 'x', process: proc },
        { ts: Date.now() - 2, kind: 'shown', messageId: 'OLD_OPEN', label: 'x', process: proc }
      ]
    };
    check('a pre-upgrade dismissal is still honoured', await FlowStorage.hasTerminalOutcome('OLD_NO'));
    const pending = await FlowStorage.getPending();
    check('a pre-upgrade open process is still listed', pending.some((e) => e.messageId === 'OLD_OPEN'));
    check('a pre-upgrade dismissal is not listed', !pending.some((e) => e.messageId === 'OLD_NO'));
  }

  console.log('\n--- storage.js: writeCountsFrom is the one definition ---\n');
  store = {};
  {
    const DAY = 24 * 60 * 60 * 1000;
    // One Do It, three steps, one message. The popup's referral gate used to
    // read this as "three real writes" and start asking the user to
    // recommend Glance after a single click.
    for (const where of ['Google Calendar', 'Gmail draft', 'Google Tasks']) {
      await FlowStorage.appendLog({ kind: 'written', messageId: 'one', label: 'x', where });
    }
    let c = FlowStorage.writeCountsFrom(await FlowStorage.get());
    check('one Do It on a three-step process counts as ONE decision', c.total === 1, c);
    check('...and as one this week', c.week === 1, c);

    await FlowStorage.appendLog({ kind: 'written', messageId: 'two', label: 'x', where: 'Google Tasks' });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'three', label: 'x', where: 'Google Tasks' });
    c = FlowStorage.writeCountsFrom(await FlowStorage.get());
    check('three separate messages reach the referral threshold', c.total === 3, c);

    // A write from six weeks ago is all-time, not this week.
    const state = await FlowStorage.get();
    state.writeStats.recent.push({ id: 'old', ts: Date.now() - 42 * DAY });
    state.writeStats.total += 1;
    await FlowStorage.set({ writeStats: state.writeStats });
    c = FlowStorage.writeCountsFrom(await FlowStorage.get());
    check('an old write counts all-time but not this week', c.total === 4 && c.week === 3, c);

    check('getWriteCounts() agrees with the synchronous form',
      JSON.stringify(await FlowStorage.getWriteCounts()) === JSON.stringify(c));
  }

  console.log('\n--- storage.js: counters never regress on upgrade ---\n');
  store = {};
  {
    // An install upgrading from before writeStats existed has its history
    // only in the log. Its totals must not reset to zero.
    store = {
      writeStats: { total: 0, recent: [] },
      log: [
        { ts: Date.now(), kind: 'written', messageId: 'a', where: 'Google Tasks' },
        { ts: Date.now(), kind: 'written', messageId: 'a', where: 'Gmail draft' },
        { ts: Date.now(), kind: 'written', messageId: 'b', where: 'Google Tasks' }
      ]
    };
    const c = FlowStorage.writeCountsFrom(await FlowStorage.get());
    check('pre-upgrade history is still counted, and still per-message', c.total === 2 && c.week === 2, c);
  }

  console.log('\n--- storage.js: closeCountsFrom counts written, dismissed, and undone alike ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'w1', process: proc });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'w1', where: 'Google Tasks' });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'd1', process: proc });
    await FlowStorage.appendLog({ kind: 'dismissed', messageId: 'd1' });
    let c = FlowStorage.closeCountsFrom(await FlowStorage.get());
    check('a write and a dismissal both count toward "closed"', c.total === 2 && c.week === 2, c);

    // A write later undone must not be counted twice — the message became
    // resolved once, at the write, and the undo only records a further fact
    // about an already-settled message.
    await FlowStorage.appendLog({ kind: 'undone', messageId: 'w1' });
    c = FlowStorage.closeCountsFrom(await FlowStorage.get());
    check('undoing an already-closed message does not double-count it', c.total === 2, c);

    check('getCloseCounts() agrees with the synchronous form',
      JSON.stringify(await FlowStorage.getCloseCounts()) === JSON.stringify(c));
  }

  console.log('\n--- storage.js: closeCountsFrom windows to the last 7 days ---\n');
  store = {};
  {
    const DAY = 24 * 60 * 60 * 1000;
    await FlowStorage.appendLog({ kind: 'dismissed', messageId: 'recent' });
    const state = await FlowStorage.get();
    state.closeStats.recent.push({ id: 'old', ts: Date.now() - 42 * DAY });
    state.closeStats.total += 1;
    await FlowStorage.set({ closeStats: state.closeStats });
    const c = FlowStorage.closeCountsFrom(await FlowStorage.get());
    check('an old closure counts all-time but not this week', c.total === 2 && c.week === 1, c);
  }

  console.log('\n--- storage.js: closeCountsFrom falls back to the log for pre-upgrade installs ---\n');
  store = {};
  {
    store = {
      closeStats: { total: 0, recent: [] },
      log: [
        { ts: Date.now(), kind: 'written', messageId: 'a', where: 'Google Tasks' },
        { ts: Date.now(), kind: 'dismissed', messageId: 'b' }
      ]
    };
    const c = FlowStorage.closeCountsFrom(await FlowStorage.get());
    check('pre-upgrade terminal log entries are still counted', c.total === 2 && c.week === 2, c);
  }

  console.log('\n--- storage.js: consumeWeeklySummaryTrigger() ---\n');
  const DAY = 24 * 60 * 60 * 1000;
  store = {};
  {
    // Nothing closed, nothing open — even on a first-ever call (which is
    // otherwise always "due", the same precedent consumeDailyBriefTrigger
    // already sets for a brand new install), silence wins.
    const first = await FlowStorage.consumeWeeklySummaryTrigger();
    check('an empty profile never shows a summary, even though it is technically "due"', first === null, first);
    const state = await FlowStorage.get();
    check('lastActiveTs is still stamped even when the summary itself stays silent', state.lastActiveTs > 0, state.lastActiveTs);
  }

  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open-one', process: proc });
    const first = await FlowStorage.consumeWeeklySummaryTrigger();
    check('a first-ever call with something open fires (matches the Brief\'s own "first real day" precedent)',
      first !== null && first.open === 1 && first.closed === 0, first);

    const second = await FlowStorage.consumeWeeklySummaryTrigger();
    check('a second call the same day never fires, regardless of cadence', second === null, second);
  }

  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open-two', process: proc });
    await FlowStorage.consumeWeeklySummaryTrigger(); // consume the first-ever showing
    // Eight days later, with nothing new closed or opened, the weekly
    // cadence alone is enough to fire again.
    const state = await FlowStorage.get();
    await FlowStorage.set({ weeklySummaryLastShownTs: Date.now() - 8 * DAY, lastActiveTs: Date.now() });
    const due = await FlowStorage.consumeWeeklySummaryTrigger();
    check('a full week since the last showing fires again on cadence alone', due !== null && due.open === 1, due);
  }

  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open-three', process: proc });
    await FlowStorage.consumeWeeklySummaryTrigger();
    // Only two days since last shown (not a week), but four days since the
    // user was last seen at all — a return from real inactivity fires on its
    // own, independent of the weekly clock.
    await FlowStorage.set({ weeklySummaryLastShownTs: Date.now() - 2 * DAY, lastActiveTs: Date.now() - 4 * DAY });
    const due = await FlowStorage.consumeWeeklySummaryTrigger();
    check('returning after several days of inactivity fires even mid-week', due !== null && due.open === 1, due);
  }

  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open-four', process: proc });
    await FlowStorage.consumeWeeklySummaryTrigger();
    // Two days since shown, one day since last active — neither condition
    // met, so it correctly stays silent.
    await FlowStorage.set({ weeklySummaryLastShownTs: Date.now() - 2 * DAY, lastActiveTs: Date.now() - 1 * DAY });
    const due = await FlowStorage.consumeWeeklySummaryTrigger();
    check('mid-week with no real gap since last seen stays silent', due === null, due);
  }

  console.log('\n--- storage.js: getInstallId() defers to background.js when it answers ---\n');
  store = {};
  {
    runtimeMessageHandler = (msg, cb) => {
      check('asks background.js with the documented message type', msg && msg.type === 'flow:get-install-id', msg);
      cb({ ok: true, id: 'bg-canonical-id' });
    };
    const id = await FlowStorage.getInstallId();
    check('adopts the id background.js returned rather than generating its own', id === 'bg-canonical-id', id);
    const state = await FlowStorage.get();
    check('persists that id locally so future reads are instant and consistent', state.installId === 'bg-canonical-id', state.installId);

    runtimeMessageHandler = () => { throw new Error('should not be asked again once installId is already set'); };
    const second = await FlowStorage.getInstallId();
    check('a second call short-circuits on the now-stored id without messaging again', second === 'bg-canonical-id', second);
  }

  console.log('\n--- storage.js: getInstallId() falls back to local generation when background.js is unreachable ---\n');
  store = {};
  {
    // No listener at all — e.g. the service worker hasn't started yet, or
    // (as in every other test in this file) there simply isn't one.
    runtimeMessageHandler = (msg, cb) => cb(undefined);
    const id = await FlowStorage.getInstallId();
    check('still resolves to a usable id when the message goes unanswered', typeof id === 'string' && id.length > 0, id);
    const state = await FlowStorage.get();
    check('the locally-generated id is persisted the same as before this change existed', state.installId === id, state);
  }

  console.log('\n--- storage.js: getInstallId() falls back when background.js answers without a valid id ---\n');
  store = {};
  {
    runtimeMessageHandler = (msg, cb) => cb({ ok: false });
    const id = await FlowStorage.getInstallId();
    check('a malformed/failed response is treated the same as no response', typeof id === 'string' && id.length > 0, id);
  }
  runtimeMessageHandler = (msg, cb) => cb(undefined); // restore the default for anything after this block

  console.log('\n--- storage.js: calibrate() bumps the account-wide counter exactly as before ---\n');
  store = {};
  {
    const c1 = await FlowStorage.calibrate('click');
    check('a click increments clicks by 1', c1.clicks === 1, c1);
    check('a click never touches dismissals', c1.dismissals === 0, c1);

    const c2 = await FlowStorage.calibrate('dismiss');
    check('a dismiss increments dismissals by 1 without resetting the earlier click', c2.dismissals === 1 && c2.clicks > 0, c2);

    const state = await FlowStorage.get();
    check('calling calibrate() with no type never creates a calibrationByType entry', Object.keys(state.calibrationByType).length === 0, state.calibrationByType);
  }

  console.log('\n--- storage.js: calibrate(kind, type) also bumps a per-type bucket, independently ---\n');
  store = {};
  {
    await FlowStorage.calibrate('dismiss', 'decision');
    const state = await FlowStorage.get();
    check('a typed dismiss creates that type\'s own bucket', state.calibrationByType.decision && state.calibrationByType.decision.dismissals === 1, state.calibrationByType);
    check('an untouched type never gets a bucket at all', !state.calibrationByType.followup, state.calibrationByType);
    check('the account-wide calibration still moved too — typed calls are additive, not a replacement', state.calibration.dismissals === 1, state.calibration);

    await FlowStorage.calibrate('click', 'followup');
    const state2 = await FlowStorage.get();
    check('a second type accrues independently of the first', state2.calibrationByType.followup.clicks === 1 && state2.calibrationByType.decision.dismissals === 1, state2.calibrationByType);
  }

  console.log('\n--- storage.js: calibrate("undo", type) counts as a stronger dismissal, not a separate signal ---\n');
  store = {};
  {
    const c = await FlowStorage.calibrate('undo', 'decision');
    check('undo raises dismissals by more than a plain dismiss would (harsher — it was discovered post-execution)', c.dismissals === 2, c);
    check('undo never touches clicks', c.clicks === 0, c);
    const state = await FlowStorage.get();
    check('the typed bucket reflects the same undo weighting', state.calibrationByType.decision.dismissals === 2, state.calibrationByType.decision);
  }

  console.log('\n--- storage.js: calibrate() counters stay capped at 6, same as before this change ---\n');
  store = {};
  {
    for (let i = 0; i < 5; i++) await FlowStorage.calibrate('undo', 'decision'); // 5 * 2 = 10, would overshoot without the cap
    const state = await FlowStorage.get();
    check('the per-type dismissals counter is capped at 6, exactly like the account-wide one', state.calibrationByType.decision.dismissals === 6, state.calibrationByType.decision);
  }

  console.log('\n--- storage.js: precisionAutoTuned is a simple, append-once set ---\n');
  store = {};
  {
    check('a process id starts out not auto-tuned', (await FlowStorage.wasPrecisionAutoTuned('log-it')) === false);
    await FlowStorage.markPrecisionAutoTuned('log-it');
    check('marking it records the answer', (await FlowStorage.wasPrecisionAutoTuned('log-it')) === true);
    await FlowStorage.markPrecisionAutoTuned('log-it'); // idempotent — must not duplicate or throw
    const state = await FlowStorage.get();
    check('marking the same id twice never duplicates the entry', state.precisionAutoTuned.filter((id) => id === 'log-it').length === 1, state.precisionAutoTuned);
    check('an unrelated process id is unaffected', (await FlowStorage.wasPrecisionAutoTuned('reply-track')) === false);
  }

  console.log('\n--- storage.js: appendLog durably counts shownStats (PMF closure-rate denominator) ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm1', process: { id: 'reply-track', name: 'Reply & Track', steps: [] } });
    const state = await FlowStorage.get();
    check('a shown entry with a real process counts toward shownStats', state.shownStats.total === 1, state.shownStats);

    // Re-injecting the SAME message (Gmail rebuilding the DOM node) must
    // never double-count it — the exact scenario content-gmail.js's own
    // alreadyLoggedShown guard exists for, verified here at the storage layer.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm1', process: { id: 'reply-track', name: 'Reply & Track', steps: [] } });
    const state2 = await FlowStorage.get();
    check('the same message shown twice counts once, not twice', state2.shownStats.total === 1, state2.shownStats);

    // A 'shown' entry with no process snapshot is not a real detection —
    // storage.js's own trimLog already treats this the same way.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm2' });
    const state3 = await FlowStorage.get();
    check('a shown entry with no process attached never counts as detected', state3.shownStats.total === 1, state3.shownStats);
  }

  console.log('\n--- storage.js: appendLog durably counts undoneStats (PMF closure-rate correction) ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'written', messageId: 'm1' });
    await FlowStorage.appendLog({ kind: 'undone', messageId: 'm1' });
    const state = await FlowStorage.get();
    check('an undone message is durably counted', state.undoneStats.total === 1, state.undoneStats);
    check('writeStats is untouched by the later undo — it counts "was ever written," not "still stands"', state.writeStats.total === 1, state.writeStats);

    await FlowStorage.appendLog({ kind: 'undone', messageId: 'm1' });
    const state2 = await FlowStorage.get();
    check('undoing the same message twice never double-counts', state2.undoneStats.total === 1, state2.undoneStats);
  }

  console.log('\n--- storage.js: consumeDailyActiveTrigger() also records the local activeDays history ---\n');
  store = {};
  {
    const fired = await FlowStorage.consumeDailyActiveTrigger();
    check('the first call of the day fires true, same as before this change', fired === true);
    const state = await FlowStorage.get();
    check('today\'s date is recorded in activeDays', state.activeDays.includes(new Date().toDateString()), state.activeDays);
    check('activeDays holds exactly one entry so far', state.activeDays.length === 1, state.activeDays);

    const firedAgain = await FlowStorage.consumeDailyActiveTrigger();
    check('a second call the same day still returns false, same as before this change', firedAgain === false);
    const state2 = await FlowStorage.get();
    check('a second call the same day never duplicates the date', state2.activeDays.length === 1, state2.activeDays);
  }

  console.log('\n--- storage.js: consumeWeeklyHabitTrigger() fires at most once per calendar week ---\n');
  store = {};
  {
    const notYet = await FlowStorage.consumeWeeklyHabitTrigger();
    check('a fresh install with no history has not met the habit bar yet', notYet === false);

    // Build up exactly what core/pmf-metrics.js's computeWeeklyHabit needs:
    // 3 distinct active days this week, plus one real close this week.
    const today = Date.now();
    await FlowStorage.set({
      activeDays: [new Date(today).toDateString(), new Date(today - 1 * 86400000).toDateString(), new Date(today - 2 * 86400000).toDateString()],
      closeStats: { total: 1, recent: [{ id: 'm1', ts: today }] }
    });

    const firstFire = await FlowStorage.consumeWeeklyHabitTrigger();
    check('the week the habit bar is first crossed fires true', firstFire === true);
    const state = await FlowStorage.get();
    check('the current week is recorded as reported', typeof state.lastHabitReportedWeek === 'string' && state.lastHabitReportedWeek.length > 0, state.lastHabitReportedWeek);

    const secondFire = await FlowStorage.consumeWeeklyHabitTrigger();
    check('the SAME week never fires a second time, even though the bar is still met', secondFire === false);
  }

  console.log('\n--- storage.js: getPmfSnapshot() assembles current state through core/pmf-metrics.js ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm1', process: { id: 'reply-track', name: 'Reply & Track', steps: [] } });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'm1' });
    const snapshot = await FlowStorage.getPmfSnapshot();
    check('the snapshot reflects the exact same shown/written counters just recorded', snapshot.detectedTotal === 1 && snapshot.writtenTotal === 1, snapshot);
    check('closureRate is computed, not left undefined', snapshot.closureRate === 1, snapshot);
    check('the snapshot carries retention and habit sub-objects', Boolean(snapshot.retention) && Boolean(snapshot.habit), snapshot);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
