// A trip the person is told about in a chat or a mail: "Your flight LY001 departs Sunday at 06:30", "Your train leaves tomorrow at
// 08:15", «הטיסה שלך ממריאה ביום ראשון ב-06:30», «הרכבת שלך יוצאת מחר ב-08:15». A possessive travel noun (your / שלך), a departure or
// confirmation frame, one named day that is today or later, one named clock. A cancelled, delayed or changed trip, a promotion and a
// question stay quiet. It returns the day and the clock only; the card offers a calendar hold titled Trip, nobody is invited.
// Portable: no chrome.*, no DOM, no network.
const FlowChatTravelNotice = (() => {
  const NOUN_EN = /\byour\s+(?:[a-z-]+\s+){0,2}(?:flight|train|bus|ferry|trip|ride|cab|taxi|shuttle|transfer|cruise|coach)\b|\b(?:boarding|check-?in)\s+(?:for|to)\s+your\b/i;
  const NOUN_HE = /(?:הטיסה|הרכבת|האוטובוס|המעבורת|הנסיעה|ההסעה|המונית|ההעברה|הנסיעה)\s+(?:שלך|שלכם|שלכן)|(?:טיסתך|נסיעתך)|(?:העלייה\s+למטוס|הצ'ק[- ]?אין)\s+(?:שלך|שלכם)/;
  const FRAME_EN = /\b(?:depart(?:s|ing|ure)?|leav(?:es|ing)|boarding|pick-?up|picks?\s+you|confirmed|booked|scheduled|set\s+for|takes\s+off)\b/i;
  const FRAME_HE = /(?:ממריא(?:ה)?|יוצא(?:ת)?|עולים|איסוף|אושר(?:ה)?|נקבע(?:ה)?|הוזמנ(?:ה)?|מתחיל(?:ה)?|העלייה)/;
  // Looking back, cancelling, moving, asking, or a thing that is not an appointment of the person's.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|was\s+(?:great|nice)|cancel(?:l?ed|l?ation)?|postpone[d]?|resched\w*|delay(?:ed|s)?|changed|unfortunately|unable|can'?t|cannot|sorry|instead|maybe|might|if\s+you|would\s+you\s+like|deals?|offers?|sale|discount|promo\w*|from\s+only|book\s+now|book\s+(?:your|a)\b|click|tap|choose|select|departed|landed|arrived)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|בוטל|בוטלה|ביטול|לבטל|נדחה|נדחתה|לדחות|עיכוב|עוכב|שונה|השתנה|לצערנו|מצטערים|מצטער|אולי|במקום|מבצע|הנחה|מבצעים|הזמינו\s+עכשיו|לחץ|בחר|בחרי|המריאה|נחתה)/;
  // A trip told as changed ("Your flight has been delayed, it now departs Sunday at 07:15", «הטיסה שלך נדחתה, היא תמריא ביום ראשון ב-07:15»)
  // is the same trip at its new day and clock: only a change verb that is followed by a new-time marker counts, the words before the verb
  // stay (they carry the noun), the old time and the verb are dropped. A change with no new time stays quiet.
  const CHANGE_EN = /\s*,?\s*(?:(?:has|have)\s+been\s+|was\s+|is\s+)?(?:delayed|rescheduled|postponed|moved|retimed|changed|brought\s+forward)\b/i;
  const NEWTIME_EN = /\b(?:now\s+(?:departs?|leaves?|takes\s+off|boards?)|will\s+now\s+(?:depart|leave|take\s+off)|(?:to|will)\s+(?:depart|leave)|(?:moved|rescheduled|postponed|changed|delayed)\s+(?:to|until)|new\s+(?:departure\s+)?time\s+(?:is|:))\s*(?:on|at|for)?\s+/i;
  const CHANGE_HE = /\s*,?\s*(?:נדחתה|נדחה|עוכבה|עוכב|התעכבה|התעכב|הוקדמה|הוקדם|הועברה|הועבר|שונתה|שונה)\s*,?\s*/;
  const NEWTIME_HE = /(?:היא|הוא|ה)?\s*(?:תמריא|ממריאה|ממריא|תצא|יוצאת|יוצא)\s+/;
  function changedTo(raw) {
    let m = raw.match(CHANGE_EN);
    if (m) {
      const tail = raw.slice(m.index + m[0].length);
      const n = tail.match(NEWTIME_EN);
      if (n) return raw.slice(0, m.index) + ' departs ' + tail.slice(n.index + n[0].length);
      return raw;
    }
    m = raw.match(CHANGE_HE);
    if (m) {
      const tail = raw.slice(m.index + m[0].length);
      const n = tail.match(NEWTIME_HE);
      if (n) return raw.slice(0, m.index) + ' ממריאה ' + tail.slice(n.index + n[0].length);
    }
    return raw;
  }
  const QUESTION = /[?؟]/;
  const MAX_AHEAD_DAYS = 90;
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

  function englishClock(text) {
    const m = String(text || '').match(/(?:^|[^\d:])(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = /^p/i.test(m[3]);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { hour: h, minute: min };
  }

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
      if (/\b(?:today|tonight)\b|(?:^|[^֐-׿])היום(?![֐-׿])|הערב/i.test(t)) return { iso: iso(at) };
      return null;
    }
    return { iso: iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + (idx - at.getDay() + 7) % 7)) };
  }

  // { kind: 'appointment', dateIso, hour, minute, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = changedTo(String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim());
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 260) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'cancels-or-offers' };
    if (!NOUN_EN.test(raw) && !NOUN_HE.test(raw)) return { kind: 'none', reason: 'no-travel-noun' };
    if (!FRAME_EN.test(raw) && !FRAME_HE.test(raw)) return { kind: 'none', reason: 'no-departure-frame' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function' || typeof X.parseTime !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    let t = X.parseTime(raw);
    if (!(t && Number.isInteger(t.hour) && Number.isInteger(t.minute))) t = englishClock(raw);
    if (!t || !Number.isInteger(t.hour) || !Number.isInteger(t.minute) || t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) return { kind: 'none', reason: 'no-clock' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    if (ahead === 0 && (t.hour * 60 + t.minute) <= (at.getHours() * 60 + at.getMinutes())) return { kind: 'none', reason: 'already-past' };
    return { kind: 'trip', dateIso: d.iso, hour: t.hour, minute: t.minute, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  // A trip that was cancelled ("Your flight LY001 departing Sunday at 06:30 was cancelled", «הטיסה שלך ביום ראשון ב-06:30 בוטלה»): the day and the clock of what is gone, so the chat card can offer to
  // remove the hold Glance made from the same chat for exactly that day and clock (the hold is the proof it is the person's). Only a
  // plain, past-tense cancellation with one day and one clock; a move, a rebook link, an offer to cancel, a policy line and a question stay quiet.
  const CANCELLED_EN = /\b(?:(?:has|have)\s+been|was|were|is\s+now|got)\s+cancel(?:l?ed)\b|\bcancel(?:l?ed)\s+(?:your|the)\b/i;
  const CANCELLED_HE = /(?:בוטל|בוטלה|מבוטל|מבוטלת)/;
  const NOT_PLAIN_EN = /\b(?:resched\w*|moved|postpone[d]?|delay\w*|instead|new\s+(?:time|date)|to\s+cancel|if\s+you\s+(?:need|want|wish)|you\s+can|cancel(?:l?ation)?\s+(?:policy|fee)|click|tap|reply|book\s+(?:again|a\s+new)|rebook|would\s+you\s+like)\b/i;
  const NOT_PLAIN_HE = /(?:נדחה|נדחתה|הועבר|הועברה|שונה|עוכב|במקום|מועד\s+חדש|ניתן\s+לבטל|אפשר\s+לבטל|לחץ|השב|בחר)/;
  const ANY_EN = /\b(?:flight|train|bus|ferry|trip|ride|cab|taxi|shuttle|transfer|cruise|coach)\b/i;
  const ANY_HE = /(?:הטיסה|הרכבת|האוטובוס|המעבורת|הנסיעה|ההסעה|המונית|ההעברה|טיסתך|נסיעתך)/;

  function cancelled(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 260) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (!CANCELLED_EN.test(raw) && !CANCELLED_HE.test(raw)) return { kind: 'none', reason: 'not-cancelled' };
    if (NOT_PLAIN_EN.test(raw) || NOT_PLAIN_HE.test(raw)) return { kind: 'none', reason: 'not-a-plain-cancellation' };
    if (!ANY_EN.test(raw) && !ANY_HE.test(raw)) return { kind: 'none', reason: 'no-travel-noun' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function' || typeof X.parseTime !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    let t = X.parseTime(raw);
    if (!(t && Number.isInteger(t.hour) && Number.isInteger(t.minute))) t = englishClock(raw);
    if (!t || !Number.isInteger(t.hour) || !Number.isInteger(t.minute) || t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) return { kind: 'none', reason: 'no-clock' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    return { kind: 'cancelled', dateIso: d.iso, hour: t.hour, minute: t.minute, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize, cancelled: cancelled };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatTravelNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatTravelNotice = FlowChatTravelNotice;
