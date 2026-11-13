// Thin redaction adapter for chat lanes (W2 now; PR-0 Shared chat lane can replace this module).
// Names, Israeli ID, policy numbers and amounts are masked before any model call.
// On-device judgment does not use this; only outbound model paths do.
const FlowChatRedact = (() => {
  const POLICY = /\b(?:policy|מספר\s*פוליסה|פוליסה\s*(?:מס'?)?)\s*[#:]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})\b/gi;
  const ISRAELI_ID = /\b\d{9}\b/g;

  function luhnIsraeliId(id) {
    const s = String(id || '');
    if (!/^\d{9}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let n = Number(s[i]) * ((i % 2) + 1);
      if (n > 9) n -= 9;
      sum += n;
    }
    return sum % 10 === 0;
  }

  function shield() {
    if (typeof FlowPrivacyShield !== 'undefined') return FlowPrivacyShield;
    try { return typeof require !== 'undefined' ? require('../core/privacyShield.js').FlowPrivacyShield : null; } catch (e) { return null; }
  }

  function extraMask(text) {
    let out = String(text || '');
    out = out.replace(POLICY, (m, g1) => m.replace(g1, '[POLICY_NUM]'));
    out = out.replace(ISRAELI_ID, (m) => (luhnIsraeliId(m) ? '[ID_NUM]' : m));
    return out;
  }

  // Returns { maskedText, tokenMap } for model calls. Never claims on-device.
  function beforeModel(text) {
    const S = shield();
    const base = S && typeof S.mask === 'function' ? S.mask(text) : { maskedText: String(text || ''), tokenMap: {} };
    const maskedText = extraMask(base.maskedText);
    return { maskedText: maskedText, tokenMap: base.tokenMap || {} };
  }

  return { beforeModel, extraMask, luhnIsraeliId };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatRedact };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatRedact = FlowChatRedact;
