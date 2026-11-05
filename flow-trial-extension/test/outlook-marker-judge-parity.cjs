// Judge parity: bundled server judge matches extension-shaped input on regress-144 inbound rows.
// Run: node test/outlook-marker-judge-parity.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'regress-144-all-rounds.jsonl');
const BUNDLE = path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'judge.bundle.mjs');
const { FlowOutlookGraphMarker: M } = require('../core/outlook-graph-marker.js');

const OWN = ['ai.local.flow@gmail.com', 'glance.salisapan@outlook.com'];
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];

function loadVmJudge() {
  const engine = { module: undefined, console: global.console };
  vm.createContext(engine);
  const stack = [
    'domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'channel.js', 'request-types.js', 'follow-up.js', 'name-match.js', 'intent.js',
    'file-attach.js', 'actions.js', 'system-notice.js', 'resolution.js', 'draft-reply.js', 'quiet-metrics.js',
    'commitment-title.js', 'display-copy.js', 'incoming-judge.js', 'graph-mail.js', 'outlook-marker-judge.js'
  ];
  stack.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
  });
  return {
    J: vm.runInContext('FlowIncomingJudge', engine),
    OMJ: vm.runInContext('FlowOutlookMarkerJudge', engine)
  };
}

function parseFrom(raw) {
  const text = String(raw || '');
  const m = text.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (text.indexOf('@') !== -1) return { name: '', email: text.trim() };
  return { name: text.trim(), email: '' };
}

function contextOf(row) {
  const note = String(row.note || '');
  const own = OWN.slice();
  if (/sali@northwind\.co\.il/i.test(note) && /alias|own addresses/i.test(note)) own.push('sali@northwind.co.il');
  const behalf = note.match(/sender=(\S+@\S+)/i);
  const onBehalf = behalf ? behalf[1].replace(/[;,).]*$/, '') : null;
  const inSent = /sentitems|folder=sent/i.test(note);
  const forwarded = /forwarded message|הודעה שהועברה|FW: others/i.test(note)
    || /----------\s*Forwarded message/i.test(row.body || '')
    || /הודעה שהועברה/.test(row.body || '');
  const blob = String(row.subject || '') + '\n' + String(row.body || '');
  const attachmentCount = /attach|מצורף/i.test(blob) ? 1 : 0;
  const outbound = Boolean(row.context && row.context.from === 'user' && row.context.to === 'other');
  return { own, onBehalf, inSent, forwarded, attachmentCount, outbound };
}

function rowToGraph(row, ctx) {
  const from = parseFrom(row.from);
  return {
    subject: row.subject || '',
    body: { contentType: 'text', content: row.body || '' },
    from: { emailAddress: { name: from.name, email: from.email || 'dana@acme.io' } },
    toRecipients: (row.to || []).map((a) => ({ emailAddress: { address: a } })),
    ccRecipients: (row.cc || []).map((a) => ({ emailAddress: { address: a } })),
    hasAttachments: ctx.attachmentCount > 0,
    attachments: ctx.attachmentCount > 0 ? [{ id: 'a1', isInline: false }] : []
  };
}

(async () => {
  const bundle = await import(BUNDLE);
  const { J, OMJ } = loadVmJudge();
  let inbound = 0;
  let showDiff = 0;
  let laneDiff = 0;
  for (const line of fs.readFileSync(FIXTURE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const ctx = contextOf(row);
    if (ctx.outbound || ctx.inSent) continue;
    inbound += 1;
    const msg = rowToGraph(row, ctx);
    const opts = {
      userName: row.userName || 'Sali',
      ownNames: Array.isArray(row.ownNames) ? row.ownNames : NAMES,
      onBehalfOf: ctx.onBehalf,
      forwarded: ctx.forwarded,
      now: new Date('2026-10-16T12:00:00')
    };
    const ext = J.judge(OMJ.buildJudgeInput(msg, ctx.own, opts));
    const srv = bundle.judgeOutlookInboxMessage(msg, ctx.own, opts);
    if (!!(ext && ext.show) !== !!(srv && srv.show)) showDiff += 1;
    if (M.doItLane(ext) !== M.doItLane(srv)) laneDiff += 1;
  }
  console.log('inbound rows', inbound);
  console.log('show disagreements', showDiff);
  console.log('do-it lane disagreements', laneDiff);
  if (showDiff !== 0 || laneDiff !== 0) process.exit(1);
  console.log('outlook-marker-judge-parity: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
