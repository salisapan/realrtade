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
    text: 'We are agreed on the office lease for Suite 400 at $3,900 per month, commencing Sep 7. Countersigned copy attached.' },

  // ---- gaps measured against the product examples and the six profiles ----
  // Length penalty on one clear sentence, non-renewal missing from the lost
  // list, "can you confirm/agree" scored as a decision, Hebrew "נחתם" weighed
  // like a weak signal. The click half-life is asserted below the table.
  { name: 'bare approval in a thread', domain: 'ops', fire: true,
    subject: 'Re: migration plan',
    text: 'Approved. Go ahead.' },

  { name: 'signed off and fully executed', domain: 'legal', fire: true,
    labelHas: ['executed'],
    subject: 'Re: Acme agreement',
    text: 'Signed off. Fully executed.' },

  { name: 'candidate declined', domain: 'hr', fire: true,
    labelHas: ['declined'],
    subject: 'Re: Offer — Senior Backend Engineer',
    text: 'The candidate declined the offer and is no longer interested.' },

  { name: 'start date confirmed', domain: 'hr', fire: true,
    labelHas: ['start'],
    subject: 'Re: Offer — Senior Backend Engineer',
    text: 'Start date is confirmed as March 3, 2027. The candidate accepted.' },

  // Product architecture §1.5, recruiting. Eight words. Must speak.
  { name: 'candidate accepts, short', domain: 'hr', fire: true,
    labelHas: ['June'],
    subject: 'Re: Offer — Senior Backend Engineer',
    text: "I'm going to accept, can start June 2nd." },

  // Product architecture §1.3, finance: an invoice due. Eleven words, one
  // point under the old bar solely because of the length penalty.
  { name: 'short invoice with due date', domain: 'finance', fire: true,
    labelHas: ['12,500'],
    subject: 'Invoice INV-2041',
    text: 'Invoice 2041 for $12,500 is payable net 30, due October 14.' },

  // Product architecture §1.5, customer success. "not to renew" / switching
  // vendor is a loss even though it never says "not moving forward".
  { name: 'customer will not renew', domain: 'support', fire: true,
    labelHas: ['churn'],
    labelNot: ['confirmed'],
    subject: 'Re: Renewal — Q4 contract',
    text: "We've decided not to renew past March; the team's moving to a different vendor." },

  { name: 'account is not renewing', domain: 'support', fire: true,
    subject: 'Re: Q4 renewal',
    text: 'We are not renewing the account. Please treat this as our cancellation notice and close the renewal.' },

  // A question about a price is not a confirmation. Bare "confirm" used to
  // score as a commitment and the chip read "Log confirmed value".
  { name: 'question about a proposal price', domain: 'sales', fire: false,
    subject: 'Re: proposal',
    text: 'Can you confirm whether the proposal at $3,900 still works for the client?' },

  // "agree" is a commitment; "can you agree" is a request. The chip must not
  // read it as a confirmed price. The period (no "?") is deliberate — the
  // request has to be caught without relying on a question mark.
  { name: 'request to agree a price', domain: 'sales', fire: false,
    subject: 'Re: proposal',
    text: 'Can you agree to the $3,900 proposal by Monday.' },

  { name: 'we agree to a price', domain: 'sales', fire: true,
    labelHas: ['4,800'],
    subject: 'Re: annual contract',
    text: 'We agree to $4,800 for the annual contract, effective October 1, 2026.' },

  { name: 'please confirm receipt', domain: 'ops', fire: false,
    subject: 'Re: handover',
    text: 'Please confirm you received the handover notes for the onboarding request, and send them back when you can.' },

  // "offer" in a mailing list must stay quiet even on the recruiting profile,
  // which watches for offers.
  { name: 'newsletter mentioning an offer, recruiting profile', domain: 'hr', fire: false,
    subject: 'Your weekly digest',
    text: 'This month in review: a special offer of 20% off for a limited time. Register now to save your seat at our webinar. Unsubscribe or manage your email preferences.' },

  // Hebrew executed agreement: "נחתם" is the passive twin of "fully executed",
  // which in English sits on the strong-commitment list. Without that, a
  // signed agreement with no dollar amount cannot clear the bar.
  { name: 'hebrew agreement executed', domain: 'legal', fire: true,
    labelHas: ['executed'],
    subject: 'הסכם',
    text: 'שלום, ההסכם נחתם אתמול על ידי שני הצדדים. עותק חתום מצורף למייל הזה לתיק.' },

  // Hebrew non-renewal. The existing lost list has "לא ממשיכים" but not
  // "לא לחדש", so a renewal decision phrased the way the English example is
  // stayed silent.
  { name: 'hebrew will not renew', domain: 'sales', fire: true,
    labelHas: ['lost'],
    subject: 'Re: חידוש',
    text: 'החלטנו לא לחדש את החוזה אחרי מרץ, הצוות עובר לספק אחר.' },

  // Same shape as "Approved. Go ahead." — a Hebrew authorisation in a thread
  // has to clear without a dollar amount. The length penalty used to eat it.
  { name: 'hebrew approval in a thread', domain: 'ops', fire: true,
    subject: 'Re: בקשה',
    text: 'מאושר. אפשר להתקדם עם הבקשה ברגע שהצוות שלכם פנוי לטפל בזה.' }
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
  if (r && c.labelHas) {
    for (const need of c.labelHas) {
      if (!r.label.toLowerCase().includes(need.toLowerCase())) problems.push('label missing "' + need + '": ' + r.label);
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

// Clicks use the same half-life. A quiet fortnight must not leave Flow parked
// at maximum sensitivity, and fading dismissals must not outrun sticky clicks
// (that made a mixed history more talkative by doing nothing).
console.log('\nCalibration recovery (clicks decay on the same half-life):');
const clicked = { clicks: 6, dismissals: 0, ts: NOW.getTime() };
const cNow = FlowJudgment.thresholdFrom(clicked, NOW.getTime());
const c2w = FlowJudgment.thresholdFrom(clicked, NOW.getTime() + 14 * 864e5);
console.log('  after 6 clicks:          threshold', cNow.toFixed(1));
console.log('  same, 2 quiet weeks on:  threshold', c2w.toFixed(1));
if (!(c2w > cNow && c2w <= FlowJudgment.BASE_THRESHOLD)) {
  console.log('  FAIL: clicks did not decay back toward baseline');
  failures++;
} else console.log('  ok    clicks walk back toward baseline on their own');

const mixed = { clicks: 6, dismissals: 3, ts: NOW.getTime() };
const mNow = FlowJudgment.thresholdFrom(mixed, NOW.getTime());
const m2w = FlowJudgment.thresholdFrom(mixed, NOW.getTime() + 14 * 864e5);
console.log('  6 clicks + 3 dismissals: threshold', mNow.toFixed(1));
console.log('  same, 2 quiet weeks on:  threshold', m2w.toFixed(1));
if (!(m2w >= mNow)) {
  console.log('  FAIL: time made a mixed history more sensitive');
  failures++;
} else console.log('  ok    mixed history does not get more sensitive by waiting');

// A past bare date must not be silently rewritten into the future.
console.log('\nAmbiguous past date must not invent a future year:');
const pastDate = FlowExtract.extract('The March 3 kickoff already happened.', { now: NOW }).date;
console.log('  parsed:', JSON.stringify(pastDate));
if (pastDate && pastDate.iso) { console.log('  FAIL: invented ISO date ' + pastDate.iso); failures++; }
else console.log('  ok    kept the sender\'s words, emitted no ISO date');

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
