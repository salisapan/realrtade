// Local Privacy Shield — masks sensitive entities in text BEFORE it is passed
// to anything that might leave the device (a summarizer, a draft-writer, a
// remote call). Everything in this file is regex/heuristic pattern-matching
// that runs entirely in this tab; there is no network call and no model here.
//
// This is deliberately separate from FlowExtract (src/extract.js): that file
// finds the single best money/date value for on-device judgment scoring.
// This file finds and replaces EVERY matching span, because a masking pass
// that misses one occurrence of a name defeats the point of masking it.
//
// Design: mask() returns maskedText plus a tokenMap the caller keeps to
// itself. Anything downstream (an LLM call, a remote summarizer) only ever
// sees maskedText and therefore only ever generates output that references
// the placeholder tokens, never the real values — the caller substitutes the
// real values back in locally with unmask() only after the round trip
// returns, using the same tokenMap. Real PII is never constructed anywhere
// outside this tab.
const FlowPrivacyShield = (() => {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Every masking-relevant pattern needs the global flag so replace() walks
  // every occurrence, not just the first.
  const MONTH_ALT = MONTHS.join('|');
  const DAY_ALT = DAYS.join('|');

  const DATE_PATTERNS = [
    /\b\d{4}-\d{2}-\d{2}\b/gi,
    new RegExp('\\b(' + MONTH_ALT + ')\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b', 'gi'),
    new RegExp('\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(' + MONTH_ALT + ')(?:,?\\s+\\d{4})?\\b', 'gi'),
    new RegExp('\\b(?:by|on|before|due|until|no later than|signing|closing|starting|effective)\\s+(?:next\\s+)?(' + DAY_ALT + ')\\b', 'gi'),
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
  ];

  const CURRENCY_SYMBOLS = '\\$|€|£|₪|₹|US\\$|C\\$|A\\$';
  const CURRENCY_CODES = 'USD|EUR|GBP|NIS|ILS|INR|CAD|AUD|dollars|euros|pounds|shekels';
  // The optional k/m multiplier suffix is grouped with its own leading space
  // so an amount with no suffix ("$45,000 (forty-five...") doesn't consume
  // and swallow the space before whatever follows it in the sentence.
  const MONEY_PATTERN = new RegExp(
    '(?:(?:' + CURRENCY_SYMBOLS + '|' + CURRENCY_CODES + ')\\s?)' +
    '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?(?:\\s?(?:k|m))?' +
    '|\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?(?:\\s?(?:k|m))?\\s?(?:' + CURRENCY_CODES + ')',
    'gi'
  );

  // An email address almost always carries two of the exact things this file
  // exists to hide in one string: the local-part is frequently a real name
  // (john.doe@...), and the domain is frequently the real company
  // (...@acmecorp.com). Masked as its own category — not left for
  // NAME_PATTERN/COMPANY_PATTERN to catch pieces of — because those both
  // require whitespace between words and never match across the dots/@ in
  // an address, so without this pattern an email address passed through
  // completely unmasked.
  const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

  // Deliberately conservative: requires the area-code/exchange/line grouped
  // with a visible separator (dash, dot, space) or parens, optionally
  // preceded by a country code. A bare unformatted 10-digit run is NOT
  // matched on purpose — invoice numbers, PO numbers, and other business IDs
  // in this exact domain's emails are routinely 10 digits with no
  // separators, and a real phone number in business correspondence is
  // almost always written with one.
  // \b sits after the optional country-code/paren prefix, not before it: a
  // leading \b would only hold at a word/non-word transition, and "(" or
  // "+" preceded by whitespace is non-word-to-non-word — no transition — so
  // the match could never start early enough to consume them, leaking a
  // stray "(" or "+" next to an otherwise-fully-masked number.
  const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

  // A firm/company suffix is the anchor: without one, "capitalized word
  // sequence" catches far too much ordinary text (sentence starts, product
  // names) to be usable. This under-catches unnamed/informally-referenced
  // companies and over-catches nothing that doesn't carry one of these
  // suffixes — a deliberate, documented precision-over-recall trade for a
  // masking pass, where a missed company name is bad but a corrupted
  // sentence from an over-eager match is worse.
  const LAW_FIRM_SUFFIX = '(?:LLP|LLC\\s*Law|Law\\s+(?:Firm|Offices?|Group)|Attorneys(?:\\s+at\\s+Law)?|Legal\\s+Group)';
  const COMPANY_SUFFIX = '(?:Inc\\.?|LLC|Ltd\\.?|Corp\\.?|Co\\.?|Group|Partners|Holdings|Industries|Enterprises)';
  const CAP_WORD = '[A-Z][a-zA-Z\\u00c0-\\u017f\'-]*';
  const NAME_RUN = '(?:' + CAP_WORD + '\\s+){1,3}' + CAP_WORD;
  // Firm/company names routinely join two capitalized words with "&"
  // ("Cohen & Associates", "Smith & Sons") — without allowing it inline, the
  // plain word-run regex stops dead at the ampersand and only ever matches
  // the half of the name on one side of it.
  const FIRM_NAME_RUN = '(?:' + CAP_WORD + '\\s+(?:&\\s+)?){1,3}' + CAP_WORD;

  const LAW_FIRM_PATTERN = new RegExp('\\b(' + FIRM_NAME_RUN + '\\s+(?:&\\s+' + CAP_WORD + '\\s+)?' + LAW_FIRM_SUFFIX + ')\\b', 'g');
  const COMPANY_PATTERN = new RegExp('\\b(' + FIRM_NAME_RUN + '\\s+' + COMPANY_SUFFIX + ')\\b', 'g');

  // A bare two-to-four-capitalized-word run, once firm/company names (which
  // would otherwise also match this) are already spoken for above. This is
  // the least precise detector here — sentence-initial capitalized phrases
  // and titles ("Dear Sir", "Best Regards") will sometimes be caught. That
  // false-positive is the safer failure mode for a privacy mask: a masked
  // word that wasn't sensitive costs nothing; an unmasked word that was
  // costs everything.
  const NAME_PATTERN = new RegExp('\\b(' + NAME_RUN + ')\\b', 'g');

  // Salutation/closing words that commonly precede or follow a real name
  // ("Dear John Smith,", "John Smith\nBest regards") are capitalized
  // themselves, so a plain capitalized-word-run regex pulls them into the
  // match. Trimmed off the ends of a candidate match before it's tokenized,
  // rather than excluded from the regex itself, so "Dear John Smith" still
  // masks the name and leaves "Dear" as plain, harmless greeting text.
  const EDGE_STOPWORDS = new Set([
    'dear', 'hi', 'hello', 'attn', 'attention', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.',
    'dr', 'dr.', 'prof', 'prof.', 'to', 'from', 'cc', 're',
    'sincerely', 'regards', 'best', 'thanks', 'thank', 'yours', 'cordially', 'warmly'
  ]);
  const NAME_STOPWORDS = new Set(['re subject']); // whole-match stopwords that survive edge-trimming

  // Strips leading/trailing stopword tokens from a candidate name-run match,
  // returning the untouched edges separately so the caller can mask only the
  // core and leave "Dear"/"Best regards" etc. as plain text. Returns null if
  // nothing name-like survives the trim (e.g. "Best Regards").
  function trimNameEdges(raw) {
    const words = raw.split(/\s+/);
    let start = 0, end = words.length;
    while (start < end && EDGE_STOPWORDS.has(words[start].toLowerCase().replace(/,$/, ''))) start++;
    while (end > start && EDGE_STOPWORDS.has(words[end - 1].toLowerCase().replace(/,$/, ''))) end--;
    if (start >= end) return null;
    return {
      prefix: words.slice(0, start).join(' ') + (start > 0 ? ' ' : ''),
      core: words.slice(start, end).join(' '),
      suffix: (end < words.length ? ' ' : '') + words.slice(end).join(' ')
    };
  }

  const OPPOSING_TRIGGER = /\b(opposing counsel|the other side|adverse part(?:y|ies)|defendant'?s? counsel|counterparty'?s? counsel|on behalf of the (?:buyer|seller|tenant|landlord|other party))\b/i;
  const OPPOSING_WINDOW = 60; // chars of proximity to an opposing-party phrase that re-routes a name/firm to the OPPOSING_* token instead of CLIENT_*/LAW_FIRM_*

  function nearOpposingTrigger(text, index) {
    const start = Math.max(0, index - OPPOSING_WINDOW);
    const end = Math.min(text.length, index + OPPOSING_WINDOW);
    return OPPOSING_TRIGGER.test(text.slice(start, end));
  }

  function letterIndex(n) {
    // 0->A, 1->B, ... 25->Z, 26->AA — 26 distinct companies in one email is
    // not a real scenario this needs to optimize past correctness for.
    let s = '';
    n += 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // Walks all patterns for one entity category over the CURRENT state of the
  // text (so a category masked earlier can't be re-matched by a later,
  // broader category), replacing each unique raw match with one token,
  // consistently, and recording the mapping. When `trimEdges` is given, only
  // the core the trimmer returns is tokenized — its untouched prefix/suffix
  // (a stripped salutation word, say) is written back into the text as-is.
  function maskCategory(text, pattern, tokenFor, seen, trimEdges) {
    return text.replace(pattern, (match, ...rest) => {
      // Trailing regex.exec bookkeeping args (offset, full string, named
      // groups) come after the capture groups — the match/group text is
      // everything before those, and for these patterns the whole match is
      // what should be replaced (some patterns capture the whole thing as
      // group 1 for the caller's benefit, e.g. distinguishing a matched
      // company name from a longer surrounding match is unnecessary here).
      const offset = rest[rest.length - 2];
      let raw = match, prefix = '', suffix = '';
      if (trimEdges) {
        const trimmed = trimEdges(raw);
        if (!trimmed) return match;
        raw = trimmed.core; prefix = trimmed.prefix; suffix = trimmed.suffix;
      }
      const key = raw.trim().toLowerCase();
      if (NAME_STOPWORDS.has(key)) return match;
      if (seen.has(key)) return prefix + seen.get(key) + suffix;
      const token = tokenFor(raw, offset + prefix.length);
      seen.set(key, token);
      return prefix + token + suffix;
    });
  }

  // Masks an array of texts (e.g. the current message + up to 3 prior
  // messages in a Gmail thread, for Feature 2's Draft-It) as ONE shared
  // token space rather than N independent ones: every counter and every
  // seen-map below is scoped to the whole batch, not to a single string. If
  // each text were masked independently by calling mask() N times, a name
  // in message 1 and an unrelated name in message 2 could both legitimately
  // mint the literal token "[CLIENT_NAME_1]" (each call's counter restarts
  // at 0) — the caller merging those tokenMaps would then have one of the
  // two silently overwritten, and unmask() would restore BOTH occurrences
  // in the returned draft to the same wrong value. Same failure shape as
  // the single-call opposingN collision documented below, just across
  // documents instead of within one — so it gets the same fix: one counter,
  // shared. As a side effect this also means the same real name/date
  // mentioned in two messages of one thread gets the same token both
  // times, which is the more correct behavior for a thread anyway.
  function maskBatch(texts) {
    const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || ''));
    const tokenMap = {}; // token -> original raw text
    let working = list.slice();

    // Emails and phone numbers first: both are unambiguously anchored (an
    // '@'-domain, a specific digit grouping) so there's no risk of a later,
    // broader pass like NAME_PATTERN mis-splitting a piece of one — and
    // masking them first means later passes never see that text at all.
    let emailN = 0;
    const emailSeen = new Map();
    working = working.map((w) => maskCategory(w, EMAIL_PATTERN, (raw) => {
      const token = '[EMAIL_' + (++emailN) + ']';
      tokenMap[token] = raw;
      return token;
    }, emailSeen));

    let phoneN = 0;
    const phoneSeen = new Map();
    working = working.map((w) => maskCategory(w, PHONE_PATTERN, (raw) => {
      const token = '[PHONE_' + (++phoneN) + ']';
      tokenMap[token] = raw;
      return token;
    }, phoneSeen));

    let dateN = 0;
    const dateSeen = new Map();
    for (const pattern of DATE_PATTERNS) {
      working = working.map((w) => maskCategory(w, pattern, (raw) => {
        const token = '[DATE_' + (++dateN) + ']';
        tokenMap[token] = raw;
        return token;
      }, dateSeen));
    }

    let moneyN = 0;
    const moneySeen = new Map();
    working = working.map((w) => maskCategory(w, MONEY_PATTERN, (raw) => {
      const token = '[CURRENCY_VAL_' + (++moneyN) + ']';
      tokenMap[token] = raw;
      return token;
    }, moneySeen));

    // Firm names before generic company names before bare person names — each
    // pass only ever sees text the previous pass didn't already replace with
    // a token, so a law firm's own name can never be re-split into a bare
    // "person name" match afterward.
    //
    // opposingN is shared across the law-firm and person-name passes below —
    // both can independently decide a match is opposing-flagged, and if each
    // kept its own counter starting at 0, a law firm AND a separate person
    // that are both the first opposing-flagged match in their own pass would
    // both mint the literal token "[OPPOSING_COUNSEL_1]". That collision
    // isn't cosmetic: tokenMap can only hold one value per key, so the
    // second write silently overwrites the first, and unmask() would then
    // restore BOTH occurrences in the masked text to the same wrong value.
    let lawFirmN = 0;
    let opposingN = 0;
    const lawFirmSeen = new Map();
    working = working.map((w) => maskCategory(w, LAW_FIRM_PATTERN, (raw, offset) => {
      const opposing = nearOpposingTrigger(w, offset);
      const token = opposing ? '[OPPOSING_COUNSEL_' + (++opposingN) + ']' : '[LAW_FIRM_' + letterIndex(lawFirmN++) + ']';
      tokenMap[token] = raw;
      return token;
    }, lawFirmSeen));

    let companyN = 0;
    const companySeen = new Map();
    working = working.map((w) => maskCategory(w, COMPANY_PATTERN, (raw) => {
      const token = '[COMPANY_' + letterIndex(companyN++) + ']';
      tokenMap[token] = raw;
      return token;
    }, companySeen));

    let nameN = 0;
    const nameSeen = new Map();
    working = working.map((w) => maskCategory(w, NAME_PATTERN, (raw, offset) => {
      const opposing = nearOpposingTrigger(w, offset);
      const token = opposing ? '[OPPOSING_COUNSEL_' + (++opposingN) + ']' : '[CLIENT_NAME_' + (++nameN) + ']';
      tokenMap[token] = raw;
      return token;
    }, nameSeen, trimNameEdges));

    const counts = {
      emails: emailN, phones: phoneN, dates: dateN, money: moneyN, lawFirms: lawFirmN, companies: companyN,
      names: nameN, opposing: opposingN,
      total: emailN + phoneN + dateN + moneyN + lawFirmN + companyN + nameN + opposingN
    };

    return { maskedTexts: working, tokenMap, counts };
  }

  // Single-text convenience wrapper — a batch of one is byte-identical to
  // this file's original single-text implementation (same pattern order,
  // same shared-opposingN counter, same dedup-by-raw-value seen maps), so
  // every existing caller and test of mask()/unmask() is unaffected.
  function mask(text) {
    const { maskedTexts, tokenMap, counts } = maskBatch([text]);
    return { maskedText: maskedTexts[0], tokenMap, counts };
  }

  // Substitutes every token back to its original text. Only ever called
  // client-side, on a value that already round-tripped through (or was
  // generated entirely from) masked tokens — this is the one place real PII
  // is reconstructed, and it never touches anything but this tab's own memory.
  function unmask(maskedText, tokenMap) {
    let out = String(maskedText || '');
    for (const [token, original] of Object.entries(tokenMap || {})) {
      out = out.split(token).join(original);
    }
    return out;
  }

  return { mask, maskBatch, unmask };
})();

if (typeof module !== 'undefined') module.exports = { FlowPrivacyShield };
