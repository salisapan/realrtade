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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), sandbox, { filename: f });
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

// A past bare date must not be silently rewritten into the future.
console.log('\nAmbiguous past date must not invent a future year:');
const pastDate = FlowExtract.extract('The March 3 kickoff already happened.', { now: NOW }).date;
console.log('  parsed:', JSON.stringify(pastDate));
if (pastDate && pastDate.iso) { console.log('  FAIL: invented ISO date ' + pastDate.iso); failures++; }
else console.log('  ok    kept the sender\'s words, emitted no ISO date');

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
