// Consent catalogue: select-all excludes `coming`, nothing is asked until ticked, Microsoft is one sign-in, no Send, and the
// catalogue agrees with the Outlook connect screen. No network.
const assert = require('assert');
const { FlowConsentCatalog: C } = require('../core/consent-catalog.js');
const { FlowOutlookConfig: O } = require('../core/outlook-config.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('nothing ticked, nothing asked', () => { assert.deepStrictEqual(C.stepsFor([]), { steps: [], dropped: [] }); assert.deepStrictEqual(C.stepsFor(undefined).steps, []); });
ok('select all never includes a coming service or the contribution box', () => {
  C.selectAll().forEach((id) => assert.notStrictEqual(C.byId(id).state, 'coming', id));
  assert.ok(C.selectAll().indexOf('contribute') < 0);
  assert.ok(C.selectAll().indexOf('notion') >= 0);
});
ok('a coming id ticked by hand is dropped and reported, no step', () => {
  const r = C.stepsFor(['slack', 'contribute', 'nope']);
  assert.deepStrictEqual(r.steps, []); assert.deepStrictEqual(r.dropped, ['slack', 'contribute', 'nope']);
});
ok('notion tick = relay sign-in + its one host, nothing else', () => {
  const r = C.stepsFor(['notion']);
  assert.deepStrictEqual(r.steps.map((s) => s.type), ['oauth-relay', 'host-permission']);
  assert.strictEqual(r.steps[0].vendor, 'notion'); assert.strictEqual(r.steps[1].origin, 'https://api.notion.com/*');
});
ok('asana tick = relay sign-in + its one host, nothing else; both connectors together give both pairs', () => {
  const r = C.stepsFor(['asana']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-relay:asana', 'host-permission:https://app.asana.com/*']);
  assert.strictEqual(C.stepsFor(['asana', 'notion']).steps.length, 4);
  assert.ok(C.selectAll().indexOf('asana') >= 0);
});
ok('jira tick = relay sign-in + its one host (the Atlassian gateway), nothing else', () => {
  const r = C.stepsFor(['jira']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-relay:jira', 'host-permission:https://api.atlassian.com/*']);
  assert.strictEqual(C.stepsFor(['notion', 'asana', 'jira']).steps.length, 6);
  assert.ok(C.selectAll().indexOf('jira') >= 0);
});
ok('linear tick = relay sign-in + its one host, nothing else; all four task connectors together', () => {
  const r = C.stepsFor(['linear']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-relay:linear', 'host-permission:https://api.linear.app/*']);
  assert.strictEqual(C.stepsFor(['notion', 'asana', 'jira', 'linear']).steps.length, 8);
  assert.ok(C.selectAll().indexOf('linear') >= 0);
});
ok('docusign tick = relay sign-in + its two hosts, nothing else; all five connectors together', () => {
  const r = C.stepsFor(['docusign']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-relay:docusign', 'host-permission:https://account.docusign.com/*', 'host-permission:https://*.docusign.net/*']);
  assert.strictEqual(C.stepsFor(['notion', 'asana', 'jira', 'linear', 'docusign']).steps.length, 11);
  assert.ok(C.selectAll().indexOf('docusign') >= 0);
});
ok('zoom tick = relay sign-in + its one API host, nothing else; it is in select all', () => {
  const r = C.stepsFor(['zoom']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-relay:zoom', 'host-permission:https://api.zoom.us/*']);
  assert.ok(C.selectAll().indexOf('zoom') >= 0); assert.strictEqual(C.byId('zoom').state, 'experimental');
});
ok('dropbox tick = a PKCE sign-in (no relay, no secret) + its two API hosts, nothing else', () => {
  const r = C.stepsFor(['dropbox']);
  assert.deepStrictEqual(r.steps.map((x) => x.type + ':' + (x.vendor || x.origin)), ['oauth-pkce:dropbox', 'host-permission:https://api.dropboxapi.com/*', 'host-permission:https://content.dropboxapi.com/*']);
  assert.ok(C.selectAll().indexOf('dropbox') >= 0);
});
ok('microsoft ticks collapse into one sign-in listing only the ticked services', () => {
  const r = C.stepsFor(['ms-todo', 'ms-mail', 'ms-todo']);
  assert.strictEqual(r.steps.length, 1); assert.deepStrictEqual(r.steps[0], { type: 'microsoft-signin', services: ['todo', 'mail'] });
});
ok('duplicates collapse', () => { assert.strictEqual(C.stepsFor(['notion', 'notion']).steps.length, 2); });
ok('no Send permission can appear for any selection', () => {
  assert.ok(!/send/i.test(JSON.stringify(C.stepsFor(C.selectAll()))));
});
ok('every microsoft entry maps to a real Outlook connect service', () => {
  const have = O.CONNECT_SERVICES.map((s) => s.id);
  C.all().filter((s) => s.group === 'microsoft').forEach((s) => assert.ok(have.indexOf(s.steps[0].service) >= 0, s.id));
});
ok('every entry has a valid state, group, label and a one-line detail; coming has no steps', () => {
  C.all().forEach((s) => {
    assert.ok(C.STATES.indexOf(s.state) >= 0, s.id); assert.ok(C.GROUPS.indexOf(s.group) >= 0, s.id);
    assert.ok(s.label && s.detail && s.detail.length < 200 && s.detail.indexOf('\n') < 0, s.id);
    if (s.state === 'coming') assert.strictEqual(s.steps.length, 0, s.id);
  });
});
ok('all() returns copies', () => { const a = C.all(); a[0].steps.push({ type: 'x' }); assert.strictEqual(C.all()[0].steps.length, 1); });
console.log('\n' + n + ' passed');
