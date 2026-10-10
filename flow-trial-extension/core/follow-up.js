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
//     stage:'waiting'|'nudged'|'promised'|'yours', nudges, nudgedAt, promisedIso,
//     lastReplyAt, closedAs:'replied'|'paid'|'declined'|'manual'|null }
//
// A watch is an OPEN LOOP: something you are owed, kept open until reality
// closes it. The life of one loop:
//   opened  -> waiting  (you asked; a chase day is set)
//           -> nudged   (you chased; the chase day moves out and the next nudge
//                        is firmer)
//           -> promised (they said "by Friday"; the chase day becomes Friday)
//           -> yours    (they wrote back but need something from you: a question,
//                        "I never got the attachment". The chase to them stops, the
//                        reminder is for you, and it flips back when you answer)
//           -> closed   (a real reply, or — for money — confirmation it was paid;
//                        a plain "no" closes it too, recorded as 'declined')
// What does NOT close a loop: an out-of-office, a bare "got it, thanks", a
// promise, a question back, "I could not open it", or (for a payment) a reply
// that never says it was paid. Closing a
// loop that is still open is the one mistake this file must never make, so every
// doubtful case keeps the loop open.
const FlowFollowUp = (() => {
  // Sibling modules: globals in the browser (content scripts share one scope,
  // loaded in manifest order), require() under node. Absent is fine: every use
  // falls back to the older behaviour.
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const replyMeaning = sibling(typeof FlowReplyMeaning !== 'undefined' ? FlowReplyMeaning : null, './reply-meaning.js', 'FlowReplyMeaning');
  const intentModel = sibling(typeof FlowIntentModel !== 'undefined' ? FlowIntentModel : null, './intent-model.js', 'FlowIntentModel');
  const outcomeLabels = sibling(typeof FlowOutcomeLabels !== 'undefined' ? FlowOutcomeLabels : null, './outcome-labels.js', 'FlowOutcomeLabels');
  const filePath = sibling(typeof FlowFilePath !== 'undefined' ? FlowFilePath : null, './file-path.js', 'FlowFilePath');
  const replyModel = sibling(typeof FlowReplyModel !== 'undefined' ? FlowReplyModel : null, './reply-model.js', 'FlowReplyModel');
  const personModel = sibling(typeof FlowPersonModel !== 'undefined' ? FlowPersonModel : null, './person-model.js', 'FlowPersonModel');
  const requestTypes = sibling(typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null, './request-types.js', 'FlowRequestTypes');
  // Item by item (core/client-requests.js): used only when the caller passes items: true (CLIENT_REQUESTS.items, off).
  const clientRequests = sibling(typeof FlowClientRequests !== 'undefined' ? FlowClientRequests : null, './client-requests.js', 'FlowClientRequests');
  const KINDS = { REPLY: 'reply', PAYMENT: 'payment' };
  const NOT_ANSWER_MAX_WORDS = 18;
  const NOT_ANSWER_MIN = 0.9;   // how sure core/reply-model.js must be that a reply is not an answer before it holds a loop open
  const MIN_WORDS = 6;
  const MAX_WHAT = 140;
  const REPLY_BUSINESS_DAYS = 2;
  const PAYMENT_DAYS = 7;
  const RECHASE_PAYMENT_DAYS = 3;
  const MAX_NUDGE_LEVEL = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---- courtesy and hedge: sentences that sound like asks but are not -------
  const COURTESY = /\b(?:let me know if (?:you|there|anything|any|i can)|feel free to|don'?t hesitate|hope (?:this|that|you)|looking forward|thanks? (?:again|so much)|have a (?:great|good|nice|lovely)|talk soon|speak soon|best regards|kind regards|warm regards|if you have any (?:questions|concerns)|happy to (?:help|chat|discuss)|at your convenience)\b|(?:אל תהססו|אם יש (?:לכם )?שאלות|בברכה|שיהיה (?:לך|לכם) (?:יום|שבוע)|נשמח לעמוד)/i;
  const HEDGE = /\b(?:no rush|whenever you (?:get a chance|can|have a moment)|if (?:you|it'?s) (?:possible|convenient)|when you (?:get|have) a (?:chance|moment)|sometime|no pressure|if you(?:'re| are) free)\b|(?:אין לחץ|כשיהיה לך (?:זמן|נוח)|כשנוח לך|כשתוכל|מתישהו|אם נוח)/i;

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

  // A scheduling question too short for the four-word line filter, and nothing else.
  function isShortScheduleAsk(s) {
    return /^(?:מתי (?:נוח|מתאים) (?:לך|לכם|לי|לכן)|when (?:is|would be) (?:a )?good time)\s*\??$/i.test(String(s || '').trim());
  }
  // A suggestion to talk, with no delivery in it, is not the answer to the open ask.
  const TALK_SUGGESTION = /(?:כדאי (?:שנדבר|לדבר|לשוחח)|בוא(?:ו|י)? נדבר|בואי נדבר)|\b(?:we should|let's|lets) (?:talk|discuss|speak|chat)\b|\bworth (?:a|us) (?:call|chat|talk)\b/i;
  function talkSuggestion(body) {
    if (words(body) > 24) return false;
    if (DELIVERY_WORDS.test(body) || CONFIRM.test(body)) return false;
    return TALK_SUGGESTION.test(body);
  }

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
  // ---- the weight of an intention -------------------------------------------------
  // "Genius is knowing when not to start": a loop costs a Free slot and the
  // person's attention. Money, a stated deadline, a concrete action, or an
  // explicit need give an ask weight. A soft closer with none of those does not.
  const SOFT_ASK = /\b(?:let me know(?: what you think| your thoughts| how you feel| if you (?:have|need|want|like|can|would))?|what do you think|any thoughts|your thoughts|thoughts\?|keep me posted|keep me in the loop|feel free|whenever|just checking|just wanted|for your information|fyi)\b|(?:מה דעתך|מה דעתכם|תעדכן אותי|תעדכנו אותי|תודיע לי מה|מה אתה חושב|מה את חושבת)/i;
  const CONCRETE_VERB = /\b(?:confirm|send|share|review|sign|approve|forward|provide|return|schedule|book|pay|transfer|wire|settle|attach|upload|submit|complete|fill|decide|choose|verify|resend|deliver|finali[sz]e)\b|(?:לשלוח|לאשר|לחתום|להעביר|לשלם|לבדוק|לקבוע|לסיים|לבחור|לוודא|תשלח|תאשר|תחתום|תעביר|תשלם|תבדוק|תקבע|תסיים|תבחר|תוודא)/i;
  const NEED_FRAME = /\b(?:i need|we need|need you to|waiting (?:for|on)|awaiting|required|must|have to|by (?:eod|end of)|asap|urgent(?:ly)?)\b|(?:אני צריך|אנחנו צריכים|צריך ש|ממתין|ממתינה|מחכה ל|דחוף|חייב)/i;
  // A date was named even when it could not be resolved ("by 10/09", "by Friday EOD").
  const DEADLINE_CUE = /\b(?:by|before|until|no later than)\s+(?:the\s+)?(?:\d|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|tonight|eod|eow|end of|next|this)|(?:עד|לפני)\s+(?:יום|ה|סוף|מחר|היום|\d)/i;
  function intentionWeight(a) {
    const signals = [];
    let score = 0;
    if (a.money) { score += 3; signals.push('amount'); }
    if (a.payment) { score += 2; signals.push('payment'); }
    if (a.deadline) { score += 3; signals.push('deadline'); }
    else if (DEADLINE_CUE.test(a.line)) { score += 3; signals.push('deadline-cue'); }
    if (CONCRETE_VERB.test(a.line)) { score += 2; signals.push('concrete-action'); }
    else if (a.req && a.req.action && a.req.action !== 'reply' && !(SOFT_ASK.test(a.line) && /^(?:review|decide)$/.test(a.req.action))) {
      // "Any thoughts?" reads as a review or a decision to the lexicon; with a softener it is only an opinion.
      score += 2; signals.push('action:' + a.req.action);
    }
    if (a.req && a.req.object) { score += 1; signals.push('object:' + a.req.object); }
    if (NEED_FRAME.test(a.line)) { score += 1; signals.push('explicit-need'); }
    const soft = SOFT_ASK.test(a.line);
    if (soft) { score -= 3; signals.push('soft'); }
    // Only a soft ask with nothing behind it is light; everything else opens.
    const hard = signals.some((x) => x === 'amount' || x === 'payment' || x === 'deadline' || x === 'deadline-cue' || x === 'concrete-action' || x.indexOf('action:') === 0);
    const level = soft && !hard ? 'light' : 'real';
    return { score, level, signals };
  }

  // A whole message of two to five words that is itself a chase: "Any update?",
  // "Signed yet?", "?מה הסטטוס". Recognised on shape alone (core/request-types.js),
  // and only when nothing else is in the message.
  function shortChase(body, c) {
    const types = c.types || requestTypes;
    if (!types || !types.detectShortAsk) return null;
    const bare = body.replace(/^\s*(?:hi|hello|hey|היי|שלום)[^\n,!?]{0,20}[,!:]\s*/i, '').trim();
    const req = types.detectShortAsk(bare);
    if (!req) return null;
    const kind = req.action === 'pay' ? KINDS.PAYMENT : KINDS.REPLY;
    return {
      kind, what: clip(bare, MAX_WHAT), amount: null, deadlineIso: null,
      chaseIso: chaseDate(kind, null, c.now, req.days),
      lang: hasHebrew(body) ? 'he' : 'en', subtype: req.type, subtypeLabel: req.label, direction: 'theirs', short: true
    };
  }

  // text: YOUR OWN message, quoted history already removed.
  // ctx:  { now?, extract? } — `extract` is core/extract.js's FlowExtract; passed in
  //       so this file stays free of load-order assumptions.
  // Returns null (silence) or { kind, what, amount, deadlineIso, chaseIso, lang }.
  function classifyOutgoingBase(text, ctx) {
    const c = ctx || {};
    const body = String(text || '').trim();
    if (!body) return null;
    if (words(body) < MIN_WORDS) return shortChase(body, c);
    if (RECEIPT.test(body)) return null;

    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    const money = ex && ex.parseMoney ? ex.parseMoney(body) : null;
    const date = ex && ex.parseDate ? ex.parseDate(body, new Date(typeof c.now === 'number' ? c.now : Date.now())) : null;
    const deadlineIso = date && date.iso ? date.iso : null;

    const lines = sentences(body);
    const candidates = lines.filter((s) => !COURTESY.test(s) && (words(s) >= 4 || isShortScheduleAsk(s)));
    if (!candidates.length) return null;

    const he = hasHebrew(body);
    const asks = he ? ASK_HE : ASK_EN;
    let askLine = candidates.find((s) => asks.some((re) => re.test(s)) || (he && ASK_EN.some((re) => re.test(s))));

    // The lexicon (core/request-types.js) recognises asks the fixed phrasings
    // above miss: frame + action + object, in either language. Local code, no
    // model. Absent when that file is not loaded, so nothing depends on it.
    const types = c.types || (typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null);
    // The tiered local pipeline (core/intent-pipeline.js): lexicon first, then the
    // on-device model, each able to overrule the other. Both are local; no model
    // outside the device is ever consulted here (docs/local-first-principle.md).
    const pipe = c.pipeline === undefined ? (typeof FlowIntentPipeline !== 'undefined' ? FlowIntentPipeline : null) : c.pipeline;
    let typed = null, vetoed = null;
    if (pipe) {
      for (const s of candidates) {
        const r = pipe.recognize(s);
        if (r.act === 'ASK' && r.request && !typed) typed = { line: s, req: r.request, tier: r.tier };
        if (r.tier === 'model-veto' && !vetoed) vetoed = s;
      }
      if (typed && !askLine) askLine = typed.line;
    } else if (types) {
      for (const s of candidates) { const t = types.detectRequest(s); if (t) { typed = { line: s, req: t }; break; } }
      if (!askLine && typed) askLine = typed.line;
    }
    // The model is near-certain the only "ask" is a statement or a courtesy: no card.
    if (askLine && vetoed === askLine && !(typed && typed.line === askLine)) askLine = null;

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
    // Does this intention carry enough weight to deserve a loop? (A soft "let me
    // know what you think" with no money, date or concrete action does not.)
    // The date must belong to the ask itself: "Thanks for the call today. Let me know what you
    // think." has a date in the courtesy, not in the ask.
    const lineDate = ex && ex.parseDate ? ex.parseDate(chosen, new Date(typeof c.now === 'number' ? c.now : Date.now())) : null;
    const weight = intentionWeight({ line: chosen, money: Boolean(money), deadline: Boolean(lineDate && lineDate.iso), payment: kind === KINDS.PAYMENT, req });
    if (weight.level === 'light') return null;
    return {
      weight,
      tier: typed && typed.line === chosen && typed.tier ? typed.tier : 'rule',
      file: filePath ? filePath.askNeed(chosen) : null,
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

  // ---- items: one request, several things (switch: items, off) ------------------------------------------------
  // "Send me the signed contract, your ID copy and the invoice" is one loop with three things in it. Two of three is
  // not done. With ctx.items === true the loop carries its items (core/client-requests.js decides what each one is and
  // when it really arrived), and only the whole set closes it. Without the switch nothing here runs: same object as before.
  function itemsOf(text, c) {
    if (!c || c.items !== true || !clientRequests) return null;
    const r = clientRequests.classifyOutgoingRequest(text, { now: c.now, generic: true });
    return r && r.items && r.items.length ? r : null;
  }
  function classifyOutgoing(text, ctx) {
    const c = ctx || {};
    const base = classifyOutgoingBase(text, c);
    const it = itemsOf(text, c);
    if (!it) return base;
    if (base) return Object.assign({}, base, { items: it.items, deadlineIso: base.deadlineIso || it.deadlineIso || null });
    // The item engine found an explicit ask for named documents that the fixed phrasings missed.
    // A message that hands things over ("Please find attached the signed agreement") is not an ask.
    const body = String(text || '').trim();
    if (DELIVERS.test(body) || RECEIPT.test(body)) return null;
    const line = sentences(body).find((s) => !COURTESY.test(s)) || body;
    return {
      weight: { score: 3, level: 'real', signals: ['items'] },
      tier: 'items',
      file: null,
      kind: KINDS.REPLY,
      what: clip(line, MAX_WHAT),
      amount: null,
      deadlineIso: it.deadlineIso || null,
      chaseIso: chaseDate(KINDS.REPLY, it.deadlineIso || null, c.now),
      lang: it.lang,
      subtype: 'items',
      subtypeLabel: null,
      direction: 'theirs',
      items: it.items
    };
  }
  function hasItems(w) { return Boolean(w) && Array.isArray(w.items) && w.items.length > 0 && Boolean(clientRequests); }
  // The watch, seen as a request the item engine understands.
  function asRequest(w) {
    return {
      id: w.id, status: 'open', channel: w.channel || 'gmail', lang: w.lang || 'en', deadlineIso: w.deadlineIso || null, nudges: w.nudges || 0,
      client: { email: w.counterpart && w.counterpart.email ? String(w.counterpart.email).toLowerCase() : null, name: (w.counterpart && w.counterpart.name) || null },
      items: w.items
    };
  }
  function itemProof(items) {
    const out = [];
    items.forEach((i) => (i.proof || []).forEach((p) => { if (p && p.fetchedBack === true) out.push(Object.assign({ item: i.key }, p)); }));
    return out;
  }
  function itemCounts(w) {
    if (!hasItems(w)) return null;
    const done = w.items.filter(clientRequests.isDone).length;
    return { total: w.items.length, done, missing: clientRequests.missingItems(asRequest(w)).map((i) => i.key) };
  }
  // A reply on a loop with items. msg: { messageId, from:{email}, text, attachments:[{id,name,size}], fetchedBack, channel }.
  // Closes only when every item is received (a file read back), answered "none", or released; or when they decline.
  // "Got it, here is the first one" moves one item and keeps the loop open, chasing only what is still missing.
  function applyReplyItems(watch, reply, msg, now) {
    if (!hasItems(watch)) return applyReply(watch, reply, now);
    const t = typeof now === 'number' ? now : Date.now();
    if (watch.status !== 'waiting' || isMine(watch) || isClock(watch)) return { none: true };
    if (reply && reply.outcome === 'auto') return { none: true };
    const arr = msg ? clientRequests.applyArrival(asRequest(watch), Object.assign({}, msg, { now: t })) : { request: asRequest(watch), changes: [] };
    const items = arr.request.items;
    const allDone = items.every(clientRequests.isDone);
    const base = reply ? applyReply(watch, reply, t) : { none: true };
    const seen = { lastReplyAt: t, items };
    if (reply && reply.outcome === 'declined') return Object.assign({}, base, { patch: Object.assign({}, base.patch, { items }), changes: arr.changes });
    if (allDone) {
      return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'delivered', proof: itemProof(items) }), close: true, changes: arr.changes };
    }
    if (base.none && !arr.changes.length) return { none: true };
    if (base.close) {
      // The reply reads as an answer, but something asked for has not arrived: hold it open, and chase only the rest.
      return { patch: Object.assign({}, seen, { stage: 'partial', chaseIso: rechaseDate(watch.kind, t, null) }), partial: true, rescheduled: true, changes: arr.changes };
    }
    const patch = Object.assign({}, base.patch || { lastReplyAt: t }, { items });
    if (arr.changes.length && !base.rescheduled && !base.yours) { patch.stage = 'partial'; patch.chaseIso = rechaseDate(watch.kind, t, null); }
    return Object.assign({}, base.none ? {} : base, { patch, changes: arr.changes, partial: arr.changes.length > 0 });
  }
  // The person settles one item by hand: 'confirm' / 'reject' a file Glance was unsure of, 'release' (no longer needed),
  // 'received' (it came another way), 'reopen'. Returns { patch, close }.
  function decideItem(watch, key, verdict, now) {
    if (!hasItems(watch)) return { none: true };
    const t = typeof now === 'number' ? now : Date.now();
    const items = clientRequests.decide(asRequest(watch), key, verdict, t).items;
    if (watch.status === 'waiting' && items.every(clientRequests.isDone)) {
      const allReleased = items.every((i) => i.status === 'released');
      return { patch: { items, status: 'resolved', resolvedAt: t, resolvedBy: 'person', closedAs: allReleased ? 'released' : 'delivered', proof: itemProof(items) }, close: true };
    }
    return { patch: { items } };
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
    const pipe = c.pipeline === undefined ? (typeof FlowIntentPipeline !== 'undefined' ? FlowIntentPipeline : null) : c.pipeline;
    if (!types && !pipe) return null;
    const lines = sentences(body).filter((s) => words(s) >= 4 && !COURTESY.test(s));
    let hit = null;
    for (const s of lines) {
      if (pipe) { const r = pipe.recognize(s); if (r.act === 'PROMISE' && r.commitment) { hit = { line: s, t: r.commitment, tier: r.tier }; break; } }
      else { const t = types.detectCommitmentSentence(s); if (t) { hit = { line: s, t }; break; } }
    }
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
      tier: hit.tier || 'rule',
      file: filePath ? filePath.promiseNeed(hit.line, hit.t.action) : null,
      direction: 'mine'
    };
  }

  // A proposal from the on-device language model (core/local-lm.js) -> the `ask` object buildWatch() takes.
  // It is offered like any other ask: the person taps Stay on it / Remind me, and nothing is written before that.
  function fromProposal(pr, now) {
    if (!pr || (pr.act !== 'ASK' && pr.act !== 'PROMISE') || !pr.sentence) return null;
    const t = typeof now === 'number' ? now : Date.now();
    const mine = pr.act === 'PROMISE';
    const kind = !mine && pr.action === 'pay' ? KINDS.PAYMENT : KINDS.REPLY;
    const act = requestTypes && requestTypes.ACTIONS ? requestTypes.ACTIONS.find((a) => a.id === pr.action) : null;
    return {
      kind,
      what: clip(pr.sentence, MAX_WHAT),
      amount: mine ? null : (pr.amount || null),
      deadlineIso: pr.deadlineIso || null,
      chaseIso: chaseDate(kind, pr.deadlineIso || null, t, act ? act.days : undefined),
      lang: hasHebrew(pr.sentence) ? 'he' : 'en',
      subtype: mine ? 'owe:' + pr.action : pr.action,
      subtypeLabel: mine || !act ? null : act.noun,
      tier: 'lm',
      file: null,
      direction: mine ? 'mine' : 'theirs'
    };
  }

  // Did your own newer message deliver what you promised?
  const DELIVERS = /\b(?:attached|attaching|enclosed|here(?:'s| is| are)|please find|as promised|sent (?:it|them|over)|done|finished|completed|just sent)\b|(?:מצורף|מצורפת|שלחתי|סיימתי|הנה|כפי שהבטחתי)/i;
  function deliversPromise(text) {
    return DELIVERS.test(String(text || '')) && !/\b(?:will|'ll|going to)\b/i.test(String(text || '').slice(0, 200));
  }

  // Did my newer message deliver what I promised? For a file-backed promise that takes
  // a real attachment; "attached" with nothing attached never closes it.
  function deliversFor(watch, text, evidence) {
    return filePath ? filePath.promiseDelivered(watch, text, evidence, deliversPromise) : deliversPromise(text);
  }

  function closeAsKept(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'resolved', resolvedAt: t, resolvedBy: 'delivered', closedAs: 'kept' };
  }

  // The person ticked the reminder done in Google Tasks: they have closed it themselves, wherever they were. A deliberate human
  // act, so it is a close (kept, when it was your own promise), but never counted as Glance's own close (it cannot be a false one).
  function closeFromTask(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { status: 'resolved', resolvedAt: t, resolvedBy: 'task', closedAs: w && w.direction === 'mine' ? 'kept' : 'manual' };
  }
  // Which waiting loops are worth asking Google Tasks about: they have a reminder, and it was not asked about in the last ten minutes.
  function taskRefsToCheck(watches, now, lastAsked) {
    const t = typeof now === 'number' ? now : Date.now();
    const asked = lastAsked || {};
    return (Array.isArray(watches) ? watches : []).filter((w) => w && w.status === 'waiting' && w.taskRef && w.taskRef.taskId && !(asked[w.id] && t - asked[w.id] < 10 * 60 * 1000)).slice(0, 10);
  }

  function isMine(w) { return Boolean(w) && w.direction === 'mine'; }
  // A 'clock' loop is a date that runs out (an offer, a trial), not a person to chase.
  function isClock(w) { return Boolean(w) && w.direction === 'clock'; }

  // ---- watches -----------------------------------------------------------------
  function buildWatch(a) {
    const ask = a.ask;
    return {
      id: String(a.threadId),
      threadId: String(a.threadId),
      messageId: a.messageId ? String(a.messageId) : null,
      subject: clip(a.subject || '', 160),
      counterpart: { email: (a.counterpart && a.counterpart.email) || null, name: (a.counterpart && a.counterpart.name) || null, phone: (a.counterpart && a.counterpart.phone) || null },
      // Which app the loop was opened in, and the one key that stands for this person across apps (core/identity-graph.js).
      channel: a.channel || 'gmail',
      personKey: a.personKey || null,
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
      direction: ask.direction === 'mine' ? 'mine' : ask.direction === 'clock' ? 'clock' : 'theirs',
      expiresIso: ask.expiresIso || null,
      subtype: ask.subtype || null,
      // The one file object that finishes this intention, or null (core/file-path.js).
      file: ask.file || null,
      // The multi-step path for a request that takes more than one step (core/resolution.js), or null.
      resolution: ask.resolution || null,
      // How the loop was recognised ('model' = the on-device model alone, no word-list frame).
      tier: ask.tier || null,
      ...(Array.isArray(ask.items) && ask.items.length ? { items: JSON.parse(JSON.stringify(ask.items)) } : {}),
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
    if (isClock(w) && w.expiresIso && w.expiresIso < isoDay(today(now))) return 'lapsed';
    return w.chaseIso && w.chaseIso < isoDay(today(now)) ? 'overdue' : 'waiting';
  }


  // An out-of-office or automatic reply is not an answer. Treating it as one
  // would close a follow-up the person is still waiting on.
  const AUTO_REPLY = /\b(?:out of (?:the )?office|automatic reply|auto-?reply|autoreply|away until|on (?:vacation|leave|holiday)|do not reply|undeliverable|delivery (?:status|failure)|mailer-daemon|message blocked|recipient address rejected)\b|(?:מחוץ למשרד|תשובה אוטומטית|בחופשה עד|בחופשה|אעדר)/i;

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
  const CONFIRM = /\b(?:confirmed?|approved?|agreed?|attached|enclosed|here(?:'s| is| are)|signed|done|yes|accepted|that works|works for me)\b|(?:^|[\s,.!?;:"'(])(?:אושר|מאשר|מאשרת|מצורף|חתום|חתמתי|כן|מסכים|מסכימה|סגור)(?=$|[\s,.!?;:"')])/i;     // Hebrew has no \b: bare "כן" also sits inside אעדכן, עדכן, מסכן
  const PROMISE_EN = /\b(?:(?:i|we)(?:'ll| will| shall| am going to|'re going to| are going to) (?:\w+ ){0,2}(?:send|pay|wire|transfer|get|reply|respond|confirm|share|return|forward|sign|approve|review|look|check|have|revert|come back|process|release|make|deliver|finali[sz]e)|(?:will|should) (?:be )?(?:paid|sent|wired|transferred|processed|released|ready|done|signed|approved)|get back to you|(?:will|shall) (?:revert|update you|let you know|come back)|(?:forwarded|passed|passing|handing|handed) (?:it |this |that )?(?:to|over to|on to)|(?:looping|looped|cc'?ing|cc'?d) in|(?:my|our) (?:colleague|assistant|team|manager|accountant|lawyer) (?:will|is going to)|revert (?:to you )?(?:by|on)|scheduled for|later (?:today|this week)|not yet|still (?:working|looking|reviewing|waiting)|working on (?:it|this)|in progress|(?:this|next) (?:week|month)|tomorrow|end of (?:the )?week|eow|within \d+ (?:business )?days?)\b/i;
  const PROMISE_HE = /(?:העבר(?:תי|נו) (?:את )?(?:זה |הכל )?ל(?:חשבות|הנה"ח|הנהלת|מנהל|עמית|גורם|אחראי|עורך)|אעביר|נעביר|אשלח|נשלח|אחזור אל|נחזור אל|אחזור|נחזור|אעדכן|נעדכן|אבדוק|נבדוק|אטפל|נטפל|אברר|נברר|אאשר|נאשר|יועבר|ישולם|יישלח|מחר|השבוע|בשבוע הבא|בחודש הבא)/;
  // "I paid" / "payment was sent" — and the sentence-level guards that turn it
  // into a hypothetical or a negative ("not paid", "once it is paid").
  const PAID_EN = /\b(?:(?:i|we)(?:'ve| have)? (?:just |already )?(?:paid|wired|transferred)|(?:i|we)(?:'ve| have)? (?:just |already )?sent (?:the |your )?(?:payment|transfer|wire|funds|money)|^paid\b|(?:payment|transfer|wire)(?: of [^.]{0,30})? (?:was |has been |just |already )?(?:sent|made|done|completed|processed|released|initiated|went out|has gone out)|(?:has|have) been (?:paid|wired|transferred)|was (?:paid|wired|transferred)|already paid|paid (?:in full|today|yesterday)|funds (?:were |have been )?(?:sent|transferred))\b/i;
  const PAID_HE = /(?:העברה בוצעה|שילמתי|שילמנו|העברתי|העברנו|שולם|התשלום (?:בוצע|הועבר|נשלח)|בוצעה העברה|הועבר)/;
  const GUARD_EN = /\b(?:not|never|once|if|when|unless|until)\b|n't\b/i;
  const GUARD_HE = /(?:^|\s)(?:לא|טרם|אם|כש\S*|ברגע)(?=\s|$)/;
  // Greetings are not content: "Hi Dana, got it" is an acknowledgement.
  const GREET_EN = /^\s*(?:hi|hello|hey|dear)(?:\s+[\w'.-]+)?\s*[,!:]\s*/i;
  const GREET_HE = /^\s*(?:היי|הי|שלום)(?:\s+[^\s,!:]+)?\s*[,!:]\s*/;
  const ACK_MAX_WORDS = 7;
  // Warm, but not an answer: "no worries, take your time" leaves the loop open.
  const SOFT_ACK_EN = /^(?:no worries|no problem|not a problem|no rush|no hurry|take your time|happy to wait|i can['’]?t wait|can['’]?t wait|looking forward|whenever you(?:['’]re| are) ready|all good|that(?:['’]s| is) fine)\b/i;
  const SOFT_ACK_HE = /^(?:אין בעיה|אין לחץ|אין מה למהר|קח את הזמן|קחו את הזמן|מחכה בסבלנות|מצפה)/;
  const SOFT_ACK_MAX_WORDS = 12;

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
    const base = classifyReplyText(text, watch, ctx);
    // A real attachment (or the lack of one) matters only on a file-backed loop, and
    // only when the page could report attachments (ctx.evidence).
    return filePath && ctx && ctx.evidence ? filePath.judgeReply(watch, base, ctx.evidence) : base;
  }

  function classifyReplyText(text, watch, ctx) {
    const c = ctx || {};
    const kind = watch && watch.kind === KINDS.PAYMENT ? KINDS.PAYMENT : KINDS.REPLY;
    const raw = String(text || '').trim();
    if (isAutoReply(raw, c.email)) return { outcome: 'auto', promisedIso: null, basis: 'rule' };

    const body = stripGreeting(raw);
    const n = words(body);
    // No text at all (a bare attachment, say). For a request for a reply that
    // is the reply; for a payment it proves nothing.
    if (!n) return { outcome: kind === KINDS.PAYMENT ? 'answered' : 'closed', promisedIso: null, basis: 'rule' };

    if (kind === KINDS.PAYMENT && paidClaimed(body)) return { outcome: 'paid', promisedIso: null, basis: 'rule' };

    // What they wrote may not be completion even though they wrote back: they
    // could not open it, they asked something, or they said no (core/reply-meaning.js).
    const rm = replyMeaning;
    const meant = rm ? rm.read(body, { kind }) : null;
    if (meant) {
      if (meant.meaning === 'declined') return { outcome: 'declined', promisedIso: null, basis: 'rule', why: meant.why };
      return { outcome: 'yours', reason: meant.meaning, line: meant.line || null, promisedIso: null, basis: 'rule', why: meant.why };
    }

    // Waiting on someone else is an interim, not a delivery, unless the message also hands something over.
    if (kind === KINDS.REPLY && (WAITING_EN.test(body) || WAITING_HE.test(body)) && !DELIVERY_WORDS.test(body)) return { outcome: 'ack', promisedIso: null, basis: 'rule', why: 'waiting on someone else' };
    // For a request for a reply, "confirmed / attached / signed" means the thing
    // was delivered even if a promise about something else is in the message.
    const delivered = kind === KINDS.REPLY && CONFIRM.test(body);
    const promise = !delivered && (PROMISE_EN.test(body) || PROMISE_HE.test(body));
    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    const promisedIso = promise ? promisedDay(body, c.now, ex) : null;

    if (promise && promisedIso) return { outcome: 'promised', promisedIso, basis: 'rule' };
    if (isAck(body) || (n <= SOFT_ACK_MAX_WORDS && !/\d/.test(body) && !CONFIRM.test(body) && (SOFT_ACK_EN.test(body) || SOFT_ACK_HE.test(body)))) return { outcome: 'ack', promisedIso: null, basis: 'rule' };
    if (promise && n <= 30) return { outcome: 'promised', promisedIso: null, basis: 'rule' };
    if (kind === KINDS.PAYMENT) return { outcome: n >= 4 ? 'answered' : 'ack', promisedIso: null, basis: 'default' };
    // No cue fired. A delivered-looking message is a rule. Anything else used to be the old assumption ("they wrote back, so it is
    // answered"), which is where loops were wrongly closed: "looking into it", "thanks for letting me know", an unrelated note. A small
    // on-device model (core/reply-model.js) now reads such a reply, and when it is confident the reply is NOT an answer the loop stays
    // open and silent. The model never closes anything: it only holds a loop open, so it can make a close rarer, never wronger.
    // Only short replies: a long, substantive message is almost never "thanks" or "looking into it", and the model was trained mostly on short ones.
    if (!delivered && replyModel && replyModel.ready() && n <= NOT_ANSWER_MAX_WORDS) {
      const na = replyModel.notAnAnswer(body);
      if (na && na.p >= NOT_ANSWER_MIN) return { outcome: 'ack', promisedIso: null, basis: 'model', why: 'not an answer: ' + na.cls.toLowerCase() };
    }
    if (!delivered && kind === KINDS.REPLY && n <= SHORT_UNSURE_MAX_WORDS && !answerEvidence(body, ex, c.now)) return { outcome: 'ack', promisedIso: null, basis: 'unsure', why: 'not clearly an answer' };
    // A contact line (name, title, "Phone:" / "טלפון:") is a signature, not the answer. A forward often leaves only that.
    if (!delivered && kind === KINDS.REPLY && contactSignature(body)) return { outcome: 'ack', promisedIso: null, basis: 'rule', why: 'a signature is not an answer' };
    // "We should talk" / "כדאי שנדבר" moves nothing that was asked. A short note that is only that stays open.
    if (!delivered && kind === KINDS.REPLY && talkSuggestion(body) && !answerEvidence(body, ex, c.now)) return { outcome: 'ack', promisedIso: null, basis: 'rule', why: 'a suggestion to talk is not an answer' };
    return { outcome: 'closed', promisedIso: null, basis: delivered ? 'rule' : 'default' };
  }

  // A reply that says the thing is WITH someone else, or in progress, is an interim, even when it names the act ("waiting for the CFO to approve"). Delivery words win.
  const WAITING_EN = /\b(?:waiting (?:for|on)|awaiting|pending (?:approval|signature|review|legal)|(?:it|this) is (?:still )?with|still with|in progress|being (?:reviewed|processed|worked on))\b/i;
  const WAITING_HE = /(?:ממתין|ממתינה|ממתינים|מחכה ל|מחכים ל|בהמתנה|בטיפול|בבדיקה|מטפל בזה|מטפלת בזה)/;
  const DELIVERY_WORDS = /\b(?:attached|enclosed|here(?:'s| is| are)|done|signed and|sent it|completed)\b|(?:מצורף|צירפתי|שלחתי|סיימתי|בוצע)/i;
  // Under this many words, a reply that carries no answer at all (no yes or no, no date, no amount, no number, no link) is "they wrote back", not "they answered".
  // Held open and silent: the loop stays, the next chase day decides. A one-word "Perfect" can be a yes or a courtesy; a wrong close is never reminded about again.
  const SHORT_UNSURE_MAX_WORDS = 3;
  const YES_NO = /^(?:yes|yeah|yep|yup|sure|no|nope|nah|correct|right|exactly|absolutely|of course|definitely|כן|לא|נכון|בטח|בהחלט|כמובן|בדיוק)(?:\b|\s|$)/i;
  const DONE_WORDS = /\b(?:sent|done|attached|enclosed|signed|completed|finished|paid|approved|confirmed)\b|(?:^|\s)(?:שלחתי|שלחנו|צירפתי|צירפנו|בוצע|סיימתי|סיימנו|חתמתי|חתמנו|אישרתי|אישרנו|הועבר|שולם|שילמתי|עשיתי)(?=$|[\s,.!?])/i;
  // A short message that is only a contact line. The label needs a colon, so "my phone number is 48213" (an answer) is not one.
  const CONTACT_LABEL = /(?:טלפון|נייד|פקס|דוא["״']?ל|אימייל|וואטסאפ)\s*[:：]|\b(?:phone|mobile|tel|cell|e-?mail|email)\s*[:：]/i;
  function contactSignature(body) {
    const n = words(body);
    if (n < 2 || n > 20) return false;
    if (/[?؟]/.test(body)) return false;
    if (CONFIRM.test(body) || PROMISE_EN.test(body) || PROMISE_HE.test(body) || DONE_WORDS.test(body)) return false;
    return CONTACT_LABEL.test(body);
  }
  function answerEvidence(body, ex, now) {
    if (/\d|https?:\/\/|@/.test(body) || YES_NO.test(body) || DONE_WORDS.test(body)) return true;
    try {
      if (ex && ex.parseDate && ex.parseDate(body, new Date(typeof now === 'number' ? now : Date.now()))) return true;
      if (ex && ex.parseMoney && ex.parseMoney(body)) return true;
    } catch (e) { /* no evidence */ }
    return false;
  }

  // When the ball is in your court the reminder is for YOU: the next business day.
  function yoursDate(now) {
    return isoDay(addBusinessDays(today(now), 1));
  }
  function isYours(w) { return Boolean(w) && w.status === 'waiting' && w.stage === 'yours'; }

  // You answered: the ball goes back to them, and the chase restarts from today.
  function handBackPatch(w, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return { stage: (w.nudges || 0) > 0 ? 'nudged' : 'waiting', yoursReason: null, yoursLine: null, yoursSince: null, preparedAt: null, preparedFile: null, handedBackAt: t, chaseIso: rechaseDate(w.kind, t, null) };
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
    if (!watch || watch.status !== 'waiting' || isMine(watch) || isClock(watch) || !reply || reply.outcome === 'auto') return { none: true };
    const seen = { lastReplyAt: t };
    switch (reply.outcome) {
      case 'closed':
        return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: reply.delivered === 'file' ? 'delivered' : 'replied', deliveredFiles: reply.fileNames ? reply.fileNames.slice(0, 5) : null }), close: true };
      case 'paid':
        return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'paid' }), close: true };
      case 'promised': {
        const chaseIso = rechaseDate(watch.kind, t, reply.promisedIso);
        return { patch: Object.assign({}, seen, { stage: 'promised', promisedIso: reply.promisedIso || null, chaseIso }), rescheduled: true };
      }
      case 'declined':
        return { patch: Object.assign({}, seen, { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: 'declined' }), close: true };
      case 'yours':
        // The ball is back with you. Nothing to chase; the next move is yours.
        return { patch: Object.assign({}, seen, { stage: 'yours', yoursReason: reply.reason || 'question', yoursLine: reply.line ? clip(reply.line, MAX_WHAT) : null, yoursSince: t, chaseIso: yoursDate(t) }), yours: true, rescheduled: true };
      case 'answered':
        return { patch: seen, confirm: true };
      default: // ack
        return { patch: reply.claimedOnly ? Object.assign({}, seen, { claimedFileAt: t }) : seen, claimedOnly: Boolean(reply.claimedOnly) };
    }
  }

  // The person's own newest message in a thread they are waiting on: was it a
  // chase? Only chase-shaped wording counts — an ordinary follow-up message
  // ("see you Tuesday") must not be recorded as a nudge.
  const CHASE_EN = /\b(?:follow(?:ing)?[ -]?up|reminder|checking in|check(?:ing)? back|circling back|bump(?:ing)?|any (?:update|news)|still waiting|haven'?t heard|touching base|gentle nudge|wanted to (?:follow|check))\b/i;
  const CHASE_HE = /(?:חוזר|חוזרת|תזכורת|בהמשך לפני|עדיין ממתין|עדיין מחכה|מעקב)/;
  function looksLikeChase(text) {
    const t = String(text || '');
    if (words(t) < 2) return false;
    if (words(t) >= 4 && (CHASE_EN.test(t) || CHASE_HE.test(t))) return true;
    // "Any update?", "Signed yet?", "?מה הסטטוס": a chase in two words.
    return Boolean(requestTypes && requestTypes.detectShortAsk(stripGreeting(t)));
  }

  // The ask Glance missed: in a thread where you chase by hand and no loop exists, find the earlier
  // sentence of yours that WAS the ask (core/outcome-labels.js). `own` = earlier own messages, newest first.
  function missedAskIn(own, ctx) {
    if (!outcomeLabels) return null;
    const c = ctx || {};
    const model = c.model || intentModel;
    const silentOn = (text) => !(classifyOutgoing(text, c) || classifyCommitment(text, c));
    return outcomeLabels.missedAskIn(own, silentOn, model);
  }

  function missedPromiseIn(own, ctx) {
    if (!outcomeLabels) return null;
    const c = ctx || {};
    const model = c.model || intentModel;
    const silentOn = (text) => !(classifyOutgoing(text, c) || classifyCommitment(text, c));
    return outcomeLabels.missedPromiseIn(own, silentOn, model);
  }

  // `n` business days from today (weekends do not count).
  function afterDays(now, n) {
    return isoDay(addBusinessDays(today(now), Math.max(1, Math.round(n))));
  }

  // The look-again day for a NEW loop, learned from how long THIS person has taken before
  // (core/person-model.js). Only when there is no stated deadline (a deadline sets the day) and
  // only with at least two real closes with them; otherwise the ask is returned as it was.
  function personalChase(ask, watches, email, now) {
    if (!ask || !personModel || ask.direction !== 'theirs' || ask.deadlineIso || !email) return ask;
    const sug = personModel.suggestChaseDays(watches, email, ask.kind, typeof now === 'number' ? now : Date.now());
    if (!sug) return ask;
    return Object.assign({}, ask, { chaseIso: afterDays(now, sug.days), personal: { days: sug.days, typical: sug.typical, n: sug.n, level: sug.level, domain: personModel.domainOf(email) } });
  }

  // Is this loop likely to miss its date, judged by how long this person usually takes?
  function riskOf(watches, w, now) {
    return personModel ? personModel.risk(watches, w, typeof now === 'number' ? now : Date.now()) : null;
  }
  function typicalDays(watches, w, now) {
    return personModel ? personModel.typicalDays(watches, w, typeof now === 'number' ? now : Date.now()) : null;
  }

  // Patch for "I chased". The chase day moves out and the next nudge is firmer.
  // waitDays (optional): how long this person usually needs from here, from the person model.
  function recordNudge(w, now, watches) {
    const t = typeof now === 'number' ? now : Date.now();
    const wait = personModel && Array.isArray(watches) ? personModel.suggestWaitDays(watches, w, t) : null;
    return { stage: 'nudged', nudges: (w.nudges || 0) + 1, nudgedAt: t, chaseIso: wait ? afterDays(t, wait.days) : rechaseDate(w.kind, t, null) };
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
      if (isMine(w) || isClock(w) || w.kind !== KINDS.PAYMENT || !w.amount || !(w.amount.value > 0)) return;
      const cur = w.amount.currency || '?';
      owed[cur] = (owed[cur] || 0) + w.amount.value;
    });
    const moneyOwed = Object.keys(owed).sort().map((currency) => ({ currency, value: owed[currency] }));
    // Loops with a date that this person usually misses (needs personal evidence).
    const nowMs = typeof now === 'number' ? now : Date.now();
    const atRiskLoops = active.filter((w) => { const r = riskOf(list, w, nowMs); return Boolean(r && r.slip); });
    const riskMoney = {};
    atRiskLoops.forEach((w) => { if (w.kind === KINDS.PAYMENT && w.amount && w.amount.value > 0) { const cur = w.amount.currency || '?'; riskMoney[cur] = (riskMoney[cur] || 0) + w.amount.value; } });

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
      expiring: active.filter((w) => isClock(w) && watchState(w, now) !== 'lapsed').length,
      nudged: active.filter((w) => stageOf(w) === 'nudged').length,
      promised: active.filter((w) => stageOf(w) === 'promised').length,
      yours: active.filter(isYours).length,
      atRisk: atRiskLoops.length,
      moneyAtRisk: Object.keys(riskMoney).sort().map((currency) => ({ currency, value: riskMoney[currency] })),
      oldestOpenDays: active.reduce((m, w) => Math.max(m, daysOpen(w, now)), 0),
      moneyOwed,
      closedThisMonth: closed.length,
      paidThisMonth
    };
  }

  // Everything open with each person, both directions, most urgent first.
  // Loops with no known person are grouped under 'Other'.
  // opts.keyOf(watch) -> one key per PERSON across apps (core/identity-graph.js); without it the address, then the number, then the name.
  function groupByPerson(watches, now, opts) {
    const groups = {};
    const keyOf = opts && typeof opts.keyOf === 'function' ? opts.keyOf : null;
    (Array.isArray(watches) ? watches : []).filter(isActive).forEach((w) => {
      const cp = (w && w.counterpart) || {};
      const email = cp.email ? String(cp.email).toLowerCase() : '';
      const key = (keyOf && keyOf(w)) || w.personKey || email || (cp.phone ? 'phone:' + cp.phone : '') || cp.name || '';
      const g = groups[key] || (groups[key] = { key, name: firstName(cp.name, email) || 'Other', email: email || null, apps: [], loops: [], overdue: 0, youOwe: 0, owed: {} });
      if (!g.email && email) g.email = email;
      const app = w.channel || 'gmail';
      if (g.apps.indexOf(app) < 0) g.apps.push(app);
      g.loops.push(w);
      if (watchState(w, now) === 'overdue') g.overdue++;
      if (isClock(w)) g.clock = (g.clock || 0) + 1;
      else if (isMine(w)) g.youOwe++;
      else if (!isClock(w) && w.kind === KINDS.PAYMENT && w.amount && w.amount.value > 0) {
        const cur = w.amount.currency || '?';
        g.owed[cur] = (g.owed[cur] || 0) + w.amount.value;
      }
    });
    return Object.keys(groups).map((k) => {
      const g = groups[k];
      g.money = Object.keys(g.owed).sort().map((currency) => ({ currency, value: g.owed[currency] }));
      delete g.owed;
      g.loops.sort((a, b) => (a.chaseIso || '').localeCompare(b.chaseIso || ''));
      return g;
    }).sort((a, b) => b.overdue - a.overdue || b.loops.length - a.loops.length || a.name.localeCompare(b.name));
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
  // ---- time is part of the intention ---------------------------------------------
  // A stated deadline that has passed is its own state, not just a quiet loop.
  function deadlinePassed(w, now) {
    return Boolean(w && w.status === 'waiting' && w.direction !== 'mine' && w.direction !== 'clock' && w.deadlineIso && w.deadlineIso < isoDay(today(now)));
  }
  function dayWord(iso, he) {
    try { return new Date(iso + 'T00:00:00').toLocaleDateString(he ? 'he-IL' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return iso; }
  }

  // The firmer nudges name the deadline the person actually set.
  function nudgeText(w, level, now) {
    // A loop with items asks only for what is still missing, and thanks for what came.
    if (hasItems(w)) {
      const d = clientRequests.reminderDraft(asRequest(w), { level: Math.min(MAX_NUDGE_LEVEL, Math.max(1, level || nextNudgeLevel(w))), lang: w.lang, voice: 'me' });
      if (d) return d;
    }
    const base = nudgeBase(w, level, now);
    const lvl = Math.min(MAX_NUDGE_LEVEL, Math.max(1, level || nextNudgeLevel(w)));
    if (lvl < 2 || !deadlinePassed(w, now)) return base;
    const he = w.lang === 'he';
    const line = he ? 'המועד שנקבע היה ' + dayWord(w.deadlineIso, true) + '.' : 'The deadline was ' + dayWord(w.deadlineIso, false) + '.';
    const parts = base.split('\n\n');
    parts.splice(2, 0, line);
    return parts.join('\n\n');
  }

  // Keeping a file promise: "as promised, attached". Written only with the one file that
  // is really being attached; without a file there is no such draft.
  function promiseDraft(w, opts) {
    const fileName = opts && opts.fileName ? String(opts.fileName).replace(/[\r\n"]+/g, ' ').slice(0, 100) : null;
    if (!fileName) return null;
    const name = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    if (w.lang === 'he') return (name ? 'היי ' + name + ',' : 'שלום,') + '\n\nכפי שהבטחתי, מצורף: ' + fileName + '\n\nתודה,';
    return (name ? 'Hi ' + name + ',' : 'Hi,') + '\n\nAs promised, attached: ' + fileName + '\n\nThanks,';
  }

  // The first draft of YOUR answer when the ball is back with you. A starting
  // point in Gmail's Drafts, never sent: the person finishes and sends it.
  function replyDraft(w, opts) {
    const fileName = opts && opts.fileName ? String(opts.fileName).replace(/[\r\n"]+/g, ' ').slice(0, 100) : null;
    const name = firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email);
    const he = w.lang === 'he' || (w.yoursLine && hasHebrew(w.yoursLine));
    const blocked = w.yoursReason === 'blocked';
    const q = w.yoursLine ? '"' + clip(w.yoursLine, 160) + '"' : '';
    if (he) {
      const hi = name ? 'היי ' + name + ',' : 'שלום,';
      if (blocked) return hi + '\n\nסליחה על זה. אני שולח/ת שוב עכשיו. ' + (fileName ? 'מצורף: ' + fileName : '[צרפו את הקובץ כאן ושלחו]') + '\n\nאשמח לדעת אם הפעם זה מגיע.\n\nתודה,';
      return hi + '\n\nתודה ששאלת.' + (q ? ' שאלת: ' + q : '') + '\n\n' + (fileName ? 'מצורף: ' + fileName + '\n\n[הוסיפו מילה אם צריך]' : '[התשובה שלכם כאן]') + '\n\nתודה,';
    }
    const hi = name ? 'Hi ' + name + ',' : 'Hi,';
    if (blocked) return hi + '\n\nSorry about that. I am resending it now. ' + (fileName ? 'Attached: ' + fileName : '[Attach the file here, then send]') + '\n\nPlease let me know if it comes through this time.\n\nThanks,';
    return hi + '\n\nThanks for checking.' + (q ? ' You asked: ' + q : '') + '\n\n' + (fileName ? 'Attached: ' + fileName + '\n\n[Add a line if needed]' : '[Your answer here]') + '\n\nThanks,';
  }

  function nudgeBase(w, level, now) {
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
    if (isClock(w)) return 'Before it ends' + (w.subject ? ' — ' + clip(w.subject, 80) : '');
    if (isMine(w)) return 'Keep your promise' + (who ? ' to ' + who : '') + (w.subject ? ' — ' + clip(w.subject, 80) : '');
    if (isYours(w)) return (w.yoursReason === 'blocked' ? 'Resend to ' : 'Answer ') + (who || 'them') + (w.subject ? ' — ' + clip(w.subject, 80) : '');
    const head = w.kind === KINDS.PAYMENT ? 'Chase payment' : 'Chase reply';
    const amt = w.kind === KINDS.PAYMENT && w.amount && w.amount.raw ? ' ' + w.amount.raw : '';
    return head + (who ? ' from ' + who : '') + amt + (w.subject ? ' — ' + clip(w.subject, 80) : '');
  }

  return {
    KINDS, MAX_NUDGE_LEVEL, classifyOutgoing, classifyCommitment, fromProposal, deliversPromise, deliversFor, closeAsKept, closeFromTask, taskRefsToCheck, isMine, isClock, chaseDate, rechaseDate, buildWatch, watchState, stageOf, daysOpen,
    repliedSince, isAutoReply, isActive, isYours, handBackPatch, yoursDate, classifyReply, applyReply, looksLikeChase, recordNudge, reopenPatch, canReopen,
    nextNudgeLevel, missedAskIn, missedPromiseIn, personalChase, riskOf, typicalDays, afterDays, deadlinePassed, replyDraft, promiseDraft, intentionWeight, summarize, groupByPerson, recentlyClosed, formatMoney, nudgeText, taskTitle, firstName, isoDay,
    applyReplyItems, decideItem, itemCounts, hasItems
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFollowUp };
