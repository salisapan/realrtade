// What a reply MEANS for the loop it landed on — portable, no chrome.*, no DOM,
// no network, no model. Local-first rule (docs/local-first-principle.md).
//
// core/follow-up.js already knows "out of office", "got it", "I'll send it
// Friday" and "I paid". What it did not know is the other family of replies that
// are NOT completion even though a person wrote back:
//
//   blocked   "I never got the attachment" / "the link is broken" / "לא קיבלתי"
//   question  "Which invoice do you mean?" / "can you resend it?" / "?איזו חשבונית"
//   declined  "we are not going ahead" / "I can't sign this" / "לא מעוניינים"
//
// blocked and question mean the ball is back with YOU: the loop stays open, the
// chase to them stops, and the next move is yours. declined is a real answer, a
// deliberate release by them, so the loop closes — as 'declined', not as done.
//
// Discipline, as everywhere: every rule needs an explicit cue, "delivered" words
// in the same message veto a question, polite courtesy is never a question, and
// when nothing here fires the caller keeps its old behaviour.
const FlowReplyMeaning = (() => {
  const words = (t) => (String(t || '').match(/\S+/g) || []).length;
  const hasHebrew = (t) => /[֐-׿]/.test(String(t || ''));
  function sentences(text) {
    return String(text || '').replace(/\r/g, '').split(/(?<=[.!?؟])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  }

  // ---- blocked: they could not use what you sent --------------------------------
  const THING = '(?:attachment|attachments|file|files|document|documents|invoice|contract|link|email|e-?mail|message|pdf|form|it|them|anything|the (?:attachment|file|document|invoice|contract|link|pdf|form))';
  const BLOCKED_EN = [
    new RegExp("\\b(?:i|we)?\\s*(?:did ?n[o']t|didn['’]t|have ?n[o']t|haven['’]t|never|still (?:have ?n[o']t|haven['’]t|did ?n[o']t)) (?:get|got|receive|received|see|find)\\s+(?:your |the |any |an? )?" + THING, 'i'),
    /\b(?:forgot to (?:attach|include)|nothing (?:seems to be |appears to be |was |is )?(?:attached|included)|(?:attachment|file) (?:is |was )?(?:missing|empty|blank)|no attachment|there(?:['’]s| is| was) no (?:attachment|file))\b/i,
    /\b(?:link|file|attachment|document|pdf|invoice|form)\b(?:\s+[\w'’]+){0,4}?\s+(?:has |have |is |was |seems |appears |came (?:through )?|comes (?:through )?)?(?:broken|dead|expired|corrupt(?:ed)?|empty|blank|garbled|not working|didn['’]t work|doesn['’]t work|not opening|won['’]t open)\b/i,
    /\b(?:came|come|comes|arrived) (?:through|in) (?:blank|empty|corrupt(?:ed)?|broken|garbled)\b|\b(?:can['’]?t|cannot|don['’]t|do not|couldn['’]t) see (?:any|the|an?) (?:attachment|file|link|pdf|document|invoice)\b/i,
    /\b(?:wrong|incorrect|old|outdated) (?:file|link|attachment|invoice|version|document|contract|amount|number|address|name)\b/i,
    /\b(?:didn['’]t|did not|hasn['’]t|has not|doesn['’]t seem to have|does not seem to have|never) (?:come through|came through|arrive[d]?|go through|gone through|reach(?:ed)? (?:me|us))\b/i
  ];
  // "can't open it" counts only next to something they were sent.
  const CANT_OPEN = /\b(?:can['’]?t|cannot|could ?n[o']t|couldn['’]t|unable to|not able to|won['’]t|doesn['’]t|does not|isn['’]t|is not|not)\s+(?:be )?(?:open|opening|access|view|download|read|load)\b/i;
  const SENT_THING = /\b(?:attachment|file|document|invoice|contract|link|pdf|form|it|them|this|that|doc|docs|spreadsheet|deck|presentation)\b/i;
  const BLOCKED_HE = [
    /לא (?:קיבלתי|קיבלנו|רואה|רואים|הגיע|הגיעו|נפתח|נפתחת|עובד|עובדת)/,
    /(?:לא מצליח|לא מצליחה|לא מצליחים|אין לי אפשרות|לא הצלחתי|לא הצלחנו) (?:לפתוח|לראות|להוריד|לקרוא)/,
    /(?:חסר|חסרה|חסרים) (?:לי )?(?:קובץ|נספח|מצורף|קישור|קבצים)|שכחת(?:ם)? לצרף|בלי (?:קובץ|נספח|מצורף)/,
    /(?:הקישור|הקובץ|הנספח|המסמך|ה-?pdf) (?:שבור|שבורה|ריק|ריקה|פגום|פגומה|לא (?:עובד|עובדת|נפתח|נפתחת))/i,
    /(?:קובץ|קישור|נספח|גרסה|סכום|כתובת|חשבונית) (?:שגוי|שגויה|לא נכון|לא נכונה|ישן|ישנה)/
  ];

  // ---- needs something from you before they can go on ---------------------------------
  const MISSING_EN = /\b(?:i|we)(?:['’]m|['’]re| am| are) (?:still )?missing (?:the|your|a|an|some|any)\b/i;
  const NEED_EN = /(?:\b(?:i|we)(?:['’]ll| will)? (?:still |also )?|\b(?:i|we)['’](?:m|re) (?:still )?|^(?:still |also )?)(?:need|require|missing|am missing|are missing)(?:ing)? (?:the |your |a |an |some |more )?[\w'’ -]{2,40}?(?: from you| before (?:i|we) can| in order to| to (?:proceed|approve|continue|move forward|sign|pay|finish|complete|process|book|confirm))\b/i;
  const NEED_HE = /(?:אני|אנחנו) (?:צריך|צריכה|צריכים) (?:עוד |את )?[^.?!]{1,30} לפני ש|(?:חסר לי|חסר לנו|חסרים לי|חסרים לנו) [^.?!]{1,30}/;

  // ---- declined: a deliberate no -------------------------------------------------
  const DECLINE_EN = [
    /\b(?:i|we)(?:['’]m| am| are|['’]re)? (?:sorry,? )?(?:but )?(?:can['’]?t|cannot|won['’]t|will not|unable to|not able to|do ?n[o']t (?:think|want)|don['’]t want)\b(?! (?:wait|thank|believe|tell|stress|stop|help but))\s+(?:do|make|attend|sign|approve|pay|send|help|join|take|commit|proceed|go|accept|agree|participate|support|provide|release|move forward|continue|work|use)\b/i,
    /\b(?:we|i)(?:['’]ve| have)? decided (?:not to|against)\b|\b(?:decided to (?:pass|decline|cancel|go (?:with )?(?:another|a different|someone else)))\b/i,
    /\bnot (?:going to|gonna) (?:proceed|move forward|go ahead|continue|do (?:it|this)|pay|sign|approve)\b|\bnot (?:moving|going) (?:forward|ahead)\b|\bnot (?:interested|proceeding|pursuing|a (?:fit|match))\b|\bno longer (?:interested|needed|relevant|required)\b/i,
    /\b(?:must|have to|need to|will|going to|regret to|sorry to) (?:decline|pass|cancel|withdraw|turn (?:this|it) down)\b|\b(?:i|we)(?:['’]ll| will) pass\b|\bdeclin(?:e|ed|ing)\b|\bwithdraw(?:ing|n)?\b/i,
    /\bgo(?:ing)? with (?:another|a different|someone else|a competitor|other)\b|\b(?:it|this|that)(?:['’]s| is) not (?:for (?:us|me)|(?:the )?right (?:fit|time))\b|\bnot (?:a|the) (?:right )?(?:fit|match|priority)\b/i,
    /\b(?:won['’]t|will not|not going to|not gonna) be (?:proceeding|moving forward|going ahead|continuing|pursuing|taking (?:this|it) (?:on|further))\b/i,
    /\b(?:won['’]t|will not|unable to|not going to|not gonna) be able to (?:take|do|help|make|attend|sign|accept|proceed|commit|join|participate|support)\b/i,
    /^(?:no|nope|nah|no thanks|no thank you|not (?:now|this time|possible|happening))[.!,]?(?:\s|$)/i
  ];
  const DECLINE_HE = [
    /לא (?:אוכל|נוכל|אצליח|נצליח|אשלם|נשלם|אחתום|נחתום|אאשר|נאשר|מעוניין|מעוניינת|מעוניינים|רלוונטי|רלוונטית|ממשיכים|נמשיך|מתקדמים|נתקדם|מסכים|מסכימה|מסכימים)/,
    /החלטנו (?:שלא|לא|לוותר|לבטל)|החלטתי (?:שלא|לא|לוותר|לבטל)|נאלצ(?:ים|ת|ה)? (?:לסרב|לוותר|לבטל)|מסרב|מסרבת|מבטל(?:ים|ת)?|ביטלנו|ביטלתי/,
    /לא מתאים (?:לנו|לי)|לא רלוונטי (?:לנו|לי|כרגע)|(?:נלך|נבחר|בחרנו|נעבוד) עם (?:ספק|גורם|חברה) אח(?:ר|רת)/,
    /^(?:לא|ממש לא|לא תודה)[.!,]?(?:\s|$)/
  ];
  // "I can't do Tuesday, how about Wednesday?" is a counter-offer, not a no.
  const COUNTER = /\b(?:how about|what about|instead|rather|alternatively|could we (?:do|try|move)|can we (?:do|try|move)|would \w+ work|another (?:time|day|date)|different (?:time|day|date))\b|(?:מה דעתך|מה דעתכם|אולי ב|במקום|במועד אחר|ביום אחר|אפשר (?:ב|לדחות))/i;
  // Things that sound negative and are not a decline.
  const NOT_DECLINE = /\b(?:no (?:problem|worries|rush|issue|doubt)|not a problem|can['’]?t wait|can['’]?t thank|can['’]?t believe|can['’]?t say enough|won['’]t be (?:long|a problem|late)|not (?:yet|sure|certain|possible yet)|no news)\b|(?:אין בעיה|אין לחץ|אין דאגה)/i;

  // ---- question: they need something from you -------------------------------------
  const WH_EN = /^(?:which|what|where|when|who|whom|whose|how (?:much|many|long|do|should|can|would|will)|why|should (?:i|we)|do you (?:mean|want|have|know|need)|did you (?:mean|want|send|attach)|are you (?:sure|able|available|referring)|is (?:it|this|that|there)\b[^?]{0,40}\b(?:you|yours)|could you|can you|would you|will you|do you mind|any chance)\b/i;
  const WH_HE = /^(?:איזה|איזו|איזהו|מה|מתי|איפה|כמה|למי|מי|האם|למה|איך|תוכל|תוכלי|תוכלו|אפשר|יש לך|יש לכם|אתה (?:יכול|רוצה|בטוח)|את (?:יכולה|רוצה|בטוחה))/;
  // Questions that are courtesy or confirmation of what they just said.
  const COURTESY_Q = /\b(?:anything else[^?]*|need anything[^?]*|else (?:you )?need[^?]*|sound good|(?:is|are|does|do)\b[^?]{0,30}\b(?:still )?(?:good|ok|okay|fine|work|works)|does that work|is that (?:ok|okay|fine|alright|right|correct)|ok(?:ay)?|right|make sense|any questions|good to go|all good|works for you|how (?:are|is) (?:you|everything|it going)|have a (?:good|great|nice)(?: \w+)?|ready to go|you there)\s*[?]?\s*$|(?:מתאים לך|בסדר|נכון|סבבה|הכול טוב|הכל טוב|מה שלומך)\s*[?]?\s*$/i;
  const REQUEST_VERB = /\b(?:resend|re-?send|send (?:me|us|it|that|again)|re-?attach|share again|forward (?:it|that|again)|clarify|explain|specify|confirm (?:the|which|your)|let me know (?:which|what|where|when|how)|tell me (?:which|what|where|when|how)|need (?:the|your|more|a|an|some)|can you (?:send|share|clarify|confirm|resend|check)|please (?:send|share|clarify|confirm|resend|specify|advise))\b|(?:תשלח(?:ו)? (?:שוב|לי|את)|תבהיר|תסביר|תפרט|תפרטו|צריך (?:את|עוד|ש)|צריכה (?:את|עוד)|תוכל(?:ו)? (?:לשלוח|להבהיר|לאשר)|נא (?:לשלוח|להבהיר|לפרט))/i;
  // A message that already carries the answer: a question after it is a new
  // matter, and the loop it landed on is done.
  const DELIVERED = /\b(?:attached|enclosed|here(?:['’]s| is| are)|signed|approved?|confirmed?|paid|done|accepted|that works|works for me|agreed?|yes)\b|(?:מצורף|חתום|חתמתי|אושר|מאשר|מאשרת|שולם|שילמתי|סגור|מסכים|מסכימה)/i;

  function isQuestionSentence(s) {
    if (!s || COURTESY_Q.test(s)) return false;
    const mark = /[?؟]\s*$/.test(s);
    const he = hasHebrew(s);
    if (mark) {
      // A bare "?" or one word is not a question we can act on.
      return words(s) >= 2;
    }
    if (/^(?:i|we)\b|\b(?:i|we)(?:['’]ll| will| am going to)\b|^(?:אני|אנחנו|אשלח|נשלח)/i.test(s)) return false;
    return REQUEST_VERB.test(s) && (he ? WH_HE.test(s) || /(?:תשלח|תבהיר|תסביר|צריך)/.test(s) : true);
  }

  // text: the other person's newest message, greeting already stripped.
  // ctx:  { kind:'reply'|'payment', pipeline?, types? }
  // Returns { meaning:'blocked'|'question'|'declined', why } or null.
  function read(text, ctx) {
    const c = ctx || {};
    const body = String(text || '').trim();
    if (!body) return null;
    const lines = sentences(body);
    const he = hasHebrew(body);

    // blocked first: it is the clearest cue and wins even next to "thanks".
    for (const s of lines) {
      if (NOT_DECLINE.test(s)) continue;
      if (BLOCKED_EN.some((re) => re.test(s)) || (CANT_OPEN.test(s) && SENT_THING.test(s)) || (he && BLOCKED_HE.some((re) => re.test(s)))) {
        return { meaning: 'blocked', why: 'could not use what was sent', line: s };
      }
    }

    // a need stated flatly ("I need the VAT number before I can approve") is the ball back with you.
    if (!DELIVERED.test(body) || /before (?:i|we) can|לפני ש/i.test(body)) {
      for (const s of lines) {
        if (NEED_EN.test(s) || MISSING_EN.test(s) || (he && NEED_HE.test(s))) return { meaning: 'question', why: 'needs something from you', line: s };
      }
    }

    // declined: a counter-offer or a courtesy never counts.
    if (!COUNTER.test(body)) {
      for (const s of lines) {
        if (NOT_DECLINE.test(s)) continue;
        if (DECLINE_EN.some((re) => re.test(s)) || (he && DECLINE_HE.some((re) => re.test(s)))) {
          return { meaning: c.kind === 'payment' ? 'question' : 'declined', why: c.kind === 'payment' ? 'pushed back on a payment' : 'said no', line: s };
        }
      }
    } else if (lines.some((s) => DECLINE_EN.some((re) => re.test(s)) || (he && DECLINE_HE.some((re) => re.test(s))))) {
      return { meaning: 'question', why: 'counter-offer', line: lines.find((s) => COUNTER.test(s)) };
    }

    // question: only in a short reply, only when nothing was delivered.
    if (words(body) <= 60 && !DELIVERED.test(body)) {
      for (const s of lines) {
        if (isQuestionSentence(s)) return { meaning: 'question', why: 'asked something back', line: s };
      }
    }
    return null;
  }

  return { read, isQuestionSentence };
})();

if (typeof module !== 'undefined') module.exports = { FlowReplyMeaning };
