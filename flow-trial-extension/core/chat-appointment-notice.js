// An appointment, booking or reservation that a business or a person confirms to the person in a chat: "Your appointment is
// confirmed for Sunday at 10:00", "Reminder: your table is booked Thursday at 8pm", «התור שלך נקבע ליום ראשון בשעה 10:00»,
// «תזכורת: ההזמנה שלך ביום חמישי ב-20:00». The shared judge reads nothing here (no ask, no meeting noun), and an agreed
// meeting needs the person's own "sounds good". This module recognises it structurally: a possessive appointment noun
// (your / שלך / שלכם), a confirming frame, one named day that is today or later, one named clock. It returns the day and
// the clock only; the chat card offers a calendar hold the person approves, nobody is invited. Portable: no chrome.*,
// no DOM, no network.
const FlowChatAppointmentNotice = (() => {
  const NOUN_EN = /\byour\s+(?:[a-z-]+\s+){0,2}(?:appointment|booking|reservation|table|visit|slot|session|consultation|check-?in|delivery\s+slot|class|lesson|fitting|test\s+drive|service|treatment|inspection|check-?up|maintenance|haircut|massage|surgery|therapy)\b|\byou\s+have\s+(?:an?\s+|your\s+)?(?:[a-z-]+\s+){0,2}(?:appointment|booking|reservation|table|visit|session|consultation|class|lesson)\b|\b(?:appointment|booking|reservation)\s+(?:reminder|confirmation|confirmed)\b|\b(?:table|appointment|booking|reservation)\s+(?:is\s+)?(?:confirmed|booked|reserved)\b/i;
  const NOUN_HE = /(?:התור|הזמנתך|ההזמנה|הפגישה|הביקור|השיעור|הסדנה|הטיפול|המשלוח|השולחן|הבדיקה|הטסט|הייעוץ)\s+(?:שלך|שלכם|שלכן)|(?:נקבע|נקבעה|אושר|אושרה|שוריין|שוריינה)\s+(?:לך\s+|לכם\s+)?(?:תור|שולחן|פגישה|טיפול|שיעור|ביקור)|(?:תור|שולחן|טיפול|שיעור|הבדיקה|הטסט|הייעוץ|השולחן|הטיפול)(?:\s+[^\s.,!?]+){0,3}\s+(?:נקבע|נקבעה|נשמר|נשמרה|אושר|אושרה|שוריין|שוריינה)|יש\s+(?:לך|לכם|לכן)\s+(?:תור|פגישה|שיעור|טיפול|הזמנה|שולחן)|תזכורת\s+ל(?:תור|פגישה|שיעור|טיפול|הזמנה)|קבענו\s+(?:לך|לכם|לכן)\s+(?:תור|פגישה|שיעור|טיפול)|(?:שריינו|שרינו)\s+(?:לך|לכם|לכן)\s+(?:שולחן|מקום)|אישור\s+(?:הזמנה|תור|פגישה)/;
  const FRAME_EN = /\b(?:is|are)\s+(?:on\s+)?\d{4}-\d{2}-\d{2}\b|\b(?:is|has\s+been|was|are)\s+(?:now\s+)?(?:confirmed|booked|scheduled|set|reserved|on|for)\b|\b(?:is|are)\s+(?:now\s+)?(?:today|tomorrow|tonight|next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)|this\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|evening|afternoon|morning)|at\s+\d|in\s+\d+\s+days?)\b|\b(?:appointment|booking|reservation|table|visit|slot|session|class|lesson)\s+at\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?\s+on\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d)|\b(?:is|are|takes\s+place|runs|meets)\s+(?:every|each)\s+(?:week\s+on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\bconfirm(?:ed|ing|ation)\b|\breminder\b|\bsee\s+you\b|\bwe(?:'re| are)\s+expecting\b|\byou\s+have\b|\bremind(?:er|ing)\b/i;
  const FRAME_HE = /(?:(?:^|\s)\d{4}-\d{2}-\d{2}\s+ב|(?:^|\s)(?:מחר|היום|הערב|מחרתיים)(?:\s|$)|בעוד\s+\d+\s+ימים|כל\s+(?:יום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|נקבע|נקבעה|נשמר|נשמרה|אושר|אושרה|שוריין|שוריינה|תזכורת|מזכירים|מחכים\s+לך|נתראה|מאשרים|אישור)|ל?יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|יש\s+(?:לך|לכם|לכן)|קבענו|שריינו|שרינו|אישור/;
  // Looking back, cancelling, moving, asking, or a thing that is not an appointment of the person's.
  const NO_EN = /\b(?:deadline|due|expires?|(?:appointment|booking|reservation|visit|session)\s+(?:form|request|history|link|page|portal|policy|details|fee|number)|yesterday|last\s+(?:week|night|time)|was\s+(?:great|nice)|cancel(?:l?ed|l?ation)?|postpone[d]?|resched\w*|unfortunately|unable|can'?t|cannot|sorry|instead|maybe|might|if\s+you|would\s+you\s+like|available\s+slots?|choose|select|pick\s+a|book\s+now|book\s+(?:your|an?)\b|\bslots?\b|click|tap)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|היה\s+(?:נעים|כיף|מצוין)|בוטל|בוטלה|ביטול|לבטל|נדחה|נדחתה|לדחות|לצערנו|מצטערים|מצטער|אולי|במקום|לחץ|בחר|בחרי|לקביעת)/;
  // A booking that was moved ("has been moved to Monday at 11:00", «התור שלך הועבר ליום שני בשעה 11:00») is the same booking at the new
  // day and clock: the words up to the verb stay (they carry the noun), the old day and clock before "to" are dropped.
  const MOVE_EN = /\s+(?:(?:has|have)\s+been\s+|was\s+|is\s+now\s+|got\s+)?(?:moved|rescheduled|changed|postponed|pushed(?:\s+back)?|shifted)(?:\s+over)?(?:\s+from\s+.+?)?\s+(?:to|for)\s+/i;
  const MOVE_HE = /\s+(?:הועבר|הועברה|נדחה|נדחתה|שונה|שונתה|הוזז|הוזזה)\s+(?=ל|אל\s)/;
  const REPEATS_EN = /\b(?:every|each)\s+(?:week\s+on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\bweekly\b/i;
  const REPEATS_HE = /כל\s+(?:יום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|שבועי/;
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

  // One clock text ("14:00", "2pm", "10") to { h, m } in 24 hours, or null. A bare hour under 7 is too ambiguous to take.
  function clockOf(txt, marked) {
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
    } else if (h < 7 && !m[2] && !marked) return null;
    return { h: h, m: min };
  }
  const CLK = '\\d{1,2}(?::\\d{2})?\\s?(?:[ap]\\.?m\\.?)?';
  const RANGE = new RegExp('(?:^|[^\\d:])(' + CLK + ')\\s?(?:-|–|—|to|until|till|עד)\\s?(' + CLK + ')(?![\\d:]|\\s?[ap]\\.?m)', 'i');
  const RANGE_MK = new RegExp('(?:^|[^\\d:])(' + CLK + ')\\s?(?:-|–|—|to|until|till|עד)\\s?(\\d{1,2}(?::\\d{2})?\\s?[ap]\\.?m\\.?)', 'i');
  const BETWEEN = new RegExp('\\bbetween\\s+(' + CLK + ')\\s+and\\s+(' + CLK + ')', 'i');
  const flat = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().replace(BETWEEN, '$1-$2');
  const mk = (x) => { const k = String(x).match(/[ap]\.?m/i); return k ? k[0].toLowerCase().replace('.', '') : ''; };

  // The start of "from 10:00 to 11:30" / "10:00-11:00" when the plain clock reader gave nothing for a range.
  function rangeStart(text) {
    const f = flat(text);
    const m = f.match(RANGE_MK) || f.match(RANGE);
    if (!m) return null;
    let sa = String(m[1]).trim();
    let sb = String(m[2]).trim();
    if (mk(sa) && !mk(sb)) sb = sb + mk(sa);
    if (mk(sb) && !mk(sa)) sa = sa + mk(sb);
    const from = clockOf(sa, Boolean(mk(sa) || mk(sb)));
    const to = clockOf(sb, Boolean(mk(sa) || mk(sb)));
    return from ? { hour: from.h, minute: from.m, endHour: to ? to.h : null, endMinute: to ? to.m : null } : null;
  }

  // How long the appointment lasts, in minutes (5 to 720), when the person was told: an end clock after the start ("10:00-11:30",
  // "from 10:00 to 11:30"), or "for 45 minutes", "for an hour", "for an hour and a half", «למשך שעה», «למשך 45 דקות». Read from the
  // person's own words. null when nothing says so; a range that does not start at the booked clock is not this appointment's length.
  function lengthOf(text, start) {
    const t = flat(text);
    const m = t.match(RANGE_MK) || t.match(RANGE);
    if (m && start) {
      let sa = String(m[1]).trim();
      let sb = String(m[2]).trim();
      if (mk(sa) && !mk(sb)) sb = sb + mk(sa);
      if (mk(sb) && !mk(sa)) sa = sa + mk(sb);
      const marked = Boolean(mk(sa) || mk(sb));
      const from = clockOf(sa, marked);
      const to = clockOf(sb, marked);
      if (from && to && from.h === start.hour && from.m === start.minute) {
        const n = (to.h * 60 + to.m) - (from.h * 60 + from.m);
        if (n >= 5 && n <= 720) return n;
      }
    }
    let d = t.match(/\b(?:for|lasts?|lasting)\s+(?:about\s+|around\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i);
    let n = null;
    if (d) n = Math.round(parseFloat(d[1]) * (/^h/i.test(d[2]) ? 60 : 1));
    else if (/\b(?:for|lasts?|lasting)\s+(?:an?\s+|one\s+)hour\s+and\s+a\s+half\b|\b(?:for|lasts?)\s+1\.5\s*hours?\b/i.test(t)) n = 90;
    else if (/\b(?:for|lasts?|lasting)\s+(?:an?\s+|one\s+)hour\b/i.test(t)) n = 60;
    else if (/\b(?:for|lasts?|lasting)\s+(?:half\s+an?\s+hour|half-hour)\b/i.test(t)) n = 30;
    else if ((d = t.match(/\b(\d{2,3})[- ]minute\s+(?:appointment|session|slot|consultation|lesson|class|treatment|fitting|visit)\b/i))) n = parseInt(d[1], 10);
    else if (/למשך\s+שעה\s+וחצי/.test(t)) n = 90;
    else if (/למשך\s+שעתיים/.test(t)) n = 120;
    else if (/למשך\s+שעה(?![֐-׿])/.test(t)) n = 60;
    else if ((d = t.match(/למשך\s+(\d{1,3})\s+דקות/))) n = parseInt(d[1], 10);
    return n != null && n >= 5 && n <= 720 ? n : null;
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
    if (!(t && Number.isInteger(t.hour) && Number.isInteger(t.minute))) t = rangeStart(text);
    else { const rs = rangeStart(text); if (rs && rs.endHour === t.hour && rs.endMinute === t.minute) t = rs; } // "between 2 and 3pm": the plain reader took the end
    if (!t || !Number.isInteger(t.hour) || !Number.isInteger(t.minute) || t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) return { kind: 'none', reason: 'no-clock' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    // "Your lesson is every Monday at 17:00": the booking repeats. The hold is the next one (a Monday that has already started today rolls to the
    // next week); the Hold It card turns it into the series only when the owner's RECURRING_HOLD switch is on, from the same words.
    const repeats = REPEATS_EN.test(raw) || REPEATS_HE.test(raw);
    let dateIso = d.iso;
    // "every Monday at 17:00", said on a Monday morning: the first one is today (the date reader would skip to next week).
    if (repeats) {
      const wd = weekdayDate(raw, at);
      if (wd && wd.iso === iso(today) && (t.hour * 60 + t.minute) > (at.getHours() * 60 + at.getMinutes())) dateIso = wd.iso;
    }
    if (dateIso === d.iso && ahead === 0 && (t.hour * 60 + t.minute) <= (at.getHours() * 60 + at.getMinutes())) {
      if (!repeats) return { kind: 'none', reason: 'already-past' };
      dateIso = iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 7));
    }
    const len = lengthOf(text, t);
    return Object.assign({ kind: 'appointment', dateIso: dateIso, hour: t.hour, minute: t.minute, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' }, len ? { durationMinutes: len } : {}, repeats ? { repeats: true } : {});
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

  return { recognize: recognize, cancelled: cancelled, lengthOf: lengthOf, rangeStart: rangeStart };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatAppointmentNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatAppointmentNotice = FlowChatAppointmentNotice;
