'use strict';
// Gate #184 verifier addon only (same rows as embedded in gate-run4-184-corpus.cjs).
// Run: node test/gate-184-verifier-addon-corpus.cjs
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, 'gate-run4-184-corpus.cjs'), '--verifier-addon-only'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});
process.exit(typeof r.status === 'number' ? r.status : 1);
