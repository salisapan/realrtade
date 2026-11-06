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
  const LABEL = '(?:national\\s+id|id\\s*(?:number|no\\.?|#)?|passport(?:\\s+(?:number|no\\.?))?|policy(?:\\s+(?:number|no\\.?|#))?|case(?:\\s+(?:number|no\\.?|#))?|claim(?:\\s+(?:number|no\\.?|#))?|account(?:\\s+(?:number|no\\.?|#))?|acct\\.?|iban|ssn|tax\\s+id|vat\\s+(?:number|no\\.?)|ת\\.?ז\\.?|ת["\u05F4\u05F3\']ז|תעודת\\s+זהות|(?:מספר|מס[\'\u05F3.]?)\\s+(?:זהות|פוליסה|תיק|חשבון|דרכון|כרטיס)|חשבון\\s+(?:בנק\\s+)?(?:מספר|מס[\'\u05F3.]?)|פוליסה|דרכון|חשבון)';
  // After the label: optional punctuation, then a code of at least 5 characters that contains a digit (letters, digits, dashes, slashes).
  const LABELLED = new RegExp('(?<![A-Za-z0-9])(' + LABEL + ')(\\s*[:#.\\-]?\\s*)(?=[A-Za-z0-9\\-\\/]*\\d)([A-Za-z0-9][A-Za-z0-9\\-\\/]{4,29})', 'gi');
  // An IBAN: two letters, two digits, then 11 to 30 alphanumerics, optionally spaced in groups of four.
  const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;

  // Red team 2026-10-16 (docs/glance-ai/red-team.md): what an Israeli message carries that the two patterns above and the shield let through.
  // Each is anchored on a shape that ordinary business numbers do not have, so the precision trade above still holds.
  //   A phone in the local form: 054-1234567, 0541234567, 03-6123456, 972-54-1234567 (the shield's phone pattern needs a "+" or a 3-3-4 grouping).
  //   A bare mobile (05X and seven digits) is masked too: a ten-digit invoice number that starts with 05 is the cost, and it is a cheap one.
  const IL_PHONE = /(?<![\d+])(?:(?:972|00972)[-.\s]?(?:5\d|[23489]|7\d)[-.\s]?\d{3}[-.\s]?\d{4}|0(?:5\d|7\d)[-.\s]?\d{3}[-.\s]?\d{4}|0[23489][-.\s]\d{3}[-.\s]?\d{4}|0[23489][-.\s]?\d{3}[-.\s]\d{4})(?!\d)/g;
  //   A payment card: 13 to 19 digits, bare or in groups, that pass the Luhn check (an order number almost never does), or written as 4-4-4-4.
  const CARD = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g;
  //   An amount in shekels written the Hebrew way ("3,850 ש"ח", "3850 שקלים", "ש"ח 3,850"); the shield knows only ₪ and the Latin codes.
  const SHEKEL = '(?:ש["״]ח|שקלים|שקל|ש׳׳ח)';
  const HE_AMOUNT = new RegExp('(?:' + SHEKEL + '\\s?)\\d[\\d,.]*\\d(?:\\s?(?:אלף|מיליון))?|\\d[\\d,.]*(?:\\s?(?:אלף|מיליון))?\\s?' + SHEKEL + '(?![א-ת])', 'g');
  //   A date the shield's patterns do not read: 15.10.2026 (Israel writes dots), and "15 באוקטובר" / "15 לאוקטובר 2026".
  const DOT_DATE = /(?<![\d.])\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})(?![\d.])/g;
  const HE_MONTHS = '(?:ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)';
  const HE_DATE = new RegExp('(?<!\\d)\\d{1,2}\\s?(?:ב|ל)?' + HE_MONTHS + '(?:\\s?,?\\s?\\d{4})?(?![א-ת])', 'g');

  //   An address the shield's e-mail pattern cannot see (red team 2026-10-23): spaces or a no-break space around the @ ("dana @ acme.com"),
  //   a full-width ＠, or written out ("dana at acme dot com", "dana [at] acme [dot] com"). The tail must end in a 2-6 letter domain label.
  const LOOSE_EMAIL = /[A-Za-z0-9._%+-]+(?:[\s ]*(?:@|＠|\(at\)|\[at\])[\s ]*[A-Za-z0-9-]+(?:(?:\.|\s?\(dot\)\s?|\s?\[dot\]\s?)[A-Za-z0-9-]+)*(?:\.|\s?\(dot\)\s?|\s?\[dot\]\s?)[A-Za-z]{2,6}|\s+at\s+[A-Za-z0-9-]+(?:\s+dot\s+[A-Za-z0-9-]+)*\s+dot\s+[A-Za-z]{2,6})(?![A-Za-z0-9])/gi;

  function luhn(digits) {
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function isCard(raw) {
    const d = raw.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
    // Four groups of four is how a card is written, typo or not; anything else must pass the check digit.
    return luhn(d) || /^\d{4}([ -])\d{4}\1\d{4}\1\d{4}$/.test(raw);
  }

  function mask(text, opts) {
    const o = opts || {};
    let n = o.startAt || 0;
    const seen = new Map();
    const tokenMap = {};
    const tokenFor = (raw, kind) => {
      if (seen.has(raw)) return seen.get(raw);
      const t = '[' + (kind || 'ID') + '_' + (++n) + ']';
      seen.set(raw, t);
      tokenMap[t] = raw;
      return t;
    };
    let out = String(text == null ? '' : text);
    out = out.replace(IBAN, (m) => tokenFor(m));
    out = out.replace(LOOSE_EMAIL, (m) => tokenFor(m, 'EMAIL_X'));
    out = out.replace(CARD, (m) => (isCard(m) ? tokenFor(m, 'CARD') : m));
    out = out.replace(IL_PHONE, (m) => tokenFor(m, 'IL_PHONE'));
    out = out.replace(LABELLED, (m, label, sep, code) => label + sep + tokenFor(code));
    out = out.replace(HE_AMOUNT, (m) => tokenFor(m, 'IL_AMOUNT'));
    out = out.replace(DOT_DATE, (m) => tokenFor(m, 'IL_DATE'));
    out = out.replace(HE_DATE, (m) => tokenFor(m, 'IL_DATE'));
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

  return { mask, maskAll, unmask, isCard, IL_PHONE, CARD, LOOSE_EMAIL };
})();

if (typeof module !== 'undefined') module.exports = { FlowMaskIds };
