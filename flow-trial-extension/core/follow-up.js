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
//     createdAt, status:'waiting'|'resolved'|'stopped', resolvedAt, taskRef,
//     stage:'waiting'|'nudged'|'promised', nudges, nudgedAt, promisedIso,
//     lastReplyAt, closedAs:'replied'|'paid'|'manual'|null }
//
// A watch is an OPEN LOOP: something you are owed, kept open until reality
// closes it. The life of one loop:
//   opened  -> waiting  (you asked; a chase day is set)
//           -> nudged   (you chased; the chase day moves out and the next nudge
//                        is firmer)
//           -> promised (they said "by Friday"; the chase day becomes Friday)
//           -> closed   (a real reply, or — for money — confirmation it was paid)
// What does NOT close a loop: an out-of-office, a bare "got it, thanks", a
// promise, or (for a payment) a reply that never says it was paid. Closing a
// loop that is still open is the one mistake this file must never make, so every
// doubtful case keeps the loop open.
const FlowFollowUp = (() => {
  const KINDS = { REPLY: 'reply', PAYMENT: 'payment' };
  const MIN_WORDS = 6;
  const MAX_WHAT = 140;
  const REPLY_BUSINESS_DAYS = 2;
  const PAYMENT_DAYS = 7;
  const RECHASE_PAYMENT_DAYS = 3;
  const MAX_NUDGE_LEVEL = 3;
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
  function chaseDate(kind, deadlineIso, now, days) {
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
    return isoDay(addBusinessDays(t0, days || REPLY_BUSINESS_DAYS));
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
    const date = ex && ex.parseDate ? ex.parseDate(body, new Date(typeof c.now === 'number' ? c.now : Date.now())) : null;
    const deadlineIso = date && date.iso ? date.iso : null;

    const lines = sentences(body);
    const candidates = lines.filter((s) => words(s) >= 4 && !COURTESY.test(s));
    if (!candidates.length) return null;

    const he = hasHebrew(body);
    const asks = he ? ASK_HE : ASK_EN;
    let askLine = candidates.find((s) => asks.some((re) => re.test(s)) || (he && ASK_EN.some((re) => re.test(s))));

    // The lexicon (core/request-types.js) recognises asks the fixed phrasings
    // above miss: frame + action + object, in either language. Local code, no
    // model. Absent when that file is not loaded, so nothing depends on it.
    const types = c.types || (typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null);
    let typed = null;
    if (types) {
      for (const s of candidates) { const t = types.detectRequest(s); if (t) { typed = { line: s, req: t }; break; } }
      if (!askLine && typed) askLine = typed.line;
    }

    // Payment: a payment word AND a figure AND some instruction or due date.
    const payLine = money ? candidates.find((s) => PAY_WORD.test(s)) : null;
    const dueCue = /\b(?:due|by|before|within|no later than|please|kindly|overdue|outstanding)\b|(?:עד|לפני|בתוך|נא|בבקשה|באיחור)/i;
    const isPayment = Boolean(payLine && (dueCue.test(payLine) || deadlineIso || askLine));
    // "Please pay the invoice" with no figure is still a payment being chased.
    const payAsk = !isPayment && typed && typed.req.action === 'pay' ? typed : null;

    if (!askLine && !isPayment) return null;

    // A hedge on the only ask line, with no deadline anywhere, is a wish.
    const chosen = isPayment ? payLine : askLine;
    if (HEDGE.test(chosen) && !deadlineIso && !isPayment) return null;

    const kind = isPayment || payAsk ? KINDS.PAYMENT : KINDS.REPLY;
    const req = typed && (typed.line === chosen || !isPayment) ? typed.req : null;
    return {
      kind,
      what: clip(chosen, MAX_WHAT),
      amount: money ? { value: money.value, currency: money.currency || null, raw: money.raw } : null,
      deadlineIso,
      chaseIso: chaseDate(kind, deadlineIso, c.now, req ? req.days : undefined),
      lang: he ? 'he' : 'en',
      subtype: req ? req.type : null,
      subtypeLabel: req ? req.label : null,
      direction: 'theirs'
    };
  }

  // ---- the mirror: what YOU promised ---------------------------------------------
  // Your own message says "I'll send it by Friday". That is a loop too — one you
  // owe. Same discipline: a first-person promise with a real action, no hedge, no
  // courtesy, and the day it is due (stated, else two business days).
  // text: your own message, quoted history removed. Returns null or a loop-shaped
  // ask with direction 'mine'.
  function classifyCommitment(text, ctx) {
    const c = ctx || {};
    const body = String(text || '').trim();
    if (!body || words(body) < 4) return null;
    const types = c.types || (typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null);
    if (!types) return null;
    const lines = sentences(body).filter((s) => words(s) >= 4 && !COURTESY.test(s));
    let hit = null;
    for (const s of lines) { const t = types.detectCommitmentSentence(s); if (t) { hit = { line: s, t }; break; } }
    if (!hit) return null;
    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    const date = ex && ex.parseDate ? ex.parseDate(hit.line, new Date(typeof c.now === 'number' ? c.now : Date.now())) : null;
    const deadlineIso = date && date.iso ? date.iso : null;
    return {
      kind: KINDS.REPLY,
      what: clip(hit.line, MAX_WHAT),
      amount: null,
      deadlineIso,
      chaseIso: chaseDate(KINDS.REPLY, deadlineIso, c.now),
      lang: hasHebrew(body) ? 'he' : 'en',
      subtype: hit.t.type,
      subtypeLabel: null,
      direction: 'mine'
    };
  }

  // Did your own newer message deliver what you promised?
  const DELIVERS = /\b(?:attached|attaching|enclosed|here(?:'s| is| are)|please find|as promised|sent (?:it|them|over)|done|finished|completed|just sent)\b|(?:מצורף|מצורפת|שלחתי|סיימתי|הנה|כפי שהבטחתי)/i;
  function deliversPromise(text) {
    return DELIVERS.test(String(text || '')) && !/\b(?:will|'ll|going to)\b/i.test(String(text || '').slice(0, 200));
  }

  function closeAsKept(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'resolved', resolvedAt: t, resolvedBy: 'delivered', closedAs: 'kept' };
  }

  function isMine(w) { return Boolean(w) && w.direction === 'mine'; }

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
      direction: ask.direction === 'mine' ? 'mine' : 'theirs',
      subtype: ask.subtype || null,
      stage: 'waiting',
      nudges: 0,
      nudgedAt: null,
      promisedIso: null,
      lastReplyAt: null,
      closedAs: null
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

  // 'waiting' | 'nudged' | 'promised' for a live loop; the status otherwise.
  // Older stored watches have no `stage`, so it is derived from `nudges`.
  function stageOf(w) {
    if (!w) return null;
    if (w.status !== 'waiting') return w.status;
    return w.stage || ((w.nudges || 0) > 0 ? 'nudged' : 'waiting');
  }

  // Whole days since the loop was opened.
  function daysOpen(w, now) {
    if (!w || !w.createdAt) return 0;
    const a = today(w.createdAt).getTime();
    const b = today(now).getTime();
    return Math.max(0, Math.round((b - a) / DAY_MS));
  }

  // ---- closure intelligence: what did the reply actually do? -------------------
  // Outcomes: 'auto' (out-of-office / bot), 'ack' (got it, thanks), 'promised'
  // (a date or "I will" — the loop stays open and the chase moves), 'answered'
  // (a payment thread got a reply that never says it was paid), 'paid',
  // 'closed' (a real answer to a request for a reply).
  const ACK_EN = /^(?:ok(?:ay)?|got it|noted|received|thanks?(?: you)?|thank you|will do|sure|sounds good|on it|looking into it|will look(?: into it)?|i'?ll look(?: into it)?|let me (?:check|look|review)|checking|acknowledged|understood|much appreciated|appreciate it|thanks for (?:sending|sharing|the (?:update|note|email|heads-?up)))\b/i;
  const ACK_HE = /^(?:תודה רבה|תודה|קיבלתי|קיבלנו|רשמתי|אבדוק|בודק|בודקת|נבדוק|סבבה|אוקיי|בסדר|על זה|הבנתי)/;
  // Words that mean the reply carries the substance asked for.
  const CONFIRM = /\b(?:confirmed?|approved?|agreed?|attached|enclosed|here(?:'s| is| are)|signed|done|yes|accepted|that works|works for me)\b|(?:אושר|מאשר|מאשרת|מצורף|חתום|חתמתי|כן|מסכים|מסכימה|סגור)/i;
  const PROMISE_EN = /\b(?:(?:i|we)(?:'ll| will| shall| am going to|'re going to| are going to) (?:\w+ ){0,2}(?:send|pay|wire|transfer|get|reply|respond|confirm|share|return|forward|sign|approve|review|look|check|have|revert|come back|process|release|make|deliver|finali[sz]e)|(?:will|should) (?:be )?(?:paid|sent|wired|transferred|processed|released|ready|done|signed|approved)|get back to you|(?:forwarded|passed|passing|handing|handed) (?:it |this |that )?(?:to|over to|on to)|(?:looping|looped|cc'?ing|cc'?d) in|(?:my|our) (?:colleague|assistant|team|manager|accountant|lawyer) (?:will|is going to)|revert (?:to you )?(?:by|on)|scheduled for|later (?:today|this week)|not yet|still (?:working|looking|reviewing|waiting)|working on (?:it|this)|in progress|(?:this|next) (?:week|month)|tomorrow|end of (?:the )?week|eow|within \d+ (?:business )?days?)\b/i;
  const PROMISE_HE = /(?:העבר(?:תי|נו) (?:את )?(?:זה |הכל )?ל(?:חשבות|הנה"ח|הנהלת|מנהל|עמית|גורם|אחראי|עורך)|אעביר|נעביר|אשלח|נשלח|אחזור אל|נחזור אל|אאשר|נאשר|יועבר|ישולם|יישלח|מחר|השבוע|בשבוע הבא|בחודש הבא)/;
  // "I paid" / "payment was sent" — and the sentence-level guards that turn it
  // into a hypothetical or a negative ("not paid", "once it is paid").
  const PAID_EN = /\b(?:(?:i|we)(?:'ve| have)? (?:just |already )?(?:paid|wired|transferred)|(?:i|we)(?:'ve| have)? (?:just |already )?sent (?:the |your )?(?:payment|transfer|wire|funds|money)|(?:payment|transfer|wire)(?: of [^.]{0,30})? (?:was |has been )?(?:sent|made|done|completed|processed|released|initiated)|(?:has|have) been (?:paid|wired|transferred)|was (?:paid|wired|transferred)|already paid|paid (?:in full|today|yesterday)|funds (?:were |have been )?(?:sent|transferred))\b/i;
  const PAID_HE = /(?:שילמתי|שילמנו|העברתי|העברנו|שולם|התשלום (?:בוצע|הועבר|נשלח)|בוצעה העברה|הועבר)/;
  const GUARD_EN = /\b(?:not|never|once|if|when|unless|until)\b|n't\b/i;
  const GUARD_HE = /(?:^|\s)(?:לא|טרם|אם|כש\S*|ברגע)(?=\s|$)/;
  // Greetings are not content: "Hi Dana, got it" is an acknowledgement.
  const GREET_EN = /^\s*(?:hi|hello|hey|dear)(?:\s+[\w'.-]+)?\s*[,!:]\s*/i;
  const GREET_HE = /^\s*(?:היי|הי|שלום)(?:\s+[^\s,!:]+)?\s*[,!:]\s*/;
  const ACK_MAX_WORDS = 7;

  function stripGreeting(text) {
    return String(text || '').replace(GREET_EN, '').replace(GREET_HE, '').trim();
  }

  function isAck(body) {
    if (words(body) > ACK_MAX_WORDS || /\d/.test(body) || CONFIRM.test(body)) return false;
    return ACK_EN.test(body) || ACK_HE.test(body);
  }

  // "Passed it to accounting" is a hand-off, not a payment.
  const HANDOFF_HE = /העבר(?:תי|נו)[^.]{0,20}ל(?:חשבות|הנה"ח|הנהלת|מנהל|עמית|גורם|אחראי)/;
  function paidClaimed(body) {
    return sentences(body).filter((s) => !HANDOFF_HE.test(s)).some((s) => (PAID_EN.test(s) || PAID_HE.test(s)) && !GUARD_EN.test(s) && !GUARD_HE.test(s));
  }

  // The day a reply promised something, or null. Accepts only today or later.
  function promisedDay(text, now, ex) {
    const t0 = today(now);
    const todayIso = isoDay(t0);
    const d = ex && ex.parseDate ? ex.parseDate(text, new Date(typeof now === 'number' ? now : Date.now())) : null;
    if (d && d.iso && d.iso >= todayIso) return d.iso;
    if (/\btomorrow\b|מחר/i.test(text)) { const x = new Date(t0.getTime()); x.setDate(x.getDate() + 1); return isoDay(x); }
    if (/\b(?:end of (?:the )?week|eow)\b/i.test(text)) {
      const x = new Date(t0.getTime());
      x.setDate(x.getDate() + ((5 - x.getDay() + 7) % 7));
      return isoDay(x);
    }
    return null;
  }

  // text: the other person's newest message, quoted history already removed.
  // watch: the loop it landed on. ctx: { now?, email?, extract? }.
  // Returns { outcome, promisedIso }.
  function classifyReply(text, watch, ctx) {
    const c = ctx || {};
    const kind = watch && watch.kind === KINDS.PAYMENT ? KINDS.PAYMENT : KINDS.REPLY;
    const raw = String(text || '').trim();
    if (isAutoReply(raw, c.email)) return { outcome: 'auto', promisedIso: null };

    const body = stripGreeting(raw);
    const n = words(body);
    // No text at all (a bare attachment, say). For a request for a reply that
    // is the reply; for a payment it proves nothing.
    if (!n) return { outcome: kind === KINDS.PAYMENT ? 'answered' : 'closed', promisedIso: null };

    if (kind === KINDS.PAYMENT && paidClaimed(body)) return { outcome: 'paid', promisedIso: null };

    // For a request for a reply, "confirmed / attached / signed" means the thing
    // was delivered even if a promise about something else is in the message.
    const delivered = kind === KINDS.REPLY && CONFIRM.test(body);
    const promise = !delivered && (PROMISE_EN.test(body) || PROMISE_HE.test(body));
    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    const promisedIso = promise ? promisedDay(body, c.now, ex) : null;

    if (promise && promisedIso) return { outcome: 'promised', promisedIso };
    if (isAck(body)) return { outcome: 'ack', promisedIso: null };
    if (promise && n <= 30) return { outcome: 'promised', promisedIso: null };
    if (kind === KINDS.PAYMENT) return { outcome: n >= 4 ? 'answered' : 'ack', promisedIso: null };
    return { outcome: 'closed', promisedIso: null };
  }

  // The day to look again, after a nudge, a promise or a reopen.
  //   a usable promised day -> chaseDate (reply: that day; payment: the day after)
  //   otherwise             -> reply: two business days; payment: three days
  function rechaseDate(kind, now, promisedIso) {
    const t0 = today(now);
    if (promisedIso && promisedIso >= isoDay(t0)) return chaseDate(kind, promisedIso, now);
    if (kind === KINDS.PAYMENT) { const d = new Date(t0.getTime()); d.setDate(d.getDate() + RECHASE_PAYMENT_DAYS); return isoDay(d); }
    return isoDay(addBusinessDays(t0, REPLY_BUSINESS_DAYS));
  }

  // What a reply does to a loop, as plain data the caller applies.
  //   { none:true }                      nothing to do (auto-reply)
  //   { patch, close, confirm, rescheduled }
  // `close` loops end; `confirm` means "ask the person if it was paid";
  // `rescheduled` means the chase day moved and the Task should follow.
  function applyReply(watch, reply, now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (!watch || watch.status !== 'waiting' || isMine(watch) || !reply || reply.outcome === 'auto') return { none: true };
    const seen = { lastReplyAt: t };
    switch (reply.outcome) {
      case 'closed':
        return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'replied' }), close: true };
      case 'paid':
        return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'paid' }), close: true };
      case 'promised': {
        const chaseIso = rechaseDate(watch.kind, t, reply.promisedIso);
        return { patch: Object.assign({}, seen, { stage: 'promised', promisedIso: reply.promisedIso || null, chaseIso }), rescheduled: true };
      }
      case 'answered':
        return { patch: seen, confirm: true };
      default: // ack
        return { patch: seen };
    }
  }

  // The person's own newest message in a thread they are waiting on: was it a
  // chase? Only chase-shaped wording counts — an ordinary follow-up message
  // ("see you Tuesday") must not be recorded as a nudge.
  const CHASE_EN = /\b(?:follow(?:ing)?[ -]?up|reminder|checking in|check(?:ing)? back|circling back|bump(?:ing)?|any (?:update|news)|still waiting|haven'?t heard|touching base|gentle nudge|wanted to (?:follow|check))\b/i;
  const CHASE_HE = /(?:חוזר|חוזרת|תזכורת|בהמשך לפני|עדיין ממתין|עדיין מחכה|מעקב)/;
  function looksLikeChase(text) {
    const t = String(text || '');
    if (words(t) < 4) return false;
    return CHASE_EN.test(t) || CHASE_HE.test(t);
  }

  // Patch for "I chased". The chase day moves out and the next nudge is firmer.
  function recordNudge(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { stage: 'nudged', nudges: (w.nudges || 0) + 1, nudgedAt: t, chaseIso: rechaseDate(w.kind, t, null) };
  }

  // Patch for putting a closed loop back on the list.
  function reopenPatch(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return {
      status: 'waiting', resolvedAt: null, resolvedBy: null, closedAs: null, reopenedAt: t,
      stage: (w.nudges || 0) > 0 ? 'nudged' : 'waiting', promisedIso: null,
      chaseIso: rechaseDate(w.kind, t, null)
    };
  }

  function canReopen(w) { return Boolean(w) && w.status === 'resolved'; }

  // Which nudge comes next: 1 (friendly), 2 (firmer), 3 (last, direct).
  function nextNudgeLevel(w) { return Math.min(MAX_NUDGE_LEVEL, ((w && w.nudges) || 0) + 1); }

  // ---- the money view ----------------------------------------------------------
  // What is owed to you across tracked payment chases, by currency. Never mixes
  // currencies into one number.
  function summarize(watches, now) {
    const list = Array.isArray(watches) ? watches : [];
    const active = list.filter(isActive);
    const overdue = active.filter((w) => watchState(w, now) === 'overdue');
    const owed = {};
    active.forEach((w) => {
      if (isMine(w) || w.kind !== KINDS.PAYMENT || !w.amount || !(w.amount.value > 0)) return;
      const cur = w.amount.currency || '?';
      owed[cur] = (owed[cur] || 0) + w.amount.value;
    });
    const moneyOwed = Object.keys(owed).sort().map((currency) => ({ currency, value: owed[currency] }));

    // What got closed this calendar month, and what was paid.
    const t = today(now);
    const monthStart = new Date(t.getFullYear(), t.getMonth(), 1).getTime();
    const closed = list.filter((w) => w.status === 'resolved' && (w.resolvedAt || 0) >= monthStart);
    const paidBy = {};
    closed.forEach((w) => {
      if (w.closedAs !== 'paid' || !w.amount || !(w.amount.value > 0)) return;
      const cur = w.amount.currency || '?';
      paidBy[cur] = (paidBy[cur] || 0) + w.amount.value;
    });
    const paidThisMonth = Object.keys(paidBy).sort().map((currency) => ({ currency, value: paidBy[currency] }));

    return {
      active: active.length,
      overdue: overdue.length,
      youOwe: active.filter(isMine).length,
      nudged: active.filter((w) => stageOf(w) === 'nudged').length,
      promised: active.filter((w) => stageOf(w) === 'promised').length,
      oldestOpenDays: active.reduce((m, w) => Math.max(m, daysOpen(w, now)), 0),
      moneyOwed,
      closedThisMonth: closed.length,
      paidThisMonth
    };
  }

  // Loops closed lately, newest first, for the "closed" list and its Reopen.
  function recentlyClosed(watches, now, limit) {
    const list = Array.isArray(watches) ? watches : [];
    const since = today(now).getTime() - 30 * DAY_MS;
    return list
      .filter((w) => w.status === 'resolved' && (w.resolvedAt || 0) >= since)
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .slice(0, limit || 5);
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

  // Plain, short, human. A person reads this before sending, so it is a draft
  // to edit, never a message sent on anyone's behalf. Three levels, each one a
  // little firmer, and never rude:
  //   1  a friendly reminder        2  a clear second ask        3  a last, direct one
  // `level` defaults to the next one for this loop.
  function nudgeText(w, level, now) {
    const lvl = Math.min(MAX_NUDGE_LEVEL, Math.max(1, level || nextNudgeLevel(w)));
    const name = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    const he = w.lang === 'he';
    const amount = w.amount && w.amount.raw ? w.amount.raw : null;
    const days = daysOpen(w, now);
    const pay = w.kind === KINDS.PAYMENT;
    if (he) {
      const hi = name ? 'היי ' + name + ',' : 'שלום,';
      if (pay) {
        if (lvl === 1) return hi + '\n\nתזכורת ידידותית' + (amount ? ' לגבי התשלום על סך ' + amount : ' לגבי התשלום') + '. אפשר לעדכן אותי מתי להמתין לו?\n\nתודה,';
        if (lvl === 2) return hi + '\n\nחוזר/ת שוב בנושא התשלום' + (amount ? ' על סך ' + amount : '') + (days >= 2 ? ', שפתוח כבר ' + days + ' ימים' : '') + '. אפשר לאשר מתי הוא יישלח?\n\nתודה,';
        return hi + '\n\nחוזר/ת פעם אחרונה: התשלום' + (amount ? ' על סך ' + amount : '') + ' עדיין פתוח' + (days >= 2 ? ' אחרי ' + days + ' ימים' : '') + '. נא לשלוח אותו או לעדכן אותי היום בתאריך המדויק. אם כבר שולם, נא לשלוח אישור.\n\nתודה,';
      }
      if (lvl === 1) return hi + '\n\nחוזר/ת לפנייה הקודמת שלי: ' + w.what + '\n\nאפשר לעדכן אותי כשיש לך רגע? תודה!';
      if (lvl === 2) return hi + '\n\nחוזר/ת שוב לנושא: ' + w.what + '\n\nזה עוצר את הצעד הבא אצלי. אפשר לעדכן אותי היום איפה זה עומד?\n\nתודה,';
      return hi + '\n\nחוזר/ת פעם אחרונה בנושא: ' + w.what + '\n\nאני צריך/ה לסגור את זה. אשמח לתשובה היום, כן, לא או תאריך, כדי שאוכל לתכנן בהתאם.\n\nתודה,';
    }
    const hi = name ? 'Hi ' + name + ',' : 'Hi,';
    if (pay) {
      if (lvl === 1) return hi + '\n\nA friendly reminder about the payment' + (amount ? ' of ' + amount : '') + '. Could you let me know when I can expect it?\n\nThanks,';
      if (lvl === 2) return hi + '\n\nFollowing up again on the payment' + (amount ? ' of ' + amount : '') + (days >= 2 ? ', which has been open for ' + days + ' days' : '') + '. Could you confirm the date it will be sent?\n\nThanks,';
      return hi + '\n\nFollowing up one last time: the payment' + (amount ? ' of ' + amount : '') + ' is still open' + (days >= 2 ? ' after ' + days + ' days' : '') + '. Please send it, or tell me today the exact date it will arrive. If it was already sent, please share the confirmation.\n\nThanks,';
    }
    if (lvl === 1) return hi + '\n\nA quick follow-up on my earlier note: ' + w.what + '\n\nCould you get back to me when you can? Thanks!';
    if (lvl === 2) return hi + '\n\nFollowing up again on this: ' + w.what + '\n\nIt is holding up the next step on my side. Could you let me know where it stands today?\n\nThanks,';
    return hi + '\n\nFollowing up one last time on: ' + w.what + '\n\nI need to close this out. Please reply today with a yes, a no, or a date, so I can plan around it.\n\nThanks,';
  }

  function taskTitle(w) {
    const who = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    if (isMine(w)) return 'Keep your promise' + (who ? ' to ' + who : '') + (w.subject ? ' — ' + clip(w.subject, 80) : '');
    const head = w.kind === KINDS.PAYMENT ? 'Chase payment' : 'Chase reply';
    const amt = w.kind === KINDS.PAYMENT && w.amount && w.amount.raw ? ' ' + w.amount.raw : '';
    return head + (who ? ' from ' + who : '') + amt + (w.subject ? ' — ' + clip(w.subject, 80) : '');
  }

  return {
    KINDS, MAX_NUDGE_LEVEL, classifyOutgoing, classifyCommitment, deliversPromise, closeAsKept, isMine, chaseDate, rechaseDate, buildWatch, watchState, stageOf, daysOpen,
    repliedSince, isAutoReply, isActive, classifyReply, applyReply, looksLikeChase, recordNudge, reopenPatch, canReopen,
    nextNudgeLevel, summarize, recentlyClosed, formatMoney, nudgeText, taskTitle, firstName, isoDay
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFollowUp };
