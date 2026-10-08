// The judgment engine: decides whether one email is worth speaking up about.
//
// This file itself runs entirely on the device and sends nothing anywhere —
// still true, and still the default path for every message, English or
// Hebrew, that its patterns actually cover. It is a fixed keyword/regex
// corpus, not language understanding, so it has a real ceiling: a message
// this file scores { type: null } is not "Glance stayed local," it's
// "Glance found nothing" — content-gmail.js's ensureRemoteClassification()
// is the one place that gap gets a second, masked-text-only attempt (see
// glance-assist.js). Growing the corpus below keeps more real Hebrew and
// English business email inside this free, instant, fully local path
// rather than needing that fallback at all.
//
// It is not a keyword match. Each signal carries a weight and a reason; the
// score is their sum, and the chip only appears once the score clears a
// threshold that moves as you use it. Because every contribution is named, the
// popup can show you exactly why Flow spoke — which is the difference between a
// tool you trust and a tool you switch off.
//
// The design bias throughout is toward silence. A false positive costs the user
// their attention and their trust; a false negative costs one email they would
// have handled themselves anyway.

const FlowJudgment = (() => {
  // Fitted against test/judgment-corpus.cjs, not guessed. 55 measurably missed
  // the most common real decision in business email — a bare "Approved, go
  // ahead" with no figure and no date — while the old scorer let cold pitches
  // through. The cold-pitch penalty below is what buys the headroom to sit at 50.
  const BASE_THRESHOLD = 50;
  // Strong authorisations have to clear this bar on their own. 42 is the
  // weight; the gap up to BASE_THRESHOLD is added only when nothing else
  // positive is present (see score), so a reply bonus is not required.
  const STRONG_WEIGHT = 42;
  const MIN_THRESHOLD = 38;
  // Capped where a genuine decision can still clear it. Higher than this and a
  // run of dismissals mutes Flow outright, which is indistinguishable from a
  // broken extension to someone whose product promise is silence.
  const MAX_THRESHOLD = 72;

  // A decision was made — someone committed to something.
  // "deal" is deliberately NOT here: it is a topic word, not a commitment, and
  // it lives in the sales profile's entityWords where it belongs. Left in this
  // list it handed every cold pitch containing "here's the deal" a full
  // commitment score, which measurably ranked spam above real decisions.
  //
  // Broadened alongside every other lexicon in this file per the "as broad
  // as possible, staying entirely local" request — safe to do fairly
  // aggressively here because every addition below is routed through
  // assertedIn's per-sentence negation/hedge/question check (unlike
  // HANDOFF/HANDOFF_HE above and LOST/LOST_HE below, which are bare
  // .test() and documented separately for exactly that reason).
  const COMMIT = /\b(we'?re good (?:at|with)|agreed?(?: to| on)?|confirm(?:ed|ing)?|accept(?:ed)?|we'?ll take|executed|sounds good|works for (?:us|me)|happy to (?:move forward|proceed)|let'?s proceed|we'?re on board|consider it done|that works (?:for us|for me)?|agreed upon|in agreement|we concur|we'?re aligned|you have our agreement|you have my (?:ok|okay|approval)|give you our ok|i commit to|on the hook to|count on me to|paid in full|(?:invoice|fee|payment) is paid)\b/i;
  // An explicit, unambiguous authorisation. These carry more weight than the
  // general list because "Approved — go ahead" is the single most common real
  // decision in business email and it arrives with no money and no date
  // attached, so it has to clear the bar largely on its own.
  const COMMIT_STRONG = /\b(approved?|signed off|sign-?off|go ahead|green[- ]?lit|locked in|countersigned|fully executed|signature page attached|authori[sz]ed|formally approved|ratified|endorsed|cleared for (?:launch|takeoff|release)|final approval|greenlight given)\b/i;
  // A decision was made in the other direction. LOST is deliberately NOT
  // routed through assertedIn (see score()'s own comment on this below —
  // its patterns already embed the negation), so it carries the same
  // bare-.test() false-positive risk HANDOFF/MEETING_NOUN above do, and
  // every addition here was kept to clearly deal-ending, multi-word phrases
  // for the same reason.
  const LOST = /\b(not (?:moving|going) forward|we'?re pulling out|decided to go with (?:someone|another)|going a different direction|no longer interested|cancel(?:ling|led)? the|terminate the|declin(?:e|ed|ing)|we'?ve decided to pass|passing on this (?:opportunity|offer|proposal)?|not the right fit|going with a different (?:vendor|provider|option)|we won'?t be proceeding|backing out of|withdrawing from|opted not to (?:move forward|proceed)|chose not to move forward)\b/i;
  // A signature that an agreement completed.
  const EXECUTED = /\b(fully executed|countersigned|signed the (?:agreement|contract)|execution copy|signature page attached|signed and returned|signed copy attached|agreement is signed|contract is signed|deal is closed|paperwork is complete)\b/i;
  // Something is owed to somebody by a date.
  const OBLIGATION = /\b(due|deadline|by end of|no later than|must be (?:filed|delivered|paid|submitted|completed|finalized)|expires?|payable|net ?\d{2}|required by|needs? to be (?:finalized|submitted|completed) by|has to be submitted by|owed by|payment is due)\b/i;
  // A direct request aimed at the reader. Deliberately kept to multi-word,
  // clearly imperative/polite-request-shaped phrases (never a single common
  // word) — this signal is tested with a bare .test() against the whole
  // message, not routed through assertedIn's per-sentence negation/hedge
  // check the way COMMIT/LOST/EXECUTED/OBLIGATION above are, so a phrase
  // that could plausibly appear inside an unrelated sentence carries more
  // false-positive risk here than anywhere else in this file. Every
  // addition below was verified against the full negative-test corpus in
  // test/intent-actions-corpus.cjs (vague asks, cold pitches, small talk)
  // before being kept.
  const HANDOFF = /\b(can you|could you|would you (?:be able to|mind)|would it be possible (?:for you )?to|I was hoping you could|please (?:can you |could you )?(?:send|update|confirm|review|approve|handle|process|arrange|ensure|provide|forward|share|submit|sign|upload|prepare|finalize|resend|reply|respond|schedule|pay|remit|wire|settle|let (?:us|me) know)|kindly (?:send|confirm|provide|forward|arrange|review|update|advise|pay|remit)|(?:we|I)(?:'d| would) appreciate (?:it )?if you|requesting (?:that )?you|asking you to|your (?:help|assistance|input|guidance) (?:is|would be) (?:needed|appreciated|required)|(?:we|I) need your (?:approval|confirmation|feedback|input|help|sign-?off)|need(?:s|ed)? you to|waiting on (?:your|you)|over to you|action required|at your earliest convenience)\b/i;
  // A disagreement about money.
  const DISPUTE = /\b(doesn'?t match|does not match|discrepan(?:cy|t)|billing error|double[- ]charged|overcharged|undercharged|incorrect (?:amount|invoice)|dispute|wrong amount|billing discrepancy|invoice error|charged incorrectly|duplicate charge|unauthorized charge)\b/i;

  // Hebrew twins of the seven signals above. No \b word-boundary wrapper here
  // — \b is defined against [A-Za-z0-9_], so it never fires around Hebrew
  // letters and would silently turn every one of these into a dead pattern.
  // Same phrases, same intent, just the vocabulary an Israeli business inbox
  // actually uses instead of "we're good at" / "approved" / "no longer interested".
  // Broadened alongside the EN twins above, same assertedIn-safety-net
  // reasoning (LOST_HE is the one exception — see LOST's own comment).
  // "מתאים לנו" ("works for us") was deliberately dropped from this list —
  // it collided with LOST_HE's own new "לא מתאים לנו" ("not a fit for us")
  // below: NEG_BEFORE_HE correctly saw the negation and kept assertedIn
  // from crediting the commitment, but commitMentioned (the raw, negation-
  // blind test) still saw "מתאים לנו" present and stacked the -34 "negated"
  // penalty on top of LOST's own +46, dragging a plain rejection message
  // below threshold. Same false-positive-adjacent bug class this file's
  // NEG_BEFORE_HE/HEDGE_HE header comments already document — found here by
  // the same "run the negative corpus before committing" discipline.
  const COMMIT_HE = /(סוכם|אישרנו|מאשרים|מקובל עלינו|סגרנו|בסדר מבחינתנו|מאשר(?:ת|ים)?|מסכימים|מסכימה|מסכים|הוחלט ש|סגור מבחינתנו|בסדר גמור|מקובל עליי?נו?|נשמע טוב|נשמח להתקדם|בואו נתקדם|אנחנו בעניין|רואים בזה סגור|תואמים|יש לנו הסכמה|אאשר|מתחייב|מתחייבת|שול(?:מה|מו|ם)(?![\u0590-\u05FF]))/;
  // "נחתם" is the passive twin of English "countersigned" / "fully executed",
  // which already sit on COMMIT_STRONG. Left only on the weaker executed
  // list, "ההסכם נחתם" cannot clear 50: executed is 26, and a short note
  // also eats the length penalty. "עותק חתום" stays off this list — it is
  // the document someone asks you to send, not the fact that it was signed.
  const COMMIT_STRONG_HE = /(מאושר|יש אישור|אפשר להתקדם|קיבלנו אישור|חתמנו|ניתן אישור|אושר|האישור התקבל|אור ירוק|קיבלנו את האישור|אפשר לצאת לדרך|ההזמנה אושרה|מאושר סופית|אושר רשמית|קיבל אישור סופי|יצא אישור|האישור הסופי התקבל|נחתם|ההסכם נחתם)/;
  const LOST_HE = /(לא ממשיכים|פורשים מ|לא מעוניינים יותר|מבטלים את ה|ירדנו מזה|החלטנו שלא|לא הולכים על זה|בחרנו באופציה אחרת|בחרנו בספק אחר|לצערנו לא נוכל|אנחנו לא ממשיכים איתכם|ירדנו מהעניין|החלטנו לוותר|לא מתאים לנו|הולכים על ספק אחר|פורשים מההסכם|לא נמשיך בתהליך)/;
  const EXECUTED_HE = /(נחתם|חתמנו על ההסכם|עותק חתום|ההסכם נחתם|חתמתי על|נחתם וסגור|חתום ומאושר|נשלח חתום|העותק החתום מצורף|העסקה נסגרה|הניירת הושלמה)/;
  const OBLIGATION_HE = /(דדליין|לא יאוחר מ|יש לשלם עד|פג תוקף|עד לתאריך|מועד אחרון|עד סוף החודש|יש להעביר עד|נדרש לשלם עד|יש להשלים עד|יש להגיש עד|נדרש להשלים עד|התשלום נדרש עד|יש לסיים עד)/;
  // תשלח/י לי, צריך/ה ממך, בבקשה ת... — the direct "do X for me" phrasings a
  // small, personal-scale request actually gets written in, on top of the
  // more formal "תוכל/נשמח אם" business-register set already here. "בבקשה
  // ת" is deliberately broad (any 2nd-person imperative/future verb, which
  // in Hebrew all take a ת prefix, following "please") rather than
  // enumerating every possible verb after it.
  //
  // אבקש/מבקש(ת/ים) — first-person "I request/ask" — was the exact gap that
  // let a plain, real request ("אבקש לקבל ממך את הקבלה...") score a flat 0:
  // every other alternative here is either 2nd-person (asking the reader
  // directly) or a fixed "please" phrase, and neither covers someone
  // stating their own request in first person, which is at least as common
  // in Hebrew business writing as the "תוכל..." forms already covered. נא
  // ל.../אנא.../אודה if/לקבל round out the other common register: a
  // slightly more formal or more polite "please" than "בבקשה ת" alone
  // captures. (?:^|\s) in front of the 2-letter נא guards the same
  // substring risk NEG_BEFORE_HE/HEDGE_HE document above it in this file —
  // "נא" bare would otherwise match inside unrelated longer words.
  // Extended the same way HANDOFF (EN) above just was — more registers of
  // the same "asking you to do X" shape, each verified against the full
  // negative-test corpus before being kept, for the same no-safety-net
  // reason documented on HANDOFF.
  const HANDOFF_HE = /(תוכלו?\s|תוכלי\s|נשמח אם|מחכים ל(?:אישור|תשובה|תגובה)|(?<!לא\s)נדרשת פעולה|אשמח אם תוכל|תשלחי?\s+לי|(?:צריך|צריכ(?:ה|ים))\s+ממך|בבקשה ת|אבקש|מבקש(?:ת|ים)?|אודה (?:לך |לכם )?(?:מאוד )?אם|אשמח (?:אם )?לקבל|(?:^|\s)נא\s+ל|אנא (?:שלח|תשלחו?|העבר|תעבירו?|אשר|תאשרו?|עדכן|תעדכנו?|ציין|תציינו?|פרט|תפרטו?|מלא|תמלאו?)|האם תוכלו?|תוכלו? בבקשה|אשמח אם תשלחו?|(?:אפשר|ניתן) לקבל את|יש צורך ש|(?<!לא\s)נדרש ממך|חשוב שתעביר|(?:^|\s)אם תוכלו?\s|(?:^|\s)אם תוכלי\s|(?:^|\s)אם אפשר\s|נשמח לקבל|תודה מראש (?:על|ש)|יהיה נהדר אם תוכלו?|נודה לך אם|ההשתתפות שלך נדרשת)/;
  // "Please follow up with Dana about the invoice" is an explicit ask, and
  // it never matched HANDOFF: "follow up" isn't in that verb list, and the
  // "send" later in the sentence isn't adjacent to "please". Kept out of
  // HANDOFF on purpose — these go through directedAsk() below (negation and
  // a hedge sitting in front of the phrase still kill them) instead of
  // HANDOFF's bare .test(), which cannot see "please don't follow up".
  const FOLLOW_UP_ASK = /\b(?:please follow(?:\s*|-)?up|follow up (?:with|on)|need you to follow up|please (?:chase|nudge|ping)|chase up|send (?:a |the )?reminder|send \w+ a reminder|please remind)\b/i;
  const FOLLOW_UP_ASK_HE = /(?:^|\s)בבקשה\s+תעק(?:וב|בי|בו)|(?:^|\s)לעקוב\s+אחרי|(?:^|\s)תעק(?:וב|בי|בו)\s+אחרי|(?:^|\s)תזכ(?:יר|ירי|ירו)(?![\u0590-\u05FF])|(?:^|\s)(?:שלח|תשלח|לשלוח)\s+תזכורת/;
  // A first-person delivery promise. Not a COMMIT word ("agreed",
  // "approved") and not a reader reminder ("you agreed to") — "I will send
  // the contract by Friday" is the sender closing a dated obligation on
  // themselves. Weight stays zero: without a resolved date this is not
  // evidence, and only intent.js's dated-commitment gate reads the flag.
  // Delivery verbs only, so "I'll have a look" / "I'll see" never count.
  const SENDER_PROMISE = /\b(?:I|we)(?:'ll| will)\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i;
  const SENDER_PROMISE_HE = /(?:^|\s)(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/;
  const DISPUTE_HE = /(לא תואם|אי התאמה|חיוב כפול|חיוב שגוי|מחלוקת|טעות בחיוב|הסכום שגוי|יש טעות בחשבונית|לא תואם למוסכם|חיוב יתר|חיוב חסר|טעות בגבייה|חיוב לא מורשה)/;

  const MARKETING = /\b(unsubscribe|view (?:this )?in (?:your )?browser|manage (?:your )?(?:email )?preferences|webinar|newsletter|limited[- ]time|special offer|% off|register now|save your seat)\b/i;
  const CALENDAR_NOISE = /\b(has (?:accepted|declined|tentatively accepted) (?:this|your) invitation|invitation from google calendar|added to your calendar)\b/i;
  // The fingerprint of a cold pitch. Without this, "our pricing starts at $99/mo,
  // can you confirm a time this week?" collects money + commitment + handoff and
  // outscores an actual signed contract.
  const SOLICITATION = /\b(pricing starts at|book a (?:demo|call|time)|schedule a (?:demo|call|quick chat)|free trial|hope this (?:email )?finds you well|following up on my (?:last|previous) email|just bumping this|circling back|quick question for you|reaching out because|thought you'?d be interested|worth a (?:quick )?chat)\b/i;
  // Hard-gate veto, narrower than SOLICITATION / MARKETING on purpose.
  // "schedule a call" and "webinar" are in those penalties AND in the
  // meeting lexicon — a score hit is right, a veto would hide a real
  // "can we schedule a call on Monday". What remains is a pitch or a
  // mailing even when the message also names a date or an object.
  const PITCH_VETO = /\b(pricing starts at|free trial|hope this (?:email )?finds you well|following up on my (?:last|previous) email|just bumping this|circling back|quick question for you|reaching out because|thought you'?d be interested|worth a (?:quick )?chat|book a demo|schedule a demo)\b/i;
  const MARKETING_VETO = /\b(unsubscribe|view (?:this )?in (?:your )?browser|manage (?:your )?(?:email )?preferences|newsletter|limited[- ]time|special offer|% off|register now|save your seat)\b/i;

  // Where a reply stops being new and starts being history. Gmail's own quote
  // header runs about 60 characters ("On Mon, Sep 1, 2025 at 9:41 AM Dana Cole
  // <dana@x.com> wrote:"), so a narrow bound here matches nothing real and every
  // reply re-scores the whole thread — meaning "Sounds good, thanks!" over a
  // quoted contract scored identically to the contract itself, and Flow offered
  // to log the same decision again on every message in the thread.
  //
  // Every pattern here is a *fallback* — content-gmail.js's own ownMessageText()
  // already cuts at Gmail's DOM-level quote wrapper (.gmail_quote) before this
  // ever runs, which is language-independent by construction. These regexes
  // exist for what that DOM cut can't see: a non-Gmail sender (Outlook, Apple
  // Mail, a plain-text forward), or any caller that only ever had flattened
  // text to begin with.
  const QUOTE_START = [
    /^\s*On\b[\s\S]{3,200}?\bwrote:\s*$/im,
    // Gmail's Hebrew quote header always opens with "בתאריך" ("on the date")
    // — a line-initial word essentially unique to this header, never how a
    // genuine sentence starts — and always closes a short line with a colon
    // (either "...כתב/ה/ו:" or "...מאת X:", depending on Gmail's exact
    // phrasing at send time). Matching the open marker and the line-ending
    // colon, rather than one exact closing phrase, means this doesn't depend
    // on getting that closing wording exactly right. No \b after בתאריך —
    // same reason every other Hebrew pattern in this file omits it: \b is
    // defined against [A-Za-z0-9_], so it never fires around Hebrew letters
    // and would silently turn this into a pattern that never matches.
    /^\s*בתאריך[\s\S]{3,200}?:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
    // Hebrew forward banner ("---------- הודעה שהועברה ---------"). The same cut
    // the Graph reader uses, so a forwarded ask is not judged as the new message.
    /^\s*-{2,}\s*הודעה שהועברה.*$/im,
    /^\s*From:\s.*$\n^\s*Sent:\s/im,
    // Outlook's Hebrew locale equivalent of the From:/Sent: header block
    // above — same no-\b rule applies to both מאת and נשלח.
    /^\s*מאת:\s.*$\n^\s*נשלח:\s/im,
    /^\s*>{1,}\s?\S/m
  ];

  // Smart/curly quotes and apostrophes — auto-inserted by iOS/macOS Mail,
  // Word, and plenty of other clients whenever someone types a straight one
  // — are a different Unicode character from the plain ' every "we're"/
  // "you'll"/"doesn't" pattern in this file and intent.js is written
  // against. "we're good" and "we’re good" read identically to a person but
  // not to a regex: the curly version silently failed to match at all,
  // which is a real-world recall gap, not a rare edge case, given how
  // common autocorrected quotes are in genuine email. Normalizing once
  // here — the one function every text path already calls first — fixes
  // it everywhere at once, instead of a `['’]` character class that would
  // be easy to forget adding to the next new pattern.
  function normalizeQuotes(text) {
    return text
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"');
  }

  // Returns only the part of the message the sender actually just wrote. Falls
  // back to the whole text when no quote boundary is found, and ignores a
  // boundary so early that stripping would leave nothing to judge.
  function newContent(text) {
    text = normalizeQuotes(text);
    let cut = text.length;
    for (const re of QUOTE_START) {
      const m = re.exec(text);
      if (m && m.index < cut) cut = m.index;
    }
    // Deliberately returns the head even when it is very short or empty. A reply
    // that only says "Sounds good, thanks!" has decided nothing; falling back to
    // the quoted history there is what made Flow re-offer to log the same
    // agreement on every message in a thread. Short content is handled by the
    // 'too-short' penalty, and an empty head simply scores nothing.
    return text.slice(0, cut).trim();
  }

  // Every signal is {id, weight, why}. `why` is user-facing text — it shows up in
  // the popup, so it has to read like a sentence someone would say out loud.
  // --- Does the sentence ASSERT its trigger, or deny it? -------------------
  //
  // Every trigger below used to be tested against the whole message with a
  // bare .test(text), which asks only "does this word appear anywhere" — a
  // question that cannot tell agreement from refusal. Measured, before this:
  //
  //   "We approve the $40,000 and will sign Monday."        -> Log $40,000 agreed
  //   "We do NOT approve the $40,000 and will not sign."    -> Log $40,000 agreed
  //   "We cannot approve the $40,000 at this time."         -> Log $40,000 agreed
  //   "We might approve the $40,000 next quarter."          -> Log $40,000 agreed
  //   "Would you approve the $40,000 and sign Monday?"      -> Log $40,000 agreed
  //
  // All five scored 59. The engine was writing the exact opposite of what the
  // sender wrote into the user's calendar, with full confidence — an inverted
  // fact, which is strictly worse than a missed one and the single thing this
  // product cannot survive doing twice.
  //
  // So: find the trigger's OWN sentence and ask whether that sentence asserts
  // it. Per-sentence matters — "We approved the budget. We won't make Tuesday."
  // is still an approval, and a message-wide negation check would lose it.
  const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;

  // Negation has to sit just BEFORE the trigger to count. A sentence that
  // merely contains "no" somewhere ("Approved, no changes needed") is not a
  // denial, and treating it as one would trade a wrong answer for a silent one
  // far too often.
  const NEG_BEFORE = /\b(?:not|never|cannot|can'?t|won'?t|wouldn'?t|shan'?t|don'?t|doesn'?t|didn'?t|isn'?t|aren'?t|no longer|unable to|declin\w*|refus\w*|reject\w*|denied|without)\b[^.!?;]{0,28}$/i;
  // (?:^|\s) in front of the short two-letter forms (לא, אין) matters: JS
  // regex has no \b for Hebrew (\b is defined over the ASCII \w class, which
  // Hebrew letters aren't part of), so a bare לא or אין with no boundary of
  // its own matches as a substring of any longer, unrelated word that
  // happens to end the same way — most commonly מלא ("full") ending in לא,
  // or מאין ("whence") ending in אין. Without this guard, "התקציב מלא סוכם"
  // ("the budget [that's] full [was] agreed") read מלא's own לא as a
  // negation sitting right before סוכם, and inverted a plain agreement into
  // signals.js's 'negated' penalty — the same class of bug as HEDGE_HE
  // below, found together while tracing why a real confirmed-and-dated
  // email scored a negative total instead of clearing the threshold.
  const NEG_BEFORE_HE = /(?:^|\s)(?:לא|אין|בלי|נמנע|לא ניתן|לא נוכל)\s*(?:\S+\s+){0,3}$/;

  // Conditionals and modals make a commitment contingent rather than made.
  // "would" is knowingly included: it costs the occasional real signal from
  // "we would like to confirm", and that costs silence, which is the side of
  // the trade this file always takes.
  const HEDGE = /\b(?:if|unless|assuming|suppose|supposing|provided that|subject to|pending|in case|once we|before we|might|may|could|would|perhaps|possibly|tentative(?:ly)?|proposed|hypothetical(?:ly)?)\b/i;
  // (?:^|\s) before אם\s for the same reason as NEG_BEFORE_HE above: bare אם
  // ("if") with no boundary matched as a substring of בהתאם ("accordingly" /
  // "pursuant to") — an extremely common, entirely non-conditional word in
  // formal Hebrew correspondence ("...בהתאם למסמך המצורף" = "...in
  // accordance with the attached document") — which silently discarded a
  // real, plainly-stated commitment as "hedged" on every message that used
  // it. The other alternatives here are 4+ letters and weren't observed to
  // have the same false-positive risk, so only this one needed the guard.
  const HEDGE_HE = /(?:(?:^|\s)אם\s|אולי|ייתכן|בכפוף ל|בהנחה ש|במידה ו)/;

  // True when a negation sits in the window immediately before a match.
  // Exported so intent.js's meeting gate can reuse this exact window
  // instead of growing a second copy that drifts. Questions and hedges
  // are deliberately not this function's job: "Can we do a call Monday?"
  // is a real invite, and assertedIn() is what refuses those for
  // commitments.
  function isNegatedBefore(before) {
    return NEG_BEFORE.test(before || '') || NEG_BEFORE_HE.test(before || '');
  }

  function assertedIn(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      const m = s.match(pattern);
      if (!m) continue;
      // A question asks for a decision; it does not record one. "האם"
      // is the Hebrew question particle and often arrives without "?".
      if (/\?\s*$/.test(s.trim())) continue;
      if (/(?:^|\s)האם\s/.test(s)) continue;
      if (HEDGE.test(s) || HEDGE_HE.test(s)) continue;
      const before = s.slice(0, m.index);
      if (isNegatedBefore(before)) continue;
      return true; // at least one sentence states it plainly
    }
    return false;
  }
  // Same per-sentence negation/hedge test as assertedIn, except a question
  // still counts. Follow-up asks are questions as often as they are
  // imperatives ("please follow up with Dana about the invoice?"); the
  // commitment scorer is right to ignore questions, and an ask scorer is
  // wrong to. Hedge and negation only count when they sit BEFORE the
  // phrase, so "please follow up on the invoice if you have the latest
  // copy" stays an ask — the condition trails it, it doesn't withdraw it.
  function directedAsk(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      const m = s.match(pattern);
      if (!m) continue;
      const before = s.slice(0, m.index);
      if (HEDGE.test(before) || HEDGE_HE.test(before)) continue;
      if (isNegatedBefore(before)) continue;
      return true;
    }
    return false;
  }
  const anyOf = (text, pats, fn) => pats.some((p) => fn(text, p));
  const testsIn = (text, p) => p.test(text);

  // Bare confirm / agree / accept / approve. Real closes still use these
  // words ("I confirm", "we agree", "the proposal is accepted", "Approved").
  // A reader-directed request uses the same words and is not a close
  // ("can you agree", "please confirm", "do you accept", "אתה מסכים").
  // The optional " to" / " on" in COMMIT is part of the match ("agree to"),
  // so the head word is what decides bare vs phrase. "we're good at" does
  // not start with one of these verbs.
  const BARE_DECISION_WORD = /^(?:confirm(?:ed|ing)?|agree[ds]?|accept(?:ed|s)?|approv(?:e|ed))(?:\s|$)/i;
  const BARE_DECISION_HE = /^(?:מאשר(?:ת|ים)?|מסכימה|מסכימים|מסכים|מאושר)/;
  // Rightmost request cue before a decision word. "האם" is a question
  // particle and withdraws every decision after it, the way "?" already
  // does. The others withdraw only the bare verbs above, so "countersigned"
  // and "we're good" in the same note still count.
  const READER_CUE_RES = [
    { re: /\b(?:(?:can|could|would|will) you|please|kindly|do you|(?:asking|requesting) you to|need you to)\b/gi, kind: 'ask' },
    { re: /\byou\s+(?=agree[ds]?|accept(?:ed|s)?|confirm)/gi, kind: 'ask' },
    { re: /בבקשה|אנא|(?:^|\s)נא(?=\s)/g, kind: 'ask' },
    { re: /(?:^|\s)האם(?=\s)/g, kind: 'whether' },
    { re: /(?:^|\s)אתה(?=\s)|(?:^|\s)אתם(?=\s)|(?:^|\s)אתן(?=\s)|(?:^|\s)את(?=\s+מ(?:אשר|סכימ))/g, kind: 'ask' }
  ];

  function isBareDecision(word) {
    return BARE_DECISION_WORD.test(word) || BARE_DECISION_HE.test(word);
  }

  function cuesBefore(sentence, index) {
    const cues = [];
    for (const spec of READER_CUE_RES) {
      const re = new RegExp(spec.re.source, spec.re.flags);
      let found;
      while ((found = re.exec(sentence))) {
        if (!found[0]) { re.lastIndex += 1; continue; }
        if (found.index < index) cues.push({ index: found.index, text: found[0], kind: spec.kind });
      }
    }
    cues.sort((a, b) => a.index - b.index);
    return cues;
  }

  // True when this match is the reader being asked to decide, not the
  // sender deciding. "We agree, please send the contract" keeps "agree":
  // the request cue sits after it. "Please confirm we are agreed" drops
  // both verbs: "please" leads, and "confirm" sits between it and "agreed",
  // so the "we" there is the content of the ask.
  function decisionSuppressed(sentence, m) {
    const cues = cuesBefore(sentence, m.index);
    if (!cues.length) return false;
    if (cues.some((c) => c.kind === 'whether')) return true;
    if (!isBareDecision(m[0])) return false;
    const cue = cues[cues.length - 1];
    const between = sentence.slice(cue.index + cue.text.length, m.index);
    const before = sentence.slice(0, m.index);
    const speaker = /\b(?:we(?:'re|\s+are|\s+have)?|i(?:'m|\s+am|\s+have)?)\s+$/i.test(before)
      || /(?:^|\s)(?:אני|אנחנו)\s+$/.test(before);
    const requestVerbBetween = /\b(?:confirm(?:ed|ing)?|agree[ds]?|accept(?:ed|s)?|approv(?:e|ed)|please|kindly)\b/i.test(between)
      || /(?:בבקשה|אנא|האם|מאשר|מסכימ)/.test(between);
    if (speaker && !requestVerbBetween) return false;
    return true;
  }

  // "nothing is confirmed yet" names the decision in order to say it has
  // not been made. "not" already covers "do NOT approve"; "nothing" does
  // not contain a free-standing "not", so it never reached that window.
  function bareWithdrawn(sentence, m) {
    if (!isBareDecision(m[0])) return false;
    const before = sentence.slice(Math.max(0, m.index - 48), m.index);
    const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (/\b(?:nothing|nobody|no one|not yet|yet to be)\b/i.test(before)) return true;
    if (/^\s*(?:yet|nothing)\b/i.test(after)) return true;
    return false;
  }

  function eachMatch(sentence, pattern, visit) {
    const re = new RegExp(pattern.source, pattern.flags.indexOf('g') === -1 ? pattern.flags + 'g' : pattern.flags);
    let found;
    while ((found = re.exec(sentence))) {
      if (!found[0]) { re.lastIndex += 1; continue; }
      if (visit(found)) return true;
    }
    return false;
  }

  // Same per-sentence hedge / negation / question test as assertedIn, plus
  // the reader-ask bar above. Used only for commitment patterns. Executed
  // and obligation stay on assertedIn: "please confirm the invoice is
  // payable" is still an obligation.
  function assertedCommit(text, pattern) {
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      if (/\?\s*$/.test(s.trim())) continue;
      if (HEDGE.test(s) || HEDGE_HE.test(s)) continue;
      const hit = eachMatch(s, pattern, (found) => {
        if (isNegatedBefore(s.slice(0, found.index))) return false;
        if (bareWithdrawn(s, found)) return false;
        if (decisionSuppressed(s, found)) return false;
        return true;
      });
      if (hit) return true;
    }
    return false;
  }

  const COMMIT_MENTION_PATS = [COMMIT, COMMIT_HE, COMMIT_STRONG, COMMIT_STRONG_HE];

  // Every commitment word in the note is a reader being asked to decide.
  // "We do NOT approve" is not this — the word is a refusal, and the
  // negated penalty below is what keeps the figure from reading as a close.
  function commitMentionsAreReaderAsks(text) {
    let saw = false;
    for (const s of String(text || '').split(SENTENCE_SPLIT)) {
      for (const pattern of COMMIT_MENTION_PATS) {
        const open = eachMatch(s, pattern, (found) => {
          saw = true;
          return !decisionSuppressed(s, found);
        });
        if (open) return false;
      }
    }
    return saw;
  }

  function score(text, domain, facts) {
    const signals = [];
    const add = (id, weight, why) => signals.push({ id, weight, why });

    // These four are not just point penalties. intent.js's hard gates do
    // not consult the total, so a cold bump that names an invoice, a
    // "circling back, you agreed…", and a calendar acceptance used to chip
    // at a negative score. `noise` is that same decision, visible to the
    // gates.
    //
    // Narrower than the penalties just above — see PITCH_VETO / MARKETING_VETO.
    const automated = !!facts.automated;
    const marketing = MARKETING.test(text);
    const solicitation = SOLICITATION.test(text);
    const calendarNoise = CALENDAR_NOISE.test(text);
    // A parking-permit ask is the work, even when a mailing footer is on the
    // same message. A newsletter with no such ask stays noise.
    const heard = [facts && facts.subject, text].filter(Boolean).join('\n');
    const parkingAsk = /\bparking permits?\b/i.test(heard) && /\b(?:please|can you|could you|would you|send|need|renew|attach|forward)\b/i.test(heard);
    const footerMark = /\bunsubscribe\b|\bview (this )?in browser\b|\bmanage (your )?preferences\b/i.test(text);
    const automatedNoise = automated && !(parkingAsk && footerMark);
    const marketingNoise = MARKETING_VETO.test(text) && !parkingAsk;
    const noise = automatedNoise || calendarNoise || PITCH_VETO.test(text) || marketingNoise;
    if (automated) add('automated', -60, 'The sender looks automated');
    if (marketing) add('marketing', -45, 'Reads like a mailing list, not a person');
    if (solicitation) add('solicitation', -55, 'Reads like a cold pitch, not your work');
    if (calendarNoise) add('calendar', -35, 'Calendar notification boilerplate');

    // A commitment counts only where a sentence actually states it. Bare
    // confirm/agree/accept in a reader-directed ask do not — assertedCommit
    // drops those and keeps "we agree" / "I confirm" / "Approved". The
    // "mentioned" forms are kept alongside so the difference between the two
    // can be scored: a message that talks about approving without approving is
    // not neutral evidence, it is evidence AGAINST acting.
    const STRONG_PATS = [COMMIT_STRONG, COMMIT_STRONG_HE];
    const COMMIT_PATS = [COMMIT, COMMIT_HE].concat(STRONG_PATS);
    const EXEC_PATS = [EXECUTED, EXECUTED_HE];
    const OBLIG_PATS = [OBLIGATION, OBLIGATION_HE];

    const commitStrong = anyOf(text, STRONG_PATS, assertedCommit);
    const commit = commitStrong || anyOf(text, COMMIT_PATS, assertedCommit);
    // A length penalty is for a fragment that has not said what happened
    // ("Thanks!", an empty reply). "Approved. Go ahead." and "מאושר. אפשר
    // להתקדם." are short because the decision is the whole note — the flat
    // <12 cutoff was silencing them. Weaker commitments stay under it.
    if (facts.wordCount < 12 && !commitStrong) add('too-short', -25, 'Too little text to judge');
    const commitMentioned = anyOf(text, COMMIT_PATS, testsIn);
    const executed = anyOf(text, EXEC_PATS, assertedIn);
    const executedMentioned = anyOf(text, EXEC_PATS, testsIn);
    // LOST is deliberately NOT routed through assertedIn: its own patterns
    // embed the negation ("not moving forward", "no longer interested"), so
    // asking whether the sentence negates them inverts the very signal.
    const lost = LOST.test(text) || LOST_HE.test(text);
    const obligation = anyOf(text, OBLIG_PATS, assertedIn);
    const followUpAsk = anyOf(text, [FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE], directedAsk);
    const handoff = HANDOFF.test(text) || HANDOFF_HE.test(text) || followUpAsk;
    const dispute = DISPUTE.test(text) || DISPUTE_HE.test(text);
    const senderPromise = anyOf(text, [SENDER_PROMISE, SENDER_PROMISE_HE], assertedIn);

    if (facts.money) add('money', 34, 'States a figure: ' + facts.moneyText);
    if (commitStrong) add('commitment', STRONG_WEIGHT, 'Someone authorised something outright');
    else if (commit) add('commitment', 30, 'Someone committed to something');
    // Weighted to clear threshold alongside a domain match on its own — a lost
    // deal is exactly the kind of news worth logging without needing a second,
    // unrelated signal (a date or a dollar figure) to happen to also be present.
    if (lost) add('lost', 46, 'States the work is not going ahead');
    if (executed) add('executed', 26, 'Says an agreement was executed');
    if (dispute) add('dispute', 28, 'Raises a discrepancy');
    if (facts.date && obligation) add('deadline', 26, 'Sets a dated obligation: ' + facts.date.raw);
    else if (facts.date) add('date', 12, 'Names a date: ' + facts.date.raw);
    if (handoff) add('handoff', 18, 'Asks you to do something specific');
    const onDomain = domain.entityWords.test(text);
    if (onDomain) add('domain', 14, 'About ' + domain.entity.toLowerCase());
    if (facts.isReply) add('reply', 8, 'Part of an ongoing thread');
    // COMMIT_STRONG is 42, eight under the bar, so "Approved. Go ahead."
    // only cleared when a reply bonus happened to be present. The chip
    // path does not set that bonus. A plain authorisation has to clear
    // on its own — that is why this list is weighted above a normal commit.
    if (commitStrong && !signals.some((s) => s.weight > 0 && s.id !== 'commitment')) {
      add('bare-strong', BASE_THRESHOLD - STRONG_WEIGHT, 'States the authorisation on its own');
    }

    // A message with a number and nothing else decided is a quote, not a decision.
    // Requiring a second signal alongside money is what keeps price lists quiet.
    const positives = signals.filter((s) => s.weight > 0);
    if (positives.length === 1 && positives[0].id === 'money') add('unsupported', -20, 'A figure alone, with nothing decided');

    // Withholding the commitment points is not enough on its own. "We do NOT
    // approve the $40,000" still carries a figure, a domain match and a reply
    // bonus — 56 against a threshold of 50 — so it would clear the bar anyway
    // and be labelled from the money alone, which reads "Log $40,000 agreed".
    // A denied or merely-contemplated commitment has to push the other way.
    if (!commit && commitMentioned) {
      // "please confirm" next to a real dispute, a signed agreement, or a
      // due invoice is the ask, not a denied decision. The other signal
      // stands. A confirm/agree request with only a figure and a date does
      // not: money + handoff + domain clears 50 and the label reads
      // "Log $3,900 confirmed".
      const readerAsk = commitMentionsAreReaderAsks(text);
      const standsBeside = readerAsk && (lost || executed || dispute || obligation);
      if (!standsBeside && readerAsk) add('unsettled', -55, 'Asks you to confirm or agree, which is not a decision');
      else if (!standsBeside) add('negated', -34, 'Names a decision the sentence does not actually make');
    } else if (!executed && executedMentioned) add('negated', -34, 'Names an agreement the sentence does not actually execute');

    const total = signals.reduce((sum, s) => sum + s.weight, 0);
    return { total, signals, flags: { commit, lost, executed, obligation, handoff, dispute, onDomain, senderPromise, noise } };
  }

  // The threshold is the only thing that learns. Clicking says "more like that",
  // dismissing says "less" — and neither ever asks the user to configure a number.
  //
  // Dismissals decay with elapsed time, and that is load-bearing rather than a
  // nicety. Dismissals used to decay only when the user clicked a chip, which
  // made silence an absorbing state: a few dismissals pushed the threshold above
  // what any real email could score, no chip could then appear, so no click could
  // happen, so the threshold never came back down. Flow went quiet permanently
  // and — because silence is its normal state — the user could not tell the
  // difference between a calm inbox and a dead extension. Time-based decay means
  // a quiet week always walks the threshold back toward baseline on its own.
  const DISMISSAL_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

  function thresholdFrom(calibration, now) {
    const c = calibration || {};
    const elapsed = Math.max(0, (now || Date.now()) - (c.ts || 0));
    const decay = c.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    // BOTH sides age. Decaying only dismissals here left clicks permanent, so
    // the paragraph above ("a quiet week always walks the threshold back toward
    // baseline") held in exactly one direction. Six clicks — which storage.js
    // caps and an engaged user reaches in a week — pinned the threshold to
    // MIN_THRESHOLD and kept it there: still 38 after a year of silence,
    // measured. Someone who used Flow heavily and then took a month off came
    // back to the most eager version of it that exists, which is the opposite
    // of what this product promises, and no amount of dismissing could undo it
    // because dismissals faded while the clicks holding the floor down did not.
    const clicks = (c.clicks || 0) * decay;
    const dismissals = (c.dismissals || 0) * decay;
    const t = BASE_THRESHOLD - clicks * 4 + dismissals * 6;
    return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, t));
  }

  // The account-wide threshold above answers "should Flow be louder or
  // quieter overall." This answers the narrower question the precision/harm
  // audit asked for: within that account, is THIS classified intent type one
  // it keeps rejecting (or, worse, undoing after Flow already acted on it)?
  // A bounded correction on top of the account-wide threshold, never a
  // replacement for it — deliberately smaller than thresholdFrom's own
  // swing (22 points either side of BASE_THRESHOLD) so a single type never
  // dominates the account's overall calibration, and clamped through the
  // same MIN/MAX floor and ceiling so this can never push a message's bar
  // outside the range any threshold is allowed to sit in.
  const TYPE_ADJUST_CAP = 10;

  // `typeCalibration` is one entry of storage.js's calibrationByType map —
  // { clicks, dismissals, ts } for one FlowIntent type, or undefined for a
  // type with no history yet. No entry means no adjustment: a brand-new
  // install, or any caller (the marketing site's live demo, in particular)
  // that never passes calibrationByType at all, gets exactly the
  // account-wide threshold back, unchanged.
  function applyTypeAdjustment(baseThreshold, typeCalibration, now) {
    if (!typeCalibration) return baseThreshold;
    const elapsed = Math.max(0, (now || Date.now()) - (typeCalibration.ts || 0));
    const decay = typeCalibration.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    const clicks = (typeCalibration.clicks || 0) * decay;
    const dismissals = (typeCalibration.dismissals || 0) * decay;
    const delta = Math.max(-TYPE_ADJUST_CAP, Math.min(TYPE_ADJUST_CAP, dismissals * 3 - clicks * 2));
    return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, baseThreshold + delta));
  }

  // ISO is right for a database field and wrong for a button someone reads in
  // half a second.
  function humanDate(d) {
    if (!d) return null;
    if (!d.iso) return d.raw;
    var parts = d.iso.split('-');
    var dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var sameYear = dt.getFullYear() === new Date().getFullYear();
    return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ' ' + dt.getFullYear());
  }

  // When the message is not about this line of work, the domain's phrasing does
  // not apply to it. Calling domain.title() regardless is how an office lease
  // became "Log offer $3,900, starts Sep 7" under the recruiting profile — a
  // fabricated fact written into the customer's CRM with full confidence, which
  // is a worse failure than staying quiet.
  function neutralTitle(facts) {
    if (facts.lost) return 'Log that this is not going ahead';
    if (facts.executed) return 'Log agreement executed';
    if (facts.dispute) return 'Log discrepancy raised';
    if (facts.moneyText && facts.dateText) return 'Log ' + facts.moneyText + ', ' + facts.dateText;
    if (facts.moneyText) return 'Log ' + facts.moneyText + ' agreed';
    if (facts.dateText) return 'Log commitment for ' + facts.dateText;
    return 'Log this decision';
  }

  // Builds the same `facts` shape evaluate() computes internally — without
  // running the result through scoring or the chip's own threshold. Feature
  // 4's Next-Step orchestrator needs "what does this message state" even for
  // a message that never cleared the chip's threshold: a user who explicitly
  // clicked "Do It: Log & Generate Next Step Document" on their own open
  // email isn't asking the judgment engine for permission first, the way the
  // passive chip does. Reuses the exact same private regexes and helpers
  // evaluate() itself uses, so the two never compute a different answer for
  // the same text.
  function factsOnly(text, ctx) {
    ctx = ctx || {};
    text = newContent(text);
    const raw = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
    const facts = {
      money: raw.money,
      moneyText: raw.moneyText,
      date: raw.date,
      dateText: humanDate(raw.date),
      automated: raw.automated,
      wordCount: raw.wordCount,
      isReply: /^re:/i.test(ctx.subject || ''),
      lost: LOST.test(text) || LOST_HE.test(text),
      executed: EXECUTED.test(text) || EXECUTED_HE.test(text),
      dispute: DISPUTE.test(text) || DISPUTE_HE.test(text)
    };
    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT_STRONG, COMMIT_STRONG_HE, COMMIT, COMMIT_HE, LOST, LOST_HE, EXECUTED, EXECUTED_HE, DISPUTE, DISPUTE_HE, OBLIGATION, OBLIGATION_HE, HANDOFF, HANDOFF_HE]);
    return facts;
  }

  function evaluate(text, domainId, ctx) {
    ctx = ctx || {};
    const domain = FLOW_DOMAINS.find((d) => d.id === domainId) || FLOW_DOMAINS[0];
    // Judge what the sender just wrote, not the thread they wrote it on top of.
    text = newContent(text);
    const raw = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });

    const facts = {
      money: raw.money,
      moneyText: raw.moneyText,
      date: raw.date,
      dateText: humanDate(raw.date),
      automated: raw.automated,
      wordCount: raw.wordCount,
      isReply: /^re:/i.test(ctx.subject || '')
    };

    const s = score(text, domain, facts);
    facts.lost = s.flags.lost;
    facts.executed = s.flags.executed;
    facts.dispute = s.flags.dispute;

    const threshold = thresholdFrom(ctx.calibration, ctx.now);
    if (s.total < threshold) return null;

    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT_STRONG, COMMIT_STRONG_HE, COMMIT, COMMIT_HE, LOST, LOST_HE, EXECUTED, EXECUTED_HE, DISPUTE, DISPUTE_HE, OBLIGATION, OBLIGATION_HE, HANDOFF, HANDOFF_HE]);

    return {
      score: s.total,
      threshold,
      label: s.flags.onDomain ? domain.title(facts) : neutralTitle(facts),
      domain: domain.id,
      facts,
      signals: s.signals.filter((x) => x.weight !== 0)
    };
  }

  // Hard-gated types (SCHEDULED_EVENT, COMMITMENT_OF_READER, REQUEST in
  // intent.js) have no threshold for applyTypeAdjustment above to nudge —
  // they fire on a deterministic evidence gate, not a score compared to a
  // moving bar. But an account can still teach Glance to stop surfacing a
  // TYPE it keeps rejecting, the same way it teaches the two score-based
  // types: this is that lesson's outlet for the three that have none.
  // Deliberately NOT a blend into the evidence gate itself (that stays a
  // pure boolean, exactly as documented at each gate's own call site) — it's
  // a separate, later question: "the evidence is real, does this account
  // still want to see it."
  //
  // SUPPRESS_MARGIN is set high (5 of bumpCalibration's own 6-per-counter
  // cap) on purpose. One or two dismissals of a genuine REQUEST/EVENT/
  // COMMITMENT are completely normal noise (already handling it elsewhere,
  // wasn't in the mood, misclicked) and must never silence a hard-gated
  // type on that alone — silencing a message with real, unambiguous
  // evidence is a worse failure than one extra chip, the same precision-
  // over-recall bias every hard gate in intent.js is built on. This only
  // fires after sustained, close-to-unanimous rejection of that exact type,
  // and — through the same decay every other calibration number here uses —
  // self-heals within roughly a week of no further dismissals. Silence must
  // never become a one-way door; that's thresholdFrom's own rule above,
  // applied here too.
  const SUPPRESS_MARGIN = 5;

  // `typeCalibration` is the same calibrationByType[type] bucket
  // applyTypeAdjustment reads — { clicks, dismissals, ts } — already
  // populated for every FlowIntent type by storage.js's calibrate(), hard-
  // gated types included (content-gmail.js calls
  // FlowStorage.calibrate('dismiss'|'click', ctx.intent.type) for every
  // intent type, not just the two score-based ones). No entry, same as
  // applyTypeAdjustment, means no suppression: a brand-new install or a
  // caller with no calibration history behaves exactly as before.
  function isTypeSuppressed(typeCalibration, now) {
    if (!typeCalibration) return false;
    const elapsed = Math.max(0, (now || Date.now()) - (typeCalibration.ts || 0));
    const decay = typeCalibration.ts ? Math.pow(0.5, elapsed / DISMISSAL_HALF_LIFE_MS) : 1;
    const clicks = (typeCalibration.clicks || 0) * decay;
    const dismissals = (typeCalibration.dismissals || 0) * decay;
    return (dismissals - clicks) >= SUPPRESS_MARGIN;
  }

  // score, newContent, and the HANDOFF pair are exposed for intent.js: the
  // classifier reuses this exact scorer and this exact "is this a request"
  // pattern (same signals, same weights, same tuning against
  // test/judgment-corpus.cjs) rather than re-deriving a second, potentially
  // drifting copy of the same judgment.
  return {
    evaluate, factsOnly, neutralTitle, thresholdFrom, applyTypeAdjustment, isTypeSuppressed, isNegatedBefore, score, newContent,
    HANDOFF, HANDOFF_HE, FOLLOW_UP_ASK, FOLLOW_UP_ASK_HE, SENDER_PROMISE, SENDER_PROMISE_HE,
    BASE_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowJudgment };
