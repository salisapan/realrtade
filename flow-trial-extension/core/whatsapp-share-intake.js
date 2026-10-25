// Share-to-Glance intake: pasted export or forwarded text → judge → reply draft + wa.me target.
// Portable business logic for the extension page and the background API (future iOS Share Extension).
const FlowWhatsAppShareIntake = (() => {
  const SURFACE = 'whatsapp-share';

  function parseApi() {
    if (typeof FlowWhatsAppExportParse !== 'undefined') return FlowWhatsAppExportParse;
    try { return require('./whatsapp-export-parse.js').FlowWhatsAppExportParse; } catch (e) { return null; }
  }

  function judgeApi() {
    if (typeof FlowIncomingJudge !== 'undefined') return FlowIncomingJudge;
    try { return require('./incoming-judge.js').FlowIncomingJudge; } catch (e) { return null; }
  }

  function draftReplyApi() {
    if (typeof FlowDraftReply !== 'undefined') return FlowDraftReply;
    try { return require('./draft-reply.js').FlowDraftReply; } catch (e) { return null; }
  }

  function waApi() {
    if (typeof FlowWaMeLink !== 'undefined') return FlowWaMeLink;
    try { return require('./wa-me-link.js').FlowWaMeLink; } catch (e) { return null; }
  }

  function hashText(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function analyze(rawText, now) {
    const P = parseApi();
    const J = judgeApi();
    if (!P || !J) return { ok: false, reason: 'missing-core' };
    const parsed = P.parse(rawText);
    if (!parsed.ok) return { ok: false, reason: parsed.reason || 'parse-failed', parsed };
    const focus = parsed.focusInbound;
    const party = parsed.counterpart || {};
    const sender = { name: focus.sender || party.name || null, phone: party.phone || null, email: null };
    const clock = (now && typeof now.getTime === 'function') ? now : new Date(typeof now === 'number' ? now : Date.now());
    let judged;
    try {
      judged = J.judge({
        text: focus.text,
        subject: '',
        sender: sender,
        surface: 'chat',
        now: clock,
        attachmentCount: 0,
        threadUrl: 'glance:' + SURFACE + ':' + hashText((party.phone || party.name || '') + '|' + focus.text.slice(0, 120))
      });
    } catch (e) {
      return { ok: false, reason: 'judge-error', parsed };
    }
    if (!judged || !judged.show) {
      return { ok: false, reason: (judged && judged.reason) || 'silent', parsed, judged };
    }
    const draftStep = typeof J.draftStepOf === 'function' ? J.draftStepOf(judged.process) : null;
    const taskOnly = typeof J.taskOnlyProcess === 'function' ? J.taskOnlyProcess(judged.process) : false;
    let draftText = null;
    if (draftStep) {
      draftText = typeof J.draftText === 'function'
        ? J.draftText(judged.process, { sender: sender, subject: '' })
        : null;
    }
    const phone = party.phone || (sender.phone || null);
    const Wa = waApi();
    const waUrl = (draftText && phone && Wa) ? Wa.build(phone, draftText) : null;
    return {
      ok: true,
      sessionId: hashText(rawText.slice(0, 4000)),
      parsed,
      judged,
      sender,
      focusText: focus.text,
      draftText,
      phone,
      waUrl,
      hasReply: Boolean(draftStep && draftText && waUrl),
      hasTask: Boolean(taskOnly || (judged.process && judged.process.steps && judged.process.steps.some((s) => s && /task/i.test(s.kind || ''))))
    };
  }

  function proofRecord(sessionId, waUrl, draftText) {
    const at = new Date().toISOString();
    return {
      system: 'whatsapp-wame',
      externalId: String(sessionId || '') + ':' + hashText(waUrl || draftText || ''),
      fetchedBack: true,
      verifiedAt: at,
      closeKind: 'draft-opened',
      honest: 'draft-opened-not-sent',
      waUrl: waUrl || null
    };
  }

  return { SURFACE, analyze, proofRecord, hashText };
})();

if (typeof module !== 'undefined') module.exports = { FlowWhatsAppShareIntake };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsAppShareIntake = FlowWhatsAppShareIntake;
