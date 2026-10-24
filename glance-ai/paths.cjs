'use strict';
// Repo-relative locations for Glance's own model lab. No machine-specific absolute paths.
// This folder is Glance (the personal product). Flow is a separate product and is not loaded from here.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname; // glance-ai/
const REPO = path.resolve(ROOT, '..');

function engineRoot() {
  if (process.env.GLANCE_ENGINE_ROOT) return path.resolve(process.env.GLANCE_ENGINE_ROOT);
  return path.join(REPO, 'flow-trial-extension');
}

function engineVersion(root) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root || engineRoot(), 'manifest.json'), 'utf8'));
    return String(manifest.version || 'tip');
  } catch (e) {
    return 'tip';
  }
}

// Named extension roots the harness can load side by side.
// `tip` is this repo's flow-trial-extension, unless GLANCE_ENGINE_ROOT points somewhere else.
// The manifest version (today the in-repo tip) is registered as the same directory.
// Older unpacked builds are optional and never assumed to exist on a fresh machine:
//   GLANCE_ENGINE_ROOTS='{"0.9.35":"/path/to/0.9.35-unpacked","0.9.34":"../0.9.34-unpacked"}'
// A value may be absolute or relative to the repository root.
function engineRoots() {
  const tip = engineRoot();
  const roots = { tip: tip };
  const ver = engineVersion(tip);
  if (ver && ver !== 'tip') roots[ver] = tip;
  const raw = process.env.GLANCE_ENGINE_ROOTS;
  if (raw) {
    let extra;
    try { extra = JSON.parse(raw); }
    catch (e) { throw new Error('GLANCE_ENGINE_ROOTS must be a JSON object of name -> path'); }
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('GLANCE_ENGINE_ROOTS must be a JSON object');
    for (const [name, value] of Object.entries(extra)) {
      if (typeof value !== 'string' || !value) throw new Error('GLANCE_ENGINE_ROOTS.' + name + ' must be a path string');
      roots[name] = path.isAbsolute(value) ? value : path.resolve(REPO, value);
    }
  }
  return roots;
}

function evalDir() {
  return process.env.GLANCE_EVAL_DATA ? path.resolve(process.env.GLANCE_EVAL_DATA) : path.join(ROOT, 'eval-data');
}

function evalFile(name) {
  return path.join(evalDir(), name);
}

const EVAL = {
  v2Test: () => evalFile('v2-heldout-test.jsonl'),
  suggestSave: () => evalFile('suggest-save-v22.jsonl'),
  suggestSaveSummary: () => evalFile('suggest-save-v22.summary.json'),
  shadowCases: () => evalFile('shadow-combined-cases.jsonl'),
  sftVal: () => evalFile('sft-v2-val.jsonl')
};

module.exports = { ROOT, REPO, engineRoot, engineVersion, engineRoots, evalDir, evalFile, EVAL };
