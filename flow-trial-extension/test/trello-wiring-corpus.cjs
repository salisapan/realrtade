// Wiring of the Trello connector inside background.js: both switches default off and register nothing; with trelloReadBack on the writer returns a ProofOfClose, Undo ARCHIVES and reads back
// (never deletes, refuses a card the person changed), the learning event has no text, Disconnect forgets the ledger; with trelloOAuth on the return-URL state is checked, the token comes from
// the fragment, the list is found by name on the chosen board, and the token stays on the device (no relay, no secret).
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const KEY = '0123456789abcdef0123456789abcdef';
const LIST = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const AUTHH = (t) => 'OAuth oauth_consumer_key="' + KEY + '", oauth_token="' + t + '"';

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const cards = {}; let seq = 0;
  const lists = o.lists || [{ id: LIST, name: 'To do' }, { id: 'cccccccccccccccccccccccc', name: 'Doing' }];
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return res(500, { error: 'the relay must not be used for Trello' });
      const p = u.replace('https://api.trello.com/1', '');
      if (!init || !init.headers || init.headers.Authorization !== AUTHH(o.token || TOKEN)) return res(401, 'invalid token');
      if (method === 'POST' && p === '/cards') { const id = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0') + String(++seq).padStart(16, '0'); cards[id] = { id, name: body.name, desc: '', idList: body.idList, closed: false, due: body.due || null, shortUrl: 'https://trello.com/c/Abc' + seq }; return res(200, cards[id]); }
      let m = p.match(/^\/cards\/([0-9a-f]{24})/);
      if (m && method === 'GET') return cards[m[1]] ? res(200, cards[m[1]]) : res(404, 'not found');
      if (m && method === 'PUT') { if (!cards[m[1]]) return res(404, 'x'); Object.assign(cards[m[1]], body); return res(200, cards[m[1]]); }
      if (method === 'GET' && /^\/boards\/ABCD1234\/lists/.test(p)) return o.boards === 'forbidden' ? res(403, 'x') : res(200, lists);
      if (method === 'GET' && p.indexOf('/lists/' + LIST + '/cards') === 0) return res(200, Object.values(cards));
      return res(500, { error: 'unrouted ' + method + ' ' + u });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => REDIRECT, launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  return { calls, stored, cards, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { trelloAuth: { token: TOKEN, apiKey: KEY, listId: LIST, listName: 'To do' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['trelloReadBack: false', 'trelloReadBack: true']];
const OAUTH = [['trelloOAuth: false', 'trelloOAuth: true'], ["trelloApiKey: 'REPLACE_WITH_TRELLO_API_KEY'", "trelloApiKey: '" + KEY + "'"]];
const goodAuth = (u) => { const ret = new URL(u).searchParams.get('return_url'); return ret + '#token=' + TOKEN; };
const trello = (env) => env.calls.filter((c) => /trello\.com/.test(c.url));

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    const C = env.fn('CONNECTORS');
    check('shipped config: trello switches are false', C.trelloReadBack === false && C.trelloOAuth === false, C);
    check('off: no trello writer or undoer exists', env.fn('WRITERS').trello === undefined && env.fn('UNDOERS').trello === undefined);
    let threw = ''; try { await env.fn('connectTrello')('https://trello.com/b/ABCD1234/ops', 'To do'); } catch (e) { threw = e.message; }
    check('off: Connect Trello refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.trelloLedger === undefined);
  }
  console.log('\n--- trelloReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "trello"', env.fn('WRITERS').trello === env.fn('trelloReadBackWrite') && env.fn('UNDOERS').trello === env.fn('trelloReadBackUndo'));
    const out = await env.fn('WRITERS').trello(PAYLOAD);
    check('on: Handled with a read-back proof of trello/card', out.ok === true && out.proof && out.proof.system === 'trello/card' && out.proof.fetchedBack === true, out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    check('on: the token is in the Authorization header, never in a URL; only card and list endpoints; no DELETE', trello(env).every((c) => c.auth === AUTHH(TOKEN) && c.url.indexOf(TOKEN) < 0 && c.method !== 'DELETE' && /\/1\/(cards|lists)/.test(c.url)), trello(env).map((c) => c.method + c.url));
    const again = await env.fn('WRITERS').trello(PAYLOAD);
    check('on: a second click creates no second card', Object.keys(env.cards).length === 1 && again.ok === true, Object.keys(env.cards));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events emitted for trello (approved, handled), no text', ev.every((e) => e.connector === 'trello') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|abcdef0123/.test(dump), dump);
    const un = await env.fn('UNDOERS').trello(out.ref);
    check('on: Undo ARCHIVES and reads back (the card still exists, closed)', un.ok === true && un.readBack === true && Object.values(env.cards).length === 1 && Object.values(env.cards)[0].closed === true, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'trello'));
    await env.fn('disconnectConnector')('trello');
    check('Disconnect removes the token and the ledger', env.stored.trelloAuth === undefined && env.stored.trelloLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const out = await env.fn('WRITERS').trello(PAYLOAD); Object.values(env.cards)[0].desc = 'my own notes';
    const un = await env.fn('UNDOERS').trello(out.ref);
    check('on: Undo refuses a card the person changed and archives nothing', un.ok === false && un.reason === 'edited-by-person' && Object.values(env.cards)[0].closed === false && !env.calls.some((c) => c.method === 'PUT'), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && /\/cards\/[0-9a-f]{24}\?/.test(String(url))) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').trello(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event, one card exists', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.cards).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['asanaReadBack: false', 'asanaReadBack: true']]) });
    check('trello and asana on together: each has its own writer', env.fn('WRITERS').trello === env.fn('trelloReadBackWrite') && env.fn('WRITERS').asana === env.fn('asanaReadBackWrite'));
  }
  console.log('\n--- trelloOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, authResult: goodAuth });
    const r = await env.fn('connectTrello')('https://trello.com/b/ABCD1234/ops-board', ' to DO ');
    const auth = env.calls.find((c) => c.method === 'AUTH'); const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public app key, scope read,write, expiration, a state riding in the return URL; no secret', new URL(auth.url).origin + new URL(auth.url).pathname === 'https://trello.com/1/authorize' && q.get('key') === KEY && q.get('scope') === 'read,write' && q.get('response_type') === 'token' && /[?&]state=[0-9a-f]{32}$/.test(q.get('return_url')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: the token is stored on the device with the app key and the chosen list (matched by name, case-insensitive); nothing goes to the relay', env.stored.trelloAuth.token === TOKEN && env.stored.trelloAuth.apiKey === KEY && env.stored.trelloAuth.listId === LIST && r.title === 'To do' && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), env.stored.trelloAuth);
    check('oauth: the board is read with the token in the header only', env.calls.some((c) => /\/boards\/ABCD1234\/lists/.test(c.url) && c.auth === AUTHH(TOKEN) && c.url.indexOf(TOKEN) < 0));
  }
  {
    const env = load({ patch: OAUTH, authResult: (u) => new URL(u).searchParams.get('return_url').replace(/state=[0-9a-f]+/, 'state=forged') + '#token=' + TOKEN });
    let threw = ''; try { await env.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { threw = e.message; }
    check('oauth: a forged or missing state is refused before the token is used', /could not be verified/.test(threw) && !env.calls.some((c) => /api\.trello\.com/.test(c.url)) && env.stored.trelloAuth === undefined, threw);
    const env2 = load({ patch: OAUTH, authResult: (u) => REDIRECT + '#token=' + TOKEN });
    let t2 = ''; try { await env2.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { t2 = e.message; }
    check('oauth: no state at all is refused', /could not be verified/.test(t2) && env2.stored.trelloAuth === undefined, t2);
  }
  {
    for (const [name, result] of [['no token', (u) => new URL(u).searchParams.get('return_url') + '#error=access_denied'], ['a malformed token', (u) => new URL(u).searchParams.get('return_url') + '#token=short'], ['a token with markup', (u) => new URL(u).searchParams.get('return_url') + '#token=' + encodeURIComponent('x'.repeat(30) + '"><script>')]]) {
      const env = load({ patch: OAUTH, authResult: result });
      let threw = ''; try { await env.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { threw = e.message; }
      check('oauth: ' + name + ' is refused and nothing is stored or called', /did not return a token/.test(threw) && env.stored.trelloAuth === undefined && !env.calls.some((c) => /api\.trello\.com/.test(c.url)), threw);
    }
  }
  {
    const env = load({ patch: OAUTH, authResult: goodAuth });
    for (const [b, l, re] of [['not a board', 'To do', /doesn’t look like a Trello board/], ['https://evil.example/b/ABCD1234/x', 'To do', /doesn’t look like a Trello board/], ['ABCD1234', '', /name of the list/], ['ABCD1234', 'x'.repeat(101), /name of the list/]]) {
      let threw = ''; try { await env.fn('connectTrello')(b, l); } catch (e) { threw = e.message; }
      check('oauth: input "' + String(b).slice(0, 18) + '" / "' + String(l).slice(0, 5) + '" is refused before any sign-in', re.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
    }
    const none = load({ patch: OAUTH, authResult: goodAuth, lists: [{ id: LIST, name: 'Doing' }] });
    let t1 = ''; try { await none.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { t1 = e.message; }
    check('oauth: a list name that does not exist on the board stores nothing', /no open list with that name/.test(t1) && none.stored.trelloAuth === undefined, t1);
    const two = load({ patch: OAUTH, authResult: goodAuth, lists: [{ id: LIST, name: 'To do' }, { id: 'dddddddddddddddddddddddd', name: 'to do' }] });
    let t2 = ''; try { await two.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { t2 = e.message; }
    check('oauth: two lists with that name are refused, never guessed', /Two lists/.test(t2) && two.stored.trelloAuth === undefined, t2);
    const forb = load({ patch: OAUTH, authResult: goodAuth, boards: 'forbidden' });
    let t3 = ''; try { await forb.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { t3 = e.message; }
    check('oauth: a board the person cannot open stores nothing', /cannot open that board/.test(t3) && forb.stored.trelloAuth === undefined, t3);
    const nokey = load({ patch: [['trelloOAuth: false', 'trelloOAuth: true']] });
    let t4 = ''; try { await nokey.fn('connectTrello')('ABCD1234', 'To do'); } catch (e) { t4 = e.message; }
    check('oauth: no app key -> says so, asks nothing', /isn’t configured/.test(t4) && !nokey.calls.some((c) => c.method === 'AUTH'), t4);
  }
  {
    const env = load({});
    const f = env.fn('parseTrelloBoard');
    check('board link parsing', f('https://trello.com/b/ABCD1234/ops') === 'ABCD1234' && f('https://trello.com/b/ABCD1234') === 'ABCD1234' && f('ABCD1234') === 'ABCD1234' && f('https://evil.example/b/ABCD1234/x') === null && f('https://trello.com/c/ABCD1234') === null && f('ABCD123') === null && f('') === null && f(null) === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
