#!/usr/bin/env node
// Packs the add-in into dist/site/, laid out exactly as the manifest URLs expect (https://theflow-ai.com/glance-outlook-addin/...).
// A ready bundle only: nothing is uploaded, hosted or deployed here. The one later deploy copies dist/site/ as is.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'site', 'glance-outlook-addin');

function copy(rel) {
  const to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, rel), to);
  return rel;
}

if (!fs.existsSync(path.join(root, 'dist', 'core-bundle.js'))) require('./build-bundle.js');
fs.rmSync(path.join(root, 'dist', 'site'), { recursive: true, force: true });
const files = ['manifest.xml', 'dist/core-bundle.js'].concat(fs.readdirSync(path.join(root, 'src')).sort().map((f) => 'src/' + f));
files.forEach(copy);
const sums = files.map((rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(out, rel))).digest('hex') + '  ' + rel).join('\n') + '\n';
fs.writeFileSync(path.join(out, 'SHA256SUMS'), sums);
console.log('packed ' + files.length + ' files into ' + path.relative(process.cwd(), out));
