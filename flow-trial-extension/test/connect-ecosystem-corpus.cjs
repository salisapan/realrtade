// C1 connect per ecosystem: one step per provider, catalog, PKCE interface, no Mail.Send.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowConnectEcosystem: E } = require('../core/connect-ecosystem.js');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');

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

const MS_EXPECTED = [
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
  'Files.ReadWrite',
  'Contacts.Read',
  'Chat.Read',
  'Notes.ReadWrite',
  'MailboxSettings.Read',
  'People.Read'
];

(async () => {
await ok('stepsFor google is exactly one incremental step', () => {
  const r = E.stepsFor('google');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'google-ecosystem');
  assert.strictEqual(r.steps[0].includeGrantedScopes, true);
});

await ok('stepsFor microsoft is exactly one Graph step with 11 ecosystem scopes', () => {
  const r = E.stepsFor('microsoft');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'microsoft-ecosystem');
  assert.deepStrictEqual(r.steps[0].scopes, MS_EXPECTED);
  assert.strictEqual(r.steps[0].scopes.length, 11);
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

console.log('\n' + n + ' passed, ' + failures + ' failed');
if (failures) process.exit(1);
})();
