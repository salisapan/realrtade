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
  }
};

const sandbox = { module: undefined, console, chrome: chromeStub, crypto: { randomUUID: () => 'test-uuid' } };
vm.createContext(sandbox);
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

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
