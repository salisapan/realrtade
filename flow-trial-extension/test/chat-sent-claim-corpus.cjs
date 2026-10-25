// core/chat-sent-claim.js: the other side says they sent what was asked for ("I just sent you the signed contract", «שלחתי לך את החוזה החתום»).
// Reads the claim and the words that name the thing, and which "Waiting on ..." task those words fit. A promise to send later, a denial, a
// question, a condition, somebody else's sending and a payment stay quiet. Nothing here closes anything. Run: node test/chat-sent-claim-corpus.cjs
'use strict';
const { FlowChatSentClaim: C } = require('../core/chat-sent-claim.js');
const { FlowChatPaymentClaim: P } = require('../core/chat-payment-claim.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('\n--- a document sent ---\n');
const YES = [
  ['I just sent you the signed contract', ['signed', 'contract']],
  ['Just sent the signed contract', ['signed', 'contract']],
  ["I've sent the updated quote and the invoice.", ['updated', 'quote', 'invoice']],
  ['We emailed you the report this morning', ['report', 'this', 'morning'].filter((w) => w !== 'this')],
  ['Here is the invoice', ['invoice']],
  ['Attached is the Figma link', ['figma', 'link']],
  ['Please find attached the proposal', ['proposal']],
  ['The signed agreement is attached', ['signed', 'agreement']],
  ['The files are attached', []],
  ['I sent it', []],
  ['שלחתי לך את החוזה החתום', ['חוזה', 'חתום']],
  ['הנה החשבונית', ['חשבונית']],
  ['החוזה החתום מצורף', ['חוזה', 'חתום']],
  ['העליתי את הקבצים', []]
];
for (const [text, words] of YES) {
  const r = C.recognize(text);
  const same = r.kind === 'sent' && words.every((w) => r.words.indexOf(w) >= 0);
  check('sent: ' + text, same, r);
}
check('English and Hebrew are told apart', C.recognize('I sent it').lang === 'en' && C.recognize('שלחתי לך את החוזה').lang === 'he');

console.log('\n--- quiet ---\n');
const NO = [
  ['I will send the contract tomorrow', 'later'],
  ["I'll send it tonight", 'later'],
  ["I haven't sent it yet", 'not yet'],
  ['I did not send the contract', 'denial'],
  ['Did you get the contract I sent?', 'a question'],
  ['If I sent the contract, would that help', 'a condition'],
  ['He sent the contract to legal', 'somebody else'],
  ['They emailed the report', 'somebody else'],
  ['I sent the payment', 'money'],
  ['I transferred 500 NIS', 'money'],
  ['אשלח את החוזה מחר', 'later'],
  ['עוד לא שלחתי את החוזה', 'not yet'],
  ['שלחתי לך את התשלום', 'money'],
  ['Thanks for the contract', 'not a claim'],
  ['The contract looks good', 'not a claim'],
  ['', 'empty'],
  ['I sent a very long message that goes on and on about nothing in particular and keeps going for far too long to be a simple claim that a document was sent, so it is not one at all', 'long']
];
for (const [text, why] of NO) check('quiet (' + why + '): ' + text.slice(0, 50), C.recognize(text).kind === 'none', C.recognize(text));

console.log('\n--- which waiting task ---\n');
const T = (title) => ({ title: title });
const contract = T('Waiting on Dana: Send me the signed contract');
const invoice = T('Waiting on Dana: Send the invoice');
const heContract = T('מחכים ל-Dana: תשלח לי את החוזה החתום');
let f = C.fits(C.recognize('I just sent you the signed contract'), [contract, invoice], 2);
check('the words fit one task', f.length === 1 && f[0] === contract, f);
f = C.fits(C.recognize('Here is the invoice'), [contract, invoice], 2);
check('another task by its own word', f.length === 1 && f[0] === invoice, f);
f = C.fits(C.recognize('I sent the logo'), [contract, invoice], 2);
check('a thing nobody waits for fits nothing', f.length === 0, f);
f = C.fits(C.recognize('I sent the contract and the invoice'), [contract, invoice], 2);
check('two tasks fit: the host offers nothing (not exactly one)', f.length === 2, f);
f = C.fits(C.recognize('I sent it'), [contract], 1);
check('a claim that names nothing fits the one open waiting task', f.length === 1, f);
f = C.fits(C.recognize('I sent it'), [contract, invoice], 2);
check('a claim that names nothing fits nothing when two wait', f.length === 0, f);
f = C.fits(C.recognize('I sent it'), [], 1);
check('a claim that names nothing, with one waiting task that is not a document, fits nothing', f.length === 0, f);
f = C.fits(C.recognize('שלחתי לך את החוזה החתום'), [heContract], 1);
check('Hebrew: the words fit the Hebrew task', f.length === 1, f);
f = C.fits(C.recognize('שלחתי את החוזה'), [heContract, invoice], 2);
check('Hebrew prefix (ה) does not hide the word', f.length === 1 && f[0] === heContract, f);
check('junk is safe', C.fits(null, [contract], 1).length === 0 && C.fits(C.recognize('I sent it'), null, 1).length === 0);

console.log('\n--- a document is not a payment ---\n');
for (const text of ['I just sent you the signed contract', 'I sent you the contract', 'שלחתי לך את החוזה']) {
  check('the payment reader leaves it alone: ' + text, P.recognize(text).kind === 'none', P.recognize(text));
}
check('and the document reader leaves a payment alone', C.recognize('I sent the payment').kind === 'none' && P.recognize('I sent the payment').kind === 'claim');

console.log('\n' + (failures ? failures + ' FAILED' : 'All chat-sent-claim checks passed'));
process.exit(failures ? 1 : 0);
