// W4 WhatsApp Business Cloud lane (device logic). No chrome.*, no DOM, no network, no send.
const FlowWaBusinessLane = (() => {
  const SWITCH = 'WHATSAPP_BUSINESS';
  const SWITCH_DEFAULT = false;
  const SYSTEM_DRAFT = 'whatsapp/business-draft';

  function buildEnabled(flags, buildOn, userKill, globalKill) {
    if (buildOn !== true) return false;
    if (globalKill === true) return false;
    if (userKill === true) return false;
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function messageText(row) {
    const r = row || {};
    if (r.text_body) return String(r.text_body);
    if (r.caption) return String(r.caption);
    if (r.message_type === 'document' && r.filename) return 'Document: ' + String(r.filename);
    return '';
  }

  function judgeInbound(row, now) {
    const text = messageText(row);
    if (!text || text.length < 12) return { show: false, reason: 'short' };
    const senderName = row.contact_name || row.from_wa_id || 'Customer';
    const judge = typeof FlowIncomingJudge !== 'undefined' ? FlowIncomingJudge : null;
    let judged = null;
    if (judge && typeof judge.judge === 'function') {
      judged = judge.judge({
        text: text,
        subject: '',
        sender: { name: senderName },
        surface: 'chat',
        now: now || Date.now(),
        attachmentCount: row.message_type === 'document' ? 1 : 0,
      });
    } else if (!/(please|could you|can you|send|transfer|confirm|תשל|שלח|אפשר|עד יום)/i.test(text)) {
      return { show: false, reason: 'quiet' };
    } else {
      judged = {
        show: true,
        process: {
          name: 'WhatsApp Business reply',
          closingLine: '',
          steps: [{ kind: 'gmailDraft', params: {} }],
        },
      };
    }
    if (!judged || judged.show !== true) return { show: false, reason: (judged && judged.reason) || 'quiet' };
    const draftStep = ((judged.process && judged.process.steps) || []).find((s) => s && (s.kind === 'gmailDraft' || s.kind === 'outlookDraft' || s.kind === 'draft'));
    const taskStep = ((judged.process && judged.process.steps) || []).find((s) => s && (s.kind === 'googleTask' || s.kind === 'task'));
    if (!draftStep && !taskStep) return { show: false, reason: 'no-step' };
    return { show: true, judged: judged, text: text, senderName: senderName };
  }

  function draftBodyFromJudged(judged, row) {
    const redact = typeof FlowWaBusinessRedact !== 'undefined' ? FlowWaBusinessRedact : null;
    const base = judged && judged.judged && judged.judged.process && judged.judged.process.closingLine;
    let draft = base ? String(base) : '';
    if (!draft && judged && judged.text) {
      const masked = redact && redact.maskForModel ? redact.maskForModel(judged.text) : { maskedText: judged.text, tokenMap: {} };
      const he = /[֐-׿]/.test(judged.text);
      draft = he
        ? 'היי ' + (row.contact_name || '') + ', קיבלתי — אחזור בהקדם.'
        : 'Hi ' + (row.contact_name || 'there') + ", got it — I'll follow up shortly.";
      if (redact && redact.unmask) draft = redact.unmask(draft, masked.tokenMap);
    }
    return draft.trim();
  }

  function buildProof(draftId, fetchedBack) {
    const proofs = typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
    if (!proofs || typeof proofs.buildProof !== 'function') {
      return { system: SYSTEM_DRAFT, externalId: draftId, fetchedBack: fetchedBack === true, verifiedAt: new Date().toISOString() };
    }
    return proofs.buildProof({
      system: SYSTEM_DRAFT,
      externalId: String(draftId),
      fetchedBack: fetchedBack === true,
      verifiedAt: new Date().toISOString(),
    });
  }

  function assertNeverSends(source) {
    const s = String(source || '').replace(/chrome\.runtime\.sendMessage/g, '');
    const bad = [
      /graph\.facebook\.com\/v\d+\.\d+\/\d+\/messages/i,
      /\/messages\?access_token/i,
      /sendMessage\s*\(/i,
      /\.post\([^)]*\/messages/i,
    ];
    return !bad.some((re) => re.test(s));
  }

  return {
    SWITCH,
    SWITCH_DEFAULT,
    SYSTEM_DRAFT,
    buildEnabled,
    messageText,
    judgeInbound,
    draftBodyFromJudged,
    buildProof,
    assertNeverSends,
  };
})();
if (typeof module !== 'undefined') module.exports = { FlowWaBusinessLane };
