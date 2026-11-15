// The chase that gets the refund done (the next move on a refund loop). Portable: no chrome.*, no DOM, no network.
//
// Why this exists. core/refund-loop.js carries a refund the person asked for and closes it only when the card or bank
// credit lands. Its due() only says that something is late. Owner, 2026-11-12: «לעשות דברים ולגרום להם להיות
// מבוצעים». This file turns a late refund into the ONE next move that makes it happen, with the draft ready:
//   remind-merchant  no answer by the chase day, or the merchant's own day passed with no credit: a reminder to the
//                    merchant that quotes the order, the amount and THEIR date
//   escalate-card    two reminders unanswered for 5 workdays: a request to the card company to look into the charge,
//                    naming the card, the merchant, the order and the amount. Never sent; the person sends it
//   ask-card         the same, but which card paid is unknown: one question, no draft
//   answer-them      the merchant asked for something: a reply that references the order and leaves [what they asked]
//   return-item      "once we receive the item": a step to ship it back, no draft
//   decide           a refusal or store credit: the person decides (insist, escalate, or let it go)
// Every fact in a draft comes from the loop (merchant, order, amount, the day asked, the merchant's day, the card). Nothing
// is invented, and nothing is sent: the host writes a Gmail draft on the person's Do It. A draft is preparation, never a
// close: the loop still closes only on the credit (core/refund-loop.js judge).
//
// Switch: opts.enabled (REFUND_CHASE, default off; wired together with REFUND_LOOP). Off: plan() returns null.
const FlowRefundChase = (() => {
  const SWITCH = 'REFUND_CHASE';
  const SWITCH_DEFAULT = false;
  const DAY = 86400000;
  const WAIT_WORKDAYS = 5;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function toDate(v) {
    if (typeof v === 'number') return new Date(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function workdaysBetween(a, b) {               // workdays after a, up to and including b (Fri and Sat are off)
    let n = 0, d = new Date(a.getTime());
    while (iso(d) < iso(b)) { d = new Date(d.getTime() + DAY); const wd = d.getDay(); if (wd !== 5 && wd !== 6) n++; }
    return n;
  }
  function day(v, lang) {
    const d = toDate(v);
    if (!d) return null;
    return lang === 'he' ? d.getDate() + '/' + (d.getMonth() + 1) : d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function money(loop) {
    if (!(loop.amount > 0)) return null;
    const n = Number(loop.amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const cur = loop.currency || (loop.lang === 'he' ? 'ILS' : null);
    if (cur === 'ILS') return n + ' ₪';
    if (cur === 'USD') return '$' + n;
    if (cur === 'EUR') return '€' + n;
    if (cur === 'GBP') return '£' + n;
    return n;
  }

  // ---- drafts (facts from the loop only) ----
  function remindDraft(loop, he) {
    const amt = money(loop), order = loop.orderNo, asked = day(loop.askedAt, he ? 'he' : 'en');
    const theirDay = loop.stage === 'approved' ? day(loop.expectIso, he ? 'he' : 'en') : null;
    if (he) {
      const what = 'ההחזר' + (amt ? ' על סך ' + amt : '') + (order ? ' עבור הזמנה ' + order : '');
      const body = theirDay
        ? 'שלום,\n\nכתבתם ש' + what + ' יופיע עד ' + theirDay + '. התאריך עבר והזיכוי עדיין לא הגיע. אשמח לבדיקה ולעדכון.\n\nתודה,'
        : 'שלום,\n\n' + (asked ? 'ב-' + asked + ' ' : '') + 'ביקשתי ' + what.replace(/^ההחזר/, 'החזר') + '. עדיין לא קיבלתי תשובה. אשמח לעדכון מתי הכסף יוחזר לאמצעי התשלום.\n\nתודה,';
      return { to: loop.email || null, subject: 'תזכורת: בקשת החזר' + (order ? ' להזמנה ' + order : ''), body, lang: 'he' };
    }
    const what = 'the refund' + (amt ? ' of ' + amt : '') + (order ? ' for order ' + order : '');
    const body = theirDay
      ? 'Hello,\n\nYou wrote that ' + what + ' would arrive by ' + theirDay + '. That day has passed and the credit has not arrived. Could you please check and let me know?\n\nThank you,'
      : 'Hello,\n\n' + (asked ? 'On ' + asked + ' ' : '') + 'I asked for ' + what.replace(/^the refund/, 'a refund') + ' and have not heard back yet. Could you please let me know when it will be returned to my payment method?\n\nThank you,';
    return { to: loop.email || null, subject: 'Reminder: refund request' + (order ? ' for order ' + order : ''), body, lang: 'en' };
  }
  function escalateDraft(loop, he) {
    const amt = money(loop), order = loop.orderNo, asked = day(loop.askedAt, he ? 'he' : 'en');
    const theirDay = loop.expectIso ? day(loop.expectIso, he ? 'he' : 'en') : null;
    if (he) {
      const body = 'שלום,\n\nאבקש לברר עסקה בכרטיס ' + loop.paidWith + ' מול בית העסק ' + loop.merchant + (order ? ', הזמנה ' + order : '') + '.\n' +
        (asked ? 'ב-' + asked + ' ' : '') + 'ביקשתי מבית העסק החזר' + (amt ? ' על סך ' + amt : '') + '. ' +
        (theirDay ? 'בית העסק כתב שההחזר יגיע עד ' + theirDay + ', אך ' : '') + 'הזיכוי לא הגיע, ושתי תזכורות לא נענו.\n' +
        'אבקש לבחון את ביטול החיוב.\n\nתודה,';
      return { to: null, toHint: loop.paidWith, subject: 'בקשה לבירור עסקה – ' + loop.merchant, body, lang: 'he' };
    }
    const body = 'Hello,\n\nI would like to dispute a charge on my ' + loop.paidWith + ' card from ' + loop.merchant + (order ? ' (order ' + order + ')' : '') + '.\n' +
      (asked ? 'On ' + asked + ' ' : '') + 'I asked the merchant for a refund' + (amt ? ' of ' + amt : '') + '. ' +
      (theirDay ? 'They wrote it would arrive by ' + theirDay + ', but ' : '') + 'the credit has not arrived and two reminders went unanswered.\n' +
      'Please review the charge.\n\nThank you,';
    return { to: null, toHint: loop.paidWith, subject: 'Charge dispute – ' + loop.merchant, body, lang: 'en' };
  }
  function answerDraft(loop, he) {
    const order = loop.orderNo;
    return he
      ? { to: loop.email || null, subject: 'בקשת החזר' + (order ? ' להזמנה ' + order : ''), body: 'שלום,\n\nבהמשך לפנייתכם לגבי ההחזר' + (order ? ' להזמנה ' + order : '') + ':\n[מה שביקשתם]\n\nתודה,', lang: 'he' }
      : { to: loop.email || null, subject: 'Refund request' + (order ? ' for order ' + order : ''), body: 'Hello,\n\nFollowing your message about the refund' + (order ? ' for order ' + order : '') + ':\n[what you asked for]\n\nThank you,', lang: 'en' };
  }

  // One refund loop -> the next move { step, draft?, title?, question? } or null (nothing to do today).
  function plan(loop, opts) {
    const o = opts || {};
    if (o.enabled !== true || !loop || loop.status !== 'open' || !loop.merchant) return null;
    const he = loop.lang === 'he';
    const now = typeof o.now === 'number' ? new Date(o.now) : new Date();
    const today = iso(now);
    if (loop.stage === 'declined' || loop.stage === 'store-credit') {
      return { step: 'decide', options: ['insist', 'escalate', 'release'], reason: loop.stage };
    }
    if (loop.stage === 'needs-you') {
      if (loop.need === 'return-item') return { step: 'return-item', title: he ? 'להחזיר את המוצר ל' + loop.merchant : 'Send the item back to ' + loop.merchant };
      return { step: 'answer-them', draft: answerDraft(loop, he) };
    }
    const late = (loop.stage === 'asked' && loop.chaseIso && loop.chaseIso <= today) ||
                 (loop.stage === 'approved' && loop.expectIso && loop.expectIso < today);
    if (!late) return null;
    const last = toDate(loop.lastReminderIso || loop.lastReminderAt);
    const waited = last ? workdaysBetween(last, now) : Infinity;
    if (last && waited < WAIT_WORKDAYS) return null;                                    // a reminder is still fresh
    if ((Number(loop.reminders) || 0) >= 2) {
      if (!loop.paidWith) return { step: 'ask-card', question: he ? 'באיזה כרטיס שילמת ל' + loop.merchant + '?' : 'Which card paid ' + loop.merchant + '?' };
      return { step: 'escalate-card', draft: escalateDraft(loop, he) };
    }
    return { step: 'remind-merchant', draft: remindDraft(loop, he) };
  }

  // After the person sent a reminder (seen in Sent, read back by id): count it.
  function remindedPatch(loop, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { reminders: (Number(loop.reminders) || 0) + 1, lastReminderIso: iso(new Date(t)) };
  }

  return { SWITCH, SWITCH_DEFAULT, WAIT_WORKDAYS, plan, remindedPatch };
})();

if (typeof module !== 'undefined') module.exports = { FlowRefundChase };
