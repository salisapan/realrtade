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
  companyTemplate: quoteTemplate()
});
check('built html shows placeholder when mail had no amount', noAmt.action === 'offer' && noAmt.built && noAmt.built.html && noAmt.built.html.indexOf(F.placeholdersFor('en').amount) !== -1 && !/\$[\d,]+/.test(noAmt.built.html), noAmt);
check('English built html uses English labels and several paragraphs, not Party/Amount/Title',
  noAmt.built.html.indexOf('<p>') >= 0 && noAmt.built.html.indexOf('<h1>') >= 0 &&
  noAmt.built.html.indexOf('Client:') >= 0 && noAmt.built.html.indexOf('Price:') >= 0 &&
  noAmt.built.html.indexOf('Party:') < 0 && noAmt.built.html.indexOf('Amount:') < 0 &&
  noAmt.built.html.indexOf('Title:') < 0 && noAmt.built.html.indexOf('Floor 14') >= 0, noAmt.built.html);

const gateMail = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק. 5 עמודים, טופס יצירת קשר ובלוג. תודה';
const gate = F.plan({
  flags: flagsOn,
  text: '[G-Quote] בקשה להצעת מחיר לאתר חדש 14/11\n' + gateMail,
  lang: 'he'
});
const gateHtml = (gate.built && gate.built.html) || '';
check('Hebrew Gate mail fills items and a title from the mail',
  gate.action === 'offer' && /5 עמודים/.test(gateHtml) && /טופס יצירת קשר/.test(gateHtml) && /בלוג/.test(gateHtml) && /אתר חדש/.test(gateHtml),
  { action: gate.action, html: gateHtml, filled: gate.googleClose && gate.googleClose.filled });
check('Hebrew Gate html is RTL-ready paragraphs with Hebrew labels and placeholders, no English labels',
  gateHtml.indexOf('<h1>') >= 0 && gateHtml.split('<p>').length >= 4 &&
  gateHtml.indexOf('לקוח:') >= 0 && gateHtml.indexOf('מחיר:') >= 0 &&
  gateHtml.indexOf(F.PARTY_PLACEHOLDER) >= 0 && gateHtml.indexOf(F.PRICE_PLACEHOLDER) >= 0 &&
  gateHtml.indexOf('Party:') < 0 && gateHtml.indexOf('Amount:') < 0 && gateHtml.indexOf('Title:') < 0 &&
  gateHtml.indexOf('[לקוח / party]') < 0 && gateHtml.indexOf('[מחיר / price]') < 0, gateHtml);
const invented = F.stripInventedAmounts({ filled: { party: 'Dana', amount: '$1,000' } }, 'Please prepare a quote for Floor 14.');
check('invented $1,000 stripped when not verbatim in mail', invented.filled && !invented.filled.amount);

const liveSubject = '[G-Quote] בקשה להצעת מחיר לאתר חדש 14/11 ב';
const liveBody = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג. תודה!';
const livePlain = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר\r\nובלוג. תודה!\r\n';
function assertLiveShape(name, text) {
  const p = F.plan({ flags: flagsOn, text, lang: 'he' });
  const html = (p.built && p.built.html) || '';
  const filled = (p.googleClose && p.googleClose.filled) || {};
  check(name + ' fills the three requested items, including ובלוג',
    p.action === 'offer' && Array.isArray(filled.items) && filled.items[0] === '5 עמודים' && filled.items[1] === 'טופס יצירת קשר' && filled.items[2] === 'בלוג' &&
    /5 עמודים/.test(html) && /טופס יצירת קשר/.test(html) && /בלוג/.test(html),
    { html: html, filled: filled });
  check(name + ' H1 is a clean title without the 14/11 ב tail',
    /<h1>הצעת מחיר — אתר חדש(?: לעסק)?<\/h1>/.test(html) && html.indexOf('14/11') < 0,
    html);
}
// content-gmail.js joins the open thread as subject + ". " + body.
assertLiveShape('live Gate mail (colon list, subject 14/11 ב)', liveSubject + '. ' + liveBody);
assertLiveShape('live Gate mail with Gmail plain wrap before ובלוג', liveSubject + '. ' + livePlain);
const subjectOnlyHtml = ((F.plan({ flags: flagsOn, text: liveSubject + '. ', lang: 'he' }).built || {}).html) || '';
check('subject-only date tail 14/11 ב is stripped from the H1',
  /<h1>הצעת מחיר — אתר חדש<\/h1>/.test(subjectOnlyHtml) && subjectOnlyHtml.indexOf('14/11') < 0,
  subjectOnlyHtml);

check('Hebrew document ask is recognized before template fill', F.recognize('נא להכין הצעת מחיר עבור דנה כהן').kind === 'clear');

check('amountInText detects currency in mail', F.amountInText('total 3900 USD') === true);
const stripped = F.stripInventedAmounts({ filled: { party: 'Dana', amount: '$99' } }, 'Please send the proposal to Dana.');
check('stripInventedAmounts removes amount slot when mail had no number', stripped.filled && !stripped.filled.amount);

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
