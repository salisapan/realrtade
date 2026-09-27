// Mirrored, not authored, here — source of truth is:
//   flow-trial-extension/core/domains.js
//   flow-trial-extension/core/extract.js
//   flow-trial-extension/core/judgment.js
// Regenerate with: scripts/build-glance-engine.sh
// Last synced: 2026-09-27
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

  // Only dates the message states outright. A date guessed from context is worse
  // than no date at all once it lands in someone's CRM.
  function parseDate(text, now) {
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

    // "7 בספטמבר" / "ב-21 בספטמבר 2026". The ב clings to the month name
    // (בספטמבר), the same way English puts the month name next to the day.
    // No year uses monthDay()'s window, so a bare day six months out stays
    // unresolved instead of being filed on the wrong year. A Hebrew letter
    // after the month name ("בספטמבראי") is not that month.
    m = text.match(new RegExp('(?:^|[^\\d\\u0590-\\u05FF])(\\d{1,2})\\s+ב-?(' + MONTHS_HE.join('|') + ')(?![\\u0590-\\u05FF])(?:\\s+(\\d{4}))?'));
    if (m) return monthDay(m[0].replace(/^[^\d]+/, ''), MONTHS_HE.indexOf(m[2]), +m[1], m[3], now);

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
    m = text.match(new RegExp('(?:עד|ב-?|לא יאוחר מ-?)\\s*יום\\s+(' + DAYS_HE.join('|') + ')(?:\\s+הבא(?![\\u0590-\\u05FF]))?'));
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

    // Numeric M/D or D/M is genuinely ambiguous across locales, so it is kept as
    // written and never normalized to an ISO date we cannot justify.
    m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) return { raw: m[0], iso: null };

    return null;
  }

  // Only a time the message states next to an explicit time marker ("at 3pm",
  // "בשעה 15:00") — a bare "15:00" or "3" floating in text is as likely to be
  // a flight number, a room, or a price as a meeting time, and guessing here
  // would be the same mistake parseDate() above already refuses to make for
  // an ambiguous year.
  function parseTime(text) {
    let m;

    m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (m) {
      let h = +m[1];
      const min = m[2] ? +m[2] : 0;
      const ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h > 23 || min > 59) return null;
      // With no am/pm, an hour that is also a valid afternoon hour says
      // nothing: "let's meet at 3" in a work email means 15:00 essentially
      // always, and logging 03:00 puts a meeting in the middle of the night.
      // 12 is the same problem in the other direction (noon or midnight).
      // Hours from 13 up are unambiguous, and so are 8-11, which nobody
      // writes to mean 20:00-23:00 without saying pm. The rest we refuse,
      // for the same reason parseDate refuses an ambiguous year.
      if (!ap && (h < 8 || h === 12)) return null;
      return { raw: m[0], hour: h, minute: min };
    }

    // בשעה/בשעות is an unambiguous "at the hour of" marker — unlike a bare
    // "ב-" prefix (used elsewhere for "on <weekday>"), it is never a room
    // number, a page reference, or anything else. Deliberately no trailing
    // \b for the same reason parseDate()'s Hebrew weekday block has none:
    // \b never fires next to Hebrew letters.
    m = text.match(/(?:בשעה|בשעות)\s*(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      const h = +m[1];
      const min = m[2] ? +m[2] : 0;
      if (h > 23 || min > 59) return null;
      return { raw: m[0], hour: h, minute: min };
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
    if (/\bunsubscribe\b|\bview (this )?in browser\b|\bmanage (your )?preferences\b/i.test(text)) return true;
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
  const COMMIT = /\b(we'?re good (?:at|with)|agreed?(?: to| on)?|confirm(?:ed|ing)?|accept(?:ed)?|we'?ll take|executed|sounds good|works for (?:us|me)|happy to (?:move forward|proceed)|let'?s proceed|we'?re on board|consider it done|that works (?:for us|for me)?|agreed upon|in agreement|we concur|we'?re aligned|you have our agreement)\b/i;
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
  const HANDOFF = /\b(can you|could you|would you (?:be able to|mind)|would it be possible (?:for you )?to|I was hoping you could|please (?:can you |could you )?(?:send|update|confirm|review|approve|handle|process|arrange|ensure|provide|forward|share|submit|sign|upload|prepare|finalize|resend|reply|respond|schedule|let (?:us|me) know)|kindly (?:send|confirm|provide|forward|arrange|review|update|advise)|(?:we|I)(?:'d| would) appreciate (?:it )?if you|requesting (?:that )?you|asking you to|your (?:help|assistance|input|guidance) (?:is|would be) (?:needed|appreciated|required)|(?:we|I) need your (?:approval|confirmation|feedback|input|help|sign-?off)|need(?:s|ed)? you to|waiting on (?:your|you)|over to you|action required|at your earliest convenience)\b/i;
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
  const COMMIT_HE = /(סוכם|אישרנו|מאשרים|מקובל עלינו|סגרנו|בסדר מבחינתנו|מאשר(?:ת|ים)?|מסכימים|מסכימה|מסכים|הוחלט ש|סגור מבחינתנו|בסדר גמור|מקובל עליי?נו?|נשמע טוב|נשמח להתקדם|בואו נתקדם|אנחנו בעניין|רואים בזה סגור|תואמים|יש לנו הסכמה)/;
  const COMMIT_STRONG_HE = /(מאושר|יש אישור|אפשר להתקדם|קיבלנו אישור|חתמנו|ניתן אישור|אושר|האישור התקבל|אור ירוק|קיבלנו את האישור|אפשר לצאת לדרך|ההזמנה אושרה|מאושר סופית|אושר רשמית|קיבל אישור סופי|יצא אישור|האישור הסופי התקבל)/;
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
  const HANDOFF_HE = /(תוכלו?\s|תוכלי\s|נשמח אם|מחכים ל(?:אישור|תשובה|תגובה)|נדרשת פעולה|אשמח אם תוכל|תשלחי?\s+לי|(?:צריך|צריכ(?:ה|ים))\s+ממך|בבקשה ת|אבקש|מבקש(?:ת|ים)?|אודה (?:לך |לכם )?(?:מאוד )?אם|אשמח (?:אם )?לקבל|(?:^|\s)נא\s+ל|אנא (?:שלח|תשלחו?|העבר|תעבירו?|אשר|תאשרו?|עדכן|תעדכנו?|ציין|תציינו?|פרט|תפרטו?|מלא|תמלאו?)|האם תוכלו?|תוכלו? בבקשה|אשמח אם תשלחו?|(?:אפשר|ניתן) לקבל את|יש צורך ש|נדרש ממך|חשוב שתעביר|(?:^|\s)אם תוכלו?\s|(?:^|\s)אם תוכלי\s|(?:^|\s)אם אפשר\s|נשמח לקבל|תודה מראש (?:על|ש)|יהיה נהדר אם תוכלו?|נודה לך אם|ההשתתפות שלך נדרשת)/;
  // "Please follow up with Dana about the invoice" is an explicit ask, and
  // it never matched HANDOFF: "follow up" isn't in that verb list, and the
  // "send" later in the sentence isn't adjacent to "please". Kept out of
  // HANDOFF on purpose — these go through directedAsk() below (negation and
  // a hedge sitting in front of the phrase still kill them) instead of
  // HANDOFF's bare .test(), which cannot see "please don't follow up".
  const FOLLOW_UP_ASK = /\b(?:please follow(?:\s*|-)?up|follow up (?:with|on)|need you to follow up)\b/i;
  const FOLLOW_UP_ASK_HE = /(?:^|\s)בבקשה\s+תעק(?:וב|בי|בו)|(?:^|\s)לעקוב\s+אחרי|(?:^|\s)תעק(?:וב|בי|בו)\s+אחרי/;
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
      // A question asks for a decision; it does not record one.
      if (/\?\s*$/.test(s.trim())) continue;
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
    const noise = automated || calendarNoise || PITCH_VETO.test(text) || MARKETING_VETO.test(text);
    if (automated) add('automated', -60, 'The sender looks automated');
    if (marketing) add('marketing', -45, 'Reads like a mailing list, not a person');
    if (solicitation) add('solicitation', -55, 'Reads like a cold pitch, not your work');
    if (calendarNoise) add('calendar', -35, 'Calendar notification boilerplate');
    if (facts.wordCount < 12) add('too-short', -25, 'Too little text to judge');

    // A commitment counts only where a sentence actually states it. The
    // "mentioned" forms are kept alongside so the difference between the two
    // can be scored: a message that talks about approving without approving is
    // not neutral evidence, it is evidence AGAINST acting.
    const STRONG_PATS = [COMMIT_STRONG, COMMIT_STRONG_HE];
    const COMMIT_PATS = [COMMIT, COMMIT_HE].concat(STRONG_PATS);
    const EXEC_PATS = [EXECUTED, EXECUTED_HE];
    const OBLIG_PATS = [OBLIGATION, OBLIGATION_HE];

    const commitStrong = anyOf(text, STRONG_PATS, assertedIn);
    const commit = commitStrong || anyOf(text, COMMIT_PATS, assertedIn);
    const commitMentioned = anyOf(text, COMMIT_PATS, testsIn);
    const executed = anyOf(text, EXEC_PATS, assertedIn);
    const executedMentioned = anyOf(text, EXEC_PATS, testsIn);
    // LOST is deliberately NOT routed through assertedIn: its own patterns
    // embed the negation ("not moving forward", "no longer interested"), so
    // asking whether the sentence negates them inverts the very signal.
    const lost = LOST.test(text) || LOST_HE.test(text);
    const obligation = anyOf(text, OBLIG_PATS, assertedIn);
    const followUpAsk = anyOf(text, [FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE], directedAsk);
    const handoff = HANDOFF.test(text) || HANDOFF_HE.test(text) || followUpAsk;
    const dispute = DISPUTE.test(text) || DISPUTE_HE.test(text);
    const senderPromise = anyOf(text, [SENDER_PROMISE, SENDER_PROMISE_HE], assertedIn);

    if (facts.money) add('money', 34, 'States a figure: ' + facts.moneyText);
    if (commitStrong) add('commitment', 42, 'Someone authorised something outright');
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
    const onDomain = domain.entityWords.test(text);
    if (onDomain) add('domain', 14, 'About ' + domain.entity.toLowerCase());
    if (facts.isReply) add('reply', 8, 'Part of an ongoing thread');

    // A message with a number and nothing else decided is a quote, not a decision.
    // Requiring a second signal alongside money is what keeps price lists quiet.
    const positives = signals.filter((s) => s.weight > 0);
    if (positives.length === 1 && positives[0].id === 'money') add('unsupported', -20, 'A figure alone, with nothing decided');

    // Withholding the commitment points is not enough on its own. "We do NOT
    // approve the $40,000" still carries a figure, a domain match and a reply
    // bonus — 56 against a threshold of 50 — so it would clear the bar anyway
    // and be labelled from the money alone, which reads "Log $40,000 agreed".
    // A denied or merely-contemplated commitment has to push the other way.
    if (!commit && commitMentioned) add('negated', -34, 'Names a decision the sentence does not actually make');
    else if (!executed && executedMentioned) add('negated', -34, 'Names an agreement the sentence does not actually execute');

    const total = signals.reduce((sum, s) => sum + s.weight, 0);
    return { total, signals, flags: { commit, lost, executed, obligation, handoff, dispute, onDomain, senderPromise, noise } };
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
    HANDOFF, HANDOFF_HE, FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE, SENDER_PROMISE, SENDER_PROMISE_HE,
    BASE_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowJudgment };
