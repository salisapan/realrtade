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

  // "send me the signed contract" names a concrete object ("contract")
  // but the thread itself has nothing attached — this is exactly the case
  // background.js's driveSearchAttachment() exists for: no attachment yet,
  // but a real chance of finding one in Drive. The label must say so even
  // before any Drive call happens, since it's what the user sees on the
  // step pill.
  const fileNameIntent = classify('Could you please send me the signed contract by Friday, September 18?');
  check('a named object with no thread attachment sets requestedObjectTerm', typeof fileNameIntent.entities.requestedObjectTerm === 'string' && fileNameIntent.entities.requestedObjectTerm.length > 0, fileNameIntent.entities.requestedObjectTerm);
  const [draftMayFind] = FlowActions.planFor(fileNameIntent, { threadUrl: 'x', hasThreadAttachment: false }).steps;
  check('a named object alone (no thread attachment) still labels "Draft reply + file"', draftMayFind.label === 'Draft reply + file', draftMayFind.label);
  check('a named object alone still sets includeAttachment on the step params', draftMayFind.params.includeAttachment === true, draftMayFind.params);
  check('a named object alone forwards requestedObjectTerm in step params', draftMayFind.params.requestedObjectTerm === fileNameIntent.entities.requestedObjectTerm, draftMayFind.params.requestedObjectTerm);

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

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
