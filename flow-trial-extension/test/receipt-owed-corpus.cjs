// The receipt you owe once you are paid (core/receipt-owed.js, switch RECEIPT_OWED, off; not on the labs list yet).
// Pinned: switch off = nothing; a payment loop that closed as paid on real money (a notice, or the person's own mark)
// opens "a receipt is owed" in shekels; a claim, a release, a combined invoice-receipt, an invoicing system that sends
// receipts itself, money the person paid, and foreign currency do not. It closes only on the person's sent message to
// the payer with a receipt file, or on the invoicing system's copy naming the payer; never on words alone, an invoice,
// a promise, a draft, a cancelled receipt, another payer or amount, a spoof, or two fits. Run: node test/receipt-owed-corpus.cjs
const { FlowReceiptOwed: R } = require('../core/receipt-owed.js');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { enabled: true };
const PAID = new Date('2026-10-29T10:00:00').getTime();   // a Thursday
const loop = (o) => Object.assign({ id: 't1', threadId: 't1', kind: 'payment', direction: 'theirs', status: 'resolved', closedAs: 'paid', resolvedBy: 'notice', counterpart: { email: 'dana.cohen@gmail.com', name: 'דנה כהן' }, amount: { value: 3850, currency: 'ILS' }, what: 'תשלום על עיצוב הלוגו', lang: 'he', resolvedAt: PAID }, o || {});

console.log('--- switch off: nothing ---');
check('every off form of owe returns null', [undefined, null, {}, { enabled: false }, { enabled: 'true' }].every((o) => R.owe(loop(), o) === null));
const dana = R.owe(loop(), ON);
const sent = { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת קבלה', attachments: ['קבלה 0045.pdf'] };
check('every off form of judge returns null', [undefined, null, {}, { enabled: false }].every((o) => R.judge([dana], sent, o) === null));
check('the switch is named and defaults off', R.SWITCH === 'RECEIPT_OWED' && R.SWITCH_DEFAULT === false);
check('not on the labs list: nothing is wired, so no switch is shown', L.IDS.indexOf('RECEIPT_OWED') < 0);

console.log('--- birth ---');
check('money in by notice opens a receipt owed, with the payer, amount and done text', dana && dana.kind === 'receipt-owed' && dana.email === 'dana.cohen@gmail.com' && dana.amount === 3850 && /קבלה על ₪3,850 נשלחה אל דנה כהן/.test(dana.done), dana);
check('due the paid day, chased two workdays later (Thu -> Mon, skipping Fri and Sat)', dana.dueIso === '2026-10-29' && dana.chaseIso === '2026-11-02', dana);
check('the person marking it paid opens one too', Boolean(R.owe(loop({ resolvedBy: 'manual' }), ON)));
check('the payer\'s "I paid" (a claim) opens nothing', R.owe(loop({ resolvedBy: 'reply' }), ON) === null);
check('a released loop opens nothing', R.owe(loop({ closedAs: 'released' }), ON) === null);
check('a declined loop opens nothing', R.owe(loop({ closedAs: 'declined' }), ON) === null);
check('a still-waiting loop opens nothing', R.owe(loop({ status: 'waiting', closedAs: null }), ON) === null);
check('money I paid (direction mine) opens nothing', R.owe(loop({ direction: 'mine' }), ON) === null);
check('a reply loop opens nothing', R.owe(loop({ kind: 'reply', closedAs: 'replied' }), ON) === null);
check('no amount opens nothing', R.owe(loop({ amount: null }), ON) === null);
check('dollars open nothing', R.owe(loop({ amount: { value: 500, currency: 'USD' }, lang: 'en' }), ON) === null);
check('no currency on an English loop opens nothing', R.owe(loop({ amount: { value: 500, currency: null }, lang: 'en' }), ON) === null);
check('no currency on a Hebrew loop is shekels', Boolean(R.owe(loop({ amount: { value: 500, currency: null } }), ON)));
check('shekels in English open one, with English done text', /^A receipt for ₪2,000 sent to Maya Studio/.test((R.owe(loop({ lang: 'en', counterpart: { email: 'maya@mayastudio.co.il', name: 'Maya Studio' }, amount: { value: 2000, currency: 'ILS' } }), ON) || {}).done || ''));
check('«חשבונית מס קבלה» already is the receipt', R.owe(loop({ what: 'חשבונית מס קבלה 0112' }), ON) === null);
check('«חשבונית מס/קבלה» with a slash too', R.owe(loop({ what: 'חשבונית מס/קבלה 0112' }), ON) === null);
check('"invoice-receipt" in English too', R.owe(loop({ what: 'Invoice-receipt 0112 for consulting', lang: 'en' }), ON) === null);
check('an invoicing system that sends receipts itself: silence', R.owe(loop(), { enabled: true, profile: { receiptsAuto: true } }) === null);
check('a plain invoice number still opens one', Boolean(R.owe(loop({ what: 'חשבונית 2219 על עיצוב', subtype: 'invoice' }), ON)));

console.log('--- close: the person\'s own sent receipt ---');
const c1 = R.judge([dana], sent, ON);
check('a sent message to the payer with a receipt file closes it', c1 && c1.owedId === dana.id && c1.verdict === 'close' && c1.kind === 'own', c1);
check('an English receipt file name counts', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'Attached.', attachments: ['Receipt_0045.pdf'] }, ON)));
check('«חשבונית מס קבלה» file counts', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורף', attachments: ['חשבונית מס קבלה 0045.pdf'] }, ON)));
check('the same amount in the text is fine', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת קבלה על 3,850 ₪', attachments: ['קבלה.pdf'] }, ON)));
check('"attached" with no file stays open', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת הקבלה', attachments: [] }, ON) === null);
check('an invoice file is not a receipt', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת החשבונית', attachments: ['חשבונית 0045.pdf'] }, ON) === null);
check('a file whose name only contains the letters (מקבלה) is not guessed', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורף', attachments: ['תמונות_מקבלת_הפנים.jpg'] }, ON) === null);
check('a receipt to someone else stays open', R.judge([dana], { dir: 'out', toEmail: 'ron.levi@gmail.com', text: 'מצורפת קבלה', attachments: ['קבלה.pdf'] }, ON) === null);
check('another gmail address is not the same payer', R.judge([dana], { dir: 'out', toEmail: 'dana.k@gmail.com', text: 'מצורפת קבלה', attachments: ['קבלה.pdf'] }, ON) === null);
const shaked = R.owe(loop({ id: 't2', counterpart: { email: 'accounts@shaked.co.il', name: 'שקד' } }), ON);
check('a colleague at the payer\'s company domain counts', Boolean(R.judge([shaked], { dir: 'out', toEmail: 'ceo@shaked.co.il', text: 'מצורפת קבלה', attachments: ['קבלה.pdf'] }, ON)));
check('a receipt for another amount stays open', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת קבלה על 900 ₪', attachments: ['קבלה.pdf'] }, ON) === null);
check('"I\'ll send the receipt tomorrow" stays open', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: "Thanks! I'll send the receipt tomorrow.", attachments: [] }, ON) === null);
check('a cancelled receipt sent stays open', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'הקבלה בוטלה, מצורף', attachments: ['קבלה מבוטלת.pdf'] }, ON) === null);

console.log('--- close: the invoicing system\'s copy ---');
const iss = (text, from, extra) => Object.assign({ dir: 'in', fromEmail: from || 'noreply@greeninvoice.co.il', text }, extra || {});
check('«נשלחה בהצלחה אל דנה כהן» with the amount closes it', (R.judge([dana], iss('קבלה מס\' 0047 על סך 3,850 ₪ נשלחה בהצלחה אל דנה כהן.'), ON) || {}).kind === 'issuer');
check('the name with a Hebrew prefix («לדנה כהן») counts', Boolean(R.judge([dana], iss('קבלה הופקה ונשלחה לדנה כהן'), ON)));
check('no amount but the payer named counts', Boolean(R.judge([dana], iss('קבלה מס\' 0050 הופקה ונשלחה אל דנה כהן.'), ON)));
check('a receipt number is not read as the amount', Boolean(R.judge([dana], iss('Receipt #3850 was sent to דנה כהן', 'no-reply@icount.co.il'), ON)));
check('a draft stays open', R.judge([dana], iss('טיוטת קבלה עבור דנה כהן על סך 3,850 ₪ נשמרה. המסמך טרם הופק.'), ON) === null);
check('a cancelled receipt stays open', R.judge([dana], iss('קבלה מס\' 0047 לדנה כהן בוטלה'), ON) === null);
check('another payer stays open', R.judge([dana], iss('קבלה מס\' 0049 על סך 3,850 ₪ נשלחה בהצלחה אל רון לוי.'), ON) === null);
check('only the first name of the payer is not enough', R.judge([dana], iss('קבלה נשלחה אל דנה לוי'), ON) === null);
check('another amount stays open', R.judge([dana], iss('קבלה על סך 900 ₪ נשלחה אל דנה כהן'), ON) === null);
check('an untrusted sender saying the same stays open', R.judge([dana], iss('קבלה על סך 3,850 ₪ נשלחה אל דנה כהן', 'greeninvoice@gmail.com'), ON) === null);
check('a look-alike domain stays open', R.judge([dana], iss('קבלה על סך 3,850 ₪ נשלחה אל דנה כהן', 'noreply@greeninvoice.co.il.evil.com'), ON) === null);
check('a copy that failed authentication stays open', R.judge([dana], iss('קבלה על סך 3,850 ₪ נשלחה אל דנה כהן', null, { authPass: false }), ON) === null);
check('the payer\'s "thanks for the receipt" is not proof', R.judge([dana], { dir: 'in', fromEmail: 'dana.cohen@gmail.com', text: 'תודה על הקבלה!' }, ON) === null);
check('a supplier\'s receipt to the person is not proof', R.judge([dana], { dir: 'in', fromEmail: 'office@levi-cpa.co.il', text: 'מצורפת קבלה על סך 3,850 ₪' }, ON) === null);

console.log('--- two that fit, close, release, reopen, due ---');
const dana2 = R.owe(loop({ id: 't3' }), ON);
check('two owed receipts that fit equally: silence', R.judge([dana, dana2], sent, ON) === null);
check('a closed one is not judged again', R.judge([Object.assign({}, dana, { status: 'closed' })], sent, ON) === null);
const p = R.closePatch(dana, c1, { id: 'm-77', fetchedBack: true }, PAID + 1000);
check('the close keeps the message id as proof, not its text', p.status === 'closed' && p.closedAs === 'delivered' && p.proof.externalId === 'm-77' && p.proof.fetchedBack === true && p.proof.kind === 'own' && !('text' in p.proof), p);
check('fetchedBack is false unless the caller read it back', R.closePatch(dana, c1, { id: 'm-77' }).proof.fetchedBack === false);
const rel = R.releasePatch('already an invoice-receipt', PAID);
check('a deliberate release is a close with its reason', rel.status === 'closed' && rel.closedAs === 'released' && rel.releaseReason === 'already an invoice-receipt');
const back = Object.assign({}, dana, p, R.reopenPatch());
check('reopen puts it back open with no proof', back.status === 'open' && back.proof === null && Boolean(R.judge([back], sent, ON)));
const d = R.due([dana, Object.assign({}, dana2, { chaseIso: '2026-10-30' }), Object.assign({}, dana, { id: 'x', status: 'closed' })], new Date('2026-11-02T09:00:00').getTime());
check('due lists open ones past their chase day, oldest first', d.length === 2 && d[0].id === dana2.id, d.map((x) => x.id));

console.log('--- Wednesday edge cases (Hebrew and English) ---');
const maya = R.owe(loop({ id: 't9', lang: 'en', counterpart: { email: 'maya@mayastudio.co.il', name: 'Maya Studio' }, amount: { value: 2000, currency: 'ILS' }, what: 'payment for the retainer' }), ON);
const ic = (text, extra) => Object.assign({ dir: 'in', fromEmail: 'no-reply@icount.co.il', text }, extra || {});
check('"emailed to Maya Studio" is an issued receipt', Boolean(R.judge([maya], ic('Receipt 0048 for ₪2,000 has been emailed to Maya Studio.'), ON)));
check('"delivered to" too', Boolean(R.judge([maya], ic('Your receipt was delivered to Maya Studio.'), ON)));
check('one distinctive word is not the payer ("Maya Levi" is not "Maya Studio")', R.judge([maya], ic('Receipt 0049 for ₪2,000 was sent to Maya Levi.'), ON) === null);
check('the payer\'s address in the copy names them', Boolean(R.judge([maya], ic('Receipt 0050 was sent to maya@mayastudio.co.il'), ON)));
check('a supplier\'s receipt delivered to the person by the same system is not proof (English)', R.judge([maya], ic('Maya Studio has sent you a receipt for ₪2,000.'), ON) === null);
check('…nor in Hebrew («שלחה לך קבלה»)', R.judge([dana], iss('דנה כהן שלחה לך קבלה על סך 3,850 ₪'), ON) === null);
check('«נשלחה אליך» is to the person, not to the payer', R.judge([dana], iss('קבלה מדנה כהן נשלחה אליך'), ON) === null);
check('a VAT figure next to the right total still fits', Boolean(R.judge([dana], iss('קבלה על סך 3,850 ₪ (מתוכם מע"מ 587 ₪) נשלחה אל דנה כהן'), ON)));
check('a decimal total fits («3,850.00 ₪»)', Boolean(R.judge([dana], iss('קבלה על סך 3,850.00 ₪ נשלחה אל דנה כהן'), ON)));
check('half of the amount (an installment) stays open', R.judge([dana], iss('קבלה על סך 1,925 ₪ נשלחה אל דנה כהן'), ON) === null);
check('a receipt sent with several files counts when one is the receipt', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפים', attachments: ['לוגו סופי.png', 'קבלה_0045.pdf'] }, ON)));
check('a plural «קבלות» file counts', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורף', attachments: ['קבלות אוקטובר.pdf'] }, ON)));
check('«קבלת קהל» in a file name is not a receipt', R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורף', attachments: ['שעות קבלת קהל.pdf'] }, ON) === null);
check('a receipt with a refund in the message stays open', R.judge([maya], { dir: 'out', toEmail: 'maya@mayastudio.co.il', text: 'Here is the receipt for the refund.', attachments: ['receipt.pdf'] }, ON) === null);
check('a dollar amount in the message is another amount', R.judge([maya], { dir: 'out', toEmail: 'maya@mayastudio.co.il', text: 'Attached is the receipt for $2,000.', attachments: ['receipt.pdf'] }, ON) === null);
let list = R.merge([], dana);
list = R.merge(list, R.owe(loop(), ON));
check('a payment loop closed twice (reopened and closed again) owes one receipt', list.length === 1);
check('a different loop adds a second one', R.merge(list, dana2).length === 2);
const sentOne = Object.assign({}, dana2, { status: 'closed', closedAs: 'delivered' });
const after = R.withdraw([dana, sentOne], 't1');
check('Undo of "paid" withdraws the open receipt for that loop only', after.length === 1 && after[0].id === dana2.id);
check('a receipt already sent stays after Undo of its loop', R.withdraw([sentOne], 't3').length === 1);
check('a 4-digit number with no currency is not read as another amount', Boolean(R.judge([dana], { dir: 'out', toEmail: 'dana.cohen@gmail.com', text: 'מצורפת קבלה מס 2026 על הלוגו', attachments: ['קבלה.pdf'] }, ON)));

console.log('--- real-user A/B: dormant, counts only ---');
const { FlowPmfMetrics: P } = require('../core/pmf-metrics.js');
check('the receipt-owed experiment exists with arms A and B', P.EXPERIMENTS['receipt-owed'] && P.EXPERIMENTS['receipt-owed'].arms.join() === 'A,B');
check('no arm without the switch (null = behave as today, count nothing)', P.assignVariant('install-12345678', 'receipt-owed', {}) === null && P.assignVariant('install-12345678', 'receipt-owed', { enabled: false }) === null);
const arm1 = P.assignVariant('install-12345678', 'receipt-owed', { enabled: true });
check('the same install always gets the same arm', ['A', 'B'].indexOf(arm1) >= 0 && arm1 === P.assignVariant('install-12345678', 'receipt-owed', { enabled: true }));
let ab = {};
['receipt_paid_close', 'receipt_paid_close', 'receipt_owed_opened', 'receipt_owed_opened', 'receipt_sent_seen', 'receipt_owed_past_due'].forEach((e) => { ab = P.foldAbEvent(ab, 'receipt-owed', 'B', e); });
ab = P.foldAbEvent(ab, 'receipt-owed', 'A', 'receipt_paid_close');
ab = P.foldAbEvent(ab, 'receipt-owed', 'B', 'a free-text event never counts');
const snap = P.abSnapshot(ab, 'receipt-owed');
check('per-arm rates with their n: receipts sent per paid loop', snap.B.receiptPaid === 2 && snap.B.receiptSent === 0.5 && snap.B.receiptPastDue === 0.5 && snap.A.receiptPaid === 1 && snap.A.receiptSent === 0, snap);
check('a rate on zero is null, never 0', snap.A.receiptPastDue === null && snap.B.receiptWrongClose === 0 && P.abSnapshot({}, 'receipt-owed').B.receiptSent === null);
check('an unknown event changes nothing', Object.keys(snap.B.counts).length === 4);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall receipt-owed checks passed');
process.exit(failures ? 1 : 0);
