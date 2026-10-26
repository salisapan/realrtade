// Full-document Gmail+Docs wiring (switch FULL_DOCUMENT_CLOSE, off).
// Run: node test/gmail-full-document-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowFullDocumentClose: F } = require('../core/full-document-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const lane = read('src', 'google-lane.js');
const host = read('src', 'google-lane-host.js');
const gmail = read('src', 'content-gmail.js');
const bg = read('src', 'background.js');

check('lane maps googleDocFull to FlowGoogleDocs', /googleDocFull: 'FlowGoogleDocs'/.test(lane));
check('host imports full-document-close and answers the plan with the switch', /full-document-close\.js/.test(host) && /flow:google-full-document-plan/.test(host) && /laneSwitchOn\(F\.SWITCH\)/.test(host));
check('Gmail shows a card only when the worker offers a non-blank build', /showFullDocumentChip\(/.test(gmail) && /flow:google-full-document-plan/.test(gmail) && /plan\.built\.blank/.test(gmail));
check('full-document inject carries built body and previewOnly', /googleBuilt: plan\.built/.test(gmail) && /previewOnly: true/.test(gmail));
check('Do It marks lane writes as preview when previewOnly', /ctx\.previewOnly/.test(gmail) && /response\.preview = true/.test(gmail));
check('receipt path for doc preview exists', /showDocPreviewReceipt/.test(gmail));
check('user context events reach the worker', /flow:user-context-event/.test(gmail) && /flow:user-context-event/.test(bg) && /USER_CONTEXT_STORAGE_KEY/.test(bg));
check('module switch names match', F.SWITCH === 'FULL_DOCUMENT_CLOSE');

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
check('Hebrew no-price ask without quoted title still offers with placeholder', (() => {
  const p = F.plan({
    flags: flagsOn,
    text: 'נא להכין הצעת מחיר עבור דנה כהן',
    lang: 'he',
    companyTemplate: template,
    styleSummary: { greeting: 'shalom-name', signoff: 'best' }
  });
  return p.action === 'offer' && p.built && p.built.html && p.built.html.indexOf(F.PRICE_PLACEHOLDER) !== -1;
})());
check('stray digit in title does not block price stripping', (() => {
  const invented = F.stripInventedAmounts({ filled: { party: 'Dana', amount: '$1,000' } }, 'Please prepare a quote for Floor 14.');
  return invented.filled && !invented.filled.amount;
})());

check('worker imports style-profile for lane writes', /style-profile\.js/.test(host));
check('googleDocFull verify uses Drive files API', /connectorId === 'googleDocFull'/.test(host) && /drive\/v3\/files/.test(host));
check('gmail-new-file verify regex restored', /google\(DriveSave\|Doc\|SheetAppend\|NewFile\)/.test(host));
check('page gates full-document plan on FULL_DOCUMENT_CLOSE', /FULL_DOCUMENT_CLOSE === true/.test(gmail));
check('previewOnly false would fail preview receipt path', !/previewOnly:\s*false/.test(gmail));
check('undo learning only on successful undo', /if \(undone && undone\.ok\)/.test(gmail) && /type: 'undo'/.test(gmail));
check('Do It emits approved learning event', /type: 'approved'/.test(gmail));
check('edited learning when slot fills present', /type: 'edited'/.test(gmail));

console.log('\n--- verifier mutants B9 / B10 (GFD wiring) ---\n');

function extractPreviewStampBlock(source) {
  const needle = 'if (ctx && ctx.previewOnly && response && response.ok === true)';
  const i = source.indexOf(needle);
  if (i < 0) throw new Error('previewOnly stamp block missing');
  const tail = source.slice(i);
  const end = tail.indexOf('assertWrittenTitle');
  return tail.slice(0, end > 0 ? end : 200);
}

const previewBox = { console };
vm.createContext(previewBox);
vm.runInContext(
  'function stampPreview(ctx, response) {\n' +
  extractPreviewStampBlock(gmail) +
  '  return response;\n}\nthis.stampPreview = stampPreview;',
  previewBox
);
const stamped = vm.runInContext('stampPreview({ previewOnly: true }, { ok: true })', previewBox);
check('B9: previewOnly Do It stamps response.preview=true (mutant false fails)', stamped && stamped.preview === true && stamped.closes === false, stamped);
const notPreview = vm.runInContext('stampPreview({ previewOnly: false }, { ok: true })', previewBox);
check('B9: without previewOnly the response stays unmarked', notPreview && notPreview.preview !== true, notPreview);

const hostPlan = plan('Please prepare a quote for Dana Cole at $3,900 titled "Floor 14".');
check('B10: worker plan path offers a non-blank built doc (GFD wiring)', hostPlan.action === 'offer' && hostPlan.built && !hostPlan.built.blank && hostPlan.previewOnly === true, hostPlan);

const docPreviewSlice = gmail.slice(gmail.indexOf('function showDocPreviewReceipt'), gmail.indexOf('function showPreviewReceipt'));
check('B10: doc preview receipt learns approved only with fetchedBack proof', /response\.proof/.test(docPreviewSlice) && /fetchedBack === true/.test(docPreviewSlice) && /type: 'approved'/.test(docPreviewSlice) && /fetchedBack: true/.test(docPreviewSlice));

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
