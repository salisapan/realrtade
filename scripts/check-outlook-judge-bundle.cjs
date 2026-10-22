#!/usr/bin/env node
// Fail if judge-bundle.mjs is stale vs flow-trial-extension/core (like check-core-bundle).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repo = path.join(__dirname, '..');
const manifestPath = path.join(repo, 'supabase', 'functions', 'outlook-graph-glance', 'judge-bundle.manifest.json');
const bundlePath = path.join(repo, 'supabase', 'functions', 'outlook-graph-glance', 'judge-bundle.mjs');

if (!fs.existsSync(bundlePath)) {
  console.error('missing judge-bundle.mjs — run: node scripts/build-outlook-judge-esm.cjs');
  process.exit(1);
}

const bundleBefore = fs.readFileSync(bundlePath);
execSync('node scripts/build-outlook-judge-esm.cjs', { cwd: repo, stdio: 'pipe' });
const bundleAfter = fs.readFileSync(bundlePath);
if (!bundleBefore.equals(bundleAfter)) {
  console.error('judge-bundle drift: re-run node scripts/build-outlook-judge-esm.cjs and commit judge-bundle.mjs + manifest');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const row of manifest.files) {
  const file = path.join(repo, row.file);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
  if (sha !== row.sha256) {
    console.error('source/hash mismatch for', row.file);
    process.exit(1);
  }
}
console.log('judge-bundle matches core/ sources');
