// The other side says they paid: "I transferred 500 NIS", "Just sent the payment", «העברתי לך 500 ש"ח», «שילמתי». This is the news that
// can close a "Waiting on Dana: Payment 500 NIS" task. It reads only the claim and an amount when one is named; whether a waiting task
// exists, and the person's click, decide the rest. A promise to pay later, a denial, a question, a conditional and somebody else's payment
// stay quiet. Portable: no chrome.*, no DOM, no network.
const FlowChatPaymentClaim = (() => {
  const CLAIM_EN = /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+|already\s+|now\s+)?(?:paid|transferred|sent|wired|settled)\b|\b(?:payment|transfer|money)\s+(?:has\s+been\s+|was\s+|is\s+)?(?:sent|made|done|transferred|on\s+its\s+way)\b|\b(?:just\s+|already\s+)?sent\s+(?:you\s+)?(?:the|my|your)\s+(?:payment|money|transfer)\b|\b(?:just\s+|already\s+)?(?:paid|transferred)\s*[.!]?$|\bdone\s*[,.!-]\s*(?:i\s+)?(?:paid|transferred|sent)\b/i;
  const CLAIM_HE = /(?:העברתי|שילמתי|שלחתי\s+(?:לך\s+)?(?:את\s+)?(?:ה)?(?:תשלום|כסף|בביט|בפייבוקס)|העברנו|שילמנו|התשלום\s+(?:נשלח|בוצע|הועבר)|הכסף\s+(?:נשלח|הועבר)|ביצעתי\s+(?:את\s+)?(?:ה)?(?:העברה|תשלום)|בוצעה\s+העברה)/;
  // Later, never, not yet, a condition, somebody else, or a question: not a payment made.
  const NO_EN = /\b(?:paid\s+for|pay\s+for|will|won'?t|going\s+to|gonna|'ll|haven'?t|hasn'?t|not\s+yet|didn'?t|did\s+not|never|can'?t|cannot|if\s+i|once\s+i|when\s+i|after\s+i|tomorrow|tonight|later|soon|he\s+(?:paid|transferred|sent)|she\s+(?:paid|transferred|sent)|they\s+(?:paid|transferred|sent))\b/i;
  const NO_HE = /(?:שילמתי\s+על|שילמנו\s+על|אעביר|אשלם|אשלח|נעביר|נשלם|נשלח|אני\s+אעביר|עוד\s+לא|לא\s+(?:שילמתי|העברתי|שלחתי)|אם\s+אעביר|ברגע\s+ש|מחר|הערב|בהמשך|בקרוב|הוא\s+(?:שילם|העביר)|היא\s+(?:שילמה|העבירה)|הם\s+(?:שילמו|העבירו))/;
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
    if (!CLAIM_EN.test(raw) && !CLAIM_HE.test(raw)) return { kind: 'none', reason: 'no-claim' };
    const a = amountOf(raw);
    return { kind: 'claim', amount: a ? a.amount : null, currency: a ? a.currency : null, lang: /[֐-׿]/.test(raw) ? 'he' : 'en' };
  }

  return { recognize: recognize };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatPaymentClaim };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatPaymentClaim = FlowChatPaymentClaim;
