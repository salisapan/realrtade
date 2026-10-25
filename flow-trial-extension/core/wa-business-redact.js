// Mask names, national IDs, policy numbers and amounts before any W4 model call.
// Uses FlowPrivacyShield when present; adds ID/policy patterns the shield does not cover.
const FlowWaBusinessRedact = (() => {
  const ID_PATTERN = /\b\d{8,9}\b/g;
  const POLICY_PATTERN = /\b(?:policy|פוליסה|מספר\s*פוליסה|מס['׳]?\s*פוליסה)\s*[#:]?\s*([A-Z0-9-]{5,20})\b/gi;
  const AMOUNT_PATTERN = /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?(?:NIS|₪|USD|\$)\b/gi;

  function extraMask(text) {
    let out = String(text || '');
    const map = {};
    let n = 0;
    function tok(label, match) {
      n += 1;
      const key = '[' + label + '_' + n + ']';
      map[key] = match;
      return key;
    }
    out = out.replace(ID_PATTERN, (m) => tok('ID_NUM', m));
    out = out.replace(AMOUNT_PATTERN, (m) => tok('AMOUNT', m));
    out = out.replace(POLICY_PATTERN, (full, num) => full.replace(num, tok('POLICY_NUM', num)));
    return { maskedText: out, tokenMap: map };
  }

  function mergeMaps(a, b) {
    const out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach((k) => { out[k] = b[k]; });
    return out;
  }

  function maskForModel(text) {
    const shield = typeof FlowPrivacyShield !== 'undefined' ? FlowPrivacyShield : null;
    let maskedText = String(text || '');
    let tokenMap = {};
    if (shield && typeof shield.mask === 'function') {
      const m = shield.mask(maskedText);
      maskedText = m.maskedText;
      tokenMap = m.tokenMap || {};
    }
    const extra = extraMask(maskedText);
    return { maskedText: extra.maskedText, tokenMap: mergeMaps(tokenMap, extra.tokenMap) };
  }

  function unmask(text, tokenMap) {
    const shield = typeof FlowPrivacyShield !== 'undefined' ? FlowPrivacyShield : null;
    let out = String(text || '');
    Object.keys(tokenMap || {}).forEach((k) => {
      out = out.split(k).join(tokenMap[k]);
    });
    if (shield && typeof shield.unmask === 'function') out = shield.unmask(out, tokenMap);
    return out;
  }

  return { maskForModel, unmask, extraMask };
})();
if (typeof module !== 'undefined') module.exports = { FlowWaBusinessRedact };
