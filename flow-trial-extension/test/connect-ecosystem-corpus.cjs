// C1 connect per ecosystem: one step per provider, catalog, PKCE interface, no Mail.Send.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { FlowConnectEcosystem: E } = require('../core/connect-ecosystem.js');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('stepsFor google is exactly one incremental step', () => {
  const r = E.stepsFor('google');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'google-ecosystem');
  assert.strictEqual(r.steps[0].includeGrantedScopes, true);
});

ok('stepsFor microsoft is exactly one Graph step with ecosystem scopes', () => {
  const r = E.stepsFor('microsoft');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'microsoft-ecosystem');
  assert.ok(Array.isArray(r.steps[0].scopes) && r.steps[0].scopes.length >= 8);
});

ok('stepsFor meta is exactly one host permission step', () => {
  const r = E.stepsFor('meta');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0].type, 'meta-host-permissions');
  assert.ok(r.steps[0].origins.some((o) => /web\.whatsapp\.com/.test(o)));
  assert.ok(r.steps[0].origins.some((o) => /instagram\.com\/direct/.test(o)));
});

ok('catalog lists Planner, OneNote, Word, Excel, PowerPoint', () => {
  const ids = E.catalog().map((row) => row.id);
  assert.deepStrictEqual(ids, ['ms-planner', 'ms-onenote', 'ms-word', 'ms-excel', 'ms-powerpoint']);
});

ok('no Mail.Send in microsoft ecosystem scopes or steps JSON', () => {
  assert.ok(!/Mail\.Send/i.test(JSON.stringify(E.stepsFor('microsoft'))));
  assert.ok(!/Mail\.Send/i.test(JSON.stringify(E.MICROSOFT_SCOPES)));
});

ok('PKCE refresh interface documents refresh_token grant fields', () => {
  const iface = E.PKCE_REFRESH_INTERFACE;
  assert.strictEqual(iface.grantTypes.refresh, 'refresh_token');
  assert.ok(iface.grants.refresh_token.indexOf('refresh_token') >= 0);
  const body = A.refreshBody({ clientId: 'cid', refreshToken: 'rt', scopes: ['User.Read'] });
  assert.ok(body.indexOf('grant_type=refresh_token') >= 0);
  assert.ok(body.indexOf('refresh_token=rt') >= 0);
});

ok('disconnect targets cover all three ecosystems', () => {
  assert.deepStrictEqual(E.disconnectTargets('google'), ['googleTasks']);
  assert.deepStrictEqual(E.disconnectTargets('microsoft'), ['microsoft']);
  assert.deepStrictEqual(E.disconnectTargets('meta'), ['meta']);
});

ok('background wires microsoft and meta on flow:connect', () => {
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  assert.ok(/connectEcosystemConnector/.test(bg));
  assert.ok(/connectorId === 'microsoft'/.test(bg));
  assert.ok(/connectorId === 'meta'/.test(bg));
});

ok('disconnect per ecosystem in background', () => {
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  assert.ok(/disconnectEcosystemConnector/.test(bg));
});

console.log('\n' + n + ' passed, 0 failed');
