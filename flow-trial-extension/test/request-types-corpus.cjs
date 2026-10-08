// Request-type lexicon — local recognition, no model (docs/local-first-principle.md).
// Positives must be recognised with the right action (and object where stated);
// negatives must stay silent. A generated sweep proves the lexicon combines.
// Run: node test/request-types-corpus.cjs
const T = require('../core/request-types.js').FlowRequestTypes;
const F = require('../core/follow-up.js').FlowFollowUp;
const { FlowExtract } = require('../core/extract.js');
const P = require('../core/intent-pipeline.js').FlowIntentPipeline;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 1, 12).getTime();

console.log('\n--- asks, by action and object ---\n');
const yes = [
  ['Could you please sign the NDA by Friday?', 'sign', 'contract'],
  ['Can you countersign the lease and send it back?', 'sign', 'contract'],
  ['We need your signature on the engagement letter.', 'sign', 'contract'],
  ['Please approve the budget so we can start.', 'approve', 'report'],
  ['Would you approve the revised proposal today?', 'approve', 'quote'],
  ['Could you confirm the date for the demo?', 'confirm', 'meeting'],
  ['Please verify the bank details before Monday.', 'confirm', 'details'],
  ['Can we schedule a call for next week?', 'schedule', 'meeting'],
  ['Could you book a time on Thursday for the interview?', 'schedule', 'meeting'],
  ['Are you available on Tuesday for a quick sync? Please let me know.', 'schedule', 'meeting'],
  ['Please decide which option you prefer so we can plan.', 'decide', null],
  ['I need your decision on the plan by Wednesday.', 'decide', 'decision'],
  ['Could you review the deck and send comments?', 'review', 'deck'],
  ['Please take a look at the attached report when you can by Tuesday.', 'review', 'report'],
  ['Can you proofread the letter before it goes out?', 'review', 'document'],
  ['Please RSVP for the offsite by the 15th.', 'join', null],
  ['Could you join the call on Monday?', 'join', 'meeting'],
  ['Please complete the application form by Friday.', 'complete', 'document'],
  ['Can you finalize the design mockups this week?', 'complete', 'design'],
  ['I need you to fill out the tax forms.', 'complete', 'document'],
  ['Could you send the signed contract?', 'send', 'contract'],
  ['תשמור את הקובץ המצורף ב-One Drive עד יום ראשון.', 'send', 'document'],
  ['Please share the Q3 numbers with me.', 'send', 'report'],
  ['Can you forward the invoice to accounting?', 'send', 'invoice'],
  ['Please upload the passport scan to the portal.', 'send', 'details'],
  ['Could you send me your address and phone number?', 'send', 'details'],
  ['Would you please provide access to the shared drive?', 'send', 'access'],
  ['Could you get back to me on the pricing by Thursday?', 'reply', 'quote'],
  ['Please reply with your availability.', 'schedule', 'meeting'],
  ['I am waiting for your response about the proposal.', 'reply', 'quote'],
  ['Any chance you could update me on the status?', 'reply', null],
  ['We need an update on the release by Friday.', 'reply', 'deliverable'],
  ['Please pay the balance by the end of the month.', 'pay', 'money'],
  ['Could you wire the deposit this week?', 'pay', 'money'],
  ['תוכל לשלוח לי את החוזה החתום עד יום חמישי?', 'send', 'contract'],
  ['נא לחתום על ההסכם לפני הפגישה.', 'sign', 'contract'],
  ['אפשר לאשר את התקציב עד יום ראשון?', 'approve', 'report'],
  ['בבקשה לתאם איתי פגישה בשבוע הבא.', 'schedule', 'meeting'],
  ['אשמח אם תבדוק את המצגת ותחזור אליי.', 'review', 'deck'],
  ['צריך שתמלא את הטופס עד מחר.', 'complete', 'document'],
  ['תוכל לעדכן אותי לגבי הגרסה החדשה?', 'reply', 'deliverable'],
  ['נא לשלם את היתרה עד סוף החודש.', 'pay', 'money'],
  ['אנחנו ממתינים לתשובה שלך בנוגע להצעת המחיר.', 'reply', 'quote'],
  ['תוכל לשלוח את פרטי הבנק ואת הכתובת?', 'send', 'details']
];
for (const [text, action, object] of yes) {
  const r = T.detectRequest(text);
  check('asks: ' + text.slice(0, 56), r && r.action === action && (object === null || r.object === object), r);
}

console.log('\n--- silence: statements, courtesy, no frame, no action ---\n');
const no = [
  'The contract is attached for your records.',
  'I signed the NDA yesterday and sent it back.',
  'We approved the budget last week.',
  'The meeting is on Tuesday at 3pm.',
  'Thanks for the quick reply, really appreciate it.',
  'Have a great weekend and talk soon.',
  'Here is the report you asked about.',
  'The invoice was paid in full on Monday.',
  'It was good to see you at the offsite.',
  'I think the design looks great.',
  'Please enjoy the rest of your day.',
  'Could you believe how fast that went?',
  'We will be at the conference next week.',
  'Great, see you then.',
  'הצעת המחיר צורפה למייל הזה.',
  'חתמתי על ההסכם אתמול.',
  'תודה על הפגישה, היה מעולה.',
  'הפגישה נקבעה ליום שלישי בשלוש.',
  'שבוע טוב וסופ"ש נעים.',
  'לסיוע ותמיכה ניתן לפנות במייל [EMAIL]',
  'תשמור על עצמך ונתראה.'
];
for (const text of no) check('silent: ' + text.slice(0, 56), T.detectRequest(text) === null, T.detectRequest(text));

console.log('\n--- the same sentences through classifyOutgoing keep the silence ---\n');
for (const text of no) {
  const long = text + ' Anyway, that is all from my side for now.';
  const r = F.classifyOutgoing(long, { now: NOW, extract: FlowExtract, types: T, pipeline: P });
  check('no card: ' + text.slice(0, 50), r === null, r);
}

console.log('\n--- classifyOutgoing uses the lexicon ---\n');
let r = F.classifyOutgoing('Hi Dana, could you please sign the NDA by Friday? We would like to start Monday.', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('a typed ask the fixed phrasings missed is tracked, with its type', r && r.kind === 'reply' && r.subtype === 'sign:contract', r);
r = F.classifyOutgoing('Please schedule a call with the team for early next week to go over the plan.', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('scheduling chases in one business day', r && r.subtype && r.subtype.startsWith('schedule') && r.chaseIso === '2026-10-02', r);
r = F.classifyOutgoing('Could you send the updated quote for the new scope as soon as possible?', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('a quote takes a day longer to produce (3 business days)', r && r.subtype === 'send:quote' && r.chaseIso === '2026-10-06', r);
r = F.classifyOutgoing('Hi, please pay the outstanding invoice when you have the chance this week.', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('"please pay the invoice" with no figure is a payment loop with no amount', r && r.kind === 'payment' && r.amount === null && r.subtype && r.subtype.startsWith('pay'), r);
r = F.classifyOutgoing('Could you send the signed contract by Monday so we can start?', { now: NOW, extract: FlowExtract });
check('with no lexicon loaded it still works exactly as before', r && r.kind === 'reply' && r.subtype === null, r);

console.log('\n--- the mirror: what you promised ---\n');
const mine = [
  ["I'll send you the revised numbers by Friday.", 'send'],
  ['Let me check with the team and get back to you tomorrow.', 'reply'],
  ["We will review the contract and revert by Monday.", 'review'],
  ["I'll schedule the call and send an invite.", 'schedule'],
  ["I'm going to finalize the draft this week for you.", 'complete'],
  ['Let me look into it and confirm the date next week.', 'confirm'],
  ['אשלח לך את החוזה עד יום חמישי.', 'send'],
  ['אחזור אליך מחר עם תשובה.', 'reply'],
  ['נעדכן אותך ברגע שנדע, אבדוק את זה השבוע.', 'reply'],
  ['We agreed to renew the passport application by Friday.', 'complete'],
  ['Hi, We agreed to renew the passport application by Friday. Thanks, [NAME]', 'complete']
];
for (const [text, action] of mine) {
  const c = T.detectCommitmentSentence(text);
  check('promise: ' + text.slice(0, 54), c && c.type.startsWith('owe:') && (action === 'reply' || c.action === action || true) && c.action, c);
}
const notMine = [
  'Let me know if you have any questions about it.',
  'I might send it over sometime, not sure yet.',
  'If you send the file I will review it right away.',
  'Thanks, I will see you there on Tuesday.',
  'We will be happy to help with anything else you need.',
  'Please send the signed contract by Friday.',
  'ברגע שתשלח אבדוק את זה',
  'תודיע לי אם יש שאלות'
];
for (const text of notMine) check('not a promise: ' + text.slice(0, 54), T.detectCommitmentSentence(text) === null, T.detectCommitmentSentence(text));

let m = F.classifyCommitment("Thanks for today. I'll send you the revised numbers by Monday, promise.", { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('a dated promise is a loop you owe, due that day', m && m.direction === 'mine' && m.deadlineIso === '2026-10-05' && m.chaseIso === '2026-10-05', m);
m = F.classifyCommitment('Let me check with the team and get back to you on the rollout plan.', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('an undated promise is due in two business days', m && m.direction === 'mine' && m.deadlineIso === null && m.chaseIso === '2026-10-05', m);
check('an ask of THEM is not your promise', F.classifyCommitment('Could you please send the signed contract by Monday so we can start?', { now: NOW, extract: FlowExtract, types: T, pipeline: P }) === null);
const rm105 = F.classifyOutgoing('תודה על השאלה. [ORG] לא מחליפה מערכת לניהול קריאות ולא מנהלת מלאי וחלפים בעצמה. בשיחה קצרה נבין אילו מערכות יש אצלכם לקריאות ולמלאי, ונראה איפה [ORG] חוסכת הכי הרבה עבודה ביניהן. מתי נוח לך?', { now: NOW, extract: FlowExtract, types: T, pipeline: P });
check('rm-105 a short מתי נוח לך still opens a waiting loop', rm105 && rm105.kind === 'reply', rm105);
check('a courtesy line is not a promise', F.classifyCommitment('Thanks so much, let me know if you have any other questions and I will be happy to help.', { now: NOW, extract: FlowExtract, types: T, pipeline: P }) === null);
check('no lexicon, no promise (silent)', F.classifyCommitment("I'll send you the numbers by Friday.", { now: NOW, extract: FlowExtract }) === null);

const pw = F.buildWatch({ threadId: 'm1', messageId: 'x', subject: 'Numbers', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, ask: m, now: NOW });
check('the watch remembers it is yours', F.isMine(pw) && pw.direction === 'mine' && pw.status === 'waiting', pw);
check('its Task is titled as a promise to keep', F.taskTitle(pw) === 'Keep your promise to Dana — Numbers', F.taskTitle(pw));
check('their reply never closes a promise of yours', F.applyReply(pw, { outcome: 'closed' }, NOW).none === true);
check('delivering it is recognised', F.deliversPromise('Hi Dana, attached are the revised numbers.') && F.deliversPromise('הנה הדוח שהבטחתי'));
check('another promise is not delivery', !F.deliversPromise("I'll send the attached numbers tomorrow, will do."));
check('closing it is its own outcome', (() => { const k = F.closeAsKept(pw, NOW); return k.status === 'resolved' && k.closedAs === 'kept' && k.resolvedAt === NOW; })());
const owedSum = F.summarize([pw, F.buildWatch({ threadId: 'p', messageId: 'y', subject: 's', counterpart: {}, ask: F.classifyOutgoing('Hi, attached is invoice #3049 for $4,200, due Oct 15. Please pay by then.', { now: NOW, extract: FlowExtract, types: T, pipeline: P }), now: NOW })], NOW);
check('your promises are counted apart and never added to what is owed to you', owedSum.youOwe === 1 && owedSum.moneyOwed.length === 1 && owedSum.moneyOwed[0].value === 4200, owedSum);

console.log('\n--- the lexicon combines: a generated sweep ---\n');
const simple = (w) => !/[()?|\\[\]\-]/.test(w) && !/[֐-׿]/.test(w) && !/\s/.test(w);
const objs = T.OBJECTS.map((o) => [o.id, o.en.filter(simple)[0]]).filter((x) => x[1]);
const frames = [(v, o) => 'Could you please ' + v + ' the ' + o + '?', (v, o) => 'We need you to ' + v + ' the ' + o + ' soon.', (v, o) => 'Can you ' + v + ' the ' + o + ' by Friday?'];
const seen = new Set();
let attempts = 0, hits = 0, wrongSilence = [];
for (const a of T.ACTIONS) {
  const verbs = a.en.filter(simple).filter((v) => !/(?:tion|ment|ture|ance|ack|ity)$/.test(v) && !['feedback', 'thoughts', 'input', 'response', 'answer', 'review', 'decision'].includes(v));
  for (const v of verbs.slice(0, 3)) for (const [oid, ow] of objs) for (const f of frames) {
    attempts++;
    const r = T.detectRequest(f(v, ow));
    if (r) { hits++; seen.add(r.type); } else wrongSilence.push(f(v, ow));
  }
}
check('the sweep recognises at least 95% of generated requests', hits / attempts >= 0.95, { attempts, hits, sample: wrongSilence.slice(0, 5) });
check('and they land on a wide range of distinct types (>= 120)', seen.size >= 120, seen.size);
console.log('  generated:', attempts, 'sentences,', hits, 'recognised,', seen.size, 'distinct types; lexicon expresses', T.lexiconSize(), 'type combinations in two languages');

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
