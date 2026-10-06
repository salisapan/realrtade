// A loop closes when the request was ANSWERED, not when somebody wrote back. This corpus is the list of replies that look like an answer and are not
// ("got it", "I'll get back to you", an out-of-office, "it is with accounting", "ראיתי", "בטיפול"), and of replies that really are one. It is written fresh and was
// run against the engine BEFORE the fix below: 21 of the 76 replies in the first list closed a loop by default (see docs/true-close.md).
// Precision first: every reply in the first list that closes is a loop the person stops being reminded about, wrongly.
// Run: node test/true-close-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-05T09:00:00Z').getTime();
const W = (kind) => ({ kind: kind || 'reply', status: 'waiting', direction: 'theirs' });
const cr = (t, kind) => F.classifyReply(t, W(kind), { now: NOW, extract: FlowExtract });
const closes = (r) => r.outcome === 'closed' || r.outcome === 'paid';

const NOT_AN_ANSWER = [
  // received / seen / courtesy
  'Got it', 'Got it, thanks', 'Received, thank you', 'Noted', 'Thanks!', 'Thank you for your email', 'Acknowledged', 'Okay', 'Great, thanks', 'Perfect', 'Seen', 'Copy that', 'Understood', 'No problem', 'Appreciate it', 'I saw your email',
  // "I'll get back to you"
  'Will do', 'On it', 'Looking into it', 'Let me look into this', 'I will get back to you', "I'll get back to you shortly", 'Will revert', 'Checking with the team and will update you', 'Let me check and come back to you', 'Will take a look', 'Let me see what I can do',
  // out of office / automatic
  'Thanks for reaching out, I am out of the office until Monday', 'I am currently out of the office', 'Automatic reply: out of office', 'Received your message. We will respond within 2 business days.',
  // in progress, waiting on someone else
  'Working on it', 'In progress', 'Still working on this', 'Need a bit more time', 'Give me a day or two', 'Waiting on legal', 'Waiting for the CFO to approve', 'It is with accounting', 'Forwarded to the team',
  // unsure
  "I'll try", 'Hopefully by the end of the week', 'Probably tomorrow', 'I think so', 'Maybe', 'Not sure yet', 'Can we talk about it?',
  // Hebrew
  'קיבלתי', 'קיבלתי, תודה', 'תודה', 'אחזור אליך', 'אחזור אליך בהקדם', 'בודק ואחזור', 'אני בודק את זה', 'מטפל בזה', 'בטיפול', 'רשמתי', 'ראיתי', 'נבדוק', 'אעדכן', 'אעדכן אותך', 'אני לא במשרד עד יום ראשון', 'תודה על פנייתך, אענה בהקדם', 'מצוין', 'נראה', 'אנסה', 'אולי', 'עוד לא', 'ממתין לאישור', 'ממתין לחתימה', 'בדרך',
  // a forward that leaves only a signature (real-mail gold rm-009), and the same shape in English
  '[NAME] מנהל חטיבת שירות טלפון: [EMAIL]', 'Alex Kim, Director. Phone: [PHONE]'
];
const ANSWERS = [
  'Done', 'Done, sent it over', 'Attached is the signed contract', 'Here you go, the invoice is attached', 'Confirmed, see you Tuesday at 10', 'Approved', 'Yes, approved', 'It is signed and sent', 'Sent', 'The report is done and in your inbox', 'Yes', 'Yes please', 'Thursday works for me', 'Tuesday at 3pm', '10am', 'The PO number is 48213', 'It is $3,850', 'https://docs.example.com/plan',
  'כן, מאושר', 'אושר', 'החוזה חתום ונשלח', 'צירפתי את הקובץ', 'שלחתי', 'בוצע', 'סיימתי', 'מאשר, נתראה ביום שלישי', 'כן', 'ביום חמישי', 'המספר הוא 48213'
];

console.log('--- a reply that is not an answer never closes the loop ---');
let leaked = 0;
NOT_AN_ANSWER.forEach((t) => { const r = cr(t); if (closes(r)) { leaked++; check('does not close: ' + t, false, r); } });
check('none of the ' + NOT_AN_ANSWER.length + ' replies that only look like an answer closes a loop', leaked === 0, leaked);

console.log('--- and what really is an answer still does ---');
let held = 0;
ANSWERS.forEach((t) => { const r = cr(t); if (!closes(r) && r.outcome !== 'promised' && r.outcome !== 'answered') { held++; check('closes (or is read as an answer): ' + t, false, r); } });
check('all ' + ANSWERS.length + ' real answers still close (none is held open by the new rule)', held === 0, held);

console.log('--- held open is silent, labelled, and says why ---');
const h = cr('Maybe');
check('a held reply is an "ack": the loop stays, no card, and the reason is recorded', h.outcome === 'ack' && h.basis === 'unsure' && /not clearly an answer/.test(h.why || ''), h);
check('waiting on someone else is an interim, not a delivery, even when the sentence contains "approve"', cr('Waiting for the CFO to approve').outcome !== 'closed');
check('"will revert" is a promise with no day: it moves nothing but never closes', cr('Will revert').outcome === 'promised' || cr('Will revert').outcome === 'ack');
check('a payment loop is judged by its own rule (a one-word "ok" is still only an ack)', cr('ok', 'payment').outcome === 'ack');
check('a longer, substantive reply is still read as an answer by default (the rule is for the very short only)', closes(cr('We moved the deployment window to the second Tuesday of the month because of the audit.')));
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
