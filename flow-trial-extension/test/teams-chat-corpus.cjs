// Teams Chat.Read: show a draft. Never post.
// Run: node test/teams-chat-corpus.cjs
'use strict';
const { FlowTeamsChat: T } = require('../core/teams-chat.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function fake(value) {
  const calls = [];
  const call = async (req) => {
    calls.push(req);
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return { ok: false, status: 403, body: { error: { code: 'never-post' } } };
    return { ok: true, status: 200, body: { value: value } };
  };
  return { calls, call };
}

(async () => {
  ['I\'ll send Dana the numbers by Thursday.', 'Please save the attachment to OneDrive.', 'We agreed to renew the passport application by Friday.', ''].forEach((text) => {
    check('stays quiet: ' + JSON.stringify(text).slice(0, 42), T.offer({ text: text }).show === false);
  });
  const offer = T.offer({ text: 'Please draft a teams reply to the pricing chat: I will send the numbers Thursday.' });
  check('a teams phrase offers a draft and does not close', offer.show === true && offer.closes === false && offer.button === 'Show draft', offer);

  const blocked = fake([]);
  const refused = await T.run({ post: true, text: 'draft a teams reply' }, { call: blocked.call, grantedScopes: ['Chat.Read'] });
  check('a post is refused before any request', refused.reason === 'FORBIDDEN_SEND' && blocked.calls.length === 0, refused);

  const method = fake([]);
  const posted = await T.run({ method: 'POST', text: 'draft a teams reply' }, { call: method.call, grantedScopes: ['Chat.Read'] });
  check('a non-GET is refused before any request', posted.reason === 'FORBIDDEN_SEND' && method.calls.length === 0);

  const none = fake([]);
  const empty = await T.run({ text: offer.params.text }, { call: none.call, grantedScopes: ['Chat.Read'] });
  check('no chats means not-found and no invented chat', empty.reason === 'not-found' && none.calls.length === 1 && none.calls[0].method === 'GET', empty);

  const chats = fake([
    { id: 'chat-2', topic: 'other', chatType: 'group' },
    { id: 'chat-1', topic: 'pricing', chatType: 'group' }
  ]);
  const shown = await T.run({ params: { text: offer.params.text } }, { call: chats.call, grantedScopes: ['Chat.Read'] });
  check('the matching chat is shown and nothing is posted', shown.ok === true && shown.posted === false && shown.chat.id === 'chat-1' && shown.draft === 'I will send the numbers Thursday.', shown);
  check('the read is one GET', chats.calls.length === 1 && chats.calls[0].path.indexOf('/me/chats') === 0 && chats.calls[0].method === 'GET');

  const denied = fake([{ id: 'c', topic: 'pricing' }]);
  const no = await T.run({ text: 'draft a teams reply' }, { call: denied.call, grantedScopes: ['Mail.Read'] });
  check('without Chat.Read nothing is read', no.reason === 'chat-not-granted' && denied.calls.length === 0);
  check('a draft is not a receipt', T.receiptFromLog([{ kind: 'written', connectorId: 'teamsChat', fetchedBack: true }], { itemId: 'm' }) === null);

  if (failures) process.exit(1);
  console.log('teams-chat-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
