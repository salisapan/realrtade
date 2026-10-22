// Outlook draft To: Contacts.Read lookup fills toRecipients on createReply draft.
// Run: node test/outlook-draft-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
check('outlookDraftWrite resolves a contact before read-back', /async function outlookDraftRecipientFromText/.test(bg) && /outlookDraftRecipientFromText\(p\)/.test(bg) && /toRecipients/.test(bg));
check('contacts module is imported in the worker', bg.indexOf("import '../core/outlook-contacts.js'") >= 0);

if (failures) process.exit(1);
console.log('outlook-draft-contacts-corpus: all passed');
