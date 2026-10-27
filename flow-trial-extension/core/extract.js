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
  // Weekday + a day-first date + בשעה HH:MM is one clock. 22/10 is 22 October,
  // not October 22. The weekday has to be that calendar day. A mismatch is
  // not a date: the caller stays quiet instead of picking one of the two.
  function weekdayDayFirst(text, now) {
    const src = String(text || '');
    const dayName = src.match(/(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05FF])/);
    const slash = src.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
    const clock = src.match(/(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)\s*\d{1,2}:\d{2}(?!\d)/);
    if (!dayName || !slash || !clock || !now) return null;
    const weekday = DAYS_HE.indexOf(dayName[1]);
    const day = +slash[1];
    const month = +slash[2];
    const raw = dayName[0] + ' ' + slash[1] + '/' + slash[2] + (slash[3] ? '/' + slash[3] : '');
    if (weekday < 0 || month < 1 || month > 12 || day < 1 || day > 31) {
      return { raw: raw, iso: null, contradictsWeekday: true };
    }
    let year = null;
    if (slash[3]) {
      year = +slash[3];
      if (year < 100) year += 2000;
    }
    if (year) {
      const dated = buildDate(year, month - 1, day);
      if (!dated || dated.getDay() !== weekday) return { raw: raw, iso: null, contradictsWeekday: true };
      return { raw: raw, iso: iso(dated) };
    }
    const y = now.getFullYear();
    const candidates = [y - 1, y, y + 1]
      .map((yy) => buildDate(yy, month - 1, day))
      .filter((d) => d && d.getDay() === weekday && (now - d) <= PAST_MS && (d - now) <= FUTURE_MS);
    if (candidates.length !== 1) return { raw: raw, iso: null, contradictsWeekday: true };
    return { raw: raw, iso: iso(candidates[0]) };
  }

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
      // A Hebrew sentence writes day first (01/11 is 1 November): that is the convention in Israel. English stays ambiguous.
      else if (a >= 1 && a <= 12 && b >= 1 && b <= 12 && /[\u0590-\u05FF]/.test(src)) { day = a; monthIdx = b - 1; }
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
  function numericDayMonth(src) {
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
    // Hebrew mail writes day first (5/11 is 5 November). Same rule as slashDate().
    else if (a >= 1 && a <= 12 && b >= 1 && b <= 12 && /[\u0590-\u05FF]/.test(src)) { day = a; month = b; }
    else return null;
    return { day: day, month: month, yearRaw: m[3] || null, token: m[1] + (slash ? '/' : '.') + m[2] + (m[3] ? (slash ? '/' : '.') + m[3] : '') };
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
    const num = numericDayMonth(src);
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
      if (!clock) return null;
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
