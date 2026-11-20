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

  if (failures) process.exit(1);
  console.log('outlook-draft-id-corpus: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
