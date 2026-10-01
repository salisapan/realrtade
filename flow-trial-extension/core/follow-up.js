// Follow-up tracking — "waiting on" — portable logic only. No chrome.*, no
// DOM, no network, no storage: callers pass the text, the clock and the watch
// list, and get plain values back.
//
// What this is for. Glance's Do It chip closes things people ask OF you. The
// expensive silence runs the other way: you asked someone for a signature, an
// answer, a payment — and the thread went quiet. Nothing in Gmail will bring it
// back. This file recognises the moment you sent such a message, decides when
// to chase, and later decides that a reply has settled it.
//
// The same discipline as the rest of Glance: precision over recall, silence
// over a wrong card.
//   - It only ever reads YOUR OWN last message in a thread (the caller decides
//     whose message that is; this file never sees anyone else's text).
//   - A courtesy line ("let me know if you have any questions") is not an ask.
//   - A hedge ("whenever you get a chance") is not a deadline worth tracking.
//   - A payment is only a payment when a figure and a payment word are both
//     present, and a receipt ("payment received") is never chased.
//   - No evidence, no card.
//
// A "watch" is the record of one thing being waited on:
//   { id, threadId, messageId, subject, counterpart:{email,name}, kind,
//     what, amount:{value,currency,raw}|null, deadlineIso, chaseIso,
//     createdAt, status:'waiting'|'resolved'|'stopped', resolvedAt, taskRef }
const FlowFollowUp = (() => {
  const KINDS = { REPLY: 'reply', PAYMENT: 'payment' };
  const MIN_WORDS = 6;
  const MAX_WHAT = 140;
  const REPLY_BUSINESS_DAYS = 2;
  const PAYMENT_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---- courtesy and hedge: sentences that sound like asks but are not -------
  const COURTESY = /\b(?:let me know if (?:you|there|anything|any|i can)|feel free to|don'?t hesitate|hope (?:this|that|you)|looking forward|thanks? (?:again|so much)|have a (?:great|good|nice|lovely)|talk soon|speak soon|best regards|kind regards|warm regards|if you have any (?:questions|concerns)|happy to (?:help|chat|discuss)|at your convenience)\b|(?:אל תהססו|אם יש (?:לכם )?שאלות|בברכה|שיהיה (?:לך|לכם) (?:יום|שבוע)|נשמח לעמוד)/i;
  const HEDGE = /\b(?:no rush|whenever you (?:get a chance|can|have a moment)|if (?:you|it'?s) (?:possible|convenient)|when you (?:get|have) a (?:chance|moment)|sometime|no pressure|if you(?:'re| are) free)\b|(?:אין לחץ|כשיהיה לך זמן|כשתוכל|מתישהו|אם נוח)/i;

  // ---- asks -----------------------------------------------------------------
  const ASK_EN = [
    /\b(?:could|can|would|will) you (?:please |kindly |also )?(?:confirm|send|share|review|sign|approve|reply|respond|update|check|forward|provide|return|schedule|book|let me know|get back|pay|transfer|wire|settle)\b/i,
    /\bplease (?:confirm|send|share|review|sign|approve|reply|respond|forward|provide|return|let me know|pay|transfer|wire|settle|get back)\b/i,
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:still )?(?:waiting|awaiting)\b|\bawaiting your\b|\bwaiting (?:for|on) (?:your|the)\b/i,
    /\b(?:i|we) (?:need|require) (?:you to|your) (?:confirm|approval|signature|reply|response|decision|answer|input|sign|send)\b/i,
    /\b(?:confirm|reply|respond|get back to me|send (?:it|them|me)|let me know) (?:by|before|no later than|until|within)\b/i
  ];
  const ASK_HE = [
    /(?:תוכל(?:ו|י)?|אפשר|ניתן) (?:בבקשה )?(?:לשלוח|לאשר|להשיב|לחתום|להעביר|לעדכן|לבדוק|לשלם|לחזור)/,
    /(?:תשלח(?:ו|י)?|שלח(?:ו|י)?|אשר(?:ו|י)?|תאשר(?:ו|י)?|חתום|תחתום|עדכן|תעדכן|תחזור|תחזרו|תחזרי|העבר(?:ו|י)?|תעביר(?:ו|י)?) (?:לי|לנו|אלי|בבקשה|את|עד|מיד)/,
    /(?:נא|בבקשה) (?:לשלוח|לאשר|להשיב|לחתום|להעביר|לעדכן|לשלם)/,
    /(?:ממתין|ממתינה|מחכה|מחכים|ממתינים) (?:ל|לתשובה|לאישור|לחתימה|לתשלום)/,
    /אשמח (?:אם|ש)(?:תשלח|תוכל|תאשר|תחזור|תעדכן|נקבל)/
  ];

  // ---- payment --------------------------------------------------------------
  const PAY_WORD = /\b(?:invoice|payment|balance|amount due|outstanding|remit(?:tance)?|please pay|pay(?:able)?|wire|settle|owed|overdue|due on|due by)\b|(?:חשבונית|תשלום|יתרה|לשלם|העברה בנקאית|חוב|לתשלום)/i;
  const RECEIPT = /\b(?:payment (?:received|confirmed|made|sent|processed)|has been paid|paid in full|thank you for (?:your )?payment|receipt (?:attached|enclosed)|we(?:'ve| have) (?:received|sent) (?:the )?payment)\b|(?:התשלום (?:התקבל|בוצע|נשלח)|שולם|קבלה מצורפת)/i;

  function words(text) { return (String(text || '').match(/\S+/g) || []).length; }

  function sentences(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split(/(?<=[.!?։؟])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function hasHebrew(text) { return /[֐-׿]/.test(String(text || '')); }

  function clip(text, n) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
  }

  // ---- dates ----------------------------------------------------------------
  function isoDay(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function today(now) {
    const d = new Date(typeof now === 'number' ? now : Date.now());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addBusinessDays(from, n) {
    const d = new Date(from.getTime());
    let left = n;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) left--;
    }
    return d;
  }

  // The day the task should surface.
  //   reply        : the stated deadline itself (that is the day the answer
  //                  was due), else two business days after sending.
  //   payment      : the day AFTER the due date (it is only late then), else a
  //                  week after sending.
  // A deadline already in the past is not trusted as a deadline.
  function chaseDate(kind, deadlineIso, now) {
    const t0 = today(now);
    const deadline = deadlineIso ? new Date(deadlineIso + 'T00:00:00') : null;
    const valid = deadline && !isNaN(deadline.getTime()) && deadline.getTime() >= t0.getTime();
    if (kind === KINDS.PAYMENT) {
      if (valid) { const d = new Date(deadline.getTime()); d.setDate(d.getDate() + 1); return isoDay(d); }
      const d = new Date(t0.getTime()); d.setDate(d.getDate() + PAYMENT_DAYS); return isoDay(d);
    }
    if (valid) {
      const day = deadline.getTime() === t0.getTime() ? addBusinessDays(t0, 1) : deadline;
      return isoDay(day);
    }
    return isoDay(addBusinessDays(t0, REPLY_BUSINESS_DAYS));
  }

  // ---- classification ---------------------------------------------------------
  // text: YOUR OWN message, quoted history already removed.
  // ctx:  { now?, extract? } — `extract` is core/extract.js's FlowExtract; passed in
  //       so this file stays free of load-order assumptions.
  // Returns null (silence) or { kind, what, amount, deadlineIso, chaseIso, lang }.
  function classifyOutgoing(text, ctx) {
    const c = ctx || {};
    const body = String(text || '').trim();
    if (!body || words(body) < MIN_WORDS) return null;
    if (RECEIPT.test(body)) return null;

    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    const money = ex && ex.parseMoney ? ex.parseMoney(body) : null;
    const date = ex && ex.parseDate ? ex.parseDate(body, c.now) : null;
    const deadlineIso = date && date.iso ? date.iso : null;

    const lines = sentences(body);
    const candidates = lines.filter((s) => words(s) >= 4 && !COURTESY.test(s));
    if (!candidates.length) return null;

    const he = hasHebrew(body);
    const asks = he ? ASK_HE : ASK_EN;
    const askLine = candidates.find((s) => asks.some((re) => re.test(s)) || (he && ASK_EN.some((re) => re.test(s))));

    // Payment: a payment word AND a figure AND some instruction or due date.
    const payLine = money ? candidates.find((s) => PAY_WORD.test(s)) : null;
    const dueCue = /\b(?:due|by|before|within|no later than|please|kindly|overdue|outstanding)\b|(?:עד|לפני|בתוך|נא|בבקשה|באיחור)/i;
    const isPayment = Boolean(payLine && (dueCue.test(payLine) || deadlineIso || askLine));

    if (!askLine && !isPayment) return null;

    // A hedge on the only ask line, with no deadline anywhere, is a wish.
    const chosen = isPayment ? payLine : askLine;
    if (HEDGE.test(chosen) && !deadlineIso && !isPayment) return null;

    const kind = isPayment ? KINDS.PAYMENT : KINDS.REPLY;
    return {
      kind,
      what: clip(chosen, MAX_WHAT),
      amount: money ? { value: money.value, currency: money.currency || null, raw: money.raw } : null,
      deadlineIso,
      chaseIso: chaseDate(kind, deadlineIso, c.now),
      lang: he ? 'he' : 'en'
    };
  }

  // ---- watches -----------------------------------------------------------------
  function buildWatch(a) {
    const ask = a.ask;
    return {
      id: String(a.threadId),
      threadId: String(a.threadId),
      messageId: a.messageId ? String(a.messageId) : null,
      subject: clip(a.subject || '', 160),
      counterpart: { email: (a.counterpart && a.counterpart.email) || null, name: (a.counterpart && a.counterpart.name) || null },
      kind: ask.kind,
      what: ask.what,
      amount: ask.amount || null,
      deadlineIso: ask.deadlineIso || null,
      chaseIso: ask.chaseIso,
      lang: ask.lang || 'en',
      createdAt: typeof a.now === 'number' ? a.now : Date.now(),
      status: 'waiting',
      resolvedAt: null,
      resolvedBy: null,
      taskRef: a.taskRef || null,
      nudges: 0
    };
  }

  // 'waiting' | 'overdue' | 'resolved' | 'stopped'
  function watchState(w, now) {
    if (!w) return null;
    if (w.status === 'resolved' || w.status === 'stopped') return w.status;
    return w.chaseIso && w.chaseIso < isoDay(today(now)) ? 'overdue' : 'waiting';
  }


  // An out-of-office or automatic reply is not an answer. Treating it as one
  // would close a follow-up the person is still waiting on.
  const AUTO_REPLY = /\b(?:out of (?:the )?office|automatic reply|auto-?reply|autoreply|away until|on (?:vacation|leave|holiday)|do not reply|undeliverable|delivery (?:status|failure)|mailer-daemon)\b|(?:מחוץ למשרד|תשובה אוטומטית|בחופשה עד|בחופשה)/i;

  function isAutoReply(text, senderEmail) {
    if (AUTO_REPLY.test(String(text || '').slice(0, 600))) return true;
    return /^(?:no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster)@/i.test(String(senderEmail || ''));
  }

  // The newest message in the thread is not yours => someone answered after you
  // asked. That is the whole definition of "settled" Glance claims.
  function repliedSince(watch, last) {
    if (!watch || watch.status !== 'waiting' || !last) return false;
    if (last.isOwn) return false;
    if (isAutoReply(last.text, last.email)) return false;
    return true;
  }

  function isActive(w) { return Boolean(w) && w.status === 'waiting'; }

  // ---- the money view ----------------------------------------------------------
  // What is owed to you across tracked payment chases, by currency. Never mixes
  // currencies into one number.
  function summarize(watches, now) {
    const list = Array.isArray(watches) ? watches : [];
    const active = list.filter(isActive);
    const overdue = active.filter((w) => watchState(w, now) === 'overdue');
    const owed = {};
    active.forEach((w) => {
      if (w.kind !== KINDS.PAYMENT || !w.amount || !(w.amount.value > 0)) return;
      const cur = w.amount.currency || '?';
      owed[cur] = (owed[cur] || 0) + w.amount.value;
    });
    const moneyOwed = Object.keys(owed).sort().map((currency) => ({ currency, value: owed[currency] }));
    return { active: active.length, overdue: overdue.length, moneyOwed };
  }

  function formatMoney(entry) {
    const symbols = { USD: '$', EUR: '€', GBP: '£', ILS: '₪' };
    const sym = symbols[entry.currency];
    const n = Math.round(entry.value).toLocaleString('en-US');
    return sym ? sym + n : n + ' ' + (entry.currency === '?' ? '' : entry.currency);
  }

  // ---- nudge text ---------------------------------------------------------------
  function firstName(name, email) {
    const n = String(name || '').trim();
    if (n && !/@/.test(n)) return n.split(/\s+/)[0];
    const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return local ? local.split(/\s+/)[0].replace(/^./, (ch) => ch.toUpperCase()) : '';
  }

  // Plain, short, human. A person reads this before sending, so it is a
  // draft to edit, never a message sent on anyone's behalf.
  function nudgeText(w) {
    const name = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    const he = w.lang === 'he';
    const amount = w.amount && w.amount.raw ? w.amount.raw : null;
    if (he) {
      const hi = name ? 'היי ' + name + ',' : 'שלום,';
      if (w.kind === KINDS.PAYMENT) return hi + '\n\nתזכורת ידידותית' + (amount ? ' לגבי התשלום על סך ' + amount : ' לגבי התשלום') + '. אפשר לעדכן אותי מתי להמתין לו?\n\nתודה,';
      return hi + '\n\nחוזר/ת לפנייה הקודמת שלי: ' + w.what + '\n\nאפשר לעדכן אותי כשיש לך רגע? תודה!';
    }
    const hi = name ? 'Hi ' + name + ',' : 'Hi,';
    if (w.kind === KINDS.PAYMENT) {
      return hi + '\n\nA friendly reminder about the payment' + (amount ? ' of ' + amount : '') + '. Could you let me know when I can expect it?\n\nThanks,';
    }
    return hi + '\n\nA quick follow-up on my earlier note: ' + w.what + '\n\nCould you get back to me when you can? Thanks!';
  }

  function taskTitle(w) {
    const who = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    const head = w.kind === KINDS.PAYMENT ? 'Chase payment' : 'Chase reply';
    const amt = w.kind === KINDS.PAYMENT && w.amount && w.amount.raw ? ' ' + w.amount.raw : '';
    return head + (who ? ' from ' + who : '') + amt + (w.subject ? ' — ' + clip(w.subject, 80) : '');
  }

  return {
    KINDS, classifyOutgoing, chaseDate, buildWatch, watchState, repliedSince, isAutoReply, isActive,
    summarize, formatMoney, nudgeText, taskTitle, firstName, isoDay
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFollowUp };
