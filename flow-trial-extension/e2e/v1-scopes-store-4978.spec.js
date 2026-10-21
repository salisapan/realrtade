// v1 Bundle A: store manifest matrix (headless).
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const EXT = path.join(__dirname, '..');
const REPO = path.join(__dirname, '..', '..');
const V1_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
];
const UNPACKED_CLIENT = '93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com';
const STORE_CLIENT = '93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com';
const FULL_STORE_HOSTS = [
  'https://mail.google.com/*',
  'https://tasks.googleapis.com/*',
  'https://www.googleapis.com/calendar/*',
  'https://www.googleapis.com/drive/*',
  'https://www.googleapis.com/oauth2/*',
  'https://www.googleapis.com/upload/drive/*',
  'https://*.googleusercontent.com/*',
  'https://theflow-ai.com/*',
  'https://api.dropboxapi.com/*',
  'https://content.dropboxapi.com/*',
  'https://web.whatsapp.com/*',
  'https://graph.microsoft.com/*',
  'https://login.microsoftonline.com/*',
  'https://outlook.live.com/*',
  'https://outlook.office.com/*',
  'https://outlook.office365.com/*',
  'https://www.messenger.com/*',
  'https://messenger.com/*',
  'https://www.facebook.com/messages',
  'https://www.facebook.com/messages/*',
  'https://facebook.com/messages',
  'https://facebook.com/messages/*',
  'https://business.facebook.com/latest/inbox',
  'https://business.facebook.com/latest/inbox/*',
  'https://www.business.facebook.com/latest/inbox',
  'https://www.business.facebook.com/latest/inbox/*',
  'https://www.instagram.com/direct',
  'https://www.instagram.com/direct/*',
  'https://instagram.com/direct',
  'https://instagram.com/direct/*'
];

test('(c) dev manifest keeps key + hsd2u2 and requests exactly six v1 scopes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  expect(manifest.key).toBeTruthy();
  expect(manifest.oauth2.client_id).toBe(UNPACKED_CLIENT);
  expect(manifest.oauth2.scopes).toEqual(V1_SCOPES);
  const blob = JSON.stringify(manifest);
  expect(blob).not.toMatch(/gmail\.compose|drive\.readonly/);
  expect(blob).not.toMatch(/gmail\.googleapis\.com/);
  expect(manifest.sandbox).toBeFalsy();
});

test('(c) store manifest transform strips key, swaps aup7do, v1 scopes only, no sandbox', () => {
  const { spawnSync } = require('child_process');
  const manifestPath = path.join(EXT, 'manifest.json');
  const py = `
import json, cws_prod
raw = open(${JSON.stringify(manifestPath)}).read()
out = cws_prod.transform_manifest(raw, 'full')
m = json.loads(out)
assert 'key' not in m
assert m['oauth2']['client_id'] == cws_prod.STORE_CLIENT_ID
assert m['oauth2']['scopes'] == list(cws_prod.FULL_SCOPES)
scopes_blob = json.dumps(m['oauth2']['scopes'])
assert 'gmail.' not in scopes_blob and 'drive.readonly' not in scopes_blob
assert 'sandbox' not in m
csp = m.get('content_security_policy') or {}
assert 'sandbox' not in csp
hosts = list(m.get('host_permissions') or []) + list(m.get('optional_host_permissions') or [])
assert hosts == list(cws_prod.FULL_STORE_HOST_GRANTS)
assert not any('gmail.googleapis.com' in h for h in hosts)
`;
  const r = spawnSync('python3', ['-c', py], {
    cwd: REPO,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PYTHONPATH: path.join(REPO, 'scripts') })
  });
  expect(r.status).toBe(0);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

test('(c) store zip passes check-prod: stamp matches HEAD, no remote loader hosts', () => {
  const { spawnSync } = require('child_process');
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim().slice(0, 7);
  const build = spawnSync('python3', [path.join(REPO, 'scripts', 'cws_prod.py'), '--flavor', 'full'], {
    cwd: REPO,
    encoding: 'utf8',
    env: process.env
  });
  expect(build.status).toBe(0);
  const version = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;
  const zipPath = path.join(REPO, 'dist', `glance-${version}-${sha}-prod.zip`);
  const check = spawnSync('python3', [path.join(REPO, 'scripts', 'check-prod.py'), zipPath], {
    cwd: REPO,
    encoding: 'utf8'
  });
  expect(check.status).toBe(0);
  if (check.status !== 0) throw new Error(check.stderr || check.stdout);
});

test('config/google-picker.public.js remains for a future hosted picker (unused in v1)', () => {
  const p = path.join(EXT, 'config', 'google-picker.public.js');
  expect(fs.existsSync(p)).toBe(true);
  expect(fs.existsSync(path.join(EXT, 'picker', 'picker.js'))).toBe(false);
});
