// The decision layer: given a classified Intent (from intent.js) plus a
// little context about the message (thread URL, whether it carries an
// attachment), decides WHICH concrete actions to propose — never executes
// anything. Execution lives in background.js; this file only ever returns
// a plan for the chip to render and, on click, hand to background.js one
// action at a time.
//
// This is the middle of the three-layer split the spec requires
// (Classification -> Decision -> Execution). It is deliberately the
// smallest of the three: a lookup from intent type (plus a couple of raw
// signals intent.js already computed) to an ordered list of action specs.
// Adding a platform later (Outlook, WhatsApp) means adding new `kind`
// values here and a matching executor in background.js — this file's
// shape of "return an array of {id, kind, label, params}" does not change.

const FlowActions = (() => {
  const MAX_ACTIONS = 5;

  function calendarAction(intent, e, ctx) {
    return {
      id: 'calendar',
      kind: 'calendar',
      // Short — this is a collapsed-by-default pill label, not the whole
      // sentence describing the action (see content-gmail.js's injectChip:
      // only surfaced at all once someone opens "+N more"). The full
      // description still exists, as `hint`, for the pill's title/aria-label.
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
    // For the SCHEDULED_EVENT + handoff combined case (a meeting invite
    // that also asks the reader to confirm), entities.what is the MEETING
    // sentence — the right title for the Calendar action above, but not
    // what this draft should be replying to. entities.requestWhat (set by
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

  // Execution priority from the spec: a real calendar event beats a drafted
  // reply beats a bare task — EXCEPT for COMMITMENT_OF_READER, where the
  // most useful first action is a reminder for the reader's own obligation,
  // not a reply. "You agreed to send the report Friday" is primarily
  // something for the reader to track, whether or not this particular
  // message also happens to want a reply — so Task leads there, Draft
  // second. Google Tasks is the guaranteed fallback in every case — always
  // included unless the plan is already full — not "only when nothing else
  // applies."
  function planFor(intent, ctx) {
    ctx = ctx || {};
    const actions = [];
    if (!intent || !intent.type) return actions;

    const e = intent.entities || {};
    const sig = intent.signals || {};
    const hasAttachment = Boolean(ctx.hasThreadAttachment);

    // A reply draft makes sense whenever the message is itself asking for
    // one (REQUEST, COMMITMENT_OF_READER) OR when an otherwise-calendar
    // message also carries a request signal (sig.handoff) — the "meeting
    // invite that also asks you to confirm" case from the spec's own
    // examples. Never proposed for DECISION_TO_LOG/FOLLOW_UP: those are
    // reports of something that already happened, not something waiting on
    // a reply.
    const draftWorthy =
      intent.type === FlowIntent.TYPES.REQUEST ||
      intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER ||
      (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && sig.handoff);

    function pushCalendar() { if (actions.length < MAX_ACTIONS) actions.push(calendarAction(intent, e, ctx)); }
    function pushDraft() { if (draftWorthy && actions.length < MAX_ACTIONS) actions.push(draftAction(intent, e, ctx, hasAttachment)); }
    function pushTask() { if (actions.length < MAX_ACTIONS) actions.push(taskAction(intent, e, ctx)); }

    if (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT) {
      // Calendar: only ever from this classification — intent.js already
      // required a meeting noun + date + time together (and no cancellation
      // signal) before returning it, so it's the single most concrete,
      // unambiguous action and leads.
      pushCalendar();
      pushDraft();
      pushTask();
    } else if (intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER) {
      pushTask();
      pushDraft();
    } else {
      // REQUEST: the draft IS the thing being asked for, so it leads.
      // DECISION_TO_LOG / FOLLOW_UP: draftWorthy is false here, so
      // pushDraft() is a no-op and the plan reduces to Task alone.
      pushDraft();
      pushTask();
    }

    return actions.slice(0, MAX_ACTIONS);
  }

  return { planFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowActions };
