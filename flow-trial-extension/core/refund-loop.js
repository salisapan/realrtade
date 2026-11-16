// The refund you asked for, carried until the money is really back (close map row Y4). Portable: no chrome.*, no DOM,
// no network.
//
// Why this exists. "Please refund the double charge of ₪189" / «אבקש לבטל את העסקה ולזכות את הכרטיס» is money the
// person is owed by a business. Today a sent refund request opens no loop at all, and a merchant's "your refund has
// been processed" is a claim, not money. This file opens the loop from the person's own sent request, follows the
// merchant's answer (approved with a date, declined, or needs something from you), and closes it only when the card,
// bank or payment app says the credit from THAT merchant, for that amount, has landed. Glance never moves money.
//
// Switch: opts.enabled (REFUND_LOOP, default off; it joins core/labs-switches.js only when it is wired). Off: every
// function that decides returns null.
//
// Opens (ask) only on the person's OWN request to a business (not free mail), with a refund word and a request form
// (please / could you / I'd like / אבקש / נא). Silent on: a question about the policy, a hedge ("if it does not arrive I
// may ask"), thanks for a refund already received, a promise to refund someone else, a request to a private address.
// The merchant's reply moves the stage (reply): 'approved' (with the days they gave, else 10 business days),
// 'declined' (a decision for the person, never a close), 'needs-you' (they asked for something). None of these closes.
// Closes (judge) only on a trusted card, bank or payment-app notice (core/outside-signals.js list, authentication not
// failed) that money came BACK: refund / credit / «זיכוי», not pending or future, not a charge, not a refund the person
// sent; the same amount (a different amount is a partial refund: open); and the merchant named. A notice that names no
// merchant but has the amount asks once. Another merchant: silence. Two loops that fit: silence.
const FlowRefundLoop = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const signals = sibling(typeof FlowOutsideSignals !== 'undefined' ? FlowOutsideSignals : null, './outside-signals.js', 'FlowOutsideSignals');

  const SWITCH = 'REFUND_LOOP';
  const SWITCH_DEFAULT = false;
  const DAY = 86400000;

  // ---- the ask ----
  const REFUND_EN = /\b(?:refund|money back|charge ?back)\b|\breverse\b[^.!?]{0,30}\bcharge\b|\bcredit (?:my|the|it back to my) (?:card|account)\b/i;
  const REFUND_HE = /(?:החזר(?:\s+כספי)?(?=$|[\s,.!?])|להחזיר\s+(?:לי\s+)?(?:את\s+)?(?:ה-?)?(?:כסף|חיוב|סכום|תשלום|\d)|לזכות\s+(?:את\s+)?(?:ה)?כרטיס|לזכות\s+אותי|זיכוי\s+(?:של|על|בסך|ב-?)|לבטל\s+את\s+(?:ה)?(?:עסקה|חיוב)\s+ול?זכות)/;
  const REQUEST_EN = /\b(?:please|kindly|could you|can you|would you|i(?:'d| would) like|i want|i(?:'m| am) (?:requesting|asking for)|i request|i need|i expect|(?:can|could|may) i (?:get|have|please get))\b/i;
  const REQUEST_HE = /(?:אבקש|מבקש(?:ת)?|^נא\s|\sנא\s|בבקשה|אפשר\s|תוכלו|הייתי רוצה|אני רוצה|דורש(?:ת)?)/;
  const POLICY = /\b(?:policy|policies|what(?:'s| is) your|how (?:do|does|long))\b|(?:מדיניות|מה ה(?:נוהל|תנאים)|איך מקבלים)/i;
  const HEDGE = /\b(?:if (?:it|this|they|the|i)|may ask|might ask|maybe|perhaps|otherwise i(?:'ll| will))\b|(?:^|\s)(?:אם\s|אולי|אחרת\s)/i;
  const ALREADY = /\b(?:thanks? (?:you )?for the refund|(?:received|got) the refund|refund (?:has been|was) (?:received|processed|issued)|already (?:refunded|got))\b|(?:תודה על ההחזר|תודה על הזיכוי|קיבלתי את (?:ה)?(?:החזר|זיכוי|כסף)|ההחזר (?:התקבל|בוצע|הגיע))/i;
  const MINE = /\b(?:i(?:'ll| will| can) (?:refund|pay you back|return the money|send (?:you )?(?:back|the refund))|we(?:'ll| will) refund you)\b|(?:אחזיר לך|נחזיר לך|אזכה אותך|נזכה אותך|אעביר לך)/i;
  const FREEMAIL = /^(?:gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|walla|012|bezeqint|netvision|zahav|gmx|yandex)\.[a-z.]+$/i;

  function domainOf(email) { const m = /@([^>\s]+)>?\s*$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : ''; }
  function addWorkdays(t, n) {
    let d = new Date(t), left = n;
    while (left > 0) { d = new Date(d.getTime() + DAY); const wd = d.getDay(); if (wd !== 5 && wd !== 6) left--; }
    return d;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function chunks(text) { return String(text || '').split(/(?<=[.!?])\s+|\n+|,\s+|;\s*/); }
  function amountsIn(text) {
    const out = [];
    if (!extract || !extract.parseMoney) return out;
    chunks(text).forEach((c) => {
      const m = extract.parseMoney(c.replace(/(?:#|order\s*|הזמנה\s*|מס['׳"]?\s*|no\.?\s*|ending(?: in)?\s*|המסתיים ב-?\s*)\d+/gi, ' '));
      if (m && m.value > 0) out.push(m);
    });
    return out;
  }
  function merchantFrom(toName, toEmail) {
    if (toName && String(toName).trim()) return String(toName).trim();
    const d = domainOf(toEmail).split('.')[0] || '';
    return d ? d.replace(/[-_]/g, ' ') : null;
  }

  // The person's own sent message -> a refund loop, or null.
  function ask(text, opts) {
    const o = opts || {};
    if (o.enabled !== true) return null;
    const t = String(text || '');
    if (!(REFUND_EN.test(t) || REFUND_HE.test(t))) return null;
    if (!(REQUEST_EN.test(t) || REQUEST_HE.test(t))) return null;
    if (POLICY.test(t) || HEDGE.test(t) || ALREADY.test(t) || MINE.test(t)) return null;
    const d = domainOf(o.to);
    if (!d || FREEMAIL.test(d)) return null;                                          // a business, not a friend
    const he = /[א-ת]/.test(t);
    const all = amountsIn(t);
    const distinct = all.filter((m, i) => all.findIndex((x) => x.value === m.value) === i);
    const money = distinct.length === 1 ? distinct[0] : null;                           // two figures: do not guess
    const order = /(?:order|הזמנה)\s*(?:#|מס['׳"]?\s*|number\s*)?(\d{3,})/i.exec(t);
    const now = typeof o.now === 'number' ? o.now : Date.now();
    return {
      kind: 'refund',
      direction: 'theirs',
      merchant: merchantFrom(o.toName, o.to),
      email: String(o.to).trim().toLowerCase(),
      amount: money ? money.value : null,
      currency: money ? (money.currency || (he ? 'ILS' : null)) : null,
      orderNo: order ? order[1] : null,
      lang: he ? 'he' : 'en',
      stage: 'asked',
      askedAt: now,
      chaseIso: iso(addWorkdays(now, 5)),
      expectIso: null,
      status: 'open',
      closedAs: null,
      proof: null
    };
  }

  // ---- the merchant's answer ----
  const DECLINED = /\b(?:not eligible|ineligible|unable to (?:refund|offer|process)|cannot (?:refund|offer)|can(?:'|no)t (?:refund|offer)|no refunds?|non-?refundable|(?:have|has) (?:been )?declined)\b|(?:לא נוכל (?:להחזיר|לזכות|לבצע)|אין (?:אפשרות ל)?החזר|לא ניתן (?:להחזיר|לזכות)|אינו ניתן להחזר|אינו זכאי|לא זכאי)/i;
  const APPROVED = /\b(?:refund\b[^.!?]{0,30}\b(?:has been|was|is) (?:processed|issued|approved|initiated|on its way)|we(?:'ve| have) (?:processed|issued|approved|initiated) (?:your|the|a) refund|(?:will|should) (?:appear|show|be credited|reflect)|refunded to your)\b|(?:ההחזר (?:אושר|בוצע|יבוצע|נשלח)|יזוכה|תזוכה|הזיכוי (?:אושר|בוצע)|יופיע ב|אישרנו את (?:ה)?(?:החזר|זיכוי)|(?:הכסף|הסכום) (?:יוחזר|הוחזר|יועבר)|יוחזר(?:ו)? ל)/i;
  const NEEDS = /\b(?:could you (?:please )?(?:send|provide|share|confirm)|please (?:send|provide|share|reply with|attach)|we (?:will )?need|can you (?:send|provide))\b|(?:נא (?:לשלוח|לצרף|לאשר)|אנא (?:שלח|צרף)|נבקש (?:לשלוח|לצרף)|תוכל(?:י)? לשלוח|נצטרך)/i;
  // Store credit, a voucher or a coupon instead of money: the person decides (take it and release, or insist).
  const STORE_CREDIT = /\b(?:store credit|credit (?:note|voucher)|gift card|voucher|coupon|credit (?:to|on) your (?:store |shop )?account|account credit)\b|(?:זיכוי (?:ל|ב)?חנות|זיכוי לרכישה|שובר|קופון|תו קנייה|כרטיס זיכוי|זיכוי בחשבון באתר)/i;
  // "The refund is issued once we receive the item": approved only after the person does something.
  const CONDITIONAL = /\b(?:once|after|when) we (?:receive|get) (?:the|your) (?:item|return|product|package)|upon (?:receipt|return) of the (?:item|product)|(?:please )?(?:ship|send|return) (?:the|your) (?:item|product) (?:back )?(?:first|before)\b/i;
  const CONDITIONAL_HE = /(?:לאחר ש|אחרי ש|כש)(?:נקבל|יגיע(?:ו)? אלינו|תחזיר(?:י)?|תשלח(?:י)?) (?:את )?(?:ה)?(?:מוצר|פריט|חבילה|החזרה)/;
  function daysIn(text) {
    const t = String(text || '');
    let m = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:business |working )?days/i.exec(t);
    if (m) return Number(m[2]);
    m = /(\d{1,2})\s*(?:business |working )?days/i.exec(t) || /(\d{1,2})\s*ימי(?: עסקים| עבודה)?/.exec(t);
    return m ? Number(m[1]) : null;
  }
  // The merchant's reply on that thread -> { stage, expectIso? } or null. A reply never closes the loop.
  function reply(loop, text, opts) {
    const o = opts || {};
    if (o.enabled !== true || !loop || loop.status !== 'open') return null;
    const t = String(text || '');
    const now = typeof o.now === 'number' ? o.now : Date.now();
    if (STORE_CREDIT.test(t) && !/\b(?:to your (?:card|original|bank)|לכרטיס|לאמצעי התשלום)/i.test(t)) return { stage: 'store-credit' };
    if (DECLINED.test(t)) return { stage: 'declined' };
    if (CONDITIONAL.test(t) || CONDITIONAL_HE.test(t)) return { stage: 'needs-you', need: 'return-item' };
    if (APPROVED.test(t)) { const n = daysIn(t); return { stage: 'approved', expectIso: iso(addWorkdays(now, Math.min(n || 10, 45))) }; }
    if (NEEDS.test(t)) return { stage: 'needs-you' };
    return null;
  }

  // ---- the money back ----
  const CREDIT = /\b(?:refund(?:ed)?|credit(?:ed)?|reversal|reversed)\b|(?:זיכוי|זוכה|זוכית|הוחזר|החזר)/i;
  const NOT_YET = /\b(?:pending|will be|scheduled|expected|in process|processing|on hold)\b|(?:יבוצע|יזוכה|תזוכה|בחיוב הבא|ממתין|בתהליך|צפוי|בהמתנה)/i;
  const FAILED = /\b(?:failed|declined|unsuccessful|cancel(?:l)?ed|could not)\b|(?:נכשל|נדחה|בוטל|לא בוצע)/i;
  const SENT_OUT = /\b(?:you sent|sent a refund to|you refunded|refund(?:ed)? to (?!your)|issued a refund to)\b|(?:זיכית את|החזרת ל)/i;
  // Cashback, points and promotions say «זיכוי» / "credit" too; they are not this refund.
  const PROMO = /\b(?:cash ?back|points|miles|reward|promo(?:tion)?|bonus)\b|(?:נקודות|כוכבים|הטבה|מבצע|הנחה|קאשבק|החזר כספי במסגרת)/i;
  const GENERIC = ['בע"מ', 'בעמ', 'ltd', 'inc', 'llc', 'the', 'co', 'company', 'בית', 'העסק', 'חברת'];
  function norm(s) { return String(s || '').toLowerCase().replace(/[״"']/g, '"').replace(/[^a-z0-9֐-׿" ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function names(loop, text) {
    const toks = norm(loop.merchant).split(' ').filter((x) => x.length >= 2 && GENERIC.indexOf(x) < 0);
    if (!toks.length) return false;
    const words = norm(text).split(' ');
    const at = (w, tok) => w === tok || (/^[א-ת]/.test(tok) && /^[מלבהו]/.test(w) && w.slice(1) === tok);
    if (toks.every((tok) => words.some((w) => at(w, tok)))) return true;
    // A card shows the merchant's descriptor, not always the brand in mail ("SHOP ONLINE", "MAKERSPACE*BOOKING"): the
    // merchant's own mail domain label (at least 4 letters, not a generic word) as a word in the notice names it too.
    const label = (/@([^.>\s]+)\./.exec(String(loop.email || '').toLowerCase()) || [])[1] || '';
    return label.length >= 4 && GENERIC.indexOf(label) < 0 && !/^(?:info|mail|shop|store|service|support|help|noreply)$/.test(label) && words.indexOf(label) >= 0;
  }
  // Does the notice name SOME merchant? ("מבית העסק X", "בית עסק: X", "from X")
  function namesAnyMerchant(text) {
    return /(?:בית(?:\s+ה)?עסק:?\s+\S|from\s+[A-Z0-9])/.test(String(text || ''));
  }
  function amountFits(loop, text) {
    const all = amountsIn(text);
    if (!all.length) return null;
    return all.some((m) => Math.abs(m.value - loop.amount) <= Math.max(0.5, loop.amount * 0.005) && (!m.currency || !loop.currency || m.currency === loop.currency));
  }
  // One open loop and one notice -> { verdict: 'close'|'ask', kind } or null.
  function evidenceFor(loop, msg) {
    if (!loop || !msg) return null;
    const text = String(msg.text || '') + ' ' + String(msg.subject || '');
    if (msg.authPass === false || !(signals && signals.trustedSender && signals.trustedSender(msg.fromEmail))) return null;
    if (!CREDIT.test(text) || NOT_YET.test(text) || FAILED.test(text) || SENT_OUT.test(text) || PROMO.test(text)) return null;
    const named = names(loop, text);
    if (!named && namesAnyMerchant(text)) return null;                                  // credited by someone else
    if (loop.amount > 0) {
      const remaining = loop.amount - (Number(loop.received) || 0);
      const fit = amountFits(Object.assign({}, loop, { amount: remaining }), text);
      if (fit === true) return named ? { verdict: 'close', kind: 'card' } : { verdict: 'ask', kind: 'card' };
      // A refund in parts: a smaller credit from the NAMED merchant is counted, never closed, and never from an unnamed one.
      if (named) {
        const part = amountsIn(text).filter((m) => m.value > 0 && m.value < remaining - 0.5 && (!m.currency || !loop.currency || m.currency === loop.currency));
        if (part.length === 1) return { verdict: 'partial', kind: 'card', amount: part[0].value };
      }
      return null;
    }
    return named ? { verdict: 'close', kind: 'card' } : null;                           // no amount on the loop: the name must be there
  }
  // Open loops and one notice -> { loopId, verdict, kind } or null. opts.enabled is the switch.
  function judge(loops, msg, opts) {
    if (!opts || opts.enabled !== true || !msg) return null;
    const open = (Array.isArray(loops) ? loops : []).filter((l) => l && l.status === 'open');
    const hits = open.map((l) => ({ l, e: evidenceFor(l, msg) })).filter((h) => h.e);
    if (hits.length !== 1) return null;
    return Object.assign({ loopId: hits[0].l.id, verdict: hits[0].e.verdict, kind: hits[0].e.kind }, hits[0].e.amount ? { amount: hits[0].e.amount } : {});
  }
  // A part of the refund arrived: add it once per notice id. The loop stays open until the parts reach the amount;
  // the notice that completes it is a 'close' from judge, because judge compares with what is still missing.
  function partialPatch(loop, decision, msgMeta, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const parts = Array.isArray(loop.parts) ? loop.parts.slice() : [];
    const id = (msgMeta && msgMeta.id) || null;
    if (!id || parts.some((x) => x.externalId === id)) return { parts, received: Number(loop.received) || 0 };
    parts.push({ externalId: id, amount: decision.amount, fetchedBack: Boolean(msgMeta && msgMeta.fetchedBack), verifiedAt: t });
    return { parts, received: Math.round(((Number(loop.received) || 0) + decision.amount) * 100) / 100 };
  }

  // The close, with the notice as proof. The caller read the notice back by id (fetchedBack) before passing it here.
  function closePatch(loop, decision, msgMeta, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'closed', closedAs: 'refunded', closedAt: t, proof: { system: 'mail', externalId: (msgMeta && msgMeta.id) || null, fetchedBack: Boolean(msgMeta && msgMeta.fetchedBack), verifiedAt: t, kind: decision.kind } };
  }
  function releasePatch(reason, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'closed', closedAs: 'released', closedAt: t, releaseReason: reason ? String(reason).slice(0, 80) : null, proof: null };
  }
  function reopenPatch() { return { status: 'open', closedAs: null, closedAt: null, proof: null, releaseReason: null }; }

  // What to put in front of the person today: no answer past the chase day, money not back past the day they gave,
  // a refusal to decide on, or something they asked for. Oldest first. Never sends; the card offers a draft.
  function due(loops, now) {
    const today = iso(new Date(typeof now === 'number' ? now : Date.now()));
    const out = [];
    (Array.isArray(loops) ? loops : []).forEach((l) => {
      if (!l || l.status !== 'open') return;
      if (l.stage === 'asked' && l.chaseIso && l.chaseIso <= today) out.push({ id: l.id, why: 'no-answer', since: l.chaseIso });
      else if (l.stage === 'approved' && l.expectIso && l.expectIso < today) out.push({ id: l.id, why: 'not-back', since: l.expectIso });
      else if (l.stage === 'declined') out.push({ id: l.id, why: 'declined', since: l.chaseIso || today });
      else if (l.stage === 'needs-you') out.push({ id: l.id, why: 'needs-you', since: l.chaseIso || today });
      else if (l.stage === 'store-credit') out.push({ id: l.id, why: 'store-credit', since: l.chaseIso || today });
    });
    return out.sort((a, b) => String(a.since).localeCompare(String(b.since)));
  }

  return { SWITCH, SWITCH_DEFAULT, ask, reply, evidenceFor, judge, closePatch, partialPatch, releasePatch, reopenPatch, due };
})();

if (typeof module !== 'undefined') module.exports = { FlowRefundLoop };
