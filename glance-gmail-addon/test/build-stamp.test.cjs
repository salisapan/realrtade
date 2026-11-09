#!/usr/bin/env node
// BuildSha dev vs deploy stamp and check-core-bundle modes.
// Run: node glance-gmail-addon/test/build-stamp.test.cjs

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const addon = path.join(__dirname, '..');
const repo = path.join(addon, '..');
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function readSha() {
  const js = fs.readFileSync(path.join(addon, 'BuildSha.js'), 'utf8');
  const m = js.match(/GLANCE_BUILD_SHA\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

function readBundleStamp() {
  const js = fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8');
  const m = js.match(/\n\/\/ GLANCE_BUILD_SHA=([^\n]+)/);
  return m ? m[1] : null;
}

const savedSha = fs.readFileSync(path.join(addon, 'BuildSha.js'), 'utf8');
const savedBundle = fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8');

try {
  check('committed BuildSha is dev', readSha() === 'dev', readSha());
  check('committed CoreBundle stamp is dev', readBundleStamp() === 'dev', readBundleStamp());

  execSync('node scripts/build-bundle.js', { cwd: addon, stdio: 'pipe' });
  check('normal build-bundle keeps dev in BuildSha.js', readSha() === 'dev', readSha());
  check('normal build-bundle keeps dev stamp in CoreBundle.js', readBundleStamp() === 'dev', readBundleStamp());

  execSync('node scripts/check-core-bundle.cjs', { cwd: addon, stdio: 'pipe' });

  let deployCheckFailed = false;
  try {
    execSync('node scripts/check-core-bundle.cjs --deploy', { cwd: addon, stdio: 'pipe' });
  } catch (err) {
    deployCheckFailed = true;
  }
  check('deploy check fails while BuildSha is dev', deployCheckFailed);

  execSync('node scripts/build-bundle.js --deploy', { cwd: addon, stdio: 'pipe' });
  let head = '';
  try {
    head = execSync('git rev-parse --short HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  } catch (err) {
    check('git HEAD for deploy stamp', false, err.message);
  }
  if (head) {
    check('deploy build-bundle stamps HEAD in BuildSha.js', readSha() === head, { got: readSha(), want: head });
    check('deploy build-bundle stamps HEAD in CoreBundle.js', readBundleStamp() === head, { got: readBundleStamp(), want: head });
    execSync('node scripts/check-core-bundle.cjs --deploy', { cwd: addon, stdio: 'pipe' });
    check('deploy check passes after deploy stamp', true);
  }
} finally {
  fs.writeFileSync(path.join(addon, 'BuildSha.js'), savedSha);
  fs.writeFileSync(path.join(addon, 'CoreBundle.js'), savedBundle);
}

console.log('\nFAILURES: ' + failures);
process.exit(failures ? 1 : 0);
