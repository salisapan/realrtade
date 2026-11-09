'use strict';
// The host side of the AI engine, as portable code (docs/glance-ai/ai-product.md §3): everything a surface (the extension's Gmail and
// Outlook today, the Gmail add-on, the Outlook add-in, Flow later) needs to run core/ai-engine.js on one mail and carry what it finds,
// so wiring a surface is a few lines in the surface's own file.
//
//   mailInput(raw, decision)   the surface's parsed mail and the device engine's own decision -> the mail object read() takes
//   depsFor(opts)              the device mask (core/exec-router.js maskForServer: privacyShield + mask-ids, a surviving contact detail
//                              blocks the call) and Glance cloud (one POST of { action:'understand-read', maskedText, today, installId |
//                              licenseKey } to glance-assist; the reply's validated Understanding is the Tier 2 answer). No gate and no
//                              veto are passed, so read() runs the production floor (core/ai-floor.js).
//   readMail(flags, raw, decision, opts)   the two above, then FlowAiEngine.read()
//   onMessage(flags, watch, msg, now)      the newest message in a thread: a loop the model opened closes by its plan
//                              (core/model-plan.js closeFor); any other loop -> { defer:true } and the surface keeps its own rule
//
// Cloud transport: the surface injects post(payload) -> { status, body }. Nothing here knows a URL, a key or chrome.*. A refusal (spend
// cap, quota, language off, a mask the server finds leaky, the server off) is no answer: the engine stays silent on that mail and the
// device carries on. After a spend cap, a quota or "unavailable", the cloud is not asked again until the cool-down ends.
// No switch of its own: read() rides on aiPrimary (off), closeFor() on aiPlanV1 (off); with them off nothing is asked and nothing changes.
// Nothing here closes, writes or sends.
const FlowAiHost = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const engine = () => sibling(typeof FlowAiEngine !== 'undefined' ? FlowAiEngine : null, './ai-engine.js', 'FlowAiEngine');
  const planner = () => sibling(typeof FlowModelPlan !== 'undefined' ? FlowModelPlan : null, './model-plan.js', 'FlowModelPlan');
  const execRouter = () => sibling(typeof FlowExecRouter !== 'undefined' ? FlowExecRouter : null, './exec-router.js', 'FlowExecRouter');
  const shield = () => sibling(typeof FlowPrivacyShield !== 'undefined' ? FlowPrivacyShield : null, './privacyShield.js', 'FlowPrivacyShield');
  const masker = () => sibling(typeof FlowMaskIds !== 'undefined' ? FlowMaskIds : null, './mask-ids.js', 'FlowMaskIds');

  // An Israeli phone number in the local form survives today's device mask (an open red-team fix, #249). The host refuses to send it;
  // glance-assist refuses it again (understand.js IL_PHONE).
  const IL_PHONE = /(?:^|[^\d])\(?0(?:[23489]|5\d|7[2-9])\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/;
  const COOL_MS = { spend_cap: 6 * 3600 * 1000, quota_used: 6 * 3600 * 1000, unavailable: 30 * 60 * 1000 };
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
  const he = (s) => /[֐-׿]/.test(String(s || ''));

  // raw: { text (the mail's own part, quoted history removed), body?, subject, direction, attachmentCount, surface, threadId, messageId,
  //        from:{email,name}, channel?, cloudConsent, today?, now? }
  // decision: the device engine's own verdict { show, step, quiet } (show:false + quiet = a hard quiet; show:false alone = possibly a close).
  function mailInput(raw, decision) {
    raw = raw || {}; decision = decision || {};
    const now = typeof raw.now === 'number' ? raw.now : Date.now();
    const step = decision.show && decision.step ? decision.step : 'SILENT';
    return {
      text: String(raw.text || ''), body: raw.body != null ? String(raw.body) : undefined, subject: String(raw.subject || ''),
      today: raw.today || isoDay(now), now, direction: raw.direction || 'inbound', attachmentCount: Number(raw.attachmentCount || 0),
      surface: raw.surface === 'outlook' ? 'outlook' : 'gmail', lang: he(raw.text) ? 'he' : 'en', cloudConsent: raw.cloudConsent === true,
      threadId: raw.threadId || null, messageId: raw.messageId || null, counterpart: raw.from || {}, channel: raw.channel || raw.surface || 'gmail',
      tier0: { quiet: step === 'SILENT' ? (decision.quiet || null) : null, step, possible: step === 'SILENT' && !decision.quiet }
    };
  }

  // opts: { post(payload) -> Promise<{status, body}>, identity:{ installId?, licenseKey? }, today, tier1?, clock?() -> ms, state? }
  // state (optional, kept by the surface between mails): { coolUntil, lastCode } so a spend cap stops the next calls too.
  function depsFor(opts) {
    opts = opts || {};
    const ER = execRouter(), S = shield(), MI = masker();
    const clock = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
    const state = opts.state || {};
    const id = opts.identity || {};
    const deps = {};
    if (ER && S && MI) {
      deps.mask = (text) => {
        const m = ER.maskForServer(text, S, MI);
        if (!m.ok) return m;
        if (IL_PHONE.test(m.text)) return { ok: false, reason: 'pii-blocked' };
        return { ok: true, text: m.text, unmask: (x) => MI.unmask(x, m.tokenMap) };
      };
    }
    if (typeof opts.post === 'function') {
      deps.tier2 = async (maskedText) => {
        if (state.coolUntil && clock() < state.coolUntil) return null;
        const payload = { action: 'understand-read', maskedText, today: opts.today };
        if (id.licenseKey) payload.licenseKey = id.licenseKey; else if (id.installId) payload.installId = id.installId;
        let res;
        try { res = await opts.post(payload); } catch (e) { state.lastCode = 'network'; return null; }
        const body = (res && res.body) || {};
        if (!res || res.status !== 200 || !body.understanding) {
          state.lastCode = body.code || body.invalid || ('http-' + (res && res.status));
          if (COOL_MS[body.code]) state.coolUntil = clock() + COOL_MS[body.code];
          return null;
        }
        state.lastCode = null;
        return body.understanding;
      };
    }
    if (typeof opts.tier1 === 'function') deps.tier1 = opts.tier1;
    return deps;
  }

  async function readMail(flags, raw, decision, opts) {
    const E = engine();
    if (!E) return { used: false };
    const mail = mailInput(raw, decision);
    return E.read(mail, depsFor(Object.assign({ today: mail.today }, opts || {})), flags);
  }

  // msg: { isOwn, text, email, evidence? }
  function onMessage(flags, watch, msg, now) {
    if (!watch || watch.tier !== 'model') return { defer: true };
    const P = planner();
    return P ? P.closeFor(flags, watch, msg, now) : { none: true };
  }

  return { mailInput, depsFor, readMail, onMessage, COOL_MS, IL_PHONE };
})();

if (typeof module !== 'undefined') module.exports = { FlowAiHost };
