// A delivery with a day and a window that a courier or a shop tells the person in a chat: "Your package will be delivered tomorrow
// between 14:00 and 18:00", "The courier will arrive Sunday 10:00-12:00", «השליח יגיע מחר בין 14:00 ל-18:00», «המשלוח שלך יגיע ביום שני
// בין השעות 10:00-12:00». The shared judge reads no ask here. This module recognises it structurally: an item noun (your package /
// the courier / המשלוח), a future arrival verb, one named day that is today or later, and a clock or a clock window. It returns the day,
// the first clock and, for a window, the last clock; the chat card offers a calendar hold at the start of the window, titled "Delivery
// 14:00–18:00 · name", that the person approves. Nobody is invited. A delivery that already happened, a failed or cancelled one, a pickup
// (core/chat-pickup-notice.js reads those) and a tracking or survey line stay quiet. Portable: no chrome.*, no DOM, no network.
const FlowChatDeliveryWindow = (() => {
  const NOUN_EN = /\b(?:your\s+(?:[a-z-]+\s+){0,2}(?:order|parcel|package|delivery|shipment|items?|groceries|furniture)|the\s+(?:courier|driver|delivery\s+(?:person|guy|man)|messenger)|our\s+(?:courier|driver))\b/i;
  const NOUN_HE = /(?:ההזמנה|החבילה|המשלוח|הפריט|הרהיט(?:ים)?|הקניות)\s+(?:שלך|שלכם|שלכן)|(?:השליח|הנהג|המשלוחן|שליח)|(?:הזמנתך|חבילתך|משלוחך)/;
  // A person who comes to do work and tells the day and the hours ("The plumber will come between 8 and 12 on Tuesday", «הטכנאי יגיע ביום שלישי בין 8 ל-12»)
  // is the same window; the hold is titled "Visit", not "Delivery".
  const VISIT_EN = /\b(?:the|our|your)\s+(?:[a-z-]+\s+){0,1}(?:plumber|electrician|technician|installer|handyman|cleaner|painter|repairman|repair\s?man|engineer|locksmith|inspector|surveyor|contractor|gardener|mover|movers|exterminator)\b/i;
  const VISIT_HE = /(?:^|[\s,.(])(?:ה)?(?:אינסטלטור|שרברב|חשמלאי|טכנאי|טכנאית|מתקין|מנקה|צבעי|מנעולן|מהנדס|קבלן|גנן|מדביר|מוביל|מובילים)(?![א-ת])/;
  const VERB_EN = /\b(?:will\s+(?:be\s+delivered|arrive|be\s+with\s+you|come|deliver)|(?:is|are)\s+(?:scheduled|expected|due|set)\s+(?:to\s+(?:arrive|be\s+delivered)|for\s+delivery|for)|arrives?|arriving|delivery\s+(?:is\s+)?(?:scheduled|set|planned)|out\s+for\s+delivery|delivering|will\s+be\s+there)\b/i;
  const VERB_HE = /(?:יגיע|תגיע|יגיעו|מגיע|מגיעה|יימסר|תימסר|יסופק|תסופק|מתוכנן|מתוכננת|צפוי|צפויה|בדרך\s+אליך|נמסר\s+אליך\s+ב|מגיע\s+אליך)/;
  // A look back, a failure, a cancellation, a pickup, a question, a tracking or survey line, an offer.
  const NO_EN = /\b(?:was\s+delivered|has\s+been\s+delivered|were\s+delivered|delivered\s+yesterday|arrived|yesterday|last\s+(?:week|night)|cancel(?:l?ed)?|failed|unable|unfortunately|sorry|delay(?:ed|s)?|resched\w*|postpone[d]?|moved|pick\s?-?up|collect(?:ion)?|refund|coupon|discount|offer|sale|would\s+you\s+like|choose|select)\b/i;
  const NO_HE = /(?:נמסר\s|נמסרה|הגיע\s|הגיעה|אתמול|שבוע שעבר|בוטל|בוטלה|נכשל|לא\s+הצלחנו|לצערנו|מצטערים|מצטער|עיכוב|עוכב|נדחה|נדחתה|הועבר|איסוף|לאסוף|החזר|קופון|הנחה|מבצע|בחר)/;
  const QUESTION = /[?؟]/;
  const MAX_AHEAD_DAYS = 30;
  const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  // between 14:00 and 18:00 / from 2pm to 6pm / 14:00-18:00 / «בין 14:00 ל-18:00» / «בין השעות 10:00-12:00»
  const CLK = '(\\d{1,2}(?::\\d{2})?\\s?(?:a\\.?m\\.?|p\\.?m\\.?)?)';
  const RANGE_EN = new RegExp('(?:between|from)\\s+' + CLK + '\\s*(?:and|to|-|–|—|until|till)\\s*' + CLK + '|\\b(\\d{1,2}:\\d{2})\\s*(?:-|–|—|to)\\s*(\\d{1,2}:\\d{2})\\b', 'i');
  const RANGE_HE = new RegExp('בין(?:\\s+השעות)?\\s+(\\d{1,2}(?::\\d{2})?)\\s*(?:ל-?|ל־|ועד|עד|ו-?|-|–|—)\\s*(\\d{1,2}(?::\\d{2})?)|(\\d{1,2}:\\d{2})\\s*(?:-|–|—)\\s*(\\d{1,2}:\\d{2})');

  function extractApi() {
    if (typeof FlowExtract !== 'undefined') return FlowExtract;
    try { return typeof require !== 'undefined' ? require('./extract.js').FlowExtract : null; } catch (e) { return null; }
  }
  // Hebrew weekday abbreviations, the maqaf, dotted dates and "in N days" are rewritten into forms the date reader takes.
  function dayWords(text, now) {
    try {
      const D = typeof FlowDayWords !== 'undefined' ? FlowDayWords : (typeof require !== 'undefined' ? require('./day-words.js').FlowDayWords : null);
      return D ? D.normalize(text, now) : text;
    } catch (e) { return text; }
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function weekdayDate(text, at) {
    const t = String(text || '');
    let idx = -1;
    const en = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (en) idx = DAYS_EN.indexOf(en[1].toLowerCase());
    else {
      const he = t.match(/(?:ביום|ב-?יום|ליום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
      if (he) idx = DAYS_HE.indexOf(he[1]);
    }
    if (idx < 0) {
      if (/\b(?:today|tonight)\b|(?:^|[^֐-׿])היום(?![֐-׿])/i.test(t)) return { iso: iso(at) };
      return null;
    }
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    let add = (idx - d.getDay() + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    return { iso: iso(d) };
  }

  // One clock text ("14:00", "2pm", "10") to { h, m } in 24 hours, or null when it cannot be told. A bare 7 to 21 is the hour itself,
  // a bare hour under 7 is too ambiguous to hold.
  function clock(txt, otherHasMarker) {
    const m = String(txt || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)?$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (min > 59 || h > 23) return null;
    if (m[3]) {
      if (h < 1 || h > 12) return null;
      const pm = /^p/i.test(m[3]);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    } else if (h < 7 && !m[2] && !otherHasMarker) return null;
    return { h: h, m: min };
  }

  // The window: first and last clock, or null.
  function windowOf(raw) {
    const m = raw.match(RANGE_EN) || raw.match(RANGE_HE);
    if (!m) return null;
    const a = m[1] || m[3];
    const b = m[2] || m[4];
    const mk = (x) => { const k = String(x).match(/[ap]\.?m/i); return k ? k[0].toLowerCase().replace('.', '') : ''; };
    // "between 2 and 6pm": the clock without a marker takes the other one's.
    let sa = String(a).trim();
    let sb = String(b).trim();
    if (mk(sa) && !mk(sb)) sb = sb + mk(sa);
    if (mk(sb) && !mk(sa)) sa = sa + mk(sb);
    const marked = Boolean(mk(sa) || mk(sb));
    let from = clock(sa, marked);
    let to = clock(sb, marked);
    // A window that runs backwards with a shared marker ("between 11 and 1pm") starts in the morning.
    if (from && to && mk(sa) === 'pm' && mk(sb) === 'pm' && from.h > to.h && from.h >= 12) from = { h: from.h - 12, m: from.m };
    if (!from || !to) return null;
    if (to.h * 60 + to.m <= from.h * 60 + from.m) return null;
    return { from: from, to: to };
  }

  // { kind: 'delivery', dateIso, hour, minute, endHour, endMinute, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 260) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-an-upcoming-delivery' };
    const visit = (VISIT_EN.test(raw) || VISIT_HE.test(raw)) && !NOUN_EN.test(raw) && !NOUN_HE.test(raw);
    if (!visit && !NOUN_EN.test(raw) && !NOUN_HE.test(raw)) return { kind: 'none', reason: 'no-delivery-noun' };
    if (!VERB_EN.test(raw) && !VERB_HE.test(raw)) return { kind: 'none', reason: 'no-arrival-verb' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function' || typeof X.parseTime !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    let startH; let startM; let endH = null; let endM = null;
    // The window is read from the person's own words: the day-word rewrite turns a leading-zero clock into "at 8:00 am".
    const w = windowOf(String(text == null ? '' : text).replace(/\s+/g, ' ').trim());
    if (w) { startH = w.from.h; startM = w.from.m; endH = w.to.h; endM = w.to.m; }
    else {
      const t = X.parseTime(raw);
      if (!(t && Number.isInteger(t.hour) && Number.isInteger(t.minute))) return { kind: 'none', reason: 'no-clock' };
      startH = t.hour; startM = t.minute;
    }
    if (startH < 0 || startH > 23 || startM < 0 || startM > 59) return { kind: 'none', reason: 'no-clock' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    const lastMin = (endH != null ? endH * 60 + endM : startH * 60 + startM);
    if (ahead === 0 && lastMin <= (at.getHours() * 60 + at.getMinutes())) return { kind: 'none', reason: 'already-past' };
    return { kind: 'delivery', visit: visit, dateIso: d.iso, hour: startH, minute: startM, endHour: endH, endMinute: endM, durationMinutes: endH != null ? (endH * 60 + endM) - (startH * 60 + startM) : null, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatDeliveryWindow };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatDeliveryWindow = FlowChatDeliveryWindow;
