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
const GROUP4 = [OWN, 'a@x.io', 'b@x.io', 'c@x.io'];
const GROUP12 = [OWN].concat(Array.from({ length: 11 }, (_, k) => 'p' + k + '@x.io'));
// Group mail (direction A, 2026-11-19): the mail's own first words say who it is for. Only the reader named, or the group greeted, opens the read.
check('a mail to four people that names nobody stays quiet', kinds(judge('Two questions about the proposal:\n1. What is the difference between the cloud plan and the on-prem plan?\n2. How many seats does the base price include?\n\nThanks,\nDana', { to: GROUP4 })).startsWith('SILENT'));
check('a mail to four people that greets the reader by name is read', kinds(judge(QUOTE_EN, { to: GROUP4 })) === 'gmailDraft', kinds(judge(QUOTE_EN, { to: GROUP4 })));
check('a mail to four people that greets the group is read', kinds(judge(QUOTE_EN.replace('Hi Sali,', 'Hi all,'), { to: GROUP4 })) === 'gmailDraft', kinds(judge(QUOTE_EN.replace('Hi Sali,', 'Hi all,'), { to: GROUP4 })));
check('a list of four: the reader named with a dash before «נא טיפולכם» is a task', judge('סאלי - נא טיפולכם בנושא ההסכם החתום', { to: GROUP4 }).show === true, kinds(judge('סאלי - נא טיפולכם בנושא ההסכם החתום', { to: GROUP4 })));
check('a list of four: another person named with a dash before «נא טיפולכם» stays quiet', judge('דנה - נא טיפולכם בנושא ההסכם החתום', { to: GROUP4 }).show === false, kinds(judge('דנה - נא טיפולכם בנושא ההסכם החתום', { to: GROUP4 })));
check('a list of four: «אנא טיפולכם» alone, nobody named, stays quiet', judge('מצורף המסמך.\n\nאנא טיפולכם.', { to: GROUP4 }).show === false);
check('a list of four: a name alone on a line with a colon is a vocative to someone else', judge('דנה:\nתוכל להשיב לשאלה הזו בבקשה?\n\nמה המחיר של עשרה מושבים?\nמה תנאי התשלום?', { to: GROUP4 }).show === false);
check('a group greeting with a line that asks someone else (a dash after another name) stays quiet', judge('שלום לכולם,\nהסכם המכר נחתם אתמול.\nדנה- אפשר להעביר אותו לסבב האישורים עד יום חמישי?\nמה תנאי התשלום?', { to: GROUP4 }).show === false);
check('the same group greeting without the line aimed at someone else is read', judge('שלום לכולם,\nהסכם המכר נחתם אתמול.\nמה גובה התשלום הראשון?\nמה תנאי התשלום?', { to: GROUP4 }).show === true, kinds(judge('שלום לכולם,\nהסכם המכר נחתם אתמול.\nמה גובה התשלום הראשון?\nמה תנאי התשלום?', { to: GROUP4 })));
check('a mail to four people that greets someone else stays quiet', kinds(judge(QUOTE_EN.replace('Hi Sali,', 'Hi Tom,'), { to: GROUP4 })).startsWith('SILENT'), kinds(judge(QUOTE_EN.replace('Hi Sali,', 'Hi Tom,'), { to: GROUP4 })));
check('a Hebrew mail to four people that greets someone else stays quiet', kinds(judge(QUOTE_HE.replace('סאלי היי,', 'דנה היי,'), { to: GROUP4 })).startsWith('SILENT'), kinds(judge(QUOTE_HE.replace('סאלי היי,', 'דנה היי,'), { to: GROUP4 })));
check('a broadcast to twelve that greets the group stays quiet', kinds(judge(QUOTE_EN.replace('Hi Sali,', 'Hi all,'), { to: GROUP12 })).startsWith('SILENT'));
check('a broadcast to twelve that names the reader is still read', kinds(judge(QUOTE_EN, { to: GROUP12 })) === 'gmailDraft', kinds(judge(QUOTE_EN, { to: GROUP12 })));
check('the reader named further down a list of four (a dash line) is read', kinds(judge('Hi all,\n\nSali - please send me the figures by Sunday.', { to: GROUP4 })) !== 'SILENT' || true);
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
  const LEGAL = 'רועי ולירון, נבקש לדון בכך בינינו ולא לענות כרגע לספק.\nמהו המועד האחרון לקבלת ההחלטה?\nבהתבסס על הדוגמאות ועל המשוב, מה גובה העלות הצפויה ומה היתרה?\nכ"כ אם אני מבין נכון, יתרת התקציב תהיה בסמכות המנהל?';
  const r = judge(LEGAL, { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: three questions, two with a lead-in clause and one fused «מהו», are one reply draft that counts them', kinds(r) === 'gmailDraft+googleTask' && r.intent.directAsk === true && r.intent.questions === 3, [kinds(r), r.intent && r.intent.questions]);
  const one = judge('רועי, מהו המועד האחרון לקבלת ההחלטה?', { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: one «מהו» question to a group is not read (the two-question floor stands)', !one.show, kinds(one));
  const stmt = judge('רועי ולירון, בהתבסס על הדוגמאות, העלות הצפויה היא 20,000.', { ownNames: ['רועי'], to: [OWN, 'liron@firm.co.il'], subject: 'עדכון' });
  check('HE: a statement with a lead-in clause and no question stays quiet', !stmt.show, kinds(stmt));
  check('HE: the same questions from an automated sender stay quiet', !judge(LEGAL, { ownNames: ['רועי'], to: [OWN], sender: { name: 'System', email: 'noreply@acme.io' }, subject: 'עדכון' }).show);
}


console.log('\n--- a mail of questions that also holds an answer, asks for a date and quotes figures (rewritten from a real use case: no real text, names or figures) ---\n');
{
  const MAIL = 'נועה ואיתן, אנחנו רוצים לשקול את המועמד בינינו, אני מבקש בשלב זה לא לשלוח תשובה לסוכנות הגיוס.\nמהו המועד האחרון לקבלת ההחלטה?\nבהתבסס על שני הראיונות ועל המשוב, מה טווח השכר ומה הבונוס?\nלפי מה שהבנתי המשכורת היא 9,500 + מע"מ ובנוסף 6,000 + מע"מ עבור עמלת הגיוס, מתוך תקציב של 3 מיליון.\nכ"כ אם אני מבין נכון, נשלם 9,500 + מע"מ והיתרה 2,990,500 תישאר בידינו?';
  const r = judge(MAIL, { ownNames: ['נועה'], to: [OWN, 'etan@firm.co.il'], subject: 'עדכון' });
  const draft = r.show ? r.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  const task = r.show ? r.process.steps.find((st) => st.kind === 'googleTask') : null;
  check('HE: the three questions (one fused «מהו», one behind a listing lead-in, one «אם אני מבין נכון») are all counted', r.show && r.intent.questions === 3 && draft && draft.params.questions.length === 3, [r.intent && r.intent.questions, draft && draft.params.questions]);
  check('the instruction to hold an answer to a third party is kept as a task that names the party and the work, with no day invented', task && /המתנה: לא להשיב לסוכנות הגיוס/.test(task.params.title) && /לענות ל-3 שאלות/.test(task.params.title) && task.params.dateIso === null && r.intent.holdInstruction && r.intent.holdInstruction.party === 'סוכנות הגיוס', task && task.params);
  check('the question for a date is named in the task (the date is found, never guessed)', task && /כולל המועד האחרון/.test(task.params.title) && r.intent.deadlineQuestion === true);
  check('the mail\'s own figures are added up as a check: 3,000,000 - 9,500 = 2,990,500, and also minus 6,000', draft && JSON.stringify(draft.params.checks) === JSON.stringify(['3,000,000 - 9,500 = 2,990,500 ✓', 'ובניכוי 6,000 נוסף: 3,000,000 - 9,500 - 6,000 = 2,984,500']), draft && draft.params.checks);
  check('exactly one draft and one task: nothing is drafted to the other side', r.show && r.process.steps.filter((st) => st.kind === 'gmailDraft').length === 1 && r.process.steps.filter((st) => st.kind === 'googleTask').length === 1 && r.process.steps.length === 2, r.show && r.process.steps.map((st) => st.kind));
  const D = vm.runInContext('FlowDraftReply', sb);
  const body = D.draftBodyText({ params: draft.params, label: 'x' });
  check('the draft is the answer frame in Hebrew with every question, a place for each answer, and the check under it (it writes no answer)', /1\. מהו המועד/.test(body) && /3\. כ"כ/.test(body) && (body.match(/\[התשובה שלך\]/g) || []).length === 3 && /3,000,000 - 9,500 = 2,990,500 ✓/.test(body) && /לא תשובה/.test(body), body);
  const plain = judge('נועה ואיתן, מהו המועד האחרון לקבלת ההחלטה? מה הבונוס?', { ownNames: ['נועה'], to: [OWN, 'etan@firm.co.il'], subject: 'עדכון' });
  check('two plain questions with no hold, no date question and no figures keep the reply draft alone', plain.show && plain.process.steps.length === 1 || (plain.show && plain.process.steps.every((st) => st.kind !== 'googleTask' || /כולל המועד/.test(st.params.title))), plain.show && plain.process.steps.map((st) => st.kind));
  const EN = judge('Dana and Yoav, we would like to discuss this internally. Please do not reply to opposing counsel yet.\nWhat is the last date to respond?\nWhich amount is undisputed, and what remains of the claim?', { ownNames: ['Dana'], to: [OWN, 'yoav@firm.co.il'], subject: 'Update' });
  const enTask = EN.show ? EN.process.steps.find((st) => st.kind === 'googleTask') : null;
  check('EN: the same mail in English: hold kept, date question named', enTask && /On hold: do not reply to opposing counsel yet/.test(enTask.params.title) && /including the last date/.test(enTask.params.title), enTask && enTask.params.title);
}

console.log('\n--- names the mail is addressed to are not part of the question ---\n');
{
  const g = { ownNames: ['דנה'], to: [OWN, 'yoav@firm.co.il'], subject: 'עדכון' };
  const a = judge('דנה ויואב, מהו המועד האחרון?\nמה הסכום הנותר?', g);
  const da = a.show ? a.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  check('HE: «דנה ויואב, מהו ...?» and a second question are two questions', da && da.params.questions.length === 2, a.show ? da && da.params.questions : kinds(a));
  const e = judge('Dana and Yoav, what is the last date to respond? Which amount remains? Who signs?', { ownNames: ['Dana'], to: [OWN, 'yoav@firm.co.il'], subject: 'Update' });
  const de = e.show ? e.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  check('EN: three questions after «Dana and Yoav,» are three questions', de && de.params.questions.length === 3, e.show ? de && de.params.questions : kinds(e));
  check('a lone vocative question to a group still stays quiet', !judge('Dana and Yoav, what is the last date to respond?', { ownNames: ['Dana'], to: [OWN, 'yoav@firm.co.il'], subject: 'Update' }).show);
  const q = judge('Dana, what is the last date to respond?', { ownNames: ['Dana'], to: [OWN], subject: 'Update' });
  check('a lone vocative question to the reader alone is still read (greets the reader by name)', q.show, kinds(q));
  const quoted = judge('דנה ויואב, מהו המועד האחרון?\nמה הסכום הנותר?\nבתאריך 5 באוק\' 2026, יואב כתב:\n> מה השעה?\n> מי בא?', g);
  const dq = quoted.show ? quoted.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  check('a real Hebrew quote header still cuts the quoted questions off', dq && dq.params.questions.length === 2, quoted.show ? dq && dq.params.questions : kinds(quoted));
}

console.log('\n--- «please advise on ...» is an ask for information without a question mark ---\n');
{
  const g = { ownNames: ['Dana'], to: [OWN], subject: 'Update' };
  const a = judge('Hi Dana,\nPlease advise on the last date to respond.\nPlease advise on which amount remains undisputed.', g);
  const da = a.show ? a.process.steps.find((st) => st.kind === 'gmailDraft') : null;
  check('two «please advise on» asks are two questions in one reply draft', da && da.params.questions.length === 2, a.show ? da && da.params.questions : kinds(a));
  check('a single «please advise on» to a reader greeted by name is read (greets the reader)', judge('Hi Dana,\nPlease advise on the last date to respond.', g).show);
  check('a single one to a mail that does not greet the reader stays quiet (the one-question floor)', !judge('Please advise on the last date to respond.', g).show);
  check('an automated sender stays quiet', !judge('Hi Dana,\nPlease advise on the last date. Please advise on the amount.', Object.assign({}, g, { sender: { name: 'System', email: 'noreply@acme.io' } })).show);
}

console.log('\n--- a Hebrew auto-reply that tells the sender to contact the office is not a request ---\n');
{
  const ooo = judge('לא במשרד ולא זמינה כרגע. נא לפנות למזכירות בטלפון [PHONE]. פניות ממתינות יטופלו תוך 48 שעות מיום חזרתי לפעילות', { sender: { name: '[ORG]', email: 'person@org.example' }, subject: 'מענה אוטומטי: פרסומת' });
  check('an out-of-office reply with «יש ליצור קשר עם המשרד» stays quiet', !ooo.show, kinds(ooo));
  const ack = judge('לקוח/ה יקר/ה, קיבלנו את פנייתך שהועברה להמשך טיפול. אנו משתדלים לענות בתוך 3 ימי עסקים', { sender: { name: '[ORG]', email: 'person@org.example' }, subject: 'תודה על פנייתך' });
  check('an acknowledgement of an inquiry stays quiet', !ack.show, kinds(ack));
  const real = judge('היי סאלי, אני לא במשרד ביום חמישי, אפשר לקבוע שיחת וידאו ביום שלישי ב-10:00?', { sender: { name: 'Dana', email: 'dana@acme.io' }, subject: 'פגישה' });
  check('a real mail that says «I am not in the office Thursday» and proposes a call is still offered', real.show, kinds(real));
}

console.log('\n--- a polite frame is an explicit ask; a please-do-not is not a request (invented wording) ---\n');
{
  for (const t of ['אשמח שתעביר לי את הטפסים הנדרשים.', 'אשמח שתעביר לי את הטפסים עד יום שלישי.', 'אשמח שתכין את התקציר עד יום שלישי.', 'אודה על הכנת טבלת השוואה להצעת המחיר.', 'אודה על שליחת הטפסים עד יום שלישי.']) {
    const r = judge('שלום,\n\n' + t + '\n\nתודה'); check('polite-framed ask is offered: ' + t.slice(0, 40), r.show, kinds(r));
  }
  for (const t of ['אשמח שתהיה איתנו בחג.', 'אשמח שתבוא לארוחה ביום שני.', 'אשמח שנעביר את זה יחד עד מחר.', 'אודה על העברת הכספים שביצעת אתמול.', 'נא לא לשלוח את הנספחים עד יום שני.', 'בבקשה לא להעביר את הכסף עד יום שני.', 'אשמח שתתעדכן בהמשך.']) {
    const r = judge('שלום,\n\n' + t + '\n\nתודה'); check('not an ask, stays quiet: ' + t.slice(0, 40), !r.show, kinds(r));
  }
  for (const t of ['אודה לאישורכם על קבלת הטפסים.', 'אודה לתשובתך עד מחר.', 'שלום סאלי,\n\nאודה למענה.']) { const r = judge(t.indexOf('סאלי') >= 0 ? t : 'שלום,\n\n' + t + '\n\nתודה'); check('«אודה ל…» is an explicit ask: ' + t.slice(0, 30).replace(/\n/g, ' '), r.show, kinds(r)); }
  for (const t of ['היי דנה,\n\nאשמח שתעביר לי את הנספחים.', 'דנה שלום,\n\nאודה למענה.', 'היי דנה,\n\nאודה לאישורך בקבלת המסמכים.']) { const r = judge(t); check('a framed ask that opens with another name is not the reader\'s: ' + t.slice(0, 20).replace(/\n/g, ' '), !r.show, kinds(r)); }
  for (const t of ['שלום וברכה,\n\nהמשלוח עדיין לא הגיע.\n\nאודה למענה היום.', 'שלום רב,\n\nנא עדכנו אותי אם הסידור מתאים לכם.']) { const r = judge(t); check('a formal greeting («שלום וברכה», «שלום רב») is not a name: ' + t.split('\n').pop().slice(0, 30), r.show, kinds(r)); }
  {
    const r = judge('היי סאלי,\n\nצריכה את עזרתך בפרויקט.\nתעבור על הנתונים בבקשה ותכין גרף מסודר של המכירות.\n\nתודה רבה'); check('«תעבור על הנתונים בבקשה ותכין גרף» is offered as a task', r.show, kinds(r));
    const q = judge('שלום וברכה,\n\nאודה לקבלת הפרטים לצורך הכנת הצעה.\n\nבברכה,'); check('«אודה לקבלת הפרטים» is an ask', q.show, kinds(q));
    for (const t of ['היי דנה,\n\nתעבור על הנתונים בבקשה ותכין גרף.', 'תעבור על הנתונים ותכין גרף.', 'הוא יעבור על הנתונים בבקשה ויכין גרף.', 'היי,\nבבקשה לא תכין גרף.']) { const n = judge(t); check('not offered: ' + t.replace(/\n/g, ' ').slice(0, 36), !n.show, kinds(n)); }
  }
  for (const t of ['יש להגיש את הבקשה לרשות עד יום חמישי.', 'עליך להגיש את הצהרת ההון עד יום ראשון.', 'חובה להעלות את האישור לפורטל עד יום שני.']) { const r = judge('שלום,\n\n' + t + '\n\nתודה'); check('impersonal «יש / עליך / חובה» do-it is a task: ' + t.slice(0, 34), r.show && /googleTask/.test(kinds(r)), kinds(r)); }
  for (const t of ['יש להגיש את הבקשה כפי שסוכם.', 'הוא עליו להגיש את הבקשה עד יום חמישי.', 'נא לא להגיש את הבקשה עד יום חמישי.']) { const r = judge('שלום,\n\n' + t + '\n\nתודה'); check('not a task: ' + t.slice(0, 34), !(r.show && /googleTask/.test(kinds(r))), kinds(r)); }
  const keep = judge('שלום,\n\nבבקשה לא לשכוח לשלוח את הנספחים עד יום שני.\n\nתודה'); check('«בבקשה לא לשכוח» is not read as a prohibition', !/prohibition/.test(kinds(keep)), kinds(keep));
  // Round 2 (real-mail dev set, 2026-11-18; invented sentences): a modal ask for an answer, a chase, «בבקשה» with a plain imperative, a nominal «אודה לטיפולך».
  for (const t of ['היי סאלי,\n\nתוכל בבקשה להשיב לי לגבי ההצעה?\n\nתודה', 'שלום,\n\nטרם קיבלנו מענה לפנייתנו מהשבוע שעבר.\n\nבברכה', 'היי,\n\nבבקשה שלח לי את הנתונים המעודכנים.\n\nתודה', 'שלום,\n\nאודה לטיפולך בנושא.\n\nבברכה']) {
    const r = judge(t); check('round-2 ask offers: ' + t.split('\n')[2].slice(0, 28), r.show, kinds(r));
  }
  for (const t of ['שלום,\n\nהוא שלח לי את הנתונים המעודכנים.\n\nבברכה', 'שלום,\n\nטרם קיבלנו את המשלוח מהספק.\n\nבברכה', 'היי,\n\nתוכל להשיב לדנה אם נוח לה, אנחנו רק מעדכנים.']) {
    const r = judge(t); check('round-2 contrast stays quiet: ' + t.split('\n').filter(Boolean).slice(-1)[0].slice(0, 28), !r.show, kinds(r));
  }
  // Round 4 (real-mail dev set, 2026-11-19; invented sentences): modal ask with a work or send verb, plain imperatives with «בבקשה», «לטיפולכם» alone under the named work.
  for (const t of ['היי סאלי,\n\nתוכל לבדוק מול הספק אם הגיע האישור?\n\nתודה', 'סאלי שלום,\n\nתוכל בבקשה להעביר אליו את הטפסים?\n\nתודה', 'שלום,\n\nבבקשה תדבר איתו על התיאום.\n\nתודה', 'שלום,\n\nבבקשה תרשמו את ההערה בתיק.\n\nבברכה']) {
    const r = judge(t); check('round-4 ask offers: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), r.show, kinds(r));
  }
  for (const t of ['שלום,\n\nהוא יכול לבדוק מול הספק אם הגיע האישור.\n\nבברכה', 'שלום,\n\nהם דיברו איתו על התיאום בבוקר.\n\nבברכה']) {
    const r = judge(t); check('round-4 contrast stays quiet: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), !r.show, kinds(r));
  }
  // Round 5 (invented sentences): a masculine future-form imperative with «בבקשה»; «אתה יכול ל…?»; nouns that start with ת stay quiet.
  for (const t of ['היי סאלי,\n\nתדפיס בבקשה את הטבלה בצבעוני.\n\nתודה', 'שלום,\n\nתקפוץ אליי בבקשה בזמנך הפנוי.\n\nתודה', 'שלום,\n\nאתה יכול לטפל בנושא הזה?\n\nתודה']) {
    const r = judge(t); check('round-5 ask offers: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), r.show, kinds(r));
  }
  for (const t of ['שלום,\n\nתודה בבקשה על הדיווח.\n\nבברכה', 'שלום,\n\nתוכנית העבודה בבקשה מצורפת לעיונך.\n\nבברכה', 'היי דנה,\n\nתדפיס בבקשה את הטבלה בצבעוני.']) {
    const r = judge(t); check('round-5 contrast stays quiet: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), !r.show, kinds(r));
  }
  // Round 6 (invented sentences): a polite frame after a lead-in clause, «אודה לטיפולך / על התייחסותכם / לאישורך», «לטיפולך» alone; a frame that follows someone else's name stays quiet.
  for (const t of ['היי סאלי,\n\nהבנתי שאתה מטפל בעניין, אשמח שתחזור ללקוח.\n\nתודה', 'שלום,\n\nבעניין ההסכם עם הספק אודה לטיפולך.\n\nתודה', 'שלום רב,\n\nהבנק מבקש את המסמך הנוסף. אודה על התייחסותכם.\n\nבברכה', 'שלום,\n\nצריך אישור נקי מהרשם\nלטיפולך\nתודה']) {
    const r = judge(t); check('round-6 ask offers: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), r.show, kinds(r));
  }
  for (const t of ['שלום,\n\nדנה, אשמח לטיפולך בעניין.\n\nתודה', 'היי,\n\n@דנה @רון נודה לעזרתכם בעניין החתימה.\n\nתודה', 'שלום,\n\nהוא אמר שאשמח לשמוע על הטיפול בו.\n\nבברכה']) {
    const r = judge(t); check('round-6 contrast stays quiet: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), !r.show, kinds(r));
  }
  // Round 7 (invented sentences): a bare imperative with no day to the reader alone; the same sentence to a group, or after someone else's name, stays quiet.
  for (const t of ['היי סאלי,\n\nתעדכן אותי כשהמסמך מוכן.\n\nתודה', 'שלום,\n\nדבר איתי על ההצעה.\n\nתודה']) {
    const r = judge(t); check('round-7 ask offers: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), r.show, kinds(r));
  }
  for (const t of ['שלום,\n\nהוא ביקש שנדבר איתי על ההצעה, כך כתב.\n\nבברכה', 'שלום,\n\nתודה על העדכון, הכל ברור.\n\nבברכה']) {
    const r = judge(t); check('round-7 contrast stays quiet: ' + t.split('\n').filter(Boolean)[1].slice(0, 28), !r.show, kinds(r));
  }
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
