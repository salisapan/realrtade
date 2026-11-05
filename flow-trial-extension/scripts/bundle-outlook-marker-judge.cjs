#!/usr/bin/env node
// Rebuild judge.bundle.mjs for supabase/functions/outlook-graph-marker (single scope, same as regress-144 vm).
const fs = require('fs');
const path = require('path');

const extRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..');
const core = path.join(extRoot, 'core');
const out = path.join(repoRoot, 'supabase', 'functions', 'outlook-graph-marker', 'judge.bundle.mjs');

const STACK = [
  'domains.js',
  'extract.js',
  'judgment.js',
  'source-text.js',
  'google-closes.js',
  'close-families.js',
  'fact-reply.js',
  'channel.js',
  'request-types.js',
  'follow-up.js',
  'name-match.js',
  'intent.js',
  'file-attach.js',
  'actions.js',
  'system-notice.js',
  'resolution.js',
  'draft-reply.js',
  'quiet-metrics.js',
  'commitment-title.js',
  'display-copy.js',
  'incoming-judge.js',
  'graph-mail.js',
  'outlook-marker-judge.js'
];

function stripModuleExports(src) {
  return src.replace(/if \(typeof module !== 'undefined'\) module\.exports = \{[^}]+\};?\s*/g, '')
    .replace(/else if \(typeof globalThis !== 'undefined'\) globalThis\.[^;]+;\s*/g, '');
}

let body = '';
for (const file of STACK) {
  const src = fs.readFileSync(path.join(core, file), 'utf8');
  body += stripModuleExports(src) + '\n';
}

const footer = `
export function buildJudgeInput(msg, ownAddresses, opts) {
  return FlowOutlookMarkerJudge.buildJudgeInput(msg, ownAddresses, opts);
}
export function judgeOutlookInboxMessage(msg, ownAddresses, opts) {
  return FlowOutlookMarkerJudge.judgeOutlookInboxMessage(msg, ownAddresses, opts);
}
`;

fs.writeFileSync(out, body + footer, 'utf8');
console.log('Wrote', out);
