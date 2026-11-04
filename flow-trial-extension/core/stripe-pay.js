// A message the person SENT that waits on a payment and names one Stripe invoice or payment ("please pay invoice in_…", "let me know when
// it's paid: <dashboard link>", «תעדכן אותי כשהתשלום עבר») becomes one offer: watch THAT invoice or payment and count the loop closed when
// Stripe reads it back as paid (core/stripe-close.js). Portable: no chrome.*, no DOM, no network. Behind the off switch STRIPE_PAYMENT
// (default off; the connector's own switch stripeReadBack is separate, config/connectors.public.js).
//
// Rules:
//   - the text must name exactly ONE Stripe id (in_… invoice or pi_… payment, bare or in a dashboard.stripe.com link). An invoice is never
//     guessed from a name, an amount or "the latest invoice"; no id, a charge or customer id, or two different ids is silence;
//   - the text must be about money owed to the person: please pay / payment due / awaiting payment / let me know when it is paid, English or
//     Hebrew. Text the person RECEIVED asking them to pay is silence ("you-owe"): Glance never pays and never moves money;
//   - already paid / receipt / refund, hedge, negation, FYI and "ask Dana to pay" stay silent;
//   - the direction is decided by WHERE the text came from, never by its words: "theirs" (the person sent it) is the only one that offers.
//   - the offer never charges, invoices, refunds or sends anything. Its only step is "watch that one payment".
// No src/ file calls this yet (the steps-list wiring is open-tasks row 80).
const FlowStripePay = (() => {
  const SWITCH = 'STRIPE_PAYMENT';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'stripe/payment';

  const ID = /\b(?:in|pi)_[A-Za-z0-9]{8,64}\b/g;
  const LINK_ID = /https:\/\/dashboard\.stripe\.com\/[^\s<>"')\]]*\b((?:in|pi)_[A-Za-z0-9]{8,64})\b/gi;
  const OTHER_ID = /\b(?:ch|cus|sub|cs|py|re|dp|acct|price|prod|sk_live|sk_test|rk_live|rk_test|pk_live|pk_test)_[A-Za-z0-9]{6,}\b/;
  const ASK_EN = /\b(?:please\s+pay|pay\s+(?:the\s+)?(?:invoice|this|it)|payment\s+(?:is\s+)?(?:due|pending|outstanding|expected)|awaiting\s+(?:your\s+)?payment|waiting\s+(?:for|on)\s+(?:the\s+)?payment|unpaid|outstanding\s+(?:invoice|balance)|let\s+me\s+know\s+(?:when|once|if)\s+(?:it'?s|it\s+is|you'?ve|you\s+have|the\s+payment)[^.!?\n]{0,30}(?:paid|pay|sent|done|went\s+through)|settle\s+(?:the\s+)?(?:invoice|balance))\b/i;
  const ASK_HE = /(?:בבקשה\s+(?:לשלם|תשלם|תשלמו|שלם|שלמו)|(?:תשלם|תשלמו|שלם|שלמו)\s+(?:את\s+)?(?:החשבונית|הסכום|בבקשה)|התשלום\s+(?:טרם|עדיין|לא)|מחכה\s+(?:ל)?תשלום|ממתין\s+(?:ל)?תשלום|חשבונית\s+(?:פתוחה|ממתינה|שלא\s+שולמה)|תעדכן(?:\s+אותי)?\s+(?:כש|ברגע\s+ש|אם)[^.!?\n]{0,30}(?:שולם|שילמת|התשלום|עבר)|(?:לשלם|תשלום)\s+עד)/;
  const YOU_OWE = /\b(?:you\s+owe|i\s+(?:will|'ll)\s+pay|i\s+paid|i'?ve\s+paid|sorry\s+for\s+the\s+delay\s+in\s+paying|my\s+payment)\b|אני\s+(?:אשלם|שילמתי|משלם)|אני\s+חייב/i;
  const PAID = /\b(?:already\s+paid|has\s+been\s+paid|was\s+paid|payment\s+received|receipt|refund(?:ed)?|thank\s+you\s+for\s+(?:your\s+)?payment)\b|שולם\s+כבר|כבר\s+שולם|התקבל\s+תשלום|קבלה|זיכוי|החזר/i;
  const NEG = /\b(?:no\s+need\s+to\s+pay|don'?t\s+pay|do\s+not\s+pay|ignore\s+(?:this\s+)?invoice|cancel(?:led|ed)?|void(?:ed)?)\b|אין\s+צורך\s+לשלם|לא\s+לשלם|לבטל|בוטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if\s+you\s+want|if\s+you'?d\s+like|no\s+pressure|whenever\s+you\s+can|sometime)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|מתישהו/i;
  const FYI = /\b(?:fyi|for\s+your\s+information|no\s+action\s+needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:pay|settle)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The one Stripe object the text names, or a reason for silence.
  function objectOf(text) {
    const s = String(text || '');
    const ids = {};
    (s.match(ID) || []).forEach((i) => { ids[i] = 1; });
    let m;
    LINK_ID.lastIndex = 0;
    while ((m = LINK_ID.exec(s))) ids[m[1]] = 1;
    const list = Object.keys(ids);
    if (list.length === 1) return OTHER_ID.test(s) ? { reason: 'not-an-invoice' } : { objectId: list[0] };
    if (list.length > 1) return { reason: 'several-objects' };
    return { reason: OTHER_ID.test(s) ? 'not-an-invoice' : 'no-object' };
  }

  // The ask, or silence with a reason. direction: "theirs" (the person sent it) | "mine" (the person received it); never read from the words.
  function recognize(text, direction) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    if (!/\b(?:in|pi)_[A-Za-z0-9]{8,}|dashboard\.stripe\.com|\b(?:ch|cus|sub|cs|py|re|dp)_[A-Za-z0-9]{6,}/.test(s)) return { kind: 'ignore' };
    if (direction !== 'mine' && direction !== 'theirs') return { kind: 'block', reason: 'no-direction' };
    if (direction === 'mine' || YOU_OWE.test(s)) return { kind: 'block', reason: 'you-owe' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (PAID.test(s)) return { kind: 'block', reason: 'already-paid' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s)) return { kind: 'block', reason: 'third-party' };
    const o = objectOf(s);
    if (!o.objectId) return { kind: 'block', reason: o.reason };
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-ask' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', objectId: o.objectId };
  }

  // The plan: one Do It that only starts watching the one payment. Nothing is charged, sent or refunded; nothing is closed by the plan.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.direction);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    return {
      action: 'offer',
      approval: 'DoIt',
      objectId: r.objectId,
      line: r.lang === 'he' ? 'לעקוב אחרי התשלום הזה ולסגור כשהוא מתקבל ב-Stripe?' : 'Watch that payment and close this when Stripe shows it paid?',
      steps: [
        { id: 'watch', kind: 'watch', label: r.lang === 'he' ? 'קריאת החשבונית או התשלום הזה בלבד (קריאה בלבד)' : 'Read that one invoice or payment (read only)', proof: SYSTEM },
        { id: 'note', kind: 'manual', label: r.lang === 'he' ? 'גלאנס לא גובה, לא מחזיר כסף ולא שולח דרישת תשלום' : 'Glance never charges, refunds or sends a payment request' }
      ],
      lang: r.lang
    };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, recognize, plan, objectOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowStripePay };
else if (typeof globalThis !== 'undefined') globalThis.FlowStripePay = FlowStripePay;
