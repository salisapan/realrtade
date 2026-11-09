// The refund you asked for, carried until the money is really back (core/refund-loop.js, switch REFUND_LOOP, off; not on
// the labs list yet). Pinned: switch off = nothing; the person's own request to a business opens a loop with the merchant,
// amount and order; a policy question, a hedge, thanks for a refund, a promise to refund someone, and a private address do
// not; the merchant's reply moves the stage (approved with a date, declined, needs-you) and never closes; only a trusted
// card / bank / payment-app credit from that merchant for that amount closes it; pending, future, a charge, a refund the
// person sent, another merchant, a partial amount, a spoof and two fits do not. Run: node test/refund-loop-corpus.cjs
const { FlowRefundLoop: R } = require('../core/refund-loop.js');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { enabled: true };
const NOW = new Date('2026-11-08T10:00:00').getTime();   // a Sunday
const o = (extra) => Object.assign({ to: 'service@shop.co.il', toName: 'שופ', now: NOW, enabled: true }, extra || {});
const heAsk = 'שלום, חויבתי פעמיים על הזמנה 4471. אבקש להחזיר לי את החיוב הכפול על סך 189 ₪.';

console.log('--- switch off: nothing ---');
check('every off form of ask returns null', [undefined, null, {}, { enabled: false }, { enabled: 'true', to: 'a@shop.co.il' }].every((x) => R.ask(heAsk, x) === null));
const loop = Object.assign({ id: 'L1' }, R.ask(heAsk, o()));
const notice = { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק שופ בע"מ נקלט בכרטיסך המסתיים ב-4580.' };
check('every off form of judge and reply returns null', [undefined, null, {}, { enabled: false }].every((x) => R.judge([loop], notice, x) === null && R.reply(loop, 'ההחזר אושר', x) === null));
check('the switch is named and defaults off', R.SWITCH === 'REFUND_LOOP' && R.SWITCH_DEFAULT === false);
check('not on the labs list: nothing is wired', L.IDS.indexOf('REFUND_LOOP') < 0);

console.log('--- the ask ---');
check('a Hebrew request opens a loop with merchant, amount and order', loop.kind === 'refund' && loop.merchant === 'שופ' && loop.amount === 189 && loop.currency === 'ILS' && loop.orderNo === '4471' && loop.stage === 'asked', loop);
check('the order number and the card digits are not the amount', R.ask('Please refund order #4471 to my card ending 4580, the charge was ₪189.', o({ toName: 'Shop' })).amount === 189);
check('chased five workdays later (Sun -> next Sun, skipping Fri and Sat)', loop.chaseIso === '2026-11-15', loop.chaseIso);
check('«לזכות אותי» opens', Boolean(R.ask('נא לזכות אותי על ההזמנה שלא הגיעה', o())));
check('«לבטל את העסקה ולזכות» opens', Boolean(R.ask('אבקש לבטל את העסקה ולזכות את הכרטיס שלי ב-450 ₪.', o())));
check('"reverse the $49 charge" opens in dollars', (R.ask('Please reverse the $49 charge from yesterday.', o({ to: 'billing@cloudapp.io', toName: 'CloudApp' })) || {}).currency === 'USD');
check('"I want my money back" opens', Boolean(R.ask('I want my money back for the broken lamp.', o({ to: 'help@lamps.com', toName: 'Lamps' }))));
check('no amount opens with amount null', R.ask('I would like a full refund for the cancelled workshop.', o({ to: 'hello@makerspace.com', toName: 'Maker Space' })).amount === null);
check('two different figures: amount null, never a guess', R.ask('Please refund ₪189, not the ₪60 shipping.', o({ toName: 'Shop' })).amount === null);
check('no toName: the merchant is the domain', R.ask('Please refund the ₪189 charge.', o({ toName: '' })).merchant === 'shop');
check('a policy question stays silent', R.ask('What is your refund policy, please?', o()) === null && R.ask('מה מדיניות ההחזרים שלכם? אבקש לדעת', o()) === null);
check('a hedge stays silent', R.ask('If it does not arrive by Friday I may ask for a refund, please confirm.', o()) === null && R.ask('אולי אבקש החזר אם זה לא יגיע', o()) === null);
check('thanks for the refund stays silent', R.ask('Thanks for the refund, please close the ticket.', o()) === null && R.ask('תודה על ההחזר, אבקש לסגור את הפנייה', o()) === null);
check('a promise to refund someone stays silent', R.ask("Please note I'll refund you the $30 tomorrow.", o()) === null && R.ask('אחזיר לך את ה-200 ₪, בבקשה תאשר', o()) === null);
check('a request to a private gmail address stays silent', R.ask('Please refund the ₪189.', o({ to: 'dana.cohen@gmail.com' })) === null);
check('a refund word without a request form stays silent', R.ask('The refund for order 4471.', o()) === null);
check('a request with no refund word stays silent', R.ask('Please send me the invoice for order 4471.', o()) === null);

console.log('--- the merchant\'s reply: a stage, never a close ---');
const r1 = R.reply(loop, 'Your refund has been processed and should appear within 7 business days.', { enabled: true, now: NOW });
check('approved with the days they gave (7 workdays)', r1 && r1.stage === 'approved' && r1.expectIso === '2026-11-17', r1);
check('approved with no days: 10 workdays', R.reply(loop, 'ההחזר אושר.', { enabled: true, now: NOW }).expectIso === '2026-11-22');
check('a declined refund is a stage, not a close', R.reply(loop, 'Unfortunately the item is non-refundable.', ON).stage === 'declined');
check('«לא ניתן לזכות» is declined, even with «אושר» nearby', R.reply(loop, 'לא ניתן לזכות את העסקה, הבקשה לא אושרה', ON).stage === 'declined');
check('they ask for something: needs-you', R.reply(loop, 'נא לצרף צילום של הקבלה', ON).stage === 'needs-you');
check('an auto-acknowledgement moves nothing', R.reply(loop, 'Thanks for reaching out, ticket #8812 was created.', ON) === null);
check('a closed loop takes no reply', R.reply(Object.assign({}, loop, { status: 'closed' }), 'ההחזר אושר', ON) === null);

console.log('--- the money back ---');
const j1 = R.judge([loop], notice, ON);
check('a card credit from that merchant for that amount closes it', j1 && j1.loopId === 'L1' && j1.verdict === 'close', j1);
check('PayPal "received a refund ... from" closes in dollars', Boolean(R.judge([Object.assign({ id: 'P' }, R.ask('Please refund the $49.', o({ to: 'hello@makerspace.com', toName: 'Maker Space' })))], { fromEmail: 'service@paypal.com', text: "You've received a refund of $49.00 USD from Maker Space." }, ON)));
check('the merchant in capitals counts', Boolean(R.judge([Object.assign({ id: 'C' }, R.ask('Could you please issue a refund for the chair (₪640)?', o({ to: 'help@comfychairs.co.il', toName: 'Comfy Chairs' })))], { fromEmail: 'alerts@cal-online.co.il', text: 'A credit of ₪640.00 from COMFY CHAIRS was posted to your card.' }, ON)));
check('a credit with the amount but no merchant asks once', (R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ נקלט בכרטיסך.' }, ON) || {}).verdict === 'ask');
check('another merchant for the same amount: silence', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק סופר-פארם נקלט בכרטיסך.' }, ON) === null);
check('a partial refund keeps it open', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 89 ₪ מבית העסק שופ נקלט בכרטיסך.' }, ON) === null);
check('another currency is not the amount', R.judge([loop], { fromEmail: 'service@paypal.com', text: 'You received a refund of $189.00 USD from שופ.' }, ON) === null);
check('a future or pending credit keeps it open', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק שופ יבוצע בחיוב הבא.' }, ON) === null);
check('a charge is not a credit', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'בוצע חיוב בסך 189 ₪ בבית העסק שופ.' }, ON) === null);
check('a refund the person sent is not money back', R.judge([loop], { fromEmail: 'service@paypal.com', text: 'You sent a refund of ₪189.00 to שופ.' }, ON) === null);
check('the merchant\'s own "refund done" is a claim, not proof', R.judge([loop], { fromEmail: 'service@shop.co.il', text: 'ההחזר על סך 189 ₪ בוצע בהצלחה, זיכוי לכרטיס.' }, ON) === null);
check('a look-alike sender is not trusted', R.judge([loop], { fromEmail: 'alerts@isracard.co.il.evil.com', text: notice.text }, ON) === null && R.judge([loop], { fromEmail: 'isracard.alerts@gmail.com', text: notice.text }, ON) === null);
check('a notice that failed authentication is ignored', R.judge([loop], Object.assign({ authPass: false }, notice), ON) === null);
const noAmt = Object.assign({ id: 'N' }, R.ask('אני מבקשת החזר כספי מלא על המעיל', o({ to: 'care@fashionplus.co.il', toName: 'אופנה פלוס' })));
check('a loop with no amount closes on the merchant named', Boolean(R.judge([noAmt], { fromEmail: 'service@cal-online.co.il', text: 'זיכוי בסך 890 ₪ מבית העסק אופנה פלוס נקלט בכרטיסך.' }, ON)));
check('…and never on an unnamed credit', R.judge([noAmt], { fromEmail: 'service@cal-online.co.il', text: 'זיכוי בסך 890 ₪ נקלט בכרטיסך.' }, ON) === null);
const loop2 = Object.assign({}, loop, { id: 'L2' });
check('two loops that fit: silence', R.judge([loop, loop2], notice, ON) === null);
check('a closed loop is not judged again', R.judge([Object.assign({}, loop, { status: 'closed' })], notice, ON) === null);

console.log('--- close, release, reopen, due ---');
const p = R.closePatch(loop, j1, { id: 'm-9', fetchedBack: true }, NOW);
check('the close keeps the notice id as proof, not its text', p.status === 'closed' && p.closedAs === 'refunded' && p.proof.externalId === 'm-9' && p.proof.fetchedBack === true && !('text' in p.proof));
check('fetchedBack is false unless the caller read it back', R.closePatch(loop, j1, { id: 'm-9' }).proof.fetchedBack === false);
check('a deliberate release is a close with its reason', R.releasePatch('store credit instead', NOW).closedAs === 'released');
const back = Object.assign({}, loop, p, R.reopenPatch());
check('reopen puts it back open with no proof', back.status === 'open' && back.proof === null && Boolean(R.judge([back], notice, ON)));
const later = new Date('2026-11-20T09:00:00').getTime();
const d = R.due([
  Object.assign({}, loop, { id: 'a' }),
  Object.assign({}, loop, { id: 'b', stage: 'approved', expectIso: '2026-11-17' }),
  Object.assign({}, loop, { id: 'c', stage: 'approved', expectIso: '2026-11-25' }),
  Object.assign({}, loop, { id: 'd', stage: 'declined' }),
  Object.assign({}, loop, { id: 'e', status: 'closed' })
], later);
check('due: no answer, money not back past their day, and a refusal; not a future day or a closed loop', d.map((x) => x.id + ':' + x.why).join() === 'a:no-answer,d:declined,b:not-back', d);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall refund-loop checks passed');
process.exit(failures ? 1 : 0);
