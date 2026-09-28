// Close-scenario families A–I. One candidate, or silence.
//
// The chip fires only when a sentence states a clear personal close.
// Hedge, negation, past-already-done, newsletter noise, and a quoted
// older ask do not. A weak or borderline score is not promoted so a
// field card or a chat can open — silence is the side of that trade.
//
// Family I (create-when-missing) is conditional. It chips only when the
// what is a named asset, that file is missing, and a company template is
// named — the template the later Do It would use. Any one of those missing
// is silence, including a clear asset with no template (never a blank Doc)
// and a template with no clear what. A weak score is not promoted to get
// here. Up to four missing critical fields are a card. A chat fill opens
// only past four, and it names those fields and nothing else. A weak score
// stays silence. A general chat or an ask-Glance surface is never a
// classification. This file does not render that UI and does not create a Doc.

const FlowCloseFamilies = (() => {
  const FILE_EN = /\b(receipts?|invoices?|quotes?|contracts?|signed pdfs?|passports?(?:\s+scans?)?|insurance forms?|tax (?:docs?|documents?|returns?)|proposals?|decks?|logos?|briefs?|statements?|purchase orders?|POs?|W-?9s?|photo ids?|sows?|ndas?|msas?|amendments?|redlines?|letters?)\b/i;
  const FILE_HE = /(חשבונית מס|חשבונית|הצעת (?:ה)?מחיר|חוזה|הסכם|תעודת (?:ה)?זהות|דרכון|אישור (?:ה)?העברה|דוח|מצגת|לוגו|הזמנת רכש|קבלה|מכתב|מסמך)/;

  const ASK_EN = /\b(?:please (?:send|forward|share|attach|email)|could you (?:send|forward|share|attach)|can you (?:send|forward|share|attach)|i need (?:the|your|a)|we need (?:the|your|a)|send me (?:the|your|a)|attach (?:the|your)|mind sending)\b/i;
  const ASK_HE = /(?:אפשר לשלוח|בבקשה תשלח|תשלח לי|תעביר לי|צריך את|אשמח לקבל את|נא לשלוח)/;

  const CREATE_EN = /\b(?:create|draft|draw up|prepare|put together|spin up)\b/i;
  const CREATE_HE = /(?:תיצור|תכין|ליצור|להכין|לנסח|תנסח)/;
  const SHARE_EN = /\b(?:send|share|attach|forward)\b/i;
  const SHARE_HE = /(?:שלח|תשלח|שתף|לשתף|תשתף)/;
  const DOC_EN = /\b(?:doc|document|sheet|spreadsheet|deck|google doc|sow|contract|proposal)\b/i;
  const DOC_HE = /(?:מסמך|גיליון|חוזה|הצעה|דוק)/;
  const TEMPLATE_EN = /\b(?:company template|our template|the template)\b/i;
  const TEMPLATE_HE = /(?:תבנית (?:של )?החברה|התבנית שלנו|מהתבנית)/;
  // Absence of a named asset. "don't have a quote" is missing, not a refusal
  // to send. "Please don't send" stays a refusal — it does not match here.
  const NOT_FOUND_EN = /\b(?:don'?t have|do not have|couldn'?t find|could not find|can'?t find|cannot find|didn'?t find|did not find|could not locate|nothing in the (?:folder|drive|files?)|not in the (?:folder|drive|files?)|not on file|no \w+ (?:on file|in the (?:folder|drive|files?))|there is no|there'?s no|we have no)\b/i;
  const NOT_FOUND_HE = /(?:אין (?!צורך|לחץ)|לא מצאתי|לא נמצא|לא קיים)/;

  const MEET_EN = /\b(?:let'?s (?:meet|sync|hop on|jump on)|hop on a call|jump on a call|grab (?:time|\d+)|got \d+ minutes|are you free|free for a|quick sync|find (?:a |some )?time|can we meet)\b/i;
  const MEET_HE = /(?:בוא נקבע|בואי נקבע|יש לך זמן|יש לך רבע שעה|שיחה קצרה|נקפוץ לשיחה|פנוי(?:ה)? לשיחה)/;
  const COMMIT_EN = /\b(?:i(?:'ll| will) have|i(?:'ll| will) get|on the hook to|i commit to|count on me to|i(?:'ll| will) take care of)\b/i;
  const COMMIT_HE = /(?:מתחייב|מתחייבת|אאשר עד|אחזיר לך|אני על זה)/;

  const APPROVE_EN = /\b(?:you have my (?:ok|okay|approval)|green[- ]?light|formally approved|i approve|we approve|approved\b|confirming|confirmed|ok to proceed)\b/i;
  const APPROVE_HE = /(?:אאשר|אני מאשר|אני מאשרת|אור ירוק|מאושר מצידי)/;

  const FOLLOW_EN = /\b(?:please (?:chase|nudge|ping)|follow up with|send (?:a |the )?reminder|chase the|nudge \w+ about|ping \w+ about)\b/i;
  const FOLLOW_HE = /(?:תעקוב|בבקשה תעקוב|לעקוב אחרי|תזכיר לי|שלח תזכורת|תבדוק מול)/;

  const MOVE_EN = /\b(?:reschedul\w*|postpone|push (?:the |our |this )?(?:call|meeting|sync)|move (?:the |our |this )?(?:call|meeting|sync))\b/i;
  const MOVE_HE = /(?:לדחות|נדחתה|נדחה|להזיז את ה|נקבע מחדש)/;
  const CANCEL_EN = /\b(?:cancel(?:led|ing)?|call(?:ed)? off)\b[^.]{0,48}\b(?:call|meeting|sync|invite|event)\b|\b(?:call|meeting|sync|invite|event)\b[^.]{0,48}\b(?:is |was )?(?:cancelled|called off)\b/i;
  const CANCEL_HE = /(?:בטל את ה|לבטל את ה|הפגישה מבוטלת|השיחה מבוטלת)/;

  const HEDGE_EN = /\b(?:maybe|perhaps|possibly|no rush|if possible|tentatively|might|whenever you|if you feel|sometime|if you(?:'re| are) (?:free|available)|if (?:that|this|it) works)\b/i;
  const HEDGE_HE = /(?:אולי|ייתכן|אם אפשר|אין לחץ|מתישהו)/;
  const NEG_EN = /\b(?:do not|don'?t|never mind|please don'?t)\b/i;
  const NEG_HE = /(?:אל ת|לא צריך|לא לשלוח|אין צורך לשלוח|לא מאשר)/;
  // A past day on the object ("the notes from yesterday") is still a live
  // ask. Only a completed act — already sent, already paid — is silence.
  const PAST_EN = /\b(?:already|i sent|we sent|we paid|i paid|has been sent|was sent|was paid|already paid)\b/i;
  const PAST_HE = /(?:כבר|שלחתי|שילמתי|שולמה|שולם|נשלחה אתמול)/;
  const RETRACT_EN = /^\s*(?:never mind|forget it|disregard|ignore that)[.!]?\s*$/i;
  const RETRACT_HE = /^\s*(?:עזוב|תשכח מזה|לא משנה)[.!]?\s*$/;
  const NOISE_EN = /\b(?:unsubscribe|newsletter|hope this (?:email )?finds you well|book a demo|free trial|just bumping this|circling back|quick bump|for your information|no action needed|fyi)\b/i;
  const NOISE_HE = /(?:לידיעתך|אין צורך בפעולה|ניוזלטר)/;
  const VENT_EN = /\b(?:so frustrated|ridiculous|just venting|this is a mess)\b/i;

  const TARGET_CAL = /\b(?:on the calendar|in the (?:calendar |event |invite )?description|calendar invite|calendar note)\b|בתיאור (?:האירוע|הפגישה)|ביומן/i;
  const TARGET_TASK = /\b(?:on the task|in the task note|task note|as a task)\b|במשימה|בפתק המשימה/i;
  const TARGET_DOC = /\b(?:docs? comment|comment on the doc)\b|הערה במסמך|בתגובה למסמך/i;

  function splitSentences(text) {
    return String(text || '').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  }

  function isPastIso(iso, now) {
    if (!iso) return false;
    const n = now || new Date();
    const today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    return iso < today;
  }

  function fileTerm(sentence) {
    const en = sentence.match(FILE_EN);
    if (en) return en[1];
    const he = sentence.match(FILE_HE);
    return he ? he[0] : null;
  }
  // A generic "document" / מסמך is family C (create then send). Family I
  // needs a named asset: quote, invoice, letter, contract, and the rest.
  function specificAsset(sentence) {
    const term = fileTerm(sentence);
    if (!term || term === 'מסמך') return null;
    return term;
  }

  function isFileAsk(sentence) {
    if (!FILE_EN.test(sentence) && !FILE_HE.test(sentence)) return false;
    if (!ASK_EN.test(sentence) && !ASK_HE.test(sentence)) return false;
    if (/\b(?:please find|see attached|enclosed)\b|מצורף/i.test(sentence) && !ASK_EN.test(sentence) && !ASK_HE.test(sentence)) return false;
    return true;
  }

  function hedged(sentence) {
    return HEDGE_EN.test(sentence) || HEDGE_HE.test(sentence);
  }
  function negated(sentence) {
    return NEG_EN.test(sentence) || NEG_HE.test(sentence);
  }
  function pastDone(sentence) {
    return PAST_EN.test(sentence) || PAST_HE.test(sentence);
  }
  function statusQuestion(sentence) {
    const t = sentence.trim();
    if (/^(?:did you|have you|has she|has he)\b/i.test(t)) return true;
    if (/^האם\s/.test(t)) return true;
    if (/(?:^|\s)שלחת\s/.test(t) && !/תשלח/.test(t)) return true;
    return false;
  }
  function notFound(sentence) {
    if (!specificAsset(sentence)) return false;
    return NOT_FOUND_EN.test(sentence) || NOT_FOUND_HE.test(sentence);
  }
  function hasExistingFile(sentence) {
    // "no invoice on file" is absence. "attached" / "please find" is a file
    // already in hand, which is a find (family A), not a create.
    if (notFound(sentence)) return false;
    return /\b(?:existing|already have|on file|attached|enclosed|please find)\b|הקיים|מצורף|כבר יש/i.test(sentence);
  }
  function creating(sentence) {
    if (CREATE_EN.test(sentence) || CREATE_HE.test(sentence)) return true;
    // "write" alone is a reply. It counts only next to a named asset.
    if (/\bwrite\b/i.test(sentence) && specificAsset(sentence)) return true;
    if (/(?:תכתוב|לכתוב)/.test(sentence) && specificAsset(sentence)) return true;
    return false;
  }
  function skipSentence(sentence) {
    if (hedged(sentence) || pastDone(sentence) || statusQuestion(sentence)) return true;
    // "We don't have a quote" names a missing asset. "Please don't send" does not.
    if (negated(sentence) && !notFound(sentence)) return true;
    return false;
  }

  function clockOf(text) {
    if (typeof FlowExtract === 'undefined' || !FlowExtract.parseTime) return null;
    const time = FlowExtract.parseTime(text);
    if (!time || !Number.isInteger(time.hour) || !Number.isInteger(time.minute)) return null;
    return time;
  }
  function dateOf(text, now) {
    if (typeof FlowExtract === 'undefined' || !FlowExtract.parseDate) return null;
    const date = FlowExtract.parseDate(text, now);
    if (!date || !date.iso || isPastIso(date.iso, now)) return null;
    return date;
  }

  function replacementClause(sentence) {
    const to = sentence.toLowerCase().lastIndexOf(' to ');
    const he = Math.max(sentence.lastIndexOf('ליום'), sentence.lastIndexOf('למחר'));
    let idx = -1;
    if (to >= 0) idx = to;
    if (he > idx) idx = he;
    if (idx >= 0) return sentence.slice(idx);
    return null;
  }

  function hit(partial) {
    return Object.assign({ suppress: false, fileTarget: null, objectTerm: null, personalClose: null, createWhenMissing: false }, partial);
  }

  function matchMove(sentence, now) {
    const move = MOVE_EN.test(sentence) || MOVE_HE.test(sentence);
    const cancel = CANCEL_EN.test(sentence) || CANCEL_HE.test(sentence);
    if (!move && !cancel) return null;
    const clause = replacementClause(sentence);
    const date = clause ? dateOf(clause, now) : null;
    const time = clause ? clockOf(clause) : null;
    if (date && time) {
      return hit({
        family: 'G', type: 'event', confidence: 'high', personalClose: 'calendar-hold',
        what: sentence, requestWhat: sentence, date: date, time: time
      });
    }
    if (date && move) {
      return hit({
        family: 'G', type: 'decision', confidence: 'high', personalClose: 'dated-commitment',
        what: sentence, date: date, time: null
      });
    }
    // No new slot, or a bare cancel. Inserting an event would be the wrong close.
    return 'suppress';
  }

  function templateCue(sentence) {
    return TEMPLATE_EN.test(sentence) || TEMPLATE_HE.test(sentence);
  }

  // Clear what + missing file + a template that will exist. All three, or
  // silence. Creating the named asset from that template is the missing-file
  // case: there is no safe file to attach. A plain "send the invoice" is not
  // this, even if a template was mentioned earlier.
  function matchCreateMissing(sentence, now, earlier) {
    if (hasExistingFile(sentence)) return null;
    if (isFileAsk(sentence) && !creating(sentence) && !notFound(sentence)) return null;
    if (!creating(sentence) && !notFound(sentence) && !templateCue(sentence)) return null;
    const prior = (earlier || []).filter((s) => !hasExistingFile(s) && !skipSentence(s));
    const asset = specificAsset(sentence) || prior.map(specificAsset).find(Boolean) || null;
    const template = templateCue(sentence) || prior.some(templateCue);
    const missing = notFound(sentence) || prior.some(notFound);
    const produce = creating(sentence) || prior.some(creating);
    if (!asset || !template || !(missing || produce)) return null;
    return hit({
      family: 'I', type: 'request', confidence: 'high', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, objectTerm: asset,
      createWhenMissing: true, date: dateOf(sentence, now), time: clockOf(sentence)
    });
  }

  function matchCreateShare(sentence, now) {
    const create = CREATE_EN.test(sentence) || CREATE_HE.test(sentence);
    const share = SHARE_EN.test(sentence) || SHARE_HE.test(sentence);
    const doc = DOC_EN.test(sentence) || DOC_HE.test(sentence);
    if (!create || !share || !doc) return null;
    if (TEMPLATE_EN.test(sentence) || TEMPLATE_HE.test(sentence)) return null;
    return hit({
      family: 'C', type: 'request', confidence: 'medium', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, objectTerm: fileTerm(sentence),
      date: dateOf(sentence, now)
    });
  }

  function targetKind(text) {
    const kinds = [];
    if (TARGET_CAL.test(text)) kinds.push('calendar');
    if (TARGET_TASK.test(text)) kinds.push('task');
    if (TARGET_DOC.test(text)) kinds.push('doc');
    return kinds;
  }

  function matchHold(sentence, now) {
    const meet = MEET_EN.test(sentence) || MEET_HE.test(sentence);
    const commit = COMMIT_EN.test(sentence) || COMMIT_HE.test(sentence);
    if (!meet && !commit) return null;
    const date = dateOf(sentence, now);
    const time = clockOf(sentence);
    if (!date) return null;
    if (time) {
      return hit({
        family: 'D', type: 'event', confidence: 'high', personalClose: 'calendar-hold',
        what: sentence, requestWhat: meet ? sentence : null, date: date, time: time
      });
    }
    if (commit) {
      return hit({
        family: 'D', type: 'decision', confidence: 'high', personalClose: 'dated-commitment',
        what: sentence, date: date
      });
    }
    return hit({
      family: 'D', type: 'event', confidence: 'medium', personalClose: null,
      what: sentence, date: date
    });
  }

  function matchMoney(sentence, facts, now) {
    if (pastDone(sentence)) return null;
    // "Has the fee been confirmed?" is a question, not an approval.
    if (/\?\s*$/.test(sentence)) return null;
    if (!APPROVE_EN.test(sentence) && !APPROVE_HE.test(sentence)) return null;
    const money = facts && facts.money && facts.money.raw && sentence.indexOf(facts.money.raw) !== -1;
    const file = FILE_EN.test(sentence) || FILE_HE.test(sentence);
    const go = /\b(?:go ahead|proceed|start)\b|אפשר להתחיל|נתקדם/i.test(sentence);
    const date = dateOf(sentence, now);
    if (!money && !file && !go && !date) return null;
    return hit({
      family: 'E', type: 'decision', confidence: 'high',
      personalClose: money ? 'confirmed-amount' : (date ? 'dated-commitment' : null),
      what: sentence, date: date, time: clockOf(sentence), objectTerm: fileTerm(sentence)
    });
  }

  function matchFollow(sentence, now) {
    if (VENT_EN.test(sentence)) return null;
    if (!FOLLOW_EN.test(sentence) && !FOLLOW_HE.test(sentence)) return null;
    if (!FILE_EN.test(sentence) && !FILE_HE.test(sentence) && !/\b(?:vendor|client|dana|them|him|her)\b|דנה|הספק|הלקוח/i.test(sentence)) return null;
    return hit({
      family: 'F', type: 'request', confidence: 'medium', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, objectTerm: fileTerm(sentence), date: dateOf(sentence, now)
    });
  }

  function matchFile(sentence, now) {
    if (!isFileAsk(sentence)) return null;
    if (TEMPLATE_EN.test(sentence) || TEMPLATE_HE.test(sentence)) return null;
    return hit({
      family: 'A', type: 'request', confidence: 'medium', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, objectTerm: fileTerm(sentence), date: dateOf(sentence, now)
    });
  }

  function assess(text, facts, ctx) {
    ctx = ctx || {};
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) text = FlowJudgment.newContent(text || '');
    else text = String(text || '');
    if (!text.trim()) return null;
    if (ctx.blocked) return null;
    if (NOISE_EN.test(text) || NOISE_HE.test(text)) return null;
    const now = ctx.now;
    if (!facts && typeof FlowExtract !== 'undefined') {
      facts = FlowExtract.extract(text, { now: now, senderEmail: ctx.senderEmail });
    }
    facts = facts || {};

    const kinds = targetKind(text);
    const fileSomewhere = isFileAsk(text) || ((FILE_EN.test(text) || FILE_HE.test(text)) && (ASK_EN.test(text) || ASK_HE.test(text)));
    if (kinds.length > 1 && fileSomewhere) return hit({ suppress: true, family: 'B' });
    if (kinds.length === 1 && fileSomewhere && !hedged(text) && !negated(text) && !pastDone(text)) {
      if (kinds[0] === 'doc') return hit({ suppress: true, family: 'B' });
      const date = dateOf(text, now);
      const time = clockOf(text);
      if (kinds[0] === 'calendar' && !date) return hit({ suppress: true, family: 'B' });
      if (kinds[0] === 'calendar') {
        return hit({
          family: 'B', type: 'event', confidence: time ? 'high' : 'medium',
          personalClose: time ? 'calendar-hold' : null, fileTarget: 'calendar',
          what: text, requestWhat: text, objectTerm: fileTerm(text), date: date, time: time
        });
      }
      return hit({
        family: 'B', type: 'decision', confidence: 'high', personalClose: null, fileTarget: 'task',
        what: text, objectTerm: fileTerm(text), date: date
      });
    }

    const sentences = splitSentences(text);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      if ((RETRACT_EN.test(sentence) || RETRACT_HE.test(sentence)) && !isFileAsk(sentence)) {
        return hit({ suppress: true, family: 'H' });
      }
      if (skipSentence(sentence)) continue;
      const moved = matchMove(sentence, now);
      if (moved === 'suppress') return hit({ suppress: true, family: 'G' });
      if (moved) return moved;
      const earlier = sentences.slice(0, i);
      const created = matchCreateMissing(sentence, now, earlier);
      if (created) return created;
      const shared = matchCreateShare(sentence, now);
      if (shared) return shared;
      const held = matchHold(sentence, now);
      if (held) return held;
      const money = matchMoney(sentence, facts, now);
      if (money) return money;
      const follow = matchFollow(sentence, now);
      if (follow) return follow;
      const file = matchFile(sentence, now);
      if (file) return file;
    }
    return null;
  }

  // True when every ask in the message sits in a hedge, a refusal, a
  // completed act, or a status question. The bare handoff regex cannot
  // see "don't" or "maybe" in front of "could you", and a chip there is a
  // wrong close. A past day on the thing being asked for is not this.
  function askBlocked(text) {
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) text = FlowJudgment.newContent(text || '');
    if (NOISE_EN.test(text) || NOISE_HE.test(text)) return true;
    const cue = /\b(?:can you|could you|would you|please|kindly|send|forward|chase|nudge)\b/i;
    let saw = false;
    let open = false;
    for (const sentence of splitSentences(text)) {
      if (!cue.test(sentence) && !ASK_HE.test(sentence) && !FOLLOW_HE.test(sentence) && !ASK_EN.test(sentence)) continue;
      saw = true;
      if (!skipSentence(sentence)) open = true;
    }
    return saw && !open;
  }

  function namedSlots(missingSlots) {
    return Array.isArray(missingSlots)
      ? missingSlots.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [];
  }

  function silenceClassification() {
    return { type: null, confidence: null, closeFamily: null, createWhenMissing: false };
  }

  // Field count does not silence a clear create-when-missing close.
  // A weak or unsure score does. The route stays a request, never a
  // general chat classification.
  function route(intent, missingSlots) {
    if (!intent || !intent.type) return silenceClassification();
    if (intent.closeFamily !== 'I' || !intent.createWhenMissing) return intent;
    if (intent.confidence === 'low' || intent.confidence === 'unsure') return silenceClassification();
    return intent;
  }

  // Silence wins first: a weak score or a dismiss never opens a surface.
  // One to four missing critical fields are a card. More than four is a
  // chat fill of those names only — no assistant, no free prompt.
  // Zero missing fields is one Do It.
  function detailSurface(intent, missingSlots, signal) {
    const names = namedSlots(missingSlots);
    const weak = !intent || !intent.type || intent.confidence === 'low' || intent.confidence === 'unsure';
    if (weak || signal === 'dismiss' || signal === 'unsure') return { surface: 'silence', slots: [] };
    const routed = route(intent, names);
    if (!routed.type || routed.closeFamily !== 'I' || !routed.createWhenMissing) {
      if (intent.closeFamily === 'I') return { surface: 'silence', slots: [] };
      return { surface: 'doit', slots: [] };
    }
    if (names.length > 4) return { surface: 'chat', scope: 'critical-fields', slots: names };
    if (names.length > 0) return { surface: 'card', slots: names };
    return { surface: 'doit', slots: [] };
  }

  return { assess, askBlocked, route, detailSurface, FILE_EN, FILE_HE };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloseFamilies };
