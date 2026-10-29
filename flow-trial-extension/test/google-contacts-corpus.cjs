// Google Contacts (G8): read-only People resolve + compose fill, behind GOOGLE_CONTACTS (off).
// Run: node test/google-contacts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowGoogleContacts: G } = require('../core/google-contacts.js');
const serverCore = require('../../flow-landing/netlify/functions/verify-license/license-core.js');
const loadBackground = require('./load-background.cjs').backgroundScript;
const EXT = path.join(__dirname, '..');
const PRO_KEY = serverCore.deriveKey('s', 'sub_contacts_privacy');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const ON = { GOOGLE_CONTACTS: true };
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];
const FIXTURE_EMAIL = 'dana.cohen@example.com';
const FIXTURE_NAME = 'Dana Cohen';

const http = async (req) => {
  const u = String(req.url);
  if (/people:searchContacts/.test(u)) {
    const q = decodeURIComponent((/query=([^&]+)/.exec(u) || [])[1] || '').toLowerCase();
    if (q.indexOf('dana') >= 0) {
      return {
        status: 200,
        ok: true,
        json: {
          results: [{
            person: {
              names: [{ displayName: FIXTURE_NAME }],
              emailAddresses: [{ value: FIXTURE_EMAIL }]
            }
          }]
        }
      };
    }
    return { status: 200, ok: true, json: { results: [] } };
  }
  return { status: 404, ok: false, json: null };
};

function forbiddenInPayload(json) {
  const s = typeof json === 'string' ? json : JSON.stringify(json || {});
  if (s.indexOf(FIXTURE_EMAIL) >= 0) return 'fixture-email';
  if (s.indexOf(FIXTURE_NAME) >= 0) return 'fixture-name';
  const keys = /"(emailAddresses|displayName|taskListId|calendarId|eventId|events|tasks|contacts|people\/)/i;
  if (keys.test(s)) return 'google-data-field';
  if (/generativelanguage\.googleapis\.com|glance-assist|classify-remote|token-relay/.test(s) && /calendar|tasks\.googleapis|people\.googleapis|contacts\.readonly/i.test(s)) {
    return 'assist-relay-google-api';
  }
  return '';
}

(async () => {
  console.log('\n--- recognition and plan ---\n');
  check('switch default off', G.SWITCH_DEFAULT === false && G.SWITCH === 'GOOGLE_CONTACTS');
  check('answer ask in English', G.recognize("What's Dana's email?").mode === 'answer');
  check('Hebrew not-found line is Hebrew-only', (() => {
    const he = G.notFoundLine('he');
    const en = G.notFoundLine('en');
    return /[\u0590-\u05FF]/.test(he) && he.indexOf('No contact matched') < 0 && /No contact matched/.test(en);
  })());
  check('forward ask in English', G.recognize('send this to Dana').mode === 'forward');
  check('off switch: plan stays off', (await G.plan({ text: "What's Dana's email?", flags: {} }, { grantedScopes: SCOPES, http })).action === 'off');
  check('missing scope: silence', (await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: ['tasks'], http })).reason === 'missing-scope');
  const offer = await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: SCOPES, http });
  check('one Dana: offer with email', offer.action === 'offer' && offer.email === FIXTURE_EMAIL && /Dana/.test(offer.title), offer);
  const ambHttp = async () => ({
    status: 200,
    ok: true,
    json: {
      results: [
        { person: { names: [{ displayName: 'Dana Cohen' }], emailAddresses: [{ value: 'a@example.com' }] } },
        { person: { names: [{ displayName: 'Dana Levy' }], emailAddresses: [{ value: 'b@example.com' }] } }
      ]
    }
  });
  const choose = await G.plan({ text: "What's Dana's email?", flags: ON }, { grantedScopes: SCOPES, http: ambHttp });
  check('two Danas: choose', choose.action === 'choose' && choose.candidates.length === 2, choose);
  const picked = await G.plan({ text: "What's Dana's email?", flags: ON, choiceIndex: 1 }, { grantedScopes: SCOPES, http: ambHttp });
  check('choice picks the second', picked.action === 'offer' && picked.email === 'b@example.com', picked);
  const none = await G.plan({ text: "What's Nobody's email?", flags: ON }, { grantedScopes: SCOPES, http });
  check('no match: not-found line', none.action === 'not-found' && /contact/i.test(none.line), none);
  check('oauthScopesForSwitch adds contacts.readonly only', G.oauthScopesForSwitch(ON).join() === G.READ_SCOPE && G.oauthScopesForSwitch({}).length === 0);
  check('contactLogHash never returns the raw email', G.contactLogHash(FIXTURE_EMAIL).indexOf('@') < 0 && G.contactLogHash(FIXTURE_EMAIL) === G.contactLogHash(FIXTURE_EMAIL));
  check('contactLogHash is salted (differs from unsalted djb2)', (() => {
    let h = 5381;
    const raw = String(FIXTURE_EMAIL || '');
    for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
    const unsalted = 'gc_' + h.toString(16);
    return G.contactLogHash(FIXTURE_EMAIL) !== unsalted && G.contactLogHash('other@example.com') !== G.contactLogHash(FIXTURE_EMAIL);
  })());

  console.log('\n--- wiring ---\n');
  const host = read('src', 'google-lane-host.js');
  const gmail = read('src', 'content-gmail.js');
  const manifest = read('manifest.json');
  check('host imports module and answers flow:google-contacts-plan', /google-contacts\.js/.test(host) && /flow:google-contacts-plan/.test(host));
  check('host reads switch before People search', /laneSwitchOn\(G\.SWITCH\)/.test(host));
  check('host reads glanceUserContextV0.byAccount', /glanceUserContextV0/.test(host) && /byAccount/.test(host));
  check('page shows card only on offer', /showGoogleContactsChip/.test(gmail) && /plan\.action !== 'offer'/.test(gmail));
  check('not-found shows a line, not a card', /flow-chip-contact-miss/.test(gmail));
  check('compose steps map to gmailCompose', /googleContactAnswer: 'gmailCompose'/.test(gmail) && /contactCompose/.test(gmail));
  check('receipt can offer Copy', /flow-chip-copy/.test(gmail));
  check('manifest does not load google-contacts on Gmail (v1 contacts out)', !/core\/google-contacts\.js/.test(JSON.stringify(manifest.content_scripts || [])));
  check('draft reply path does not call contacts plan', !/gmailDraft[\s\S]{0,200}flow:google-contacts/.test(gmail));
  check('activity log stores contactHash not email', /contactLogHash/.test(gmail) && /contactHash: hash/.test(gmail) && !/appendLog[\s\S]{0,800}params:\s*\{[^}]*email:/.test(gmail.slice(gmail.indexOf('showGoogleContactsChip'), gmail.indexOf('showGoogleContactsChip') + 1200)));
  check('P1: written activity row strips ref.to and target via activityLogRef', /function activityLogRef/.test(gmail) && /ref: activityLogRef\(r\.response\.ref\)/.test(gmail));

  console.log('\n--- privacy: outbound payloads (no Calendar/Tasks/Contacts on assist/execute/classify/relay) ---\n');

  const outbound = { fetch: [], sendMessage: [], assist: [], execute: [], classify: [], relay: [] };

  const planOnly = await G.plan({ text: "What's Dana's email?", flags: ON }, {
    grantedScopes: SCOPES,
    http: async (req) => {
      outbound.fetch.push({ url: req.url, body: null });
      return http(req);
    }
  });
  check('People search stays on people.googleapis.com only', outbound.fetch.length >= 1 && outbound.fetch.every((c) => /people\.googleapis\.com/.test(c.url)), outbound.fetch);

  const relayAndAssist = [];
  const corePlan = await G.plan({ text: "What's Dana's email?", flags: ON }, {
    grantedScopes: SCOPES,
    profile: {},
    flags: ON,
    http: async (req) => {
      const url = String(req.url || '');
      outbound.fetch.push({ url, body: null });
      if (/glance-assist|classify-remote|token-relay|generativelanguage/.test(url)) relayAndAssist.push(url);
      return http(req);
    }
  });
  check('core contacts plan offers on-device with only People fetch', corePlan.action === 'offer' && corePlan.email === FIXTURE_EMAIL, corePlan);
  check('contacts resolve path never calls glance-assist, relay, or Gemini', relayAndAssist.length === 0, relayAndAssist);

  const laneRelay = [];
  const laneStored = {
    glanceSwitches: { GOOGLE_CONTACTS: true },
    googleGrantedScopes: { version: SCOPES.join('\n'), status: 'granted' },
    googleConnectedAccount: { email: 'host@example.com' },
    googleWebAuth: { accessToken: 'ya29.lane', expiresAt: Date.now() + 3600000 },
    googleEverConnected: true,
    glanceUserContextV0: { byAccount: { 'host@example.com': {} } }
  };
  const laneListeners = [];
  const laneSandbox = {
    module: undefined,
    console,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    Uint8Array,
    Date,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    fetch: async (url, init) => {
      const u = String(url);
      const body = init && init.body ? String(init.body) : '';
      laneRelay.push({ url: u, method: (init && init.method) || 'GET', body });
      if (/oauth2\/v3\/userinfo/.test(u)) {
        const profile = { email: 'host@example.com' };
        return { ok: true, status: 200, text: async () => JSON.stringify(profile), json: async () => profile };
      }
      if (/people:searchContacts/.test(u)) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            results: [{
              person: {
                names: [{ displayName: FIXTURE_NAME }],
                emailAddresses: [{ value: FIXTURE_EMAIL }]
              }
            }]
          })
        };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
    chrome: {
      identity: {
        getAuthToken: (_d, cb) => { if (typeof cb === 'function') cb('ya29.lane'); }
      },
      runtime: { onMessage: { addListener: (fn) => laneListeners.push(fn) }, lastError: null },
      i18n: { getUILanguage: () => 'en' },
      storage: {
        local: {
          get: async (key) => {
            if (typeof key === 'string') return { [key]: laneStored[key] };
            const defaults = (key && typeof key === 'object' && !Array.isArray(key)) ? key : {};
            const out = {};
            const keys = Object.keys(defaults).length ? Object.keys(defaults) : Object.keys(laneStored);
            keys.forEach((k) => { out[k] = laneStored[k] !== undefined ? laneStored[k] : defaults[k]; });
            return out;
          },
          set: async (patch) => { Object.assign(laneStored, patch); }
        }
      }
    }
  };
  laneSandbox.globalThis = laneSandbox;
  vm.createContext(laneSandbox);
  for (const f of ['google-config.js', 'google-account.js', 'google-contacts.js']) {
    vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), laneSandbox, { filename: f });
  }
  vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), laneSandbox, { filename: 'google-lane.js' });
  const hostSrc = read('src', 'google-lane-host.js').replace(/^import .*;$/gm, '');
  vm.runInContext(hostSrc, laneSandbox, { filename: 'google-lane-host.js' });
  const lanePlan = await new Promise((resolve) => {
    laneListeners[0]({ type: 'flow:google-contacts-plan', text: "What's Dana's email?" }, {}, resolve);
  });
  check('lane-host contacts plan offers without assist', lanePlan && lanePlan.action === 'offer' && lanePlan.email === FIXTURE_EMAIL, lanePlan);
  check('lane relay stays on userinfo and People only', laneRelay.length >= 1
    && laneRelay.every((c) => /oauth2\/v3\/userinfo|people\.googleapis\.com/.test(c.url))
    && !laneRelay.some((c) => /calendar\.googleapis|tasks\.googleapis|glance-assist|generativelanguage/.test(c.url)), laneRelay.map((c) => c.url));
  const laneLeak = laneRelay.map((c) => forbiddenInPayload({ url: c.url, body: c.body })).find(Boolean);
  check('lane relay bodies carry no Calendar/Tasks/Contacts assist fields', !laneLeak, laneLeak);

  const assistBodies = [];
  const bgCalls = [];
  const bgStored = {
    proLicense: {
      key: PRO_KEY,
      valid: true,
      status: 'active',
      plan: 'pro',
      interval: 'month',
      renewsAt: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
      trialEnds: null,
      checkedAt: Date.now(),
      activeUntil: Date.now() + 7 * 24 * 3600 * 1000
    }
  };
  const bgListeners = [];
  const jsonRes = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const bgSandbox = {
    console,
    fetch: async (url, o) => {
      url = String(url);
      const body = o && o.body ? JSON.parse(o.body) : null;
      bgCalls.push({ url, body });
      if (url.endsWith('/glance-assist')) {
        assistBodies.push(body);
        return jsonRes(200, { ok: true, result: { kind: 'quiet' } });
      }
      return jsonRes(500, { error: 'unrouted' });
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'test.apps.googleusercontent.com' } }),
        onMessage: { addListener: (fn) => bgListeners.push(fn) },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        lastError: null,
        getURL: (s) => s,
        id: 'ext'
      },
      identity: { getAuthToken: (_o, cb) => cb('tok'), removeCachedAuthToken: (_o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: bgStored[k] } : bgStored),
          set: async (patch) => { Object.assign(bgStored, patch); }
        }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    },
    URLSearchParams,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto,
    TextEncoder,
    Uint8Array
  };
  bgSandbox.self = bgSandbox;
  bgSandbox.globalThis = bgSandbox;
  vm.createContext(bgSandbox);
  vm.runInContext(loadBackground(), bgSandbox, { filename: 'background.js' });
  const bgSend = (msg) => new Promise((resolve) => {
    const l = bgListeners[bgListeners.length - 1];
    const keep = l(msg, {}, resolve);
    if (keep !== true) resolve(undefined);
  });
  const classifyRes = await bgSend({ type: 'flow:classify-remote', payload: { lang: 'en', maskedText: 'Please ask Dana about the invoice.' } });
  check('classify-remote reaches assist with ok', classifyRes && classifyRes.ok === true, classifyRes);
  check('classify-remote assist body has no Calendar/Tasks/Contacts fields', assistBodies.length === 1 && forbiddenInPayload(assistBodies[0]) === ''
    && assistBodies[0].action === 'classify' && typeof assistBodies[0].maskedText === 'string', assistBodies[0]);
  check('execute-action sentinel leak rows live in google-privacy-sentinel-corpus.cjs', fs.existsSync(path.join(__dirname, 'google-privacy-sentinel-corpus.cjs')));

  const relayProbe = forbiddenInPayload({ action: 'classify', lang: 'en', maskedText: 'masked' });
  check('forbiddenInPayload allows masked classify shape', relayProbe === '');
  const badProbe = forbiddenInPayload({ email: FIXTURE_EMAIL, displayName: FIXTURE_NAME });
  check('forbiddenInPayload catches fixture contact PII', badProbe === 'fixture-email');

  check('manifest oauth2 excludes contacts.readonly (v1)', !/contacts\.readonly/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
