// A reminder someone asks of the person in a chat: "Don't forget to bring the signed form on Monday", "Remember to pay the
// deposit by Friday", «אל תשכח להביא את הטופס החתום ביום שני», «תזכור לשלוח את החשבונית עד מחר». The shared judge needs a
// request verb or a question and leaves these quiet. This module recognises them structurally: a reminder cue, one thing to
// do, one named day that is today or later. It returns the day and the thing only. It never writes; the caller offers a
// task the person approves. Portable: no chrome.*, no DOM, no network.
const FlowChatReminder = (() => {
  const CUE_EN = /\b(?:(?:please\s+)?(?:don'?t|do\s+not|dont)\s+forget\s+to|(?:please\s+)?remember\s+to|make\s+sure\s+you(?:\s+remember\s+to)?|(?:just\s+)?a\s+reminder\s+to|reminder\s*[:\-]\s*(?:to\s+)?)\s+/i;
  const CUE_HE = /(?:^|[\s,.])(?:אל\s+(?:תשכח(?:י|ו)?)|שלא\s+תשכח(?:י|ו)?|תזכור|תזכרי|תזכרו|זכור|זכרי|אל\s+תשכחו)\s+/;
  // Not a reminder to act: a look back, a refusal, a hedge, a thing already done, a thing for someone else.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|forgot|already|never\s*mind|forget\s+it|i'?ll|i\s+will|maybe|might|if\s+you\s+want|cancel(?:l?ed)?)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|שכחתי|כבר\s|עזוב|תעזוב|לא\s+משנה|אני\s+אעשה|אולי|בוטל|לבטל)/;
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

  // A bare weekday or today, the next such day, today included.
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
    const ahead = (idx - at.getDay() + 7) % 7;
    return { iso: iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + ahead)) };
  }

  // The thing to do: what follows the cue, up to the day words, trimmed.
  function whatOf(raw, cueEnd) {
    let w = raw.slice(cueEnd);
    w = w.replace(/\s*(?:\b(?:on|by|before|until|this|next|tomorrow|today|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|(?:ביום|עד|לפני|מחר|היום|הערב|בשבוע)(?![֐-׿])).*$/i, '');
    w = w.replace(/[\s.,!;:]+$/g, '').replace(/^[\s.,]+/, '').trim();
    return w.length > 80 ? w.slice(0, 80).replace(/\s+\S*$/, '') : w;
  }

  // { kind: 'reminder', dateIso, what } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 240) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-a-reminder' };
    const m = raw.match(CUE_EN) || raw.match(CUE_HE);
    if (!m) return { kind: 'none', reason: 'no-cue' };
    // A bare "Reminder:" in front of a request ("Reminder: please send it by Monday") is a deadline ask, and in front of a look back
    // ("Reminder: the form was due Monday") is nothing to do: neither is a reminder to act.
    if (/^reminder\s*[:\-]/i.test(m[0].trim()) && (/^\s*please\b/i.test(raw.slice(m.index + m[0].length)) || /\b(?:was|were|had|has\s+been|have\s+been)\b/i.test(raw))) return { kind: 'none', reason: 'not-a-reminder' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    const what = whatOf(raw, m.index + m[0].length);
    if (what.length < 3) return { kind: 'none', reason: 'no-thing' };
    return { kind: 'reminder', dateIso: d.iso, what: what, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatReminder };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatReminder = FlowChatReminder;
