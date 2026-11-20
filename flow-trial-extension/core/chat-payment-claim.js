// The other side says they paid: "I transferred 500 NIS", "Just sent the payment", «העברתי לך 500 ש"ח», «שילמתי». This is the news that
// can close a "Waiting on Dana: Payment 500 NIS" task. It reads only the claim and an amount when one is named; whether a waiting task
// exists, and the person's click, decide the rest. A promise to pay later, a denial, a question, a conditional and somebody else's payment
// stay quiet. Portable: no chrome.*, no DOM, no network.
const FlowChatPaymentClaim = (() => {
  const CLAIM_EN = /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+|already\s+|now\s+)?(?:paid|transferred|sent|wired|settled)\b|\b(?:payment|transfer|money)\s+(?:has\s+been\s+|was\s+|is\s+)?(?:sent|made|done|transferred|on\s+its\s+way)\b|\b(?:just\s+|already\s+)?sent\s+(?:you\s+)?(?:the|my|your)\s+(?:payment|money|transfer)\b|\b(?:just\s+|already\s+)?(?:paid|transferred)\s*[.!]?$|\bdone\s*[,.!-]\s*(?:i\s+)?(?:paid|transferred|sent)\b|^(?:just\s+|already\s+)?(?:paid|transferred|sent|wired)\s+(?:you\s+)?(?:the\s+)?(?:\d|[$€£₪]|via\b|by\b|on\s+(?:bit|paybox)\b|through\b|with\b)|^(?:just\s+|already\s+)?(?:paid|transferred|wired)\s+it\b|\bi\s+made\s+(?:the|a)\s+(?:payment|transfer)\b|\b(?:the\s+)?money\s+is\s+(?:now\s+)?(?:in\s+your|on\s+its\s+way|with\s+you)|\bpayment\s+(?:just\s+)?went\s+out\b/i;
  const CLAIM_HE = /(?:העברתי|שילמתי|שלחתי\s+(?:לך\s+)?(?:את\s+)?(?:ה)?(?:תשלום|כסף|בביט|בפייבוקס)|העברנו|שילמנו|התשלום\s+(?:נשלח|בוצע|הועבר)|הכסף\s+(?:נשלח|הועבר)|ביצעתי\s+(?:את\s+)?(?:ה)?(?:העברה|תשלום)|בוצעה\s+העברה|^שולם(?:\s|[!.]|$)|התשלום\s+יצא|הכסף\s+(?:אצלך|בדרך)|שלחתי\s+(?:לך\s+)?(?:\d[\d,.]*\s*(?:ש"ח|₪|שקל|דולר)|[$€£₪]))/;
  // Later, never, not yet, a condition, somebody else, or a question: not a payment made.
  const NO_EN = /\b(?:paid\s+for|pay\s+for|will|won'?t|going\s+to|gonna|'ll|haven'?t|hasn'?t|not\s+yet|didn'?t|did\s+not|never|can'?t|cannot|if\s+i|once\s+i|when\s+i|after\s+i|tomorrow|tonight|later|soon|he\s+(?:paid|transferred|sent)|she\s+(?:paid|transferred|sent)|they\s+(?:paid|transferred|sent))\b/i;
  const NO_HE = /(?:שילמתי\s+על|שילמנו\s+על|אעביר|אשלם|אשלח|נעביר|נשלם|נשלח|אני\s+אעביר|עוד\s+לא|לא\s+(?:שילמתי|העברתי|שלחתי)|אם\s+אעביר|ברגע\s+ש|מחר|הערב|בהמשך|בקרוב|הוא\s+(?:שילם|העביר)|היא\s+(?:שילמה|העבירה)|הם\s+(?:שילמו|העבירו))/;
  // "I sent you the contract" is a document, not money: the document claim (core/chat-sent-claim.js) owns it. Money is named by an amount or by a
  // payment word; "I sent it" with nothing named stays a possible payment claim.
  const DOC_SENT = /\b(?:sent|emailed|e-?mailed|uploaded|shared|forwarded)\s+(?:you\s+)?(?:over\s+)?(?:the\s+|my\s+|your\s+|our\s+|a\s+|an\s+)?(?:signed\s+|updated\s+|final\s+|new\s+)?(?:contract|agreement|file|files|document|documents|doc|docs|invoice|pdf|quote|report|link|photos?|pictures?|email|mail|message|form|details|proposal|offer|receipt|screenshot|presentation|deck|sheet|photo)\b|שלחתי\s+(?:לך\s+)?את\s+(?:ה)?(?:חוזה|קובץ|קבצים|מסמך|חשבונית|הצעה|דוח|קישור|תמונה|תמונות|טופס|מצגת)/i;
  // Red team 2026-10-30 (docs/glance-ai/red-team.md): a part of the money is not the payment («העברתי, את השאר בשבוע הבא», "I paid the
  // deposit"), and paying somebody else is not paying you («שילמתי לספק», "I paid the plumber"). Both used to read as a claim and, with one
  // open payment task in the chat, offered "Paid?".
  const PART = /\b(?:rest|remainder|remaining|half|part\s+of|partial(?:ly)?|deposit|down\s*payment|advance|first\s+(?:installment|payment|part)|installments?)\b|(?:השאר|היתרה|יתרה|חצי|חלק\s*(?:מ|מה)?|מקדמה|תשלום\s+ראשון|בתשלומים)/i;
  const OTHER_PAYEE_EN = /\b(?:paid|transferred|sent|wired)\s+(?:it\s+|the\s+money\s+|the\s+payment\s+)?(?:to\s+)?(?:the|my|our|his|her|their)\s+(?!payment|money|transfer|invoice|bill|balance|amount|fee|full|whole|total|\d)[a-z]+/i;
  const OTHER_PAYEE_HE = /(?:שילמתי|שילמנו|העברתי|העברנו)\s+(?:את\s+(?:ה)?(?:תשלום|כסף)\s+)?ל(?:עורך|עורכת|עו\"ד|עוה\"ד|רואה|רואת|רו\"ח|מנהל|מנהלת|ספק|ספקים|בנק|לקוח|לקוחה|משרד|הנהלת|מחלקת|אחראי|צוות|שליח|חברה|חברת|אינסטלטור|חשמלאי|קבלן|מתווך|מתווכת|בעל|בעלת|יועץ|יועצת)(?![\u0590-\u05FF])/;
  const QUESTION = /[?؟]/;
  const AMOUNT = /(?:(?:[$€£₪])\s?(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s?(?:₪|\$|€|£|nis|ils|usd|eur|gbp|shekels?|shekel|dollars?|euros?|ש"ח|ש״ח|שח|שקל(?:ים)?|דולר(?:ים)?|אירו))/i;
  const CUR = [[/(?:₪|nis|ils|shekel|ש"ח|ש״ח|שח|שקל)/i, 'NIS'], [/(?:\$|usd|dollar|דולר)/i, 'USD'], [/(?:€|eur|euro|אירו)/i, 'EUR'], [/(?:£|gbp)/i, 'GBP']];

  function amountOf(raw) {
    const m = raw.match(AMOUNT);
    if (!m) return null;
    const digits = String(m[1] || m[2] || '').replace(/,/g, '');
    const n = Number(digits);
    if (!(n > 0) || n > 10000000) return null;
    const whole = Number.isInteger(n) ? String(n) : String(n);
    let currency = null;
    for (const [re, code] of CUR) { if (re.test(m[0])) { currency = code; break; } }
    return { amount: whole, currency: currency };
  }

  // { kind: 'claim', amount: '500' | null, currency: 'NIS' | null, lang } or { kind: 'none', reason }.
  function recognize(text) {
    const raw = String(text == null ? '' : text).replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 160) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-a-payment-made' };
    if (PART.test(raw)) return { kind: 'none', reason: 'a-part-not-the-payment' };
    if (OTHER_PAYEE_EN.test(raw) || OTHER_PAYEE_HE.test(raw)) return { kind: 'none', reason: 'paid-someone-else' };
    if (!CLAIM_EN.test(raw) && !CLAIM_HE.test(raw)) return { kind: 'none', reason: 'no-claim' };
    if (DOC_SENT.test(raw) && !AMOUNT.test(raw) && !/\b(?:payment|transfer|money|paid)\b|תשלום|כסף/i.test(raw)) return { kind: 'none', reason: 'a-document-not-a-payment' };
    const a = amountOf(raw);
    return { kind: 'claim', amount: a ? a.amount : null, currency: a ? a.currency : null, ref: refOf(raw), lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  // The invoice number a claim names ("I paid invoice 2231", «שילמתי את חשבונית מספר 2231»), or ''.
  function refOf(raw) {
    const m = String(raw || '').match(/\b(?:invoice|bill)\s*(?:#|no\.?|number)?\s*([A-Za-z]{0,4}-?\d{2,10})\b|חשבונית\s+(?:מס(?:פר|\x27)?\.?\s*)?([A-Za-z]{0,4}-?\d{2,10})\b/i);
    return m ? String(m[1] || m[2] || '') : '';
  }

  // The person's OWN "I paid ..." closes one of their own "Pay ..." tasks: the task whose invoice number or amount the claim names; a claim that
  // names neither fits only when exactly one pay task is open. tasks: [{ title, ... }]. Returns the fitting tasks (a caller acts on exactly one).
  function fitsOwn(claim, tasks) {
    const pay = [];
    for (const t of Array.isArray(tasks) ? tasks : []) {
      const m = t && typeof t.title === 'string' ? t.title.match(/^(?:Pay|לשלם) (?:(?:invoice|חשבונית) (\S+)|(\d+(?:\.\d+)?) ([A-Z]{3}))(?: · .*)?$/) : null;
      if (m) pay.push({ task: t, ref: m[1] || '', amount: m[2] || '', currency: m[3] || '' });
    }
    if (!claim || claim.kind !== 'claim') return [];
    let hit;
    if (claim.ref) hit = pay.filter((c) => c.ref && c.ref.toLowerCase() === claim.ref.toLowerCase());
    else if (claim.amount) hit = pay.filter((c) => c.amount === claim.amount && (!claim.currency || c.currency === claim.currency));
    else hit = pay.length === 1 ? pay : [];
    return hit.map((c) => c.task);
  }

  return { recognize: recognize, fitsOwn: fitsOwn };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatPaymentClaim };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatPaymentClaim = FlowChatPaymentClaim;
