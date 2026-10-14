'use strict';
// The Plan (docs/glance-ai/ai-product.md §3 and §4, milestone M5): a model's grounded proposal becomes the closing plan the steps list draws.
//
// No new step catalog. The proposal is turned into the same intent shape the device engine produces, and core/actions.js planFor() builds the
// process the product already runs (Schedule It, Reply & Track, Log It), so a model can never invent a step the product does not have.
// core/step-list.js rowsFor() turns that process into the rows on the card. On top of that, the plan gate checks every step:
//   - only the step kinds the product can write today (calendar, draft, task; never a send, never an attachment pick, never a page action);
//   - the anchor step is the kind the proposal named (a reply proposal anchors on a draft, a meeting on a calendar event, a promise on a task);
//   - every date on a step is the date the device read from the quoted words (proposal.due), never a different one;
//   - every step needs the person's click (needsClick), and the plan itself never closes anything.
// done_when says what closes the loop for real (docs/true-close.md): a prepared draft, a calendar hold or a task alone is not completion.
// carry says when Glance looks again if it is still open (carry until closed, owner 2026-10-10).
//
// Off switch: SWITCH ('aiPlanV1'), default off: plan() returns { used:false } and builds nothing. Nothing in the extension calls it yet.
// Portable: no chrome.*, no DOM, no network. Needs core/actions.js (and core/intent.js for its types) and core/step-list.js in the same scope.
const FlowModelPlan = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const actions = () => sibling(typeof FlowActions !== 'undefined' ? FlowActions : null, './actions.js', 'FlowActions');
  const stepList = () => sibling(typeof FlowStepList !== 'undefined' ? FlowStepList : null, './step-list.js', 'FlowStepList');

  const SWITCH = 'aiPlanV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  // What a model plan may contain: the writes the product can make today, each on the person's click.
  const ALLOWED_KINDS = ['calendar', 'outlookCalendar', 'gmailDraft', 'outlookDraft', 'googleTask', 'outlookTask'];
  const ANCHOR_KINDS = { calendar: ['calendar', 'outlookCalendar'], draft: ['gmailDraft', 'outlookDraft'], task: ['googleTask', 'outlookTask'] };
  const MAX_STEPS = 3;
  const DAY = 86400000;

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // A short title from the quoted ask: the words as written, trimmed. The device never writes words the mail did not contain.
  function titleFrom(span) {
    const t = String(span || '').replace(/\s+/g, ' ').trim().replace(/^(hi|hello|hey|dear|שלום|היי)\b[^,]*,\s*/i, '');
    return t.length > 80 ? t.slice(0, 77).replace(/\s+\S*$/, '') + '…' : t;
  }

  // proposal (core/understanding.js proposal(), or the router's result.proposal) -> the engine's intent shape.
  function toIntent(p) {
    if (!p || !p.step || p.step === 'SILENT') return null;
    const what = String(p.askSpan || '');
    const label = titleFrom(what);
    const t = p.due_time || null;
    const base = { label, confidence: 'high', source: 'model', signals: {}, entities: { what, requestWhat: what, dateIso: p.due || null, hour: t ? t.hour : null, minute: t ? t.minute : null } };
    if (p.step === 'calendar') return Object.assign(base, { type: 'event' });
    if (p.step === 'draft') return Object.assign(base, { type: 'request' });
    if (p.step === 'task') return Object.assign(base, { type: 'followup' }); // the sender promised: Glance tracks it (Log It)
    return null; // file_save is suggest-save's decision on the real attachment list, not a model plan
  }

  // What really closes it, per anchor (docs/true-close.md §7; proof-of-close.js).
  function doneWhen(anchorKind, step) {
    if (anchorKind === 'draft') return { kind: 'reply-sent', proof: 'a message the person sent in this thread', notCompletion: 'the prepared draft' };
    if (anchorKind === 'calendar') return { kind: 'event-exists', proof: 'the event read back from the calendar', notCompletion: 'a hold the person did not keep' };
    if (step === 'task') return { kind: 'promised-arrived', proof: 'the promised item or reply arrived', notCompletion: 'the tracking task' };
    return { kind: 'task-done', proof: 'fetchedBack from the task system (google/tasks, microsoft/todo)', notCompletion: 'the task being created' };
  }

  // When Glance looks again while it is still open: the due day for an ask or a meeting, the day after it for a promise someone owes.
  function carryFor(p, todayIso) {
    if (!p.due) return { checkOn: null, then: 'ask-the-person' };
    const due = Date.parse(p.due + 'T12:00:00Z');
    const after = p.step === 'task' ? new Date(due + DAY).toISOString().slice(0, 10) : p.due;
    return { checkOn: after < (todayIso || '') ? todayIso : after, then: p.step === 'task' ? 'chase' : 'remind' };
  }

  // gate(process, proposal) -> { pass, reason }
  function gate(process, p) {
    const steps = (process && process.steps) || [];
    if (!steps.length) return { pass: false, reason: 'plan:empty' };
    if (steps.length > MAX_STEPS) return { pass: false, reason: 'plan:too-many-steps' };
    for (const s of steps) {
      if (!s || ALLOWED_KINDS.indexOf(s.kind) < 0) return { pass: false, reason: 'plan:kind-not-allowed:' + (s && s.kind) };
      const d = s.params && s.params.dateIso;
      if (d && d !== p.due) return { pass: false, reason: 'plan:date-not-read-by-device' };
    }
    const anchor = steps[0].kind;
    if ((ANCHOR_KINDS[p.step] || []).indexOf(anchor) < 0) return { pass: false, reason: 'plan:anchor-mismatch:' + anchor };
    return { pass: true, anchor };
  }

  // plan(flags, proposal, ctx) -> { used:false } | { used:true, plan|null, rows, reason? }
  // ctx: { today, lang, threadUrl, executionMemory, surface: 'gmail'|'outlook' }
  function plan(flags, p, ctx) {
    if (!enabled(flags)) return { used: false };
    ctx = ctx || {};
    const A = actions(), L = stepList();
    if (!A || typeof A.planFor !== 'function') return { used: true, plan: null, reason: 'no-actions' };
    const intent = toIntent(p);
    if (!intent) return { used: true, plan: null, reason: p && p.step === 'file_save' ? 'file-save-is-suggest-save' : 'no-proposal' };
    let process;
    try { process = A.planFor(intent, { threadUrl: ctx.threadUrl || null, executionMemory: ctx.executionMemory || null }); } catch (e) { return { used: true, plan: null, reason: 'planner-error' }; }
    if (!process) return { used: true, plan: null, reason: 'no-process' };
    if (ctx.surface === 'outlook') {
      const OUT = { calendar: 'outlookCalendar', gmailDraft: 'outlookDraft', googleTask: 'outlookTask' };
      process = Object.assign({}, process, { steps: process.steps.map((s) => (OUT[s.kind] ? Object.assign({}, s, { kind: OUT[s.kind] }) : s)) });
    }
    const g = gate(process, p);
    if (!g.pass) return { used: true, plan: null, reason: g.reason };
    const steps = process.steps.map((s) => Object.assign({}, s, { needsClick: true }));
    const out = {
      processId: process.id, name: process.name, closingLine: process.closingLine, source: 'model',
      steps, anchor: g.anchor, doneWhen: doneWhen(p.step, p.step),
      carry: carryFor(p, ctx.today), evidence: p.evidence || null, closes: false
    };
    const rows = L && typeof L.rowsFor === 'function' ? L.rowsFor(Object.assign({}, process, { steps }), { lang: ctx.lang, memory: ctx.executionMemory }) : [];
    return { used: true, plan: out, rows };
  }

  return { SWITCH, DEFAULTS, ALLOWED_KINDS, MAX_STEPS, enabled, toIntent, gate, plan, doneWhen, carryFor, titleFrom };
})();

if (typeof module !== 'undefined') module.exports = { FlowModelPlan };
