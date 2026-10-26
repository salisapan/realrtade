// A bill is closed only when it is paid. Portable: no chrome.*, no DOM, no network.
//
// Why this exists. A bill the person received ("מצורפת חשבונית 4471 על סך 2,340 ₪, לתשלום עד 10/11") becomes a Pay task
// (core/chat-payment-ask.js and the PAYMENT_ASK switch). The task is preparation: written and read back, it is not a paid
// bill. This file decides, from a message the person opened or sent, that the money really went to THAT payee, so the
// bill can be closed with proof, and it lists the bills that passed their due day with no such proof.
//
// The evidence, strongest first (switch: opts.enabled; it joins core/labs-switches.js as BILL_PAID, off, when it is wired):
//   payee     the payee's own receipt: from the payee's address (or their organisation's domain), receipt words, and the
//             same amount or the same invoice number                                              -> close
//   bank      a bank, card or payment-provider email (core/outside-signals.js trusted senders) that money went OUT for
//             that amount, naming that payee                                                      -> close
//             the same with no recipient named at all                                              -> ask once ("Was this the bill?")
//   own       the person's own message to the payee that says it was paid, or carries a transfer confirmation, for
//             that amount or invoice                                                               -> close
// Never evidence: a failed or declined payment, a reminder or "not yet paid", a scheduled or future charge, money coming
// IN, a refund, a payment to someone else, a promise to pay. Two open bills that fit equally: silence.
// Glance never pays and never touches a bank. Nothing here stores the message text: a close keeps the message id as proof.
const FlowBillPaid = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const signals = sibling(typeof FlowOutsideSignals !== 'undefined' ? FlowOutsideSignals : null, './outside-signals.js', 'FlowOutsideSignals');

  const OUT_EN = /\b(?:you (?:sent|paid)|paid to|sent to|transferred to|transfer to|payment to|your payment (?:is complete|was successful|has been sent)|was made from your account|debited|charged)\b/i;
  const OUT_HE = /(?:בוצעה העברה|העברה יוצאת|(?:^|\s)העברת(?=\s)|חויב(?:ה)?(?: כרטיסך| חשבונך)?|שולם ל|תשלום ל|התשלום (?:בוצע|עבר)|בוצע תשלום)/;
  const FAILED = /\b(?:failed|declined|unsuccessful|could not|was not (?:completed|processed|sent)|reversed|returned)\b|(?:לא בוצעה|לא בוצע|נכשל|נכשלה|נדחה|נדחתה|הוחזרה)/i;
  const FUTURE = /\b(?:scheduled|will be (?:charged|debited|paid|sent)|is set for|upcoming|auto-?pay on)\b|(?:יחויב|תחויב|יחויבו|מתוזמנת?|בהוראת קבע|יבוצע|תבוצע)/i;
  const REMINDER = /\b(?:reminder|overdue|outstanding|not (?:yet )?(?:been )?paid|unpaid|past due|still due|balance due)\b|(?:תזכורת|טרם שולמה?|לא שולמה?|יתרה לתשלום|נבקש להסדיר|ממתין לתשלום)/i;
  const MONEY_IN = /\b(?:refund(?:ed)?|you received|received from|credited to your|has been credited|deposit(?:ed)?)\b|(?:החזר|התקבל(?:ה)? (?:העברה|תשלום)|זוכה|זיכוי|הופקד)/i;
  const PAYEE_RECEIPT = /\b(?:payment received|receipt|thank you for (?:your )?payment|paid in full|amount paid|we(?:'ve| have) received your payment)\b|(?:(?:^|[\s,.(:"'])קבלה(?=$|[\s,.)!?:"'])|תודה על התשלום|התשלום התקבל|שולם במלואו|קיבלנו את התשלום)/i;
  const OWN_PAID = /\b(?:i(?:'ve| have)? (?:just |already )?(?:paid|transferred|wired|sent (?:the |you )?(?:payment|money|transfer))|(?:payment|transfer) (?:is |was |has been )?(?:sent|done|made)|paid it)\b|(?:שילמתי|העברתי|ביצעתי (?:את ה)?העברה|שלחתי (?:את ה)?(?:תשלום|כסף))/i;
  const OWN_NOT_YET = /\b(?:i(?:'ll| will)|will pay|going to pay|next week|once (?:the|my)|when (?:the|my))\b|(?:אשלם|אעביר|בשבוע הבא|כשה(?:לקוח|כסף))/i;
  const TRANSFER_FILE = /(?:אישור[ _-]?(?:העברה|תשלום)|transfer[ _-]?confirm|payment[ _-]?confirm|receipt)/i;
  const GENERIC = ['חברת', 'משרד', 'בע"מ', 'בעמ', 'של', 'גן', 'ltd', 'inc', 'co', 'llc', 'the', 'company', 'group', 'and', 'עו"ד', 'רו"ח'];

  function norm(s) { return String(s || '').toLowerCase().replace(/[״"']/g, '"').replace(/[^a-z0-9֐-׿" ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function tokens(s) { return norm(s).split(' ').filter((t) => t.length >= 3 && GENERIC.indexOf(t) < 0); }
  function domainOf(email) { const m = /@([^>\s]+)>?\s*$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : ''; }
  const FREEMAIL = /^(?:gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|walla|012|bezeqint|netvision|zahav|gmx|yandex)\.[a-z.]+$/i;
  function samePayee(bill, email) {
    const a = String(email || '').trim().toLowerCase(), b = String(bill.email || '').trim().toLowerCase();
    if (a && b && a === b) return true;
    const da = domainOf(a), db = domainOf(b);
    return Boolean(da && db && da === db && !FREEMAIL.test(da));
  }
  const sameAmount = (a, b) => Math.abs(a - b) <= Math.max(0.5, a * 0.005);
  function amountsIn(text) {
    const out = [];
    if (!extract || !extract.parseMoney) return out;
    String(text || '').split(/(?<=[.!?])\s+|\n+|,\s+|;\s*/).forEach((c) => { const m = extract.parseMoney(c); if (m && m.value > 0) out.push(m); });
    return out;
  }
  function hasAmount(bill, text) {
    return amountsIn(text).some((m) => sameAmount(bill.amount, m.value) && (!bill.currency || !m.currency || bill.currency === m.currency));
  }
  function hasInvoiceNo(bill, text) {
    if (!bill.invoiceNo) return false;
    const n = String(bill.invoiceNo).replace(/[^A-Za-z0-9-]/g, '');
    return n.length >= 3 && new RegExp('(?:^|[^A-Za-z0-9])' + n.replace(/-/g, '\\-') + '(?![A-Za-z0-9])', 'i').test(String(text || ''));
  }
  // Who the money went to, when the message says: "to Maya Studio", «לטובת אבי אינסטלציה», «בבית העסק חברת החשמל», «העברת 2,100 ₪ לרון».
  function recipientIn(text) {
    const t = String(text || '');
    let m = /(?:לטובת|בבית העסק|לבית העסק)\s+([^\s.,]+(?:\s+[^\s.,]+){0,2})/.exec(t);
    if (m) return m[1];
    m = /(?:₪|ש["״]ח|שקלים?)\s+ל([^\s.,]+(?:\s+[^\s.,]+){0,2})/.exec(t);
    if (m && !/^(?:חשבונ|כרטיס)/.test(m[1])) return m[1];
    m = /\b(?:to|paid)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/.exec(t);
    if (m && !/^(?:Your|Our|The|My)$/.test(m[1].split(/\s+/)[0])) return m[1];
    return null;
  }
  function names(bill, text) { return tokens(bill.payee).some((tok) => norm(text).indexOf(tok) >= 0); }

  // One bill and one message -> 'close' | 'ask' | null, with the kind of evidence.
  // msg: { dir: 'in'|'out', fromEmail, toEmail, text, subject, attachments: [names] }
  function evidenceFor(bill, msg) {
    const text = String((msg && msg.text) || '') + ' ' + String((msg && msg.subject) || '');
    if (!bill || !(bill.amount > 0)) return null;
    if (msg.dir === 'out') {
      if (!samePayee(bill, msg.toEmail)) return null;
      if (OWN_NOT_YET.test(text) || !OWN_PAID.test(text)) return null;
      const file = (msg.attachments || []).some((f) => TRANSFER_FILE.test(String(f)));
      return hasAmount(bill, text) || hasInvoiceNo(bill, text) || file ? { verdict: 'close', kind: 'own' } : null;
    }
    if (FAILED.test(text) || FUTURE.test(text) || REMINDER.test(text) || MONEY_IN.test(text)) return null;
    if (samePayee(bill, msg.fromEmail)) {
      return PAYEE_RECEIPT.test(text) && (hasAmount(bill, text) || hasInvoiceNo(bill, text)) ? { verdict: 'close', kind: 'payee' } : null;
    }
    if (!(signals && signals.trustedSender && signals.trustedSender(msg.fromEmail))) return null;
    if (!(OUT_EN.test(text) || OUT_HE.test(text)) || !hasAmount(bill, text)) return null;
    const to = recipientIn(text);
    if (to) return names(bill, to) ? { verdict: 'close', kind: 'bank' } : null;     // paid someone else: not this bill
    return names(bill, text) ? { verdict: 'close', kind: 'bank' } : { verdict: 'ask', kind: 'bank' };
  }

  // Open bills and one message -> { billId, verdict, kind } or null. opts.enabled is the switch (BILL_PAID).
  function judge(bills, msg, opts) {
    if (!opts || opts.enabled !== true || !msg) return null;
    const open = (Array.isArray(bills) ? bills : []).filter((b) => b && b.status !== 'paid' && b.status !== 'released');
    const hits = open.map((b) => ({ b, e: evidenceFor(b, msg) })).filter((x) => x.e);
    if (hits.length !== 1) return null;                               // none, or two bills fit: do not guess
    return { billId: hits[0].b.id, verdict: hits[0].e.verdict, kind: hits[0].e.kind };
  }

  // The close, with the message as proof. The caller read the message (fetchedBack) before passing it here.
  function closePatch(bill, decision, msgMeta, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'paid', paidAt: t, closedAs: 'paid', proof: { system: 'mail', externalId: (msgMeta && msgMeta.id) || null, fetchedBack: Boolean(msgMeta && msgMeta.fetchedBack), verifiedAt: t, kind: decision.kind } };
  }

  // Bills past their due day with no proof yet, most overdue first. The card says "not paid yet"; it never pays.
  function overdue(bills, now) {
    const d = new Date(typeof now === 'number' ? now : Date.now());
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return (Array.isArray(bills) ? bills : []).filter((b) => b && b.status !== 'paid' && b.status !== 'released' && b.dueIso && b.dueIso < today)
      .sort((a, b) => a.dueIso.localeCompare(b.dueIso));
  }

  return { judge, evidenceFor, closePatch, overdue, recipientIn };
})();

if (typeof module !== 'undefined') module.exports = { FlowBillPaid };
