// Strict pass/fail for CTO "ten known" rows: expectations frozen at aaa15fa fixture.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'aaa15fa';
const IDS = [
  'v2syn-2008', 'v2syn-8473', 'v2syn-5860', 'v2syn-26202', 'v2syn-2024', 'v2syn-14861', 'v2syn-1917',
  'v2rtest-request-types-corpus-1586', 'v2rtest-intent-actions-corpus-889', 'v2rtest-close-families-corpus-266'
];

const CORE = [
  'domains.js', 'extract.js', 'judgment.js', 'file-attach.js', 'google-closes.js', 'close-families.js',
  'fact-reply.js', 'intent.js', 'actions.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js',
  'commitment-title.js', 'display-copy.js', 'suggest-save.js'
];

function loadJudge(contents) {
  const engine = { module: undefined, console };
  vm.createContext(engine);
  for (const f of CORE) {
    vm.runInContext(contents[f], engine, { filename: f });
  }
  return vm.runInContext('FlowIncomingJudge', engine);
}

function gitCore(ref) {
  const out = {};
  for (const f of CORE) {
    out[f] = execSync(`git show ${ref}:flow-trial-extension/core/${f}`, { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  }
  return out;
}

const baseRows = execSync(`git show ${BASE}:flow-trial-extension/test/fixtures/regress-144-all-rounds.jsonl`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  .trim().split('\n').map((l) => JSON.parse(l));
const byId = Object.fromEntries(baseRows.map((r) => [r.id, r]));

const headCore = {};
for (const f of CORE) headCore[f] = fs.readFileSync(path.join(ROOT, 'core', f), 'utf8');
const JBase = loadJudge(gitCore(BASE));
const JHead = loadJudge(headCore);

const OWN = ['ai.local.flow@gmail.com', 'glance.salisapan@outlook.com'];
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];

function parseFrom(raw) {
  const m = String(raw || '').match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: '', email: String(raw || '').trim() };
}

function ctx(row) {
  const blob = String(row.subject || '') + '\n' + String(row.body || '');
  return { attachmentCount: /attach|מצורף/i.test(blob) ? 1 : 0 };
}

function verdict(J, row) {
  const from = parseFrom(row.from);
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: from.email ? from : { name: 'Dana', email: 'dana@acme.io' },
    surface: 'gmail',
    attachmentCount: ctx(row).attachmentCount,
    to: row.to || [],
    cc: row.cc || [],
    ownAddresses: OWN,
    userName: 'Sali',
    ownNames: NAMES,
    inbound: true,
    now: new Date('2026-10-16T12:00:00')
  });
}

function strictPass(row, g) {
  const v = {
    show: g.show ? 'offer' : 'quiet',
    type: g.intent && g.intent.type || '',
    proc: g.process && g.process.id || ''
  };
  if (row.expected === 'quiet') return v.show === 'quiet';
  if (row.expected !== 'offer') return true;
  if (v.show !== 'offer') return false;
  const k = row.expectKind || '';
  if (k === 'request') return v.proc === 'reply-track' || v.type === 'request';
  if (k === 'decision') return v.type === 'decision' || v.proc === 'file-it' || v.proc === 'log-it';
  if (k === 'task') return v.type === 'event' && v.proc === 'log-it';
  if (k === 'event') return v.type === 'event';
  if (k === 'task/dated-commitment') return v.type === 'decision' && v.proc === 'log-it';
  return true;
}

let baseFail = 0;
let headFail = 0;
console.log('strict expectations from aaa15fa fixture | gmail judgment base vs HEAD');
for (const id of IDS) {
  const row = byId[id];
  if (!row) {
    console.log(id + ' | MISSING');
    continue;
  }
  const b = verdict(JBase, row);
  const h = verdict(JHead, row);
  const bp = strictPass(row, b);
  const hp = strictPass(row, h);
  if (!bp) baseFail += 1;
  if (!hp) headFail += 1;
  const fmt = (g) => (g.show ? 'offer' : 'quiet') + '(' + (g.intent && g.intent.type || '') + ',' + (g.process && g.process.id || '') + ')';
  console.log([
    id,
    row.expected + (row.expectKind ? '/' + row.expectKind : ''),
    fmt(b),
    fmt(h),
    bp ? 'PASS' : 'FAIL',
    hp ? 'PASS' : 'FAIL'
  ].join(' | '));
}
console.log('strict summary: baseFail=' + baseFail + ' headFail=' + headFail);
