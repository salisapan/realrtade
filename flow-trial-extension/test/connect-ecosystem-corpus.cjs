// C1 connect per ecosystem: one step per provider, catalog, PKCE interface, no Mail.Send.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { FlowConnectEcosystem: E } = require('../core/connect-ecosystem.js');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');
const { FlowOutlookCalendar: Cal } = require('../core/outlook-calendar.js');
const { FlowOutlookConfig: C } = require('../core/outlook-config.js');
globalThis.FlowOutlookAuth = A;
globalThis.FlowOutlookCalendar = Cal;
const { FlowProfileHook: PH } = require('../core/profile-hook.js');
const { FlowDisplay: D } = require('../core/display-copy.js');
const { execFileSync } = require('child_process');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }

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

const GRAPH_HOST_ORIGINS = [
  'https://graph.microsoft.com/*',
  'https://login.microsoftonline.com/*',
  'https://outlook.live.com/*',
  'https://outlook.office.com/*',
  'https://outlook.office365.com/*'
];

function makeChromePermissions(over) {
  const deniedOrigins = new Set((over && over.deniedOrigins) || []);
  const allowedOrigins = (over && over.allowedOrigins) || GRAPH_HOST_ORIGINS.slice();
  const allowedSet = new Set(allowedOrigins);
  const originOk = (o) => !deniedOrigins.has(o) && (allowedSet.has(o) || allowedSet.has('*'));
  return {
    request: async (spec) => {
      const origins = (spec && spec.origins) || [];
      if (!origins.length) return true;
      return origins.every(originOk);
    },
    contains: async (spec) => {
      const origins = (spec && spec.origins) || [];
      if (!origins.length) return false;
      return origins.every(originOk);
    },
    remove: async () => true
  };
}

function connect3Paint(opts) {
  if (!JSDOM) throw new Error('jsdom is required for connect-3 behavioral rows');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'chrome-extension://glance/popup.html',
    runScripts: 'outside-only'
  });
  const win = dom.window;
  const ctx = {
    document: win.document,
    window: win,
    matchMedia: (q) => (win.matchMedia ? win.matchMedia(q) : { matches: false, media: q, addListener() {}, removeListener() {} }),
    chrome: { storage: { local: { get: async () => ({ glanceSwitches: {} }) } } },
    FlowConnectEcosystem: E,
    Connect3Brands: { check: '✓' },
    console,
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: win.clearTimeout.bind(win)
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../popup/connect-3.js'), 'utf8') + '\nthis.__Connect3 = ConnectEcosystemUI;',
    ctx
  );
  const host = win.document.createElement('div');
  win.document.body.appendChild(host);
  ctx.__Connect3.paint(host, opts || {});
  return { host, win, UI: ctx.__Connect3 };
}

async function flushDom(win) {
  await new Promise((r) => win.setTimeout(r, 0));
  await new Promise((r) => win.setTimeout(r, 0));
}

function loadBackgroundOutlookSync(over) {
  const stored = {
    outlookAuth: {
      token: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3600000,
        grantedScopes: ['User.Read', 'Mail.ReadWrite']
      },
      account: { address: 'me@example.com' },
      profile: { displayName: 'Profile Name', mail: 'me@example.com', userPrincipalName: 'me@example.com' },
      requestedScopes: E.microsoftConsentScopes()
    }
  };
  const syncCalls = [];
  const owaTabs = (over && over.owaTabs) || [];
  const profileDisplay = 'Profile Name';
  const chrome = {
    storage: {
      local: {
        async get(k) {
          if (k == null) return Object.assign({}, stored);
          if (typeof k === 'string') return { [k]: stored[k] };
          if (Array.isArray(k)) {
            const bag = {};
            k.forEach((key) => { bag[key] = stored[key]; });
            return bag;
          }
          return Object.assign({}, stored);
        },
        async set(patch) { Object.assign(stored, patch); },
        async remove(keys) { (keys || []).forEach((key) => { delete stored[key]; }); }
      }
    },
    permissions: makeChromePermissions(over && over.permissions),
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
    tabs: {
      query: async () => owaTabs,
      sendMessage: async () => {}
    },
    runtime: {
      id: 'ext',
      sendMessage: async () => ({}),
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      onConnect: { addListener() {} },
      getManifest: () => ({ version: '0.9.56' })
    },
    alarms: { create: () => {}, onAlarm: { addListener() {} }, get: (n, cb) => cb(null) },
    contextMenus: { removeAll(cb) { if (cb) cb(); }, create(o, cb) { if (cb) cb(); }, onClicked: { addListener() {} } },
    windows: { create: () => {}, onRemoved: { addListener() {} } },
    notifications: { create: () => {}, onClicked: { addListener() {} }, onClosed: { addListener() {} } }
  };
  const sandbox = {
    console,
    chrome,
    crypto: require('crypto').webcrypto,
    fetch: async () => ({ ok: false }),
    FlowConnectEcosystem: E,
    FlowProfileHook: PH,
    __syncCalls: syncCalls,
    __profileDisplay: profileDisplay,
    FlowExtract: {},
    FlowIntent: {},
    FlowFactReply: {},
    FlowActions: {},
    FlowIdentity: { empty: () => ({ parties: {} }) },
    FlowFollowUp: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lane-chat/meta-consent.js'), 'utf8'), sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  if (over && over.noFlowOutlook) {
    vm.runInContext('outlookEcosystemRunner = null; globalThis.FlowOutlook = null;', sandbox);
  } else {
    vm.runInContext(`
      outlookEcosystemRunner = null;
      globalThis.FlowOutlook = {
        create: function () {
          return {
            sync: async function (opts) {
              __syncCalls.push(opts);
              await chrome.storage.local.set({ glanceOwnNames: [__profileDisplay] });
              return { ok: true };
            }
          };
        }
      };
    `, sandbox);
  }
  return { sandbox, stored, syncCalls };
}

function loadModuleAtRev(rev, relPath, exportName) {
  const repoRoot = path.join(__dirname, '..', '..');
  const src = execFileSync('git', ['show', `${rev}:${relPath}`], { cwd: repoRoot, encoding: 'utf8' });
  const sandbox = { module: { exports: {} }, exports: {}, console, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: relPath });
  const Eold = sandbox.module.exports.FlowConnectEcosystem || sandbox.FlowConnectEcosystem;
  if (exportName === 'FlowConnectEcosystem' && Eold) {
    if (typeof Eold.microsoftConsentScopes !== 'function' && typeof Eold.microsoftScopes === 'function') {
      Eold.microsoftConsentScopes = Eold.microsoftScopes.bind(Eold);
    }
    return Eold;
  }
  return sandbox[exportName] || sandbox.module.exports;
}

function runF488BiteRows() {
  const rev = 'f488c95ff26b74fa68cf5fe67b7cbf995d90d885';
  const repoRoot = path.join(__dirname, '..', '..');
  let Eold;
  try {
    Eold = loadModuleAtRev(rev, 'flow-trial-extension/core/connect-ecosystem.js', 'FlowConnectEcosystem');
  } catch (e) {
    console.log('BITE f488c95: could not load core', e.message);
    return;
  }
  if (!Eold) {
    console.log('BITE f488c95: FlowConnectEcosystem missing at f488c95');
    return;
  }
  if (typeof Eold.microsoftConsentScopes !== 'function' && typeof Eold.microsoftScopes === 'function') {
    Eold.microsoftConsentScopes = Eold.microsoftScopes.bind(Eold);
  }
  const MSold = Eold.microsoftConsentScopes();
  const bites = [
    {
      name: 'openid in microsoft consent scopes',
      run() {
        assert.ok(MSold.indexOf('openid') >= 0);
      }
    },
    {
      name: 'Chat.Read not in base consent',
      run() {
        assert.ok(MSold.indexOf('Chat.Read') < 0);
      }
    },
    {
      name: 'MSA gmail UPN without idToken is personal',
      run() {
        const profile = { mail: 'salisapan1@gmail.com', userPrincipalName: 'salisapan1@gmail.com' };
        assert.strictEqual(Eold.resolveMicrosoftAccountKind(null, profile), 'personal');
      }
    },
    {
      name: 'GUID /me id without tid is unknown',
      run() {
        const profile = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', userPrincipalName: 'u@c.com' };
        assert.strictEqual(Eold.resolveMicrosoftAccountKind(null, profile), 'unknown');
      }
    },
    {
      name: 'optional teamsChat bucket on f488',
      run() {
        assert.ok(Eold.microsoftOptionalScopes && Eold.microsoftOptionalScopes.teamsChat);
        assert.ok(Eold.microsoftOptionalScopes.teamsMeeting === undefined);
      }
    },
    {
      name: 'background outlookEcosystemSync graph path',
      run() {
        const bg = execFileSync('git', ['show', `${rev}:flow-trial-extension/src/background.js`], { cwd: repoRoot, encoding: 'utf8' });
        assert.ok(/async function outlookEcosystemSync/.test(bg));
        assert.ok(/outlookEcosystemRunner\.sync/.test(bg));
      }
    },
    {
      name: 'connect-3 reconnectNeeded copy key',
      run() {
        const ui = execFileSync('git', ['show', `${rev}:flow-trial-extension/popup/connect-3.js`], { cwd: repoRoot, encoding: 'utf8' });
        assert.ok(/reconnectNeeded/.test(ui));
      }
    }
  ];
  console.log('\n--- bite rows on f488c95 (expect FAIL) ---');
  bites.forEach((b) => {
    try {
      b.run();
      console.log('BITE PASS (unexpected)', b.name);
    } catch (e) {
      console.log('BITE FAIL', b.name, '-', e.message || e);
    }
  });
}

// CTO 23/10: C1 base one-consent set for M1–M8 (Group.Read.All and Chat.Read are optional, not here).
const MS_EXPECTED = E.microsoftConsentScopes();

(async () => {
await ok('stepsFor google is exactly one incremental step', () => {
  const r = E.stepsFor('google');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'google-ecosystem');
  assert.strictEqual(r.steps[0].includeGrantedScopes, true);
});

await ok('stepsFor microsoft is exactly one Graph step with ecosystem consent scopes', () => {
  const r = E.stepsFor('microsoft');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'microsoft-ecosystem');
  assert.deepStrictEqual(r.steps[0].scopes, MS_EXPECTED);
  assert.strictEqual(r.steps[0].scopes.length, 7);
  assert.ok(r.steps[0].scopes.indexOf('openid') >= 0);
  assert.ok(r.steps[0].scopes.indexOf('profile') >= 0);
  assert.ok(r.steps[0].scopes.indexOf('Chat.Read') < 0);
});

await ok('microsoft base consent never includes Group.*, Chat.Read, or OnlineMeetings; optional is teamsChat and contacts', () => {
  assert.ok(!MS_EXPECTED.some((s) => /^Group\./i.test(s)));
  assert.ok(MS_EXPECTED.indexOf('OnlineMeetings.ReadWrite') < 0);
  assert.ok(MS_EXPECTED.indexOf('Chat.Read') < 0);
  assert.ok(MS_EXPECTED.indexOf('Calendars.ReadWrite') < 0);
  assert.ok(MS_EXPECTED.indexOf('Contacts.Read') < 0);
  assert.ok(MS_EXPECTED.indexOf('Notes.ReadWrite') < 0);
  assert.ok(MS_EXPECTED.indexOf('MailboxSettings.Read') < 0);
  assert.ok(MS_EXPECTED.indexOf('People.Read') < 0);
  assert.ok(E.microsoftOptionalScopes.planner === undefined);
  assert.ok(!Object.keys(E.microsoftOptionalScopes).some((k) => /Group/i.test(String(E.microsoftOptionalScopes[k]))));
  assert.deepStrictEqual(E.microsoftOptionalScopes.teamsChat, ['Chat.Read']);
  assert.deepStrictEqual(E.microsoftOptionalScopes.contacts, ['Contacts.Read']);
  assert.ok(MS_EXPECTED.indexOf('Tasks.ReadWrite') >= 0);
  assert.ok(E.microsoftRequiredScopes().indexOf('openid') < 0);
  assert.ok(E.microsoftRequiredScopes().indexOf('profile') < 0);
});

await ok('incremental optional scopes merge on Labs Teams or Outlook contacts', () => {
  assert.strictEqual(E.optionalScopeBucketForLabsSwitch('TEAMS_MEETING'), 'teamsChat');
  assert.strictEqual(E.optionalScopeBucketForOutlookService('contacts'), 'contacts');
  const work = { microsoftAccountKind: 'work' };
  assert.deepStrictEqual(E.incrementalScopesForBucket('teamsChat', work), ['Chat.Read']);
  const merged = E.mergeMicrosoftScopes(MS_EXPECTED, ['Chat.Read', 'Contacts.Read']);
  assert.ok(merged.indexOf('Chat.Read') >= 0);
  assert.ok(merged.indexOf('Contacts.Read') >= 0);
  assert.ok(E.TEAMS_OPTIONAL_HOST_ORIGINS.indexOf('https://teams.microsoft.com/*') >= 0);
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');
  assert.ok(/teams\.microsoft\.com/.test(manifest));
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  assert.ok(/flow:microsoft-optional-scopes/.test(bg) && /requestMicrosoftOptionalScopes/.test(bg));
});

function fakeIdToken(tid) {
  const payload = Buffer.from(JSON.stringify({ tid: tid })).toString('base64url');
  return 'e30.' + payload + '.sig';
}

await ok('resolveMicrosoftAccountKind: consumer tid is personal (gmail.com MSA, hotmail.co.il, live.co.uk)', () => {
  const consumer = E.MS_CONSUMER_TENANT_ID;
  const profileGmail = { mail: 'salisapan1@gmail.com', userPrincipalName: 'salisapan1@gmail.com' };
  const profileHotmail = { mail: 'you@hotmail.co.il', userPrincipalName: 'you@hotmail.co.il' };
  const profileLive = { mail: 'you@live.co.uk', userPrincipalName: 'you@live.co.uk' };
  assert.strictEqual(E.resolveMicrosoftAccountKind(fakeIdToken(consumer), profileGmail), 'personal');
  assert.strictEqual(E.resolveMicrosoftAccountKind(fakeIdToken(consumer), profileHotmail), 'personal');
  assert.strictEqual(E.resolveMicrosoftAccountKind(fakeIdToken(consumer), profileLive), 'personal');
  assert.strictEqual(E.isPersonalMicrosoftAccount({ microsoftAccountKind: 'personal', address: 'salisapan1@gmail.com' }), true);
});

await ok('resolveMicrosoftAccountKind: work tenant tid is work even when UPN is gmail.com', () => {
  const workTid = '11111111-2222-3333-4444-555555555555';
  const profile = { mail: 'salisapan1@gmail.com', userPrincipalName: 'salisapan1@gmail.com' };
  assert.strictEqual(E.resolveMicrosoftAccountKind(fakeIdToken(workTid), profile), 'work');
  assert.strictEqual(E.isPersonalMicrosoftAccount({ microsoftAccountKind: 'work', address: 'salisapan1@gmail.com' }), false);
});

await ok('normalizeToken keeps id_token from token response', () => {
  const t = A.normalizeToken({
    access_token: 'at', refresh_token: 'rt', expires_in: 3600,
    id_token: 'e30.e30.sig', scope: 'User.Read offline_access'
  }, Date.now(), null, true);
  assert.strictEqual(t.idToken, 'e30.e30.sig');
});

await ok('resolveMicrosoftAccountKind: MSA without idToken and gmail UPN is personal', () => {
  const profile = { mail: 'salisapan1@gmail.com', userPrincipalName: 'salisapan1@gmail.com' };
  assert.strictEqual(E.resolveMicrosoftAccountKind(null, profile), 'personal');
});

await ok('resolveMicrosoftAccountKind: GUID /me id without tid is unknown not work', () => {
  const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const profile = { id: guid, userPrincipalName: 'user@contoso.com', mail: 'user@contoso.com' };
  assert.strictEqual(E.resolveMicrosoftAccountKind(null, profile), 'unknown');
  assert.strictEqual(E.isWorkMicrosoftAccount({ microsoftAccountKind: 'unknown', profile: profile }), false);
  assert.strictEqual(E.plannerAccess({ microsoftAccountKind: 'unknown' }, MS_EXPECTED), 'personal');
});

await ok('plannerAccess personal Microsoft account: no card, silent To Do, never request Group.Read.All', () => {
  const account = { address: 'you@outlook.com', mail: 'you@outlook.com', userPrincipalName: 'you@outlook.com', microsoftAccountKind: 'personal' };
  const access = E.plannerAccess(account, MS_EXPECTED);
  assert.strictEqual(access, 'personal');
  assert.strictEqual(E.plannerShowsPlannerCard(access), false);
  assert.strictEqual(E.plannerShouldRequestGroupConsent(access), false);
  const route = E.plannerExecutionRoute(access, null);
  assert.strictEqual(route.destination, 'todo');
  assert.strictEqual(route.requestGroupConsent, false);
  assert.strictEqual(route.explainTodoFallback, false);
});

await ok('plannerAccess work account without Group.Read.All: no Planner card or group consent in this build', () => {
  const account = { address: 'you@contoso.com', mail: 'you@contoso.com', userPrincipalName: 'you@contoso.com', microsoftAccountKind: 'work' };
  const access = E.plannerAccess(account, MS_EXPECTED);
  assert.strictEqual(access, 'unavailable');
  assert.strictEqual(E.plannerShowsPlannerCard(access), false);
  assert.strictEqual(E.plannerShouldRequestGroupConsent(access), false);
  const route = E.plannerExecutionRoute(access, null);
  assert.strictEqual(route.destination, 'todo');
  assert.strictEqual(route.requestGroupConsent, false);
});

await ok('plannerConsentOutcome admin or denied falls back to To Do with explanation, not a dead end', () => {
  const admin = E.plannerConsentOutcome({ ok: false, aadsts: 'AADSTS65001', error: 'invalid_grant' });
  const denied = E.plannerConsentOutcome({ ok: false, error: 'access_denied', reason: 'permission-denied' });
  assert.strictEqual(admin, 'admin-required');
  assert.strictEqual(denied, 'denied');
  const routeAdmin = E.plannerExecutionRoute('unavailable', admin);
  const routeDenied = E.plannerExecutionRoute('unavailable', denied);
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
  const planner = E.catalog().find((row) => row.id === 'ms-planner');
  assert.ok(planner && /To Do/.test(planner.detail) && /explanation/i.test(planner.detail), planner && planner.detail);
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
  globalThis.FlowOutlookConfig = C;
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
    permissions: (over && over.permissions) ? over.permissions : makeChromePermissions(over && over.perms),
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

function loadBackgroundMessageHarness(over) {
  const messageListeners = [];
  const stored = Object.assign({
    outlookAuth: { token: { accessToken: 't' }, requestedScopes: MS_EXPECTED }
  }, (over && over.stored) || {});
  const chrome = {
    storage: {
      local: {
        async get(k) {
          if (typeof k === 'string') return { [k]: stored[k] };
          if (Array.isArray(k)) {
            const bag = {};
            k.forEach((key) => { bag[key] = stored[key]; });
            return bag;
          }
          return Object.assign({}, stored);
        },
        async set(patch) { Object.assign(stored, patch); }
      }
    },
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
    runtime: {
      id: 'ext',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(fn) { messageListeners.push(fn); } },
      getManifest: () => ({ version: '0.9.56' }),
      sendMessage: async () => ({})
    },
    alarms: { create: () => {}, onAlarm: { addListener() {} }, get: (n, cb) => cb(null) },
    contextMenus: { removeAll(cb) { if (cb) cb(); }, create() {}, onClicked: { addListener() {} } },
    windows: { create: () => {}, onRemoved: { addListener() {} } },
    tabs: { sendMessage: () => {}, query: async () => [] },
    permissions: { request: async () => true, contains: async () => false, remove: async () => true },
    notifications: { create: () => {}, onClicked: { addListener() {} }, onClosed: { addListener() {} } },
    scripting: { registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} }
  };
  const sandbox = {
    console,
    chrome,
    crypto: require('crypto').webcrypto,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }),
    FlowConnectEcosystem: E,
    FlowOutlookConfig: C,
    FlowProfileHook: PH,
    FlowExtract: {},
    FlowIntent: {},
    FlowFactReply: {},
    FlowActions: {},
    FlowIdentity: { empty: () => ({ parties: {} }) },
    FlowFollowUp: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lane-chat/meta-consent.js'), 'utf8'), sandbox);
  const { backgroundScript } = require('./load-background.cjs');
  vm.runInContext(backgroundScript(), sandbox, { filename: 'background.js', timeout: 180000 });
  function dispatch(msg, sender) {
    const snd = sender || { id: chrome.runtime.id };
    return new Promise((resolve) => {
      let settled = false;
      const reply = (r) => {
        if (!settled) { settled = true; resolve(r); }
      };
      for (const fn of messageListeners) {
        try {
          fn(msg, snd, reply);
        } catch (e) {
          if (!settled) { settled = true; resolve({ ok: false, error: String(e) }); }
        }
      }
      setTimeout(() => {
        if (!settled) { settled = true; resolve(undefined); }
      }, 250);
    });
  }
  return { dispatch, messageListeners, sandbox, stored };
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

await ok('outlook connect fails when Graph host permission is denied (permissions stub bites)', async () => {
  const { inst } = outlookConnectWorld({
    permissions: makeChromePermissions({ deniedOrigins: ['https://graph.microsoft.com/*'] })
  });
  const r = await inst.connect({ scopes: MS_EXPECTED });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'permission');
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
  assert.ok(w.signInScopes.indexOf('Chat.Read') < 0, 'Chat.Read is optional teamsChat only');
  assert.ok(w.signInScopes.indexOf('Mail.Read') < 0, 'legacy Mail.Read must not leak into ecosystem reconnect');
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(expectedIntersect));
});

await ok('personal microsoft stays connected when teamsChat optional is denied and Chat.Read is stripped on reconnect', async () => {
  const personal = {
    microsoftAccountKind: 'personal',
    address: 'salisapan1@gmail.com',
    mail: 'salisapan1@gmail.com',
    userPrincipalName: 'salisapan1@gmail.com'
  };
  assert.strictEqual(E.optionalScopesForAccount(personal).teamsChat, undefined);
  const granted = MS_EXPECTED.filter((s) => s !== 'offline_access' && s !== 'openid' && s !== 'profile');
  const auth = {
    token: { accessToken: 't', expiresAt: Date.now() + 1e6, grantedScopes: granted },
    requestedScopes: MS_EXPECTED,
    account: personal,
    profile: personal
  };
  const snap = E.statusSnapshot({ outlookAuth: auth, outlookSync: {}, now: Date.now() }).microsoft;
  assert.strictEqual(snap.connected, true);
  assert.strictEqual(snap.needsReconnect, false);
  const allSvcIds = (C.CONNECT_SERVICES || []).map((s) => s.id);
  const { w, inst } = outlookConnectWorld({
    store: {
      outlookAuth: {
        ecosystem: true,
        requestedScopes: MS_EXPECTED,
        token: { accessToken: 'old' },
        account: personal
      }
    }
  });
  await inst.connect({ scopes: C.scopesFor(allSvcIds) });
  assert.ok(w.signInScopes.indexOf('Chat.Read') < 0);
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

function loadBackgroundDisconnect() {
  const stored = {};
  const removed = [];
  const disableCalls = [];
  const chrome = {
    storage: {
      local: {
        async get(k) {
          if (k == null) return Object.assign({}, stored);
          if (typeof k === 'string') return { [k]: stored[k] };
          if (Array.isArray(k)) {
            const bag = {};
            k.forEach((key) => { bag[key] = stored[key]; });
            return bag;
          }
          if (typeof k === 'object') {
            const bag = {};
            Object.keys(k).forEach((key) => {
              bag[key] = stored[key] !== undefined ? stored[key] : k[key];
            });
            return bag;
          }
          return Object.assign({}, stored);
        },
        async set(patch) { Object.assign(stored, patch); },
        async remove(keys) {
          (keys || []).forEach((key) => { delete stored[key]; });
        }
      }
    },
    permissions: {
      remove(spec, cb) {
        removed.push(spec);
        if (typeof cb === 'function') cb(true);
        return Promise.resolve(true);
      },
      onAdded: { addListener() {} },
      onRemoved: { addListener() {} }
    },
    runtime: {
      id: 'ext',
      sendMessage: async () => ({}),
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      onConnect: { addListener() {} },
      getManifest: () => ({ version: '0.9.56' })
    },
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
    tabs: { query: async () => [], sendMessage: async () => {} },
    alarms: { create: () => {}, onAlarm: { addListener() {} }, get: (n, cb) => cb(null) },
    contextMenus: { removeAll(cb) { if (cb) cb(); }, create(o, cb) { if (cb) cb(); }, onClicked: { addListener() {} } },
    windows: { create: () => {}, onRemoved: { addListener() {} } },
    notifications: { create: () => {}, onClicked: { addListener() {} }, onClosed: { addListener() {} } }
  };
  const sandbox = {
    console,
    chrome,
    crypto: require('crypto').webcrypto,
    fetch: async () => ({ ok: false }),
    FlowConnectEcosystem: E,
    FlowProfileHook: PH
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lane-chat/meta-consent.js'), 'utf8'), sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { sandbox, stored, removed, disableCalls };
}

await ok('flow:disconnect microsoft uses real disconnectConnector and clears outlook', async () => {
  const { sandbox, stored } = loadBackgroundDisconnect();
  stored.outlookAuth = { token: { accessToken: 'x' }, ecosystem: true };
  stored.outlookSync = { needsSignIn: false };
  const fn = vm.runInContext('disconnectConnector', sandbox);
  const out = await fn('microsoft');
  assert.strictEqual(out.ok, true);
  assert.strictEqual(stored.outlookAuth, undefined);
  assert.strictEqual(stored.outlookSync, undefined);
});

await ok('flow:disconnect meta uses real disconnectConnector and clears host permissions', async () => {
  const { sandbox, removed } = loadBackgroundDisconnect();
  const fn = vm.runInContext('disconnectConnector', sandbox);
  const out = await fn('meta');
  assert.strictEqual(out.ok, true);
  assert.ok(removed.some((r) => r.origins && r.origins.length === 15));
});

await ok('FlowOutlook.connect keeps ecosystem flag when prev.ecosystem (outlook.js)', () => {
  const outlook = fs.readFileSync(path.join(__dirname, '../src/outlook.js'), 'utf8');
  const connectBlock = outlook.slice(outlook.indexOf('async function connect(opts)'), outlook.indexOf('async function disconnect()'));
  assert.ok(/ecosystem:\s*Boolean\(prev && prev\.ecosystem\)/.test(connectBlock));
});

await ok('meta-consent disconnect calls FlowProfileHook.onDisconnect', async () => {
  let disconnected = null;
  const hook = { onDisconnect(eco) { disconnected = eco; } };
  const sandbox = { FlowProfileHook: hook, FlowConnectEcosystem: E };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lane-chat/meta-consent.js'), 'utf8'), sandbox);
  const removed = [];
  const chrome = {
    permissions: {
      remove(spec, cb) {
        removed.push(spec);
        if (typeof cb === 'function') cb(true);
      }
    }
  };
  await sandbox.FlowMetaConsent.disconnect(chrome);
  assert.strictEqual(disconnected, 'meta');
  assert.ok(removed.length >= 1);
});

await ok('connect-3 paint: connected microsoft row shows Disconnect', () => {
  const state = { outlookAuth: { token: { accessToken: 't' }, account: { address: 'you@contoso.com' } } };
  const status = { microsoft: { connected: true, partial: false, needsReconnect: false } };
  const { host } = connect3Paint({ lang: 'en', status, state, send: async () => ({ ok: true }) });
  assert.ok(host.querySelector('[data-disconnect-eco="microsoft"]'));
});

await ok('connect-3 paint: needsReconnect label is Reconnect needed / צריך להתחבר מחדש', () => {
  const state = { outlookAuth: { token: { accessToken: 't' }, account: { address: 'you@contoso.com' } } };
  const status = { microsoft: { connected: false, partial: true, needsReconnect: true } };
  const en = connect3Paint({ lang: 'en', status, state, send: async () => ({ ok: true }) });
  assert.ok(en.host.textContent.includes('Reconnect needed'));
  assert.ok(!en.host.textContent.includes('Partly connected'));
  const he = connect3Paint({ lang: 'he', status, state, send: async () => ({ ok: true }) });
  assert.ok(he.host.textContent.includes('צריך להתחבר מחדש'));
});

await ok('connect-3 paint: expired partial row shows Expired / פג תוקף', () => {
  const state = { outlookAuth: { token: { accessToken: 't' }, account: { address: 'you@contoso.com' } } };
  const status = { microsoft: { connected: false, partial: true, needsReconnect: false, detail: 'expired' } };
  const en = connect3Paint({ lang: 'en', status, state, send: async () => ({ ok: true }) });
  assert.ok(en.host.textContent.includes('Expired'));
  const he = connect3Paint({ lang: 'he', status, state, send: async () => ({ ok: true }) });
  assert.ok(he.host.textContent.includes('פג תוקף'));
});

await ok('connect-3 paint: Reconnect click sends flow:connect', async () => {
  const sends = [];
  const state = { outlookAuth: { token: { accessToken: 't' }, account: { address: 'you@contoso.com' } } };
  const status = { microsoft: { connected: false, partial: true, needsReconnect: true } };
  const { host, win } = connect3Paint({
    lang: 'en', status, state,
    send: async (m) => { sends.push(m); return { ok: true }; }
  });
  host.querySelector('[data-reconnect-eco="microsoft"]').click();
  await flushDom(win);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].type, 'flow:connect');
  assert.strictEqual(sends[0].connectorId, 'microsoft');
});

await ok('connect-3 paint: failed connect shows reason inside the row', async () => {
  const state = {};
  const status = {};
  const { host, win } = connect3Paint({
    lang: 'en', status, state,
    send: async () => ({ ok: false, reason: 'x' })
  });
  host.querySelector('[data-connect-eco="microsoft"]').click();
  await new Promise((r) => win.setTimeout(r, 50));
  const err = host.querySelector('[data-connect-eco="microsoft"]')?.parentElement?.querySelector('.c3-err')
    || host.querySelector('.c3-err');
  assert.ok(err);
  assert.strictEqual(err.textContent.trim(), 'x');
});

await ok('personal microsoft with base scopes is connected without reconnect loop', () => {
  const auth = {
    token: {
      accessToken: 't',
      expiresAt: Date.now() + 3600000,
      grantedScopes: E.microsoftConsentScopes().filter((s) => s !== 'offline_access')
    },
    requestedScopes: E.microsoftConsentScopes(),
    account: { microsoftAccountKind: 'personal', address: 'salisapan1@gmail.com' },
    profile: { userPrincipalName: 'salisapan1@gmail.com', mail: 'salisapan1@gmail.com' }
  };
  const row = E.statusSnapshot({ outlookAuth: auth, outlookSync: {}, now: Date.now() }).microsoft;
  assert.strictEqual(row.connected, true);
  assert.strictEqual(row.partial, false);
  assert.strictEqual(row.needsReconnect, false);
});

await ok('disconnectConnector googleTasks calls FlowProfileHook.onDisconnect', () => {
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  const block = bg.slice(bg.indexOf("if (connectorId === 'googleTasks')"), bg.indexOf('return { ok: true };', bg.indexOf("if (connectorId === 'googleTasks')")) + 20);
  assert.ok(/onDisconnect\('google'\)/.test(block));
});

await ok('outlookEcosystemSync OWA closed runs graph runner sync and remembers profile names', async () => {
  const { sandbox, syncCalls, stored } = loadBackgroundOutlookSync({ owaTabs: [] });
  const fn = vm.runInContext('outlookEcosystemSync', sandbox);
  const r = await fn({ force: true });
  assert.strictEqual(r.mode, 'graph');
  assert.strictEqual(syncCalls.length, 1);
  assert.strictEqual(syncCalls[0].force, true);
  assert.strictEqual(stored.glanceOwnNames && stored.glanceOwnNames[0], 'Profile Name');
});

await ok('outlookEcosystemSync OWA open rescans only (no graph runner sync)', async () => {
  const { sandbox, syncCalls } = loadBackgroundOutlookSync({ owaTabs: [{ id: 9, url: 'https://outlook.live.com/mail/' }] });
  const fn = vm.runInContext('outlookEcosystemSync', sandbox);
  const r = await fn({ force: true });
  assert.strictEqual(r.mode, 'rescan');
  assert.strictEqual(syncCalls.length, 0);
});

await ok('outlookEcosystemSync without FlowOutlook is not-configured (wiring dependency)', async () => {
  const { sandbox } = loadBackgroundOutlookSync({ noFlowOutlook: true, owaTabs: [] });
  const fn = vm.runInContext('outlookEcosystemSync', sandbox);
  const r = await fn({ force: true });
  assert.strictEqual(r.mode, 'graph');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'not-configured');
});

function loadMicrosoftEcosystemConnect(over) {
  const stored = {};
  const syncCalls = [];
  const signInLog = [];
  const w = Object.assign({ profile: {
    mail: 'me@contoso.com',
    userPrincipalName: 'me@contoso.com',
    displayName: 'Me',
    otherMails: ['alias@contoso.com'],
    proxyAddresses: ['smtp:second@contoso.com']
  }, token: { accessToken: 'tok', grantedScopes: MS_EXPECTED, idToken: fakeIdToken(E.MS_CONSUMER_TENANT_ID) } }, over || {});
  const chrome = {
    storage: {
      local: {
        async get(k) {
          if (k == null) return Object.assign({}, stored);
          if (typeof k === 'string') return { [k]: stored[k] };
          if (Array.isArray(k)) {
            const bag = {};
            k.forEach((key) => { bag[key] = stored[key]; });
            return bag;
          }
          return Object.assign({}, stored);
        },
        async set(patch) { Object.assign(stored, patch); },
        async remove(keys) { (keys || []).forEach((key) => { delete stored[key]; }); }
      }
    },
    permissions: {
      request(spec, cb) { if (typeof cb === 'function') cb(true); return Promise.resolve(true); }
    },
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' }
  };
  const sandbox = {
    console,
    chrome,
    crypto: require('crypto').webcrypto,
    fetch: async (url) => {
      if (String(url).includes('/me?')) return { ok: true, json: async () => w.profile };
      return { ok: false };
    },
    FlowConnectEcosystem: E,
    FlowOutlookAuth: {
      signIn: async (_deps, _cfg, _redirect, opts) => {
        signInLog.push((opts && opts.scopes) ? opts.scopes.slice() : []);
        return { ok: true, token: w.token };
      }
    },
    FlowOutlookConfig: { CLIENT_ID: '11111111-2222-3333-4444-555555555555' },
    FlowProfileHook: PH
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const swSrc = stripModuleExports(fs.readFileSync(path.join(__dirname, '../src/connect-ecosystem-sw.js'), 'utf8'));
  vm.runInContext(swSrc + '\nthis.__sw = { connectEcosystemConnector };', sandbox, { filename: 'connect-ecosystem-sw.js' });
  return {
    stored,
    syncCalls,
    signInLog,
    async connect() {
      stored.outlookPending = { offers: [{ key: 'old' }], asks: [] };
      stored.outlookSync = { offered: { x: 1 }, lastAt: 99, diagnostics: ['stale'] };
      return sandbox.__sw.connectEcosystemConnector('microsoft', {
        launchInteractive: async () => '',
        enableSurface: async () => ({}),
        syncOutlook: async (opts) => { syncCalls.push(opts); }
      });
    }
  };
}

await ok('ecosystem microsoft connect stores all ownAddresses clears judge state and forces sync', async () => {
  const world = loadMicrosoftEcosystemConnect();
  const out = await world.connect();
  assert.strictEqual(out.ok, true);
  const auth = world.stored.outlookAuth;
  assert.ok(auth && auth.ecosystem === true);
  assert.ok(auth.ownAddresses.length >= 2);
  assert.ok(auth.ownAddresses.indexOf('alias@contoso.com') >= 0);
  assert.strictEqual(auth.account.microsoftAccountKind, 'personal');
  assert.ok(Array.isArray(world.stored.outlookPending.offers) && world.stored.outlookPending.offers.length === 0);
  assert.ok(Array.isArray(world.stored.outlookPending.asks) && world.stored.outlookPending.asks.length === 0);
  assert.ok(!world.stored.outlookSync.offered || Object.keys(world.stored.outlookSync.offered).length === 0);
  assert.strictEqual(world.syncCalls.length, 1);
  assert.strictEqual(world.syncCalls[0].force, true);
});

await ok('personal microsoft one-consent succeeds without OnlineMeetings.ReadWrite in base scopes', () => {
  assert.ok(MS_EXPECTED.indexOf('OnlineMeetings.ReadWrite') < 0);
  const granted = MS_EXPECTED.slice();
  assert.strictEqual(E.hasScopes(granted, E.microsoftRequiredScopes()), true);
});

await ok('K1: ecosystem microsoft sign-in sends only base consent scopes', async () => {
  const world = loadMicrosoftEcosystemConnect();
  await world.connect();
  const auth = world.stored.outlookAuth;
  assert.ok(auth && Array.isArray(auth.requestedScopes));
  assert.deepStrictEqual(sortScopes(auth.requestedScopes), sortScopes(MS_EXPECTED));
  assert.ok(world.signInLog.length >= 1);
  assert.deepStrictEqual(sortScopes(world.signInLog[world.signInLog.length - 1]), sortScopes(MS_EXPECTED));
});

await ok('K2: popup requests optional scopes via flow:microsoft-optional-scopes not outlook-consent', () => {
  const popup = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const addBlock = popup.slice(popup.indexOf('data-glance-add-scope'), popup.indexOf('data-glance-add-scope') + 2200);
  assert.ok(/flow:microsoft-optional-scopes/.test(addBlock));
  assert.ok(/optionalScopeBucketForOutlookService/.test(addBlock));
  const labs = popup.slice(popup.indexOf('async function labsOptionalScopeAfterFlip'), popup.indexOf('async function renderLabs'));
  assert.ok(/flow:microsoft-optional-scopes/.test(labs));
  assert.ok(!/renderLabs[\s\S]{0,800}flow:microsoft-optional-scopes/.test(popup));
});

await ok('K3: background onMessage flow:outlook-consent-scope refuses Contacts.Read and Chat.Read', async () => {
  const { dispatch, messageListeners } = loadBackgroundMessageHarness();
  assert.ok(messageListeners.length >= 1, 'background must register onMessage');
  const contacts = await dispatch({ type: 'flow:outlook-consent-scope', scope: 'Contacts.Read' });
  const chat = await dispatch({ type: 'flow:outlook-consent-scope', scope: 'Chat.Read' });
  assert.strictEqual(contacts.reason, 'scope-refused');
  assert.strictEqual(chat.reason, 'scope-refused');
});

await ok('K3c: onMessage flow:microsoft-optional-scopes contacts bucket calls signIn with Contacts.Read', async () => {
  const { dispatch, sandbox, stored } = loadBackgroundMessageHarness({
    stored: {
      outlookAuth: {
        ecosystem: true,
        token: { accessToken: 'tok', grantedScopes: MS_EXPECTED },
        requestedScopes: MS_EXPECTED,
        account: { address: 'me@contoso.com', microsoftAccountKind: 'work' }
      }
    }
  });
  vm.runInContext(`
    globalThis.__k3SignInScopes = [];
    FlowOutlookAuth.signIn = async function (_d, _c, _r, opts) {
      globalThis.__k3SignInScopes.push((opts && opts.scopes) ? opts.scopes.slice() : []);
      return { ok: true, token: { accessToken: 'new', grantedScopes: (opts && opts.scopes) || [] } };
    };
  `, sandbox);
  const out = await dispatch({ type: 'flow:microsoft-optional-scopes', bucket: 'contacts' });
  const signInScopes = vm.runInContext('globalThis.__k3SignInScopes', sandbox);
  assert.strictEqual(out && out.ok, true, out);
  assert.ok(Array.isArray(signInScopes) && signInScopes.length >= 1, signInScopes);
  assert.ok(signInScopes[0].indexOf('Contacts.Read') >= 0, signInScopes[0]);
  assert.deepStrictEqual(sortScopes(signInScopes[0]), sortScopes(MS_EXPECTED.concat(['Contacts.Read'])));
});

await ok('K3s: flow:microsoft-optional-scopes rejects foreign sender', async () => {
  const { dispatch } = loadBackgroundMessageHarness({
    stored: {
      outlookAuth: {
        ecosystem: true,
        token: { accessToken: 'tok', grantedScopes: MS_EXPECTED },
        requestedScopes: MS_EXPECTED,
        account: { address: 'me@contoso.com', microsoftAccountKind: 'work' }
      }
    }
  });
  const out = await dispatch({ type: 'flow:microsoft-optional-scopes', bucket: 'contacts' }, { id: 'not-the-extension' });
  assert.strictEqual(out && out.ok, false);
  assert.strictEqual(out && out.reason, 'not-allowed');
});

await ok('K3b: Contacts.Read via outlook-consent-scope stays refused (mutant guard)', async () => {
  const { backgroundScript } = require('./load-background.cjs');
  const stored = { outlookAuth: { token: { accessToken: 't' }, requestedScopes: MS_EXPECTED } };
  const chrome = {
    storage: { local: { async get() { return stored; }, async set() {} } },
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
    runtime: {
      id: 'ext',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: '0.9.56' })
    },
    alarms: { create: () => {}, onAlarm: { addListener() {} } },
    contextMenus: { removeAll(cb) { if (cb) cb(); }, create() {}, onClicked: { addListener() {} } },
    windows: { create: () => {}, onRemoved: { addListener() {} } },
    tabs: { sendMessage: () => {} }
  };
  const sandbox = { console, chrome, crypto: require('crypto').webcrypto, fetch: async () => ({ ok: false }) };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(backgroundScript(), sandbox, { filename: 'background.js', timeout: 120000 });
  const fn = vm.runInContext('outlookConsentScope', sandbox);
  const contacts = await fn({ scope: 'Contacts.Read' });
  assert.strictEqual(contacts.ok, false);
  assert.strictEqual(contacts.reason, 'scope-refused');
});

await ok('K1b: requestMicrosoftOptionalScopes sign-in merges base and Contacts.Read', async () => {
  const signInScopes = [];
  const stored = {
    outlookAuth: {
      ecosystem: true,
      requestedScopes: MS_EXPECTED,
      token: { accessToken: 'old', grantedScopes: MS_EXPECTED },
      account: { address: 'me@contoso.com', microsoftAccountKind: 'work' }
    }
  };
  const chrome = {
    storage: {
      local: {
        async get(k) {
          if (typeof k === 'string') return { [k]: stored[k] };
          return Object.assign({}, stored);
        },
        async set(patch) { Object.assign(stored, patch); }
      }
    },
    identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
    permissions: { request: async () => true },
    runtime: { id: 'ext', onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } }
  };
  const sandbox = {
    console,
    chrome,
    crypto: require('crypto').webcrypto,
    fetch: async () => ({ ok: false }),
    FlowConnectEcosystem: E,
    FlowOutlookAuth: {
      signIn: async (_d, _c, _r, opts) => {
        signInScopes.push((opts && opts.scopes) ? opts.scopes.slice() : []);
        return { ok: true, token: { accessToken: 'new', grantedScopes: (opts && opts.scopes) || MS_EXPECTED } };
      }
    },
    FlowOutlookConfig: C
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const swSrc = stripModuleExports(fs.readFileSync(path.join(__dirname, '../src/connect-ecosystem-sw.js'), 'utf8'));
  vm.runInContext(swSrc, sandbox, { filename: 'connect-ecosystem-sw.js' });
  const fn = vm.runInContext('requestMicrosoftOptionalScopes', sandbox);
  const out = await fn('contacts', { launchInteractive: async () => '' });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(sortScopes(signInScopes[0]), sortScopes(MS_EXPECTED.concat(['Contacts.Read'])));
});

await ok('K2b: Labs TEAMS_MEETING flip via renderLabs click calls flow:microsoft-optional-scopes', async () => {
  if (!JSDOM) throw new Error('jsdom required for K2b');
  const sent = [];
  const storageBag = { glanceSwitches: {} };
  const dom = new JSDOM('<!doctype html><html><body><div id="labs-list"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'chrome-extension://glance/popup.html'
  });
  const w = dom.window;
  w.chrome = {
    runtime: { id: 'ext', sendMessage: async (msg) => { sent.push(msg); return { ok: true }; } },
    storage: {
      local: {
        async get() { return { glanceSwitches: storageBag.glanceSwitches || {} }; },
        async set(patch) { Object.assign(storageBag, patch); }
      }
    }
  };
  const ctx = dom.getInternalVMContext();
  const labsSrc = fs.readFileSync(path.join(__dirname, '../core/labs-switches.js'), 'utf8')
    .replace(/^if \(typeof module[\s\S]*$/m, 'globalThis.FlowLabsSwitches = FlowLabsSwitches;');
  const ecoSrc = fs.readFileSync(path.join(__dirname, '../core/connect-ecosystem.js'), 'utf8')
    .replace(/^if \(typeof module[\s\S]*$/m, 'globalThis.FlowConnectEcosystem = FlowConnectEcosystem;');
  vm.runInContext(labsSrc, ctx, { filename: 'labs-switches.js' });
  vm.runInContext(ecoSrc, ctx, { filename: 'connect-ecosystem.js' });
  const popupSrc = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const elFn = popupSrc.slice(popupSrc.indexOf('function el(tag, cls, text)'), popupSrc.indexOf('async function refresh()'));
  const labsBlock = popupSrc.slice(popupSrc.indexOf('async function labsOptionalScopeAfterFlip'), popupSrc.indexOf('async function renderSurfaces'));
  vm.runInContext(elFn + '\n' + labsBlock, ctx, { filename: 'popup-labs.js' });
  await vm.runInContext('renderLabs()', ctx);
  await flushDom(w);
  const teamsRow = [...w.document.querySelectorAll('#labs-list .wait-item')].find((row) => /TEAMS|Teams|טימס/.test(row.textContent || ''));
  assert.ok(teamsRow, 'TEAMS_MEETING labs row');
  const turnOn = teamsRow.querySelector('button');
  assert.ok(turnOn && /הפעל/.test(turnOn.textContent || ''), turnOn && turnOn.textContent);
  turnOn.click();
  await new Promise((r) => w.setTimeout(r, 80));
  assert.ok(sent.some((m) => m.type === 'flow:microsoft-optional-scopes' && m.bucket === 'teamsChat'), sent);
});

await ok('R4/R5: ecosystem reconnect keeps ticked Calendar (Calendars.ReadWrite)', async () => {
  const withCal = MS_EXPECTED.concat(['Calendars.ReadWrite']);
  const { w, inst } = outlookConnectWorld({
    store: {
      outlookAuth: {
        ecosystem: true,
        requestedScopes: withCal,
        token: { accessToken: 'old', grantedScopes: withCal },
        account: { address: 'me@contoso.com', microsoftAccountKind: 'work' }
      }
    }
  });
  const scopes = C.scopesFor(['mail', 'calendar']);
  await inst.connect({ scopes });
  assert.ok(w.signInScopes.indexOf('Calendars.ReadWrite') >= 0, w.signInScopes);
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(scopes));
});

await ok('popup.html loads connect-ecosystem.js and Contacts add-scope uses optional bucket', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  const scripts = [];
  html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => { scripts.push(src); });
  assert.ok(scripts.some((s) => /connect-ecosystem\.js$/.test(s)), scripts);
  assert.ok(scripts.indexOf('../core/connect-ecosystem.js') < scripts.indexOf('popup.js'), scripts);
  const popup = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  assert.ok(/flow:microsoft-optional-scopes/.test(popup) && /optionalScopeBucketForOutlookService/.test(popup));
  if (!JSDOM) throw new Error('jsdom required');
  const sent = [];
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.chrome = { runtime: { sendMessage: (msg) => { sent.push(msg); return Promise.resolve({ ok: true }); } } };
  const ctx = dom.getInternalVMContext();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/connect-ecosystem.js'), 'utf8'), ctx, { filename: 'connect-ecosystem.js' });
  await vm.runInContext(
    '(async () => {\n'
    + 'const bucket = FlowConnectEcosystem.optionalScopeBucketForOutlookService("contacts");\n'
    + 'if (!bucket) throw new Error("no bucket");\n'
    + 'await chrome.runtime.sendMessage({ type: "flow:microsoft-optional-scopes", bucket });\n'
    + '})();\n',
    ctx
  );
  await new Promise((r) => w.setTimeout(r, 40));
  assert.ok(sent.some((m) => m.type === 'flow:microsoft-optional-scopes' && m.bucket === 'contacts'), sent);
});

await ok('ecosystem reconnect keeps already-granted Contacts.Read', async () => {
  const withContacts = MS_EXPECTED.concat(['Contacts.Read']);
  const { w, inst } = outlookConnectWorld({
    store: {
      outlookAuth: {
        ecosystem: true,
        requestedScopes: withContacts,
        token: { accessToken: 'old', grantedScopes: withContacts },
        account: { address: 'me@contoso.com', microsoftAccountKind: 'work' }
      }
    }
  });
  await inst.connect({ scopes: MS_EXPECTED.concat(['Mail.Read']) });
  assert.ok(w.signInScopes.indexOf('Contacts.Read') >= 0);
  assert.deepStrictEqual(sortScopes(w.signInScopes), sortScopes(withContacts));
});

console.log('\n' + n + ' passed, ' + failures + ' failed');
runF488BiteRows();
if (failures) process.exit(1);
})();
