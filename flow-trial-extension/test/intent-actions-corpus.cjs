// Regression corpus for the decision layer (intent.js) and the process-plan
// layer (actions.js) — judgment-corpus.cjs covers the scorer/extractor; this
// file covers what sits on top of it: which of the five intent types wins,
// what entities it carries, which named PROCESS gets proposed (never a bare
// action list — see actions.js's own header), and how Execution Memory biases
// and demotes that process's non-anchor steps. Written alongside this
// session's quoted-text / label / ordering / event-plus-request changes, and
// this segment's "You intend — we execute" process-model rewrite, so all of
// it stays correct on the next edit.
//
// Run: node test/intent-actions-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);
const FlowJudgment = vm.runInContext('FlowJudgment', sandbox);
const FLOW_DOMAINS = vm.runInContext('FLOW_DOMAINS', sandbox);

const NOW = new Date('2026-09-17T12:00:00Z');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function classify(text, ctx) {
  return FlowIntent.classify(text, Object.assign({ senderEmail: 'dana@meridian.com', now: NOW, calibration: null }, ctx));
}

function stepIds(process) {
  return (process && process.steps || []).map((s) => s.id);
}
function stepKinds(process) {
  return (process && process.steps || []).map((s) => s.kind);
}

console.log('--- intent.js: type + entity checks ---\n');

// 1. A meeting invite alone -> SCHEDULED_EVENT, the plain "Schedule It"
//    process: [Calendar, Task], no draft.
{
  const intent = classify('Let’s do a call Friday, September 18 at 3pm to review the contract.');
  check('meeting alone classifies as SCHEDULED_EVENT', intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
  const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('meeting alone proposes the "schedule" process', process.id === 'schedule', process && process.id);
  check('meeting alone proposes exactly [calendar, task] step ids', JSON.stringify(stepIds(process)) === JSON.stringify(['calendar', 'task']), stepIds(process));
  check('meeting alone proposes exactly [Calendar, Task] connector kinds', JSON.stringify(stepKinds(process)) === JSON.stringify(['calendar', 'googleTask']), stepKinds(process));
}

// 2. Meeting invite that ALSO asks for confirmation -> still SCHEDULED_EVENT,
//    but now the "Schedule & Confirm" process: [Calendar, Draft, Task], and
//    the Draft's `what` must be the ASK ("could you confirm..."), not the
//    meeting sentence itself.
{
  const text = 'Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?';
  const intent = classify(text);
  check('event + request still classifies as SCHEDULED_EVENT', intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
  check('handoff signal is visible on the intent regardless of final type', intent.signals.handoff === true, intent.signals);
  const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('event + request proposes the "schedule-confirm" process', process.id === 'schedule-confirm', process && process.id);
  check('event + request proposes [calendar, draft, task] in that order', JSON.stringify(stepIds(process)) === JSON.stringify(['calendar', 'draft', 'task']), stepIds(process));
  const draft = process.steps.find((s) => s.id === 'draft');
  check('the draft addresses the actual ask, not the meeting sentence', draft && /confirm/i.test(draft.params.what) && !/^let/i.test(draft.params.what), draft && draft.params.what);
}

// 3. A cancelled meeting that still names a specific time must NOT become a
//    Calendar entry — precision over recall.
{
  const intent = classify('The 3pm call on Friday is cancelled — we are not moving forward with this.');
  check('cancelled meeting with a time does not fire SCHEDULED_EVENT', intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
}

// 3b. The other ways a meeting stops happening at the time the message names.
//     The cancelled case above was gated on s.flags.lost — a lexicon about
//     deals falling through, not meetings moving — so postponing, rescheduling
//     and "no longer needed" all still produced a Calendar entry at the old,
//     now-wrong time. Same cost as the cancelled case: the user shows up.
{
  const offCases = [
    ['postponed',          'Let us postpone the call Friday, September 18 at 3pm \u2014 we will rebook it later.'],
    ['rescheduled',        'We need to reschedule the call Friday, September 18 at 3pm to a better week.'],
    ['moved to next week', 'Let us move the call Friday, September 18 at 3pm to the following week instead.'],
    ['no longer needed',   'The call Friday, September 18 at 3pm is no longer needed, we sorted it over email.'],
    ['called off',         'The call Friday, September 18 at 3pm has been called off by the client today.'],
    ['pushed back',        'The call Friday, September 18 at 3pm is pushed back until the contract is final.'],
    ['Hebrew postponed',   '\u05d4\u05e4\u05d2\u05d9\u05e9\u05d4 \u05d1\u05d9\u05d5\u05dd \u05e9\u05d9\u05e9\u05d9 \u05d1\u05e9\u05e2\u05d4 15:00 \u05e0\u05d3\u05d7\u05ea\u05d4 \u05dc\u05e9\u05d1\u05d5\u05e2 \u05d4\u05d1\u05d0.']
  ];
  for (const [label, text] of offCases) {
    const intent = classify(text);
    check('a ' + label + ' meeting does not become a Calendar entry',
      !intent || intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
  }
}

// 3c. A past-tense recap of a meeting that already happened must NOT become
//     a Calendar entry either. extract.js's weekday resolver always resolves
//     "on Monday" forward from `now`, so a recap sent a few days later reads
//     as a meeting-noun + a resolved date + a resolved time — the same shape
//     as a genuine future invite — unless the recap language itself is
//     recognized and refuses the gate, same principle as 3b above.
{
  const now = new Date('2026-09-17T12:00:00Z'); // a Thursday
  const recapCases = [
    ['thanks for the call',   'Thanks for the call on Monday at 3pm — great meeting, glad we synced!'],
    ['it was great meeting',  'It was great meeting you on Monday at 3pm, looking forward to next steps.'],
    ['good talking with you', 'Good talking with you on Monday at 3pm.'],
    ['Hebrew recap',          'תודה על השיחה ביום שני בשעה 15:00, היה נעים לדבר.']
  ];
  for (const [label, text] of recapCases) {
    const intent = classify(text, { now });
    check('a ' + label + ' recap does not become a Calendar entry',
      !intent || intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
  }
  // Sanity: a genuine future invite using the same "on <weekday> at <time>"
  // shape, with no recap language, must still fire — this fix must narrow
  // the gate, not just make it stricter across the board.
  const invite = classify('Can we schedule a call on Monday at 3pm?', { now });
  check('a genuine future invite still fires SCHEDULED_EVENT', invite.type === FlowIntent.TYPES.SCHEDULED_EVENT, invite.type);
}

// 4. A reader commitment reminder -> COMMITMENT_OF_READER, the "Follow
//    Through" process, task anchor leading, draft second.
{
  // Curly apostrophe deliberately (iOS/macOS Mail's own autocorrect) —
  // this is exactly the case newContent()'s normalizeQuotes() now fixes.
  const intent = classify('Confirming you’ll send the signed report by Friday, September 18, as agreed.');
  check('reminder classifies as COMMITMENT_OF_READER', intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER, intent.type);
  const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('commitment proposes the "follow-through" process', process.id === 'follow-through', process && process.id);
  check('commitment proposes [task, draft] — task leads', JSON.stringify(stepIds(process)) === JSON.stringify(['task', 'draft']), stepIds(process));
}

// 5. A direct request -> REQUEST, the "Reply & Track" process, draft anchor
//    leading (the draft is what's literally being asked for).
{
  const intent = classify('Could you please send me the signed contract by Friday, September 18?');
  check('a direct ask classifies as REQUEST', intent.type === FlowIntent.TYPES.REQUEST, intent.type);
  const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('request proposes the "reply-track" process', process.id === 'reply-track', process && process.id);
  check('request proposes [draft, task] — draft leads', JSON.stringify(stepIds(process)) === JSON.stringify(['draft', 'task']), stepIds(process));
}

// 6. The reader's OWN outbound "could you send me X" must never be read as
//    a request made of the reader — this is content-gmail.js's own-email
//    skip logic (session's prior fix), not intent.js's job to re-derive.
//    What IS intent.js's job: never let a QUOTED handoff phrase (this
//    session's fix) leak through as a live signal. Covered directly below.
console.log('\n--- intent.js: quoted content must never drive classification ---\n');
{
  const text = [
    'Sounds good, thanks!',
    '',
    'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:',
    '> Could you please send the signed contract by Friday?'
  ].join('\n');
  const intent = classify(text);
  check('a quoted request does not drive classification of a plain "thanks" reply', intent.type !== FlowIntent.TYPES.REQUEST, intent.type);
}
{
  const text = [
    'מעולה, תודה!',
    '',
    'בתאריך יום ב׳, 1 בספט׳ 2025 בשעה 9:41 מאת דנה כהן <dana@meridian.com> כתבה:',
    '> תוכל בבקשה לשלוח לי את ההסכם החתום עד יום שישי?'
  ].join('\n');
  const intent = classify(text);
  check('a quoted Hebrew request does not drive classification of a plain "thanks" reply', intent.type !== FlowIntent.TYPES.REQUEST, intent.type);
}

console.log('\n--- judgment.js: curly (smart) quotes must match the same as straight ones ---\n');
{
  // iOS/macOS Mail and Word all auto-convert a typed ' into a curly ’ by
  // default — this is not a rare edge case in real email. Checked directly
  // against the scorer's own commit flag (not the full classify() pipeline,
  // which also has to clear a threshold unrelated to what this is testing)
  // so this proves exactly one thing: the curly apostrophe stopped being
  // invisible to the pattern.
  const domain = FLOW_DOMAINS[0];
  const facts = { money: null, moneyText: null, date: null, automated: false, wordCount: 20 };
  // newContent() — not a raw string — because that's where normalizeQuotes()
  // actually runs; score() itself is always called with already-normalized
  // text by its real callers (evaluate()/classify()), so calling it with a
  // raw curly-quoted string here would test nothing.
  const straight = FlowJudgment.score(FlowJudgment.newContent('We\'re good with the terms, go ahead and start whenever you\'re ready.'), domain, facts);
  const curly = FlowJudgment.score(FlowJudgment.newContent('We’re good with the terms, go ahead and start whenever you’re ready.'), domain, facts);
  check('a curly-quoted commitment phrase sets the same commit flag as its straight-quoted twin', straight.flags.commit === true && curly.flags.commit === true, { straight: straight.flags.commit, curly: curly.flags.commit });
}
{
  const straight = classify('Could you please send me the signed contract by Friday, September 18? It\'s overdue.');
  const curly = classify('Could you please send me the signed contract by Friday, September 18? It’s overdue.');
  check('a curly-quoted request classifies the same as its straight-quoted twin', straight.type === FlowIntent.TYPES.REQUEST && curly.type === FlowIntent.TYPES.REQUEST, { straight: straight.type, curly: curly.type });
}

console.log('\n--- actions.js: labels are short and collision-free ---\n');
{
  const eventIntent = classify('Let’s do a call Friday, September 18 at 3pm to review the contract.');
  const [calendarStep] = FlowActions.planFor(eventIntent, { threadUrl: 'x', hasThreadAttachment: false }).steps;
  check('Calendar label is short', calendarStep.label === 'Calendar', calendarStep.label);

  const requestIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  const [draftStep, taskStep] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: false }).steps;
  check('Draft label without attachment is "Draft reply"', draftStep.label === 'Draft reply', draftStep.label);
  check('Task label is "Task"', taskStep.label === 'Task', taskStep.label);

  const [draftWithFile] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: true }).steps;
  check('Draft label with attachment is "Draft reply + file"', draftWithFile.label === 'Draft reply + file', draftWithFile.label);

  const labels = [calendarStep.label, draftStep.label, taskStep.label];
  check('no two pill labels collide', new Set(labels).size === labels.length, labels);
}

console.log('\n--- actions.js: every process names its anchor and its closure copy ---\n');
{
  const cases = [
    ['Let’s do a call Friday, September 18 at 3pm to review the contract.', 'schedule', 'calendar'],
    ['Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?', 'schedule-confirm', 'calendar'],
    ['Could you please send me the signed contract by Friday, September 18?', 'reply-track', 'draft'],
    ['Confirming you’ll send the signed report by Friday, September 18, as agreed.', 'follow-through', 'task']
  ];
  for (const [text, expectedId] of cases) {
    const intent = classify(text);
    const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
    check('"' + expectedId + '" process carries a name, closingLine, and closedLine', Boolean(process.name && process.closingLine && process.closedLine), process);
  }
}

console.log('\n--- actions.js: every step declares an explicit dependsOn slot ---\n');
{
  // A process is an atomic, ORDERED chain, not an unordered set of pills —
  // content-gmail.js's sequencer/rollback (runActionsSequentially /
  // rollbackChain) reads this field on every step to decide execution and
  // undo order. `null` today (no catalog entry has a real cross-step
  // dependency yet — see actions.js's buildStep), but the key must always
  // be present, not merely absent-and-therefore-falsy, since a schema check
  // like this one is what would catch a future step silently forgetting to
  // set it at all.
  const cases = [
    'Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?',
    'Could you please send me the signed contract by Friday, September 18?',
    'Confirming you’ll send the signed report by Friday, September 18, as agreed.'
  ];
  for (const text of cases) {
    const process = FlowActions.planFor(classify(text), { threadUrl: 'x', hasThreadAttachment: false });
    const allDeclared = process.steps.every((s) => Object.prototype.hasOwnProperty.call(s, 'dependsOn'));
    check('every step in "' + process.id + '" declares dependsOn (present, even when null)', allDeclared, process.steps.map((s) => s.id));
    check('every step in "' + process.id + '" has no real dependency yet (dependsOn is null)', process.steps.every((s) => s.dependsOn === null), process.steps.map((s) => [s.id, s.dependsOn]));
  }
}

console.log('\n--- actions.js: Execution Memory biases and demotes non-anchor steps ---\n');
{
  const requestIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  const baseCtx = { threadUrl: 'x', hasThreadAttachment: false };

  // No memory yet -> catalog's own default order, untouched.
  const cold = FlowActions.planFor(requestIntent, baseCtx);
  check('with no memory, reply-track keeps its catalog order [draft, task]', JSON.stringify(stepIds(cold)) === JSON.stringify(['draft', 'task']), stepIds(cold));

  // Task repeatedly removed/undone, well past the sample-size floor, and
  // never once accepted -> demoted out of the process entirely. The anchor
  // (draft) is untouched by memory regardless of its own stats.
  const rejectedMemory = { 'reply-track': { steps: { task: { accepted: 0, removed: 4, undone: 1 }, draft: { accepted: 0, removed: 5, undone: 0 } } } };
  const demoted = FlowActions.planFor(requestIntent, Object.assign({}, baseCtx, { executionMemory: rejectedMemory }));
  check('a net-rejected non-anchor step (task) is dropped once past the sample floor', JSON.stringify(stepIds(demoted)) === JSON.stringify(['draft']), stepIds(demoted));
  check('the anchor step (draft) is never demoted, even with a worse acceptance rate than the dropped step', stepIds(demoted).includes('draft'), stepIds(demoted));

  // A step rejected only once or twice is noise, not a verdict — must not
  // yet be dropped below DEMOTE_THRESHOLD.
  const belowFloorMemory = { 'reply-track': { steps: { task: { accepted: 0, removed: 2, undone: 0 } } } };
  const notYetDemoted = FlowActions.planFor(requestIntent, Object.assign({}, baseCtx, { executionMemory: belowFloorMemory }));
  check('a step rejected below the sample-size floor is not yet demoted', JSON.stringify(stepIds(notYetDemoted)) === JSON.stringify(['draft', 'task']), stepIds(notYetDemoted));
}
{
  // Schedule & Confirm has two non-anchor steps (draft, task) behind its
  // calendar anchor — a real acceptance-rate gap between them should
  // reorder the two without dropping either.
  const eventIntent = classify('Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?');
  const orderingMemory = {
    'schedule-confirm': {
      steps: {
        // Both stay well under DEMOTE_THRESHOLD(3) rejections, so this is
        // purely a reordering case — neither step should be dropped.
        draft: { accepted: 1, removed: 2, undone: 0 }, // 33% kept
        task: { accepted: 4, removed: 1, undone: 0 }   // 80% kept
      }
    }
  };
  const reordered = FlowActions.planFor(eventIntent, { threadUrl: 'x', hasThreadAttachment: false, executionMemory: orderingMemory });
  check('non-anchor steps reorder by historical acceptance rate, anchor stays first', JSON.stringify(stepIds(reordered)) === JSON.stringify(['calendar', 'task', 'draft']), stepIds(reordered));
}

console.log('\n--- actions.js: an explicit pin overrides automatic demotion ---\n');
{
  // isNetRejected() directly — this is the exact predicate popup.js's
  // Execution Memory insight card uses to decide whether there's anything
  // to surface, so it has to be right on its own, not just as a side effect
  // of planFor()'s behavior.
  const rejected = { accepted: 0, removed: 4, undone: 1 };
  check('a genuinely net-rejected step is flagged', FlowActions.isNetRejected(rejected) === true, rejected);
  const pinnedButOtherwiseRejected = { accepted: 0, removed: 4, undone: 1, pinned: 1 };
  check('a pin overrides an otherwise-qualifying rejection', FlowActions.isNetRejected(pinnedButOtherwiseRejected) === false, pinnedButOtherwiseRejected);
  check('no stats at all is never flagged as rejected', FlowActions.isNetRejected(null) === false);
  check('a step with only positive history is never flagged', FlowActions.isNetRejected({ accepted: 5, removed: 0, undone: 0 }) === false);

  // End to end through planFor(): the exact same rejectedMemory shape that
  // demoted the task step earlier in this file — with a pin added — must
  // keep it in the process instead.
  const requestIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  const pinnedMemory = { 'reply-track': { steps: { task: { accepted: 0, removed: 4, undone: 1, pinned: 1 } } } };
  const keptByPin = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: false, executionMemory: pinnedMemory });
  check('a pinned step survives planFor() despite stats that would otherwise demote it', stepIds(keptByPin).includes('task'), stepIds(keptByPin));
}

console.log('\n--- actions.js: PROCESS_CATALOG is the same table processFor() actually uses ---\n');
{
  const cases = [
    ['Let’s do a call Friday, September 18 at 3pm to review the contract.', 'schedule'],
    ['Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?', 'schedule-confirm'],
    ['Could you please send me the signed contract by Friday, September 18?', 'reply-track'],
    ['Confirming you’ll send the signed report by Friday, September 18, as agreed.', 'follow-through']
  ];
  for (const [text, expectedId] of cases) {
    const process = FlowActions.planFor(classify(text), { threadUrl: 'x', hasThreadAttachment: false });
    const catalogEntry = FlowActions.PROCESS_CATALOG[expectedId];
    check('PROCESS_CATALOG["' + expectedId + '"] name matches the live process name', Boolean(catalogEntry) && catalogEntry.name === process.name, catalogEntry);
    check('PROCESS_CATALOG["' + expectedId + '"] anchor actually appears among the steps planFor() proposed', stepIds(process).includes(catalogEntry.anchor), { anchor: catalogEntry.anchor, actual: stepIds(process) });
    check('PROCESS_CATALOG["' + expectedId + '"] stepKinds cover every id planFor() actually proposed', stepIds(process).every((id) => catalogEntry.stepKinds.includes(id)), { catalog: catalogEntry.stepKinds, actual: stepIds(process) });
  }
}

console.log('\n--- actions.js: every process has a real, decisive closedLine — content-gmail.js\'s closedSummary() now actually shows it ---\n');
{
  // closedLine used to be computed and passed through planFor() without
  // ever being displayed — content-gmail.js's closedSummary() built its
  // own generic verb-joined sentence instead. Now that closedSummary()
  // prefers closedLine on a full, unpruned success, an empty or missing
  // closedLine would silently regress the receipt back to the generic
  // fallback for every process. This locks in that every catalog entry
  // still has one, and that it reads as a real sentence, not a fragment.
  for (const id of Object.keys(FlowActions.PROCESS_CATALOG)) {
    const entry = FlowActions.PROCESS_CATALOG[id];
    check('PROCESS_CATALOG["' + id + '"].closedLine is a real, non-empty sentence',
      typeof entry.closedLine === 'string' && entry.closedLine.length > 5 && /[a-zA-Z]/.test(entry.closedLine),
      entry.closedLine);
  }
}

console.log('\n--- intent.js: per-type calibration nudges the gating threshold, not the hard-gated types ---\n');
{
  // classify() always scores against FLOW_DOMAINS[0] ('sales') — "contract
  // renewal" earns the domain-match bonus alongside the strong-commitment
  // signal, clearing the account-wide threshold (50) with room either side
  // for the per-type adjustment below to move it across the line. Long
  // enough to clear the scorer's own too-short penalty (under 12 words).
  const text = 'Approved — go ahead with the contract renewal, and let the whole team know it is confirmed.';
  const baseline = classify(text, { calibrationByType: null });
  check('baseline (no per-type history) fires as DECISION_TO_LOG', baseline.type === FlowIntent.TYPES.DECISION_TO_LOG, baseline);

  // A calibrationByType entry for 'decision' with heavy recent dismissals
  // pushes ONLY this message's actual gating threshold up — signals.threshold
  // (the account-wide number reported for telemetry) must stay untouched.
  const heavyDismiss = { decision: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const quieted = classify(text, { calibrationByType: heavyDismiss });
  check('a per-type history of dismissals for "decision" can silence a message that would otherwise fire',
    quieted.type === null, quieted);
  check('signals.threshold still reports the account-wide baseline, unaffected by the per-type nudge',
    baseline.signals.threshold === quieted.signals.threshold,
    { baselineThreshold: baseline.signals.threshold, quietedThreshold: quieted.signals.threshold });

  // The same history keyed under the WRONG type must never leak across —
  // 'followup' is not what this message resolves to, so its own history
  // must have zero effect on it.
  const wrongType = { followup: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const unaffected = classify(text, { calibrationByType: wrongType });
  check('history for a DIFFERENT intent type never affects this message', unaffected.type === FlowIntent.TYPES.DECISION_TO_LOG, unaffected);

  // A hard-gated type (SCHEDULED_EVENT) never consults calibrationByType at
  // all — this is deliberate (see intent.js's own comment): a per-type
  // history sitting under 'event' must not change whether the meeting fires.
  const meetingText = 'Let’s do a call Friday, September 18 at 3pm to review the contract.';
  const heavyEventDismiss = { event: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const stillFires = classify(meetingText, { calibrationByType: heavyEventDismiss });
  check('a hard-gated type (SCHEDULED_EVENT) ignores calibrationByType entirely', stillFires.type === FlowIntent.TYPES.SCHEDULED_EVENT, stillFires);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
