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
  const BASE_THRESHOLD = 55;
  const MIN_THRESHOLD = 38;
  const MAX_THRESHOLD = 82;

  // A decision was made — someone committed to something.
  const COMMIT = /\b(we'?re good (?:at|with)|agreed?(?: to| on)?|approved?|confirm(?:ed|ing)?|signed off|sign-off|go ahead|greenlit|accept(?:ed)?|locked in|we'?ll take|deal|countersigned|fully executed|executed)\b/i;
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
  const CALENDAR_NOISE = /\b(has (?:accepted|declined|tentatively accepted) (?:this|your) invitation|invitation from google calendar|when\s+.*\s+where\s+.*\s+calendar|added to your calendar)\b/i;
  const THREAD_NOISE = /\b(on .{3,40} wrote:|-{3,} ?forwarded message ?-{3,}|from:\s.*\nsent:\s)/i;

  // Every signal is {id, weight, why}. `why` is user-facing text — it shows up in
  // the popup, so it has to read like a sentence someone would say out loud.
  function score(text, domain, facts) {
    const signals = [];
    const add = (id, weight, why) => signals.push({ id, weight, why });

    if (facts.automated) add('automated', -60, 'The sender looks automated');
    if (MARKETING.test(text)) add('marketing', -45, 'Reads like a mailing list, not a person');
    if (CALENDAR_NOISE.test(text)) add('calendar', -35, 'Calendar notification boilerplate');
    if (facts.wordCount < 12) add('too-short', -25, 'Too little text to judge');
    // Very long threads are usually a quoted history — the new content is small
    // and the pattern hits are mostly from older messages.
    if (facts.wordCount > 900) add('long-thread', -12, 'Mostly quoted history');
    if (THREAD_NOISE.test(text) && facts.wordCount > 400) add('quoted', -8, 'Largely a quoted reply chain');

    const commit = COMMIT.test(text);
    const lost = LOST.test(text);
    const executed = EXECUTED.test(text);
    const obligation = OBLIGATION.test(text);
    const handoff = HANDOFF.test(text);
    const dispute = DISPUTE.test(text);

    if (facts.money) add('money', 34, 'States a figure: ' + facts.moneyText);
    if (commit) add('commitment', 30, 'Someone committed to something');
    if (lost) add('lost', 40, 'States the work is not going ahead');
    if (executed) add('executed', 26, 'Says an agreement was executed');
    if (dispute) add('dispute', 28, 'Raises a discrepancy');
    if (facts.date && obligation) add('deadline', 26, 'Sets a dated obligation: ' + facts.date.raw);
    else if (facts.date) add('date', 12, 'Names a date: ' + facts.date.raw);
    if (handoff) add('handoff', 18, 'Asks you to do something specific');
    if (domain.entityWords.test(text)) add('domain', 14, 'About ' + domain.entity.toLowerCase());
    if (facts.isReply) add('reply', 8, 'Part of an ongoing thread');

    // A message with a number and nothing else decided is a quote, not a decision.
    // Requiring a second signal alongside money is what keeps price lists quiet.
    const positives = signals.filter((s) => s.weight > 0);
    if (positives.length === 1 && positives[0].id === 'money') add('unsupported', -20, 'A figure alone, with nothing decided');

    const total = signals.reduce((sum, s) => sum + s.weight, 0);
    return { total, signals, flags: { commit, lost, executed, obligation, handoff, dispute } };
  }

  // The threshold is the only thing that learns. Clicking says "more like that",
  // dismissing says "less" — and neither ever asks the user to configure a number.
  function thresholdFrom(calibration) {
    const c = calibration || {};
    const t = BASE_THRESHOLD - (c.clicks || 0) * 4 + (c.dismissals || 0) * 6;
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

  function evaluate(text, domainId, ctx) {
    ctx = ctx || {};
    const domain = FLOW_DOMAINS.find((d) => d.id === domainId) || FLOW_DOMAINS[0];
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

    const threshold = thresholdFrom(ctx.calibration);
    if (s.total < threshold) return null;

    facts.quote = FlowExtract.decisiveSentence(text, [COMMIT, LOST, EXECUTED, DISPUTE, OBLIGATION, HANDOFF]);

    return {
      score: s.total,
      threshold,
      label: domain.title(facts),
      domain: domain.id,
      facts,
      signals: s.signals.filter((x) => x.weight !== 0)
    };
  }

  return { evaluate, thresholdFrom, BASE_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD };
})();

if (typeof module !== 'undefined') module.exports = { FlowJudgment };
