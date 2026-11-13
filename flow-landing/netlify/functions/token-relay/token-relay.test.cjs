// Mock-vendor tests for the token relay. No network. Run: node token-relay.test.cjs
const assert = require('assert');
const { relay, _resetRateLimit } = require('./token-relay.js');

const ID = 'dnjhplgmnkabbjogfpbhofjedlkehkai';
const REDIRECT = 'https://' + ID + '.chromiumapp.org/';
const ENV = { NOTION_CLIENT_ID: 'cid-123', NOTION_CLIENT_SECRET: 'SECRET-VALUE-xyz' };
let passed = 0;
async function t(name, fn) { _resetRateLimit(); await fn(); passed++; console.log('ok  ' + name); }

function mock(status, obj, extra) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return { status, ok: status >= 200 && status < 300, text: async () => text, headers: { get: (k) => (extra && extra[k.toLowerCase()]) || null } };
  };
  f.calls = calls;
  return f;
}
const ev = (body, o) => Object.assign({ httpMethod: 'POST', headers: { origin: 'chrome-extension://' + ID }, body: JSON.stringify(body) }, o || {});
const base = { vendor: 'notion', grant: 'code', code: 'abc', redirect_uri: REDIRECT, install_id: 'install-0001' };
const run = (e, f, logs) => relay(e, { env: ENV, fetch: f, now: () => 1000, log: (...a) => logs && logs.push(a.join(' ')) });

(async () => {
  await t('code grant reaches only the vendor token url, secret as Basic auth, not in body', async () => {
    const f = mock(200, { access_token: 'tok', workspace_id: 'w' });
    const r = await run(ev(base), f);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(JSON.parse(r.body).access_token, 'tok');
    assert.strictEqual(f.calls.length, 1);
    assert.strictEqual(f.calls[0].url, 'https://api.notion.com/v1/oauth/token');
    assert.strictEqual(f.calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('cid-123:SECRET-VALUE-xyz').toString('base64'));
    assert.ok(f.calls[0].init.body.indexOf('SECRET-VALUE') < 0);
    assert.deepStrictEqual(JSON.parse(f.calls[0].init.body), { grant_type: 'authorization_code', code: 'abc', redirect_uri: REDIRECT });
  });
  await t('refresh grant forwards the refresh token only', async () => {
    const f = mock(200, { access_token: 'tok2', refresh_token: 'r2' });
    const r = await run(ev({ vendor: 'notion', grant: 'refresh', refresh_token: 'r1', install_id: 'install-0001' }), f);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(f.calls[0].init.body), { grant_type: 'refresh_token', refresh_token: 'r1' });
  });
  await t('unknown vendor rejected, no outbound call (not an open proxy)', async () => {
    const f = mock(200, {});
    for (const v of ['evil', 'https://evil.example/', '__proto__', 'constructor', '']) {
      const r = await run(ev(Object.assign({}, base, { vendor: v })), f);
      assert.strictEqual(r.statusCode, 400, v);
    }
    assert.strictEqual(f.calls.length, 0);
  });
  await t('a token_url in the request is ignored', async () => {
    const f = mock(200, { access_token: 'x' });
    await run(ev(Object.assign({}, base, { token_url: 'https://evil.example/t', tokenUrl: 'https://evil.example/t' })), f);
    assert.strictEqual(f.calls[0].url, 'https://api.notion.com/v1/oauth/token');
  });
  await t('redirect_uri of another app rejected', async () => {
    const f = mock(200, {});
    const r = await run(ev(Object.assign({}, base, { redirect_uri: 'https://evil.example/cb' })), f);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(f.calls.length, 0);
  });
  await t('foreign browser origin refused', async () => {
    const f = mock(200, {});
    const r = await run(ev(base, { headers: { origin: 'https://evil.example' } }), f);
    assert.strictEqual(r.statusCode, 403);
    assert.strictEqual(r.headers['Access-Control-Allow-Origin'], undefined);
    assert.strictEqual(f.calls.length, 0);
  });
  await t('CORS only for the extension origin', async () => {
    const r = await run(ev(base), mock(200, { access_token: 't' }));
    assert.strictEqual(r.headers['Access-Control-Allow-Origin'], 'chrome-extension://' + ID);
    const pre = await run({ httpMethod: 'OPTIONS', headers: { origin: 'https://evil.example' } }, mock(200, {}));
    assert.strictEqual(pre.statusCode, 403);
  });
  await t('secret echoed by the vendor is withheld', async () => {
    const r = await run(ev(base), mock(200, { access_token: 't', debug: 'SECRET-VALUE-xyz' }));
    assert.strictEqual(r.statusCode, 502);
    assert.ok(r.body.indexOf('SECRET-VALUE') < 0);
  });
  await t('no body, code or token is logged', async () => {
    const logs = [];
    await run(ev(Object.assign({}, base, { code: 'CODE-SECRET-1' })), mock(200, { access_token: 'ACCESS-TOKEN-1' }), logs);
    const all = logs.join('\n');
    for (const bad of ['CODE-SECRET-1', 'ACCESS-TOKEN-1', 'SECRET-VALUE', 'cid-123']) assert.ok(all.indexOf(bad) < 0, bad);
  });
  await t('vendor error: reason passes, status mapped, body details not', async () => {
    const r = await run(ev(base), mock(400, { error: 'invalid_grant', error_description: 'contains user detail' }));
    assert.strictEqual(r.statusCode, 502);
    const b = JSON.parse(r.body);
    assert.strictEqual(b.error, 'invalid_grant');
    assert.ok(r.body.indexOf('user detail') < 0);
  });
  await t('vendor 429 keeps Retry-After', async () => {
    const r = await run(ev(base), mock(429, { error: 'rate_limited' }, { 'retry-after': '7' }));
    assert.strictEqual(r.statusCode, 429);
    assert.strictEqual(r.headers['Retry-After'], '7');
  });
  await t('vendor 5xx and network failure are 502, never a token', async () => {
    const r1 = await run(ev(base), mock(503, 'down'));
    assert.strictEqual(r1.statusCode, 502);
    const r2 = await relay(ev(base), { env: ENV, fetch: async () => { throw new Error('boom'); }, now: () => 1 });
    assert.strictEqual(r2.statusCode, 502);
  });
  await t('empty or changed vendor shape is not a success', async () => {
    const r = await run(ev(base), mock(200, 'not json'));
    assert.strictEqual(r.statusCode, 502);
  });
  await t('unconfigured vendor answers 503 without calling out', async () => {
    const f = mock(200, {});
    const r = await relay(ev(base), { env: {}, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 503);
    assert.strictEqual(f.calls.length, 0);
  });
  await t('rate limit per install id', async () => {
    const f = mock(200, { access_token: 't' });
    let last;
    for (let i = 0; i < 13; i++) last = await run(ev(base), f);
    assert.strictEqual(last.statusCode, 429);
    const other = await run(ev(Object.assign({}, base, { install_id: 'install-0002' })), f);
    assert.strictEqual(other.statusCode, 200);
  });
  await t('bad method, bad json, bad install id, bad grant', async () => {
    const f = mock(200, {});
    assert.strictEqual((await run({ httpMethod: 'GET', headers: {} }, f)).statusCode, 405);
    assert.strictEqual((await run({ httpMethod: 'POST', headers: {}, body: '{' }, f)).statusCode, 400);
    assert.strictEqual((await run(ev(Object.assign({}, base, { install_id: 'x' })), f)).statusCode, 400);
    assert.strictEqual((await run(ev(Object.assign({}, base, { grant: 'password' })), f)).statusCode, 400);
    assert.strictEqual(f.calls.length, 0);
  });
  await t('asana: form body with client id and secret goes to the vendor only; verifier forwarded; secret never returned', async () => {
    const f = mock(200, { access_token: 'a-tok', refresh_token: 'a-ref', expires_in: 3600 });
    const env = Object.assign({}, ENV, { ASANA_CLIENT_ID: 'acid', ASANA_CLIENT_SECRET: 'ASANA-SECRET-1' });
    const r = await relay(ev({ vendor: 'asana', grant: 'code', code: 'c1', code_verifier: 'ver-1234567890', redirect_uri: REDIRECT, install_id: 'install-0001' }), { env, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(JSON.parse(r.body).access_token, 'a-tok');
    assert.strictEqual(f.calls[0].url, 'https://app.asana.com/-/oauth_token');
    const sent = new URLSearchParams(f.calls[0].init.body);
    assert.strictEqual(sent.get('grant_type'), 'authorization_code'); assert.strictEqual(sent.get('client_id'), 'acid'); assert.strictEqual(sent.get('client_secret'), 'ASANA-SECRET-1'); assert.strictEqual(sent.get('code_verifier'), 'ver-1234567890');
    assert.strictEqual(f.calls[0].init.headers.Authorization, undefined);
    assert.ok(r.body.indexOf('ASANA-SECRET-1') < 0);
    const f2 = mock(200, { access_token: 'x', echo: 'ASANA-SECRET-1' });
    assert.strictEqual((await relay(ev({ vendor: 'asana', grant: 'refresh', refresh_token: 'rr', install_id: 'install-0001' }), { env, fetch: f2, now: () => 1 })).statusCode, 502);
  });
  await t('asana is not configured when only notion vars are set', async () => {
    const f = mock(200, {}); const r = await relay(ev(Object.assign({}, base, { vendor: 'asana' })), { env: ENV, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 503); assert.strictEqual(f.calls.length, 0);
  });
  await t('jira: JSON body with client id and secret goes to the Atlassian token url only; refresh forwards the rotating token; secret never returned', async () => {
    const f = mock(200, { access_token: 'j-tok', refresh_token: 'j-ref2', expires_in: 3600 });
    const env = Object.assign({}, ENV, { JIRA_CLIENT_ID: 'jcid', JIRA_CLIENT_SECRET: 'JIRA-SECRET-1' });
    const r = await relay(ev({ vendor: 'jira', grant: 'code', code: 'c1', redirect_uri: REDIRECT, install_id: 'install-0001' }), { env, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(f.calls[0].url, 'https://auth.atlassian.com/oauth/token');
    assert.deepStrictEqual(JSON.parse(f.calls[0].init.body), { grant_type: 'authorization_code', code: 'c1', redirect_uri: REDIRECT, client_id: 'jcid', client_secret: 'JIRA-SECRET-1' });
    assert.strictEqual(f.calls[0].init.headers['Content-Type'], 'application/json'); assert.ok(r.body.indexOf('JIRA-SECRET-1') < 0);
    const f2 = mock(200, { access_token: 'x', refresh_token: 'y' });
    const r2 = await relay(ev({ vendor: 'jira', grant: 'refresh', refresh_token: 'old-ref', install_id: 'install-0001' }), { env, fetch: f2, now: () => 1 });
    assert.strictEqual(r2.statusCode, 200); assert.deepStrictEqual(JSON.parse(f2.calls[0].init.body), { grant_type: 'refresh_token', refresh_token: 'old-ref', client_id: 'jcid', client_secret: 'JIRA-SECRET-1' });
  });
  await t('linear: form body with client id and secret goes to the Linear token url only; verifier forwarded; secret never returned or echoed', async () => {
    const f = mock(200, { access_token: 'l-tok', refresh_token: 'l-ref', expires_in: 86399 });
    const env = Object.assign({}, ENV, { LINEAR_CLIENT_ID: 'lcid', LINEAR_CLIENT_SECRET: 'LINEAR-SECRET-1' });
    const r = await relay(ev({ vendor: 'linear', grant: 'code', code: 'c1', code_verifier: 'ver-1234567890', redirect_uri: REDIRECT, install_id: 'install-0001' }), { env, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(f.calls[0].url, 'https://api.linear.app/oauth/token');
    const sent = new URLSearchParams(f.calls[0].init.body);
    assert.strictEqual(sent.get('client_id'), 'lcid'); assert.strictEqual(sent.get('client_secret'), 'LINEAR-SECRET-1'); assert.strictEqual(sent.get('code_verifier'), 'ver-1234567890'); assert.strictEqual(sent.get('grant_type'), 'authorization_code');
    assert.ok(r.body.indexOf('LINEAR-SECRET-1') < 0);
    const f2 = mock(200, { access_token: 'x', note: 'LINEAR-SECRET-1' });
    assert.strictEqual((await relay(ev({ vendor: 'linear', grant: 'refresh', refresh_token: 'rr', install_id: 'install-0001' }), { env, fetch: f2, now: () => 1 })).statusCode, 502);
  });
  await t('docusign: Basic auth + form body to the production token url; demo uses the demo url and its own secret; secret never returned', async () => {
    const env = Object.assign({}, ENV, { DOCUSIGN_CLIENT_ID: 'dcid', DOCUSIGN_CLIENT_SECRET: 'DS-PROD-SECRET', DOCUSIGN_DEMO_CLIENT_SECRET: 'DS-DEMO-SECRET' });
    const f = mock(200, { access_token: 'd-tok', refresh_token: 'd-ref', expires_in: 28800 });
    const r = await relay(ev({ vendor: 'docusign', grant: 'code', code: 'c1', redirect_uri: REDIRECT, install_id: 'install-0001' }), { env, fetch: f, now: () => 1 });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(f.calls[0].url, 'https://account.docusign.com/oauth/token');
    assert.strictEqual(f.calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('dcid:DS-PROD-SECRET').toString('base64')); assert.ok(f.calls[0].init.body.indexOf('DS-') < 0);
    assert.strictEqual(new URLSearchParams(f.calls[0].init.body).get('grant_type'), 'authorization_code'); assert.ok(r.body.indexOf('DS-PROD-SECRET') < 0);
    const f2 = mock(200, { access_token: 'x', refresh_token: 'y' });
    const r2 = await relay(ev({ vendor: 'docusign-demo', grant: 'refresh', refresh_token: 'rr', install_id: 'install-0001' }), { env, fetch: f2, now: () => 1 });
    assert.strictEqual(r2.statusCode, 200); assert.strictEqual(f2.calls[0].url, 'https://account-d.docusign.com/oauth/token');
    assert.strictEqual(f2.calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('dcid:DS-DEMO-SECRET').toString('base64'));
    const f3 = mock(200, { access_token: 'x', note: 'DS-DEMO-SECRET' });
    assert.strictEqual((await relay(ev({ vendor: 'docusign-demo', grant: 'refresh', refresh_token: 'rr', install_id: 'install-0001' }), { env, fetch: f3, now: () => 1 })).statusCode, 502);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
