// A contact insert may createReply only with a message id GET /me/messages/{id}
// already returned, and only with the Prefer that GET used. A self-sent alias
// and the mailbox CID are one account. A 400 is logged with the Graph error.
// Run: node test/outlook-draft-id-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowOwaParse } = require('../core/owa-parse.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

const ALIAS = 'glance.salisapan@outlook.com';
const CID = 'outlook_de6b4487c57f9cb0@outlook.com';
const PROVEN = 'AAMkPROVEN';
const CONV = 'AQQkCONV';

check('an alias and the mailbox CID are the same account',
  FlowOwaParse.sameMailbox(CID, ALIAS, [ALIAS]) === true);
check('a different person is not that account',
  FlowOwaParse.sameMailbox('levi@example.com', ALIAS, [ALIAS]) === false);

function background(routes) {
  const calls = [];
  const notes = [];
  const stored = {
    outlookAuth: { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600 * 1000, rtIssuedAt: Date.now() }, account: { address: ALIAS } },
    outlookSync: {}
  };
  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status: status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  const sandbox = {
    console: Object.assign({}, console, { info: (...args) => { notes.push(args.join(' ')); } }),
    URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url);
      const method = (init && init.method) || 'GET';
      const prefer = init && init.headers && (init.headers.Prefer || init.headers.prefer) || '';
      let body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init && init.body; }
      calls.push({ method: method, url: u, prefer: prefer, body: body });
      for (let i = 0; i < routes.length; i++) {
        if (routes[i].method === method && routes[i].test.test(u) && (!routes[i].prefer || routes[i].prefer(prefer))) {
          return routes[i].reply(u, prefer);
        }
      }
      return json(404, { error: { code: 'ErrorItemNotFound', message: 'not found' } });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x.apps.googleusercontent.com' }, version: '0' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (o, cb) => cb('gtok'), removeCachedAuthToken: (o, cb) => cb(), getRedirectURL: () => 'https://ext.chromiumapp.org/', launchWebAuthFlow: () => {} },
      storage: { local: { get: async (k) => { const o = JSON.parse(JSON.stringify(stored)); if (typeof k === 'string') return { [k]: o[k] }; if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = o[x]; }); return r; } return o; }, set: async (p) => { Object.assign(stored, p); }, remove: async () => {} }, onChanged: { addListener() {} } },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {}, query: async () => [] },
      alarms: { create: () => {}, onAlarm: { addListener() {} } },
      contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } },
      permissions: { contains: async () => false },
      scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} }
    }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { calls: calls, notes: notes, fn: (n) => vm.runInContext(n, sandbox), json: json };
}

(async () => {
  const alias = background([
    { method: 'GET', test: new RegExp('/me/messages/' + encodeURIComponent(CONV)), reply: () => ({ ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) }) },
    { method: 'GET', test: new RegExp('/me/messages/' + PROVEN), prefer: (p) => !p, reply: () => ({ ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) }) },
    { method: 'GET', test: new RegExp('/me/messages/' + PROVEN), prefer: (p) => /ImmutableId/.test(p), reply: () => ({ ok: true, status: 200, json: async () => ({ id: PROVEN }), text: async () => JSON.stringify({ id: PROVEN }) }) },
    { method: 'POST', test: /\/createReply$/, reply: (url) => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-ALIAS', isDraft: true, webLink: 'https://outlook.live.com/mail/drafts/DRAFT-ALIAS', body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-ALIAS/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-ALIAS' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-ALIAS/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-ALIAS', isDraft: true, subject: 'RE: שאלה קטנה 317b', body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const wrote = await alias.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookIdHow: 'self-alias',
    outlookIncomingId: CONV,
    outlookCandidates: [CONV, PROVEN],
    body: 'דנה כהן\nדוא"ל: dana.cohen.test@example.com',
    comment: 'דנה כהן\nדוא"ל: dana.cohen.test@example.com'
  });
  const posts = alias.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  check('a self-alias mail creates the reply on the id GET accepted, with that Prefer',
    wrote.ok === true && posts.length === 1 && posts[0].url.indexOf(PROVEN) >= 0 && /ImmutableId/.test(posts[0].prefer) && posts[0].url.indexOf(CONV) < 0,
    { ok: wrote.ok, posts: posts.map((c) => ({ url: c.url, prefer: c.prefer })) });
  check('createReply does not use the conversation id without a matching Prefer',
    !alias.calls.some((c) => c.method === 'POST' && c.url.indexOf(CONV) >= 0 && !/ImmutableId/.test(c.prefer || '')),
    alias.calls.filter((c) => c.method === 'POST').map((c) => c.url));

  const raw = background([
    { method: 'GET', test: /\/me\/messages\//, reply: () => ({ ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) }) }
  ]);
  const missed = await raw.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookIdHow: 'raw-item',
    outlookIncomingId: CONV,
    outlookCandidates: [CONV],
    outlookImmutableId: false,
    body: 'x'
  });
  check('an unproven raw id is not posted to createReply',
    missed.ok === false && missed.reason === 'unproven-id' && !raw.calls.some((c) => c.method === 'POST'),
    { reason: missed.reason, posts: raw.calls.filter((c) => c.method === 'POST') });

  const bad = background([
    { method: 'GET', test: new RegExp('/me/messages/' + PROVEN), reply: () => ({ ok: true, status: 200, json: async () => ({ id: PROVEN }), text: async () => JSON.stringify({ id: PROVEN }) }) },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) }) }
  ]);
  const failed = await bad.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookIdHow: 'get-message',
    outlookIncomingId: PROVEN,
    outlookCandidates: [PROVEN],
    body: 'x'
  });
  const line = bad.notes.find((n) => n.indexOf('[Glance] contacts draft') >= 0) || '';
  check('a Graph 400 is logged with the status and a short error body',
    failed.ok === false && /http-400/.test(failed.reason) && line.indexOf('http=400') >= 0 && line.indexOf('ErrorInvalidIdMalformed') >= 0 && line.indexOf('Id is malformed') >= 0 && line.indexOf('immutable=') >= 0,
    { reason: failed.reason, line: line, posts: bad.calls.filter((c) => c.method === 'POST').length });
  check('the 400 is retried once with the other IdType and nothing is sent',
    bad.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url)).length === 2 && !bad.calls.some((c) => /sendMail|\/send\b/.test(c.url)),
    bad.calls.filter((c) => c.method === 'POST').map((c) => c.prefer));

  const page = fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8');
  const target = page.slice(page.indexOf('function draftTarget'), page.indexOf('function markInDraft'));
  check('a missing resolver does not hand createReply a raw item id',
    target.indexOf('resolver-missing') >= 0 && target.indexOf('immutable: false') >= 0 && target.indexOf('pane.itemId') < 0,
    target.slice(0, 240));

  if (failures) process.exit(1);
  console.log('outlook-draft-id-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
