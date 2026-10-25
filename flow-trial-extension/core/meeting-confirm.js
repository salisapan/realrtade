// A meeting that was just agreed in a short message: "מעולה, נתראה ביום חמישי ב-15:00", "סגור, מחר ב-10:00 אצלך",
// "Sounds good, see you Thursday at 3pm", "Confirmed, tomorrow at 10:00". The shared judge reads a proposal ("Could we meet
// Thursday at 3pm?") as a calendar hold; an agreement has no question and no meeting noun, so it was missed. This module
// recognises it structurally: an agreement cue, one named day that is today or later, one named clock, nothing that
// cancels, moves or looks back. It returns the day and clock only. It never writes; the caller offers a hold the person
// approves. Portable: no chrome.*, no DOM, no network.
const FlowMeetingConfirm = (() => {
  const CUE_EN = /\b(?:see you|sounds good|works for me|that works|confirmed?|it'?s a date|locked in|i'?ll be there|i can make it|let'?s do it|deal)\b/i;
  const CUE_HE = /(?:נתראה|נתפגש|ניפגש|סגור|סגרנו|מעולה|מאשר(?:ת)?|מתאים(?:\s+לי)?|קבענו|נקבע(?:\s+ל|\s+אז)?|אני אהיה שם|אגיע|בטח|סבבה|אחלה)/;
  // Looking back, cancelling, moving, or not being able to: never an agreement to hold.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|was\s+(?:great|nice)|cancel(?:l?ed|l?ing)?|postpone[d]?|resched\w*|can'?t|cannot|won'?t|unable|not\s+(?:able|available|going)|sorry|instead|maybe|might)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|היה\s+(?:נעים|כיף|מצוין)|הייתה|בוטל|לבטל|מבטל|נדחה|לדחות|לא\s+(?:אוכל|נוכל|יכול|יכולה|מתאים|אגיע)|מצטער|מצטערת|אולי|במקום)/;
  const QUESTION = /[?؟]|(?:^|\s)(?:האם|מתי|איפה|באיזה)(?:\s|$)/;
  const MAX_AHEAD_DAYS = 60;

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

  // "3pm", "3:30 pm" after a day word, which parseTime only takes after "at".
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

  const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  // A bare weekday ("Thursday 3pm", "ביום חמישי") the date reader did not take: the next such day, today included.
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
      if (/\b(?:today|tonight)\b|(?:^|[^\u0590-\u05FF])היום(?![\u0590-\u05FF])|הערב/i.test(t)) return { iso: at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()) };
      return null;
    }
    const ahead = (idx - at.getDay() + 7) % 7;
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() + ahead);
    return { iso: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  }

  // Resolves to { kind: 'confirmed', dateIso, hour, minute } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 240) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'cancels-or-looks-back' };
    if (!CUE_EN.test(raw) && !CUE_HE.test(raw)) return { kind: 'none', reason: 'no-agreement' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function' || typeof X.parseTime !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    let t = X.parseTime(raw);
    const hasClock = t && Number.isInteger(t.hour) && Number.isInteger(t.minute);
    if (!hasClock) t = englishClock(raw);
    if (!t || !Number.isInteger(t.hour) || !Number.isInteger(t.minute)) return { kind: 'none', reason: 'no-clock' };
    if (t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) return { kind: 'none', reason: 'bad-clock' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const day = new Date(d.iso + 'T00:00:00');
    const ahead = Math.round((day - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    if (ahead === 0 && (t.hour * 60 + t.minute) <= (at.getHours() * 60 + at.getMinutes())) return { kind: 'none', reason: 'already-past' };
    return { kind: 'confirmed', dateIso: d.iso, hour: t.hour, minute: t.minute, when: d.iso + ' ' + pad(t.hour) + ':' + pad(t.minute) };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowMeetingConfirm };
else if (typeof globalThis !== 'undefined') globalThis.FlowMeetingConfirm = FlowMeetingConfirm;
