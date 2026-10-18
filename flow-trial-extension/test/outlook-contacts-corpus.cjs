// Contacts.Read: resolve one recipient by name. Read-only. A split match
// stays quiet. People 403 still resolves from contacts. Nothing is sent.
// Run: node test/outlook-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookContacts: C } = require('../core/outlook-contacts.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function fake(routes) {
  const calls = [];
  const call = async (req) => {
    calls.push(req);
    const method = String((req && req.method) || 'GET').toUpperCase();
    for (const route of routes) {
      if (route.method === method && route.test.test(req.path)) return route.reply(req);
    }
    return { ok: false, status: 404, body: null };
  };
  return { calls, call };
}

function dana() {
  return fake([
    { method: 'GET', test: /\/me\/contacts/, reply: () => ({ ok: true, status: 200, body: { value: [{ id: 'c1', displayName: 'Dana Cohen', emailAddresses: [{ address: 'dana@acme.com' }] }] } }) },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: false, status: 403, body: { error: { code: 'ErrorAccessDenied' } } }) }
  ]);
}

(async () => {
  check('empty name does not call', await (async () => {
    const f = fake([]);
    const out = await C.run({ name: '  ' }, { call: f.call, grantedScopes: ['Contacts.Read'] });
    return out.reason === 'unclear' && f.calls.length === 0;
  })());

  check('null input is unclear', await (async () => {
    const f = fake([]);
    const out = await C.run(null, { call: f.call, grantedScopes: ['Contacts.Read'] });
    return out.ok === false && f.calls.length === 0;
  })());

  check('known scopes without Contacts.Read do not call', await (async () => {
    const f = fake([]);
    const out = await C.run({ name: 'Dana Cohen' }, { call: f.call, grantedScopes: ['Mail.Read'] });
    return out.reason === 'contacts-not-granted' && f.calls.length === 0;
  })());

  check('unknown scope list still looks up', C.hasReadScope(null) === null && C.hasReadScope(['Contacts.Read']) === true && C.hasReadScope(['Files.ReadWrite.All']) === false);

  const hit = dana();
  const resolved = await C.run({ name: 'Dana Cohen' }, { call: hit.call, grantedScopes: ['Contacts.Read'] });
  check('people 403 still resolves the contact', resolved.ok === true && resolved.recipient.address === 'dana@acme.com' && resolved.recipient.source === 'contacts', resolved);
  check('lookup is GET only', hit.calls.every((c) => c.method === 'GET') && hit.calls.some((c) => c.path.indexOf('/me/contacts') === 0) && hit.calls.some((c) => c.path.indexOf('/me/people') === 0), hit.calls.map((c) => c.method + ' ' + c.path));
  check('contacts search asks for eventual consistency', hit.calls[0].headers && hit.calls[0].headers.ConsistencyLevel === 'eventual');

  const both = fake([
    { method: 'GET', test: /\/me\/contacts/, reply: () => ({ ok: true, status: 200, body: { value: [{ displayName: 'Dana Cohen', emailAddresses: [{ address: 'Dana@acme.com' }] }] } }) },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: true, status: 200, body: { value: [{ displayName: 'Dana', scoredEmailAddresses: [{ address: 'dana@acme.com' }] }] } }) }
  ]);
  const same = await C.run({ params: { name: 'Dana Cohen' } }, { call: both.call, grantedScopes: 'Contacts.Read' });
  check('the same address from both lists is one recipient', same.ok === true && same.recipient.source === 'both' && same.recipient.address === 'Dana@acme.com', same);

  const split = fake([
    { method: 'GET', test: /\/me\/contacts/, reply: () => ({ ok: true, status: 200, body: { value: [{ displayName: 'Dana Cohen', emailAddresses: [{ address: 'dana@acme.com' }] }] } }) },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: true, status: 200, body: { value: [{ displayName: 'Dana Cole', scoredEmailAddresses: [{ address: 'dana.cole@acme.com' }] }] } }) }
  ]);
  const amb = await C.run({ name: 'Dana' }, { call: split.call, grantedScopes: ['https://graph.microsoft.com/Contacts.Read'] });
  check('two addresses stay ambiguous', amb.ok === false && amb.reason === 'ambiguous', amb);

  const none = fake([
    { method: 'GET', test: /\/me\/contacts/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }
  ]);
  const missing = await C.run({ name: 'Nobody' }, { call: none.call, grantedScopes: ['Contacts.Read'] });
  check('no address is not-found', missing.reason === 'not-found');

  const down = fake([
    { method: 'GET', test: /\/me\/contacts/, reply: () => ({ ok: false, status: 500, body: {} }) }
  ]);
  const failed = await C.run({ name: 'Dana' }, { call: down.call, grantedScopes: ['Contacts.Read'] });
  check('a contacts error is not a made-up address', failed.reason === 'contacts-failed' && down.calls.length === 1);

  const offer = C.offer({ text: 'Please look up the contact Dana Cohen.' });
  check('a lookup offer names Dana Cohen and does not close', offer.show === true && offer.params.name === 'Dana Cohen' && offer.closes === false && offer.button === 'Look up', offer);
  ['I\'ll send Dana the numbers by Thursday.', 'Please save the attachment to OneDrive.', 'We agreed to renew the passport application by Friday.', 'Thanks, attaching the board pack for your records today.', ''].forEach((text) => {
    check('stays quiet: ' + JSON.stringify(text).slice(0, 48), C.offer({ text: text }).show === false);
  });
  check('undo is not a write', (await C.undo({}, { call: () => { throw new Error('called'); } })).reason === 'no-undo');
  check('a read is not a receipt', C.receiptFromLog([{ kind: 'written', connectorId: 'outlookContacts', fetchedBack: true }], { itemId: 'x' }) === null);

  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  const hooks = bg.split('\n').filter((line) => line.indexOf('lane-ms-host.js') >= 0);
  check('background.js has one lane hook', hooks.length === 1 && bg.indexOf('outlook-contacts.js') < 0, hooks);
  const page = fs.readFileSync(path.join(__dirname, '../src/content-outlook.js'), 'utf8');
  check('content-outlook.js is not edited for this lane', page.indexOf('FlowLaneMs') < 0 && page.indexOf('lane-ms') < 0);
  const contactsSrc = fs.readFileSync(path.join(__dirname, '../core/outlook-contacts.js'), 'utf8');
  check('contacts has no startup side effects', contactsSrc.indexOf('getManifest') < 0 && contactsSrc.indexOf('registerContentScripts') < 0 && contactsSrc.indexOf('addListener') < 0 && contactsSrc.indexOf('laneBindHost') < 0);

  if (failures) process.exit(1);
  console.log('outlook-contacts-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
