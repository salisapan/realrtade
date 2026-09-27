// Parse-only check for the Flow landing functions and the Glance extension.
// flow-landing has no compile step (netlify.toml build command is empty)
// and the extension has no package.json. `node --check` is the syntax gate.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['flow-landing/netlify/functions', 'flow-trial-extension'];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, acc);
    else if (/\.(js|cjs|mjs)$/.test(name)) acc.push(path);
  }
  return acc;
}

const files = ROOTS.flatMap((dir) => walk(dir)).sort();
const failed = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed.push(file);
    const detail = (result.stderr || result.stdout || '').trim();
    console.error(detail || `${file} failed node --check`);
  }
}

if (failed.length) {
  console.error(`Syntax check failed for ${failed.length} file(s)`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} files`);
