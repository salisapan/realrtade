// Who the popup is allowed to offer.
//
// Google (mvp) is the front door: Tasks, Calendar, Gmail drafts, Drive read.
// Notion stays in the catalog and is not a setup card. HubSpot, Salesforce,
// Slack, and Monday.com stay hidden while the client id is empty, YOUR_*,
// or REPLACE_WITH_*. Pipedrive stays hidden rather than "Needs setup".
//
// Run: node test/connector-visibility-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FLOW_CONNECTORS, clientIdConfigured, connectorShownInPopup } = require('../core/connectors.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function byId(id) {
  return FLOW_CONNECTORS.find((c) => c.id === id);
}

console.log('--- client id placeholders ---\n');
check('empty is unset', clientIdConfigured('') === false);
check('blank is unset', clientIdConfigured('  ') === false);
check('YOUR_ is unset', clientIdConfigured('YOUR_HUBSPOT_CLIENT_ID') === false);
check('REPLACE_WITH_ is unset', clientIdConfigured('REPLACE_WITH_SLACK_CLIENT_ID') === false);
check('a real id is set', clientIdConfigured('1234-abc.apps.googleusercontent.com') === true);

console.log('\n--- popup visibility on v0.7.0 ---\n');
const unset = { configured: false, connected: false };
const set = { configured: true, connected: false };
check('Google shows when its client id is set', connectorShownInPopup(byId('googleTasks'), set) === true);
check('Google still shows if status has not arrived', connectorShownInPopup(byId('googleTasks'), {}) === true);
check('Google hides when this build reports the client id unset', connectorShownInPopup(byId('googleTasks'), { configured: false, connected: false }) === false);
check('Notion is not an onboarding card', connectorShownInPopup(byId('notion'), { configured: true, connected: false }) === false);
check('HubSpot hidden while unset', connectorShownInPopup(byId('hubspot'), unset) === false);
check('Salesforce hidden while unset', connectorShownInPopup(byId('salesforce'), unset) === false);
check('Slack hidden while unset', connectorShownInPopup(byId('slack'), unset) === false);
check('Monday hidden while unset', connectorShownInPopup(byId('monday'), unset) === false);
check('Pipedrive is not shown as Needs setup', connectorShownInPopup(byId('pipedrive'), {}) === false);
check('a configured HubSpot id does not put it on the MVP screen', connectorShownInPopup(byId('hubspot'), set) === false);
check('a connected HubSpot card stays so Disconnect works', connectorShownInPopup(byId('hubspot'), { configured: false, connected: true }) === true);

const hubspotAsMvp = Object.assign({}, byId('hubspot'), { mvp: true });
check('marking HubSpot mvp does not show it before the client id is real', connectorShownInPopup(hubspotAsMvp, unset) === false);
check('a real HubSpot client id can return to onboarding once it is also mvp', connectorShownInPopup(hubspotAsMvp, set) === true);

console.log('\n--- placeholders in the tree, no invented ids ---\n');
const background = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
for (const name of ['HUBSPOT_CLIENT_ID', 'SALESFORCE_CLIENT_ID', 'SLACK_CLIENT_ID', 'MONDAY_CLIENT_ID']) {
  check(name + ' is still a YOUR_ placeholder', background.includes("const " + name + " = 'YOUR_" + name + "'"));
  check(name + ' configured flag uses oauthClientConfigured', background.includes('oauthClientConfigured(' + name + ')'));
}
check('background treats REPLACE_WITH_ as unset', background.includes('/^(YOUR_|REPLACE_WITH_)/'));

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const googleId = manifest.oauth2 && manifest.oauth2.client_id;
check('manifest version is 0.7.0', manifest.version === '0.7.0');
check('Google client id is not the YOUR_ placeholder', Boolean(googleId) && googleId !== 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com' && !/^(YOUR_|REPLACE_WITH_)/.test(googleId));
const picker = fs.readFileSync(path.join(__dirname, '..', 'picker', 'picker.js'), 'utf8');
check('Drive picker key is still the owner placeholder', picker.includes("const GOOGLE_PICKER_API_KEY = 'YOUR_GOOGLE_PICKER_API_KEY'"));

console.log('\n--- install copy names Google, not HubSpot ---\n');
const email = fs.readFileSync(path.join(__dirname, '..', '..', 'flow-landing', 'netlify', 'functions', 'send-trial-access', 'send-trial-access.js'), 'utf8');
check('install email signs in with Google', email.includes('sign in with Google'));
check('install email names Calendar', email.includes('Calendar'));
check('install email does not say connect HubSpot', !email.includes('HubSpot'));
check('install email does not say connect Notion', !email.includes('Notion'));
const trial = fs.readFileSync(path.join(__dirname, '..', '..', 'flow-landing', 'trial.html'), 'utf8');
check('trial install step names Calendar', trial.includes('Calendar event'));
const storeDoc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'chrome-web-store-submission.md'), 'utf8');
check('store draft says the listing is not live', storeDoc.includes('**not** on the Chrome Web Store'));
check('store draft does not tell the owner to upload the old popup shot', storeDoc.includes('Do not upload'));

console.log('\n--- popup.js renders that filter ---\n');

function makeNode(tag) {
  return {
    tagName: tag, className: '', id: '', textContent: '', hidden: false, children: [], listeners: {}, style: {}, dataset: {}, attrs: {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    replaceChildren(...cs) { this.children = cs; for (const c of cs) c.parentNode = this; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
    querySelectorAll: () => [],
    querySelector(sel) {
      const cls = String(sel || '').replace(/^\./, '');
      const walk = (n) => {
        if (String(n.className || '').split(/\s+/).includes(cls)) return n;
        for (const c of n.children || []) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(this);
    },
    click() {}
  };
}

function textOf(node) {
  let t = '';
  const walk = (n) => { t += n.textContent || ''; for (const c of n.children || []) walk(c); };
  walk(node);
  return t;
}

function loadPopup(status) {
  const byId = new Map();
  const document = {
    getElementById(id) {
      if (!byId.has(id)) {
        const n = makeNode('div');
        n.id = id;
        if (id === 'connector-empty') n.hidden = true;
        byId.set(id, n);
      }
      return byId.get(id);
    },
    querySelectorAll: () => [],
    createElement: (t) => makeNode(t)
  };
  const sandbox = {
    module: undefined, console, document,
    chrome: {
      storage: { local: {
        get: (keys, cb) => {
          const isString = typeof keys === 'string';
          const names = isString ? [keys] : Object.keys(keys);
          const result = {};
          for (const k of names) result[k] = isString ? undefined : keys[k];
          if (cb) { cb(result); return; }
          return Promise.resolve(result);
        },
        set: (_patch, cb) => { if (cb) cb(); return Promise.resolve(); }
      } },
      runtime: {
        sendMessage: (msg, cb) => { if (cb) cb(msg && msg.type === 'flow:connector-status' ? status : { ok: true }); }
      }
    },
    crypto: { randomUUID: () => 'test-uuid' },
    navigator: { clipboard: { writeText: async () => {} } },
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    setTimeout, clearTimeout
  };
  vm.createContext(sandbox);
  const root = path.join(__dirname, '..');
  const order = [
    'core/domains.js', 'core/connectors.js', 'core/extract.js', 'core/judgment.js',
    'src/storage.js', 'core/actions.js', 'core/execution-memory.js', 'src/chrome-storage-adapter.js',
    'popup/popup.js'
  ];
  for (const rel of order) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  }
  return document;
}

(async function run() {
  const shown = loadPopup({
    googleTasks: { connected: false, configured: true },
    notion: { connected: false, configured: true },
    hubspot: { connected: false, configured: false },
    salesforce: { connected: false, configured: false },
    slack: { connected: false, configured: false },
    monday: { connected: false, configured: false }
  });
  await new Promise((r) => setTimeout(r, 0));
  const list = textOf(shown.getElementById('connector-list'));
  check('popup lists Google', list.includes('Google'));
  check('popup does not list HubSpot', !list.includes('HubSpot'));
  check('popup does not list Salesforce', !list.includes('Salesforce'));
  check('popup does not list Slack', !list.includes('Slack'));
  check('popup does not list Monday', !list.includes('Monday'));
  check('popup does not list Notion', !list.includes('Notion'));
  check('popup does not list Pipedrive', !list.includes('Pipedrive'));
  check('popup does not say Needs setup', !list.includes('Needs setup'));
  check('Google card says Works now when the client id is set', list.includes('Works now'));
  check('empty state stays hidden while Google is listed', shown.getElementById('connector-empty').hidden === true);

  const unconfigured = loadPopup({ googleTasks: { connected: false, configured: false } });
  await new Promise((r) => setTimeout(r, 0));
  const bare = textOf(unconfigured.getElementById('connector-list'));
  check('an unset Google client id is not offered as a card', bare.trim() === '' && !bare.includes('Works now'), bare);
  check('the empty state names Google sign-in', unconfigured.getElementById('connector-empty').hidden === false);
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.html'), 'utf8');
  check('the empty state names Calendar', popupHtml.includes('Tasks, Calendar, and Gmail drafts'));

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
})();
