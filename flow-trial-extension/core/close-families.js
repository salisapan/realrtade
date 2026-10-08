// Close-scenario families A–I. One candidate, or silence.
//
// The chip fires only when a sentence states a clear personal close.
// Hedge, negation, past-already-done, newsletter noise, and a quoted
// older ask do not. A weak or borderline score is not promoted so a
// field card or a chat can open — silence is the side of that trade.
//
// Family H is the multi-signal rule. The latest explicit ask is the
// close. A quoted older ask, a hedged "instead", a withdrawal, two
// files, or two clocks with no single slot stay silent — no picker.
//
// Family D is a personal hold. A meet or a commitment with one clear
// clock is one Calendar event. A commitment with one clear day and no
// clock is one Task. A bare digit hour, a hedge, "find a time", and a
// past day are not a new hold. Family G (move or cancel) and family H
// (two clocks, a later ask) still win.
//
// Family A is one file the sender is asking to be put on the mail.
// A clear need, in English or Hebrew, names one object (receipt, invoice,
// quote, contract, signed PDF, ID, passport, insurance, tax form, proposal,
// deck, logo, brief, statement, purchase order, W-9, and the same asks
// in Hebrew). A plural, a hedge, "not sure which", or two files with
// or/and/both stays silence. Family H still owns that multi-file case.
// Family I is not a rescue when the object is unclear.
//
// Family B is one named file placed on one target: the calendar (with a
// day) or the task. "Add the invoice to the calendar Thursday at 4pm" is
// that compound, including when the verb is add / put / include rather
// than send. Two targets, a doc comment, a plural, a generic "file" or
// "document", a calendar with no day, a hedge, or a completed act stay
// silence. A meeting with no file is not this family.
//
// Family C is create, then share or send, of one document, sheet, or deck.
// Both halves have to be in the sentence. A blank doc or two artifacts
// stay silence. A create with no send is not this close, and a send with
// no create is not this close either. A named company template is family
// I, not this.
//
// Family I (create-when-missing) is conditional. It chips only when the
// what is a named asset, that file is missing, and a company template is
// named — the template the later Do It would use. Any one of those missing
// is silence, including a clear asset with no template (never a blank Doc)
// and a template with no clear what. It is not a rescue for an unclear
// file ask, a generic document, or a blank doc that happens to name a
// template. A weak score is not promoted to get here. Up to four missing
// critical fields are a card. A chat fill opens only past four, and it
// names those fields and nothing else. A weak score stays silence. A
// general chat or an ask-Glance surface is never a classification. Family
// J (reply-with-facts) chips only for one named fact from one Sheet or one
// Doc. Two facts, two sources, or a hedge stays silence. This file does
// not render that UI and does not create a Doc.

const FlowCloseFamilies = (() => {
  const FILE_EN = /\b(receipts?|invoices?|quotations?|quotes?|contracts?|signed (?:pdfs?|cop(?:y|ies)|scans?)|passports?(?:\s+scans?)?|insurance (?:forms?|certificates?|polic(?:y|ies))|tax (?:docs?|documents?|returns?|forms?)|proposals?|decks?|slides?|presentations?|logos?|briefs?|statements?|reports?|purchase orders?|POs?|W-?9s?|transfer confirmations?|proof of (?:payment|transfer)|driver'?s licen[cs]es?|identity cards?|photo ids?|IDs?|sows?|ndas?|msas?|amendments?|redlines?|letters?)\b/i;
  const FILE_HE = /(חשבונית מס|חשבונית|הצעת (?:ה)?מחיר|הצעה|חוזה|הסכם|תעודת (?:ה)?זהות|דרכון|אישור (?:ה)?העברה|טופס (?:ה)?מס|אישור (?:ה)?מס|פוליסת?\s*(?:ה)?ביטוח|טופס ביטוח|דו["״]ח|דוח|מצגת|לוגו|בריף|הזמנת רכש|קבלה|מכתב|מסמך)/;

  const ASK_EN = /\b(?:please (?:send|forward|share|attach|email|resend|provide|enclose)|(?:can|could|would) you (?:please )?(?:send|forward|share|attach|email|resend|provide)|would you mind (?:sending|forwarding|sharing|emailing|attaching)|kindly (?:send|forward|share|attach|email|resend|provide)|(?:i|we) (?:still |also )?need (?:you to (?:send|forward|attach|share|email) )?(?:a copy of )?(?:the|your|our|a|an)|(?:can|could) i (?:please )?(?:get|have) (?:a copy of )?(?:the|your|a|an)|send me (?:the|your|a)|attach (?:the|your)|mind (?:sending|forwarding|emailing|sharing)|be able to (?:send|forward|share|attach|email|resend|provide)|if you could (?:please )?(?:send|forward|share|attach|email|resend|provide)|pass along (?:the|your|a|an))\b/i;
  // שלח / להעביר need a non-letter before them so אשלח and אעביר (a promise)
  // are not read as an ask to find a file.
  const ASK_HE = /(?:אפשר\s+(?:לשלוח|לקבל|לצרף)|בבקשה\s+תשלח|תשלח(?:י|ו)?(?:\s+לי|\s+את)|תעביר(?:י|ו)?(?:\s+לי|\s+את)|(?:^|[^\u0590-\u05FF])שלח(?:י|ו)?(?:\s+לי|\s+את)|תצר(?:ף|פי|פו)|(?:^|[^\u0590-\u05FF])לצרף|(?:צריך|צריכה|צריכים)\s+את|אשמח\s+לקבל|אבקש\s+לקבל|נשמח\s+לקבל|נא\s+(?:לשלוח|לצרף)|מבקש(?:ת|ים)?\s+ל(?:שלוח|קבל|צרף)|תוכל(?:י|ו)?(?:\s+בבקשה)?\s+(?:לשלוח|להעביר|לצרף)|(?:^|[^\u0590-\u05FF])להעביר)/;

  const CREATE_EN = /\b(?:create|draft|draw up|prepare|put together|spin up)\b/i;
  const CREATE_HE = /(?:תיצור|תכין|ליצור|להכין|לנסח|תנסח|תכתוב|לכתוב)/;
  // "write a document" / "make a sheet" is a create. "write the amount" is not.
  const CREATE_LOOSE_EN = /\b(?:write|make)\s+(?:up\s+)?(?:a|an|the)\s+(?:short\s+|new\s+)?(?:\w+\s+){0,2}(?:google\s+doc|document|spreadsheet|sheet|deck|doc)\b/i;
  const SHARE_EN = /\b(?:send|share|attach|forward|email|pass(?:\s+it)?\s+along)\b/i;
  const SHARE_HE = /(?:שלח|תשלח|שתף|לשתף|תשתף)/;
  const PLACE_EN = /\b(?:add|put|include|place|note)\b/i;
  // ו before the verb is "and" (ותוסיף). Final ם is the ם in תשים, not מ.
  const PLACE_HE = /(?:^|[^\u0590-\u05FF]|ו)(?:תוסיף|להוסיף|נוסיף|תשים|תשימי|תשימו|לשים|תציין|תצייני|תציינו)(?![\u0590-\u05FF])/;
  const BLANK_HE = /(?:^|[^\u0590-\u05FF])ריק(?:ה|ים)?(?![\u0590-\u05FF])/;
  const DOC_EN = /\b(?:doc|document|sheet|spreadsheet|deck|google doc|sow|contract|proposal)\b/i;
  const DOC_HE = /(?:מסמך|גיליון|חוזה|הצעה|דוק)/;
  const TEMPLATE_EN = /\b(?:company template|our template|the template)\b/i;
  const TEMPLATE_HE = /(?:תבנית (?:של )?החברה|התבנית שלנו|מהתבנית)/;
  // Absence of a named asset. "don't have a quote" is missing, not a refusal
  // to send. "Please don't send" stays a refusal — it does not match here.
  const NOT_FOUND_EN = /\b(?:don'?t have|do not have|couldn'?t find|could not find|can'?t find|cannot find|didn'?t find|did not find|could not locate|nothing in the (?:folder|drive|files?)|not in the (?:folder|drive|files?)|not on file|no \w+ (?:on file|in the (?:folder|drive|files?))|there is no|there'?s no|we have no)\b/i;
  const NOT_FOUND_HE = /(?:אין (?!צורך|לחץ)|לא מצאתי|לא נמצא|לא קיים)/;

  // One fact from one Sheet or one Doc. Longest fact phrase first so
  // "start date" is one fact, not date plus another.
  const FACT_EN = /\b(?:renewal amounts?|open balances?|start dates?|due dates?|end dates?|renewal dates?|amounts?|balances?|prices?|fees?|totals?|dates?|status(?:es)?|owners?)\b/gi;
  const FACT_HE = /(?:תאריך ההתחלה|תאריך הסיום|הסכום|סכום|המחיר|מחיר|היתרה|יתרה|הסטטוס|סטטוס|התאריך|תאריך)/g;
  const FACT_ASK_EN = /\b(?:what(?:'s| is)(?: the)?|how much(?: is(?: the)?)?|reply with the|tell me the)\b/i;
  const FACT_ASK_HE = /(?:מה ה|מהו ה|כמה|תשיב עם|תגיד לי את)/;
  const SHEET_EN = /\b(?:spreadsheets?|google sheets?|(?:pricing |tracker )?sheets?)\b/i;
  const SHEET_HE = /(?:גיליון|גליון)/;
  const DOC_SRC_EN = /\b(?:google docs?|documents?|docs?)\b/i;
  const DOC_SRC_HE = /(?:מסמך|דוק)/;

  // "find a time" is not in here. Naming no slot is not a hold.
  const MEET_EN = /\b(?:let'?s|let us)\s+(?:meet|sync|hop on|jump on|get on)\b|\b(?:hop|jump) on a call\b|\bgrab (?:time|\d+)\b|\bgot \d+ minutes\b|\bare you free\b|\bfree for a\b|\bquick sync\b|\b(?:can|could|would|shall)\s+(?:we|you)\s+meet(?!\s+(?:the\s+)?(?:deadline|requirement|criteria|quota|target|obligation))\b|\b(?:book|block|pencil)\b(?:\s+\w+){0,2}\s+(?:a |the |some )?(?:time|slot)\b/i;
  const MEET_HE = /(?:בוא נקבע|בואי נקבע|בואו נקבע|יש לך זמן|יש לך רבע שעה|שיחה קצרה|נקפוץ לשיחה|פנוי(?:ה)? לשיחה|(?:^|[^\u0590-\u05FF])נקבע(?! מחדש)(?![\u0590-\u05FF])|ניפגש|(?:^|[^\u0590-\u05FF])נפגש(?:ים|ות)?(?![\u0590-\u05FF]))/;
  const COMMIT_EN = /\b(?:i(?:'ll| will) (?:have|get|send|deliver|share|finish|complete|submit|file|pay|return|forward|email|prepare|handle)|on the hook to|i commit to|count on me to|i(?:'ll| will) take care of)\b/i;
  const COMMIT_HE = /(?:מתחייב|מתחייבת|אאשר עד|אחזיר לך|אני על זה|(?:^|[^\u0590-\u05FF])(?:אשלח|נשלח|אעביר|נעביר|אכין|נכין|אגיש|נגיש|אשלם|נשלם|אחזיר|נחזיר)(?![\u0590-\u05FF]))/;
  const FIND_TIME_EN = /\bfind (?:a |some )?time\b|\bfind (?:us )?a slot\b/i;
  const FIND_TIME_HE = /(?:למצוא|נמצא|תמצא|תחפש|נחפש)\s+זמן/;

  const APPROVE_EN = /\b(?:you have my (?:ok|okay|approval)|green[- ]?light|formally approved|i approve|we approve|approved\b|confirming|confirmed|ok to proceed|paid in full|(?:invoice|fee|payment) is paid)\b/i;
  const APPROVE_HE = /(?:אאשר|אני מאשר|אני מאשרת|אור ירוק|מאושר מצידי|שול(?:מה|מו|ם)(?![\u0590-\u05FF]))/;

  const FOLLOW_EN = /\b(?:please (?:chase|nudge|ping)|follow up with|send (?:a |the )?reminder|send \w+ a reminder|please remind|chase up|chase the|nudge \w+ about|ping \w+ about)\b/i;
  const FOLLOW_HE = /(?:תעקוב|בבקשה תעקוב|לעקוב אחרי|תזכ(?:יר|ירי|ירו)(?![\u0590-\u05FF])|שלח תזכורת|תשלח תזכורת|תבדוק מול)/;

  const MOVE_EN = /\b(?:reschedul\w*|postpone|push (?:the |our |this )?(?:call|meeting|sync)|move (?:the |our |this )?(?:call|meeting|sync))\b/i;
  const MOVE_HE = /(?:לדחות|נדחתה|נדחה|להזיז את ה|תזיז(?:ו|י)? את ה|נקבע מחדש)/;
  const CANCEL_EN = /\b(?:cancel(?:led|ing)?|call(?:ed)? off)\b[^.]{0,48}\b(?:call|meeting|sync|invite|event)\b|\b(?:call|meeting|sync|invite|event)\b[^.]{0,48}\b(?:is |was )?(?:cancelled|called off)\b/i;
  const CANCEL_HE = /(?:בטל את ה|לבטל את ה|הפגישה מבוטלת|השיחה מבוטלת)/;

  const HEDGE_EN = /\b(?:maybe|perhaps|possibly|no rush|if possible|tentatively|might|whenever you|if you feel|sometime|if you(?:'re| are) (?:free|available)|if (?:that|this|it) works|any chance|not sure which|whichever)\b/i;
  const HEDGE_HE = /(?:אולי|ייתכן|אם אפשר|אין לחץ|מתישהו|נראה לי|לא בטוח(?:ה)?\s+איז|איזה\s+קובץ|איזו\s+חשבונית|יש סיכוי)/;
  const NEG_EN = /\b(?:do not|don'?t|never mind|please don'?t)\b/i;
  const NEG_HE = /(?:אל ת|לא תשלח|לא תעביר|לא צריך|לא לשלוח|אין צורך לשלוח|לא מאשר)/;
  // A past day on the object ("the notes from yesterday") is still a live
  // ask. Only a completed act — already sent, already paid — is silence.
  const PAST_EN = /\b(?:already|i sent|we sent|we paid|i paid|has been sent|was sent|was paid|already paid)\b/i;
  const PAST_HE = /(?:כבר|שלחתי|שילמתי|נשלחה אתמול|שול(?:מה|מו|ם)\s+אתמול)/;
  const RETRACT_EN = /^\s*(?:never mind|forget it|disregard|ignore that)[.!]?\s*$/i;
  const RETRACT_HE = /^\s*(?:עזוב|תשכח מזה|לא משנה)[.!]?\s*$/;
  const NOISE_EN = /\b(?:unsubscribe|newsletter|you are receiving this|you(?:'|’)re receiving this|you received this email because|hope this (?:email )?finds you well|book a demo|free trial|just bumping this|circling back|quick bump|for your information|no action needed|fyi)\b/i;
  const NOISE_HE = /(?:לידיעתך|אין צורך בפעולה|ניוזלטר|קיבלת מייל זה|להסרה מרשימת התפוצה|הנך רשום)/;
  const VENT_EN = /\b(?:so frustrated|ridiculous|just venting|this is a mess)\b/i;

  const TARGET_CAL = /\b(?:(?:on(?:to)?|to|in) the calendar|in the (?:calendar |event |invite )?description|calendar invite|calendar note)\b|בתיאור (?:האירוע|הפגישה)|[בל]יומן/i;
  const TARGET_TASK = /\b(?:(?:on|to|in) the task|in the task note|task note|as a task)\b|במשימה|בפתק המשימה|כמשימה/i;
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

  function fileTermIn(chunk) {
    const parts = String(chunk || '').split(/,/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const en = parts[i].match(FILE_EN);
      if (en) return en[1];
      const he = parts[i].match(FILE_HE);
      if (he) return he[0];
    }
    return null;
  }
  // "send the contract instead" names the contract. The first noun in
  // "never mind the invoice, send the contract instead" is the one dropped.
  function fileTerm(sentence) {
    const text = String(sentence || '');
    const cue = text.search(/\b(?:instead|rather)\b/i);
    const heCue = text.indexOf('במקום');
    const idx = cue >= 0 ? cue : heCue;
    if (idx >= 0) {
      const picked = fileTermIn(text.slice(idx)) || fileTermIn(text.slice(0, idx));
      if (picked) return picked;
    }
    const en = text.match(FILE_EN);
    if (en) return en[1];
    const he = text.match(FILE_HE);
    return he ? he[0] : null;
  }
  function distinctFiles(text) {
    const found = [];
    function add(re) {
      const rx = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
      let m;
      while ((m = rx.exec(text))) {
        const term = String(m[1] || m[0]).toLowerCase();
        if (found.indexOf(term) === -1) found.push(term);
      }
    }
    add(FILE_EN);
    add(FILE_HE);
    return found;
  }
  function replacementCue(text) {
    return /\b(?:instead|rather)\b/i.test(text) || String(text || '').indexOf('במקום') !== -1;
  }
  // A span in quotation marks is an older ask the sender is citing.
  // It is not a new close. The words outside the quotes still count.
  function stripQuotedAsks(text) {
    const cue = /\b(?:could you|can you|please (?:send|forward|chase|draft)|i need (?:the|your)|we need (?:the|your)|confirming|you have my|we agreed)\b|(?:אפשר לשלוח|בבקשה תשלח|תשלח את|תעביר את|צריך את|אאשר|מאשר|תעקוב)/i;
    return String(text || '').replace(/["«]([^"»\n]{0,500})["»]/g, (full, inner) => (cue.test(inner) ? ' ' : full));
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
  // A generic document/sheet create ("write a short document", "make a
  // sheet") is family C's verb. "write the amount" is not a create.
  function createVerb(sentence) {
    return CREATE_EN.test(sentence) || CREATE_HE.test(sentence) || CREATE_LOOSE_EN.test(sentence);
  }
  function placing(text) {
    return PLACE_EN.test(text) || PLACE_HE.test(text);
  }
  function blankDoc(sentence) {
    const text = String(sentence || '');
    if (/\bblank\b/i.test(text) && (DOC_EN.test(text) || FILE_EN.test(text) || CREATE_EN.test(text) || CREATE_LOOSE_EN.test(text))) return true;
    if (BLANK_HE.test(text) && (DOC_HE.test(text) || FILE_HE.test(text) || CREATE_HE.test(text))) return true;
    return false;
  }
  // One create-then-share. A document and a spreadsheet in the same
  // sentence is two artifacts, which is silence.
  function tooManyDocs(sentence) {
    const text = String(sentence || '');
    const found = [];
    const re = /\b(google docs?|spreadsheets?|documents?|decks?|sheets?|docs?|sows?|contracts?|proposals?)\b/gi;
    let m;
    while ((m = re.exec(text))) {
      let term = m[1].toLowerCase();
      if (term.indexOf('google doc') === 0) term = 'doc';
      else term = term.replace(/s$/, '');
      if (found.indexOf(term) === -1) found.push(term);
    }
    const he = [];
    const heRe = /מסמך|גיליון|דוק|חוזה|הצעה|מצגת/g;
    let h;
    while ((h = heRe.exec(text))) {
      if (he.indexOf(h[0]) === -1) he.push(h[0]);
    }
    return found.length + he.length >= 2;
  }
  function skipSentence(sentence) {
    if (hedged(sentence) || pastDone(sentence) || statusQuestion(sentence)) return true;
    // "We don't have a quote" names a missing asset. "Please don't send" does not.
    if (negated(sentence) && !notFound(sentence)) return true;
    return false;
  }

  // Hebrew clock words, longest first so "אחת עשרה" is not clipped to "אחת".
  // A word with no day-part is the workday hour (שלוש → 15:00). A bare digit
  // ("בשעה 3", "at 3") stays unresolved: that form is not a stated half of
  // the day, and writing 03:00 was the wrong close.
  const HE_HOUR_WORDS = [
    ['אחת עשרה', 11], ['אחד עשרה', 11],
    ['שתיים עשרה', 12], ['שתים עשרה', 12],
    ['שתיים', 2], ['שתים', 2],
    ['שלוש', 3], ['ארבע', 4], ['חמש', 5], ['שש', 6],
    ['שבע', 7], ['שמונה', 8], ['תשע', 9], ['עשר', 10], ['אחת', 1]
  ];
  const HE_HOUR_ALT = HE_HOUR_WORDS.map((pair) => pair[0]).join('|');

  function clockOf(text) {
    if (typeof FlowExtract === 'undefined' || !FlowExtract.parseTime) return null;
    const time = FlowExtract.parseTime(text);
    if (time && Number.isInteger(time.hour) && Number.isInteger(time.minute)) return time;
    return hebrewWordClock(text) || bareDayClock(text);
  }
  function hebrewWordClock(text) {
    const part = 'בבוקר|בצהריים|אחר הצהריים|אחר הצהרים|אחה["״׳\']צ|בערב|בלילה';
    const m = String(text || '').match(new RegExp(
      '(?:בשעה|בשעות)\\s*(' + HE_HOUR_ALT + ')(\\s+וחצי|\\s+ורבע)?(?:\\s+(' + part + '))?(?![\\u0590-\\u05FF])'
    ));
    if (!m) return null;
    const hour = HE_HOUR_WORDS.find((pair) => pair[0] === m[1]);
    if (!hour) return null;
    const minute = m[2] && m[2].indexOf('חצי') !== -1 ? 30 : (m[2] && m[2].indexOf('רבע') !== -1 ? 15 : 0);
    const spoken = (m[3] || '').replace(/["״׳']/g, '');
    const hm = hour[1] + ':' + String(minute).padStart(2, '0');
    let synthetic = null;
    if (spoken === 'בבוקר') synthetic = 'at ' + hm + ' in the morning';
    else if (spoken === 'בצהריים') synthetic = 'at ' + hm + 'pm';
    else if (spoken === 'אחר הצהריים' || spoken === 'אחר הצהרים' || spoken === 'אחהצ') synthetic = 'at ' + hm + ' in the afternoon';
    else if (spoken === 'בערב') synthetic = 'at ' + hm + ' in the evening';
    else if (spoken === 'בלילה') synthetic = 'at ' + hm + ' at night';
    else if (hour[1] >= 1 && hour[1] <= 7) synthetic = 'at ' + hm + 'pm';
    else if (hour[1] !== 12) synthetic = 'at ' + hm;
    if (!synthetic) return null;
    const parsed = FlowExtract.parseTime(synthetic);
    if (!parsed) return null;
    return { raw: m[0], hour: parsed.hour, minute: parsed.minute };
  }
  function hasDayCue(text) {
    return /\b(?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) ||
      /(?:מחר(?:תיים)?|היום|יום)/.test(String(text || ''));
  }
  // "tomorrow 15:00" / "מחר ב-15:00". The day is what makes the digits a
  // clock. A lone "15:00" is still not one. 3:00 with no half of the day
  // stays unresolved, same as "at 3".
  function bareDayClock(text) {
    if (!hasDayCue(text)) return null;
    const m = String(text || '').match(/\b(\d{1,2}):(\d{2})\b/);
    if (!m) return null;
    const parsed = FlowExtract.parseTime('at ' + m[1] + ':' + m[2]);
    if (!parsed) return null;
    return { raw: m[0], hour: parsed.hour, minute: parsed.minute };
  }
  function bareAmbiguousHour(text) {
    if (clockOf(text)) return false;
    if (/\bat\s+(?:1[0-2]|0?[1-7])(?::[0-5]\d)?\b/i.test(text)) return true;
    if (/(?:בשעה|בשעות)\s*(?:0?[1-7]|12)(?::[0-5]\d)?(?![\d:])/.test(text)) return true;
    return false;
  }
  function shiftWeekday(now, target, mode) {
    const d = new Date(now);
    let delta = (target - d.getDay() + 7) % 7;
    // "this Friday" said on Friday is today. A bare Friday said on Friday
    // is the next one. "next" lands a further week out.
    if (delta === 0) {
      if (mode !== 'this') delta = 7;
    } else if (mode === 'next') delta += 7;
    d.setDate(d.getDate() + delta);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // "יום ג" is Tuesday. The full name ("יום שלישי") is already a date.
  // A lone "יום ג" with no scheduling word and no clock is not one.
  function hebrewAbbrevDay(text, now) {
    if (!now) return null;
    const letter = '([אבגדהו])';
    const tail = '(?:[\'׳\u05F3])?(?:\\s+הבא(?![\\u0590-\\u05FF]))?(?![\\u0590-\\u05FF])';
    const led = String(text || '').match(new RegExp('(?:עד|ב-?|ל|לא יאוחר מ-?)\\s*יום\\s+' + letter + tail));
    const clocked = led ? null : String(text || '').match(new RegExp('יום\\s+' + letter + tail + '(?=\\s+בשעה)'));
    const m = led || clocked;
    if (!m) return null;
    const target = 'אבגדהו'.indexOf(m[1]);
    if (target < 0) return null;
    const mode = /הבא(?![\u0590-\u05FF])/.test(m[0]) ? 'next' : 'plain';
    return { raw: m[0], iso: shiftWeekday(now, target, mode) };
  }
  function weekdayBeforeHm(text, now) {
    if (!now) return null;
    const m = String(text || '').match(/\b(this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?=\s+\d{1,2}:\d{2})/i);
    if (!m) return null;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const target = days.indexOf(m[2].toLowerCase());
    const flagged = (m[1] || '').toLowerCase();
    const mode = flagged.indexOf('next') === 0 ? 'next' : (flagged.indexOf('this') === 0 ? 'this' : 'plain');
    return { raw: m[0], iso: shiftWeekday(now, target, mode) };
  }
  function dateOf(text, now) {
    const parsed = (typeof FlowExtract !== 'undefined' && FlowExtract.parseDate) ? FlowExtract.parseDate(text, now) : null;
    if (parsed && parsed.iso) {
      if (isPastIso(parsed.iso, now)) return null;
      return parsed;
    }
    const extra = hebrewAbbrevDay(text, now) || weekdayBeforeHm(text, now);
    if (!extra || !extra.iso || isPastIso(extra.iso, now)) return null;
    return extra;
  }
  function readSlot(text, now) {
    return { date: dateOf(text, now), time: clockOf(text) };
  }
  // "tomorrow 15:00" / "מחר ב-15:00" is the hold. Leftover words are not.
  function slotShaped(sentence, date, time) {
    if (!date || !time || !date.raw || !time.raw) return false;
    let rest = String(sentence || '');
    rest = rest.split(date.raw).join(' ');
    rest = rest.split(time.raw).join(' ');
    rest = rest.replace(/[\s.,!?;:()"'“”׳״\-–—/]+/g, '');
    rest = rest.replace(/^[בל]+|[בל]+$/g, '');
    return rest.length === 0;
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

  // "to 4pm" names a new clock without the word "at". Only the replacement
  // clause uses this — a bare "to 4" elsewhere is not a meeting time.
  function movedClock(clause) {
    const parsed = clockOf(clause);
    if (parsed) return parsed;
    const to = String(clause || '').match(/\bto\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (!to) return null;
    let hour = +to[1];
    const minute = to[2] ? +to[2] : 0;
    const marker = to[3].toLowerCase().replace(/\./g, '');
    if (marker === 'pm' && hour < 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return { hour: hour, minute: minute, raw: to[0] };
  }
  // "מיום שישי" is the slot being left. parseDate accepts ל/ב, not מ.
  function fromWeekday(text, now) {
    const found = dateOf(text, now);
    if (found) return found;
    const m = String(text || '').match(/(?:מ|ב|ל)יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05FF])/);
    if (!m || !now) return null;
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const target = days.indexOf(m[1]);
    if (target < 0) return null;
    const d = new Date(now);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
    const pad = (n) => String(n).padStart(2, '0');
    return { raw: m[0], iso: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  }
  function slotsDiffer(aDate, aTime, bDate, bTime) {
    if (!aDate || !bDate || !aTime || !bTime) return false;
    return aDate.iso !== bDate.iso || aTime.hour !== bTime.hour || aTime.minute !== bTime.minute;
  }

  function matchMove(sentence, now) {
    const move = MOVE_EN.test(sentence) || MOVE_HE.test(sentence);
    const cancel = CANCEL_EN.test(sentence) || CANCEL_HE.test(sentence);
    if (!move && !cancel) return null;
    const clause = replacementClause(sentence);
    let date = clause ? dateOf(clause, now) : null;
    const time = clause ? movedClock(clause) : null;
    const before = clause ? sentence.slice(0, sentence.indexOf(clause)) : sentence;
    const oldDate = fromWeekday(before, now);
    const oldTime = clockOf(before);
    if (!date && time && oldDate) date = oldDate;
    // Both clocks named, and they differ: move that event. A new clock
    // with no prior slot stays a hold — there is no event to patch.
    if (move && date && time && slotsDiffer(oldDate, oldTime, date, time)) {
      return hit({
        family: 'G', type: 'event', confidence: 'high', personalClose: 'calendar-move',
        calendarOp: 'update',
        what: sentence, requestWhat: sentence,
        date: date, time: time, fromDate: oldDate, fromTime: oldTime
      });
    }
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
    // A cancel that names the slot removes that event. A reschedule with
    // no new clock does not: inserting or deleting would both be a guess.
    if (cancel && !move) {
      const slotDate = fromWeekday(sentence, now);
      const slotTime = clockOf(sentence);
      if (slotDate && slotTime) {
        return hit({
          family: 'G', type: 'event', confidence: 'high', personalClose: 'calendar-cancel',
          calendarOp: 'delete',
          what: sentence, requestWhat: sentence, date: slotDate, time: slotTime
        });
      }
    }
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
    if (blankDoc(sentence) || (earlier || []).some(blankDoc)) return null;
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
    const create = createVerb(sentence);
    const share = SHARE_EN.test(sentence) || SHARE_HE.test(sentence);
    const doc = DOC_EN.test(sentence) || DOC_HE.test(sentence);
    if (!create || !share || !doc) return null;
    // A blank doc is not a close. Two artifacts are not one close.
    if (blankDoc(sentence) || tooManyDocs(sentence)) return 'suppress';
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
    if (FIND_TIME_EN.test(sentence) || FIND_TIME_HE.test(sentence)) return null;
    const meet = MEET_EN.test(sentence) || MEET_HE.test(sentence);
    const commit = COMMIT_EN.test(sentence) || COMMIT_HE.test(sentence);
    // "once" / "hoping" withdraw the promise they sit in. A meet in the
    // same sentence is still a hold. A promise that only exists under
    // that word is not a task and not a calendar event.
    if (commit && !meet && /\b(?:hoping|once)\b|(?:מקווה|מקווים)/.test(sentence)) return null;
    const date = dateOf(sentence, now);
    const time = clockOf(sentence);
    const slot = Boolean(date && time && slotShaped(sentence, date, time));
    if (!meet && !commit && !slot) return null;
    if (!date) return null;
    if (time) {
      // A timed promise stays a decision. A meet, or a sentence that is
      // only the slot, is the event. Both are one calendar hold.
      return hit({
        family: 'D',
        type: (commit && !meet) ? 'decision' : 'event',
        confidence: 'high',
        personalClose: 'calendar-hold',
        what: sentence,
        requestWhat: meet ? sentence : null,
        date: date,
        time: time
      });
    }
    // "at 3" / "בשעה 3" named an hour we will not invent. A commitment
    // still has its day. A meet does not become an all-day hold here.
    if (bareAmbiguousHour(sentence)) {
      if (!commit) return null;
      return hit({
        family: 'D', type: 'decision', confidence: 'high', personalClose: 'dated-commitment',
        what: sentence, date: date
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
    // "Nothing is confirmed yet" names the word in order to withdraw it.
    // "nothing" is not in NEG_EN, so the approval regex used to log the figure.
    if (/\bnothing(?:\s+\w+){0,4}\s+(?:confirm(?:ed|ing)?|approv(?:e|ed)|agree[ds]?|accept(?:ed)?)\b/i.test(sentence)) return null;
    if (/\b(?:confirmed|confirming|approved|agreed|accepted)\s+yet\b/i.test(sentence)) return null;
    if (/\bnot yet\s+(?:\w+\s+){0,3}(?:confirm(?:ed|ing)?|approv(?:e|ed)|agree[ds]?|accept(?:ed)?)\b/i.test(sentence)) return null;
    if (!APPROVE_EN.test(sentence) && !APPROVE_HE.test(sentence)) return null;
    if (/\b(?:about|around|approx(?:imately)?|roughly|circa)\b/i.test(sentence) || /(?:בערך|בסביבות)/.test(sentence)) return null;
    if (/\b(?:or|between)\b/i.test(sentence) || /(?:^|\s)או(?:\s|$)/.test(sentence)) {
      const figs = sentence.match(/(?:\$|€|£|₪)\s?\d|\d[\d,]*(?:\.\d+)?\s?(?:שקל|ש״ח|ש"ח)/gi) || [];
      if (figs.length >= 2) return null;
    }
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

  function matchCount(re, sentence) {
    const flags = re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags;
    const found = sentence.match(new RegExp(re.source, flags));
    return found ? found.length : 0;
  }

  // Reply-with-facts. One named fact, one source. A second fact or a
  // second source is silence, not a softer chip. This does not read the
  // Sheet or the Doc.
  function matchReplyFact(sentence, now) {
    if (!FACT_ASK_EN.test(sentence) && !FACT_ASK_HE.test(sentence)) return null;
    if (matchCount(FACT_EN, sentence) + matchCount(FACT_HE, sentence) !== 1) return null;
    const sheet = SHEET_EN.test(sentence) || SHEET_HE.test(sentence);
    const doc = DOC_SRC_EN.test(sentence) || DOC_SRC_HE.test(sentence);
    if (sheet === doc) return null;
    return hit({
      family: 'J', type: 'request', confidence: 'medium', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, date: dateOf(sentence, now)
    });
  }

  // "the invoices" is more than one file. A trailing s on the English
  // object is that plural. "slides" is one deck. Hebrew plurals do not
  // use this suffix, so they are not guessed here.
  function pluralEnglishFile(sentence) {
    const en = String(sentence || '').match(FILE_EN);
    if (!en) return false;
    const word = en[1];
    if (/^(?:slides|series)$/i.test(word)) return false;
    return /s$/i.test(word) && !/ss$/i.test(word);
  }

  function matchFile(sentence, now) {
    if (!isFileAsk(sentence)) return null;
    if (TEMPLATE_EN.test(sentence) || TEMPLATE_HE.test(sentence)) return null;
    if (pluralEnglishFile(sentence)) return 'suppress';
    return hit({
      family: 'A', type: 'request', confidence: 'medium', personalClose: 'follow-up-ask',
      what: sentence, requestWhat: sentence, objectTerm: fileTerm(sentence), date: dateOf(sentence, now)
    });
  }

  function closeCue(text) {
    if (!text) return false;
    return isFileAsk(text) || ASK_EN.test(text) || ASK_HE.test(text) ||
      FOLLOW_EN.test(text) || FOLLOW_HE.test(text) ||
      MEET_EN.test(text) || MEET_HE.test(text) ||
      MOVE_EN.test(text) || MOVE_HE.test(text) ||
      CANCEL_EN.test(text) || CANCEL_HE.test(text) ||
      APPROVE_EN.test(text) || APPROVE_HE.test(text);
  }
  function bareWithdrawal(sentence) {
    const t = String(sentence || '').trim();
    if (/\b(?:never mind|forget it|disregard|ignore that|scratch that|maybe not)\b/i.test(t)) return true;
    if (/(?:לא משנה|עזוב|תשכח מזה|אולי לא)/.test(t)) return true;
    if (/^(?:please\s+)?(?:do not|don'?t)(?:\s+send(?:\s+it)?)?[.!]?\s*$/i.test(t)) return true;
    if (/^(?:אל תשלח|לא צריך|לא לשלוח)/.test(t)) return true;
    return false;
  }
  function positiveClause(sentence) {
    const chunks = String(sentence || '').split(/,/);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (skipSentence(chunk)) continue;
      if (isFileAsk(chunk) || FOLLOW_EN.test(chunk) || FOLLOW_HE.test(chunk) ||
          MEET_EN.test(chunk) || MEET_HE.test(chunk) ||
          (APPROVE_EN.test(chunk) || APPROVE_HE.test(chunk)) && !pastDone(chunk)) return true;
    }
    return false;
  }
  // A later hedge, refusal, or completed act that points at an earlier
  // ask — or that says "instead" without committing — must not fall
  // through to that older ask.
  function withdrawsEarlier(sentence, earlier) {
    if (!earlier || !String(earlier).trim()) return false;
    if (positiveClause(sentence)) return false;
    const soft = hedged(sentence) || negated(sentence) || pastDone(sentence) || bareWithdrawal(sentence);
    if (!soft && !bareWithdrawal(sentence)) return false;
    if (replacementCue(sentence)) return true;
    if (bareWithdrawal(sentence)) return true;
    const term = fileTerm(sentence);
    const same = (term && String(earlier).toLowerCase().indexOf(String(term).toLowerCase()) !== -1) ||
      /\b(?:it|that)\b/i.test(sentence) || /את זה|אותו|אותה/.test(sentence);
    return same && (hedged(sentence) || negated(sentence) || pastDone(sentence));
  }
  function leadingAlternative(sentence) {
    const t = String(sentence || '').trim();
    return /^(?:or|either)\b/i.test(t) || /^(?:או|או ש)\s/.test(t);
  }
  function ambiguousFiles(text) {
    if (distinctFiles(text).length < 2) return false;
    if (replacementCue(text)) return false;
    return /\b(?:or|either|both|and)\b/i.test(text) || /(?:^|\s)או(?:\s|$)|וגם|גם את|ואת/.test(text);
  }
  function ambiguousClocks(text) {
    if (MOVE_EN.test(text) || MOVE_HE.test(text) || CANCEL_EN.test(text) || CANCEL_HE.test(text)) return false;
    if (replacementCue(text)) return false;
    const clockRe = new RegExp(
      '\\b(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b|בשעה\\s*(?:\\d{1,2}(?::\\d{2})?|' + HE_HOUR_ALT + ')|\\b\\d{1,2}:\\d{2}\\b',
      'gi'
    );
    const clocks = [];
    let m;
    const source = String(text || '');
    while ((m = clockRe.exec(source)) !== null) {
      clocks.push({ raw: m[0], index: m.index, end: m.index + m[0].length });
    }
    if (clocks.length < 2) return false;
    // An explicit range is one meeting: start then dash / to / until / till /
    // עד then the end clock. Drop the end before counting starts.
    const rangeEnd = Object.create(null);
    const betweenRe = /^\s*(?:[-–—−]|to|until|till|עד)\s*$/i;
    for (let i = 0; i < clocks.length - 1; i++) {
      const gap = source.slice(clocks[i].end, clocks[i + 1].index);
      if (betweenRe.test(gap)) rangeEnd[i + 1] = true;
    }
    const starts = [];
    for (let i = 0; i < clocks.length; i++) {
      if (rangeEnd[i]) continue;
      starts.push(clocks[i].raw);
    }
    // Same start printed twice (subject + body, or an invite chip reprint)
    // is still one slot.
    const distinct = [];
    for (let i = 0; i < starts.length; i++) {
      const raw = String(starts[i]).toLowerCase().replace(/^at\s+/, '').replace(/\s+/g, '');
      let key = raw;
      const hm = raw.match(/(\d{1,2}):(\d{2})/);
      if (hm) {
        let h = Number(hm[1]);
        if (/pm/.test(raw) && h < 12) h += 12;
        if (/am/.test(raw) && h === 12) h = 0;
        key = String(h).padStart(2, '0') + ':' + hm[2];
      } else {
        const hourOnly = raw.match(/^(\d{1,2})(am|pm)?$/);
        if (hourOnly) {
          let h = Number(hourOnly[1]);
          if (hourOnly[2] === 'pm' && h < 12) h += 12;
          if (hourOnly[2] === 'am' && h === 12) h = 0;
          key = String(h).padStart(2, '0') + ':00';
        }
      }
      if (distinct.indexOf(key) === -1) distinct.push(key);
    }
    if (distinct.length < 2) return false;
    const meeting = MEET_EN.test(text) || MEET_HE.test(text) ||
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) ||
      /יום/.test(text);
    return meeting ? distinct : false;
  }

  function assess(text, facts, ctx) {
    ctx = ctx || {};
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) text = FlowJudgment.newContent(text || '');
    else text = String(text || '');
    text = stripQuotedAsks(text);
    if (!text.trim()) return null;
    if (ctx.blocked) return null;
    if (NOISE_EN.test(text) || NOISE_HE.test(text)) return null;
    if (ambiguousFiles(text)) return hit({ suppress: true, family: 'H', rule: 'ambiguousFiles', matched: distinctFiles(text) });
    const clockStarts = ambiguousClocks(text);
    if (clockStarts) return hit({ suppress: true, family: 'H', rule: 'ambiguousClocks', matched: clockStarts });
    const now = ctx.now;
    if (!facts && typeof FlowExtract !== 'undefined') {
      facts = FlowExtract.extract(text, { now: now, senderEmail: ctx.senderEmail });
    }
    facts = facts || {};

    const kinds = targetKind(text);
    const named = specificAsset(text);
    const asked = isFileAsk(text) || (named && (ASK_EN.test(text) || ASK_HE.test(text)));
    const fileSomewhere = Boolean(named) && (asked || placing(text));
    // "Put the file on the calendar" names no asset. Silence, rather than
    // a hold at that clock. A real meeting with no file never enters here.
    const genericObject = /\b(?:files?|documents?|docs?|attachments?)\b/i.test(text) || /(?:הקובץ|המסמך|הקבצים|המסמכים)/.test(text);
    if (kinds.length && !named && genericObject && (placing(text) || ASK_EN.test(text) || ASK_HE.test(text))) {
      return hit({ suppress: true, family: 'B' });
    }
    if (kinds.length > 1 && fileSomewhere) return hit({ suppress: true, family: 'B' });
    if (kinds.length === 1 && fileSomewhere && !hedged(text) && !negated(text) && !pastDone(text)) {
      if (kinds[0] === 'doc') return hit({ suppress: true, family: 'B' });
      if (pluralEnglishFile(text)) return hit({ suppress: true, family: 'B' });
      const date = dateOf(text, now);
      const time = clockOf(text);
      if (kinds[0] === 'calendar' && !date) return hit({ suppress: true, family: 'B' });
      // A clock is the hold. A day with no clock is not an all-day guess.
      // A separate "please send the invoice" in the same note can still be
      // family A. A place-only line with no clock stays silence.
      if (kinds[0] === 'calendar' && !time) {
        if (!isFileAsk(text)) return hit({ suppress: true, family: 'B' });
      } else if (kinds[0] === 'calendar') {
        return hit({
          family: 'B', type: 'event', confidence: 'high',
          personalClose: 'calendar-hold', fileTarget: 'calendar',
          what: text, requestWhat: text, objectTerm: named, date: date, time: time
        });
      } else {
        return hit({
          family: 'B', type: 'decision', confidence: 'high', personalClose: null, fileTarget: 'task',
          what: text, objectTerm: named, date: date
        });
      }
    }

    const sentences = splitSentences(text);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const earlier = sentences.slice(0, i).join(' ');
      if ((RETRACT_EN.test(sentence) || RETRACT_HE.test(sentence)) && !positiveClause(sentence)) {
        return hit({ suppress: true, family: 'H' });
      }
      if (leadingAlternative(sentence) && closeCue(earlier)) {
        return hit({ suppress: true, family: 'H' });
      }
      if (withdrawsEarlier(sentence, earlier)) {
        return hit({ suppress: true, family: 'H' });
      }
      // A hedged, refused, or already-done move/cancel is not a new event.
      // skipSentence would walk past it, and the meeting gate would then
      // insert the old clock.
      const moveCue = MOVE_EN.test(sentence) || MOVE_HE.test(sentence);
      const cancelCue = CANCEL_EN.test(sentence) || CANCEL_HE.test(sentence);
      if ((moveCue || cancelCue) && (hedged(sentence) || negated(sentence) || pastDone(sentence))) {
        return hit({ suppress: true, family: 'G' });
      }
      if (skipSentence(sentence)) continue;
      // A blank doc is never a create, with or without a template.
      if (blankDoc(sentence)) return hit({ suppress: true, family: templateCue(sentence) ? 'I' : 'C' });
      // "Find a time" names no slot. A later clear hold already returned.
      if (FIND_TIME_EN.test(sentence) || FIND_TIME_HE.test(sentence)) {
        return hit({ suppress: true, family: 'D' });
      }
      const moved = matchMove(sentence, now);
      if (moved === 'suppress') return hit({ suppress: true, family: 'G' });
      if (moved) return moved;
      const created = matchCreateMissing(sentence, now, sentences.slice(0, i));
      if (created) return created;
      const shared = matchCreateShare(sentence, now);
      if (shared === 'suppress') return hit({ suppress: true, family: 'C' });
      if (shared) return shared;
      const held = matchHold(sentence, now);
      if (held) return held;
      const money = matchMoney(sentence, facts, now);
      if (money) return money;
      const follow = matchFollow(sentence, now);
      if (follow) return follow;
      const file = matchFile(sentence, now);
      if (file === 'suppress') return hit({ suppress: true, family: 'A' });
      if (file) return file;
      const fact = matchReplyFact(sentence, now);
      if (fact) return fact;
    }
    return null;
  }

  // True when every ask in the message sits in a hedge, a refusal, a
  // completed act, or a status question. The bare handoff regex cannot
  // see "don't" or "maybe" in front of "could you", and a chip there is a
  // wrong close. A past day on the thing being asked for is not this.
  function parkingPermitAsk(text) {
    const t = String(text || '');
    return /\bparking permits?\b/i.test(t) && /\b(?:please|can you|could you|would you|send|need|renew|attach|forward)\b/i.test(t);
  }

  function askBlocked(text) {
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) text = FlowJudgment.newContent(text || '');
    text = stripQuotedAsks(text);
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

  return { assess, askBlocked, parkingPermitAsk, route, detailSurface, stripQuotedAsks, readSlot, FILE_EN, FILE_HE };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloseFamilies };
