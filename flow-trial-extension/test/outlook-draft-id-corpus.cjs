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
  const again = await alias.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookIdHow: 'self-alias',
    outlookIncomingId: CONV,
    outlookCandidates: [CONV, PROVEN],
    body: 'דנה כהן\nדוא"ל: dana.cohen.test@example.com',
    comment: 'דנה כהן\nדוא"ל: dana.cohen.test@example.com'
  });
  check('a second insert reuses the mapped Graph draft and does not createReply again',
    again.ok === true && again.reused === true && alias.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url)).length === 1,
    { ok: again.ok, reused: again.reused, posts: alias.calls.filter((c) => c.method === 'POST').map((c) => c.url) });

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
  const line = bad.notes.join('\n');
  check('a Graph 400 is logged with the status and a short error body',
    failed.ok === false && /http-400/.test(failed.reason) && line.indexOf('http=400') >= 0 && line.indexOf('ErrorInvalidIdMalformed') >= 0 && line.indexOf('Id is malformed') >= 0 && line.indexOf('immutable=') >= 0 && line.indexOf('gets=') >= 0,
    { reason: failed.reason, line: line, posts: bad.calls.filter((c) => c.method === 'POST').length });
  check('the 400 is retried once with the other IdType and nothing is sent',
    bad.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url)).length === 2 && !bad.calls.some((c) => /sendMail|\/send\b/.test(c.url)),
    bad.calls.filter((c) => c.method === 'POST').map((c) => c.prefer));

  function hashCandidate(value) {
    let h = 5381;
    const s = String(value || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
  const NET = '<317b@outlook.com>';
  const REAL = 'AAMkFROMNET';
  const byNet = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
      if (url.indexOf(REAL) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: REAL }), text: async () => JSON.stringify({ id: REAL }) };
      return { ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) };
    } },
    { method: 'GET', test: /\$filter=/, reply: (url) => {
      const filter = decodeURIComponent(url);
      if (filter.indexOf("internetMessageId eq '" + NET + "'") < 0) return { ok: true, status: 200, json: async () => ({ value: [] }), text: async () => '{"value":[]}' };
      return { ok: true, status: 200, json: async () => ({ value: [{ id: REAL, internetMessageId: NET, subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } }] }), text: async () => '' };
    } },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-NET', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-NET/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-NET' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-NET/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-NET', isDraft: true, subject: 'RE: שאלה קטנה 317b', body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const netWrote = await byNet.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    internetMessageId: '317b@outlook.com',
    subject: 'שאלה קטנה 317b',
    senderEmail: ALIAS,
    body: 'x'
  });
  const netPosts = byNet.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  const netLog = byNet.notes.join('\n');
  check('a self-alias mail is resolved by internetMessageId, then createReply uses the proved id',
    netWrote.ok === true && netPosts.length === 1 && netPosts[0].url.indexOf(REAL) >= 0 && /ImmutableId/.test(netPosts[0].prefer) && netPosts[0].url.indexOf(CONV) < 0 &&
    netLog.indexOf('how=internetMessageId') >= 0 && netLog.indexOf('candidates=' + hashCandidate(CONV)) >= 0 && netLog.indexOf(CONV) < 0 && netLog.indexOf(REAL) < 0,
    { ok: netWrote.ok, posts: netPosts, log: netLog });

  const BYSUB = 'AAMkFROMSUB';
  const bySub = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
      if (url.indexOf(BYSUB) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: BYSUB }), text: async () => JSON.stringify({ id: BYSUB }) };
      return { ok: false, status: 404, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorItemNotFound', message: 'not found' } }) };
    } },
    { method: 'GET', test: /\$filter=/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [
      { id: BYSUB, subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } },
      { id: 'AAMkOTHER', subject: 'שאלה קטנה 317b', from: { emailAddress: { address: 'levi@example.com' } } }
    ] }), text: async () => '' }) },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-SUB', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-SUB/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-SUB' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-SUB/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-SUB', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const subWrote = await bySub.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    subject: 'שאלה קטנה 317b',
    senderEmail: ALIAS,
    body: 'x'
  });
  const subPosts = bySub.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  const subLog = bySub.notes.join('\n');
  check('without an internet message id, subject and the alias resolve the CID mail',
    subWrote.ok === true && subPosts.length === 1 && subPosts[0].url.indexOf(BYSUB) >= 0 && subPosts[0].url.indexOf('AAMkOTHER') < 0 &&
    subLog.indexOf('how=subject-from') >= 0 && subLog.indexOf(BYSUB) < 0,
    { ok: subWrote.ok, posts: subPosts.map((c) => c.url), log: subLog });

  const ambiguous = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) },
    { method: 'GET', test: /\$filter=/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [
      { id: 'AAMkONE', subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } },
      { id: 'AAMkTWO', subject: 'שאלה קטנה 317b', from: { emailAddress: { address: ALIAS } } }
    ] }), text: async () => '' }) }
  ]);
  const many = await ambiguous.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    subject: 'שאלה קטנה 317b',
    senderEmail: ALIAS,
    body: 'x'
  });
  const manyLog = ambiguous.notes.join('\n');
  check('two subject and from matches fail closed and do not createReply',
    many.ok === false && many.reason === 'ambiguous' && many.how === 'subject-from' &&
    !ambiguous.calls.some((c) => c.method === 'POST') && manyLog.indexOf('code=ambiguous') >= 0 && manyLog.indexOf('how=subject-from') >= 0 &&
    manyLog.indexOf('AAMkONE') < 0 && manyLog.indexOf('AAMkTWO') < 0,
    { reason: many.reason, log: manyLog });

  const unprovenLog = raw.notes.join('\n');
  check('an unproven lookup logs hashed candidates and GET statuses, not the raw id',
    unprovenLog.indexOf('candidates=' + hashCandidate(CONV)) >= 0 && unprovenLog.indexOf('gets=') >= 0 && unprovenLog.indexOf('how=unproven') >= 0 && unprovenLog.indexOf(CONV) < 0,
    unprovenLog);

  const OWN = 'AAMkOWNONLY';
  const byOwn = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
      if (url.indexOf(OWN) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: OWN }), text: async () => JSON.stringify({ id: OWN }) };
      return { ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 'ErrorInvalidIdMalformed', message: 'Id is malformed.' } }) };
    } },
    { method: 'GET', test: /\$filter=/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [
      { id: OWN, subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } }
    ] }), text: async () => '' }) },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-OWN', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-OWN/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-OWN' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-OWN/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-OWN', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const ownWrote = await byOwn.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    internetMessageId: '',
    senderEmail: '',
    ownSenderEmail: ALIAS,
    subject: 'שאלה קטנה 317b',
    body: 'x'
  });
  const ownPosts = byOwn.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  const ownLog = byOwn.notes.join('\n');
  check('empty senderEmail still lists by subject using ownSenderEmail and the CID',
    ownWrote.ok === true && ownPosts.length === 1 && ownPosts[0].url.indexOf(OWN) >= 0 &&
    byOwn.calls.some((c) => c.method === 'GET' && c.url.indexOf('$filter') >= 0) &&
    ownLog.indexOf('why=no-internetMessageId') >= 0 && ownLog.indexOf('how=subject-from') >= 0 && ownLog.indexOf(CONV) < 0 && ownLog.indexOf(OWN) < 0,
    { ok: ownWrote.ok, posts: ownPosts.map((c) => c.url), log: ownLog });

  const SUBONLY = 'AAMkSUBONLY';
  const bySubject = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
      if (url.indexOf(SUBONLY) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: SUBONLY }), text: async () => JSON.stringify({ id: SUBONLY }) };
      return { ok: false, status: 400, json: async () => ({}), text: async () => '' };
    } },
    { method: 'GET', test: /\$filter=/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [
      { id: SUBONLY, subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } }
    ] }), text: async () => '' }) },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-SUBONLY', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-SUBONLY/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-SUBONLY' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-SUBONLY/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-SUBONLY', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const subjectOnly = await bySubject.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    senderEmail: '',
    ownSenderEmail: '',
    subject: 'שאלה קטנה 317b',
    body: 'x'
  });
  const subjectPosts = bySubject.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  check('a subject with no from address still uses one last-day row',
    subjectOnly.ok === true && subjectPosts.length === 1 && subjectPosts[0].url.indexOf(SUBONLY) >= 0 &&
    bySubject.notes.join('\n').indexOf('why=missing-from') >= 0,
    { ok: subjectOnly.ok, posts: subjectPosts.map((c) => c.url) });

  const MISS = 'AAMkAFTERMISS';
  const missThen = background([
    { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
      if (url.indexOf(MISS) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: MISS }), text: async () => JSON.stringify({ id: MISS }) };
      return { ok: false, status: 400, json: async () => ({}), text: async () => '' };
    } },
    { method: 'GET', test: /\$filter=/, reply: (url) => {
      const filter = decodeURIComponent(url);
      if (filter.indexOf('internetMessageId eq') >= 0) return { ok: true, status: 200, json: async () => ({ value: [] }), text: async () => '{"value":[]}' };
      return { ok: true, status: 200, json: async () => ({ value: [
        { id: MISS, subject: 'שאלה קטנה 317b', from: { emailAddress: { address: CID } } }
      ] }), text: async () => '' };
    } },
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'DRAFT-MISS', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-MISS/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-MISS' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-MISS/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-MISS', isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) }
  ]);
  const missedNet = await missThen.fn('outlookDraftWrite')({
    requireProvenId: true,
    outlookCandidates: [CONV],
    outlookIncomingId: CONV,
    internetMessageId: 'missing@outlook.com',
    senderEmail: '',
    ownSenderEmail: ALIAS,
    subject: 'שאלה קטנה 317b',
    body: 'x'
  });
  const missPosts = missThen.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url));
  const missLog = missThen.notes.join('\n');
  check('an internetMessageId miss continues to subject-from',
    missedNet.ok === true && missPosts.length === 1 && missPosts[0].url.indexOf(MISS) >= 0 &&
    missLog.indexOf('why=empty-list') >= 0 && missLog.indexOf('how=subject-from') >= 0 &&
    missThen.calls.filter((c) => c.method === 'GET' && c.url.indexOf('$filter') >= 0).length >= 2,
    { ok: missedNet.ok, log: missLog });

  const page = fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8');
  const target = page.slice(page.indexOf('function draftTarget'), page.indexOf('function markInDraft'));
  check('a missing resolver does not hand createReply a raw item id',
    target.indexOf('resolver-missing') >= 0 && target.indexOf('immutable: false') >= 0 && target.indexOf('pane.itemId') < 0,
    target.slice(0, 240));
  const tickAt = page.indexOf('async function tick');
  const lookupAt = page.indexOf('paintLookup(offer', tickAt);
  check('a failed insert holds the card so a later tick does not wipe it',
    page.indexOf('data-glance-draft-hold') >= 0 && page.indexOf('function draftCardStays') >= 0 &&
    tickAt >= 0 && lookupAt > tickAt && page.slice(tickAt, lookupAt).indexOf('draftCardStays') >= 0);
  const fakeFail = {
    attrs: { 'data-glance-draft-hold': '1' },
    getAttribute(name) { return this.attrs[name] || ''; },
    querySelector(sel) { return sel === '.flow-lane-draft-why' ? { textContent: 'לא הצלחתי להכניס לטיוטה' } : null; }
  };
  const pageBox = {
    document: { documentElement: {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; } },
    chrome: { runtime: { sendMessage() {}, lastError: null }, storage: { onChanged: { addListener() {} } } },
    location: { href: 'https://outlook.live.com/mail/' },
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  pageBox.globalThis = pageBox;
  vm.createContext(pageBox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8'), pageBox, { filename: 'lane-ms-page.js' });
  const stays = pageBox.FlowLaneMsPage.draftCardStays;
  check('the same open mail keeps the failure text when the DOM mutates',
    stays(fakeFail, true) === true && stays(fakeFail, false) === false);

  const INBOX_ID = 'AAMkINBOXCOPY';
  const SENT_ID = 'AAMkSENTCOPY';
  const DRAFT_ID = 'AAMkDRAFTCOPY';
  function selfCopies() {
    const row = (id, folder, draft, from) => ({
      id: id,
      subject: 'שאלה קטנה 317b',
      isDraft: draft,
      parentFolderId: folder,
      conversationId: 'AAQkSAMECONV',
      receivedDateTime: '2026-11-20T18:00:00Z',
      from: { emailAddress: { address: from } }
    });
    return [
      row(INBOX_ID, 'FOLDER_INBOX', false, CID),
      row(SENT_ID, 'FOLDER_SENT', false, ALIAS),
      row(DRAFT_ID, 'FOLDER_DRAFTS', true, ALIAS)
    ];
  }
  function folderRoutes(rows, provedId, draftName) {
    return [
      { method: 'GET', test: /\/me\/mailFolders\/inbox/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'FOLDER_INBOX' }), text: async () => '' }) },
      { method: 'GET', test: /\/me\/mailFolders\/sentitems/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'FOLDER_SENT' }), text: async () => '' }) },
      { method: 'GET', test: /\/me\/mailFolders\/drafts/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'FOLDER_DRAFTS' }), text: async () => '' }) },
      { method: 'GET', test: new RegExp('/me/messages/' + draftName), reply: () => ({ ok: true, status: 200, json: async () => ({ id: draftName, isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
      { method: 'GET', test: /\/me\/messages\/[^/?]+/, reply: (url, prefer) => {
        if (url.indexOf(provedId) >= 0 && /ImmutableId/.test(prefer || '')) return { ok: true, status: 200, json: async () => ({ id: provedId }), text: async () => JSON.stringify({ id: provedId }) };
        return { ok: false, status: 400, json: async () => ({}), text: async () => '' };
      } },
      { method: 'GET', test: /\$filter=/, reply: (url) => {
        const filter = decodeURIComponent(url);
        if (filter.indexOf('isDraft') < 0 || filter.indexOf('parentFolderId') < 0 || filter.indexOf('conversationId') < 0) {
          return { ok: false, status: 400, json: async () => ({}), text: async () => '' };
        }
        return { ok: true, status: 200, json: async () => ({ value: rows }), text: async () => '' };
      } },
      { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: draftName, isDraft: true, body: { contentType: 'Text', content: 'x' } }), text: async () => '' }) },
      { method: 'PATCH', test: new RegExp('/me/messages/' + draftName), reply: () => ({ ok: true, status: 200, json: async () => ({ id: draftName }), text: async () => '' }) }
    ];
  }
  async function writeCopies(extra, rows, provedId, draftName) {
    const bg = background(folderRoutes(rows || selfCopies(), provedId, draftName));
    const wrote = await bg.fn('outlookDraftWrite')(Object.assign({
      requireProvenId: true,
      outlookCandidates: [CONV],
      outlookIncomingId: CONV,
      internetMessageId: '',
      subject: 'שאלה קטנה 317b',
      openFolder: 'inbox',
      body: 'x'
    }, extra || {}));
    return { bg: bg, wrote: wrote, posts: bg.calls.filter((c) => c.method === 'POST' && /createReply$/.test(c.url)) };
  }
  const withFrom = await writeCopies({ senderEmail: ALIAS, ownSenderEmail: '', openSenderEmail: '' }, null, INBOX_ID, 'DRAFT-INBOX');
  const withFromLog = withFrom.bg.notes.join('\n');
  check('an Inbox and Sent copy of a self-sent subject resolves to the Inbox copy when from is present',
    withFrom.wrote.ok === true && withFrom.posts.length === 1 && withFrom.posts[0].url.indexOf(INBOX_ID) >= 0 &&
    withFrom.posts[0].url.indexOf(SENT_ID) < 0 && withFrom.posts[0].url.indexOf(DRAFT_ID) < 0 &&
    withFromLog.indexOf('narrow rows=3 afterDrafts=2 afterFolder=1') >= 0 && withFromLog.indexOf('from=sender') >= 0 &&
    withFromLog.indexOf(ALIAS) < 0 && withFromLog.indexOf(INBOX_ID) < 0,
    { ok: withFrom.wrote.ok, posts: withFrom.posts.map((c) => c.url), log: withFromLog });
  const noFrom = await writeCopies({ senderEmail: '', ownSenderEmail: '', openSenderEmail: '' }, null, INBOX_ID, 'DRAFT-INBOX2');
  const noFromLog = noFrom.bg.notes.join('\n');
  check('the same Inbox copy is used when from is missing',
    noFrom.wrote.ok === true && noFrom.posts.length === 1 && noFrom.posts[0].url.indexOf(INBOX_ID) >= 0 &&
    noFromLog.indexOf('why=missing-from') >= 0 && noFromLog.indexOf('from=none') >= 0 &&
    noFromLog.indexOf('afterFolder=1') >= 0,
    { ok: noFrom.wrote.ok, log: noFromLog });

  const twoInbox = [
    { id: 'AAMkINBOXA', subject: 'שאלה קטנה 317b', isDraft: false, parentFolderId: 'FOLDER_INBOX', conversationId: 'AAQkONE', from: { emailAddress: { address: CID } } },
    { id: 'AAMkINBOXB', subject: 'שאלה קטנה 317b', isDraft: false, parentFolderId: 'FOLDER_INBOX', conversationId: 'AAQkTWO', from: { emailAddress: { address: ALIAS } } }
  ];
  const two = await writeCopies({ senderEmail: '', ownSenderEmail: '', openSenderEmail: '' }, twoInbox, 'AAMkINBOXA', 'DRAFT-TWO');
  check('two Inbox messages with the same subject fail closed',
    two.wrote.ok === false && two.wrote.reason === 'ambiguous' && !two.bg.calls.some((c) => c.method === 'POST') &&
    two.bg.notes.join('\n').indexOf('afterFolder=2') >= 0 && two.bg.notes.join('\n').indexOf('why=ambiguous') >= 0,
    { reason: two.wrote.reason, log: two.bg.notes.join('\n') });

  const DANA = 'AAMkDANA';
  const LEVI = 'AAMkLEVI';
  const otherRows = [
    { id: DANA, subject: 'שאלה קטנה 317b', isDraft: false, parentFolderId: 'FOLDER_SENT', conversationId: 'AAQkDANA', from: { emailAddress: { address: 'dana.cohen.test@example.com' } } },
    { id: LEVI, subject: 'שאלה קטנה 317b', isDraft: false, parentFolderId: 'FOLDER_INBOX', conversationId: 'AAQkLEVI', from: { emailAddress: { address: 'dana.levi.test@example.com' } } }
  ];
  const other = await writeCopies({ senderEmail: 'dana.cohen.test@example.com', ownSenderEmail: '', openSenderEmail: '' }, otherRows, DANA, 'DRAFT-DANA');
  check('a non-self sender still matches that from address',
    other.wrote.ok === true && other.posts.length === 1 && other.posts[0].url.indexOf(DANA) >= 0 && other.posts[0].url.indexOf(LEVI) < 0 &&
    other.bg.notes.join('\n').indexOf('from=sender') >= 0 && other.bg.notes.join('\n').indexOf('dana.cohen.test@example.com') < 0,
    { ok: other.wrote.ok, posts: other.posts.map((c) => c.url), log: other.bg.notes.join('\n') });

  const payload = page.slice(page.indexOf('function finishContactsDraft'), page.indexOf('function showDraftUndo'));
  check('the draft payload carries conversationId, receivedDateTime, and openFolder',
    payload.indexOf('conversationId:') >= 0 && payload.indexOf('receivedDateTime:') >= 0 && payload.indexOf('openFolder:') >= 0);

  let JSDOM = null;
  try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }
  check('jsdom is installed for the self-sent header', !!JSDOM);
  if (JSDOM) {
    const html = '<!doctype html><body><div id="ReadingPaneContainerId" role="main">' +
      '<div role="heading">שאלה קטנה 317b</div>' +
      '<div class="persona"><span class="from">' +
      '<span>sali sapan</span><span>&lt;</span><span>glance.salisapan@outlook.com</span><span>&gt;</span>' +
      '</span></div>' +
      '<div role="document">מה כתובת המייל של דנה כהן?</div></div></body>';
    const href = 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV);
    const dom = new JSDOM(html, { url: href });
    const parsed = FlowOwaParse.readPane(dom.window.document, href, { own: [CID] });
    check('a nested Name <email> header sets ownSenderEmail for a self-sent mail',
      parsed && parsed.senderEmail === '' && parsed.ownSenderEmail === ALIAS && parsed.openSenderEmail === ALIAS && parsed.openFolder === 'inbox',
      parsed && { senderEmail: parsed.senderEmail, ownSenderEmail: parsed.ownSenderEmail, openSenderEmail: parsed.openSenderEmail, openFolder: parsed.openFolder });
    const bareHref = 'https://outlook.live.com/mail/0/';
    const domBare = new JSDOM(html.replace('<div id="ReadingPaneContainerId"', '<div role="treeitem" aria-selected="true">Inbox</div><div id="ReadingPaneContainerId"'), { url: bareHref });
    const fromTree = FlowOwaParse.readPane(domBare.window.document, bareHref, { own: [CID] });
    check('the selected Inbox folder is used when the address has no folder',
      fromTree && fromTree.openFolder === 'inbox' && fromTree.ownSenderEmail === ALIAS,
      fromTree && fromTree.openFolder);
    const pad = 'נושא ארוך של הודעה שנשלחה לעצמי '.repeat(12);
    const longHtml = '<!doctype html><body><div id="ReadingPaneContainerId" role="main">' +
      '<div role="heading">שאלה קטנה 317b</div>' +
      '<div class="owahdr">' + pad + '\u200f sali sapan &lt;glance.salisapan@outlook.com&gt;\u200e' + pad + '</div>' +
      '<div role="document">מה כתובת המייל של דנה כהן?</div></div></body>';
    const longPane = FlowOwaParse.readPane(new JSDOM(longHtml, { url: href }).window.document, href, { own: [CID] });
    check('a long bidi-wrapped address in a header div sets ownSenderEmail',
      longPane && longPane.senderEmail === '' && longPane.ownSenderEmail === ALIAS && longPane.openSenderEmail === ALIAS &&
      longPane.headerHasAt === 1 && !longPane.senderSkip && pad.length > 180,
      longPane && { senderEmail: longPane.senderEmail, ownSenderEmail: longPane.ownSenderEmail, headerHasAt: longPane.headerHasAt, senderSkip: longPane.senderSkip, len: pad.length });

    const cardHtml = '<!doctype html><body><div id="ReadingPaneContainerId">' +
      '<button type="button" aria-label="השב">השב</button>' +
      '<div id="mailMessageBodyContainer"></div>' +
      '<div role="textbox" contenteditable="true"></div></div></body>';
    const cardDom = new JSDOM(cardHtml, { url: 'https://outlook.live.com/mail/0/inbox/', runScripts: 'dangerously' });
    const w = cardDom.window;
    let replyClicks = 0;
    w.chrome = {
      runtime: {
        sendMessage(msg, cb) {
          if (msg && msg.type === 'flow:execute-action') cb({ ok: true, ref: 'AAMkGRAPH', fetchedBack: true, created: { body: { content: 'דנה כהן' } } });
          else if (cb) cb({ ok: true, deleted: true });
        },
        lastError: null
      },
      storage: { onChanged: { addListener() {} } }
    };
    w.eval(fs.readFileSync(path.join(__dirname, '../src/lane-ms-page.js'), 'utf8'));
    w.document.querySelector('button[aria-label="השב"]').addEventListener('click', () => { replyClicks += 1; });
    const card = w.document.createElement('div');
    card.className = 'flow-lane-ms';
    const button = w.document.createElement('button');
    button.className = 'flow-lane-do';
    button.textContent = 'הכנס לטיוטה';
    card.appendChild(button);
    w.document.getElementById('ReadingPaneContainerId').appendChild(card);
    w.FlowOutlookDraftTarget = () => ({ id: '', immutable: false, how: 'unproven' });
    await new Promise((resolve) => {
      const send = w.chrome.runtime.sendMessage;
      w.chrome.runtime.sendMessage = (msg, cb) => { send(msg, cb); resolve(); };
      w.FlowLaneMsPage.finishContactsDraft(card, { subject: 'שאלה קטנה 317b' }, { params: { lang: 'he' } }, { ok: true, draft: 'דנה כהן\nדוא"ל: dana.cohen.test@example.com' }, button);
    });
    check('a successful insert does not click Reply and leaves one in-draft card',
      replyClicks === 0 && card.getAttribute('data-glance-draft-state') === 'in-draft' &&
      card.textContent.indexOf('בטיוטה') >= 0 && card.querySelector('.flow-lane-undo').textContent === 'בטל',
      { clicks: replyClicks, text: card.textContent });
    w.document.getElementById('ReadingPaneContainerId').innerHTML = '<div id="mailMessageBodyContainer"></div>';
    check('replacing the reading pane disconnects the card', card.isConnected === false);
    w.FlowLaneMsPage.keepDraftCard();
    check('the same in-draft card comes back with בטל',
      card.isConnected === true && card.textContent.indexOf('בטיוטה') >= 0 && card.querySelector('.flow-lane-undo').textContent === 'בטל');
    w.close();
  }

  if (failures) process.exit(1);
  console.log('outlook-draft-id-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
