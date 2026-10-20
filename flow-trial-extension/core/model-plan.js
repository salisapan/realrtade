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
  const followUp = () => sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');

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

  // When Glance looks again while it is still open. The follow loop's own rules (core/follow-up.js), so the plan and the loop agree:
  // an ask of you is looked at on its due day (else the next business day); a promise to you is chased by chaseDate (the promised day);
  // a meeting is checked on its day.
  function carryFor(p, todayIso) {
    const FU = followUp();
    const now = todayIso ? Date.parse(todayIso + 'T12:00:00') : Date.now();
    const t = todayIso || new Date(now).toISOString().slice(0, 10);
    if (p.step === 'task') {
      const on = FU ? FU.chaseDate(FU.KINDS.REPLY, p.due || null, now) : (p.due && p.due >= t ? p.due : t);
      return { checkOn: on, then: 'chase' };
    }
    if (!p.due) return { checkOn: p.step === 'draft' && FU ? FU.yoursDate(now) : null, then: 'ask-the-person' };
    return { checkOn: p.due < t ? t : p.due, then: 'remind' };
  }

  // toWatch(plan, proposal, msg, now) -> a follow-loop watch (core/follow-up.js buildWatch) or null.
  // Carry until closed: a close only the model found is carried by the same loop as every other one.
  //   ask of you    -> direction 'mine' (you owe the answer, subtype owe:reply); closes when your reply goes out.
  //   promise to you -> direction 'theirs' (they owe it); chased until the promised thing arrives.
  //   meeting        -> no watch: it closes on the calendar (doneWhen event-exists).
  // msg: { threadId, messageId, subject, counterpart:{email,name}, channel }. No thread, no watch.
  function toWatch(plan, p, msg, now) {
    const FU = followUp();
    if (!FU || !plan || !p || !msg || !msg.threadId) return null;
    if (p.step !== 'draft' && p.step !== 'task') return null;
    const t = typeof now === 'number' ? now : Date.now();
    const mine = p.step === 'draft';
    const what = String(p.askSpan || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!what) return null;
    const todayIso = FU.isoDay(new Date(t));
    const chaseIso = mine ? (p.due && p.due >= todayIso ? p.due : FU.yoursDate(t)) : FU.chaseDate(FU.KINDS.REPLY, p.due || null, t);
    const w = FU.buildWatch({
      threadId: msg.threadId, messageId: msg.messageId || null, subject: msg.subject || '', counterpart: msg.counterpart || {}, channel: msg.channel || 'gmail', now: t,
      ask: { kind: FU.KINDS.REPLY, what, deadlineIso: p.due || null, chaseIso, lang: /[\u0590-\u05FF]/.test(what) ? 'he' : 'en',
        subtype: mine ? 'owe:reply' : 'promised', tier: 'model', direction: mine ? 'mine' : 'theirs' }
    });
    return Object.assign(w, { closeWhen: plan.doneWhen ? plan.doneWhen.kind : null, planProcess: plan.processId });
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
  // ctx: { text (the mail, for planFor's own vetoes), today, lang, threadUrl, executionMemory, surface: 'gmail'|'outlook' }
  function plan(flags, p, ctx) {
    if (!enabled(flags)) return { used: false };
    ctx = ctx || {};
    const A = actions(), L = stepList();
    if (!A || typeof A.planFor !== 'function') return { used: true, plan: null, reason: 'no-actions' };
    const intent = toIntent(p);
    if (!intent) return { used: true, plan: null, reason: p && p.step === 'file_save' ? 'file-save-is-suggest-save' : 'no-proposal' };
    let process;
    // The mail text: planFor's own meeting veto and hedge checks run on model plans too.
    try { process = A.planFor(intent, { threadUrl: ctx.threadUrl || null, executionMemory: ctx.executionMemory || null, text: typeof ctx.text === 'string' ? ctx.text : '' }); } catch (e) { return { used: true, plan: null, reason: 'planner-error' }; }
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

  return { SWITCH, DEFAULTS, ALLOWED_KINDS, MAX_STEPS, enabled, toIntent, gate, plan, doneWhen, carryFor, toWatch, titleFrom };
})();

if (typeof module !== 'undefined') module.exports = { FlowModelPlan };
