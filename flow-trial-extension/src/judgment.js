// The judgment engine: decides whether one email is worth speaking up about.
//
// It runs entirely on the device. No email text leaves the machine to reach this
// decision — that is a deliberate architectural choice, not a limitation of the
// trial, and it is what lets Flow Trial hold the same local-first line as the
// full product.
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
  const COMMIT = /\b(we'?re good (?:at|with)|agreed?(?: to| on)?|confirm(?:ed|ing)?|accept(?:ed)?|we'?ll take|executed)\b/i;
  // An explicit, unambiguous authorisation. These carry more weight than the
  // general list because "Approved — go ahead" is the single most common real
  // decision in business email and it arrives with no money and no date
  // attached, so it has to clear the bar largely on its own.
  const COMMIT_STRONG = /\b(approved?|signed off|sign-off|go ahead|green[- ]?lit|locked in|countersigned|fully executed|signature page attached)\b/i;
  // A decision was made in the other direction.
  const LOST = /\b(not (?:moving|going) forward|we'?re pulling out|decided to go with (?:someone|another)|going a different direction|no longer interested|cancel(?:ling|led)? the|terminate the|declin(?:e|ed|ing))\b/i;
  // A signature that an agreement completed.
  const EXECUTED = /\b(fully executed|countersigned|signed the (?:agreement|contract)|execution copy|signature page attached)\b/i;
  // Something is owed to somebody by a date.
  const OBLIGATION = /\b(due|deadline|by end of|no later than|must be (?:filed|delivered|paid|submitted)|expires?|payable|net ?\d{2})\b/i;
  // A direct request aimed at the reader.
  const HANDOFF = /\b(can you|could you|please (?:can you |could you )?(?:send|update|confirm|review|approve|handle|process)|need(?:s|ed)? you to|waiting on (?:your|you)|over to you|action required)\b/i;
  // A disagreement about money.
  const DISPUTE = /\b(doesn'?t match|does not match|discrepan(?:cy|t)|billing error|double[- ]charged|overcharged|incorrect (?:amount|invoice)|dispute)\b/i;

  const MARKETING = /\b(unsubscribe|view (?:this )?in (?:your )?browser|manage (?:your )?(?:email )?preferences|webinar|newsletter|limited[- ]time|special offer|% off|register now|save your seat)\b/i;
  const CALENDAR_NOISE = /\b(has (?:accepted|declined|tentatively accepted) (?:this|your) invitation|invitation from google calendar|added to your calendar)\b/i;
  // The fingerprint of a cold pitch. Without this, "our pricing starts at $99/mo,
  // can you confirm a time this week?" collects money + commitment + handoff and
  // outscores an actual signed contract.
  const SOLICITATION = /\b(pricing starts at|book a (?:demo|call|time)|schedule a (?:demo|call|quick chat)|free trial|hope this (?:email )?finds you well|following up on my (?:last|previous) email|just bumping this|circling back|quick question for you|reaching out because|thought you'?d be interested|worth a (?:quick )?chat)\b/i;

  // Where a reply stops being new and starts being history. Gmail's own quote
  // header runs about 60 characters ("On Mon, Sep 1, 2025 at 9:41 AM Dana Cole
  // <dana@x.com> wrote:"), so a narrow bound here matches nothing real and every
  // reply re-scores the whole thread — meaning "Sounds good, thanks!" over a
  // quoted contract scored identically to the contract itself, and Flow offered
  // to log the same decision again on every message in the thread.
  const QUOTE_START = [
    /^\s*On\b[\s\S]{3,200}?\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
    /^\s*From:\s.*$\n^\s*Sent:\s/im,
    /^\s*>{1,}\s?\S/m
  ];

  // Returns only the part of the message the sender actually just wrote. Falls
  // back to the whole text when no quote boundary is found, and ignores a
  // boundary so early that stripping would leave nothing to judge.
  function newContent(text) {
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
  function score(text, domain, facts) {
    const signals = [];
    const add = (id, weight, why) => signals.push({ id, weight, why });

    if (facts.automated) add('automated', -60, 'The sender looks automated');
    if (MARKETING.test(text)) add('marketing', -45, 'Reads like a mailing list, not a person');
    if (SOLICITATION.test(text)) add('solicitation', -55, 'Reads like a cold pitch, not your work');
    if (CALENDAR_NOISE.test(text)) add('calendar', -35, 'Calendar notification boilerplate');
    if (facts.wordCount < 12) add('too-short', -25, 'Too little text to judge');

    const commitStrong = COMMIT_STRONG.test(text);
    const commit = commitStrong || COMMIT.test(text);
    const lost = LOST.test(text);
    const executed = EXECUTED.test(text);
    const obligation = OBLIGATION.test(text);
    const handoff = HANDOFF.test(text);
    const dispute = DISPUTE.test(text);

    if (facts.money) add('money', 34, 'States a figure: ' + facts.moneyText);
    if (commitStrong) add('commitment', 42, 'Someone authorised something outright');
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

    // A message with a number and nothing else decided is a quote, not a decision.
    // Requiring a second signal alongside money is what keeps price lists quiet.
    const positives = signals.filter((s) => s.weight > 0);
    if (positives.length === 1 && positives[0].id === 'money') add('unsupported', -20, 'A figure alone, with nothing decided');

    const total = signals.reduce((sum, s) => sum + s.weight, 0);
    return { total, signals, flags: { commit, lost, executed, obligation, handoff, dispute, onDomain } };
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
    const dismissals = (c.dismissals || 0) * decay;
    const t = BASE_THRESHOLD - (c.clicks || 0) * 4 + dismissals * 6;
    return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, t));
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

    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT_STRONG, COMMIT, LOST, EXECUTED, DISPUTE, OBLIGATION, HANDOFF]);

    return {
      score: s.total,
      threshold,
      label: s.flags.onDomain ? domain.title(facts) : neutralTitle(facts),
      domain: domain.id,
      facts,
      signals: s.signals.filter((x) => x.weight !== 0)
    };
  }

  return { evaluate, thresholdFrom, BASE_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD };
})();

if (typeof module !== 'undefined') module.exports = { FlowJudgment };
