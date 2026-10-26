// OAuth scopes: manifest oauth2.scopes, runtime GOOGLE_OAUTH_SCOPES, and
// FlowGoogleConfig.oauthScopeSetExact() must be the same seven scopes (no CASA).
// Run: node test/google-oauth-scopes-exact-corpus.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EXACT = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

function setEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const s of sa) if (!sb.has(s)) return false;
  return true;
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function loadWebAuth() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'google-web-auth.js'), 'utf8')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
  const sandbox = { URL, URLSearchParams, decodeURIComponent, Date };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__api = { GOOGLE_OAUTH_SCOPES, googleOAuthScopesFrom };', sandbox);
  return sandbox.__api;
}

function run() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const manifestScopes = manifest.oauth2 && manifest.oauth2.scopes;
  const web = loadWebAuth();
  const runtime = web.GOOGLE_OAUTH_SCOPES;
  const configSrc = fs.readFileSync(path.join(ROOT, 'core', 'google-config.js'), 'utf8');
  const cfgBox = { globalThis: {} };
  vm.createContext(cfgBox);
  vm.runInContext(configSrc, cfgBox);
  const configExact = cfgBox.globalThis.FlowGoogleConfig.oauthScopeSetExact();

  check('manifest has exactly seven OAuth scopes', Array.isArray(manifestScopes) && manifestScopes.length === 7 && setEqual(manifestScopes, EXACT), manifestScopes);
  check('runtime GOOGLE_OAUTH_SCOPES matches manifest', setEqual(runtime, manifestScopes) && setEqual(runtime, EXACT), runtime);
  check('googleOAuthScopesFrom(null) matches runtime', setEqual(web.googleOAuthScopesFrom(null), runtime));
  check('FlowGoogleConfig.oauthScopeSetExact matches manifest', setEqual(configExact, EXACT), configExact);
  check('manifest excludes gmail.compose and drive.readonly',
    manifestScopes.indexOf('https://www.googleapis.com/auth/gmail.compose') === -1
    && manifestScopes.indexOf('https://www.googleapis.com/auth/drive.readonly') === -1);

  if (failures) {
    console.log('\n' + failures + ' failure(s)');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run();
