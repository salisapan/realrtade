'use strict';
// The same words, read as Gmail, as Outlook/Graph, and as a doc comment, must be the same words
// after the quote cut, and must get the same close-chain decision and the same incoming judgment.
// Gold labels are model-assigned and are not the expected answer here. The adapters have to agree
// with each other. Hebrew and English.
// Run: node test/source-parity-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowSourceText: S } = require('../core/source-text.js');
const { FlowCloseChains: C } = require('../core/close-chains.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const NOW = Date.parse('2026-10-05T09:00:00Z');
const gold = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/real-mail-gold.json'), 'utf8'));

const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'quiet-metrics.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const FlowIncomingJudge = vm.runInContext('FlowIncomingJudge', engine);

function wrapped(text) {
  const quote = 'Please send the contract tomorrow';
  return {
    gmail: S.normalize('gmail', text),
    outlook: S.normalize('outlook', text + '\n\nFrom: [NAME]\nSent: Monday, October 5, 2026\n' + quote),
    doc: S.normalize('doc', { text: text, quoted: quote })
  };
}

function chainOf(text, origin) {
  return C.resolve({
    text,
    origin,
    now: NOW,
    evidence: {
      driveScope: 'account',
      connected: { drive: true, thread: true, gmail: false, outlook: false, docs: false, sheets: false, calendar: false },
      driveFiles: [],
      threadFiles: []
    }
  });
}

function judgeOf(text, surface) {
  const r = FlowIncomingJudge.judge({
    text,
    subject: 'Re: the open loop',
    sender: { name: 'Dana', email: 'dana@example.com' },
    now: NOW,
    surface
  });
  return { show: r.show === true, type: r.intent && r.intent.type || null, reason: r.show ? null : r.reason };
}

const watch = { kind: 'reply', status: 'waiting', direction: 'theirs' };

function agree(id, parts) {
  const texts = [parts.gmail, parts.outlook, parts.doc];
  check(id + ' own text is the same on Gmail, Outlook and a doc comment', texts[0] === texts[1] && texts[1] === texts[2], texts);
  const chains = [
    chainOf(parts.gmail, 'gmail'),
    chainOf(parts.outlook, 'outlook'),
    chainOf(parts.doc, 'doc')
  ];
  const sig = (r) => [r.move, r.type, r.close ? r.close.reason : false, r.reason, r.sends, r.creates].join('|');
  check(id + ' close chain agrees and never sends', sig(chains[0]) === sig(chains[1]) && sig(chains[1]) === sig(chains[2]) && chains.every((r) => r.sends === false && r.creates === false && r.close === false || (r.close && r.close.reason)), chains.map(sig));
  ['gmail', 'outlook'].forEach((surface) => {
    const judged = texts.map((t) => judgeOf(t, surface));
    const key = (j) => [j.show, j.type, j.reason].join('|');
    check(id + ' incoming judge agrees on ' + surface, key(judged[0]) === key(judged[1]) && key(judged[1]) === key(judged[2]), judged.map(key));
  });
  const replies = texts.map((t) => F.classifyReply(t, watch, { now: NOW }).outcome);
  check(id + ' reply close agrees', replies[0] === replies[1] && replies[1] === replies[2], replies);
}

console.log('--- gold set, three sources, no label is required ---');
check('the gold set is the real-mail file', Array.isArray(gold.cases) && gold.cases.length >= 20, gold.cases && gold.cases.length);
gold.cases.forEach((c) => agree(c.id, wrapped(c.text)));

console.log('--- English and Hebrew asks, with a quoted history that must not win ---');
[
  ['en invoice', 'Please send the invoice by Thursday.'],
  ['en contract', 'Please send the contract.'],
  ['en quote', 'Please send the price quote.'],
  ['en signed form', 'Please send the signed form.'],
  ['en meeting', 'Can we meet Thursday at 10am?'],
  ['en fact', "What's the Q3 total in the budget sheet?"],
  ['en approval', 'Please approve the budget.'],
  ['en answer', 'Please confirm who will own the rollout.'],
  ['he invoice', 'בבקשה תשלח לי את החשבונית'],
  ['he contract', 'בבקשה תשלח את החוזה'],
  ['he quote', 'בבקשה תשלח את הצעת המחיר'],
  ['he signed', 'בבקשה תשלח טופס חתום'],
  ['he meeting', 'אפשר לקבוע פגישה ביום חמישי בשעה 10'],
  ['he fact', 'מה הסכום בגיליון התקציב'],
  ['he approval', 'נא לאשר את התקציב'],
  ['he answer', 'תעדכן מי מטפל בחשבון הזה'],
  ['he forward banner', "Please send the invoice\n\n---------- הודעה שהועברה ----------\nPlease ignore this quoted line"]
].forEach(([id, text]) => agree(id, wrapped(text)));

const banner = S.normalize('gmail', "בבקשה תשלח לי את החשבונית\n\n---------- הודעה שהועברה ----------\nבבקשה תשלח את החוזה");
check('the Hebrew forward banner cuts the quoted ask', banner.indexOf('חוזה') < 0 && banner.indexOf('חשבונית') >= 0, banner);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
