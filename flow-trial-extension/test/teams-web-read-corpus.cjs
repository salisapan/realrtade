// Teams web Graph read fallback: Chat.Read, GET only, never post.
// Run: node test/teams-web-read-corpus.cjs
'use strict';
const { FlowTeamsWebRead: R } = require('../core/teams-web-read.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function fake(messages) {
  const calls = [];
  const call = async (req) => {
    calls.push(req);
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return { ok: false, status: 403 };
    return { ok: true, status: 200, body: { value: messages } };
  };
  return { calls, call };
}

(async () => {
  const blocked = fake([]);
  await R.readRecent('chat-1', { call: async (req) => {
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return { ok: false, status: 403 };
    return blocked.call(req);
  }, grantedScopes: ['Chat.Read'], selfId: 'u-me' });
  check('readRecent never posts', blocked.calls.every((c) => c.method === 'GET'), blocked.calls);

  const msgs = fake([
    { id: '2', createdDateTime: '2026-10-20T09:00:00Z', from: { user: { id: 'u-me', displayName: 'Me' } }, body: { content: 'OK' } },
    { id: '1', createdDateTime: '2026-10-20T08:00:00Z', from: { user: { id: 'u-them', displayName: 'Dana' } }, body: { content: '<p>Send the report by Friday</p>' } }
  ]);
  const got = await R.readRecent('chat-1', { call: msgs.call, grantedScopes: ['Chat.Read'], selfId: 'u-me' });
  check('messages are normalized oldest-first', got.ok === true && got.messages.length === 2 && got.messages[0].author === 'them', got);
  check('path is one GET on messages', msgs.calls.length === 1 && /\/me\/chats\/chat-1\/messages/.test(msgs.calls[0].path), msgs.calls[0]);

  const denied = fake([]);
  const no = await R.readRecent('chat-1', { call: denied.call, grantedScopes: ['Mail.Read'] });
  check('without Chat.Read nothing is read', no.reason === 'chat-not-granted' && denied.calls.length === 0);

  if (failures) process.exit(1);
  console.log('teams-web-read-corpus: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
