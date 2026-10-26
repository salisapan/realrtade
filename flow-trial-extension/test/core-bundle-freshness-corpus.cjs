// Committed glance-gmail-addon/CoreBundle.js must match a fresh build from core/.
// Run: node test/core-bundle-freshness-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const repo = path.join(__dirname, '..', '..');
const committed = path.join(repo, 'glance-gmail-addon', 'CoreBundle.js');
const buildScript = path.join(repo, 'glance-gmail-addon', 'scripts', 'build-bundle.js');
const coreDir = path.join(repo, 'flow-trial-extension', 'core');
const addonSrc = path.join(repo, 'glance-gmail-addon', 'src');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-bundle-'));
try {
  for (const rel of ['glance-gmail-addon/scripts/build-bundle.js', 'glance-gmail-addon/src', 'flow-trial-extension/core']) {
    const src = path.join(repo, rel);
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  const outPath = path.join(tmp, 'glance-gmail-addon', 'CoreBundle.js');
  execFileSync(process.execPath, [path.join(tmp, 'glance-gmail-addon', 'scripts', 'build-bundle.js')], {
    cwd: path.join(tmp, 'glance-gmail-addon'),
    stdio: 'pipe'
  });
  const built = fs.readFileSync(outPath);
  const onDisk = fs.readFileSync(committed);
  check('CoreBundle.js matches scripts/build-bundle.js output from core/', built.equals(onDisk), {
    builtBytes: built.length,
    committedBytes: onDisk.length,
    firstDiff: built.equals(onDisk) ? null : (() => {
      for (let i = 0; i < Math.min(built.length, onDisk.length); i++) {
        if (built[i] !== onDisk[i]) return i;
      }
      return Math.min(built.length, onDisk.length);
    })()
  });
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

console.log('\nFAILURES:', failures);
process.exit(failures ? 1 : 0);
