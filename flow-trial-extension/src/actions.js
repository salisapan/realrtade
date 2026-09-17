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

  // Execution priority from the spec, in order: a real calendar event beats
  // a drafted reply beats a bare task. Google Tasks is the guaranteed
  // fallback — always included unless the plan is already full — not
  // "only when nothing else applies."
  function planFor(intent, ctx) {
    ctx = ctx || {};
    const actions = [];
    if (!intent || !intent.type) return actions;

    const e = intent.entities || {};
    const sig = intent.signals || {};
    const hasAttachment = Boolean(ctx.hasThreadAttachment);

    // Calendar: only ever from a SCHEDULED_EVENT classification — intent.js
    // already required a meeting noun + date + time together before
    // returning that type, so there is nothing further to gate here.
    if (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT) {
      actions.push({
        id: 'calendar',
        kind: 'calendar',
        // intent.label, not entities.what — what is the full quoted
        // sentence (can run to hundreds of characters), fine for a task's
        // notes field but not for a chip that has to stay lightweight.
        label: 'Add to Calendar: ' + (intent.label || 'Meeting'),
        params: {
          title: (intent.label || e.what || 'Meeting').slice(0, 200),
          dateIso: e.dateIso, hour: e.hour, minute: e.minute,
          threadUrl: ctx.threadUrl
        }
      });
    }

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
    if (draftWorthy && actions.length < MAX_ACTIONS) {
      actions.push({
        id: 'draft',
        kind: 'gmailDraft',
        label: 'Prepare reply draft' + (hasAttachment ? ' with attachment' : ''),
        params: {
          intentType: intent.type,
          what: e.what, when: e.when, amount: e.amount,
          threadUrl: ctx.threadUrl,
          includeAttachment: hasAttachment
        }
      });
    }

    // Google Tasks: the guaranteed fallback. Always offered unless the plan
    // has already hit the cap — a task is the one action that never
    // requires a confident date+time (Calendar) or a confident reply
    // (Draft), so it is the safety net when either of those wasn't
    // confident enough to propose, and a useful paper trail even when they
    // were.
    if (actions.length < MAX_ACTIONS) {
      actions.push({
        id: 'task',
        kind: 'googleTask',
        label: 'Create task: ' + (intent.label || e.what || intent.type),
        params: {
          title: intent.label || e.what,
          dateIso: e.dateIso,
          amount: e.amount,
          threadUrl: ctx.threadUrl
        }
      });
    }

    return actions.slice(0, MAX_ACTIONS);
  }

  return { planFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowActions };
