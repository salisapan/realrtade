// privacyShield.js corpus.
//
// This file had no tests at all, which is backwards: it is the one piece of
// code whose failure the product could not recover from. Everything else here
// risks a missed email or an awkward label. A leak here sends a real client's
// name, number or fee to a third-party model, after the site has told the user
// in as many words that it never will.
//
// So the assertions are written the way the promise is written — as things
// that must NOT appear in the output. A test that only checks a token turned up
// somewhere would pass while the sensitive substring sat right next to it.
//
// The second half matters just as much: a mask that eats ordinary words is not
// "safely over-cautious", it hands the model a mangled sentence and gets a
// mangled draft back. Both directions are tested.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'privacyShield.js'), 'utf8'), sandbox);
const Shield = vm.runInContext('FlowPrivacyShield', sandbox);

let failures = 0;
const maskOf = (t) => Shield.mask(t).maskedText;

// The sensitive substrings must be GONE, and the ordinary words must SURVIVE.
function check(label, input, { gone = [], kept = [] }) {
  const out = maskOf(input);
  const leaked = gone.filter((s) => out.includes(s));
  const eaten = kept.filter((s) => !out.includes(s));
  if (!leaked.length && !eaten.length) { console.log('PASS: ' + label); return; }
  failures++;
  console.log('FAIL: ' + label
    + (leaked.length ? '\n        leaked: ' + JSON.stringify(leaked) : '')
    + (eaten.length ? '\n        destroyed: ' + JSON.stringify(eaten) : '')
    + '\n        output: ' + JSON.stringify(out));
}

console.log('\n--- privacyShield.js: phone numbers outside North America ---\n');
{
  // The pattern hardcoded a +1 country code and a 3-3-4 grouping, so every
  // other country's numbers reached the model in full. This extension ships
  // Hebrew support, which makes +972 its own users' numbers, not an edge case.
  check('UK number is masked', 'Call +44 20 7946 0958 today.', { gone: ['7946', '0958'] });
  check('Israeli number, dashes', 'Call +972-54-123-4567 today.', { gone: ['4567', '123'] });
  check('Israeli number, mixed separators', 'Call +972 54-123-4567 today.', { gone: ['4567'] });
  check('US number with +1', 'Call +1 212 555 1234.', { gone: ['555', '1234'] });
  check('local dashed number still masked', 'My cell is 054-123-4567.', { gone: ['123-4567'] });
  // ...without the looser pattern starting to eat business identifiers.
  check('a bare 10-digit invoice number is left alone', 'Invoice 2125551234 is due.', { kept: ['2125551234'] });
  check('a version string is left alone', 'Upgrade to +1.5 release.', { kept: ['+1.5'] });
}

console.log('\n--- privacyShield.js: amounts in both number conventions ---\n');
{
  // Continental grouping (dots for thousands, comma for decimals) matched only
  // its own tail, so the significant digits went out in clear AND the sentence
  // came back malformed: "1.234,[CURRENCY_VAL_1]".
  check('European format is fully masked', 'Total is 1.234,56 EUR.', { gone: ['1.234', '56 EUR'] });
  check('Anglo format still masked', 'Due $3,900 today.', { gone: ['3,900'] });
  check('Anglo decimal still masked', 'Fee is $1.50.', { gone: ['1.50'] });
  check('shekel after the number still masked', 'סה"כ 3,850 ₪ לחודש.', { gone: ['3,850'] });
  check('a real magnitude suffix is still consumed', 'Budget is $5m.', { gone: ['5m'] });
}

console.log('\n--- privacyShield.js: masking must not eat the sentence ---\n');
{
  // `(?:k|m)?` had nothing requiring it to end, so it took the first letter of
  // the following word: "$20 monthly" masked to "[CURRENCY_VAL_1]onthly". Not a
  // leak — worse in a different way, because the model then drafts a reply from
  // a corrupted sentence and the user is the one who looks careless.
  const m1 = maskOf('Pricing is $20 monthly per seat.');
  check('"monthly" survives intact', 'Pricing is $20 monthly per seat.', { gone: ['$20'], kept: ['monthly'] });
  if (/\]onthly/.test(m1)) { failures++; console.log('FAIL: the word was clipped by the mask -> ' + JSON.stringify(m1)); }
  check('"kits" survives intact', 'We shipped $50 kits.', { gone: ['$50'], kept: ['kits'] });
  check('"max" survives intact', 'Cap it at $30 max.', { gone: ['$30'], kept: ['max'] });
}

console.log('\n--- privacyShield.js: the name on the signature line ---\n');
{
  // The capitalized-run pattern needs two or more words, so a first name alone
  // on the sign-off line — the most reliable place in an email to find a real
  // one — was never masked. The Hebrew side already had this pattern; English
  // did not, leaving the shield weakest in the language most of its traffic
  // is in.
  check('"Thanks,\\nDana" masks the name', 'Thanks,\nDana', { gone: ['Dana'] });
  check('"Best regards,\\nDana Cole" masks the name', 'Best regards,\nDana Cole', { gone: ['Dana', 'Cole'] });
  check('the sign-off word itself is kept', 'Thanks,\nDana', { kept: ['Thanks'] });
  // Existing behaviour that must not regress.
  check('salutation name still masked', 'Hi Dana, confirming.', { gone: ['Dana'] });
  check('full name in prose still masked', 'Dana Cole confirmed it.', { gone: ['Dana Cole'] });
  check('email address still masked', 'cc john.doe@acmecorp.com please.', { gone: ['john.doe', 'acmecorp'] });
}

console.log('\n--- privacyShield.js: reconstruction is exact ---\n');
{
  // The whole design rests on this: mask -> model -> unmask must return the
  // user's real text, or the feature silently corrupts what it touches.
  for (const original of [
    'Thanks,\nDana Cole',
    'Dana Cole confirmed $3,900 due Sep 7. Call +972-54-123-4567.',
    'Total is 1.234,56 EUR, cc john.doe@acmecorp.com.'
  ]) {
    const r = Shield.mask(original);
    const back = Shield.unmask(r.maskedText, r.tokenMap);
    if (back === original) { console.log('PASS: round-trips exactly -> ' + JSON.stringify(original.slice(0, 44))); }
    else { failures++; console.log('FAIL: round-trip changed the text\n        was: ' + JSON.stringify(original) + '\n        got: ' + JSON.stringify(back)); }
  }
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
