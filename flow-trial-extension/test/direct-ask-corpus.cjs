// The direct-ask second read (core/incoming-judge.js, off unless the host passes directAskOn) and the Google Calendar notice quiet.
// Shapes found on the owner's real mailbox on 2026-11-12. No third party's text is here: the mails are written for this file, except the
// bare-imperative sentence, which is one of the owner's own Gate test sentences.
// Run: node test/direct-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js',
  'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'incoming-judge.js', 'draft-reply.js'];
const NOW = new Date('2026-10-07T12:00:00+03:00').getTime();
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa };
vm.createContext(sb);
vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', sb);
const X = vm.runInContext('FlowExtract', sb);
const DEPS = { intent: vm.runInContext('FlowIntent', sb), actions: vm.runInContext('FlowActions', sb), factReply: vm.runInContext('FlowFactReply', sb), fileAttach: vm.runInContext('FlowFileAttach', sb),
  resolution: vm.runInContext('FlowResolution', sb), quietMetrics: vm.runInContext('FlowQuietMetrics', sb) };
const OWN = 'ai.local.flow@gmail.com';
function judge(text, extra) {
  return J.judge(Object.assign({ text, subject: 'Quote', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://mail.google.com/x', hasThreadAttachment: false,
    attachmentCount: 0, surface: 'gmail', to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true, directAskOn: true }, extra || {}), DEPS);
}
const kinds = (r) => (r.show ? r.process.steps.map((s) => s.kind).join('+') : 'SILENT(' + r.reason + ')');
const QUOTE_HE = 'סאלי היי,\n\nשאלה לגבי ההצעה:\n\n  1. מה ההבדלים בין ענן מאובטח למחשב העובד ?\n  2. האם תהיה התקנה בכל מחשב ?\n  3. ומה המחיר של שרת מקומי?\n\nתודה,\nדנה';
const QUOTE_EN = 'Hi Sali,\n\nTwo questions about the proposal:\n1. What is the difference between the cloud plan and the on-prem plan?\n2. How many seats does the base price include?\n\nThanks,\nDana';

console.log('\n--- off by default ---\n');
check('without directAskOn the questions mail stays as the engine left it', kinds(judge(QUOTE_HE, { directAskOn: false })).startsWith('SILENT'), kinds(judge(QUOTE_HE, { directAskOn: false })));
check('without directAskOn the bare Hebrew imperative stays as the engine left it', kinds(judge('שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה', { directAskOn: false })).startsWith('SILENT'));

console.log('\n--- plain questions from a person ---\n');
let r = judge(QUOTE_HE);
check('HE: numbered questions about a quote become one reply draft', kinds(r) === 'gmailDraft' && r.intent.directAsk === true && r.intent.questions === 3, [kinds(r), r.intent && r.intent.questions]);
check('HE: no date in the words, so no task and no date is invented', r.process.steps.length === 1 && !r.intent.entities.dateIso);
check('HE: the quoted ask is the first question, as written', /מה ההבדלים/.test(r.intent.entities.what), r.intent.entities.what);
r = judge(QUOTE_EN);
check('EN: two questions become one reply draft', kinds(r) === 'gmailDraft' && r.intent.questions === 2, kinds(r));
r = judge('Hi Sali,\n\nWhat is the price for ten seats?\n\nThanks, Dana');
check('one question in a mail that greets the reader by name is a reply', kinds(r) === 'gmailDraft', kinds(r));
r = judge('What is the price for ten seats?\n\nThanks, Dana');
check('one question with no greeting by name stays quiet', kinds(r).startsWith('SILENT'), kinds(r));

console.log('\n--- who and where ---\n');
check('an automated sender stays quiet', kinds(judge(QUOTE_EN, { sender: { name: 'Acme', email: 'no-reply@acme.io' } })).startsWith('SILENT'));
check('a mass-mail footer stays quiet', kinds(judge(QUOTE_EN + '\n\nYou are receiving this email because you subscribed. Unsubscribe', {})).startsWith('SILENT'));
check('the reader only on Cc stays quiet', kinds(judge(QUOTE_EN, { to: ['other@acme.io'], cc: [OWN] })).startsWith('SILENT'));
check('a mail to more than three people stays quiet', kinds(judge(QUOTE_EN, { to: [OWN, 'a@x.io', 'b@x.io', 'c@x.io'] })).startsWith('SILENT'));
check('an auto-reply subject stays quiet', kinds(judge(QUOTE_EN, { subject: 'Automatic reply: Quote' })).startsWith('SILENT') && kinds(judge(QUOTE_HE, { subject: 'מענה אוטומטי: הצעה' })).startsWith('SILENT'));
r = judge(QUOTE_EN, { sender: { name: 'Sali', email: OWN } });
check('the person\'s own mail is never a direct ask (a note to self keeps the engine\'s own rule)', !(r.show && r.intent.directAsk), kinds(r));
check('questions only inside the quoted history stay quiet', kinds(judge('Thanks, noted.\n\nFrom: Sali <' + OWN + '>\nSent: Monday\nSubject: Quote\n\nWhat is the price for ten seats? How many seats are included?')).startsWith('SILENT'));

console.log('\n--- sentences that are not asks ---\n');
check('security-notice questions are not asks', kinds(judge('Hi Sali,\n\nWas this you? Did you just log in on a new device?\n\nThe Team')).startsWith('SILENT'));
check('a greeting question is not an ask', kinds(judge('Hi Sali,\n\nHow are you? How\'s it going?\n\nDana')).startsWith('SILENT') && kinds(judge('סאלי היי,\n\nמה שלומך? מה נשמע?\n\nדנה')).startsWith('SILENT'));
check('a hedged question is skipped', kinds(judge('Hi Sali,\n\nWhat is the price, maybe? How many seats, whenever you get a chance?\n\nDana')).startsWith('SILENT'));
r = judge('בוקר טוב סאלי, יש מצב לתאם זום ביום שלישי בשעה 9:00? תודה! דנה');
check('a question that names a clock is a meeting proposal, never a direct-ask reply', !(r.show && r.intent.directAsk), kinds(r));

console.log('\n--- a Hebrew bare imperative with its day ---\n');
r = judge('שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה');
check('work with a day is a task due that day', kinds(r) === 'googleTask' && r.intent.directAsk === true && r.process.steps[0].params.dateIso === '2026-10-08', [kinds(r), r.show && r.process.steps[0].params]);
r = judge('היי סאלי, תשלם את החשבונית עד יום חמישי. תודה, דנה');
check('a payment back with a day is a reply with its task', kinds(r) === 'gmailDraft+googleTask' && r.intent.entities.dateIso === '2026-10-08', [kinds(r), r.show && r.intent.entities.dateIso]);
check('with no day it stays quiet', kinds(judge('שלום, מלא את הטופס, חתום והחזר. תודה, דנה')).startsWith('SILENT'));
check('negated, it stays quiet', kinds(judge('שלום, אל תשלם את החשבונית עד יום חמישי. תודה, דנה')).startsWith('SILENT'));
check('"already handled" stays quiet', kinds(judge('שלום, לא צריך, חתום והחזר כבר טופל. תודה, דנה')).startsWith('SILENT'));

console.log('\n--- Google Calendar notices ---\n');
check('calendar-notification@ is an automated sender', X.senderIsAutomated('calendar-notification@google.com', '') === true && X.senderIsAutomated('dana@acme.io', '') === false);
r = judge('Booked by Test Booking\nA 30-minute intro call with the team.\nJoin with Google Meet Meeting link https://meet.example/abc Test your setup at any time', { sender: { name: 'Google Calendar', email: 'calendar-notification@google.com' }, subject: 'Appointment booked: Intro @ Sun 1 Nov 2026 10am - 10:30am', directAskOn: false });
check('an "Appointment booked" notice from Google Calendar offers no reply draft', !(r.show && r.process.steps.some((s) => s.kind === 'gmailDraft')), kinds(r));

console.log('\n--- chats (WhatsApp, Messenger, Instagram, Teams): one-to-one only, questions only, at least two ---\n');
const chatJudge = (text, extra) => J.judge(Object.assign({ text, subject: '', sender: { name: 'Dana', phone: '+972500000000' }, now: new Date(NOW), surface: 'chat', attachmentCount: 0, directAskOn: true, oneToOne: true }, extra || {}), DEPS);
r = chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?');
check('chat: two business questions in a one-to-one chat become one task to answer, no day invented', r.show && r.process.steps.length === 1 && r.process.steps[0].kind === 'googleTask' && r.process.steps[0].params.dateIso === null && /^לענות: /.test(r.process.steps[0].params.title) && /ועוד 1/.test(r.process.steps[0].params.title), r.show && r.process.steps[0].params);
r = chatJudge('Hi, what is the price for ten seats? How many seats does the base plan include?');
check('chat EN: the same, titled in English', r.show && /^Reply: What is the price/.test(r.process.steps[0].params.title) && /\+1 more/.test(r.process.steps[0].params.title), r.show && r.process.steps[0].params.title);
check('chat: no email draft step ever (the person types the answer in the chat)', r.show && !r.process.steps.some((st) => /Draft$/.test(st.kind)));
check('chat: one question alone is conversation, not a loop', !chatJudge('מה המחיר לעשרה משתמשים?').show);
check('chat: where, when, who, why and how are everyday chat and are not read by this reader', !chatJudge('איפה אתה עכשיו? מתי מגיע הביתה? מי בא איתך?').show && !(chatJudge('Where are you now? When are you coming home? Who is coming with you?').intent || {}).directAsk);
check('chat: short questions are not read', !chatJudge('מה קורה? כמה אתה?').show);
check('chat: a group chat is never read', !chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', { oneToOne: false }).show && !chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', { group: true }).show);
check('chat: without the host saying one-to-one, nothing is read', !chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', { oneToOne: undefined }).show);
check('chat: the person\'s own message is never read', !chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', { fromMe: true }).show);
check('chat: without directAskOn nothing changes', !chatJudge('היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', { directAskOn: false }).show);
check('chat: the Hebrew bare imperative is not read here (core/chat-deadline-ask.js owns it)', !(chatJudge('תשלם את החשבונית עד יום חמישי').show && chatJudge('תשלם את החשבונית עד יום חמישי').intent.directAsk));


console.log('\n--- legal and business Hebrew: «מהו», a lead-in clause, «אם אני מבין נכון» (a use case of 2026-11-16, rewritten: no real text, names or figures) ---\n');
{
  const LEGAL = 'רועי ולירון, נבקש לנהל דיון פנימי בנושא ולא להשיב כרגע לצד השני.\nמהו המועד האחרון למתן תשובה כאמור?\nבהתבסס על מה שכתבתם ועל חוות הדעת, מה גובה הסכום שאינו שנוי במחלוקת ומה הסכום הנותר?\nכ"כ אם אני מבין נכון, יתרת הסכום תהיה נתונה לשיקול דעת הצד השני?';
  const r = judge(LEGAL, { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: three questions, two with a lead-in clause and one fused «מהו», are one reply draft that counts them', kinds(r) === 'gmailDraft+googleTask' && r.intent.directAsk === true && r.intent.questions === 3, [kinds(r), r.intent && r.intent.questions]);
  const one = judge('רועי, מהו המועד האחרון למתן תשובה?', { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: one «מהו» question to a group is not read (the two-question floor stands)', !one.show, kinds(one));
  const stmt = judge('רועי ולירון, בהתבסס על מה שכתבתם, הסכום שאינו שנוי במחלוקת הוא 20,000.', { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: a statement with a lead-in clause and no question stays quiet', !stmt.show, kinds(stmt));
  check('HE: the same questions from an automated sender stay quiet', !judge(LEGAL, { ownNames: ['רועי'], to: [OWN], sender: { name: 'System', email: 'noreply@acme.io' }, subject: 'עדכון' }).show);
}


console.log('\n--- a mail of questions that also holds an answer, asks for a date and quotes figures (rewritten from a real use case: no real text, names or figures) ---\n');
{
  const MAIL = 'דנה ויואב, אנחנו מבקשים לנהל דיון פנימי בנושא, אני מבקש כרגע לא להחזיר תשובה לב"כ הצד השני.\nמהו המועד האחרון המאפשר מתן תשובה כאמור?\nבהתבסס על מה שכתבתם, כתב ההגנה וחוות הדעת, מה גובה הסכום שאינו שנוי במחלוקת ומה הסכום הנותר?\nלפי מה שאני מבין אין מחלוקת על 12,000 + מע"מ ובנוסף 8,000 + מע"מ לשיקול דעת בית המשפט, מתוך תביעה בגובה 5 מיליון.\nכ"כ אם אני מבין נכון, אנו נשא בעלות 12,000 + מע"מ והמשך התביעה בסכום 4,988,000 תהיה נתונה לשיקול דעת התובעים?';
  const r = judge(MAIL, { ownNames: ['דנה'], to: [OWN, 'yoav@firm.co.il'], subject: 'עדכון' });
  const draft = r.show ? r.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  const task = r.show ? r.process.steps.find((st) => st.kind === 'googleTask') : null;
  check('HE: the three questions (one fused «מהו», one behind a listing lead-in, one «אם אני מבין נכון») are all counted', r.show && r.intent.questions === 3 && draft && draft.params.questions.length === 3, [r.intent && r.intent.questions, draft && draft.params.questions]);
  check('the instruction to hold an answer to the other side is kept as a task that names the party and the work, with no day invented', task && /המתנה: לא להשיב לב"כ הצד השני/.test(task.params.title) && /לענות ל-3 שאלות/.test(task.params.title) && task.params.dateIso === null && r.intent.holdInstruction && r.intent.holdInstruction.party === 'ב"כ הצד השני', task && task.params);
  check('the question for a date is named in the task (the date is found, never guessed)', task && /כולל המועד האחרון/.test(task.params.title) && r.intent.deadlineQuestion === true);
  check('the mail\'s own figures are added up as a check: 5,000,000 - 12,000 = 4,988,000, and also minus 8,000', draft && JSON.stringify(draft.params.checks) === JSON.stringify(['5,000,000 - 12,000 = 4,988,000 ✓', 'ובניכוי 8,000 נוסף: 5,000,000 - 12,000 - 8,000 = 4,980,000']), draft && draft.params.checks);
  check('exactly one draft and one task: nothing is drafted to the other side', r.show && r.process.steps.filter((st) => st.kind === 'gmailDraft').length === 1 && r.process.steps.filter((st) => st.kind === 'googleTask').length === 1 && r.process.steps.length === 2, r.show && r.process.steps.map((st) => st.kind));
  const D = vm.runInContext('FlowDraftReply', sb);
  const body = D.draftBodyText({ params: draft.params, label: 'x' });
  check('the draft is the answer frame in Hebrew with every question, a place for each answer, and the check under it (it writes no answer)', /1\. מהו המועד/.test(body) && /3\. כ"כ/.test(body) && (body.match(/\[התשובה שלך\]/g) || []).length === 3 && /5,000,000 - 12,000 = 4,988,000 ✓/.test(body) && /לא תשובה/.test(body), body);
  const plain = judge('דנה ויואב, מהו המועד האחרון למתן תשובה? מה הסכום הנותר?', { ownNames: ['דנה'], to: [OWN, 'yoav@firm.co.il'], subject: 'עדכון' });
  check('two plain questions with no hold, no date question and no figures keep the reply draft alone', plain.show && plain.process.steps.length === 1 || (plain.show && plain.process.steps.every((st) => st.kind !== 'googleTask' || /כולל המועד/.test(st.params.title))), plain.show && plain.process.steps.map((st) => st.kind));
  const EN = judge('Dana and Yoav, we would like to discuss this internally. Please do not reply to opposing counsel yet.\nWhat is the last date to respond?\nWhich amount is undisputed, and what remains of the claim?', { ownNames: ['Dana'], to: [OWN, 'yoav@firm.co.il'], subject: 'Update' });
  const enTask = EN.show ? EN.process.steps.find((st) => st.kind === 'googleTask') : null;
  check('EN: the same mail in English: hold kept, date question named', enTask && /On hold: do not reply to opposing counsel yet/.test(enTask.params.title) && /including the last date/.test(enTask.params.title), enTask && enTask.params.title);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
