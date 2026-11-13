// The refund you asked for, carried until the money is really back (core/refund-loop.js, switch REFUND_LOOP, off; not on
// the labs list yet). Pinned: switch off = nothing; the person's own request to a business opens a loop with the merchant,
// amount and order; a policy question, a hedge, thanks for a refund, a promise to refund someone, and a private address do
// not; the merchant's reply moves the stage (approved with a date, declined, needs-you) and never closes; only a trusted
// card / bank / payment-app credit from that merchant for that amount closes it; pending, future, a charge, a refund the
// person sent, another merchant, a partial amount, a spoof and two fits do not. Run: node test/refund-loop-corpus.cjs
const { FlowRefundLoop: R } = require('../core/refund-loop.js');
// Red team 2026-11-13: only a notice that passed DKIM/SPF counts (authPass must be true). These fixtures are authenticated notices,
// so a message without authPass is passed as authenticated here; the red team corpus covers a missing and a failed result.
const judgeAuthenticated = R.judge;
R.judge = (loops, msg, opts) => judgeAuthenticated(loops, msg && !Object.prototype.hasOwnProperty.call(msg, 'authPass') ? Object.assign({ authPass: true }, msg) : msg, opts);
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
check('a partial refund keeps it open (counted as a part, never a close)', (R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 89 ₪ מבית העסק שופ נקלט בכרטיסך.' }, ON) || {}).verdict === 'partial');
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

console.log('--- Wednesday edge cases (Hebrew and English) ---');
const NOWr = { enabled: true, now: NOW };
check('store credit instead of money is a stage for the person, not approved', (R.reply(loop, 'We can offer you store credit of ₪189 instead.', NOWr) || {}).stage === 'store-credit');
check('«זיכוי לחנות» / «שובר» is store credit', (R.reply(loop, 'נשמח לתת לך זיכוי לחנות על סך 189 ₪', NOWr) || {}).stage === 'store-credit' && (R.reply(loop, 'שלחנו לך שובר על הסכום', NOWr) || {}).stage === 'store-credit');
check('a refund to the card that mentions a voucher code is still approved', (R.reply(loop, 'Your refund to your card was processed. Voucher code SAVE10 is a small gift.', NOWr) || {}).stage === 'approved');
check('"once we receive the item" is a step for the person, not approved', (R.reply(loop, 'The refund will be issued once we receive the item.', NOWr) || {}).need === 'return-item');
check('«לאחר שנקבל את המוצר» too', (R.reply(loop, 'ההחזר יבוצע לאחר שנקבל את המוצר בחזרה', NOWr) || {}).need === 'return-item');
check('«הכסף יוחזר לכרטיס תוך 7 ימים» is approved with 7 workdays', (R.reply(loop, 'הכסף יוחזר לכרטיס תוך 7 ימים', NOWr) || {}).expectIso === '2026-11-17');
check('"Can I get a refund for order 4471?" opens', Boolean(R.ask('Hi, can I get a refund for order 4471? The charge was ₪189.', o({ toName: 'Shop' }))));
const sp = Object.assign({}, loop, { id: 'S' });
const part1 = R.judge([sp], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 100 ₪ מבית העסק שופ נקלט בכרטיסך.' }, ON);
check('a refund in two parts: the first part is counted', part1 && part1.verdict === 'partial' && part1.amount === 100, part1);
const sp2 = Object.assign({}, sp, R.partialPatch(sp, part1, { id: 'n1', fetchedBack: true }, NOW));
check('the same notice is counted once', R.partialPatch(sp2, part1, { id: 'n1' }, NOW).received === 100 && sp2.received === 100);
check('a part without a notice id is not counted', R.partialPatch(sp, part1, {}, NOW).received === 0);
const part2 = R.judge([sp2], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 89 ₪ מבית העסק שופ נקלט בכרטיסך.' }, ON);
check('…and the second part that completes it closes', part2 && part2.verdict === 'close', part2);
check('a part from an unnamed credit is never counted', R.judge([sp], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 100 ₪ נקלט בכרטיסך.' }, ON) === null);
const mk = Object.assign({ id: 'M' }, R.ask('I would like a refund of $49 for the workshop.', o({ to: 'hello@makerspace.com', toName: 'Maker Space Tel Aviv' })));
check('the card descriptor (the mail domain) names the merchant', (R.judge([mk], { fromEmail: 'service@paypal.com', text: 'You received a refund of $49.00 USD from MAKERSPACE*BOOKING.' }, ON) || {}).verdict === 'close');
check('a generic domain label (shop) never names a merchant by itself', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק SHOP CENTER נקלט בכרטיסך.' }, ON) === null);
check('the legal name around the brand («שופ אונליין בע"מ») still names it', Boolean(R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק שופ אונליין בע"מ נקלט בכרטיסך.' }, ON)));
check('cashback is not a refund', R.judge([loop], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי קאשבק בסך 189 ₪ מבית העסק שופ במסגרת מבצע.' }, ON) === null);
check('points credited are not a refund', R.judge([loop], { fromEmail: 'alerts@max.co.il', text: 'זוכו 189 נקודות מבית העסק שופ' }, ON) === null);
check('due lists store credit for the person to decide', R.due([Object.assign({}, loop, { id: 'sc', stage: 'store-credit' })], NOW).map((x) => x.why).join() === 'store-credit');

console.log('--- real-user A/B: dormant, counts only ---');
const { FlowPmfMetrics: P } = require('../core/pmf-metrics.js');
check('the refund-loop experiment exists with arms A and B', P.EXPERIMENTS['refund-loop'] && P.EXPERIMENTS['refund-loop'].arms.join() === 'A,B');
check('no arm without the switch', P.assignVariant('install-87654321', 'refund-loop', {}) === null);
const armR = P.assignVariant('install-87654321', 'refund-loop', { enabled: true });
check('the same install always gets the same arm', ['A', 'B'].indexOf(armR) >= 0 && armR === P.assignVariant('install-87654321', 'refund-loop', { enabled: true }));
let ab = {};
['refund_asked', 'refund_asked', 'refund_loop_shown', 'refund_loop_shown', 'refund_money_back', 'refund_not_back_by_day'].forEach((e) => { ab = P.foldAbEvent(ab, 'refund-loop', 'B', e); });
ab = P.foldAbEvent(ab, 'refund-loop', 'A', 'refund_asked');
ab = P.foldAbEvent(ab, 'refund-loop', 'B', 'free text never counts');
const sn = P.abSnapshot(ab, 'refund-loop');
check('per-arm rates with their n: money back per refund asked', sn.B.refundAsked === 2 && sn.B.refundBack === 0.5 && sn.B.refundNotBack === 0.5 && sn.A.refundAsked === 1 && sn.A.refundBack === 0, sn);
check('a rate on zero is null; an unknown event changes nothing', sn.A.refundNotBack === null && sn.B.refundWrongClose === 0 && Object.keys(sn.B.counts).length === 4);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall refund-loop checks passed');
process.exit(failures ? 1 : 0);
