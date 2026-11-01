// The receipt you owe once you are paid. Portable: no chrome.*, no DOM, no network.
//
// Why this exists. A payment loop (core/follow-up.js, kind 'payment', money owed TO the person) closes as 'paid' when the
// money really arrived (core/money-arrived.js, resolvedBy 'notice') or the person marked it paid (resolvedBy 'manual').
// For an Israeli freelancer that is not the end: a receipt (קבלה) is owed to the payer for that money. Nothing opens that
// loop today unless the payer asks for one (core/resolution.js). This file opens it, and closes it only on proof that the
// receipt reached the payer. Glance never issues, generates or sends a receipt.
//
// Switch: opts.enabled (RECEIPT_OWED, default off; it joins core/labs-switches.js only when it is wired). Off: every
// function that decides returns null.
//
// Opens (owe) only when ALL hold:
//   - a payment loop, direction 'theirs', resolved, closedAs 'paid';
//   - resolvedBy 'notice' (the bank or app said the money came in) or 'manual' (the person said so). The payer's own
//     "I paid" (resolvedBy 'reply') is a claim, and a receipt certifies money received: silence;
//   - an amount, in shekels (or no currency on a Hebrew loop);
//   - the document was not already a combined tax invoice-receipt («חשבונית מס קבלה», "invoice-receipt");
//   - the person's profile does not say their invoicing system sends receipts on its own (profile.receiptsAuto).
// Closes (judge) only on:
//   own     a message the person SENT to the payer (same address, or the payer's organisation domain, never free mail)
//           with a real attachment named as a receipt («קבלה», "receipt"; «חשבונית מס קבלה» counts, «חשבונית» alone
//           does not), and no other amount in the text                                                      -> close
//   issuer  the person's invoicing system (an allowlisted sender that passed authentication) saying a receipt was issued
//           or sent to that payer, by name, with the same amount or no amount                                 -> close
// Never: "attached" with no attachment, an invoice file, a promise ("I'll send it tomorrow"), a draft or preview, a
// cancelled receipt, a receipt to someone else or for another amount, the payer's thanks, someone else's receipt to the
// person. Two owed receipts that fit equally: silence. A close keeps the message id as proof, never the text.
const FlowReceiptOwed = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  const SWITCH = 'RECEIPT_OWED';
  const SWITCH_DEFAULT = false;
  const DAY = 86400000;

  const COMBINED = /חשבונית\s*מס[\s\-\/]*קבלה|חשבונית[\s\-\/]+קבלה|\binvoice[\s\-\/]*receipt\b|\btax invoice[\s\-\/]+receipt\b/i;
  const RECEIPT_FILE = /(?:^|[^א-ת])קבל(?:ה|ות)(?=$|[^א-ת])|\breceipts?\b|(?:^|[_\-\s.])receipt/i;
  const RECEIPT_WORD = /(?:^|[^א-ת])קבל(?:ה|ות)(?=$|[^א-ת])|\breceipts?\b/i;
  const ISSUED = /\b(?:was sent|has been sent|sent to|was issued|has been issued|issued (?:to|for))\b|(?:נשלחה|נשלח|הופקה|הופק|יצאה)/i;
  const DRAFT = /\b(?:draft|preview|not (?:yet )?(?:issued|sent))\b|(?:טיוט|טרם הופק|טרם נשלח|לא הופק|לא נשלח|תצוגה מקדימה)/i;
  const CANCELLED = /\b(?:cancel(?:l)?ed|void(?:ed)?|credit note|refund)\b|(?:בוטל|מבוטל|ביטול|חשבונית זיכוי|זיכוי)/i;
  const PROMISE = /\b(?:i(?:'ll| will)|will send|tomorrow|later|next week|soon)\b|(?:אשלח|אוציא|אפיק|מחר|בהמשך|בשבוע הבא)/i;
  // Invoicing systems that send the person a copy when a receipt goes out. Domain suffixes, never a display name.
  const ISSUERS = ['greeninvoice.co.il', 'morning.co', 'mymorning.co.il', 'icount.co.il', 'ezcount.co.il', 'rivhit.co.il', 'invoice4u.co.il', 'sumit.co.il', 'cardcom.co.il', 'yeshinvoice.co.il', 'tamal.co.il'];
  const FREEMAIL = /^(?:gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|walla|012|bezeqint|netvision|zahav|gmx|yandex)\.[a-z.]+$/i;
  const GENERIC = ['חברת', 'משרד', 'בע"מ', 'בעמ', 'של', 'ltd', 'inc', 'llc', 'the', 'company', 'group', 'and', 'studio', 'סטודיו'];

  function norm(s) { return String(s || '').toLowerCase().replace(/[״"']/g, '"').replace(/[^a-z0-9֐-׿" ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function tokens(s) { return norm(s).split(' ').filter((t) => t.length >= 2 && GENERIC.indexOf(t) < 0); }
  function domainOf(email) { const m = /@([^>\s]+)>?\s*$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : ''; }
  function samePayer(owed, email) {
    const a = String(email || '').trim().toLowerCase(), b = String(owed.email || '').trim().toLowerCase();
    if (a && b && a === b) return true;
    const da = domainOf(a), db = domainOf(b);
    return Boolean(da && db && da === db && !FREEMAIL.test(da));
  }
  function trustedIssuer(email) {
    const d = domainOf(email);
    return Boolean(d) && ISSUERS.some((s) => d === s || d.endsWith('.' + s));
  }
  // A Hebrew name may carry a one-letter prefix in running text: «אל דנה», «לדנה», «מדנה».
  function namesPayer(owed, text) {
    const toks = tokens(owed.payer);
    if (!toks.length) return false;
    const words = norm(text).split(' ');
    const hit = (tok) => words.some((w) => w === tok || (/^[א-ת]/.test(tok) && /^[לבמהו]/.test(w) && w.slice(1) === tok));
    return toks.every(hit);
  }
  const sameAmount = (a, b) => Math.abs(a - b) <= Math.max(0.5, a * 0.005);
  function amountsIn(text) {
    const out = [];
    if (!extract || !extract.parseMoney) return out;
    String(text || '').split(/(?<=[.!?])\s+|\n+|,\s+|;\s*/).forEach((c) => {
      const m = extract.parseMoney(c.replace(/(?:#|מס['׳"]?\s*|no\.?\s*|number\s*)\d+/gi, ' '));
      if (m && m.value > 0) out.push(m);
    });
    return out;
  }
  // true: the same amount is there; false: another amount is there; null: no amount at all.
  function amountFits(owed, text) {
    const all = amountsIn(text);
    if (!all.length) return null;
    return all.some((m) => sameAmount(owed.amount, m.value) && (!m.currency || m.currency === (owed.currency || 'ILS')));
  }
  function addWorkdays(t, n) {
    let d = new Date(t), left = n;
    while (left > 0) { d = new Date(d.getTime() + DAY); const wd = d.getDay(); if (wd !== 5 && wd !== 6) left--; }
    return d;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function money(value) { return '₪' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  // "Done when": the same words on the loop, the card and the panel.
  function doneText(owed) {
    const who = owed.payer || owed.email || (owed.lang === 'he' ? 'המשלם' : 'the payer');
    return owed.lang === 'he'
      ? 'קבלה על ' + money(owed.amount) + ' נשלחה אל ' + who + ', כקובץ מצורף'
      : 'A receipt for ' + money(owed.amount) + ' sent to ' + who + ', as a real attachment';
  }

  // A closed payment loop -> the receipt now owed for it, or null.
  function owe(loop, opts) {
    const o = opts || {};
    if (o.enabled !== true || !loop) return null;
    if (loop.kind !== 'payment' || loop.direction !== 'theirs') return null;
    if (loop.status !== 'resolved' || loop.closedAs !== 'paid') return null;
    if (['notice', 'manual'].indexOf(loop.resolvedBy) < 0) return null;            // a claim is not money received
    const amt = loop.amount && Number(loop.amount.value);
    if (!(amt > 0)) return null;
    const cur = loop.amount.currency || (loop.lang === 'he' ? 'ILS' : null);
    if (cur !== 'ILS') return null;
    if (COMBINED.test(String(loop.what || '') + ' ' + String(loop.subject || '')) || loop.subtype === 'invoice-receipt') return null;
    if (o.profile && o.profile.receiptsAuto === true) return null;
    const cp = loop.counterpart || {};
    if (!cp.email && !cp.name) return null;
    const paidAt = typeof loop.resolvedAt === 'number' ? loop.resolvedAt : (typeof o.now === 'number' ? o.now : Date.now());
    const owed = {
      id: 'receipt:' + String(loop.id || loop.threadId || ''),
      kind: 'receipt-owed',
      fromLoop: loop.id || loop.threadId || null,
      threadId: loop.threadId || loop.id || null,
      payer: cp.name || null,
      email: cp.email || null,
      amount: amt,
      currency: 'ILS',
      invoiceNo: loop.invoiceNo || null,
      lang: loop.lang === 'he' ? 'he' : 'en',
      paidAt,
      dueIso: iso(new Date(paidAt)),
      chaseIso: iso(addWorkdays(paidAt, 2)),
      status: 'open',
      closedAs: null,
      proof: null
    };
    owed.done = doneText(owed);
    return owed;
  }

  // One owed receipt and one message -> { verdict: 'close', kind } or null.
  // msg: { dir: 'in'|'out', fromEmail, toEmail, text, subject, attachments: [names], authPass }
  function evidenceFor(owed, msg) {
    if (!owed || !msg || !(owed.amount > 0)) return null;
    const text = String(msg.text || '') + ' ' + String(msg.subject || '');
    if (msg.dir === 'out') {
      if (!samePayer(owed, msg.toEmail)) return null;
      const files = (msg.attachments || []).map(String).filter((f) => RECEIPT_FILE.test(f));
      if (!files.length) return null;                                                // "attached" is not an attachment
      if (CANCELLED.test(text)) return null;
      if (amountFits(owed, text) === false) return null;                             // a receipt for another amount
      return { verdict: 'close', kind: 'own' };
    }
    if (msg.dir !== 'in' || msg.authPass === false || !trustedIssuer(msg.fromEmail)) return null;
    if (!RECEIPT_WORD.test(text) || !ISSUED.test(text) || DRAFT.test(text) || CANCELLED.test(text)) return null;
    if (!namesPayer(owed, text)) return null;
    if (amountFits(owed, text) === false) return null;
    return { verdict: 'close', kind: 'issuer' };
  }

  // Open owed receipts and one message -> { owedId, verdict, kind } or null. opts.enabled is the switch.
  function judge(owedList, msg, opts) {
    if (!opts || opts.enabled !== true || !msg) return null;
    if (msg.dir === 'out' && PROMISE.test(String(msg.text || '')) && !(msg.attachments || []).length) return null;
    const open = (Array.isArray(owedList) ? owedList : []).filter((x) => x && x.status === 'open');
    const hits = open.map((x) => ({ x, e: evidenceFor(x, msg) })).filter((h) => h.e);
    if (hits.length !== 1) return null;                                              // none, or two fit: do not guess
    return { owedId: hits[0].x.id, verdict: hits[0].e.verdict, kind: hits[0].e.kind };
  }

  // The close, with the message as proof. The caller read the message back by id (fetchedBack) before passing it here.
  function closePatch(owed, decision, msgMeta, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'closed', closedAs: 'delivered', closedAt: t, proof: { system: 'mail', externalId: (msgMeta && msgMeta.id) || null, fetchedBack: Boolean(msgMeta && msgMeta.fetchedBack), verifiedAt: t, kind: decision.kind } };
  }
  // A deliberate release ("the invoice already was an invoice-receipt", "not a business payment") is a true close too.
  function releasePatch(reason, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'closed', closedAs: 'released', closedAt: t, releaseReason: reason ? String(reason).slice(0, 80) : null, proof: null };
  }
  // Reopen / Undo of a close: back to open, proof dropped.
  function reopenPatch() { return { status: 'open', closedAs: null, closedAt: null, proof: null, releaseReason: null }; }
  // Owed receipts past their chase day, oldest first.
  function due(owedList, now) {
    const today = iso(new Date(typeof now === 'number' ? now : Date.now()));
    return (Array.isArray(owedList) ? owedList : []).filter((x) => x && x.status === 'open' && x.chaseIso && x.chaseIso <= today)
      .sort((a, b) => a.chaseIso.localeCompare(b.chaseIso));
  }

  return { SWITCH, SWITCH_DEFAULT, owe, evidenceFor, judge, closePatch, releasePatch, reopenPatch, due, doneText, trustedIssuer };
})();

if (typeof module !== 'undefined') module.exports = { FlowReceiptOwed };
