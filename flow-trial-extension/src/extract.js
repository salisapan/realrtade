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

  const CURRENCY = {
    '$': 'USD', 'us$': 'USD', 'usd': 'USD',
    '€': 'EUR', 'eur': 'EUR',
    '£': 'GBP', 'gbp': 'GBP',
    '₪': 'ILS', 'nis': 'ILS', 'ils': 'ILS',
    '₹': 'INR', 'inr': 'INR',
    'c$': 'CAD', 'cad': 'CAD', 'a$': 'AUD', 'aud': 'AUD'
  };

  // Symbol/code before the number, or code after it. Optional k/m suffix.
  const MONEY_RE = new RegExp(
    '(?:(\\$|€|£|₪|₹|US\\$|C\\$|A\\$|USD|EUR|GBP|NIS|ILS|INR|CAD|AUD)\\s?)?' +
    '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)' +
    '\\s?(k|m)?' +
    '(?:\\s?(USD|EUR|GBP|NIS|ILS|INR|CAD|AUD|dollars|euros|pounds|shekels))?',
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
                    /pounds/i.test(post || '') ? 'GBP' : /shekels/i.test(post || '') ? 'ILS' : null);
      // A bare number with no currency marker is not money — it's a floor number,
      // a version, a headcount. Refusing those is most of what keeps this honest.
      if (!code) continue;
      let value = parseFloat(digits.replace(/,/g, ''));
      if (mult) value *= (mult.toLowerCase() === 'k' ? 1e3 : 1e6);
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

  // Only dates the message states outright. A date guessed from context is worse
  // than no date at all once it lands in someone's CRM.
  function parseDate(text, now) {
    now = now || new Date();
    let m;

    m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return { raw: m[0], iso: m[0] };

    const monthNames = MONTHS.join('|');
    // A bare "March 3" carries no year, so resolving it means guessing. Guessing
    // forward ("it must mean next March") silently rewrites "the March 3 kickoff
    // already happened" into a future commitment and writes that wrong ISO date
    // into someone's CRM. When the year is genuinely ambiguous we keep the words
    // the sender used and refuse to emit an ISO date at all — no date beats a
    // confidently wrong one, which is the same rule the rest of this file follows.
    const STALE_MS = 1000 * 60 * 60 * 24 * 30;

    m = text.match(new RegExp('\\b(' + monthNames + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'i'));
    if (m) {
      const d = new Date(m[3] ? +m[3] : now.getFullYear(), MONTHS.indexOf(m[1].toLowerCase()), +m[2]);
      if (!m[3] && d < now && (now - d) > STALE_MS) return { raw: m[0], iso: null, ambiguousYear: true };
      return { raw: m[0], iso: iso(d) };
    }

    m = text.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + monthNames + ')(?:,?\\s+(\\d{4}))?\\b', 'i'));
    if (m) {
      const d = new Date(m[3] ? +m[3] : now.getFullYear(), MONTHS.indexOf(m[2].toLowerCase()), +m[1]);
      if (!m[3] && d < now && (now - d) > STALE_MS) return { raw: m[0], iso: null, ambiguousYear: true };
      return { raw: m[0], iso: iso(d) };
    }

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

    // Numeric M/D or D/M is genuinely ambiguous across locales, so it is kept as
    // written and never normalized to an ISO date we cannot justify.
    m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) return { raw: m[0], iso: null };

    return null;
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
    return {
      money,
      moneyText: fmtMoney(money),
      date: parseDate(text, ctx && ctx.now),
      automated: senderIsAutomated(ctx && ctx.senderEmail, text),
      wordCount: (text.match(/\S+/g) || []).length
    };
  }

  return { extract, parseMoney, parseDate, fmtMoney, decisiveSentence, senderIsAutomated };
})();

if (typeof module !== 'undefined') module.exports = { FlowExtract };
