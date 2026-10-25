// Mask sensitive chat fragments before any payload leaves the page (PR-0 adapter).
const FlowChatRedact = (() => {
  const ID_RE = /\b\d{9}\b/g;
  const POLICY_RE = /\b(?:policy|פוליסה|מספר\s*פוליסה)[:\s#-]*([A-Z0-9-]{5,})\b/gi;
  const AMOUNT_RE = /(?:₪|\$|€)\s*[\d,.]+|\b[\d,.]+\s*(?:₪|שקל|ש"ח|שח|dollars?|euros?)\b/gi;
  const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_RE = /\b(?:\+?972|0)(?:[-\s]?\d){7,10}\b/g;

  function maskNames(text, names) {
    let out = String(text || '');
    (names || []).forEach((name) => {
      const n = String(name || '').trim();
      if (n.length < 2) return;
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, '[name]');
    });
    return out;
  }

  function redactText(text, opts) {
    let out = maskNames(text, opts && opts.names);
    out = out.replace(ID_RE, '[id]');
    out = out.replace(POLICY_RE, '[policy]');
    out = out.replace(AMOUNT_RE, '[amount]');
    out = out.replace(EMAIL_RE, '[email]');
    out = out.replace(PHONE_RE, '[phone]');
    return out;
  }

  function redactPayload(payload, opts) {
    if (!payload || typeof payload !== 'object') return payload;
    const copy = JSON.parse(JSON.stringify(payload));
    if (typeof copy.text === 'string') copy.text = redactText(copy.text, opts);
    if (typeof copy.query === 'string') copy.query = redactText(copy.query, opts);
    if (copy.fact && typeof copy.fact.needle === 'string') copy.fact.needle = redactText(copy.fact.needle, opts);
    return copy;
  }

  return { redactText, redactPayload };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatRedact };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatRedact = FlowChatRedact;
