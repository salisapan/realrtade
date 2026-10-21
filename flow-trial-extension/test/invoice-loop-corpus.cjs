// The invoice you sent is the open loop (core/outside-signals.js invoiceLoop, switch CARRY.invoices in config/carry.public.js, off).
// A freelancer sends "מצורפת חשבונית 1044 על סך 3,850 ₪" and never writes "please pay": today nothing tracks that money.
// Pinned here: switch off = nothing; the invoices that should open a loop do, with the right amount and due day; receipts, quotes,
// credit notes, invoices to the accountant, forwards and "I'll send the invoice" stay quiet; an explicit ask stays on today's path;
// and the loop closes only through the existing payment closers (their "paid" reply, a bank email for the amount, the same on
// WhatsApp). Prints the A/B table (A = today's follow loop, B = today's + invoiceLoop). Run: node test/invoice-loop-corpus.cjs
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowOutsideSignals: S } = require('../core/outside-signals.js');
const { FlowCrossChannel: X } = require('../core/cross-channel.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 86400000;
const NOW = new Date('2026-10-18T10:00:00').getTime(); // a Sunday
const ctx = { now: NOW, extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline };
const ON = (extra) => Object.assign({ enabled: true, now: NOW }, extra || {});

// [lang, text, opts, expected amount value (null = must stay quiet), expected due day or null]
const OPEN = [
  ['he', 'היי דנה, מצורפת חשבונית מס 1044 על סך 3,850 ₪ עבור עבודת ספטמבר. תודה!', {}, 3850, null],
  ['he', 'שלום, מצ"ב חשבונית עסקה על 12,000 ש"ח. תנאי תשלום שוטף +30.', {}, 12000, '2026-11-30'],
  ['he', 'מצורפת חשבונית לחודש אוקטובר. סה"כ 4,200 ₪ כולל מע"מ.', {}, 4200, null],
  ['he', 'היי, מצרפת דרישת תשלום על סך 2,300 ₪. לתשלום עד 15/11.', {}, 2300, '2026-11-15'],
  ['he', 'אהלן רונית, מצורפת החשבונית על 5,000 ₪ + מע"מ. תוך 14 יום, תודה!', {}, 5900, '2026-11-01'],
  ['he', 'שולחת לך את החשבונית על הייעוץ, 1,800 ₪. תודה רבה', {}, 1800, null],
  ['he', 'בוקר טוב, מצ״ב חשבונית מספר 2207 בסך 7,350 ₪. מועד תשלום: 1.12', {}, 7350, '2026-12-01'],
  ['he', 'היי, הנה החשבונית לחודש הזה: 950 ₪.', { attachmentNames: ['חשבונית-950.pdf'] }, 950, null],
  ['en', 'Hi Dana, attached is invoice #1044 for $3,850 for the September work. Thanks!', {}, 3850, null],
  ['en', 'Please find attached our invoice INV-2209, total €2,400, due in 30 days.', {}, 2400, '2026-11-17'],
  ['en', 'Invoice attached, $1,200 for the logo package. Payment details are on the invoice.', {}, 1200, null],
  ['en', 'Hi Tom, here is the invoice for October: £640. Net 15.', {}, 640, '2026-11-02'],
  ['en', 'Hi, sending you the invoice for the workshop, $2,750. Payment due by November 15.', {}, 2750, '2026-11-15'],
  ['en', 'Thanks for a great project! Invoice 3381 is attached ($9,900), payable upon receipt.', {}, 9900, '2026-10-25']
];
const QUIET = [
  ['he', 'מצורפת קבלה על התשלום של 3,850 ₪. תודה!', {}],
  ['he', 'מצ"ב חשבונית מס קבלה 1044 על סך 3,850 ₪, התשלום התקבל.', {}],
  ['he', 'מצורפת הצעת מחיר על סך 12,000 ₪ לפרויקט.', {}],
  ['he', 'מצורפת חשבונית זיכוי על 500 ₪.', {}],
  ['he', 'היי יעל, מצורפות החשבוניות של החודש לדיווח מע"מ, סה"כ 18,400 ₪.', {}],
  ['he', 'אשלח לך את החשבונית על 3,850 ₪ מחר בבוקר.', {}],
  ['he', 'מצורפת חשבונית. תודה!', {}],
  ['he', '---------- הודעה שהועברה ----------\nמצורפת חשבונית על 2,000 ₪ מהספק', {}],
  ['he', 'מצורפת חשבונית על 3,000 ₪, ובנוסף חשבונית על 1,500 ₪ לפרויקט השני.', {}],
  ['en', 'Attached is the receipt for your payment of $3,850. Thank you!', {}],
  ['en', 'Please find attached our quote for $12,000.', {}],
  ['en', 'Attached is a credit note for $500.', {}],
  ['en', 'Hi Sarah (accountant), attached are this month\'s invoices for your records, total $18,400.', {}],
  ['en', "I'll send the invoice for $3,850 tomorrow.", {}],
  ['en', 'Invoice attached. Thanks!', {}],
  ['en', '---------- Forwarded message ---------\nAttached invoice for $2,000 from our supplier', {}],
  ['en', 'Great talking today! The invoice will follow next week, around $3,000.', {}],
  ['en', 'Thanks, the invoice has been paid in full ($3,850).', {}]
];

console.log('--- switch off: nothing ---');
check('every off form returns null on every text', OPEN.concat(QUIET).every(([, t]) => [undefined, {}, { enabled: false }, { enabled: 'true' }].every((o) => S.invoiceLoop(t, o) === null)));

console.log('--- the invoices that should open a loop ---');
const tally = {};
const bump = (arm, lang, k, n) => { const key = arm + '|' + lang; tally[key] = tally[key] || { n: 0, opened: 0, missed: 0, wrongLoop: 0, newWrongLoop: 0, asked: 0, wrongAmount: 0, wrongDue: 0, closed: 0, money: 0 }; tally[key][k] += (n === undefined ? 1 : n); };
const loops = [];
OPEN.forEach(([lang, text, extra, amount, due], i) => {
  const a = F.classifyOutgoing(text, ctx);
  const b = a || S.invoiceLoop(text, ON(extra));
  ['all', lang].forEach((l) => {
    bump('A', l, 'n'); bump('B', l, 'n');
    if (a) { bump('A', l, 'opened'); bump('A', l, 'money', a.amount ? a.amount.value : 0); } else bump('A', l, 'missed');
    if (b) { bump('B', l, 'opened'); bump('B', l, 'money', b.amount ? b.amount.value : 0); } else bump('B', l, 'missed');
    if (b && (!b.amount || Math.abs(b.amount.value - amount) > 0.01)) bump('B', l, 'wrongAmount');
    if (b && !a && b.deadlineIso !== due) bump('B', l, 'wrongDue');
  });
  check('opens: "' + text.slice(0, 50) + '" → ' + amount + (due ? ' due ' + due : ''), b && b.amount && Math.abs(b.amount.value - amount) < 0.01 && (a || b.deadlineIso === due), b && { amount: b.amount, due: b.deadlineIso, basis: b.basis || 'today' });
  if (b) loops.push({ i, lang, text, ask: b, today: Boolean(a) });
});
check('an explicit "please pay" stays on today\'s path (B adds nothing to it)', F.classifyOutgoing('Hi Tom, could you please pay invoice 1044 ($3,850) by Friday?', ctx) !== null);

console.log('--- the ones that must stay quiet ---');
QUIET.forEach(([lang, text, extra]) => {
  const a = F.classifyOutgoing(text, ctx);
  const b = a || S.invoiceLoop(text, ON(extra));
  const added = !a && S.invoiceLoop(text, ON(extra));
  ['all', lang].forEach((l) => { bump('A', l, 'n', 0); if (a) bump('A', l, 'wrongLoop'); if (b) bump('B', l, 'wrongLoop'); if (added) bump('B', l, 'newWrongLoop'); });
  check('quiet: "' + text.replace(/\n/g, ' ').slice(0, 55) + '"', !S.invoiceLoop(text, ON(extra)), S.invoiceLoop(text, ON(extra)));
});

console.log('--- the loop closes only on a real payment signal ---');
let graph = I.empty();
graph = I.observe(graph, { app: 'contacts', email: 'dana@client.co.il', phone: '+972501112233', name: 'Dana Cohen' }, NOW - 90 * DAY).graph;
const SYM = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
const money = (w) => { const v = w.amount.value.toLocaleString('en-US'); return w.amount.currency === 'ILS' ? v + ' ₪' : SYM[w.amount.currency] + v; };
// 'close' | 'ask' | 'none' for each real payment signal, in the loop's language and currency.
const CLOSERS = [
  ['reply', (w) => { const r = F.classifyReply(w.lang === 'he' ? 'שילמתי הבוקר, תודה!' : 'Paid this morning, thanks!', w, { now: NOW + 3 * DAY, extract: FlowExtract }); const res = F.applyReply(w, r, NOW + 3 * DAY); return res && res.close ? 'close' : res && res.confirm ? 'ask' : 'none'; }],
  ['bank or PayPal', (w) => {
    const ev = w.amount.currency === 'ILS'
      ? S.paymentEvidence('התקבלה העברה בסך ' + money(w).replace(' ₪', ' ש"ח') + ' מ' + (w.lang === 'he' ? 'דנה כהן' : 'Dana Cohen') + ' לחשבונך.', 'noreply@bankhapoalim.co.il')
      : S.paymentEvidence('You have received ' + money(w) + ' from Dana Cohen. The money is now in your PayPal balance.', 'service@paypal.com');
    const m = S.matchPayment([w], ev, NOW + 5 * DAY);
    return !m ? 'none' : m.strength === 'strong' ? 'close' : 'ask'; }],
  ['WhatsApp', (w) => { const d = X.judge([w], graph, { app: 'whatsapp', phone: '+972501112233', name: 'Dana Cohen' }, (w.lang === 'he' ? 'העברתי לך עכשיו ' : 'I just transferred the ') + money(w), { channel: 'whatsapp', thread: 'wa' }, { now: NOW + 4 * DAY, extract: FlowExtract }); return d && d.action === 'close' ? 'close' : d ? 'ask' : 'none'; }]
];
const closeCount = { A: 0, B: 0 };
loops.forEach((L) => {
  const w = Object.assign(F.buildWatch({ threadId: 'inv' + L.i, ask: L.ask, counterpart: { email: 'dana@client.co.il', name: L.lang === 'he' ? 'דנה כהן' : 'Dana Cohen' }, now: NOW }), { amountNet: L.ask.amountNet || null });
  CLOSERS.forEach(([how, fn]) => {
    const got = fn(w);
    check('a real payment via ' + how + ' closes it, or asks once: "' + L.text.slice(0, 40) + '"', got === 'close' || got === 'ask', got);
    ['all', L.lang].forEach((l) => {
      if (got === 'close') { bump('B', l, 'closed'); if (L.today) bump('A', l, 'closed'); }
      if (got === 'ask') { bump('B', l, 'asked'); if (L.today) bump('A', l, 'asked'); }
    });
  });
});
{
  const wEn = F.buildWatch({ threadId: 'en', ask: S.invoiceLoop(OPEN[8][1], ON()), counterpart: { email: 'dana@client.co.il', name: 'Dana Cohen' }, now: NOW });
  const d = X.judge([wEn], graph, { app: 'whatsapp', phone: '+972501112233', name: 'Dana Cohen' }, 'Just sent you $3,850', { channel: 'whatsapp', thread: 'wa' }, { now: NOW + 4 * DAY, extract: FlowExtract });
  check('known miss (core/follow-up.js reply words, not this module): "Just sent you $3,850" is not read as paid, so the loop stays open', !d || d.action !== 'close', d);
}
const net = S.invoiceLoop('אהלן רונית, מצורפת החשבונית על 5,000 ₪ + מע"מ. תוך 14 יום, תודה!', ON());
const wNet = Object.assign(F.buildWatch({ threadId: 'net', ask: net, counterpart: { email: 'r@x.co.il', name: 'Ronit Levi' }, now: NOW }), { amountNet: net.amountNet });
check('"+ מע"מ": a bank transfer of the net 5,000 also matches (the client may pay either)', Boolean(S.matchPayment([wNet], S.paymentEvidence('התקבלה העברה בסך 5,000 ש"ח מרונית לוי לחשבונך.', 'noreply@leumi.co.il'), NOW + DAY)));
check('a different amount does not close it', !S.matchPayment([wNet], S.paymentEvidence('התקבלה העברה בסך 4,000 ש"ח מרונית לוי לחשבונך.', 'noreply@leumi.co.il'), NOW + DAY));
const plain = Object.assign({}, wNet, { amountNet: null });
check('a loop with no amountNet matches exactly as before', !S.matchPayment([plain], S.paymentEvidence('התקבלה העברה בסך 5,000 ש"ח מרונית לוי לחשבונך.', 'noreply@leumi.co.il'), NOW + DAY));
const wHe = F.buildWatch({ threadId: 'x', ask: S.invoiceLoop(OPEN[0][1], ON()), counterpart: { email: 'dana@client.co.il', name: 'Dana Cohen' }, now: NOW });
check('a thank-you that does not say paid keeps it open', !F.applyReply(wHe, F.classifyReply('תודה, קיבלתי', wHe, { now: NOW + DAY, extract: FlowExtract }), NOW + DAY).close);
check('the loop is a payment loop, theirs, labelled with the invoice number', wHe.kind === 'payment' && wHe.direction === 'theirs' && /1044/.test(wHe.what) && wHe.lang === 'he');
check('no terms: no deadline, first look in 14 days', wHe.deadlineIso === null && wHe.chaseIso === '2026-11-01', wHe);

console.log('\n| arm | lang | invoices sent | loop opened | missed | wrong loop (on ' + QUIET.length + ' quiet; B adds) | wrong amount | wrong due day | payment signals closed / asked (3 per loop) | money tracked |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const fmt = (v) => Math.round(v).toLocaleString('en-US');
['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => {
  const t = tally[arm + '|' + l];
  console.log('| ' + arm + ' | ' + l + ' | ' + t.n + ' | ' + t.opened + ' | ' + t.missed + ' | ' + t.wrongLoop + (arm === 'B' ? ' (' + t.newWrongLoop + ' new)' : '') + ' | ' + t.wrongAmount + ' | ' + t.wrongDue + ' | ' + t.closed + ' / ' + t.asked + ' | ' + fmt(t.money) + ' |');
}));
console.log('(money tracked mixes currencies: a count of value, not a sum to quote)');
check('B adds zero wrong loops on the quiet set (today already opens ' + tally['A|all'].wrongLoop + ': "I\'ll send the invoice" read as money owed)', tally['B|all'].newWrongLoop === 0, tally['B|all']);

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
