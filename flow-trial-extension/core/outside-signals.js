// Loops that close without the other person replying: reality moved somewhere that is not
// the thread. Portable: no chrome.*, no DOM, no network. The caller fetches the evidence
// (a bank or payment-provider email the person has just opened, calendar events, Drive
// files) and hands it here as plain data; this file decides whether it settles a loop.
//
//   payment   an email from a bank or payment provider saying money arrived, for the amount
//             a payment loop is waiting on        -> "paid"
//   calendar  an event that now exists with the person a "pick a time" loop is waiting on  -> "scheduled"
//   drive     a file named for the thing you promised, shared with the person you promised it to -> "kept"
//
// Closing a loop that is still open is the one expensive mistake (core/follow-up.js), so:
//   - evidence is only ever matched to ONE loop. Two loops that fit equally: no match, silence.
//   - 'strong' evidence closes with a receipt and Reopen, exactly as a reply that says "paid" does;
//     'ask' evidence puts one question on the loop ("Looks paid: Mark paid?") and never closes alone.
//   - a dismissed proposal is remembered on the loop (signalDismissed) and is never asked again.
// Nothing here reads mail the person did not open, and nothing here stores the evidence's text:
// a loop keeps only a short label ("a payment of ₪3,850 from your bank").
const FlowOutsideSignals = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const requestTypes = sibling(typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null, './request-types.js', 'FlowRequestTypes');

  const KINDS = { PAYMENT: 'payment' };
  const CALENDAR_LOOKBACK_MS = 120 * 24 * 3600 * 1000;

  // ---- payment evidence ---------------------------------------------------------------
  // Data, not code: senders that are banks or payment processors. A confirmation from anyone else
  // (a client saying "I sent it") is a reply, which core/follow-up.js already handles.
  const TRUSTED_DOMAINS = [
    'paypal.com', 'stripe.com', 'wise.com', 'payoneer.com', 'revolut.com', 'square.com', 'venmo.com', 'paddle.com',
    'bitpay.com', 'bit.co.il', 'payboxapp.com', 'paybox.co.il', 'isracard.co.il', 'cal-online.co.il', 'max.co.il',
    'bankhapoalim.co.il', 'hapoalim.co.il', 'leumi.co.il', 'bankleumi.co.il', 'discountbank.co.il', 'mizrahi-tefahot.co.il',
    'fibi.co.il', 'bank-yahav.co.il', 'pepper.co.il', 'onezero.co.il', 'cardcom.solutions', 'tranzila.com', 'meshulam.co.il',
    'icount.co.il', 'greeninvoice.co.il', 'morning.co', 'invoice4u.co.il', 'chase.com', 'bankofamerica.com', 'wellsfargo.com',
    'citi.com', 'barclays.co.uk', 'hsbc.com', 'lloydsbank.com', 'natwest.com'
  ];
  const RECEIVED_EN = /\b(?:you(?:'ve| have)? (?:received|been paid)|(?:payment|transfer|deposit|funds|money) (?:has been |was |is )?(?:received|credited|deposited|arrived|posted)|(?:incoming|received) (?:payment|transfer|wire)|has (?:paid|sent) you|sent you [$€£]|credited to your account|new deposit)\b/i;
  const RECEIVED_HE = /(?:התקבל(?:ה|ו)? (?:תשלום|העברה|הפקדה)|קיבלת (?:תשלום|העברה)|זוכה חשבונך|זוכה החשבון|הופקד(?:ה|ו)? (?:בחשבונך|לחשבונך)|הועבר(?:ה|ו)? (?:אליך|לחשבונך|לחשבונכם)|העברה נכנסת|תקבול|שילם לך|שלח לך)/;
  // Money going OUT of the account, a refund, or a request to pay: not evidence that someone paid you.
  const NOT_RECEIVED_EN = /\b(?:you (?:paid|sent)|your payment (?:to|of)|payment (?:due|failed|declined|reminder)|invoice (?:due|from)|refund|charged|debited|withdrawal|request(?:ed)? (?:a )?payment|pay now|failed|declined|overdue)\b/i;
  const NOT_RECEIVED_HE = /(?:חויבת|חויב חשבונך|נגבה|משיכה|החזר|בקשה לתשלום|תשלום נכשל|לתשלום עד|תזכורת תשלום|שילמת|העברת)/;

  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function domainOf(email) { const m = /@([^>\s]+)>?\s*$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : ''; }
  function trustedSender(email) {
    const d = domainOf(email);
    return Boolean(d) && TRUSTED_DOMAINS.some((t) => d === t || d.endsWith('.' + t));
  }
  function amountsIn(text) {
    const t = String(text || '');
    const out = [];
    if (!extract || !extract.parseMoney) return out;
    // Every sentence separately, so "Balance: ₪20,000" next to "received ₪3,850" does not win by position.
    t.split(/(?<=[.!?])\s+|\n+/).forEach((s) => { if (RECEIVED_EN.test(s) || RECEIVED_HE.test(s)) { const m = extract.parseMoney(s); if (m && m.value > 0) out.push(m); } });
    return out;
  }
  function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿ ]/g, ' ').replace(/\s+/g, ' ').trim(); }

  // One opened email -> evidence or null. { amount:{value,currency}, trusted, nameText }.
  // No evidence from a message that reads as money going out, a refund or a reminder.
  function paymentEvidence(text, fromEmail) {
    const t = String(text || '').slice(0, 4000);
    if (!t || (NOT_RECEIVED_EN.test(t) && !RECEIVED_EN.test(t)) || (NOT_RECEIVED_HE.test(t) && !RECEIVED_HE.test(t))) return null;
    if (!(RECEIVED_EN.test(t) || RECEIVED_HE.test(t))) return null;
    const amounts = amountsIn(t);
    if (amounts.length !== 1) return null;   // none, or several: say nothing
    const trusted = trustedSender(fromEmail);
    return { amount: { value: amounts[0].value, currency: amounts[0].currency || null }, trusted, nameText: normName(t) };
  }

  const sameAmount = (a, b) => Math.abs(a - b) <= Math.max(0.5, a * 0.005);
  // An invoice loop opened "plus VAT" also matches the net figure (the client may pay either); no other loop has amountNet.
  const loopAmountMatches = (w, v) => sameAmount(w.amount.value, v) || Boolean(w.amountNet && w.amountNet.value > 0 && sameAmount(w.amountNet.value, v));
  const sameCurrency = (a, b) => !a || !b || a === b;

  // Waiting payment loops the evidence could settle. Evidence never closes a payment loop
  // that is not waiting on money to come TO the person (direction 'theirs').
  function matchPayment(watches, ev, now) {
    if (!ev || !ev.amount) return null;
    const cand = (watches || []).filter((w) => w && w.status === 'waiting' && w.kind === KINDS.PAYMENT && w.direction !== 'mine' && w.direction !== 'clock'
      && w.amount && loopAmountMatches(w, ev.amount.value) && sameCurrency(w.amount.currency, ev.amount.currency)
      && !(w.signalDismissed || []).includes('payment')
      && (typeof w.createdAt !== 'number' || (typeof now === 'number' ? now : Date.now()) >= w.createdAt));
    if (cand.length !== 1) return null;       // none, or two loops for the same amount: do not guess
    const w = cand[0];
    const first = normName((w.counterpart && w.counterpart.name) || '').split(' ')[0];
    const named = first.length >= 3 && ev.nameText.indexOf(first) >= 0;
    const strong = Boolean(ev.trusted && named);
    return { kind: 'payment', watchId: w.id, strength: strong ? 'strong' : 'ask', named, trusted: Boolean(ev.trusted) };
  }

  // ---- calendar evidence --------------------------------------------------------------
  // events: [{ id, startIso, createdMs, organizer, attendees:[{ email, response }], status }]. A "pick a time" loop is settled when a
  // meeting with the person EXISTS BECAUSE THEY AGREED: they accepted the invite, or they organised it. An event you created and invited
  // them to is preparation, not completion: until they accept it, the loop stays open (and Glance never counts its own Do It events).
  function isScheduleLoop(w) { return Boolean(w) && /^schedule(?::|$)/.test(String(w.subtype || '')); }
  function agreed(e, email) {
    if (String(e.organizer || '').toLowerCase() === email) return true;
    return (e.attendees || []).some((a) => a && String(a.email || a).toLowerCase() === email && a.response === 'accepted');
  }
  function matchCalendar(watch, events, now) {
    if (!watch || watch.status !== 'waiting' || watch.direction === 'clock' || !isScheduleLoop(watch)) return null;
    if ((watch.signalDismissed || []).includes('calendar')) return null;
    const email = String((watch.counterpart && watch.counterpart.email) || '').toLowerCase();
    if (!email) return null;
    const t = typeof now === 'number' ? now : Date.now();
    const hits = (events || []).filter((e) => e && e.status !== 'cancelled' && agreed(e, email)
      && typeof e.createdMs === 'number' && e.createdMs >= (watch.createdAt || 0) && e.createdMs <= t
      && e.startIso && Date.parse(e.startIso) >= (watch.createdAt || 0) - 24 * 3600 * 1000);
    if (hits.length !== 1) return null;
    return { kind: 'calendar', watchId: watch.id, strength: 'strong', eventId: hits[0].id, startIso: hits[0].startIso };
  }

  // ---- drive evidence -----------------------------------------------------------------
  // files: [{ id, name, modifiedMs, sharedWith:[email,...] }]. A promise of a document (direction 'mine',
  // with an object like quote/proposal/contract) is settled when a file named for it, changed after the promise,
  // is shared with the person it was promised to. A weaker signal than the others, so it only asks.
  function matchDrive(watch, files) {
    if (!watch || watch.status !== 'waiting' || watch.direction !== 'mine') return null;
    if ((watch.signalDismissed || []).includes('drive')) return null;
    const obj = String(watch.subtype || '').split(':')[1];
    const email = String((watch.counterpart && watch.counterpart.email) || '').toLowerCase();
    if (!obj || !email || !requestTypes) return null;
    const ent = (requestTypes.OBJECTS || []).find((o) => o.id === obj);
    if (!ent || obj === 'details' || obj === 'document') return null;   // too generic to name a file
    const hits = (files || []).filter((f) => f && typeof f.modifiedMs === 'number' && f.modifiedMs >= (watch.createdAt || 0)
      && (f.sharedWith || []).some((s) => String(s).toLowerCase() === email)
      && (ent.enRe.test(f.name || '') || (hasHebrew(f.name) && ent.heRe.some((r) => r.test(f.name)))));
    if (hits.length !== 1) return null;
    return { kind: 'drive', watchId: watch.id, strength: 'ask', fileId: hits[0].id, fileName: String(hits[0].name || '').slice(0, 80) };
  }

  // What the loop shows and does. `line` is plain copy for the receipt / the question (no AI wording, per
  // docs/product-identity.md); `patch` is what a yes writes; `dismiss` is what a "not yet" writes.
  function proposal(watch, signal, now, opts) {
    const t = typeof now === 'number' ? now : Date.now();
    const he = watch && watch.lang === 'he';
    const who = (watch && watch.counterpart && (watch.counterpart.name || watch.counterpart.email)) || '';
    const o = opts || {};
    if (signal.kind === 'payment') {
      const amt = o.amountLabel || '';
      return {
        question: he ? 'נראה ששולם' + (amt ? ' ' + amt : '') + (who ? ' · ' + who : '') : 'Looks paid' + (amt ? ': ' + amt : '') + (who ? ' · ' + who : ''),
        receipt: he ? 'שולם · התקבל תשלום' + (amt ? ' ' + amt : '') : 'Paid · a payment' + (amt ? ' of ' + amt : '') + ' arrived',
        yes: he ? 'סמן כשולם' : 'Mark paid', no: he ? 'עדיין לא' : 'Not yet',
        patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'signal', closedAs: 'paid', signalKind: 'payment' }
      };
    }
    if (signal.kind === 'calendar') {
      return {
        question: he ? 'הם אישרו ביומן' : 'They accepted: it is on your calendar',
        receipt: he ? 'נקבע · הם אישרו את האירוע' : 'Scheduled · they accepted the invite',
        yes: he ? 'סיימתי' : 'Done', no: he ? 'עדיין לא' : 'Not yet',
        patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'signal', closedAs: 'scheduled', signalKind: 'calendar', signalEventId: signal.eventId || null }
      };
    }
    return {
      question: he ? 'נראה שנשלח' + (signal.fileName ? ' · ' + signal.fileName : '') : 'Looks sent' + (signal.fileName ? ': ' + signal.fileName : ''),
      receipt: he ? 'נשלח · הקובץ שותף' : 'Kept · the file was shared',
      yes: he ? 'סמן כנעשה' : 'Mark kept', no: he ? 'עדיין לא' : 'Not yet',
      patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'signal', closedAs: 'kept', signalKind: 'drive' }
    };
  }
  function dismissPatch(watch, kind) {
    const list = Array.isArray(watch && watch.signalDismissed) ? watch.signalDismissed.slice() : [];
    if (!list.includes(kind)) list.push(kind);
    return { signalDismissed: list };
  }

  // Which loops are worth a lookup at all (cheap, so the caller can skip network calls).
  function wantsCalendar(w) { return Boolean(w) && w.status === 'waiting' && isScheduleLoop(w) && Boolean(w.counterpart && w.counterpart.email) && !(w.signalDismissed || []).includes('calendar'); }
  function wantsDrive(w) { return Boolean(w) && w.status === 'waiting' && w.direction === 'mine' && /:(?:quote|proposal|contract|invoice|report|deck|design)$/.test(String(w.subtype || '')) && Boolean(w.counterpart && w.counterpart.email) && !(w.signalDismissed || []).includes('drive'); }

  // ---- the invoice you sent IS the open loop (CARRY.invoices in config/carry.public.js, off) ----------------
  // A freelancer sends "מצורפת חשבונית 1044 על סך 3,850 ₪" and never writes "please pay". Today that opens nothing
  // (core/follow-up.js wants an explicit payment ask), so the money is tracked by nobody. This reads the person's OWN
  // outgoing message (the caller decides that) and returns a payment ask in the shape core/follow-up.js buildWatch() takes,
  // or null. Precision first: it needs the word invoice, evidence the invoice is on this message (attached / a file named
  // like an invoice), and exactly one figure to wait for. A receipt, "חשבונית מס קבלה" (already paid), a quote, a credit
  // note, invoices sent to your accountant, a forwarded invoice, or "I'll send the invoice tomorrow" open nothing.
  // The due day comes from the stated terms: שוטף+N (end of this month + N days), net N / within N days / תוך N ימים,
  // an explicit due date, "upon receipt"; with no terms there is no deadline and the first look is in 14 days.
  // The loop closes only as any payment loop does: their reply that it was paid, a bank or processor email for that
  // amount (matchPayment above), or the same in another app (core/cross-channel.js, by amount). Nothing here closes.
  const INVOICE_NOUN = /\b(?:invoice|inv[-#]?\s?\d{2,})\b|(?:חשבונית|חשבון עסקה|דרישת תשלום)/i;
  const ON_THIS_MESSAGE = /\b(?:attached|attaching|enclosed|please find|here(?:'s| is)(?: the| my| our)? invoice|sending (?:you )?(?:over )?(?:the|my|our) invoice)\b|(?:מצורפ|מצ["״]ב|רצ["״]ב|מצרפ|צירפתי|שולח(?:ת)? (?:לך |לכם )?(?:את )?ה?(?:חשבונית|חשבון|דרישת)|הנה ה(?:חשבונית|חשבון))/i;
  const ALREADY_PAID = /(?<!\b(?:upon|on) )\breceipt\b|\b(?:paid in full|has been paid|thank you for (?:your )?payment|payment (?:was )?received)\b|(?:^|[\s,.(:"'])קבלה(?=$|[\s,.)!?:"'])|חשבונית מס\s*[/\\-]?\s*קבלה|(?:^|\s)שולמה?(?=$|[\s,.!?])|התשלום התקבל|תודה על התשלום/i;
  const NOT_OWED = /\b(?:quote|quotation|estimate|proposal|credit note|refund|draft invoice|pro[- ]?forma draft)\b|(?:הצעת מחיר|(?:^|\s)הצעה(?=$|[\s,.])|זיכוי|החזר כספי|טיוטת חשבונית)/i;
  const NOT_YET = /\b(?:will send|i(?:'ll| will) (?:send|issue|invoice|bill)|(?:invoice|it) will follow|to follow)\b|(?:אשלח|אוציא|אנפיק|אעביר)(?: לך| לכם)? (?:את )?ה?(?:חשבונית|חשבון)|(?:החשבונית|החשבון) (?:תישלח|יישלח|יצא)/i;
  const BOOKKEEPING = /\b(?:accountant|bookkeep\w*|for your records|vat (?:report|return)|tax return)\b|(?:רו["״]ח|רואה החשבון|רואת החשבון|הנהלת חשבונות|הנה["״]ח|לדיווח|דיווח מע["״]מ|לתיעוד|החשבוניות של החודש)/i;
  const FORWARDED = /(?:^|\n)\s*(?:-{3,}\s*(?:forwarded message|הודעה שהועברה)|(?:fwd?|fw|הועבר)\s*:)/i;
  const PLUS_VAT = /\+\s*מע["״]מ|לפני מע["״]מ|לא כולל מע["״]מ|\bplus vat\b|\b\+\s*vat\b|\bexcl(?:\.|uding)? vat\b/i;
  const VAT_RATE = 0.18;   // Israel, from 2025-01-01
  const INVOICE_FILE = /(?:invoice|inv[-_ ]?\d|חשבונית|חשבון)[^/\\]*\.pdf$/i;
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayAt(now) { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function plusDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  // { kind:'eom'|'net'|'date'|'receipt'|null, days, dueIso }
  function paymentTerms(text, now) {
    const t = String(text || '');
    const d0 = dayAt(now);
    let m = /שוטף\s*\+\s*(\d{1,3})|\b(?:eom|end of month)\s*\+\s*(\d{1,3})\b/i.exec(t);
    if (m) { const n = +(m[1] || m[2]); const eom = new Date(d0.getFullYear(), d0.getMonth() + 1, 0); return { kind: 'eom', days: n, dueIso: isoOf(plusDays(eom, n)) }; }
    m = /\bnet[\s-]?(\d{1,3})\b|\b(?:due|payable)\s+(?:with)?in\s+(\d{1,3})\s+days\b|\bwithin\s+(\d{1,3})\s+days\b|(?:תוך|בתוך)\s*(\d{1,3})\s*(?:יום|ימים)/i.exec(t);
    if (m) { const n = +(m[1] || m[2] || m[3] || m[4]); return { kind: 'net', days: n, dueIso: isoOf(plusDays(d0, n)) }; }
    m = /\b(?:due|payable|to be paid)\s+(?:on|by|before)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|[^.\n]{3,30})|(?:לתשלום עד|מועד (?:ה)?תשלום[:\s]+|יש לשלם עד)\s*(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|[^.\n]{3,30})/i.exec(t);
    if (m) {
      const span = m[1] || m[2];
      // Hebrew text writes day first (15/11, 15.11.26). English stays with the shared parser, which knows month names.
      const dm = /[֐-׿]/.test(t) ? /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(span) : null;
      if (dm) {
        const day = +dm[1], mon = +dm[2];
        let year = dm[3] ? +dm[3] : d0.getFullYear();
        if (year < 100) year += 2000;
        let due = new Date(year, mon - 1, day);
        if (!dm[3] && due < d0) due = new Date(year + 1, mon - 1, day);
        if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31 && due.getDate() === day && due >= d0) return { kind: 'date', days: null, dueIso: isoOf(due) };
      } else if (extract && extract.parseDate) {
        try { const pd = extract.parseDate(span, new Date(now)); if (pd && pd.iso && pd.iso >= isoOf(d0)) return { kind: 'date', days: null, dueIso: pd.iso }; } catch (e) { /* no date */ }
      }
    }
    if (/\b(?:upon|on|due on) receipt\b|\bimmediate(?:ly)?\b|(?:מיידי|עם קבלת החשבונית)/i.test(t)) return { kind: 'receipt', days: 0, dueIso: isoOf(plusDays(d0, 7)) };
    return { kind: null, days: null, dueIso: null };
  }

  // text: the person's own outgoing message. opts: { enabled (the switch), now, subject, attachmentNames: [..] }
  function invoiceLoop(text, opts) {
    const o = opts || {};
    if (o.enabled !== true || !extract || !extract.parseMoney) return null;
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const body = String(text || '').slice(0, 4000);
    const subject = String(o.subject || '');
    const both = subject + '\n' + body;
    if (!INVOICE_NOUN.test(both)) return null;
    if (FORWARDED.test(body) || /^\s*(?:fwd?|fw|הועבר)\s*:/i.test(subject)) return null;
    if (ALREADY_PAID.test(both) || NOT_OWED.test(both) || NOT_YET.test(both) || BOOKKEEPING.test(both)) return null;
    const files = (Array.isArray(o.attachmentNames) ? o.attachmentNames : []).map(String);
    if (!(ON_THIS_MESSAGE.test(both) || files.some((f) => INVOICE_FILE.test(f)))) return null;
    // Exactly one figure to wait for: the largest money figure, and no second, different total.
    // Two invoices in one message ("an invoice for 3,000 and another for 1,500"): which one to wait for is a guess.
    if ((both.match(/\binvoice\b|חשבונית/gi) || []).length > 1 && /\b(?:another|second|also)\b[^.]{0,30}\binvoice|(?:ו?בנוסף|ועוד)[^.]{0,20}חשבונית|חשבונית נוספת/i.test(both)) return null;
    const moneyHits = [];
    // Sentences, then clauses (", " never splits "3,850" because a thousands comma has no space after it).
    body.split(/(?<=[.!?])\s+|\n+|,\s+|;\s*/).forEach((sentence) => { const mm = extract.parseMoney(sentence); if (mm && mm.value > 0) moneyHits.push({ m: mm, sentence }); });
    if (!moneyHits.length) return null;
    if (new Set(moneyHits.map((h) => Math.round(h.m.value * 100))).size > 1 && !moneyHits.some((h) => /\b(?:total|amount due|balance due)\b|(?:סה["״]כ|לתשלום)/i.test(h.sentence))) return null;
    const totals = moneyHits.filter((h) => /\b(?:total|amount due|balance due|sum)\b|(?:סה["״]כ|לתשלום|על סך|בסך|סכום)/i.test(h.sentence));
    const pool = totals.length ? totals : moneyHits;
    const values = Array.from(new Set(pool.map((h) => Math.round(h.m.value * 100))));
    if (values.length !== 1) return null;            // two different totals: do not guess which one is owed
    const pick = pool[0];
    const currency = pick.m.currency || null;
    let amount = { value: pick.m.value, currency, raw: pick.m.raw };
    let amountNet = null;
    if ((PLUS_VAT.test(pick.sentence) || PLUS_VAT.test(body)) && !/כולל מע["״]מ|\bincl(?:\.|uding)? vat\b/i.test(body) && currency === 'ILS') {
      amountNet = amount;
      const gross = Math.round(pick.m.value * (1 + VAT_RATE) * 100) / 100;
      amount = { value: gross, currency, raw: pick.m.raw + ' + מע"מ' };
    }
    const lang = /[֐-׿]/.test(body) ? 'he' : 'en';
    const no = /(?:invoice|inv)\s*(?:no\.?|number|#)?\s*[#:]?\s*([A-Z]{0,4}-?\d{2,8})\b|חשבונית(?: מס)?(?: מספר| מס'| מס׳)?\s*[#:]?\s*(\d{2,8})/i.exec(both);
    const invoiceNo = no ? (no[1] || no[2]) : null;
    const terms = paymentTerms(both, now);
    const d0 = dayAt(now);
    const chaseIso = terms.dueIso ? isoOf(plusDays(new Date(terms.dueIso + 'T00:00:00'), 1)) : isoOf(plusDays(d0, 14));
    const label = lang === 'he' ? 'תשלום על חשבונית' + (invoiceNo ? ' ' + invoiceNo : '') : 'Payment for invoice' + (invoiceNo ? ' ' + invoiceNo : '');
    return { kind: KINDS.PAYMENT, what: label, amount, amountNet, deadlineIso: terms.dueIso, chaseIso, lang, subtype: 'invoice', invoiceNo, terms: { kind: terms.kind, days: terms.days }, direction: 'theirs', basis: 'invoice' };
  }

  return { invoiceLoop, paymentTerms, TRUSTED_DOMAINS, CALENDAR_LOOKBACK_MS, trustedSender, paymentEvidence, matchPayment, matchCalendar, matchDrive, proposal, dismissPatch, wantsCalendar, wantsDrive, isScheduleLoop };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutsideSignals };
