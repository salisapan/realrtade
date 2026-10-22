// Outlook draft To: Contacts.Read lookup fills toRecipients on createReply draft.
// Run: node test/outlook-draft-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookContacts: C } = require('../core/outlook-contacts.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
check('outlookDraftWrite resolves a contact before read-back', /async function outlookDraftRecipientFromText/.test(bg) && /outlookDraftRecipientFromText\(p\)/.test(bg) && /toRecipients/.test(bg));
check('contacts module is imported in the worker', bg.indexOf("import '../core/outlook-contacts.js'") >= 0);
check('draft To uses object-shaped Graph call adapter', /outlookGraphObjectCall/.test(bg) && /call: outlookGraphObjectCall\(\)/.test(bg));

(async () => {
  const offer = C.offer({ text: 'Please look up contact Noa and send the deck.' });
  check('contact name stops before and', offer.show === true && offer.params.name === 'Noa', offer);

  const calls = [];
  const hit = await C.run({ params: { name: 'Noa' }, name: 'Noa' }, {
    grantedScopes: ['Contacts.Read'],
    call: async (req) => {
      calls.push(req);
      if (req.path.indexOf('/me/contacts') >= 0) {
        return { ok: true, status: 200, body: { value: [{ displayName: 'Noa', emailAddresses: [{ address: 'noa@example.com' }] }] } };
      }
      return { ok: true, status: 200, body: { value: [] } };
    }
  });
  check('run resolves one address with object call', hit.ok === true && hit.recipient.address === 'noa@example.com', hit);
  check('Graph path is well-formed', calls.length >= 1 && typeof calls[0].path === 'string' && calls[0].path.indexOf('/me/contacts') >= 0, calls);

  if (failures) process.exit(1);
  console.log('outlook-draft-contacts-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
