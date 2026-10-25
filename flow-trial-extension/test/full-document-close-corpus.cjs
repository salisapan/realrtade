// Full-document close (Gmail + Docs): quote/proposal asks, style, no invented prices.
// Run: node test/full-document-close-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'google-closes.js'), 'utf8'), sandbox, { filename: 'google-closes.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'style-profile.js'), 'utf8'), sandbox, { filename: 'style-profile.js' });
globalThis.FlowGoogleCloses = sandbox.FlowGoogleCloses;
globalThis.FlowStyle = sandbox.FlowStyle;
const { FlowFullDocumentClose: F } = require('../core/full-document-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function quoteTemplate() {
  return {
    artifact: 'quote',
    kind: 'doc',
    name: 'Acme quote',
    logo: 'Acme',
    intro: 'Prepared from template.',
    slots: ['party', 'amount', 'title']
  };
}

const flagsOn = { [F.SWITCH]: true };
const flagsOff = {};

check('switch off stays silent', F.plan({ flags: flagsOff, text: 'Please send me the proposal.' }).action === 'off');
check('blank mail is silence', F.plan({ flags: flagsOn, text: '   ' }).action === 'silence');
check('create blank doc shape is silence', F.plan({ flags: flagsOn, text: 'Please create a shared doc for notes.' }).reason === 'wrong-shape');
check('FYI without document ask is silence', F.plan({ flags: flagsOn, text: 'Thanks for the update on pricing.' }).action === 'silence');

const mail = 'Please prepare a quote for Dana Cole at $3,900 titled "Floor 14".';
const offer = F.plan({
  flags: flagsOn,
  text: mail,
  lang: 'en',
  companyTemplate: quoteTemplate(),
  styleSummary: { greeting: 'dear-name', signoff: 'best' }
});
check('clear quote ask offers a preview doc', offer.action === 'offer' && offer.previewOnly === true && offer.closes === false, offer);
check('connector is the Docs lane', offer.connectorId === 'googleDocFull', offer);
const noAmt = F.plan({
  flags: flagsOn,
  text: 'Please prepare a quote for Dana Cole titled "Floor 14".',
  lang: 'en',
  companyTemplate: Object.assign({}, quoteTemplate(), { slots: ['party', 'title'] })
});
check('built html omits invented price when mail had no amount', noAmt.action === 'offer' && noAmt.built && noAmt.built.html && !/\$[\d,]+/.test(noAmt.built.html), noAmt);

check('Hebrew document ask is recognized before template fill', F.recognize('נא להכין הצעת מחיר עבור דנה כהן').kind === 'clear');

check('amountInText detects currency in mail', F.amountInText('total 3900 USD') === true);
const stripped = F.stripInventedAmounts({ filled: { party: 'Dana', amount: '$99' } }, 'Please send the proposal to Dana.');
check('stripInventedAmounts removes amount slot when mail had no number', stripped.filled && !stripped.filled.amount);

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
