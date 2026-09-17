// Regression corpus for the decision layer (intent.js) and the action-plan
// layer (actions.js) — judgment-corpus.cjs covers the scorer/extractor;
// this file covers what sits on top of it: which of the five intent types
// wins, what entities it carries, and which actions get proposed in what
// order. Written alongside this session's quoted-text / label / ordering /
// event-plus-request changes so those stay correct on the next edit.
//
// Run: node test/intent-actions-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), sandbox, { filename: f });
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

console.log('--- intent.js: type + entity checks ---\n');

// 1. A meeting invite alone -> SCHEDULED_EVENT, Calendar only (no draft).
{
  const intent = classify('Let’s do a call Friday, September 18 at 3pm to review the contract.');
  check('meeting alone classifies as SCHEDULED_EVENT', intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
  const actions = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('meeting alone proposes exactly [Calendar, Task]', JSON.stringify(actions.map((a) => a.kind)) === JSON.stringify(['calendar', 'googleTask']), actions.map((a) => a.kind));
}

// 2. Meeting invite that ALSO asks for confirmation -> still SCHEDULED_EVENT,
//    but now [Calendar, Draft, Task], and the Draft's `what` must be the
//    ASK ("could you confirm..."), not the meeting sentence itself.
{
  const text = 'Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?';
  const intent = classify(text);
  check('event + request still classifies as SCHEDULED_EVENT', intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
  check('handoff signal is visible on the intent regardless of final type', intent.signals.handoff === true, intent.signals);
  const actions = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('event + request proposes [Calendar, Draft, Task] in that order', JSON.stringify(actions.map((a) => a.kind)) === JSON.stringify(['calendar', 'gmailDraft', 'googleTask']), actions.map((a) => a.kind));
  const draft = actions.find((a) => a.kind === 'gmailDraft');
  check('the draft addresses the actual ask, not the meeting sentence', draft && /confirm/i.test(draft.params.what) && !/^let/i.test(draft.params.what), draft && draft.params.what);
}

// 3. A cancelled meeting that still names a specific time must NOT become a
//    Calendar entry — precision over recall.
{
  const intent = classify('The 3pm call on Friday is cancelled — we are not moving forward with this.');
  check('cancelled meeting with a time does not fire SCHEDULED_EVENT', intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
}

// 4. A reader commitment reminder -> COMMITMENT_OF_READER, Task before Draft.
{
  // Curly apostrophe deliberately (iOS/macOS Mail's own autocorrect) —
  // this is exactly the case newContent()'s normalizeQuotes() now fixes.
  const intent = classify('Confirming you’ll send the signed report by Friday, September 18, as agreed.');
  check('reminder classifies as COMMITMENT_OF_READER', intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER, intent.type);
  const actions = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('commitment proposes [Task, Draft] — task leads', JSON.stringify(actions.map((a) => a.kind)) === JSON.stringify(['googleTask', 'gmailDraft']), actions.map((a) => a.kind));
}

// 5. A direct request -> REQUEST, Draft before Task (the draft is what's
//    literally being asked for).
{
  const intent = classify('Could you please send me the signed contract by Friday, September 18?');
  check('a direct ask classifies as REQUEST', intent.type === FlowIntent.TYPES.REQUEST, intent.type);
  const actions = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
  check('request proposes [Draft, Task] — draft leads', JSON.stringify(actions.map((a) => a.kind)) === JSON.stringify(['gmailDraft', 'googleTask']), actions.map((a) => a.kind));
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
  const [calendarAction] = FlowActions.planFor(eventIntent, { threadUrl: 'x', hasThreadAttachment: false });
  check('Calendar label is short', calendarAction.label === 'Calendar', calendarAction.label);

  const requestIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  const [draftAction, taskAction] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: false });
  check('Draft label without attachment is "Draft reply"', draftAction.label === 'Draft reply', draftAction.label);
  check('Task label is "Task"', taskAction.label === 'Task', taskAction.label);

  const [draftWithFile] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: true });
  check('Draft label with attachment is "Draft reply + file"', draftWithFile.label === 'Draft reply + file', draftWithFile.label);

  const labels = [calendarAction.label, draftAction.label, taskAction.label];
  check('no two pill labels collide', new Set(labels).size === labels.length, labels);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
