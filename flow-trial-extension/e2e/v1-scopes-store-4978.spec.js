// v1 Bundle A: manifest scopes and store builder rules (headless).
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const EXT = path.join(__dirname, '..');
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

test('(c) dev manifest keeps key + hsd2u2 and requests exactly six v1 scopes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  expect(manifest.key).toBeTruthy();
  expect(manifest.oauth2.client_id).toBe(UNPACKED_CLIENT);
  expect(manifest.oauth2.scopes).toEqual(V1_SCOPES);
  const blob = JSON.stringify(manifest);
  expect(blob).not.toMatch(/gmail\.compose|drive\.readonly/);
});

test('(c) store manifest transform strips key, swaps aup7do, v1 scopes only', () => {
  const { spawnSync } = require('child_process');
  const repo = path.join(__dirname, '..', '..');
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
`;
  const r = spawnSync('python3', ['-c', py], {
    cwd: repo,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PYTHONPATH: path.join(repo, 'scripts') })
  });
  expect(r.status).toBe(0);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

test('picker config exposes API key and app id', () => {
  const src = fs.readFileSync(path.join(EXT, 'config', 'google-picker.public.js'), 'utf8');
  expect(src).toMatch(/pickerApiKey:\s*'AIzaSy/);
  expect(src).toMatch(/pickerAppId:\s*'93977330357'/);
  expect(fs.readFileSync(path.join(EXT, 'picker', 'picker.js'), 'utf8')).toMatch(
    /google-picker\.public\.js/
  );
});
