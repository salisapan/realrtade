// Fails when Flow/Glance code reads an env name that .env.example does not
// list, or when a value in that file looks like a real credential.
// Placeholders such as replace-with-* are expected. No secrets are printed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['flow-landing/netlify/functions', 'supabase/functions'];
const EXAMPLE_PATH = '.env.example';

const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
];

// Values only. Comments may name vendors. A match means the placeholder
// itself looks like a live credential, which this file must never contain.
const SECRET_VALUE = /eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]|sk_live_|re_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}|github_pat_|ghp_|glpat-|sb_secret_|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, acc);
    else if (/\.(js|cjs|mjs|ts)$/.test(name)) acc.push(path);
  }
  return acc;
}

function namesReadByCode() {
  const names = new Map();
  for (const file of ROOTS.flatMap((dir) => walk(dir))) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of ENV_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) {
        const list = names.get(match[1]) || [];
        list.push(file);
        names.set(match[1], list);
      }
    }
  }
  return names;
}

function namesInExample(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) names.add(trimmed.slice(0, eq).trim());
  }
  return names;
}

function secretLookingAssignments(text) {
  const hits = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (SECRET_VALUE.test(value)) hits.push(key);
  }
  return hits;
}

const example = readFileSync(EXAMPLE_PATH, 'utf8');
const read = namesReadByCode();
const documented = namesInExample(example);
const missing = [...read.keys()].filter((name) => !documented.has(name)).sort();
const secrets = secretLookingAssignments(example);

if (missing.length || secrets.length) {
  if (missing.length) {
    console.error('Names read by Flow/Glance code but missing from .env.example:');
    for (const name of missing) {
      console.error(`  ${name} (${[...new Set(read.get(name))].join(', ')})`);
    }
  }
  if (secrets.length) {
    console.error('Placeholder values look like real credentials (names only):');
    for (const name of secrets) console.error(`  ${name}`);
  }
  process.exit(1);
}

const unused = [...documented].filter((name) => !read.has(name)).sort();
if (unused.length) {
  console.error('Names in .env.example that Flow/Glance code does not read:');
  for (const name of unused) console.error(`  ${name}`);
  process.exit(1);
}

console.log(`.env.example covers ${read.size} env names`);
for (const name of [...read.keys()].sort()) console.log(`  ${name}`);
