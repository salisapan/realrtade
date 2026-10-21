// Wiring of the Notion connector inside background.js: the switches default off and change nothing; with notionReadBack on, the
// writer returns a ProofOfClose, Undo reads back, the learning event carries no text, Disconnect forgets the ledger; with
// notionOAuth on, the code goes to the relay (never the secret), the state is checked, and the token stays on the device.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const DB = '11111111-2222-3333-4444-555555555555';

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {}));
  const pages = {}; let seq = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      const p = u.replace('https://api.notion.com/v1', '');
      if (method === 'POST' && p === '/pages') {
        const id = 'page-' + (++seq);
        pages[id] = { object: 'page', id, archived: false, url: 'https://www.notion.so/' + id, parent: { database_id: body.parent.database_id }, properties: { Name: { type: 'title', title: body.properties.Name.title.map((x) => ({ plain_text: x.text.content })) } } };
        return res(200, pages[id]);
      }
      if (method === 'GET' && p.indexOf('/databases/') === 0) return res(200, { title: [{ plain_text: 'Tasks' }], properties: { Name: { type: 'title' } } });
      if (method === 'GET' && p.indexOf('/pages/') === 0) { const pg = pages[p.slice(7)]; return pg ? res(200, pg) : res(404, {}); }
      if (method === 'PATCH' && p.indexOf('/pages/') === 0) { const pg = pages[p.slice(7)]; if (!pg) return res(404, {}); pg.archived = true; return res(200, pg); }
      return res(500, { error: 'unrouted ' + method + ' ' + u });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/', launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  return { calls, stored, pages, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { notionAuth: { token: 'secret_tok', databaseId: DB, dbTitle: 'Tasks', schema: {} } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['notionReadBack: false', 'notionReadBack: true']];

(async () => {
  console.log('\n--- switches default off, behaviour identical ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('both switches are false in the shipped config', env.fn('CONNECTORS').notionReadBack === false && env.fn('CONNECTORS').notionOAuth === false, env.fn('CONNECTORS'));
    check('off: the Notion writer and undoer are the earlier ones', env.fn('WRITERS').notion === env.fn('notionWrite') && env.fn('UNDOERS').notion === env.fn('notionUndo'));
    const out = await env.fn('WRITERS').notion(PAYLOAD);
    check('off: the earlier write still works and makes no proof claim', out.ok === true && out.proof === undefined, out);
    check('off: no learning event is stored', env.stored.connectorOutcomes === undefined && env.stored.notionLedger === undefined);
    let threw = '';
    try { await env.fn('connectNotionOAuth')('https://notion.so/' + DB.replace(/-/g, '')); } catch (e) { threw = e.message; }
    check('off: Sign in with Notion refuses and calls nothing', /not switched on/.test(threw) && env.calls.filter((c) => c.method === 'AUTH' || c.url.indexOf('relay') >= 0).length === 0, threw);
  }

  console.log('\n--- notionReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: the proof writer and undoer are wired', env.fn('WRITERS').notion === env.fn('notionReadBackWrite') && env.fn('UNDOERS').notion === env.fn('notionReadBackUndo'));
    const out = await env.fn('WRITERS').notion(PAYLOAD);
    check('on: Handled with a proof of notion/page that was read back', out.ok === true && out.proof && out.proof.system === 'notion/page' && out.proof.fetchedBack === true, out);
    check('on: the proof is accepted by FlowProofOfClose', env.fn('FlowProofOfClose').isProof(out.proof));
    const again = await env.fn('WRITERS').notion(PAYLOAD);
    check('on: a second click creates no second page', Object.keys(env.pages).length === 1 && again.ok === true, Object.keys(env.pages));
    const ev = env.stored.connectorOutcomes || [];
    const dump = JSON.stringify(ev);
    check('on: learning events were emitted (approved, handled)', ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled'), ev.map((e) => e.stage));
    check('on: the events carry no title, address or text', dump.indexOf('Dana') < 0 && dump.indexOf('contract') < 0 && dump.indexOf('mail.google') < 0 && dump.indexOf('secret_tok') < 0, dump);
    const un = await env.fn('UNDOERS').notion(out.ref);
    check('on: Undo archives and reads back', un.ok === true && un.readBack === true && env.pages['page-1'].archived === true, un);
    check('on: Undo is a learning event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone'));
    await env.fn('disconnectConnector')('notion');
    check('Disconnect removes the token and the ledger', env.stored.notionAuth === undefined && env.stored.notionLedger === undefined, Object.keys(env.stored));
  }
  {
    // read-back failure through the real wiring
    let n = 0;
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && String(url).indexOf('/pages/') >= 0) { n++; return res(500, {}); } return real(url, init); };
    const out = await env.fn('WRITERS').notion(PAYLOAD);
    check('read-back 500: ok false, no proof, reason verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: a readback_failed event, not handled', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'));
    check('read-back 500: the page exists once; no duplicate', Object.keys(env.pages).length === 1);
  }

  console.log('\n--- notionOAuth on ---\n');
  {
    const patch = [['notionOAuth: false', 'notionOAuth: true'], ["notionClientId: 'REPLACE_WITH_NOTION_CLIENT_ID'", "notionClientId: 'cid-public'"]];
    const env = load({ patch, relay: (b) => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref', workspace_id: 'w' }),
      authResult: (u) => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/?code=CODE1&state=' + new URL(u).searchParams.get('state') });
    const r = await env.fn('connectNotionOAuth')('https://www.notion.so/Tasks-' + DB.replace(/-/g, ''));
    const auth = env.calls.find((c) => c.method === 'AUTH');
    const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    check('oauth: the authorize URL carries the public client id, the redirect and a state; no secret', /client_id=cid-public/.test(auth.url) && /state=[0-9a-f]{32}/.test(auth.url) && !/secret/i.test(auth.url), auth.url);
    check('oauth: the relay got vendor, grant, code, redirect and an install id only', relay && relay.body.vendor === 'notion' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && /^[0-9a-f]{32}$/.test(relay.body.install_id) && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay && relay.body);
    check('oauth: the relay URL is the owner\'s function', relay.url === 'https://theflow-ai.com/.netlify/functions/token-relay', relay.url);
    check('oauth: the token is stored on the device and the database was verified with it', env.stored.notionAuth.token === 'oauth_tok' && env.stored.notionAuth.refreshToken === 'oauth_ref' && r.title === 'Tasks' && env.calls.some((c) => c.url.indexOf('/databases/') > 0 && c.auth === 'Bearer oauth_tok'), env.stored.notionAuth);
  }
  {
    const patch = [['notionOAuth: false', 'notionOAuth: true'], ["notionClientId: 'REPLACE_WITH_NOTION_CLIENT_ID'", "notionClientId: 'cid-public'"]];
    const env = load({ patch, relay: () => res(200, { access_token: 't' }), authResult: () => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/?code=CODE1&state=forged' });
    let threw = ''; try { await env.fn('connectNotionOAuth')(DB); } catch (e) { threw = e.message; }
    check('oauth: a forged state is refused before anything goes to the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const patch = [['notionOAuth: false', 'notionOAuth: true']];
    const env = load({ patch });
    let threw = ''; try { await env.fn('connectNotionOAuth')(DB); } catch (e) { threw = e.message; }
    check('oauth: no client id configured -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const patch = [['notionOAuth: false', 'notionOAuth: true'], ["notionClientId: 'REPLACE_WITH_NOTION_CLIENT_ID'", "notionClientId: 'cid-public'"]];
    const env = load({ patch, relay: () => res(502, { error: 'invalid_grant' }), authResult: (u) => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/?code=C&state=' + new URL(u).searchParams.get('state') });
    let threw = ''; try { await env.fn('connectNotionOAuth')(DB); } catch (e) { threw = e.message; }
    check('oauth: the relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.notionAuth === undefined, threw);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
