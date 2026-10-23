// An invitation to an event that someone sends the person in a chat: "You're invited to my birthday on Saturday at 8pm",
// "Join us for the opening on Thursday at 19:00", «מוזמן ליום ההולדת שלי ביום שישי ב-20:00», «מזמינים אתכם לחתונה ביום חמישי
// בשעה 19:30». It is not a meeting proposal (no question to answer) and not an agreement. This module recognises it
// structurally: an invitation frame addressed to the person, one named day that is today or later, one named clock, and
// nothing that cancels or looks back. It returns the day and the clock only; the chat card offers a calendar hold the person
// approves, and accepting or declining stays theirs. Portable: no chrome.*, no DOM, no network.
const FlowChatInvitationNotice = (() => {
  const FRAME_EN = /\b(?:you(?:'re|\s+are)\s+(?:cordially\s+)?invited|(?:we|i)\s*(?:'d|\s+would)?\s*(?:love|like)\s+(?:to\s+invite|you\s+to\s+(?:join|come))|(?:we|i)(?:'re|\s+am|\s+are)?\s*inviting\s+you|invit(?:e|ing)\s+you\s+to|join\s+(?:us|me)\s+(?:for|at|on)|come\s+(?:celebrate|join)\s+(?:with\s+)?(?:us|me)|save\s+the\s+date|hope\s+you\s+can\s+(?:join|come))\b/i;
  const FRAME_HE = /(?:מוזמן(?:ת|ים|ות)?\s+(?:ל|ל-)|מזמינ(?:ה|ים|ות)?\s+(?:אותך|אתכם|אתכן|אותכם)|מזמין\s+אותך|הזמנה\s+ל|נשמח\s+(?:לראות|שתצטרפו|שתבואו|שתגיע|שתצטרף)|הצטרפו\s+אלינו|בואו\s+לחגוג|שמרו\s+את\s+התאריך)/;
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|was\s+(?:great|amazing|nice)|thank(?:s|\s+you)\s+for|cancel(?:l?ed)?|postpone[d]?|resched\w*|unfortunately|sorry|maybe|might|webinar|sale|discount|offer|subscribe|unsubscribe|click\s+here|register\s+now|rsvp\s+by)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|היה\s+(?:נהדר|כיף|מדהים)|תודה\s+על|בוטל|בוטלה|נדחה|לצערנו|מצטער|מצטערים|אולי|וובינר|מבצע|הנחה|הרשמה|לחץ\s+כאן|הירשמו)/;
  const QUESTION = /[?؟]/;
  const MAX_AHEAD_DAYS = 120;
  const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function extractApi() {
    if (typeof FlowExtract !== 'undefined') return FlowExtract;
    try { return typeof require !== 'undefined' ? require('./extract.js').FlowExtract : null; } catch (e) { return null; }
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

  // { kind: 'invitation', dateIso, hour, minute, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 280) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'cancels-or-promotion' };
    if (!FRAME_EN.test(raw) && !FRAME_HE.test(raw)) return { kind: 'none', reason: 'no-invitation' };
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
    return { kind: 'invitation', dateIso: d.iso, hour: t.hour, minute: t.minute, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatInvitationNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatInvitationNotice = FlowChatInvitationNotice;
