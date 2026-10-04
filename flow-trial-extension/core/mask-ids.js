// Masks identifiers that core/privacyShield.js does not (national ID numbers, policy / case / account / claim numbers, IBANs, passport numbers)
// and composes it with the shield into the one masking pass that runs before ANY text may leave the device. Portable: no chrome.*, no DOM.
//
// Why a separate file: the shield is already live in Draft-It and has its own corpus; adding a category there changes shipped behaviour.
// This pass runs AFTER the shield, on its output, and only matches an identifier that is LABELLED ("ID 123456789", "policy no. AB-77123",
// "ת.ז. 123456789") or has an unmistakable shape (an IBAN). A bare run of digits is deliberately left alone: invoice and PO numbers are
// routinely nine or ten digits, and over-masking them corrupts the sentence for the model. Precision over recall is stated, not hidden:
// an unlabelled identifier can pass through, which is why the router also refuses to send when a contact detail survives (exec-router.js).
//
// Tokens: [ID_1], [ID_2]... Same value, same token. The map stays in the caller; only maskedText goes anywhere.
const FlowMaskIds = (() => {
  const LABEL = '(?:national\\s+id|id\\s*(?:number|no\\.?|#)?|passport(?:\\s+(?:number|no\\.?))?|policy(?:\\s+(?:number|no\\.?|#))?|case(?:\\s+(?:number|no\\.?|#))?|claim(?:\\s+(?:number|no\\.?|#))?|account(?:\\s+(?:number|no\\.?|#))?|acct\\.?|iban|ssn|tax\\s+id|vat\\s+(?:number|no\\.?)|ת\\.?ז\\.?|תעודת\\s+זהות|מספר\\s+(?:פוליסה|תיק|חשבון|דרכון)|פוליסה|חשבון)';
  // After the label: optional punctuation, then a code of at least 5 characters that contains a digit (letters, digits, dashes, slashes).
  const LABELLED = new RegExp('(?<![A-Za-z0-9])(' + LABEL + ')(\\s*[:#.\\-]?\\s*)(?=[A-Za-z0-9\\-\\/]*\\d)([A-Za-z0-9][A-Za-z0-9\\-\\/]{4,29})', 'gi');
  // An IBAN: two letters, two digits, then 11 to 30 alphanumerics, optionally spaced in groups of four.
  const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;

  function mask(text, opts) {
    const o = opts || {};
    let n = o.startAt || 0;
    const seen = new Map();
    const tokenMap = {};
    const tokenFor = (raw) => {
      if (seen.has(raw)) return seen.get(raw);
      const t = '[ID_' + (++n) + ']';
      seen.set(raw, t);
      tokenMap[t] = raw;
      return t;
    };
    let out = String(text == null ? '' : text);
    out = out.replace(IBAN, (m) => tokenFor(m));
    out = out.replace(LABELLED, (m, label, sep, code) => label + sep + tokenFor(code));
    return { maskedText: out, tokenMap, count: n - (o.startAt || 0) };
  }

  // The one masking pass: the shield (names, companies, amounts, dates, e-mail, phone) and then identifiers. Same maskedText/tokenMap shape.
  // shield: FlowPrivacyShield (injected so this stays portable and testable).
  function maskAll(text, shield) {
    const a = shield && typeof shield.mask === 'function' ? shield.mask(text) : { maskedText: String(text == null ? '' : text), tokenMap: {}, counts: { total: 0 } };
    const b = mask(a.maskedText);
    return { maskedText: b.maskedText, tokenMap: Object.assign({}, a.tokenMap, b.tokenMap), counts: Object.assign({}, a.counts, { ids: b.count, total: (a.counts && a.counts.total || 0) + b.count }) };
  }

  function unmask(text, tokenMap) {
    let out = String(text == null ? '' : text);
    for (const [token, original] of Object.entries(tokenMap || {})) out = out.split(token).join(original);
    return out;
  }

  return { mask, maskAll, unmask };
})();

if (typeof module !== 'undefined') module.exports = { FlowMaskIds };
