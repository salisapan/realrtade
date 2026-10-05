// The Microsoft session over days, against a fake Microsoft that behaves like the real one for a single-page-application
// client: access tokens live an hour, a refresh token lives 24 hours from the sign-in that issued it and does NOT slide
// when used (AADSTS700084 after that), and only a new authorization code (interactive, or silent with prompt=none while the
// Microsoft sign-in cookie is still there) starts a new 24 hours.
//
// This is the "connection drops after ~24h" bug (2026-10-05): renewal ran only from the panel, any failed silent attempt
// was treated as "signed out" for good, and the worker handed an expired access token to the page. Every case runs on a
// fake clock; nothing here talks to a network.
//
// Run: node test/outlook-session-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');
const { FlowOutlookConfig: C } = require('../core/outlook-config.js');
const { FlowOutlook: O } = require('../src/outlook.js');
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
require('../core/intent-model.js').FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const CFG = Object.assign({}, C, { CLIENT_ID: '11111111-2222-3333-4444-555555555555' });
const REDIRECT = 'https://abc.chromiumapp.org/';

// ---- a fake Microsoft ---------------------------------------------------------------------------------------------
function microsoft(clock) {
  const ms = { rts: {}, seq: 0, cookie: true, down: false, codeGrants: 0, refreshGrants: 0, silentCalls: 0, silentError: null, calls: [] };
  function issue(familyStart) {
    const n = ++ms.seq;
    ms.rts['RT' + n] = familyStart;
    return { access_token: 'AT' + n, refresh_token: 'RT' + n, expires_in: 3600, scope: CFG.SCOPES.join(' '), _at: 'AT' + n, _issued: clock.now };
  }
  ms.validAccess = {};
  ms.fetch = async (url, init) => {
    const u = String(url);
    ms.calls.push(u.replace(/\?.*/, ''));
    if (ms.down) throw new Error('Failed to fetch');
    if (/\/oauth2\/v2\.0\/token$/.test(u)) {
      const p = new URLSearchParams(String(init && init.body || ''));
      if (ms.fivexx) return { ok: false, status: 503, json: async () => ({ error: 'temporarily_unavailable', error_description: 'AADSTS90033: busy' }) };
      if (p.get('grant_type') === 'authorization_code') {
        ms.codeGrants++;
        const t = issue(clock.now);
        ms.validAccess[t._at] = clock.now + HOUR;
        return { ok: true, status: 200, json: async () => t };
      }
      if (p.get('grant_type') === 'refresh_token') {
        ms.refreshGrants++;
        const start = ms.rts[p.get('refresh_token')];
        if (start === undefined || clock.now >= start + DAY) {
          return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'AADSTS700084: The refresh token was issued to a single page app (SPA), and therefore has a fixed, limited lifetime of 1.00:00:00, which cannot be extended.' }) };
        }
        const t = issue(start); // same 24 hours as the token it replaces
        ms.validAccess[t._at] = clock.now + HOUR;
        return { ok: true, status: 200, json: async () => t };
      }
    }
    if (/graph\.microsoft\.com/.test(u)) {
      const at = String((init && init.headers && init.headers.Authorization) || '').replace('Bearer ', '');
      if (ms.revoke === at || !(ms.validAccess[at] > clock.now)) return { ok: false, status: 401, json: async () => ({ error: { code: 'InvalidAuthenticationToken' } }), text: async () => '{}' };
      return { ok: true, status: 200, json: async () => ({ value: [] }), text: async () => '{"value":[]}' };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  // chrome.identity.launchWebAuthFlow({ interactive: false }) on the prompt=none URL.
  ms.launchSilent = async (url) => {
    ms.silentCalls++;
    if (ms.down) return { error: 'Authorization page could not be loaded.' };
    if (ms.silentError) return { error: ms.silentError };
    const q = new URL(url).searchParams;
    if (q.get('prompt') !== 'none') return { error: 'not silent' };
    if (!ms.cookie) return REDIRECT + '?error=login_required&error_description=' + encodeURIComponent('AADSTS50058: A silent sign-in request was sent but no user is signed in.') + '&state=' + q.get('state');
    return REDIRECT + '?code=C' + ms.silentCalls + '&state=' + q.get('state');
  };
  return ms;
}

function setup(over) {
  const clock = { now: new Date(2026, 9, 5, 9).getTime() };
  const ms = microsoft(clock);
  Object.assign(ms, over || {});
  const deps = {
    fetch: ms.fetch, now: () => clock.now, launchSilent: (u) => ms.launchSilent(u),
    random: (n) => crypto.randomBytes(n), sha256: async (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest()
  };
  return { clock, ms, deps };
}

async function signedIn(env) {
  const r = await A.signIn(Object.assign({}, env.deps, { launch: async (url) => REDIRECT + '?code=FIRST&state=' + new URL(url).searchParams.get('state') }), CFG, REDIRECT, {});
  return { token: r.token, account: { address: 'glance.salisapan@outlook.com', name: 'Glance' } };
}

(async () => {
  console.log('\n--- one session, step by step ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    check('sign-in stores an access token, a refresh token and when the 24 hours started', auth.token.accessToken && auth.token.refreshToken && auth.token.rtIssuedAt === env.clock.now, auth.token);
    const t0 = env.clock.now;

    env.clock.now = t0 + 30 * MIN;
    let r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('at 30 minutes the stored token is used as is (no network)', r.ok && r.how === 'fresh' && !r.changed && env.ms.refreshGrants === 0, r);

    env.clock.now = t0 + 2 * HOUR;
    r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('at 2 hours the access token has expired: one refresh, a new access token', r.ok && r.how === 'refresh' && r.changed && r.token.accessToken !== auth.token.accessToken, r);
    check('a refresh keeps the original 24 hours (SPA refresh tokens do not slide)', r.token.rtIssuedAt === t0, r.token);
    auth.token = r.token;

    env.clock.now = t0 + 17 * HOUR;
    r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('at hour 17 it renews silently (prompt=none, no window) and a new 24 hours starts', r.ok && r.how === 'silent' && r.token.rtIssuedAt === env.clock.now && env.ms.silentCalls === 1 && r.silentTried, r);
    auth.token = r.token;

    env.clock.now = t0 + 30 * HOUR;
    r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('at hour 30 (past the first 24) it still works, by refresh in the new window', r.ok && r.how === 'refresh', r);
  }

  console.log('\n--- what happens when a check is missed ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 25 * HOUR; // the computer slept through every renewal
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('at hour 25 with no renewal in between: no refresh attempt on a spent token, silent renewal instead', r.ok && r.how === 'silent' && env.ms.refreshGrants === 0, r);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    delete auth.token.rtIssuedAt; // a token stored by an older version: its age is unknown
    env.clock.now += 25 * HOUR;
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('a token of unknown age refused with AADSTS700084 is renewed silently, not dropped', r.ok && r.how === 'silent' && env.ms.refreshGrants === 1, r);
  }

  console.log('\n--- failures that are NOT a sign-out ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 17 * HOUR;
    env.ms.silentError = 'Authorization page could not be loaded.';
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('a silent attempt that fails for a technical reason at hour 17: the token still works, nothing is lost', r.ok && r.silentTried && (r.how === 'refresh' || r.how === 'fresh'), r);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 17 * HOUR;
    env.ms.cookie = false; // Microsoft says a person must sign in
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('even "login_required" at hour 17 is not a sign-out while the refresh token still has hours left', r.ok && r.silentTried, r);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 2 * HOUR;
    env.ms.down = true;
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('offline with an expired access token: a transient failure, not "sign in again"', !r.ok && r.transient && !r.needsSignIn, r);
    env.ms.down = false;
    const r2 = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('back online: the next check simply works', r2.ok && r2.how === 'refresh', r2);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 2 * HOUR;
    env.ms.fivexx = true;
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('Microsoft answering 503 is transient too', !r.ok && r.transient && !r.needsSignIn, r);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 25 * HOUR;
    env.ms.silentError = 'Authorization page could not be loaded.';
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('spent refresh token + a technical silent failure: transient (retried in 30 minutes), not signed out', !r.ok && r.transient && !r.needsSignIn, r);
    const soon = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT, lastSilentAt: env.clock.now });
    check('and it does not hammer the sign-in page: no second silent attempt within 30 minutes', env.ms.silentCalls === 1 && !soon.ok, { calls: env.ms.silentCalls });
    env.ms.silentError = null;
    env.clock.now += 31 * MIN;
    const later = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT, lastSilentAt: env.clock.now - 31 * MIN });
    check('31 minutes later it tries again and the session is back', later.ok && later.how === 'silent', later);
  }

  console.log('\n--- the one honest sign-out ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 25 * HOUR;
    env.ms.cookie = false;
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('refresh token spent AND Microsoft says a person must sign in: needsSignIn', !r.ok && r.needsSignIn && r.error === 'login_required', r);
  }
  {
    const env = setup();
    const auth = await signedIn(env);
    env.clock.now += 25 * HOUR;
    env.ms.silentError = 'User interaction required.'; // Chrome's own message for a non-interactive flow that needs a window
    const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT });
    check('Chrome\'s "User interaction required." on the silent flow counts as login_required', !r.ok && r.needsSignIn, r);
  }

  console.log('\n--- three days with the background keep-alive (every 30 minutes) ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    let lastSilentAt = null, signOuts = 0, failuresSeen = 0, silentRenewals = 0, maxRtAge = 0;
    for (let t = 0; t <= 3 * DAY; t += 30 * MIN) {
      env.clock.now = auth.token.rtIssuedAt && t === 0 ? env.clock.now : env.clock.now + 30 * MIN;
      // An hour of no network every afternoon, and the sign-in page failing once on day 2.
      env.ms.down = (t % DAY) >= 14 * HOUR && (t % DAY) < 15 * HOUR;
      env.ms.silentError = (t >= 40 * HOUR && t < 41 * HOUR) ? 'Authorization page could not be loaded.' : null;
      const r = await A.session(env.deps, CFG, auth, { redirectUri: REDIRECT, lastSilentAt });
      if (r.silentTried) lastSilentAt = env.clock.now;
      if (r.ok && r.changed) auth.token = r.token;
      if (r.ok && r.how === 'silent') silentRenewals++;
      if (!r.ok) failuresSeen++;
      if (r.needsSignIn) signOuts++;
      maxRtAge = Math.max(maxRtAge, env.clock.now - auth.token.rtIssuedAt);
    }
    check('72 hours, with daily network drops and a failing sign-in page: never "sign in again"', signOuts === 0, { signOuts, failuresSeen });
    check('the refresh window never runs out (oldest refresh token stayed under 24 hours)', maxRtAge < DAY, { hours: maxRtAge / HOUR });
    check('it renewed silently about every 16 hours (3 to 6 times in 72 hours)', silentRenewals >= 3 && silentRenewals <= 6, { silentRenewals });
    // the final token is usable against Graph
    const g = await env.ms.fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + auth.token.accessToken } });
    check('and at the end Graph accepts the token', g.status === 200 || env.ms.validAccess[auth.token.accessToken] > env.clock.now - 5 * MIN, g.status);
  }

  console.log('\n--- the panel and page runner (src/outlook.js): retry on 401, survives a worker restart ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    const store = { outlookAuth: auth, outlookSync: {} };
    const storage = {
      get: async () => JSON.parse(JSON.stringify(store)), set: async (p) => { Object.assign(store, JSON.parse(JSON.stringify(p))); },
      getWatches: async () => [], getIdentityGraph: async () => I.empty(), observeIdentity: async () => ({ pid: null }),
      updateWatch: async () => null, upsertWatch: async (x) => x, recordOutcomeLabel: async () => true
    };
    const graphFetch = async (url, init) => {
      const u = String(url);
      if (/graph\.microsoft\.com\/v1\.0\/me\?/.test(u)) {
        const res = await env.ms.fetch(url, init);
        if (res.status !== 200) return res;
        return { ok: true, status: 200, json: async () => ({ mail: 'glance.salisapan@outlook.com', displayName: 'Glance' }) };
      }
      return env.ms.fetch(url, init);
    };
    const runnerDeps = () => ({
      storage, cfg: CFG, auth: A, plan: S.plan, fetch: graphFetch, redirectUri: () => REDIRECT,
      launch: async () => null, launchSilent: (u) => env.ms.launchSilent(u), actions: null,
      permissions: { request: async () => true, contains: async () => true, remove: async () => true },
      send: async () => ({ ok: true }), random: (n) => crypto.randomBytes(n),
      sha256: async (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest(), now: () => env.clock.now,
      planDeps: { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline }, identity: I, followUp: F
    });
    env.clock.now += 10 * MIN;
    env.ms.revoke = auth.token.accessToken; // Microsoft refuses a token that still looks fresh (revoked, password change, ...)
    const o = O.create(runnerDeps());
    const r = await o.sync({ force: true });
    check('a 401 on a token that looks fresh: one forced refresh and the check goes through', r.ok && env.ms.refreshGrants === 1, r);
    check('the new token is written to storage at once', store.outlookAuth.token.accessToken !== auth.token.accessToken, store.outlookAuth.token);
    // A brand-new runner (the service worker was stopped and started) reads the same storage and needs no new sign-in.
    env.clock.now += 2 * HOUR;
    const o2 = O.create(runnerDeps());
    const r2 = await o2.sync({ force: true });
    check('after a worker restart the stored refresh token carries on (no sign-in window)', r2.ok && !store.outlookSync.needsSignIn, { r2, st: store.outlookSync });
    env.clock.now += 16 * HOUR;
    const k = await O.create(runnerDeps()).keepAlive();
    check('keepAlive at hour 18 renews silently and records when', k && k.ok && store.outlookSync.lastRenewedAt === env.clock.now, { k, st: store.outlookSync });
  }

  console.log('\n--- the background worker (src/background.js) ---\n');
  {
    const env = setup();
    const auth = await signedIn(env);
    const stored = { outlookAuth: auth, outlookSync: {} };
    const alarms = [];
    const flows = [];
    const sandbox = {
      console, URLSearchParams, URL, TextEncoder, Uint8Array, crypto: crypto.webcrypto,
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      fetch: env.ms.fetch,
      Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(env.clock.now); } static now() { return env.clock.now; } },
      chrome: {
        runtime: { getManifest: () => ({ oauth2: { client_id: 'x.apps.googleusercontent.com' }, version: '0' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
        identity: {
          getAuthToken: (o, cb) => cb(null), removeCachedAuthToken: (o, cb) => cb(), getRedirectURL: () => REDIRECT,
          launchWebAuthFlow: (opts, cb) => {
            flows.push(opts);
            env.ms.launchSilent(opts.url).then((r) => {
              if (r && r.error) { sandbox.chrome.runtime.lastError = { message: r.error }; cb(undefined); sandbox.chrome.runtime.lastError = null; } else cb(r);
            });
          }
        },
        storage: { local: { get: async (k) => { const o = JSON.parse(JSON.stringify(stored)); if (typeof k === 'string') return { [k]: o[k] }; if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = o[x]; }); return r; } return o; }, set: async (p) => { Object.assign(stored, JSON.parse(JSON.stringify(p))); }, remove: async () => {} }, onChanged: { addListener() {} } },
        windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {}, query: async () => [] },
        alarms: { create: (name, o) => alarms.push({ name, o }), onAlarm: { addListener() {} } },
        contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } },
        permissions: { contains: async () => false }, scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} }
      }
    };
    sandbox.self = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
    const fn = (n) => vm.runInContext(n, sandbox);
    check('the worker has its own Outlook keep-alive alarm, every 30 minutes', fn('OUTLOOK_KEEPALIVE_ALARM') === 'glance-outlook-keepalive' && fn('OUTLOOK_KEEPALIVE_MINUTES') === 30);
    fn('scheduleOutlookKeepAlive')();
    check('scheduling it creates the alarm (alarms survive the worker being stopped)', alarms.some((a) => a.name === 'glance-outlook-keepalive' && a.o.periodInMinutes === 30), alarms);

    env.clock.now += 2 * HOUR;
    const res = await fn('outlookFetch')('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages', {});
    check('two hours later a Graph call from the worker refreshes first, never sends an expired token', res.status === 200 && env.ms.refreshGrants === 1, res.status);

    env.ms.revoke = stored.outlookAuth.token.accessToken;
    const res2 = await fn('outlookFetch')('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages', {});
    check('a 401 from Graph: forced refresh and one retry', res2.status === 200 && env.ms.refreshGrants === 2, res2.status);

    env.clock.now += 15 * HOUR;
    const k = await fn('outlookKeepAlive')();
    check('the keep-alive at hour 17 renews silently through launchWebAuthFlow with interactive:false', k.ok && k.how === 'silent' && flows.length === 1 && flows[0].interactive === false && /prompt=none/.test(flows[0].url), { k, flows });
    check('and stores the new 24 hours and when it renewed', stored.outlookAuth.token.rtIssuedAt === env.clock.now && stored.outlookSync.lastRenewedAt === env.clock.now, stored.outlookSync);

    env.clock.now += 25 * HOUR;
    env.ms.cookie = false;
    const k2 = await fn('outlookKeepAlive')();
    check('only when the window is spent AND Microsoft wants a person does the row say "sign in again"', !k2.ok && stored.outlookSync.needsSignIn === true, stored.outlookSync);
    env.ms.cookie = true;
    env.clock.now += 31 * MIN;
    const k3 = await fn('outlookKeepAlive')();
    check('if the Microsoft session comes back, the next keep-alive clears it without a click', k3.ok && stored.outlookSync.needsSignIn === false, stored.outlookSync);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
