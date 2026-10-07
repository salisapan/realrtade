'use strict';
// Teacher = the deterministic Glance 0.9.34 engine (read-only, loaded from the unpacked tip in a vm realm,
// the way content scripts load it). Composes the same host order as src/content-gmail.js / src/content-outlook.js:
//   Gmail:   own mail to someone else -> silent (messageToJudge = -1); note-to-self is judged; else FlowIncomingJudge.judge(surface gmail)
//   Outlook: FlowOutlookCalendar.decide probe first; own sender -> silent (note-to-self / own-sender);
//            attachmentCount only when needsOneAttachment(text); FlowIncomingJudge.judge(surface outlook)
// Host-runtime steps we cannot run offline (Drive lookup, Graph file chain) are labeled silent with an explicit reason.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.GLANCE_TIP || process.env.GLANCE_ENGINE_ROOT || require('../../paths.cjs').engineRoot();
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js',
  'incoming-judge.js', 'outlook-calendar.js', 'draft-reply.js'];
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, exports: {}, TextEncoder, atob, btoa };
sb.globalThis = sb; vm.createContext(sb);
for (const f of FILES) { const p = path.join(ROOT, 'core', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); }
const g = (n) => { try { return vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb); } catch (e) { return null; } };
const FI = g('FlowIntent'), FA = g('FlowActions'), J = g('FlowIncomingJudge'), G = g('FlowGoogleCloses'), OC = g('FlowOutlookCalendar'), GM = g('FlowGraphMail');
const DEPS = { intent: FI, actions: FA, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');

const STEP_NEUTRAL = { gmailDraft: 'draft', outlookDraft: 'draft', googleTask: 'task', googleTasks: 'task', outlookTask: 'task', calendar: 'calendar', outlookCalendar: 'calendar', driveFile: 'file_save', onedriveFile: 'file_save' };
function neutral(kind) { return STEP_NEUTRAL[kind] || kind; }

// Family = the close family the card would carry (personalClose tag is the most specific; else the intent type).
function familyOf(intent) {
  if (!intent) return null;
  return intent.personalClose || (intent.googleClose && intent.googleClose.personalClose) || intent.type || null;
}

function out(show, reason, intent, steps, extra) {
  const st = (steps || []).map((s) => s.kind);
  const fam = show ? familyOf(intent) : null;
  const primary = show && st.length ? neutral(st[0]) : null;
  return Object.assign({
    show, reason: show ? 'show' : reason,
    type: intent && intent.type || null, quiet: intent && intent.quiet || null,
    family: fam, closeFamily: intent && intent.closeFamily || null,
    steps: st, primaryStep: primary,
    label: show ? (fam + '|' + primary) : 'SILENT'
  }, extra || {});
}

function teach(c) {
  const surface = c.surface === 'outlook' ? 'outlook' : 'gmail';
  const own = OWN[surface];
  const from = c.from || {};
  const fromOwn = String(from.email || '').toLowerCase() === own;
  const to = (c.to || []).map((x) => String(x).toLowerCase());
  const body = String(c.body || '');
  if (surface === 'gmail') {
    if (fromOwn) {
      const lists = [[own].concat(to)];
      if (G.messageToJudge(lists, own) < 0) return out(false, 'own-sender', null);
    }
    const r = J.judge({ text: body, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
      threadUrl: 'https://mail.google.com/x', hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: 'gmail' }, DEPS);
    if (r.show) return out(true, null, r.intent, r.process.steps);
    let reason = r.reason;
    if (r.intent && r.intent.googleWait) reason = 'google-wait(drive-lookup)';
    return out(false, reason, r.intent);
  }
  // outlook
  const text = GM && GM.ownText ? GM.ownText(body) : body;
  if (OC) {
    const probe = OC.decide({ text, subject: c.subject || '', senderEmail: from.email || null, senderName: from.name || null, now: NOW });
    if (probe && probe.move === 'hold') return out(true, null, probe.intent, [{ kind: 'outlookCalendar' }]);
    if (probe && probe.move === 'wait') return out(false, 'calendar-wait(file-lookup)', null);
    if (probe && probe.move === 'silent') return out(false, 'calendar-' + probe.reason, null);
  }
  if (fromOwn) return out(false, to.length && to.every((t) => t === own) ? 'note-to-self' : 'own-sender', null);
  const n = G.needsOneAttachment(text) ? (c.attachmentCount || 0) : 0;
  const r = J.judge({ text, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
    threadUrl: 'https://outlook.live.com/x', hasThreadAttachment: n === 1, attachmentCount: n, surface: 'outlook' }, DEPS);
  if (r.show) return out(true, null, r.intent, r.process.steps);
  return out(false, r.reason, r.intent);
}

// Shared deterministic preprocessing for the model (NOT judgment): the message's own text (quoted history cut, same
// FlowGraphMail.ownText the Outlook host uses) and the extractor's parsed facts (date future/past, clock, money).
const FX = g('FlowExtract'), FJ = g('FlowJudgment');
function preprocess(c) {
  const body = String(c.body || '');
  let own = GM && GM.ownText ? GM.ownText(body) : body;
  try { if (FJ && FJ.newContent) own = FJ.newContent(own); } catch (e) { /* keep own */ }
  let facts = {};
  try {
    const f = FX.extract(own, { senderEmail: (c.from || {}).email || null, now: NOW }) || {};
    const iso = f.date && f.date.iso;
    const today = NOW.toISOString().slice(0, 10);
    facts = { date: iso ? (iso < today ? 'past' : 'future') : 'none', time: Boolean(f.time), money: Boolean(f.money) };
  } catch (e) { facts = { date: 'err' }; }
  return { own, facts };
}
module.exports = { preprocess, teach, OWN, NOW, FI, FA, J, G, OC, GM, DEPS, sb, neutral };
if (require.main === module) {
  const c = JSON.parse(process.argv[2]);
  console.log(JSON.stringify(teach(c)));
}
