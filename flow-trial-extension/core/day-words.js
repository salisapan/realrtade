// Day words the date reader (core/extract.js) does not take, rewritten into forms it does, before a chat or mail reader looks
// for its one day: Hebrew weekday abbreviations («יום א׳» to «יום ראשון»), the Hebrew hyphen (maqaf) in «ב־10:00», dotted dates
// after a day marker («עד 28.10» to «עד 28/10», "by 28.10"), and relative spans («בעוד יומיים», «בעוד שלושה ימים», «בעוד שבוע»,
// "in 3 days", "in two days", "in a week") to an ISO date. It only rewrites; it never decides anything. Portable: no
// A clock with a part of the day («ב-7 בערב», «ב-4 אחה"צ», "at noon") becomes "at 7:00 pm".
// chrome.*, no DOM, no network.
const FlowDayWords = (() => {
  const ABBR = { 'א': 'ראשון', 'ב': 'שני', 'ג': 'שלישי', 'ד': 'רביעי', 'ה': 'חמישי', 'ו': 'שישי', 'ש': 'שבת' };
  const HE_NUM = { 'יומיים': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6, 'שבעה': 7, 'שבע': 7 };
  const EN_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, a: 1 };

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function plus(at, days) { return iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + days)); }

  function normalize(text, now) {
    let s = String(text == null ? '' : text);
    if (!s) return s;
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    s = s.replace(/־/g, '-');
    s = s.replace(/(יום|ליום|ביום)\s+([אבגדהוש])[׳'’`]/g, (m, d, a) => d + ' ' + ABBR[a]);
    // 28.10 or 28.10.2026 after a day marker, not a price or a version.
    s = s.replace(/(^|[\s(])((?:עד|לפני|ב-?|ל-?|on|by|before|until|till)\s*)([0-3]?\d)\.([01]?\d)(\.\d{2,4})?(?![\d.]*\d)/gi, (m, pre, mark, d, mo, yr) => {
      const dn = parseInt(d, 10); const mn = parseInt(mo, 10);
      if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return m;
      // Always an ISO date: "5/11" is ambiguous (day or month first) to a reader, an ISO date is not. No year means the next such day.
      let y = at.getFullYear();
      if (yr) { y = parseInt(yr.slice(1), 10); if (y < 100) y += 2000; } else if (new Date(y, mn - 1, dn) < new Date(at.getFullYear(), at.getMonth(), at.getDate())) y += 1;
      const probe = new Date(y, mn - 1, dn);
      if (probe.getMonth() !== mn - 1 || probe.getDate() !== dn) return m;
      return pre + mark + iso(probe);
    });
    // Clocks written the other ways: «ב-8 וחצי», «ב-8 ורבע», "half past 8", "quarter to 9", and a dotted clock («ב-20.00»,
    // "at 8.30 pm"). The date reader would take "at 8.30 pm" for 8:00, a wrong hour, so these are made explicit first.
    s = s.replace(/(^|[^\u0590-\u05FF\d])(ב-?|בשעה\s+)(\d{1,2})\s*ו-?(חצי|רבע)(?![\u0590-\u05FF])/g, (m, pre, lead, h, w) => (parseInt(h, 10) >= 1 && parseInt(h, 10) <= 12) ? pre + lead + h + ':' + (w === 'חצי' ? '30' : '15') : m);
    s = s.replace(/\bhalf\s+past\s+(\d{1,2})\b/gi, (m, h) => (parseInt(h, 10) >= 1 && parseInt(h, 10) <= 12) ? h + ':30' : m);
    s = s.replace(/\bquarter\s+past\s+(\d{1,2})\b/gi, (m, h) => (parseInt(h, 10) >= 1 && parseInt(h, 10) <= 12) ? h + ':15' : m);
    s = s.replace(/\bquarter\s+(?:to|of)\s+(\d{1,2})\b/gi, (m, h) => { const n = parseInt(h, 10); return (n >= 1 && n <= 12) ? ((n === 1 ? 12 : n - 1) + ':45') : m; });
    s = s.replace(/(\d{1,2})\.([0-5]\d)(\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z]))/gi, (m, h, mi, mer) => parseInt(h, 10) >= 1 && parseInt(h, 10) <= 12 ? h + ':' + mi + mer : m);
    s = s.replace(/(\bat\s+|(?<![\u0590-\u05FF])ב-?|בשעה\s+)([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])/gi, (m, lead, h, mi) => lead + h + ':' + mi);
    // A clock with a part of the day: «ב-7 בערב» to "at 7:00 pm", «ב-12 בצהריים» to "at 12:00 pm", "at noon" to "at 12:00 pm". The
    // date reader leaves a bare 12 or 00 unresolved on purpose, and takes a written am or pm.
    s = s.replace(/(ב-?|בשעה\s+)(\d{1,2})(?::([0-5]\d))?\s+(בבוקר|בצהריים|בצהרים|אחה["״]צ|אחר\s+הצהריים|אחרי\s+הצהריים|בערב|בלילה)/g, (m, lead, h, min, part) => {
      const hh = parseInt(h, 10);
      if (hh < 1 || hh > 12) return m;
      let mer = '';
      if (part === 'בבוקר') mer = hh === 12 ? '' : 'am';
      else if (/^בצהר/.test(part)) mer = (hh === 12 || hh <= 5) ? 'pm' : '';
      else if (part === 'בלילה') mer = hh === 12 || hh <= 5 ? 'am' : 'pm';
      else mer = 'pm';
      if (!mer) return m;
      return 'at ' + hh + ':' + (min || '00') + ' ' + mer;
    });
    s = s.replace(/\bat\s+noon\b/gi, 'at 12:00 pm');
    s = s.replace(/\bat\s+midnight\b/gi, 'at 12:00 am');
    // Relative spans to an ISO date.
    s = s.replace(/בעוד\s+(יומיים|(?:שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|\d{1,2})\s+ימים)/g, (m, span) => {
      const n = HE_NUM[span] || HE_NUM[span.split(/\s+/)[0]] || parseInt(span, 10);
      return n >= 1 && n <= 60 ? plus(at, n) : m;
    });
    s = s.replace(/בעוד\s+שבוע(?![֐-׿])/g, () => plus(at, 7));
    s = s.replace(/\bin\s+(a|one|two|three|four|five|six|seven|\d{1,2})\s+days?\b/gi, (m, w) => {
      const n = EN_NUM[String(w).toLowerCase()] || parseInt(w, 10);
      return n >= 1 && n <= 60 ? plus(at, n) : m;
    });
    s = s.replace(/\bin\s+(?:a|one)\s+week\b/gi, () => plus(at, 7));
    return s;
  }

  return { normalize };
})();

if (typeof module !== 'undefined') module.exports = { FlowDayWords };
else if (typeof globalThis !== 'undefined') globalThis.FlowDayWords = FlowDayWords;
