// Wiring of the Jira connector inside background.js: both switches default off and register nothing; with jiraReadBack on the writer
// returns a ProofOfClose, Undo reads back, the learning event has no text, Disconnect forgets the ledger; with jiraOAuth on the code goes
// to the relay (never the secret), the state is checked, the site and issue type are resolved, and the token stays on the device.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const CLOUD = '1324a887-45db-1bf4-1e99-ef0ff456d421';
const GW = 'https://api.atlassian.com/ex/jira/' + CLOUD + '/rest/api/3';
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const issues = {}; let seq = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (u === 'https://api.atlassian.com/oauth/token/accessible-resources') return res(200, o.sites || [{ id: CLOUD, url: 'https://acme.atlassian.net', name: 'acme', scopes: [] }]);
      if (u === GW + '/project/OPS') return res(200, { key: 'OPS', name: 'Operations', issueTypes: [{ id: '10001', name: 'Epic', subtask: false }, { id: '10003', name: 'Sub-task', subtask: true }, { id: '10002', name: 'Task', subtask: false }] });
      if (u.indexOf(GW) !== 0) return res(500, { error: 'unrouted ' + method + ' ' + u });
      const p = u.slice(GW.length);
      if (method === 'POST' && p === '/issue') { const key = 'OPS-' + (100 + (++seq)); issues[key] = { id: String(10000 + seq), key, fields: { summary: body.fields.summary, project: { key: body.fields.project.key }, status: { statusCategory: { key: 'new' } } } }; return res(201, { id: issues[key].id, key }); }
      const m = p.match(/^\/issue\/([A-Z0-9-]+)/);
      if (m && method === 'GET') return issues[m[1]] ? res(200, issues[m[1]]) : res(404, {});
      if (m && method === 'DELETE') { delete issues[m[1]]; return res(204, undefined); }
      if (p.indexOf('/search/jql') === 0) return res(200, { issues: Object.values(issues) });
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
  return { calls, stored, issues, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { jiraAuth: { token: 'jira_tok', refreshToken: 'jira_ref', cloudId: CLOUD, siteUrl: 'https://acme.atlassian.net', projectKey: 'OPS', issueTypeId: '10002' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['jiraReadBack: false', 'jiraReadBack: true']];
const OAUTH = [['jiraOAuth: false', 'jiraOAuth: true'], ["jiraClientId: 'REPLACE_WITH_JIRA_CLIENT_ID'", "jiraClientId: 'cid-public'"]];
const goodRelay = () => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref' });
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: jira switches are false', env.fn('CONNECTORS').jiraReadBack === false && env.fn('CONNECTORS').jiraOAuth === false);
    check('off: no jira writer or undoer exists', env.fn('WRITERS').jira === undefined && env.fn('UNDOERS').jira === undefined);
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('off: Sign in with Jira refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.jiraLedger === undefined);
  }
  console.log('\n--- jiraReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "jira"', env.fn('WRITERS').jira === env.fn('jiraReadBackWrite') && env.fn('UNDOERS').jira === env.fn('jiraReadBackUndo'));
    const out = await env.fn('WRITERS').jira(PAYLOAD);
    check('on: Handled with a read-back proof of jira/issue and the browse url', out.ok === true && out.proof && out.proof.system === 'jira/issue' && out.proof.fetchedBack === true && out.proof.url === 'https://acme.atlassian.net/browse/OPS-101', out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    const again = await env.fn('WRITERS').jira(PAYLOAD);
    check('on: a second click creates no second issue', Object.keys(env.issues).length === 1 && again.ok === true);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for jira (approved, handled), no text', ev.every((e) => e.connector === 'jira' && e.destinationSystem === 'jira/issue') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|jira_tok|OPS-/.test(dump), dump);
    const un = await env.fn('UNDOERS').jira(out.ref);
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.keys(env.issues).length === 0, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'jira'));
    await env.fn('disconnectConnector')('jira');
    check('Disconnect removes the token and the ledger', env.stored.jiraAuth === undefined && env.stored.jiraLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && /\/issue\/OPS-\d+\?/.test(String(url))) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').jira(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'));
    check('read-back 500: one issue exists', Object.keys(env.issues).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['asanaReadBack: false', 'asanaReadBack: true'], ['notionReadBack: false', 'notionReadBack: true']]) });
    check('all three connectors on: each has its own writer', env.fn('WRITERS').jira === env.fn('jiraReadBackWrite') && env.fn('WRITERS').asana === env.fn('asanaReadBackWrite') && env.fn('WRITERS').notion === env.fn('notionReadBackWrite'));
  }
  console.log('\n--- jiraOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth });
    const r = await env.fn('connectJiraOAuth')('https://acme.atlassian.net/jira/software/projects/OPS/boards/1');
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id, audience, the two work scopes + offline_access, a state, no secret', q.get('client_id') === 'cid-public' && q.get('audience') === 'api.atlassian.com' && q.get('scope') === 'read:jira-work write:jira-work offline_access' && /^[0-9a-f]{32}$/.test(q.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor, grant, code, redirect, install id', relay.body.vendor === 'jira' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    const a = env.stored.jiraAuth;
    check('oauth: token on device; site, project and the Task issue type resolved (not Epic, not Sub-task)', a.token === 'oauth_tok' && a.refreshToken === 'oauth_ref' && a.cloudId === CLOUD && a.siteUrl === 'https://acme.atlassian.net' && a.projectKey === 'OPS' && a.issueTypeId === '10002' && r.title === 'Operations', a);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth });
    await env.fn('connectJiraOAuth')('OPS');
    check('oauth: a bare project key works when the account has exactly one site', env.stored.jiraAuth && env.stored.jiraAuth.projectKey === 'OPS');
  }
  {
    const two = [{ id: CLOUD, url: 'https://acme.atlassian.net' }, { id: '2324a887-45db-1bf4-1e99-ef0ff456d421', url: 'https://other.atlassian.net' }];
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth, sites: two });
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('oauth: several sites and only a key -> asks for a link, stores nothing', /several Jira sites/.test(threw) && env.stored.jiraAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth, sites: [{ id: CLOUD, url: 'https://evil.example/' }, { id: '../x', url: 'https://acme.atlassian.net' }] });
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('oauth: a site whose url or id is not Atlassian-shaped is never used', /no Jira site/.test(threw) && env.stored.jiraAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['jiraOAuth: false', 'jiraOAuth: true']] });
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectJiraOAuth')('OPS'); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.jiraAuth === undefined, threw);
    let t2 = ''; try { await env.fn('connectJiraOAuth')('not a project; DROP'); } catch (e) { t2 = e.message; }
    check('oauth: a non-project input is refused before any sign-in', /project key/.test(t2));
  }
  {
    const f = load({}).fn('parseJiraProject');
    check('project parsing', f('OPS').key === 'OPS' && f('https://acme.atlassian.net/jira/software/projects/OPS/boards/1').key === 'OPS' && f('https://acme.atlassian.net/browse/OPS-12').host === 'acme.atlassian.net' && f('https://evil.example/browse/OPS-1') === null && f('ops') === null && f('OPS" OR 1=1') === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
