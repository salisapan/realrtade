// Compare inbound show/quiet vs aaa15fa on the pre-attach-evidence fixture rows.
// Run: node test/compare-inbound-flips-aaa15fa.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'aaa15fa';
const CORE_FILES = [
  'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
  'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js',
  'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js', 'suggest-save.js'
];

function loadJudge(fileContents) {
  const engine = { module: undefined, console };
  vm.createContext(engine);
  for (const f of CORE_FILES) {
    const src = fileContents[f] || fs.readFileSync(path.join(ROOT, 'core', f), 'utf8');
    vm.runInContext(src, engine, { filename: f });
  }
  return vm.runInContext('FlowIncomingJudge', engine);
}

function gitShow(file) {
  return execSync(`git show ${BASE}:flow-trial-extension/core/${file}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

const baseContents = {};
for (const f of CORE_FILES) {
  try {
    baseContents[f] = gitShow(f);
  } catch (e) {
    console.error(`compare-inbound-flips-aaa15fa: could not read base ${BASE} for core/${f}: ${e.message || e}`);
    console.error('Fetch the base commit (git fetch origin) and ensure aaa15fa exists in this clone.');
    process.exit(2);
  }
}
const JBase = loadJudge(baseContents);
const JNow = loadJudge({});

const fixturePath = path.join(__dirname, 'fixtures', 'regress-144-all-rounds.jsonl');
const rows = fs.readFileSync(fixturePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const legacy = rows.filter((r) => !String(r.id || '').startsWith('attach-quiet-'));

const OWN_GMAIL = 'ai.local.flow@gmail.com';
const OWN_OUTLOOK = 'glance.salisapan@outlook.com';
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];

function parseFrom(raw) {
  const text = String(raw || '');
  const m = text.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (text.indexOf('@') !== -1) return { name: '', email: text.trim() };
  return { name: text.trim(), email: '' };
}

function contextOf(row) {
  const note = String(row.note || '');
  const own = [OWN_GMAIL, OWN_OUTLOOK];
  const inSent = /sentitems|folder=sent/i.test(note);
  const forwarded = /forwarded message|הודעה שהועברה|FW: others/i.test(note)
    || /----------\s*Forwarded message/i.test(row.body || '')
    || /הודעה שהועברה/.test(row.body || '');
  const blob = String(row.subject || '') + '\n' + String(row.body || '');
  const attachmentCount = /attach|מצורף/i.test(blob) ? 1 : 0;
  const ctx = row.context || null;
  const outbound = Boolean(ctx && ctx.from === 'user' && ctx.to === 'other');
  return { own, inSent, forwarded, attachmentCount, outbound };
}

function judge(J, row, surface, ctx) {
  const from = parseFrom(row.from);
  const sender = from.email ? from : { name: from.name || 'Dana Levi', email: 'dana@acme.io' };
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: sender,
    surface: surface,
    attachmentCount: ctx.attachmentCount,
    to: row.to || [],
    cc: row.cc || [],
    ownAddresses: ctx.own,
    userName: row.userName || 'Sali',
    ownNames: Array.isArray(row.ownNames) ? row.ownNames : NAMES,
    direction: (ctx.outbound || ctx.inSent) ? 'outbound' : 'inbound',
    inbound: !(ctx.outbound || ctx.inSent),
    inSent: ctx.inSent,
    forwarded: ctx.forwarded,
    threadUrl: 'https://example.invalid/t',
    now: new Date('2026-10-16T12:00:00')
  });
}

function bucket(out) {
  return out && out.show === true ? 'offer' : 'quiet';
}

let flips = 0;
const flipRows = [];
for (const row of legacy) {
  const ctx = contextOf(row);
  if (ctx.outbound || ctx.inSent) continue;
  for (const surface of ['gmail', 'outlook']) {
    const a = bucket(judge(JBase, row, surface, ctx));
    const b = bucket(judge(JNow, row, surface, ctx));
    if (a !== b) {
      flips++;
      if (flipRows.length < 20) flipRows.push({ id: row.id, surface, base: a, now: b });
    }
  }
}

console.log('inbound flip count vs ' + BASE + ' on ' + legacy.length + ' legacy rows (both surfaces): ' + flips);
if (flipRows.length) console.log('sample flips:', JSON.stringify(flipRows, null, 2));
process.exit(flips ? 1 : 0);
