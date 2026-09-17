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
  const MEETING_NOUN_HE = /(פגישה|שיחה|ראיון|סנכרון|תיאום|ייעוץ|הדגמה)/;

  // A reader-directed commitment reminder — narrow by design. This is not
  // "someone agreed to something" (that's DECISION_TO_LOG, judgment.js's
  // COMMIT/COMMIT_STRONG) but specifically "you, the reader, agreed to
  // something, and this message is confirming or reminding you of it."
  // English and Hebrew business correspondence phrase this differently
  // enough that a shared pattern would either miss most real cases or catch
  // far too much, so — same as judgment.js's own signal pairs — these stay
  // separate regexes rather than one pattern trying to cover both.
  const READER_COMMIT = /\b(you (?:agreed|committed|promised|confirmed) to|as (?:you|per your) (?:agreed|committed|promised|discussed)|confirming you(?:'ll| will)|per your commitment|as discussed,? you(?:'ll| will))\b/i;
  const READER_COMMIT_HE = /(כפי שהתחייבת|כמו שהתחייבת|כפי שסיכמת|כמו שסיכמת|את(?:ה)? התחייבת|כמו שאמרת ש)/;

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

  function classify(text, ctx) {
    ctx = ctx || {};
    text = FlowJudgment.newContent(text);

    const domain = FLOW_DOMAINS[0]; // no domain picker in the MVP — see connectors.js/popup.js
    const facts = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
    const s = FlowJudgment.score(text, domain, facts);
    const threshold = FlowJudgment.thresholdFrom(ctx.calibration, ctx.now);

    const who = ctx.senderName || ctx.senderEmail || null;
    const amount = facts.moneyText || null;

    // --- 1. SCHEDULED_EVENT: hard gate, not score-based. All three or none. ---
    const hasMeetingNoun = MEETING_NOUN.test(text) || MEETING_NOUN_HE.test(text);
    if (hasMeetingNoun && facts.date && facts.date.iso && facts.time) {
      return {
        type: TYPES.SCHEDULED_EVENT,
        confidence: 'high',
        entities: {
          who, amount,
          what: whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || 'Meeting',
          when: humanWhen(facts.date, facts.time),
          dateIso: facts.date.iso,
          hour: facts.time.hour,
          minute: facts.time.minute
        },
        facts
      };
    }

    // A resolved date or a resolved money figure — "something concrete
    // enough to actually act on" — is the second half of the evidence bar
    // for both types below. Neither a bare "could you send that?" nor a
    // bare "you agreed to help" should speak up on the phrase alone; that's
    // exactly the false-positive shape the old scorer's own money-alone
    // penalty already refuses ("A figure alone, with nothing decided").
    const hasConcreteAnchor = Boolean(facts.money) || Boolean(facts.date && facts.date.iso);

    // --- 2. COMMITMENT_OF_READER: hard gate (regex + a concrete anchor). ---
    //        Deliberately NOT gated on the generic scorer threshold — that bar
    //        was tuned for a coarser "should the chip appear at all" decision
    //        across every kind of message, and a reader-commitment reminder
    //        with a real deadline attached is already unambiguous evidence on
    //        its own, the same way a meeting noun + date + time is above.
    const isReaderCommit = READER_COMMIT.test(text) || READER_COMMIT_HE.test(text);
    if (isReaderCommit && hasConcreteAnchor) {
      return {
        type: TYPES.COMMITMENT_OF_READER,
        confidence: 'high',
        entities: {
          who, amount,
          what: whatText(text, [READER_COMMIT, READER_COMMIT_HE]) || FlowJudgment.neutralTitle(Object.assign({}, facts, { lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute })),
          when: humanWhen(facts.date, facts.time),
          dateIso: facts.date && facts.date.iso
        },
        facts
      };
    }

    // --- 3. REQUEST: an ask directed at the reader (same hard-gate shape). ---
    //        s.flags.handoff is FlowJudgment.score()'s own HANDOFF/HANDOFF_HE
    //        test, already computed above — reused rather than re-imported,
    //        so there is exactly one place that pattern is defined.
    if (s.flags.handoff && hasConcreteAnchor) {
      return {
        type: TYPES.REQUEST,
        confidence: 'medium',
        entities: {
          who, amount,
          what: whatText(text, REQUEST_PATTERNS) || FlowJudgment.neutralTitle(Object.assign({}, facts, { lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute })),
          when: humanWhen(facts.date, facts.time),
          dateIso: facts.date && facts.date.iso
        },
        facts
      };
    }

    // Everything below this point is the old, proven "should Glance speak up
    // at all" question — reused as-is (same signals, same tuning against
    // test/judgment-corpus.cjs) for the two categories that don't have as
    // clean an independent evidentiary shape as the three hard-gated types
    // above.
    if (s.total < threshold) return { type: null, facts };

    // --- 4. DECISION_TO_LOG: an outcome someone reported — the chip's original job. ---
    if (s.flags.commit || s.flags.lost || s.flags.executed || s.flags.dispute) {
      const enrichedFacts = Object.assign({}, facts, { lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute });
      return {
        type: TYPES.DECISION_TO_LOG,
        confidence: 'high',
        entities: {
          who, amount,
          what: whatText(text, [/\b(agreed|approved|confirmed|executed|declin(?:e|ed|ing))\b/i, /(סוכם|אישרנו|מאשרים|נחתם)/]) ||
            FlowJudgment.neutralTitle(enrichedFacts),
          when: humanWhen(facts.date, facts.time),
          dateIso: facts.date && facts.date.iso
        },
        facts
      };
    }

    // --- 5. FOLLOW_UP: cleared the bar (a dated obligation, usually) but ---
    //        doesn't fit a sharper category — the safe catch-all rather than
    //        silently dropping something the proven scorer already vouched for.
    return {
      type: TYPES.FOLLOW_UP,
      confidence: 'low',
      entities: {
        who, amount,
        what: FlowJudgment.neutralTitle(Object.assign({}, facts, { lost: s.flags.lost, executed: s.flags.executed, dispute: s.flags.dispute })),
        when: humanWhen(facts.date, facts.time),
        dateIso: facts.date && facts.date.iso
      },
      facts
    };
  }

  return { TYPES, classify };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntent };
