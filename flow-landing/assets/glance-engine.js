// Mirrored, not authored, here — source of truth is:
//   flow-trial-extension/core/domains.js
//   flow-trial-extension/core/extract.js
//   flow-trial-extension/core/judgment.js
// Regenerate with: scripts/build-glance-engine.sh
// Last synced: 2026-10-28
//
// This is the exact client-side judgment engine the Glance extension
// runs — concatenated as-is (no edits) so the live demo on trial.html
// runs the real product, not a re-implementation of it.

// Domain profiles — the "what kind of work do you do" dimension.
//
// A profile never encodes a rule. It supplies vocabulary: which nouns count as a
// real object of work in this field, and how to phrase the action once the
// judgment engine has decided there is one. Every profile runs through the same
// scorer with the same weights; the profile only adds its own entity vocabulary
// and writes the sentence at the end.
//
// Adding a line of work means adding a profile here. It never means asking
// someone to author "when X, do Y" — that is the configuration burden this
// product exists to remove.

const FLOW_DOMAINS = [
  {
    id: 'sales',
    label: 'Sales & business development',
    entity: 'Deal / client',
    // Nouns that mean "this message is about the object of my work". The
    // Hebrew half has no \b wrapper for the same reason judgment.js's Hebrew
    // signals don't: \b only fires around [A-Za-z0-9_], so it's a silent
    // no-op — never a match — against Hebrew letters.
    entityWords: /\b(deal|proposal|quote|pricing|contract|renewal|pilot|po\b|purchase order|order|subscription|seat[s]?|contract value|mrr|arr|msa|sow|statement of work)\b|(עסקה|הצעת מחיר|חוזה|הזמנה|מנוי|חידוש|הסכם)/i,
    title(facts) {
      if (facts.lost) return 'Log lost deal';
      if (facts.moneyText && facts.date) return 'Log ' + facts.moneyText + ' confirmed, ' + facts.dateText;
      if (facts.moneyText) return 'Log confirmed value ' + facts.moneyText;
      if (facts.date) return 'Log agreed date ' + facts.dateText;
      return 'Log deal update';
    }
  },
  {
    id: 'legal',
    label: 'Legal & deal coordination',
    entity: 'Matter / agreement',
    entityWords: /\b(agreement|contract|matter|clause|amendment|addendum|nda|counterparty|execution|filing|redline|counsel|term sheet|msa|sow|statement of work)\b/i,
    title(facts) {
      if (facts.executed) return 'Log agreement executed';
      if (facts.date) return 'Log deadline ' + facts.dateText;
      if (facts.moneyText) return 'Log agreed consideration ' + facts.moneyText;
      return 'Log matter update';
    }
  },
  {
    id: 'finance',
    label: 'Finance & billing',
    entity: 'Invoice / vendor',
    entityWords: /\b(invoice|bill|billing|payment|remittance|receipt|vendor|supplier|statement|credit note|purchase order|po number|net ?\d{2})\b/i,
    title(facts) {
      if (facts.dispute) return 'Log billing exception';
      if (facts.moneyText && facts.date) return 'Log ' + facts.moneyText + ' due ' + facts.dateText;
      if (facts.moneyText) return 'Log invoice ' + facts.moneyText;
      if (facts.date) return 'Log payment date ' + facts.dateText;
      return 'Log billing update';
    }
  },
  {
    id: 'ops',
    label: 'Operations & admin',
    entity: 'Task / request',
    entityWords: /\b(request|ticket|order|shipment|delivery|schedule|booking|onboarding|access|approval|handover|sla)\b/i,
    title(facts) {
      if (facts.date) return 'Log commitment due ' + facts.dateText;
      if (facts.moneyText) return 'Log ' + facts.moneyText + ' agreed';
      return 'Log follow-up commitment';
    }
  },
  {
    id: 'support',
    label: 'Customer success & support',
    entity: 'Ticket / renewal',
    entityWords: /\b(ticket|renewal|churn|escalation|refund|complaint|support case|csat|downgrade|cancel(?:lation)?)\b/i,
    title(facts) {
      if (facts.lost) return 'Log churn risk';
      if (facts.date && facts.moneyText) return 'Log renewal ' + facts.moneyText + ' due ' + facts.dateText;
      if (facts.moneyText) return 'Log refund ' + facts.moneyText;
      if (facts.date) return 'Log renewal date ' + facts.dateText;
      return 'Log account update';
    }
  },
  {
    id: 'hr',
    label: 'Recruiting & hiring',
    entity: 'Candidate / offer',
    entityWords: /\b(candidate|offer letter|interview|hire|hiring|onboarding|background check|reference check|start date|headcount)\b/i,
    title(facts) {
      if (facts.lost) return 'Log candidate declined';
      if (facts.date && facts.moneyText) return 'Log offer ' + facts.moneyText + ', starts ' + facts.dateText;
      if (facts.moneyText) return 'Log offer ' + facts.moneyText;
      if (facts.date) return 'Log start date ' + facts.dateText;
      return 'Log hiring update';
    }
  }
];

if (typeof module !== 'undefined') module.exports = { FLOW_DOMAINS };

// Pulls structured facts out of one email's visible text.
//
// This is what turns "an email happened" into something worth writing to a CRM.
// Without it the best a note can say is "Flow saw an email"; with it the note
// carries the number, the date and the sentence that actually decided something.
//
// Everything here runs on the device against text already on screen. There is no
// network call in this file, and there is no model — it is deterministic pattern
// work, which is why it can state exactly what it found and why.

const FlowExtract = (() => {
  const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  // Same Sunday-first order as DAYS above, so both arrays line up 1:1 with
  // JS's own Date.getDay() (0 = Sunday) and the two "by/on <weekday>" blocks
  // in parseDate() below can share identical delta math.
  const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  // Gregorian month names as Israeli business mail actually writes them
  // ("7 בספטמבר"), in the same order as MONTHS so the index is the month.
  const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  // Short month names ("Oct 8, 2026") are the same dates as the full names
  // above. "sept" is the four-letter form of September. Full names are
  // matched first, so this map is only for the abbreviation.
  const MONTH_ABBR = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7,
    sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
  };

  const CURRENCY = {
    '$': 'USD', 'us$': 'USD', 'usd': 'USD',
    '€': 'EUR', 'eur': 'EUR',
    '£': 'GBP', 'gbp': 'GBP',
    '₪': 'ILS', 'nis': 'ILS', 'ils': 'ILS',
    '₹': 'INR', 'inr': 'INR',
    'c$': 'CAD', 'cad': 'CAD', 'a$': 'AUD', 'aud': 'AUD'
  };

  // Symbol/code before the number, or code after it. Optional k/m suffix.
  // The post-group also accepts a bare symbol (₪/$/€/£) — Hebrew business
  // writing conventionally puts ₪ AFTER the number ("15,000 ₪"), not before
  // it the way "$15,000" does, so a post-only symbol had to be a first-class
  // case here rather than assumed to always be a 3-letter code like "NIS".
  // The magnitude suffix MUST be a whole token. Written as a bare `(k|m)?` it
  // matched the first letter of whatever word came next, because nothing
  // required the suffix to end: "$20 monthly" parsed as 20 x 1e6 = $20,000,000,
  // "$12 minimum" as $12,000,000, "$50 kits" as $50,000. Those are not exotic
  // inputs — per-seat pricing is written "monthly" in half the emails this
  // product exists to read, and a six-order-of-magnitude error in a figure the
  // user is about to file is the single most damaging thing this file could do.
  //
  // The trailing lookahead closes it. Longer words are listed after the single
  // letters and reached by backtracking: "million" first tries `m`, fails the
  // lookahead on the following "i", and backtracks into the full word. The
  // lookahead bans Hebrew letters too, so "מיליון" can't be clipped to a
  // prefix the same way — and it is a lookahead rather than \b because \b is
  // ASCII-only and never fires next to Hebrew (same trap documented in
  // parseDate below and in privacyShield.js).
  const MULT = { k: 1e3, thousand: 1e3, אלף: 1e3, m: 1e6, mm: 1e6, million: 1e6, מיליון: 1e6, bn: 1e9, billion: 1e9 };
  const MONEY_RE = new RegExp(
    '(?:(\\$|€|£|₪|₹|US\\$|C\\$|A\\$|USD|EUR|GBP|NIS|ILS|INR|CAD|AUD)\\s?)?' +
    '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)' +
    '(?:\\s?(k|m|mm|bn|thousand|million|billion|אלף|מיליון)(?![A-Za-z\\u0590-\\u05FF]))?' +
    // ש״ח / ש"ח / שח — the abbreviation Israeli business writing actually
    // uses for the shekel far more often than spelling out שקלים or reaching
    // for the ₪ symbol; missing this meant a real, explicit figure like
    // "3,850 ש״ח" parsed as no money signal at all.
    '(?:\\s?(USD|EUR|GBP|NIS|ILS|INR|CAD|AUD|dollars|euros|pounds|shekels|\\$|€|£|₪|שקל(?:ים)?|ש(?:״|")?ח))?',
    'gi'
  );

  function parseMoney(text) {
    const hits = [];
    let m;
    MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(text)) !== null) {
      const [raw, pre, digits, mult, post] = m;
      const code = CURRENCY[(pre || '').toLowerCase()] || CURRENCY[(post || '').toLowerCase().slice(0, 3)] ||
                   (/dollars/i.test(post || '') ? 'USD' : /euros/i.test(post || '') ? 'EUR' :
                    /pounds/i.test(post || '') ? 'GBP' : /shekels|שקל|ש(?:״|")?ח/i.test(post || '') ? 'ILS' : null);
      // A bare number with no currency marker is not money — it's a floor number,
      // a version, a headcount. Refusing those is most of what keeps this honest.
      if (!code) continue;
      let value = parseFloat(digits.replace(/,/g, ''));
      if (mult) value *= (MULT[mult.toLowerCase()] || 1);
      // Percentages and years dressed up as money are almost always neither.
      const after = text.slice(m.index + raw.length, m.index + raw.length + 2);
      if (after.trim().startsWith('%')) continue;
      hits.push({ raw: raw.trim(), value, currency: code, index: m.index });
    }
    if (!hits.length) return null;
    // The largest figure in a message is nearly always the one being decided;
    // smaller ones tend to be line items, fees or per-unit rates.
    return hits.sort((a, b) => b.value - a.value)[0];
  }

  function fmtMoney(money) {
    if (!money) return null;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: money.currency,
        maximumFractionDigits: money.value % 1 === 0 ? 0 : 2
      }).format(money.value);
    } catch (e) {
      return money.raw;
    }
  }

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // `new Date(y, m, d)` silently rolls impossible days forward: February 30
  // becomes March 2, April 31 becomes May 1. A typo or an odd phrasing would
  // therefore have produced a real-looking ISO date for a day the sender never
  // wrote. Constructing and then confirming the calendar kept every field is
  // the only way to tell a valid date from a rolled-over one.
  function buildDate(year, monthIdx, day) {
    if (!(monthIdx >= 0 && monthIdx <= 11) || !(day >= 1 && day <= 31)) return null;
    const d = new Date(year, monthIdx, day);
    if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) return null;
    return d;
  }

  // How far either side of today a bare month-and-day is still unambiguous.
  // Past is kept tight because a date a month gone is usually being recalled,
  // not scheduled; forward is wider because that is where commitments live.
  const PAST_MS = 1000 * 60 * 60 * 24 * 30;
  const FUTURE_MS = 1000 * 60 * 60 * 24 * 120;

  // A month and a day with no year attached. The old code simply assumed the
  // current year, which breaks hardest exactly where email traffic is heaviest
  // — across New Year. On 5 Jan 2027, "we signed on December 28" resolved to
  // 2027-12-28: a commitment placed almost a full year in the future when the
  // sender meant eight days in the past.
  //
  // Instead, score last year / this year / next year, and accept only if
  // exactly ONE of them lands inside the window where the sender's intent is
  // not in doubt. Two candidates in the window, or none, means the message
  // genuinely did not say — and per this file's rule, no date beats a
  // confidently wrong one, so it returns the sender's own words and no ISO.
  function monthDay(raw, monthIdx, day, explicitYear, now) {
    if (explicitYear) {
      const d = buildDate(+explicitYear, monthIdx, day);
      return d ? { raw, iso: iso(d) } : null;
    }
    const y = now.getFullYear();
    const inWindow = [y - 1, y, y + 1]
      .map((yy) => buildDate(yy, monthIdx, day))
      .filter((d) => d && (now - d) <= PAST_MS && (d - now) <= FUTURE_MS);
    if (inWindow.length !== 1) {
      // Nothing valid at all (February 30 in any year) is a non-date, not an
      // ambiguous one — say so differently so callers can tell them apart.
      const anyValid = [y - 1, y, y + 1].some((yy) => buildDate(yy, monthIdx, day));
      return anyValid ? { raw, iso: null, ambiguousYear: true } : null;
    }
    return { raw, iso: iso(inWindow[0]) };
  }

  function localToday(now) {
    const d = now || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // An invoice number, a version, or a phone is not a day.
  function slashRejected(text, index) {
    const before = text.slice(Math.max(0, index - 32), index);
    if (/(?:invoice|inv|version|ver|חשבונית|גרסה|טלפון|phone|ext)\.?\s*[#:]?\s*$/i.test(before)) return true;
    if (/(?:^|[^A-Za-z])v\s*$/i.test(before)) return true;
    return false;
  }
  // A slash is a date only beside a preposition, a weekday, or a time or meeting word.
  // Day-first for ambiguous N/N only beside a Hebrew יום/ביום weekday name,
  // not anywhere Hebrew appears (mixed English mail with a signature stays M/D).
  function hebrewWeekdayNear(text, index, span) {
    const start = Math.max(0, index - 48);
    const end = Math.min(text.length, index + (span || 0) + 48);
    const window = text.slice(start, end);
    return /(?:ביום|יום)\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/.test(window);
  }
  function slashDateContext(text, index, raw) {
    const before = text.slice(Math.max(0, index - 40), index);
    const window = text.slice(Math.max(0, index - 48), Math.min(text.length, index + String(raw || '').length + 48));
    if (/(?:עד|ב-|ב־|לפני|ביום)\s*$/.test(before)) return true;
    if (/\b(?:on|by|until|before|due|no later than)\s*$/i.test(before)) return true;
    if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(window)) return true;
    if (/יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/.test(window)) return true;
    if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(window)) return true;
    if (/(?:בשעה|(?<![\u0590-\u05FF])בעה|\bat\s+\d|\b\d{1,2}:\d{2}\b)/i.test(window)) return true;
    return false;
  }
  // 23/10 is day 23. 10/23 is month 10. 5/6 is either, so it stays words with no ISO.
  // Day-first stays. A bare slash, a past day, or a number inside an invoice is not a date.
  function slashDate(text, now) {
    const src = String(text || '');
    const re = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
    const today = localToday(now || new Date());
    let ambiguous = null;
    let m;
    while ((m = re.exec(src))) {
      if (slashRejected(src, m.index)) continue;
      const a = +m[1];
      const b = +m[2];
      let day = null;
      let monthIdx = null;
      if (a > 12 && a <= 31 && b >= 1 && b <= 12) { day = a; monthIdx = b - 1; }
      else if (b > 12 && b <= 31 && a >= 1 && a <= 12) { day = b; monthIdx = a - 1; }
      else if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
        const heDayFirst = hebrewWeekdayNear(src, m.index, m[0].length) ||
          (/[\u0590-\u05FF]/.test(src.slice(Math.max(0, m.index - 48), Math.min(src.length, m.index + m[0].length + 48))) &&
            slashDateContext(src, m.index, m[0]));
        if (heDayFirst) { day = a; monthIdx = b - 1; }
        else { if (!ambiguous) ambiguous = { raw: m[0], iso: null }; continue; }
      }
      else { if (!ambiguous) ambiguous = { raw: m[0], iso: null }; continue; }
      let year = m[3] ? +m[3] : null;
      if (year != null && year < 100) year += 2000;
      const built = monthDay(m[0], monthIdx, day, year, now || new Date());
      const iso = built && built.iso;
      if (!iso || !slashDateContext(src, m.index, m[0]) || iso < today) {
        if (!ambiguous) ambiguous = { raw: m[0], iso: null };
        continue;
      }
      return built;
    }
    return ambiguous;
  }

  // A clock, however it is written. בשעה, ב-14:00, at 14:00, and a bare HH:MM
  // are the same hour. The conflict check must not depend on one spelling.
  function hasStatedClock(src) {
    if (/(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)\s*\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
    if (/(?:^|[^\u0590-\u05FF\d])ב-\s*\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
    if (/\bat\s+\d{1,2}(?::\d{2})?\b/i.test(src)) return true;
    if (/(?:^|[^\d])\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
    return false;
  }
  function numericDayMonth(src, preferDayFirst) {
    const slash = src.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
    const dotted = src.match(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/);
    const m = slash || dotted;
    if (!m) return null;
    const a = +m[1];
    const b = +m[2];
    let day = null;
    let month = null;
    if (a > 12 && a <= 31 && b >= 1 && b <= 12) { day = a; month = b; }
    else if (b > 12 && b <= 31 && a >= 1 && a <= 12) { day = b; month = a; }
    else if (a >= 1 && a <= 12 && b >= 1 && b <= 12 && preferDayFirst) { day = a; month = b; }
    else return null;
    return {
      day: day,
      month: month,
      yearRaw: m[3] || null,
      token: m[1] + (slash ? '/' : '.') + m[2] + (m[3] ? (slash ? '/' : '.') + m[3] : '')
    };
  }
  function namedWeekday(src) {
    const he = src.match(/(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05FF])/);
    const en = src.match(new RegExp('\\b(' + DAYS.join('|') + ')\\b', 'i'));
    if (he && (!en || he.index <= en.index)) return { index: DAYS_HE.indexOf(he[1]), he: true, raw: he[0] };
    if (en) return { index: DAYS.indexOf(en[1].toLowerCase()), he: false, raw: en[0] };
    return null;
  }
  function choiceLabel(date, he) {
    const name = he
      ? DAYS_HE[date.getDay()]
      : DAYS[date.getDay()].charAt(0).toUpperCase() + DAYS[date.getDay()].slice(1);
    return name + ' ' + date.getDate() + '/' + (date.getMonth() + 1);
  }
  function nearestWeekday(anchor, weekday) {
    for (let delta = 1; delta <= 3; delta++) {
      const before = new Date(anchor.getTime());
      before.setDate(anchor.getDate() - delta);
      if (before.getDay() === weekday) return before;
      const after = new Date(anchor.getTime());
      after.setDate(anchor.getDate() + delta);
      if (after.getDay() === weekday) return after;
    }
    return null;
  }
  // Weekday + a day-first date is one statement. 22/10 and 22.10 are 22
  // October. When the weekday is that calendar day and a clock was written,
  // the date stands. When it is not, and a clock was written, neither
  // reading is chosen: both dates come back as choices and iso stays empty.
  // No clock keeps the older read, so a conflict does not become a new event.
  function weekdayDayFirst(text, now) {
    const src = String(text || '');
    const dayName = namedWeekday(src);
    const num = numericDayMonth(src, dayName && dayName.he);
    if (!dayName || !num || !now) return null;
    const clock = hasStatedClock(src);
    const raw = dayName.raw + ' ' + num.token;
    if (dayName.index < 0 || num.month < 1 || num.month > 12 || num.day < 1 || num.day > 31) {
      if (!clock) return null;
      return { raw: raw, iso: null, invalidDate: true };
    }
    let year = null;
    if (num.yearRaw) {
      year = +num.yearRaw;
      if (year < 100) year += 2000;
    }
    let written = null;
    if (year) {
      written = buildDate(year, num.month - 1, num.day);
      if (!written) return clock ? { raw: raw, iso: null, invalidDate: true } : null;
    } else {
      const y = now.getFullYear();
      const inWindow = [y - 1, y, y + 1]
        .map((yy) => buildDate(yy, num.month - 1, num.day))
        .filter((d) => d && (now - d) <= PAST_MS && (d - now) <= FUTURE_MS);
      if (inWindow.length !== 1) return clock ? { raw: raw, iso: null, invalidDate: true } : null;
      written = inWindow[0];
    }
    if (written.getDay() === dayName.index) {
      return { raw: raw, iso: iso(written), statedWeekday: true };
    }
    // No clock: leave the day to the older parser. A conflict with no
    // clock must not become a new event the base judge does not make.
    if (!clock) return null;
    const other = nearestWeekday(written, dayName.index);
    if (!other) return { raw: raw, iso: null, contradictsWeekday: true };
    return {
      raw: raw,
      iso: null,
      contradictsWeekday: true,
      choices: [
        { iso: iso(other), label: choiceLabel(other, dayName.he) },
        { iso: iso(written), label: choiceLabel(written, dayName.he) }
      ]
    };
  }

  // Only dates the message states outright. A date guessed from context is worse
  // than no date at all once it lands in someone's CRM.
  // Forms people really write that the readers below do not take (Hebrew weekday abbreviations, dotted dates, «ב-8 בערב»,
  // "half past 8", "by the 30th", «בעוד יומיים») are made explicit first by core/day-words.js, when it is loaded.
  function dayWordsFirst(text, now) {
    try {
      const D = typeof FlowDayWords !== 'undefined' ? FlowDayWords : (typeof require !== 'undefined' ? require('./day-words.js').FlowDayWords : null);
      return D ? D.normalize(text, now) : text;
    } catch (e) { return text; }
  }

  function parseDate(text, now) {
    text = dayWordsFirst(text, now);
    now = now || new Date();
    let m;

    // An ISO-shaped string is not automatically an ISO date. This passed
    // "2026-13-45" and "2026-00-00" straight through as if they were real,
    // because nothing checked the numbers — order and reference codes in that
    // shape are common in invoice mail. Build it and confirm the calendar
    // agrees before calling it a date.
    m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) {
      const d = buildDate(+m[1], +m[2] - 1, +m[3]);
      if (d) return { raw: m[0], iso: m[0] };
      return null;
    }

    const monthNames = MONTHS.join('|');
    // A bare "March 3" carries no year, so resolving it means guessing. Guessing
    // forward ("it must mean next March") silently rewrites "the March 3 kickoff
    // already happened" into a future commitment and writes that wrong ISO date
    // into someone's CRM. When the year is genuinely ambiguous we keep the words
    // the sender used and refuse to emit an ISO date at all — no date beats a
    // confidently wrong one, which is the same rule the rest of this file follows.
    m = text.match(new RegExp('\\b(' + monthNames + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'i'));
    if (m) return monthDay(m[0], MONTHS.indexOf(m[1].toLowerCase()), +m[2], m[3], now);

    m = text.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + monthNames + ')(?:,?\\s+(\\d{4}))?\\b', 'i'));
    if (m) return monthDay(m[0], MONTHS.indexOf(m[2].toLowerCase()), +m[1], m[3], now);

    // "Oct 8, 2026" / "Oct. 8". Same monthDay rules as "October 8, 2026":
    // a written year is that year, a bare day uses the window. Checked
    // before "tomorrow", so "tomorrow (Oct 8, 2026)" keeps October 8
    // after tomorrow has moved on. "sept" is listed before "sep" so the
    // shorter token does not clip it.
    m = text.match(/\b(sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
    if (m) return monthDay(m[0], MONTH_ABBR[m[1].toLowerCase()], +m[2], m[3], now);

    // "7 בספטמבר" / "ב-21 בספטמבר 2026". The ב clings to the month name
    // (בספטמבר), the same way English puts the month name next to the day.
    // No year uses monthDay()'s window, so a bare day six months out stays
    // unresolved instead of being filed on the wrong year. A Hebrew letter
    // after the month name ("בספטמבראי") is not that month.
    m = text.match(new RegExp('(?:^|[^\\d\\u0590-\\u05FF])(\\d{1,2})\\s+ב-?(' + MONTHS_HE.join('|') + ')(?![\\u0590-\\u05FF])(?:\\s+(\\d{4}))?'));
    if (m) return monthDay(m[0].replace(/^[^\d]+/, ''), MONTHS_HE.indexOf(m[2]), +m[1], m[3], now);

    // Weekday + numeric day + any clock spelling. A conflict returns both
    // dates and no iso, before a bare "ביום רביעי" can book a different day.
    const stated = weekdayDayFirst(text, now);
    if (stated) return stated;

    // "by Monday" / "next Friday" — only when a scheduling word introduces it,
    // so a signature line reading "Monday" is not mistaken for a deadline.
    m = text.match(new RegExp('\\b(?:by|on|before|due|until|no later than|signing|closing|starting|effective|kick(?:ing)? off)\\s+(?:on\\s+)?(?:next\\s+)?(' + DAYS.join('|') + ')\\b', 'i'));
    if (m) {
      const target = DAYS.indexOf(m[1].toLowerCase());
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      // "next Friday" has to land at least a week further out than plain
      // "Friday" — otherwise the word "next" is captured by the regex but
      // has no effect on the computed date, and a sender who explicitly
      // said "next Friday" to mean the Friday after the closest one gets
      // logged with a date up to a week too early. The same-weekday case
      // (delta === 0, "by Friday" said on a Friday) already rolls forward
      // a full week regardless of "next", so it needs no separate bump.
      if (delta === 0) delta = 7;
      else if (/next\s/i.test(m[0])) delta += 7;
      d.setDate(d.getDate() + delta);
      // "by Friday 23/10": the number is the day. The weekday name is the same Friday.
      const numbered = slashDate(text, now);
      if (numbered && numbered.iso) return numbered;
      return { raw: m[0], iso: iso(d) };
    }

    // "Let's do a call next Friday" has no "on"/"by" in front of it. "next"
    // is itself the scheduling word — a signature line does not say "next
    // Friday" — and leaving it unresolved dropped a real meeting. Same
    // delta rule as "on next Friday" above, including "next Friday" said
    // on a Friday staying one week out rather than two.
    m = text.match(new RegExp('\\bnext\\s+(' + DAYS.join('|') + ')\\b', 'i'));
    if (m) {
      const target = DAYS.indexOf(m[1].toLowerCase());
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      else delta += 7;
      d.setDate(d.getDate() + delta);
      return { raw: m[0], iso: iso(d) };
    }

    // "Thursday at 11" / "this Friday at 3pm". The clock is what makes the
    // bare weekday a day rather than a signature line that just says Monday.
    // "this Friday" said on Friday is today; a bare Friday said on Friday
    // is the following one, same rule as "by Friday".
    m = text.match(new RegExp('\\b(this\\s+|next\\s+)?(' + DAYS.join('|') + ')\\b(?=\\s+at\\s+\\d)', 'i'));
    if (m) {
      const target = DAYS.indexOf(m[2].toLowerCase());
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      const flagged = (m[1] || '').toLowerCase();
      if (delta === 0) {
        if (flagged.indexOf('this') !== 0) delta = 7;
      } else if (flagged.indexOf('next') === 0) delta += 7;
      d.setDate(d.getDate() + delta);
      return { raw: m[0], iso: iso(d) };
    }

    // Hebrew equivalent of the "by/on <weekday>" block above — "עד יום שני"
    // (by Monday), "ביום רביעי" (on Wednesday), "לא יאוחר מיום חמישי" (no
    // later than Thursday). Requires the same scheduling-word guard so a
    // signature reading "יום נעים" ("have a nice day") is never mistaken
    // for a deadline.
    //
    // Deliberately no trailing \b: JS's \b is defined only against ASCII
    // \w ([A-Za-z0-9_]), so a \b placed right after a Hebrew word sits
    // between two non-\w characters — never a boundary — and the whole
    // match silently never fires. Same failure shape as the PHONE_PATTERN
    // fix earlier in privacyShield.js: a boundary that can only ever hold
    // next to ASCII text is not a boundary at all next to Hebrew.
    // "הבא" ("next") follows the weekday ("ביום שני הבא"). The old check
    // looked for הבא at the end of a match that stopped at the weekday, so
    // it never fired and "next Monday" was filed on this Monday. הבא must
    // not be a prefix of a longer word ("הבאנו", "we brought") — there is
    // no \b after Hebrew, so the lookahead is the boundary.
    m = text.match(new RegExp('(?:עד|ב-?|ל|לא יאוחר מ-?)\\s*יום\\s+(' + DAYS_HE.join('|') + ')(?:\\s+הבא(?![\\u0590-\\u05FF]))?'));
    if (m) {
      const target = DAYS_HE.indexOf(m[1]);
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      const isNext = /הבא(?![\u0590-\u05FF])/.test(m[0]);
      if (delta === 0) delta = 7;
      else if (isNext) delta += 7;
      d.setDate(d.getDate() + delta);
      return { raw: m[0], iso: iso(d) };
    }

    // A single named day, not a range. "tomorrow" said on Friday is
    // Saturday — the sender stated it. "next week" is a span, so it stays
    // unresolved. Checked after explicit dates and weekdays so "Friday,
    // or tomorrow if needed" keeps Friday.
    //
    // "today" is not in that list. "as of today" and "the document today"
    // are not a day to file, and treating them as one pushed a price quote
    // over the threshold. Today counts only next to a deadline word, a
    // meeting word, or a clock ("due today", "meet today", "today at 3pm").
    m = text.match(/\b(the day after tomorrow|tomorrow)\b/i);
    if (m) {
      const word = m[1].toLowerCase();
      const days = word === 'tomorrow' ? 1 : 2;
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return { raw: m[0], iso: iso(d) };
    }
    m = text.match(/\b(?:by|due|before|until|no later than)\s+today\b|\b(?:meet(?:ing)?|call|sync)\s+today\b|\btoday\s+at\b/i);
    if (m) {
      const d = new Date(now);
      return { raw: m[0], iso: iso(d) };
    }
    // "by EOD" / "due end of day" is today. A bare "end of day report"
    // has no deadline word, so it is not a date.
    m = text.match(/\b(?:by|before|due|until|no later than)\s+(?:the\s+)?(?:eod|end of day|close of business|cob)\b/i);
    if (m) {
      const d = new Date(now);
      return { raw: m[0], iso: iso(d) };
    }

    // מחרתיים before מחר so the longer word is not clipped. ל? covers
    // למחר ("for tomorrow"). אתמול stays unresolved: a past day is not
    // something to put on a calendar. היום is the same trap as English
    // "today" — only next to a meeting or a clock.
    m = text.match(/(?:^|[^\u0590-\u05FF])ל?(מחרתיים|מחר)(?![\u0590-\u05FF])/);
    if (m) {
      const days = m[1] === 'מחר' ? 1 : 2;
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return { raw: m[1], iso: iso(d) };
    }
    m = text.match(/(?:פגישה|שיחה|עד)\s+היום(?![\u0590-\u05FF])|היום\s+בשעה/);
    if (m) {
      const d = new Date(now);
      return { raw: 'היום', iso: iso(d) };
    }
    m = text.match(/(?:עד|לפני)\s+סוף\s+היום(?![\u0590-\u05FF])/);
    if (m) {
      const d = new Date(now);
      return { raw: 'היום', iso: iso(d) };
    }

    // One side above 12 is a day or a month, not a guess. 5/6 stays unresolved.
    const slash = slashDate(text, now);
    if (slash) return slash.iso ? slash : { raw: slash.raw, iso: null };

    return null;
  }

  // Only a time the message states next to an explicit time marker ("at 3pm",
  // "בשעה 15:00") — a bare "15:00" or "3" floating in text is as likely to be
  // a flight number, a room, or a price as a meeting time, and guessing here
  // would be the same mistake parseDate() above already refuses to make for
  // an ambiguous year.
  //
  // An hour that could be either half of the day is not a time. English
  // "at 3" stays unresolved, and a written ":00" with no half of the day
  // stays unresolved: both used to become a 03:00 event. Hebrew "בשעה 3"
  // names the hour and no minutes. That hour is the workday clock, the
  // same as the word "שלוש", so the meeting keeps a calendar step.
  function resolveClock(hour, minute, marker) {
    let h = hour;
    if (h > 23 || minute > 59 || h < 0 || minute < 0) return null;
    if (!marker) {
      if (h < 8 || h === 12) return null;
      return { hour: h, minute: minute };
    }
    if (marker === 'am' || marker === 'in the morning') {
      if (h === 12) h = 0;
      else if (h > 12) return null;
      return { hour: h, minute: minute };
    }
    if (marker === 'pm' || marker === 'in the afternoon') {
      if (h < 12) h += 12;
      return h > 23 ? null : { hour: h, minute: minute };
    }
    // "בצהריים": noon, or the early afternoon (1-6). 8 בצהריים is not a
    // phrase this should invent a clock for.
    if (marker === 'noon-window') {
      if (h >= 1 && h <= 6) h += 12;
      else if (h !== 12 && h < 13) return null;
      return { hour: h, minute: minute };
    }
    if (marker === 'in the evening') {
      if (h === 0 || h === 12) return null;
      if (h < 12) h += 12;
      return h > 23 ? null : { hour: h, minute: minute };
    }
    // Night splits. 3 בלילה is after midnight. 11 at night is 23:00.
    // 6 at night could be either, so it stays unresolved.
    if (marker === 'at night') {
      if (h === 12) h = 0;
      else if (h >= 8 && h <= 11) h += 12;
      else if (!((h >= 1 && h <= 4) || h >= 13)) return null;
      return { hour: h, minute: minute };
    }
    return null;
  }

  function parseTime(text) {
    text = dayWordsFirst(text);
    let m;

    // "at 8.30 pm": a dotted clock that carries am or pm is that clock, not 8:00 with ".30 pm" left over.
    m = text.match(/\bat\s+(\d{1,2})\.([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i);
    if (m) {
      const clock0 = resolveClock(+m[1], +m[2], m[3].toLowerCase().replace(/\./g, ''));
      if (!clock0) return null;
      return { raw: m[0], hour: clock0.hour, minute: clock0.minute };
    }

    m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|(?:in the|this) (?:morning|afternoon|evening)|at night)?\b/i);
    if (m) {
      const marker = (m[3] || '').toLowerCase().replace(/\./g, '').replace(/^this /, 'in the ');
      const clock = resolveClock(+m[1], m[2] ? +m[2] : 0, marker);
      if (!clock) return null;
      return { raw: m[0], hour: clock.hour, minute: clock.minute };
    }

    // בשעה/בשעות is an unambiguous "at the hour of" marker — unlike a bare
    // "ב-" prefix (used elsewhere for "on <weekday>"), it is never a room
    // number, a page reference, or anything else. Deliberately no trailing
    // \b for the same reason parseDate()'s Hebrew weekday block has none:
    // \b never fires next to Hebrew letters. The day-part, when it is
    // there, has the same Hebrew boundary: it must not be a prefix of a
    // longer word.
    const hePart = 'בבוקר|בצהריים|אחר הצהריים|אחר הצהרים|אחה["״׳\']צ|בערב|בלילה';
    // בעה is the typo of בשעה. It is the same "at the hour of" marker.
    m = text.match(new RegExp('(?:בשעה|בשעות|(?<![\\u0590-\\u05FF])בעה)\\s*(\\d{1,2})(?::(\\d{2}))?(?:\\s*(' + hePart + '))?(?![\\u0590-\\u05FF\\d])'));
    if (m) {
      const rawPart = (m[3] || '').replace(/["״׳']/g, '');
      const marker = rawPart === 'בבוקר' ? 'in the morning'
        : rawPart === 'בצהריים' ? 'noon-window'
        : (rawPart === 'אחר הצהריים' || rawPart === 'אחר הצהרים' || rawPart === 'אחהצ') ? 'in the afternoon'
        : rawPart === 'בערב' ? 'in the evening'
        : rawPart === 'בלילה' ? 'at night'
        : '';
      const minuteWritten = Boolean(m[2]);
      let clock = resolveClock(+m[1], minuteWritten ? +m[2] : 0, marker);
      // "בשעה 3" is an hour with no minutes. 1–7 with no day-part is the
      // workday hour (15:00), not 03:00 and not an unresolved day.
      if (!clock && !marker && !minuteWritten && +m[1] >= 1 && +m[1] <= 7) {
        clock = resolveClock(+m[1], 0, 'pm');
      }
      if (!clock) return null;
      return { raw: m[0], hour: clock.hour, minute: clock.minute };
    }

    // בשלוש / בארבע is the same workday hour as בשעה 3. Longest first, so
    // באחת עשרה is eleven and not one. A longer Hebrew word does not match.
    // English "at 3" and "בשעה 3:00" stay unresolved.
    const heHourWords = [
      ['אחת עשרה', 11], ['אחד עשרה', 11],
      ['שתיים עשרה', 12], ['שתים עשרה', 12],
      ['שתיים', 2], ['שתים', 2],
      ['שלוש', 3], ['ארבע', 4], ['חמש', 5], ['שש', 6],
      ['שבע', 7], ['שמונה', 8], ['תשע', 9], ['עשר', 10], ['אחת', 1]
    ];
    const heHourAlt = heHourWords.map((pair) => pair[0]).join('|');
    m = text.match(new RegExp('(?:^|[^\\u0590-\\u05FF])ב(' + heHourAlt + ')(\\s+וחצי|\\s+ורבע)?(?:\\s+(' + hePart + '))?(?![\\u0590-\\u05FF])'));
    if (m) {
      const spokenHour = heHourWords.find((pair) => pair[0] === m[1]);
      const rawPart = (m[3] || '').replace(/["״׳']/g, '');
      const marker = rawPart === 'בבוקר' ? 'in the morning'
        : rawPart === 'בצהריים' ? 'noon-window'
        : (rawPart === 'אחר הצהריים' || rawPart === 'אחר הצהרים' || rawPart === 'אחהצ') ? 'in the afternoon'
        : rawPart === 'בערב' ? 'in the evening'
        : rawPart === 'בלילה' ? 'at night'
        : '';
      const extra = m[2] && m[2].indexOf('חצי') !== -1 ? 30 : (m[2] && m[2].indexOf('רבע') !== -1 ? 15 : 0);
      let clock = spokenHour ? resolveClock(spokenHour[1], extra, marker) : null;
      if (!clock && spokenHour && !marker && spokenHour[1] >= 1 && spokenHour[1] <= 7) {
        clock = resolveClock(spokenHour[1], extra, 'pm');
      }
      if (clock) return { raw: m[0], hour: clock.hour, minute: clock.minute };
    }

    // "ב-14:00" is the same hour as "בשעה 14:00". A date ("ב-22/10") has no colon.
    m = text.match(/(?:^|[^\u0590-\u05FF\d])ב-\s*(\d{1,2}):(\d{2})(?!\d)/);
    if (m) {
      const clock = resolveClock(+m[1], +m[2], '');
      if (!clock) return null;
      return { raw: m[0], hour: clock.hour, minute: clock.minute };
    }

    // 11:00 next to a meeting noun is the hour. A bare 11:00 with no meeting
    // is still a flight, a room, or a price, and stays unresolved.
    if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(text)) {
      const re = /(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/g;
      let tm;
      while ((tm = re.exec(text))) {
        const clock = resolveClock(+tm[1], +tm[2], '');
        if (!clock) continue;
        return { raw: tm[1] + ':' + tm[2], hour: clock.hour, minute: clock.minute };
      }
    }

    return null;
  }

  function fmtTime(t) {
    if (!t) return null;
    return String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0');
  }

  // The sentence a human would quote if asked "what did this email decide?".
  function decisiveSentence(text, patterns) {
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 12 && s.length < 320);
    for (const p of patterns) {
      const hit = sentences.find((s) => p.test(s));
      if (hit) return hit;
    }
    return null;
  }

  function senderIsAutomated(email, text) {
    const local = String(email || '').split('@')[0].toLowerCase();
    if (/^(no-?reply|do-?not-?reply|noreply|notifications?|alerts?|mailer|bounce|postmaster|automated|support-bot)/.test(local)) return true;
    // newsletter@ news@ marketing@ — the local part, not a longer word such as newspaper.
    if (/^(newsletter|news|marketing)(?![a-z0-9])/.test(local)) return true;
    if (/\bunsubscribe\b|\bview (this )?in browser\b|\bmanage (your )?preferences\b|\byou are receiving this\b|\byou(?:'|’)re receiving this\b|\byou received this email because\b|קיבלת מייל זה|להסרה מרשימת התפוצה|הנך רשום/i.test(text)) return true;
    return false;
  }

  function extract(text, ctx) {
    const money = parseMoney(text);
    const time = parseTime(text);
    return {
      money,
      moneyText: fmtMoney(money),
      date: parseDate(text, ctx && ctx.now),
      time,
      timeText: fmtTime(time),
      automated: senderIsAutomated(ctx && ctx.senderEmail, text),
      wordCount: (text.match(/\S+/g) || []).length
    };
  }

  return { extract, parseMoney, parseDate, parseTime, fmtMoney, fmtTime, decisiveSentence, senderIsAutomated };
})();

if (typeof module !== 'undefined') module.exports = { FlowExtract };
else if (typeof globalThis !== 'undefined') globalThis.FlowExtract = FlowExtract;

// The judgment engine: decides whether one email is worth speaking up about.
//
// This file itself runs entirely on the device and sends nothing anywhere —
// still true, and still the default path for every message, English or
// Hebrew, that its patterns actually cover. It is a fixed keyword/regex
// corpus, not language understanding, so it has a real ceiling: a message
// this file scores { type: null } is not "Glance stayed local," it's
// "Glance found nothing" — content-gmail.js's ensureRemoteClassification()
// is the one place that gap gets a second, masked-text-only attempt (see
// glance-assist.js). Growing the corpus below keeps more real Hebrew and
// English business email inside this free, instant, fully local path
// rather than needing that fallback at all.
//
// It is not a keyword match. Each signal carries a weight and a reason; the
// score is their sum, and the chip only appears once the score clears a
// threshold that moves as you use it. Because every contribution is named, the
// popup can show you exactly why Flow spoke — which is the difference between a
// tool you trust and a tool you switch off.
//
// The design bias throughout is toward silence. A false positive costs the user
// their attention and their trust; a false negative costs one email they would
// have handled themselves anyway.

const FlowJudgment = (() => {
  // Fitted against test/judgment-corpus.cjs, not guessed. 55 measurably missed
  // the most common real decision in business email — a bare "Approved, go
  // ahead" with no figure and no date — while the old scorer let cold pitches
  // through. The cold-pitch penalty below is what buys the headroom to sit at 50.
  const BASE_THRESHOLD = 50;
  // Strong authorisations have to clear this bar on their own. 42 is the
  // weight; the gap up to BASE_THRESHOLD is added only when nothing else
  // positive is present (see score), so a reply bonus is not required.
  const STRONG_WEIGHT = 42;
  const MIN_THRESHOLD = 38;
  // Capped where a genuine decision can still clear it. Higher than this and a
  // run of dismissals mutes Flow outright, which is indistinguishable from a
  // broken extension to someone whose product promise is silence.
  const MAX_THRESHOLD = 72;

  // A decision was made — someone committed to something.
  // "deal" is deliberately NOT here: it is a topic word, not a commitment, and
  // it lives in the sales profile's entityWords where it belongs. Left in this
  // list it handed every cold pitch containing "here's the deal" a full
  // commitment score, which measurably ranked spam above real decisions.
  //
  // Broadened alongside every other lexicon in this file per the "as broad
  // as possible, staying entirely local" request — safe to do fairly
  // aggressively here because every addition below is routed through
  // assertedIn's per-sentence negation/hedge/question check (unlike
  // HANDOFF/HANDOFF_HE above and LOST/LOST_HE below, which are bare
  // .test() and documented separately for exactly that reason).
  const COMMIT = /\b(we'?re good (?:at|with)|agreed?(?: to| on)?|confirm(?:ed|ing)?|accept(?:ed)?|we'?ll take|executed|sounds good|works for (?:us|me)|happy to (?:move forward|proceed)|let'?s proceed|we'?re on board|consider it done|that works (?:for us|for me)?|agreed upon|in agreement|we concur|we'?re aligned|you have our agreement|you have my (?:ok|okay|approval)|give you our ok|i commit to|on the hook to|count on me to|paid in full|(?:invoice|fee|payment) is paid)\b/i;
  // An explicit, unambiguous authorisation. These carry more weight than the
  // general list because "Approved — go ahead" is the single most common real
  // decision in business email and it arrives with no money and no date
  // attached, so it has to clear the bar largely on its own.
  const COMMIT_STRONG = /\b(approved?|signed off|sign-?off|go ahead|green[- ]?lit|locked in|countersigned|fully executed|signature page attached|authori[sz]ed|formally approved|ratified|endorsed|cleared for (?:launch|takeoff|release)|final approval|greenlight given)\b/i;
  // A decision was made in the other direction. LOST is deliberately NOT
  // routed through assertedIn (see score()'s own comment on this below —
  // its patterns already embed the negation), so it carries the same
  // bare-.test() false-positive risk HANDOFF/MEETING_NOUN above do, and
  // every addition here was kept to clearly deal-ending, multi-word phrases
  // for the same reason.
  const LOST = /\b(not (?:moving|going) forward|we'?re pulling out|decided to go with (?:someone|another)|going a different direction|no longer interested|cancel(?:ling|led)? the|terminate the|declin(?:e|ed|ing)|we'?ve decided to pass|passing on this (?:opportunity|offer|proposal)?|not the right fit|going with a different (?:vendor|provider|option)|we won'?t be proceeding|backing out of|withdrawing from|opted not to (?:move forward|proceed)|chose not to move forward)\b/i;
  // A signature that an agreement completed.
  const EXECUTED = /\b(fully executed|countersigned|signed the (?:agreement|contract)|execution copy|signature page attached|signed and returned|signed copy attached|agreement is signed|contract is signed|deal is closed|paperwork is complete)\b/i;
  // Something is owed to somebody by a date.
  const OBLIGATION = /\b(due|deadline|by end of|no later than|must be (?:filed|delivered|paid|submitted|completed|finalized)|expires?|payable|net ?\d{2}|required by|needs? to be (?:finalized|submitted|completed) by|has to be submitted by|owed by|payment is due)\b/i;
  // A direct request aimed at the reader. Deliberately kept to multi-word,
  // clearly imperative/polite-request-shaped phrases (never a single common
  // word) — this signal is tested with a bare .test() against the whole
  // message, not routed through assertedIn's per-sentence negation/hedge
  // check the way COMMIT/LOST/EXECUTED/OBLIGATION above are, so a phrase
  // that could plausibly appear inside an unrelated sentence carries more
  // false-positive risk here than anywhere else in this file. Every
  // addition below was verified against the full negative-test corpus in
  // test/intent-actions-corpus.cjs (vague asks, cold pitches, small talk)
  // before being kept.
  const HANDOFF = /\b(can you|could you|would you (?:be able to|mind)|would it be possible (?:for you )?to|I was hoping you could|please (?:can you |could you )?(?:send|update|confirm|review|approve|handle|process|arrange|ensure|provide|forward|share|submit|sign|upload|prepare|finalize|resend|reply|respond|schedule|pay|remit|wire|settle|let (?:us|me) know|proofread|check|order|look over|take a look|fill (?:in|out)|complete|verify|validate)|kindly (?:send|confirm|provide|forward|arrange|review|update|advise|pay|remit|acknowledge|reply|respond|revert|return|sign|approve|submit)|(?:we|I)(?:'d| would) appreciate (?:it )?if you|(?:we|I)(?:'d| would) (?:be )?(?:grateful|thankful) (?:it )?if you|do you think you could|do you mind (?:send|upload|review|check|sign|fill|forward|share|updat|provid|resend)(?:ing)?\b|(?:^|[.!?]\s+|please\s+)make sure (?:that )?(?:the|we|all|this|it)\b|(?:please |kindly )?(?:get|come|write|reply|respond) back to me\b|kindly revert\b|please revert\b|let me know (?:your|what you|how you) (?:decision|thoughts|feedback|answer|availability|preference)|(?:we|I)(?:'d| would) appreciate (?:a |an |your |the )(?:quick |brief |prompt )?(?:update|reply|response|answer|confirmation|feedback|decision)|(?:we|I) need your (?:decision|answer|reply|response|signature|payment|go-?ahead)|need your (?:decision|answer|reply|response|signature|go-?ahead)|do let me know (?:by|whether|if)|if you could (?:please )?(?:send|share|forward|review|confirm|sign|approve|provide|upload|resend|check|take a look)|(?:we|I) need (?:the |your |that |those |these |a |an )(?!to\b)[^.?!\n]{1,50}?\bback(?=\s*(?:by|before|on|until|asap|today|tomorrow|this|next|end|[.!?,]|$))|(?:we|I) need (?:the |your |that |those |these |a |an )(?!to\b)[^.?!\n]{1,50}?\bfrom you\b|it would be (?:great|helpful|good|best|ideal|perfect) to (?:have|get|receive) (?:the |your |a |an )|requesting (?:that )?you|asking you to|your (?:help|assistance|input|guidance) (?:is|would be) (?:needed|appreciated|required)|(?:we|I) need your (?:approval|confirmation|feedback|input|help|sign-?off)|need(?:s|ed)? you to|waiting on (?:your|you)|over to you|action required|at your earliest convenience)\b/i;
  // A disagreement about money.
  const DISPUTE = /\b(doesn'?t match|does not match|discrepan(?:cy|t)|billing error|double[- ]charged|overcharged|undercharged|incorrect (?:amount|invoice)|dispute|wrong amount|billing discrepancy|invoice error|charged incorrectly|duplicate charge|unauthorized charge)\b/i;

  // Hebrew twins of the seven signals above. No \b word-boundary wrapper here
  // — \b is defined against [A-Za-z0-9_], so it never fires around Hebrew
  // letters and would silently turn every one of these into a dead pattern.
  // Same phrases, same intent, just the vocabulary an Israeli business inbox
  // actually uses instead of "we're good at" / "approved" / "no longer interested".
  // Broadened alongside the EN twins above, same assertedIn-safety-net
  // reasoning (LOST_HE is the one exception — see LOST's own comment).
  // "מתאים לנו" ("works for us") was deliberately dropped from this list —
  // it collided with LOST_HE's own new "לא מתאים לנו" ("not a fit for us")
  // below: NEG_BEFORE_HE correctly saw the negation and kept assertedIn
  // from crediting the commitment, but commitMentioned (the raw, negation-
  // blind test) still saw "מתאים לנו" present and stacked the -34 "negated"
  // penalty on top of LOST's own +46, dragging a plain rejection message
  // below threshold. Same false-positive-adjacent bug class this file's
  // NEG_BEFORE_HE/HEDGE_HE header comments already document — found here by
  // the same "run the negative corpus before committing" discipline.
  const COMMIT_HE = /(סוכם|אישרנו|מאשרים|מקובל עלינו|סגרנו|בסדר מבחינתנו|מאשר(?:ת|ים)?|מסכימים|מסכימה|מסכים|הוחלט ש|סגור מבחינתנו|בסדר גמור|מקובל עליי?נו?|נשמע טוב|נשמח להתקדם|בואו נתקדם|אנחנו בעניין|רואים בזה סגור|תואמים|יש לנו הסכמה|אאשר|מתחייב|מתחייבת|שול(?:מה|מו|ם)(?![\u0590-\u05FF]))/;
  // "נחתם" is the passive twin of English "countersigned" / "fully executed",
  // which already sit on COMMIT_STRONG. Left only on the weaker executed
  // list, "ההסכם נחתם" cannot clear 50: executed is 26, and a short note
  // also eats the length penalty. "עותק חתום" stays off this list — it is
  // the document someone asks you to send, not the fact that it was signed.
  const COMMIT_STRONG_HE = /(מאושר|יש אישור|אפשר להתקדם|קיבלנו אישור|חתמנו|ניתן אישור|אושר|האישור התקבל|אור ירוק|קיבלנו את האישור|אפשר לצאת לדרך|ההזמנה אושרה|מאושר סופית|אושר רשמית|קיבל אישור סופי|יצא אישור|האישור הסופי התקבל|נחתם|ההסכם נחתם)/;
  const LOST_HE = /(לא ממשיכים|פורשים מ|לא מעוניינים יותר|מבטלים את ה|ירדנו מזה|החלטנו שלא|לא הולכים על זה|בחרנו באופציה אחרת|בחרנו בספק אחר|לצערנו לא נוכל|אנחנו לא ממשיכים איתכם|ירדנו מהעניין|החלטנו לוותר|לא מתאים לנו|הולכים על ספק אחר|פורשים מההסכם|לא נמשיך בתהליך)/;
  const EXECUTED_HE = /(נחתם|חתמנו על ההסכם|עותק חתום|ההסכם נחתם|חתמתי על|נחתם וסגור|חתום ומאושר|נשלח חתום|העותק החתום מצורף|העסקה נסגרה|הניירת הושלמה)/;
  const OBLIGATION_HE = /(דדליין|לא יאוחר מ|יש לשלם עד|פג תוקף|עד לתאריך|מועד אחרון|עד סוף החודש|יש להעביר עד|נדרש לשלם עד|יש להשלים עד|יש להגיש עד|נדרש להשלים עד|התשלום נדרש עד|יש לסיים עד)/;
  // תשלח/י לי, צריך/ה ממך, בבקשה ת... — the direct "do X for me" phrasings a
  // small, personal-scale request actually gets written in, on top of the
  // more formal "תוכל/נשמח אם" business-register set already here. "בבקשה
  // ת" is deliberately broad (any 2nd-person imperative/future verb, which
  // in Hebrew all take a ת prefix, following "please") rather than
  // enumerating every possible verb after it.
  //
  // אבקש/מבקש(ת/ים) — first-person "I request/ask" — was the exact gap that
  // let a plain, real request ("אבקש לקבל ממך את הקבלה...") score a flat 0:
  // every other alternative here is either 2nd-person (asking the reader
  // directly) or a fixed "please" phrase, and neither covers someone
  // stating their own request in first person, which is at least as common
  // in Hebrew business writing as the "תוכל..." forms already covered. נא
  // ל.../אנא.../אודה if/לקבל round out the other common register: a
  // slightly more formal or more polite "please" than "בבקשה ת" alone
  // captures. (?:^|\s) in front of the 2-letter נא guards the same
  // substring risk NEG_BEFORE_HE/HEDGE_HE document above it in this file —
  // "נא" bare would otherwise match inside unrelated longer words.
  // Extended the same way HANDOFF (EN) above just was — more registers of
  // the same "asking you to do X" shape, each verified against the full
  // negative-test corpus before being kept, for the same no-safety-net
  // reason documented on HANDOFF.
  const HANDOFF_HE = /(תוכלו?\s|תוכלי\s|נשמח אם|מחכים ל(?:אישור|תשובה|תגובה)|(?<!לא\s)נדרשת פעולה|אשמח אם תוכל|תשלחי?\s+לי|(?:צריך|צריכ(?:ה|ים))\s+ממך|בבקשה ת|אבקש|מבקש(?:ת|ים)?|אודה (?:לך |לכם )?(?:מאוד )?אם|אשמח (?:אם )?לקבל|(?:^|\s)נא\s+ל|אנא (?:שלח|תשלחו?|העבר|תעבירו?|אשר|תאשרו?|עדכן|תעדכנו?|ציין|תציינו?|פרט|תפרטו?|מלא|תמלאו?)|האם תוכלו?|תוכלו? בבקשה|אשמח אם תשלחו?|(?:אפשר|ניתן) לקבל את|יש צורך ש|(?<!לא\s)נדרש ממך|חשוב שתעביר|(?:^|\s)אם תוכלו?\s|(?:^|\s)אם תוכלי\s|ת(?:אשר|אשרי|אשרו)\s+לי(?:\s+בבקשה)?(?![א-ת])|אפשר\s+ל(?:עדכן|תקן|סיים|הכין)(?![א-ת])[^?.!]{0,50}\sעד\s|(?:אשמח|נשמח)\s+ל(?:אישור|תשובה|עדכון|משוב|תגובה)\s+(?:שלך|שלכם|שלכן|ממך|ממכם)|אפשר\s+ש(?:ת|תי)(?:עיף|עיפי|סתכל|סתכלי|בדוק|בדקי|חתום|חתמי|אשר|אשרי|עדכן|עדכני|שלח|שלחי|חזור|חזרי|עבור|עברי|טפל|טפלי|סגור|סגרי)(?![א-ת])|(?:תוודא|תוודאי|תדאג|תדאגי)\s+ש?(?:ה|ל)|(?:תעיף|תעיפי)\s+מבט|אשמח ש(?:ת|תי)(?:חזור|חזרי|שלח|שלחי|עדכן|עדכני|אשר|אשרי|בדוק|בדקי|עבור|עברי|ענה|עני)(?![א-ת])|(?:אפשר|אשמח|נשמח)\s+לשמוע\s+(?:ממך|ממכם|ממך עדכון)|(?:אני|אנחנו)\s+(?:זקוק(?:ה|ים|ות)?|צריכ(?:ה|ים|ות)?|צריך)\s+(?:את\s+|ל)?(?:ה)?(?:חתימה|אישור|תשובה|החלטה|עדכון|תגובה|משוב)\s+(?:שלך|שלכם|ממך|ממכם)|(?:(?:אתה|את|אתם|אתן)\s+יכול(?:ה|ים|ות)?|היית(?:י)?\s+יכול(?:ה)?)\s+(?:בבקשה\s+)?ל(?:שלוח|העביר|אשר|בדוק|עבור|חתום|חזור|עדכן|שלם|הכין|סדר|תאם|מלא|הזמין|השיב|ענות|הוסיף|צרף|פתוח|ארגן|טפל|שמור|העלות|העלות|הגיש|הוציא|שחרר)(?![א-ת])|(?:^|\s)אם אפשר(?:\s*[,،])?\s|נשמח לקבל|תודה מראש (?:על|ש)|יהיה נהדר אם תוכלו?|נודה לך אם|ההשתתפות שלך נדרשת)/;
  // "Please follow up with Dana about the invoice" is an explicit ask, and
  // it never matched HANDOFF: "follow up" isn't in that verb list, and the
  // "send" later in the sentence isn't adjacent to "please". Kept out of
  // HANDOFF on purpose — these go through directedAsk() below (negation and
  // a hedge sitting in front of the phrase still kill them) instead of
  // HANDOFF's bare .test(), which cannot see "please don't follow up".
  const FOLLOW_UP_ASK = /\b(?:please follow(?:\s*|-)?up|follow up (?:with|on)|need you to follow up|please (?:chase|nudge|ping)|chase up|send (?:a |the )?reminder|send \w+ a reminder|please remind|please remember to)\b/i;
  const FOLLOW_UP_ASK_HE = /(?:^|\s)בבקשה\s+תעק(?:וב|בי|בו)|(?:^|\s)לעקוב\s+אחרי|(?:^|\s)תעק(?:וב|בי|בו)\s+אחרי|(?:^|\s)תזכ(?:יר|ירי|ירו)(?![\u0590-\u05FF])|(?:^|\s)(?:שלח|תשלח|לשלוח)\s+תזכורת/;
  // The sender wants a call or a meeting and is waiting for the reader to name a time. It goes through
  // directedAsk() like the follow-up asks, so a withdrawn or hedged ask stays quiet. A slot ask clears the
  // bar on its own: the close is a reply that offers times (the draft names two slots to fill, never a time).
  // Every way of asking for a time, a call, a meeting or the reader's availability. Each construct needs both halves
  // (the ask and the thing asked about), so "what time is it" and "thanks for the call" stay out. They go through
  // directedAsk(), so a hedged or withdrawn ask stays quiet.
  const MEET_VERB = '(?:talk|chat|meet|call|connect|speak|catch up|sync|hop on|jump on|get together|touch base|check in|discuss|go over|have a (?:call|chat|word)|catch|grab|speak)';
  const SLOT_ASKS = [
    // when / what time / which day, with a word that makes it about fitting a time
    /\bwhen\b[^.?!\n]{0,40}\b(?:free|available|around|good|best|convenient|suits?|works?|meet|talk|chat|call|speak|connect|catch up|sync|reach you|get together|discuss|open)\b/i,
    /\bwhat(?:'s| is| are)?\s+(?:days?|times?|dates?|slots?)\b[^.?!\n]{0,40}\b(?:work|works|suit|suits|good|best|convenient|prefer|like|better)\b/i,
    /\bwhich\s+(?:days?|times?|dates?|slots?)\b[^.?!\n]{0,40}\b(?:work|works|suit|suits|better|best|prefer|convenient)\b/i,
    /\b(?:best|good|right|convenient|better)\s+time\s+to\s+(?:reach|call|contact|talk|meet|speak|catch|connect|chat)\b/i,
    /\bis there (?:a|any)\s+(?:good |better |convenient |possible )?(?:time|slot|day|moment)\b/i,
    // are you free / available / around, do you have time
    /\b(?:are|will|were)\s+you\s+(?:free|available|around|open|up for|able to (?:meet|talk|chat|call|connect|speak|hop|jump))\b/i,
    /\bfree\s+(?:for|to|on|at|this|next|tomorrow|today|later|sometime|one day)\b[^.?!\n]*\?/i,
    /\b(?:are you )?(?:available|around)\s+(?:for|on|at|this|next|tomorrow|today|later)\b[^.?!\n]*\?/i,
    /\bdo\s+you\s+have\s+(?:any |some |a |an |the |a few |\d+ )?(?:\w+ )?(?:time|minutes?|availability|slot|window|moment|opening|free)\b/i,
    /\bwould\s+you\s+(?:be open to|be interested in|have time (?:for|to)|be up for|be willing to|be free)\b[^.?!\n]{0,30}\b(?:call|chat|meet|meeting|talk|speak|connect|demo|coffee|lunch|catch|sync|discuss|conversation)/i,
    // can we / could we / shall we / may I + talk, meet, schedule, find a time
    new RegExp('\\b(?:can|could|would|shall|may|might|should)\\s+(?:we|i)\\s+(?:possibly |maybe |quickly |just |perhaps )?(?:' + MEET_VERB.slice(3,-1) + '|schedule|set up|find|book|arrange|get on|fit|have)\\b(?!\\s+(?:the|our|your|their|this|that|these|those|my|his|her|expectations|requirements|deadlines?|goals?|targets?|budget)\\b)', 'i'),
    /\bcan you (?:do|make|spare|find|fit)\s+(?:a |an |the |some )?(?:\d+[- ]?(?:min|minute|hour)\w* )?(?:call|meeting|chat|sync|session|lunch|coffee|catch|time|minutes|moment|slot)/i,
    /\bany (?:chance|way|possibility)\b[^.?!\n]{0,30}\b(?:connect|chat|talk|meet|call|speak|catch up|sync|hop)\b/i,
    /\bwould it be possible\b[^.?!\n]{0,25}\b(?:meet|talk|chat|call|connect|speak|catch up|get together)\b/i,
    // would Thursday work, how about tomorrow, what about a call
    /\bwould\s+(?:\w+day|tomorrow|today|next week|this week|the (?:morning|afternoon|evening)|\d{1,2}(?::\d\d)?\s?(?:am|pm)?)\b[^.?!\n]{0,25}\b(?:work|suit|be good|be fine|be ok|be okay|be better)\b/i,
    /\b(?:how|what) about\b[^.?!\n]{0,40}\b(?:call|chat|meet|talk|tomorrow|today|\w+day|next week|this week|coffee|lunch|sync|morning|afternoon|evening)\b/i,
    /\b(?:does|do|is)\s+(?:\w+day|tomorrow|today|next week|this week)\b[^.?!\n]{0,20}\b(?:work|suit)s?\b/i,
    // let's, I'd love to, looking forward to, happy to
    /\blet(?:'|’)?s\s+(?:find|set up|schedule|book|arrange|catch up|sync(?: up)?|talk|connect|touch base|hop on|jump on|get together|meet|speak|chat|grab|pick)\b/i,
    /\b(?:i|we)(?:'d| would|'d really| really would| really)?\s+(?:love|like|appreciate|be happy|be glad|welcome|prefer|want|hope|wish|need)\s+(?:to\s+)?(?:set up|schedule|book|arrange|find a time|catch up|connect|chat|talk|meet|speak|get together|hop on|jump on|discuss|sync|touch base|hear|a few minutes|some of your time|a moment|\d+ minutes)\b/i,
    /(?:^|[.!?,\n]\s*)(?:would |'d )?(?:really )?(?:love|like|appreciate) to\s+(?:set up|schedule|book|arrange|find a time|catch up|connect|chat|talk|meet|speak|get together|hop on|jump on|discuss|sync|touch base)\b/i,
    /\b(?:looking|hoping|wanting|keen|eager)\s+(?:forward\s+)?to\s+(?:schedule|set up|book|connect|catch up|meet|talk|speak|chat|get together)/i,
    /\bhappy to\s+(?:jump|hop|get)\s+on\b|\bhappy to\s+(?:meet|chat|talk|connect|catch up|speak|discuss|set up|schedule)\b/i,
    // tell me when, send me times, pick a time, your calendar
    /\b(?:(?:can|could|would|will) you (?:please )?)?(?:let me know|tell me|send me|share|give me|please advise|advise|come back (?:to me )?with|get back to me with|shoot me|text me)\b[^.?!\n]{0,40}\b(?:when|what time|your availability|a time|some times|a few times|times|what works|what day|which day|your schedule|slots?|the best time|what suits|whenever|availability)\b/i,
    /\b(?:(?:can|could|would|will) you (?:please )?)?(?:suggest|propose|offer|give|send|share)\b[^.?!\n]{0,25}\b(?:slots?|times|options|windows|dates|days|timeframes?)\b/i,
    /\b(?:what|how)(?:'s| is| does| are)\s+(?:your|the)\s+(?:calendar|schedule|availability|diary|week|day)\b/i,
    /\bhow\s+(?:does|is|'s)\s+your\s+(?:calendar|schedule|week|availability|diary)\b/i,
    /\bpick (?:a|the) (?:time|day|slot)\b|\bbook (?:a|some|me a) (?:time|slot)\b|\bget on your (?:calendar|schedule|diary)\b|\bfind (?:a|some|\d+ ?min\w*|\d+) (?:time|minutes?|slot)\b|\bfind a (?:time|day|slot)\b/i,
    /\b(?:a few|a couple of|some|\d+) (?:minutes|mins)\b[^.?!\n]{0,20}\b(?:time|call|chat|talk|this week|today|tomorrow)\b/i
  ];
  const SLOT_ASKS_HE = [
    /(?:^|[\s,.;:!?"(])מתי\s+(?:אפשר|נוח|מתאים|יתאים|יהיה\s+(?:לך|לכם|לכן|נוח|מתאים)|הכי|יוצא|תוכל(?:ו|י)?|אתה|את|אתם|אתן|ניתן|שנוח|שמתאים|תהיה|תהיו|פנוי|פנויה|פנויים|פנויות|נדבר|ניפגש|נקבע|נוכל|אוכל|אפשרי)/,
    /(?:^|[\s,.;:!?"(])(?:אשמח|נשמח|הייתי\s+שמח|הייתי\s+שמחה|היינו\s+שמחים|הייתי\s+רוצה|היינו\s+רוצים|רציתי|רצינו|מעוניין|מעוניינת|מעוניינים)\s+(?:אם\s+)?(?:נוכל\s+|תוכל(?:ו|י)?\s+)?(?:ל(?:תאם|קבוע|דבר|היפגש|שוחח|פגוש|הכיר|התקשר|שמוע|סגור|מצוא|הציע)|שיחה|פגישה|דמו|הדגמה|זום|קפה)/,
    /(?:^|[\s,.;:!?"(])(?:בוא|בואו|בואי)\s+(?:נ(?:קבע|תאם|דבר|פגש|סנכרן|שוחח|תקשר|מצא|סגור|כניס|סדר|ארגן|תחבר|עבור)|ניפגש)/,
    /(?:^|[\s,.;:!?"(])(?:אפשר|ניתן|נוכל|יהיה\s+אפשר)\s+(?:\S+\s+){0,3}?(?:לקבוע|לתאם|לדבר|להיפגש|לשוחח|להתקשר|לסגור|שנדבר|שניפגש|שנקבע|שנתאם|זום|שיחה|פגישה|דמו)/,
    /(?:^|[\s,.;:!?"(])(?:יש|יהיה)\s+(?:לך|לכם|לכן|לי)?\s*(?:קצת\s+)?(?:זמן|דקה|דקות|מצב|חלון|רגע|פנאי)\s+(?:קטן\s+|קצר\s+|פנוי\s+)?(?:(?:ל|ש)[א-ת]|השבוע|מחר|היום|בשבוע|ביום)/,
    /(?:^|[\s,.;:!?"(])(?:תגיד|תגידי|תגידו|תכתוב|תכתבי|תכתבו|תעדכן|תעדכני|תעדכנו|תשלח|תשלחי|תשלחו|תחזור|תחזרי|תחזרו|תציע|תציעי|תציעו|תן|תני|תנו|שלח|שלחי|שלחו|עדכן|עדכני|עדכנו|הצע|הציעי|הציעו)\s+(?:לי\s+|לנו\s+)?(?:\S+\s+){0,3}?(?:מתי|מועד|מועדים|זמן|זמנים|זמינות|אילו\s+ימים|איזה\s+יום|איזו\s+שעה|שעות|חלונות)/,
    /(?:^|[\s,.;:!?"(])(?:איזה|איזו|באיזה|באיזו)\s+(?:יום|שעה|ימים|שעות|מועד)\s+(?:\S+\s+){0,2}?(?:נוח|מתאים|עובד|טוב|הכי|מתאימים)/,
    /(?:^|[\s,.;:!?"(])(?:מתאים|נוח|טוב|עובד|יתאים|יהיה\s+נוח)\s+(?:לך|לכם|לכן)\s+(?:ש(?:נדבר|ניפגש|נקבע|נתאם|אתקשר|אדבר|נסנכרן|נשוחח)|ביום|מחר|היום|בשבוע)/,
    /(?:^|[\s,.;:!?"(])(?:נקבע|נתאם|נדבר|ניפגש|נסנכרן|נשוחח)\s+(?:משהו|שיחה|פגישה|זום|שוב|בקרוב|השבוע|מחר|בשבוע|ביום|ב\d)/,
    /(?:^|[\s,.;:!?"(])(?:נוכל|אוכל|תוכל(?:ו|י)?)\s+(?:\S+\s+)?(?:להיפגש|לדבר|לקבוע|לתאם|להתקשר|לשוחח|להתחבר)/,
    /(?:^|[\s,.;:!?"(])מה\s+(?:אצלך|אצלכם|אצלכן|עם)\s+(?:\S+\s+){0,2}?(?:ביום|בשבוע|מחר|היום|השבוע|בבוקר|בצהריים|בערב|ראשון|שני|שלישי|רביעי|חמישי|שישי)/,
    /(?:^|[\s,.;:!?"(])מה\s+(?:ה)?(?:זמינות|יומן|לוח\s+הזמנים)\s+(?:שלך|שלכם)/,
    /(?:^|[\s,.;:!?"(])מי\s+(?:מכם|מכן|מהצוות)\s+(?:פנוי|פנויה|יכול|יכולה)/,
    /(?:^|[\s,.;:!?"(])(?:פנוי|פנויה|פנויים|פנויות)\s+(?:ל[א-ת]|ב(?!בקשה)[א-ת]|השבוע|מחר|היום)/,
    /(?:^|[\s,.;:!?"(])(?:נשמח|אשמח)\s+(?:למצוא|לסגור|להציע)\s+(?:\S+\s+){0,2}?(?:זמן|מועד|שיחה|פגישה)/,
    /(?:^|[\s,.;:!?"(])בא\s+(?:לך|לכם|לכן)\s+(?:ל|ש)(?:קבוע|דבר|היפגש|תאם|שוחח|התקשר)/
  ];
  // The structural half: a sentence that turns to the reader (a question, a request, an invitation, "whenever you") AND is
  // about talking, meeting or fitting a time. This is what lets a phrasing nobody listed still count. A sentence that only
  // states a fact (a call that happened, a meeting that is fixed, a schedule attached) has no turn to the reader.
  const SLOT_COMM_EN = /\b(?:calls?|chat|talk|speak|spoke|meet|meeting|meetings|sync|catch[- ]?up|coffee|lunch|breakfast|drinks|dinner|demo|conversation|discuss|discussion|connect|touch base|walk you through|go (?:through|over)|video call|zoom|teams|hangout|visit|appointment|session|brainstorm|speak with|get together|meet up|hop on|jump on|walkthrough|briefing|kickoff|kick-off)\b/i;
  const SLOT_TIME_EN = /\b(?:time|times|timing|slot|slots|availability|available|calendar|diary|schedule|minutes?|half an hour|an hour|spare|moment|gap|window|(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|tonight|today|this week|next week|this afternoon|this morning|later|soon|sometime|end of the week|mornings?|afternoons?|evenings?)\b|\bfree(?! of charge| shipping| trial| to| for free)\b|\baround\b|\bfixed\b|\bconvenien(?:t|ce)\b|\bcouple of weeks\b|\bsometime\b|\bearliest\b/i;
  const SLOT_TURN_EN = /\?|\b(?:could|can|would|might|will|shall|may|do|does|are|is|were)\s+(?:you|we|i|it|there|that|this|your)\b|\b(?:let me know|let us know|do let me|please|kindly|whenever|when ready|when you(?:'re| are)|if you(?:'re| are)? (?:free|available|around|able|open|keen|interested|up for)|i(?:'d| would) (?:really )?(?:love|like|welcome|appreciate|be grateful|be keen|be glad|be happy|be delighted|be pleased|prefer)|would (?:really )?(?:love|like|appreciate)|would be (?:great|nice|good|lovely|helpful|useful)|hoping (?:we|that|to)|i hope we|let us|how about|what about|any |care to|want to|up for|interested in|keen to|wondering|checking if|looking to|hoping to|just checking|perhaps|maybe|let(?:'|’)?s|wondered)\b/i;
  const SLOT_FACT_EN = /\b(?:thanks for|thank you for|it was (?:great|good|nice) to|enjoyed|was scheduled|is scheduled|has been (?:scheduled|moved|cancelled|canceled|confirmed)|is confirmed|was cancelled|is cancelled|attached|recording|office hours|time zone|starts in|\bby (?:\w+day|tomorrow|tonight|eod|cob|end of (?:the )?(?:day|week))\b|\bwho (?:will|is|are|'s)\b|we (?:had|spoke|met|discussed)|i (?:had|spoke|met|called)|went well|free shipping|free trial|feel free|for free|no need|not needed|unsubscribe)\b/i;
  const SLOT_COMM_HE = /(?:שיחה|שיחת|פגישה|פגישת|להיפגש|ניפגש|לדבר|נדבר|לשוחח|נשוחח|להתקשר|אתקשר|נתקשר|זום|טלפון|קפה|ארוחת|ארוחה|דמו|הדגמה|הכרות|סנכרון|נסנכרן|להתחבר|נתחבר|לקפוץ|וידאו|מפגש|לעבור על|נעבור על|לפגוש|נפגש|סשן|לדון|נדון|דיון|לארגן|ארגון|תדריך|סקירה|התנעה)/;
  const SLOT_TIME_HE = /(?:זמן|זמנים|מועד|שעה|שעות|דקה|דקות|חצי שעה|פנוי|פנויה|פנויים|פנויות|זמין|זמינה|זמינים|זמינות|יומן|ביומן|חלון|רגע|פנאי|ימים|יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)|מחר|היום|השבוע|שבוע הבא|בקרוב|בהמשך|בבוקר|בצהריים|אחר הצהריים|בערב|לפני סוף|בארבע|בחמש|בשלוש|בעשר|שבועיים|בחודש|הקרובים|הקרוב|תאריך|תאריכים|נוח|מתאים|עובדים|טובים)/;
  const SLOT_TURN_HE = /\?|(?:^|[\s,.;:!"(])(?:אפשר|נוכל|תוכל|תוכלו|תוכלי|אוכל|ניתן|יש\s+(?:לך|לכם)|יהיה\s+(?:לך|לכם)|בא\s+(?:לך|לכם)|מתאים|נוח|אשמח|נשמח|הייתי\s+(?:רוצה|שמח|שמחה)|אודה|רציתי|רצינו|מעוניין|מעוניינת|תגיד|תגידי|תגידו|תעדכן|תעדכני|תעדכנו|תשלח|תשלחי|תשלחו|תציע|תציעי|תציעו|בוא|בואו|בואי|נקבע|נתאם|אולי|האם|מה\s+עדיף|מה\s+דעתך|איך\s+נראה|מה\s+נראה|אכפת|מתי|איזה|איזו|אם\s+(?:אתה|את|אתם|אתן)|כש(?:יהיה|נוח|תוכל|תהיה)|רק\s+בודק|רק\s+בודקת|נגיד|נאמר|מעוניינים|בודק\s+אם|מקווה|מקווים|נסדר|נארגן|נציע|תהיה|תהיו|תהיי|זמין|זמינה|זמינים)/;
  const SLOT_FACT_HE = /(?:תודה\s+על|נעים\s+להכיר|היה\s+(?:נעים|מצוין|כיף)|נקבע(?:ה)?\s+ל|בוטל|בוטלה|מצורפ|הקלטת|שעות\s+הפעילות|תזכורת:|בעוד\s+\S+\s+דקות|דיברנו|נפגשנו|דיברתי|משלוח\s+חינם|הסרה|אין\s+צורך|לא\s+צריך|הוא\s+אמר|היא\s+אמרה|אמר\s+ש|אמרה\s+ש|מי\s+(?:מכם\s+|מכן\s+)?(?:יגיע|תגיע|ישתתף|יצטרף|מגיע))/;
  function slotAskSentence(sentence) {
    const t = String(sentence || '');
    if (t.length < 6 || t.length > 400) return false;
    const he = /[֐-׿]/.test(t);
    const comm = he ? SLOT_COMM_HE : SLOT_COMM_EN;
    const time = he ? SLOT_TIME_HE : SLOT_TIME_EN;
    const turn = he ? SLOT_TURN_HE : SLOT_TURN_EN;
    const fact = he ? SLOT_FACT_HE : SLOT_FACT_EN;
    if (fact.test(t)) return false;
    // "Could you call me later?" asks the reader to do something; it does not ask when. A marker of availability or a time
    // in the same sentence makes it an arrangement again.
    if (!he && /\b(?:call|ring|phone)(?:ing)?\s+(?!me\b|us\b|back\b|in\b|with\b|about\b|this\b|it\b|today\b|tomorrow\b|later\b)(?:the |a |our |your |my )?(?:[A-Z][a-z]+|bank|office|supplier|vendor|client|customer|doctor|landlord)/.test(t) && !/\b(?:when|free|available|convenient|suits?|works?|availability)\b/i.test(t)) return false;
    if (he && /(?:להתקשר|תתקשר|תתקשרי|תצלצל|תצלצלי)\s+ל(?!אחר)[א-ת]/.test(t) && !/(?:מתי|פנוי|זמין|נוח|מתאים|זמינות)/.test(t)) return false;
    if (!he && /\b(?:call|ring|phone|text|ping|email|e-mail) me\b/i.test(t) && !/\b(?:when|whenever|free|available|convenient|suits?|works?|time|slot|slots|availability)\b/i.test(t)) return false;
    if (he && /(?:להתקשר|תתקשר|תתקשרי|תצלצל|תצלצלי|לצלצל|תכתוב|תכתבי|לכתוב)\s+(?:אליי|אלי|לי)/.test(t) && !/(?:מתי|פנוי|זמין|נוח|מתאים|זמן|מועד|חלון|זמינות)/.test(t)) return false;
    const question = /\?/.test(t);
    // A statement that names a concrete day ("let's meet tomorrow", "we'll talk on Tuesday") proposes a meeting; the event and
    // Schedule meeting gates already decide it. Only a question about a day asks the reader for a time.
    const findsATime = /\b(?:find|pick|set|choose|fix|arrange)\s+(?:a|some|the)\s+(?:\w+\s+)?(?:time|day|slot)\b|(?:נמצא|נקבע|נבחר|נסדר|נתאם)\s+(?:לנו\s+)?(?:זמן|מועד|יום)/i.test(t);
    if (!question && !findsATime && /\b(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|tonight|today)\b|יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)|(?:^|\s)(?:מחר|היום|הערב)(?:\s|$|[.,])/i.test(t)) return false;
    // Listed constructs: each already names both the ask and the thing asked about.
    for (const re of SLOT_ASKS.concat(SLOT_ASKS_HE)) {
      const m = t.match(re);
      if (m && !isNegatedBefore(t.slice(0, m.index))) return true;
    }
    const mComm = t.match(comm);
    if (!turn.test(t)) return false;
    // Negation in front of the topic withdraws it ("no need for a call", "I can't meet").
    if (mComm && isNegatedBefore(t.slice(0, mComm.index))) return false;
    if (mComm && (time.test(t) || question)) return true;
    // A question about which days, dates or hours suit the reader.
    if (question && !he && /\b(?:which|what)\s+(?:days?|dates?|times?|hours?|slots?)\b/i.test(t) && /\b(?:you|your|suits?|works?|convenient|best|better|good|free|available|prefer)\b/i.test(t)) return true;
    if (question && he && /(?:אילו|איזה|איזו|באיזה|באיזו)\s+(?:ימים|יום|שעה|שעות|מועד|מועדים|תאריכים|תאריך)/.test(t)) return true;
    // "When are you next in the office?" "When can you do?": the reader is asked for a when.
    if (question && !he && /\bwhen\s+(?:are|will|can|could|would|do|does|did)\s+(?:you|we|i)\b/i.test(t)) return true;
    if (question && he && /(?:^|[\s,.;:!"(])מתי\s+(?:אתה|את|אתם|אתן|תוכל|תוכלו|תוכלי|תהיה|תהיו|נוכל|אפשר|נוח|מתאים|טוב|הכי)/.test(t)) return true;
    // Setting time aside for the reader.
    if (!he && /\b(?:set aside|block out|carve out|find|make|spare|take|allocate|reserve)\s+(?:some |a bit of |a little |a few |an? |\d+ )?(?:\w+ )?(?:time|minutes|moment|hour)\b/i.test(t)) return true;
    // An invitation from the sender that names a meeting or a call ("we'd love a call", "נשמח לשיחה").
    if (!he && /\b(?:i|we)(?:'d| would)? ?(?:love|like|be delighted|be keen|be happy|be glad|welcome)\b[^.?!\n]{0,25}\b(?:call|chat|conversation|meeting|catch up|coffee|lunch|demo)\b/i.test(t) && !/\b(?:thank|thanks)\b/i.test(t)) return true;
    if (he && /(?:נשמח|אשמח|הייתי\s+רוצה|רוצה)\s+(?:ל\S+\s+)?(?:איתך\s+|איתכם\s+)?(?:שיחה|פגישה|קפה|דמו|לארגן)/.test(t)) return true;
    // Putting something in the reader's calendar is the same ask.
    if (!he && /\b(?:on|in|into|to) (?:the |our |my |your )?(?:calendar|diary|schedule)\b/i.test(t)) return true;
    if (he && /(?:ליומן|ביומן)/.test(t)) return true;
    // "Let me know a day that suits you": the thing asked for is a day, a date or a time.
    if (!he && /\b(?:let me know|tell me|send me|share|give me|suggest|propose)\b[^.?!\n]{0,30}\b(?:day|days|date|dates|time|times|slot|slots|when)\b/i.test(t)) return true;
    // A time with no talk word still counts when it is a question about the reader's availability or calendar.
    return Boolean(!he && question && /\b(?:availability|available|calendar|diary|schedule|timing|free|spare|slot|slots|time works|times work|what does .{0,20} look like for you|how are you fixed)\b/i.test(t))
      || Boolean(he && question && /(?:זמינות|פנוי|זמין|יומן|ביומן|חלון|איך\s+נראה\s+לך)/.test(t));
  }
  function slotAskText(text) {
    return String(text || '').split(SENTENCE_SPLIT).some(slotAskSentence);
  }

  // A request to make a work product: a spreadsheet, a table, a report, a summary, a deck. The product has to be named, so
  // "please create an account" and "write back when you can" stay quiet, and a bare "document" stays quiet on purpose
  // (the create-when-missing family decides that). Kept out of HANDOFF so the sentence Glance quotes does not change.
  const WORK_ASK = /\bplease (?:can you |could you )?(?:draft|write up|write|create|compile|put|enter|fill (?:in|out)|summari[sz]e|make|build) (?:\S+ ){0,5}?(?:spreadsheet|sheet|table|report|summary|figures|numbers|data|deck|presentation|proposal|memo)/i;
  const WORK_ASK_HE = /(?:^|\s)(?:תכין|תכיני|תכינו|תכתוב|תכתבי|תכתבו|תיצור|תיצרי|תיצרו|תכניס|תכניסי|תכניסו|תסכם|תסכמי|תסכמו)\s+(?:לי\s+|לנו\s+)?(?:בבקשה\s+)?(?:את\s+)?(?:ה)?(?:מסמך\s+(?:סיכום|סטטוס|תקציב|הצעה|דוח)|טבלה|דוח|דו"ח|סיכום|נתונים|מספרים|גיליון|הצעה|מצגת)/;
  // Asks for an update or an introduction. Each names the reader as the one who acts ("update me", "introduce me"), so a
  // status line or a thank-you that merely mentions an update stays quiet. Kept out of HANDOFF so the quoted sentence is unchanged.
  const STATUS_INTRO_ASK = /\b(?:(?:can|could|would|will) you (?:please )?(?:introduce|connect|put) me|(?:please )?(?:introduce|connect) me (?:to|with)|put me in touch with|what(?:'s| is) the (?:current )?status of|(?:please )?(?:keep|update) me (?:posted|updated|in the loop|on|about)|(?:please )?(?:give|send|get) me (?:a |an )?(?:quick |brief |short |written )?(?:status |progress )?(?:update|report)\b|i need (?:a |an )?(?:quick |brief )?(?:status |progress )?update\b|(?:please )?(?:countersign|co-sign)\b|let me know (?:the status|once|when)\b[^.?!\n]{0,60}\b(?:by|before|today|tonight|tomorrow|this week|ready|done|sent|paid))/i;
  const STATUS_INTRO_ASK_HE = /(?:^|\s)(?:תעדכן|תעדכני|תעדכנו|עדכן|עדכני)\s+אותי|(?:^|\s)מה\s+(?:ה)?סטטוס\s+של|(?:אשמח|נשמח)\s+(?:ל(?:קבל\s+)?)?עדכון|(?:^|\s)(?:תעדכן|תעדכני|תעדכנו)\s+(?:אותי\s+)?(?:את\s+)?(?:ה)?סטטוס|(?:^|\s)(?:תפגיש|תפגישי|תכיר|תכירי|תחבר|תחברי)\s+(?:אותי|לי)|(?:ש|ל)(?:תפגיש|תפגישי)\s+אותי|(?:ל)?הכיר\s+לי\s+את|להפגיש\s+אותי/;
  // Asks for an account action: access, a password reset, a transfer, a copy of the reply. The lead ("please", "can you") is
  // required, so "access has been granted" and "your password was reset" stay quiet. Kept out of HANDOFF like the two above.
  const ACCOUNT_ASK = /\b(?:please|kindly|can you|could you|would you(?: please)?)\s+(?:(?:return|send back)\s+(?:the|a|your)\s+(?:signed|countersigned|completed)\s+(?:copy|form|contract|agreement|paperwork)\b|add\s+your\s+availability\b|make\s+(?:the|this|your)\s+(?:payment|deposit)\b(?!\s+(?:details|information|info|method|card|online|here|on|at|via))|(?:refund|credit)\s+(?:the|our|my)\s+(?:duplicate|double|extra|incorrect)\s+(?:charge|payment)\b|(?:grant|give)\s+(?:me|us|[a-z]+)\s+(?:\S+\s+){0,2}?access\b|reset\s+(?:my|our|the)\s+(?:password|login|2fa)\b|transfer\s+(?:the|our|my)\s+(?:domain|account|licen[sc]e)\b|(?:copy|cc|bcc)\s+me\b)/i;
  const ACCOUNT_ASK_HE = /(?:^|\s)(?:בצע|בצעי|בצעו)\s+(?:לי\s+|לנו\s+)?(?:בבקשה\s+)?את\s+(?:ה)?(?:תשלום|מקדמה)|(?:^|\s)(?:תוסיף|תוסיפי|תוסיפו)\s+(?:בבקשה\s+)?את\s+(?:ה)?זמינות\s+שלך|(?:^|\s)(?:תעלה|תעלי|תעלו|תעביר|תעבירי|תעבירו|תאפס|תאפסי|תאפסו|תשים|תשימי|תשימו)\s+(?:לי\s+)?(?:בבקשה\s+)?(?:(?:את\s+)?(?:ה)?(?:טופס|מסמך|קובץ|דומיין|סיסמה|חשבון|רישיון)|אותי\s+בעותק)|(?:^|\s)(?:תן|תני|תנו)\s+לי\s+גישה/;
  // A short direct question that asks the reader for a named thing ("יש קישור לזום ?", "Do you have the invoice?"). Chat and
  // mail both carry these; the length floor used to drop them on every surface. The whole message has to be the question, so a
  // longer text, a bare "really?" and a greeting stay on the normal path.
  const SHORT_ASK_EN = /^(?:(?:hi|hey|hello)[,!]?\s+)?(?:(?:do|did) you (?:have|get|send)\b|(?:is|are) there (?:a|an|any)\b|would it be possible to (?:get|have|send|share)\b|are you able to (?:send|share|forward|review|confirm|sign|approve|provide|upload|resend|check|take a look|get me)\b|is it possible to (?:get|have|send|share)\b|(?:can|could|would) you (?:please )?(?:send|share|resend|forward)(?!\s+(?:that|it|this|those|these)\b)\b|any (?:update|news)\b|where(?:'s| is) (?:the|my)\b)[^.!?\n]{3,60}\s*\?$/i;
  const SHORT_ASK_HE = /^(?:(?:היי|הי|שלום)[,!]?\s+)?(?:יש\s+(?:לך\s+|לכם\s+)?(?:את\s+)?(?:ה)?(?:קישור|לינק|מסמך|חשבונית|הצעה|עדכון|לוגו|קובץ|מצגת|הקלטה|תמונות|טופס|חוזה|תיקייה)|אפשר\s+(?:לקבל|לשלוח)|תוכל(?:י|ו)?\s+לשלוח|מה\s+(?:ה)?(?:סטטוס|מצב)|איפה\s+(?:ה)?(?:קישור|לינק|מסמך|חשבונית))[^.!?\n]{0,60}\s*\?$/;
  function shortAskText(text) {
    const t = String(text || '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (t.length < 8 || t.length > 90) return false;
    return SHORT_ASK_EN.test(t) || SHORT_ASK_HE.test(t);
  }
  // A first-person delivery promise. Not a COMMIT word ("agreed",
  // "approved") and not a reader reminder ("you agreed to") — "I will send
  // the contract by Friday" is the sender closing a dated obligation on
  // themselves. Weight stays zero: without a resolved date this is not
  // evidence, and only intent.js's dated-commitment gate reads the flag.
  // Delivery verbs only, so "I'll have a look" / "I'll see" never count.
  const SENDER_PROMISE = /\b(?:I|we)(?:'ll| will)\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i;
  const SENDER_PROMISE_HE = /(?:^|\s)(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/;
  const DISPUTE_HE = /(לא תואם|אי התאמה|חיוב כפול|חיוב שגוי|מחלוקת|טעות בחיוב|הסכום שגוי|יש טעות בחשבונית|לא תואם למוסכם|חיוב יתר|חיוב חסר|טעות בגבייה|חיוב לא מורשה)/;

  const MARKETING = /\b(unsubscribe|view (?:this )?in (?:your )?browser|manage (?:your )?(?:email )?preferences|webinar|newsletter|limited[- ]time|special offer|% off|register now|save your seat)\b/i;
  const CALENDAR_NOISE = /\b(has (?:accepted|declined|tentatively accepted) (?:this|your) invitation|invitation from google calendar|added to your calendar)\b/i;
  // The fingerprint of a cold pitch. Without this, "our pricing starts at $99/mo,
  // can you confirm a time this week?" collects money + commitment + handoff and
  // outscores an actual signed contract.
  const SOLICITATION = /\b(pricing starts at|book a (?:demo|call|time)|schedule a (?:demo|call|quick chat)|free trial|hope this (?:email )?finds you well|following up on my (?:last|previous) email|just bumping this|circling back|quick question for you|reaching out because|thought you'?d be interested|worth a (?:quick )?chat)\b/i;
  // Hard-gate veto, narrower than SOLICITATION / MARKETING on purpose.
  // "schedule a call" and "webinar" are in those penalties AND in the
  // meeting lexicon — a score hit is right, a veto would hide a real
  // "can we schedule a call on Monday". What remains is a pitch or a
  // mailing even when the message also names a date or an object.
  const PITCH_VETO = /\b(pricing starts at|free trial|hope this (?:email )?finds you well|following up on my (?:last|previous) email|just bumping this|circling back|quick question for you|reaching out because|thought you'?d be interested|worth a (?:quick )?chat|book a demo|schedule a demo)\b/i;
  const MARKETING_VETO = /\b(unsubscribe|view (?:this )?in (?:your )?browser|manage (?:your )?(?:email )?preferences|newsletter|limited[- ]time|special offer|% off|register now|save your seat)\b/i;

  // Where a reply stops being new and starts being history. Gmail's own quote
  // header runs about 60 characters ("On Mon, Sep 1, 2025 at 9:41 AM Dana Cole
  // <dana@x.com> wrote:"), so a narrow bound here matches nothing real and every
  // reply re-scores the whole thread — meaning "Sounds good, thanks!" over a
  // quoted contract scored identically to the contract itself, and Flow offered
  // to log the same decision again on every message in the thread.
  //
  // Every pattern here is a *fallback* — content-gmail.js's own ownMessageText()
  // already cuts at Gmail's DOM-level quote wrapper (.gmail_quote) before this
  // ever runs, which is language-independent by construction. These regexes
  // exist for what that DOM cut can't see: a non-Gmail sender (Outlook, Apple
  // Mail, a plain-text forward), or any caller that only ever had flattened
  // text to begin with.
  const QUOTE_START = [
    /^\s*On\b[\s\S]{3,200}?\bwrote:\s*$/im,
    // Gmail's Hebrew quote header always opens with "בתאריך" ("on the date")
    // — a line-initial word essentially unique to this header, never how a
    // genuine sentence starts — and always closes a short line with a colon
    // (either "...כתב/ה/ו:" or "...מאת X:", depending on Gmail's exact
    // phrasing at send time). Matching the open marker and the line-ending
    // colon, rather than one exact closing phrase, means this doesn't depend
    // on getting that closing wording exactly right. No \b after בתאריך —
    // same reason every other Hebrew pattern in this file omits it: \b is
    // defined against [A-Za-z0-9_], so it never fires around Hebrew letters
    // and would silently turn this into a pattern that never matches.
    /^\s*בתאריך[\s\S]{3,200}?:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
    // Hebrew forward banner ("---------- הודעה שהועברה ---------"). The same cut
    // the Graph reader uses, so a forwarded ask is not judged as the new message.
    /^\s*-{2,}\s*הודעה שהועברה.*$/im,
    /^\s*From:\s.*$\n^\s*Sent:\s/im,
    // Outlook's Hebrew locale equivalent of the From:/Sent: header block
    // above — same no-\b rule applies to both מאת and נשלח.
    /^\s*מאת:\s.*$\n^\s*נשלח:\s/im,
    /^\s*>{1,}\s?\S/m
  ];

  // Smart/curly quotes and apostrophes — auto-inserted by iOS/macOS Mail,
  // Word, and plenty of other clients whenever someone types a straight one
  // — are a different Unicode character from the plain ' every "we're"/
  // "you'll"/"doesn't" pattern in this file and intent.js is written
  // against. "we're good" and "we’re good" read identically to a person but
  // not to a regex: the curly version silently failed to match at all,
  // which is a real-world recall gap, not a rare edge case, given how
  // common autocorrected quotes are in genuine email. Normalizing once
  // here — the one function every text path already calls first — fixes
  // it everywhere at once, instead of a `['’]` character class that would
  // be easy to forget adding to the next new pattern.
  function normalizeQuotes(text) {
    return text
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"');
  }

  // Returns only the part of the message the sender actually just wrote. Falls
  // back to the whole text when no quote boundary is found, and ignores a
  // boundary so early that stripping would leave nothing to judge.
  function newContent(text) {
    text = normalizeQuotes(text);
    let cut = text.length;
    for (const re of QUOTE_START) {
      const m = re.exec(text);
      if (m && m.index < cut) cut = m.index;
    }
    // Deliberately returns the head even when it is very short or empty. A reply
    // that only says "Sounds good, thanks!" has decided nothing; falling back to
    // the quoted history there is what made Flow re-offer to log the same
    // agreement on every message in a thread. Short content is handled by the
    // 'too-short' penalty, and an empty head simply scores nothing.
    return text.slice(0, cut).trim();
  }

  // Every signal is {id, weight, why}. `why` is user-facing text — it shows up in
  // the popup, so it has to read like a sentence someone would say out loud.
  // --- Does the sentence ASSERT its trigger, or deny it? -------------------
  //
  // Every trigger below used to be tested against the whole message with a
  // bare .test(text), which asks only "does this word appear anywhere" — a
  // question that cannot tell agreement from refusal. Measured, before this:
  //
  //   "We approve the $40,000 and will sign Monday."        -> Log $40,000 agreed
  //   "We do NOT approve the $40,000 and will not sign."    -> Log $40,000 agreed
  //   "We cannot approve the $40,000 at this time."         -> Log $40,000 agreed
  //   "We might approve the $40,000 next quarter."          -> Log $40,000 agreed
  //   "Would you approve the $40,000 and sign Monday?"      -> Log $40,000 agreed
  //
  // All five scored 59. The engine was writing the exact opposite of what the
  // sender wrote into the user's calendar, with full confidence — an inverted
  // fact, which is strictly worse than a missed one and the single thing this
  // product cannot survive doing twice.
  //
  // So: find the trigger's OWN sentence and ask whether that sentence asserts
  // it. Per-sentence matters — "We approved the budget. We won't make Tuesday."
  // is still an approval, and a message-wide negation check would lose it.
  const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;

  // Negation has to sit just BEFORE the trigger to count. A sentence that
  // merely contains "no" somewhere ("Approved, no changes needed") is not a
  // denial, and treating it as one would trade a wrong answer for a silent one
  // far too often.
  const NEG_BEFORE = /\b(?:not|never|cannot|can'?t|won'?t|wouldn'?t|shan'?t|don'?t|doesn'?t|didn'?t|isn'?t|aren'?t|no longer|unable to|declin\w*|refus\w*|reject\w*|denied|without)\b[^.!?;]{0,28}$/i;
  // (?:^|\s) in front of the short two-letter forms (לא, אין) matters: JS
  // regex has no \b for Hebrew (\b is defined over the ASCII \w class, which
  // Hebrew letters aren't part of), so a bare לא or אין with no boundary of
  // its own matches as a substring of any longer, unrelated word that
  // happens to end the same way — most commonly מלא ("full") ending in לא,
  // or מאין ("whence") ending in אין. Without this guard, "התקציב מלא סוכם"
  // ("the budget [that's] full [was] agreed") read מלא's own לא as a
  // negation sitting right before סוכם, and inverted a plain agreement into
  // signals.js's 'negated' penalty — the same class of bug as HEDGE_HE
  // below, found together while tracing why a real confirmed-and-dated
  // email scored a negative total instead of clearing the threshold.
  const NEG_BEFORE_HE = /(?:^|\s)(?:לא|אין|בלי|נמנע|לא ניתן|לא נוכל)\s*(?:\S+\s+){0,3}$/;

  // Conditionals and modals make a commitment contingent rather than made.
  // "would" is knowingly included: it costs the occasional real signal from
  // "we would like to confirm", and that costs silence, which is the side of
  // the trade this file always takes.
  const HEDGE = /\b(?:if|unless|assuming|suppose|supposing|provided that|subject to|pending|in case|once we|before we|might|may|could|would|perhaps|possibly|tentative(?:ly)?|proposed|hypothetical(?:ly)?)\b/i;
  // (?:^|\s) before אם\s for the same reason as NEG_BEFORE_HE above: bare אם
  // ("if") with no boundary matched as a substring of בהתאם ("accordingly" /
  // "pursuant to") — an extremely common, entirely non-conditional word in
  // formal Hebrew correspondence ("...בהתאם למסמך המצורף" = "...in
  // accordance with the attached document") — which silently discarded a
  // real, plainly-stated commitment as "hedged" on every message that used
  // it. The other alternatives here are 4+ letters and weren't observed to
  // have the same false-positive risk, so only this one needed the guard.
  const HEDGE_HE = /(?:(?:^|\s)אם\s|אולי|ייתכן|בכפוף ל|בהנחה ש|במידה ו)/;

  // True when a negation sits in the window immediately before a match.
  // Exported so intent.js's meeting gate can reuse this exact window
  // instead of growing a second copy that drifts. Questions and hedges
  // are deliberately not this function's job: "Can we do a call Monday?"
  // is a real invite, and assertedIn() is what refuses those for
  // commitments.
  function isNegatedBefore(before) {
    return NEG_BEFORE.test(before || '') || NEG_BEFORE_HE.test(before || '');
  }

  function assertedIn(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      const m = s.match(pattern);
      if (!m) continue;
      // A question asks for a decision; it does not record one. "האם"
      // is the Hebrew question particle and often arrives without "?".
      if (/\?\s*$/.test(s.trim())) continue;
      if (/(?:^|\s)האם\s/.test(s)) continue;
      if (HEDGE.test(s) || HEDGE_HE.test(s)) continue;
      const before = s.slice(0, m.index);
      if (isNegatedBefore(before)) continue;
      return true; // at least one sentence states it plainly
    }
    return false;
  }
  // Same per-sentence negation/hedge test as assertedIn, except a question
  // still counts. Follow-up asks are questions as often as they are
  // imperatives ("please follow up with Dana about the invoice?"); the
  // commitment scorer is right to ignore questions, and an ask scorer is
  // wrong to. Hedge and negation only count when they sit BEFORE the
  // phrase, so "please follow up on the invoice if you have the latest
  // copy" stays an ask — the condition trails it, it doesn't withdraw it.
  function directedAsk(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      const m = s.match(pattern);
      if (!m) continue;
      const before = s.slice(0, m.index);
      if (HEDGE.test(before) || HEDGE_HE.test(before)) continue;
      if (isNegatedBefore(before)) continue;
      return true;
    }
    return false;
  }
  const anyOf = (text, pats, fn) => pats.some((p) => fn(text, p));
  const testsIn = (text, p) => p.test(text);

  // Bare confirm / agree / accept / approve. Real closes still use these
  // words ("I confirm", "we agree", "the proposal is accepted", "Approved").
  // A reader-directed request uses the same words and is not a close
  // ("can you agree", "please confirm", "do you accept", "אתה מסכים").
  // The optional " to" / " on" in COMMIT is part of the match ("agree to"),
  // so the head word is what decides bare vs phrase. "we're good at" does
  // not start with one of these verbs.
  const BARE_DECISION_WORD = /^(?:confirm(?:ed|ing)?|agree[ds]?|accept(?:ed|s)?|approv(?:e|ed))(?:\s|$)/i;
  const BARE_DECISION_HE = /^(?:מאשר(?:ת|ים)?|מסכימה|מסכימים|מסכים|מאושר)/;
  // Rightmost request cue before a decision word. "האם" is a question
  // particle and withdraws every decision after it, the way "?" already
  // does. The others withdraw only the bare verbs above, so "countersigned"
  // and "we're good" in the same note still count.
  const READER_CUE_RES = [
    { re: /\b(?:(?:can|could|would|will) you|please|kindly|do you|(?:asking|requesting) you to|need you to)\b/gi, kind: 'ask' },
    { re: /\byou\s+(?=agree[ds]?|accept(?:ed|s)?|confirm)/gi, kind: 'ask' },
    { re: /בבקשה|אנא|(?:^|\s)נא(?=\s)/g, kind: 'ask' },
    { re: /(?:^|\s)האם(?=\s)/g, kind: 'whether' },
    { re: /(?:^|\s)אתה(?=\s)|(?:^|\s)אתם(?=\s)|(?:^|\s)אתן(?=\s)|(?:^|\s)את(?=\s+מ(?:אשר|סכימ))/g, kind: 'ask' }
  ];

  function isBareDecision(word) {
    return BARE_DECISION_WORD.test(word) || BARE_DECISION_HE.test(word);
  }

  function cuesBefore(sentence, index) {
    const cues = [];
    for (const spec of READER_CUE_RES) {
      const re = new RegExp(spec.re.source, spec.re.flags);
      let found;
      while ((found = re.exec(sentence))) {
        if (!found[0]) { re.lastIndex += 1; continue; }
        if (found.index < index) cues.push({ index: found.index, text: found[0], kind: spec.kind });
      }
    }
    cues.sort((a, b) => a.index - b.index);
    return cues;
  }

  // True when this match is the reader being asked to decide, not the
  // sender deciding. "We agree, please send the contract" keeps "agree":
  // the request cue sits after it. "Please confirm we are agreed" drops
  // both verbs: "please" leads, and "confirm" sits between it and "agreed",
  // so the "we" there is the content of the ask.
  function decisionSuppressed(sentence, m) {
    const cues = cuesBefore(sentence, m.index);
    if (!cues.length) return false;
    if (cues.some((c) => c.kind === 'whether')) return true;
    if (!isBareDecision(m[0])) return false;
    const cue = cues[cues.length - 1];
    const between = sentence.slice(cue.index + cue.text.length, m.index);
    const before = sentence.slice(0, m.index);
    const speaker = /\b(?:we(?:'re|\s+are|\s+have)?|i(?:'m|\s+am|\s+have)?)\s+$/i.test(before)
      || /(?:^|\s)(?:אני|אנחנו)\s+$/.test(before);
    const requestVerbBetween = /\b(?:confirm(?:ed|ing)?|agree[ds]?|accept(?:ed|s)?|approv(?:e|ed)|please|kindly)\b/i.test(between)
      || /(?:בבקשה|אנא|האם|מאשר|מסכימ)/.test(between);
    if (speaker && !requestVerbBetween) return false;
    return true;
  }

  // "nothing is confirmed yet" names the decision in order to say it has
  // not been made. "not" already covers "do NOT approve"; "nothing" does
  // not contain a free-standing "not", so it never reached that window.
  function bareWithdrawn(sentence, m) {
    if (!isBareDecision(m[0])) return false;
    const before = sentence.slice(Math.max(0, m.index - 48), m.index);
    const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (/\b(?:nothing|nobody|no one|not yet|yet to be)\b/i.test(before)) return true;
    if (/^\s*(?:yet|nothing)\b/i.test(after)) return true;
    return false;
  }

  function eachMatch(sentence, pattern, visit) {
    const re = new RegExp(pattern.source, pattern.flags.indexOf('g') === -1 ? pattern.flags + 'g' : pattern.flags);
    let found;
    while ((found = re.exec(sentence))) {
      if (!found[0]) { re.lastIndex += 1; continue; }
      if (visit(found)) return true;
    }
    return false;
  }

  // Same per-sentence hedge / negation / question test as assertedIn, plus
  // the reader-ask bar above. Used only for commitment patterns. Executed
  // and obligation stay on assertedIn: "please confirm the invoice is
  // payable" is still an obligation.
  function assertedCommit(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      if (/\?\s*$/.test(s.trim())) continue;
      if (HEDGE.test(s) || HEDGE_HE.test(s)) continue;
      const hit = eachMatch(s, pattern, (found) => {
        if (isNegatedBefore(s.slice(0, found.index))) return false;
        if (bareWithdrawn(s, found)) return false;
        if (decisionSuppressed(s, found)) return false;
        return true;
      });
      if (hit) return true;
    }
    return false;
  }

  const COMMIT_MENTION_PATS = [COMMIT, COMMIT_HE, COMMIT_STRONG, COMMIT_STRONG_HE];

  // Every commitment word in the note is a reader being asked to decide.
  // "We do NOT approve" is not this — the word is a refusal, and the
  // negated penalty below is what keeps the figure from reading as a close.
  function commitMentionsAreReaderAsks(text) {
    let saw = false;
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      for (const pattern of COMMIT_MENTION_PATS) {
        const open = eachMatch(s, pattern, (found) => {
          saw = true;
          return !decisionSuppressed(s, found);
        });
        if (open) return false;
      }
    }
    return saw;
  }

  function score(text, domain, facts) {
    const signals = [];
    const add = (id, weight, why) => signals.push({ id, weight, why });

    // These four are not just point penalties. intent.js's hard gates do
    // not consult the total, so a cold bump that names an invoice, a
    // "circling back, you agreed…", and a calendar acceptance used to chip
    // at a negative score. `noise` is that same decision, visible to the
    // gates.
    //
    // Narrower than the penalties just above — see PITCH_VETO / MARKETING_VETO.
    const automated = !!facts.automated;
    const marketing = MARKETING.test(text);
    const solicitation = SOLICITATION.test(text);
    const calendarNoise = CALENDAR_NOISE.test(text);
    const automatedNoise = automated;
    const marketingNoise = MARKETING_VETO.test(text);
    const noise = automatedNoise || calendarNoise || PITCH_VETO.test(text) || marketingNoise;
    if (automated) add('automated', -60, 'The sender looks automated');
    if (marketing) add('marketing', -45, 'Reads like a mailing list, not a person');
    if (solicitation) add('solicitation', -55, 'Reads like a cold pitch, not your work');
    if (calendarNoise) add('calendar', -35, 'Calendar notification boilerplate');

    // A commitment counts only where a sentence actually states it. Bare
    // confirm/agree/accept in a reader-directed ask do not — assertedCommit
    // drops those and keeps "we agree" / "I confirm" / "Approved". The
    // "mentioned" forms are kept alongside so the difference between the two
    // can be scored: a message that talks about approving without approving is
    // not neutral evidence, it is evidence AGAINST acting.
    const STRONG_PATS = [COMMIT_STRONG, COMMIT_STRONG_HE];
    const COMMIT_PATS = [COMMIT, COMMIT_HE].concat(STRONG_PATS);
    const EXEC_PATS = [EXECUTED, EXECUTED_HE];
    const OBLIG_PATS = [OBLIGATION, OBLIGATION_HE];

    const commitStrong = anyOf(text, STRONG_PATS, assertedCommit);
    const commit = commitStrong || anyOf(text, COMMIT_PATS, assertedCommit);
    // A length penalty is for a fragment that has not said what happened
    // ("Thanks!", an empty reply). "Approved. Go ahead." and "מאושר. אפשר
    // להתקדם." are short because the decision is the whole note — the flat
    // <12 cutoff was silencing them. Weaker commitments stay under it.
    if (facts.wordCount < 12 && !commitStrong) add('too-short', -25, 'Too little text to judge');
    const commitMentioned = anyOf(text, COMMIT_PATS, testsIn);
    const executed = anyOf(text, EXEC_PATS, assertedIn);
    const executedMentioned = anyOf(text, EXEC_PATS, testsIn);
    // LOST is deliberately NOT routed through assertedIn: its own patterns
    // embed the negation ("not moving forward", "no longer interested"), so
    // asking whether the sentence negates them inverts the very signal.
    const lost = LOST.test(text) || LOST_HE.test(text);
    const obligation = anyOf(text, OBLIG_PATS, assertedIn);
    const followUpAsk = anyOf(text, [FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE], directedAsk);
    // A clock in the text ("Tuesday at 3", "בשעה 16:00") belongs to the event and hold gates, which already decide it.
    const clockNamed = /\b(?:at|@)\s*\d{1,2}(?::\d{2})?\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b|בשעה\s*\d|(?:^|\s)ב-?\d{1,2}(?::\d{2})?(?:\s|$|[.,?!])/i.test(text);
    const slotAsk = !clockNamed && slotAskText(text);
    const workAsk = anyOf(text, [WORK_ASK, WORK_ASK_HE, STATUS_INTRO_ASK, STATUS_INTRO_ASK_HE, ACCOUNT_ASK, ACCOUNT_ASK_HE], directedAsk);
    const handoff = HANDOFF.test(text) || HANDOFF_HE.test(text) || followUpAsk;
    const dispute = DISPUTE.test(text) || DISPUTE_HE.test(text);
    const senderPromise = anyOf(text, [SENDER_PROMISE, SENDER_PROMISE_HE], assertedIn);

    if (facts.money) add('money', 34, 'States a figure: ' + facts.moneyText);
    if (commitStrong) add('commitment', STRONG_WEIGHT, 'Someone authorised something outright');
    else if (commit) add('commitment', 30, 'Someone committed to something');
    // Weighted to clear threshold alongside a domain match on its own — a lost
    // deal is exactly the kind of news worth logging without needing a second,
    // unrelated signal (a date or a dollar figure) to happen to also be present.
    if (lost) add('lost', 46, 'States the work is not going ahead');
    if (executed) add('executed', 26, 'Says an agreement was executed');
    if (dispute) add('dispute', 28, 'Raises a discrepancy');
    if (facts.date && obligation) add('deadline', 26, 'Sets a dated obligation: ' + facts.date.raw);
    else if (facts.date) add('date', 12, 'Names a date: ' + facts.date.raw);
    if (handoff) add('handoff', 18, 'Asks you to do something specific');
    if (slotAsk) add('slot-ask', 34, 'Asks you for a time');
    const shortAsk = shortAskText(text);
    if (shortAsk) add('short-ask', 60, 'A short direct ask');
    const onDomain = domain.entityWords.test(text);
    if (onDomain) add('domain', 14, 'About ' + domain.entity.toLowerCase());
    if (facts.isReply) add('reply', 8, 'Part of an ongoing thread');
    // COMMIT_STRONG is 42, eight under the bar, so "Approved. Go ahead."
    // only cleared when a reply bonus happened to be present. The chip
    // path does not set that bonus. A plain authorisation has to clear
    // on its own — that is why this list is weighted above a normal commit.
    if (commitStrong && !signals.some((s) => s.weight > 0 && s.id !== 'commitment')) {
      add('bare-strong', BASE_THRESHOLD - STRONG_WEIGHT, 'States the authorisation on its own');
    }

    // A message with a number and nothing else decided is a quote, not a decision.
    // Requiring a second signal alongside money is what keeps price lists quiet.
    const positives = signals.filter((s) => s.weight > 0);
    if (positives.length === 1 && positives[0].id === 'money') add('unsupported', -20, 'A figure alone, with nothing decided');

    // Withholding the commitment points is not enough on its own. "We do NOT
    // approve the $40,000" still carries a figure, a domain match and a reply
    // bonus — 56 against a threshold of 50 — so it would clear the bar anyway
    // and be labelled from the money alone, which reads "Log $40,000 agreed".
    // A denied or merely-contemplated commitment has to push the other way.
    if (!commit && commitMentioned) {
      // "please confirm" next to a real dispute, a signed agreement, or a
      // due invoice is the ask, not a denied decision. The other signal
      // stands. A confirm/agree request with only a figure and a date does
      // not: money + handoff + domain clears 50 and the label reads
      // "Log $3,900 confirmed".
      const readerAsk = commitMentionsAreReaderAsks(text);
      const standsBeside = readerAsk && (lost || executed || dispute || obligation);
      if (!standsBeside && readerAsk) add('unsettled', -55, 'Asks you to confirm or agree, which is not a decision');
      else if (!standsBeside) add('negated', -34, 'Names a decision the sentence does not actually make');
    } else if (!executed && executedMentioned) add('negated', -34, 'Names an agreement the sentence does not actually execute');

    const total = signals.reduce((sum, s) => sum + s.weight, 0);
    return { total, signals, flags: { commit, lost, executed, obligation, handoff, slotAsk, workAsk, shortAsk, dispute, onDomain, senderPromise, noise } };
  }

  // The threshold is the only thing that learns. Clicking says "more like that",
  // dismissing says "less" — and neither ever asks the user to configure a number.
  //
  // Dismissals decay with elapsed time, and that is load-bearing rather than a
  // nicety. Dismissals used to decay only when the user clicked a chip, which
  // made silence an absorbing state: a few dismissals pushed the threshold above
  // what any real email could score, no chip could then appear, so no click could
  // happen, so the threshold never came back down. Flow went quiet permanently
  // and — because silence is its normal state — the user could not tell the
  // difference between a calm inbox and a dead extension. Time-based decay means
  // a quiet week always walks the threshold back toward baseline on its own.
  const DISMISSAL_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

  function thresholdFrom(calibration, now) {
    const c = calibration || {};
    const elapsed = Math.max(0, (now || Date.now()) - (c.ts || 0));
    const decay = c.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    // BOTH sides age. Decaying only dismissals here left clicks permanent, so
    // the paragraph above ("a quiet week always walks the threshold back toward
    // baseline") held in exactly one direction. Six clicks — which storage.js
    // caps and an engaged user reaches in a week — pinned the threshold to
    // MIN_THRESHOLD and kept it there: still 38 after a year of silence,
    // measured. Someone who used Flow heavily and then took a month off came
    // back to the most eager version of it that exists, which is the opposite
    // of what this product promises, and no amount of dismissing could undo it
    // because dismissals faded while the clicks holding the floor down did not.
    const clicks = (c.clicks || 0) * decay;
    const dismissals = (c.dismissals || 0) * decay;
    const t = BASE_THRESHOLD - clicks * 4 + dismissals * 6;
    return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, t));
  }

  // The account-wide threshold above answers "should Flow be louder or
  // quieter overall." This answers the narrower question the precision/harm
  // audit asked for: within that account, is THIS classified intent type one
  // it keeps rejecting (or, worse, undoing after Flow already acted on it)?
  // A bounded correction on top of the account-wide threshold, never a
  // replacement for it — deliberately smaller than thresholdFrom's own
  // swing (22 points either side of BASE_THRESHOLD) so a single type never
  // dominates the account's overall calibration, and clamped through the
  // same MIN/MAX floor and ceiling so this can never push a message's bar
  // outside the range any threshold is allowed to sit in.
  const TYPE_ADJUST_CAP = 10;

  // `typeCalibration` is one entry of storage.js's calibrationByType map —
  // { clicks, dismissals, ts } for one FlowIntent type, or undefined for a
  // type with no history yet. No entry means no adjustment: a brand-new
  // install, or any caller (the marketing site's live demo, in particular)
  // that never passes calibrationByType at all, gets exactly the
  // account-wide threshold back, unchanged.
  function applyTypeAdjustment(baseThreshold, typeCalibration, now) {
    if (!typeCalibration) return baseThreshold;
    const elapsed = Math.max(0, (now || Date.now()) - (typeCalibration.ts || 0));
    const decay = typeCalibration.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    const clicks = (typeCalibration.clicks || 0) * decay;
    const dismissals = (typeCalibration.dismissals || 0) * decay;
    const delta = Math.max(-TYPE_ADJUST_CAP, Math.min(TYPE_ADJUST_CAP, dismissals * 3 - clicks * 2));
    return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, baseThreshold + delta));
  }

  // ISO is right for a database field and wrong for a button someone reads in
  // half a second.
  function humanDate(d) {
    if (!d) return null;
    if (!d.iso) return d.raw;
    var parts = d.iso.split('-');
    var dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var sameYear = dt.getFullYear() === new Date().getFullYear();
    return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ' ' + dt.getFullYear());
  }

  // When the message is not about this line of work, the domain's phrasing does
  // not apply to it. Calling domain.title() regardless is how an office lease
  // became "Log offer $3,900, starts Sep 7" under the recruiting profile — a
  // fabricated fact written into the customer's CRM with full confidence, which
  // is a worse failure than staying quiet.
  function neutralTitle(facts) {
    if (facts.lost) return 'Log that this is not going ahead';
    if (facts.executed) return 'Log agreement executed';
    if (facts.dispute) return 'Log discrepancy raised';
    if (facts.moneyText && facts.dateText) return 'Log ' + facts.moneyText + ', ' + facts.dateText;
    if (facts.moneyText) return 'Log ' + facts.moneyText + ' agreed';
    if (facts.dateText) return 'Log commitment for ' + facts.dateText;
    return 'Log this decision';
  }

  // Builds the same `facts` shape evaluate() computes internally — without
  // running the result through scoring or the chip's own threshold. Feature
  // 4's Next-Step orchestrator needs "what does this message state" even for
  // a message that never cleared the chip's threshold: a user who explicitly
  // clicked "Do It: Log & Generate Next Step Document" on their own open
  // email isn't asking the judgment engine for permission first, the way the
  // passive chip does. Reuses the exact same private regexes and helpers
  // evaluate() itself uses, so the two never compute a different answer for
  // the same text.
  function factsOnly(text, ctx) {
    ctx = ctx || {};
    text = newContent(text);
    const raw = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
    const facts = {
      money: raw.money,
      moneyText: raw.moneyText,
      date: raw.date,
      dateText: humanDate(raw.date),
      automated: raw.automated,
      wordCount: raw.wordCount,
      isReply: /^re:/i.test(ctx.subject || ''),
      lost: LOST.test(text) || LOST_HE.test(text),
      executed: EXECUTED.test(text) || EXECUTED_HE.test(text),
      dispute: DISPUTE.test(text) || DISPUTE_HE.test(text)
    };
    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT_STRONG, COMMIT_STRONG_HE, COMMIT, COMMIT_HE, LOST, LOST_HE, EXECUTED, EXECUTED_HE, DISPUTE, DISPUTE_HE, OBLIGATION, OBLIGATION_HE, HANDOFF, HANDOFF_HE]);
    return facts;
  }

  function evaluate(text, domainId, ctx) {
    ctx = ctx || {};
    const domain = FLOW_DOMAINS.find((d) => d.id === domainId) || FLOW_DOMAINS[0];
    // Judge what the sender just wrote, not the thread they wrote it on top of.
    text = newContent(text);
    const raw = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });

    const facts = {
      money: raw.money,
      moneyText: raw.moneyText,
      date: raw.date,
      dateText: humanDate(raw.date),
      automated: raw.automated,
      wordCount: raw.wordCount,
      isReply: /^re:/i.test(ctx.subject || '')
    };

    const s = score(text, domain, facts);
    facts.lost = s.flags.lost;
    facts.executed = s.flags.executed;
    facts.dispute = s.flags.dispute;

    const threshold = thresholdFrom(ctx.calibration, ctx.now);
    if (s.total < threshold) return null;

    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT_STRONG, COMMIT_STRONG_HE, COMMIT, COMMIT_HE, LOST, LOST_HE, EXECUTED, EXECUTED_HE, DISPUTE, DISPUTE_HE, OBLIGATION, OBLIGATION_HE, HANDOFF, HANDOFF_HE]);

    return {
      score: s.total,
      threshold,
      label: s.flags.onDomain ? domain.title(facts) : neutralTitle(facts),
      domain: domain.id,
      facts,
      signals: s.signals.filter((x) => x.weight !== 0)
    };
  }

  // Hard-gated types (SCHEDULED_EVENT, COMMITMENT_OF_READER, REQUEST in
  // intent.js) have no threshold for applyTypeAdjustment above to nudge —
  // they fire on a deterministic evidence gate, not a score compared to a
  // moving bar. But an account can still teach Glance to stop surfacing a
  // TYPE it keeps rejecting, the same way it teaches the two score-based
  // types: this is that lesson's outlet for the three that have none.
  // Deliberately NOT a blend into the evidence gate itself (that stays a
  // pure boolean, exactly as documented at each gate's own call site) — it's
  // a separate, later question: "the evidence is real, does this account
  // still want to see it."
  //
  // SUPPRESS_MARGIN is set high (5 of bumpCalibration's own 6-per-counter
  // cap) on purpose. One or two dismissals of a genuine REQUEST/EVENT/
  // COMMITMENT are completely normal noise (already handling it elsewhere,
  // wasn't in the mood, misclicked) and must never silence a hard-gated
  // type on that alone — silencing a message with real, unambiguous
  // evidence is a worse failure than one extra chip, the same precision-
  // over-recall bias every hard gate in intent.js is built on. This only
  // fires after sustained, close-to-unanimous rejection of that exact type,
  // and — through the same decay every other calibration number here uses —
  // self-heals within roughly a week of no further dismissals. Silence must
  // never become a one-way door; that's thresholdFrom's own rule above,
  // applied here too.
  const SUPPRESS_MARGIN = 5;

  // `typeCalibration` is the same calibrationByType[type] bucket
  // applyTypeAdjustment reads — { clicks, dismissals, ts } — already
  // populated for every FlowIntent type by storage.js's calibrate(), hard-
  // gated types included (content-gmail.js calls
  // FlowStorage.calibrate('dismiss'|'click', ctx.intent.type) for every
  // intent type, not just the two score-based ones). No entry, same as
  // applyTypeAdjustment, means no suppression: a brand-new install or a
  // caller with no calibration history behaves exactly as before.
  function isTypeSuppressed(typeCalibration, now) {
    if (!typeCalibration) return false;
    const elapsed = Math.max(0, (now || Date.now()) - (typeCalibration.ts || 0));
    const decay = typeCalibration.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    const clicks = (typeCalibration.clicks || 0) * decay;
    const dismissals = (typeCalibration.dismissals || 0) * decay;
    return (dismissals - clicks) >= SUPPRESS_MARGIN;
  }

  // score, newContent, and the HANDOFF pair are exposed for intent.js: the
  // classifier reuses this exact scorer and this exact "is this a request"
  // pattern (same signals, same weights, same tuning against
  // test/judgment-corpus.cjs) rather than re-deriving a second, potentially
  // drifting copy of the same judgment.
  return {
    evaluate, factsOnly, neutralTitle, thresholdFrom, applyTypeAdjustment, isTypeSuppressed, isNegatedBefore, score, newContent,
    HANDOFF, HANDOFF_HE, FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE, SENDER_PROMISE, SENDER_PROMISE_HE, slotAskText, shortAskText, SLOT_ASKS, SLOT_ASKS_HE,
    BASE_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowJudgment };
