// MC1 Microsoft Contacts: Contacts.Read resolve + reply draft, never send.
// Run: node test/outlook-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowProofOfClose } = require('../core/proof-of-close.js');
const { FlowOutlookContacts: C } = require('../core/outlook-contacts.js');

globalThis.FlowProofOfClose = FlowProofOfClose;

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

const now = () => new Date().toISOString();
const scopes = { call: null, grantedScopes: ['Contacts.Read'], now: now };

function danaRoutes(readBack) {
  const contact = {
    id: 'c1',
    displayName: 'Dana Cohen',
    emailAddresses: [{ address: 'dana@acme.com' }],
    businessPhones: ['+972501234567']
  };
  return fake([
    {
      method: 'GET',
      test: /\/me\/contacts\?/,
      reply: () => ({ ok: true, status: 200, body: { value: [contact] } })
    },
    {
      method: 'GET',
      test: /\/me\/people/,
      reply: () => ({ ok: false, status: 403, body: { error: { code: 'ErrorAccessDenied' } } })
    },
    {
      method: 'GET',
      test: /\/me\/contacts\/c1/,
      reply: () => ({
        ok: true,
        status: 200,
        body: readBack || contact
      })
    }
  ]);
}

(async () => {
  check('Hebrew email ask is recognized', C.recognize('מה כתובת המייל של דנה כהן').mode === 'email' && C.recognize('מה כתובת המייל של דנה כהן').name.indexOf('דנה') >= 0);
  check('English phone ask is recognized', C.recognize("send me Dana's phone").mode === 'phone');
  check('Hebrew nameMatches', C.nameMatches('דנה כהן', 'דנה כהן לוי') === true);

  const judge = C.judgeInput({ text: "What's Dana's email?" }, { grantedScopes: ['Contacts.Read'] });
  check('judgeInput offers lane-ms', judge.action === 'lane-ms' && judge.connectorId === 'outlookContacts');
  check('judgeInput missing scope stays silent', C.judgeInput({ text: "What's Dana's email?" }, { grantedScopes: ['Mail.Read'] }).reason === 'missing-scope');

  const hit = danaRoutes();
  const resolved = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: hit.call, grantedScopes: ['Contacts.Read'], now: now }
  );
  check('one Dana: draft with email and fetchedBack', resolved.ok === true && resolved.posted === false && /dana@acme\.com/.test(resolved.draft) && resolved.fetchedBack === true && resolved.proof && resolved.proof.fetchedBack === true, resolved);
  check('resolve is GET only', hit.calls.every((c) => c.method === 'GET') && !hit.calls.some((c) => /sendMail/.test(c.path)), hit.calls.map((c) => c.method));

  const phoneHit = danaRoutes();
  const phone = await C.run(
    { params: { name: 'Dana Cohen', mode: 'phone', lang: 'en' } },
    { call: phoneHit.call, grantedScopes: ['Contacts.Read'], now: now }
  );
  check('phone ask drafts the number', /\+972501234567/.test(phone.draft), phone);

  const split = fake([
    {
      method: 'GET',
      test: /\/me\/contacts\?/,
      reply: () => ({
        ok: true,
        status: 200,
        body: {
          value: [
            { id: 'c1', displayName: 'Dana Cohen', emailAddresses: [{ address: 'dana@acme.com' }] },
            { id: 'c2', displayName: 'Dana Cole', emailAddresses: [{ address: 'dana.cole@acme.com' }] }
          ]
        }
      })
    },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }
  ]);
  const amb = await C.run(
    { params: { name: 'Dana', mode: 'email', lang: 'en' } },
    { call: split.call, grantedScopes: ['Contacts.Read'], now: now }
  );
  check('two addresses stay ambiguous', amb.ok === false && amb.reason === 'ambiguous', amb);

  const mismatch = danaRoutes({
    id: 'c1',
    displayName: 'Dana Cohen',
    emailAddresses: [{ address: 'other@acme.com' }],
    businessPhones: []
  });
  const bad = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: mismatch.call, grantedScopes: ['Contacts.Read'], now: now }
  );
  check('read-back mismatch is verify_failed', bad.reason === 'verify_failed' && bad.fetchedBack === false, bad);

  const forbidden = await C.run(
    { post: true, params: { name: 'Dana Cohen', mode: 'email' } },
    { call: danaRoutes().call, grantedScopes: ['Contacts.Read'], now: now }
  );
  check('never sends on post flag', forbidden.reason === 'FORBIDDEN_SEND');

  const offer = C.offer({ text: "What's Dana Cohen's email?" });
  check('offer names Dana and does not close', offer.show === true && offer.params.name === 'Dana Cohen' && offer.closes === false, offer);

  check('undo is not a write', (await C.undo({}, { call: () => { throw new Error('called'); } })).reason === 'no-undo');
  check('a read is not a receipt', C.receiptFromLog([{ kind: 'written', connectorId: 'outlookContacts', fetchedBack: true }], { itemId: 'x' }) === null);

  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  const hooks = bg.split('\n').filter((line) => line.indexOf('lane-ms-host.js') >= 0);
  check('background.js has one lane hook', hooks.length === 1 && bg.indexOf('outlook-contacts.js') < 0, hooks);
  const page = fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8');
  check('lane page paints contact draft', page.indexOf('flow-lane-draft') >= 0 && page.indexOf('Draft ready') >= 0);

  if (failures) process.exit(1);
  console.log('outlook-contacts-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
