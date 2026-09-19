// A labelled corpus for the judgment engine.
//
// Every weight and threshold in judgment.js is a fitted parameter, and until
// this file existed they were fitted against nothing. Each case below states
// what a person would expect Flow to do, so a change to the scorer that quietly
// starts logging cold pitches — or quietly stops logging signed contracts —
// fails here instead of in someone's CRM.
//
// Run: node test/judgment-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the sources the same way the extension does — sequential scripts sharing
// one global — rather than as modules. That keeps this test honest about the
// environment the code actually runs in.
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
// Top-level `const` in a script creates a lexical binding rather than a property
// on the global object, so read them back by evaluating in the same context.
const FlowJudgment = vm.runInContext('FlowJudgment', sandbox);
const FlowExtract = vm.runInContext('FlowExtract', sandbox);

const NOW = new Date('2026-09-06T12:00:00Z');

// fire: should a chip appear at all.
// labelNot: substrings the label must never contain (catches fabricated facts).
const CASES = [
  // ---- real decisions that must be caught ----
  { name: 'explicit approval, no money or date', domain: 'ops', fire: true,
    subject: 'Re: migration plan',
    text: 'Approved. Go ahead and start on the migration whenever your team is ready.' },

  { name: 'signed contract with value and date', domain: 'sales', fire: true,
    subject: 'Re: Meridian agreement',
    text: 'Confirming we are agreed at $3,900 for the year. Countersigned copy attached, effective Sep 7.' },

  { name: 'lost deal', domain: 'sales', fire: true,
    subject: 'Re: proposal',
    text: 'Thanks for the time on this, but we have decided to go with another vendor. Not moving forward.' },

  { name: 'invoice with due date', domain: 'finance', fire: true,
    subject: 'Invoice INV-2041',
    text: 'Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.' },

  { name: 'candidate accepts offer', domain: 'hr', fire: true,
    subject: 'Re: Offer',
    text: 'I am delighted to accept the offer letter. My salary expectation of $120,000 is confirmed and I can start on March 3, 2027.' },

  { name: 'billing dispute', domain: 'finance', fire: true,
    subject: 'Re: March statement',
    text: 'The invoice amount does not match what we agreed. There is a discrepancy of $1,200 on the March statement — we were double-charged.' },

  { name: 'NDA executed with effective date', domain: 'legal', fire: true,
    subject: 'NDA — Acme Corp',
    text: 'The NDA is fully executed — countersigned copy attached, effective September 7.' },

  { name: 'renewal agreed with value and date', domain: 'support', fire: true,
    subject: 'Re: account renewal',
    text: 'Confirming the renewal is agreed at $18,000 for the year, effective September 7.' },

  // ---- noise that must stay quiet ----
  { name: 'cold sales pitch with a price', domain: 'sales', fire: false,
    subject: 'Quick question for you',
    text: 'Hope this email finds you well. I am reaching out because our pricing starts at $99/mo and I thought you would be interested. Can you confirm a time this week for a quick chat?' },

  { name: 'follow-up spam using the word deal', domain: 'sales', fire: false,
    subject: 'Circling back',
    text: 'Just bumping this to the top of your inbox. Here is the deal — we can offer a free trial and I would love to book a call. Worth a quick chat?' },

  { name: 'marketing newsletter', domain: 'sales', fire: false,
    subject: 'Your weekly digest',
    text: 'This month in review: a special offer of 20% off for a limited time. Register now to save your seat at our webinar. Unsubscribe or manage your email preferences.' },

  { name: 'pure pleasantry', domain: 'sales', fire: false,
    subject: 'Re: lunch',
    text: 'Sounds great, see you then. Thanks so much!' },

  // ---- the thread-reply trap: new content is trivial, history is a decision ----
  { name: 'thanks reply quoting a closed deal', domain: 'sales', fire: false,
    subject: 'Re: Meridian agreement',
    text: [
      'Sounds good, thanks!',
      '',
      'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:',
      '> Confirming we are agreed at $3,900 for the year.',
      '> Countersigned copy attached, effective Sep 7. Payment due Oct 14.'
    ].join('\n') },

  // ---- the fabricated-label trap: off-domain message must not borrow phrasing ----
  { name: 'office lease under the recruiting profile', domain: 'hr', fire: true,
    labelNot: ['offer', 'starts', 'candidate', 'hiring'],
    subject: 'Re: Suite 400 lease',
    text: 'We are agreed on the office lease for Suite 400 at $3,900 per month, commencing Sep 7. Countersigned copy attached.' },

  { name: 'office lease under the finance profile', domain: 'finance', fire: true,
    labelNot: ['offer', 'renewal', 'churn', 'candidate'],
    subject: 'Re: Suite 400 lease',
    text: 'We are agreed on the office lease for Suite 400 at $3,900 per month, commencing Sep 7. Countersigned copy attached.' }
];

function evaluate(c) {
  return FlowJudgment.evaluate(c.text, c.domain, {
    subject: c.subject, senderEmail: 'dana@meridian.com', now: NOW, calibration: null
  });
}

let failures = 0;
console.log('CASE'.padEnd(46), 'SCORE'.padEnd(7), 'RESULT');
console.log('-'.repeat(96));

for (const c of CASES) {
  const r = evaluate(c);
  const fired = !!r;
  const problems = [];
  if (fired !== c.fire) problems.push(fired ? 'fired but should be silent' : 'silent but should fire');
  if (r && c.labelNot) {
    for (const bad of c.labelNot) {
      if (r.label.toLowerCase().includes(bad.toLowerCase())) problems.push('label leaked "' + bad + '": ' + r.label);
    }
  }
  if (problems.length) failures++;
  console.log(
    c.name.padEnd(46),
    String(r ? r.score : '-').padEnd(7),
    (problems.length ? 'FAIL  ' + problems.join('; ') : 'ok    ' + (r ? r.label : 'silent'))
  );
}

// The absorbing-state regression: dismissals must not silence Flow forever.
console.log('\nCalibration recovery (dismissals must decay with time):');
const dismissed = { clicks: 0, dismissals: 3, ts: NOW.getTime() };
const tNow = FlowJudgment.thresholdFrom(dismissed, NOW.getTime());
const t2w = FlowJudgment.thresholdFrom(dismissed, NOW.getTime() + 14 * 864e5);
console.log('  after 3 dismissals:      threshold', tNow.toFixed(1));
console.log('  same, 2 quiet weeks on:  threshold', t2w.toFixed(1));
if (!(t2w < tNow)) { console.log('  FAIL: threshold did not recover'); failures++; }
else console.log('  ok    recovers toward baseline on its own');

// The mirror image, and the one that was actually broken: clicks were never
// decayed at read time, so an engaged user who hit the six-click cap pinned the
// threshold to MIN_THRESHOLD permanently — still there a year later. Someone
// who used Flow hard and then took a month off came back to the most eager
// version of it that exists, and dismissing could not walk it back, because
// dismissals faded while the clicks holding the floor down did not.
console.log('\nCalibration recovery (clicks must decay too, not just dismissals):');
const clicked = { clicks: 6, dismissals: 0, ts: NOW.getTime() };
const cNow = FlowJudgment.thresholdFrom(clicked, NOW.getTime());
const c90d = FlowJudgment.thresholdFrom(clicked, NOW.getTime() + 90 * 864e5);
console.log('  after 6 clicks:          threshold', cNow.toFixed(1));
console.log('  same, 90 quiet days on:  threshold', c90d.toFixed(1));
if (!(cNow <= FlowJudgment.MIN_THRESHOLD)) { console.log('  FAIL: clicks no longer lower the bar at all'); failures++; }
else if (!(c90d > cNow)) { console.log('  FAIL: threshold stayed pinned at the floor'); failures++; }
else if (Math.abs(c90d - FlowJudgment.BASE_THRESHOLD) > 0.5) { console.log('  FAIL: did not return to baseline, landed at ' + c90d.toFixed(1)); failures++; }
else console.log('  ok    an eager profile relaxes back to baseline when unused');

// A past bare date must not be silently rewritten into the future.
console.log('\nAmbiguous past date must not invent a future year:');
const pastDate = FlowExtract.extract('The March 3 kickoff already happened.', { now: NOW }).date;
console.log('  parsed:', JSON.stringify(pastDate));
if (pastDate && pastDate.iso) { console.log('  FAIL: invented ISO date ' + pastDate.iso); failures++; }
else console.log('  ok    kept the sender\'s words, emitted no ISO date');

// Hebrew quote headers ("בתאריך ... כתב/ה:" or "בתאריך ... מאת X:") must be
// stripped the same way the English "On ... wrote:" header already is —
// the gap this session's quoted-text fix closes. Checked directly against
// newContent() rather than through the full scorer, since the point here
// is "was the boundary found," not "did this particular Hebrew sentence
// clear the threshold."
console.log('\nHebrew quote header ("בתאריך ... כתב:") is stripped like the English one:');
const heQuoted = [
  'מעולה, תודה!',
  '',
  'בתאריך יום ב׳, 1 בספט׳ 2025 בשעה 9:41 מאת דנה כהן <dana@meridian.com> כתבה:',
  '> סוכם על 3,900$ לשנה.',
  '> ההסכם נחתם, בתוקף מ-7 בספטמבר.'
].join('\n');
const heNewOnly = FlowJudgment.newContent(heQuoted);
console.log('  kept:', JSON.stringify(heNewOnly));
if (heNewOnly.includes('נחתם') || heNewOnly.includes('סוכם') || heNewOnly.includes('בתאריך')) {
  console.log('  FAIL: quoted Hebrew content (or the quote header itself) leaked past the cut');
  failures++;
} else if (!heNewOnly.includes('מעולה')) {
  console.log('  FAIL: the genuine new content was stripped along with the quote');
  failures++;
} else {
  console.log('  ok    kept only the sender\'s new line, dropped the quoted history');
}

// The Outlook-style Hebrew "מאת:/נשלח:" header block must be stripped the
// same way its English "From:/Sent:" equivalent already is.
console.log('\nHebrew Outlook header ("מאת:"/"נשלח:") is stripped like the English one:');
const heOutlook = [
  'בסדר, אפשר להתקדם.',
  '',
  'מאת: דנה כהן <dana@meridian.com>',
  'נשלח: יום שני, 1 בספטמבר 2025 9:41',
  'אל: ישראל ישראלי',
  'נושא: הסכם מרידיאן',
  '',
  'סוכם על 3,900$ לשנה.'
].join('\n');
const heOutlookNewOnly = FlowJudgment.newContent(heOutlook);
console.log('  kept:', JSON.stringify(heOutlookNewOnly));
if (heOutlookNewOnly.includes('סוכם')) {
  console.log('  FAIL: quoted content leaked past the מאת:/נשלח: header');
  failures++;
} else {
  console.log('  ok    kept only the sender\'s new line, dropped the quoted history');
}

// The inverted-fact regression. Every trigger used to be tested against the
// whole message with a bare .test(), which cannot tell agreement from refusal:
// "We do NOT approve the $40,000" scored 59 and produced "Log $40,000 agreed",
// identical to the genuine approval. Writing the opposite of what the sender
// wrote is worse than writing nothing, so these must stay silent — while the
// two SPEAK cases guard the other edge, that suppression stays per-sentence
// and a real approval is not lost because something unrelated was negated
// later in the same message.
console.log('\nNegation, hedging and questions must not read as decisions:');
{
  const ctx = { now: NOW, subject: 'Re: Contract', senderEmail: 'dana@acme.com' };
  const cases = [
    ['speak',  'a plain approval',            'We approve the $40,000 and will sign Monday, so please send the paperwork over today.'],
    ['speak',  'approval, negation elsewhere','We approved the $40,000 budget for the pilot. Separately, I will not be able to make the Tuesday sync.'],
    ['speak',  'a genuine walk-away',         'Thanks for the proposal, but we are not moving forward with the renewal this year after all.'],
    ['silent', 'an explicit refusal',         'We do NOT approve the $40,000 and will not sign anything before the board reviews it.'],
    ['silent', '"cannot"',                    'We cannot approve the $40,000 at this time, as the budget has not been released yet.'],
    ['silent', '"unable to"',                 'We are unable to approve the $40,000 until the new fiscal year opens in October.'],
    ['silent', 'a conditional',               'If we approve the $40,000 we would sign Monday, but nothing has been decided internally yet.'],
    ['silent', 'a tentative maybe',           'We might approve the $40,000 next quarter depending on how the pilot numbers come back.'],
    ['silent', 'a question',                  'Would you approve the $40,000 and sign Monday, or do you need more time to review?'],
    ['silent', 'a hypothetical',              'Suppose we approved the $40,000 for the pilot — would that actually work on your side?']
  ];
  for (const [expect, label, text] of cases) {
    const r = FlowJudgment.evaluate(text, 'sales', ctx);
    const ok = expect === 'speak' ? !!r : !r;
    if (!ok) {
      failures++;
      console.log('  FAIL  ' + label + ' -> ' + (r ? 'spoke "' + r.label + '" (' + r.score + ')' : 'stayed silent') + ', expected ' + expect);
    } else {
      console.log('  ok    ' + label.padEnd(28) + (r ? 'speaks: "' + r.label + '"' : 'silent'));
    }
  }
}

// Precision/harm audit: applyTypeAdjustment layers a bounded, per-intent-type
// correction on top of the account-wide threshold. Tested in isolation from
// storage.js's calibrate() (which produces the {clicks, dismissals, ts}
// shape this consumes) so a bug in either half fails at the layer it's
// actually in.
console.log('\napplyTypeAdjustment: a per-type history nudges the gating threshold, bounded and reversible:');
{
  const base = 50;
  const noHistory = FlowJudgment.applyTypeAdjustment(base, undefined, NOW.getTime());
  if (noHistory !== base) { failures++; console.log('  FAIL  no calibrationByType entry should be a no-op, got', noHistory); }
  else console.log('  ok    no history -> threshold unchanged (' + noHistory + ')');

  const dismissed = FlowJudgment.applyTypeAdjustment(base, { clicks: 0, dismissals: 6, ts: NOW.getTime() }, NOW.getTime());
  if (!(dismissed > base)) { failures++; console.log('  FAIL  heavy per-type dismissals should raise the bar above base, got', dismissed); }
  else console.log('  ok    6 recent dismissals for this type -> quieter bar (' + dismissed + ' > ' + base + ')');

  const clicked = FlowJudgment.applyTypeAdjustment(base, { clicks: 6, dismissals: 0, ts: NOW.getTime() }, NOW.getTime());
  if (!(clicked < base)) { failures++; console.log('  FAIL  heavy per-type clicks should lower the bar below base, got', clicked); }
  else console.log('  ok    6 recent clicks for this type -> more proactive (' + clicked + ' < ' + base + ')');

  const capped = FlowJudgment.applyTypeAdjustment(FlowJudgment.MAX_THRESHOLD - 2, { clicks: 0, dismissals: 6, ts: NOW.getTime() }, NOW.getTime());
  if (capped > FlowJudgment.MAX_THRESHOLD) { failures++; console.log('  FAIL  adjustment must never push past MAX_THRESHOLD, got', capped); }
  else console.log('  ok    clamped at MAX_THRESHOLD even when base is already near the ceiling (' + capped + ')');

  const oldTs = NOW.getTime() - 90 * 24 * 60 * 60 * 1000; // 90 days ago, well past the 7-day half-life
  const decayed = FlowJudgment.applyTypeAdjustment(base, { clicks: 0, dismissals: 6, ts: oldTs }, NOW.getTime());
  if (!(decayed < dismissed)) { failures++; console.log('  FAIL  old dismissals should have decayed toward no effect, got', decayed, 'vs fresh', dismissed); }
  else console.log('  ok    a 90-day-old dismissal run has mostly decayed away (' + decayed + ' vs fresh ' + dismissed + ')');
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
