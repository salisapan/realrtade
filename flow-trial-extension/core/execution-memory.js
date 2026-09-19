// Execution Memory: an append-only local event log of what a user actually
// does with a proposed process. One entry per outcome, not just a running
// counter — so the raw signal is never thrown away, and a future pass can
// re-derive different statistics from the same history without having lost
// anything.
//
// Schema (newest first), one entry per behavioral event:
//   {
//     intentionId: string | null,  // the message this process was proposed for
//     processType: string,         // the process catalog id (e.g. 'reply-track')
//     steps: string[],             // catalog step ids this event applies to
//     status: 'accepted' | 'dismissed' | 'undone' | 'pinned',
//     scope: 'whole' | 'partial' | null,  // only meaningful when status is
//                                          // 'dismissed' — see makeEvent
//     timestamp: string            // ISO 8601
//   }
//
// A single Do It click that keeps some steps and strips others produces TWO
// events sharing the same intentionId/processType — one 'accepted' event for
// the kept steps, one 'dismissed' event for the stripped ones — rather than
// inventing a compound status this schema doesn't have. A step removed
// before confirming and a fully dismissed chip are exactly the same signal
// (see recordDismiss below), so both reuse the one 'dismissed' status.
//
// 'pinned' is the one status this file never writes on its own — it exists
// only for recordPin() below, fired from a direct human answer ("No, keep
// proposing it") to the popup's Execution Memory insight card, not from
// anything inferred. It permanently overrides isNetRejected() for that step
// (see actions.js) regardless of whatever removed/undone counts pile up
// after it: an explicit correction always outranks an inference.
//
// getAll() folds this log into the {processId: {closedCount, undoneCount,
// wholeDismissCount, steps: {kind: {accepted, removed, undone, pinned}}}}
// shape. actions.js's applyMemory() consumes the per-step half for scoring
// which non-anchor steps to keep, drop, or reorder; wholeDismissCount is the
// higher-level, whole-process pattern content-gmail.js's silent self-tune
// (see checkPrecisionSelfTune) reads to notice a process TYPE this account
// has never once wanted, not just one step within it. The log is the only
// thing actually stored — the aggregate is recomputed from it on every
// read, so there is exactly one source of truth and nothing to keep in sync
// by hand.
//
// This exists for one purpose: "You intend — we execute" only holds if the
// system gets better at guessing your intent the more it watches you close
// (or not close) the same kind of process. A step this account has
// repeatedly stripped off before confirming, or accepted and then undone,
// is a real preference — not proposing it again next time is the system
// acting on what it already learned, not a "smarter suggestion algorithm."
// The process TYPE itself isn't scored the same way, because today's
// catalog has no ambiguity to resolve there — intent.js's classification
// already picks exactly one process per message (see actions.js's
// processFor()); there is nothing to choose between yet.
//
// Nothing about what a user accepts, removes, or undoes is ever sent
// anywhere, regardless of host.
//
// Storage is an injected adapter, not a hardcoded chrome.storage.local call
// — this file lives in core/ precisely because it must run somewhere other
// than a Chrome extension context one day (Flow's future server-side
// runtime), and a persistence choice baked into the business logic is
// exactly the kind of thing that would force a rewrite to get there. The
// default adapter below is a plain in-memory store: safe everywhere (never
// throws, never touches a global that might not exist), correct for a
// single process's lifetime, and simply not durable across restarts —
// which is the right default for code that doesn't yet know what host it's
// running in. Glance's actual persistence (chrome.storage.local) is wired
// in from the CLIENT side via setStorageAdapter() — see
// src/chrome-storage-adapter.js — so this file itself never references
// chrome.* at all. A future Flow runtime wires in its own adapter
// (a database row, a per-tenant KV store, whatever it needs) the same way,
// without touching a line below.
const FlowExecutionMemory = (() => {
  const STORAGE_KEY = 'flowExecutionEvents';
  // Same cap/ordering convention as FlowStorage's own appendLog
  // (src/storage.js) — newest first, bounded so a long-lived mailbox never
  // grows this without limit. Far more than actions.js needs to converge on
  // a real preference; kept generous since this log doubles as the audit
  // trail for what Execution Memory actually saw.
  const MAX_EVENTS = 500;

  function inMemoryAdapter() {
    const store = new Map();
    return {
      async get(key) { return store.get(key); },
      async set(key, value) { store.set(key, value); }
    };
  }

  let adapter = inMemoryAdapter();

  // The one seam a host environment needs: swap what "persist" means
  // without this file's business logic (getAll's fold, the record*
  // functions, toPatternSummary) knowing or caring. `next` must implement
  // { get(key) -> Promise<value>, set(key, value) -> Promise<void> }.
  function setStorageAdapter(next) {
    adapter = next;
  }

  async function getLog() {
    try {
      const log = await adapter.get(STORAGE_KEY);
      return log || [];
    } catch (e) {
      return [];
    }
  }

  // The adapter interface is read-then-write with no atomic compare-and-set
  // (chrome.storage.local doesn't have one, and neither does the in-memory
  // default) — the exact same gap storage.js's own appendLog documents and
  // guards against. Two record* calls close together (a real possibility
  // now: the live chip, the Brief panel, Contextual Resurfacing, and the
  // popup's Open tab can each fire one independently) used to both read the
  // OLD log before either wrote back, so whichever appendEvents() call
  // landed second silently overwrote the first — not a duplicate, a
  // genuinely LOST behavioral event, which is worse: it never gets a chance
  // to correct itself and just quietly under-counts how often a step gets
  // rejected, skewing actions.js's future bias decisions. Serializing every
  // call to appendEvents through one queue closes that window.
  let queue = Promise.resolve();
  function serialize(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {}); // one failure must not wedge later calls
    return run;
  }

  const appendEvents = (events) => serialize(async () => {
    try {
      const log = await getLog();
      const next = [...events, ...log].slice(0, MAX_EVENTS);
      await adapter.set(STORAGE_KEY, next);
    } catch (e) {
      // Never let memory bookkeeping be the reason a real write fails or a
      // dismiss doesn't register — this is a bias signal for next time, not
      // something this click depends on.
    }
  });

  function blankProcess() {
    // wholeDismissCount is the higher-level pattern the precision/harm audit
    // asked for beyond step counts: not "which step gets stripped" but
    // "does this account ever actually want this KIND of process at all."
    // Read together with closedCount (see isNetRejected-style callers), a
    // process with several whole dismissals and zero closes is a process
    // type this account has never once wanted — a real behavioral pattern,
    // not step-level noise.
    return { closedCount: 0, undoneCount: 0, wholeDismissCount: 0, steps: {} };
  }
  function blankStep() {
    return { accepted: 0, removed: 0, undone: 0, pinned: 0 };
  }

  // The read side: fold the raw event log into the per-process, per-step
  // aggregate applyMemory() scores against. Recomputed on every call rather
  // than cached, since the log is small (MAX_EVENTS) and this only ever
  // runs once per Gmail reading-pane scan — not a hot path.
  async function getAll() {
    const log = await getLog();
    const byProcess = {};
    for (const ev of log) {
      if (!ev || !ev.processType) continue;
      const proc = byProcess[ev.processType] || (byProcess[ev.processType] = blankProcess());
      if (ev.status === 'accepted') proc.closedCount++;
      if (ev.status === 'undone') proc.undoneCount++;
      // Missing scope reads as 'partial' — see makeEvent's own comment on
      // why that's the conservative default for pre-existing log entries.
      if (ev.status === 'dismissed' && ev.scope === 'whole') proc.wholeDismissCount++;
      for (const k of ev.steps || []) {
        const step = proc.steps[k] || (proc.steps[k] = blankStep());
        if (ev.status === 'accepted') step.accepted++;
        else if (ev.status === 'dismissed') step.removed++;
        else if (ev.status === 'undone') step.undone++;
        else if (ev.status === 'pinned') step.pinned++;
      }
    }
    return byProcess;
  }

  // `scope` only means anything on a 'dismissed' event: 'whole' means every
  // step of the process was rejected in one motion (the entire chip was
  // dismissed, or every pill was stripped before confirming — onDoIt's own
  // comment already treats those as the same signal); 'partial' means some
  // steps were kept and only these specific ones were removed. Older log
  // entries recorded before this field existed simply lack it — getAll()
  // below treats a missing scope as 'partial' (the more conservative read:
  // undercounting a whole-process rejection pattern is a smaller mistake
  // than inventing one), and it self-heals as the 500-entry log rolls over.
  function makeEvent(intentionId, processType, steps, status, scope) {
    return { intentionId: intentionId || null, processType, steps: steps.slice(), status, scope: scope || null, timestamp: new Date().toISOString() };
  }

  // Called once per Do It click: which step kinds survived into the actual
  // write (acceptedKinds) and which were stripped off first with the × on
  // the pill (removedKinds) — both by catalog step id, not by connector
  // kind, since the bias this feeds is "does this account want a Draft step
  // in this process," not "did this exact draft get removed." intentionId
  // is the message this process was proposed for.
  function recordDoIt(processId, acceptedKinds, removedKinds, intentionId) {
    if (!processId) return Promise.resolve();
    const events = [];
    if (acceptedKinds && acceptedKinds.length) events.push(makeEvent(intentionId, processId, acceptedKinds, 'accepted'));
    // 'partial': some steps survived into the write, so this removal is a
    // preference about which steps, not a rejection of the whole process.
    if (removedKinds && removedKinds.length) events.push(makeEvent(intentionId, processId, removedKinds, 'dismissed', 'partial'));
    if (!events.length) return Promise.resolve();
    return appendEvents(events);
  }

  // Dismissing the whole chip is the same signal as removing every one of
  // its steps — the user looked at the full process and wanted none of it.
  function recordDismiss(processId, allKinds, intentionId) {
    if (!processId || !allKinds || !allKinds.length) return Promise.resolve();
    return appendEvents([makeEvent(intentionId, processId, allKinds, 'dismissed', 'whole')]);
  }

  // Accepted, then undone — a stronger "don't propose this" signal than a
  // pre-execution removal, since the user only found out they didn't want
  // it after seeing it actually happen.
  function recordUndo(processId, undoneKinds, intentionId) {
    if (!processId || !undoneKinds || !undoneKinds.length) return Promise.resolve();
    return appendEvents([makeEvent(intentionId, processId, undoneKinds, 'undone')]);
  }

  // The one write path a click in this file's header comment describes as
  // never self-generated — only the popup's Execution Memory insight card
  // fires this, when a person explicitly answers "no" to "Glance noticed
  // you usually remove X — keep it that way?" A single step, always
  // (there's only ever one insight shown, and only one step in it).
  function recordPin(processId, stepKind, intentionId) {
    if (!processId || !stepKind) return Promise.resolve();
    return appendEvents([makeEvent(intentionId, processId, [stepKind], 'pinned')]);
  }

  // --- Foundation for future anonymous team-level pattern sharing --------
  //
  // Not wired to anything today: no network call, no team or org concept
  // anywhere in this product, no UI. This exists only so that when a real
  // "share anonymous patterns with your team" feature is eventually built,
  // the one genuinely hard part — deciding exactly which facts are safe to
  // aggregate across people — is already settled, instead of invented from
  // scratch under pressure the day someone asks for it.
  //
  // toPatternSummary() collapses getAll()'s per-account aggregate into a
  // flat list of {processType, stepKind, accepted, removed, undone, pinned}
  // rows. That is deliberately ALL it carries: no intentionId, no
  // timestamp, no message content, no per-event detail, no identifier for
  // this install or this person. Those live in the local log for this
  // account's own use (see getAll() above) and have no reason to ever
  // leave the device. What is left after stripping all of that is exactly
  // the shape a team-level feature would need — "across people who chose
  // to share, how often does this step in this process get kept" — and
  // nothing more.
  //
  // Building the real feature on top of this later still requires, at
  // minimum: an explicit per-user opt-in (off by default, same posture as
  // Draft-It's masked processing), a real notion of "team" this product
  // does not have yet, and a server endpoint that only ever receives rows
  // in this exact shape. This function does not decide any of that — it
  // only makes the eventual decision possible without a rewrite of the
  // data this local log already keeps.
  function toPatternSummary(byProcess) {
    const rows = [];
    for (const processType of Object.keys(byProcess || {})) {
      const proc = byProcess[processType] || {};
      const steps = proc.steps || {};
      for (const stepKind of Object.keys(steps)) {
        const s = steps[stepKind] || {};
        rows.push({
          processType,
          stepKind,
          accepted: s.accepted || 0,
          removed: s.removed || 0,
          undone: s.undone || 0,
          pinned: s.pinned || 0,
          // Process-level, not step-level — repeated on every row for this
          // processType rather than a separate array, so a future team-level
          // consumer can read one flat row shape without a second join. Same
          // privacy posture as every other field here: an aggregate count,
          // never a message, never an identifier.
          wholeDismissed: proc.wholeDismissCount || 0
        });
      }
    }
    return rows;
  }

  return { getAll, getLog, recordDoIt, recordDismiss, recordUndo, recordPin, toPatternSummary, setStorageAdapter };
})();

if (typeof module !== 'undefined') module.exports = { FlowExecutionMemory };
