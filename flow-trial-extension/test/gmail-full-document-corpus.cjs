// Full-document Gmail+Docs wiring (switch FULL_DOCUMENT_CLOSE, off).
// Run: node test/gmail-full-document-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowFullDocumentClose: F } = require('../core/full-document-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
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

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
