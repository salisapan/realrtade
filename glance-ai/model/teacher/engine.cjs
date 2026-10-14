'use strict';
// Multi-engine loader (v2). Same host composition as teacher.cjs (kept unchanged for v1 reproducibility), but any core
// root can be loaded side by side. The default root is this repo's flow-trial-extension (the tip). Older unpacked
// builds are loaded only when GLANCE_ENGINE_ROOTS names them. Read-only. See glance-ai/paths.cjs.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { engineRoots } = require('../../paths.cjs');
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js',
  'incoming-judge.js', 'outlook-calendar.js', 'draft-reply.js'];
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
const STEP_NEUTRAL = { gmailDraft: 'draft', outlookDraft: 'draft', googleTask: 'task', googleTasks: 'task', outlookTask: 'task', calendar: 'calendar', outlookCalendar: 'calendar', driveFile: 'file_save', onedriveFile: 'file_save' };
const neutral = (k) => STEP_NEUTRAL[k] || k;
const cache = {};
function makeEngine(name) {
  if (cache[name]) return cache[name];
  const roots = engineRoots();
  const named = roots[name];
  const root = named || (name && name !== 'tip' && fs.existsSync(path.join(String(name), 'core', 'intent.js')) ? String(name) : null);
  if (!root || !fs.existsSync(path.join(root, 'core', 'intent.js'))) return null;
  const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, exports: {}, TextEncoder, atob, btoa };
  sb.globalThis = sb; vm.createContext(sb);
  for (const f of FILES) { const p = path.join(root, 'core', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: name + '/' + f }); }
  const g = (n) => { try { return vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb); } catch (e) { return null; } };
  const FI = g('FlowIntent'), FA = g('FlowActions'), J = g('FlowIncomingJudge'), G = g('FlowGoogleCloses'), OC = g('FlowOutlookCalendar'), GM = g('FlowGraphMail'), FX = g('FlowExtract'), FJ = g('FlowJudgment');
  const DEPS = { intent: FI, actions: FA, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
  const familyOf = (i) => i ? (i.personalClose || (i.googleClose && i.googleClose.personalClose) || i.type || null) : null;
  function out(show, reason, intent, steps) {
    const st = (steps || []).map((s) => s.kind);
    const fam = show ? familyOf(intent) : null;
    const primary = show && st.length ? neutral(st[0]) : null;
    return { show, reason: show ? 'show' : reason, type: intent && intent.type || null, family: fam, steps: st, primaryStep: primary, label: show ? (fam + '|' + primary) : 'SILENT' };
  }
  function teach(c) {
    const surface = c.surface === 'outlook' ? 'outlook' : 'gmail';
    const own = OWN[surface];
    const from = c.from || {};
    const fromOwn = String(from.email || '').toLowerCase() === own;
    const to = (c.to || []).map((x) => String(x).toLowerCase());
    const body = String(c.body || '');
    try {
      if (surface === 'gmail') {
        if (fromOwn && G.messageToJudge([[own].concat(to)], own) < 0) return out(false, 'own-sender', null);
        const r = J.judge({ text: body, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
          threadUrl: 'https://mail.google.com/x', hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: 'gmail' }, DEPS);
        if (r.show) return out(true, null, r.intent, r.process.steps);
        return out(false, r.intent && r.intent.googleWait ? 'google-wait(drive-lookup)' : r.reason, r.intent);
      }
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
    } catch (e) { return out(false, 'engine-error', null); }
  }
  function preprocess(c) {
    let own = String(c.body || '');
    try { own = GM && GM.ownText ? GM.ownText(own) : own; if (FJ && FJ.newContent) own = FJ.newContent(own); } catch (e) { /* keep */ }
    let facts = {};
    try {
      const f = FX.extract(own, { senderEmail: (c.from || {}).email || null, now: NOW }) || {};
      const iso = f.date && f.date.iso; const today = NOW.toISOString().slice(0, 10);
      facts = { date: iso ? (iso < today ? 'past' : 'future') : 'none', time: Boolean(f.time), money: Boolean(f.money) };
    } catch (e) { facts = { date: 'err' }; }
    return { own, facts };
  }
  cache[name] = { name, root, teach, preprocess, DEPS, FI, G, GM };
  return cache[name];
}
module.exports = { makeEngine, get ROOTS() { return engineRoots(); }, engineRoots, OWN, NOW, neutral };
