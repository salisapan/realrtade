// C1 connect per ecosystem: one step per provider, catalog, PKCE interface, no Mail.Send.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { FlowConnectEcosystem: E } = require('../core/connect-ecosystem.js');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');
const { FlowOutlookConfig: C } = require('../core/outlook-config.js');
const { FlowProfileHook: PH } = require('../core/profile-hook.js');
const { FlowDisplay: D } = require('../core/display-copy.js');

let n = 0;
let failures = 0;
async function ok(name, fn) {
  try {
    await fn();
    n++;
    console.log('ok  ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, e && e.message ? e.message : e);
  }
}

// CTO 23/10: C1 base one-consent set for M1–M8 (Group.Read.All is optional, not here).
const MS_EXPECTED = E.microsoftScopes();

(async () => {
await ok('stepsFor google is exactly one incremental step', () => {
  const r = E.stepsFor('google');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'google-ecosystem');
  assert.strictEqual(r.steps[0].includeGrantedScopes, true);
});

await ok('stepsFor microsoft is exactly one Graph step with 12 ecosystem scopes', () => {
  const r = E.stepsFor('microsoft');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'microsoft-ecosystem');
  assert.deepStrictEqual(r.steps[0].scopes, MS_EXPECTED);
  assert.strictEqual(r.steps[0].scopes.length, 12);
});

await ok('microsoft base consent never includes Group.*; planner optional is Group.Read.All only', () => {
  assert.ok(!MS_EXPECTED.some((s) => /^Group\./i.test(s)));
  assert.deepStrictEqual(E.microsoftOptionalScopes.planner, ['Group.Read.All']);
  assert.ok(MS_EXPECTED.indexOf('Tasks.ReadWrite') >= 0);
});

await ok('plannerAccess personal Microsoft account: no card, silent To Do, never request Group.Read.All', () => {
  const account = { address: 'you@outlook.com', mail: 'you@outlook.com', userPrincipalName: 'you@outlook.com' };
  const access = E.plannerAccess(account, MS_EXPECTED);
  assert.strictEqual(access, 'personal');
  assert.strictEqual(E.plannerShowsPlannerCard(access), false);
  assert.strictEqual(E.plannerShouldRequestGroupConsent(access), false);
  const route = E.plannerExecutionRoute(access, null);
  assert.strictEqual(route.destination, 'todo');
  assert.strictEqual(route.requestGroupConsent, false);
  assert.strictEqual(route.explainTodoFallback, false);
});

await ok('plannerAccess work account without Group.Read.All: needs-consent with EN+HE why copy', () => {
  const account = { address: 'you@contoso.com', mail: 'you@contoso.com', userPrincipalName: 'you@contoso.com' };
  const access = E.plannerAccess(account, MS_EXPECTED);
  assert.strictEqual(access, 'needs-consent');
  assert.strictEqual(E.plannerShowsPlannerCard(access), true);
  assert.strictEqual(E.plannerShouldRequestGroupConsent(access), true);
  const route = E.plannerExecutionRoute(access, null);
  assert.strictEqual(route.requestGroupConsent, true);
  const en = D.chrome('en').plannerGroupConsentWhy;
  const he = D.chrome('he').plannerGroupConsentWhy;
  assert.ok(en && en.length > 20);
  assert.ok(he && he.length > 20);
  assert.ok(/Planner/i.test(en));
  assert.ok(/Planner/.test(he));
});

await ok('plannerConsentOutcome admin or denied falls back to To Do with explanation, not a dead end', () => {
  const account = { address: 'you@contoso.com', userPrincipalName: 'you@contoso.com' };
  const access = E.plannerAccess(account, MS_EXPECTED);
  const admin = E.plannerConsentOutcome({ ok: false, aadsts: 'AADSTS65001', error: 'invalid_grant' });
  const denied = E.plannerConsentOutcome({ ok: false, error: 'access_denied', reason: 'permission-denied' });
  assert.strictEqual(admin, 'admin-required');
  assert.strictEqual(denied, 'denied');
  const routeAdmin = E.plannerExecutionRoute(access, admin);
  const routeDenied = E.plannerExecutionRoute(access, denied);
  assert.strictEqual(routeAdmin.destination, 'todo');
  assert.strictEqual(routeDenied.destination, 'todo');
  assert.strictEqual(routeAdmin.explainTodoFallback, true);
  assert.strictEqual(routeDenied.explainTodoFallback, true);
  assert.ok(D.chrome('en').plannerTodoFallbackAdmin);
  assert.ok(D.chrome('he').plannerTodoFallbackAdmin);
  assert.ok(D.chrome('en').plannerTodoFallbackDenied);
  assert.ok(D.chrome('he').plannerTodoFallbackDenied);
});

await ok('stepsFor meta is exactly one host permission step with 15 origins', () => {
  const r = E.stepsFor('meta');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'meta-host-permissions');
  assert.strictEqual(r.steps[0].origins.length, 15);
  assert.ok(r.steps[0].origins.some((o) => /web\.whatsapp\.com/.test(o)));
  assert.ok(r.steps[0].origins.some((o) => /business\.facebook\.com\/latest\/inbox/.test(o)));
  assert.ok(r.steps[0].origins.some((o) => /instagram\.com\/direct/.test(o)));
});

await ok('catalog lists Planner, OneNote, Word, Excel, PowerPoint', () => {
  const ids = E.catalog().map((row) => row.id);
  assert.deepStrictEqual(ids, ['ms-planner', 'ms-onenote', 'ms-word', 'ms-excel', 'ms-powerpoint']);
});

await ok('connectScreenTools matches design connect-3 tool lines', () => {
  assert.deepStrictEqual(E.connectScreenTools('microsoft', 'en'),
    ['Outlook', 'Calendar', 'To Do', 'OneDrive', 'Word', 'Excel', 'PowerPoint', 'Teams', 'OneNote', 'Planner']);
  assert.deepStrictEqual(E.connectScreenTools('meta', 'he'), ['WhatsApp', 'Messenger', 'Instagram']);
});

await ok('no Mail.Send in microsoft ecosystem scopes or steps JSON', () => {
  assert.ok(!/Mail\.Send/i.test(JSON.stringify(E.stepsFor('microsoft'))));
  assert.ok(!/Mail\.Send/i.test(JSON.stringify(E.MICROSOFT_SCOPES)));
});

await ok('PKCE refresh interface documents refresh_token grant fields', () => {
  const iface = E.PKCE_REFRESH_INTERFACE;
  assert.strictEqual(iface.grantTypes.refresh, 'refresh_token');
  assert.ok(iface.grants.refresh_token.indexOf('refresh_token') >= 0);
  const body = A.refreshBody({ clientId: 'cid', refreshToken: 'rt', scopes: ['User.Read'] });
  assert.ok(body.indexOf('grant_type=refresh_token') >= 0);
  assert.ok(body.indexOf('refresh_token=rt') >= 0);
});

await ok('disconnect targets cover all three ecosystems', () => {
  assert.deepStrictEqual(E.disconnectTargets('google'), ['googleTasks']);
  assert.deepStrictEqual(E.disconnectTargets('microsoft'), ['microsoft']);
  assert.deepStrictEqual(E.disconnectTargets('meta'), ['meta']);
});

function stripModuleExports(source) {
  return source
    .replace(/^import\s+[^;]+;\s*/gm, '')
    .replace(/^export\s+async\s+function\s+/gm, 'async function ')
    .replace(/^export\s+\{[^}]+\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

function loadDisconnectHandlers() {
  const stored = {};
  const removed = [];
  const chrome = {
    storage: {
      local: {
        async remove(keys) {
          (keys || []).forEach((k) => { delete stored[k]; });
        },
        async get() { return stored; },
        async set(bag) { Object.assign(stored, bag); }
      }
    },
    permissions: {
      remove(spec, cb) {
        removed.push(spec);
        if (typeof cb === 'function') cb(true);
        return Promise.resolve(true);
      }
    },
    runtime: { sendMessage: async () => ({}) }
  };
  const sandbox = {
    console,
    chrome,
    globalThis: { chrome, FlowConnectEcosystem: E, FlowMetaConsent: { ORIGINS: E.META_ORIGINS.slice(), disconnect(c) { return c.permissions.remove({ origins: E.META_ORIGINS.slice() }, () => {}); } } },
    fetch: async () => ({ ok: false })
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/connect-ecosystem.js'), 'utf8'), sandbox);
  const swSrc = stripModuleExports(fs.readFileSync(path.join(__dirname, '../src/connect-ecosystem-sw.js'), 'utf8'));
  vm.runInContext(swSrc + '\nthis.__sw = { disconnectEcosystemConnector };', sandbox, { filename: 'connect-ecosystem-sw.js' });
  return { sandbox, stored, removed };
}

await ok('disconnectEcosystem clears microsoft storage and host permissions', async () => {
  const { sandbox, stored, removed } = loadDisconnectHandlers();
  stored.outlookAuth = { token: { accessToken: 'x' } };
  stored.outlookSync = { needsSignIn: false };
  const out = await sandbox.__sw.disconnectEcosystemConnector('microsoft', {});
  assert.strictEqual(out.ok, true);
  assert.strictEqual(stored.outlookAuth, undefined);
  assert.strictEqual(stored.outlookSync, undefined);
  assert.ok(removed.some((r) => r.origins && r.origins.some((o) => /graph\.microsoft\.com/.test(o))));
});

await ok('disconnectEcosystem clears meta permissions', async () => {
  const { sandbox, removed } = loadDisconnectHandlers();
  const out = await sandbox.__sw.disconnectEcosystemConnector('meta', {});
  assert.strictEqual(out.ok, true);
  assert.ok(removed.some((r) => r.origins && r.origins.length === 15));
});

await ok('disconnectConnector routes microsoft before storage key map', () => {
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  const fn = bg.slice(bg.indexOf('async function disconnectConnector'));
  const head = fn.slice(0, fn.indexOf('if (connectorId === \'googleTasks\')'));
  assert.ok(/connectorId === 'microsoft'/.test(head));
  assert.ok(/disconnectEcosystemConnector/.test(head));
  assert.ok(head.indexOf('STORAGE_KEYS') < 0 || head.indexOf('disconnectEcosystemConnector') < head.indexOf('STORAGE_KEYS'));
});

await ok('flow:connect ecosystem path is behind CONNECT_ECOSYSTEM switch', () => {
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  assert.ok(/glanceSwitchOn\('CONNECT_ECOSYSTEM'\)/.test(bg));
  assert.ok(/connectEcosystemConnector/.test(bg));
  const block = bg.slice(bg.indexOf("if (msg.type === 'flow:connect')"), bg.indexOf("if (msg.type === 'flow:disconnect')"));
  assert.ok(/glanceSwitchOn\('CONNECT_ECOSYSTEM'\)/.test(block));
});

await ok('meta-consent fallback ORIGINS match FlowConnectEcosystem.META_ORIGINS', () => {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lane-chat/meta-consent.js'), 'utf8'), sandbox);
  const fallback = sandbox.globalThis.FlowMetaConsent.ORIGINS;
  assert.strictEqual(JSON.stringify(fallback), JSON.stringify(E.META_ORIGINS));
  assert.strictEqual(fallback.length, 15);
});

await ok('profileHook onConnect/onDisconnect are callable no-ops', () => {
  assert.strictEqual(typeof PH.onConnect, 'function');
  assert.strictEqual(typeof PH.onDisconnect, 'function');
  PH.onConnect('microsoft', { address: 'a@b.com' });
  PH.onDisconnect('meta');
});

function outlookConnectWorld(over) {
  globalThis.FlowConnectEcosystem = E;
  const CFG = Object.assign({}, C, { CLIENT_ID: '11111111-2222-3333-4444-555555555555' });
  const ME = 'me@contoso.com';
  const w = Object.assign({ store: {}, signInScopes: [], signInCalls: 0 }, over || {});
  w.storage = {
    get: async () => Object.assign({}, w.store),
    set: async (patch) => { Object.assign(w.store, patch); },
    getWatches: async () => [],
    getIdentityGraph: async () => ({ parties: {} }),
    observeIdentity: async () => ({ pid: 'p1' }),
    updateWatch: async () => null,
    upsertWatch: async (x) => x,
    recordOutcomeLabel: async () => true
  };
  w.fetch = async (url) => {
    if (String(url).includes('/me?')) return { ok: true, status: 200, json: async () => ({ mail: ME, displayName: 'Me', userPrincipalName: ME }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { FlowOutlook: O } = require('../src/outlook.js');
  const authWrap = {
    signIn: async (deps, cfg, redirect, opts) => {
      w.signInCalls += 1;
      w.signInScopes = (opts && opts.scopes) ? opts.scopes.slice() : [];
      return A.signIn(deps, cfg, redirect, opts);
    },
    session: A.session,
    ensureFresh: A.ensureFresh
  };
  const inst = O.create({
    storage: w.storage,
    cfg: CFG,
    auth: authWrap,
    plan: require('../core/outlook-sync.js').FlowOutlookSync.plan,
    fetch: w.fetch,
    redirectUri: () => 'https://abc.chromiumapp.org/',
    launch: async (url) => 'https://abc.chromiumapp.org/?code=CODE&state=' + new URL(url).searchParams.get('state'),
    launchSilent: async () => '',
    actions: null,
    permissions: { request: async () => true, contains: async () => true, remove: async () => true },
    send: async () => ({ ok: true }),
    random: (n) => crypto.randomBytes(n),
    sha256: async (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest(),
    now: () => Date.now(),
    planDeps: {},
    identity: { empty: () => ({ parties: {} }) },
    followUp: {}
  });
  return { w, inst };
}

function sortScopes(list) {
  return list.slice().sort();
}

await ok('ecosystem FlowOutlook.connect intersects scopes on reconnect #1', async () => {
  const { w, inst } = outlookConnectWorld({
    store: { outlookAuth: { ecosystem: true, requestedScopes: MS_EXPECTED, token: { accessToken: 'old' }, account: { address: 'me@contoso.com' } } }
  });
  const junk = MS_EXPECTED.concat(['Mail.Read', 'Mail.Send', 'https://graph.microsoft.com/Mail.Send']);
  await inst.connect({ scopes: junk });
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(MS_EXPECTED));
  assert.ok(!w.signInScopes.some((s) => /Mail\.Send/i.test(s) || s === 'Mail.Read'));
});

await ok('ecosystem FlowOutlook.connect intersects scopes on reconnect #2', async () => {
  const { w, inst } = outlookConnectWorld({
    store: {
      outlookAuth: {
        ecosystem: true,
        requestedScopes: MS_EXPECTED,
        token: { accessToken: 'old' },
        account: { address: 'me@contoso.com' }
      }
    }
  });
  await inst.connect({ scopes: MS_EXPECTED.concat(['Mail.Read', 'https://graph.microsoft.com/Mail.Send']) });
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(MS_EXPECTED));
});

await ok('ecosystem checkbox scopesFor path ends subset of base ecosystem scopes', async () => {
  const ids = (C.CONNECT_SERVICES || []).map((s) => s.id);
  const scopes = C.scopesFor(ids);
  const { w, inst } = outlookConnectWorld({
    store: { outlookAuth: { ecosystem: true, requestedScopes: MS_EXPECTED, token: { accessToken: 'old' }, account: { address: 'me@contoso.com' } } }
  });
  await inst.connect({ scopes: scopes });
  const allowed = new Set(MS_EXPECTED);
  const expectedIntersect = scopes.filter((s) => allowed.has(s));
  assert.ok(w.signInScopes.every((s) => allowed.has(s)));
  assert.ok(!w.signInScopes.some((s) => /^Group\./i.test(s)));
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(expectedIntersect));
});

await ok('legacy non-ecosystem FlowOutlook.connect keeps Mail.Read from cfg.SCOPES', async () => {
  const { w, inst } = outlookConnectWorld({
    store: {
      outlookAuth: {
        ecosystem: false,
        requestedScopes: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite'],
        token: { accessToken: 'old' },
        account: { address: 'me@contoso.com' }
      }
    }
  });
  await inst.connect({ scopes: ['offline_access', 'User.Read'] });
  assert.ok(w.signInScopes.indexOf('Mail.Read') >= 0);
  assert.ok(w.signInScopes.indexOf('Mail.ReadWrite') >= 0);
});

await ok('disconnectEcosystem microsoft calls disableSurface(outlook) and clears surfaces', async () => {
  const disableCalls = [];
  const { sandbox, stored } = loadDisconnectHandlers();
  stored.outlookAuth = { token: { accessToken: 'x' }, ecosystem: true };
  stored.surfaces = { outlook: { enabled: true, at: 1 } };
  const out = await sandbox.__sw.disconnectEcosystemConnector('microsoft', {
    disableSurface: async (id) => {
      disableCalls.push(id);
      stored.surfaces = { outlook: { enabled: false, at: Date.now() } };
      return { ok: true };
    }
  });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(disableCalls, ['outlook']);
  assert.strictEqual(stored.outlookAuth, undefined);
  assert.strictEqual(stored.surfaces.outlook.enabled, false);
});

async function routeFlowDisconnect(msg, sw, deps) {
  if (msg.type !== 'flow:disconnect') return { ok: false, reason: 'not-disconnect' };
  const id = msg.connectorId;
  if (id === 'microsoft' || id === 'meta') {
    return sw.disconnectEcosystemConnector(id, deps);
  }
  return { ok: false, reason: 'other-connector' };
}

await ok('flow:disconnect routes microsoft to ecosystem disconnect', async () => {
  const disableCalls = [];
  const { sandbox, stored } = loadDisconnectHandlers();
  stored.outlookAuth = { token: { accessToken: 'x' } };
  const out = await routeFlowDisconnect({ type: 'flow:disconnect', connectorId: 'microsoft' }, sandbox.__sw, {
    disableSurface: async (id) => { disableCalls.push(id); return { ok: true }; },
    disconnectConnector: async () => ({ ok: false })
  });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(disableCalls, ['outlook']);
  assert.strictEqual(stored.outlookAuth, undefined);
});

await ok('flow:disconnect routes meta to ecosystem permission clear', async () => {
  const { sandbox, removed } = loadDisconnectHandlers();
  const out = await routeFlowDisconnect({ type: 'flow:disconnect', connectorId: 'meta' }, sandbox.__sw, {});
  assert.strictEqual(out.ok, true);
  assert.ok(removed.some((r) => r.origins && r.origins.length === 15));
});

console.log('\n' + n + ' passed, ' + failures + ' failed');
if (failures) process.exit(1);
})();
