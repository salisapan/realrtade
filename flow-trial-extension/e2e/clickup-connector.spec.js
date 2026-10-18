// Headless rehearsal of the ClickUp connector in the real extension (service worker, storage, message passing), against a mock of the
// ClickUp API and of the token relay. Two things differ from the shipped build, both in a throw-away copy only: the two ClickUp
// switches are on, and the ClickUp API host is granted (the owner's manifest change, docs/glance-ai/connectors/clickup.md §3).
// The Gmail chip cannot pick ClickUp yet (steps-list destination wiring, open-tasks row 70), so the worker is driven with the same
// messages the content script sends: flow:execute-action and flow:undo-action.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test: base, expect, chromium } = require('@playwright/test');

const EXT_ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', 'e2e', 'e2e-report', 'test-results', 'playwright-report', 'test']);
const LIST = '901200000001';
const LINK = 'https://app.clickup.com/9000001/v/li/' + LIST;

function copyPatchedExtension() {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-clickup-'));
  fs.cpSync(EXT_ROOT, dest, { recursive: true, filter: (src) => { const rel = path.relative(EXT_ROOT, src); return !rel || !SKIP.has(rel.split(path.sep)[0]); } });
  const cfg = path.join(dest, 'config', 'connectors.public.js');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace('clickupReadBack: false', 'clickupReadBack: true').replace('clickupOAuth: false', 'clickupOAuth: true'));
  const oauth = path.join(dest, 'config', 'oauth.public.js');
  fs.writeFileSync(oauth, fs.readFileSync(oauth, 'utf8').replace('REPLACE_WITH_CLICKUP_CLIENT_ID', 'e2e-public-client-id'));
  const mf = path.join(dest, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  manifest.host_permissions = manifest.host_permissions.concat(['https://api.clickup.com/*']);
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  return dest;
}

// Runs inside the service worker: a mock ClickUp API, a mock relay, a stub for the sign-in window.
function installMocks() {
  const e2e = { calls: [], tasks: {}, seq: 1, readBackFails: false, relayCalls: [] };
  globalThis.__cu = e2e;
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const u = new URL(url);
    const method = String((init && init.method) || 'GET').toUpperCase();
    if (u.hostname === 'theflow-ai.com') { e2e.relayCalls.push(JSON.parse(init.body)); return Promise.resolve(json(200, { access_token: 'e2e-clickup-token' })); }
    if (u.hostname !== 'api.clickup.com') return orig(input, init);
    const body = init && init.body ? JSON.parse(init.body) : null;
    const auth = init && init.headers && (init.headers.Authorization || init.headers.authorization);
    e2e.calls.push({ method, path: u.pathname.replace('/api/v2', '') + u.search, body, auth });
    const p = u.pathname.replace('/api/v2', '');
    if (auth !== 'Bearer e2e-clickup-token') return Promise.resolve(json(401, { err: 'Oauth token not found', ECODE: 'OAUTH_019' }));
    const mk = p.match(/^\/list\/(\d+)\/task$/);
    if (mk && method === 'POST') {
      const id = '86e2e' + (e2e.seq++);
      e2e.tasks[id] = { id, name: body.name, status: { type: 'open' }, date_closed: null, archived: false, due_date: body.due_date ? String(body.due_date) : null, url: 'https://app.clickup.com/t/' + id, list: { id: mk[1] } };
      return Promise.resolve(json(200, e2e.tasks[id]));
    }
    const one = p.match(/^\/task\/([A-Za-z0-9]+)$/);
    if (one && method === 'GET') {
      if (e2e.readBackFails) return Promise.resolve(json(500, {}));
      return Promise.resolve(e2e.tasks[one[1]] ? json(200, e2e.tasks[one[1]]) : json(404, { err: 'Task not found', ECODE: 'ITEM_015' }));
    }
    if (one && method === 'DELETE') { delete e2e.tasks[one[1]]; return Promise.resolve(json(204, undefined)); }
    if (method === 'GET' && p === '/list/' + '901200000001') return Promise.resolve(json(200, { id: '901200000001', name: 'Ops' }));
    if (method === 'GET' && /^\/list\/\d+\/task$/.test(p)) return Promise.resolve(json(200, { tasks: Object.values(e2e.tasks), last_page: true }));
    return Promise.resolve(json(404, { err: 'e2e-unmocked ' + method + ' ' + p }));
  };
  const identity = chrome.identity;
  const stub = (details) => {
    const state = new URL(details.url).searchParams.get('state');
    e2e.authUrl = details.url;
    return Promise.resolve('https://' + chrome.runtime.id + '.chromiumapp.org/?code=e2e-code&state=' + state);
  };
  try { identity.launchWebAuthFlow = stub; } catch (e) { Object.defineProperty(identity, 'launchWebAuthFlow', { configurable: true, writable: true, value: stub }); }
  try { identity.getRedirectURL = () => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/'; } catch (e) { /* native */ }
  return true;
}

const test = base.extend({
  cu: [async ({}, use) => {
    const extDir = copyPatchedExtension();
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-clickup-profile-'));
    const context = await chromium.launchPersistentContext(userData, {
      headless: false, viewport: { width: 1280, height: 800 }, ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--headless=new', '--disable-extensions-except=' + extDir, '--load-extension=' + extDir, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage']
    });
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 30000 });
    const live = async () => { const ws = context.serviceWorkers(); if (!ws.length) worker = await context.waitForEvent('serviceworker', { timeout: 15000 }); else if (!ws.includes(worker)) worker = ws[0]; return worker; };
    for (let i = 0; i < 40; i++) {
      const ready = await (await live()).evaluate(() => Boolean(globalThis.chrome && chrome.runtime && chrome.runtime.id && chrome.identity)).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await (await live()).evaluate(installMocks);
    const id = worker.url().split('/')[2];
    const h = {
      id,
      ev: async (fn, arg) => (await live()).evaluate(fn, arg),
      async send(msg) {
        const page = await context.newPage();
        await page.goto('chrome-extension://' + id + '/popup/popup.html', { waitUntil: 'commit' });
        const out = await page.evaluate((m) => new Promise((resolve) => chrome.runtime.sendMessage(m, (r) => resolve(r))), msg);
        await page.close();
        return out;
      },
      state: () => h.ev(() => new Promise((r) => chrome.storage.local.get(null, r))),
      seed: (bag) => h.ev(async (b) => { await chrome.storage.local.set(b); }, bag),
      reset: () => h.ev(async () => { await chrome.storage.local.clear(); globalThis.__cu.calls = []; globalThis.__cu.tasks = {}; globalThis.__cu.relayCalls = []; globalThis.__cu.readBackFails = false; }),
      calls: () => h.ev(() => globalThis.__cu.calls),
      tasks: () => h.ev(() => globalThis.__cu.tasks)
    };
    await use(h);
    await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true }); fs.rmSync(userData, { recursive: true, force: true });
  }, { scope: 'worker' }],
  clean: [async ({ cu }, use) => { await cu.reset(); await use(); }, { scope: 'test', auto: true }]
});

const PAYLOAD = (title, extra) => Object.assign({ connectorId: 'clickup', label: title, facts: {}, messageId: 'm-e2e-1', threadUrl: 'https://mail.google.com/mail/u/0/#inbox/t-e2e-1' }, extra || {});
const CONNECTED = { clickupAuth: { token: 'e2e-clickup-token', refreshToken: null, listId: LIST, listName: 'Ops' } };

test('scenario 1: Do It adds one task, reads it back (Handled with proof), a second click adds nothing, Undo removes it and reads that back', async ({ cu }) => {
  await cu.seed(CONNECTED);
  const done = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Send Dana the signed contract') });
  expect(done.ok).toBe(true);
  expect(done.proof.system).toBe('clickup/task');
  expect(done.proof.fetchedBack).toBe(true);
  expect(done.proof.url).toMatch(/^https:\/\/app\.clickup\.com\/t\//);
  const calls = await cu.calls();
  expect(calls.map((c) => c.method + ' ' + c.path.replace(/86e2e\d+/, 'ID'))).toEqual(['POST /list/' + LIST + '/task', 'GET /task/ID']);
  expect(calls.every((c) => c.auth === 'Bearer e2e-clickup-token')).toBe(true);

  const again = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Send Dana the signed contract') });
  expect(again.ok).toBe(true);
  expect(Object.keys(await cu.tasks())).toHaveLength(1);
  expect((await cu.calls()).filter((c) => c.method === 'POST')).toHaveLength(1);

  const undone = await cu.send({ type: 'flow:undo-action', connectorId: 'clickup', ref: done.ref });
  expect(undone.ok).toBe(true);
  expect(undone.readBack).toBe(true);
  expect(Object.keys(await cu.tasks())).toHaveLength(0);

  const st = await cu.state();
  const stages = (st.connectorOutcomes || []).map((e) => e.stage);
  expect(stages).toEqual(expect.arrayContaining(['approved', 'handled', 'undone']));
  expect(JSON.stringify(st.connectorOutcomes)).not.toMatch(/Dana|contract|mail\.google|e2e-clickup-token/);
  expect(JSON.stringify(st.clickupLedger)).not.toContain('e2e-clickup-token');
});

test('scenario 2: a read-back that fails is never Handled; Disconnect removes the token and the next Do It sends nothing', async ({ cu }) => {
  await cu.seed(CONNECTED);
  await cu.ev(() => { globalThis.__cu.readBackFails = true; });
  const bad = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Pay the invoice by Friday') });
  expect(bad.ok).toBe(false);
  expect(bad.reason).toBe('verify_failed');
  expect(bad.proof).toBeNull();
  let st = await cu.state();
  expect((st.connectorOutcomes || []).some((e) => e.stage === 'handled')).toBe(false);
  expect((st.connectorOutcomes || []).some((e) => e.stage === 'readback_failed')).toBe(true);

  await cu.ev(() => { globalThis.__cu.readBackFails = false; });
  const retry = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Pay the invoice by Friday') });
  expect(retry.ok).toBe(true);
  expect(Object.keys(await cu.tasks())).toHaveLength(1);

  const off = await cu.send({ type: 'flow:disconnect', connectorId: 'clickup' });
  expect(off.ok).toBe(true);
  st = await cu.state();
  expect(st.clickupAuth).toBeUndefined();
  expect(st.clickupLedger).toBeUndefined();
  const before = (await cu.calls()).length;
  const after = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Pay the invoice by Friday') });
  expect(after.ok).toBe(false);
  expect(after.reason).toBe('not-connected');
  expect((await cu.calls()).length).toBe(before);
});

test('scenario 3: Sign in with ClickUp checks state, sends only the one-time code through the relay, keeps the token on the device, then Do It works', async ({ cu }) => {
  const connected = await cu.send({ type: 'flow:connect', connectorId: 'clickup', list: LINK });
  expect(connected.ok).toBe(true);
  expect(connected.detail).toBe('Ops');
  const relay = await cu.ev(() => globalThis.__cu.relayCalls);
  expect(relay).toHaveLength(1);
  expect(Object.keys(relay[0]).sort()).toEqual(['code', 'grant', 'install_id', 'redirect_uri', 'vendor']);
  expect(relay[0].vendor).toBe('clickup');
  const authUrl = await cu.ev(() => globalThis.__cu.authUrl);
  expect(authUrl.indexOf('https://app.clickup.com/api?')).toBe(0);
  expect(authUrl).toContain('client_id=e2e-public-client-id');
  expect(authUrl).not.toMatch(/secret|code_challenge/i);
  const st = await cu.state();
  expect(st.clickupAuth.token).toBe('e2e-clickup-token');
  expect(st.clickupAuth.listId).toBe(LIST);
  const status = await cu.send({ type: 'flow:connector-status' });
  expect(status.clickup.connected).toBe(true);

  const done = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD('Book the Haifa meeting') });
  expect(done.ok).toBe(true);
  expect(done.proof.fetchedBack).toBe(true);
});

test('scenario 4: a hostile title is one string in one task; nothing else is written or read', async ({ cu }) => {
  await cu.seed(CONNECTED);
  const evil = 'x","list":"999","status":"complete"} ../../team <script>alert(1)</script>';
  const out = await cu.send({ type: 'flow:execute-action', payload: PAYLOAD(evil) });
  expect(out.ok).toBe(true);
  const calls = await cu.calls();
  expect(calls.every((c) => /^\/(task\/[A-Za-z0-9]+|list\/\d+\/task)$/.test(c.path))).toBe(true);
  expect(calls[0].path).toBe('/list/' + LIST + '/task');
  const tasks = Object.values(await cu.tasks());
  expect(tasks).toHaveLength(1);
  expect(tasks[0].list.id).toBe(LIST);
  expect(tasks[0].status.type).toBe('open');
});
