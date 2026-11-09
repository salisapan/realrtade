// Fixture grants must be a subset of the shipped v1 manifest scopes, so a test can never pass on a
// capability (e.g. Drive search) that a real v1 user does not have. Pure node: no browser.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  manifestOauthScopes,
  manifestGoogleGrantedVersion,
  scopesOutsideManifest,
  assertFixtureScopesWithinManifest
} = require('./support/launch');

const G = 'https://www.googleapis.com/auth/';
const V1 = [G + 'calendar.events', G + 'tasks', G + 'drive.file', 'openid', G + 'userinfo.profile', G + 'userinfo.email'];

test('the manifest scopes are exactly the v1 set', () => {
  expect(manifestOauthScopes().sort()).toEqual(V1.slice().sort());
});

test('the default fixture grant is exactly the manifest scopes and nothing wider', () => {
  expect(scopesOutsideManifest(manifestGoogleGrantedVersion())).toEqual([]);
  expect(manifestGoogleGrantedVersion().split('\n').sort()).toEqual(V1.slice().sort());
});

test('a fixture grant with a restricted scope is rejected', () => {
  for (const extra of ['drive.readonly', 'gmail.compose', 'gmail.modify', 'contacts.readonly', 'forms.body']) {
    const version = manifestGoogleGrantedVersion() + '\n' + G + extra;
    expect(scopesOutsideManifest(version)).toEqual([G + extra]);
    expect(() => assertFixtureScopesWithinManifest({ version })).toThrow(/FIXTURE_SCOPES_OUTSIDE_V1_MANIFEST/);
  }
});

test('a narrower fixture grant (subset) is allowed', () => {
  expect(() => assertFixtureScopesWithinManifest({ version: [G + 'tasks', G + 'drive.file'].join('\n') })).not.toThrow();
});

test('no e2e file keeps the drive.readonly seed helper', () => {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).concat(fs.readdirSync(path.join(dir, 'support')).map((f) => 'support/' + f));
  const offenders = files.filter((f) => f !== 'fixture-scopes.spec.js' && /e2eGoogleGrantedScopes/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  expect(offenders).toEqual([]);
});
