// "Please call me back tomorrow", "Can you give me a call Thursday?", «תתקשר אליי מחר», «תחזור אליי ביום שלישי»: someone
// asks the person to call them on a named day. The shared judge reads it as nothing (no file, no meeting). This module
// recognises it structurally: a call-me phrase aimed at the sender, one named day that is today or later, nothing that
// refuses, hedges, looks back or points at a third person. It returns the day only; the chat card offers a task titled with
// the call and the sender's name that the person approves. It never calls anyone. Portable: no chrome.*, no DOM, no network.
const FlowChatCallbackAsk = (() => {
  const CALL_EN = /\b(?:call|ring|phone|give)\s+(?:me|us)(?:\s+(?:back|a\s+(?:call|ring)|a\s+buzz))?\b|\bcall\s+(?:me|us)\s+back\b|\bgive\s+(?:me|us)\s+a\s+(?:call|ring|buzz)\b/i;
  const CALL_HE = /(?:תתקשר|תתקשרי|תתקשרו|תצלצל|תצלצלי|תצלצלו|תחזור|תחזרי|תחזרו)\s+(?:אליי|אלי|אלינו|אלנו)|(?:תתקשר|תתקשרי|תתקשרו|תצלצל|תצלצלי)\s+(?:אליי|אלי)/;
  const NO_EN = /\b(?:don'?t|do\s+not|no\s+need|never\s*mind|yesterday|last\s+(?:week|night)|maybe|might|if\s+you\s+(?:want|can|like)|cancel(?:l?ed)?|i'?ll|i\s+will|(?:he|she|they)\s+(?:will|should|can))\b/i;
  const NO_HE = /(?:אל\s+תתקשר|אל\s+תצלצל|אין\s+צורך|לא\s+צריך|אתמול|שבוע שעבר|אולי|אם\s+(?:בא|תוכל|אפשר)|לבטל|בוטל|אני\s+אתקשר)/;
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
      const he = t.match(/(?:ביום|ב-?יום|ליום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
      if (he) idx = DAYS_HE.indexOf(he[1]);
    }
    if (idx < 0) {
      if (/\b(?:today|tonight)\b|(?:^|[^֐-׿])היום(?![֐-׿])|הערב/i.test(t)) return { iso: iso(at) };
      return null;
    }
    return { iso: iso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + (idx - at.getDay() + 7) % 7)) };
  }

  // { kind: 'ask', dateIso, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 160) return { kind: 'none', reason: 'long' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-an-ask' };
    if (!CALL_EN.test(raw) && !CALL_HE.test(raw)) return { kind: 'none', reason: 'no-call-phrase' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    return { kind: 'ask', dateIso: d.iso, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatCallbackAsk };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatCallbackAsk = FlowChatCallbackAsk;
