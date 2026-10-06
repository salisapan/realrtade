'use strict';
// An ask that gets someone else to act is not a file this person can attach.
// "Can you ask accounting to send me the invoice?" with one Drive hit must not
// prepare. "Please send me the invoice" / "שלח לי את החשבונית" still prepares.
// Nothing is sent. Run: node test/third-party-ask-corpus.cjs
const { FlowCloseChains: C } = require('../core/close-chains.js');
const { FlowFileAttach: A } = require('../core/file-attach.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = Date.parse('2026-10-05T09:00:00Z');

function ev(files) {
  return {
    driveScope: 'account',
    connected: { drive: true, thread: true, gmail: false, outlook: false, docs: false, sheets: false, calendar: false },
    driveFiles: files,
    threadFiles: []
  };
}
function go(text, files) {
  return C.resolve({ text, origin: 'gmail', now: NOW, evidence: ev(files) });
}
function pdf(id, name) { return { id, name, mimeType: 'application/pdf' }; }

const invoice = [pdf('f1', 'Invoice 204.pdf')];
const contract = [pdf('c1', 'Contract.pdf')];
const quote = [pdf('q1', 'Quote.pdf')];
const signed = [pdf('s1', 'Signed form.pdf')];

const THIRD = [
  ['EN ask accounting', 'Can you ask accounting to send me the invoice?', invoice],
  ['EN have Dana send', 'Have Dana send the contract', contract],
  ['EN get Noa to send', 'Get Noa to send the quote', quote],
  ['EN ask the team', 'Please ask the team to forward the signed form.', signed],
  ['HE ask accounting', 'תבקש מחשבונאות לשלוח לי את החשבונית', invoice],
  ['HE tell Dana', 'תגיד לדנה שתשלח את החוזה', contract],
  ['HE Dana will send', 'שדנה ישלח את החשבונית', invoice],
  ['HE he will send', 'שישלח לי את החשבונית', invoice]
];

console.log('--- someone else must act: no file prepare ---');
THIRD.forEach(([name, text, files]) => {
  const gated = A.gate(text);
  const mentioned = A.mention(text);
  const r = go(text, files);
  check(name + ' gate is not a clear file ask', gated.kind !== 'clear' && gated.reason === 'third-party', gated);
  check(name + ' is not a file mention', mentioned == null, mentioned);
  check(name + ' does not prepare', r.move === 'silence' && r.reason === 'third-party' && r.show === false && r.hit == null, r);
  check(name + ' does not close and does not send', r.close === false && r.sends === false && r.creates === false, r);
});

const watching = go('Can you ask accounting to send me the invoice?', invoice);
const watched = C.resolve({
  text: 'Can you ask accounting to send me the invoice?',
  origin: 'gmail',
  now: NOW,
  evidence: ev(invoice),
  watching: {
    requirement: {
      kind: 'file', lang: 'en', label: 'invoice', object: 'invoice', synonym: ['invoice'],
      ask: { id: 'invoice', creatable: false, lang: 'en', label: 'invoice', query: 'invoice', synonym: ['invoice'] }
    }
  }
});
check('a watched file requirement still does not prepare a third-party ask', watched.move !== 'prepare' && watched.close === false && watched.sends === false && watched.reason === 'third-party', watched);
check('the unwatched case was already silence', watching.reason === 'third-party', watching.reason);

console.log('--- direct asks still prepare ---');
const GUARDS = [
  ['EN send me', 'Please send me the invoice.', invoice, 'invoice'],
  ['EN can you send me', 'Can you send me the invoice?', invoice, 'invoice'],
  ['EN ask you to send', 'Can you ask you to send the invoice?', invoice, 'invoice'],
  ['EN send me after a greeting', 'Have a great weekend, and send me the invoice when you can.', invoice, 'invoice'],
  ['HE send me', 'שלח לי את החשבונית', invoice, 'invoice'],
  ['HE feminine send me', 'תשלח לי את החשבונית', invoice, 'invoice'],
  ['HE that you send', 'שתשלח לי את החשבונית', invoice, 'invoice']
];
GUARDS.forEach(([name, text, files, objectId]) => {
  const gated = A.gate(text);
  const r = go(text, files);
  check(name + ' is not a third-party ask', A.asksThirdParty(text) === false, text);
  check(name + ' gate stays clear', gated.kind === 'clear' && gated.ask && gated.ask.id === objectId, gated);
  check(name + ' still prepares and does not close or send', r.move === 'prepare' && r.reason === 'found' && r.close === false && r.sends === false && r.show === true, r);
});

console.log('--- nearby sentences that are not "get someone else to send" ---');
[
  'Could you get me the invoice?',
  'Please get the invoice to me.',
  'Could you check with your finance team and get back to me with the PO number by Thursday?',
  'Have a great weekend, and send me the invoice when you can.',
  'תגיד לי את מספר החשבונית'
].forEach((text) => {
  check('not third-party: ' + text, A.asksThirdParty(text) === false, text);
});
const getMe = go('Could you get me the invoice?', invoice);
check('get me the invoice is not blocked as third-party', getMe.reason !== 'third-party' && getMe.sends === false, getMe);
const deliver = go('Please get the invoice to me.', invoice);
check('get the invoice to me is not blocked as third-party', deliver.reason !== 'third-party' && deliver.sends === false && A.asksThirdParty('Please get the invoice to me.') === false, deliver);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
