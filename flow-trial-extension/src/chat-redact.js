// Mask outbound chat payloads before they leave the tab (names, Israeli ID, policy numbers, amounts).
const FlowChatRedact = (() => {
  const ID_RE = /\b\d{9}\b/g;
  const POLICY_RE = /\b(?:policy|פוליסה|מספר\s*פוליסה)[:\s#-]*([A-Z0-9-]{5,})\b/gi;
  const AMOUNT_RE = /(?:₪|\$|€)\s*[\d,]+(?:\.\d+)?|\b[\d,]+(?:\.\d+)?\s*(?:₪|שקל|ש\"ח|שח|dollars?|usd|eur)\b/gi;
  const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_RE = /\b(?:\+?972|0)[\d\- ]{8,12}\b/g;

  function maskId(match) {
    const digits = String(match).replace(/\D/g, '');
    if (digits.length !== 9) return match;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let n = Number(digits[i]) * ((i % 2) + 1);
      if (n > 9) n -= 9;
      sum += n;
    }
    if (sum % 10 !== 0) return match;
    return '[id]';
  }

  function redactText(text, extraNames) {
    let out = String(text || '');
    if (!out) return out;
    const names = Array.isArray(extraNames) ? extraNames : [];
    names.forEach((name) => {
      const n = String(name || '').trim();
      if (n.length < 2) return;
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, '[name]');
    });
    out = out.replace(ID_RE, (m) => maskId(m));
    out = out.replace(POLICY_RE, '[policy]');
    out = out.replace(AMOUNT_RE, '[amount]');
    out = out.replace(EMAIL_RE, '[email]');
    out = out.replace(PHONE_RE, '[phone]');
    return out;
  }

  function redactValue(value, names) {
    if (value == null) return value;
    if (typeof value === 'string') return redactText(value, names);
    if (Array.isArray(value)) return value.map((v) => redactValue(v, names));
    if (typeof value === 'object') {
      const next = {};
      Object.keys(value).forEach((k) => { next[k] = redactValue(value[k], names); });
      return next;
    }
    return value;
  }

  function outbound(payload, opts) {
    const names = (opts && opts.names) || [];
    return redactValue(payload, names);
  }

  return { redactText, outbound };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatRedact };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatRedact = FlowChatRedact;
