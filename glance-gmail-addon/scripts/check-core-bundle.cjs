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
console.log('CoreBundle.js matches core/ + src/ sources');
