// A payment asked of the person in a chat with an amount and a day: "Please transfer 500 NIS to my account by Sunday",
// "Can you pay the 1,200 ₪ invoice before Thursday?", «תעביר לי 500 שקל עד יום ראשון», «תשלם 300 ש"ח עד מחר». The shared judge
// reads no money in a chat and stays quiet. This module recognises it structurally: a pay verb aimed at the person, one
// amount with a currency, one named day that is today or later, nothing that refuses, hedges, looks back or says the
// sender pays. It returns the amount and the day only. Glance never pays and never touches a bank; the chat card offers a
// task, "Pay 500 NIS", that the person approves. Portable: no chrome.*, no DOM, no network.
const FlowChatPaymentAsk = (() => {
  const VERB_EN = /\b(?:transfer|pay|send|wire|settle|bit|paybox)\b/i;
  const VERB_HE = /(?:(?:נא|אפשר|תוכל(?:י|ו)?|מבקש(?:ת)?|צריך|צריכה|חייב(?:ת)?)\s+(?:בבקשה\s+)?(?:להעביר|לשלם|לשלוח|לבצע\s+העברה|לסגור)|תעביר|תעבירי|תעבירו|תשלם|תשלמי|תשלמו|תשלח|תשלחי|תשלחו|תבצע\s+העברה|תסגור|תסגרי)/;
  const ASK_EN = /^(?:(?:hey|hi|hello)[\s,]+\S+[\s,]+)?(?:please\s+|pls\s+|kindly\s+)?(?:can|could|would|will)?\s*(?:you\s+)?(?:please\s+)?(?:transfer|pay|send|wire|settle|bit|paybox)\b|^(?:please\s+)(?:transfer|pay|send|wire|settle)\b|\byou\s+(?:owe|need\s+to\s+pay|still\s+owe)\b|\b(?:need|want)\s+you\s+to\s+(?:transfer|pay|send)\b/i;
  const ASK_HE = /^(?:(?:שלום|היי|הי|הלו)(?:\s+[^\s,]+)?\s*,?\s+)?(?:נא|אפשר|תוכל(?:י|ו)?|מבקש(?:ת)?|אשמח\s+אם\s+תוכל(?:י|ו)?)\s+(?:בבקשה\s+)?(?:להעביר|לשלם|לשלוח|לבצע\s+העברה|לסגור)|^(?:(?:שלום|היי|הי|הלו)(?:\s+[^\s,]+)?\s*,?\s+)?(?:בבקשה\s+)?(?:אפשר\s+ש)?(?:תעביר|תעבירי|תעבירו|תשלם|תשלמי|תשלמו|תשלח|תשלחי|תשלחו|תבצע|תסגור|תסגרי)|אתה\s+חייב|את\s+חייבת|אתם\s+חייבים|אני\s+צריך\s+שתעביר|צריך\s+שתשלם/;
  const AMOUNT = /(?:(?:[$€£₪])\s?(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s?(?:nis|ils|usd|eur|gbp|dollars?|euros?|shekels?|bucks|₪|\$|€|£|שקל(?:ים)?|שקלים|ש"ח|ש״ח|שח|דולר(?:ים)?|אירו|יורו))/i;
  const NO_EN = /\b(?:receipt|refunded|thank(?:s|\s+you)\s+for\s+(?:your\s+)?payment|has\s+been\s+paid|was\s+paid|autopay|auto-?pay|will\s+be\s+charged|direct\s+debit|don'?t|do\s+not|no\s+need|never\s*mind|already|paid|sent|yesterday|last\s+(?:week|night)|maybe|might|if\s+you\s+(?:want|can|like)|cancel(?:l?ed)?|refund|i'?ll|i\s+will|i\s+can|i\s+sent|i\s+paid|(?:he|she|they)\s+(?:will|should|can))\b/i;
  const NO_HE = /(?:נא\s+לא|קבלה|שולם|שולמה|תודה\s+על\s+התשלום|הוראת\s+קבע|יחויב|תחויב|אל\s+תעביר|אל\s+תשלם|אין\s+צורך|לא\s+צריך|כבר\s|שילמתי|העברתי|אתמול|שבוע שעבר|אולי|אם\s+(?:בא|תוכל|אפשר)|לבטל|בוטל|החזר|אני\s+(?:אעביר|אשלם|אשלח))/;
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

  // An amount written in words ("חמש מאות שקל", "אלפיים ש"ח", "five hundred shekels") is rewritten to digits and the same currency
  // word, so one amount reader serves both. Only a run of number words directly before a currency word is touched.
  const HE_UNITS = { 'אחד': 1, 'אחת': 1, 'שני': 2, 'שתי': 2, 'שניים': 2, 'שתיים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10, 'שלושת': 3, 'ארבעת': 4, 'חמשת': 5, 'ששת': 6, 'שבעת': 7, 'שמונת': 8, 'תשעת': 9, 'עשרת': 10 };
  const HE_TENS = { 'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90 };
  const HE_WORD = '(?:אחד|אחת|שני|שתי|שניים|שתיים|שלוש|שלושה|שלושת|ארבע|ארבעה|ארבעת|חמש|חמישה|חמשת|שש|שישה|ששת|שבע|שבעה|שבעת|שמונה|שמונת|תשע|תשעה|תשעת|עשר|עשרה|עשרת|עשרים|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים|מאה|מאתיים|מאות|אלף|אלפיים|אלפים)';
  const EN_UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, a: 1 };
  const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const EN_WORD = '(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';
  const CUR_WORD = '(?:שקל(?:ים)?|ש"ח|ש״ח|שח|דולר(?:ים)?|אירו|יורו|nis|ils|usd|eur|gbp|shekels?|dollars?|euros?|bucks)';

  function heWordsValue(words) {
    let total = 0; let cur = 0;
    for (const raw of words) {
      const w = raw.replace(/^ו/, '');
      if (HE_UNITS[w] != null) cur += HE_UNITS[w];
      else if (HE_TENS[w] != null) cur += HE_TENS[w];
      else if (w === 'מאה') cur += 100;
      else if (w === 'מאתיים') cur += 200;
      else if (w === 'מאות') cur = (cur || 1) * 100;
      else if (w === 'אלף') { total += (cur || 1) * 1000; cur = 0; }
      else if (w === 'אלפיים') { total += 2000; cur = 0; }
      else if (w === 'אלפים') { total += (cur || 1) * 1000; cur = 0; }
      else return 0;
    }
    return total + cur;
  }
  function enWordsValue(words) {
    let total = 0; let cur = 0;
    for (const raw of words) {
      const w = raw.toLowerCase();
      if (EN_UNITS[w] != null) cur += EN_UNITS[w];
      else if (EN_TENS[w] != null) cur += EN_TENS[w];
      else if (w === 'hundred') cur = (cur || 1) * 100;
      else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      else return 0;
    }
    return total + cur;
  }
  function amountWords(text) {
    let s = String(text || '');
    s = s.replace(new RegExp('((?:^|[\\s(,])(?:ו)?' + HE_WORD + '(?:\\s+(?:ו)?' + HE_WORD + ')*)\\s+(' + CUR_WORD + ')', 'g'), (m, run, cur) => {
      const lead = /^[\s(,]/.test(run) ? run.charAt(0) : '';
      const words = run.replace(/^[\s(,]/, '').split(/\s+/);
      const n = heWordsValue(words);
      return n > 0 ? lead + n + ' ' + cur : m;
    });
    s = s.replace(new RegExp('\\b(' + EN_WORD + '(?:[\\s-]+(?:and\\s+)?' + EN_WORD + ')*)\\s+(' + CUR_WORD + ')', 'gi'), (m, run, cur) => {
      const words = run.split(/[\s-]+/).filter((w) => !/^and$/i.test(w));
      const n = enWordsValue(words);
      return n > 0 ? n + ' ' + cur : m;
    });
    return s;
  }

  function currencyOf(m) {
    const t = m[0];
    if (/₪|nis|ils|shekel|שקל|ש"ח|ש״ח|שח/i.test(t)) return 'NIS';
    if (/\$|usd|dollar|דולר|bucks/i.test(t)) return 'USD';
    if (/€|eur|euro|אירו|יורו/i.test(t)) return 'EUR';
    if (/£|gbp/i.test(t)) return 'GBP';
    return '';
  }

  // { kind: 'ask', dateIso, amount, currency, lang } or { kind: 'none', reason }.
  // A bill that states what is due ("Your invoice of 1,200 NIS is due on Nov 5", «החשבונית שלך על סך 1,200 ₪ לתשלום עד 5.11»): no
  // request verb, but the same one amount and one day. Only the person's own bill (your / שלך), never a receipt or a charge that
  // happens by itself.
  const BILL_EN = /\byour\s+(?:[a-z-]+\s+){0,2}(?:invoice|bill|statement|subscription|rent|instal+ment|balance|tax|premium|fee|fine|ticket)\b[^.?!]{0,80}\b(?:is|are)?\s*(?:due|payable|overdue|outstanding)\b|\bpayment\s+(?:is\s+)?due\b|\bamount\s+due\b/i;
  const BILL_HE = /(?:החשבונית|החשבון|החיוב|המנוי|התשלום|שכר\s+הדירה|הארנונה|החוב|הקנס|הפרמיה|הדוח)\s+(?:שלך|שלכם|שלכן)[^.?!]{0,80}(?:לתשלום|פירעון|בפיגור|ממתין|ממתינה)|מועד\s+(?:הפירעון|התשלום)|לתשלום\s+עד/;

  // A nudge in front of the same ask ("Reminder: please transfer…", «תזכורת: תעביר…») is the same ask, not another sentence.
  const NUDGE_EN = /^(?:(?:a\s+)?(?:gentle|friendly|quick|polite)\s+)?(?:reminder|nudge|ping|follow(?:ing)?[\s-]*up)\s*[:,\-–—]\s*/i;
  const NUDGE_HE = /^(?:תזכורת(?:\s+(?:ידידותית|קטנה))?|שוב)\s*[:,\-–—]\s*/;

  function recognize(text, now) {
    const raw = amountWords(String(dayWords(text, now) || '')).replace(/\s+/g, ' ').trim().replace(NUDGE_EN, '').replace(NUDGE_HE, '');
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 200) return { kind: 'none', reason: 'long' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-an-ask' };
    const billed = BILL_EN.test(raw) || BILL_HE.test(raw);
    if (!billed && !(VERB_EN.test(raw) || VERB_HE.test(raw))) return { kind: 'none', reason: 'no-pay-verb' };
    if (!billed && !(ASK_EN.test(raw) || ASK_HE.test(raw))) return { kind: 'none', reason: 'not-aimed-at-you' };
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
    return { kind: 'ask', billed: billed, dateIso: d.iso, amount: amount, currency: currency, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatPaymentAsk };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatPaymentAsk = FlowChatPaymentAsk;
