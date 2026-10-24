// A pickup with a last day that a shop, courier or clinic tells the person in a chat: "Your order is ready for pickup until
// Friday", "Your parcel is waiting at the post office, collect it by Tuesday", «ההזמנה שלך מוכנה לאיסוף עד יום חמישי»,
// «החבילה שלך ממתינה בדואר, לאיסוף עד יום שלישי». The shared judge reads no ask here. This module recognises it
// structurally: a possessive item noun (your / שלך), a ready-or-waiting frame with a pickup word, a deadline marker and one
// named day that is today or later. It returns the day only; the chat card offers a task "Pick up the order · name" the
// person approves. A delivery that simply arrives on a day is not a pickup and stays quiet. Portable: no chrome.*, no DOM,
// no network.
const FlowChatPickupNotice = (() => {
  const NOUN_EN = /\byour\s+(?:[a-z-]+\s+){0,2}(?:order|parcel|package|delivery|item|items|prescription|glasses|laundry|documents?|passport|id|car|repair)\b/i;
  const NOUN_HE = /(?:ההזמנה|החבילה|המשלוח|הפריט|המרשם|הכביסה|המסמכים|הדרכון|הרכב|התיקון|הטלפון|המשקפיים)\s+(?:שלך|שלכם|שלכן)|(?:הזמנתך|חבילתך)/;
  const PICKUP_EN = /\b(?:ready\s+(?:for|to)\s+(?:pick\s?-?up|collect(?:ion)?|be\s+collected|be\s+picked\s+up)|(?:is|are)\s+(?:waiting|available|ready)\s+(?:for\s+(?:pick\s?-?up|collection)|at\s+(?:the|our)\b)|(?:pick|collect)\s+(?:it|them)?\s*up|collect(?:ion)?\s+(?:it|them)?|for\s+(?:pick\s?-?up|collection))\b/i;
  const PICKUP_HE = /(?:מוכנ(?:ה|ים)\s+לאיסוף|לאיסוף|ממתינ(?:ה|ים)\s+(?:לך|לכם|בדואר|בסניף|בנקודת)|לאסוף|ניתן\s+לאסוף|אפשר\s+לאסוף)/;
  const MARK = /(?:\b(?:until|by|before|till|through|no\s+later\s+than)\b|(?:^|[\s,])(?:עד|לפני)(?=\s))/i;
  // A look back, a cancellation, a question, an offer, or a delivery that arrives by itself.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night)|(?:was|were|has\s+been|have\s+been|been)\s+(?:picked\s+up|collected|delivered)|already\s+(?:picked|collected)|cancel(?:l?ed)?|returned|unfortunately|sorry|would\s+you\s+like|choose|select|click|tap|will\s+(?:arrive|be\s+delivered|reach)|out\s+for\s+delivery|arriv(?:es|ing)|expected)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|נאסף|נמסר|נמסרה|בוטל|בוטלה|לצערנו|מצטערים|לחץ|בחר|בחרי|תגיע|יגיע|מגיע|בדרך\s+אליך|צפוי)/;
  const QUESTION = /[?؟]/;
  const MAX_AHEAD_DAYS = 60;
  const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

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
      const he = t.match(/(?:ביום|ב-?יום|ליום|עד\s+יום|לפני\s+יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
      if (he) idx = DAYS_HE.indexOf(he[1]);
    }
    if (idx < 0) {
      if (/\b(?:today|tonight)\b|(?:^|[^֐-׿])היום(?![֐-׿])|הערב/i.test(t)) return { iso: iso(at) };
      return null;
    }
    return { iso: iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + (idx - at.getDay() + 7) % 7)) };
  }

  // { kind: 'pickup', dateIso, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 240) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-a-pickup' };
    if (!NOUN_EN.test(raw) && !NOUN_HE.test(raw)) return { kind: 'none', reason: 'no-item-noun' };
    if (!PICKUP_EN.test(raw) && !PICKUP_HE.test(raw)) return { kind: 'none', reason: 'no-pickup-word' };
    if (!MARK.test(raw)) return { kind: 'none', reason: 'no-deadline-marker' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const after = raw.slice(raw.search(MARK));
    const d = X.parseDate(after, at) || weekdayDate(after, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    return { kind: 'pickup', dateIso: d.iso, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatPickupNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatPickupNotice = FlowChatPickupNotice;
