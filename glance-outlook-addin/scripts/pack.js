#!/usr/bin/env node
// Packs the add-in into dist/site/, laid out exactly as the manifest URLs expect (https://theflow-ai.com/glance-outlook-addin/...).
// A ready bundle only: nothing is uploaded, hosted or deployed here. The one later deploy copies dist/site/ as is.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const out = path.join(root, 'dist', 'site', 'glance-outlook-addin');

function buildSha() {
  const raw = String(process.env.GLANCE_BUILD_SHA || execSync('git rev-parse --short=12 HEAD', {
    cwd: repo,
    encoding: 'utf8'
  })).trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(raw)) throw new Error('build sha is not hex');
  return raw;
}

function stampFooter(html, sha) {
  const next = html.replace(
    '<footer id="glance-build">Build dev</footer>',
    '<footer id="glance-build">Build ' + sha + '</footer>'
  );
  if (next === html) throw new Error('task pane is missing the build footer');
  return next;
}

function copy(rel) {
  const to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, rel), to);
  return rel;
}

function pack() {
  if (!fs.existsSync(path.join(root, 'dist', 'core-bundle.js'))) require('./build-bundle.js');
  fs.rmSync(path.join(root, 'dist', 'site'), { recursive: true, force: true });
  const files = ['manifest.xml', 'dist/core-bundle.js'].concat(fs.readdirSync(path.join(root, 'src')).sort().map((f) => 'src/' + f));
  files.forEach(copy);
  const sha = buildSha();
  const htmlPath = path.join(out, 'src', 'taskpane.html');
  fs.writeFileSync(htmlPath, stampFooter(fs.readFileSync(htmlPath, 'utf8'), sha));
  const sums = files.map((rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(out, rel))).digest('hex') + '  ' + rel).join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), sums);
  return { files: files, sha: sha, out: out };
}

module.exports = { buildSha: buildSha, stampFooter: stampFooter, pack: pack };

if (require.main === module) {
  const packed = pack();
  console.log('packed ' + packed.files.length + ' files into ' + path.relative(process.cwd(), packed.out) + ' build ' + packed.sha);
}
