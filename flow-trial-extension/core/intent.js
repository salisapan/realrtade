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
// Precision over recall, explicitly: two of the five types (SCHEDULED_EVENT,
// COMMITMENT_OF_READER) require a hard, deterministic evidence combination —
// not a score that happens to clear a bar. The other three reuse
// FlowJudgment's own proven scorer (the exact signals and threshold already
// tuned against test/judgment-corpus.cjs) as their gate, so "should Glance
// speak up at all" is never re-litigated here, only "which of these five
// things is it." When nothing clears its bar, classify() returns
// { type: null } — silence, same as the chip's own default state.

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
  const MEETING_NOUN = /\b(meeting|call|sync|check-?in|appointment|session|interview|demo|walkthrough|consultation)\b/i;
  const MEETING_NOUN_HE = /(פגישה|שיחה|ראיון|סנכרון|תיאום|ייעוץ|הדגמה|מפגש|ועידה|שיחת טלפון|פגישת עבודה|שיחת זום|שיחת וידאו)/;

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
  const READER_COMMIT = /\b(you (?:agreed|committed|promised|confirmed) to|as (?:you|per your) (?:agreed|committed|promised|discussed)|confirming you(?:'ll| will)|per your commitment|as discussed,? you(?:'ll| will))\b/i;
  const READER_COMMIT_HE = /(כפי שהתחייבת|כמו שהתחייבת|כפי שסיכמת|כמו שסיכמת|את(?:ה)? התחייבת|כמו שאמרת ש|כפי שהבטחת|כמו שהבטחת)/;

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
  const REQUEST_PATTERNS = [FlowJudgment.HANDOFF, FlowJudgment.HANDOFF_HE];

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
    // enough to actually act on" — is half the evidence bar for
    // COMMITMENT_OF_READER and REQUEST below. Neither a bare "could you
    // send that?" nor a bare "you agreed to help" should speak up on the
    // phrase alone; that's exactly the false-positive shape the scorer's
    // own money-alone penalty already refuses ("A figure alone, with
    // nothing decided").
    const hasConcreteAnchor = Boolean(facts.money) || Boolean(facts.date && facts.date.iso);
    const isReaderCommit = READER_COMMIT.test(text) || READER_COMMIT_HE.test(text);

    // Every raw signal, independent of which type ends up winning — the
    // decision layer (actions.js) reads this to notice a message is
    // multi-actionable (a meeting invite that ALSO asks for confirmation is
    // still an EVENT here, but actions.js can still see signals.handoff and
    // propose a reply draft alongside the calendar event).
    const signals = {
      hasMeetingNoun, hasConcreteAnchor, isReaderCommit,
      handoff: s.flags.handoff,
      hasDate: Boolean(facts.date && facts.date.iso),
      hasTime: Boolean(facts.time),
      hasMoney: Boolean(facts.money),
      score: s.total, threshold
    };

    // The one sentence a human would point to as "this is the actual ask" —
    // computed once, independent of which type ends up winning, and folded
    // into every returned Intent's entities as `requestWhat`. This is what
    // lets actions.js draft a reply that addresses the real ask ("could you
    // confirm you can make it") rather than restating the event itself
    // ("Meeting Sep 22 15:00") when a message carries BOTH a clear event
    // and a request — see finish() below and actions.js's own comment on
    // the SCHEDULED_EVENT + handoff combined case.
    const requestWhat = s.flags.handoff ? whatText(text, REQUEST_PATTERNS) : null;

    function finish(type, confidence, entities) {
      return {
        type, confidence,
        entities: Object.assign({ requestWhat }, entities),
        label: shortLabel(type, facts, enrichedFacts), signals, facts
      };
    }

    // --- 1. SCHEDULED_EVENT: hard gate, not score-based. All three or none,
    //        and never when the same message also says the meeting itself
    //        was called off — "the 3pm Friday sync is cancelled" must not
    //        become a new Calendar entry for that meeting. Precision over
    //        recall: a missed event chip costs one click; a calendar entry
    //        for a meeting that was just cancelled is actively wrong. Same
    //        refusal for a recap of a meeting that already happened — see
    //        EVENT_RECAP above — and for a message that plainly names a date
    //        already in the past, recap phrasing or not — see isPastDate.
    const calledOff = s.flags.lost || EVENT_CALLED_OFF.test(text) || EVENT_CALLED_OFF_HE.test(text);
    const isRecap = EVENT_RECAP.test(text) || EVENT_RECAP_HE.test(text);
    const isPast = isPastDate(facts.date && facts.date.iso, ctx.now);
    if (hasMeetingNoun && facts.date && facts.date.iso && facts.time && !calledOff && !isRecap && !isPast) {
      return finish(TYPES.SCHEDULED_EVENT, 'high', {
        who, amount,
        what: whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || 'Meeting',
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date.iso,
        hour: facts.time.hour,
        minute: facts.time.minute
      });
    }

    // --- 2. COMMITMENT_OF_READER: hard gate (regex + a concrete anchor). ---
    //        Deliberately NOT gated on the generic scorer threshold — that bar
    //        was tuned for a coarser "should the chip appear at all" decision
    //        across every kind of message, and a reader-commitment reminder
    //        with a real deadline attached is already unambiguous evidence on
    //        its own, the same way a meeting noun + date + time is above.
    if (isReaderCommit && hasConcreteAnchor) {
      return finish(TYPES.COMMITMENT_OF_READER, 'high', {
        who, amount,
        what: whatText(text, [READER_COMMIT, READER_COMMIT_HE]) || shortLabel(TYPES.COMMITMENT_OF_READER, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
    }

    // --- 3. REQUEST: an ask directed at the reader (same hard-gate shape). ---
    //        s.flags.handoff is FlowJudgment.score()'s own HANDOFF/HANDOFF_HE
    //        test, already computed above — reused rather than re-imported,
    //        so there is exactly one place that pattern is defined.
    if (s.flags.handoff && hasConcreteAnchor) {
      return finish(TYPES.REQUEST, 'medium', {
        who, amount,
        what: whatText(text, REQUEST_PATTERNS) || shortLabel(TYPES.REQUEST, facts, enrichedFacts),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      });
    }

    // Everything below this point is the old, proven "should Glance speak up
    // at all" question — reused as-is (same signals, same tuning against
    // test/judgment-corpus.cjs) for the two categories that don't have as
    // clean an independent evidentiary shape as the three hard-gated types
    // above. SCHEDULED_EVENT/COMMITMENT_OF_READER/REQUEST above never reach
    // here — they're hard evidentiary gates, not a score against a moving
    // bar, so there is no threshold for a per-type history to adjust.
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
