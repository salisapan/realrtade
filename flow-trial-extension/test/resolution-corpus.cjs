// Resolution paths (core/resolution.js): finishing an intention that takes more than one step, with
// "can you send me the receipt?" as the north-star case. Five scenarios the product must get right:
//   1 found existing   2 not found   3 needs a request to someone else   4 cannot complete yet   5 true close only after delivery
// plus the precision rules around them. Run: node test/resolution-corpus.cjs
const { FlowResolution: R } = require('../core/resolution.js');
const { FlowFileAttach: FA } = require('../core/file-attach.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-05T12:00:00').getTime();
const DAY = 24 * 3600 * 1000;

const ASK = 'Hi, could you send me the receipt for the ₪3,850 retainer payment?';
const gate = FA.gate(ASK);
const need = { object: gate.ask.id, label: gate.ask.label, lang: gate.ask.lang, synonym: gate.ask.synonym };
const facts = { senderName: 'Dana Levi', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' } };
const dana = { email: 'dana@acme.com', personKey: 'e:dana@acme.com' };
const NOPAY = { status: 'unconfirmed', basis: null };
const pay = (basis) => ({ status: 'confirmed', basis });
const issuer = { email: 'books@my-accountant.co.il', name: 'Noa Books' };
const file = (id, name) => ({ id, name, mimeType: 'application/pdf' });
const plan = (o) => R.plan(Object.assign({ canCreate: true, need, facts, evidence: { threadFiles: [], driveFiles: [] }, payment: NOPAY, issuer: null, state: null, sourceText: ASK }, o));

console.log('\n--- the ask is a financial artifact the resolution knows ---');
check('a receipt ask is clear and handled', gate.kind === 'clear' && R.handles('receipt'));
check('an ordinary document (contract) is not a resolution class: the old path keeps it', !R.handles('contract'));
check('the surfaces wire the payment-attesting artifacts to it first (receipt, transfer proof); invoices keep the old chip', R.owns('receipt') && R.owns('transfer') && !R.owns('invoice') && !R.owns('tax-invoice') && !R.owns('statement') && !R.owns('contract'));
check('"done" is defined in words before anything is done', /receipt for ₪3,850 sent to Dana/i.test(R.doneDefinition(need, facts).text), R.doneDefinition(need, facts));
check('a receipt attests a payment', R.doneDefinition(need, facts).attests === 'payment');

console.log('\n--- scenario 1: found existing ---');
{
  const p = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt - Dana retainer Oct.pdf'), file('F2', 'Budget.xlsx')] } });
  check('one receipt in Drive: prepare the reply with it', p.move === 'prepare-reply-with-file' && p.file.source === 'drive' && p.file.id === 'F1', p);
  check('a found receipt needs no payment check (it could not exist without one)', p.skipped && p.skipped.indexOf('verify') >= 0 && p.why === 'found-existing');
  check('and the plan is NOT done: preparing is not delivering', p.done === false);
  const t = plan({ evidence: { threadFiles: [{ filename: 'receipt-7731.pdf', by: 'other' }], driveFiles: [] } });
  check('one receipt the issuer already sent in this thread: that one', t.move === 'prepare-reply-with-file' && t.file.source === 'thread' && t.file.name === 'receipt-7731.pdf', t);
  const mine = plan({ evidence: { threadFiles: [{ filename: 'receipt.pdf', by: 'me' }], driveFiles: [] } });
  check('a receipt I sent earlier in the thread is a candidate to resend', mine.move === 'prepare-reply-with-file' && mine.file.source === 'thread', mine);
  const same = plan({ evidence: { threadFiles: [{ filename: 'Receipt Oct.pdf', by: 'me' }], driveFiles: [file('F1', 'Receipt Oct.pdf')] } });
  check('the same file in the thread and in Drive is one candidate (the Drive copy, no bytes to read)', same.move === 'prepare-reply-with-file' && same.file.source === 'drive', same);
  const own = plan({ evidence: { threadFiles: [{ filename: 'receipt.pdf', by: 'requester' }], driveFiles: [] }, payment: NOPAY });
  check('a receipt only THEY sent is theirs, never offered back to them', own.move === 'verify-payment', own);
  const two = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Dana.pdf'), file('F2', 'Receipt Dana copy.pdf')] } });
  check('two receipts that fit equally: no file is chosen', two.move === 'choose-file' && !two.file && two.actions.join() === 'prepare-plain-reply', two);
  const tpl = plan({ evidence: { threadFiles: [], driveFiles: [file('T1', 'Receipt template.docx')] }, payment: pay('bank-email') });
  check('a template is not an existing receipt', tpl.move !== 'prepare-reply-with-file', tpl);
  const odd = plan({ evidence: { threadFiles: [{ filename: 'IMG_2231.pdf', by: 'other' }], driveFiles: [] } });
  check('a file not named for it is not guessed at', odd.move !== 'prepare-reply-with-file', odd);
}

console.log('\n--- scenario 2: not found ---');
{
  const p = plan({});
  check('nothing exists and nothing is confirmed: the next step is to verify, not to give up', p.move === 'verify-payment' && p.stage === 'verify', p);
  check('it says what it could not find, in the person\'s terms', /cannot find a payment of ₪3,850 from Dana/.test(p.line) && /Was it paid\?/.test(p.line), p.line);
  check('the question is one tap each way', p.actions.join() === 'mark-paid,not-paid');
  const q = plan({ evidence: { threadFiles: null, driveFiles: null } });
  check('when neither search could run, it still does not invent: same verify step', q.move === 'verify-payment' && q.done === false, q);
  check('no plan ever reports itself done', [plan({}), plan({ payment: pay('bank-email'), issuer }), plan({ payment: pay('bank-email') }), plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Oct.pdf')] } })].every((x) => x.done === false));
  const he = R.plan({ need: Object.assign({}, need, { lang: 'he', label: 'קבלה' }), facts, evidence: { threadFiles: [], driveFiles: [] }, payment: NOPAY });
  check('the same step in Hebrew', /לא מצאתי תשלום על ₪3,850 מDana/.test(he.line), he.line);
}

console.log('\n--- scenario 3: needs a request to someone else ---');
{
  const p = plan({ payment: pay('bank-email'), issuer });
  check('payment confirmed, no receipt, an issuer is known: ask them (a draft)', p.move === 'request-issuer' && p.issuer.email === issuer.email && p.stage === 'request', p);
  check('asking the issuer is preferred to generating anything, even with a template', plan({ payment: pay('bank-email'), issuer, evidence: { threadFiles: [], driveFiles: [file('T1', 'Receipt template.docx')] } }).move === 'request-issuer');
  const d = R.issuerRequestDraft(need, facts, issuer, { dateText: 'Oct 2' });
  check('the draft asks for the file and names the payer, the amount and the date, and nothing else', /Hi Noa,/.test(d) && /receipt for Dana Levi for ₪3,850 \(payment received Oct 2\) and send it to me as a file/.test(d), d);
  check('the draft never claims a receipt exists', !/attached|enclosed|here is/i.test(d), d);
  const asked = R.recordRequest(R.open(need, facts, NOW), NOW, 'Noa Books');
  const w = plan({ payment: pay('bank-email'), issuer, state: asked });
  check('after asking: wait, and say who was asked', w.move === 'await-issuer' && /Asked Noa Books/.test(w.line) && w.done === false, w);
  const arrived = plan({ payment: pay('bank-email'), issuer, state: asked, evidence: { threadFiles: [{ filename: 'Receipt-7731.pdf', by: 'other' }], driveFiles: [] } });
  check('when the issuer\'s file arrives, the path advances to preparing the reply with it', arrived.move === 'prepare-reply-with-file' && arrived.file.name === 'Receipt-7731.pdf', arrived);
  check('still nothing closed: it is in the draft, not sent', arrived.done === false && !arrived.status);
  const nobody = plan({ payment: pay('bank-email'), issuer: null });
  check('no issuer known and no template: ask who issues them (once), or let the person issue it', nobody.move === 'name-issuer' && nobody.actions.join() === 'set-issuer,issue-myself' && nobody.future === 'billing-connector', nobody);
  check('and it is honest that it cannot issue one itself', /cannot issue/.test(nobody.line), nobody.line);
  const own = plan({ payment: pay('bank-email'), state: R.recordOwnerIssuing(R.open(need, facts, NOW), NOW) });
  check('the person says they will issue it: wait for THEIR send, nothing else', own.move === 'await-owner-issue' && own.stage === 'deliver', own);
  const bank = R.plan({ need: { object: 'transfer', label: 'transfer confirmation', lang: 'en', synonym: ['transfer'] }, facts, evidence: { threadFiles: [], driveFiles: [] }, payment: pay('bank-email') });
  check('a proof of transfer only the bank can produce: the person fetches it, Glance holds the loop', bank.move === 'fetch-from-source' && bank.actions.join() === 'hold', bank);
}

console.log('\n--- scenario 4: cannot complete yet (a missing precondition) ---');
{
  const owed = [{ kind: 'payment', direction: 'theirs', status: 'waiting', counterpart: dana, amount: { value: 3850, currency: 'ILS' } }];
  const pst = R.paymentStatus({ facts, person: dana, watches: owed, paymentsSeen: [], now: NOW });
  check('a loop still chasing this person for this money contradicts "paid"', pst.status === 'contradicted' && pst.basis === 'open-loop', pst);
  const p = plan({ payment: pst });
  check('so no receipt: hold, name why, keep the loop open', p.move === 'wait-payment' && p.blockedBy === 'payment' && /not confirmed/.test(p.line) && p.done === false, p);
  check('a held loop offers nothing that makes a document', p.actions.join() === 'mark-paid');
  const said = R.markNotPaid(R.open(need, facts, NOW), NOW);
  check('"not yet" from the person holds it too', R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [], now: NOW, state: said }).status === 'contradicted' && plan({ payment: R.paymentStatus({ facts, person: dana, watches: [], now: NOW, state: said }) }).move === 'wait-payment');
  check('no amount to match, nothing seen: unconfirmed, not "probably"', R.paymentStatus({ facts: { senderName: 'Dana' }, person: dana, watches: [], paymentsSeen: [{ value: 3850, currency: 'ILS', at: NOW - DAY }], now: NOW }).status === 'unconfirmed');
  check('a bank email for a DIFFERENT amount confirms nothing', R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [{ value: 3800, currency: 'ILS', at: NOW - DAY }], now: NOW }).status === 'unconfirmed');
  check('a bank email for this amount, recent: confirmed', R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [{ value: 3850, currency: 'ILS', at: NOW - 3 * DAY }], now: NOW }).basis === 'bank-email');
  check('a bank email from long ago is not this payment', R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [{ value: 3850, currency: 'ILS', at: NOW - 400 * DAY }], now: NOW }).status === 'unconfirmed');
  check('a loop already closed as paid, same person and amount: confirmed', R.paymentStatus({ facts, person: dana, watches: [{ kind: 'payment', status: 'resolved', closedAs: 'paid', counterpart: dana, amount: { value: 3850, currency: 'ILS' } }], paymentsSeen: [], now: NOW }).basis === 'loop-paid');
  check('a paid loop of another person does not confirm this one', R.paymentStatus({ facts, person: dana, watches: [{ kind: 'payment', status: 'resolved', closedAs: 'paid', counterpart: { email: 'x@y.com' }, amount: { value: 3850, currency: 'ILS' } }], paymentsSeen: [], now: NOW }).status === 'unconfirmed');
  const said2 = R.markPaid(R.open(need, facts, NOW), NOW);
  const asserted = R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [], now: NOW, state: said2 });
  check('the person\'s own "yes, paid" is accepted, labelled as theirs', asserted.status === 'confirmed' && asserted.basis === 'owner', asserted);
  const tplOnly = plan({ payment: asserted, evidence: { threadFiles: [], driveFiles: [file('T1', 'Receipt template.docx')] } });
  check('but a say-so alone never lets a receipt be GENERATED from a template', tplOnly.move !== 'create-from-template' && tplOnly.move === 'name-issuer', tplOnly);
  const strong = plan({ payment: pay('bank-email'), evidence: { threadFiles: [], driveFiles: [file('T1', 'Receipt template.docx')] } });
  check('a payment seen at the bank plus exactly one template: the template path opens (the old create card)', strong.move === 'create-from-template' && strong.template && strong.template.action === 'create', strong);
  check('and the card is filled from what is known (payer, amount as text) with a real line', strong.template.fields.find((f) => f.id === 'amount').value === '₪3,850' && strong.template.fields.find((f) => f.id === 'from').value === 'Dana Levi' && /Didn't find receipt/.test(strong.line), strong);
  check('a surface that cannot open the create card never gets that move', plan({ payment: pay('bank-email'), canCreate: false, evidence: { threadFiles: [], driveFiles: [file('T1', 'Receipt template.docx')] } }).move === 'name-issuer');
  check('an invoice (it asks for money, it does not attest it) needs no payment first', R.plan({ canCreate: true, need: { object: 'invoice', label: 'invoice', lang: 'en', synonym: ['invoice'] }, facts, evidence: { threadFiles: [], driveFiles: [file('T1', 'Invoice template.docx')] }, payment: NOPAY }).move === 'create-from-template');
}

console.log('\n--- the reply draft claims a file only when it has one ---');
{
  const withF = R.replyDraft(need, facts, { fileName: 'Receipt-7731.pdf' });
  const without = R.replyDraft(need, facts, {});
  check('with a file: it names it and the amount', /Attached is the receipt for ₪3,850: Receipt-7731\.pdf/.test(withF), withF);
  check('with none: a visible placeholder, never the word attached', /\[Attach the receipt here, then send\]/.test(without) && !/attached is/i.test(without), without);
  check('Hebrew: same rule', /\[צרפו את קבלה כאן ושלחו\]/.test(R.replyDraft({ object: 'receipt', label: 'קבלה', lang: 'he' }, facts, {})) && /מצורפת קבלה על ₪3,850: x\.pdf/.test(R.replyDraft({ object: 'receipt', label: 'קבלה', lang: 'he' }, facts, { fileName: 'x.pdf' })));
}

console.log('\n--- scenario 5: it closes only when it was actually delivered ---');
{
  const st = R.open(need, facts, NOW);
  const j = (text, atts) => R.judgeDelivery(st, { text, attachments: atts });
  check('my message with a receipt attached: delivered', j('Hi Dana, here you go.', [{ filename: 'Receipt-Dana-Oct.pdf' }]).close === true);
  check('Hebrew filename for it', R.judgeDelivery(R.open({ object: 'receipt', label: 'קבלה', lang: 'he', synonym: need.synonym }, facts, NOW), { text: 'מצורף', attachments: [{ filename: 'קבלה 1042.pdf' }] }).close === true);
  const claim = j('Receipt attached.', []);
  check('"attached" with nothing attached never closes', claim.close === false && claim.reason === 'claimed-not-attached', claim);
  check('a message with no file at all never closes', j('Will send soon.', []).close === false && j('Will send soon.', []).reason === 'no-file');
  const blind = j('Receipt attached.', null);
  check('when the page cannot list attachments it does not close, it asks', blind.close === false && blind.ask === true && blind.reason === 'cannot-see-attachments', blind);
  const wrong = j('See attached.', [{ filename: 'IMG_2231.pdf' }]);
  check('a file not named for the thing, with no word about it: no close, one question', wrong.close === false && wrong.reason === 'file-not-named-for-it' && wrong.ask === true, wrong);
  check('the same odd name closes when the message names the receipt and it is the only file', j('Here is the receipt you asked for.', [{ filename: 'IMG_2231.pdf' }]).close === true);
  check('but not when two files went out and neither is named for it', j('Here is the receipt.', [{ filename: 'IMG_1.pdf' }, { filename: 'IMG_2.pdf' }]).close === false);
  check('an invoice sent where a receipt was asked is not a receipt', j('Here is the invoice.', [{ filename: 'invoice-1042.pdf' }]).close === false, j('Here is the invoice.', [{ filename: 'invoice-1042.pdf' }]));
  const patch = R.closePatch(R.recordPrepared(st, NOW, 'Receipt.pdf'), NOW + DAY, { files: ['Receipt-Dana-Oct.pdf'] });
  check('a close the person made by hand says so, and is not counted as a delivery', R.closePatch(st, NOW, { files: [], manual: true }).resolvedBy === 'manual' && R.closePatch(st, NOW, { files: [], manual: true }).resolution.trail.slice(-1)[0].note === 'owner-marked-done');
  check('the close is recorded as delivered, with what was sent', patch.status === 'resolved' && patch.closedAs === 'kept' && patch.resolvedBy === 'delivered' && patch.resolution.stage === 'close' && patch.resolution.deliveredFiles[0] === 'Receipt-Dana-Oct.pdf', patch);
  check('the trail shows the whole path in order', patch.resolution.trail.map((s) => s.stage).join('>') === 'define>prepare>close', patch.resolution.trail);
  const prepared = R.recordPrepared(st, NOW, 'Receipt.pdf');
  check('preparing a draft does not change what plan() says is done', plan({ state: prepared, evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Oct.pdf')] } }).done === false && prepared.preparedAt === NOW && prepared.stage === 'prepare');
  const asked = R.recordRequest(st, NOW, 'Noa');
  check('requesting does not close either', asked.status === undefined && asked.stage === 'request');
}

console.log('\n--- a file whose name carries ANOTHER amount is not the one ---');
{
  const other = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Dana ₪2,000.pdf')] } });
  check('a Drive receipt named for another amount is not offered', other.move !== 'prepare-reply-with-file', other);
  const same = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Dana ₪3,850.pdf')] } });
  check('named for this amount: offered', same.move === 'prepare-reply-with-file' && same.file.id === 'F1', same);
  const seq = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt-7731.pdf')] } });
  check('a receipt NUMBER (no currency, no thousands separator) is not read as an amount', seq.move === 'prepare-reply-with-file', seq);
  const two = plan({ evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Dana ₪2,000.pdf'), file('F2', 'Receipt Dana ₪3,850.pdf')] } });
  check('of two receipts, the one for this amount wins instead of a conflict', two.move === 'prepare-reply-with-file' && two.file.id === 'F2', two);
  const thr = plan({ evidence: { threadFiles: [{ filename: 'receipt $1,200.pdf', by: 'other' }], driveFiles: [] } });
  check('same rule for a file already in the thread', thr.move !== 'prepare-reply-with-file', thr);
  const noAmt = R.plan({ canCreate: true, need, facts: { senderName: 'Dana' }, evidence: { threadFiles: [], driveFiles: [file('F1', 'Receipt Dana ₪2,000.pdf')] }, payment: NOPAY, issuer: null, state: null, sourceText: ASK });
  check('with no amount in the ask there is nothing to compare: the file is judged by name only', noAmt.move === 'prepare-reply-with-file', noAmt);
}

console.log('\n--- the same amount from two different people is not proof for either ---');
{
  const other = [{ kind: 'payment', direction: 'theirs', status: 'waiting', counterpart: { email: 'omer@beta.com', personKey: 'e:omer@beta.com' }, amount: { value: 3850, currency: 'ILS' } }];
  const seenOne = [{ value: 3850, currency: 'ILS', at: NOW - DAY }];
  const amb = R.paymentStatus({ facts, person: dana, watches: other, paymentsSeen: seenOne, now: NOW });
  check('another person is still being chased for the same amount: the bank email may be theirs, so ask', amb.status === 'unconfirmed' && amb.ambiguous === true, amb);
  const twoSeen = R.paymentStatus({ facts, person: dana, watches: [], paymentsSeen: [{ value: 3850, currency: 'ILS', at: NOW - DAY }, { value: 3850, currency: 'ILS', at: NOW - 9 * DAY }], now: NOW });
  check('two payments of that amount seen, and no loop to tell them apart: still confirmed (a payment did arrive)', twoSeen.status === 'confirmed', twoSeen);
  const mineClosed = R.paymentStatus({ facts, person: dana, watches: other.concat([{ kind: 'payment', status: 'resolved', closedAs: 'paid', counterpart: dana, amount: { value: 3850, currency: 'ILS' } }]), paymentsSeen: seenOne, now: NOW });
  check('a loop closed as paid for THIS person still confirms, whatever others owe', mineClosed.basis === 'loop-paid', mineClosed);
  const p = plan({ payment: amb });
  check('the plan asks, and says why', p.move === 'verify-payment', p);
}

console.log('\n--- the issuer answers in another thread ---');
{
  const st = R.recordRequest(R.markPaid(R.open(need, facts, NOW), NOW), NOW, 'Noa Books', 'Books@My-Accountant.co.il');
  check('the request remembers the address it went to, lower-cased', st.requestedToEmail === 'books@my-accountant.co.il', st);
  const w = (id, state, amount) => ({ id, threadId: id, status: 'waiting', direction: 'mine', counterpart: { email: 'dana@acme.com', name: 'Dana Levi' }, amount: amount || { value: 3850, currency: 'ILS' }, resolution: state });
  const m = (watches, over) => R.matchIssuerReply(watches, Object.assign({ senderEmail: 'books@my-accountant.co.il', attachments: [{ filename: 'Receipt-7731.pdf' }] }, over || {}));
  const hit = m([w('orig', st)]);
  check('their receipt arrives: matched to the one loop that asked them, with the file', hit && hit.watch.id === 'orig' && hit.file.filename === 'Receipt-7731.pdf', hit);
  check('someone else sending a receipt matches nothing', m([w('orig', st)], { senderEmail: 'dana@acme.com' }) === null);
  check('an address that was never asked matches nothing', m([w('orig', st)], { senderEmail: 'spam@x.com' }) === null);
  check('a message with no attachment matches nothing (a promise is not a file)', m([w('orig', st)], { attachments: [] }) === null);
  check('attachments the page could not list: nothing', m([w('orig', st)], { attachments: null }) === null);
  check('a file not named for it: nothing', m([w('orig', st)], { attachments: [{ filename: 'IMG_1.pdf' }] }) === null);
  check('two files named for it: no guess', m([w('orig', st)], { attachments: [{ filename: 'Receipt-1.pdf' }, { filename: 'Receipt-2.pdf' }] }) === null);
  check('two loops waiting on the same issuer: no guess', m([w('a', st), w('b', st)]) === null);
  check('a loop already closed is not matched', m([Object.assign(w('orig', st), { status: 'resolved' })]) === null);
  check('a loop that never asked anyone is not matched', m([w('orig', R.open(need, facts, NOW))]) === null);
  const amtText = (txt) => m([w('a', st), w('b', R.recordRequest(R.markPaid(R.open(need, { senderName: 'Omer', amount: { value: 900, currency: 'ILS', raw: '₪900' } }, NOW), NOW), NOW, 'Noa Books', 'books@my-accountant.co.il'), { value: 900, currency: 'ILS' })], { text: txt });
  check('two loops on one issuer: the message naming one amount picks that loop', (() => { const r = amtText('Hi, the receipt for ₪900 is attached'); return r && r.watch.id === 'b'; })(), amtText('Hi, the receipt for ₪900 is attached'));
  check('and a message naming no amount still picks nothing', amtText('Receipt attached') === null);
}

console.log('\n--- reading what the issuer says back (they are not an attachment, they are a person) ---');
{
  const MON = new Date('2026-10-05T12:00:00').getTime();   // a Monday
  const base = R.recordRequest(R.markPaid(R.open(need, facts, MON - 4 * DAY), MON - 4 * DAY), MON - 4 * DAY, 'Noa Books', 'books@my-accountant.co.il');
  // the issuer's words go through the same reply reader every loop uses, as a request to issue a file
  const pseudo = { direction: 'theirs', kind: 'reply', lang: 'en', what: 'Please issue the receipt', file: { object: 'receipt', label: 'receipt', synonym: need.synonym } };
  const read = (text, atts) => R.readIssuerAnswer(base, F.classifyReply(text, pseudo, { now: MON, extract: FlowExtract, email: 'books@my-accountant.co.il', evidence: { known: Array.isArray(atts), attached: !!(atts && atts.length), names: atts || [], claims: /attached/i.test(text) } }), MON, text);
  const p1 = read('Sure, I will send it on Thursday.');
  check('"I will send it on Thursday": a promised day is recorded, the request stays open', p1.kind === 'promised' && p1.state.issuerPromisedIso === '2026-10-08' && p1.state.requestedAt === base.requestedAt, p1);
  const pp = plan({ payment: pay('bank-email'), issuer, state: p1.state, now: MON });
  check('and the path says it, with the day, and does not chase before it', pp.move === 'await-issuer' && /Thu, Oct 8/.test(pp.line), pp);
  const late = plan({ payment: pay('bank-email'), issuer, state: p1.state, now: new Date('2026-10-09T12:00:00').getTime() });
  check('the day passed with no file: it offers one reminder to them (a draft)', late.move === 'chase-issuer' && /promised Thu, Oct 8/.test(late.line) && late.actions.join() === 'chase-issuer', late);
  const d1 = read('We do not issue receipts for that, sorry. Please ask the bank.');
  check('"we do not issue these": declined, so it reroutes instead of waiting forever', d1.kind === 'declined' && d1.state.issuerDeclinedEmail === 'books@my-accountant.co.il' && !d1.state.requestedAt, d1);
  const dp = plan({ payment: pay('bank-email'), issuer, state: d1.state, now: MON });
  check('the plan does not ask the same person again: it asks who else issues receipts', dp.move === 'name-issuer' && /Noa Books said they cannot issue/.test(dp.line) && dp.actions.join() === 'set-issuer,issue-myself', dp);
  const other = plan({ payment: pay('bank-email'), issuer: { email: 'ron@other.co.il', name: 'Ron' }, state: d1.state, now: MON });
  check('a different issuer saved afterwards is asked normally', other.move === 'request-issuer' && other.issuer.email === 'ron@other.co.il', other);
  check('a condition makes it a delay, not a no: "we do not issue receipts until it clears"', read('We do not issue receipts until the payment clears.').kind !== 'declined', read('We do not issue receipts until the payment clears.'));
  check('a promise in the same message wins over a no about today', read('We cannot issue it today, but I will send it on Thursday.').kind === 'promised');
  check('Hebrew: "we do not issue these"', read('אנחנו לא מנפיקים קבלות על זה.').kind === 'declined');
  check('an interim "I will check what we can do" is never read as a no', read('Thanks, I will check what we can do.').kind !== 'declined');
  const q1 = read('Which name should it be issued under?');
  check('"which name should it be under?": they asked YOU something, and it is said once', q1.kind === 'asked' && q1.state.issuerAskedAt === MON && /asked you/.test(q1.line), q1);
  check('a thank-you changes nothing', read('Thanks!').kind === 'none' && read('Thanks!').state === base);
  const nf = read('Done, it is issued.');
  check('"done" with no file is not a file: kept open, says so', nf.kind === 'no-file' && /no file came/.test(nf.line) && nf.state.requestedAt === base.requestedAt, nf);
  const real = read('Here it is.', ['Receipt-7731.pdf']);
  check('a real file is the file path (matchIssuerReply), not this one', real.kind === 'file', real);
  const out = read('Out of office until Monday');
  check('an out-of-office changes nothing', out.kind === 'none');
}

console.log('\n--- no answer from the issuer: one reminder, then it waits ---');
{
  const T0 = new Date('2026-10-05T12:00:00').getTime();
  const asked = R.recordRequest(R.markPaid(R.open(need, facts, T0), T0), T0, 'Noa Books', 'books@my-accountant.co.il');
  const at = (days) => plan({ payment: pay('bank-email'), issuer, state: asked, now: T0 + days * DAY });
  check('two days after asking: still waiting, quiet', at(2).move === 'await-issuer');
  const c = at(4);
  check('four days: one reminder to the issuer is offered, and says how long', c.move === 'chase-issuer' && /4 days/.test(c.line) && c.done === false, c);
  const d = R.issuerChaseDraft(need, facts, issuer, { days: 4 });
  check('the reminder names the payer and the amount, asks for the file, claims nothing', /Hi Noa,/.test(d) && /receipt for Dana Levi for ₪3,850/.test(d) && !/attached|enclosed/i.test(d), d);
  const chased = R.recordChase(asked, T0 + 4 * DAY);
  check('after the reminder it waits again, not at once again', plan({ payment: pay('bank-email'), issuer, state: chased, now: T0 + 5 * DAY }).move === 'await-issuer' && plan({ payment: pay('bank-email'), issuer, state: chased, now: T0 + 8 * DAY }).move === 'chase-issuer');
  check('the reminder is one step in the same trail', chased.trail.slice(-1)[0].note === 'chased-issuer' && chased.chasedAt === T0 + 4 * DAY);
  check('without a clock the plan never invents a chase', R.plan({ canCreate: true, need, facts, evidence: { threadFiles: [], driveFiles: [] }, payment: pay('bank-email'), issuer, state: asked }).move === 'await-issuer');
}

console.log('\n--- one loop, one status truth ---');
{
  const s0 = R.open(need, facts, NOW);
  const s1 = R.markPaid(s0, NOW + 1);
  const s2 = R.recordRequest(s1, NOW + 2, 'Noa Books');
  const s3 = R.recordPrepared(s2, NOW + 3, 'Receipt-7731.pdf');
  check('the state carries its own history in one object (no second loop per step)', s3.trail.map((s) => s.stage).join('>') === 'define>verify>request>prepare', s3.trail);
  check('the done definition is stored with the loop, so every surface says the same thing', typeof s3.done === 'string' && /receipt/i.test(s3.done));
  check('the trail is bounded', (() => { let s = s0; for (let i = 0; i < 30; i++) s = R.recordPrepared(s, NOW + i, 'x'); return s.trail.length <= 8; })());
  check('transitions never mutate the state they were given', s0.trail.length === 1 && s0.stage === 'define');
}

console.log('\n--- the boundary ---');
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'resolution.js'), 'utf8').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  check('resolution.js never reaches outside the device and has no send, issue or generate path', !/\bfetch\s*\(|XMLHttpRequest|chrome\.|sendMessage\s*\(|messages\/send|drafts\/send|\bdocument\.\w|\bwindow\.\w|\bcreateReceipt\b|\bissueReceipt\b/.test(src));
}

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
