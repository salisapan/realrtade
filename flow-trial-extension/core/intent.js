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
  // a deadline, not an event) must not become a calendar entry.
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
  const MEETING_NOUN = /\b(meeting|call|sync|check-?in|appointment|session|interview|demo|walkthrough|consultation|stand-?up|retro(?:spective)?|workshop|webinar|huddle|kick-?off|town hall|office hours|one-on-one|strategy session|planning session|deposition|hearing|mediation|panel discussion)\b(?!\s+(?:recording|notes|transcript|minutes|summary|recap|feedback|materials|slides|deck|agenda))/i;
  const MEETING_NOUN_HE = /(פגישה|שיחה|ראיון|סנכרון|תיאום|ייעוץ|הדגמה|מפגש|ועידה|שיחת טלפון|פגישת עבודה|שיחת זום|שיחת וידאו|עמידה יומית|רטרו(?:ספקטיבה)?|סדנה|וובינר|תדרוך|כנס פתיחה|היכרות עם הצוות|שימוע|גישור|דיון בפאנל)(?!\s*(?:הקלטה|הקלטת|הערות|תמליל|פרוטוקול|סיכום|חומרים|מצגת|סדר יום))/;

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
    '(?:take|drop) (?:it|this|that) (?:off|from) the calendar'
  ].join('|'), 'i');
  const EVENT_CALLED_OFF_HE = /(נדח(?:ה|ית|תה)|לדחות|דוחים את|מבוטל|בוטל|לא מתקיים|לא יתקיים|נקבע מחדש|מבטלים את הפגישה|הפגישה לא תתקיים|יש לדחות את)/;

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
    'thanks? for (?:the |our )?(?:call|meeting|chat|time)',
    'thank you for (?:the |our )?(?:call|meeting|chat|time)',
    'great (?:meeting|call|chat|talking to you|speaking with you)',
    'good (?:speaking|talking|chatting) with you',
    "it was (?:great|good|nice) (?:to (?:meet|speak|talk|chat)|meeting you|speaking with you|chatting)",
    'enjoyed (?:our|the) (?:call|meeting|chat|conversation)',
    'glad (?:we|to have) (?:synced|caught up|connected|spoke|talked)'
  ].join('|'), 'i');
  const EVENT_RECAP_HE = /(תודה על ה(?:שיחה|פגישה)|היה נעים (?:לדבר|להיפגש)|שמחתי שדיברנו|נהניתי מ(?:השיחה|הפגישה)|תודה שהתפניתם?|היה כיף לדבר|נעים היה להכיר)/;

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
  const REQUESTED_OBJECT_HE = /(קבלה|חשבונית מס|חשבונית|זיכוי|החזר כספי|החזר|הוצאות|דוח הוצאות|הזמנת (?:ה)?רכש|מחירון|הצעת מחיר|תקציב|תשלום|חוזה|הסכם|הסכם סודיות|נספח|תיקון להסכם|ויתור|שחרור מהתחייבות|רישיון|תנאי שימוש|תנאים והגבלות|מדיניות|מסמך|קובץ|סריקה|מצגת|תבנית|טופס|בקשת הצטרפות|תעודה|תעודת זהות|גיליון אלקטרוני|תמליל|דוח|עדכון|עדכון סטטוס|סטטוס|תקציר|סיכום|סיכום פגישה|ניתוח|תחזית|תחזית תקציבית|מפת (?:ה)?דרכים|לוח זמנים|סדר (?:ה)?יום|פרוטוקול|(?:ה)?פעולות (?:ה)?נדרשות|גישה|פרטי התחברות|סיסמה|מפתח API|הרשאה|הרשאות|הזמנה|קישור הזמנה|אישור|חתימה|משוב|הערות|תגובה|מענה|הבהרה|הנחיה|הוראות|טיוטה|תוצר|הצעה|דוגמה|מוקאפ|אבטיפוס|עיצוב|גרפיקה|מפרט|דרישות|זמינות|לוח שנה|חלון זמן|קורות (?:ה)?חיים|מכתב מקדים|המלצות|מכתב הצעת (?:ה)?עבודה|חוזה העסקה|קישור|פרטים|מידע|נתונים|נתונים מספריים)/;

  // A short English label for the write paths that still expect one (Google
  // Tasks title, Notion title, popup activity log) — kept alongside the full
  // quoted `entities.what` rather than replacing it, so nothing downstream
  // that read ctx.result.label before this change has to change.
  function shortLabel(type, facts, enrichedFacts) {
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
      return 'Reply requested' + (dateText ? ' by ' + dateText : '') + (facts.moneyText ? ', ' + facts.moneyText : '');
    }
    return FlowJudgment.neutralTitle(enrichedFacts); // DECISION_TO_LOG and FOLLOW_UP
  }

  function classify(text, ctx) {
    ctx = ctx || {};
    text = FlowJudgment.newContent(text);

    const domain = FLOW_DOMAINS[0]; // no domain picker in the MVP — see connectors.js/popup.js
    const facts = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
    const s = FlowJudgment.score(text, domain, facts);
    const threshold = FlowJudgment.thresholdFrom(ctx.calibration, ctx.now);
    const enrichedFacts = Object.assign({}, facts, { lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute });

    const who = ctx.senderName || ctx.senderEmail || null;
    const amount = facts.moneyText || null;

    const hasMeetingNoun = MEETING_NOUN.test(text) || MEETING_NOUN_HE.test(text);
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
    const hasConcreteRequestObject = Boolean(requestWhat) &&
      (REQUESTED_OBJECT.test(requestWhat) || REQUESTED_OBJECT_HE.test(requestWhat));

    // The actual noun REQUESTED_OBJECT/HE matched on ("invoice", "resume",
    // "NDA"...), not just whether one was present — this is what lets
    // background.js's Drive auto-attach (gmailDraftWrite) search Drive by
    // the specific thing being asked for instead of only ever offering the
    // thread's own existing attachment or a manually-picked file. .exec(),
    // not .test(), specifically to capture group 1 (every alternative in
    // both patterns is wrapped in the same outer capturing group).
    const requestedObjectMatch = requestWhat &&
      (REQUESTED_OBJECT.exec(requestWhat) || REQUESTED_OBJECT_HE.exec(requestWhat));
    const requestedObjectTerm = requestedObjectMatch ? requestedObjectMatch[1] : null;

    // Every raw signal, independent of which type ends up winning — the
    // decision layer (actions.js) reads this to notice a message is
    // multi-actionable (a meeting invite that ALSO asks for confirmation is
    // still an EVENT here, but actions.js can still see signals.handoff and
    // propose a reply draft alongside the calendar event).
    const signals = {
      hasMeetingNoun, hasConcreteAnchor, hasConcreteRequestObject, hasConcreteCommitmentObject, isReaderCommit,
      handoff: s.flags.handoff,
      hasDate: Boolean(facts.date && facts.date.iso),
      hasTime: Boolean(facts.time),
      hasMoney: Boolean(facts.money),
      score: s.total, threshold
    };

    function finish(type, confidence, entities) {
      return {
        type, confidence,
        entities: Object.assign({ requestWhat, requestedObjectTerm }, entities),
        label: shortLabel(type, facts, enrichedFacts), signals, facts
      };
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
    const calledOff = s.flags.lost || EVENT_CALLED_OFF.test(text) || EVENT_CALLED_OFF_HE.test(text);
    const isRecap = EVENT_RECAP.test(text) || EVENT_RECAP_HE.test(text);
    const isPast = isPastDate(facts.date && facts.date.iso, ctx.now);
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
    const eventEvidence = hasMeetingNoun && facts.date && facts.date.iso && !calledOff && !isRecap && !isPast;
    if (eventEvidence && suppressed(TYPES.SCHEDULED_EVENT)) return { type: null, signals, facts };
    if (!s.flags.noise && eventEvidence) {
      return finish(TYPES.SCHEDULED_EVENT, facts.time ? 'high' : 'medium', {
        who, amount,
        what: whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || 'Meeting',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: facts.time ? facts.time.hour : null,
        minute: facts.time ? facts.time.minute : null
      });
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
    if (readerCommitEvidence && suppressed(TYPES.COMMITMENT_OF_READER)) return { type: null, signals, facts };
    if (!s.flags.noise && readerCommitEvidence) {
      return finish(TYPES.COMMITMENT_OF_READER, hasConcreteAnchor ? 'high' : 'medium', {
        who, amount,
        what: commitmentWhat || shortLabel(TYPES.COMMITMENT_OF_READER, facts, enrichedFacts),
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
    const requestEvidence = s.flags.handoff && (hasResolvedDate || hasConcreteRequestObject);
    if (requestEvidence && suppressed(TYPES.REQUEST)) return { type: null, signals, facts };
    if (!s.flags.noise && requestEvidence) {
      return finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: whatText(text, REQUEST_PATTERNS) || shortLabel(TYPES.REQUEST, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
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
    const datedCommitment = (s.flags.commit || s.flags.senderPromise) && hasResolvedDate && !s.flags.lost && !isPast;
    if (!s.flags.noise && datedCommitment && !suppressed(TYPES.DECISION_TO_LOG)) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: whatText(text, DATED_COMMIT_PATTERNS) || shortLabel(TYPES.DECISION_TO_LOG, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso
      });
    }
    if (!s.flags.noise && s.flags.commit && facts.money && !s.flags.lost && !suppressed(TYPES.DECISION_TO_LOG)) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: whatText(text, DATED_COMMIT_PATTERNS) || shortLabel(TYPES.DECISION_TO_LOG, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
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
    if (s.total < gatingThreshold) return { type: null, signals, facts };

    // --- 4. DECISION_TO_LOG: an outcome someone reported — the chip's original job. ---
    if (isDecision) {
      return finish(TYPES.DECISION_TO_LOG, 'high', {
        who, amount,
        what: whatText(text, [/\b(agreed|approved|confirmed|executed|declin(?:e|ed|ing))\b/i, /(סוכם|אישרנו|מאשרים|נחתם)/]) ||
          shortLabel(TYPES.DECISION_TO_LOG, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
    }

    // --- 5. FOLLOW_UP: cleared the bar (a dated obligation, usually) but ---
    //        doesn't fit a sharper category — the safe catch-all rather than
    //        silently dropping something the proven scorer already vouched for.
    return finish(TYPES.FOLLOW_UP, 'low', {
      who, amount,
      what: shortLabel(TYPES.FOLLOW_UP, facts, enrichedFacts),
      when: humanWhen(facts.date, facts.time),
      dateIso: facts.date && facts.date.iso
    });
  }

  return { TYPES, classify };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntent };
