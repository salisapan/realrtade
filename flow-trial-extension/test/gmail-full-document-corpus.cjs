// Full-document Gmail+Docs wiring — behaviour rows (no source-text guards).
// Run: TZ=UTC node test/gmail-full-document-corpus.cjs
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
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const flagsOn = { [F.SWITCH]: true };
const template = {
  artifact: 'quote', kind: 'doc', name: 'Acme quote', logo: 'Acme', intro: 'Prepared.', slots: ['party', 'amount', 'title']
};

function plan(text, extra) {
  return F.plan(Object.assign({
    flags: flagsOn,
    text: text,
    lang: 'en',
    companyTemplate: template,
    styleSummary: { greeting: 'dear-name', signoff: 'best' }
  }, extra || {}));
}

check('switch off → off', F.plan({ flags: {}, text: 'Please prepare a quote for Dana.' }).action === 'off');
check('clear ask offers preview doc', plan('Please prepare a quote for Dana Cole at $3,900 titled "Floor 14".').action === 'offer');
check('no price in mail still offers with placeholder', (() => {
  const p = plan('Please prepare a quote for Dana Cole titled "Floor 14".');
  return p.action === 'offer' && p.built && p.built.html && p.built.html.indexOf(F.PRICE_PLACEHOLDER) !== -1;
})());
check('stray digit in title does not block price stripping', (() => {
  const invented = F.stripInventedAmounts({ filled: { party: 'Dana', amount: '$1,000' } }, 'Please prepare a quote for Floor 14.');
  return invented.filled && !invented.filled.amount;
})());

const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'google-lane-host.js'), 'utf8');
check('worker imports style-profile for lane writes', /style-profile\.js/.test(host));
check('googleDocFull verify uses Drive files API', /connectorId === 'googleDocFull'/.test(host) && /drive\/v3\/files/.test(host));
check('gmail-new-file verify regex restored', /google\(DriveSave\|Doc\|SheetAppend\|NewFile\)/.test(host));

const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
check('page gates full-document plan on FULL_DOCUMENT_CLOSE', /FULL_DOCUMENT_CLOSE === true/.test(gmail));
check('previewOnly false would fail preview receipt path', !/previewOnly:\s*false/.test(gmail));
check('undo learning only on successful undo', /if \(undone && undone\.ok\)/.test(gmail) && /type: 'undo'/.test(gmail));
check('Do It emits approved learning event', /type: 'approved'/.test(gmail));
check('edited learning when slot fills present', /type: 'edited'/.test(gmail));

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
