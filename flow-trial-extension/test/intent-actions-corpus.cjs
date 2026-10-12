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
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js']) {
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
  const calendar = process.steps.find((s) => s.id === 'calendar');
  check('the calendar step carries the meeting sentence, not only the short title',
    calendar && /review the contract/i.test(calendar.params.quote) && calendar.params.title !== calendar.params.quote,
    calendar && calendar.params);
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
    if (label === 'called off') {
      const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false });
      const step = process && process.steps[0];
      check('a called-off meeting with a clock is a delete, not a new event',
        intent && intent.personalClose === 'calendar-cancel' && intent.entities && intent.entities.calendarOp === 'delete' &&
          process && process.id === 'clear-it' && process.steps.length === 1 &&
          step && step.kind === 'calendar' && step.params.calendarOp === 'delete' && step.params.dateIso === '2026-09-18' && step.params.hour === 15,
        { type: intent && intent.type, close: intent && intent.personalClose, id: process && process.id });
    } else {
      check('a ' + label + ' meeting does not become a Calendar entry',
        !intent || intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
    }
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

// 3d. An explicit date already in the past must NOT become a Calendar entry,
//     independent of any recap phrasing. extract.js's explicit-year branch
//     takes a sender-stated year completely literally (correctly — it's not
//     a guess), so a plain, unadorned recap like "We had our sync on March
//     3, 2020 at 3pm, it was productive" carries no EVENT_RECAP phrase yet
//     still must not schedule a meeting six years gone. isPastDate() is the
//     unconditional backstop 3c's phrasing-based check can't be.
{
  const now = new Date('2026-09-17T12:00:00Z');
  const pastDateCases = [
    ['explicit past year',  'We had our sync on March 3, 2020 at 3pm, it was productive.'],
    ['past ISO date',       'The kickoff call on 2020-03-03 at 3pm covered the whole roadmap.'],
    ['past date this year', 'Great sync on March 3, 2026 at 3pm before the deal fell through.']
  ];
  for (const [label, text] of pastDateCases) {
    const intent = classify(text, { now });
    check('a ' + label + ' does not become a Calendar entry',
      !intent || intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
  }
  // Sanity: today's date and a genuine future explicit date must still fire.
  const todayCase = classify("Let's do the sync on September 17, 2026 at 3pm.", { now });
  check('a same-day explicit date still fires SCHEDULED_EVENT', todayCase.type === FlowIntent.TYPES.SCHEDULED_EVENT, todayCase.type);
  const futureCase = classify("Let's do the sync on March 3, 2027 at 3pm.", { now });
  check('a genuine future explicit date still fires SCHEDULED_EVENT', futureCase.type === FlowIntent.TYPES.SCHEDULED_EVENT, futureCase.type);
}

// 3e. A meeting mentioned with a real, resolvable date but no clock time —
//     "let's do a call Monday", no "at Xpm" anywhere — used to fail the hard
//     gate entirely (it required facts.time), so a plain, unambiguous
//     scheduling request produced no chip at all. The gate now accepts
//     hasMeetingNoun + a resolved date on its own, at 'medium' confidence
//     (vs 'high' when a time is also stated) and with hour/minute left null
//     so the downstream Calendar write (googleCalendarWrite in background.js)
//     knows to create an all-day event instead of guessing a time that was
//     never in the email.
{
  const now = new Date('2026-09-17T12:00:00Z'); // a Thursday
  const dateOnly = classify('Can we schedule a call on Monday?', { now });
  check('a date-only meeting (no time) fires SCHEDULED_EVENT', dateOnly.type === FlowIntent.TYPES.SCHEDULED_EVENT, dateOnly.type);
  check('a date-only meeting gets medium confidence, not high', dateOnly.confidence === 'medium', dateOnly.confidence);
  check('a date-only meeting carries hour:null', dateOnly.entities && dateOnly.entities.hour === null, dateOnly.entities);
  check('a date-only meeting carries minute:null', dateOnly.entities && dateOnly.entities.minute === null, dateOnly.entities);
  check('a date-only meeting still resolves dateIso', !!(dateOnly.entities && dateOnly.entities.dateIso), dateOnly.entities);

  const dateOnlyExplicit = classify("Let's do the sync on September 21, 2026 to go over the roadmap.", { now });
  check('a date-only meeting with an explicit resolvable date fires SCHEDULED_EVENT', dateOnlyExplicit.type === FlowIntent.TYPES.SCHEDULED_EVENT, dateOnlyExplicit.type);
  check('a date-only explicit-date meeting gets medium confidence', dateOnlyExplicit.confidence === 'medium', dateOnlyExplicit.confidence);

  // Sanity: the same "on <weekday>" shape WITH a time must still get 'high'
  // confidence and real hour/minute values — this widening must not blur
  // the two confidence tiers together.
  const withTime = classify('Can we schedule a call on Monday at 3pm?', { now });
  check('a same-shape meeting WITH a time still gets high confidence', withTime.confidence === 'high', withTime.confidence);
  check('a same-shape meeting WITH a time still carries real hour/minute', withTime.entities && withTime.entities.hour === 15 && withTime.entities.minute === 0, withTime.entities);

  // Precision check: date-only cancelled/recap language must still be
  // silenced exactly as it was before this widening — a date-only gate must
  // not be an easier gate to slip through than the timed one.
  const dateOnlyCancelled = classify('Let us postpone the call on Monday, we will rebook it later.', { now });
  check('a date-only postponed meeting does not fire SCHEDULED_EVENT', !dateOnlyCancelled || dateOnlyCancelled.type !== FlowIntent.TYPES.SCHEDULED_EVENT, dateOnlyCancelled && dateOnlyCancelled.type);
  const dateOnlyRecap = classify('Thanks for the call on Monday, great meeting, glad we synced!', { now });
  check('a date-only recap does not fire SCHEDULED_EVENT', !dateOnlyRecap || dateOnlyRecap.type !== FlowIntent.TYPES.SCHEDULED_EVENT, dateOnlyRecap && dateOnlyRecap.type);
}

// 3g. A refused or only-maybe meeting that still names a day and a time
//     must not become a Calendar entry. The noun + date gate used to treat
//     "I can't do the call on Monday" the same as "let's do the call on
//     Monday". A real invite, including a question, still has to fire.
{
  const now = new Date('2026-09-17T12:00:00Z'); // Thursday
  const refused = [
    ['cannot', "I can't do the call on Monday at 3pm, something came up with the contract review."],
    ["let's not", "Let's not do the call on Monday at 3pm after all regarding the contract."],
    ['will not', 'We will not be having the meeting on Monday at 3pm to review the contract.'],
    ['unable', 'Unable to make the call on Monday at 3pm to review the contract.'],
    ['might', 'We might do a call on Monday at 3pm if the contract is ready for review.'],
    ['Hebrew cannot', 'לא נוכל לקיים את הפגישה ביום שני בשעה 15:00 לסקירת החוזה.']
  ];
  for (const [label, text] of refused) {
    const intent = classify(text, { now });
    check('a ' + label + ' meeting does not become a Calendar entry',
      !intent || intent.type !== FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
  }
  const stillOn = classify('The call on Monday at 3pm still works, but I can\'t do the Tuesday workshop.', { now });
  check('a negation about a different day does not hide the real meeting',
    stillOn && stillOn.type === FlowIntent.TYPES.SCHEDULED_EVENT, stillOn && stillOn.type);
  const polite = classify('Could you join the call on Monday at 3pm to review the contract?', { now });
  check('a polite "could you join" invite still fires SCHEDULED_EVENT',
    polite && polite.type === FlowIntent.TYPES.SCHEDULED_EVENT, polite && polite.type);

  const nextFriday = classify('Let us do a call next Friday at 3pm to review the contract.', { now });
  check('a bare "next Friday" meeting fires SCHEDULED_EVENT',
    nextFriday && nextFriday.type === FlowIntent.TYPES.SCHEDULED_EVENT, nextFriday && nextFriday.type);
  check('a bare "next Friday" lands a week past this Friday',
    nextFriday && nextFriday.entities && nextFriday.entities.dateIso === '2026-09-25', nextFriday && nextFriday.entities);

  const tomorrow = classify('Let us do a call tomorrow at 3pm to review the contract.', { now });
  check('a "tomorrow" meeting fires SCHEDULED_EVENT on the next day',
    tomorrow && tomorrow.type === FlowIntent.TYPES.SCHEDULED_EVENT && tomorrow.entities.dateIso === '2026-09-18' && tomorrow.entities.hour === 15,
    tomorrow && tomorrow.entities);

  const heNext = classify('נקבע פגישה ביום שני הבא בשעה 15:00 לסקירת החוזה וההסכם.', { now });
  check('Hebrew "ביום שני הבא" is a meeting on the following Monday',
    heNext && heNext.type === FlowIntent.TYPES.SCHEDULED_EVENT && heNext.entities.dateIso === '2026-09-28' && heNext.entities.hour === 15,
    heNext && heNext.entities);

  const heTomorrow = classify('נקבע שיחה מחר בשעה 15:00 לסקירת החוזה וההסכם המלא.', { now });
  check('Hebrew "מחר" is a meeting tomorrow',
    heTomorrow && heTomorrow.type === FlowIntent.TYPES.SCHEDULED_EVENT && heTomorrow.entities.dateIso === '2026-09-18',
    heTomorrow && heTomorrow.entities);

  const heMonth = classify('נקבע פגישה ב-21 בספטמבר בשעה 15:00 לסקירת החוזה.', { now });
  check('a Hebrew day-and-month meeting resolves that day',
    heMonth && heMonth.type === FlowIntent.TYPES.SCHEDULED_EVENT && heMonth.entities.dateIso === '2026-09-21',
    heMonth && heMonth.entities);

  const heBareHour = classify('נקבע פגישה ביום שני בשעה 3 לסקירת החוזה וההסכם.', { now });
  check('Hebrew "בשעה 3" does not schedule 03:00',
    heBareHour && heBareHour.type === FlowIntent.TYPES.SCHEDULED_EVENT && heBareHour.entities.hour === null && heBareHour.entities.dateIso === '2026-09-21',
    heBareHour && heBareHour.entities);
  const heAfternoon = classify('נקבע פגישה ביום שני בשעה 3 אחר הצהריים לסקירת החוזה.', { now });
  check('Hebrew "בשעה 3 אחר הצהריים" is 15:00 that Monday',
    heAfternoon && heAfternoon.type === FlowIntent.TYPES.SCHEDULED_EVENT && heAfternoon.entities.hour === 15 && heAfternoon.entities.minute === 0 && heAfternoon.entities.dateIso === '2026-09-21',
    heAfternoon && heAfternoon.entities);
  const enAfternoon = classify('Let us do a call on Monday at 3 in the afternoon to review the contract.', { now });
  check('"at 3 in the afternoon" is 15:00 that Monday',
    enAfternoon && enAfternoon.type === FlowIntent.TYPES.SCHEDULED_EVENT && enAfternoon.entities.hour === 15 && enAfternoon.entities.dateIso === '2026-09-21',
    enAfternoon && enAfternoon.entities);

  const pitch = classify('Hope this email finds you well. Can we schedule a call tomorrow at 3pm? Our pricing starts at $99/mo.', { now });
  check('a cold pitch that says "tomorrow" stays silent',
    !pitch || pitch.type === null, pitch && pitch.type);
}

// 3f. MEETING_NOUN/MEETING_NOUN_HE's broader event-noun vocabulary, plus a
//     real, PRE-EXISTING precision bug found and fixed while broadening it:
//     "Could you send me the call recording by Friday?" — a REQUEST for a
//     deliverable — used to fire SCHEDULED_EVENT even with the ORIGINAL,
//     unmodified word list, because "call" (a meeting noun) plus "by
//     Friday" (a resolved date) was already sufficient evidence for the
//     event gate, with no check for whether the meeting noun was actually
//     describing a scheduled meeting or just naming the ARTIFACT of one.
//     Fixed with a negative lookahead excluding "artifact of a meeting"
//     continuations (recording, notes, transcript, minutes, summary,
//     recap, feedback, materials, slides, deck, agenda) — narrow and
//     evidence-based, the same shape as EVENT_CALLED_OFF/EVENT_RECAP.
{
  const collisionCases = [
    ['call recording', 'Could you send me the call recording by Friday?'],
    ['session notes', 'Please send the session notes by Monday.'],
    ['interview feedback', 'Can you send the interview feedback by Friday?'],
    ['meeting notes', 'Could you send the meeting notes from yesterday?'],
    ['workshop materials', 'Could you send the workshop materials by Friday?'],
    ['webinar recording', 'Please send me the webinar recording by Monday.']
  ];
  for (const [label, text] of collisionCases) {
    const intent = classify(text);
    check('artifact-of-meeting request ("' + label + '") stays REQUEST, not SCHEDULED_EVENT',
      intent && intent.type === FlowIntent.TYPES.REQUEST, intent && intent.type);
  }

  const newNounCases = [
    ['standup', "Let's do a standup on Monday at 9am."],
    ['retro', 'Can we schedule a retro on Friday?'],
    ['workshop', "Let's set up a workshop on Wednesday at 2pm."],
    ['webinar', 'The webinar is on Thursday at 11am.'],
    ['huddle', 'Quick huddle on Monday morning?'],
    ['kickoff', 'The kickoff is on Monday.'],
    ['town hall', 'The town hall is on Friday at 4pm.'],
    ['office hours', 'Office hours are on Wednesday at 3pm.'],
    ['one-on-one', "Let's do our one-on-one on Tuesday."],
    ['strategy session', 'Can we set up a strategy session on Monday?'],
    ['deposition', 'The deposition is on Wednesday at 10am.'],
    ['hearing', 'The hearing is on Friday.'],
    ['mediation', 'The mediation is on Tuesday at 1pm.'],
    ['HE: עמידה יומית (standup)', 'בואו נקבע עמידה יומית ביום שני.'],
    ['HE: סדנה (workshop)', 'אפשר לקבוע סדנה ביום רביעי?'],
    ['HE: וובינר (webinar)', 'הוובינר מתוכנן ביום חמישי.']
  ];
  for (const [label, text] of newNounCases) {
    const intent = classify(text);
    check(label + ' -> SCHEDULED_EVENT', intent && intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent && intent.type);
  }
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

// 4b. COMMITMENT_OF_READER fires on a named concrete object with no
//     date/amount anchor — the same widening REQUEST got in section 5b
//     below, applied to the commitment gate. "You agreed to send the
//     invoice" (no date, no dollar figure) used to be silently dropped:
//     hasConcreteAnchor was the ONLY evidence path, so the commitment's own
//     regex match plus a named, tangible object still wasn't enough.
{
  const noAnchorCommit = classify("You agreed to send the invoice.");
  check('EN: commitment to send an invoice, no anchor -> COMMITMENT_OF_READER', noAnchorCommit.type === FlowIntent.TYPES.COMMITMENT_OF_READER, noAnchorCommit.type);
  check('EN: no-anchor commitment gets medium confidence, not high', noAnchorCommit.confidence === 'medium', noAnchorCommit.confidence);
  check('EN: hasConcreteCommitmentObject signal is true, hasConcreteAnchor is false', noAnchorCommit.signals.hasConcreteCommitmentObject === true && noAnchorCommit.signals.hasConcreteAnchor === false, noAnchorCommit.signals);

  const heNoAnchorCommit = classify('כפי שהתחייבת, תשלח לי את הקבלה.');
  check('HE: commitment to send a receipt, no anchor -> COMMITMENT_OF_READER', heNoAnchorCommit.type === FlowIntent.TYPES.COMMITMENT_OF_READER, heNoAnchorCommit.type);
  check('HE: no-anchor commitment gets medium confidence', heNoAnchorCommit.confidence === 'medium', heNoAnchorCommit.confidence);

  // Sanity: the same commitment phrase WITH a real anchor must still fire
  // at 'high' confidence exactly as before — the widening adds a second
  // path, it doesn't downgrade the original one.
  const withAnchorCommit = classify('You agreed to send the invoice by Friday.');
  check('EN: commitment WITH a real anchor still fires at high confidence', withAnchorCommit.confidence === 'high', withAnchorCommit.confidence);
  check('EN: commitment WITH a real anchor still sets hasConcreteAnchor', withAnchorCommit.signals.hasConcreteAnchor === true, withAnchorCommit.signals);

  // Precision check: a vague commitment naming no object and no anchor must
  // still stay silent — the widening must not reopen "any commitment
  // phrase at all," only ones naming something tangible or dated/priced.
  const vagueCommit = classify("As discussed, you'll help with this.");
  check('EN: vague commitment with no object and no anchor stays silent', !vagueCommit || vagueCommit.type !== FlowIntent.TYPES.COMMITMENT_OF_READER, vagueCommit && vagueCommit.type);
  const heVagueCommit = classify('כפי שהתחייבת, תעזור עם זה.');
  check('HE: vague commitment with no object and no anchor stays silent', !heVagueCommit || heVagueCommit.type !== FlowIntent.TYPES.COMMITMENT_OF_READER, heVagueCommit && heVagueCommit.type);
}

// 4c. READER_COMMIT/READER_COMMIT_HE's much broader reminder-phrasing
//     registers, EN+HE — same "bare .test(), no negation/hedge safety net"
//     risk profile as HANDOFF/HANDOFF_HE above, so each addition here was
//     also re-verified against the full negative-test corpus before being
//     kept. Paired with a concrete object each time so the gate actually
//     fires (isReaderCommit alone is not sufficient — see the hard gate
//     itself in intent.js).
{
  const readerCommitCases = [
    ['EN: you said you would', 'You said you would send the invoice by Friday.'],
    ['EN: you mentioned you would', "You mentioned you'd send the signed contract."],
    ['EN: you are supposed to', "You're supposed to send the report by end of day."],
    ['EN: you were going to', 'You were going to send the updated proposal, right?'],
    ['EN: as we agreed', 'As we agreed, you will send the invoice by Friday.'],
    ['EN: per our conversation', "Per our conversation, you'll send the signed NDA."],
    ['EN: reminding you that you agreed', 'Just reminding you that you agreed to send the contract by Friday.'],
    ['HE: אתה אמור ל', 'אתה אמור לשלוח לי את החוזה עד יום שני.'],
    ['HE: היית אמור ל', 'היית אמור לשלוח את החשבונית שבוע שעבר.'],
    ['HE: לפי הסיכום שלנו', 'לפי הסיכום שלנו, אתה תשלח את הדוח.'],
    ['HE: כפי שהיה מוסכם', 'כפי שהיה מוסכם, תעביר לי את הקובץ.']
  ];
  for (const [label, text] of readerCommitCases) {
    const intent = classify(text);
    check(label + ' -> COMMITMENT_OF_READER', intent && intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER, intent && intent.type);
  }

  // Precision re-check with the widened phrase lexicon in place.
  const stillVague = classify("As discussed, you'll help with this.");
  check('vague commitment still stays silent after the READER_COMMIT widening', !stillVague || stillVague.type === null, stillVague && stillVague.type);
  const stillVagueHe = classify('כפי שהתחייבת, תעזור עם זה.');
  check('HE vague commitment still stays silent after the READER_COMMIT widening', !stillVagueHe || stillVagueHe.type === null, stillVagueHe && stillVagueHe.type);
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

// 5b. REQUESTED_OBJECT/REQUESTED_OBJECT_HE's much broader business-noun
//     vocabulary — finance, legal, documents, reports, access, deliverables,
//     scheduling, and HR terms that didn't exist before this widening. A
//     representative sample across categories, not exhaustive (the full
//     list runs to well over a hundred terms per language) — each of these
//     used to silently return { type: null } for lack of a recognized
//     object, with no date or amount to fall back on either.
{
  const objectCases = [
    ['EN finance: NDA', 'Could you send over the NDA before our call?'],
    // "statement" was present in the ORIGINAL, pre-widening REQUESTED_OBJECT
    // list and was silently dropped when that list was reorganized into
    // grouped arrays — caught and restored during this widening pass. A
    // real recall regression, not a new addition, so it earns its own case.
    ['EN finance: statement (restored, was dropped during regrouping)', 'Could you send the bank statement for this month?'],
    ['EN finance: purchase order', 'Please send the purchase order when you get a chance.'],
    ['EN finance: W-9', 'Can you send us your W-9 for our records?'],
    ['EN legal: SOW', 'Could you review and send back the SOW?'],
    ['EN legal: amendment', 'Please send the amendment to the agreement.'],
    ['EN docs: spreadsheet', 'Could you send the spreadsheet with the numbers?'],
    ['EN docs: certificate', 'Please send the certificate of insurance.'],
    ['EN reports: forecast', 'Can you send the Q3 forecast when ready?'],
    ['EN reports: meeting notes', 'Could you send the meeting notes from yesterday?'],
    ['EN access: credentials', 'Please send the credentials for the staging server.'],
    ['EN access: API key', 'Can you send me the API key for the integration?'],
    ['EN communication: sign-off', 'Could you send your sign-off on this before Friday close?'],
    ['EN deliverables: wireframes', 'Please send the wireframes for the new page.'],
    ['EN scheduling: availability', 'Could you send your availability for next week?'],
    ['EN HR: resume', 'Can you send over your resume and references?'],
    ['HE finance: NDA (הסכם סודיות)', 'תוכל לשלוח לי את הסכם הסודיות?'],
    ['HE legal: addendum (נספח)', 'אשמח אם תשלח לי את הנספח להסכם.'],
    ['HE access: permissions (הרשאות)', 'תוכל לשלוח לי את פרטי ההרשאות למערכת?'],
    // The construct-state (smichut) definite-article case — "קורות חיים"
    // (resume) takes its definite article on the SECOND word when combined
    // with a possessive ("קורות החיים שלך", not "הקורות חיים שלך"). The
    // regex must match the natural, definite phrasing, not just the bare
    // indefinite noun.
    ['HE HR: resume, definite form (קורות החיים)', 'אבקש לקבל ממך את קורות החיים שלך.'],
    ['HE deliverables: mockup (מוקאפ)', 'אשמח אם תוכל לשלוח את המוקאפ שהכנת.']
  ];
  for (const [label, text] of objectCases) {
    const intent = classify(text);
    check(label + ' -> REQUEST', intent && intent.type === FlowIntent.TYPES.REQUEST, intent && intent.type);
  }

  // Precision check: the expanded list must not have reopened the vague-ask
  // door. "pricing" (bare) was deliberately dropped from the list during
  // this widening for exactly this reason — it matched inside "our new
  // pricing plan" in a cold-pitch sentence that has no real requested
  // object at all. price lists?/quotes?/quotations? still cover the
  // legitimate "send me a quote" case without that false-positive risk.
  const pitchStillSilent = classify('Could you take a look at our new pricing plan and let me know your thoughts?');
  check('a cold pitch mentioning "pricing" (not a real object) still stays silent',
    !pitchStillSilent || pitchStillSilent.type === null, pitchStillSilent && pitchStillSilent.type);
}

// 5c. FlowJudgment.HANDOFF/HANDOFF_HE's much broader request-phrase
//     registers — more polite/formal ways of asking, in both languages.
//     Unlike REQUESTED_OBJECT above, this lexicon is tested with a bare
//     .test() (no per-sentence negation/hedge check), so every addition
//     here was specifically re-verified against the full negative-test
//     corpus (vague asks, cold pitches, small talk, both languages) before
//     being kept — see judgment.js's own HANDOFF header comment.
{
  const handoffCases = [
    ['EN: would you be able to', 'Would you be able to send the invoice by Friday?'],
    ['EN: would you mind', 'Would you mind sending over the contract?'],
    ['EN: would it be possible for you to', 'Would it be possible for you to forward the report?'],
    ['EN: I was hoping you could', 'I was hoping you could send the signed agreement.'],
    ['EN: kindly', 'Kindly send the updated proposal at your earliest convenience.'],
    ['EN: I would appreciate it if you', "I'd appreciate it if you could confirm the invoice amount."],
    ['EN: requesting that you', 'We are requesting that you send the signed NDA.'],
    ['EN: asking you to', 'I am asking you to review and send the draft.'],
    ['EN: your help is needed', 'Your help is needed to finalize the contract.'],
    ['EN: we need your approval', 'We need your approval on the attached proposal.'],
    ['EN: please arrange', 'Please arrange to send the certificate this week.'],
    ['HE: אם תוכל', 'אם תוכל לשלוח לי את החוזה זה יעזור מאוד.'],
    ['HE: תודה מראש על', 'תודה מראש על שליחת הקבלה.'],
    ['HE: נשמח לקבל', 'נשמח לקבל את המסמך המעודכן.'],
    ['HE: נודה לך אם', 'נודה לך אם תוכל להעביר את הדוח.'],
    ['HE: אנא ציין', 'אנא ציין את הפרטים המעודכנים במסמך.']
  ];
  for (const [label, text] of handoffCases) {
    const intent = classify(text);
    check(label + ' -> REQUEST', intent && intent.type === FlowIntent.TYPES.REQUEST, intent && intent.type);
  }

  // Precision re-check with the WIDENED lexicon: the same 6 negative cases
  // section 5b already proved silent for the object-lexicon widening must
  // still be silent now that the phrase lexicon is also wider — the two
  // widenings compound, so both need to hold at once, not just separately.
  const negativeCases = [
    ['Vague, no object', 'Can you send that over?'],
    ['Vague abstract', 'Could you help me understand the process better?'],
    ['Small talk', 'Just wanted to say hi and see how you have been doing lately!'],
    ['HE small talk', 'רק רציתי להגיד שלום ולראות מה שלומך!'],
    ['HE vague', 'תוכל להתקשר אליי מאוחר יותר?']
  ];
  for (const [label, text] of negativeCases) {
    const intent = classify(text);
    check(label + ' still stays silent after the HANDOFF widening', !intent || intent.type === null, intent && intent.type);
  }
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

  // No named object term here ("confirm by Friday" matches no
  // REQUESTED_OBJECT/HE entry) — the one request-shaped message in this
  // corpus that actually exercises the "no attachment, no findable file"
  // branch. "send me the signed contract" below names "contract", so it
  // no longer belongs here now that a named object alone (requestedObjectTerm)
  // is enough to flip mayFindFile true, independent of hasThreadAttachment
  // — see actions.js's draftAction() and its Drive-search comment.
  const requestIntent = classify('Could you please confirm by Friday, September 18?');
  const [draftStep, taskStep] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: false }).steps;
  check('Draft label without attachment or named object is "Draft reply"', draftStep.label === 'Draft reply', draftStep.label);
  check('Task label is "Task"', taskStep.label === 'Task', taskStep.label);

  const [draftWithFile] = FlowActions.planFor(requestIntent, { threadUrl: 'x', hasThreadAttachment: true }).steps;
  check('Draft label with a real thread attachment is "Draft reply + file"', draftWithFile.label === 'Draft reply + file', draftWithFile.label);

  // A named object is evidence for the ask. It is not, by itself, a file
  // Glance has already chosen. "+ file" appears only once a single
  // high-confidence Drive match is passed in as attachFile — promising
  // an attachment before that match is how the wrong file gets drafted.
  const fileNameIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  check('a named object with no thread attachment sets requestedObjectTerm', typeof fileNameIntent.entities.requestedObjectTerm === 'string' && fileNameIntent.entities.requestedObjectTerm.length > 0, fileNameIntent.entities.requestedObjectTerm);
  const [draftMayFind] = FlowActions.planFor(fileNameIntent, { threadUrl: 'x', hasThreadAttachment: false }).steps;
  check('a named object alone does not promise an attachment', draftMayFind.label === 'Draft reply', draftMayFind.label);
  check('a named object alone does not set includeAttachment', draftMayFind.params.includeAttachment === false, draftMayFind.params);
  check('a named object alone still forwards requestedObjectTerm', draftMayFind.params.requestedObjectTerm === fileNameIntent.entities.requestedObjectTerm, draftMayFind.params.requestedObjectTerm);
  const [draftFound] = FlowActions.planFor(fileNameIntent, {
    threadUrl: 'x',
    hasThreadAttachment: false,
    attachFile: { id: 'file_1', name: 'Contract-Signed.pdf', mimeType: 'application/pdf' }
  }).steps;
  check('a resolved file labels the step as a reply with that file', draftFound.label === 'Draft reply + file' && draftFound.params.driveFileId === 'file_1' && draftFound.params.attachSource === 'found', draftFound.params);

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
}

console.log('\n--- intent.js + judgment.js: isTypeSuppressed self-calibrates the three hard-gated types ---\n');
{
  // A hard-gated type never consults calibrationByType via a THRESHOLD (it
  // has none to move — the evidence gate stays a pure boolean, exactly as
  // intent.js's own comment documents), but it now DOES consult it via
  // isTypeSuppressed: sustained, close-to-unanimous rejection of that exact
  // type mutes it, everything short of that leaves it untouched.
  const meetingText = 'Let’s do a call Friday, September 18 at 3pm to review the contract.';

  // Light, normal dismissal history (well under SUPPRESS_MARGIN) must NOT
  // suppress — a couple of dismissals is ordinary noise, not a lesson.
  const lightEventDismiss = { event: { clicks: 0, dismissals: 2, ts: NOW.getTime() } };
  const stillFiresLight = classify(meetingText, { calibrationByType: lightEventDismiss });
  check('light dismissal history (2, well under the margin) does not suppress SCHEDULED_EVENT',
    stillFiresLight.type === FlowIntent.TYPES.SCHEDULED_EVENT, stillFiresLight);

  // Heavy, near-unanimous, RECENT dismissal history clears SUPPRESS_MARGIN
  // and mutes the type — this is the new, intended behavior this item adds.
  const heavyEventDismiss = { event: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const suppressed = classify(meetingText, { calibrationByType: heavyEventDismiss });
  check('heavy, recent dismissal history (6, 0 clicks) DOES suppress SCHEDULED_EVENT',
    suppressed.type === null, suppressed);

  // A single real click resets the balance enough to unmute — the same
  // "clicking says more like that" rule the account-wide threshold follows.
  const oneClickBack = { event: { clicks: 2, dismissals: 6, ts: NOW.getTime() } };
  const unmuted = classify(meetingText, { calibrationByType: oneClickBack });
  check('enough clicks against the same heavy dismissal history un-suppresses it again',
    unmuted.type === FlowIntent.TYPES.SCHEDULED_EVENT, unmuted);

  // Heavy dismissal history that has fully decayed (ts far in the past, well
  // past the 7-day half-life) must not suppress either — silence must never
  // become a one-way door, the same rule thresholdFrom's own comment states
  // for the account-wide bar.
  const staleEventDismiss = { event: { clicks: 0, dismissals: 6, ts: NOW.getTime() - 1000 * 60 * 60 * 24 * 60 } };
  const healedBack = classify(meetingText, { calibrationByType: staleEventDismiss });
  check('heavy dismissal history that has fully decayed (60 days old) no longer suppresses',
    healedBack.type === FlowIntent.TYPES.SCHEDULED_EVENT, healedBack);

  // Suppression is per-type — heavy dismissal history sitting under 'event'
  // must have zero effect on REQUEST or COMMITMENT_OF_READER firing for a
  // DIFFERENT message, and vice versa.
  const requestText = 'Could you please send me the signed contract when you get a chance?';
  const requestUnaffected = classify(requestText, { calibrationByType: heavyEventDismiss });
  check('heavy "event" dismissal history never suppresses a REQUEST', requestUnaffected.type === FlowIntent.TYPES.REQUEST, requestUnaffected);

  const heavyRequestDismiss = { request: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const requestSuppressed = classify(requestText, { calibrationByType: heavyRequestDismiss });
  check('heavy dismissal history under "request" DOES suppress REQUEST for its own message',
    requestSuppressed.type === null, requestSuppressed);

  const commitText = 'You agreed to send the invoice by Friday.';
  const heavyCommitDismiss = { commitment: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const commitSuppressed = classify(commitText, { calibrationByType: heavyCommitDismiss });
  check('heavy dismissal history under "commitment" DOES suppress COMMITMENT_OF_READER for its own message',
    commitSuppressed.type === null, commitSuppressed);
  const commitEventDismissUnaffected = classify(commitText, { calibrationByType: heavyEventDismiss });
  check('heavy "event" dismissal history never suppresses a COMMITMENT_OF_READER',
    commitEventDismissUnaffected.type === FlowIntent.TYPES.COMMITMENT_OF_READER, commitEventDismissUnaffected);
}

console.log('\n--- intent.js: REQUEST fires on a named concrete object, no date/amount needed ---\n');
// A real-world miss corpus, not synthetic edge cases: every "should detect"
// case here is a short, ordinary request a human reads once and immediately
// knows what to do with, with no date and no money figure attached — the
// exact shape that used to silently return { type: null } before REQUEST
// gained hasConcreteRequestObject as a second, independent way to clear its
// evidence bar (see intent.js's own comment at that gate). Every "should
// stay silent" case is deliberately adjacent to a real one — same handoff
// phrasing, same register — so this also proves the new object check didn't
// just widen REQUEST into "any polite ask," which was the one thing it had
// to not do.
{
  // The exact sentence that surfaced this gap in real use: no money, no
  // date, first-person "אבקש" rather than a 2nd-person "תוכל", and it used
  // to score well under threshold with no independent path to REQUEST.
  const he1 = classify('שלום רב, אבקש לקבל ממך את הקבלה על דמי התיווך ששילמנו. תודה.');
  check('HE: first-person request for a receipt, no anchor -> REQUEST', he1.type === FlowIntent.TYPES.REQUEST, he1);
  check('HE: hasConcreteRequestObject signal is true, hasConcreteAnchor is false', he1.signals.hasConcreteRequestObject === true && he1.signals.hasConcreteAnchor === false, he1.signals);

  const he2 = classify('תוכל בבקשה לשלוח לי את החוזה המעודכן?');
  check('HE: 2nd-person request for a contract, no anchor -> REQUEST', he2.type === FlowIntent.TYPES.REQUEST, he2);

  const he3 = classify('אשמח לקבל עדכון לגבי הסטטוס של הפרויקט, תודה מראש.');
  check('HE: polite request for a status update, no anchor -> REQUEST', he3.type === FlowIntent.TYPES.REQUEST, he3);

  const en1 = classify('Could you send me the invoice when you get a chance?');
  check('EN: request for an invoice, no anchor -> REQUEST', en1.type === FlowIntent.TYPES.REQUEST, en1);

  const en2 = classify('please send me the file for the Meridian account');
  check('EN: bare "please send me the file", no anchor -> REQUEST', en2.type === FlowIntent.TYPES.REQUEST, en2);

  const en3 = classify('Just following up — could you share the updated contract?');
  check('EN: follow-up ask for a contract, no anchor -> REQUEST', en3.type === FlowIntent.TYPES.REQUEST, en3);

  // --- Precision check: adjacent, genuinely vague asks must still stay silent ---
  const vague1 = classify('Can you send that over?');
  check('EN: vague "that" with no named object stays silent', vague1.type === null, vague1);

  const vague2 = classify('Could you help me understand the process better?');
  check('EN: vague, abstract ask stays silent', vague2.type === null, vague2);

  const vague3 = classify('תוכל להתקשר אליי מאוחר יותר?');
  check('HE: vague request with no named object stays silent', vague3.type === null, vague3);

  // A cold pitch already carries a handoff phrase ("could you") — must not
  // gain a second life just because "plan" or "pricing" sit near it. Neither
  // word is in REQUESTED_OBJECT's list, and SOLICITATION's own penalty in
  // judgment.js still applies underneath this regardless.
  const pitch = classify('Could you take a look at our new pricing plan and let me know your thoughts?');
  check('EN: cold pitch with a handoff phrase but no concrete object stays silent', pitch.type === null, pitch);

  const smalltalk = classify('Just wanted to say hi and see how you have been doing lately!');
  check('EN: pure greeting/small talk, no handoff at all, stays silent', smalltalk.type === null, smalltalk);
}

// Personal close types the chip must trust, and the silence cases next to
// them. Chosen after probing classify() (the path content-gmail.js actually
// uses) against the three candidate shapes:
//
//   1. Dated commitment — an asserted agreement, or a first-person delivery
//      promise, plus a resolved date. Short mail of this shape scored ~17
//      (commitment 30 + date 12 − too-short 25) and the chip stayed quiet.
//   2. Explicit ask to follow up or send a named thing — "could you send the
//      invoice" already fired; "please follow up … about the invoice" did not,
//      because HANDOFF never listed "follow up".
//   3. Confirmed amount — "agreed at $3,900, effective Sep 7" already cleared
//      50; "Confirming the amount is $4,200" scored 39 and stayed quiet.
//
// Silence: hard gates used to ignore solicitation / marketing / calendar
// boilerplate, so a priced cold pitch and a calendar acceptance both chipped
// at a negative score. A handoff plus a dollar figure and nothing else did too.
console.log('\n--- personal close types: dated commitment, explicit ask, confirmed amount ---\n');
{
  function planId(text) {
    return FlowActions.planFor(classify(text), { threadUrl: 'x', hasThreadAttachment: false });
  }

  const dated = [
    ['EN agreed + date', 'We agreed to file the amendment by September 21.'],
    ['EN confirmed + date', 'Confirmed. I will have the report to you by October 14.'],
    ['EN sender promise + date', 'I will send you the signed contract by Friday, September 18.'],
    ['HE sender promise + date', 'אני אשלח לך את החוזה עד יום שישי.']
  ];
  for (const [label, text] of dated) {
    const intent = classify(text);
    const process = planId(text);
    check(label + ' -> DECISION_TO_LOG at high confidence',
      intent.type === FlowIntent.TYPES.DECISION_TO_LOG && intent.confidence === 'high',
      { type: intent.type, confidence: intent.confidence, score: intent.signals && intent.signals.score });
    check(label + ' is a dated-commitment personal close', intent.personalClose === 'dated-commitment', intent.personalClose);
    check(label + ' closes with the log-it task, carrying the date',
      process && process.id === 'log-it' && process.steps.some((s) => s.kind === 'googleTask' && s.params.dateIso),
      process && { id: process.id, dates: process.steps.map((s) => s.params && s.params.dateIso) });
    // The task title is what Google Tasks shows. "Log this decision" drops
    // the date the chip already resolved — the close then doesn't name
    // what it wrote.
    check(label + ' task title names that date',
      typeof intent.label === 'string' && intent.label.indexOf('Log this decision') === -1 && /\b[A-Z][a-z]{2} \d{1,2}\b/.test(intent.label),
      intent.label);
    const datedTask = process && process.steps.find((s) => s.kind === 'googleTask');
    check(label + ' task step keeps the sentence the write will quote',
      Boolean(datedTask && datedTask.params && datedTask.params.what),
      datedTask && datedTask.params);
  }

  const datedSilent = [
    ['promise with no date', 'I will send you the signed contract.'],
    ['hedged promise', 'I might send the contract by Friday if legal signs off.'],
    ['agreement with no date', 'We agreed. See you.'],
    ['negated promise', 'We will not send the contract by Friday, September 18.'],
    ['question, not a commitment', 'Did we agree to file the amendment by September 21?'],
    ['past date only', 'We agreed to the terms on March 3, 2020 and that was the end of it.']
  ];
  for (const [label, text] of datedSilent) {
    const intent = classify(text);
    check('dated commitment stays silent: ' + label, !intent.type, intent.type);
  }

  const asks = [
    ['please follow up + invoice', 'Please follow up with Dana about the invoice.'],
    ['please follow up + date + status', 'Please follow up with the vendor by Friday and send the status update.'],
    ['question-shaped follow up + invoice', 'Please follow up with Dana about the invoice?'],
    ['HE follow up + invoice', 'תעקוב אחרי החשבונית בבקשה, זה דחוף מצדנו.'],
    ['dated confirm ask', 'Could you confirm the $4,200 payment by Friday?']
  ];
  for (const [label, text] of asks) {
    const intent = classify(text);
    const process = planId(text);
    check(label + ' -> REQUEST', intent.type === FlowIntent.TYPES.REQUEST, intent.type);
    check(label + ' is a follow-up-ask personal close', intent.personalClose === 'follow-up-ask', intent.personalClose);
    check(label + ' closes with reply-track (draft + task)',
      process && process.id === 'reply-track' && process.steps.some((s) => s.kind === 'gmailDraft') && process.steps.some((s) => s.kind === 'googleTask'),
      process && process.id);
    const askDraft = process && process.steps.find((s) => s.kind === 'gmailDraft');
    check(label + ' draft step names the ask it will write',
      Boolean(askDraft && askDraft.params && askDraft.params.what),
      askDraft && askDraft.params);
  }

  const askSilent = [
    ['follow up, nothing named', 'Please follow up when you can.'],
    ['follow up on this', 'Can you follow up on this?'],
    ['negated follow up', "Please don't follow up with Dana about the invoice."],
    ['HE follow up, nothing named', 'תעקוב אחרי זה כשתהיה לך דקה פנויה בבקשה.'],
    ['money alone is not an ask', 'Can you confirm the $4,200?']
  ];
  for (const [label, text] of askSilent) {
    const intent = classify(text);
    check('explicit ask stays silent: ' + label, !intent.type, { type: intent.type, signals: intent.signals });
  }

  const amounts = [
    ['EN confirming a figure', 'Confirming the amount is $4,200 for the year.'],
    ['HE confirming a figure', 'מאשרים שהסכום הוא 4,200 שקל.'],
    ['approved fee', 'Approved. The fee is $2,400.']
  ];
  for (const [label, text] of amounts) {
    const intent = classify(text);
    const process = planId(text);
    check(label + ' -> DECISION_TO_LOG at high confidence',
      intent.type === FlowIntent.TYPES.DECISION_TO_LOG && intent.confidence === 'high',
      { type: intent.type, confidence: intent.confidence, score: intent.signals && intent.signals.score });
    check(label + ' is a confirmed-amount personal close', intent.personalClose === 'confirmed-amount', intent.personalClose);
    check(label + ' task carries the amount',
      process && process.id === 'log-it' && process.steps.some((s) => s.kind === 'googleTask' && s.params.amount),
      process && process.steps.map((s) => s.params && s.params.amount));
    check(label + ' task title names that figure',
      typeof intent.label === 'string' && intent.entities && intent.entities.amount && intent.label.indexOf(intent.entities.amount) !== -1,
      { label: intent.label, amount: intent.entities && intent.entities.amount });
  }

  const meeting = classify('Let’s do a call Friday, September 18 at 3pm to review the contract.');
  check('a scheduled meeting is not tagged as a personal close',
    meeting.type === FlowIntent.TYPES.SCHEDULED_EVENT && !meeting.personalClose,
    { type: meeting.type, personalClose: meeting.personalClose });
  const readerCommit = classify('You agreed to send the invoice by Friday, September 18.');
  check('a reader commitment is not tagged as a personal close',
    readerCommit.type === FlowIntent.TYPES.COMMITMENT_OF_READER && !readerCommit.personalClose,
    { type: readerCommit.type, personalClose: readerCommit.personalClose });

  const amountSilent = [
    ['figure with nothing decided', 'The total came to $4,200.'],
    ['a quote, not a confirmation', 'Our quote is $12,500 for the work described below in the attached scope document today.'],
    ['refused figure', 'We do not confirm the $4,200 figure at all.'],
    ['hedged figure', 'We might confirm the $4,200 next quarter once the board meets to review it.']
  ];
  for (const [label, text] of amountSilent) {
    const intent = classify(text);
    check('confirmed amount stays silent: ' + label, !intent.type, { type: intent.type, score: intent.signals && intent.signals.score });
  }

  // Hard gates must not outvote a noise penalty. Each of these chipped before
  // this pass, at a negative score.
  const noise = [
    ['priced cold pitch', 'Hope this email finds you well. Our pricing starts at $99/mo. Can you confirm a time this week?'],
    ['bump asking for an invoice', 'Just bumping this — could you send the invoice?'],
    ['circling back on a reader commitment', 'Circling back on the contract. You agreed to send it by Friday.'],
    ['pitch-shaped confirmation', 'Hope this email finds you well. Confirming we are agreed at $3,900 for the year, effective September 7.'],
    ['calendar acceptance boilerplate', 'Dana has accepted this invitation. Meeting Friday, September 18 at 3pm.']
  ];
  for (const [label, text] of noise) {
    const intent = classify(text);
    check('noise stays silent: ' + label, !intent.type, { type: intent.type, score: intent.signals && intent.signals.score });
  }

  // A real ask that merely says "following up" (not the solicitation phrase
  // "following up on my last email") must still chip.
  const realFollow = classify('Just following up — could you share the updated contract?');
  check('a real follow-up that names a contract still chips as REQUEST', realFollow.type === FlowIntent.TYPES.REQUEST, realFollow.type);

  // Sustained rejection of "decision" mutes the new hard gates the same way
  // it mutes the other hard-gated types — evidence stays real, the account
  // has still asked to stop seeing it.
  const heavyDecision = { decision: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const lightDecision = { decision: { clicks: 0, dismissals: 2, ts: NOW.getTime() } };
  const stillDated = classify('We agreed to file the amendment by September 21.', { calibrationByType: lightDecision });
  check('two "decision" dismissals do not suppress a dated commitment', stillDated.type === FlowIntent.TYPES.DECISION_TO_LOG, stillDated.type);
  const suppressedDate = classify('We agreed to file the amendment by September 21.', { calibrationByType: heavyDecision });
  check('heavy "decision" dismissals suppress a dated commitment', !suppressedDate.type, suppressedDate.type);
  const suppressedAmount = classify('Confirming the amount is $4,200 for the year.', { calibrationByType: heavyDecision });
  check('heavy "decision" dismissals suppress a confirmed amount', !suppressedAmount.type, suppressedAmount.type);
  const otherType = { request: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const notSuppressed = classify('We agreed to file the amendment by September 21.', { calibrationByType: otherType });
  check('request-dismissal history does not suppress a dated commitment', notSuppressed.type === FlowIntent.TYPES.DECISION_TO_LOG, notSuppressed.type);
}

// Google-loop silence. Probed against classify() — the path the chip uses.
// These cleared a hard gate while the score sat under 50 (or, for a settled
// payment, just over it) and would have shown a Do It. The three Trusted
// shapes on the other side of the same line must still show.
console.log('\n--- google-loop silence: soft, FYI, hedge, past, noise ---\n');
{
  const mustSilence = [
    ['soft maybe + invoice', 'Could you maybe send the invoice when you have a moment?'],
    ['soft no rush + follow up', 'No rush — please follow up with Dana about the invoice.'],
    ['soft whenever + file', 'Whenever you can, could you send the file?'],
    ['soft if possible + invoice', 'If possible, could you send the invoice?'],
    ['soft optional follow up', 'Optional: please follow up with Dana about the invoice if you want.'],
    ['soft Hebrew maybe + invoice', 'אולי תוכל לשלוח את החשבונית?'],
    ['HE reader-decision please-approve proposal', 'בבקשה תאשר את ההצעה על סך 3,900 שקל עד יום שני.'],
    ['HE reader-decision na-approve proposal', 'נא לאשר את ההצעה על סך 3,900 שקל עד יום שני.'],
    ['HE reader-decision can-you-approve proposal', 'תוכל לאשר את ההצעה על סך 3,900 שקל עד יום שני?'],
    ['HE reader-decision please-approve feminine', 'בבקשה תאשרי את ההצעה על סך 3,900 שקל עד יום שני.'],
    ['HE reader-decision formal ana-approve', 'אנא אשר את ההצעה על סך 3,900 שקל עד יום שני.'],
    ['EN reader-decision please-accept proposal', 'Please accept the $18,000 proposal by Monday and route it to the legal team for the paperwork this week.'],
    ['soft HE if-you-can send invoice', 'במידה ותוכל, תשלח לי את החשבונית עד יום שישי.'],
    ['soft HE assuming send invoice', 'בהנחה שתספיק, תשלח לי את החשבונית עד יום שישי.'],
    ['soft HE subject-to send invoice', 'בכפוף לאישור הצוות, תשלח לי את החשבונית עד יום שישי.'],
    ['soft HE whenever-you send invoice', 'כשיהיה לך זמן, תשלח לי את החשבונית עד יום שישי.'],
    ['soft HE when-convenient send invoice', 'מתי שנוח לך, תשלח לי את החשבונית עד יום שישי.'],
    ['soft EN provided-that send contract', 'Provided that legal is fine with it, could you send the contract by Friday?'],
    ['soft EN subject-to send invoice', 'Subject to your approval, could you send the invoice by Friday?'],
    ['soft EN assuming send invoice', 'Assuming the numbers still hold, could you send the invoice by Friday?'],
    ['soft maybe + priced future ask', 'Could you maybe send the $4,200 invoice by October 2 for the contract renewal we discussed with the vendor last week?'],
    ['FYI dated agreement', 'FYI, we agreed to file the amendment by September 21.'],
    ['FYI confirmed amount', 'FYI the amount is confirmed at $4,200 for the year.'],
    ['no action + amount', 'No action needed — confirming the amount is $4,200.'],
    ['informational only + amount', 'This is informational only. Confirming the amount is $4,200.'],
    ['visibility only + date', 'For visibility only, we agreed to file the amendment by September 21.'],
    ['no reply + date', 'Looping you in for visibility. We agreed to file the amendment by September 21. No need to reply.'],
    ['Hebrew FYI + date', 'לידיעתך, סוכם שנגיש את התיקון עד 21 בספטמבר.'],
    ['Hebrew no action + amount', 'אין צורך בפעולה. מאשרים שהסכום הוא 4,200 שקל.'],
    ['Hebrew FYI לא נדרשת פעולה', 'מצורפת ההצעה לתיעוד, לא נדרשת פעולה מצדך'],
    ['Hebrew FYI לא נדרש ממך', 'לידיעתך, לא נדרש ממך דבר בנוגע להצעה המצורפת.'],
    ['Hebrew FYI לא נדרשים כלום', 'עדכון בלבד. לא נדרשים ממך כלום.'],
    ['hedge once legal', 'I will send the signed contract by Friday once legal approves it.'],
    ['hedge hoping to agree', 'We are hoping to agree on $4,200 by September 21.'],
    ['past call worded as already held', 'The call was on Monday at 3pm.'],
    ['past meeting already had', 'We already had the meeting on Tuesday at 10am.'],
    ['past reader commitment', 'You agreed to send the invoice on March 3, 2020.'],
    ['past payment confirmation', 'Confirming we paid the $4,200 on March 3, 2024.'],
    ['closed file, amount recalled', 'We confirmed the $4,200 back in March 2024 and that file is closed.'],
    ['maybe meeting', 'Maybe we could do a call Friday, September 18 at 3pm?'],
    ['tentative meeting', 'Tentatively booking a call Friday, September 18 at 3pm.'],
    ['calendar accepted line', 'Accepted: Weekly sync — Friday, September 18 at 3pm.'],
    ['calendar invitation accepted', 'Invitation accepted. The meeting is Friday, September 18 at 3pm.'],
    ['calendar event reminder', 'Event reminder: Sync Friday, September 18 at 3pm.'],
    ['calendar automated reminder', 'This is an automated reminder for your meeting on Friday, September 18 at 3pm.'],
    ['calendar response accepted', 'Your response: Accepted. Friday, September 18 at 3pm.'],
    ['quick bump + invoice', 'Quick bump: please send the invoice.']
  ];
  for (const [label, text] of mustSilence) {
    const intent = classify(text);
    check('silence: ' + label, !intent.type, { type: intent.type, confidence: intent.confidence, score: intent.signals && intent.signals.score });
  }

  const mustShow = [
    ['dated commitment', 'We agreed to deliver the countersigned amendment by October 2.', FlowIntent.TYPES.DECISION_TO_LOG, 'dated-commitment'],
    ['Hebrew dated commitment', 'סוכם שנגיש את התיקון עד 2 באוקטובר.', FlowIntent.TYPES.DECISION_TO_LOG, 'dated-commitment'],
    ['explicit follow-up', 'Please follow up with Dana about the outstanding invoice.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['confirmed amount', 'Confirming the fee is $8,750.', FlowIntent.TYPES.DECISION_TO_LOG, 'confirmed-amount'],
    ['polite ask, not a soft one', 'Please send the invoice when you get a chance.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['Hebrew hard send ask', 'תשלח לי את החשבונית עד יום שישי בבקשה.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['Hebrew please-send still a request', 'בבקשה תשלח לי את החשבונית עד יום שישי.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['Hebrew soft opener, then a hard send', 'במידה ותוכל, תשלח לי את הטיוטה. בבקשה תשלח את החשבונית עד יום שישי.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['EN soft opener, then a hard send', 'If possible, could you send the draft? Please send the invoice by Friday, September 18.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['reader reminder, not a calendar notice', 'As a reminder, you agreed to send the invoice by Friday, September 18.', FlowIntent.TYPES.COMMITMENT_OF_READER, null],
    ['current ask that mentions a past due date', 'Please send the receipt for the invoice that was due March 3, 2024.', FlowIntent.TYPES.REQUEST, 'follow-up-ask'],
    ['Hebrew action required', 'נדרשת פעולה: נא לאשר את ההצעה עד יום שישי.', FlowIntent.TYPES.REQUEST, 'follow-up-ask']
  ];
  for (const [label, text, type, personalClose] of mustShow) {
    const intent = classify(text);
    check('show Do It: ' + label, intent.type === type && (intent.personalClose || null) === personalClose, {
      type: intent.type, personalClose: intent.personalClose, score: intent.signals && intent.signals.score
    });
    check('show Do It chip: ' + label, FlowIntent.shouldShowChip(intent) === true, intent.confidence);
  }

  // A conditional opener is not the close when a later sentence asks plainly.
  {
    const laterHe = classify('במידה ותוכל, תשלח לי את הטיוטה. בבקשה תשלח את החשבונית עד יום שישי.');
    check('a later Hebrew send is the ask, not the conditional opener',
      laterHe && laterHe.entities && /חשבונית/.test(laterHe.entities.what || '') && !/טיוטה/.test(laterHe.entities.what || ''),
      laterHe && laterHe.entities && laterHe.entities.what);
    const laterEn = classify('If possible, could you send the draft? Please send the invoice by Friday, September 18.');
    check('a later English send is the ask, not the conditional opener',
      laterEn && laterEn.entities && /invoice/i.test(laterEn.entities.what || '') && !/draft/i.test(laterEn.entities.what || ''),
      laterEn && laterEn.entities && laterEn.entities.what);
  }

  // The ask is current. The March 2024 day is why the invoice was late,
  // not a deadline to put on the task or in the title.
  {
    const pastAsk = classify('Please send the receipt for the invoice that was due March 3, 2024.');
    check('a past due date is not stored as the close date',
      pastAsk && !pastAsk.entities.dateIso && !pastAsk.entities.when, pastAsk && pastAsk.entities);
    check('the task title does not name that old day',
      pastAsk && !/Mar|March|2024/.test(pastAsk.label), pastAsk && pastAsk.label);
    const task = FlowActions.planFor(pastAsk, { threadUrl: 'x', hasThreadAttachment: false }).steps.find((s) => s.id === 'task');
    check('the planned task has no due date', task && !task.params.dateIso, task && task.params);
    const futureAsk = classify('Could you please send me the signed contract by Friday, September 18?');
    check('a real future deadline is still the close date',
      futureAsk && futureAsk.entities.dateIso === '2026-09-18', futureAsk && futureAsk.entities);
  }

  // Low confidence is the score-bar catch-all (FOLLOW_UP). It stays that
  // existing type — this PR does not add a close type — and it does not
  // show a chip. A payable invoice with no hard gate is the case.
  const unsure = classify('Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.');
  check('a score-bar obligation stays the existing follow-up type',
    unsure.type === FlowIntent.TYPES.FOLLOW_UP && unsure.confidence === 'low' && !unsure.personalClose, unsure);
  check('low confidence does not show a Do It chip', FlowIntent.shouldShowChip(unsure) === false, unsure.confidence);
  check('silence is not a chip', FlowIntent.shouldShowChip({ type: null }) === false);
  check('remote classification is not this bar', FlowIntent.shouldShowChip({ type: 'request', confidence: 'remote' }) === true);
  const typeIds = Object.keys(FlowIntent.TYPES).map((k) => FlowIntent.TYPES[k]).sort();
  check('intent types stay the existing five',
    JSON.stringify(typeIds) === JSON.stringify(['commitment', 'decision', 'event', 'followup', 'request']), typeIds);
}

console.log('\n--- personal close: a clock time or an explicit meeting ask is a Calendar hold ---\n');
{
  function planOf(text) {
    const intent = classify(text);
    return { intent, process: FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false }) };
  }
  function isHold(text) {
    const { intent, process } = planOf(text);
    const step = process && process.steps[0];
    return intent.personalClose === 'calendar-hold' &&
      process && process.id === 'hold' &&
      process.steps.length === 1 &&
      step && step.kind === 'calendar' && step.params.requireTime === true &&
      typeof step.params.dateIso === 'string' &&
      Number.isInteger(step.params.hour) && Number.isInteger(step.params.minute);
  }

  const holds = [
    ['EN promise + date + time', 'I will send you the signed contract by Friday, September 18 at 3pm.'],
    ['EN agreed + date + time, no meeting noun', 'We agreed to file the amendment by September 21 at 3pm.'],
    ['HE promise + date + time', 'אני אשלח לך את החוזה ביום שישי בשעה 15:00.'],
    ['EN explicit schedule-a-call ask', 'Can you schedule a call Friday, September 18 at 3pm?'],
    ['EN could-you-meet ask', 'Could you meet Friday, September 18 at 3pm to review the contract?'],
    ['EN can-we-meet ask', 'Can we meet Friday, September 18 at 10:00am?'],
    ['HE please-set-a-meeting ask', 'בבקשה תקבע פגישה ביום שישי בשעה 15:00.']
  ];
  for (const [label, text] of holds) {
    const { intent, process } = planOf(text);
    check(label + ' is a calendar-hold and nothing else', isHold(text), {
      type: intent.type,
      personalClose: intent.personalClose,
      id: process && process.id,
      steps: process && process.steps.map((s) => ({ kind: s.kind, params: s.params }))
    });
    const step = process && process.steps[0];
    check(label + ' event title is the sentence, not "Log this decision"',
      Boolean(step && step.params.title && step.params.title.indexOf('Log this decision') === -1 && step.params.title.length > 8),
      step && step.params.title);
  }

  const promise = planOf('I will send you the signed contract by Friday, September 18 at 3pm.');
  check('a timed promise stays a decision, and the step carries 15:00',
    promise.intent.type === FlowIntent.TYPES.DECISION_TO_LOG &&
      promise.process.steps[0].params.hour === 15 && promise.process.steps[0].params.minute === 0,
    promise.process.steps[0].params);
  check('a timed promise does not also open a task or a draft',
    promise.process.steps.every((s) => s.kind === 'calendar'));

  const ask = planOf('Can you schedule a call Friday, September 18 at 3pm?');
  check('an explicit meeting ask stays an event, not a draft',
    ask.intent.type === FlowIntent.TYPES.SCHEDULED_EVENT &&
      !ask.process.steps.some((s) => s.kind === 'gmailDraft' || s.kind === 'googleTask'));

  const deadlineAsk = planOf('Could you meet the deadline by Friday, September 18 at 3pm?');
  check('meet-the-deadline stays a follow-up ask, not a calendar hold',
    deadlineAsk.intent.personalClose === 'follow-up-ask' && deadlineAsk.process.id === 'reply-track',
    { personalClose: deadlineAsk.intent.personalClose, id: deadlineAsk.process && deadlineAsk.process.id });

  const dateOnly = planOf('We agreed to file the amendment by September 21.');
  check('a dated commitment with no clock time stays a task',
    dateOnly.intent.personalClose === 'dated-commitment' && dateOnly.process.id === 'log-it',
    dateOnly.intent.personalClose);

  const announced = planOf('Let’s do a call Friday, September 18 at 3pm to review the contract.');
  check('a bare meeting announcement is still schedule, not a personal hold',
    announced.intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && !announced.intent.personalClose && announced.process.id === 'schedule',
    { personalClose: announced.intent.personalClose, id: announced.process && announced.process.id });

  const confirm = planOf('Let’s do a call Friday, September 18 at 3pm to review the contract. Could you please confirm you can make it?');
  check('a confirm ask on an already-stated meeting stays schedule-confirm',
    confirm.process.id === 'schedule-confirm' && !confirm.intent.personalClose,
    { personalClose: confirm.intent.personalClose, id: confirm.process && confirm.process.id });

  const reader = planOf('You agreed to send the invoice by Friday, September 18 at 3pm.');
  check('a reader commitment with a time is not a calendar hold',
    reader.intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER && !reader.intent.personalClose,
    reader.intent.personalClose);

  const amount = planOf('Confirming the amount is $4,200 for the year.');
  check('a confirmed amount with no time stays a task',
    amount.intent.personalClose === 'confirmed-amount' && amount.process.id === 'log-it');

  const sendAsk = planOf('Please follow up with Dana about the invoice.');
  check('an explicit send ask stays a draft plus a task',
    sendAsk.intent.personalClose === 'follow-up-ask' && sendAsk.process.id === 'reply-track');

  const silent = [
    ['hedged promise', 'I might send the contract by Friday, September 18 at 3pm if legal signs off.'],
    ['question about an agreement', 'Did we agree to file the amendment by September 21 at 3pm?'],
    ['negated promise', 'We will not send the contract by Friday, September 18 at 3pm.'],
    ['past time', 'We agreed to the terms on March 3, 2020 at 3pm and that was the end of it.'],
    ['due at a time, nothing agreed', 'The report is due at 3pm Friday, September 18.'],
    ['floated meeting', 'Can we meet Friday, September 18 at 3pm if you\'re free?'],
    ['pitch', 'Hope this email finds you well. Can you schedule a call Friday, September 18 at 3pm?'],
    ['calendar boilerplate', 'Dana has accepted this invitation. Meeting Friday, September 18 at 3pm.']
  ];
  for (const [label, text] of silent) {
    const intent = classify(text);
    check('calendar hold stays silent: ' + label, !intent.type && !intent.personalClose, {
      type: intent.type, personalClose: intent.personalClose
    });
  }

  const heavyEvent = { event: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const suppressedAsk = classify('Can you schedule a call Friday, September 18 at 3pm?', { calibrationByType: heavyEvent });
  check('heavy event dismissals suppress an explicit meeting ask', !suppressedAsk.type, suppressedAsk.type);
  const heavyDecision = { decision: { clicks: 0, dismissals: 6, ts: NOW.getTime() } };
  const suppressedPromise = classify('I will send you the signed contract by Friday, September 18 at 3pm.', { calibrationByType: heavyDecision });
  check('heavy decision dismissals suppress a timed commitment', !suppressedPromise.type, suppressedPromise.type);
  const notThat = classify('I will send you the signed contract by Friday, September 18 at 3pm.', { calibrationByType: heavyEvent });
  check('event-dismissal history does not suppress a timed commitment',
    notThat.personalClose === 'calendar-hold', notThat.personalClose);

  const Q3 = 'Can you reply and confirm whether the Q3 summary will include the October numbers?';
  const q3open = classify(Q3, { to: ['me@glance.test'], ownAddresses: ['me@glance.test'] });
  check('Q3 reply-and-confirm drafts when the user is in To',
    q3open.type === FlowIntent.TYPES.REQUEST && q3open.personalClose === 'follow-up-ask',
    { type: q3open.type, quiet: q3open.quiet });
  const Q3_BODY = 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow test';
  const q3ctx = {
    to: ['glance.salisapan@outlook.com'], ownAddresses: ['glance.salisapan@outlook.com'],
    userName: 'Sali', senderEmail: 'ai.local.flow@gmail.com'
  };
  const q3hi = classify(Q3_BODY, q3ctx);
  check('gate049 Q3 Hi plus a valid To is a request, not hedge',
    q3hi.type === FlowIntent.TYPES.REQUEST && q3hi.quiet !== 'hedge',
    { type: q3hi.type, quiet: q3hi.quiet });
  check('opening Hi is not an addressee name', FlowIntent.openingAddressee(Q3_BODY) === '');
  check('Hi Dana names Dana', FlowIntent.openingAddressee('Hi Dana, can you reply and confirm whether the Q3 summary will include the October numbers?') === 'Dana');
  ['all', 'team', 'everyone', 'everybody', 'there', 'folks', 'guys', "y'all", 'colleagues', 'both', 'כולם', 'צוות', 'חברים', "חבר'ה"].forEach((group) => {
    const greet = /[\u0590-\u05FF]/.test(group) ? 'שלום ' : 'Hi ';
    check('a group opener is not a name: ' + group, FlowIntent.openingAddressee(greet + group + ', please reply by Friday.') === '');
  });
  ['Hi all', 'Hi team', 'Hi there'].forEach((opener) => {
    const intent = classify(opener + ',\n\nPlease reply with your availability for the launch checklist by Wednesday, October 14.\n\nCheers,\nDana', q3ctx);
    check(opener + ' with Sali in To still drafts', intent.type === FlowIntent.TYPES.REQUEST && intent.quiet !== 'hedge', { type: intent.type, quiet: intent.quiet });
  });
  const greetings = ['Hey,', 'Hello,', 'Dear,', 'Good morning,', 'Good afternoon,', 'Good evening,', 'Greetings,', 'שלום,', 'היי,', 'הי,', 'בוקר טוב,', 'ערב טוב,'];
  greetings.forEach((greet) => {
    const intent = classify(greet + '\n' + Q3, q3ctx);
    check('a greeting with no name still drafts: ' + greet, intent.type === FlowIntent.TYPES.REQUEST && intent.quiet !== 'hedge', { type: intent.type, quiet: intent.quiet });
  });
  const hiDana = classify('Hi Dana, can you reply and confirm whether the Q3 summary will include the October numbers?', q3ctx);
  check('Hi Dana stays quiet when the user is Sali', !hiDana.type && hiDana.quiet === 'hedge', { type: hiDana.type, quiet: hiDana.quiet });
  const danaOnly = classify('Dana, can you reply and confirm whether the Q3 summary will include the October numbers?', q3ctx);
  check('Dana stays quiet when the user is Sali', !danaOnly.type && danaOnly.quiet === 'hedge', { type: danaOnly.type, quiet: danaOnly.quiet });
  const saliOnly = classify('Sali, can you reply and confirm whether the Q3 summary will include the October numbers?', q3ctx);
  check('Sali offers when the user is Sali', saliOnly.type === FlowIntent.TYPES.REQUEST && saliOnly.quiet !== 'hedge', { type: saliOnly.type, quiet: saliOnly.quiet });
  const q3missing = classify(Q3);
  const q3empty = classify(Q3, { to: [], cc: [] });
  check('a reply ask with no To or Cc stays quiet',
    !q3missing.type && q3missing.quiet === 'hedge' && !q3empty.type && q3empty.quiet === 'hedge',
    { missing: q3missing.quiet, empty: q3empty.quiet });
  const silentReply = [
    ['automatic reply', 'Automatic reply: Can you reply and confirm whether the Q3 summary will include the October numbers?', {}],
    ['cc-only named addressee', 'Dana, can you reply and confirm whether the Q3 summary will include the October numbers?', {
      to: ['dana@meridian.com'], cc: ['me@glance.test'], ownAddresses: ['me@glance.test'], userName: 'Sali'
    }],
    ['note to self', Q3, { noteToSelf: true, senderEmail: 'me@glance.test', ownAddresses: ['me@glance.test'] }]
  ];
  silentReply.forEach(([label, text, extra]) => {
    const intent = classify(text, extra);
    check('reply draft stays silent: ' + label, !intent.type && intent.quiet === 'hedge', { type: intent.type, quiet: intent.quiet });
  });
}

console.log('\n--- the receipt names the writes that actually landed, and nothing that failed ---\n');
{
  const lines = FlowActions.receiptWrittenLines([
    { response: { ok: true, written: 'Calendar · Kickoff · Sep 18 15:00' } },
    { response: { ok: false, written: 'Calendar · should not appear · Sep 18 15:00' } },
    { response: { ok: true, written: 'Calendar · Kickoff · Sep 18 15:00' } },
    { response: { ok: true, written: '  Google Task · due Sep 21  ' } },
    { response: { ok: false, written: 'should not appear' } },
    { response: { ok: true, written: '  Gmail draft · the invoice  ' } },
    { response: { ok: true, written: '   ' } }
  ]);
  check('receipt keeps each successful written line once, trimmed',
    JSON.stringify(lines) === JSON.stringify([
      'Calendar · Kickoff · Sep 18 15:00',
      'Google Task · due Sep 21',
      'Gmail draft · the invoice'
    ]),
    lines);
  check('a close with no written field stays quiet',
    JSON.stringify(FlowActions.receiptWrittenLines([{ response: { ok: true } }])) === '[]');
}

console.log('\n--- a clean parking-permit renew is a request, and a mass-mail footer stays quiet ---\n');
{
  const ask = 'Can you send the parking permit for the visitor bay tomorrow?\n\nUnsubscribe | View in browser';
  const intent = classify(ask);
  check('a parking-permit ask with unsubscribe stays quiet:noise', intent && intent.quiet === 'noise' && intent.type == null, intent);
  const news = 'Our weekly newsletter is here. Limited-time offer inside.\n\nUnsubscribe | View in browser';
  const quiet = classify(news);
  check('a newsletter with unsubscribe stays quiet:noise', quiet && quiet.quiet === 'noise', quiet);
  const subjectAsk = classify('Unsubscribe | View in browser', { subject: 'Parking permit - please renew by Sunday', now: new Date('2026-10-08T12:00:00Z') });
  check('a parking subject above a mass-mail footer stays quiet:noise', subjectAsk && subjectAsk.quiet === 'noise' && subjectAsk.type == null, subjectAsk);
  const clean = classify('Parking permit - please renew by Sunday', { now: new Date('2026-10-08T12:00:00Z'), senderEmail: 'dana@city.gov' });
  check('a clean parking-permit renew from a person is a request', clean && clean.type === FlowIntent.TYPES.REQUEST && clean.quiet !== 'noise', clean);
  const park = 'Parking permit - please renew by Sunday';
  const when = new Date('2026-10-08T12:00:00Z');
  [
    'You are receiving this email because you signed up.',
    "You're receiving this message from the city list.",
    'You received this email because you are on the list.'
  ].forEach((footer) => {
    const intent = classify(park + '\n\n' + footer, { now: when, senderEmail: 'dana@city.gov' });
    check('a parking ask with a mailing footer stays quiet: ' + footer.slice(0, 28), intent && intent.quiet === 'noise' && intent.type == null, intent);
  });
  [
    'קיבלת מייל זה כי נרשמת לעדכונים.',
    'להסרה מרשימת התפוצה לחצו כאן.',
    'הנך רשום לרשימת התפוצה של העירייה.'
  ].forEach((footer) => {
    const intent = classify(park + '\n\n' + footer, { now: when, senderEmail: 'dana@city.gov' });
    check('a parking ask with a Hebrew list line stays quiet: ' + footer.slice(0, 16), intent && intent.quiet === 'noise' && intent.type == null, intent);
  });
  ['newsletter@lists.example', 'news@lists.example', 'marketing@lists.example', 'mailer@lists.example'].forEach((email) => {
    const intent = classify(park, { now: when, senderEmail: email });
    check('an automated list sender stays quiet: ' + email, intent && intent.quiet === 'noise' && intent.type == null, intent);
  });
  const paper = classify(park, { now: when, senderEmail: 'newspaper@city.gov' });
  check('a newspaper address is not a list sender', paper && paper.type === FlowIntent.TYPES.REQUEST && paper.quiet !== 'noise', paper);
  const subjectOnly = classify('Hi — the visitor bay is still open.', {
    subject: 'Parking permit - please renew by Sunday', now: when, senderEmail: 'dana@city.gov'
  });
  check('a clean parking subject with a human note is a request',
    subjectOnly && subjectOnly.type === FlowIntent.TYPES.REQUEST && subjectOnly.quiet !== 'noise', subjectOnly);
  const subjectFooter = classify('Hi.\n\nYou are receiving this email because you signed up.', {
    subject: 'Parking permit - please renew by Sunday', now: when, senderEmail: 'dana@city.gov'
  });
  check('a parking subject above a receiving-this footer stays quiet',
    subjectFooter && subjectFooter.quiet === 'noise' && subjectFooter.type == null, subjectFooter);

  const PARK_BODY = 'Hi,\n\nThe building parking permit expires next week. Please renew it on the municipality site by Sunday, October 11.\n\nNo need to reply, just get it done.\n\nThanks,\nFlow office';
  const parkCtx = {
    now: new Date('2026-10-08T13:34:00Z'),
    senderEmail: 'ai.local.flow@gmail.com',
    subject: 'Parking permit - please renew by Sunday',
    to: ['glance.salisapan@outlook.com'],
    ownAddresses: ['glance.salisapan@outlook.com']
  };
  const gatePark = classify(PARK_BODY, parkCtx);
  const gatePlan = FlowActions.planFor(gatePark, { threadUrl: 'x', hasThreadAttachment: false });
  const gateKinds = (gatePlan && gatePlan.steps || []).map((s) => s.kind);
  const parkTask = (gatePlan && gatePlan.steps || []).find((s) => s.kind === 'googleTask');
  check('gate049 parking is a To Do and not a draft',
    gatePark && gatePark.type === FlowIntent.TYPES.REQUEST && gatePark.noReplyDraft === true &&
    gatePark.label === 'Renew the parking permit by Oct 11' &&
    gatePark.entities && gatePark.entities.dateIso === '2026-10-11' &&
    gatePlan && gatePlan.id === 'log-it' && gateKinds.indexOf('gmailDraft') < 0 &&
    gateKinds.indexOf('googleTask') >= 0 && parkTask && parkTask.params.title === 'Renew the parking permit by Oct 11' &&
    !/Drafting your reply/.test(String(gatePlan.closingLine || '')) && !/Reply & Track/.test(String(gatePlan.name || '')),
    { label: gatePark && gatePark.label, id: gatePlan && gatePlan.id, name: gatePlan && gatePlan.name, line: gatePlan && gatePlan.closingLine, title: parkTask && parkTask.params.title, kinds: gateKinds });
  const bec = classify('We changed banks. Please update our account details and pay invoice 4471 by Sunday, October 11. No need to reply.', {
    now: parkCtx.now, senderEmail: 'dana@acme.com', to: ['glance.salisapan@outlook.com'], ownAddresses: ['glance.salisapan@outlook.com'], userName: 'Sali'
  });
  check('a bank-change payment stays quiet:family', bec && !bec.type && bec.quiet === 'family', { type: bec && bec.type, quiet: bec && bec.quiet });
  const payOnly = classify('Please pay invoice 4471 by Sunday, October 11.', {
    now: parkCtx.now, senderEmail: 'dana@acme.com', to: ['glance.salisapan@outlook.com'], ownAddresses: ['glance.salisapan@outlook.com'], userName: 'Sali'
  });
  check('a payment with no bank change still drafts', payOnly && payOnly.type === FlowIntent.TYPES.REQUEST && payOnly.quiet !== 'family', { type: payOnly && payOnly.type, quiet: payOnly && payOnly.quiet });
  const replyOnly = classify('No need to reply. The office already has the form from last week.', { now: parkCtx.now, senderEmail: 'dana@city.gov' });
  check('no need to reply with no action stays quiet:noise', replyOnly && !replyOnly.type && replyOnly.quiet === 'noise', replyOnly);
  const fyiRenew = classify('FYI, please renew the parking permit by Sunday.', { now: parkCtx.now, senderEmail: 'dana@city.gov' });
  check('fyi plus a renew stays quiet:noise', fyiRenew && !fyiRenew.type && fyiRenew.quiet === 'noise', fyiRenew);
  const noAction = classify('No action needed. Please renew the parking permit by Sunday.', { now: parkCtx.now, senderEmail: 'dana@city.gov' });
  check('no action needed stays quiet:noise', noAction && !noAction.type && noAction.quiet === 'noise', noAction);
  const doNothing = classify('No need to do anything. Please renew the parking permit by Sunday.', { now: parkCtx.now, senderEmail: 'dana@city.gov' });
  check('no need to do anything stays quiet:noise', doNothing && !doNothing.type && doNothing.quiet === 'noise', doNothing);
  const actionRequired = classify('Action required: wire $12,000 to account 998877 by Friday. No need to reply.', { now: parkCtx.now, senderEmail: 'dana@acme.com', to: ['me@glance.test'], ownAddresses: ['me@glance.test'] });
  check('action-required plus a date stays quiet without a please-verb', actionRequired && !actionRequired.type && actionRequired.quiet === 'noise', actionRequired);
  ['news@lists.example', 'newsletter@lists.example', 'marketing@lists.example'].forEach((email) => {
    const shown = classify(PARK_BODY, Object.assign({}, parkCtx, { senderEmail: email }));
    check('gate049 parking from a list sender stays quiet: ' + email, shown && !shown.type && shown.quiet === 'noise', shown);
    const wire = classify('Please send 0.2 BTC to wallet bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh by Monday.', { now: parkCtx.now, senderEmail: email, to: ['me@glance.test'], ownAddresses: ['me@glance.test'] });
    check('a wire from a list sender stays quiet: ' + email, wire && !wire.type, wire && wire.type);
  });
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
