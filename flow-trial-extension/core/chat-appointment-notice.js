// An appointment, booking or reservation that a business or a person confirms to the person in a chat: "Your appointment is
// confirmed for Sunday at 10:00", "Reminder: your table is booked Thursday at 8pm", «התור שלך נקבע ליום ראשון בשעה 10:00»,
// «תזכורת: ההזמנה שלך ביום חמישי ב-20:00». The shared judge reads nothing here (no ask, no meeting noun), and an agreed
// meeting needs the person's own "sounds good". This module recognises it structurally: a possessive appointment noun
// (your / שלך / שלכם), a confirming frame, one named day that is today or later, one named clock. It returns the day and
// the clock only; the chat card offers a calendar hold the person approves, nobody is invited. Portable: no chrome.*,
// no DOM, no network.
const FlowChatAppointmentNotice = (() => {
  const NOUN_EN = /\byour\s+(?:[a-z-]+\s+){0,2}(?:appointment|booking|reservation|table|visit|slot|session|consultation|check-?in|delivery\s+slot|class|lesson|fitting|test\s+drive)\b|\byou\s+have\s+(?:an?\s+|your\s+)?(?:[a-z-]+\s+){0,2}(?:appointment|booking|reservation|table|visit|session|consultation|class|lesson)\b|\b(?:appointment|booking|reservation)\s+(?:reminder|confirmation|confirmed)\b|\b(?:table|appointment|booking|reservation)\s+(?:is\s+)?(?:confirmed|booked|reserved)\b/i;
  const NOUN_HE = /(?:התור|הזמנתך|ההזמנה|הפגישה|הביקור|השיעור|הסדנה|הטיפול|המשלוח)\s+(?:שלך|שלכם|שלכן)|(?:נקבע|נקבעה|אושר|אושרה|שוריין|שוריינה)\s+(?:לך\s+|לכם\s+)?(?:תור|שולחן|פגישה|טיפול|שיעור|ביקור)|(?:תור|שולחן|טיפול|שיעור)\s+(?:נקבע|נקבעה|אושר|אושרה|שוריין)|יש\s+(?:לך|לכם|לכן)\s+(?:תור|פגישה|שיעור|טיפול|הזמנה|שולחן)|תזכורת\s+ל(?:תור|פגישה|שיעור|טיפול|הזמנה)|קבענו\s+(?:לך|לכם|לכן)\s+(?:תור|פגישה|שיעור|טיפול)|(?:שריינו|שרינו)\s+(?:לך|לכם|לכן)\s+(?:שולחן|מקום)|אישור\s+(?:הזמנה|תור|פגישה)/;
  const FRAME_EN = /\b(?:is|has\s+been|was|are)\s+(?:now\s+)?(?:confirmed|booked|scheduled|set|reserved|on|for)\b|\bconfirm(?:ed|ing|ation)\b|\breminder\b|\bsee\s+you\b|\bwe(?:'re| are)\s+expecting\b|\byou\s+have\b|\bremind(?:er|ing)\b/i;
  const FRAME_HE = /(?:נקבע|נקבעה|אושר|אושרה|שוריין|שוריינה|תזכורת|מזכירים|מחכים\s+לך|נתראה|מאשרים|אישור)|ל?יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|יש\s+(?:לך|לכם|לכן)|קבענו|שריינו|שרינו|אישור/;
  // Looking back, cancelling, moving, asking, or a thing that is not an appointment of the person's.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|was\s+(?:great|nice)|cancel(?:l?ed|l?ation)?|postpone[d]?|resched\w*|unfortunately|unable|can'?t|cannot|sorry|instead|maybe|might|if\s+you|would\s+you\s+like|available\s+slots?|choose|select|pick\s+a|book\s+now|book\s+(?:your|an?)\b|\bslots?\b|click|tap)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|היה\s+(?:נעים|כיף|מצוין)|בוטל|בוטלה|ביטול|לבטל|נדחה|נדחתה|לדחות|לצערנו|מצטערים|מצטער|אולי|במקום|לחץ|בחר|בחרי|לקביעת)/;
  // A booking that was moved ("has been moved to Monday at 11:00", «התור שלך הועבר ליום שני בשעה 11:00») is the same booking at the new
  // day and clock: the words up to the verb stay (they carry the noun), the old day and clock before "to" are dropped.
  const MOVE_EN = /\s+(?:(?:has|have)\s+been\s+|was\s+|is\s+now\s+|got\s+)?(?:moved|rescheduled|changed|postponed|pushed(?:\s+back)?|shifted)(?:\s+over)?(?:\s+from\s+.+?)?\s+(?:to|for)\s+/i;
  const MOVE_HE = /\s+(?:הועבר|הועברה|נדחה|נדחתה|שונה|שונתה|הוזז|הוזזה)\s+(?=ל|אל\s)/;
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
  function movedTo(raw) {
    let m = raw.match(MOVE_EN);
    if (m) return raw.slice(0, m.index) + ' is on ' + raw.slice(m.index + m[0].length);
    m = raw.match(MOVE_HE);
    return m ? raw.slice(0, m.index) + ' נקבע ' + raw.slice(m.index + m[0].length) : raw;
  }

  function recognize(text, now) {
    const raw = movedTo(String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim());
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 260) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'cancels-or-offers' };
    if (!NOUN_EN.test(raw) && !NOUN_HE.test(raw)) return { kind: 'none', reason: 'no-appointment-noun' };
    if (!FRAME_EN.test(raw) && !FRAME_HE.test(raw)) return { kind: 'none', reason: 'no-confirming-frame' };
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
    return { kind: 'appointment', dateIso: d.iso, hour: t.hour, minute: t.minute, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  // A booking the business cancelled ("Your appointment on Sunday at 10:00 was cancelled", «התור שלך ביום ראשון ב-10:00 בוטל»): the day and
  // the clock of what is gone, so the chat card can offer to remove the hold Glance made for it. Only a plain, past-tense cancellation of
  // a possessive booking with one day and one clock; a move, a policy line, an offer to cancel and a question stay quiet.
  const CANCELLED_EN = /\b(?:(?:has|have)\s+been|was|were|is\s+now|got)\s+cancel(?:l?ed)\b|\bcancel(?:l?ed)\s+(?:your|the)\b/i;
  const CANCELLED_HE = /(?:בוטל|בוטלה|מבוטל|מבוטלת)/;
  const NOT_PLAIN_EN = /\b(?:resched\w*|moved|postpone[d]?|instead|new\s+(?:time|date)|to\s+cancel|if\s+you\s+(?:need|want|wish)|you\s+can|cancel(?:l?ation)?\s+(?:policy|fee)|click|tap|reply|book\s+(?:again|a\s+new)|rebook|would\s+you\s+like)\b/i;
  const NOT_PLAIN_HE = /(?:נדחה|נדחתה|הועבר|הועברה|שונה|במקום|מועד\s+חדש|ניתן\s+לבטל|אפשר\s+לבטל|לחץ|השב|לקביעת\s+תור\s+חדש|בחר)/;

  function cancelled(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 260) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (!CANCELLED_EN.test(raw) && !CANCELLED_HE.test(raw)) return { kind: 'none', reason: 'not-cancelled' };
    if (NOT_PLAIN_EN.test(raw) || NOT_PLAIN_HE.test(raw)) return { kind: 'none', reason: 'not-a-plain-cancellation' };
    if (!NOUN_EN.test(raw) && !NOUN_HE.test(raw)) return { kind: 'none', reason: 'no-appointment-noun' };
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

if (typeof module !== 'undefined') module.exports = { FlowChatAppointmentNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatAppointmentNotice = FlowChatAppointmentNotice;
