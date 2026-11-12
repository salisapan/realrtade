'use strict';
// Multi-engine loader (v2). Same host composition as teacher.cjs (kept unchanged for v1 reproducibility), but any core
// root can be loaded side by side. The default root is this repo's flow-trial-extension (the tip). Older unpacked
// builds are loaded only when GLANCE_ENGINE_ROOTS names them. Read-only. See glance-ai/paths.cjs.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { engineRoots } = require('../../paths.cjs');
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js',
  'incoming-judge.js', 'outlook-calendar.js', 'draft-reply.js', 'intent-decompose.js'];  // intent-decompose.js only defines FlowIntentDecompose; teach() never calls it
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
// The engine reads the clock (new Date(), Date.now()) to decide whether a date in the mail is past. Freeze it to GLANCE_NOW so a
// dataset built on a later day is the same dataset (found 2026-10-19: "by October 14" turned silent once the real day passed it).
function freezeClock(sb, vm, now) {
  vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; globalThis.Date = F; })(' + now.getTime() + ')', sb);
}
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
  sb.globalThis = sb; vm.createContext(sb); freezeClock(sb, vm, NOW);
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
  // What the browser host passes besides the text (src/content-*.js): the recipients, the mailbox's own address, the person's
  // names and the direction. Without them the tip engine holds every greeted mail as names-pending and its Cc-only and
  // addressed-to-other rules never see the recipients (found 2026-10-19). Only GLANCE_HOST_CTX=0 turns it off, so the pinned
  // 0.9.35 dataset can be checked both ways; 0.9.35 reads none of these fields.
  function hostCtx(c, own) {
    if (process.env.GLANCE_HOST_CTX === '0') return {};
    const names = Array.isArray(c.ownNames) ? c.ownNames : [];
    return { to: c.to || [], cc: c.cc || [], ownAddresses: [own], ownNames: names, userName: names[0] || null,
      direction: c.direction || null, inbound: c.direction === 'inbound', namesWaitDone: true };
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
        const r = J.judge(Object.assign({ text: body, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
          threadUrl: 'https://mail.google.com/x', hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: 'gmail' }, hostCtx(c, own)), DEPS);
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
      const r = J.judge(Object.assign({ text, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
        threadUrl: 'https://outlook.live.com/x', hasThreadAttachment: n === 1, attachmentCount: n, surface: 'outlook' }, hostCtx(c, own)), DEPS);
      if (r.show) return out(true, null, r.intent, r.process.steps);
      return out(false, r.reason, r.intent);
    } catch (e) { return out(false, 'engine-error', null); }
  }
  // decompose(c): the whole-mail judge exactly as teach() builds its input, then core/intent-decompose.js asks the same judge about each
  // clause (Decompose v1, lab only, switch forced on here). Returns { whole, intentions:[parts], reason }.
  function decompose(c) {
    const D = g('FlowIntentDecompose');
    if (!D) return { whole: { show: false, reason: 'no-decompose' }, intentions: [] };
    const surface = c.surface === 'outlook' ? 'outlook' : 'gmail';
    const own = OWN[surface];
    const from = c.from || {};
    const fromOwn = String(from.email || '').toLowerCase() === own;
    const to = (c.to || []).map((x) => String(x).toLowerCase());
    const body = String(c.body || '');
    const quiet = (reason) => ({ whole: { show: false, reason }, intentions: [], reason: 'whole-mail-quiet' });
    try {
      let input, whole = null;
      if (surface === 'gmail') {
        if (fromOwn && G.messageToJudge([[own].concat(to)], own) < 0) return quiet('own-sender');
        input = Object.assign({ text: body, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
          threadUrl: 'https://mail.google.com/x', hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: 'gmail' }, hostCtx(c, own));
      } else {
        const text = GM && GM.ownText ? GM.ownText(body) : body;
        if (OC) {
          const probe = OC.decide({ text, subject: c.subject || '', senderEmail: from.email || null, senderName: from.name || null, now: NOW });
          if (probe && probe.move === 'hold') whole = { show: true, intent: probe.intent, process: { id: 'hold', name: 'Hold It', steps: [{ kind: 'outlookCalendar' }] } };
          else if (probe && probe.move === 'wait') return quiet('calendar-wait(file-lookup)');
          else if (probe && probe.move === 'silent') return quiet('calendar-' + probe.reason);
        }
        if (!whole && fromOwn) return quiet(to.length && to.every((t) => t === own) ? 'note-to-self' : 'own-sender');
        const n = G.needsOneAttachment(text) ? (c.attachmentCount || 0) : 0;
        input = Object.assign({ text, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
          threadUrl: 'https://outlook.live.com/x', hasThreadAttachment: n === 1, attachmentCount: n, surface: 'outlook' }, hostCtx(c, own));
      }
      if (!whole) whole = J.judge(input, DEPS);
      const newText = FJ && FJ.newContent ? FJ.newContent(input.text) : input.text;
      const r = D.decompose({ aiDecomposeV1: true }, { text: newText, whole, sender: input.sender, vetoText: (c.subject ? c.subject + '\n' : '') + input.text },
        { judgeText: (t) => J.judge(Object.assign({}, input, { text: t }), DEPS), phishing: (t) => (FI && typeof FI.phishingOrNegative === 'function' ? FI.phishingOrNegative(t) : false) });
      return { whole: r.whole, intentions: r.intentions || [], reason: r.reason || null };
    } catch (e) { return { whole: { show: false, reason: 'engine-error' }, intentions: [], reason: 'engine-error:' + e.message }; }
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
  cache[name] = { name, root, teach, decompose, preprocess, DEPS, FI, G, GM };
  return cache[name];
}
module.exports = { makeEngine, get ROOTS() { return engineRoots(); }, engineRoots, OWN, NOW, neutral };
