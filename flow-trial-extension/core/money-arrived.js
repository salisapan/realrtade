// The money you chased really arrived (close map row Y3). Portable: no chrome.*,
// no DOM, no network. Behind the off switch MONEY_ARRIVED (default off).
//
// A payment loop (core/follow-up.js, kind 'payment') stays open until reality
// closes it. "I paid" from the payer is a claim; "claimed" is not "received"
// (owner, 2026-10-10). This module reads the other proof the close map names: a
// payment-received notice the person got from their bank or payment app (Bit,
// PayBox, PayPal, Stripe, Wise, Payoneer, an Israeli bank), with the amount.
// When exactly one open payment loop has that amount and currency (and the
// payer, when the notice names one, is that person), the loop closes as 'paid',
// resolvedBy 'notice'. Handled needs the notice read back by id from the mailbox.
//
// Rules:
//   - only allowlisted senders count, and a notice that failed authentication
//     (the host passes DKIM/SPF as `authPass`) is ignored: a spoofed "payment
//     received" mail must never close a loop;
//   - only money IN: "you sent", "חויב", "העברה יוצאת", a refund you issued, a
//     pending, failed or cancelled transfer, a request for money, and promotions
//     stay silent;
//   - the amount and currency must match the loop exactly; a notice older than
//     the loop does not count;
//   - zero or several loops that fit: silence. Two notices are two closes, never
//     one notice for two loops;
//   - nothing is read or changed until the switch is on.
//
// The host injects readMessage(id) -> Promise<{ ok, status, message: { id, from,
// subject, text } }> for the read-back (Gmail users.messages.get or Graph
// /me/messages/{id}). No src/ file calls this yet.
const FlowMoneyArrived = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'MONEY_ARRIVED';
  const SWITCH_DEFAULT = false;
  const DAY = 86400000;

  // Payment providers and Israeli banks that send "money in" notices. A
  // subdomain of one of these counts. Anything else is not a notice.
  const SENDER_DOMAINS = [
    'bit.co.il', 'bitpay.co.il', 'paybox.co.il', 'payboxapp.com',
    'paypal.com', 'paypal.co.il', 'stripe.com', 'wise.com', 'transferwise.com', 'payoneer.com',
    'bankhapoalim.co.il', 'poalim.co.il', 'leumi.co.il', 'discountbank.co.il', 'mizrahi-tefahot.co.il',
    'fibi.co.il', 'bankotsar.co.il', 'mercantile.co.il', 'bankjerusalem.co.il', 'max.co.il', 'cal-online.co.il',
    'isracard.co.il', 'pepper.co.il', 'onezerobank.com', 'one-zero.com'
  ];

  const IN_EN = /\b(?:you(?:'ve| have)? (?:just )?(?:received|got) (?:a |an )?(?:payment|transfer|money|deposit)?|you(?:'ve| have)? got money|payment (?:received|has been received)|(?:sent|paid) you\b|has sent you|deposit(?:ed)? (?:of|to your account)|incoming (?:transfer|payment|wire)|funds (?:received|have arrived|arrived)|money (?:is )?(?:on its way|has arrived) to you|credited to your account)/i;
  const IN_HE = /(?:התקבלה (?:העברה|הפקדה|העברת כספים)|קיבלת (?:העברה|תשלום|כסף)?|זוכה חשבונך|זיכוי (?:ב|ל)?חשבון|העברה נכנסת|הפקדה (?:ל|ב)חשבון|הועבר(?:ו)? (?:אליך|לחשבונך)|שלח(?:ה)? לך)/;
  const OUT_OR_FAIL = /\b(?:you sent|you paid|you(?:'ve| have) sent|payment to\b|charged|debited|withdrawal|outgoing|refund(?:ed)? to\b|requested (?:money|a payment)|request(?:ed)? from you|is requesting|pending|on hold|failed|declined|cancel(?:l)?ed|reversed|could not be|unsuccessful|offer|promo|discount code|win\b)\b|(?:שלחת|שילמת|חויב|חיוב|העברה יוצאת|משיכה|ממתינה|בהמתנה|נכשלה|נדחתה|בוטלה|לא בוצעה|ביקש(?:ה)? ממך|בקשת תשלום|מבצע|הטבה|הנחה)/i;
  const PAYER_EN = /\b(?:from|by)\s+([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){0,3})/;
  const PAYER_EN_SENT = /\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){0,3})\s+(?:sent|paid) you\b/;
  const PAYER_HE = /(?:מאת|מ-|מ־|מהלקוח|ממשלם)\s*([֐-׿][֐-׿"׳'-]+(?:\s+[֐-׿][֐-׿"׳'-]+){0,2})/;
  const PAYER_HE_SENT = /([֐-׿][֐-׿"׳'-]+(?:\s+[֐-׿][֐-׿"׳'-]+){0,2})\s+שלח(?:ה)?\s+לך/;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function domainOf(email) {
    const m = String(email || '').toLowerCase().match(/@([a-z0-9.-]+)>?\s*$/);
    return m ? m[1] : '';
  }

  function allowedSender(email) {
    const d = domainOf(email);
    if (!d) return false;
    return SENDER_DOMAINS.some((s) => d === s || d.endsWith('.' + s));
  }

  function moneyHits(text) {
    if (!extract) return [];
    const hits = [];
    let rest = String(text || '');
    for (let i = 0; i < 4; i++) {
      const m = extract.parseMoney(rest);
      if (!m) break;
      hits.push(m);
      rest = rest.slice(0, m.index) + ' '.repeat(m.raw.length) + rest.slice(m.index + m.raw.length);
    }
    return hits;
  }

  function clean(s) {
    return String(s || '').replace(/[​-‏‪-‮ ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function payerOf(text) {
    const s = clean(text);
    const m = s.match(PAYER_HE_SENT) || s.match(PAYER_HE) || s.match(PAYER_EN_SENT) || s.match(PAYER_EN);
    if (!m) return null;
    const name = m[1].replace(/["׳']/g, '').trim();
    if (/^(?:your|the|a|an|account|bank|paypal|bit|paybox|stripe|wise|payoneer)$/i.test(name)) return null;
    return name;
  }

  // The notice, or silence with a reason. mail: { id, from, subject, text, dateMs, authPass }
  function readNotice(mail) {
    mail = mail || {};
    if (!allowedSender(mail.from)) return { kind: 'ignore', reason: 'sender-not-allowlisted' };
    if (mail.authPass === false) return { kind: 'block', reason: 'auth-failed' };
    const body = clean((mail.subject || '') + '. ' + (mail.text || ''));
    if (!(IN_EN.test(body) || IN_HE.test(body))) return { kind: 'ignore', reason: 'not-money-in' };
    if (OUT_OR_FAIL.test(body)) return { kind: 'block', reason: 'out-or-not-final' };
    const money = moneyHits(body);
    const distinct = money.filter((m, i) => money.findIndex((x) => x.value === m.value && x.currency === m.currency) === i);
    if (distinct.length === 0) return { kind: 'block', reason: 'no-amount' };
    if (distinct.length > 1) return { kind: 'block', reason: 'several-amounts' };
    return {
      kind: 'notice',
      messageId: mail.id || null,
      amount: { value: distinct[0].value, currency: distinct[0].currency },
      payer: payerOf(body),
      dateMs: typeof mail.dateMs === 'number' ? mail.dateMs : null
    };
  }

  function words(name) {
    return String(name || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2);
  }

  // A named payer must share a word with the loop's counterpart (name or the
  // mailbox part of the address). No payer in the notice is not a mismatch.
  // A payer written in another script than every name we hold for that person
  // ("דנה כהן" against "Dana Cohen") is compared by consonant skeleton.
  const HE_SKEL = { 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ז': 'z', 'ח': 'k', 'ט': 't', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'פ': 'f', 'ף': 'f', 'צ': 'z', 'ץ': 'z', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't' };
  function skeleton(word) {
    const w = String(word || '').toLowerCase();
    let out = '';
    if (/[֐-׿]/.test(w)) {
      for (const ch of w) out += HE_SKEL[ch] || '';
    } else {
      out = w.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/ch/g, 'k').replace(/t[sz]/g, 'z').replace(/[cq]/g, 'k').replace(/w/g, 'v').replace(/v/g, 'b').replace(/p/g, 'f').replace(/[aeiouyh]/g, '').replace(/[^a-z]/g, '');
    }
    return out.replace(/(.)\1+/g, '$1');
  }
  function payerFits(payer, counterpart) {
    if (!payer) return true;
    const c = counterpart || {};
    const mine = words(c.name).concat(words(String(c.email || '').split('@')[0].replace(/[._-]+/g, ' ')));
    if (!mine.length) return false;
    const he = (w) => /[֐-׿]/.test(w);
    const payerHe = words(payer).some(he);
    if (payerHe !== mine.some(he)) {
      // Another script: compare consonant skeletons ("דנה כהן" ~ "Dana Cohen").
      const a = words(payer).map(skeleton).filter((k) => k.length >= 2);
      const b = mine.map(skeleton).filter((k) => k.length >= 2);
      return a.some((k) => b.indexOf(k) >= 0);
    }
    return words(payer).some((w) => mine.indexOf(w) >= 0);
  }

  function openPayment(loop) {
    return loop && loop.kind === 'payment' && loop.status === 'waiting' && loop.amount && typeof loop.amount.value === 'number';
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  // The plan: which one loop this notice closes, or silence.
  //   loops  the person's watches (core/follow-up.js shape)
  //   mail   the notice as the host read it
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const n = readNotice(input.mail);
    if (n.kind !== 'notice') return silence(n.reason);
    if (!n.messageId) return silence('no-message-id');
    const loops = Array.isArray(input.loops) ? input.loops : [];
    const fits = loops.filter((w) => openPayment(w)
      && w.amount.value === n.amount.value
      && (!w.amount.currency || !n.amount.currency || w.amount.currency === n.amount.currency)
      && (n.dateMs == null || !w.createdAt || n.dateMs >= w.createdAt - DAY)
      && payerFits(n.payer, w.counterpart));
    if (fits.length === 0) return silence('no-loop');
    if (fits.length > 1) return silence('several-loops');
    const w = fits[0];
    return {
      action: 'close',
      loopId: w.id,
      notice: n,
      line: (w.lang === 'he' ? 'התשלום התקבל: ' : 'Payment received: ') + (w.amount.raw || (n.amount.value + ' ' + (n.amount.currency || ''))).trim()
    };
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  // Read the notice back by id and close the loop. Returns the watch patch; the
  // host stores it with the same storage it uses for core/follow-up.js.
  async function close(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const planned = input.plan;
    const loop = input.loop;
    if (!planned || planned.action !== 'close' || !loop || loop.id !== planned.loopId) return miss('invalid');
    if (!openPayment(loop)) return miss('loop-not-open');
    if (typeof io.readMessage !== 'function') return miss('no-host');
    const got = await io.readMessage(planned.notice.messageId);
    if (!got || got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.message) return miss('verify_failed', { why: 'gone' });
    const again = readNotice(Object.assign({ authPass: input.authPass, dateMs: planned.notice.dateMs }, got.message));
    if (again.kind !== 'notice' || again.amount.value !== planned.notice.amount.value || String(got.message.id) !== String(planned.notice.messageId)) {
      return miss('verify_failed', { why: 'notice-differs' });
    }
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const system = input.surface === 'outlook' ? 'microsoft/mail' : 'gmail/message';
    const proof = proofs ? proofs.buildProof({ system: system, externalId: String(planned.notice.messageId), fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss('proof_pending');
    const t = Date.parse(verifiedAt);
    const before = { status: loop.status, resolvedAt: loop.resolvedAt || null, resolvedBy: loop.resolvedBy || null, closedAs: loop.closedAs || null };
    return {
      ok: true,
      proof: proof,
      patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'notice', closedAs: 'paid', paidProof: proof },
      ref: { loopId: loop.id, before: before, resolvedAt: t, messageId: String(planned.notice.messageId), createdByGlance: true },
      // The money arrived: that is the close the person asked for.
      loopClosed: true
    };
  }

  // Undo: reopen the loop, only while it is still the close Glance made.
  function undo(ref, loopNow) {
    if (!ref || ref.createdByGlance !== true || !ref.before) return { ok: false, reason: 'not-ours' };
    if (!loopNow || loopNow.id !== ref.loopId) return { ok: false, reason: 'loop-gone' };
    const same = loopNow.status === 'resolved' && loopNow.resolvedBy === 'notice' && loopNow.resolvedAt === ref.resolvedAt
      && loopNow.paidProof && String(loopNow.paidProof.externalId) === ref.messageId;
    if (!same) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    return { ok: true, undone: true, patch: Object.assign({}, ref.before, { paidProof: null }) };
  }

  return { SWITCH, SWITCH_DEFAULT, SENDER_DOMAINS, enabled, allowedSender, readNotice, payerFits, plan, close, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowMoneyArrived };
else if (typeof globalThis !== 'undefined') globalThis.FlowMoneyArrived = FlowMoneyArrived;
