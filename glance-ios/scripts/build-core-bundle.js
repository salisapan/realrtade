#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..', '..');
const core = path.join(repo, 'flow-trial-extension', 'core');
const out = path.join(__dirname, '..', 'assets', 'core-bundle.js');

const files = [
  'domains.js', 'day-words.js', 'extract.js', 'judgment.js', 'google-closes.js',
  'close-families.js', 'fact-reply.js', 'file-attach.js', 'draft-reply.js',
  'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'incoming-judge.js'
].map((n) => path.join(core, n));

const footer = [
  '',
  'var GlanceNativeBridge = {',
  '  judge: function (input) { return FlowIncomingJudge.judge(input || {}, {}); },',
  '  draftText: function (process, ctx) { return FlowIncomingJudge.draftText(process, ctx || {}); }',
  '};',
  ''
].join('\n');

const body = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n\n');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '// Glance iOS shared core bundle\n' + body + footer);
console.log('wrote ' + path.relative(repo, out));
