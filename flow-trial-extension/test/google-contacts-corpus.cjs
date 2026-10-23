// Google Contacts (G8): read-only People resolve + compose fill, behind GOOGLE_CONTACTS (off).
// Run: node test/google-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowGoogleContacts: G } = require('../core/google-contacts.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const ON = { GOOGLE_CONTACTS: true };
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

const http = async (req) => {
  const u = String(req.url);
  if (/people:searchContacts/.test(u)) {
    const q = decodeURIComponent((/query=([^&]+)/.exec(u) || [])[1] || '').toLowerCase();
    if (q.indexOf('dana') >= 0) {
      return {
        status: 200,
        ok: true,
        json: {
          results: [{
            person: {
              names: [{ displayName: 'Dana Cohen' }],
              emailAddresses: [{ value: 'dana.cohen@example.com' }]
            }
          }]
        }
      };
    }
    return { status: 200, ok: true, json: { results: [] } };
  }
  return { status: 404, ok: false, json: null };
};

(async () => {
  console.log('\n--- recognition and plan ---\n');
  check('switch default off', G.SWITCH_DEFAULT === false && G.SWITCH === 'GOOGLE_CONTACTS');
  check('answer ask in English', G.recognize("What's Dana's email?").mode === 'answer');
  check('forward ask in English', G.recognize('send this to Dana').mode === 'forward');
  check('off switch: plan stays off', (await G.plan({ text: "What's Dana's email?", flags: {} }, { grantedScopes: SCOPES, http })).action === 'off');
  check('missing scope: silence', (await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: ['tasks'], http })).reason === 'missing-scope');
  const offer = await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: SCOPES, http });
  check('one Dana: offer with email', offer.action === 'offer' && offer.email === 'dana.cohen@example.com' && /Dana/.test(offer.title), offer);
  const ambHttp = async () => ({
    status: 200,
    ok: true,
    json: {
      results: [
        { person: { names: [{ displayName: 'Dana Cohen' }], emailAddresses: [{ value: 'a@example.com' }] } },
        { person: { names: [{ displayName: 'Dana Levy' }], emailAddresses: [{ value: 'b@example.com' }] } }
      ]
    }
  });
  const choose = await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: SCOPES, http: ambHttp });
  check('two Danas: choose', choose.action === 'choose' && choose.candidates.length === 2, choose);
  const picked = await G.plan({ text: "What's Dana's email?", flags: ON, choiceIndex: 1 }, { grantedScopes: SCOPES, http: ambHttp });
  check('choice picks the second', picked.action === 'offer' && picked.email === 'b@example.com', picked);
  const none = await G.plan({ text: "What's Nobody's email?", flags: ON }, { grantedScopes: SCOPES, http });
  check('no match: not-found line', none.action === 'not-found' && /contact/i.test(none.line), none);
  check('oauthScopesForSwitch adds contacts.readonly only', G.oauthScopesForSwitch(ON).join() === G.READ_SCOPE && G.oauthScopesForSwitch({}).length === 0);

  console.log('\n--- wiring ---\n');
  const host = read('src', 'google-lane-host.js');
  const gmail = read('src', 'content-gmail.js');
  const manifest = read('manifest.json');
  check('host imports module and answers flow:google-contacts-plan', /google-contacts\.js/.test(host) && /flow:google-contacts-plan/.test(host));
  check('host reads switch before People search', /laneSwitchOn\(G\.SWITCH\)/.test(host));
  check('page shows card only on offer', /showGoogleContactsChip/.test(gmail) && /plan\.action !== 'offer'/.test(gmail));
  check('not-found shows a line, not a card', /flow-chip-contact-miss/.test(gmail));
  check('compose steps map to gmailCompose', /googleContactAnswer: 'gmailCompose'/.test(gmail) && /contactCompose/.test(gmail));
  check('receipt can offer Copy', /flow-chip-copy/.test(gmail));
  check('manifest loads core module on Gmail', /core\/google-contacts\.js/.test(manifest));
  check('draft reply path does not call contacts plan', !/gmailDraft[\s\S]{0,200}flow:google-contacts/.test(gmail));

  console.log('\n--- privacy: Google Contacts never on glance-assist ---\n');
  const bg = read('src', 'background.js');
  const contactsCore = read('core', 'google-contacts.js');
  const contactsHandler = (host.match(/if \(msg\.type === 'flow:google-contacts-plan'\)[\s\S]{0,1800}/) || [''])[0];
  const contactSlice = gmail.slice(gmail.indexOf('showGoogleContactsChip'), gmail.indexOf('showGoogleContactsChip') + 4500);
  check('google-contacts core never references glance-assist', !/glance-assist|theflow-ai\.com\/\.netlify\/functions\/glance-assist/.test(contactsCore));
  check('flow:google-contacts-plan handler never references glance-assist', !/glance-assist|GLANCE_ASSIST|theflow-ai\.com/.test(contactsHandler));
  check('contacts chip path never calls glance-assist', !/glance-assist|theflow-ai\.com\/\.netlify\/functions\/glance-assist/.test(contactSlice));
  check('background worker does not handle flow:google-contacts-plan (contacts stay in lane host, not assist)', !/flow:google-contacts-plan/.test(bg));
  check('hybrid glance-assist relay accepts only action, lang, maskedPrompt (no contact email fields)', /Object\.keys\(assistCalls\[0\]\)\.sort\(\)\.join\(\) === 'action,lang,maskedPrompt'/.test(read('test', 'hybrid-path-corpus.cjs')));
  check('manifest oauth2 includes contacts.readonly', /contacts\.readonly/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
