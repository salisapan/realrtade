/* Glance shadow tier, CONTENT-SCRIPT side (v2.2 drop-in package).
 * Runs where the engine core globals live (FlowIncomingJudge, FlowGoogleCloses, FlowOutlookCalendar, FlowGraphMail, FlowExtract,
 * FlowJudgment, FlowFileAttach ...). Turns one judged message into a TEXT-FREE ShadowInput: enums, numbers and hashed feature
 * index lists. Text (body, subject, own text) is used in memory only and never leaves this function.
 * Mirrors runtime/pipeline-v21.cjs + teacher/engine.cjs (teach / preprocess) + runtime/veto-v2.cjs exactly.
 * Registers self.GlanceShadow.prepare. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});
  var req = typeof require === 'function' ? require : null;
  var T = NS.text || req('./gs-text.js');
  var F = NS.features || req('./gs-features.js');
  var RX = T.RX;
  var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };

  // ---------- engine adapter (same composition as teacher/engine.cjs; the extension passes its live core objects)
  function coreFromGlobals(g) {
    g = g || root;
    var get = function (n) { return typeof g[n] !== 'undefined' ? g[n] : null; };
    return { J: get('FlowIncomingJudge'), G: get('FlowGoogleCloses'), OC: get('FlowOutlookCalendar'), GM: get('FlowGraphMail'), FX: get('FlowExtract'), FJ: get('FlowJudgment'),
      DEPS: { intent: get('FlowIntent'), actions: get('FlowActions'), factReply: get('FlowFactReply'), fileAttach: get('FlowFileAttach'), resolution: get('FlowResolution'), quietMetrics: get('FlowQuietMetrics') } };
  }
  var STEP_NEUTRAL = { gmailDraft: 'draft', outlookDraft: 'draft', googleTask: 'task', googleTasks: 'task', outlookTask: 'task', calendar: 'calendar', outlookCalendar: 'calendar', driveFile: 'file_save', onedriveFile: 'file_save' };
  var neutral = function (k) { return STEP_NEUTRAL[k] || k; };
  var familyOf = function (i) { return i ? (i.personalClose || (i.googleClose && i.googleClose.personalClose) || i.type || null) : null; };
  function verdict(show, reason, intent, steps) {
    var st = (steps || []).map(function (s) { return s.kind; });
    var fam = show ? familyOf(intent) : null;
    var primary = show && st.length ? neutral(st[0]) : null;
    return { show: show, reason: show ? 'show' : reason, label: show ? (fam + '|' + primary) : 'SILENT' };
  }
  // Map a FlowIncomingJudge.judge(...) result the extension already has to the incumbent verdict (no re-run).
  function verdictFromJudge(r) {
    if (!r) return verdict(false, 'engine-error', null);
    if (r.show) return verdict(true, null, r.intent, r.process && r.process.steps);
    return verdict(false, r.intent && r.intent.googleWait ? 'google-wait(drive-lookup)' : (r.reason || 'intent-null'), r.intent);
  }
  function teach(core, c, ctx) {
    var surface = c.surface === 'outlook' ? 'outlook' : 'gmail';
    var own = String(ctx.ownEmail || '').toLowerCase();
    var from = c.from || {};
    var fromOwn = String(from.email || '').toLowerCase() === own;
    var to = (c.to || []).map(function (x) { return String(x).toLowerCase(); });
    var body = String(c.body || '');
    var J = core.J, G = core.G, OC = core.OC, GM = core.GM, DEPS = core.DEPS, NOW = ctx.now;
    try {
      if (surface === 'gmail') {
        if (fromOwn && G.messageToJudge([[own].concat(to)], own) < 0) return verdict(false, 'own-sender', null);
        var r = J.judge({ text: body, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
          threadUrl: 'https://mail.google.com/x', hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: 'gmail' }, DEPS);
        if (r.show) return verdict(true, null, r.intent, r.process.steps);
        return verdict(false, r.intent && r.intent.googleWait ? 'google-wait(drive-lookup)' : r.reason, r.intent);
      }
      var text = GM && GM.ownText ? GM.ownText(body) : body;
      if (OC) {
        var probe = OC.decide({ text: text, subject: c.subject || '', senderEmail: from.email || null, senderName: from.name || null, now: NOW });
        if (probe && probe.move === 'hold') return verdict(true, null, probe.intent, [{ kind: 'outlookCalendar' }]);
        if (probe && probe.move === 'wait') return verdict(false, 'calendar-wait(file-lookup)', null);
        if (probe && probe.move === 'silent') return verdict(false, 'calendar-' + probe.reason, null);
      }
      if (fromOwn) return verdict(false, to.length && to.every(function (t) { return t === own; }) ? 'note-to-self' : 'own-sender', null);
      var n = G.needsOneAttachment(text) ? (c.attachmentCount || 0) : 0;
      var r2 = J.judge({ text: text, subject: c.subject || '', sender: { name: from.name || null, email: from.email || null }, now: NOW,
        threadUrl: 'https://outlook.live.com/x', hasThreadAttachment: n === 1, attachmentCount: n, surface: 'outlook' }, DEPS);
      if (r2.show) return verdict(true, null, r2.intent, r2.process.steps);
      return verdict(false, r2.reason, r2.intent);
    } catch (e) { return verdict(false, 'engine-error', null); }
  }
  function preprocess(core, c, ctx) {
    var own = String(c.body || ''); var GM = core.GM, FJ = core.FJ, FX = core.FX, NOW = ctx.now;
    try { own = GM && GM.ownText ? GM.ownText(own) : own; if (FJ && FJ.newContent) own = FJ.newContent(own); } catch (e) { /* keep */ }
    var facts = {};
    try {
      var f = FX.extract(own, { senderEmail: (c.from || {}).email || null, now: NOW }) || {};
      var iso = f.date && f.date.iso; var today = NOW.toISOString().slice(0, 10);
      facts = { date: iso ? (iso < today ? 'past' : 'future') : 'none', time: Boolean(f.time), money: Boolean(f.money) };
    } catch (e) { facts = { date: 'err' }; }
    return { own: own, facts: facts };
  }

  // ---------- silence-only veto inputs (runtime/veto-v2.cjs)
  var BASE = new Set(['own-sender', 'note-to-self', 'quiet:noise', 'quiet:hedge', 'quiet:google', 'quiet:family', 'third-party', 'file',
    'file-chain-not-run', 'fact-reply-block', 'no-draft-close', 'too-short', 'google-wait(drive-lookup)', 'calendar-wait(file-lookup)']);
  var INJECT = /ignore (?:all |any )?(?:previous|prior) instructions|\bsystem:|new bank account|wire [^.]{0,20}(?:to|into) (?:the )?(?:new|this) account|account\s+\d{2}-\d{3}|התעלם מכל ההוראות|לחשבון הבנק החדש|חשבון בנק חדש/i;
  var QUOTED_ONLY = /^\s*(?:fyi|fwd?|forwarding|להלן|מעביר)[^\n]*\n\s*\n?\s*(?:on .{0,80} wrote:|-----\s*original message|-{5,}\s*forwarded message|בתאריך .{0,80} נכתב:)/i;
  var OTHER_TARGET = /\bshared\s+(?:folder|drive)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|שרפוינט|דרופבוקס/i;
  function baseVeto(eng) { if (!eng || eng.show) return null; var r = eng.reason || ''; return BASE.has(r) || r.indexOf('calendar-') === 0 ? r : null; }
  function productVeto(c, own, ownEmail) {
    if ((c.direction || 'inbound') !== 'inbound') return null;
    var voc = T.addresseeOf(own, c.ownNames || []), role = T.recipientRole(c, ownEmail);
    if (INJECT.test(own)) return 'payment-injection';
    if (QUOTED_ONLY.test(String(c.body || ''))) return 'quoted-only';
    if (T.negatedOnly(own)) return 'negated-ask';
    if (c.surface === 'gmail' && RX.ONEDRIVE.test(own) && RX.SAVE_VERB.test(own)) return 'gmail-onedrive-target';
    if ((RX.NO_ACTION_HE.test(own) || RX.NO_ACTION_EN.test(own)) && !RX.POS_ACTION_HE.test(own)) return 'no-action-fyi';
    if (voc === 'other') return 'addressed-to-other';
    if (role === 'cc-only' && voc !== 'own') return 'cc-only';
    if (RX.MARKETING.test(own) || RX.MARKETING.test(c.subject || '')) return 'marketing';
    if (RX.CONDITIONAL.test(own)) return 'conditional-undecided';
    if (RX.SAVE_VERB.test(own) && OTHER_TARGET.test(own)) return 'save-target-not-drive';
    return null;
  }
  function capFlags(c, own, fileAttach) {
    var g = fileAttach && fileAttach.gate ? fileAttach.gate(own) : null;
    return { draft: (c.direction || 'inbound') === 'self' ? 'cap:no-draft-to-self' : (g && g.kind !== 'ignore' ? 'cap:file-chain-owns' : null),
      file_save: Number(c.attachmentCount || 0) !== 1 ? 'cap:save-needs-one-attachment' : (RX.NEG_SAVE.test(own) ? 'cap:negated-save' : (OTHER_TARGET.test(own) ? 'cap:save-target-not-drive' : null)),
      calendar: c.surface === 'outlook' ? 'cap:outlook-no-bare-calendar' : null,
      any: (c.direction || 'inbound') === 'outbound' ? 'cap:own-mail' : null };
  }

  // ---------- record meta (enums only)
  function langOf(own) {
    var h = (own.match(/[\u05D0-\u05EA]/g) || []).length, l = (own.match(/[A-Za-z]/g) || []).length;
    if (!h) return 'en'; if (!l) return 'he'; var r = h / (h + l); return r >= 0.8 ? 'he' : (r <= 0.2 ? 'en' : 'mixed');
  }

  /**
   * prepare(caseIn, opts) -> ShadowInput (text-free) or throws.
   * caseIn: { surface:'gmail'|'outlook', direction:'inbound'|'outbound'|'self', from:{name,email}, to:[addr], cc:[addr], subject, body, attachmentCount }
   * opts:   { core (default: globals), ownEmail (account address), ownNames ([display name, first name, HE spelling]), now (Date),
   *           engineVersion ('0.9.39'), judgeResult (the FlowIncomingJudge result the page already computed; optional), messageId }
   */
  function prepare(c0, opts) {
    var t0 = now();
    opts = opts || {};
    var core = opts.core || coreFromGlobals(root);
    var ctx = { ownEmail: opts.ownEmail || '', now: opts.now || new Date() };
    var ownNames = opts.ownNames || c0.ownNames || [];
    var n = T.normalizeInput(c0);                                      // normalize-v21 (minimal)
    var c = T.normalizeCase(Object.assign({ ownNames: ownNames }, n)); // + boilerplate strip = model path
    var eng = teach(core, c, ctx);
    var pp = preprocess(core, c, ctx);
    var voc = T.addresseeOf(pp.own, c.ownNames), role = T.recipientRole(c, ctx.ownEmail);
    var fc = Object.assign({}, c, pp);
    var x = F.featuresBoth(fc, { voc: voc, role: role });
    var incumbent = opts.judgeResult !== undefined ? verdictFromJudge(opts.judgeResult) : teach(core, c0, ctx);
    var changed = n.body !== String(c0.body == null ? '' : c0.body) || n.subject !== String(c0.subject == null ? '' : c0.subject);
    var normLabel = changed ? teach(core, n, ctx).label : incumbent.label;
    var own = pp.own;
    return {
      v: 1, messageId: opts.messageId != null ? String(opts.messageId) : null,
      surface: c.surface === 'outlook' ? 'outlook' : 'gmail', direction: c.direction || 'inbound', lang: langOf(own), shape: F.shapeOf(fc),
      attachmentCount: Number(c.attachmentCount || 0), rcpt: role, voc: voc, subjPrefix: F.SUBJ_PREFIX.test(c.subject || ''),
      lenBucket: Math.min(6, Math.floor(Math.log2(1 + F.tokens(T.cleanText(own)).length))),
      incumbent: { engine: opts.engineVersion || '0.0.0', show: incumbent.show, reason: incumbent.reason, label: incumbent.label, normalizedFlip: normLabel !== incumbent.label },
      x2: x.x2, x21: x.x21,
      veto: { base: baseVeto(eng), product: productVeto(c, own, ctx.ownEmail), cap: capFlags(c, own, core.DEPS && core.DEPS.fileAttach) },
      prepMs: now() - t0
    };
  }

  var api = { prepare: prepare, coreFromGlobals: coreFromGlobals, verdictFromJudge: verdictFromJudge, teach: teach, preprocess: preprocess, langOf: langOf, BASE: BASE };
  NS.prepare = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
