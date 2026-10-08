// Google connect: getAuthToken stays primary. launchWebAuthFlow is the
// fallback when browser sign-in is off (and the same class of identity
// failure on Brave/Edge). These cases assert the decision, the redirect
// parse, and that Disconnect clears both token stores.
//
// Run: node test/google-web-auth-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const WEB_CLIENT = '93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com';
const CHROME_CLIENT = '93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com';
const EXTENSION_ID = 'dnjhplgmnkabbjogfpbhofjedlkehkai';
const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
];
const SIGNIN_OFF = 'The user turned off browser signin';
const USER_CANCEL = 'The user did not approve access.';

function stripModuleSyntax(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
}

function loadPure() {
  const src = stripModuleSyntax(fs.readFileSync(path.join(__dirname, '..', 'src', 'google-web-auth.js'), 'utf8'));
  const sandbox = { URL, URLSearchParams, decodeURIComponent, Date };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__api = { isUserCancelMessage, shouldFallbackFromGetAuthToken, googleRedirectUriForExtension, googleOAuthScopesFrom, googleImplicitAuthUrl, parseGoogleImplicitRedirect, webTokenUsable, googleConnectErrorMessage, GOOGLE_OAUTH_SCOPES, GOOGLE_WEB_AUTH_STORAGE_KEY };', sandbox, { filename: 'google-web-auth.js' });
  return sandbox.__api;
}

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function load(opts) {
  opts = opts || {};
  const calls = [];
  const tokens = [];
  const pendingWebFlows = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || {}));
  let tokenSeq = 0;
  let onMessageListener = null;
  const runtime = {
    getManifest: () => ({
      oauth2: {
        client_id: opts.chromeClientId || CHROME_CLIENT,
        scopes: opts.scopes || SCOPES.slice()
      }
    }),
    onMessage: { addListener(fn) { onMessageListener = fn; } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    lastError: null,
    getURL: (s) => s,
    id: opts.extensionId || EXTENSION_ID
  };

  function failCallback(message, cb) {
    runtime.lastError = { message };
    cb(undefined);
    runtime.lastError = null;
  }

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    decodeURIComponent,
    fetch: async (url, options) => {
      const method = (options && options.method) || 'GET';
      calls.push(method + ' ' + String(url));
      const auth = options && options.headers && options.headers.Authorization;
      if (auth) tokens.push(String(auth).replace('Bearer ', ''));
      for (const [match, answer] of opts.routes || []) {
        if (match.test(String(url)) && (!answer.method || answer.method === method)) return answer.reply;
      }
      return res(500, { error: { message: 'unrouted' } });
    },
    chrome: {
      runtime,
      identity: {
        getAuthToken: (o, cb) => {
          calls.push('GET_AUTH ' + Boolean(o && o.interactive));
          if (opts.getAuthTokenError) {
            failCallback(typeof opts.getAuthTokenError === 'function' ? opts.getAuthTokenError(o) : opts.getAuthTokenError, cb);
            return;
          }
          cb(opts.chromeToken || ('chrome-tok-' + (++tokenSeq)));
        },
        removeCachedAuthToken: (o, cb) => {
          calls.push('EVICT ' + o.token);
          if (cb) cb();
        },
        clearAllCachedAuthTokens: (cb) => {
          calls.push('CLEAR_ALL');
          if (cb) cb();
        },
        getRedirectURL: opts.omitGetRedirectURL ? undefined : () => {
          calls.push('REDIRECT_URL');
          return 'https://' + runtime.id + '.chromiumapp.org/';
        },
        launchWebAuthFlow: (details, cb) => {
          const authUrl = new URL(details.url);
          calls.push('WEB prompt=' + authUrl.searchParams.get('prompt') + ' interactive=' + Boolean(details.interactive));
          calls.push('WEB_URL ' + details.url);
          const finish = () => {
            if (opts.webFlowError) {
              failCallback(opts.webFlowError, cb);
              return;
            }
            if (opts.silentFails && authUrl.searchParams.get('prompt') === 'none') {
              failCallback('Authorization page could not be loaded.', cb);
              return;
            }
            if (opts.webFlowRedirect) {
              cb(typeof opts.webFlowRedirect === 'function' ? opts.webFlowRedirect(authUrl, details) : opts.webFlowRedirect);
              return;
            }
            const state = authUrl.searchParams.get('state');
            const token = opts.webToken || 'ya29.web-token';
            const redirect = 'https://' + runtime.id + '.chromiumapp.org/#access_token=' + encodeURIComponent(token) + '&expires_in=3600&token_type=Bearer&state=' + encodeURIComponent(state);
            cb(redirect);
          };
          if (opts.holdWebFlow && details.interactive) {
            pendingWebFlows.push(finish);
            return;
          }
          finish();
        }
      },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored),
          set: async (patch) => { Object.assign(stored, patch); },
          remove: async (keys) => {
            const list = Array.isArray(keys) ? keys : [keys];
            list.forEach((k) => { delete stored[k]; });
          }
        }
      },
      contextMenus: { removeAll(cb) { if (cb) cb(); }, create(o, cb) { if (cb) cb(); }, onClicked: { addListener() {} } },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    },
    crypto: webcrypto
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return {
    calls,
    tokens,
    stored,
    onMessage: onMessageListener,
    releaseWebFlows() {
      const queued = pendingWebFlows.splice(0);
      queued.forEach((fn) => fn());
    },
    fn: (name) => vm.runInContext(name, sandbox)
  };
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function attempt(promise) {
  try { return { ok: true, value: await promise }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

function authParams(url) {
  return new URL(url.replace(/^WEB_URL /, ''));
}

function interactiveCalls(calls) {
  return calls.filter((c) => c === 'GET_AUTH true' || /interactive=true/.test(c));
}

function send(env, msg, sender) {
  return new Promise((resolve) => {
    env.onMessage(msg, sender || {}, resolve);
  });
}

async function run() {
  const api = loadPure();

  console.log('\n--- fallback trigger ---\n');
  check('browser sign-in off (no hyphen) falls back', api.shouldFallbackFromGetAuthToken(SIGNIN_OFF, { interactive: true }) === true);
  check('browser sign-in off with a period falls back', api.shouldFallbackFromGetAuthToken(SIGNIN_OFF + '.', { interactive: true }) === true);
  check('hyphenated Chrome wording falls back', api.shouldFallbackFromGetAuthToken('The user turned off browser sign-in.', { interactive: true }) === true);
  check('not signed in falls back', api.shouldFallbackFromGetAuthToken('The user is not signed in.', { interactive: true }) === true);
  check('revoked chrome grant falls back', api.shouldFallbackFromGetAuthToken('OAuth2 not granted or revoked.', { interactive: true }) === true);
  check('authorization page failure falls back', api.shouldFallbackFromGetAuthToken('Authorization page could not be loaded.', { interactive: true }) === true);
  check('user cancel does not fall back', api.shouldFallbackFromGetAuthToken(USER_CANCEL, { interactive: true }) === false);
  check('closed-or-denied does not fall back', api.shouldFallbackFromGetAuthToken('Google sign-in was closed or denied.', { interactive: true }) === false);
  check('empty message does not fall back', api.shouldFallbackFromGetAuthToken('', { interactive: true }) === false);
  check('null message does not fall back', api.shouldFallbackFromGetAuthToken(null, { interactive: true }) === false);
  check('interaction required stays quiet when non-interactive', api.shouldFallbackFromGetAuthToken('User interaction required.', { interactive: false }) === false);
  check('interaction required may fall back when interactive', api.shouldFallbackFromGetAuthToken('User interaction required.', { interactive: true }) === true);
  check('access_denied is a cancel', api.isUserCancelMessage('access_denied') === true);
  check('signin-off is not a cancel', api.isUserCancelMessage(SIGNIN_OFF) === false);

  console.log('\n--- redirect URI and authorize URL ---\n');
  check('unpacked redirect', api.googleRedirectUriForExtension(EXTENSION_ID) === 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/');
  check('store redirect', api.googleRedirectUriForExtension('lbihckfmoffgjjlnneoeaehbhoonfenh') === 'https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/');
  check('blank extension id has no redirect', api.googleRedirectUriForExtension('  ') === '');
  check('default scopes match the manifest list', JSON.stringify(api.googleOAuthScopesFrom(null)) === JSON.stringify(api.GOOGLE_OAUTH_SCOPES) && api.GOOGLE_OAUTH_SCOPES.length === 5);
  check('explicit scopes are trimmed and kept', JSON.stringify(api.googleOAuthScopesFrom(['', '  https://www.googleapis.com/auth/tasks  '])) === JSON.stringify(['https://www.googleapis.com/auth/tasks']));
  const built = new URL(api.googleImplicitAuthUrl({
    clientId: WEB_CLIENT,
    redirectUri: 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/',
    scopes: api.GOOGLE_OAUTH_SCOPES,
    state: 'abc',
    prompt: 'select_account'
  }));
  check('implicit token authorize URL', built.origin + built.pathname === 'https://accounts.google.com/o/oauth2/v2/auth');
  check('authorize URL uses the web client', built.searchParams.get('client_id') === WEB_CLIENT && built.searchParams.get('response_type') === 'token');
  check('authorize URL carries redirect, state, and prompt',
    built.searchParams.get('redirect_uri') === 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/' &&
    built.searchParams.get('state') === 'abc' &&
    built.searchParams.get('prompt') === 'select_account' &&
    built.searchParams.get('include_granted_scopes') === 'true');
  check('authorize URL lists every manifest scope', api.GOOGLE_OAUTH_SCOPES.every((s) => built.searchParams.get('scope').split(' ').indexOf(s) !== -1), built.searchParams.get('scope'));

  console.log('\n--- redirect token parse ---\n');
  const hashUrl = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/#access_token=' + encodeURIComponent('ya29.hash') + '&expires_in=3599&token_type=Bearer&state=abc';
  const parsedHash = api.parseGoogleImplicitRedirect(hashUrl, 'abc');
  check('hash access_token and expires_in', parsedHash.accessToken === 'ya29.hash' && parsedHash.expiresIn === 3599, parsedHash);
  const queryUrl = 'https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/?access_token=ya29.query&expires_in=120&state=xyz';
  const parsedQuery = api.parseGoogleImplicitRedirect(queryUrl, 'xyz');
  check('query access_token', parsedQuery.accessToken === 'ya29.query' && parsedQuery.expiresIn === 120, parsedQuery);
  const both = 'https://ext.chromiumapp.org/?access_token=fromquery&state=s#access_token=fromhash&expires_in=10&state=s';
  check('hash token wins over query', api.parseGoogleImplicitRedirect(both, 's').accessToken === 'fromhash');
  check('state mismatch is rejected', (await attempt(Promise.resolve().then(() => api.parseGoogleImplicitRedirect(hashUrl, 'other')))).error.indexOf('could not be verified') !== -1);
  check('access_denied is a closed sign-in', (await attempt(Promise.resolve().then(() => api.parseGoogleImplicitRedirect('https://ext.chromiumapp.org/#error=access_denied&state=abc', 'abc')))).error === 'Google sign-in was closed or denied.');
  check('missing token is rejected', (await attempt(Promise.resolve().then(() => api.parseGoogleImplicitRedirect('https://ext.chromiumapp.org/#state=abc', 'abc')))).error.indexOf('did not return an access token') !== -1);
  check('garbage redirect is rejected', (await attempt(Promise.resolve().then(() => api.parseGoogleImplicitRedirect('not a url', 'abc')))).ok === false);
  check('non-numeric expires_in is omitted', api.parseGoogleImplicitRedirect('https://ext.chromiumapp.org/#access_token=ya29.x&expires_in=nope&state=abc', 'abc').expiresIn === null);
  const now = 1_700_000_000_000;
  check('token with no expiry is usable', api.webTokenUsable({ accessToken: 't' }, now) === true);
  check('token inside skew is not usable', api.webTokenUsable({ accessToken: 't', expiresAt: now + 30000 }, now, 60000) === false);
  check('token past expiry is not usable', api.webTokenUsable({ accessToken: 't', expiresAt: now - 1 }, now) === false);
  check('token comfortably ahead is usable', api.webTokenUsable({ accessToken: 't', expiresAt: now + 120000 }, now, 60000) === true);
  check('empty token is not usable', api.webTokenUsable({ accessToken: '' }, now) === false);
  check('storage key is googleWebAuth', api.GOOGLE_WEB_AUTH_STORAGE_KEY === 'googleWebAuth');

  console.log('\n--- both paths failed: user-facing copy ---\n');
  const closed = api.googleConnectErrorMessage(SIGNIN_OFF, USER_CANCEL);
  check('signin-off plus a closed window is not the raw Chrome error', closed !== SIGNIN_OFF && closed.indexOf(SIGNIN_OFF) === -1 && /Google window/i.test(closed), closed);
  const unconfigured = api.googleConnectErrorMessage(SIGNIN_OFF, 'Glance’s backup Google sign-in isn’t configured on this build yet.');
  check('signin-off plus a missing web client names both problems', /turned off/i.test(unconfigured) && /isn.t set up/i.test(unconfigured) && unconfigured !== SIGNIN_OFF, unconfigured);
  const other = api.googleConnectErrorMessage(SIGNIN_OFF, 'Google sign-in failed (server_error).');
  check('signin-off plus a web-flow error tells the user what to do', other !== SIGNIN_OFF && /backup Google window/i.test(other) && /Turn browser sign-in on/i.test(other), other);

  console.log('\n--- getAuthToken stays primary ---\n');
  {
    const env = load({
      stored: { googleWebAuth: { accessToken: 'ya29.stored', expiresAt: Date.now() + 3600e3 } },
      chromeToken: 'chrome-primary'
    });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    check('a successful getAuthToken is the token we use', out.ok && out.value.token === 'chrome-primary' && out.value.source === 'chrome', out);
    check('the web flow is not opened', !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
    check('the stored web token is left in place', env.stored.googleWebAuth.accessToken === 'ya29.stored', env.stored);
  }
  {
    const env = load({
      stored: { googleTasksAuth: { taskListId: 'LIST_A' } },
      routes: [
        [/\/lists\/LIST_A\/tasks$/, { reply: { ok: true, status: 200, json: async () => ({ id: 'task_ok' }) } }],
        [/\/lists\/LIST_A\/tasks\/task_ok$/, { reply: { ok: true, status: 200, json: async () => ({ id: 'task_ok' }) } }]
      ]
    });
    const out = await attempt(env.fn('googleTasksWrite')({ label: 'Send the SOW', facts: {}, senderName: 'Dana' }));
    check('a chrome-token write succeeds', out.ok === true && out.value && out.value.ok === true, out);
    check('the request used the chrome token', env.tokens[0] && env.tokens[0].indexOf('chrome-tok-') === 0, env.tokens);
    check('no web flow on a healthy getAuthToken', !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
  }

  console.log('\n--- stale chrome token refreshes via getAuthToken, not the web flow ---\n');
  {
    let n = 0;
    const env = load({
      stored: { googleTasksAuth: { taskListId: 'LIST_A' } },
      routes: [
        [/\/lists\/LIST_A\/tasks\/task_4$/, { reply: { ok: true, status: 200, json: async () => ({ id: 'task_4' }) } }],
        [/\/lists\/LIST_A\/tasks$/, {
          get reply() {
            n += 1;
            return n === 1
              ? { ok: false, status: 401, json: async () => ({}) }
              : { ok: true, status: 200, json: async () => ({ id: 'task_4' }) };
          }
        }]
      ]
    });
    const out = await attempt(env.fn('googleTasksWrite')({ label: 'Send the SOW', facts: {}, senderName: 'Dana' }));
    check('a 401 on a chrome token still succeeds after one refresh', out.ok && out.value && out.value.ok === true, out);
    check('the stale chrome token was evicted', env.calls.some((c) => c.indexOf('EVICT chrome-tok-') === 0), env.calls);
    check('the retry used a different chrome token', env.tokens[0] !== env.tokens[1], env.tokens);
    check('a chrome 401 does not open the web flow', !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
    check('a chrome 401 refresh stays non-interactive', interactiveCalls(env.calls).length === 0, env.calls);
  }

  console.log('\n--- browser sign-in off uses the web flow token ---\n');
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      webToken: 'ya29.from-web',
      stored: {}
    });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    check('fallback returns the web token', out.ok && out.value.token === 'ya29.from-web' && out.value.source === 'web', out);
    check('getAuthToken ran before the web flow',
      env.calls[0] === 'GET_AUTH true' && env.calls.some((c) => c.indexOf('WEB prompt=select_account interactive=true') === 0),
      env.calls);
    check('the redirect URI comes from chrome.identity.getRedirectURL', env.calls.indexOf('REDIRECT_URL') !== -1, env.calls);
    const url = authParams(env.calls.find((c) => c.indexOf('WEB_URL ') === 0));
    check('web flow uses the web client, not the chrome-extension client',
      url.searchParams.get('client_id') === WEB_CLIENT && url.searchParams.get('client_id') !== CHROME_CLIENT, url.searchParams.get('client_id'));
    check('redirect is this extension’s chromiumapp origin',
      url.searchParams.get('redirect_uri') === 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/');
    check('response_type is the implicit token grant', url.searchParams.get('response_type') === 'token');
    check('scopes are the manifest scopes', SCOPES.every((s) => url.searchParams.get('scope').split(' ').indexOf(s) !== -1), url.searchParams.get('scope'));
    check('the web token and expiry are stored',
      env.stored.googleWebAuth && env.stored.googleWebAuth.accessToken === 'ya29.from-web' && env.stored.googleWebAuth.expiresAt > Date.now(),
      env.stored.googleWebAuth);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      stored: { googleWebAuth: { accessToken: 'ya29.still-good', expiresAt: Date.now() + 3600e3 } }
    });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    check('a stored unexpired web token is reused', out.ok && out.value.token === 'ya29.still-good', out);
    check('reuse does not open another window', !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      silentFails: true,
      webToken: 'ya29.refreshed',
      stored: { googleWebAuth: { accessToken: 'ya29.expired', expiresAt: Date.now() - 5000 } }
    });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    check('an expired web token is replaced', out.ok && out.value.token === 'ya29.refreshed', out);
    check('refresh tries silent, then interactive',
      env.calls.some((c) => c.indexOf('WEB prompt=none') === 0) && env.calls.some((c) => c.indexOf('WEB prompt=select_account') === 0),
      env.calls);
  }
  {
    const env = load({ getAuthTokenError: USER_CANCEL });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    check('a user cancel does not open the web flow', out.ok === false && out.error === USER_CANCEL && !env.calls.some((c) => c.indexOf('WEB ') === 0), out);
  }
  {
    const env = load({ getAuthTokenError: SIGNIN_OFF, webFlowError: USER_CANCEL });
    const out = await attempt(env.fn('connectGoogleTasks')());
    check('both paths failing does not surface only the raw sign-in error',
      out.ok === false && out.error !== SIGNIN_OFF && out.error.indexOf(SIGNIN_OFF) === -1 && /Google window/i.test(out.error), out);
    check('a failed connect does not mark Google connected', !env.stored.googleTasksAuth, env.stored);
  }

  console.log('\n--- API calls consume the fallback token ---\n');
  {
    let posts = 0;
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      stored: {
        googleTasksAuth: { taskListId: 'LIST_A' },
        googleWebAuth: { accessToken: 'ya29.for-tasks', expiresAt: Date.now() + 3600e3 }
      },
      routes: [
        [/\/lists\/LIST_A\/tasks\/task_web$/, { reply: { ok: true, status: 200, json: async () => ({ id: 'task_web' }) } }],
        [/\/lists\/LIST_A\/tasks$/, {
          get reply() {
            posts += 1;
            return posts === 1
              ? { ok: false, status: 401, json: async () => ({}) }
              : { ok: true, status: 200, json: async () => ({ id: 'task_web' }) };
          }
        }]
      ]
    });
    // The loader returns answer.reply once, evaluated when the route matches.
    // A getter on the route object is read each match if we look up answer.reply each time.
    // load() does `return answer.reply` per fetch, so the getter runs per call. Good.
    const out = await attempt(env.fn('googleTasksWrite')({ label: 'Send the SOW', facts: {}, senderName: 'Dana' }));
    check('a task write succeeds on the refreshed web token', out.ok && out.value && out.value.ok === true, out);
    check('the first bearer was the stored web token', env.tokens[0] === 'ya29.for-tasks', env.tokens);
    check('the retry bearer is a new web token', env.tokens[1] && env.tokens[1] !== 'ya29.for-tasks', env.tokens);
    check('getAuthToken was tried silently before the stored web token',
      env.calls.indexOf('GET_AUTH false') !== -1, env.calls);
    check('a web 401 retries with prompt=none and never interactive true',
      env.calls.some((c) => c.indexOf('WEB prompt=none interactive=false') === 0) && interactiveCalls(env.calls).length === 0,
      env.calls);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      webToken: 'ya29.connect',
      routes: [[/\/users\/@me\/lists/, { reply: res(200, { items: [{ id: 'LIST_G', title: 'Glance' }] }) }]]
    });
    const out = await attempt(env.fn('connectGoogleTasks')());
    check('connect succeeds through the web flow', out.ok === true, out);
    check('connect stores the Glance list', env.stored.googleTasksAuth && env.stored.googleTasksAuth.taskListId === 'LIST_G', env.stored.googleTasksAuth);
    check('the list call used the web token', env.tokens.indexOf('ya29.connect') !== -1, env.tokens);
  }

  console.log('\n--- disconnect clears chrome cache and the web token ---\n');
  {
    const env = load({
      chromeToken: 'cached-chrome',
      stored: {
        googleTasksAuth: { taskListId: 'LIST_A' },
        googleWebAuth: { accessToken: 'ya29.web', expiresAt: Date.now() + 3600e3 }
      }
    });
    const out = await attempt(env.fn('disconnectConnector')('googleTasks'));
    check('disconnect succeeds', out.ok && out.value && out.value.ok === true, out);
    check('googleTasksAuth is gone', env.stored.googleTasksAuth == null, env.stored);
    check('the web-flow token is gone', env.stored.googleWebAuth == null, env.stored);
    check('the cached chrome token was evicted', env.calls.indexOf('EVICT cached-chrome') !== -1, env.calls);
    check('clearAllCachedAuthTokens ran', env.calls.indexOf('CLEAR_ALL') !== -1, env.calls);
    check('disconnect did not open the web flow', !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      stored: {
        googleTasksAuth: { taskListId: 'LIST_A' },
        googleWebAuth: { accessToken: 'ya29.web', expiresAt: Date.now() + 3600e3 }
      }
    });
    const out = await attempt(env.fn('disconnectConnector')('googleTasks'));
    check('disconnect still clears storage when getAuthToken cannot run',
      out.ok && env.stored.googleTasksAuth == null && env.stored.googleWebAuth == null, env.stored);
    check('no chrome token is evicted when there is none', env.calls.indexOf('EVICT undefined') === -1 && !env.calls.some((c) => c.indexOf('EVICT ') === 0), env.calls);
    check('clearAllCachedAuthTokens still runs', env.calls.indexOf('CLEAR_ALL') !== -1, env.calls);
  }

  console.log('\n--- auto-connect and Do It never open a consent window ---\n');
  {
    const env = load();
    check('a content-script sender is not an explicit Connect', env.fn('googleConnectWantsInteractive')({ tab: { id: 3 } }) === false);
    check('the popup sender is an explicit Connect', env.fn('googleConnectWantsInteractive')({ url: 'chrome-extension://id/popup/popup.html' }) === true);
    check('a missing sender stays an explicit Connect', env.fn('googleConnectWantsInteractive')(null) === true);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      stored: { googleWebAuth: { accessToken: 'ya29.silent', expiresAt: Date.now() + 3600e3 } },
      routes: [[/\/users\/@me\/lists/, { reply: res(200, { items: [{ id: 'LIST_G', title: 'Glance' }] }) }]]
    });
    const out = await send(env, { type: 'flow:connect', connectorId: 'googleTasks' }, { tab: { id: 4, url: 'https://mail.google.com/mail/u/0/' } });
    check('auto-connect finishes on a stored token', out && out.ok === true, out);
    check('auto-connect never calls interactive true', interactiveCalls(env.calls).length === 0, env.calls);
    check('auto-connect recorded the Glance list', env.stored.googleTasksAuth && env.stored.googleTasksAuth.taskListId === 'LIST_G', env.stored.googleTasksAuth);
  }
  {
    const env = load({ getAuthTokenError: SIGNIN_OFF, holdWebFlow: true });
    const out = await send(env, { type: 'flow:connect', connectorId: 'googleTasks' }, { tab: { id: 4, url: 'https://mail.google.com/mail/u/0/' } });
    check('auto-connect without a token fails quietly', out && out.ok === false, out);
    check('auto-connect without a token does not open the web flow', interactiveCalls(env.calls).length === 0 && !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
    check('a failed auto-connect does not mark Google connected', !env.stored.googleTasksAuth, env.stored);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      webToken: 'ya29.popup',
      routes: [[/\/users\/@me\/lists/, { reply: res(200, { items: [{ id: 'LIST_P', title: 'Glance' }] }) }]]
    });
    const out = await send(env, { type: 'flow:connect', connectorId: 'googleTasks' }, { url: 'chrome-extension://' + EXTENSION_ID + '/popup/popup.html' });
    check('popup Connect still opens the interactive web flow',
      out && out.ok === true && env.calls.some((c) => c.indexOf('WEB prompt=select_account interactive=true') === 0),
      { out, calls: env.calls });
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      omitGetRedirectURL: true,
      webToken: 'ya29.hand-built'
    });
    const out = await attempt(env.fn('getGoogleAccessToken')(true));
    const url = authParams(env.calls.find((c) => c.indexOf('WEB_URL ') === 0) || '');
    check('a missing getRedirectURL still uses the chromiumapp origin',
      out.ok && url.searchParams.get('redirect_uri') === 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/',
      url.searchParams.get('redirect_uri'));
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      stored: { googleTasksAuth: { taskListId: 'LIST_A' } }
    });
    const out = await attempt(env.fn('googleTasksWrite')({ label: 'Send the SOW', facts: {}, senderName: 'Dana' }));
    check('a Do It with no silent token is not-connected',
      out.ok && out.value && out.value.ok === false && out.value.reason === 'not-connected', out);
    check('that Do It does not open a consent window',
      interactiveCalls(env.calls).length === 0 && !env.calls.some((c) => c.indexOf('WEB ') === 0), env.calls);
  }
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      silentFails: true,
      stored: {
        googleTasksAuth: { taskListId: 'LIST_A' },
        googleWebAuth: { accessToken: 'ya29.revoked', expiresAt: Date.now() + 3600e3 }
      },
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: { ok: false, status: 401, json: async () => ({}) } }]]
    });
    const out = await attempt(env.fn('googleTasksWrite')({ label: 'Send the SOW', facts: {}, senderName: 'Dana' }));
    check('a 401 whose silent refresh fails is not-connected',
      out.ok && out.value && out.value.reason === 'not-connected', out);
    check('that 401 retry never calls interactive true', interactiveCalls(env.calls).length === 0, env.calls);
    check('that 401 retry did try prompt=none',
      env.calls.some((c) => c.indexOf('WEB prompt=none interactive=false') === 0), env.calls);
  }

  console.log('\n--- disconnect invalidates an in-flight consent window ---\n');
  {
    const env = load({
      getAuthTokenError: SIGNIN_OFF,
      holdWebFlow: true,
      silentFails: true,
      webToken: 'ya29.late-approval',
      stored: {
        googleTasksAuth: { taskListId: 'LIST_A' },
        googleWebAuth: { accessToken: 'ya29.expired', expiresAt: Date.now() - 5000 }
      }
    });
    const pending = env.fn('getGoogleAccessToken')(true);
    for (let i = 0; i < 20 && !env.calls.some((c) => c.indexOf('WEB prompt=select_account interactive=true') === 0); i++) {
      await new Promise((r) => setImmediate(r));
    }
    check('the consent window is open before disconnect',
      env.calls.some((c) => c.indexOf('WEB prompt=select_account interactive=true') === 0), env.calls);
    const disconnected = await attempt(env.fn('disconnectConnector')('googleTasks'));
    check('disconnect succeeds while the window is open',
      disconnected.ok && disconnected.value && disconnected.value.ok === true, disconnected);
    check('storage is clear before the late approval',
      env.stored.googleWebAuth == null && env.stored.googleTasksAuth == null, env.stored);
    env.releaseWebFlows();
    const out = await attempt(pending);
    await new Promise((r) => setImmediate(r));
    check('the late approval is not a saved token', out.ok === false, out);
    check('the late approval does not restore googleWebAuth', env.stored.googleWebAuth == null, env.stored);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
