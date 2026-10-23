// A task with a deadline asked of the person in a chat without a question: "Need the report by Friday", "I need the signed
// contract by end of day tomorrow", «תחתום על החוזה עד יום שישי», «אני צריך את המצגת עד מחר». The shared judge needs a
// question or a polite verb and leaves these quiet. This module recognises them structurally: a need cue or a work verb in
// the imperative, one thing, and a deadline marker (by, before, until, עד, לפני) followed by one named day that is today
// or later. It returns the thing and the day only; the chat card offers a task the person approves. Portable: no chrome.*,
// no DOM, no network.
const FlowChatDeadlineAsk = (() => {
  const NEED_EN = /^(?:(?:hey|hi|hello)[\s,]+\S+[\s,]+)?(?:(?:we|i)\s+)?(?:need|needs|require|want)\s+(?:the\s+|your\s+|a\s+|an\s+)?/i;
  const VERB_EN = /^(?:please\s+)?(?:send|sign|submit|pay|review|approve|finish|complete|prepare|update|upload|book|confirm|return|fill|share|deliver|post|file|renew)\s+/i;
  const NEED_HE = /^(?:(?:אני|אנחנו)\s+)?(?:צריך|צריכה|צריכים|צריכות|רוצה|רוצים)\s+(?:לקבל\s+)?(?:את\s+|ש)?/;
  const VERB_HE = /^(?:בבקשה\s+)?(?:תשלח|תשלחי|תשלחו|תעביר|תעבירי|תעבירו|תחתום|תחתמי|תחתמו|תאשר|תאשרי|תאשרו|תכין|תכיני|תכינו|תסדר|תסדרי|תעדכן|תעדכני|תשלם|תשלמי|תחזיר|תחזירי|תמלא|תמלאי|תגיש|תגישי|תסיים|תסיימי|תעלה|תעלי|תזמין|תזמיני|תחדש|תחדשי)\s+/;
  const MARK = /(?:\b(?:by|before|until|no\s+later\s+than)\b|(?:^|[\s,])(?:עד|לפני)(?=\s))/i;
  // Not an ask of the person: a look back, a hedge, a refusal, a thing already done, a thing for someone else, a question.
  const NO_EN = /\b(?:yesterday|last\s+(?:week|night)|already|never\s*mind|maybe|might|if\s+you\s+want|cancel(?:l?ed)?|i'?ll|i\s+will|(?:he|she|they)\s+need)\b/i;
  const NO_HE = /(?:אתמול|שבוע שעבר|כבר\s|עזוב|לא\s+משנה|אולי|בוטל|לבטל|הוא\s+צריך|היא\s+צריכה|הם\s+צריכים)/;
  const QUESTION = /[?؟]/;
  const MAX_AHEAD_DAYS = 60;
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

  // The thing: after the cue, before the deadline marker.
  function whatOf(rest) {
    const m = rest.match(MARK);
    let w = m ? rest.slice(0, m.index) : rest;
    w = w.replace(/(?:end\s+of\s+(?:the\s+)?(?:day|week))\s*$/i, '').replace(/[\s.,!;:]+$/g, '').trim();
    return w.length > 80 ? w.slice(0, 80).replace(/\s+\S*$/, '') : w;
  }

  // { kind: 'ask', dateIso, what } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 200) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-an-ask' };
    const cue = raw.match(NEED_EN) || raw.match(VERB_EN) || raw.match(NEED_HE) || raw.match(VERB_HE);
    if (!cue) return { kind: 'none', reason: 'no-cue' };
    const rest = raw.slice(cue[0].length);
    if (!MARK.test(rest)) return { kind: 'none', reason: 'no-deadline-marker' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const after = rest.slice(rest.search(MARK));
    const d = X.parseDate(after, at) || weekdayDate(after, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    const verb = VERB_EN.test(raw) || VERB_HE.test(raw);
    const thing = whatOf(rest);
    if (thing.length < 3) return { kind: 'none', reason: 'no-thing' };
    // A verb ask keeps its verb ("sign the contract"); a need ask is the thing itself ("the report").
    const what = verb ? raw.slice(0, raw.length - rest.length + thing.length).replace(/^please\s+|^בבקשה\s+/i, '') : thing;
    return { kind: 'ask', dateIso: d.iso, what: what.charAt(0).toUpperCase() + what.slice(1), lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatDeadlineAsk };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatDeadlineAsk = FlowChatDeadlineAsk;
