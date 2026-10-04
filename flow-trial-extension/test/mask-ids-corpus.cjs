// Identifier masking and the combined pass: the shield first, then labelled identifiers. Run: node test/mask-ids-corpus.cjs
const { FlowMaskIds: M } = require('../core/mask-ids.js');
const { FlowPrivacyShield: Shield } = require('../core/privacyShield.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const m = (t) => M.mask(t);

console.log('\n--- labelled identifiers ---\n');
check('a national ID', m('My ID 123456789 is attached').maskedText === 'My ID [ID_1] is attached');
check('a policy number', m('policy no. AB-77123 expires').maskedText === 'policy no. [ID_1] expires');
check('a case number with a hash', m('re: Case #X-1234').maskedText === 're: Case #[ID_1]');
check('a Hebrew ID label', m('ת.ז. 123456789').maskedText === 'ת.ז. [ID_1]');
check('a Hebrew label with a clitic prefix', m('ובחשבון 99887766').maskedText === 'ובחשבון [ID_1]');
check('an account with a colon', m('account: 12345678').maskedText === 'account: [ID_1]');
check('the same value gets the same token', m('Case #X-1234 and case #X-1234 again').maskedText === 'Case #[ID_1] and case #[ID_1] again');
check('two values get two tokens, and the map restores both', (() => { const r = m('ID 111222333 and passport AB1234567'); return r.maskedText === 'ID [ID_1] and passport [ID_2]' && M.unmask(r.maskedText, r.tokenMap) === 'ID 111222333 and passport AB1234567'; })());
check('an IBAN with spaces', m('IBAN GB82 WEST 1234 5698 7654 32 ok').maskedText === 'IBAN [ID_1] ok');

console.log('\n--- what it leaves alone (said, not hidden) ---\n');
check('a bare ten-digit invoice number is NOT masked', m('invoice 1234567890 is due').maskedText === 'invoice 1234567890 is due');
check('the word "id" with no code is untouched', m('please send your id soon').maskedText === 'please send your id soon');
check('a short code after a label is untouched', m('case 12 is closed').maskedText === 'case 12 is closed');
check('plain text is byte-identical', m('Please confirm the meeting on Friday.').maskedText === 'Please confirm the meeting on Friday.');

console.log('\n--- the combined pass ---\n');
const text = 'Hi Dana Levi, please wire $3,850 to account 99887766 by 2026-10-09. Policy no. AB-77123, call +972-54-123-4567 or write dana@acme.com.\nThanks,\nDana';
const all = M.maskAll(text, Shield);
check('names, amounts, dates, phones, e-mail AND identifiers are all gone from the masked text', !/Dana|3,850|99887766|AB-77123|972|dana@|2026-10-09/.test(all.maskedText), all.maskedText);
check('the real values are all in the map and nowhere else', ['99887766', 'AB-77123'].every((v) => Object.values(all.tokenMap).indexOf(v) >= 0));
check('unmask restores the original exactly', M.unmask(all.maskedText, all.tokenMap) === text, M.unmask(all.maskedText, all.tokenMap));
check('KNOWN LIMIT, stated on the privacy page: a first name alone mid-sentence is not masked by the shield (this check fails the day the shield learns to, so the page can be updated)', /Dana/.test(Shield.mask('Please ask Dana about it tomorrow.').maskedText));
check('without a shield it still masks identifiers and does not throw', M.maskAll('ID 123456789', null).maskedText === 'ID [ID_1]');
check('non-string input does not throw', M.maskAll(null, Shield).maskedText === '' && M.mask(undefined).maskedText === '');

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
