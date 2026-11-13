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
  // A chat (WhatsApp, Messenger, Instagram, Teams) has no email draft: the person types the reply in the chat. There an ask of the person is
  // anchored on their task (as the chat cards do, core/chat-deadline-ask.js) and still closes on their own reply in that chat (reply-sent).
  const CHAT_SURFACES = { whatsapp: true, messenger: true, instagram: true, teams: true };
  const CHAT_ANCHOR_KINDS = { calendar: ANCHOR_KINDS.calendar, draft: ANCHOR_KINDS.task, task: ANCHOR_KINDS.task };
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
    if (p.step === 'task' && p.kind === 'promise_by_me') return Object.assign(base, { type: 'commitment' }); // the person's own promise: Follow-through
    if (p.step === 'task') return Object.assign(base, { type: 'followup' }); // the sender promised: Glance tracks it (Log It)
    return null; // file_save is suggest-save's decision on the real attachment list, not a model plan
  }

  // What really closes it, per anchor (docs/true-close.md §7; proof-of-close.js).
  function doneWhen(anchorKind, step, kind) {
    if (kind === 'promise_by_me') return { kind: 'promise-kept', proof: 'a message the person sent in this thread that delivers it', notCompletion: 'the task or the prepared draft' };
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
    if (p.step === 'task' && p.kind === 'promise_by_me') return { checkOn: p.due && p.due >= t ? p.due : t, then: 'remind' };
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
  //   your own promise (kind promise_by_me, core/kind-check.js) -> direction 'mine', subtype owe:promise; looked at on its day.
  //   meeting        -> no watch: it closes on the calendar (doneWhen event-exists).
  // msg: { threadId, messageId, subject, counterpart:{email,name}, channel }. No thread, no watch.
  function toWatch(plan, p, msg, now) {
    const FU = followUp();
    if (!FU || !plan || !p || !msg || !msg.threadId) return null;
    if (p.step !== 'draft' && p.step !== 'task') return null;
    const t = typeof now === 'number' ? now : Date.now();
    const own = p.step === 'task' && p.kind === 'promise_by_me';
    const mine = p.step === 'draft' || own;
    const what = String(p.askSpan || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!what) return null;
    const todayIso = FU.isoDay(new Date(t));
    const chaseIso = mine ? (p.due && p.due >= todayIso ? p.due : FU.yoursDate(t)) : FU.chaseDate(FU.KINDS.REPLY, p.due || null, t);
    const w = FU.buildWatch({
      threadId: msg.threadId, messageId: msg.messageId || null, subject: msg.subject || '', counterpart: msg.counterpart || {}, channel: msg.channel || 'gmail', now: t,
      ask: { kind: FU.KINDS.REPLY, what, deadlineIso: p.due || null, chaseIso, lang: /[\u0590-\u05FF]/.test(what) ? 'he' : 'en',
        subtype: own ? 'owe:promise' : (mine ? 'owe:reply' : 'promised'), tier: 'model', direction: mine ? 'mine' : 'theirs' }
    });
    return Object.assign(w, { closeWhen: plan.doneWhen ? plan.doneWhen.kind : null, planProcess: plan.processId });
  }

  // gate(process, proposal, anchors?) -> { pass, reason }
  function gate(process, p, anchors) {
    const steps = (process && process.steps) || [];
    if (!steps.length) return { pass: false, reason: 'plan:empty' };
    if (steps.length > MAX_STEPS) return { pass: false, reason: 'plan:too-many-steps' };
    for (const s of steps) {
      if (!s || ALLOWED_KINDS.indexOf(s.kind) < 0) return { pass: false, reason: 'plan:kind-not-allowed:' + (s && s.kind) };
      const d = s.params && s.params.dateIso;
      if (d && d !== p.due) return { pass: false, reason: 'plan:date-not-read-by-device' };
    }
    const anchor = steps[0].kind;
    if (((anchors || ANCHOR_KINDS)[p.step] || []).indexOf(anchor) < 0) return { pass: false, reason: 'plan:anchor-mismatch:' + anchor };
    return { pass: true, anchor };
  }

  // plan(flags, proposal, ctx) -> { used:false } | { used:true, plan|null, rows, reason? }
  // ctx: { text (the mail, for planFor's own vetoes), today, lang, threadUrl, executionMemory,
  //        surface: 'gmail' (also the Gmail add-on) | 'outlook' | 'whatsapp' | 'messenger' | 'instagram' | 'teams' }
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
    const chat = CHAT_SURFACES[ctx.surface] === true;
    if (chat) {
      process = Object.assign({}, process, { steps: process.steps.filter((s) => s.kind !== 'gmailDraft' && s.kind !== 'outlookDraft') });
      if (!process.steps.length) return { used: true, plan: null, reason: 'plan:chat-no-step' };
    }
    const g = gate(process, p, chat ? CHAT_ANCHOR_KINDS : null);
    if (!g.pass) return { used: true, plan: null, reason: g.reason };
    const steps = process.steps.map((s) => Object.assign({}, s, { needsClick: true }));
    const out = {
      processId: process.id, name: process.name, closingLine: process.closingLine, source: 'model',
      steps, anchor: g.anchor, doneWhen: doneWhen(p.step, p.step, p.kind),
      carry: carryFor(p, ctx.today), evidence: p.evidence || null, closes: false
    };
    const rows = L && typeof L.rowsFor === 'function' ? L.rowsFor(Object.assign({}, process, { steps }), { lang: ctx.lang, memory: ctx.executionMemory }) : [];
    return { used: true, plan: out, rows };
  }

  // closeFor(flags, watch, msg, now) -> { none:true } | { patch, close? } : what the newest message in the thread does to a loop toWatch()
  // opened. The host calls it in place of the follow loop's generic rule for these loops, because that rule closes a 'mine' loop only on a
  // delivery ("attached", "done"), and an ask of you closes on your real answer (doneWhen reply-sent). Read with the follow loop's own reply
  // reader (core/follow-up.js classifyReply), so "got it", "I'll check" and an auto-reply never close anything.
  //   ask of you (owe:reply)       your answer closes it (replied); your "no" closes it (declined, a deliberate release); "I'll send it
  //                                Thursday" keeps it open and moves the day; an acknowledgement or a question back keeps it open.
  //   your own promise (owe:promise) a message of yours that delivers it closes it (kept); a new date keeps it open and moves the day.
  //   their promise (promised)     their message is read by the follow loop's own rules (classifyReply + applyReply).
  // msg: { isOwn, text (quoted history removed), email, evidence? }. Off with aiPlanV1, like the plan itself.
  function closeFor(flags, w, msg, now) {
    const FU = followUp();
    if (!enabled(flags) || !FU || !w || w.status !== 'waiting' || w.tier !== 'model' || !msg) return { none: true };
    const t = typeof now === 'number' ? now : Date.now();
    const text = String(msg.text || '');
    if (w.subtype === 'promised') {
      if (msg.isOwn) return { none: true };
      return FU.applyReply(w, FU.classifyReply(text, w, { now: t, email: msg.email, evidence: msg.evidence }), t);
    }
    if (!msg.isOwn) return { none: true }; // the ball is the person's; a message from the other side does not close what the person owes
    if (w.subtype === 'owe:promise') {
      if (FU.deliversFor(w, text, msg.evidence || null)) return { patch: FU.closeAsKept(w, t), close: true };
      const r = FU.classifyReply(text, Object.assign({}, w, { kind: FU.KINDS.REPLY }), { now: t });
      return r.outcome === 'promised' && r.promisedIso ? { patch: { stage: 'promised', promisedIso: r.promisedIso, chaseIso: r.promisedIso } } : { none: true };
    }
    if (w.subtype !== 'owe:reply') return { none: true };
    const r = FU.classifyReply(text, Object.assign({}, w, { kind: FU.KINDS.REPLY }), { now: t, evidence: msg.evidence });
    if (r.outcome === 'closed') return { patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'replied' }, close: true };
    if (r.outcome === 'declined') return { patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'declined' }, close: true };
    if (r.outcome === 'promised') return { patch: { stage: 'promised', promisedIso: r.promisedIso || null, chaseIso: r.promisedIso || FU.yoursDate(t) } };
    return { none: true };
  }

  return { SWITCH, DEFAULTS, ALLOWED_KINDS, MAX_STEPS, enabled, toIntent, gate, plan, doneWhen, carryFor, toWatch, titleFrom, closeFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowModelPlan };
