// The decision layer: takes one email's text and classifies it into exactly
// one of five intent types, or into nothing at all.
//
// This sits between detection (extract.js's fact extraction, judgment.js's
// signal scoring) and execution (which this file never touches — no Calendar
// call, no Gmail draft, no Task gets created here). That separation is
// deliberate and load-bearing: the execution layer picks a destination based
// on the `type` this file returns, but has no idea how that type was decided,
// and this file has no idea what happens to its answer. Either side can
// change — a new intent type, a new execution destination, a whole new
// platform (Outlook, WhatsApp) reading the same classified Intent — without
// touching the other.
//
// Precision over recall, explicitly: three of the five types (SCHEDULED_EVENT,
// COMMITMENT_OF_READER, REQUEST) require a hard, deterministic evidence
// combination — not a score that happens to clear a bar. The other two reuse
// FlowJudgment's own proven scorer (the exact signals and threshold already
// tuned against test/judgment-corpus.cjs) as their gate, so "should Glance
// speak up at all" is never re-litigated here, only "which of these five
// things is it." When nothing clears its bar, classify() returns
// { type: null } — silence, same as the chip's own default state.
//
// The three hard-gated types have no threshold for a per-account history to
// nudge — that's the whole point of a hard gate — but an account can still
// teach Glance to stop surfacing a TYPE it keeps rejecting, via
// FlowJudgment.isTypeSuppressed (see each hard gate below): a separate,
// later question from "is the evidence real," answered from that type's own
// calibrationByType bucket, never by blurring the evidence gate itself into
// a score.

const FlowIntent = (() => {
  const TYPES = {
    REQUEST: 'request', // בקשה המופנית למשתמש
    COMMITMENT_OF_READER: 'commitment', // התחייבות שהמשתמש לקח על עצמו
    SCHEDULED_EVENT: 'event', // מועד סופי ברור / אירוע מתוזמן
    DECISION_TO_LOG: 'decision', // החלטה שיש לתעד
    FOLLOW_UP: 'followup' // פעולת המשך נדרשת
  };

  // A meeting-shaped noun — combined with a resolved date AND a resolved
  // time, this is what earns SCHEDULED_EVENT. Any one of the three alone is
  // not enough: "let's talk about the budget" (noun, no date/time) or
  // "the report is due at 3pm Friday" (date+time, no meeting noun — that's
  // a deadline, not an event) must not become a SCHEDULED_EVENT. A personal
  // commitment that names a clock time is a different close (calendar-hold
  // below): a hold on the calendar, not a meeting classification.
  //
  // The trailing negative lookahead is a real, pre-existing bug fix found
  // while broadening this list, not new behavior invented for the sake of
  // it: "Could you send me the call recording by Friday?" is a REQUEST for
  // a deliverable, but "call" + a resolved date ("by Friday") already
  // satisfied SCHEDULED_EVENT's gate with the ORIGINAL, unmodified word
  // list too — confirmed before this fix, on "call", "session", and
  // "interview" specifically. Broadening the list without fixing this
  // would only make a real, existing precision problem fire more often,
  // working directly against this widening's whole purpose. The lookahead
  // excludes the common "artifact OF a meeting" continuations (recording,
  // notes, transcript, minutes, summary, recap, feedback, materials,
  // slides, deck, agenda) so a meeting noun immediately followed by one of
  // these reads as "the [artifact] of X", not "let's have X" — narrow and
  // evidence-based, the same shape as EVENT_CALLED_OFF/EVENT_RECAP above
  // rather than a blanket reordering of which gate wins.
  // One event-noun list. The calendar gate, meetingPlanVeto, and
  // attach-to-invite all read EVENT_NOUN_ALT. "quick chat" is the same
  // noun as "chat", including when a non-breaking space splits the pair.
  // Longer phrases come first so "quick chat" is that noun, not a bare chat.
  const EVENT_NOUN_ALT = [
    'quick chat', 'strategy session', 'planning session', 'panel discussion',
    'town hall', 'office hours', 'one-on-one',
    'meeting', 'call', 'sync', 'check-?in', 'appointment', 'session',
    'interview', 'demo', 'walkthrough', 'consultation', 'stand-?up',
    'retro(?:spective)?', 'workshop', 'webinar', 'huddle', 'kick-?off',
    'deposition', 'hearing', 'mediation', 'chat'
  ].join('|');
  const MEETING_NOUN = new RegExp('\\b(?:' + EVENT_NOUN_ALT + ')\\b(?!\\s+(?:recording|notes|transcript|minutes|summary|recap|feedback|materials|slides|deck|agenda))', 'i');
  // Attach names the invite that already exists. invite and invitation
  // are that target, and they are not a new event to book.
  const ATTACH_TARGET = '(?:' + EVENT_NOUN_ALT + '|invite|invitation)';
  // פגישת is the construct (פגישת תכנון = a planning meeting). It is not
  // the absolute פגישה, so a note that only uses the construct used to
  // stay silent. The artifact lookahead still refuses "the recording of
  // the meeting" and the same continuations as the absolute noun.
  const MEETING_NOUN_HE = /(פגישת|פגישה|שיחה|ראיון|סנכרון|תיאום|ייעוץ|הדגמה|מפגש|ועידה|שיחת טלפון|פגישת עבודה|שיחת זום|שיחת וידאו|עמידה יומית|רטרו(?:ספקטיבה)?|סדנה|וובינר|תדרוך|כנס פתיחה|היכרות עם הצוות|שימוע|גישור|דיון בפאנל)(?!\s*(?:הקלטה|הקלטת|הערות|תמליל|פרוטוקול|סיכום|חומרים|מצגת|סדר יום))/;

  // An explicit ask to meet, narrower than HANDOFF. "Could you please
  // confirm you can make it" is a confirm ask on a meeting that is already
  // stated (schedule-confirm). "Can you schedule a call" / "could you meet
  // Friday at 3" is the meeting itself. "meet the deadline" is not a meeting.
  const EXPLICIT_MEETING_ASK = new RegExp([
    '\\b(?:can|could|would)\\s+(?:you|we)\\s+meet(?!\\s+(?:the\\s+)?(?:deadline|requirement|criteria|quota|target|obligation))\\b',
    '\\b(?:can|could|would)\\s+(?:you|we)\\s+(?:schedule|set up|book)\\b',
    '\\bplease\\s+(?:schedule|set up|book|put)\\b'
  ].join('|'), 'i');
  const EXPLICIT_MEETING_ASK_HE = /(?:בבקשה\s+תקבע(?:ו|י)?\s+פגישה|אפשר\s+לקבוע\s+פגישה|(?:^|[^\u0590-\u05FF])ת?שמור(?:י|ו)?\s+לי\s+את\s+הזמן)/;

  // "This is not happening at the time this message names."
  //
  // The SCHEDULED_EVENT gate below already refused a CANCELLED meeting, but it
  // did so via s.flags.lost — a lexicon about deals falling through, not about
  // meetings moving. So the three commonest ways a meeting stops happening at
  // its stated time all sailed through and produced a calendar entry at that
  // exact, now-wrong time:
  //
  //   "Let's postpone the call Friday, September 18 at 3pm"        -> event, Fri 15:00
  //   "Let's move the call Friday ... to the following week"       -> event, Fri 15:00
  //   "The call Friday ... is no longer needed"                    -> event, Fri 15:00
  //
  // A postponed meeting is not a lost deal, so it needed its own signal rather
  // than more words bolted onto LOST.
  //
  // Note what this deliberately gives up: "let's move the call to Friday at
  // 3pm" — where the named time is the NEW one — also stops producing an
  // event. Telling those two apart needs to know which of the times in the
  // sentence the cue refers to, which this engine cannot do reliably, and the
  // trade is the one the gate below already states in its own comment: a
  // missed chip costs one click, a calendar entry at a time the sender
  // explicitly moved away from costs a missed meeting.
  const EVENT_CALLED_OFF = new RegExp([
    'postpon(?:e|ed|ing)', 'reschedul(?:e|ed|ing)', 'call(?:ed|ing)? off',
    'no longer (?:needed|necessary|happening|required|going ahead|relevant)',
    "won'?t be going ahead", 'not going ahead',
    'push(?:ed|ing)? (?:back|out)',
    'mov(?:e|ed|ing)\\b[^.!?;]{0,60}?\\bto (?:next|another|the following|a later|sometime)',
    "skip(?:ping)? (?:this|next) week'?s?",
    '(?:take|drop) (?:it|this|that) (?:off|from) the calendar',
    "don'?t schedule",
    'do not schedule',
    'no loner needed'
  ].join('|'), 'i');
  const EVENT_CALLED_OFF_HE = /(נדח(?:ה|ית|תה)|לדחות|דוחים את|מבוטל|מבוטתל|בוטל|מבטלת|מבטל|לא מתקיים|לא יתקיים|נקבע מחדש|מבטלים את הפגישה|הפגישה לא תתקיים|יש לדחות את)/;

  // "This already happened — don't schedule it again."
  //
  // extract.js's own weekday resolver ("on Monday", "by Friday") always
  // resolves forward from `now` — deliberately, since a bare future weekday
  // reference has no other sane reading. But that same forward-only rule
  // misreads a PAST-tense recap the same way: "Thanks for the call on
  // Monday at 3pm — great meeting!" sent on a Thursday has a meeting noun,
  // a resolved date, and a resolved time, and the gate below would create a
  // brand-new Calendar entry for a meeting that already happened, on the
  // wrong (next) Monday. Same asymmetry the EVENT_CALLED_OFF comment above
  // already states for a different cause: a missed chip costs one click; a
  // phantom future meeting for something that's already over is actively
  // wrong, so recap language wins over an otherwise-complete gate.
  const EVENT_RECAP = new RegExp([
    'thanks? for (?:the |our )?(?:call|meeting|chat|time|interview)',
    'thank you for (?:the |our )?(?:call|meeting|chat|time|interview)',
    'great (?:meeting|call|chat|catting|talking to you|speaking with you)',
    'good (?:speaking|talking|chatting) with you',
    "it was (?:great|good|nice) (?:to (?:meet|speak|talk|chat)|meeting you|speaking with you|chatting)",
    'enjoyed (?:our|the) (?:call|meeting|chat|conversation)',
    'glad (?:we|to have) (?:synced|caught up|connected|spoke|talked)',
    // "The call was on Monday" resolves Monday forward. The meeting already
    // happened; "was on" is the tense cue EVENT_RECAP's thank-you list misses.
    '(?:the |our )?(?:call|meeting|sync|chat|demo|interview|check-?in|appointment) was on',
    'already had (?:the |our )?(?:call|meeting|sync|chat|demo|interview|check-?in)'
  ].join('|'), 'i');
  const EVENT_RECAP_HE = /(תודה על ה(?:שיחה|פגישה)|היה נעים (?:לדבר|להיפגש)|שמחתי שדיברנו|נהניתי מ(?:השיחה|הפגישה)|תודה שהתפניתם?|היה כיף לדבר|נעים היה להכיר|(?:שיחת|פגישת|הראיון|הפגישה|השיחה|הישיבה|ראיון).{0,40}(?:הייתה|היה|היו)|(?:הייתה|היה|היו) ביום)/;

  // The other half of the "don't schedule the past" fix above: EVENT_RECAP
  // only helps when the message uses recognizable past-tense phrasing.
  // extract.js's own explicit-year branch (parseDate's `explicitYear` path)
  // takes a sender-stated year completely literally, with no window check
  // (that check only applies to a bare month-and-day with NO year, where the
  // year has to be guessed) — correctly, since a year the sender actually
  // wrote is not a guess. But "correctly parsed" and "safe to calendar" are
  // different questions: "We had our sync on March 3, 2020 at 3pm, it was
  // productive" has a real meeting noun, a real date, a real time, and no
  // recap phrasing EVENT_RECAP recognizes — and still must not become a
  // Calendar entry for a day six years gone. Unlike phrasing, "is this ISO
  // date already before today" is a plain, unconditional fact — no lexicon
  // to keep growing, and no legitimate SCHEDULED_EVENT ever needs a past
  // date, so this check applies with no exceptions.
  function isPastDate(dateIso, now) {
    if (!dateIso) return false;
    const n = now || new Date();
    const todayIso = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    return dateIso < todayIso;
  }

  // A reader-directed commitment reminder — narrow by design. This is not
  // "someone agreed to something" (that's DECISION_TO_LOG, judgment.js's
  // COMMIT/COMMIT_STRONG) but specifically "you, the reader, agreed to
  // something, and this message is confirming or reminding you of it."
  // English and Hebrew business correspondence phrase this differently
  // enough that a shared pattern would either miss most real cases or catch
  // far too much, so — same as judgment.js's own signal pairs — these stay
  // separate regexes rather than one pattern trying to cover both.
  // Broadened the same "clearly reader-directed, not a single common word"
  // way HANDOFF/HANDOFF_HE were — this signal is also a bare .test() with
  // no per-sentence negation/hedge check, so each addition below was
  // re-verified against the full negative-test corpus before being kept.
  const READER_COMMIT = /\b(you (?:agreed|committed|promised|confirmed) to|you (?:said|mentioned|indicated) you(?:'d| would)|you told (?:us|me) you(?:'d| would)|you'?re supposed to|you were (?:going|supposed) to|as (?:you|per your|we) (?:agreed|committed|promised|discussed)|confirming you(?:'ll| will)|per your commitment|as (?:discussed|promised|previously agreed),? you(?:'ll| will)|per our conversation,? you(?:'ll| will)|reminding you (?:that )?you (?:agreed|committed|promised) to)\b/i;
  const READER_COMMIT_HE = /(כפי שהתחייבת|כמו שהתחייבת|כפי שסיכמת|כמו שסיכמת|את(?:ה)? התחייבת|כמו שאמרת ש|כפי שהבטחת|כמו שהבטחת|אתה אמור ל|את אמורה ל|היית אמור ל|היית אמורה ל|לפי הסיכום שלנו|בהתאם למה שסיכמנו|כפי שהיה מוסכם|כמו שהיה מוסכם)/;

  // The one sentence a human would point to as "this is the ask" — reused
  // as the `what` entity rather than synthesizing new wording, the same
  // "no fabricated fact" rule extract.js and judgment.js already hold to.
  function whatText(text, patterns) {
    return FlowExtract.decisiveSentence(text, patterns) || null;
  }

  function humanWhen(date, time) {
    if (!date && !time) return null;
    const parts = [];
    if (date) parts.push(date.iso ? humanDateFallback(date) : date.raw);
    if (time) parts.push(String(time.hour).padStart(2, '0') + ':' + String(time.minute).padStart(2, '0'));
    return parts.join(' ') || null;
  }

  // judgment.js's own humanDate() is private (not exported) — this is the
  // same "Mon D" / "Mon D, YYYY" shape, kept in sync by being this small.
  function humanDateFallback(date) {
    if (!date || !date.iso) return date ? date.raw : null;
    const parts = date.iso.split('-');
    const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sameYear = dt.getFullYear() === new Date().getFullYear();
    return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ' ' + dt.getFullYear());
  }

  // The same HANDOFF/HANDOFF_HE patterns FlowJudgment.score() already tested
  // to set flags.handoff — reused here only to pick which sentence is the
  // "what" for a REQUEST, not re-tested for detection. A second, narrower
  // copy of "what counts as a request" here previously meant the detected
  // request and the quoted sentence could disagree.
  const REQUEST_PATTERNS = [FlowJudgment.HANDOFF, FlowJudgment.HANDOFF_HE, FlowJudgment.FOLLOW_UP_ASK, FlowJudgment.FOLLOW_UP_ASK_HE];
  // The sentence a dated commitment is quoting — the sender's own delivery
  // promise, or the agreement word. Used only after REQUEST has already
  // declined the message, so this doesn't steal an explicit ask.
  const DATED_COMMIT_PATTERNS = [FlowJudgment.SENDER_PROMISE, FlowJudgment.SENDER_PROMISE_HE, /\b(agreed|approved|confirmed|confirming)\b/i, /(סוכם|אישרנו|מאשרים|מאשר|מאושר)/];

  // The other half of REQUEST's evidence bar, alongside hasConcreteAnchor
  // below — a named, tangible thing being asked for. "Could you send that
  // over?" with no object named is still too vague to act on sight unseen;
  // "could you send me the invoice" names exactly what closing this means,
  // which is real evidence on its own, independent of whether the message
  // also happens to carry a date or a dollar figure. Deliberately concrete
  // nouns only (documents, records, access, status) — no vague abstractions
  // like "help" or "thoughts" that would blur this back into "any polite
  // ask at all," which is the false-positive shape this whole gate exists
  // to keep out (see hasConcreteAnchor's own comment just below).
  //
  // This list is safe to broaden aggressively because it never gates on its
  // own — it's only ever tested against a sentence the handoff/commitment
  // phrase regex ALREADY matched (requestWhat/commitmentWhat below), never
  // the raw message. Widening it only widens which already-flagged
  // sentences also clear the object bar; it can never manufacture a
  // request or commitment by itself. Grouped by business category (not one
  // flat alternation) purely for maintainability — same array-join('|')
  // construction EVENT_CALLED_OFF/EVENT_RECAP above already use for a long
  // OR-list. Deliberately still excludes bare pronouns/abstractions ("that",
  // "this", "it", "help", "thoughts") — see judgment-corpus.cjs and this
  // file's own vague-request negative tests for why those must stay out.
  const REQUESTED_OBJECT_GROUPS_EN = [
    // Finance
    'receipts?', 'tax invoices?', 'invoices?', 'credit notes?', 'refunds?', 'reimbursements?',
    'expense reports?', 'purchase orders?', 'POs?', 'price lists?', 'quotes?', 'quotations?', 'statements?',
    'estimates?', 'budgets?', 'payments?', 'invoice numbers?', 'W-?9s?', 'W-?2s?', '1099s?',
    // Legal / contractual
    'contracts?', 'agreements?', 'NDAs?', 'non-disclosure agreements?', 'MSAs?', 'master service agreements?',
    'SOWs?', 'statements? of work', 'amendments?', 'addend(?:um|a)', 'waivers?', 'releases?',
    'licen[cs]es?', 'terms(?: and conditions)?', 'polic(?:y|ies)', 'redlines?', 'markups?',
    // Documents / files
    'documents?', 'files?', 'scans?', 'PDFs?', 'spreadsheets?', 'presentations?', 'decks?', 'slides?',
    'templates?', 'forms?', 'applications?', 'certificates?', 'transcripts?', 'diplomas?', 'cop(?:y|ies)',
    // Reports / updates
    'reports?', 'updates?', 'status(?: updates?)?', 'summar(?:y|ies)', 'recaps?', 'breakdowns?',
    'analys[ie]s', 'forecasts?', 'projections?', 'roadmaps?', 'timelines?', 'schedules?', 'itinerar(?:y|ies)',
    'agendas?', 'minutes', 'meeting notes', 'action items?',
    // Access / credentials
    'access', 'logins?', 'credentials?', 'passwords?', 'API keys?', 'permissions?', 'invites?',
    'invitation links?', 'dashboard access',
    // Communication
    'confirmations?', 'approvals?', 'sign-?offs?', 'feedback', 'comments?', 'input', 'responses?',
    'repl(?:y|ies)', 'clarifications?', 'guidance', 'instructions?',
    // Deliverables
    'drafts?', 'deliverables?', 'proposals?', 'samples?', 'mockups?', 'prototypes?', 'wireframes?',
    'designs?', 'artwork', 'specs?', 'specifications?', 'requirements?',
    // Scheduling
    'availability', 'calendars?', 'time slots?',
    // HR
    'r[ée]sum[ée]s?', 'CVs?', 'cover letters?', 'references?', 'offer letters?', 'employment contracts?',
    'onboarding paperwork', 'background checks?',
    // Kept from the original list
    'links?', 'attach(?:ments?|ed)', 'signatures?', 'information', 'details', 'data', 'figures?'
  ];
  const REQUESTED_OBJECT = new RegExp('\\b(' + REQUESTED_OBJECT_GROUPS_EN.join('|') + ')\\b', 'i');

  // Logistics nouns (a date, an address, an amount) are weaker evidence than
  // a document: they count only as the object of a request addressed to the
  // reader, never in a sender's own promise and never under a pay or call
  // verb, where the verb already decides what the sentence is.
  const REQUESTED_LOGISTICS_EN = new RegExp('\\b(' + [
    'delivery(?: dates?| times?| address(?:es)?| windows?| details)?', '(?:shipping|ship|due|arrival|pick-?up) dates?',
    'dates?', 'addresses', 'amounts?', 'totals?', 'deadlines?'
  ].join('|') + ')\\b', 'i');
  const REQUESTED_LOGISTICS_HE = /(פרטי(?: ה(?:משלוח|אספקה))?|מועד(?: ה(?:משלוח|אספקה))?|תאריך(?: משלוח| אספקה)?|כתובת|סכום|סכומים|משלוח|אספקה)/;
  const SENDER_PROMISE = /\b(?:we(?:'|’)ll|we will|i(?:'|’)ll|i will|we(?:'|’)re going to|i(?:'|’)m going to|we can|i can|let me|we(?:'|’)ve|i(?:'|’)ve)\b|(?:^|[^\u0590-\u05FF])(?:נשלח|אשלח|נעביר|אעביר|נחזיר|אחזיר|נמסור|אמסור|נדאג|אדאג|נעדכן|אעדכן)(?![\u0590-\u05FF])/i;
  const REQUEST_ADDRESSEE = /\b(?:please|kindly|pls|(?:could|can|would|will)\s+you)\b|\?|(?:^|[^\u0590-\u05FF])(?:אנא|נא|תוכל|תוכלי|תוכלו|אפשר|ניתן)(?![\u0590-\u05FF])/i;
  const SUBJECT_LIKE_START = /^(?:we|i|they|he|she|it|the|our|my|this|that|there|these|those|his|her|their)\b/i;
  const PAY_OR_CALL_VERB = /\b(?:pay|wire|remit|settle|call|phone|dial|ring)\b|(?:^|[^\u0590-\u05FF])[הוכלמב]?(?:לשלם|שלם|תשלם|שלמו|להתקשר|התקשר|תתקשר|תתקשרי|טלפן)(?![\u0590-\u05FF])/i;
  function addressedRequest(sentence) {
    const t = String(sentence || '').trim();
    if (!t || SENDER_PROMISE.test(t)) return false;
    if (REQUEST_ADDRESSEE.test(t)) return true;
    return !SUBJECT_LIKE_START.test(t);
  }
  function logisticsCounts(sentence) {
    const t = String(sentence || '');
    return addressedRequest(t) && !PAY_OR_CALL_VERB.test(t);
  }
  function requestObjectTest(sentence) {
    if (!sentence) return false;
    if (REQUESTED_OBJECT.test(sentence) || REQUESTED_OBJECT_HE.test(sentence)) return true;
    return logisticsCounts(sentence) &&
      (REQUESTED_LOGISTICS_EN.test(sentence) || REQUESTED_LOGISTICS_HE.test(sentence));
  }
  function requestObjectExec(sentence) {
    if (!sentence) return null;
    const core = REQUESTED_OBJECT.exec(sentence) || REQUESTED_OBJECT_HE.exec(sentence);
    if (core) return core;
    if (!logisticsCounts(sentence)) return null;
    return REQUESTED_LOGISTICS_EN.exec(sentence) || REQUESTED_LOGISTICS_HE.exec(sentence);
  }

  // Hebrew twin of the same business-object breadth above. Same "no \b" rule
  // every other Hebrew pattern in this file follows — \b is ASCII-only and
  // never fires around Hebrew letters (see judgment.js's NEG_BEFORE_HE/
  // HEDGE_HE header comments for the substring-collision bug class this
  // avoids). Plain alternation, not grouped-array, since Hebrew business
  // vocabulary here doesn't share the same singular/plural suffix patterns
  // English does — each term is written out rather than suffix-generalized.
  // (?:ה)? between the two halves of a construct-state (smichut) compound —
  // קורות חיים, הזמנת רכש, מפת דרכים, סדר יום, מכתב הצעת עבודה, פעולות
  // נדרשות — matters because Hebrew definiteness on a smichut chain lands
  // on the LAST word, not the first ("קורות חיים" -> "קורות החיים", not
  // "הקורות חיים"), so the plain indefinite phrase alone silently failed
  // to match the far more natural definite form ("...שלח לי את קורות
  // החיים שלך"). Every other multi-word phrase below is already covered
  // independently by one of its own words appearing elsewhere in this same
  // list (e.g. "חשבונית מס" needs no fix because bare "חשבונית" already
  // matches regardless), so only the handful with no such fallback needed
  // this treatment.
  const REQUESTED_OBJECT_HE = /(קבלה|חשבונית מס|חשבונית|זיכוי|החזר כספי|החזר|הוצאות|דוח הוצאות|הזמנת (?:ה)?רכש|מחירון|הצעת (?:ה)?מחיר|תקציב|תשלום|חוזה|הסכם|הסכם סודיות|נספח|תיקון להסכם|ויתור|שחרור מהתחייבות|רישיון|תנאי שימוש|תנאים והגבלות|מדיניות|מסמך|קובץ|סריקה|מצגת|תבנית|טופס|בקשת הצטרפות|תעודה|תעודת (?:ה)?זהות|גיליון אלקטרוני|תמליל|דו["״]ח|דוח|עדכון|עדכון סטטוס|סטטוס|תקציר|סיכום|סיכום פגישה|ניתוח|תחזית|תחזית תקציבית|מפת (?:ה)?דרכים|לוח זמנים|סדר (?:ה)?יום|פרוטוקול|(?:ה)?פעולות (?:ה)?נדרשות|גישה|פרטי התחברות|סיסמה|מפתח API|הרשאה|הרשאות|הזמנה|קישור הזמנה|אישור|חתימה|משוב|הערות|תגובה|מענה|הבהרה|הנחיה|הוראות|טיוטה|תוצר|הצעה|דוגמה|מוקאפ|אבטיפוס|עיצוב|גרפיקה|מפרט|דרישות|זמינות|לוח שנה|חלון זמן|קורות (?:ה)?חיים|מכתב מקדים|המלצות|מכתב הצעת (?:ה)?עבודה|חוזה העסקה|קישור|פרטים|מידע|נתונים|נתונים מספריים)/;

  // A short English label for the write paths that still expect one (Google
  // Tasks title, Notion title, popup activity log) — kept alongside the full
  // quoted `entities.what` rather than replacing it, so nothing downstream
  // that read ctx.result.label before this change has to change.
  function shortLabel(type, facts, enrichedFacts, langHint) {
    const he = langHint === 'he';
    // extract.js's own `facts` never carries a human date string (only
    // judgment.js's private humanDate() computes one, for its own
    // evaluate()/factsOnly() callers) — humanDateFallback() is this file's
    // equivalent, already used by humanWhen() above.
    const dateText = facts.date ? humanDateFallback(facts.date) : null;
    if (type === TYPES.SCHEDULED_EVENT) {
      return 'Meeting' + (dateText ? ' ' + dateText : '') + (facts.timeText ? ' ' + facts.timeText : '');
    }
    if (type === TYPES.COMMITMENT_OF_READER) {
      return 'Your commitment' + (dateText ? ', due ' + dateText : '') + (facts.moneyText ? ', ' + facts.moneyText : '');
    }
    if (type === TYPES.REQUEST) {
      if (he) {
        return 'נדרשת תשובה' + (dateText ? ' עד ' + dateText : '') + (facts.moneyText ? ', ' + facts.moneyText : '');
      }
      return 'Reply requested' + (dateText ? ' by ' + dateText : '') + (facts.moneyText ? ', ' + facts.moneyText : '');
    }
    return FlowJudgment.neutralTitle(enrichedFacts); // DECISION_TO_LOG and FOLLOW_UP
  }

  // The sender said not to act. A dated agreement or a figure underneath
  // is context, not a close. Hard gates never read the score, so "FYI, we
  // agreed…" chipped at 17.
  // "No need to reply" cancels the draft. It does not cancel the work.
  // fyi / no action needed / no need to do anything / לידיעתך still quiet the whole mail.
  const INFO_FULL = /\b(?:fyi|for your information|no action (?:needed|required|necessary)|no need to do anything|informational only|for visibility only|for (?:your )?awareness|looping you(?: in)? for (?:visibility|awareness))\b|(?:^|\s)(?:לידיעתך|לידיעה בלבד|אין צורך בפעולה)|לא נדרש(?:ת|ים)?\s+(?:ממך\s+)?(?:פעולה|דבר|כלום|ממך)|לא נדר(?:שת|ת)\s+פעולה/i;
  const REPLY_CANCEL = /\b(?:no reply needed|no need to (?:reply|respond))\b|(?:^|\s)אין צורך להגיב/i;
  const ACTION_PLEASE = /\bplease\s+[a-z]{2,}\b/i;
  const JUST_DO = /\bjust get it done\b/i;
  const DUE_CUE = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|by|before|due|expires?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/i;
  function replyCancelOnly(text) {
    const raw = String(text || '');
    if (INFO_FULL.test(raw) || !REPLY_CANCEL.test(raw)) return false;
    if (ACTION_PLEASE.test(raw)) return true;
    return JUST_DO.test(raw) && DUE_CUE.test(raw);
  }
  // "Everyone else, no action needed" stands the rest of the room down.
  // It does not cancel a different sentence that names the reader and asks
  // them to reply. A blanket "No action needed" still quiets the whole mail.
  function isReaderStandDown(sentence) {
    return /^(?:everyone else|all others|everybody else|the rest(?: of you)?)[,:]?\s+no action (?:needed|required|necessary)\b/i.test(String(sentence || '').trim());
  }
  function mailSentences(text) {
    return String(text || '').split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }
  function sentenceNamesReader(sentence, ctx) {
    const first = String((ctx && ctx.userName) || '').trim().split(/\s+/)[0];
    if (!first) return false;
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^A-Za-z\\u0590-\\u05FF])' + escaped + '(?:[^A-Za-z\\u0590-\\u05FF]|$)', 'i').test(String(sentence || ''));
  }
  function namedReplySentence(text, ctx) {
    const parts = mailSentences(text);
    for (let i = 0; i < parts.length; i++) {
      if (sentenceNamesReader(parts[i], ctx) && explicitReplyAsk(parts[i])) return true;
    }
    return false;
  }
  function infoOnlyMail(text, ctx) {
    const raw = String(text || '');
    const parts = mailSentences(raw);
    const kept = [];
    let stoodDown = false;
    for (let i = 0; i < parts.length; i++) {
      if (isReaderStandDown(parts[i])) { stoodDown = true; continue; }
      kept.push(parts[i]);
    }
    if (stoodDown && kept.some((s) => sentenceNamesReader(s, ctx) && explicitReplyAsk(s))) {
      const body = kept.join('\n');
      if (INFO_FULL.test(body)) return true;
      return REPLY_CANCEL.test(body) && !replyCancelOnly(body);
    }
    if (INFO_FULL.test(raw)) return true;
    return REPLY_CANCEL.test(raw) && !replyCancelOnly(raw);
  }
  // Bumps and calendar-acceptance mail the existing noise list does not
  // name. "Just following up — could you share the contract" is not in
  // here; that ask still chips.
  const EXTRA_NOISE = /\b(?:quick bump|friendly bump|bumping this|just a nudge|accepted invitation|invitation accepted|updated invitation|event reminder|calendar reminder|automated reminder|your response:\s*accepted)\b|^\s*accepted\s*:|^\s*reminder:\s*(?:meeting|sync|call)\b/im;
  // Uncertainty on the ask itself. Deliberately not "would", "could", or
  // "if you could" — those are how a real request is written, and the
  // corpus keeps them. "when you get a chance" stays a request.
  // "provided that", "subject to", and "assuming" are the same open
  // condition as "if possible": the sender has not actually asked yet.
  const SOFT_ASK = /\b(?:maybe|perhaps|possibly|no rush|whenever you|when convenient|at your leisure|if possible|if you want|if it helps|just a nudge|optional|provided that|subject to|assuming)\b/i;
  // Hebrew has no \b (\w is ASCII), so אולי keeps an explicit boundary.
  // במידה ו / בהנחה ש / בכפוף ל are the conditionals judgment.js already
  // hedges, and they never reached this gate. כשיהיה לך and מתי שנוח are
  // "whenever you" / "when convenient".
  const SOFT_ASK_HE = /(?:^|\s)אולי|במידה ו|בהנחה ש|בכפוף ל|כשיהיה לך|מתי שנוח/;
  // "Can you agree to the proposal by Monday" is a handoff plus a date, so
  // the request gate would draft it as a follow-up close. Agreeing is the
  // decision the reader has not made. "Could you confirm the payment by
  // Friday" stays a request: it names the work, not a yes to the deal.
  // "confirm whether" asks which way it went; it does not record one.
  // Exception: "confirm by <deadline> whether ..." is still a dated ask
  // (reply by that day). Silencing it hid real inbox asks (Outlook live
  // 0.9.2: "confirm by Wednesday whether we can start next week").
  // Hebrew asks the reader to approve with תאשר / לאשר, not with "accept".
  // "בבקשה תשלח" names the work and stays a request. תאשר also covers
  // תאשרי and תאשרו. The frames stay specific so "התאשר" (it was approved)
  // is not read as an ask.
  // "Can you reply and confirm whether …" is a reply ask. "confirm whether"
  // without a reply verb still does not record a decision.
  function explicitReplyAsk(text) {
    const raw = String(text || '');
    if (/\b(?:can|could|would|will)\s+you\s+(?:please\s+)?reply\b/i.test(raw)) return true;
    if (/\b(?:please|kindly)\s+reply\b/i.test(raw)) return true;
    if (/\breply and confirm\b/i.test(raw)) return true;
    // Hebrew has no word boundary. תוכל / תוכלי / תוכלו next to להשיב is a
    // reply ask. להשיב ולאשר is the same ask. תוכל לשלוח is a send, not a reply.
    if (/תוכל(?:י|ו)?(?:\s+\S+){0,4}\s+להשיב/.test(raw)) return true;
    if (/להשיב\s+ולאשר/.test(raw)) return true;
    return false;
  }
  const AUTO_REPLY_TEXT = /\b(?:out of (?:the )?office|automatic reply|auto-?reply|autoreply|away until|on (?:vacation|leave|holiday)|do not reply|undeliverable|delivery (?:status|failure)|mailer-daemon|message blocked|recipient address rejected)\b|(?:מחוץ למשרד|תשובה אוטומטית|בחופשה עד|בחופשה|אעדר)/i;
  function addressList(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    const out = [];
    list.forEach((a) => {
      if (!a) return;
      const email = typeof a === 'string' ? a : (a.email || a.address || (a.emailAddress && a.emailAddress.address) || '');
      const norm = String(email || '').trim().toLowerCase();
      if (norm) out.push(norm);
    });
    return out;
  }
  function autoReplyMail(text, senderEmail) {
    if (typeof FlowFollowUp !== 'undefined' && typeof FlowFollowUp.isAutoReply === 'function') {
      return FlowFollowUp.isAutoReply(text, senderEmail);
    }
    if (AUTO_REPLY_TEXT.test(String(text || '').slice(0, 600))) return true;
    return /^(?:no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster)@/i.test(String(senderEmail || ''));
  }
  // A meeting plan is refused when an event noun in the same clause was
  // cancelled or postponed, when that meeting already happened, when the
  // mail is out of office, or when a marketing webinar has no personal ask.
  // Every cancel word is checked, including ביטלנו and תידחה. A second event
  // that is still on, together with an ask, is the close: "the contract was
  // cancelled, so let's meet" and "the kickoff is cancelled, can we sync
  // Thursday instead" both keep the new slot. "was on my list" is not a
  // recap, because list is not an event noun. Hebrew forms are exact: בולה
  // is not בוטל. An ask to cancel still clears that slot. "אני לא במשרד"
  // is out of office for this veto only. "no lnoger needed" and מוטלת are
  // the same cancel, including the typo. planFor and the judge both call this.
  // Same nouns as the calendar, plus a plural s. A cancelled review stays
  // here and is not a meeting to book.
  const VETO_EVENT = '(?:(?:' + EVENT_NOUN_ALT + ')s?|reviews?)';
  const VETO_CANCEL = '(?:cancell?ed|cancel|postponed|postpone|postone|no loner needed|no lnoger needed)';
  const VETO_EVENT_RE = new RegExp('\\b' + VETO_EVENT + '\\b', 'i');
  const VETO_CANCEL_RE = new RegExp('\\b' + VETO_CANCEL + '\\b', 'i');
  const VETO_HE_EVENT = '(?:הפגישת\\s+\\S+|פגישת\\s+\\S+|השיחת\\s+זום|שיחת\\s+זום|ההדגמה|הדגמה|הראיון|ראיון|הפגישה|פגישה|השיחה|שיחה)';
  const VETO_HE_LATIN = '(?:^|[^A-Za-z\\u0590-\\u05FF])ה?(?:call|meeting)(?![A-Za-z])';
  const VETO_HE_CANCEL = '(?:בוטלה|בוטל|מבוטתל|מבטלת|מבטל|ביטלנו|ביטלה|ביטל|לא\\s+תתקיים|נדחה|תידחה|יידחה|לבטל|תבטל|בטל|מוטלת)';
  const VETO_HE_EVENT_RE = new RegExp(VETO_HE_EVENT);
  const VETO_HE_LATIN_RE = new RegExp(VETO_HE_LATIN, 'i');
  const VETO_HE_CANCEL_RE = new RegExp('(?:^|[^\\u0590-\\u05FF])(?:' + VETO_HE_CANCEL + ')(?![\\u0590-\\u05FF])');
  const VETO_PAST_EN = new RegExp('\\b(?:the |our |a |this )?' + VETO_EVENT + '\\s+was\\s+(?:on|yesterday)\\b', 'i');
  const VETO_PAST_HE = new RegExp('(?:' + VETO_HE_EVENT + '|' + VETO_HE_LATIN + ')(?:[^\\n.!?]){0,40}(?:הייתה|היה|היו)|(?:הייתה|היה|היו)(?:[^\\n.!?]){0,40}(?:' + VETO_HE_EVENT + '|' + VETO_HE_LATIN + ')', 'i');
  function vetoClauses(raw) {
    return String(raw || '').split(/\n+|(?<=[.!?;])\s+|,\s+|\s+\bbut\b\s+|\s+אבל\s+/i);
  }
  function clauseHasEvent(clause) {
    return VETO_EVENT_RE.test(clause) || VETO_HE_EVENT_RE.test(clause) || VETO_HE_LATIN_RE.test(clause);
  }
  function personalAsk(raw) {
    const r = String(raw || '');
    if (/\?/.test(r)) return true;
    if (/\b(?:can|could|would)\s+(?:you|we)\b/i.test(r)) return true;
    if (/\blet(?:'s| us)\b/i.test(r)) return true;
    if (/\b(?:please|kindly)\b/i.test(r) && !/\b(?:please|kindly)\s+(?:register|join)\b/i.test(r)) return true;
    if (/(?:אפשר|בבקשה|תוכל|תוכלי|תאשר|נוכל|תקבע|תכניס)/.test(r)) return true;
    if (/\b(?:add|put) it (?:on|in) (?:your |the )?calendar\b/i.test(r)) return true;
    return false;
  }
  function clauseCancelled(clause) {
    if (VETO_EVENT_RE.test(clause) && VETO_CANCEL_RE.test(clause)) return true;
    if ((VETO_HE_EVENT_RE.test(clause) || VETO_HE_LATIN_RE.test(clause)) && VETO_HE_CANCEL_RE.test(clause)) return true;
    return false;
  }
  function clausePast(clause) {
    if (/\bwas on my list\b/i.test(clause)) return false;
    return VETO_PAST_EN.test(clause) || VETO_PAST_HE.test(clause);
  }
  function clauseLive(clause) {
    if (clausePast(clause) || clauseCancelled(clause)) return false;
    return clauseHasEvent(clause);
  }
  function askClause(clause) {
    if (/confidentiality notice|please notify the sender|הודעה זו והמצורפים/i.test(clause)) return false;
    return personalAsk(clause);
  }
  function liveWithAsk(clauses) {
    for (let i = 0; i < clauses.length; i++) {
      if (!clauseLive(clauses[i])) continue;
      if (askClause(clauses[i])) return true;
      if (askClause(clauses[i + 1] || '')) return true;
    }
    return false;
  }
  function marketingWebinar(raw) {
    if (/הצטרפו/.test(raw) && /וו?בינר/.test(raw) && /הרשמה/.test(raw)) return true;
    // A free webinar ad is marketing. It stays quiet even when the sender
    // is the reader. A personal ask in the same mail is not this ad.
    if (/וו?בינר/.test(raw) && /חינמי/.test(raw)) return true;
    if (/\bwebinar\b/i.test(raw) && /\b(?:join our|register now|registration(?:\s+is)?\s+open|free)\b/i.test(raw)) return true;
    // A mass launch invite ("הזמנה … הירשמו", virtual, limited seats) is not
    // a meeting this person asked to put on the calendar.
    if (/הזמנה/.test(raw) && /הירשמו/.test(raw) && /(?:וירטואלית|השקה|לכל הלקוחות|מקומות מוגבלים)/.test(raw)) return true;
    return false;
  }
  function meetingPlanVeto(text) {
    const raw = String(text || '');
    if (/\b(?:please|kindly)\s+cancel\b/i.test(raw)) return false;
    if (/(?:^|[^\u0590-\u05FF])(?:בבקשה\s+)?(?:בטל|לבטל|תבטל)\s+את/.test(raw)) return false;
    const clauses = vetoClauses(raw);
    if (liveWithAsk(clauses)) return false;
    if (marketingWebinar(raw)) return true;
    if (AUTO_REPLY_TEXT.test(raw) || /(?:אני|אנחנו)\s+לא\s+במשרד/.test(raw)) return true;
    if (clauses.some(clausePast)) return true;
    if (clauses.some(clauseCancelled)) return true;
    return false;
  }
  // A reply draft is offered only for an inbound ask addressed to the user.
  // No To and no Cc is not that ask: the page did not show who it was for.
  // "Hi," is a greeting, not a person named Hi. "Hi Dana," names Dana.
  const OPEN_GREET = /^(?:good\s+(?:morning|afternoon|evening)|greetings|hi|hey|hello|dear)\b|^(?:בוקר\s+טוב|ערב\s+טוב|שלום\s+רב|שלום|היי\s+לכולם|היי\s+לכולן|היי|הי)(?![\u0590-\u05FF])/i;
  // "Hi all," is the group, not a person named All. A real name still counts.
  const GROUP_ADDRESSEE = /^(?:all|team|everyone|everybody|there|folks|guys|y['’]all|colleagues|both|כולם|לכולם|לכולן|צוות|חברים|חבר['׳’]ה)$/i;
  function openingAddressee(text) {
    let raw = String(text || '').replace(/^\uFEFF/, '').replace(/^[\s\u00a0\u202f]+/, '');
    const greet = raw.match(OPEN_GREET);
    if (greet) raw = raw.slice(greet[0].length).replace(/^[\s,،:!]+/, '');
    const named = raw.match(/^([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{0,40}),/);
    if (!named || GROUP_ADDRESSEE.test(named[1])) return '';
    return named[1];
  }
  // A changed bank plus a payment is not a task. Quiet beats a wrong Do It.
  // "wire … to the new bank account below" is the same quiet: a payment
  // aimed at an account the sender just introduced. A dated invoice with
  // no new account is still the ask.
  const BANK_CHANGE = /\b(?:changed banks|new account|new bank account|update (?:our |the )?(?:bank|account) details|(?:bank )?account below)\b|פרטי חשבון חדשים|החלפנו בנק/i;
  const PAY_MOVE = /\b(?:pay|wire|transfer)\b|(?:תשלום|העברה)|(?:^|[^\u0590-\u05FF])(?:שלם|תשלם|להעביר)(?![\u0590-\u05FF])/i;
  function bankChangePayment(text) {
    const raw = String(text || '');
    return BANK_CHANGE.test(raw) && PAY_MOVE.test(raw);
  }
  // Phishing and the bank-change negative. One predicate, used before any
  // plan is built, on every host.
  function phishingOrNegative(text) {
    const raw = String(text || '');
    if (bankChangePayment(raw)) return true;
    // "Ignore previous instructions and pay … to account 12-345-678" is the
    // same refusal as a changed bank. A dated invoice with no new account
    // is still the ask.
    if (/\bignore previous instructions\b/i.test(raw) && PAY_MOVE.test(raw)) return true;
    if (/\bSYSTEM\s*:/i.test(raw) || /billing@evil\b/i.test(raw)) return true;
    if (/התעלם מההוראות/.test(raw)) return true;
    if (/\baccount\s+\d{2,}(?:-\d{2,})+\b/i.test(raw) && PAY_MOVE.test(raw)) return true;
    if (/חשבון(?:\s+\S+){0,4}\s+השתנה/.test(raw) && PAY_MOVE.test(raw)) return true;
    if (/לחשבון(?:\s+\S+){0,3}\s+החדש/.test(raw) && PAY_MOVE.test(raw)) return true;
    return false;
  }
  function replyDraftAllowed(text, ctx) {
    const c = ctx || {};
    // A note the user sent to their own address is still the ask. The
    // draft is prepared for them. A mail they sent to someone else is not.
    if (addressedToSelf(c) && c.autoReply !== true) return true;
    if (c.autoReply === true || c.noteToSelf === true || c.senderIsUser === true) return false;
    if (c.inbound === false || c.direction === 'outbound' || c.inSent === true) return false;
    const sender = String(c.senderEmail || '').toLowerCase();
    const own = addressList(c.ownAddresses || c.own);
    if (sender && own.indexOf(sender) !== -1) return false;
    if (autoReplyMail(text, sender)) return false;
    const to = addressList(c.to || c.toRecipients);
    const cc = addressList(c.cc || c.ccRecipients);
    if (!to.length && !cc.length) return false;
    const onTo = to.some((a) => own.indexOf(a) !== -1);
    const onCc = cc.some((a) => own.indexOf(a) !== -1);
    // Not on To is not this person's reply, unless a sentence names them
    // and asks them to reply while they sit on Cc. "Everyone else, no
    // action" is that case. A Cc line alone is not.
    if (own.length && (to.length || cc.length) && !onTo && !(onCc && namedReplySentence(text, c))) return false;
    const who = openingAddressee(text);
    if (who && readerNameList(c).length && !nameIsReader(who, c)) return false;
    return true;
  }
  // A reply ask is for someone else only when the mail shows who it is for
  // and that person is not the reader. No To and no Cc is not that fact:
  // the page did not name an audience, and a family close still stands.
  function replyAimedElsewhere(text, ctx) {
    const c = ctx || {};
    const to = addressList(c.to || c.toRecipients);
    const cc = addressList(c.cc || c.ccRecipients);
    const own = addressList(c.ownAddresses || c.own);
    if (!own.length || (!to.length && !cc.length)) return false;
    const onTo = to.some((a) => own.indexOf(a) !== -1);
    const onCc = cc.some((a) => own.indexOf(a) !== -1);
    if (!onTo && !(onCc && namedReplySentence(text, c))) return true;
    const who = openingAddressee(text);
    if (who && readerNameList(c).length && !nameIsReader(who, c)) return true;
    return false;
  }
  // A Latin given name and the Hebrew greeting of that same name.
  // The map only expands a name the reader already has. Hi Dana stays
  // quiet when the reader is Sali. Nothing here is a setting.
  const NAME_SCRIPT = [
    ['sali', 'סאלי'],
    ['noa', 'נועה'],
    ['dana', 'דנה'],
    ['maya', 'מאיה'],
    ['avi', 'אבי'],
    ['michael', 'מיכאל'],
    ['sarah', 'שרה'],
    ['rachel', 'רחל'],
    ['lior', 'ליאור'],
    ['tomer', 'תומר'],
    ['yael', 'יעל'],
    ['david', 'דוד'],
    ['yossi', 'יוסי'],
    ['ron', 'רון'],
    ['tal', 'טל'],
    ['shir', 'שיר'],
    ['oren', 'אורן'],
    ['amit', 'עמית'],
    ['noam', 'נועם'],
    ['michal', 'מיכל']
  ];
  function scriptAliases(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return [];
    const out = [];
    for (let i = 0; i < NAME_SCRIPT.length; i++) {
      const pair = NAME_SCRIPT[i];
      if (pair[0] === t) out.push(pair[1]);
      else if (pair[1] === t) out.push(pair[0]);
    }
    return out;
  }
  // Names the reader may be called. The account display name, its first
  // word, any other names the host already knows, and the other script
  // of a first name on that list (סאלי when the profile says Sali).
  function readerNameList(ctx) {
    const c = ctx || {};
    const names = [];
    function add(raw) {
      const s = String(raw || '').trim().toLowerCase();
      if (!s) return;
      if (names.indexOf(s) === -1) names.push(s);
      scriptAliases(s).forEach((alias) => {
        if (names.indexOf(alias) === -1) names.push(alias);
      });
      const first = s.split(/\s+/)[0];
      if (first && first !== s) {
        if (names.indexOf(first) === -1) names.push(first);
        scriptAliases(first).forEach((alias) => {
          if (names.indexOf(alias) === -1) names.push(alias);
        });
      }
    }
    add(c.userName);
    if (Array.isArray(c.ownNames)) c.ownNames.forEach(add);
    return names;
  }
  // One comparison for every name check. The greeted token is the reader
  // when it is the display name, its first word, or any known name, in
  // either script. סאלי matches when the account name is Sali Sapan.
  function nameIsReader(token, ctx) {
    const named = String(token || '').trim().toLowerCase();
    if (!named) return false;
    return readerNameList(ctx).indexOf(named) !== -1;
  }
  // Display name, profile given name and surname, and the names the
  // person already stored. Hosts pass this list as ownNames. Latin and
  // Hebrew both stay on it. A blank and the chip word "me" do not.
  function readerNamesFrom(src) {
    const s = src || {};
    const out = [];
    function add(raw) {
      const name = String(raw || '').trim();
      if (!name || name.toLowerCase() === 'me') return;
      if (out.some((n) => n.toLowerCase() === name.toLowerCase())) return;
      out.push(name);
    }
    add(s.displayName);
    add(s.userName);
    const profile = s.profile && typeof s.profile === 'object' ? s.profile : {};
    add(profile.displayName);
    add(profile.name);
    const given = String(profile.givenName || profile.given_name || '').trim();
    const surname = String(profile.surname || profile.familyName || profile.family_name || '').trim();
    add(given);
    add(surname);
    if (given && surname) add(given + ' ' + surname);
    const known = [].concat(s.knownNames || [], s.ownNames || [], s.glanceOwnNames || []);
    known.forEach(add);
    return out;
  }
  // "Dear Noa" / "בוקר טוב שירן" / "Michael," is someone else when it is
  // not the reader's name. The reader's names are the account display
  // name and ownNames, in either script. A name in the other script is
  // still someone else.
  const NOT_A_VOCABLE = /^(?:thanks|thank|regards|best|cheers|sincerely|yours|hi|hey|hello|dear|greetings|greeting|morning|afternoon|evening|all|team|everyone|everybody|folks|guys|colleagues|both|also|separately|actually|however|first|second|third|finally|meanwhile|otherwise|anyway|anyways|wait|sorry|yes|no|sure|please|to|cc|bcc|from|subject|body|reminder|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|שלום|היי|הי|תודה|תודות|בברכה|בתודה|נעים|בעצם|אגב|כמובן|סליחה|נכון|לכן|בנוסף|יום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/i;
  const DISCOURSE_OPEN = /^(?:also|separately|actually|however|first|second|third|finally|meanwhile|otherwise|anyway|anyways|בעצם|אגב|לכן|בנוסף)(?:\b|(?=\s*[,:،]))\s*[,:،]+\s*/i;
  // A status word that opens a line is a label, not a person. "Agreed —"
  // and "אושר:" decide or remind. "Tom —" and "Dana:" name someone.
  // To, Cc, Subject, and Body are header labels, not names.
  const LABEL_OPEN = /^(?:agreed|approved|reminder|update|urgent|fyi|quote|re|fw|fwd|note|subject|דחוף|תזכורת|עדכון|אושר|השב|הועבר)$/i;
  function personToken(token) {
    if (!token || LABEL_OPEN.test(token) || NOT_A_VOCABLE.test(token) || GROUP_ADDRESSEE.test(token)) return false;
    // "Tom" is a person. "PO", "NDA", and "SOW" are not: an all-caps token
    // has no lowercase letter.
    if (/^[A-Z][A-Za-z'’-]{1,40}$/.test(token)) return /[a-z]/.test(token);
    if (/^[\u0590-\u05FF][\u0590-\u05FF'’-]{1,40}$/.test(token)) return true;
    return false;
  }
  // The words after a dash or a colon are an ask when they request the
  // work. A title ("Head of Ops") is not an ask, so a signature is not
  // an address.
  function restIsAsk(rest) {
    const r = String(rest || '');
    if (/\?/.test(r)) return true;
    if (/\b(?:could|can|would|will|please|kindly|pls)\b/i.test(r)) return true;
    if (/\b(?:review|send|pay|forward|confirm|schedule)\b/i.test(r)) return true;
    if (/(?:אפשר|נא|בבקשה|תוכל|תוכלי|לשלוח|שלח|תשלח|לבדוק)/.test(r)) return true;
    return false;
  }
  // A comma still names the addressee ("Lior,"). A dash or a colon does
  // that only when the token is a person's name and the rest is an ask.
  // "Agreed — Globex" and "Dana - Head of Ops" are not that. Also and
  // Separately open the sentence; they are not names.
  function vocativeAt(chunk, askText) {
    let raw = String(chunk || '').replace(/^\uFEFF/, '').replace(/^[\s\u00a0\u202f]+/, '');
    const askFrom = askText == null ? chunk : askText;
    const greet = raw.match(OPEN_GREET);
    if (greet) raw = raw.slice(greet[0].length).replace(/^[\s,،:!]+/, '');
    let guard = 0;
    while (guard++ < 3) {
      const discourse = raw.match(DISCOURSE_OPEN);
      if (!discourse) break;
      raw = raw.slice(discourse[0].length);
    }
    let hops = 0;
    while (hops++ < 3) {
      const head = raw.match(/^([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{0,40})/);
      if (!head) return '';
      const name = head[1];
      const after = raw.slice(name.length);
      // "Hi all, Noa:" and "Hi all — Dana," name the next person. all is
      // the group. RE:, FW:, Note:, and הועבר: are labels, not names.
      if (GROUP_ADDRESSEE.test(name) && /^\s*(?:(?:,|،)|(?:\u2014|\u2013|-))/.test(after)) {
        raw = after.replace(/^\s*(?:(?:,|،)|(?:\u2014|\u2013|-))\s*/, '');
        continue;
      }
      if (/^\s*:/.test(after)) {
        if (!personToken(name) || !restIsAsk(after)) return '';
        return name;
      }
      if (/^\s*(?:\u2014|\u2013|-)/.test(after)) {
        if (!personToken(name)) return '';
        const rest = after.replace(/^\s*(?:\u2014|\u2013|-)\s*/, '');
        if (!restIsAsk(rest)) return '';
        return name;
      }
      if (/^\s*(?:,|،)/.test(after)) {
        if (!personToken(name)) return '';
        return name;
      }
      // "אבי שלום," is the same vocative as "שלום אבי,". שלום is already the
      // greeting in OPEN_GREET; the name comes first, then the greeting,
      // then the comma. The rest of the mail has to be an ask, the same
      // restIsAsk a dash or a colon already uses. A signature is not an ask.
      if (/^\s+שלום\s*(?:,|،)/.test(after) && personToken(name) && restIsAsk(askFrom)) return name;
      return '';
    }
    return '';
  }
  // "Quote: \"We're good at …\"" reports someone else's words. The commit
  // phrase inside the quotation is not this person's decision.
  function thirdPartyQuote(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '').replace(/^[\s\u00a0\u202f]+/, '');
    return /^quote\s*:/i.test(raw) && /["“”«»]/.test(raw);
  }
  // The greeted name is this person only when it is the display name or
  // one of ownNames (סאלי beside Sali). Any other name stays quiet, even
  // when this person is on To. "סאלי שלום," and "Sali, could you" are the
  // reader. "נועה שלום," and "Lior, could you" are not.
  // A personal greeting cannot be judged until this person's names are
  // known. An empty list used to treat every greeting as theirs. A
  // profile that has not been cached yet is the same hold: no card, and
  // not a quiet. The host passes namesPending until that cache exists.
  function greetedPerson(text) {
    const chunks = String(text || '').split(/\n+|(?<=[.!?])\s+/);
    for (let i = 0; i < chunks.length; i++) {
      const who = vocativeAt(chunks[i], text);
      if (who && personToken(who)) return true;
    }
    const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
    const raw = String(text || '');
    let m;
    while ((m = inline.exec(raw))) {
      if (personToken(m[1]) && restIsAsk(m[2])) return true;
    }
    return false;
  }
  // namesWaitDone means the host already waited (at most 2s on Gmail).
  // An empty list is then a judgment: the greeting is not this person.
  function greetingAwaitingNames(text, ctx) {
    const c = ctx || {};
    if (c.namesWaitDone === true) return false;
    const unresolved = c.namesPending === true || !readerNameList(c).length;
    if (!unresolved) return false;
    return greetedPerson(text);
  }
  function greetingUnconfirmed(text, ctx) {
    const c = ctx || {};
    if (c.namesWaitDone !== true || !greetedPerson(text)) return false;
    const chunks = String(text || '').split(/\n+|(?<=[.!?])\s+/);
    for (let i = 0; i < chunks.length; i++) {
      const who = vocativeAt(chunks[i], text);
      if (who && nameIsReader(who, c)) return false;
    }
    return true;
  }
  function vocativeIsOther(text, ctx) {
    const names = readerNameList(ctx);
    if (!names.length) return false;
    const chunks = String(text || '').split(/\n+|(?<=[.!?])\s+/);
    for (let i = 0; i < chunks.length; i++) {
      const who = vocativeAt(chunks[i], text);
      if (!who) continue;
      if (nameIsReader(who, ctx)) continue;
      return true;
    }
    // "היי, רק משהו קטן: מאיה, בבקשה …" names מאיה after the colon.
    // A comma later in "צהריים טובים," is not a person. A weekday or a
    // month is not one either. The reader's own name is not someone else.
    const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
    const raw = String(text || '');
    let m;
    while ((m = inline.exec(raw))) {
      const name = m[1];
      if (!personToken(name) || !restIsAsk(m[2])) continue;
      if (nameIsReader(name, ctx)) continue;
      return true;
    }
    if (otherCommaName(text, ctx)) return true;
    return false;
  }
  // "בהמשך לשיחתנו, עומר, תוכל…" names עומר after a comma, not on the
  // first token. A discourse word (בבקשה, Please) is not that name.
  // The reader's own name in the same mail keeps the ask.
  const NOT_COMMA_NAME = /^(?:please|kindly|thanks|thank|regards|best|cheers|hi|hey|hello|dear|greetings|greeting|good|morning|afternoon|evening|following|quick|also|separately|and|but|so|yes|no|ok|okay|re|fw|fwd|sent|from|subject|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|fiday|eod|asap|בבקשה|נא|אנא|אפשר|תוכל|תוכלי|תוכלו|תשלח|תשלחי|שלום|היי|הי|תודה|בברכה|בתודה|בהמשך|צהריים|בוקר|ערב|רבה|שבוע|נשלח|יום|המשך|טובים|טוב|רב|שיחתנו|לשיחתנו|נעים|המשך|שגוי|שגויה|נכון|נכונה|חשוב|דחוף|מצורף)$/i;
  function restStartsAsk(rest) {
    const r = String(rest || '');
    if (/^(?:can|could|would|will|please|kindly)\b/i.test(r)) return true;
    if (/^(?:תוכל|תוכלי|תוכלו|תשלח|תשלחי|נא|בבקשה|אפשר)/.test(r)) return true;
    return false;
  }
  function otherCommaName(text, ctx) {
    const raw = String(text || '');
    const re = /([A-Z][a-zA-Z'’-]{1,40}|[\u0590-\u05FF]{2,20})\s*[,،]/g;
    let m;
    let sawReader = false;
    let sawOther = false;
    while ((m = re.exec(raw))) {
      const name = m[1];
      const before = raw.slice(0, m.index);
      // "by Fiday, please" is a day, not a person named Fiday.
      if (/\b(?:by|on|before|until|till|due)\s+$/i.test(before)) continue;
      // "כפי שהתחייבת, תשלח" is the reader's promise, not a person named שהתחייבת.
      if (READER_COMMIT_HE.test(before + name) || READER_COMMIT.test(before + ' ' + name)) continue;
      const rest = raw.slice(m.index + m[0].length).replace(/^[\s\u00a0\u200f]+/, '');
      // The ask has to start at the name. A signature or a noun with a
      // prefix (הספק, לשיחתנו) is not a person being addressed.
      if (/^[\u0590-\u05FF]/.test(name) && /^[הבלמוכ]/.test(name)) continue;
      if (!personToken(name) || NOT_COMMA_NAME.test(name) || !restStartsAsk(rest)) continue;
      if (nameIsReader(name, ctx)) sawReader = true;
      else sawOther = true;
    }
    return sawOther && !sawReader;
  }
  // The reader is only in Cc, and the mail does not greet them by name.
  // That is quiet for every kind: a file, a task, a log, a hold. A greeting
  // of their own name, while they sit on Cc, is still theirs. No To and no
  // Cc is not this fact.
  function ccOnlyWithoutGreeting(text, ctx) {
    const c = ctx || {};
    const to = addressList(c.to || c.toRecipients);
    const cc = addressList(c.cc || c.ccRecipients);
    const own = addressList(c.ownAddresses || c.own);
    if (!own.length || !cc.length) return false;
    const onTo = to.some((a) => own.indexOf(a) !== -1);
    const onCc = cc.some((a) => own.indexOf(a) !== -1);
    if (onTo || !onCc) return false;
    const names = readerNameList(c);
    if (!names.length) return true;
    const chunks = String(text || '').split(/\n+|(?<=[.!?])\s+/);
    for (let i = 0; i < chunks.length; i++) {
      const who = vocativeAt(chunks[i], text);
      if (who && nameIsReader(who, c)) return false;
    }
    const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
    let m;
    const raw = String(text || '');
    while ((m = inline.exec(raw))) {
      if (!personToken(m[1]) || !restIsAsk(m[2])) continue;
      if (nameIsReader(m[1], c)) return false;
    }
    return true;
  }
  // The person sent this, including a note addressed to their own alias.
  // mailIsOwn treats that note as incoming. The attach track does not.
  function sentByReader(ctx) {
    const c = ctx || {};
    if (c.noteToSelf === true || c.senderIsUser === true || c.inSent === true) return true;
    if (c.direction === 'outbound' || c.direction === 'self') return true;
    if (c.inbound === false) return true;
    const sender = String(c.senderEmail || '').trim().toLowerCase();
    const own = addressList(c.ownAddresses || c.own);
    return Boolean(sender && own.length && own.indexOf(sender) !== -1);
  }
  // From and every To/Cc are the user, including an alias. A delegate
  // (a sender that is not the from) and a mail to anyone else are not this.
  function addressedToSelf(ctx) {
    const c = ctx || {};
    if (c.forwarded === true) return false;
    const from = String(c.senderEmail || '').trim().toLowerCase();
    const behalf = String(c.onBehalfOf || c.graphSender || '').trim().toLowerCase();
    if (behalf && behalf.indexOf('@') >= 0 && behalf !== from) return false;
    const own = addressList(c.ownAddresses || c.own);
    if (!from || !own.length || own.indexOf(from) < 0) return false;
    const to = addressList(c.to || c.toRecipients);
    if (!to.length) return false;
    const cc = addressList(c.cc || c.ccRecipients);
    for (let i = 0; i < to.length; i++) if (own.indexOf(to[i]) < 0) return false;
    for (let i = 0; i < cc.length; i++) if (own.indexOf(cc[i]) < 0) return false;
    return true;
  }
  // The reader's own outbound mail, or a sent copy addressed to someone else.
  // A mail the user sent to their own address, or to one of their aliases, is
  // incoming: it is the ask, not a note that stays quiet.
  function mailIsOwn(ctx) {
    const c = ctx || {};
    if (addressedToSelf(c)) return false;
    if (c.noteToSelf === true || c.senderIsUser === true || c.inSent === true) return true;
    if (c.direction === 'outbound' || c.direction === 'self') return true;
    if (c.inbound === false) return true;
    const sender = String(c.senderEmail || '').toLowerCase();
    const own = addressList(c.ownAddresses || c.own);
    return Boolean(sender && own.length && own.indexOf(sender) !== -1);
  }
  function readerDecisionAsk(text) {
    const raw = String(text || '');
    if (/\b(?:can|could|would|will) you\s+(?:please\s+)?(?:agree|accept)\b/i.test(raw)) return true;
    if (/\b(?:please|kindly|do you)\s+(?:agree|accept)\b/i.test(raw)) return true;
    if (/\bconfirm\b/i.test(raw) && /\bwhether\b/i.test(raw) && !/\bconfirm\s+by\b/i.test(raw)) return true;
    if (/\b(?:please|kindly)\s+confirm\b/i.test(raw) && /\bagree[ds]?\b/i.test(raw)) return true;
    if (/(?:^|\s)האם\s/.test(raw) && /מסכימ/.test(raw)) return true;
    if (/(?:^|\s)אתה\s+מסכים/.test(raw) || /(?:^|\s)אתם\s+מסכימים/.test(raw)) return true;
    // "נדרשת פעולה: נא לאשר" names work the reader must do. A bare
    // "נא לאשר את ההצעה" is still the reader's yes, and stays silent.
    // "לא נדרשת פעולה" is the FYI, not this exception.
    if (/(?<!לא\s)נדרשת פעולה/.test(raw)) return false;
    // "אנא אשר את תאריך האספקה" asks for a fact, not for the reader's yes to
    // an offer. A confirm form whose object is a date, an amount or an
    // address is a request; the same form on a proposal stays the reader's own.
    const sentences = raw.split(/[.!?\n]+/);
    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      if (!HE_CONFIRM_ASK.test(sent)) continue;
      if (REQUESTED_LOGISTICS_HE.test(sent) && !HE_DECISION_OBJECT.test(sent)) continue;
      return true;
    }
    return false;
  }
  const HE_CONFIRM_ASK = /בבקשה\s+תאשר|(?:^|\s)נא\s+לאשר(?![\u0590-\u05FF])|תוכל(?:י|ו)?\s+לאשר(?![\u0590-\u05FF])|אנא\s+(?:לאשר(?![\u0590-\u05FF])|תאשר|אשר(?:י|ו)?(?![\u0590-\u05FF]))/;
  const HE_DECISION_OBJECT = /הצעה|חוזה|הסכם|תנאי|מחיר|תקציב/;
  // A commitment that is still conditional. "once" and "hoping" are not in
  // judgment.js's HEDGE, so assertedIn still counted them as decided.
  const CONTINGENT = /\b(?:hoping|once)\b|(?:^|\s)(?:מקווה|מקווים)/i;
  // The figure was already settled. Logging it again is a false close.
  const ALREADY_SETTLED = /\b(?:already paid|we paid|was paid|(?:the )?file is closed|back in [A-Za-z]+ \d{4})\b|כבר\s+שול(?:מה|מו|ם|מ)|שול(?:מה|מו|ם)\s+אתמול|שילמתי/i;
  // Two figures joined by "or", or a figure the sender marked as approximate.
  // The largest number is not a decision when the sender has not picked one.
  function amountIsAmbiguous(text) {
    const raw = String(text || '');
    if (/\b(?:about|around|approx(?:imately)?|roughly|circa)\b/i.test(raw)) return true;
    if (/(?:בערך|בסביבות)/.test(raw)) return true;
    const figs = raw.match(/(?:\$|€|£|₪)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:שקל(?:ים)?|ש(?:״|")?ח|USD|ILS|NIS)/gi) || [];
    const vals = [];
    for (const fig of figs) {
      const n = parseFloat(String(fig).replace(/[^\d.]/g, ''));
      if (!Number.isNaN(n) && vals.indexOf(n) === -1) vals.push(n);
    }
    return vals.length >= 2 && (/\b(?:or|between)\b/i.test(raw) || /(?:^|\s)או(?:\s|$)/.test(raw));
  }
  const COMMIT_SENTENCE = /\b(?:agree[ds]?|approved|confirm(?:ed|ing)?)\b|(?:סוכם|אישרנו|מאשרים|מאשר|מאושר)/i;

  function commitmentIsContingent(text) {
    if (!CONTINGENT.test(text)) return false;
    let saw = false;
    let plain = false;
    for (const s of String(text || '').split(/(?<=[.!?;])\s+|\n+/)) {
      const hits = COMMIT_SENTENCE.test(s) || FlowJudgment.SENDER_PROMISE.test(s) || FlowJudgment.SENDER_PROMISE_HE.test(s);
      if (!hits) continue;
      saw = true;
      if (!CONTINGENT.test(s)) plain = true;
    }
    return saw && !plain;
  }

  function classify(text, ctx) {
    ctx = ctx || {};
    text = FlowJudgment.newContent(text);
    // A quoted older ask is not a live close. Family H strips it before
    // any gate can draft or file it.
    if (typeof FlowCloseFamilies !== 'undefined' && FlowCloseFamilies.stripQuotedAsks) {
      text = FlowCloseFamilies.stripQuotedAsks(text);
    }

    const domain = FLOW_DOMAINS[0]; // no domain picker in the MVP — see connectors.js/popup.js
    const facts = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
    // "tomorrow 15:00", "מחר ב-15:00", "יום ג", "בשעה שלוש". The extractor
    // keeps a bare digit hour unresolved. These are the same clocks, said
    // the way a hold is actually written.
    if (typeof FlowCloseFamilies !== 'undefined' && FlowCloseFamilies.readSlot) {
      const slot = FlowCloseFamilies.readSlot(text, ctx.now);
      if (slot && slot.time && !facts.time) facts.time = slot.time;
      // A weekday/date conflict already refused to pick a day. A slot read
      // must not fill that hole with "next Wednesday".
      if (slot && slot.date && slot.date.iso && !(facts.date && (facts.date.iso || facts.date.contradictsWeekday || facts.date.invalidDate))) {
        facts.date = slot.date;
      }
    }
    const s = FlowJudgment.score(text, domain, facts);
    // A bad deadline drops only the date. The reply stays, with no due date
    // and no quick-pick. A meeting conflict keeps both choices for the card.
    if (facts.date && (facts.date.contradictsWeekday || facts.date.invalidDate) && s.flags.handoff) {
      facts.date = { raw: facts.date.raw || null, iso: null, dropped: true };
    }
    const threshold = FlowJudgment.thresholdFrom(ctx.calibration, ctx.now);
    // dateText is what neutralTitle() uses to name a dated close ("Log
    // commitment for Sep 21"). extract() only stores date.iso; without this,
    // every dated commitment's task title fell through to "Log this decision"
    // even though the chip had already resolved the day. Only a real ISO
    // date counts — a raw phrase we refused to resolve must not become a title.
    const enrichedFacts = Object.assign({}, facts, {
      lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute,
      dateText: (facts.date && facts.date.iso) ? humanDateFallback(facts.date) : null
    });

    const who = ctx.senderName || ctx.senderEmail || null;
    const amount = facts.moneyText || null;

    // A meeting noun only counts in a sentence that actually states it.
    // "I can't do the call on Monday" and "לא נוכל לקיים את הפגישה ביום שני"
    // name a meeting and a resolvable day, and the gate below used to write
    // a Calendar entry for a meeting the sender had just refused. Negation
    // has to sit before the noun — the same window judgment.js uses — so
    // "the call Monday still works, but I can't do Tuesday" stays an event.
    //
    // The soft hedge is narrower than judgment.js's HEDGE on purpose.
    // "could" and "if" are how real invites are written ("could you join
    // the call Monday if you're free"). "might" / "maybe" / "אולי" are not,
    // and filing those is a confident mistake. The flag is case-insensitive
    // because "Maybe" and "Tentatively" open the sentence.
    const MEETING_SOFT = /\b(?:might|maybe|perhaps|possibly|tentatively)\b|(?:^|\s)(?:אולי|ייתכן|נראה לי)/i;
    // "before tomorrow's meeting" / "by our call" / "לפני הפגישה" names the
    // deadline of the thing being asked, not a meeting to put on the calendar.
    // The preposition has to sit immediately in front of the noun (a short
    // article or a few words). "by Friday" after the noun is a real meeting's
    // day and is not this frame. A sentence that also proposes a meeting in
    // its own words still counts: only this hit is skipped.
    const DEADLINE_BEFORE_MEETING_EN = /\b(?:before|by|ahead of|prior to|in time for|until)\s+(?:(?:the|our|your|a|an|this|next|tomorrow['’]?s|today['’]?s|tonight['’]?s)\s+)*(?:[\w']+\s+){0,4}$/i;
    const DEADLINE_BEFORE_MEETING_HE = /(?:לפני|עד)\s+ה?\s*$/;
    function deadlineBeforeMeeting(before) {
      return DEADLINE_BEFORE_MEETING_EN.test(before) || DEADLINE_BEFORE_MEETING_HE.test(before);
    }
    function meetingAsserted(pattern) {
      const sentences = String(text || '').split(/(?<=[.!?;])\s+|\n+/);
      for (const s of sentences) {
        const hit = s.match(pattern);
        if (!hit) continue;
        // הפגישה matches on פגישה, leaving the definite ה in front of the
        // noun. That ה is the article, not a word in the negation window —
        // without moving it, "לא נוכל לקיים את הפגישה" never looks negated.
        let index = hit.index;
        if (index > 0 && s.charAt(index - 1) === 'ה' && (index === 1 || /\s/.test(s.charAt(index - 2)))) index -= 1;
        if (FlowJudgment.isNegatedBefore(s.slice(0, index))) continue;
        if (MEETING_SOFT.test(s)) continue;
        if (deadlineBeforeMeeting(s.slice(0, index))) continue;
        // "Following up on our call" names a call that already happened.
        // It is not a meeting to schedule, and the date in the next
        // sentence is the ask, not that call.
        const noun = String(hit[1] || hit[0] || '');
        if (/^call$/i.test(noun) && /\bfollowing up on (?:our|the|that) call\b/i.test(s) && !/\b(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}|next\s+\w+)\b/i.test(s)) continue;
        return true;
      }
      return false;
    }
    const hasMeetingNoun = meetingAsserted(MEETING_NOUN) || meetingAsserted(MEETING_NOUN_HE);
    // A resolved date or a resolved money figure — "something concrete
    // enough to actually act on" — is one of two ways to clear both
    // COMMITMENT_OF_READER's evidence bar below (see
    // hasConcreteCommitmentObject just below) and REQUEST's (see
    // hasConcreteRequestObject further down, computed after requestWhat is
    // known). A bare "you agreed to help" with nothing dated, priced, or
    // naming a concrete object attached is exactly the false-positive shape
    // the scorer's own money-alone penalty already refuses ("A figure
    // alone, with nothing decided").
    const hasResolvedDate = Boolean(facts.date && facts.date.iso);
    const hasConcreteAnchor = Boolean(facts.money) || hasResolvedDate;
    const isReaderCommit = READER_COMMIT.test(text) || READER_COMMIT_HE.test(text);

    // COMMITMENT_OF_READER's second evidentiary path, alongside
    // hasConcreteAnchor above — the same widening REQUEST got via
    // hasConcreteRequestObject a few lines down. "You agreed to send the
    // contract" names exactly what closing this commitment means, which is
    // real evidence a person would act on immediately, independent of
    // whether a date or dollar figure was also stated. Tested against the
    // actual matched commitment sentence (not the whole message) for the
    // same false-positive reason requestWhat is used instead of raw text —
    // see REQUESTED_OBJECT/REQUESTED_OBJECT_HE's own header comment.
    const commitmentWhat = isReaderCommit ? whatText(text, [READER_COMMIT, READER_COMMIT_HE]) : null;
    const hasConcreteCommitmentObject = Boolean(commitmentWhat) &&
      (REQUESTED_OBJECT.test(commitmentWhat) || REQUESTED_OBJECT_HE.test(commitmentWhat));

    // The one sentence a human would point to as "this is the actual ask" —
    // computed once, independent of which type ends up winning, and folded
    // into every returned Intent's entities as `requestWhat`. This is what
    // lets actions.js draft a reply that addresses the real ask ("could you
    // confirm you can make it") rather than restating the event itself
    // ("Meeting Sep 22 15:00") when a message carries BOTH a clear event
    // and a request — see finish() below and actions.js's own comment on
    // the SCHEDULED_EVENT + handoff combined case.
    const requestWhat = s.flags.handoff ? whatText(text, REQUEST_PATTERNS) : null;

    // REQUEST's second evidentiary path, alongside hasConcreteAnchor above:
    // a real request verb/phrase aimed at a named, tangible object ("could
    // you send the invoice") is unambiguous evidence a person would act on
    // immediately, with no date or dollar figure needed to make it real —
    // see REQUESTED_OBJECT/REQUESTED_OBJECT_HE's own header comment for why
    // this doesn't reopen the door to vague chatter. Tested against
    // requestWhat (the actual matched sentence), not the whole message, so
    // an unrelated document mention three paragraphs away from a vague
    // "let me know your thoughts" can't manufacture evidence for it.
    const hasConcreteRequestObject = Boolean(requestWhat) && requestObjectTest(requestWhat);

    // The actual noun REQUESTED_OBJECT/HE matched on ("invoice", "resume",
    // "NDA"...), not just whether one was present — this is what lets
    // background.js's Drive auto-attach (gmailDraftWrite) search Drive by
    // the specific thing being asked for instead of only ever offering the
    // thread's own existing attachment or a manually-picked file. .exec(),
    // not .test(), specifically to capture group 1 (every alternative in
    // both patterns is wrapped in the same outer capturing group).
    const requestedObjectMatch = requestWhat && requestObjectExec(requestWhat);
    const requestedObjectTerm = requestedObjectMatch ? requestedObjectMatch[1] : null;

    // Every raw signal, independent of which type ends up winning — the
    // decision layer (actions.js) reads this to notice a message is
    // multi-actionable (a meeting invite that ALSO asks for confirmation is
    // still an EVENT here, but actions.js can still see signals.handoff and
    // propose a reply draft alongside the calendar event).
    const signals = {
      hasMeetingNoun, hasConcreteAnchor, hasConcreteRequestObject, hasConcreteCommitmentObject, isReaderCommit,
      handoff: s.flags.handoff,
      slotAsk: Boolean(s.flags.slotAsk),
      hasDate: Boolean(facts.date && facts.date.iso),
      hasTime: Boolean(facts.time),
      hasMoney: Boolean(facts.money),
      score: s.total, threshold,
      meetingVeto: meetingPlanVeto(((ctx && ctx.subject) ? String(ctx.subject) + '\n' : '') + String(text || ''))
    };

    // personalClose is set only on the Trusted Do It gates: an explicit
    // follow-up or send ask, a dated commitment, a confirmed amount, and a
    // calendar hold (a commitment that names a clock time, or an explicit
    // ask to meet at a clock time). A bare meeting announcement stays
    // untagged so personal close memory cannot treat it as one of those
    // closes. Absent on a miss.
    // Family metadata is filled in after the hit is known. Declared here
    // so finish() can read it; assigned once the soft/settled gates exist.
    const familyBox = { hit: null };
    function familyAgrees(type, fam) {
      if (!fam || fam.suppress) return false;
      if (fam.family === 'A' || fam.family === 'C' || fam.family === 'F' || fam.family === 'I' || fam.family === 'J') return type === TYPES.REQUEST;
      if (fam.family === 'B') return type === TYPES.REQUEST || type === TYPES.SCHEDULED_EVENT || type === TYPES.DECISION_TO_LOG;
      if (fam.family === 'D' || fam.family === 'G') return type === TYPES.SCHEDULED_EVENT || type === TYPES.DECISION_TO_LOG;
      if (fam.family === 'E') return type === TYPES.DECISION_TO_LOG || type === TYPES.REQUEST;
      return false;
    }
    function finish(type, confidence, entities, personalClose, googleClose) {
      // Negative, phishing, and marketing stay quiet even when the mail
      // is the user's own. A matched gate does not turn that into a task.
      if (addressedToSelf(ctx)) {
        const blob = ((ctx && ctx.subject) ? String(ctx.subject) + '\n' : '') + String(text || '');
        const held = selfContentStaysQuiet(blob);
        if (held) return stayQuiet(held === 'phishing' ? 'family' : 'hedge');
      }
      // A past day can still sit on facts — "the invoice that was due
      // March 3, 2024" — but it is not the deadline of this close. The
      // title, the "when" in the chip sentence, and the task's dateIso
      // would otherwise file that old day. A family that resolved a
      // different, future day (a reschedule's new slot) keeps that day.
      const famDate = entities && entities.dateIso;
      const factIso = facts.date && facts.date.iso;
      if (isPast && (!famDate || famDate === factIso)) {
        entities = Object.assign({}, entities, { when: null, dateIso: null });
      }
      const intent = {
        type, confidence,
        entities: Object.assign({ requestWhat, requestedObjectTerm }, entities),
        label: labelFor(type), signals, facts
      };
      if (personalClose) intent.personalClose = personalClose;
      if (googleClose) intent.googleClose = googleClose;
      // "No need to reply, just get it done" still does the work. The draft stays off.
      if (replyCancelOnly(text)) intent.noReplyDraft = true;
      // A note the user sent to themselves is a task, for every kind.
      // The draft stays off. It is not Reply requested, and it is not quiet.
      if (addressedToSelf(ctx)) {
        intent.noReplyDraft = true;
        intent.selfTask = true;
        // A note to self is the task. It is not a Drive save and not a draft.
        delete intent.googleClose;
      }
      if (/\bplease\s+create\s+a\s+task\b/i.test(text)) intent.noReplyDraft = true;
      // "Please remember to renew…" / "תזכיר לי" is the task. A reply draft is not the close.
      // "תזכורת" (a payment reminder) is not this phrase.
      if (/\bplease remember to\b/i.test(text) || /(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+ל|אל\s+תשכח(?:י|ו)?)(?![\u0590-\u05FF])/.test(text)) intent.noReplyDraft = true;
      const fam = familyBox.hit;
      // A note to self is a plain task. Family A is the file chain, and
      // this mail is not that chain and not an attach to an invite.
      const selfFileChain = Boolean(intent.selfTask && fam && fam.family === 'A');
      if (familyAgrees(type, fam) && !selfFileChain) {
        intent.closeFamily = fam.family;
        if (fam.fileTarget) intent.fileTarget = fam.fileTarget;
        if (fam.createWhenMissing) intent.createWhenMissing = true;
        // Latest clear ask wins. The request pattern quotes the first
        // handoff sentence; a later sentence that the family walk kept
        // ("send the contract instead") is the close, including the file
        // the draft would look up.
        if (fam.what) {
          const current = intent.entities.what || '';
          const famAt = text.indexOf(fam.what);
          const curAt = current ? text.indexOf(current) : -1;
          if (famAt > curAt) {
            intent.entities.what = fam.what;
            if (fam.requestWhat) intent.entities.requestWhat = fam.requestWhat;
            if (fam.objectTerm) intent.entities.requestedObjectTerm = fam.objectTerm;
          }
        }
      }
      // "לצרף … לזימון" is the inbound file track. A note the user sent
      // to themselves is the task, decided before this plan runs.
      const invitePlan = addressedToSelf(ctx) ? null : attachToInvitePlan(text);
      if (invitePlan && type === TYPES.REQUEST) {
        intent.inviteFile = true;
        intent.label = invitePlan.label;
        intent.inviteDraft = invitePlan.draft;
      }
      // The task names the work. "Reply requested" is the draft, and this mail declined one.
      if (intent.noReplyDraft && !intent.inviteFile) {
        const what = String((intent.entities && intent.entities.what) || '').replace(/\s+/g, ' ').trim();
        const iso = intent.entities && intent.entities.dateIso;
        const dateText = iso ? humanDateFallback({ iso: iso }) : '';
        if (what) intent.label = what + (dateText ? ' by ' + dateText : '');
      }
      // A note to self is that task. "I will <verb> X" is verb plus object.
      // Log commitment is a promise in a mail to someone else, never this note.
      // A call or a meeting at a fixed time with no object in the body is
      // Call about the subject, or שיחה בנושא. A cancelled call (בולה) stays quiet.
      // The single step is a task, so the kind is not an event.
      if (intent.selfTask && !intent.inviteFile) {
        intent.noReplyDraft = true;
        if (selfCallCancelled(text) || meetingPlanVeto(text)) return stayQuiet('hedge', { noRescue: true });
        if (type === TYPES.SCHEDULED_EVENT) intent.type = TYPES.REQUEST;
        const subject = ctx && ctx.subject;
        const pay = payAsk(prepareAsk(text));
        // A figure that was agreed is Log $X agreed. "We agreed to <verb>"
        // has no figure, so that note stays the verb plus the object.
        if (type === TYPES.DECISION_TO_LOG && facts && facts.moneyText && !pay) {
          const iso = intent.entities && intent.entities.dateIso;
          const dateText = iso ? humanDateFallback({ iso: iso }) : '';
          intent.label = FlowJudgment.neutralTitle({ moneyText: facts.moneyText, dateText: dateText || null });
        } else {
          const decided = selfDecisionTitle(text, facts);
          let titled = decided || selfAskTitle(text, subject, ctx);
          if (!decided && !usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
          const callTitled = haveACallTitle(text, ctx, humanWhen(facts && facts.date, facts && facts.time));
          if (usableSelfTitle(callTitled)) titled = callTitled;
          // The body sentence is never the title. No verb plus object, no card.
          if (!decided && !usableSelfTitle(titled)) return stayQuiet('hedge', { noRescue: true });
          intent.label = titled;
        }
        const labelNow = String(intent.label || '').trim();
        if (!/^(?:Decision|החלטה): \S/.test(labelNow) && !usableSelfTitle(labelNow)) return stayQuiet('hedge', { noRescue: true });
        if (intent.confidence === 'low') intent.confidence = 'high';
        // "Remind me to renew the domain on Friday" is that task, due Friday.
        // The day is already on facts. The task step reads entities.dateIso.
        if (/\bremind me to\b/i.test(text) && facts && facts.date && facts.date.iso && intent.entities && !intent.entities.dateIso) {
          intent.entities.dateIso = facts.date.iso;
        }
      }
      // Outlook may show a hold that has no reply draft. Only an explicit
      // hold: a family D meet or slot, or "can we meet" / "תשמור לי את הזמן".
      // A file placed on a calendar is not that exemption.
      if (personalClose === 'calendar-hold') {
        const held = familyBox.hit;
        const fileHold = Boolean(held && held.fileTarget);
        const familyMeet = Boolean(held && held.family === 'D' && held.type === 'event' && held.personalClose === 'calendar-hold');
        if (!fileHold && (familyMeet || EXPLICIT_MEETING_ASK.test(text) || EXPLICIT_MEETING_ASK_HE.test(text))) {
          intent.explicitHold = true;
        }
      }
      return gateCreateWhenMissing(intent);
    }
    // A weak create-when-missing judgment stays silent. Field count does
    // not. Up to four missing fields are a card; more than four is a
    // chat fill of those names only.
    function gateCreateWhenMissing(intent) {
      if (!intent || !Array.isArray(ctx.missingSlots)) return intent;
      if (typeof FlowCloseFamilies === 'undefined' || !FlowCloseFamilies.route) return intent;
      return FlowCloseFamilies.route(intent, ctx.missingSlots);
    }

    // The self-calibration outlet for the three hard-gated types below — see
    // FlowJudgment.isTypeSuppressed's own header comment for the full
    // reasoning. Reads the SAME ctx.calibrationByType map applyTypeAdjustment
    // reads for the two score-based types further down, keyed by the type
    // being gated, so this needs no new storage shape and no new call site
    // in content-gmail.js's existing calibrate('click'|'dismiss', ...) calls.
    function suppressed(type) {
      return FlowJudgment.isTypeSuppressed(ctx.calibrationByType && ctx.calibrationByType[type], ctx.now);
    }

    // --- 1. SCHEDULED_EVENT: hard gate, not score-based. Meeting noun + a
    //        resolved date, or none — and never when the same message also
    //        says the meeting itself was called off — "the 3pm Friday sync
    //        is cancelled" must not become a new Calendar entry for that
    //        meeting. Precision over recall: a missed event chip costs one
    //        click; a calendar entry for a meeting that was just cancelled
    //        is actively wrong. Same refusal for a recap of a meeting that
    //        already happened — see EVENT_RECAP above — and for a message
    //        that plainly names a date already in the past, recap phrasing
    //        or not — see isPastDate.
    //
    //        facts.time is no longer required. "Let's meet Tuesday" names a
    //        meeting and a day exactly as unambiguously as "Let's meet
    //        Tuesday at 3pm" does — the missing clock time is a real gap in
    //        what got planned, not a reason to stay silent about the
    //        meeting existing at all. background.js's googleCalendarWrite
    //        creates a real all-day Calendar entry (Google's own {date: ...}
    //        shape, not {dateTime: ...}) when hour/minute come through null,
    //        rather than erroring the way it used to when they were simply
    //        missing.
    // A cancel word that governs one clause does not call off a different
    // event that is still on and is asked for. "ההזמנה בוטלה, אבל הפגישה
    // בתוקף" and "the kickoff is cancelled, can we sync Thursday" keep the
    // new slot. A mail whose only event was postponed stays called off.
    const calledOff = (s.flags.lost || EVENT_CALLED_OFF.test(text) || EVENT_CALLED_OFF_HE.test(text))
      && !liveWithAsk(vetoClauses(text));
    const isRecap = EVENT_RECAP.test(text) || EVENT_RECAP_HE.test(text);
    const isPast = isPastDate(facts.date && facts.date.iso, ctx.now);
    // infoOrNoise is the same veto as s.flags.noise, for phrasings the
    // scorer's own list does not name yet (FYI, a quick bump, "Accepted:").
    // It also stops the score path below: a FYI wrapped around a strong
    // approval would otherwise clear 50 after the hard gates declined.
    // "Reminder: call the bank next Tuesday" is the person's own reminder.
    // It is a task, not a calendar-acceptance notice.
    const bankCallReminder = /\breminder\b[\s\S]{0,80}\bcall the bank\b/i.test(text)
      && /\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
    const infoOrNoise = infoOnlyMail(text, ctx) || (EXTRA_NOISE.test(text) && !bankCallReminder);
    const blocked = s.flags.noise || infoOrNoise;
    // Softness is about the ask that would actually chip. The quoted
    // sentence is the first handoff, so a conditional opener ("במידה
    // ותוכל, תשלח לי את הטיוטה") used to hide a later clear send. A later
    // handoff sentence that is not itself soft is the close.
    function sentenceIsSoft(sentence) {
      return SOFT_ASK.test(sentence) || SOFT_ASK_HE.test(sentence);
    }
    let askIsSoft = Boolean(requestWhat) && sentenceIsSoft(requestWhat);
    if (askIsSoft) {
      const parts = String(text || '').split(/(?<=[.!?])\s+|\n+/);
      for (let i = 0; i < parts.length; i++) {
        const sentence = parts[i].trim();
        if (sentence.length <= 12 || sentence.length >= 320) continue;
        let handoff = false;
        for (let p = 0; p < REQUEST_PATTERNS.length; p++) {
          const pattern = REQUEST_PATTERNS[p];
          if (new RegExp(pattern.source, pattern.flags).test(sentence)) { handoff = true; break; }
        }
        if (handoff && !sentenceIsSoft(sentence)) { askIsSoft = false; break; }
      }
    }
    // Names a silence the chip path already chose. It does not add a
    // return. quietHint is used only where classify already returned
    // type null with no type of its own.
    let quietHint = blocked ? 'noise' : (askIsSoft ? 'hedge' : null);
    // A mail the user sent to their own address is a task. Negative,
    // phishing, and marketing stay quiet. A title that is not verb plus
    // object stays quiet too: one word is not a title.
    function selfContentStaysQuiet(raw) {
      const blob = String(raw || '');
      // A hedge or a hold inside the if-clause does not silence the note.
      // The main clause does. "If they don't reply by Friday, call Dana"
      // is the task Call Dana.
      const main = withoutIfClause(blob);
      // These gates win before a note to self becomes a task, and before
      // any Follow up title. A live ask that is not one of them still does.
      // "lmk today if the launch checklist works" is the task, on a note
      // to self. The word if here is the thing to check, not a hedge.
      if (/\blmk\b/i.test(blob) && /\bif the\b/i.test(blob) && /\bworks\b/i.test(blob)) return '';
      if (selfPastDone(blob)) return 'past';
      if (phishingOrNegative(blob)) return 'phishing';
      if (marketingWebinar(blob)) return 'marketing';
      if (/\bexclusive offer\b/i.test(blob)) return 'marketing';
      if (/\bsign up\b/i.test(blob) && /\b(?:save|sae)\b/i.test(blob)) return 'marketing';
      if (/\bsign up\b/i.test(blob) && /\$\s?\d/.test(blob)) return 'marketing';
      if (/\b(?:save|sae)\s+\$[\d,]/i.test(blob) && /\bplan\b/i.test(blob)) return 'marketing';
      if (/\b(?:unsubscribe|shop now|book your demo|last chance|email preferences)\b/i.test(blob)) return 'marketing';
      if (/\b\d+\s*%\s*off\b/i.test(blob)) return 'marketing';
      if (/\bupgrade\b/i.test(blob) && /\bfree\b/i.test(blob)) return 'marketing';
      if (/להסרה|ניוזלטר|מבצע|שדרגו|הירשמו|הנחה|סייל|חודשיים חינם|חודש חינם|מקומות אחרונים|רשימת התפוצה|הטבה בלעדית|מנוי שנתי|רק השבוע/.test(blob)) return 'marketing';
      if (AUTO_REPLY_TEXT.test(blob)) return 'ooo';
      if (/מענה אוטומטי|בחפשה|בחופשת לידה|אחזור אליך בהקדם|תודה על פנייתך/.test(blob)) return 'ooo';
      if (/\bno reply (?:needed|necessary|required)\b/i.test(blob) || /\bfor your records\b/i.test(blob)) return 'fyi';
      if (/\bfor reference only\b/i.test(blob) || /\bfor your awareness\b/i.test(blob)) return 'fyi';
      if (/לא נדרש|לעיונך|רק עדכון|עדכון קצר|לתיעוד בלבד/.test(blob)) return 'fyi';
      if (/\b(?:quick update|fyi|for your information|just an update|heads[- ]up)\b/i.test(blob) || /רק לעדכן|לידיעתך|לידיעה/.test(blob)) {
        if (!/\b(?:please|could you|can you)\b/i.test(blob) && !/(?:בבקשה|תוכל)/.test(blob)) return 'fyi';
      }
      if (selfAckNote(blob)) return 'ack';
      if (/\bforwarding for visibility\b/i.test(blob) || /-----Original Message-----/i.test(blob) || /Begin forwarded message/i.test(blob)) return 'quoted_forward';
      if (vocativeIsOther(blob, ctx)) return 'third_party';
      if (/\b(?:maybe|perhaps|possibly|if you get a chance|if you have time|if it(?:'|’)s not too much trouble|at some point|eventually|when convenient|whenever you|i might|hoping to|might be worth|tentatively|we might need|i(?:'|’)ll let you know)\b/i.test(main)) return 'hedge';
      if (/(?:^|\s)אולי|אם יוצא|מתישהו|אם יש לך זמן|כשיהיה לך|מתי שנוח|נראה לי|יכול להיות ש/.test(main)) return 'hedge';
      if (/,\s*מקווה|מקווה\s*[.!]?\s*$/.test(main)) return 'hedge';
      const negBlob = withoutIfClause(blob.replace(/\bdon'?t\s+forget\b/ig, ' ').replace(/\bno\s+ne+d\s+to\s+reply\b/ig, ' '));
      if (/\b(?:do not|don'?t|no need to|never mind|won'?t|will not)\b/i.test(negBlob) || /(?:^|[^\u0590-\u05FF])אל\s*ת/.test(negBlob) || /לא\s+צריך|אין\s+צורך|אין\s+צר[וו]?ך/.test(negBlob) || /לא\s+(?:נקיים|תהיה|נעשה)/.test(negBlob) || /(?:^|[^\u0590-\u05FF])בוטל(?:ה)?(?:[^\u0590-\u05FF]|$)/.test(negBlob)) return 'negative';
      if (/\blast\s+(?:week|night|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(blob) || /\bfollowing (?:our|the|that) call last\b/i.test(blob)) return 'past';
      if (/\byesterday\b/i.test(blob) && /\b(?:meeting|met|chat|chatting|speaking|spoke|call)\b/i.test(blob)) return 'past';
      if (/\b(?:was|were) due\b/i.test(blob) && /\bpaid\b/i.test(blob)) return 'past';
      if (/\bwe had our\b/i.test(blob)) return 'past';
      if (/\b(?:was|were) on\s+(?:moday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(blob)) return 'past';
      if (/\bit was great (?:speaking|meeting|chatting)\b/i.test(blob) || /\bgreat (?:meeting|chatting)\b/i.test(blob)) return 'past';
      if (/\bthanks for the\b/i.test(blob) && /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday)\b/i.test(blob)) return 'past';
      if (/אתמול|בשבוע שעבר|היה נעים|נהניתי|שמחתי שדיברנו|תודה שהקדשת|הייתה ביום|היה ביום|הפגישה הייתה/.test(blob)) return 'past';
      const year = blob.match(/\b(19\d{2}|20\d{2})\b/);
      const nowYear = ctx.now ? new Date(ctx.now).getFullYear() : 2026;
      if (year && +year[1] < nowYear && /\b(?:meeting|call|sync|review|interview|invoice|due|paid)\b/i.test(blob)) return 'past';
      // A modal main clause, or an undecided line anywhere in the mail,
      // is not a task. An if-clause is never the title.
      if (undecidedAnywhere(blob)) return 'conditional';
      if (conditionalMainIsNotAction(blob, main)) return 'conditional';
      if (/\bno decision yet\b/i.test(main) || /\bnot decided yet\b/i.test(main)) return 'conditional';
      if (/\bsuppose we\b/i.test(main) || /\bwould th?a?t work\b/i.test(main) || /\bwould tht work\b/i.test(main)) return 'conditional';
      if (/נניח ש|זה יעבוד אצלכם|טרם הוחלט|עוד לא סגרנו/.test(main)) return 'conditional';
      if (/\bno longer needed\b/i.test(blob)) return 'cancelled';
      const families = typeof FlowCloseFamilies !== 'undefined' ? FlowCloseFamilies : null;
      if (families && typeof families.commitmentHeldBack === 'function' && families.commitmentHeldBack(main)) return 'conditional';
      if (families && typeof families.sentenceLiveAsk === 'function' && families.sentenceLiveAsk(main)) return '';
      if (EVENT_CALLED_OFF_HE.test(blob)) return 'negative';
      if (/\b(?:postpon(?:e|ed|ing)|cancel(?:led|ed|ing)?|called off|won'?t happen|will not happen|isn'?t happening)\b/i.test(blob)) return 'negative';
      return '';
    }
    function rescueInboundActionRequired() {
      if (addressedToSelf(ctx)) return null;
      if (!/פעולה\s+נדרשת\s+מצד(?:ך)?:/i.test(text)) return null;
      const subject = ctx && ctx.subject;
      const decided = selfDecisionTitle(text, facts);
      let titled = decided || selfAskTitle(text, subject, ctx);
      if (!decided && !usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
      if (!decided && !usableSelfTitle(titled)) return null;
      const made = finish(TYPES.REQUEST, 'high', { what: titled });
      if (!made || !made.type) return null;
      made.label = titled;
      made.selfTask = true;
      made.noReplyDraft = true;
      return made;
    }
    function rescueSelfSent(code) {
      if (code === 'calibrated') return null;
      if (!addressedToSelf(ctx)) return null;
      const blob = ((ctx && ctx.subject) ? String(ctx.subject) + '\n' : '') + String(text || '');
      if (selfContentStaysQuiet(blob)) return null;
      if (selfCallCancelled(text) || meetingPlanVeto(text)) return null;
      const subject = ctx && ctx.subject;
      const decided = selfDecisionTitle(text, facts);
      let titled = decided || selfAskTitle(text, subject, ctx);
      if (!decided && !usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
      const callTitled = haveACallTitle(text, ctx, humanWhen(facts && facts.date, facts && facts.time));
      if (!decided && usableSelfTitle(callTitled)) titled = callTitled;
      if (!decided && !usableSelfTitle(titled)) return null;
      const made = finish(TYPES.REQUEST, 'high', { what: titled });
      if (!made || !made.type) return null;
      made.label = titled;
      made.selfTask = true;
      made.noReplyDraft = true;
      return made;
    }
    function stayQuiet(code, extra) {
      // rescueSelfSent refuses a mail the quiet gates already named
      // (hedge, phishing, marketing, FYI, out of office, a third party,
      // a past recap, a negation, a conditional). Any other self-sent
      // note is still the task, including one this path had filed as quiet.
      if (!(extra && extra.noRescue)) {
        const inboundAction = rescueInboundActionRequired();
        if (inboundAction) return inboundAction;
        const rescued = rescueSelfSent(code);
        if (rescued) return rescued;
      }
      const row = { type: null, signals: signals, facts: facts, quiet: code };
      if (extra && extra.noRescue) {
        const rest = Object.assign({}, extra);
        delete rest.noRescue;
        if (Object.keys(rest).length) Object.assign(row, rest);
      } else if (extra) Object.assign(row, extra);
      return row;
    }
    // "once" / "hoping" only withdraw the commitment sentence they sit in.
    // A plain agreement in the next sentence still counts. A message whose
    // only agreement is contingent does not.
    const contingent = commitmentIsContingent(text);
    const settled = ALREADY_SETTLED.test(text);
    if (!quietHint && (contingent || settled)) quietHint = 'hedge';
    familyBox.hit = (typeof FlowCloseFamilies !== 'undefined' && !blocked && !askIsSoft && !settled)
      ? FlowCloseFamilies.assess(text, facts, { now: ctx.now, senderEmail: ctx.senderEmail })
      : null;
    function fromFamily(fam) {
      if (!fam || fam.suppress) return null;
      // A contradicted or invalid day is not a day a family may book.
      // A reply whose deadline was dropped is still the reply, not a hold.
      if (facts.date && (facts.date.contradictsWeekday || facts.date.invalidDate || facts.date.dropped)) return null;
      if (suppressed(fam.type)) return null;
      const date = fam.date || null;
      const time = fam.time || null;
      if (date && date.iso && isPastDate(date.iso, ctx.now)) return null;
      const entities = {
        who, amount,
        what: fam.what,
        requestWhat: fam.requestWhat || null,
        requestedObjectTerm: fam.objectTerm || null,
        when: humanWhen(date, time),
        dateIso: date && date.iso
      };
      if (time && Number.isInteger(time.hour)) {
        entities.hour = time.hour;
        entities.minute = time.minute;
      }
      if (fam.calendarOp === 'delete' || fam.calendarOp === 'update') entities.calendarOp = fam.calendarOp;
      if (fam.fromDate && fam.fromDate.iso) {
        entities.fromDateIso = fam.fromDate.iso;
        if (fam.fromTime && Number.isInteger(fam.fromTime.hour)) {
          entities.fromHour = fam.fromTime.hour;
          entities.fromMinute = fam.fromTime.minute;
        }
      }
      const intent = finish(fam.type, fam.confidence, entities, fam.personalClose || null);
      if (!intent || !intent.type) return intent;
      // A note to self stays a plain task. Family A would mark it as the file chain.
      if (!(intent.selfTask && fam.family === 'A')) {
        intent.closeFamily = fam.family;
        if (fam.fileTarget) intent.fileTarget = fam.fileTarget;
        if (fam.createWhenMissing) intent.createWhenMissing = true;
      }
      return gateCreateWhenMissing(intent);
    }
    function labelFor(type) {
      const source = isPast ? Object.assign({}, facts, { date: null }) : facts;
      const enriched = isPast ? Object.assign({}, enrichedFacts, { dateText: null }) : enrichedFacts;
      const mailHe = /[\u0590-\u05FF]/.test(String(text || '')) || (ctx && ctx.lang === 'he');
      return shortLabel(type, source, enriched, mailHe ? 'he' : 'en');
    }
    // s.flags.noise: a pitch fingerprint, mailing-list boilerplate, calendar
    // acceptance mail, or an automated sender. The score already penalises
    // these below the bar. Hard gates do not read that total, so without
    // this they chip on "just bumping this — send the invoice" and on
    // "Dana has accepted this invitation".
    //
    // A gate that matched and was then suppressed must return null here,
    // not fall through. "You agreed to send the invoice by Friday" is both
    // a reader commitment AND an asserted "agreed" + date; if the account
    // has suppressed commitments, the dated-commitment gate below would
    // otherwise log it as a decision — the same chip, a different label.
    // A family veto (cancel with no new slot, two file targets, a retraction,
    // a doc comment we cannot write) is silence. A reschedule that names
    // one new slot is that slot, not the old time the event gate would file.
    // A reply ask addressed to someone else is not this person's close,
    // including when a date makes a family hold look like their meeting.
    const replyAsk = explicitReplyAsk(text);
    const replyOk = !replyAsk || replyDraftAllowed(text, ctx);
    const replyMisaddressed = replyAsk && replyAimedElsewhere(text, ctx);
    if (replyMisaddressed && !quietHint) quietHint = 'hedge';
    // Own outbound, a note to self, or a vocative that names someone else
    // is not this person's Do It. "אבי שלום," plus an ask is that vocative.
    // A hold does not get past that by not being a reply ask.
    // A greeting with no cached name is not that quiet and not an offer.
    // The host judges the same mail again once the profile names are stored,
    // or after the name wait (at most 2s), with whatever names are known.
    if (mailIsOwn(ctx) || thirdPartyQuote(text)) return stayQuiet('hedge');
    if (greetingAwaitingNames(text, ctx)) {
      return { type: null, namesPending: true, signals: signals, facts: facts };
    }
    if (greetingUnconfirmed(text, ctx)) return stayQuiet('hedge', { noRescue: true });
    if (mailIsOwn(ctx) || vocativeIsOther(text, ctx) || ccOnlyWithoutGreeting(text, ctx) || thirdPartyQuote(text)) return stayQuiet('hedge');
    if (bankChangePayment(text)) return stayQuiet('family');
    // A negated or conditional ask stays quiet. A sentence that still asks
    // (please pay, if you can send, let's meet) is the close.
    if (!blocked && typeof FlowCloseFamilies !== 'undefined' && typeof FlowCloseFamilies.commitmentHeldBack === 'function' && FlowCloseFamilies.commitmentHeldBack(text)) {
      return stayQuiet('hedge');
    }
    // A past-dated "we agreed to" the user sent themself is still the
    // promise. The dated gate requires a future day, so October 14 on the
    // 16th never reached a title. The title is Log commitment.
    if (!blocked && addressedToSelf(ctx) && weAgreedPromise(text) && isPast) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: 'Log commitment',
        when: null,
        dateIso: null
      });
    }
    // "Find a time" names no slot, so family D keeps it off the calendar, and family H reads "perhaps we could" as a hedge. Asking the reader for a time is still a
    // request: the card is a reply that offers times, not a hold.
    const slotOnly = Boolean(familyBox.hit && (familyBox.hit.family === 'D' || familyBox.hit.family === 'H') && s.flags && s.flags.slotAsk);
    if (familyBox.hit && familyBox.hit.suppress && !slotOnly) {
      if (ctx.debug) {
        let matched = familyBox.hit.matched || null;
        if (Array.isArray(matched)) matched = matched.join(', ').slice(0, 80);
        else if (matched != null) matched = String(matched).slice(0, 80);
        console.log('[Glance debug]', {
          messageId: ctx.messageId || null,
          family: familyBox.hit.family,
          rule: familyBox.hit.rule || null,
          reason: 'family',
          suppress: true,
          matched: matched
        });
      }
      return stayQuiet('family');
    }
    if (!replyMisaddressed && familyBox.hit && familyBox.hit.family === 'G') {
      // A delete of the old slot must not win when another event is still
      // on and asked for. That event is the close.
      const replaced = familyBox.hit.calendarOp === 'delete' && liveWithAsk(vetoClauses(text));
      if (!replaced) {
        const viaMove = fromFamily(familyBox.hit);
        if (viaMove) return viaMove;
      }
    }
    // A clear family D hold or dated promise is that write. The meeting
    // gate would otherwise file "let's sync Tuesday at 3pm" as a calendar
    // event plus a reminder task.
    // "לצרף … לזימון" asks to put a file on an invite that already exists.
    // The meeting noun is that invite, not a new event to schedule.
    // One predicate, FlowIntent.attachToInvitePlan. Hebrew and English.
    // The file track does not wait for a family to name the object. A
    // missing file stays the card, never a banner and never silence.
    const attachToInvite = Boolean(attachToInvitePlan(text));
    // The file track is an inbound ask aimed at this person. A mail they
    // sent to someone else is not that ask. A note to their own address
    // is the task, with no draft, and it is decided before the file plan.
    if (!blocked && attachToInvite && addressedToSelf(ctx)) {
      const noted = finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'follow-up-ask');
      if (noted) noted.selfAttachTask = true;
      return noted;
    }
    if (!blocked && attachToInvite && sentByReader(ctx)) return stayQuiet('hedge');
    if (!blocked && !replyMisaddressed && attachToInvite) {
      return finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'follow-up-ask');
    }
    if (!replyMisaddressed && !attachToInvite && !calledOff && !isRecap && !isPast && familyBox.hit && familyBox.hit.family === 'D' &&
        (familyBox.hit.personalClose === 'calendar-hold' || familyBox.hit.personalClose === 'dated-commitment')) {
      const viaHold = fromFamily(familyBox.hit);
      if (viaHold) return viaHold;
    }
    // Family H: a later confirmed amount, hold, or promise is the write.
    // An earlier "please send" must not draft a reply over that close.
    if (!replyMisaddressed && familyBox.hit && !familyBox.hit.suppress && familyBox.hit.what && familyBox.hit.type && familyBox.hit.type !== TYPES.REQUEST) {
      const at = text.indexOf(familyBox.hit.what);
      const head = at > 0 ? text.slice(0, at) : '';
      const earlierAsk = head && (
        /\b(?:could you|can you|please (?:send|forward|chase)|i need)\b/i.test(head) ||
        /(?:אפשר לשלוח|בבקשה תשלח|תשלח את|תעקוב)/.test(head) ||
        /\b(?:got \d+ minutes|are you free|let's meet)\b/i.test(head)
      );
      if (earlierAsk) {
        const viaLatest = fromFamily(familyBox.hit);
        if (viaLatest && viaLatest.type) return viaLatest;
      }
    }
    // A meeting noun inside "before/by … meeting" or "לפני הפגישה" is the
    // deadline of the request, not evidence of a meeting to schedule. A
    // schedule close still needs an explicit proposal to meet, or a time
    // offered for choice (family D / the explicit-ask gate below).
    // "Call Tom October 19 at 10:00" phones a person. It is a task, not a
    // meeting. A weekday ("Call Maya Tuesday") is still the meeting.
    // "a call" / "the call" / "schedule a call" still is.
    const phoneSomeone = /(?:^|[\n\r])\s*Call\s+[A-Z][a-zA-Z'’-]{1,40}\b/.test(String(text || ''))
      && !/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(String(text || ''));
    // A clock time the extractor actually resolved. Missing either field is
    // not a time we may invent — date-only meetings stay all-day events on
    // the existing schedule process, and date-only commitments stay tasks.
    const clock = facts.time && Number.isInteger(facts.time.hour) && Number.isInteger(facts.time.minute) &&
      facts.time.hour >= 0 && facts.time.hour <= 23 && facts.time.minute >= 0 && facts.time.minute <= 59
      ? facts.time : null;
    const pendingChoices = Boolean(facts.date && Array.isArray(facts.date.choices) && facts.date.choices.length >= 2 && !facts.date.iso);
    // A meeting noun plus a resolved day is the event. Two unread dates
    // are an event only when a meeting noun and a clock are both written.
    // A bare weekday and a slash, with no meeting noun, stays quiet.
    // "if you're free" / "maybe" / אולי is not a time the sender has
    // actually asked to hold. That hedge wins before a live ask and
    // before this event. A missed chip costs one click; an event at a
    // time that was only floated costs a wrong hour on the calendar.
    const meetingAskHedge = /\b(?:might|maybe|perhaps|if you(?:'re| are) (?:free|available)|if (?:that|this|it) works)\b|נראה לי|(?:^|[^\u0590-\u05FF])אולי/.test(text);
    const eventEvidence = hasMeetingNoun && facts.date && (facts.date.iso || (pendingChoices && clock)) && !calledOff && !isRecap && !isPast && !attachToInvite && !phoneSomeone && !meetingAskHedge;
    const explicitMeetingAsk = Boolean(clock) && hasResolvedDate && !calledOff && !isRecap && !isPast && !meetingAskHedge && !attachToInvite && !phoneSomeone &&
      (EXPLICIT_MEETING_ASK.test(text) || EXPLICIT_MEETING_ASK_HE.test(text));

    // Drive / Doc / Sheet closes. Silence here is a decision, not a miss:
    // the remote fallback must not turn it into a different chip. A wait
    // means the language is clear and the host still has to check Drive
    // for exactly one file before the chip can exist.
    if (typeof FlowGoogleCloses !== 'undefined') {
      const google = FlowGoogleCloses.consider({
        text: text,
        blocked: blocked,
        amount: amount,
        dateIso: hasResolvedDate ? facts.date.iso : null,
        dateText: enrichedFacts.dateText,
        hasClock: Boolean(clock),
        template: ctx.companyTemplate || null,
        fileMatch: ctx.fileMatch || null,
        attachmentCount: ctx.attachmentCount == null ? null : ctx.attachmentCount,
        senderEmail: ctx.senderEmail || null
      });
      if (google && google.wait) {
        const rescued = rescueSelfSent('google-wait');
        if (rescued) return rescued;
        return { type: null, signals: signals, facts: facts, googleWait: { fileTerm: google.wait } };
      }
      if (google && google.silence) {
        return stayQuiet('google', { googleSilence: true });
      }
      if (google && google.close) {
        const g = google.close;
        // Gmail cannot write OneDrive. An inbound save-to-OneDrive ask is
        // still a task with a verb-plus-object title, not silence.
        // Hebrew save-to-OneDrive inbound (#179 item 5b): task card with a verb-plus-object
        // title on Gmail and Outlook. English OneDrive closes stay on the google-close path.
        if (g.copyAttachment && g.target === 'onedrive' && !addressedToSelf(ctx) &&
            /(?:תשמר(?:י|ו)?|תשמור(?:י|ו)?|לשמור|שמור)\s+את\s+המצורף\s+בוואן\s*דרייב/i.test(text)) {
          const subject = ctx && ctx.subject;
          let titled = selfAskTitle(text, subject, ctx);
          if (!usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
          if (usableSelfTitle(titled)) {
            const label = String(titled).replace(/\s+בבקשה[.!]?\s*$/i, '').trim();
            const tracked = finish(TYPES.REQUEST, 'high', { what: label });
            if (tracked && tracked.type) {
              tracked.label = label;
              tracked.selfTask = true;
              tracked.noReplyDraft = true;
              return tracked;
            }
          }
        }
        const hold = g.personalClose === 'file-on-hold';
        if (hold && suppressed(TYPES.SCHEDULED_EVENT)) {
          return stayQuiet('calibrated', { googleSilence: true });
        }
        if (!hold && suppressed(TYPES.DECISION_TO_LOG)) {
          return stayQuiet('calibrated', { googleSilence: true });
        }
        const entities = {
          who: who,
          amount: amount,
          what: g.what || g.cardLine,
          when: humanWhen(facts.date, facts.time),
          dateIso: hasResolvedDate ? facts.date.iso : null
        };
        if (hold && clock) {
          entities.hour = clock.hour;
          entities.minute = clock.minute;
        }
        return finish(
          hold ? TYPES.SCHEDULED_EVENT : TYPES.DECISION_TO_LOG,
          'high',
          entities,
          g.personalClose,
          g
        );
      }
    }

    if (eventEvidence && suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet('calibrated');
    function holdEntities() {
      return {
        who, amount,
        what: whatText(text, [EXPLICIT_MEETING_ASK, EXPLICIT_MEETING_ASK_HE]) ||
          whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) ||
          whatText(text, DATED_COMMIT_PATTERNS) || 'Hold',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: facts.time.hour,
        minute: facts.time.minute
      };
    }
    // Phoning a named person at a clock is the task. The meeting noun
    // "call" is that verb, not an event to schedule.
    if (!blocked && !replyMisaddressed && phoneSomeone && hasResolvedDate && clock && !isPast && !calledOff) {
      const intent = finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: 'Call',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: clock.hour,
        minute: clock.minute
      }, 'dated-commitment');
      if (intent && !intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || '')) ? 'שיחה' : 'Call';
      return intent;
    }
    if (!blocked && !replyMisaddressed && typeof soloPhoneTask === 'function' && soloPhoneTask(text) && hasResolvedDate && clock && !isPast && !calledOff) {
      const intent = finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: 'Call',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: clock.hour,
        minute: clock.minute
      }, 'dated-commitment');
      if (intent && !intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || '')) ? 'שיחה' : 'Call';
      return intent;
    }
    // "Add this to my tasks: call the bank" is the call reminder. It does
    // not need a clock. Call is that reminder, not a meeting.
    if (!blocked && !replyMisaddressed && /\badd this to my tasks\b/i.test(text) && /\bcall\b/i.test(text)) {
      const intent = finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: 'Call',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'follow-up-ask');
      if (intent) {
        intent.noReplyDraft = true;
        if (!intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || '')) ? 'שיחה' : 'Call';
      }
      return intent;
    }
    if (!blocked && !replyMisaddressed && bankCallReminder && hasResolvedDate && !isPast) {
      const intent = finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: 'Call',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso
      }, 'dated-commitment');
      if (intent && !intent.selfTask) intent.label = 'Call';
      return intent;
    }

    if (!blocked && !replyMisaddressed && eventEvidence) {
      // A meeting that is also a timed commitment, or an explicit ask to
      // meet at that clock time, is the calendar-hold personal close: one
      // event, not the schedule process's extra reminder task. A bare
      // announcement ("let's do a call Friday at 3") and a confirm ask on
      // an already-stated meeting stay the schedule processes.
      // A hold here is an explicit ask to meet at that clock. A sender's
      // promise plus a time ("I'll send it at 9am") is not a hold.
      // A stated weekday alone does not make the hold. planFor may still
      // choose a Meeting when a noun, an explicit date, and a clock are present.
      const meetingHold = explicitMeetingAsk;
      if (meetingHold) {
        if (suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet('calibrated');
        return finish(TYPES.SCHEDULED_EVENT, 'high', holdEntities(), 'calendar-hold');
      }
      const scheduled = finish(TYPES.SCHEDULED_EVENT, facts.time ? 'high' : 'medium', {
        who, amount,
        what: whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || 'Meeting',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: facts.time ? facts.time.hour : null,
        minute: facts.time ? facts.time.minute : null
      });
      // "Let's have a call Tuesday at 15:00 about the pilot" keeps the
      // calendar and the task. The card title is Call about the subject.
      if (scheduled && scheduled.type) {
        const titled = haveACallTitle(text, ctx, humanWhen(facts.date, facts.time));
        if (titled) scheduled.label = titled;
      }
      return scheduled;
    }

    // "Could you meet Friday at 3pm" names no meeting noun, so the event
    // gate above never saw it, and REQUEST below would draft a reply
    // instead of holding the time. Only the explicit-ask phrase, and only
    // with a resolved clock time.
    if (!blocked && !replyMisaddressed && explicitMeetingAsk && !hasMeetingNoun) {
      if (suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet('calibrated');
      return finish(TYPES.SCHEDULED_EVENT, 'high', holdEntities(), 'calendar-hold');
    }

    // --- 2. COMMITMENT_OF_READER: hard gate (regex + one of two evidence ---
    //        paths, same shape as REQUEST below). Deliberately NOT gated on
    //        the generic scorer threshold — that bar was tuned for a coarser
    //        "should the chip appear at all" decision across every kind of
    //        message, and a reader-commitment reminder with a real deadline
    //        attached is already unambiguous evidence on its own, the same
    //        way a meeting noun + date + time is above. A commitment naming
    //        a concrete object with no date/amount ("you agreed to send the
    //        contract") is real evidence too, just one notch less certain
    //        than a dated/priced commitment — 'medium' there, matching
    //        REQUEST's own confidence for its equivalent object-only path,
    //        vs 'high' when a real anchor is present.
    const readerCommitEvidence = isReaderCommit && (hasConcreteAnchor || hasConcreteCommitmentObject);
    if (readerCommitEvidence && suppressed(TYPES.COMMITMENT_OF_READER)) return stayQuiet('calibrated');
    if (!blocked && readerCommitEvidence && !isPast) {
      return finish(TYPES.COMMITMENT_OF_READER, hasConcreteAnchor ? 'high' : 'medium', {
        who, amount,
        what: commitmentWhat || labelFor(TYPES.COMMITMENT_OF_READER),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
    }

    // --- 3. REQUEST: an ask directed at the reader. s.flags.handoff is ---
    //        FlowJudgment.score()'s own test (HANDOFF / HANDOFF_HE, plus the
    //        follow-up phrases), reused rather than re-imported. A resolved
    //        date and a named object are each enough: "could you confirm by
    //        Friday" and "could you send the invoice" and "please follow up
    //        with Dana about the invoice". A dollar figure alone is not.
    //        "Can you confirm the $4,200?" names nothing to send and no day,
    //        and it is the same shape as a pitch that happens to quote a
    //        price. The figure still rides along on the task once a date or
    //        an object is present.
    // A past date is not an anchor. "Please send the receipt" still chips
    // when it names the receipt; the old due date is not what made it real.
    // A clean parking-permit renew is the work. A mass-mail footer stays
    // quiet, including when the subject is that ask.
    const parkingBody = typeof FlowCloseFamilies !== 'undefined' && typeof FlowCloseFamilies.parkingPermitAsk === 'function' && FlowCloseFamilies.parkingPermitAsk(text);
    const parkingSubject = typeof FlowCloseFamilies !== 'undefined' && typeof FlowCloseFamilies.parkingPermitAsk === 'function' && FlowCloseFamilies.parkingPermitAsk(ctx.subject || '');
    // The ask is often the subject. A mass-mail footer in the body still blocks it.
    const parkingAsk = (parkingBody || parkingSubject) && !blocked;
    if (parkingAsk) {
      return finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: 'Renew the parking permit',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'follow-up-ask');
    }

    const dateDropped = Boolean(facts.date && facts.date.dropped);
    // "Please create a task:" is that task. The handoff list does not
    // name it. A resolved day is what makes it concrete.
    // "Any chance you could", "please email me", and "please loop in"
    // are the reply on the rows that use those words. A note the user
    // sent to themself is still that task (v2syn-13337).
    const inboundAsk = /\b(?:any chance you could|please (?:email|e-mail) me|please loop in)\b/i.test(text);
    const selfPhrase = addressedToSelf(ctx) && /\b(?:any chance you could|please (?:email|e-mail|loop in)|kindly (?:email|loop in))\b/i.test(text);
    const datedAsk = hasResolvedDate && !isPast && (/\bplease\s+create\s+a\s+task\b/i.test(text) || selfPhrase || inboundAsk);
    // A slot ask ("when works for you?") names no object and no day on purpose: the time is the reply.
    const requestEvidence = ((s.flags.handoff || datedAsk) && ((hasResolvedDate && !isPast) || hasConcreteRequestObject || dateDropped)) || s.flags.slotAsk || s.flags.workAsk || s.flags.shortAsk;
    if (requestEvidence && suppressed(TYPES.REQUEST)) return stayQuiet('calibrated');
    const familiesBlockAsk = typeof FlowCloseFamilies !== 'undefined' && FlowCloseFamilies.askBlocked(text);
    // "any chance" is a hedge for every other sentence. These three
    // phrases are the reply on the rows that use them.
    const familyBlocks = familiesBlockAsk && !inboundAsk;
    if (!quietHint && (askIsSoft || familyBlocks) && requestEvidence) quietHint = 'hedge';
    if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && readerDecisionAsk(text) && !replyAsk) {
      quietHint = quietHint || 'hedge';
    } else if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && replyAsk && !replyOk) {
      quietHint = quietHint || 'hedge';
    } else if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && replyOk) {
      // "בבקשה לצרף … לזימון" stays a request. The card is the file track,
      // not "Reply requested by …". The meeting path already stood down.
      return finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'follow-up-ask');
    }

    // --- 3b. Dated commitment, and a confirmed amount. Hard gates for the ---
    //        same reason as REQUEST: the evidence is a combination, and the
    //        generic total misses it. "We agreed to file the amendment by
    //        September 21" is commitment (30) + date (12) − too-short (25)
    //        = 17. "Confirming the amount is $4,200" is commitment (30) +
    //        money (34) − too-short (25) = 39. Both are under BASE_THRESHOLD
    //        and both are exactly the close a person would track. A sender
    //        promise ("I will send the contract by Friday") never set
    //        `commit` at all — COMMIT is agreement language, not a delivery
    //        verb — so it rides this gate via flags.senderPromise, and only
    //        when a date actually resolved. No date, no chip.
    //
    //        Checked after REQUEST so "please follow up … and send the
    //        invoice by Friday" stays an ask (reply + task), not a log.
    //        Noise and a past date stay silent: a pitch that happens to say
    //        "confirming" is not a close, and a date already behind today
    //        is not something to put on a task. isTypeSuppressed is the
    //        same outlet the other hard gates use — this one has no
    //        threshold to nudge either.
    const datedCommitment = (s.flags.commit || s.flags.senderPromise) && hasResolvedDate && !s.flags.lost && !isPast && !contingent;
    if (!blocked && datedCommitment && suppressed(TYPES.DECISION_TO_LOG)) quietHint = 'calibrated';
    if (!blocked && !contingent && !settled && !isPast && s.flags.commit && facts.money && !s.flags.lost && !amountIsAmbiguous(text) && suppressed(TYPES.DECISION_TO_LOG)) quietHint = 'calibrated';
    if (!blocked && datedCommitment && !suppressed(TYPES.DECISION_TO_LOG)) {
      const committed = {
        who, amount,
        what: whatText(text, DATED_COMMIT_PATTERNS) || labelFor(TYPES.DECISION_TO_LOG),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso
      };
      // An explicit meet at this clock is the hold. A sender's own promise
      // plus a clock ("I'll send the form tomorrow at 9am", "אחזור אליך ב-11")
      // is quiet. "We agreed … at 3pm" stays a task, not a new event.
      if (clock && explicitMeetingAsk) {
        committed.hour = facts.time.hour;
        committed.minute = facts.time.minute;
        return finish(TYPES.SCHEDULED_EVENT, 'high', committed, 'calendar-hold');
      }
      // ב-HH:MM is invisible to the base clock parser unless בשעה, "at",
      // or a meeting noun would have read the same hour. Only that
      // invisible clock keeps a dated promise (v2syn-8473). Every other
      // sender-promise clock stays quiet, the same as the base judge.
      const rawClock = String(clock && clock.raw || '');
      const baseSeesClock = /(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)|\bat\s+\d/i.test(text) ||
        (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(text) && /(?:^|[^\d])\d{1,2}:\d{2}(?!\d)/.test(text));
      const laneOnlyBet = /ב-\s*\d{1,2}:\d{2}/.test(rawClock) && !baseSeesClock;
      // "I'll send the report tomorrow 14:30" is a log, dated from the mail.
      // "I will send the deck tomorrow at 10:00" is the same log. A clock
      // on a different promise stays quiet.
      const sendReportTomorrow = /\bi(?:'|’)?ll send the report tomorrow\b/i.test(text);
      const ownTimedSend = /\bfollowing up on (?:our|the|that) call\b/i.test(text)
        && (/\b(?:i|we)(?:'|’)?ll\s+send\b|\b(?:i|we)\s+will\s+send\b/i.test(text));
      if (sendReportTomorrow && !committed.hour) {
        const hm = String(text || '').match(/\b(\d{1,2}):(\d{2})\b/);
        if (hm) {
          committed.hour = +hm[1];
          committed.minute = +hm[2];
        }
      }
      if (ownTimedSend && clock) {
        committed.hour = clock.hour;
        committed.minute = clock.minute;
      }
      if (clock && s.flags.senderPromise && !laneOnlyBet && !sendReportTomorrow && !ownTimedSend) return stayQuiet('hedge');
      const logged = finish(TYPES.DECISION_TO_LOG, 'high', committed, 'dated-commitment');
      if (ownTimedSend && logged && clock) {
        const stamp = clock.hour + ':' + String(clock.minute).padStart(2, '0');
        if (logged.label && logged.label.indexOf(stamp) < 0) logged.label = logged.label + ' ' + stamp;
      }
      return logged;
    }
    if (!blocked && !contingent && !settled && !isPast && s.flags.commit && facts.money && !s.flags.lost && !amountIsAmbiguous(text) && !suppressed(TYPES.DECISION_TO_LOG)) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: whatText(text, DATED_COMMIT_PATTERNS) || labelFor(TYPES.DECISION_TO_LOG),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      }, 'confirmed-amount');
    }

    // Everything below this point is the old, proven "should Glance speak up
    // at all" question — reused as-is (same signals, same tuning against
    // test/judgment-corpus.cjs) for the two categories that don't have as
    // clean an independent evidentiary shape as the hard-gated types
    // above. SCHEDULED_EVENT/COMMITMENT_OF_READER/REQUEST and the two
    // personal-close gates above never reach here — they're hard
    // evidentiary gates, not a score against a moving bar, so there is no
    // threshold for a per-type history to adjust.
    //
    // Which of the two remaining types this message WOULD become is already
    // fully decided by the same flags DECISION_TO_LOG's own gate below
    // checks — computing it one line early costs nothing and lets a type
    // this account keeps dismissing (or undoing after Flow already acted)
    // sit behind a quieter bar than the account-wide baseline, without
    // touching what `signals.threshold` reports (still the account-wide
    // number, for telemetry continuity).
    const isDecision = s.flags.commit || s.flags.lost || s.flags.executed || s.flags.dispute;
    const likelyType = isDecision ? TYPES.DECISION_TO_LOG : TYPES.FOLLOW_UP;
    const gatingThreshold = FlowJudgment.applyTypeAdjustment(
      threshold, ctx.calibrationByType && ctx.calibrationByType[likelyType], ctx.now
    );
    // A soft ask is not an obligation just because a figure and a date
    // pushed the total over the bar. A real decision in another sentence
    // already returned above.
    if (infoOrNoise) return stayQuiet('noise');
    if (askIsSoft && !isDecision) return stayQuiet('hedge');
    if (s.total < gatingThreshold) {
      if (!replyMisaddressed) {
        const via = fromFamily(familyBox.hit);
        if (via) return via;
      }
      if (quietHint) return stayQuiet(quietHint);
      const inboundAction = rescueInboundActionRequired();
      if (inboundAction) return inboundAction;
      const rescued = rescueSelfSent('intent-null');
      if (rescued) return rescued;
      return { type: null, signals, facts };
    }
    // "hoping" / "once" and an already-paid figure clear the bar without
    // being an open close. Silence is the side of that trade.
    if (isDecision && contingent) return stayQuiet('hedge');
    if (isDecision && settled && (isPast || !(facts.date && facts.date.iso))) return stayQuiet('hedge');
    if (isDecision && facts.money && amountIsAmbiguous(text)) return stayQuiet('hedge');

    // --- 4. DECISION_TO_LOG: an outcome someone reported — the chip's original job. ---
    if (isDecision) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: whatText(text, [/\b(agreed|approved|confirmed|executed|declin(?:e|ed|ing))\b/i, /(סוכם|אישרנו|מאשרים|נחתם)/]) ||
          labelFor(TYPES.DECISION_TO_LOG),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
    }

    // --- 5. FOLLOW_UP: cleared the bar (a dated obligation, usually) but ---
    //        doesn't fit a sharper category — the safe catch-all rather than
    //        silently dropping something the proven scorer already vouched for.
    //        A clear family close is not this catch-all. A payable invoice
    //        with no family cue stays low, and low does not show a chip.
    if (!replyMisaddressed) {
      const via = fromFamily(familyBox.hit);
      if (via) return via;
    }
    return finish(TYPES.FOLLOW_UP, 'low', {
      who, amount,
      what: labelFor(TYPES.FOLLOW_UP),
      when: humanWhen(facts.date, facts.time),
      dateIso: facts.date && facts.date.iso
    });
  }

  // The chip shows only when Glance is sure. 'low' is FOLLOW_UP, the
  // score-bar catch-all: a payable invoice with no hard gate. Wrong Do It
  // hurts more than silence, so that confidence does not show a chip.
  // 'medium' and 'high' are the existing hard gates (a dated commitment,
  // an explicit follow-up, a confirmed amount, a meeting, a reader
  // commitment). 'remote' is the separate fallback and is not this bar.
  // This does not add a close type.
  function shouldShowChip(intent) {
    if (!intent || !intent.type) return false;
    return intent.confidence !== 'low';
  }

  // A solo phone task is not an event noun. "Call Tom", "I will call the
  // bank", and "I'll call the bank" stay tasks. "I'll call you" is the
  // two-party call, so this returns false.
  function soloPhoneTask(text) {
    const src = String(text || '');
    if (/\bcall you\b/i.test(src)) return false;
    if (/\bi(?:'|’)?ll\s+call\s+the\b|\bi will call the\b/i.test(src)) return true;
    if (/\bcall\s+(?:tom|avi|the bank)\b/i.test(src)) return true;
    return false;
  }

  function cleanInviteFile(raw) {
    const name = String(raw || '').replace(/\s+/g, ' ').trim().replace(/^[\s:,.-]+|[\s:,.!-]+$/g, '');
    if (!name || name.length > 80) return '';
    if (/^(?:file|files|it|this|that|the file|קובץ|הקובץ|אותו|את זה)$/i.test(name)) return '';
    return name;
  }
  function inviteFileName(raw) {
    const he = String(raw || '').match(/לצרר?ף\s+את\s+([\s\S]{1,80}?)\s+לזימון/);
    if (he) return cleanInviteFile(he[1]);
    const en = String(raw || '').match(new RegExp('\\battach\\s+(?:the\\s+|a\\s+|an\\s+)?([\\s\\S]{1,80}?)\\s+to\\s+the\\s+' + ATTACH_TARGET + '\\b', 'i'));
    if (en) return cleanInviteFile(en[1]);
    return '';
  }
  // A file asked onto an invite that already exists. One plan, reused by
  // both lanes: a task, then a short draft. The title names the file.
  // A missing file is still this card, never a banner. The draft says
  // the file is attached only when a file is on the draft.
  // opts.attached is true only when the draft will carry a real file.
  // An inbound attachment, or a file that was not found, is not that.
  function attachToInvitePlan(text, opts) {
    const raw = String(text || '');
    const heAttach = /לצרר?ף[\s\S]{0,160}?לזימון/.test(raw);
    const enAttach = new RegExp('\\battach\\b[\\s\\S]{0,160}?\\bto\\s+the\\s+' + ATTACH_TARGET + '\\b', 'i').test(raw);
    if (!heAttach && !enAttach) return null;
    const he = /[\u0590-\u05FF]/.test(raw);
    const named = inviteFileName(raw);
    const file = named || (he ? 'קובץ' : 'file');
    const attached = Boolean(opts && opts.attached === true);
    return {
      inviteFile: true,
      fileName: named || null,
      attached: attached,
      label: he ? ('לצרף ' + file + ' לזימון') : ('Attach ' + file + ' to invite'),
      processId: 'attach-invite',
      stepKinds: ['task', 'draft'],
      draft: attached ? (he ? 'מצורף.' : 'Attached.') : (he ? 'אצרף בהקדם.' : "I'll attach it shortly."),
      banner: false
    };
  }

  // The user's own "I'll send" / "אשלח" / "I'll call you". That task stays
  // Log commitment for the day. "We agreed to …" is the same promise, and
  // its title is Log commitment with no date. "I need" and "could you" are
  // the ask, not this promise.
  function ownFirstPersonPromise(text) {
    const src = String(text || '');
    if (/\b(?:i|we)(?:'|’)?ll\s+call\s+you\b|\b(?:i|we)\s+will\s+call\s+you\b/i.test(src)) return true;
    if (/\b(?:i|we)(?:'|’)?ll\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(src)) return true;
    if (/\b(?:i|we)\s+will\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(src)) return true;
    // A typo of send (snd, sned, sedn) still names the object. That title
    // is Send plus the object. "Log commitment" is only "We agreed to".
    if (/\bpromised\b/i.test(src) && /\bsend\b/i.test(src)) return true;
    if (/(?:^|[^\u0590-\u05FF])(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/.test(src)) return true;
    return false;
  }
  function weAgreedPromise(text) {
    return /\bwe\s+agreed\s+to\b/i.test(String(text || ''));
  }
  function bareSelfTitle(label) {
    return /^(?:Pay|Send|Review|Call|Update|File|Approve|Confirm|Sign|Scan|Upload|Prepare|Resend|Reply|Save|Fill out|Loop in|Sign off|Sign-off|לשלם|לשלוח|להעביר|להכין|למלא|לחזור|להעלות|לאשר|להגיש|לעדכן|להשלים|לסרוק|לבדוק|לשמור|שיחה)$/.test(String(label || '').trim());
  }
  function payAsk(src) {
    if (/\b(?:pay|wire)\b/i.test(src)) return true;
    if (/\bprocess\b/i.test(src) && /\bpayment\b/i.test(src)) return true;
    if (/\bclear\b/i.test(src) && /\bbalance\b/i.test(src)) return true;
    if (/\btransfer\b/i.test(src) && /(?:\$|₪|€|£|\b(?:deposit|balance|vendor|payment|invoice)\b)/i.test(src)) return true;
    if (/\bneeds to be paid\b/i.test(src)) return true;
    if (/לשלם|תשלם|תשלמי|לסגור את היתרה/.test(src)) return true;
    if (/להעביר את התשלום|תעביר(?:י|ו)? את התשלום/.test(src)) return true;
    return false;
  }
  function reviewAsk(src) {
    if (/\b(?:review|double-?check)\b/i.test(src)) return true;
    if (/לבדוק|תבדוק|תבדקי|תבדקו/.test(src)) return true;
    return false;
  }
  function callAsk(src) {
    if (/להחזיר(?:י|ו)? לי טלפון/.test(src)) return true;
    if (/\bcall\b/i.test(src) && /\b(?:reminder|remember)\b/i.test(src) && !/\bto the call\b/i.test(src)) return true;
    return false;
  }
  function earliestVerb(src, rows) {
    let best = null;
    let at = -1;
    for (let i = 0; i < rows.length; i++) {
      const m = src.match(rows[i][0]);
      if (!m || m.index == null) continue;
      if (at < 0 || m.index < at) {
        at = m.index;
        best = { verb: rows[i][1], match: m };
      }
    }
    return best;
  }
  function prepareAsk(raw) {
    return String(raw || '')
      .replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00A0\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
      .replace(/\bfollowing up on (?:our|the|that) call\b/ig, ' ')
      .replace(/\bper our (?:call|chat)\b/ig, ' ')
      .replace(/בהמשך לשיחתנו/g, ' ')
      .replace(/\[[^\]]*image[^\]]*\]/ig, ' ')
      .replace(/CONFIDENTIALITY[\s\S]*$/i, ' ')
      .replace(/הודעה זו[\s\S]*$/, ' ')
      .replace(/Sent from my iPhone/ig, ' ')
      .replace(/נשלח מה-?\s*iPhone[\s\S]*/ig, ' ')
      .replace(/(?:^|\n)\s*--\s*\n[\s\S]*$/, ' ')
      .replace(/^(?:שבוע טוב|בוקר טוב|צהריים טובים|ערב טוב|happy monday|hope you(?:r week)? (?:is |are )?well)[.!,\s]*/i, ' ')
      .replace(/\b(?:best regards|many thanks|thank you|thanks|regards|cheers)\b[\s\S]*$/i, ' ')
      .replace(/(?:בברכה|בתודה|תודה רבה|יום נעים|המשך יום טוב|תודה)[\s\S]*$/, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function heTopic(subject) {
    return cleanSubject(subject).replace(/^בהמשך\s+ל/, '').replace(/\s+/g, ' ').trim();
  }
  function cleanSubject(subject) {
    return String(subject || '')
      .replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00A0\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(?:(?:re|fw|fwd|השב|תגובה|הועבר)\s*:\s*)+/ig, '')
      .replace(/\s+attached$/i, '')
      .trim();
  }
  function weakSubject(subject) {
    return /^(?:quick question|following up|reminder|todo|note to self|next steps|please add|task|payment reminder|outstanding balance|משימה|תזכורת|שאלה קצרה|תזכורת תשלום)$/i.test(String(subject || '').trim());
  }
  // Thanks, Recap, and Decision are not objects. A Follow up title needs
  // the thing the mail is about. With no such thing, the note stays quiet.
  function genericFollowSubject(subject) {
    const s = String(subject || '').replace(/[!?.]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!s) return false;
    if (/^(?:thanks?|thank you|recap|decision|heads?[- ]?up|update|updates|thoughts?|urgent|action required|new features|change of plans|budget question|big sale|your weekly digest|weekly digest|fyi|note|hello|hi)$/i.test(s)) return true;
    if (/^(?:תודה|סיכום|מחשבות|עדכון|מבצע|ניוזלטר|דחוף|מענה אוטומטי|תקציב|הודעה|שאלה)$/.test(s)) return true;
    return false;
  }
  // "Thanks, got it" is the whole note. A sign-off on a real ask is not.
  function selfAckNote(blob) {
    const raw = String(blob || '');
    if (/\bthanks?,?\s+got it\b/i.test(raw) || /\bsounds good,?\s+thank you\b/i.test(raw)) return true;
    if (/קיבלתי|אחלה תודה|יופי תודה/.test(raw)) return true;
    if (/\b(?:send|pay|call|attach|review|please|could you|can you)\b/i.test(raw)) return false;
    if (/לשלוח|תשלח|לצרף|בבקשה|תוכל|אפשר/.test(raw)) return false;
    const parts = raw.split('\n');
    let t = (parts.slice(1).join(' ') || parts[0] || '');
    t = t.replace(/\[image:[^\]]*\]/gi, ' ');
    t = t.replace(/CONFIDENTIALITY[\s\S]*/i, ' ');
    t = t.replace(/הודעה זו[\s\S]*/, ' ');
    t = t.replace(/Sent from my iPhone[\s\S]*/ig, ' ');
    t = t.replace(/נשלח מה-?\s*iPhone[\s\S]*/ig, ' ');
    t = t.replace(/(?:^|\n)\s*--\s*[\s\S]*/, ' ');
    t = t.replace(/\bSali Sapan\b[\s\S]*/i, ' ');
    t = t.replace(/מקווה שאת\/?ה בטוב[.!]?\s*/g, ' ');
    t = t.replace(/שבוע טוב[.!]?\s*/g, ' ');
    t = t.replace(/(?:המשך יום טוב|יום נעים|בברכה|בתודה)[.!\s]*$/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return /^(?:thanks?(?:\s+you)?|thank you|cheers|תודה(?:\s+רבה)?)[.!\s]*$/i.test(t);
  }
  function weakObject(obj) {
    return /^(?:it|this|that|them|me|you|us|file|files|attached file|the file|a file|attachment|an attachment|הקובץ|קובץ|אותו|את זה|זה|אליי|אלי|לי)$/i.test(String(obj || '').trim());
  }
  const EN_DATE_TAIL = /\s+(?:by|due|until|before|no later than|tomorrow|today|tonight|asap|eod|eow|end of (?:the )?(?:week|day)|for\s+next\b|tomorr\w*|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|oct(?:ober)?|nov(?:ember)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june|july|aug(?:ust)?|sep(?:tember)?|dec(?:ember)?|\d{1,2})|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|january|february|march|april|may|june|july|august|september|october|november|december)\b[\s\S]*$/i;
  const EN_DATE_LEAD = /^(?:by|on|before|until|due|no later than)\s+(?:eod|eow|asap|tomorrow|today|tonight|end of (?:the )?(?:week|day)|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|oct|nov)(?:\s+\d{1,2})?(?:,\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})?)\b\s*/i;
  const HE_DATE_WORD = '(?:עד|מחר|היום|השבוע|ביום|ליום|לפני|סוף|asap|למערכת|ב(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))';
  const HE_DATE_TAIL = new RegExp('\\s+' + HE_DATE_WORD + '(?=\\s|$|[.,!?])[\\s\\S]*$', 'i');
  const HE_DATE_LEAD = new RegExp('^' + HE_DATE_WORD + '(?=\\s|$|[.,!?])[\\s\\S]*$', 'i');
  const AT_CLOCK = /\s+at\s+\d[\s\S]*$/i;
  const NUM_DATE = /\s+(?:עד\s+)?(?:ה-)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?[\s\S]*$/;
  function unwrapGoogleRedirectUrl(s) {
    let t = String(s || '').trim();
    const re = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*&)*q=([^&#\s]+)(?:&[^#\s&]*)*/gi;
    t = t.replace(re, (_, q) => {
      try { return decodeURIComponent(q); } catch (e) { return q; }
    });
    const urlParam = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*&)*url=([^&#\s]+)(?:&[^#\s&]*)*/gi;
    t = t.replace(urlParam, (_, u) => {
      try { return decodeURIComponent(u); } catch (e) { return u; }
    });
    const strip = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*(?:&[^#\s&]+)*)/gi;
    t = t.replace(strip, '');
    t = t.replace(/https?:\/\//gi, '');
    if (/^(?:www\.)?google\.com\/url\b/i.test(t.trim())) return '';
    t = t.replace(/\s+(?:the|on)\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
    return t.replace(/\s+/g, ' ').trim();
  }
  function takeObject(rest, keepThe) {
    let s = String(rest || '').replace(/\s+/g, ' ').trim();
    s = s.replace(EN_DATE_LEAD, '');
    s = s.replace(HE_DATE_LEAD, '');
    s = s.replace(/\s+is\s+due\b[\s\S]*$/i, '');
    s = s.replace(EN_DATE_TAIL, '').replace(AT_CLOCK, '').replace(HE_DATE_TAIL, '').replace(NUM_DATE, '');
    s = s.replace(/\s+(?:and\s+get\s+back|and\s+send|so\s+(?:we|i)\s+can)\b[\s\S]*$/i, '');
    s = s.replace(/\s+as\s+an\s+attachment\b[\s\S]*$/i, '');
    s = s.split(/(?<!\d)[.!?](?![\w\u0590-\u05FF-])/)[0];
    s = s.replace(/\s+to\s+(?:my\s+)?(?:google\s+drive|one\s?drive|the\s+portal|the\s+drive|portal|drive)\b[\s\S]*$/i, '');
    s = s.replace(/\s+from\s+you\b[\s\S]*$/i, '');
    s = s.replace(/^(?:and\s+(?:send|email)\s+)/i, '');
    s = s.replace(/^(?:please|kindly|over|back|just)\s+/i, '');
    s = s.replace(/^(?:me|you|us)\s+/i, '');
    s = s.replace(/^(?:with)\s+/i, '');
    if (!keepThe) s = s.replace(/^(?:the|a|an)\s+/i, '');
    s = s.replace(/^(?:(?:שלך|אליי|אלי|לי|לך|לכם|אותי|בבקשה|נא|ממך|מכם)\s+)+/, '');
    s = s.replace(HE_DATE_LEAD, '').replace(HE_DATE_TAIL, '').replace(NUM_DATE, '');
    s = s.replace(/^ו\S+\s+(?=את\s)/, '');
    // לגבי is one preposition. Splitting it makes "את גבי".
    if (!/^לגבי/.test(s) && /^ל[\u0590-\u05FF]/.test(s) && !/^ל[השמב]/.test(s)) s = 'את ' + s.slice(1);
    s = s.replace(/^על\s+ה-(\S+)/, '$1').replace(/^על\s+ה\s+(\S+)/, '$1');
    s = s.replace(/^on\s+the\s+(\S+)$/i, '$1');
    s = s.replace(/\s+attached$/i, '');
    s = s.replace(/\s+is$/i, '');
    s = s.replace(/\b([A-Za-z]{2,})\s+\1\b/gi, '$1');
    s = s.replace(/[.?!]+$/g, '').replace(/[,\s]+$/g, '').replace(/\s+/g, ' ').trim();
    s = unwrapGoogleRedirectUrl(s);
    return s;
  }
  // The verb picks the preposition. להתקשר takes ל-. לעדכן takes את or לגבי.
  // לבדוק takes את, including את ה-PR. "את גבי" and "לבדוק ל-" are not titles.
  function shapeHeObject(verb, obj) {
    let object = String(obj || '').replace(/[.?!]+$/g, '').replace(/\s+/g, ' ').trim();
    if (verb === 'להתקשר') {
      object = object.replace(/^את\s+/, '');
      if (/^(?:זה|לעצמי|בהמשך)$/.test(object)) return '';
      if (object && !/^ל/.test(object)) object = 'ל' + object;
    }
    if (verb === 'לעדכן') object = object.replace(/^את גבי\b/, 'לגבי');
    if (verb === 'לבדוק') {
      const latin = object.match(/^ל-([A-Za-z][\w-]*)/);
      if (latin) object = 'את ה-' + latin[1];
    }
    return object;
  }
  function earlierNoun(src, index) {
    const before = String(src || '').slice(0, index);
    const re = /\b(?:the|a|an)\s+((?:[A-Za-z0-9$₪€£][\w$₪€£.,-]*)(?:\s+[A-Za-z0-9$₪€£][\w$₪€£.,-]*){0,4})/gi;
    let found = '';
    let m;
    while ((m = re.exec(before))) found = m[1];
    if (!found || /^(?:moment|call|week|day|time|email|mail|message|one)$/i.test(found)) return '';
    return found;
  }
  function moneyPhrase(src) {
    const m = String(src || '').match(/(?:\$|₪|€|£)\s?\d[\d,]*(?:\.\d+)?/);
    if (!m) return '';
    const amount = m[0].replace(/\s+/g, '').replace(/,+$/g, '');
    const noun = String(src || '').match(/\b(deposit|invoice|balance|bill)\b/i);
    return noun ? (amount + ' ' + noun[1].toLowerCase()) : amount;
  }
  function clipTitle(value) {
    const t = String(value || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 72) return t;
    const cut = t.lastIndexOf(' ', 72);
    return (cut >= 12 ? t.slice(0, cut) : t.slice(0, 72)).trim();
  }
  function joinTitle(verb, obj, subject, opts) {
    let object = String(obj || '').replace(/\s+/g, ' ').trim();
    if (weakObject(object)) object = '';
    if ((opts && opts.pay) && object && !/(?:\$|₪|€|£)/.test(object)) {
      const money = moneyPhrase(opts.src || '');
      if (money) object = money + (/^(?:deposit|invoice|payment|balance|bill)$/i.test(object) ? '' : '');
      if (money && /^(?:deposit|invoice|payment|balance|bill)$/i.test(String(obj || '').trim())) object = money;
    }
    if (!object && opts && opts.pay) object = moneyPhrase(opts.src || '');
    if (object && /(?:\$|₪|€|£)/.test(object)) object = object.replace(/\s+payments?\b/ig, ' ').replace(/\s+/g, ' ').trim();
    if (verb === 'לשלם' && /תשלום/.test(object)) {
      const money = moneyPhrase((opts && opts.src) || '');
      if (money) object = money;
    }
    if (verb === 'Reply' && object && !/^(?:about|to|with|on)\b/i.test(object)) object = 'about ' + object;
    if (verb === 'Sign off' && object && !/^on\b/i.test(object)) object = 'on ' + object;
    if (object) {
      const title = clipTitle(verb + ' ' + object);
      if (title.split(/\s+/).length >= 2 && !bareSelfTitle(title)) return title;
    }
    if (opts && opts.phoneHe) {
      const topic = heTopic(subject);
      if (topic) return clipTitle('שיחה בנושא ' + topic);
    }
    if (verb === 'לחזור') {
      const topic = heTopic(subject);
      if (topic) return clipTitle('לחזור בנושא ' + topic);
    }
    const sub = cleanSubject(subject);
    if (sub && !weakSubject(sub) && !genericFollowSubject(sub) && !/^בהמשך\b/.test(sub) && sub !== 'לעצמי') {
      const title = clipTitle(verb + ' ' + sub);
      if (title.split(/\s+/).length >= 2) return title;
    }
    return '';
  }
  function titleAfter(verb, match, src, subject, opts) {
    const rest = src.slice(match.index + match[0].length);
    let useVerb = verb;
    let keepThe = Boolean(opts && opts.keepThe) || verb === 'Fill out' || verb === 'Confirm' || verb === 'Save' || verb === 'לשמור' || verb === 'Book' || verb === 'Order' || verb === 'Renew' || verb === 'Notify' || verb === 'Create' || verb === 'Keep' || verb === 'Store' || verb === 'Share' || verb === 'Forward' || verb === 'Email' || verb === 'Send' || verb === 'להזמין' || verb === 'להחזיר' || verb === 'לחדש' || verb === 'לשלוח' || verb === 'לקבל' || verb === 'לצרף';
    // "Reply with the tax form" is the file. The title is Send, and the
    // object keeps its article.
    if (verb === 'Reply' && /^\s*with\b/i.test(rest)) {
      useVerb = 'Send';
      keepThe = true;
    }
    let obj = shapeHeObject(useVerb, takeObject(rest, keepThe));
    if (!obj || weakObject(obj)) obj = shapeHeObject(useVerb, takeObject(earlierNoun(src, match.index), keepThe));
    if (opts && opts.pay && (weakObject(obj) || /^payment of\b/i.test(obj))) obj = moneyPhrase(src) || obj;
    return joinTitle(useVerb, obj, subject, Object.assign({ src: src }, opts || {}));
  }
  function firstOf(src, regs) {
    let best = null;
    for (let i = 0; i < regs.length; i++) {
      const m = src.match(regs[i]);
      if (!m || m.index == null) continue;
      if (!best || m.index < best.index) best = m;
    }
    return best;
  }
  const NOT_CALLEE = /^(?:you|me|us|her|him|them|she|he|they|it|the|a|an|tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|asap|next|this|on|at|by|for|and|back|please|day|week|time|morning|afternoon|evening|is|was|last|following|our|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
  function callTitle(src, subject) {
    const main = withoutIfClause(src);
    if (/להחזיר(?:י|ו)?\s+לי\s+טלפון/.test(main)) {
      return joinTitle('להתקשר', '', subject, { phoneHe: true, src: main });
    }
    const re = /\bcal(?:l)?\s+(?:(the|a|an)\s+)?([A-Za-z][A-Za-z'’-]{1,40})\b/gi;
    let m;
    let picked = null;
    while ((m = re.exec(main))) {
      if (NOT_CALLEE.test(m[2])) continue;
      picked = m;
    }
    if (!picked) return '';
    const article = picked[1] ? picked[1].toLowerCase() : '';
    let name = picked[2];
    if (article) name = name.toLowerCase();
    else if (name.charAt(0) === name.charAt(0).toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
    return 'Call' + (article ? ' ' + article : '') + ' ' + name;
  }
  // "Need to call tomorrow" names no person and no place. The subject is
  // the object: Call about the Q4 plan, or שיחה בנושא plus that topic.
  // "Call the bank" and "Call Yossi" already returned from callTitle.
  // "I'll call you" and "per our call" are not this reminder.
  function callAboutSubject(src, subject) {
    const raw = withoutIfClause(String(src || ''));
    if (/\bcall you\b/i.test(raw)) return '';
    if (/\b(?:i|we)(?:'|’)?ll\s+join\s+(?:the\s+)?call\b/i.test(raw)) return '';
    if (/\b(?:i|we)\s+will\s+join\s+(?:the\s+)?call\b/i.test(raw)) return '';
    if (/\bper our (?:call|chat)\b/i.test(raw)) return '';
    const bare = /\b(?:need to|have to|remember to|reminder to|please|gotta|time to|must)\s+call\b/i.test(raw)
      || /^(?:please\s+)?call(?:\s+(?:tomorrow|today|tonight|back|soon|asap))?(?:[.!]|$)/i.test(raw.trim())
      || /\b(?:gimme|give me)\s+a\s+call\b/i.test(raw)
      || /\bhop on a call\b/i.test(raw);
    if (!bare) return '';
    const topic = callTopicPhrase(raw, subject);
    if (!topic) return '';
    if (/[\u0590-\u05FF]/.test(raw) || /[\u0590-\u05FF]/.test(topic)) {
      return clipTitle('שיחה בנושא ' + topic);
    }
    return clipTitle('Call about ' + topic);
  }
  // A have-a-call topic is the body's "about X" / "בנושא X" / "על X".
  // The subject is used only when it is a clean noun phrase. Hello, an
  // address, and "Let's meet" are not topics. With none, the title names
  // the sender, or on a self note it is Call plus the time.
  function callSubjectPhrase(subject) {
    return cleanSubject(subject).replace(/[.?!,]+$/g, '').replace(/\s+/g, ' ').trim();
  }
  function dirtyCallTopic(phrase) {
    const s = String(phrase || '').replace(/\s+/g, ' ').trim();
    if (!s || weakSubject(s) || genericFollowSubject(s)) return true;
    if (/@/.test(s) || /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(s)) return true;
    if (/^(?:let'?s|let us|please|could you|can we|shall we)\b/i.test(s)) return true;
    if (/^(?:it|this|that|these|those|them|him|her|זה|זאת|זו|אותו|אותה|את זה|הזה)$/i.test(s)) return true;
    if (/^(?:meeting request)$/i.test(s)) return true;
    if (/^call$/i.test(s)) return true;
    if (/^(?:hello|hi|hey|dear)\b/i.test(s)) return true;
    if (/^invoice\b/i.test(s)) return true;
    return false;
  }
  function tidyCallTopic(phrase) {
    return String(phrase || '')
      .replace(EN_DATE_TAIL, '')
      .replace(AT_CLOCK, '')
      .replace(HE_DATE_TAIL, '')
      .replace(/[.?!,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function topicFromBody(text) {
    const raw = String(text || '');
    // על is a topic only when it names a thing. "על call" is the call itself.
    const patterns = [
      /\babout\s+([^.\n?!,]+)/gi,
      /בנושא\s+([^.\n?!,]+)/g,
      /(?:^|[^\u0590-\u05FF])על\s+(?!call\b|שיחה|פגישה)([^.\n?!,]+)/g
    ];
    let picked = '';
    for (let i = 0; i < patterns.length; i++) {
      const re = patterns[i];
      let m;
      while ((m = re.exec(raw))) {
        const phrase = tidyCallTopic(m[1]);
        if (!dirtyCallTopic(phrase)) picked = phrase;
      }
    }
    return picked;
  }
  function topicFromSubject(subject) {
    let sub = callSubjectPhrase(subject);
    if (/[\u0590-\u05FF]/.test(sub)) sub = heTopic(sub);
    if (dirtyCallTopic(sub)) return '';
    return sub;
  }
  function callClockPhrase(text) {
    const raw = String(text || '');
    let m = raw.match(/\b(tomorrow|today|tonight)\b(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!m) m = raw.match(/\b((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!m) return '';
    const day = /^(?:tomorrow|today|tonight)$/i.test(m[1])
      ? m[1].toLowerCase()
      : m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return day + ' ' + m[2].replace(/\s+/g, '');
  }
  function shortMonth(name) {
    const key = String(name || '').toLowerCase();
    const map = {
      january: 'Jan', jan: 'Jan', february: 'Feb', feb: 'Feb', march: 'Mar', mar: 'Mar',
      april: 'Apr', apr: 'Apr', may: 'May', june: 'Jun', jun: 'Jun', july: 'Jul', jul: 'Jul',
      august: 'Aug', aug: 'Aug', september: 'Sep', sep: 'Sep', sept: 'Sep',
      october: 'Oct', oct: 'Oct', november: 'Nov', nov: 'Nov', december: 'Dec', dec: 'Dec'
    };
    return map[key] || '';
  }
  // Month and day stay on the pronoun fallback only. The short month is
  // the form Hebrew already turns into באוק׳.
  function callMonthPhrase(text) {
    const raw = String(text || '');
    const mon = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
    const m = raw.match(new RegExp('\\b(' + mon + ')\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+at)?\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)', 'i'));
    if (!m) return '';
    const short = shortMonth(m[1]);
    if (!short) return '';
    return short + ' ' + String(m[2]) + ' ' + m[3].replace(/\s+/g, '');
  }
  // A negation inside an if-clause does not silence the note. The main
  // clause does. "If we won't hear back, call Dana" stays a task.
  function withoutIfClause(blob) {
    let s = String(blob || '');
    s = s.replace(/(?:^|[\n,])\s*אם(?:\s[^,\n]*)?/g, ' ');
    s = s.replace(/(?:^|[\n,])\s*\b(?:if|when)\b[^,\n]*/gi, ' ');
    s = s.replace(/(^|[^\n,])\s+\bif\b[^,\n]*/gi, '$1 ');
    return s;
  }
  function undecidedAnywhere(blob) {
    const s = String(blob || '');
    if (/עוד לא הוחלט/.test(s)) return true;
    if (/\bnothing (?:has been |was |is )?decided\b/i.test(s)) return true;
    if (/\bno decision yet\b/i.test(s)) return true;
    if (/\bnot decided yet\b/i.test(s)) return true;
    if (/\bTBD\b/i.test(s)) return true;
    return false;
  }
  function mainIsModal(main) {
    let s = String(main || '').replace(/^[\s,.:;–—-]+/, '');
    s = s.replace(/^\d[\d.,]*\s*,\s*/, '').replace(/^[\s,.:;–—-]+/, '');
    if (/^נוכל(?![\u0590-\u05FF])/.test(s)) return true;
    if (/^(?:we|i|you|they)\s+(?:could|can|might)\b/i.test(s)) return true;
    if (/^might\b/i.test(s)) return true;
    return false;
  }
  function mainIsExplicitAction(main) {
    const s = String(main || '');
    if (/\b(?:call|ring|send|pay|review|book|file|share|forward|attach|reply|confirm|approve|sign|email|upload|prepare|order|renew|notify|wire|transfer)\b/i.test(s)) return true;
    if (/להתקשר|לשלוח|לשלם|לחתום|לאשר|להעביר|להכין|למלא|לבדוק|לעדכן|לצרף|להגיש|לשמור|לחדש|להעלות|לחזור|להזמין|לסגור|לסרוק|להחזיר|לקבוע|תשלח|תתקשר/.test(s)) return true;
    return false;
  }
  // A conditional stays a task only when the main clause is an imperative
  // or an explicit action. A modal main clause stays quiet.
  function conditionalMainIsNotAction(blob) {
    const lines = String(blob || '').split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/^[\s\u00a0]+/, '');
      if (!line) continue;
      if (/^if you have received\b/i.test(line) || /^אם קיבלת/.test(line)) continue;
      if (!(/^(?:if|when|unless)\b/i.test(line) || /^אם/.test(line))) continue;
      const main = withoutIfClause(line);
      if (mainIsModal(main)) return true;
      if (!mainIsExplicitAction(main)) return true;
    }
    return false;
  }
  function callWhenPhrase(text) {
    const clock = callClockPhrase(text);
    if (clock) return clock;
    const month = callMonthPhrase(text);
    if (month) return month;
    const raw = String(text || '');
    let m = raw.match(/\b(tomorrow|today|tonight)\b/i);
    if (m) return m[1].toLowerCase();
    m = raw.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (!m) return '';
    const day = m[1];
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
  }
  function ownCalleeTokens(ctx) {
    const set = { sali: 1, sapan: 1 };
    function add(name) {
      String(name || '').split(/[\s,|]+/).forEach(function (word) {
        const key = word.toLowerCase().replace(/[^a-z\u0590-\u05FF'-]/g, '');
        if (key) set[key] = 1;
      });
    }
    if (ctx && typeof ctx === 'object') {
      add(ctx.userName);
      if (Array.isArray(ctx.ownNames)) ctx.ownNames.forEach(add);
      if (ctx.sender && ctx.sender.name) add(ctx.sender.name);
      add(ctx.senderName);
    }
    return set;
  }
  const CALLEE_SKIP = /^(?:her|him|them|you|me|us|she|he|they|if|when|unless|call|ring|please|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|thank|thanks|best|regards|sent|from|image|logo|account|manager|confidentiality|notice|dear|hello|hi|hey|re|fwd|subject|northwind)$/i;
  function personNamesIn(text, ctx) {
    const own = ownCalleeTokens(ctx);
    const head = String(text || '').split(/\n\s*(?:thank you|thanks|best regards|best,|regards,|cheers|sent from|many thanks|\[image)/i)[0];
    const re = /\b([A-Z][a-z][A-Za-z'’-]{0,40})\b/g;
    const names = [];
    const seen = {};
    let m;
    while ((m = re.exec(head))) {
      const word = m[1];
      if (CALLEE_SKIP.test(word) || own[word.toLowerCase()]) continue;
      if (/^(?:I'll|I've|I'm|I'd|We're|We'll|Don't|Let's|Can't|Won't)$/.test(word)) continue;
      const key = word.toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      names.push(word);
    }
    return names;
  }
  function calleeFromBody(text, ctx) {
    const names = personNamesIn(text, ctx);
    return names.length ? names[names.length - 1] : '';
  }
  // Her and him name the person only when the body has exactly one name.
  // Two names, or them, you, me, and us, are Call plus the time. The
  // account owner's own name is not a name here. Ring is a call.
  function pronounCalleeTitle(src, ctx) {
    const full = String(src || '');
    const main = withoutIfClause(full);
    const hit = main.match(/\b(?:call|ring)\s+(her|him|them|you|me|us)\b/i);
    if (!hit) return '';
    const pronoun = hit[1].toLowerCase();
    const names = personNamesIn(full, ctx);
    if ((pronoun === 'her' || pronoun === 'him') && names.length === 1) return 'Call ' + names[0];
    const when = callWhenPhrase(main);
    if (when) return clipTitle('Call ' + when);
    return '';
  }
  function callTopicPhrase(text, subject) {
    const fromBody = topicFromBody(text);
    const fromSub = topicFromSubject(subject);
    const subHe = /[\u0590-\u05FF]/.test(String(subject || ''));
    const bodyHe = /[\u0590-\u05FF]/.test(String(text || ''));
    if (subHe && !bodyHe && fromSub && (!fromBody || !/[\u0590-\u05FF]/.test(fromBody))) return fromSub;
    return fromBody || fromSub;
  }
  function haveACallTitle(text, ctx, whenText) {
    const main = withoutIfClause(String(text || ''));
    if (!/\bhave a call\b/i.test(main)) return '';
    const box = ctx && typeof ctx === 'object' ? ctx : { subject: ctx };
    const topic = callTopicPhrase(main, box.subject);
    if (topic) {
      return clipTitle('Call about ' + topic);
    }
    if (!addressedToSelf(box)) {
      const name = String(box.senderName || '').trim();
      if (name && name.indexOf('@') < 0 && !/^me$/i.test(name)) return clipTitle('Call with ' + name);
    }
    const when = String(whenText || '').replace(/\s+/g, ' ').trim();
    return clipTitle(when ? ('Call ' + when) : 'Call');
  }
  // Self-sent, and not this person's own promise. The title is the action.
  const SELF_EN_VERBS = [
    [/\bshoot me\b/i, 'Send'],
    [/\bfill out\b/i, 'Fill out'],
    [/\bfill in\b/i, 'Fill out'],
    [/\bloop in\b/i, 'Loop in'],
    [/\bsign-?off\b/i, 'Sign off'],
    [/\bresend\b/i, 'Resend'],
    [/\bupload\b/i, 'Upload'],
    [/\bprepare\b/i, 'Prepare'],
    [/\bconfirm\b/i, 'Confirm'],
    [/\bapprove\b/i, 'Approve'],
    [/\bupdate\b/i, 'Update'],
    [/\breply\b/i, 'Reply'],
    [/\bsave\b/i, 'Save'],
    [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+bo+k[o]?\b/i, 'Book'],
    [/\bbook\b/i, 'Book'],
    [/\border\b/i, 'Order'],
    [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+order\b/i, 'Order'],
    [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+renew\b/i, 'Renew'],
    [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+book\b/i, 'Book'],
    [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+notify\b/i, 'Notify'],
    [/\b(?:need to|have to|remember to|please)\s+create\b/i, 'Create'],
    [/\b(?:need to|have to|remember to|please)\s+keep\b/i, 'Keep'],
    [/\b(?:need to|have to|remember to|please)\s+store\b/i, 'Store'],
    [/\bshar(?:e|ing)\b/i, 'Share'],
    [/\be-?mail\b/i, 'Email'],
    [/\bforward\b/i, 'Forward'],
    [/\bsend\b/i, 'Send'],
    [/\bsign\b/i, 'Sign'],
    [/\bscan\b/i, 'Scan'],
    [/\bfile\b/i, 'File']
  ];
  const SELF_HE_VERBS = [
    [/אני צריך(?:ה|ים)? ממך/, 'לשלוח'],
    [/לשלוח|תשלח(?:י|ו)?(?![\u0590-\u05FF])/, 'לשלוח'],
    [/להעביר|תעביר(?:י|ו)?(?![\u0590-\u05FF])|מעביר(?:ה|ים|ות)?(?![\u0590-\u05FF])/, 'להעביר'],
    [/להכין|תכינ(?:י|ו)?(?![\u0590-\u05FF])|תכין(?![\u0590-\u05FF])/, 'להכין'],
    [/למלא|תמלא(?:י|ו)?(?![\u0590-\u05FF])/, 'למלא'],
    [/לחזור|תחזור(?![\u0590-\u05FF])|תחזרי(?![\u0590-\u05FF])|תחזרו(?![\u0590-\u05FF])/, 'לחזור'],
    [/להעלות|תעלה(?![\u0590-\u05FF])|תעלי(?![\u0590-\u05FF])|תעלו(?![\u0590-\u05FF])/, 'להעלות'],
    [/לאשר|תאשר(?:י|ו)?(?![\u0590-\u05FF])|(?<![\u0590-\u05FF])אשר(?![\u0590-\u05FF])/, 'לאשר'],
    [/לדכן(?![\u0590-\u05FF])/, 'לעדכן'],
    [/להגיש|תגיש(?![\u0590-\u05FF])/, 'להגיש'],
    [/לעדכן|תעדכ(?:ן|נ(?:י|ו)?)(?![\u0590-\u05FF])/, 'לעדכן'],
    [/להשלים|יש להשלים/, 'להשלים'],
    [/לסרוק|תסרק(?:י|ו)?(?![\u0590-\u05FF])/, 'לסרוק'],
    [/לשמור|תשמור(?:י|ו)?(?![\u0590-\u05FF])|תשמר(?:י|ו)?(?![\u0590-\u05FF])|שמור(?![\u0590-\u05FF])/, 'לשמור'],
    [/לחתום|תחתום(?:י|ו)?(?![\u0590-\u05FF])|חתימה\s+על/, 'לחתום'],
    [/(?<=^|[^\u0590-\u05FF])שלח(?:י|ו)?(?![\u0590-\u05FF])/, 'לשלוח'],
    [/(?<=^|[^\u0590-\u05FF])לקבל(?![\u0590-\u05FF])/, 'לקבל'],
    [/(?<=^|[^\u0590-\u05FF])לצרף(?![\u0590-\u05FF])/, 'לצרף'],
    [/להתקשר|תתקשר(?:י|ו)?(?![\u0590-\u05FF])/, 'להתקשר'],
    [/להזמין|תזמינ(?:י|ו)?(?![\u0590-\u05FF])/, 'להזמין'],
    [/להחזיר|תחזיר(?:י|ו)?(?![\u0590-\u05FF])/, 'להחזיר'],
    [/לסגור|תסגור(?:י|ו)?(?![\u0590-\u05FF])/, 'לסגור'],
    [/לחדש|תחדש(?:י|ו)?(?![\u0590-\u05FF])/, 'לחדש']
  ];
  // "Follow up on this", "לעקוב אחרי זה", and a subject pasted after לעקוב
  // are not titles. The body has the verb and the object, or the note is quiet.
  function badSelfTitle(label) {
    const t = String(label || '').trim();
    if (/^Follow up on\b/i.test(t)) return true;
    if (/לעקוב אחרי\s+(?:זה|לעצמי|בהמשך)\b/.test(t)) return true;
    if (/להתקשר את/.test(t)) return true;
    if (/את גבי/.test(t)) return true;
    if (/לבדוק ל-/.test(t)) return true;
    // A title is the verb plus the object. The mail's own sentence,
    // a quote, or a request phrase is not that title.
    if (/^["“”'«„]/.test(t)) return true;
    if (/^(?:תזכורת|בבקשה|אפשר|מחכים ל|מחכה ל|עדיין חסר|יש מצב|אני אגיע|אנחנו בפנים|לזכור |סיכמנו |הבטחתי |רק משהו|מה דעתך|can i get\b)/i.test(t)) return true;
    if (/[?!]/.test(t)) return true;
    if (/(?<!\d)\.(?![\w\u0590-\u05FF-])/.test(t) || /\.$/.test(t)) return true;
    return false;
  }
  function selfFollowTitle() {
    return '';
  }
  // A clock phrase on a meeting title: "ביום שני ב-13:00" / "בשעה 15:00".
  function heWhenPhrase(src) {
    const day = String(src || '').match(/ביום\s+([\u0590-\u05FF]+)/);
    const clock = String(src || '').match(/(?:בשעה\s+|ב-)(\d{1,2}:\d{2})/);
    if (!day) return '';
    return 'ביום ' + day[1] + (clock ? ' ' + clock[1] : '');
  }
  // The title is the body's verb and its object. The subject is not the object.
  function selfBodyTitle(src) {
    const t = String(src || '');
    const call = t.match(/להתקשר\s+ל([^\s.,!?]{1,24})/);
    if (call) return 'להתקשר ל' + call[1];
    const about = t.match(/(?:לעדכן|תעדכ[נן][ייו]?|לדכן)\s+(?:אותי\s+)?לגבי\s+(ה[\u0590-\u05FF]+)/);
    if (about) return 'לעדכן לגבי ' + about[1];
    const review = t.match(/\breview\s+ל-([A-Za-z][\w-]*)/i);
    if (review) return 'לבדוק את ה-' + review[1];
    const status = t.match(/פגישת\s+([\u0590-\u05FF]{2,20})(?:\s+קצרה)?/);
    if (status && heWhenPhrase(t)) return 'פגישת ' + status[1] + ' ' + heWhenPhrase(t);
    const meet = t.match(/(?:לפגישה|פגישה)(?!\s+סטטוס)/);
    if (meet && /ביום/.test(t) && heWhenPhrase(t) && !/פגישת/.test(t)) return 'פגישה ' + heWhenPhrase(t);
    const demo = t.match(/לדמו/);
    if (demo && heWhenPhrase(t)) return 'דמו ' + heWhenPhrase(t);
    const book = t.match(/\b(?:need to\s+)?bo+k[o]?\s+(?:the\s+)?(venue|room|hall)\b/i);
    if (book) return 'Book the ' + book[1].toLowerCase();
    // "share the purchase order by Oct 20" — order is the noun. The verb
    // is share, and the date stays with the object.
    const shareOrder = t.match(/\bshare\s+(the\s+(?:purchase|sales|work)\s+order)\s+(by\s+[A-Za-z]+\s+\d{1,2})\b/i);
    if (shareOrder) return 'Share ' + shareOrder[1].replace(/\s+/g, ' ') + ' ' + shareOrder[2].replace(/\s+/g, ' ');
    // snd / sned / sedn is send. The object is the noun, and a "by …"
    // deadline stays. A date alone is not the object.
    // "send the purchase order by Friday" — order is the noun.
    const sendOrder = t.match(/\bsend\s+(?:(?:me|him|her|them|you|us|tom)\s+)?(the\s+(?:purchase|sales|work)\s+order)(?:\s+(by\s+[A-Za-z]+(?:\s+\d{1,2})?))?/i);
    if (sendOrder) return 'Send ' + sendOrder[1].replace(/\s+/g, ' ') + (sendOrder[2] ? ' ' + sendOrder[2].replace(/\s+/g, ' ') : '');
    const typoSend = t.match(/\b(?:sedn|sned|snd)\s+(?:(?:me|him|her|them|you|us)\s+)?(.+)/i);
    if (typoSend && !/\blattest\b/i.test(typoSend[1])) {
      let rest = typoSend[1].replace(/[.!?].*$/, ' ').replace(/\s+/g, ' ').trim();
      rest = rest.replace(/\s+\b(?:back|over)\b/ig, ' ').replace(/\s+/g, ' ').trim();
      const by = rest.match(/^(.*?)\s+(by\s+\S+(?:\s+\d{1,2})?)\b/i);
      let obj = (by ? by[1] : rest).replace(/\s+(?:next|on|before|until|tomorrow|today|eod|asap)\b[\s\S]*$/i, '').trim();
      const when = by ? by[2].replace(/\s+/g, ' ').trim() : '';
      if (obj && !/^(?:the|a|an|to)$/i.test(obj)) return 'Send ' + obj + (when ? ' ' + when : '');
    }
    // "loop in finance on the purchase order" — order is the noun.
    if (/\bset up a sync\b/i.test(t) && !/\babout\b/i.test(t)) return 'Set up a sync';
    const setup = t.match(/\bset\s+up\s+((?:a|the)\s+)?(.+)/i);
    if (setup) {
      let obj = setup[2].replace(EN_DATE_TAIL, '').replace(AT_CLOCK, '').replace(/[.?!].*$/, '').replace(/\s+\b(?:for|at|on|by|about|with|before|until)\b$/i, '').replace(/\s+/g, ' ').trim();
      if (obj && !/^(?:a|the|an)$/i.test(obj)) return 'Set up ' + (setup[1] ? setup[1].toLowerCase() : '') + obj;
    }
    const loopIn = t.match(/\bloop\s+in\s+([A-Za-z]+)\s+on\s+(the\s+\S+\s+order)\b/i);
    if (loopIn) return 'Loop in ' + loopIn[1].toLowerCase() + ' on ' + loopIn[2].replace(/\s+/g, ' ');
    // "moving forward with Initech at $1,200" is the vendor and the amount.
    // The word forward in that phrase is not the verb.
    const moved = t.match(/\bmoving\s+forward\s+with\s+([A-Za-z][\w.&'-]*)\s+at\s+(\$\s?[\d,]+(?:\.\d+)?)/i);
    if (moved) return 'Log ' + moved[1] + ' at ' + moved[2].replace(/\s+/g, '');
    const order = t.match(/(?<!\b(?:purchase|sales|work|the|an|a|in)\s)\border\s+(.+?)(?:\s+(?:before|by|on|until|till|tomorrow|today|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|[.?!]|$)/i);
    if (order) {
      const obj = order[1].replace(/\s+/g, ' ').trim();
      if (obj && !/^(?:to|the|a|an|by|for|on|at)$/i.test(obj)) return 'Order ' + obj;
    }
    const over = t.match(/\bto go over\s+(the\s+[A-Za-z0-9][\w]*(?:\s+[A-Za-z0-9][\w]*){0,4})/i);
    if (over && /\bmeet\b/i.test(t)) return 'Meet about ' + over[1].replace(/\s+/g, ' ').trim();
    const interview = t.match(/\binterview\b(?:\s+[a-z]+){0,4}?\s+((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{1,2})?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (interview) return 'Interview ' + interview[1].replace(/^next\s+/i, '') + ' ' + interview[2].replace(/\s+/g, '');
    if (/\bsve\b/i.test(t) && /\battachment\b/i.test(t) && /\bdrive\b/i.test(t)) return 'Save attachment to Drive';
    const sent = t.match(/\b(?:sedn|send)\s+(?:me\s+)?(?:the\s+)?lattest\s+([a-z][\w]*)/i);
    if (sent) return 'Send the latest ' + sent[1].toLowerCase();
    const placed = t.match(/\b(put|add)\s+(?:the\s+)?([a-z][\w]*(?:\s+[a-z][\w]*)?)\s+(?:on|to)\s+(?:my\s+|the\s+)?(calendar|task)\b/i);
    if (placed) {
      const noun = placed[2].replace(/\s+/g, ' ').trim();
      if (placed[3].toLowerCase() === 'calendar' && /^put$/i.test(placed[1])) return 'Put ' + noun + ' on calendar';
      if (placed[3].toLowerCase() === 'task') return 'Add the ' + noun + ' to the task';
      return 'Put ' + noun + ' on calendar';
    }
    const syncAbout = t.match(/\bsync\b[\s\S]{0,80}?\babout\s+((?:the\s+)?[A-Za-z0-9][\w-]*(?:\s+[A-Za-z0-9][\w-]*){0,4})/i);
    if (syncAbout) {
      const obj = syncAbout[1].replace(/\s+(?:cheers|thanks|thank\s+you|best|regards|many\s+thanks)\b[\s\S]*$/i, '').replace(/\s+is\b[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
      if (obj) return 'Sync about ' + obj;
    }
    const approve = t.match(/(?<![\u0590-\u05FF])אשר\s+את\s+([\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+){0,4})/);
    if (approve) {
      const obj = approve[1].replace(/\s+עד(?:\s|$).*$/, '').trim();
      if (obj) return 'לאשר את ' + obj;
    }
    const signOn = t.match(/חתימה\s+על\s+(.+?)(?:\s*$|[.!?\n])/);
    if (signOn) {
      const obj = signOn[1].replace(/\s+/g, ' ').trim();
      if (obj) return 'לחתום על ' + obj;
    }
    const saveOd = t.match(/(?:תשמר(?:י|ו)?|תשמור(?:י|ו)?|לשמור|שמור)\s+את\s+המצורף\s+בוואן\s*דרייב/i);
    if (saveOd) return 'לשמור את המצורף בוואן דרייב';
    return '';
  }
  // A few slipped letters still name the same verb. This is not a new verb list.
  function softenTypos(src) {
    return String(src || '')
      .replace(/\bpepare\b/ig, 'prepare')
      .replace(/\breivew\b/ig, 'review')
      .replace(/\btranser\b/ig, 'transfer')
      .replace(/\bbeofre\b/ig, 'before')
      .replace(/\breenew\b/ig, 'renew')
      .replace(/למאל/g, 'למלא')
      .replace(/מעברי/g, 'מעביר')
      .replace(/\baproved\b/ig, 'approved')
      .replace(/\btis morning\b/ig, 'this morning')
      .replace(/לחשד את הדררכון/g, 'לחדש את הדרכון')
      .replace(/הדררכון/g, 'הדרכון')
      .replace(/לעעדכן/g, 'לעדכן')
      .replace(/פלויסת/g, 'פוליסת')
      .replace(/להזמןי/g, 'להזמין')
      .replace(/לגיש/g, 'להגיש')
      .replace(/הדחו/g, 'הדוח')
      .replace(/להמזין/g, 'להזמין')
      .replace(/ללוח את/g, 'לשלוח את')
      .replace(/להעלת/g, 'להעלות')
      .replace(/להעות/g, 'להעלות')
      .replace(/לשל את/g, 'לשלם את')
      .replace(/האסכמתא/g, 'האסמכתא')
      .replace(/להעבה/g, 'להעברה')
      .replace(/היוום/g, 'היום');
  }
  // בולה is the cancelled-call typo (בוטלה). That note stays quiet.
  function selfCallCancelled(text) {
    return /בולה/.test(String(text || '')) && /(?:call|שיחה|פגישה)/i.test(String(text || ''));
  }
  // A note to self that says the thing is already done, with no future verb,
  // is not a task. "I already renewed the insurance, delete the reminder"
  // is a record of what happened. The word reminder is not a future verb.
  const SELF_DONE_MARK = /\balready\b|^\s*done\b|\b(?:all|it(?:'|’)s|is|are|i(?:'|’)m|i am|i(?:'|’)ve|i have)\s+done\b|(?:^|[^\u0590-\u05FF])(?:כבר|בוצע|בוצעה|סיימתי)(?![\u0590-\u05FF])/i;
  const SELF_FUTURE_CUE = new RegExp([
    '\\b(?:remind me|remember to|don\'?t forget|need to|needs to|have to|has to|must|should|i(?:\'|’)ll|i will|we(?:\'|’)ll|we will|i(?:\'|’)m going to|going to|will|to-?do|tomorrow|tonight|later|please|pls)\\b',
    '\\b(?:next|this)\\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b',
    '\\b(?:on|by|before)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b',
    '(?:^|[^\\u0590-\\u05FF])(?:תזכיר(?:י|ו)?\\s+לי|תזכור(?:י|ו)?|לא\\s+לשכוח|אל\\s+תשכח(?:י|ו)?|צריך|צריכה|חייב|חייבת|אצטרך|מחר|הערב|בשבוע הבא|בחודש הבא|אחר כך|בהמשך)(?![\\u0590-\\u05FF])',
    '(?:^|[^\\u0590-\\u05FF])(?:אני\\s+)?א(?:שלח|חדש|שלם|תקשר|עשה|בדוק|קבע|עדכן|זכור|סגור|עביר|כין|צור|פתח|חזור|זמין|שמור)(?![\\u0590-\\u05FF])'
  ].join('|'), 'i');
  function selfKeepsDoneTask(blob) {
    const s = String(blob || '');
    if (/\bget it done\b/i.test(s)) return true;
    if (/\bneeds to be done\b/i.test(s)) return true;
    if (/\bto be done\b/i.test(s)) return true;
    if (/\bdone\s+(?:by|before|until|on|in)\b/i.test(s)) return true;
    if (/צריך\s+לבצע/.test(s)) return true;
    return false;
  }
  function selfCompletionMarked(blob) {
    const s = String(blob || '');
    if (SELF_DONE_MARK.test(s)) return true;
    if (/\b[a-z][a-z-]+\s+done\b(?!\s+(?:by|before|until|on|in)\b)/i.test(s)) return true;
    if (/\b(?:completed|renewed|paid)\b/i.test(s)) return true;
    if (/(?:^|[^\u0590-\u05FF])(?:הושלם|בוצע)(?![\u0590-\u05FF])/.test(s)) return true;
    return false;
  }
  function selfPastDone(raw) {
    const blob = String(raw || '');
    if (selfKeepsDoneTask(blob)) return false;
    if (!selfCompletionMarked(blob)) return false;
    return !SELF_FUTURE_CUE.test(blob);
  }
  // "I renewed the insurance" is what happened. It is not a task title.
  function pastSentenceTitle(t) {
    return /^(?:i|we)\s+(?:already\s+|just\s+)?(?:\w+ed|sent|paid|did|made|got|bought|had|was|were|have|has|took|gave|wrote|booked|called)\b/i.test(t)
      || /^(?:כבר\s+)?[\u0590-\u05FF]+תי(?![\u0590-\u05FF])/.test(t)
      || /^(?:כבר|בוצע|בוצעה)(?![\u0590-\u05FF])/.test(t)
      || /^(?:already|done)\b/i.test(t);
  }
  // A decision note names what was chosen, never the sentence that said so.
  // "Decision made: Acme is our vendor" is Decision: Acme, and "We're going
  // with Initech at $4,850" is Decision: Initech, $4,850. Six words at most.
  const DECISION_NAME = '([A-Z][\\w&.\\-]*(?:[ \\t]+(?!(?:is|are|was|will|as|at|for|to|and|our|the)\\b)[A-Z][\\w&.\\-]*){0,2})';
  // A greeting or a sign-off ends the sentence. The name never runs into it.
  const SIGNOFF_TAIL = /(?:^|[\s,.!;:\-])(?:תודה(?:\s+רבה)?|בתודה|בברכה|ברכה|יום\s+(?:טוב|נעים)|המשך\s+יום|שבוע\s+(?:טוב|נעים)|thanks|thank\s+you|many\s+thanks|regards|kind\s+regards|cheers|sincerely|cordially|best(?:\s+regards)?[ \t]*[,.!]?[ \t]*$)(?![\u0590-\u05FFA-Za-z]).*$/i;
  function selfDecisionTitle(raw, facts) {
    const money = facts && facts.moneyText ? ', ' + String(facts.moneyText).trim() : '';
    const lines = String(raw || '').replace(/\u00A0/g, ' ').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(SIGNOFF_TAIL, '').replace(/[ \t]+/g, ' ').trim();
      if (!t) continue;
      let m = t.match(new RegExp('(?:^|[.!]\\s*)(?:[Ff]inal[ \\t]+)?[Dd]ecision(?:[ \\t]+[Mm]ade)?[ \\t]*[:\\-–][ \\t]*' + DECISION_NAME));
      if (!m) m = t.match(new RegExp('\\b(?:[Ww]e(?:\'|’)re|[Ww]e are|[Ii](?:\'|’)m|[Ii] am)[ \\t]+going[ \\t]+with[ \\t]+' + DECISION_NAME));
      if (!m) m = t.match(new RegExp('\\b(?:[Ww]e|[Ii])[ \\t]+(?:decided|chose|picked|selected)[ \\t]+(?:on[ \\t]+|to go with[ \\t]+|to use[ \\t]+)?' + DECISION_NAME));
      if (m) return clipDecision('Decision: ' + m[1].trim() + money);
      const he = t.match(/(?:^|[^\u0590-\u05FF])(?:הוחלט|החלטנו|החלטתי)(?:[ \t]+סופית)?[ \t]+(?:על|ש(?:ניקח|נבחר|נעבוד עם))[ \t]*([\u0590-\u05FF][\u0590-\u05FF'"״׳\-]*(?:[ \t]+[\u0590-\u05FF][\u0590-\u05FF'"״׳\-]*)?)/);
      if (he) return clipDecision('החלטה: ' + he[1].trim() + money);
    }
    return '';
  }
  function clipDecision(title) {
    return title.split(/\s+/).slice(0, 6).join(' ');
  }
  function usableSelfTitle(label) {
    const t = String(label || '').trim();
    if (!t) return false;
    if (t.split(/\s+/).filter(Boolean).length < 2) return false;
    if (badSelfTitle(t)) return false;
    if (/[?]/.test(t)) return false;
    if (/^(?:could you|would you|can you|please |need )\b/i.test(t)) return false;
    if (/תוכל|אשמח אם|האם תוכל|נשמח לקבוע/.test(t)) return false;
    if (/^(?:if|when|unless)\b/i.test(t) || /^אם/.test(t)) return false;
    if (/^Log commitment\b/i.test(t)) return false;
    if (pastSentenceTitle(t)) return false;
    if (/^Log this decision$/i.test(t)) return false;
    if (/^Reply requested\b/.test(t) || /^Saving\b/i.test(t)) return false;
    if (/^(?:see you|talk soon|sounds good|got it)\b/i.test(t)) return false;
    return true;
  }
  // A timed call or meeting whose body names no object. The subject is the object.
  function selfMeetingAbout(src, subject) {
    const raw = withoutIfClause(String(src || ''));
    const meet = /(?:\b(?:call|meeting|sync|chat|demo|kickoff)\b|שיחה|פגישה|ראיון|הדגמה|זום|אתקשר|נתראה|להיפגש|היפגש|לדבר)/i.test(raw);
    if (!meet) return '';
    const topic = callTopicPhrase(raw, subject);
    if (topic && topic !== 'לעצמי' && !/^call$/i.test(topic)) {
      if (/[\u0590-\u05FF]/.test(raw) || /[\u0590-\u05FF]/.test(topic)) return clipTitle('שיחה בנושא ' + topic);
      return clipTitle('Call about ' + topic);
    }
    const when = callClockPhrase(raw);
    if (!when) return '';
    return clipTitle((/[\u0590-\u05FF]/.test(raw) ? 'שיחה ' : 'Call ') + when);
  }
  // The words of the note, once the ask frame and the date are off.
  // Used when the verb table has no row for this sentence. Not a verb list.
  function selfRecoverTitle(text, subject, ctx) {
    if (selfCallCancelled(text)) return '';
    const s = softenTypos(prepareAsk(text))
      .replace(/מקווה שאת\/?ה בטוב[.!]?\s*/g, ' ')
      .replace(/מקווה שהכל טוב[.!]?\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const heAbout = s.match(/(?:לגבי|בנושא|על)\s+((?:ה|ל)?[\u0590-\u05FF]{2,20}(?:\s+ל[\u0590-\u05FF]{2,20})?)/);
    if (heAbout) {
      const topic = heAbout[1];
      if (/תעדכ[נן]|לעדכן|לדכן/.test(s)) return clipTitle('לעדכן לגבי ' + topic);
      if (/אתקשר|להתקשר|לדבר|היפגש|נתראה|שיחה|פגישה|call|meeting/i.test(s)) return clipTitle('שיחה בנושא ' + topic);
    }
    let clause = s;
    const lead = [
      /^(?:quick one:\s*)+/i,
      /^(?:note to self:\s*)+/i,
      /^(?:final decision:\s*)+/i,
      /^(?:as discussed,?\s*(?:you will\s+)?)/i,
      /^(?:just confirming\s+(?:that\s+)?)(?:you(?:'|’)?ll|you will\s+)?/i,
      /^(?:i(?:'|’)?ll|i will|we(?:'|’)?ll|we will)\s+/i,
      /^(?:we agreed to)\s+/i,
      /^אני צריך\s+/,
      /^(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?/i,
      /^(?:can|could|would)\s+we\s+/i,
      /^please\s+/i,
      /^need\s+/i,
      /^(?:would|does)\s+(?:(?!work\s+for\b)[\s\S]){0,80}?work\s+for\s+/i,
      /^כמו שסיכמ(?:נו|ו) בשיחה,?\s*/,
      /^(?:אתה|אתם)\s+/,
      /^אשמח אם תוכל(?:י|ו)?\s+/,
      /^האם תוכל(?:י|ו)?\s+/,
      /^נשמח\s+ל?/,
      /^תוכלו\s+/,
      /^תקבע(?:י|ו)? לנו\s+/,
      /^רוצה\s+/,
      /^נוכל לעשות\s+/,
      /^יש לך זמן ל/,
      /^מה דעתך על\s+/,
      /^נקבע\s+/,
      /^קבעתי לנו\s+/,
      /^בהמשך לשיחתנו,?\s*/,
      /^פעולה נדרשת מצדך:\s*/,
      /^פעולה נדרשת מצד:\s*/
    ];
    for (let guard = 0; guard < 6; guard++) {
      let next = clause;
      for (let i = 0; i < lead.length; i++) next = next.replace(lead[i], '');
      next = next.replace(/\s+/g, ' ').trim();
      if (next === clause) break;
      clause = next;
    }
    clause = unwrapGoogleRedirectUrl(clause);
    clause = clause.replace(/(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^\s]+\s*)*/gi, ' ');
    clause = clause.replace(/\bthe\s+on\b/i, 'on');
    clause = clause.replace(/[?].*$/, ' ').replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();
    clause = clause.replace(/^מקווה[\s\S]*?[.]\s*/, '').trim();
    if (/\b(?:swing|stop|come|drop|pass)\s+by\b/i.test(clause)) {
      clause = clause.replace(/\s+(?:on\s+)?(?:next\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b[\s\S]*$/i, '');
    } else {
      clause = clause.replace(EN_DATE_TAIL, '').replace(AT_CLOCK, '');
    }
    clause = clause.replace(HE_DATE_TAIL, '').replace(NUM_DATE, '');
    clause = clause.replace(/\s+ב-\d[\s\S]*$/, '').replace(/\s+בשעה[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
    if (/^[a-z]/.test(clause)) clause = clause.charAt(0).toUpperCase() + clause.slice(1);
    if (/^(?:call|ring)\s+(?:her|him|them|you|me|us)$/i.test(clause)) {
      const named = pronounCalleeTitle(s, ctx);
      if (named) return named;
    }
    if (/^(?:a\s+)?quick\s+chat$/i.test(clause)) return 'Set up a quick chat';
    if (/^(?:a\s+)?quick\s+call$/i.test(clause) || /\b(?:hop on a call|have a call|jump on a call)\b/i.test(clause)) {
      const about = selfMeetingAbout(s, subject);
      if (about) return about;
    }
    if (/^(?:call|meeting)$/i.test(clause) && /תקבע|לקבוע|נקבע|set up/i.test(s)) {
      const about = selfMeetingAbout(s, subject);
      if (about) return about;
      return /[\u0590-\u05FF]/.test(s) ? 'לקבוע שיחה' : 'Set up a meeting';
    }
    const bareMeet = /^(?:a\s+|the\s+)?(?:quick\s+|short\s+)?(?:call|chat|meeting|sync|demo)$/i.test(clause)
      || /^(?:שיחה|פגישה|שיחת זום)$/.test(clause);
    if (!clause || bareMeet || !usableSelfTitle(clause)) return selfMeetingAbout(s, subject);
    return clipTitle(clause);
  }
  // A request phrase is not the title. The verb and the object are.
  function selfFrameTitle(src) {
    const s = String(src || '').replace(/\s+/g, ' ').trim();
    const money = (raw) => String(raw || '').replace(/\s+/g, '');
    let m;
    // A wrapped Google redirect link is the hostname, not a sentence with a dot.
    m = s.match(/\bremind me to\s+renew\s+(?:the\s+)?(https?:\/\/\S+)/i);
    if (m) {
      let obj = unwrapGoogleRedirectUrl(m[1]);
      if (!obj || /google\.com\/url\b/i.test(obj)) {
        const q = s.match(/google\.com\/url\?[^\s#]+/i);
        if (q) obj = unwrapGoogleRedirectUrl('https://www.' + q[0]);
      }
      if (obj && !/google\.com\/url\b/i.test(obj)) {
        return 'Renew ' + String(obj).replace(/^https?:\/\//i, '').replace(/\/$/, '');
      }
      const renewWhen = s.match(/\bremind me to\s+renew(?:\s+the\s+https?:\/\/\S+)?\s+on\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
      if (renewWhen) return 'Remind me to renew on ' + renewWhen[1].trim();
    }
    // "Remind me to renew the domain on Friday" is Renew the domain.
    // The day stays on the task. It is not a new verb.
    m = s.match(/\bremind me to\s+renew\s+((?:the|my|our|your)\s+.+?)(?:\s+(?:on|by|before)\b|$)/i);
    if (m) return 'Renew ' + m[1].replace(/\s+/g, ' ').trim();
    m = s.match(/אפשר\s+לאשר[\s\S]{0,48}?עם\s+(ה[\u0590-\u05FF]+(?:\s+ל[\u0590-\u05FF]+)?)/);
    if (m) return 'לאשר את ' + m[1];
    m = s.match(/עדיין\s+חסר\s+לנו\s+(.+?)\s+ממך/);
    if (m) return 'לשלוח את ' + m[1].replace(/\s+/g, ' ').trim();
    m = s.match(/תשלום\s+של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
    if (m && /תזכורת/.test(s)) return 'לשלם ' + money(m[1]);
    m = s.match(/מה דעתך על\s+דמו\s+ב-(\d{1,2}\.\d{1,2})\s+בשעה\s+(\d{1,2}:\d{2})/);
    if (m) return 'דמו ב-' + m[1] + ' ' + m[2];
    m = s.match(/\bcan i get\s+(the\s+.+?)\s+from you\b/i);
    if (m) return 'Send ' + m[1].replace(/\s+/g, ' ').trim();
    m = s.match(/מחכים\s+להצעת המחיר/);
    if (m) return 'לשלוח את הצעת המחיר';
    m = s.match(/מחכים\s+לה-(\S+)/);
    if (m) return 'לשלוח את ה-' + m[1].replace(/[.,!?].*$/, '');
    m = s.match(/מחכה\s+להקבלה/);
    if (m) return 'לשלוח את הקבלה';
    m = s.match(/מחכה לאישור שלך על\s+(ה[\u0590-\u05FF]+)/);
    if (m) return 'לאשר את ' + m[1];
    m = s.match(/אפשר\s+follow up על\s+(ה[\u0590-\u05FF]+)/i);
    if (m) return 'לעדכן לגבי ' + m[1];
    m = s.match(/אפשר\s+להסדיר את התשלום של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
    if (m) return 'לשלם ' + money(m[1]);
    m = s.match(/יתרה פתוחה של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
    if (m) return 'לשלם ' + money(m[1]);
    m = s.match(/אפשר\s+לדבר[\s\S]{0,60}?על\s+(ה-[\w.-]+|ה[\u0590-\u05FF]+)/);
    if (m) return 'שיחה בנושא ' + m[1];
    m = s.match(/יש מצב להיפגש\s+ב-(\d{1,2}\.\d{1,2})\s+ב-(\d{1,2}:\d{2})/);
    if (m) return 'פגישה ב-' + m[1] + ' ' + m[2];
    m = s.match(/יש מצב להיפגש\s+ביום\s+([\u0590-\u05FF]+)\s+ב-(\d{1,2}:\d{2})/);
    if (m) return 'פגישה ביום ' + m[1] + ' ' + m[2];
    m = s.match(/יש מצב לעשות שיחת היכרות(?:\s+קצרה)?\s+ביום\s+([\u0590-\u05FF]+)\s+ב-(\d{1,2}:\d{2})/);
    if (m) return 'שיחת היכרות ביום ' + m[1] + ' ' + m[2];
    m = s.match(/אני אגיע\s+מחר\s+בשעה\s+(\d{1,2}:\d{2})/);
    if (m) return 'להגיע מחר ' + m[1];
    m = s.match(/אני אגיע\s+ב-(\d{1,2})\s+באוקטובר\s+בשעה\s+(\d{1,2}:\d{2})/);
    if (m) return 'להגיע ' + m[1] + '.10 ' + m[2];
    m = s.match(/אנחנו\s+בפנים\s*[–—-]\s*((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
    if (m) return 'Log ' + money(m[1]) + ' agreed';
    m = s.match(/אפשר\s+להעלות את המצורף ל-OneDrive/);
    if (m) return 'להעלות את המצורף ל-OneDrive';
    m = s.match(/\blmk\b[\s\S]{0,48}?\bif the (.+?)\s+works\b/i);
    if (m) return 'Reply about the ' + m[1].replace(/\s+/g, ' ').trim();
    m = s.match(/\bwe\s+approved\b[\s\S]{0,80}?((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/i);
    if (m) return 'Log ' + money(m[1]) + ' agreed';
    let clause = s
      .replace(/^(?:רק משהו קטן:\s*)+/, '')
      .replace(/^(?:תזכורת לעצמי:\s*)+/, '')
      .replace(/^(?:בבקשה\s+)/, '')
      .replace(/^(?:לזכור\s+)/, '')
      .replace(/^(?:סיכמנו\s+)/, '')
      .replace(/^הבטחתי\s+ל[\u0590-\u05FF]+\s+/, '');
    if (clause === s) return '';
    clause = clause.replace(/^צרף\s+/, 'לצרף ');
    clause = clause.replace(HE_DATE_TAIL, '').replace(EN_DATE_TAIL, '').replace(/[.?!](?![\w\u0590-\u05FF-]).*$/, '').replace(/\s+/g, ' ').trim();
    // "בבקשה להוסיף משימה <verb>" is the verb. The wrapper is not the title.
    // Hebrew letters are not \b word chars, so the guard is a space or the end.
    if (/^להוסיף משימה(?:\s|$)/.test(clause)) return '';
    if (/^ל[\u0590-\u05FF]/.test(clause)) return clipTitle(clause);
    return '';
  }
  function selfAskTitle(text, subject, ctx) {
    const raw = String(text || '');
    const invite = attachToInvitePlan(raw);
    if (invite) return invite.label;
    const src = softenTypos(prepareAsk(raw));
    const framed = selfFrameTitle(src);
    if (framed && !badSelfTitle(framed)) return framed;
    const fromBody = selfBodyTitle(src);
    if (fromBody && !badSelfTitle(fromBody)) return fromBody;
    const he = /[\u0590-\u05FF]/.test(src);
    if (payAsk(src)) {
        const m = firstOf(src, [/לשלם|תשלמ(?:י|ו)?/, /להעביר|תעביר(?:י|ו)?/, /לסגור/, /\bpay\b/i, /\bneeds to be paid\b/i, /\bwire\b/i, /\bprocess\b/i, /\btransfer\b/i, /\bclear\b/i]);
      if (m) {
        const verb = /[\u0590-\u05FF]/.test(m[0]) ? 'לשלם' : 'Pay';
        const titled = titleAfter(verb, m, src, subject, { pay: true });
        if (titled) return titled;
      }
    }
    if (reviewAsk(src)) {
      const m = firstOf(src, [/לבדוק|תבדק(?:י|ו)?/, /\bdouble-?check\b/i, /\breview\b/i]);
      if (m) {
        const verb = he ? 'לבדוק' : 'Review';
        const titled = titleAfter(verb, m, src, subject, {});
        if (titled) return titled;
      }
    }
    const phone = callTitle(src, subject);
    if (phone) return phone;
    const pronoun = pronounCalleeTitle(src, ctx);
    if (pronoun) return pronoun;
    const about = callAboutSubject(src, subject);
    if (about) return about;
    if (callAsk(src)) {
      const titled = he
        ? joinTitle('להתקשר', '', subject, { phoneHe: true, src: src })
        : '';
      if (titled) return titled;
    }
    const hit = earliestVerb(src, he ? SELF_HE_VERBS.concat(SELF_EN_VERBS) : SELF_EN_VERBS);
    if (!hit) return '';
    return titleAfter(hit.verb, hit.match, src, subject, {});
  }

  return { TYPES, classify, shouldShowChip, copiedOnly: ccOnlyWithoutGreeting, openingAddressee, addressedToSelf, meetingPlanVeto, attachToInvitePlan, soloPhoneTask, phishingOrNegative, bankChangePayment, nameIsReader, readerNamesFrom, marketingWebinar };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntent };
