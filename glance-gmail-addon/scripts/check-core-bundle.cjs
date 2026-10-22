#!/usr/bin/env node
// Fail when CoreBundle.js is out of date vs flow-trial-extension/core and glance-gmail-addon/src.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const repo = path.join(__dirname, '..', '..');
const addon = path.join(__dirname, '..');
const committed = path.join(addon, 'CoreBundle.js');
const tmp = path.join(os.tmpdir(), 'glance-core-bundle-check-' + process.pid + '.js');

if (!fs.existsSync(committed)) {
  console.error('missing CoreBundle.js — run node glance-gmail-addon/scripts/build-bundle.js');
  process.exit(1);
}

execSync('node scripts/build-bundle.js', {
  cwd: addon,
  env: Object.assign({}, process.env, { GLANCE_BUNDLE_OUT: tmp, GLANCE_BUILD_SHA: 'check' }),
  stdio: 'inherit'
});

const a = fs.readFileSync(committed, 'utf8');
const b = fs.readFileSync(tmp, 'utf8');
try { fs.unlinkSync(tmp); } catch (err) { /* ignore */ }

if (a !== b) {
  console.error('CoreBundle.js drift: re-run node glance-gmail-addon/scripts/build-bundle.js and commit CoreBundle.js');
  process.exit(1);
}

const shaPath = path.join(addon, 'BuildSha.js');
const shaJs = fs.readFileSync(shaPath, 'utf8');
if (/GLANCE_BUILD_SHA\s*=\s*'check'/.test(shaJs)) {
  console.error('BuildSha.js must not be rewritten by check-core-bundle (use GLANCE_BUNDLE_OUT without touching BuildSha.js)');
  process.exit(1);
}
let headShort = '';
try {
  headShort = execSync('git rev-parse --short HEAD', { cwd: repo, encoding: 'utf8' }).trim();
} catch (err) {
  console.error('could not read git HEAD for BuildSha assert:', err.message || err);
  process.exit(1);
}
const shaMatch = shaJs.match(/GLANCE_BUILD_SHA\s*=\s*'([^']+)'/);
if (!shaMatch || shaMatch[1] !== headShort) {
  console.error('BuildSha.js must match git rev-parse --short HEAD (' + headShort + '), got ' + (shaMatch ? shaMatch[1] : 'missing'));
  process.exit(1);
}

console.log('CoreBundle.js matches core/ + src/ sources');
console.log('BuildSha.js matches HEAD (' + headShort + ')');
