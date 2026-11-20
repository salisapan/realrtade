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
const scopes = { call: null, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now };

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
  check('reversed Hebrew display is the same token set', C.nameMatches('דנה כהן', 'כהן דנה') === true);
  check('a longer name is not the same token set', C.nameMatches('דנה כהן', 'דנה כהן לוי') === false);
  check('Dana Cohen does not match Levi Dana', C.nameMatches('Dana Cohen', 'Levi Dana') === false);
  check('given and surname match in either order', C.rowMatches('דנה כהן', { givenName: 'כהן', surname: 'דנה', fileAs: 'כהן, דנה' }) === true);
  check('niqqud and punctuation do not change the tokens', C.nameMatches('דָּנָה כֹּהֵן', 'כהן דנה') === true);
  check('Dana Cohen matches a reversed English given and surname', C.rowMatches('Dana Cohen', { givenName: 'Cohen', surname: 'Dana' }) === true);

  const judge = C.judgeInput({ text: "What's Dana's email?" }, { grantedScopes: ['Contacts.Read'], contactsChoice: true });
  check('judgeInput offers lane-ms', judge.action === 'lane-ms' && judge.connectorId === 'outlookContacts');
  const missing = C.judgeInput({ text: "What's Dana's email?" }, { grantedScopes: ['Mail.Read'], contactsChoice: true });
  check('missing Contacts.Read is a visible why, not a lookup',
    missing.action === 'why' && missing.reason === 'contacts-not-granted' && missing.detail === 'contacts-scope-missing' && missing.action !== 'lane-ms' &&
    /שורת Outlook/.test(missing.written) && /אנשי קשר/.test(missing.written),
    missing);
  const grant = C.offer({ text: "What's Dana Cohen's email?" }, { grantedScopes: ['Mail.Read'], contactsChoice: true });
  check('missing scope card names the Outlook row and does not close',
    grant.show === true && grant.grant === true && grant.button === '' && grant.closes === false &&
    grant.reason === 'contacts-not-granted' && grant.detail === 'contacts-scope-missing' &&
    /שורת Outlook/.test(grant.written) && /אנשי קשר/.test(grant.written),
    grant);
  const unticked = C.offer({ text: "What's Dana Cohen's email?" }, { grantedScopes: ['Contacts.Read'], contactsChoice: false });
  check('an unticked Contacts box is not granted even when the token still has the scope',
    unticked.show === true && unticked.grant === true && unticked.detail === 'contacts-toggle-off' && unticked.button === '',
    unticked);
  let called = false;
  const denied = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: () => { called = true; return { ok: true, body: {} }; }, grantedScopes: ['Mail.Read'], contactsChoice: true, now: now }
  );
  check('missing scope does not call Graph and does not send',
    called === false && denied.ok === false && denied.posted === false && denied.reason === 'contacts-not-granted' && denied.detail === 'contacts-scope-missing' && /אנשי קשר/.test(denied.written),
    denied);
  let calledOff = false;
  const off = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: () => { calledOff = true; return { ok: true, body: {} }; }, grantedScopes: ['Contacts.Read'], contactsChoice: false, now: now }
  );
  check('toggle off makes no contacts call',
    calledOff === false && off.detail === 'contacts-toggle-off' && off.posted === false,
    off);
  const already = C.consentPlan({ ticked: true, scopes: ['Mail.ReadWrite', 'Contacts.Read'] });
  check('a ticked box whose token already has Contacts.Read stays ticked and does not ask again',
    already.choice === true && already.already === true && already.request === false && /כבר כלולים/.test(already.line),
    already);
  const ask = C.consentPlan({ ticked: true, scopes: ['Mail.ReadWrite'] });
  check('a ticked box without Contacts.Read asks with prompt=consent',
    ask.choice === true && ask.request === true && ask.prompt === 'consent' && ask.scope === 'Contacts.Read',
    ask);
  const dropped = C.consentPlan({ ticked: false, scopes: ['Contacts.Read'] });
  check('unticking stores the choice off even when the token keeps Contacts.Read',
    dropped.choice === false && dropped.request === false && dropped.already === false,
    dropped);

  const hit = danaRoutes();
  const resolved = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: hit.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('one Dana: draft with email and fetchedBack', resolved.ok === true && resolved.posted === false && /dana@acme\.com/.test(resolved.draft) && resolved.fetchedBack === true && resolved.proof && resolved.proof.fetchedBack === true, resolved);
  check('resolve is GET only', hit.calls.every((c) => c.method === 'GET') && !hit.calls.some((c) => /sendMail/.test(c.path)), hit.calls.map((c) => c.method));

  const phoneHit = danaRoutes();
  const phone = await C.run(
    { params: { name: 'Dana Cohen', mode: 'phone', lang: 'en' } },
    { call: phoneHit.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
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
            { id: 'c1', displayName: 'Dana Cohen', givenName: 'Dana', surname: 'Cohen', emailAddresses: [{ address: 'dana@acme.com' }] },
            { id: 'c2', displayName: 'Cohen Dana', givenName: 'Cohen', surname: 'Dana', emailAddresses: [{ address: 'dana.cole@acme.com' }] }
          ]
        }
      })
    },
    { method: 'GET', test: /\/me\/people/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }
  ]);
  const amb = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: split.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('two addresses stay ambiguous and offer no draft button', amb.ok === false && amb.reason === 'ambiguous' && amb.button === '' && amb.choices && amb.choices.length === 2, amb);

  const reversed = fake([
    {
      method: 'GET',
      test: /\/me\/contacts\?/,
      reply: () => ({
        ok: true,
        status: 200,
        body: {
          value: [
            { id: 'c1', displayName: 'כהן דנה', givenName: 'כהן', surname: 'דנה', fileAs: 'כהן, דנה', emailAddresses: [{ address: 'dana.cohen.test@example.com' }] },
            { id: 'c2', displayName: 'Levi Dana', givenName: 'Levi', surname: 'Dana', fileAs: 'Levi Dana', emailAddresses: [{ address: 'dana.levi.test@example.com' }] }
          ]
        }
      })
    },
    {
      method: 'GET',
      test: /\/me\/contacts\/c1/,
      reply: () => ({
        ok: true,
        status: 200,
        body: { id: 'c1', displayName: 'כהן דנה', givenName: 'כהן', surname: 'דנה', fileAs: 'כהן, דנה', emailAddresses: [{ address: 'dana.cohen.test@example.com' }] }
      })
    }
  ]);
  const one = await C.run(
    { params: { name: 'דנה כהן', mode: 'email', lang: 'he' } },
    { call: reversed.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('reversed given and surname matches Dana and not Levi',
    one.ok === true && one.matchCount === 1 && one.button === 'הכנס לטיוטה' && /dana\.cohen\.test@example\.com/.test(one.draft) && !/dana\.levi\.test@example\.com/.test(one.draft || ''),
    one);

  const none = fake([
    { method: 'GET', test: /\/me\/contacts\?/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }
  ]);
  const missed = await C.run(
    { params: { name: 'דנה כהן', mode: 'email', lang: 'he' } },
    { call: none.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('zero matches says so and has no draft button',
    missed.ok === false && missed.reason === 'not-found' && missed.button === '' && missed.written === 'לא מצאתי את דנה כהן באנשי הקשר' && !/הכנס לטיוטה/.test(JSON.stringify(missed)),
    missed);

  const noAddress = fake([
    { method: 'GET', test: /\/me\/contacts\?/, reply: () => ({ ok: true, status: 200, body: { value: [{ id: 'c9', displayName: 'כהן דנה', givenName: 'כהן', surname: 'דנה' }] } }) }
  ]);
  const nameless = await C.run(
    { params: { name: 'דנה כהן', mode: 'email', lang: 'he' } },
    { call: noAddress.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('a match with no address does not offer the draft button',
    nameless.reason === 'not-found' && nameless.button === '' && !/הכנס לטיוטה/.test(JSON.stringify(nameless)),
    nameless);

  let pages = 0;
  const paged = fake([
    {
      method: 'GET',
      test: /\/me\/contacts\?/,
      reply: () => {
        pages += 1;
        return { ok: true, status: 200, body: { value: [], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/contacts?$top=100&$skip=' + (pages * 100) } };
      }
    }
  ]);
  await C.run(
    { params: { name: 'דנה כהן', mode: 'email', lang: 'he' } },
    { call: paged.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('contact paging stops after a few pages', pages === 3 && paged.calls.length === 3, pages);

  const mismatch = danaRoutes({
    id: 'c1',
    displayName: 'Dana Cohen',
    emailAddresses: [{ address: 'other@acme.com' }],
    businessPhones: []
  });
  const bad = await C.run(
    { params: { name: 'Dana Cohen', mode: 'email', lang: 'en' } },
    { call: mismatch.call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('read-back mismatch is verify_failed', bad.reason === 'verify_failed' && bad.fetchedBack === false, bad);

  const forbidden = await C.run(
    { post: true, params: { name: 'Dana Cohen', mode: 'email' } },
    { call: danaRoutes().call, grantedScopes: ['Contacts.Read'], contactsChoice: true, now: now }
  );
  check('never sends on post flag', forbidden.reason === 'FORBIDDEN_SEND');

  const offer = C.offer({ text: "What's Dana Cohen's email?" }, { grantedScopes: ['Contacts.Read'], contactsChoice: true });
  check('offer names Dana and does not close or show the draft button before a match',
    offer.show === true && offer.lookup === true && offer.button === '' && offer.params.name === 'Dana Cohen' && offer.closes === false, offer);

  check('undo is not a write', (await C.undo({}, { call: () => { throw new Error('called'); } })).reason === 'no-undo');
  check('a read is not a receipt', C.receiptFromLog([{ kind: 'written', connectorId: 'outlookContacts', fetchedBack: true }], { itemId: 'x' }) === null);

  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  const hooks = bg.split('\n').filter((line) => line.indexOf('lane-ms-host.js') >= 0);
  check('background.js has one lane hook', hooks.length === 1 && bg.indexOf('outlook-contacts.js') < 0, hooks);
  const page = fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, '../core/lane-ms-host.js'), 'utf8');
  const outlook = fs.readFileSync(path.join(__dirname, '../src/content-outlook.js'), 'utf8');
  check('lane page paints contact draft', page.indexOf('flow-lane-draft') >= 0 && page.indexOf('Draft ready') >= 0);
  check('You send is the contacts lane only', page.indexOf("res.connectorId === 'outlookContacts' && res.draft && res.posted === false") >= 0 && page.indexOf("status.textContent = 'Not posted.'") >= 0);
  check('the card says how to grant Contacts.Read', page.indexOf('data-glance-contacts-why') >= 0 && page.indexOf('flow:contacts-why') >= 0 && page.indexOf('שורת Outlook') >= 0);
  check('the worker logs the contacts why', host.indexOf("[Glance] contacts why-not") >= 0 && host.indexOf("type === 'flow:contacts-why'") >= 0);
  check('the worker logs the contact lookup', host.indexOf('[Glance] contacts lookup q=') >= 0 && host.indexOf('matches=') >= 0 && host.indexOf('status=') >= 0);
  check('Outlook leaves a contacts ask to that card', outlook.indexOf('contactsLaneOwns') >= 0 && outlook.indexOf('contacts-unavailable') >= 0);
  check('a quiet no-ask is not kept after the contacts grant changes',
    outlook.indexOf('glanceContactsChoice') >= 0 && outlook.indexOf('intent-null') >= 0 && outlook.indexOf('data-glance-ms-card') >= 0);
  const popup = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  check('the Outlook row persists the Contacts tick and asks with prompt=consent',
    popup.indexOf('glanceContactsChoice') >= 0 && popup.indexOf('consentPlan') >= 0 && popup.indexOf("prompt: 'consent'") >= 0);
  check('an already-granted Contacts tick uses the contacts sentence', popup.indexOf('אנשי קשר כבר כלולים בכניסה.') >= 0);
  const offAt = popup.indexOf('data-glance-contacts-off');
  const offBlock = offAt >= 0 ? popup.slice(offAt, offAt + 700) : '';
  check('כבה on Contacts stores the choice off and does not disconnect Outlook',
    offAt >= 0 && offBlock.indexOf('glanceContactsChoice: false') >= 0 && offBlock.indexOf('disconnect') < 0, offBlock);
  check('a skipped contacts mail asks the worker to log why', outlook.indexOf('flow:contacts-why') >= 0 && outlook.indexOf('contacts-not-granted') >= 0);
  check('zero matches and a missing address leave the draft button off the card',
    page.indexOf('לא מצאתי את ') >= 0 && page.indexOf('offer.lookup') >= 0 && page.indexOf('flow-lane-pick') >= 0);
  check('a failed insert says so and offers copy', page.indexOf('לא הצלחתי להכניס לטיוטה') >= 0 && page.indexOf('flow-lane-copy') >= 0 && page.indexOf('createReply') < 0);
  check('the card sits above the message body', page.indexOf('mailMessageBodyContainer') >= 0 && page.indexOf('z-index:30') >= 0);

  if (failures) process.exit(1);
  console.log('outlook-contacts-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
