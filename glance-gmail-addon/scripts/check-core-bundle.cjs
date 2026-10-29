#!/usr/bin/env node
// Fail when CoreBundle.js is out of date vs flow-trial-extension/core and glance-gmail-addon/src.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const deployMode = process.argv.includes('--deploy');

const repo = path.join(__dirname, '..', '..');
const addon = path.join(__dirname, '..');
const committed = path.join(addon, 'CoreBundle.js');
const tmp = path.join(os.tmpdir(), 'glance-core-bundle-check-' + process.pid + '.js');

function stripBundleStamp(text) {
  return String(text || '').replace(/\n\/\/ GLANCE_BUILD_SHA=[^\n]*/g, '');
}

if (!fs.existsSync(committed)) {
  console.error('missing CoreBundle.js — run node glance-gmail-addon/scripts/build-bundle.js');
  process.exit(1);
}

execSync('node scripts/build-bundle.js', {
  cwd: addon,
  env: Object.assign({}, process.env, { GLANCE_BUNDLE_OUT: tmp }),
  stdio: 'inherit'
});

const a = stripBundleStamp(fs.readFileSync(committed, 'utf8'));
const b = stripBundleStamp(fs.readFileSync(tmp, 'utf8'));
try { fs.unlinkSync(tmp); } catch (err) { /* ignore */ }

if (a !== b) {
  console.error('CoreBundle.js drift: re-run node glance-gmail-addon/scripts/build-bundle.js and commit CoreBundle.js');
  process.exit(1);
}

const shaPath = path.join(addon, 'BuildSha.js');
const shaJs = fs.readFileSync(shaPath, 'utf8');
const shaMatch = shaJs.match(/GLANCE_BUILD_SHA\s*=\s*'([^']+)'/);
const stamped = shaMatch ? shaMatch[1] : '';

let headShort = '';
try {
  headShort = execSync('git rev-parse --short HEAD', { cwd: repo, encoding: 'utf8' }).trim();
} catch (err) {
  if (deployMode) {
    console.error('could not read git HEAD for deploy BuildSha assert:', err.message || err);
    process.exit(1);
  }
}

if (deployMode) {
  if (!stamped || stamped === 'dev') {
    console.error('deploy check: BuildSha.js must be stamped with git HEAD, not dev (run node scripts/build-bundle.js --deploy)');
    process.exit(1);
  }
  if (stamped !== headShort) {
    console.error('deploy check: BuildSha.js must match git rev-parse --short HEAD (' + headShort + '), got ' + stamped);
    process.exit(1);
  }
  const bundleStamp = fs.readFileSync(committed, 'utf8').match(/\n\/\/ GLANCE_BUILD_SHA=([^\n]+)/);
  if (!bundleStamp || bundleStamp[1] !== stamped) {
    console.error('deploy check: CoreBundle.js stamp must match BuildSha.js (' + stamped + ')');
    process.exit(1);
  }
  console.log('CoreBundle.js matches core/ + src/ sources');
  console.log('BuildSha.js matches HEAD (' + headShort + ') for deploy');
} else {
  if (stamped !== 'dev') {
    console.error('BuildSha.js must be the neutral dev stamp in the repo (got ' + stamped + '). Re-run node scripts/build-bundle.js without --deploy.');
    process.exit(1);
  }
  console.log('CoreBundle.js matches core/ + src/ sources');
  console.log('BuildSha.js is neutral dev (homepage shows dev locally)');
}
