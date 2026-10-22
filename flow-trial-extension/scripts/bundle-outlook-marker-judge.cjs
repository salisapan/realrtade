#!/usr/bin/env node
// Rebuild judge.bundle.mjs for supabase/functions/outlook-graph-marker (ESM, same core as the extension).
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const entry = path.join(__dirname, 'outlook-marker-judge-entry.mjs');
const out = path.join(root, 'supabase', 'functions', 'outlook-graph-marker', 'judge.bundle.mjs');

execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out], {
  cwd: root,
  stdio: 'inherit'
});
console.log('Wrote', out);
