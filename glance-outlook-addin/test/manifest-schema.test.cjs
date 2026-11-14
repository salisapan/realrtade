#!/usr/bin/env node
// Validates the committed manifest and a generated sideload copy against the
// Office add-in XSDs in schema/. Fails if xmllint is missing. Does not skip.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const schema = path.join(root, 'schema', 'OfficeAppManifestV1_1.xsd');
const manifest = path.join(root, 'manifest.xml');
const generator = require('../scripts/test-manifest.js');

function fail(message) {
  console.error('FAIL:', message);
  process.exit(1);
}

if (!fs.existsSync(schema)) fail('schema file missing: ' + schema);

const probe = spawnSync('xmllint', ['--version'], { encoding: 'utf8' });
if (probe.error && probe.error.code === 'ENOENT') fail('xmllint is not installed');
if (probe.status !== 0 && probe.error) fail('xmllint failed to start: ' + probe.error.message);

function validate(file) {
  const result = spawnSync('xmllint', ['--noout', '--schema', schema, file], { encoding: 'utf8' });
  const text = ((result.stderr || '') + (result.stdout || '')).trim();
  console.log('--- ' + path.relative(root, file) + ' ---');
  console.log(text);
  if (result.status !== 0 || !/validates\s*$/.test(text)) {
    fail('schema validation failed for ' + file);
  }
}

validate(manifest);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-manifest-schema-'));
const generated = path.join(dir, 'test-manifest.xml');
generator.writeTestManifest({ base: 'https://tunnel.example', out: generated });
const committed = fs.readFileSync(manifest);
validate(generated);
if (!fs.readFileSync(manifest).equals(committed)) fail('committed manifest.xml changed');

console.log('\nAll manifest schema checks passed');
