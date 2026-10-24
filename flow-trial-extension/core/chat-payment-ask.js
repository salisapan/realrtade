// A payment asked of the person in a chat with an amount and a day: "Please transfer 500 NIS to my account by Sunday",
// "Can you pay the 1,200 ₪ invoice before Thursday?", «תעביר לי 500 שקל עד יום ראשון», «תשלם 300 ש"ח עד מחר». The shared judge
// reads no money in a chat and stays quiet. This module recognises it structurally: a pay verb aimed at the person, one
// amount with a currency, one named day that is today or later, nothing that refuses, hedges, looks back or says the
// sender pays. It returns the amount and the day only. Glance never pays and never touches a bank; the chat card offers a
// task, "Pay 500 NIS", that the person approves. Portable: no chrome.*, no DOM, no network.
const FlowChatPaymentAsk = (() => {
  const VERB_EN = /\b(?:transfer|pay|send|wire|settle|bit|paybox)\b/i;
  const VERB_HE = /(?:תעביר|תעבירי|תעבירו|תשלם|תשלמי|תשלמו|תשלח|תשלחי|תשלחו|תבצע\s+העברה|תסגור|תסגרי)/;
  const ASK_EN = /^(?:(?:hey|hi|hello)[\s,]+\S+[\s,]+)?(?:please\s+|pls\s+|kindly\s+)?(?:can|could|would|will)?\s*(?:you\s+)?(?:please\s+)?(?:transfer|pay|send|wire|settle|bit|paybox)\b|^(?:please\s+)(?:transfer|pay|send|wire|settle)\b|\byou\s+(?:owe|need\s+to\s+pay|still\s+owe)\b|\b(?:need|want)\s+you\s+to\s+(?:transfer|pay|send)\b/i;
  const ASK_HE = /^(?:(?:שלום|היי|הי|הלו)(?:\s+[^\s,]+)?\s*,?\s+)?(?:בבקשה\s+)?(?:אפשר\s+ש)?(?:תעביר|תעבירי|תעבירו|תשלם|תשלמי|תשלמו|תשלח|תשלחי|תשלחו|תבצע|תסגור|תסגרי)|אתה\s+חייב|את\s+חייבת|אתם\s+חייבים|אני\s+צריך\s+שתעביר|צריך\s+שתשלם/;
  const AMOUNT = /(?:(?:[$€£₪])\s?(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s?(?:nis|ils|usd|eur|gbp|dollars?|euros?|shekels?|bucks|₪|\$|€|£|שקל(?:ים)?|שקלים|ש"ח|ש״ח|שח|דולר(?:ים)?|אירו|יורו))/i;
  const NO_EN = /\b(?:don'?t|do\s+not|no\s+need|never\s*mind|already|paid|sent|yesterday|last\s+(?:week|night)|maybe|might|if\s+you\s+(?:want|can|like)|cancel(?:l?ed)?|refund|i'?ll|i\s+will|i\s+can|i\s+sent|i\s+paid|(?:he|she|they)\s+(?:will|should|can))\b/i;
  const NO_HE = /(?:אל\s+תעביר|אל\s+תשלם|אין\s+צורך|לא\s+צריך|כבר\s|שילמתי|העברתי|אתמול|שבוע שעבר|אולי|אם\s+(?:בא|תוכל|אפשר)|לבטל|בוטל|החזר|אני\s+(?:אעביר|אשלם|אשלח))/;
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

  function currencyOf(m) {
    const t = m[0];
    if (/₪|nis|ils|שקל|ש"ח|ש״ח|שח/i.test(t)) return 'NIS';
    if (/\$|usd|dollar|דולר|bucks/i.test(t)) return 'USD';
    if (/€|eur|euro|אירו|יורו/i.test(t)) return 'EUR';
    if (/£|gbp/i.test(t)) return 'GBP';
    return '';
  }

  // { kind: 'ask', dateIso, amount, currency, lang } or { kind: 'none', reason }.
  function recognize(text, now) {
    const raw = String(dayWords(text, now) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 200) return { kind: 'none', reason: 'long' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-an-ask' };
    if (!(VERB_EN.test(raw) || VERB_HE.test(raw))) return { kind: 'none', reason: 'no-pay-verb' };
    if (!(ASK_EN.test(raw) || ASK_HE.test(raw))) return { kind: 'none', reason: 'not-aimed-at-you' };
    const all = raw.match(new RegExp(AMOUNT.source, 'gi')) || [];
    if (all.length !== 1) return { kind: 'none', reason: all.length ? 'several-amounts' : 'no-amount' };
    const m = raw.match(AMOUNT);
    const amount = String(m[1] || m[2] || '').replace(/,/g, '');
    const currency = currencyOf(m);
    if (!amount || !currency || !(parseFloat(amount) > 0)) return { kind: 'none', reason: 'bad-amount' };
    const X = extractApi();
    if (!X || typeof X.parseDate !== 'function') return { kind: 'none', reason: 'not-configured' };
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const rest = raw.replace(m[0], ' ');
    const d = X.parseDate(rest, at) || weekdayDate(rest, at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.iso || ''))) return { kind: 'none', reason: 'no-day' };
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const ahead = Math.round((new Date(d.iso + 'T00:00:00') - today) / 86400000);
    if (!(ahead >= 0 && ahead <= MAX_AHEAD_DAYS)) return { kind: 'none', reason: 'day-out-of-range' };
    return { kind: 'ask', dateIso: d.iso, amount: amount, currency: currency, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatPaymentAsk };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatPaymentAsk = FlowChatPaymentAsk;
