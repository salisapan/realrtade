// A reminder the person writes to themselves in a chat: "Remind me tomorrow to pay the electricity bill", "Note to self:
// renew the passport by Thursday", «תזכיר לי מחר לשלם חשבון חשמל», «לעצמי: לחדש דרכון עד יום חמישי». The cue is explicit (remind
// me / note to self / לעצמי / תזכיר לי / תזכורת), the thing is named, and one day is today or later. It is only for a message
// the person typed; an inbound "can you remind me" is somebody else's ask and is not read here. It returns the thing and the
// day only; the chat card offers a task titled with the thing, nothing is sent. Portable: no chrome.*, no DOM, no network.
const FlowChatSelfNote = (() => {
  const CUE_EN = /^(?:please\s+)?(?:remind\s+me(?:\s+(?:on|by|before|this|next|tomorrow|today|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?[^.!?]{0,30}?\bto\b|note\s+to\s+self\s*[:\-,]?|reminder\s*[:\-]|to-?do\s*[:\-])\s*/i;
  const CUE_HE = /^(?:(?:תזכיר|תזכירי)\s+לי(?:\s+(?:ב|ל|עד|מחר|היום|הערב|ביום)\S*)?[^.!?]{0,30}?\s(?=ל)|לעצמי\s*[:\-,]?\s*|תזכורת\s*[:\-]\s*|תזכורת\s+לעצמי\s*[:\-]?\s*)/;
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night)|already|never\s*mind|maybe|might|cancel(?:l?ed)?|don'?t)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|כבר\s|עזוב|אולי|בוטל|לבטל|אל\s+תזכיר)/;
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

  // The thing: after the cue, without the day words.
  function whatOf(rest) {
    let w = rest.replace(/\s*(?:\b(?:on|by|before|until|this|next|tomorrow|today|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|(?:ביום|עד|לפני|מחר|היום|הערב)(?![֐-׿])).*$/i, '');
    w = w.replace(/^\s*(?:to\s+)/i, '').replace(/[\s.,!;:]+$/g, '').trim();
    return w.length > 80 ? w.slice(0, 80).replace(/\s+\S*$/, '') : w;
  }

  // { kind: 'note', dateIso, what, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 200) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-a-note' };
    const cue = raw.match(CUE_EN) || raw.match(CUE_HE);
    if (!cue) return { kind: 'none', reason: 'no-cue' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const d = X.parseDate(raw, at) || weekdayDate(raw, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    const what = whatOf(raw.slice(cue[0].length));
    if (what.length < 3) return { kind: 'none', reason: 'no-thing' };
    return { kind: 'note', dateIso: d.iso, what: what.charAt(0).toUpperCase() + what.slice(1), lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatSelfNote };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatSelfNote = FlowChatSelfNote;
