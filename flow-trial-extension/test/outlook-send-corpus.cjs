// Mail.Send stays off. A preview sends only on an explicit click when the
// flag is on, and Handled requires a Sent Items read-back.
// Run: node test/outlook-send-corpus.cjs
'use strict';
const { FlowProofOfClose } = require('../core/proof-of-close.js');
globalThis.FlowProofOfClose = FlowProofOfClose;
const { FlowOutlookSend: S } = require('../core/outlook-send.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const TEXT = 'Please send this email\nTo: dana@acme.com\nCc: ada@acme.com\nSubject: Pricing\nBody: The numbers are ready.';
const NOW = '2026-10-14T12:00:00.000Z';

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

const sentHit = {
  method: 'GET',
  test: /sentitems/,
  reply: () => ({
    ok: true,
    status: 200,
    body: { value: [{ id: 'sent-1', subject: 'Pricing', toRecipients: [{ emailAddress: { address: 'dana@acme.com' } }], sentDateTime: NOW }] }
  })
};
const posted = { method: 'POST', test: /\/me\/sendMail$/, reply: () => ({ ok: true, status: 202, body: null }) };

(async () => {
  check('the flag defaults off', S.MAIL_SEND_ENABLED === false && S.mailSendEnabled({}) === false && S.mailSendEnabled({ enabled: true }) === true);
  const hidden = S.offer({ text: TEXT });
  check('the default offer is refused and has no send button', hidden.show === false && hidden.reason === 'FORBIDDEN_SEND', hidden);
  const card = S.offer({ text: TEXT, enabled: true });
  check('an enabled preview has To, Cc, subject, and body', card.show === true && card.lines.length === 4 && card.lines.map((row) => row.label).join(',') === 'To,Cc,Subject,Body' && card.lines[1].value === 'ada@acme.com', card);
  check('Cc can be empty and the line stays', S.offer({ text: 'Please send this email\nTo: dana@acme.com\nSubject: Pricing\nBody: Ready.', enabled: true }).lines[1].value === '');
  ['I\'ll send Dana the numbers by Thursday.', 'Please save the attachment to OneDrive.', 'We agreed to renew the passport application by Friday.', ''].forEach((text) => {
    check('stays quiet: ' + JSON.stringify(text).slice(0, 42), S.offer({ text: text, enabled: true }).show === false);
  });

  const off = fake([posted, sentHit]);
  const blocked = await S.run({ text: TEXT, explicitClick: true }, { call: off.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('flag off does not call', blocked.reason === 'FORBIDDEN_SEND' && off.calls.length === 0, blocked);

  const unclicked = fake([posted, sentHit]);
  const noClick = await S.run({ text: TEXT, enabled: true, explicitClick: false }, { call: unclicked.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('without an explicit click nothing is called', noClick.reason === 'FORBIDDEN_SEND' && unclicked.calls.length === 0, noClick);

  const bad = fake([posted]);
  const invalid = await S.run({ text: 'Please send this email\nTo: not-an-email\nSubject: Pricing\nBody: Ready.', enabled: true, explicitClick: true }, { call: bad.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('a bad address is not sent', invalid.reason === 'not-ready' && bad.calls.length === 0, invalid);

  const noscope = fake([posted]);
  const denied = await S.run({ text: TEXT, enabled: true, explicitClick: true }, { call: noscope.call, grantedScopes: ['Mail.Read'], now: () => NOW });
  check('without Mail.Send the flag still does not call', denied.reason === 'mail-send-not-granted' && noscope.calls.length === 0);

  const live = fake([posted, sentHit]);
  const sent = await S.run({ text: TEXT, enabled: true, explicitClick: true, messageId: 'm-send' }, { call: live.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('an explicit click sends and reads Sent Items', sent.ok === true && sent.proof.fetchedBack === true && sent.proof.system === 'microsoft/mail' && sent.proof.externalId === 'sent-1', sent);
  check('the request is one sendMail then a Sent Items read', live.calls.length === 2 && live.calls[0].method === 'POST' && live.calls[0].path === '/me/sendMail' && live.calls[0].allowSend === true && live.calls[0].body.saveToSentItems === true && live.calls[1].method === 'GET', live.calls.map((c) => c.method + ' ' + c.path));
  check('the log names the send and omits the body', sent.log.event === 'mail-send' && sent.log.kind === 'written' && sent.log.where === 'Sent Items' && sent.log.to === 'dana@acme.com' && !Object.prototype.hasOwnProperty.call(sent.log, 'body'), sent.log);

  const miss = fake([posted, { method: 'GET', test: /sentitems/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }]);
  const unverified = await S.run({ text: TEXT, enabled: true, explicitClick: true }, { call: miss.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('a missing Sent Items row is not Handled', unverified.reason === 'verify_failed' && !unverified.proof, unverified);

  const removed = fake([{ method: 'DELETE', test: /\/me\/messages\/sent-1$/, reply: () => ({ ok: true, status: 204, body: null }) }]);
  const undone = await S.undo(sent.ref, { call: removed.call, grantedScopes: ['Mail.Send'], now: () => NOW });
  check('undo removes the Sent Items copy', undone.ok === true && /Sent Items copy was removed/.test(undone.written) && removed.calls[0].method === 'DELETE', undone);

  if (failures) process.exit(1);
  console.log('outlook-send-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
