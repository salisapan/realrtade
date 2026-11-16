// «Ask Glance» (core/loop-answer.js, aiAskV1, M7): questions about the person's own loops, answered only from those loops, each line cited;
// a question it cannot place is refused. The set below is hand-written questions (EN + HE) over one fixed set of loops, with the right
// loop ids as gold. It measures the reader, not a model and not real people's questions.
// Run: node test/loop-answer-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const sb = { module: undefined, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'loop-answer.js'), 'utf8'), sb, { filename: 'loop-answer.js' });
const A = vm.runInContext('FlowLoopAnswer', sb);
const ON = { aiAskV1: true };
const TODAY = '2026-10-07'; // a Wednesday; the week runs to Saturday 10 October
const CTX = { today: TODAY, now: Date.parse('2026-10-07T09:00:00') };

const L = (id, over) => Object.assign({ id, threadId: 't-' + id, channel: 'gmail', messageId: 'm-' + id, status: 'waiting', createdAt: 1 }, over);
const LOOPS = [
  L('lease', { direction: 'mine', counterpart: { name: 'Dana Cohen', email: 'dana.cohen@acme.co.il' }, what: 'Send the signed lease', subject: 'Lease', deadlineIso: '2026-10-09' }),
  L('deck', { direction: 'theirs', counterpart: { name: 'Dana Cohen', email: 'dana.cohen@acme.co.il' }, what: 'The Q3 deck', subject: 'Deck', promisedIso: '2026-10-12', stage: 'promised' }),
  L('inv', { direction: 'theirs', kind: 'payment', amount: { value: 4200, currency: 'ILS', raw: '4,200 ₪' }, counterpart: { name: 'Avi Levi', email: 'avi@levi.co.il' }, what: 'Payment of invoice 118', subject: 'Invoice 118', deadlineIso: '2026-10-01' }),
  L('quote', { direction: 'mine', counterpart: { name: 'Avi Levi', email: 'avi@levi.co.il' }, what: 'Send the renovation quote', subject: 'Quote', deadlineIso: '2026-10-07' }),
  L('permit', { direction: 'theirs', counterpart: { name: 'Noa Bar', email: 'noa@city.gov.il' }, what: 'Approve the parking permit', subject: 'Parking permit', deadlineIso: '2026-10-08' }),
  L('photos', { direction: 'theirs', counterpart: { name: 'Yossi', email: 'yossi@gmail.com' }, what: 'The wedding photos', subject: 'Photos' }),
  L('contract', { direction: 'theirs', counterpart: { name: 'Dana Cohen', email: 'dana.cohen@acme.co.il' }, what: 'The signed contract', subject: 'Contract', status: 'resolved', closedAs: 'replied', resolvedAt: Date.parse('2026-10-05T10:00:00Z') }),
  L('hebrew', { direction: 'mine', counterpart: { name: 'רונית', email: 'ronit@shop.co.il' }, what: 'לשלוח את הצעת המחיר', subject: 'הצעת מחיר', deadlineIso: '2026-10-08' }),
  L('keys', { direction: 'theirs', counterpart: { name: 'שי כהן', email: 'shai@gmail.com' }, what: 'להחזיר את המפתחות', subject: 'מפתחות' }),
  L('stopped', { direction: 'theirs', status: 'stopped', counterpart: { name: 'Gil', email: 'gil@x.com' }, what: 'Old thing' })
];
const ids = (r) => (r.items || []).map((x) => x.id).sort().join(',');

// Gold: the loops each question must return, in any order. '' = an answer with nothing in it ("nothing open that fits").
const SET = [
  ['What do I owe Dana?', 'lease'],
  ['What is Dana waiting for from me?', 'lease'],
  ['What does Dana owe me?', 'deck'],
  ['Who owes me money?', 'inv'],
  ['What am I waiting on?', 'deck,inv,keys,permit,photos'],
  ['What do I owe?', 'hebrew,lease,quote'],
  ["What's overdue?", 'inv'],
  ['What is due today?', 'quote'],
  ['Anything due tomorrow?', 'hebrew,permit'],
  ["What's open this week?", 'hebrew,lease,permit,quote'],
  ['Did Dana answer about the contract?', 'contract'],
  ['What did Avi promise?', 'inv'],
  ['What do I owe Avi?', 'quote'],
  ['Am I waiting on Yossi?', 'photos'],
  ['What do I owe Yossi?', ''],
  ['Who hasn\'t paid?', 'inv'],
  ['What did Dana promise about the deck?', 'deck'],
  ['מי חייב לי כסף?', 'inv'],
  ['על מה אני מחכה?', 'deck,inv,keys,permit,photos'],
  ['מה באיחור?', 'inv'],
  ['מה פתוח השבוע?', 'hebrew,lease,permit,quote'],
  ['מה אני חייב לרונית?', 'hebrew'],
  ['מה יש לי היום?', 'quote'],
  ['מה שי חייב לי?', 'keys'],
  // Second set, written after the first passed and run once before any fix: 15/22 then (2 of the 7 were this scorer's own gold, which
  // ignored the five-line cap). Kept here after the fixes.
  ['What should I send Avi?', 'quote'],
  ['Has Avi paid?', 'inv'],
  ['Who am I waiting for?', 'deck,inv,keys,permit,photos'],
  ['What did I promise Dana?', 'lease'],
  ['Anything late?', 'inv'],
  ['Which payments are still open?', 'inv'],
  ['What does Noa need to do?', 'permit'],
  ['What do I have to do today?', 'quote'],
  ['Did Yossi send the photos?', 'photos'],
  ['what is still open with dana', 'deck,lease'],
  ['Who has not answered me?', 'deck,inv,keys,permit,photos'],
  ['מה עליי השבוע?', 'hebrew,lease,quote'],
  ['מה רונית מחכה ממני?', 'hebrew'],
  ['האם שי החזיר את המפתחות?', 'keys'],
  ['מה נשאר פתוח?', 'hebrew,inv,lease,permit,quote'],
  ['מי עוד לא שילם?', 'inv'],
  ['מה צריך לעשות מחר?', 'hebrew,permit'],
  // Third set, run once before any fix: 11/16 with 6 lines outside the gold (5 from one defect: \b does not see Hebrew letters in a
  // JavaScript regex, so "מי מחכה לי" read as "who am I waiting for"). Kept here after the fixes.
  ['Do I owe anyone anything?', 'hebrew,lease,quote'],
  ['What is Avi supposed to pay me?', 'inv'],
  ['Is the parking permit done?', 'permit'],
  ['Has Dana sent the deck yet?', 'deck'],
  ['Show me everything overdue', 'inv'],
  ['What am I late on?', ''],
  ['Any open money stuff?', 'inv'],
  ['What did Noa promise?', 'permit'],
  ['Who do I owe a reply?', 'hebrew,lease,quote'],
  ['מה אני צריך לשלוח השבוע?', 'hebrew,lease,quote'],
  ['מה דחוף היום?', 'quote'],
  ['מי מחכה לי?', 'hebrew,lease,quote'],
  ['על מה אני מחכה משי?', 'keys']
];
const REFUSE = [
  'What is the weather tomorrow in Tel Aviv?',
  'Write me a poem',
  'What does Moshe owe me?',
  'Did Dana answer about the mortgage?',
  'What do I owe on the mortgage?',
  'מה מזג האוויר?',
  'Book me a flight to Rome',
  'What is my password?',
  'Translate this to French',
  'כמה עולה טיסה לאילת?',
  'מה עם החשבונית של אבי?', // the same Latin-letter contact, asked in Hebrew
  'How much did I spend last month?',
  'Remind me to call mom',
  'מתי יום ההולדת של דנה?',
  'מה אבי חייב לי?', // a Hebrew name for a contact written in Latin letters is not matched: refused, not guessed
  ''
];

console.log('\n--- questions with a right answer ---\n');
let right = 0, wrongItems = 0;
for (const [q, gold] of SET) {
  const r = A.answer(ON, q, LOOPS, CTX);
  const got = ids(r);
  const g = gold ? gold.split(',') : [];
  wrongItems += (r.items || []).filter((x) => !g.includes(x.id)).length;
  if (!r.refused && got === gold) right++;
  check(q + ' -> ' + (gold || 'nothing open'), !r.refused && got === gold, { got, refused: r.refused, reason: r.reason, text: r.text });
}
console.log('\n--- questions it must refuse ---\n');
let refused = 0;
for (const q of REFUSE) {
  const r = A.answer(ON, q, LOOPS, CTX);
  if (r.refused) refused++;
  check('refused: "' + q + '"', r.refused === true && r.items.length === 0, { ids: ids(r), reason: r.reason });
}
console.log(`\n  right answers ${right}/${SET.length}; lines that are not in the gold ${wrongItems}; refusals ${refused}/${REFUSE.length}`);
check('no line outside the gold anywhere', wrongItems === 0, wrongItems);

console.log('\n--- every line is cited, and only from the loops ---\n');
{
  const r = A.answer(ON, 'What am I waiting on?', LOOPS, CTX);
  check('each line cites its loop (thread and message)', r.items.every((x) => x.cite.id === x.id && x.cite.threadId === 't-' + x.id && x.cite.messageId === 'm-' + x.id), r.items);
  const inv = r.items.find((x) => x.id === 'inv');
  check('the line is built from the loop itself: who, what, and that it is late', inv && /Avi owes you: Payment of invoice 118 \(overdue since 2026-10-01\)/.test(inv.line), inv && inv.line);
  const he = A.answer(ON, 'מה אני חייב לרונית?', LOOPS, CTX);
  check('Hebrew answers in Hebrew', he.lang === 'he' && /חייב\/ת ל/.test(he.text), he.text);
  const closed = A.answer(ON, 'Did Dana answer about the contract?', LOOPS, CTX);
  check('a closed loop says it closed, and when', /^Closed: Dana, The signed contract \(2026-10-05\)$/.test(closed.text), closed.text);
  const none = A.answer(ON, 'What do I owe Yossi?', LOOPS, CTX);
  check('nothing open with a known person says so, by name', none.text === 'Nothing open that fits with Yossi.', none.text);
  check('a stopped loop is never an answer', !JSON.stringify(A.answer(ON, 'What am I waiting on?', LOOPS, CTX)).includes('stopped'));
  const many = Array.from({ length: 8 }, (_, i) => L('x' + i, { direction: 'theirs', counterpart: { name: 'P' + i }, what: 'Thing ' + i }));
  const m = A.answer(ON, 'What am I waiting on?', many, CTX);
  check('at most five lines, then "and N more"', m.items.length === 5 && m.more === 3 && /and 3 more\.$/.test(m.text), { n: m.items.length, more: m.more });
}

console.log('\n--- a model may read the question, never write the answer ---\n');
{
  const q = 'Hmm, the Levi guy — anything from him I should chase?';
  const dev = A.answer(ON, q, LOOPS, CTX);
  const withModel = A.answer(ON, q, LOOPS, Object.assign({}, CTX, { deps: { parse: () => ({ ask: 'owed', person: 'Avi Levi' }) } }));
  check('a question the device cannot place: refused without a model', dev.refused === true, dev.reason);
  check('...with a model reading, answered from the loops and marked as the model\'s reading', !withModel.refused && ids(withModel) === 'inv' && withModel.source === 'model', { ids: ids(withModel), src: withModel.source });
  const ghost = A.answer(ON, q, LOOPS, Object.assign({}, CTX, { deps: { parse: () => ({ ask: 'owed', person: 'Moshe' }) } }));
  check('a model naming a person no loop knows: refused', ghost.refused === true, ghost.reason);
  const junk = A.answer(ON, q, LOOPS, Object.assign({}, CTX, { deps: { parse: () => ({ ask: 'delete-everything' }) } }));
  check('a model reading outside the enums: refused', junk.refused === true);
  const thrower = A.answer(ON, q, LOOPS, Object.assign({}, CTX, { deps: { parse: () => { throw new Error('x'); } } }));
  check('a model that throws: refused, never a crash', thrower.refused === true);
  const lies = A.answer(ON, q, LOOPS, Object.assign({}, CTX, { deps: { parse: () => ({ ask: 'owed', person: 'Avi', items: [{ id: 'made-up', line: 'Avi owes you 1,000,000' }], text: 'Avi owes you a million' }) } }));
  check('whatever else the model returns is ignored: the lines come from the loops', ids(lies) === 'inv' && !/million/.test(lies.text), lies.text);
}

console.log('\n--- the switch ---\n');
check('off by default: nothing runs', A.SWITCH === 'aiAskV1' && A.DEFAULTS.aiAskV1 === false && A.answer({}, 'What do I owe Dana?', LOOPS, CTX).used === false);

console.log('\n--- portability ---\n');
const src = fs.readFileSync(path.join(__dirname, '../core/loop-answer.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
