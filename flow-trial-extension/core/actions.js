// The decision layer: given a classified Intent (from intent.js), a little
// context about the message (thread URL, attachment), and this account's
// own Execution Memory (execution-memory.js), decides on ONE short,
// named PROCESS to close the intention — never a loose pile of
// independent actions. Execution lives in background.js; this file only
// ever returns a plan for the chip to render and, on click, hand to
// background.js one step at a time.
//
// "You intend — we execute": a process is what a person would describe as
// one outcome ("scheduled, confirmed, and a follow-up is set"), not three
// separate things that happen to have appeared together. planFor()
// returns { id, name, closingLine, steps } or null — never a bare array —
// specifically so nothing downstream can drift back into treating this as
// an unrelated grab-bag of pills.
//
// This is the middle of the three-layer split the spec requires
// (Classification -> Decision -> Execution). Adding a platform later
// (Outlook, WhatsApp) means adding new step kinds here and a matching
// executor in background.js — this file's shape does not change.
//
// Each step also carries an explicit `dependsOn` (a prior step's id, or
// null — see buildStep below) — the process is an atomic, ordered chain,
// not an unordered set, and content-gmail.js's sequencer/rollback
// (runActionsSequentially / rollbackChain) is built to honor that ordering
// rather than assume steps are independent just because today's catalog
// happens to make them so.

const FlowActions = (() => {
  const MAX_ACTIONS = 5;
  // A step this process has been actively rejected on (removed before
  // confirming, or accepted and then undone) more often than kept, across
  // at least this many real occurrences, stops being proposed by default.
  // Below this sample size a couple of removals reads as noise, not
  // preference — one dismissal on a novel process is not a verdict.
  const DEMOTE_THRESHOLD = 3;

  function calendarAction(intent, e, ctx) {
    return {
      id: 'calendar',
      kind: 'calendar',
      // Short — this is a collapsed-by-default step label, not the whole
      // sentence describing the step (see content-gmail.js's injectChip:
      // only surfaced at all once someone opens the step list). The full
      // description still exists, as `hint`, for the step's title/aria-label.
      label: 'Calendar',
      hint: 'Add to Calendar: ' + (intent.label || 'Meeting'),
      params: {
        // intent.label, not entities.what — what is the full quoted
        // sentence (can run to hundreds of characters), fine for a task's
        // notes field but not for an event title.
        title: (intent.label || e.what || 'Meeting').slice(0, 200),
        dateIso: e.dateIso, hour: e.hour, minute: e.minute,
        threadUrl: ctx.threadUrl
      }
    };
  }

  function draftAction(intent, e, ctx, hasAttachment) {
    // For the SCHEDULED_EVENT + handoff combined process (a meeting invite
    // that also asks the reader to confirm), entities.what is the MEETING
    // sentence — the right title for the Calendar step above, but not what
    // this draft should be replying to. entities.requestWhat (set by
    // intent.js whenever a handoff signal is present, independent of which
    // type won) is the actual ask; falling back to entities.what keeps
    // REQUEST/COMMITMENT_OF_READER unchanged, since their own `what` is
    // already the request/commitment sentence.
    const what = (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && e.requestWhat) ? e.requestWhat : e.what;
    return {
      id: 'draft',
      kind: 'gmailDraft',
      label: hasAttachment ? 'Draft reply + file' : 'Draft reply',
      hint: 'Prepare reply draft' + (hasAttachment ? ' with attachment' : ''),
      params: {
        intentType: intent.type,
        what, when: e.when, amount: e.amount,
        threadUrl: ctx.threadUrl,
        includeAttachment: hasAttachment
      }
    };
  }

  function taskAction(intent, e, ctx) {
    return {
      id: 'task',
      kind: 'googleTask',
      label: 'Task',
      hint: 'Create task: ' + (intent.label || e.what || intent.type),
      params: {
        title: intent.label || e.what,
        dateIso: e.dateIso,
        amount: e.amount,
        threadUrl: ctx.threadUrl
      }
    };
  }

  function buildStep(kind, intent, e, ctx, hasAttachment) {
    const step = kind === 'calendar' ? calendarAction(intent, e, ctx)
      : kind === 'draft' ? draftAction(intent, e, ctx, hasAttachment)
      : taskAction(intent, e, ctx);
    // Explicit dependency slot: null for every step in today's catalog,
    // since Calendar/Draft/Task each write independently from the same
    // source intent/entities rather than from one another's results — there
    // is no real "step B needs step A's output" case yet. The field exists
    // so a step that DOES need a prior step's result (e.g. a future draft
    // that quotes the calendar invite it was scheduled against) has
    // somewhere real to declare it, and so content-gmail.js's executor
    // (runActionsSequentially) and its rollback (rollbackChain) have
    // something concrete to honor rather than being retrofitted later.
    step.dependsOn = null;
    return step;
  }

  // ---------------------------------------------------------------- catalog
  //
  // A small, fixed library of named, closing-oriented processes — not a
  // rules engine, and deliberately not extensible from outside this file.
  // `anchor` is the one step Execution Memory below may never demote or
  // reorder: it's the concrete evidence the process exists on at all (a
  // real date+time for a schedule process, the ask itself for a reply) —
  // memory bias only ever touches the secondary steps around it.
  //
  // Exported as-is (see the return statement below) so anything that needs
  // to describe a process's fixed shape from just its id — popup.js's
  // Execution Memory insight card, most notably — reads the exact same
  // table processFor() selects from, instead of a second, hand-copied list
  // that could quietly drift out of sync with it.
  const PROCESS_CATALOG = {
    'schedule-confirm': {
      name: 'Schedule & Confirm',
      closingLine: 'Scheduling this, replying to confirm, and setting a follow-up.',
      closedLine: 'Scheduled, confirmed, and tracked.',
      anchor: 'calendar',
      stepKinds: ['calendar', 'draft', 'task']
    },
    'schedule': {
      name: 'Schedule It',
      closingLine: 'Scheduling this and setting a reminder to prepare.',
      closedLine: 'Scheduled, with a reminder set.',
      anchor: 'calendar',
      stepKinds: ['calendar', 'task']
    },
    'reply-track': {
      name: 'Reply & Track',
      closingLine: 'Drafting your reply and tracking it as a task.',
      closedLine: 'Replied and tracked.',
      anchor: 'draft',
      stepKinds: ['draft', 'task']
    },
    'follow-through': {
      name: 'Follow Through',
      closingLine: 'Setting a reminder to follow through, with a reply ready.',
      closedLine: 'Reminder set, reply ready.',
      anchor: 'task',
      stepKinds: ['task', 'draft']
    },
    // DECISION_TO_LOG / FOLLOW_UP — the chip's original job, narrowed to
    // its own named process rather than a type-less default.
    'log-it': {
      name: 'Log It',
      closingLine: 'Logging this so it stays tracked.',
      // "Logged." alone read thinner than every sibling closedLine here
      // (all the others state two things that happened) now that this
      // string is actually shown in the receipt — see content-gmail.js's
      // closedSummary(). "and tracked" also matches reply-track's own
      // vocabulary for the same underlying step (a Google Task).
      closedLine: 'Logged and tracked.',
      anchor: 'task',
      stepKinds: ['task']
    }
  };

  function processFor(intent) {
    const sig = intent.signals || {};
    let id;
    if (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT) {
      id = sig.handoff ? 'schedule-confirm' : 'schedule';
    } else if (intent.type === FlowIntent.TYPES.REQUEST) {
      id = 'reply-track';
    } else if (intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER) {
      id = 'follow-through';
    } else {
      id = 'log-it';
    }
    return Object.assign({ id }, PROCESS_CATALOG[id]);
  }

  // ----------------------------------------------------------- memory bias
  //
  // A step is net-rejected once it's been removed-or-undone more often than
  // accepted, across a real sample size — below DEMOTE_THRESHOLD a couple of
  // removals reads as noise, not preference, and one dismissal on a novel
  // process is not a verdict. `pinned` overrides this unconditionally: it's
  // set only by an explicit "No, keep proposing it" click on the popup's
  // Execution Memory insight card (see FlowExecutionMemory.recordPin) — a
  // human's direct answer to a direct question always outranks the
  // algorithm's own inference from indirect signals.
  //
  // Exported (see the return statement below) so that same insight card can
  // ask "is this actually being demoted right now" using the identical
  // predicate applyMemory acts on, rather than a second copy of this math
  // that could silently disagree with what the live chip is really doing.
  function isNetRejected(stats) {
    if (!stats || stats.pinned) return false;
    const rejected = (stats.removed || 0) + (stats.undone || 0);
    return rejected >= DEMOTE_THRESHOLD && rejected > (stats.accepted || 0);
  }

  // Within the non-anchor steps only: drop a step kind isNetRejected() flags,
  // and otherwise order the rest by historical acceptance rate —
  // most-reliably-kept first. No history for a step yet -> neutral 0.5 rate,
  // which keeps the catalog's own default order for ties.
  function applyMemory(stepKinds, anchor, memoryForProcess) {
    const rest = stepKinds.filter((k) => k !== anchor);
    const stats = (memoryForProcess && memoryForProcess.steps) || {};

    const kept = rest.filter((k) => !isNetRejected(stats[k]));

    const scored = kept.map((k, i) => {
      const s = stats[k];
      if (!s) return { k, rate: 0.5, i };
      const total = s.accepted + s.removed + s.undone;
      return { k, rate: total > 0 ? s.accepted / total : 0.5, i };
    });
    scored.sort((a, b) => b.rate - a.rate || a.i - b.i);

    const ordered = scored.map((x) => x.k);
    return stepKinds.includes(anchor) ? [anchor, ...ordered] : ordered;
  }

  // ctx.executionMemory, when present, is the FULL memory blob keyed by
  // process id (FlowExecutionMemory.getAll()'s own shape) — fetched once by
  // content-gmail.js per scan, not per process, since which process this
  // message needs isn't known until after classification.
  function planFor(intent, ctx) {
    ctx = ctx || {};
    if (!intent || !intent.type) return null;

    const e = intent.entities || {};
    const hasAttachment = Boolean(ctx.hasThreadAttachment);
    const proc = processFor(intent);
    const memoryForProcess = ctx.executionMemory ? ctx.executionMemory[proc.id] : null;
    const orderedKinds = applyMemory(proc.stepKinds, proc.anchor, memoryForProcess).slice(0, MAX_ACTIONS);

    const steps = orderedKinds
      .map((kind) => buildStep(kind, intent, e, ctx, hasAttachment))
      .filter(Boolean);
    if (!steps.length) return null; // every non-anchor step demoted AND no anchor in this catalog entry — never happens today, but never silently propose nothing described

    return { id: proc.id, name: proc.name, closingLine: proc.closingLine, closedLine: proc.closedLine, steps };
  }

  return { planFor, MAX_ACTIONS, PROCESS_CATALOG, isNetRejected };
})();

if (typeof module !== 'undefined') module.exports = { FlowActions };
