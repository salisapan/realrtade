// A self title is the body's verb plus its object, with the preposition
// that verb takes. No clear object stays quiet. "Follow up on this" is
// not a title. maybe / if you're free / אולי win before a live ask.
// "don't forget" and "no need to reply" are not a negation of the ask.
// v2syn-13472 and v2syn-14649 are tasks: Call about / שיחה בנושא.
// The calendar-as-base rule for those two is cancelled.
// Run: node test/self-title-preposition-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const Families = vm.runInContext('FlowCloseFamilies', engine);

const OWN = 'ai.local.flow@gmail.com';
const NOW = new Date('2026-10-16T12:00:00Z');
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log('ok', name); return; }
  failed++;
  console.log('FAIL', name, detail == null ? '' : JSON.stringify(detail));
}

// verb → the preposition that may follow it. A title that starts with the
// verb and uses a different preposition fails. לשלם carries the amount.
const PREP = [
  { verb: 'להתקשר', ok: /^להתקשר ל(?!עצמי\b)/ },
  { verb: 'לעדכן', ok: /^לעדכן (?:את |לגבי )/ },
  { verb: 'לבדוק', ok: /^לבדוק את / },
  { verb: 'לשלוח', ok: /^לשלוח (?:את |ל[\u0590-\u05FF])/ },
  { verb: 'לצרף', ok: /^לצרף את / },
  { verb: 'לשלם', ok: /^לשלם(?:\s|$)/ },
  { verb: 'לקבוע', ok: /^לקבוע עם / },
  { verb: 'לעקוב', ok: /^לעקוב אחרי (?!זה\b|לעצמי\b|בהמשך\b)/ },
  { verb: 'שיחה', ok: /^שיחה (?:עם |בנושא )/ }
];
const BANNED = [
  /את גבי/,
  /להתקשר את/,
  /לבדוק ל-/,
  /לעקוב אחרי זה(?:\s|$)/,
  /לעקוב אחרי לעצמי/,
  /לעקוב אחרי בהמשך/,
  /^Follow up on this$/i,
  /^Follow up on\b/i,
  // A title is the verb plus the object. A quoted sentence, or a request
  // phrase copied from the mail, is not that title.
  /^["“”'«„]/,
  /^(?:תזכורת|בבקשה|אפשר|מחכים ל|מחכה ל|עדיין חסר|יש מצב|אני אגיע|אנחנו בפנים|לזכור |סיכמנו |הבטחתי |רק משהו|מה דעתך|can i get\b)/i
];
function prepFault(title) {
  const t = String(title || '').trim();
  if (!t) return '';
  for (let i = 0; i < BANNED.length; i++) if (BANNED[i].test(t)) return 'banned';
  for (let i = 0; i < PREP.length; i++) {
    if (t.indexOf(PREP[i].verb) !== 0) continue;
    if (!PREP[i].ok.test(t)) return PREP[i].verb;
  }
  return '';
}

function selfJudge(body, subject) {
  return J.judge({
    text: body,
    subject: subject || '',
    sender: { name: 'Sali Sapan', email: OWN },
    surface: 'gmail',
    to: [OWN],
    cc: [],
    ownAddresses: [OWN],
    userName: 'Sali',
    ownNames: ['Sali', 'Sali Sapan', 'סאלי'],
    direction: 'self',
    inbound: false,
    now: NOW
  });
}
function labelOf(out) {
  return String((out && out.intent && out.intent.label) || '');
}

const cases = [
  ['להתקשר לרו״ח', 'לעצמי', 'אני צריך להתקשר לרו״ח עד יום שישי.', 'להתקשר לרו״ח'],
  ['להתקשר לגיא', 'לעצמי', 'להתקשר לגיא ביום שני ב-13:00. תודה', 'להתקשר לגיא'],
  ['לעדכן לגבי הפיילוט', 'שאלה קצרה', 'בבקשה תעדכני אותי לגבי הפיילוט השבוע', 'לעדכן לגבי הפיילוט'],
  ['לבדוק את ה-PR', 'המצגת', 'תעשה review ל-PR עד יום חמישי', 'לבדוק את ה-PR'],
  ['Book the venue', 'Note to self', 'Note to self: book the venue by Wednesday, October 14.', 'Book the venue'],
  ['Order new laptops', 'Recap', 'As discussed, you will order new laptops before Sunday.', 'Order new laptops'],
  ['Create an invoice', 'Please prepare', 'Please create an invoice for Globex for $89. Thanks!', 'Create an invoice for Globex for $89'],
  ['Prepare quote', 'New doc', 'Can you prepare a quote for Northwind for $89?', 'Prepare quote for Northwind for $89'],
  ['Meet about the Q4 plan', 'Re: the migration', 'Can we meet next Monday at 14:30 to go over the Q4 plan?', 'Meet about the Q4 plan'],
  ['Interview Monday 2pm', 'Re: the pilot', 'Are you free for a interview next Monday at 2pm?', 'Interview Monday 2pm'],
  ['Save attachment to Drive', 'Re: Signed Q3 report', 'Please sve this attachment to Google Drive.', 'Save attachment to Drive'],
  ['Send the latest lease', 'Re: Need the signed contract', 'Could you sedn me the lattest lease?', 'Send the latest lease'],
  ['Put agenda on calendar', 'Agenda', 'Put the agenda on the calendar for Sunday at 2pm.', 'Put agenda on calendar'],
  ['לאשר את הקבלות מהנסיעה', 'בהמשך להפיילוט', 'בבקשה אשר את הקבלות מהנסיעה עד יום שישי כדי שנתקדם.', 'לאשר את הקבלות מהנסיעה'],
  ['פגישת סטטוס', 'בהמשך לה-onboarding', 'יש מצב לעשות פגישת סטטוס קצרה ביום שני ב-13:00?', 'פגישת סטטוס ביום שני 13:00'],
  ['פגישה ביום שלישי', 'בהמשך להתקציב', 'תוכל להגיע לפגישה ביום שלישי בשעה 15:00?', 'פגישה ביום שלישי 15:00'],
  ['דמו ביום שני', 'בהמשך לההשקה', 'אני מזמין אותך לדמו ביום שני בשעה 9:00. תודה', 'דמו ביום שני 9:00'],
  ['Send the signed lase', 'Reminder', 'I will snd the signed lase back next Tuesday.', 'Send the signed lase'],
  ['Send the W-9', 'Note to self', 'I promised Tom to sned the W-9 by EOD.', 'Send the W-9 by EOD'],
  ['Share the purchase order', 'Re: Recap', 'Happy Monday!\n\nAs promised on the call, you will share the purchase order by Oct 20.\n\nMany thanks,\nSali', 'Share the purchase order by Oct 20'],
  ['Send the quarterly report', 'Note to self', 'I promsed Omer to sedn the quarterly report by EOD. Thanks', 'Send the quarterly report by EOD'],
  ['Call about the campaign', 'Re: the campaign', 'gimme a call October 19 at 9am Thank you', 'Call about the campaign'],
  ['Call about the launch checklist', 'Re: Re: Re: the launch checklist', 'Shall we hop on a call October 19 at 3pm', 'Call about the launch checklist'],
  ['לחדש את הדומיין ofek.dev', 'לעצמי', 'תזכורת לעצמי: לחדש את הדומיין ofek.dev ביום שישי.', 'לחדש את הדומיין ofek.dev'],
  ['שיחה בנושא', 'בהמשך לקליטת העובד החדש', 'אשמח אם תוכלי להחזיר לי טלפון ביום רביעי הבא?', 'שיחה בנושא קליטת העובד החדש']
];
cases.forEach(function (row) {
  const out = selfJudge(row[2], row[1]);
  const label = labelOf(out);
  const steps = (out.process && out.process.steps) || [];
  const task = out.show === true && steps.length > 0 && steps.every(function (s) { return s && (s.kind === 'googleTask' || s.kind === 'outlookTask'); });
  check(row[0], task && label === row[3] && !prepFault(label), { label: label, show: out.show, fault: prepFault(label), reason: out.reason });
});

[
  ['no object stays quiet', 'Thanks', 'See you then.']
].forEach(function (row) {
  const out = selfJudge(row[2], row[1]);
  const label = labelOf(out);
  check(row[0], out.show !== true && !/Follow up on/i.test(label) && !/לעקוב אחרי/.test(label), { show: out.show, label: label, reason: out.reason });
});

['את גבי', 'להתקשר את גיא', 'לבדוק ל-PR', 'לעקוב אחרי זה', 'לעקוב אחרי לעצמי', 'לעקוב אחרי בהמשך לה-onboarding', 'Follow up on this', '"Send the file tomorrow"', '“לשלוח את הקובץ”', 'תזכורת לעצמי: להגיש את הדוח', 'בבקשה לשלוח את הקובץ', 'אפשר לאשר את המעבר', 'מחכים להצעת המחיר', 'עדיין חסר לנו האסמכתא', 'Can I get the file from you'].forEach(function (title) {
  check('table rejects ' + title, prepFault(title) !== '', prepFault(title));
});
['להתקשר לרו״ח', 'לעדכן לגבי הפיילוט', 'לעדכן את הפיילוט', 'לבדוק את ה-PR', 'לשלוח את החוזה', 'לשלוח לרו״ח', 'לצרף את הקובץ', 'לשלם ₪89.90', 'לקבוע עם דנה', 'לעקוב אחרי הקבלות', 'שיחה עם דנה', 'שיחה בנושא הקמפיין'].forEach(function (title) {
  check('table accepts ' + title, prepFault(title) === '', prepFault(title));
});

const inbound = { to: [OWN], ownAddresses: [OWN], userName: 'Sali', ownNames: ['Sali', 'סאלי'], senderEmail: 'dana@acme.io', now: NOW };
function inboundType(text) {
  const intent = vm.runInContext('FlowIntent', engine).classify(text, inbound);
  return intent;
}
const maybe = inboundType("Maybe let's meet Tuesday at 3pm.");
check('maybe lets meet stays quiet', !maybe.type, { type: maybe.type, quiet: maybe.quiet });
const free = inboundType("Can we meet Friday, September 18 at 3pm if you're free?");
check('if you are free stays quiet', !free.type, { type: free.type, quiet: free.quiet });
const ulai = inboundType('אולי אפשר לשלוח את החוזה?');
check('אולי stays quiet', !ulai.type, { type: ulai.type, quiet: ulai.quiet });
const im = inboundType('אם אפשר, תשלח את החוזה עד יום חמישי');
check('אם אפשר תשלח stays an ask', im.type === 'request', { type: im.type, quiet: im.quiet });
check('dont forget is not a hold', Families.sentenceHeldBack("Don't forget to save the attached file to OneDrive.") === false);
check('no need to reply is not a hold', Families.sentenceHeldBack('No need to reply, just get it done.') === false);
check('dont send is still a hold', Families.sentenceHeldBack("Don't send the contract.") === true);
check('no need to pay is still a hold', Families.sentenceHeldBack('No need to pay the invoice.') === true);
check('maybe is a live-ask hedge', Families.commitmentHeldBack("Maybe let's meet Tuesday at 3pm.") === false);
const greet = inboundType('Greetings,\n\nCould you send me the Q3 report by Thursday?');
check('Greetings is not a name', greet.type === 'request' && greet.quiet !== 'hedge', { type: greet.type, quiet: greet.quiet });

// A self-sent "I will" and a self-sent "We agreed to <verb>" are the verb
// plus the object. Log commitment is a promise sent to someone else.
// A typo still names the task. A call at a time with no object uses the subject.
function agreedLog(body) {
  const out = selfJudge(body, 'Note to self');
  return { show: out.show, label: labelOf(out) };
}
[
  ['v2syn-1205', 'We agreed to book the venue by Wednesday, October 14. Thanks!', 'Book the venue'],
  ['v2syn-1231', 'We agreed to renew the passport application by Wednesday, October 14.\n\nThank you,\nSali', 'Renew the passport application'],
  ['v2syn-1237', 'We agreed to file the tax return by Wednesday, October 14. Regards', 'File tax return'],
  ['garbled verb is still the task', 'אני צריך לחשד את הדררכון עד סוף השבוע.', 'לחדש את הדרכון'],
  ['call at a time uses the clock', 'Would next Monday at 3pm work for a quick call?', 'Call Monday 3pm']
].forEach(function (row) {
  const got = row[0] === 'call at a time uses the clock'
    ? (function () { const out = selfJudge(row[1], 'Meeting request'); return { show: out.show, label: labelOf(out) }; })()
    : agreedLog(row[1]);
  check(row[0] + ' is ' + row[2], got.show === true && got.label === row[2] && !prepFault(got.label), got);
});
const notAgreed = [
  ['I promsed Omer to sedn the quarterly report by EOD. Thanks', 'Send the quarterly report by EOD'],
  ['I will snd the signed lase back next Tuesday.', 'Send the signed lase'],
  ['I promised Tom to sned the W-9 by EOD.', 'Send the W-9 by EOD'],
  ['As promised on the call, you will share the purchase order by Oct 20.', 'Share the purchase order by Oct 20']
];
notAgreed.forEach(function (row) {
  const got = agreedLog(row[0]);
  const generic = got.label === 'Log commitment' && !/\bwe\s+agreed\s+to\b/i.test(row[0]);
  check('no generic Log commitment: ' + row[1], !generic && got.label === row[1], got);
});

// A request phrase is not the title. The verb and the object are.
[
  ['v2syn-7038', 'עדיין חסר לנו האסמכתא להעברה ממך מחר.', 'לשלוח את האסמכתא להעברה'],
  ['v2syn-18433', 'מחכים להצעת המחיר שלכם ביום שלישי הבא כדי להתקדם', 'לשלוח את הצעת המחיר'],
  ['v2syn-21682', 'אפשר להסדיר את התשלום של ₪15,000 עד 20/10?', 'לשלם ₪15,000'],
  ['v2syn-9426', 'בבקשה להפיק חשבונית למונדיי על סך ₪7,250.', 'להפיק חשבונית למונדיי על סך ₪7,250'],
  ['v2syn-12134', 'Can I get the insurance certificate from you by end of week?', 'Send the insurance certificate'],
  ['v2syn-23006', 'אפשר לדבר מחר בשעה 9:00 על ה-onboarding?', 'שיחה בנושא ה-onboarding'],
  ['v2syn-23335', 'אני אגיע מחר בשעה 15:00', 'להגיע מחר 15:00'],
  ['v2syn-23874', 'אנחנו בפנים – ₪89.90 לההשקה', 'Log ₪89.90 agreed'],
  ['v2syn-27836', 'תזכורת לעצמי: לגיש את הדוח השנתי עד סוף היום', 'להגיש את הדוח השנתי'],
  ['v2syn-7345', 'תזכורת: תשלום של ₪89 עד ה-15.10.', 'לשלם ₪89'],
  ['v2syn-13455', 'lmk today if the launch checklist works', 'Reply about the launch checklist'],
  ['v2syn-15129', 'We aproved ₪3,400 for the launch checklist tis morning.', 'Log ₪3,400 agreed']
].forEach(function (row) {
  const out = selfJudge(row[1], 'תזכורת');
  const label = labelOf(out);
  check(row[0] + ' is the verb plus the object', out.show === true && label === row[2] && !prepFault(label), { label: label, show: out.show, reason: out.reason });
});

if (failed) {
  console.log(failed + ' failed');
  process.exit(1);
}
console.log('self-title preposition corpus passed');
