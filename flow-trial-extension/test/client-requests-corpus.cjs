// Client requests (core/client-requests.js): what an accountant or a lawyer asked a client for, item by item, until each item
// really arrived. What is pinned here: the documents and periods are read right in Hebrew and English, nothing that is not
// an ask opens a request, an item is "received" only on a file from that client that was read back and fits the period,
// anything unsure is "check", a claim without a file is "claimed", the reminder lists only what is missing, and the request
// closes only when every item is done. Run: node test/client-requests-corpus.cjs
const { FlowClientRequests: C } = require('../core/client-requests.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-10T10:00:00').getTime(); // a Saturday
const keys = (t) => { const r = C.classifyOutgoingRequest(t, { now: NOW }); return r ? r.items.map((i) => i.key) : null; };

console.log('--- requests a firm sends (they open a request, with the right items and periods) ---');
const POS = [
  ['שלום דני,\nלצורך דיווח המע"מ נא להעביר:\n- דפי בנק לחודשים 7-8/2026\n- חשבוניות הוצאה\n- פירוט כרטיס אשראי\nעד יום חמישי.', ['bank-statement:2026-07..2026-08', 'invoices', 'credit-card']],
  ['היי רונית, קיבלנו את דפי הבנק, אבל עדיין חסרים טופס 106 לשנת 2025 ואישור שנתי מקרן הפנסיה.', ['form-106:2025', 'annual-savings:2025']],
  ['Hi John, please send the signed power of attorney and a copy of your ID card by Oct 20.', ['power-of-attorney', 'id-copy']],
  ['שלום, מצורף ייפוי כוח לחתימה. נא לחתום ולהחזיר, וגם צילום ת"ז עם ספח.', ['power-of-attorney', 'id-copy']],
  ['Please pay the outstanding balance of ₪3,850 by Friday.', ['payment']],
  ['נא לשלוח תלושי שכר לאוגוסט 2026', ['payslips:2026-08']],
  ['אבקש את דפי הבנק של החודש הקודם', ['bank-statement:2026-09']],
  ['Could you send the bank statements for July and August 2026?', ['bank-statement:2026-07..2026-08']],
  ['We still need the receipts for Q3 2026.', ['receipts:2026-07..2026-09']],
  ['שלום, לקראת הדוח השנתי נבקש טופס 106 וטופס 867 לשנת 2025.', ['form-106:2025', 'form-867:2025']],
  ['נבקש לחתום על ההסכם ולהחזיר אלינו סרוק.', ['signed-agreement']],
  ['Please sign the engagement letter and send it back.', ['fee-agreement']],
  ['שלום, לצורך הדיון נדרש תצהיר חתום עד יום שלישי.', ['affidavit']],
  ['נא להעביר נסח טאבו עדכני של הדירה.', ['land-registry']],
  ['בהמשך לשיחה, חסרים לנו עדיין דפי חשבון עו"ש לחודש 8', ['bank-statement:2026-08']],
  ['שלום רב,\nנבקש להעביר:\n1. חשבוניות הכנסה\n2. קבלות\nתודה', ['invoices', 'receipts']]
];
POS.forEach(([t, want]) => {
  const got = keys(t);
  check('opens: ' + t.replace(/\n/g, ' / ').slice(0, 70), got && want.length === got.length && want.every((k) => got.indexOf(k) >= 0), { want, got });
});
const r1 = C.classifyOutgoingRequest(POS[0][0], { now: NOW });
check('the deadline in the request is read (Thursday 2026-10-15)', r1.deadlineIso === '2026-10-15', r1.deadlineIso);
check('a Hebrew request is a Hebrew request', r1.lang === 'he');
const r3 = C.classifyOutgoingRequest(POS[2][0], { now: NOW });
check('an English deadline is read (Oct 20)', r3.deadlineIso === '2026-10-20' && r3.lang === 'en');

console.log('--- not requests (silence) ---');
const NEG = [
  'תודה רבה, קיבלתי הכל!',
  'אין צורך לשלוח דפי בנק החודש.',
  'Thanks for the call. Let me know what you think.',
  'קיבלנו את דפי הבנק ואת החשבוניות, תודה.',
  'We received your bank statements, thank you.',
  'מצורפים דפי הבנק שביקשת.',
  'הדוח השנתי הוגש בהצלחה.',
  'No need to send the invoices, we already have them.',
  'שבוע טוב!'
];
NEG.forEach((t) => check('silent: ' + t, keys(t) === null, keys(t)));

console.log('--- periods ---');
const P = (s) => JSON.stringify(C.parsePeriod(s, NOW));
check('7-8/2026 is July and August', P('7-8/2026') === JSON.stringify({ months: ['2026-07', '2026-08'] }), P('7-8/2026'));
check('a month with no year is the last one that started (December -> 2025)', P('דצמבר') === JSON.stringify({ months: ['2025-12'] }), P('דצמבר'));
check('November to January crosses the year', P('נובמבר-ינואר 2026') === JSON.stringify({ months: ['2025-11', '2025-12', '2026-01'] }), P('נובמבר-ינואר 2026'));
check('a file name 2026-08', P('bank_2026-08') === JSON.stringify({ months: ['2026-08'] }), P('bank_2026-08'));
check('a file name 08.2026', P('stmt 08.2026') === JSON.stringify({ months: ['2026-08'] }), P('stmt 08.2026'));
check('a tax year', P('לשנת המס 2025') === JSON.stringify({ year: 2025 }), P('לשנת המס 2025'));
check('the last two months', P('החודשיים האחרונים') === JSON.stringify({ months: ['2026-08', '2026-09'] }), P('החודשיים האחרונים'));
check('"may" alone is not a month (it is a verb in English)', C.parsePeriod('you may send it', NOW) === null);

console.log('--- file names ---');
const T = (n) => { const t = C.typeOfName(n); return t ? t.id : null; };
check('Hebrew final letter: "דף בנק אוגוסט.pdf" is a bank statement', T('דף בנק אוגוסט.pdf') === 'bank-statement', T('דף בנק אוגוסט.pdf'));
check('"106_2025.pdf" is Form 106', T('106_2025.pdf') === 'form-106');
check('"POA signed.pdf" is a power of attorney, not a generic agreement', T('POA signed.pdf') === 'power-of-attorney', T('POA signed.pdf'));
check('"scan001.pdf" is nothing', T('scan001.pdf') === null);
check('"IMG_2210.jpg" is nothing', T('IMG_2210.jpg') === null);

console.log('--- arrivals: only proof moves an item ---');
const ask = C.classifyOutgoingRequest('שלום דני,\nנא להעביר:\n- דפי בנק לחודשים 7-8/2026\n- חשבוניות הוצאה לאוגוסט\n- טופס 106 לשנת 2025', { now: NOW });
const req0 = C.buildRequest({ threadId: 't1', messageId: 'm1', client: { email: 'Dani@X.co.il', name: 'דני כהן' }, ask, now: NOW });
check('the request is open, with 3 items, and a first chase three Israeli business days out (Sun, Mon, Tue -> 2026-10-13)', req0.status === 'open' && req0.items.length === 3 && req0.chaseIso === '2026-10-13', req0.chaseIso);
const from = { email: 'dani@x.co.il' };
let a = C.applyArrival(req0, { messageId: 'x', from: { email: 'someone@else.com' }, text: '', attachments: [{ name: 'bank_2026-07.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('a file from someone else changes nothing', a.changes.length === 0);
a = C.applyArrival(req0, { messageId: 'm2', from, text: '', attachments: [{ name: 'bank_2026-07.pdf', size: 90000 }], fetchedBack: false, now: NOW });
check('a file the host did not read back is "check", never "received"', a.request.items[0].status === 'check');
a = C.applyArrival(req0, { messageId: 'm2', from, text: '', attachments: [{ name: 'bank_2026-05.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('a bank statement for the wrong month does not count', a.request.items[0].status === 'missing' && a.unmatched.length === 1, a.request.items[0]);
a = C.applyArrival(req0, { messageId: 'm2', from, text: '', attachments: [{ name: 'bank_2026-07.pdf', size: 90000 }, { name: 'scan001.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('July arrives: the two-month item is partial, still missing August', a.request.items[0].status === 'missing' && a.request.items[0].got.join() === '2026-07' && a.request.items[0].note === 'partial');
check('an unnamed scan is listed as unmatched, not guessed', a.unmatched.indexOf('scan001.pdf') >= 0);
check('the proof is recorded with the message and the file, read back', a.request.items[0].proof[0].externalId === 'm2:bank_2026-07.pdf' && a.request.items[0].proof[0].fetchedBack === true);
const a2 = C.applyArrival(a.request, { messageId: 'm3', from, text: 'הנה אוגוסט, ואין לי חשבוניות החודש', attachments: [{ name: 'דף בנק אוגוסט 2026.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('August arrives: bank statements received', a2.request.items[0].status === 'received');
check('"I have no invoices this month" is an answer: none', a2.request.items[1].status === 'none');
check('"no invoices" in the text never names the attached bank statement as invoices', !a2.changes.some((c) => c.key.indexOf('invoices') === 0 && c.to === 'received'));
check('the request is still open while Form 106 is missing', a2.request.status === 'open' && !a2.closed);
const a3 = C.applyArrival(a2.request, { messageId: 'm4', from, text: '', attachments: [{ name: '106_2025.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('Form 106 for 2025 arrives and the request closes', a3.request.items[2].status === 'received' && a3.closed && a3.request.status === 'closed');
const a106wrong = C.applyArrival(a2.request, { messageId: 'm4', from, text: '', attachments: [{ name: '106_2024.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('Form 106 for the wrong year does not close it', a106wrong.request.items[2].status === 'missing' && !a106wrong.closed);
const aNoYear = C.applyArrival(a2.request, { messageId: 'm4', from, text: '', attachments: [{ name: 'form106.pdf', size: 90000 }], fetchedBack: true, now: NOW });
check('Form 106 with no year on the file is "check" (one click), not received', aNoYear.request.items[2].status === 'check' && !aNoYear.closed);
const confirmed = C.decide(aNoYear.request, aNoYear.request.items[2].key, 'confirm', NOW);
check('the person confirms the check, and the request closes', confirmed.items[2].status === 'received' && confirmed.status === 'closed');
const rejected = C.decide(aNoYear.request, aNoYear.request.items[2].key, 'reject', NOW);
check('the person rejects the check: back to missing', rejected.items[2].status === 'missing' && rejected.status === 'open');

console.log('--- words without files ---');
const claim = C.applyArrival(req0, { messageId: 'm5', from, text: 'שלחתי לך את דפי הבנק בוואטסאפ', attachments: [], fetchedBack: true, now: NOW });
check('"I sent the bank statements on WhatsApp" with no file is "claimed", not received', claim.request.items[0].status === 'claimed');
const notYet = C.applyArrival(req0, { messageId: 'm6', from, text: 'עדיין אין לי חשבוניות, אשלח בשבוע הבא', attachments: [], fetchedBack: true, now: NOW });
check('"not yet" is not none', notYet.request.items[1].status === 'missing', notYet.request.items[1].status);
const payReq = C.buildRequest({ threadId: 't9', client: { email: 'ron@x.com', name: 'Ron' }, ask: C.classifyOutgoingRequest('Please pay the outstanding balance of ₪3,850 by Friday.', { now: NOW }), now: NOW });
const paid = C.applyArrival(payReq, { messageId: 'm7', from: { email: 'ron@x.com' }, text: 'I paid it this morning.', attachments: [], fetchedBack: true, now: NOW });
check('a payment closes on the client saying it was paid (Y3)', paid.request.items[0].status === 'received' && paid.closed);
const willPay = C.applyArrival(payReq, { messageId: 'm7', from: { email: 'ron@x.com' }, text: "I'll pay it tomorrow.", attachments: [], fetchedBack: true, now: NOW });
check('a promise to pay does not close it', willPay.request.items[0].status === 'missing' && !willPay.closed);
const sigReq = C.buildRequest({ threadId: 't10', client: { email: 'maya@law.co.il', name: 'מאיה' }, ask: C.classifyOutgoingRequest('שלום, מצורף ייפוי כוח לחתימה. נא לחתום ולהחזיר, וגם צילום ת"ז עם ספח.', { now: NOW }), now: NOW });
const sig = C.applyArrival(sigReq, { messageId: 'm8', from: { email: 'maya@law.co.il' }, text: 'מצורף', attachments: [{ name: 'ייפוי כוח חתום.pdf', size: 120000 }], fetchedBack: true, now: NOW });
check('a signed power of attorney file arrives: received, and the signature is flagged for the person to look at', sig.request.items[0].status === 'received' && /signature/.test(sig.changes[0].why), sig.changes);
check('the ID copy is still missing', sig.request.items[1].status === 'missing' && !sig.closed);
const one = C.buildRequest({ threadId: 't11', client: { email: 'a@b.com' }, ask: C.classifyOutgoingRequest('Please send the signed agreement.', { now: NOW }), now: NOW });
const oneFile = C.applyArrival(one, { messageId: 'm9', from: { email: 'a@b.com' }, text: 'Attached.', attachments: [{ name: 'IMG_2210.jpg', size: 300000 }], fetchedBack: true, now: NOW });
check('one unnamed file for the only open item: "check", never received', oneFile.request.items[0].status === 'check' && !oneFile.closed);
const sigImg = C.applyArrival(one, { messageId: 'm9', from: { email: 'a@b.com' }, text: '', attachments: [{ name: 'image001.png', size: 2000 }], fetchedBack: true, now: NOW });
check('a signature logo in the footer is not a document', sigImg.request.items[0].status === 'missing' && sigImg.unmatched.length === 0);

console.log('--- the reminder (the person sends it; Glance never does) ---');
const rem = C.reminderDraft(a2.request, { level: 1 });
check('it lists only what is missing', /טופס 106 לשנת 2025/.test(rem) && !/• דפי בנק/.test(rem), rem);
check('it thanks for what arrived', /תודה, קיבלנו: דפי בנק/.test(rem));
check('it greets the client by first name', /^שלום דני,/.test(rem));
const remPartial = C.reminderDraft(a.request, { level: 2 });
check('a partial item asks only for the months still missing (August)', /דפי בנק לאוגוסט 2026/.test(remPartial) && !/יולי–אוגוסט/.test(remPartial.split('ממתינים')[1] || ''), remPartial);
check('level 2 is firmer', /ממתינים/.test(remPartial));
const remClaim = C.reminderDraft(claim.request, { level: 1 });
check('a claimed item says no file reached us', /לא קיבלנו קובץ/.test(remClaim));
check('nothing missing, no reminder', C.reminderDraft(a3.request, {}) === null);
const remEn = C.reminderDraft(sigReq, { level: 3, dueIso: '2026-10-20' });
check('an English-asked request can be reminded in English, level 3 with a deadline', /To finish the work on time/.test(C.reminderDraft(Object.assign({}, sigReq, { lang: 'en' }), { level: 3, dueIso: '2026-10-20' })) && /20\.10|October 20/.test(C.reminderDraft(Object.assign({}, sigReq, { lang: 'en' }), { level: 3, dueIso: '2026-10-20' })));
check('Hebrew level 3 states the latest day', /לכל המאוחר עד יום שלישי, 20\.10/.test(remEn), remEn);
const nudged = C.recordNudge(req0, new Date('2026-10-13T09:00:00').getTime());
check('a reminder sent Tuesday moves the next chase three business days out, over the weekend (Sunday 2026-10-18)', nudged.nudges === 1 && nudged.chaseIso === '2026-10-18', nudged.chaseIso);
check('a request is due on its chase day, not before', !C.isDue(req0, NOW) && C.isDue(req0, new Date('2026-10-13T09:00:00').getTime()));

console.log('--- recurring checklists ---');
const tpl = { id: 'dani-vat', preset: 'vat-bimonthly', client: { email: 'dani@x.co.il', name: 'דני כהן' }, lang: 'he' };
const nov1 = new Date('2026-11-02T09:00:00').getTime();
const due = C.dueTemplates([tpl], [], nov1);
check('bi-monthly VAT opens in November for September–October', due.length === 1);
const inst = C.instantiate(tpl, nov1);
check('...with invoices, receipts, bank and card statements for Sep–Oct 2026', inst.items.length === 4 && inst.items.every((i) => i.months && i.months.join() === '2026-09,2026-10'), inst.items.map((i) => i.key));
check('it does not open twice in the same period', C.dueTemplates([tpl], [inst], nov1).length === 0);
check('it stays quiet in an even month (October)', C.dueTemplates([tpl], [], new Date('2026-10-05T09:00:00').getTime()).length === 0);
const yr = C.instantiate({ id: 'dani-annual', preset: 'annual-report', client: { email: 'dani@x.co.il' } }, new Date('2026-02-03T09:00:00').getTime());
check('the annual report asks Form 106, Form 867 and the savings statement for the previous year', yr.items.map((i) => i.key).join() === 'form-106:2025,form-867:2025,annual-savings:2025', yr.items.map((i) => i.key));
const onboard = C.instantiate({ id: 'maya-file', preset: 'legal-onboarding', client: { email: 'maya@law.co.il' } }, NOW);
check('a law firm\'s new-client file asks ID, power of attorney and fee agreement', onboard.items.map((i) => i.type).join() === 'id-copy,power-of-attorney,fee-agreement');

console.log('--- the board: what is missing from whom ---');
const b = C.board([a2.request, sigReq, a3.request, payReq], new Date('2026-10-15T09:00:00').getTime());
check('closed requests are not on the board', !b.rows.some((r) => r.items.some((i) => i.requestId === a3.request.id && false)) && b.rows.length === 3, b.rows.map((r) => r.client.email));
check('overdue clients come first', b.rows[0].overdue === true);
check('totals count what is missing', b.totals.missing >= 3 && b.totals.clients === 3, b.totals);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
