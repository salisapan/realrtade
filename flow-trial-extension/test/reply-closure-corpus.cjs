// Closure intelligence, ball-in-court, one story across threads, short chasers,
// evidence, and local-hit accounting. Precision first: every "must stay as it
// was" case matters as much as every new behaviour.
// Run: node test/reply-closure-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowReplyMeaning: RM } = require('../core/reply-meaning.js');
const { FlowStory: S } = require('../core/story.js');
const { FlowRecognitionStats: RS } = require('../core/recognition-stats.js');
const { FlowRequestTypes: T } = require('../core/request-types.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');
const { FlowExtract } = require('../core/extract.js');
const fs = require('fs'), path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = new Date('2026-10-05T09:00:00Z').getTime();
const replyW = { kind: 'reply', status: 'waiting', direction: 'theirs' };
const payW = { kind: 'payment', status: 'waiting', direction: 'theirs' };
const cr = (t, w) => F.classifyReply(t, w || replyW, { now: NOW, extract: FlowExtract });

// ---------------------------------------------------------------------------
console.log('\n--- replies that are NOT completion: the ball is back with you ---');
const YOURS = [
  ['I never got the attachment', 'blocked'], ['Hi Dana, I did not receive your email', 'blocked'], ['The link is broken', 'blocked'],
  ["I can't open the file you sent", 'blocked'], ['Nothing was attached', 'blocked'], ['Forgot to attach the contract?', 'blocked'],
  ["This is the wrong invoice, it's last year's", 'blocked'], ["Doesn't seem to have come through", 'blocked'],
  ['לא קיבלתי את הקובץ', 'blocked'], ['הקישור לא עובד', 'blocked'], ['שכחת לצרף את החוזה', 'blocked'], ['הקובץ לא נפתח אצלי', 'blocked'],
  ['Which invoice do you mean?', 'question'], ['Can you resend it?', 'question'], ['What is the PO number?', 'question'],
  ['Who should I send this to?', 'question'], ['Please resend the PO', 'question'], ['Send me the PO number', 'question'],
  ["I can't do Tuesday. How about Wednesday?", 'question'], ['Could we move it to next week instead?', 'question'],
  ['איזו חשבונית?', 'question'], ['כמה זה היה?', 'question'], ['לאיזה סכום אתה מתכוון?', 'question'], ['מתי אתה פנוי לשיחה?', 'question'],
  ['תשלח שוב את החוזה בבקשה', 'question']
];
YOURS.forEach(([t, why]) => {
  const r = cr(t);
  check('yours (' + why + '): ' + t, r.outcome === 'yours' && r.reason === why, r);
});

console.log('\n--- a deliberate no closes the loop, recorded as declined ---');
['We have decided not to proceed.', "Sorry, I can't sign this.", 'No thanks.', 'Not interested.', 'We will pass on this one.', 'We decided against it.',
  'לא מעוניינים, תודה', 'החלטנו לוותר על זה', 'לא נוכל להמשיך עם ההצעה', 'לא תודה'].forEach((t) => {
  const r = cr(t);
  check('declined: ' + t, r.outcome === 'declined', r);
  const a = F.applyReply(replyW, r, NOW);
  check('  closes as declined: ' + t, a.close === true && a.patch.closedAs === 'declined' && a.patch.status === 'resolved', a);
});
check('a payment pushed back on is yours, not closed', (() => { const r = cr("We won't pay this, the amount is wrong.", payW); return r.outcome === 'yours' && r.reason === 'question'; })(), cr("We won't pay this, the amount is wrong.", payW));

console.log('\n--- what must NOT become yours or declined (precision) ---');
[
  ['Sounds good, does that work?', 'ack/closed, not a question'], ['No problem, will do', 'ack'], ["Thanks, I can't wait to see it", 'not a decline'],
  ['Signed and attached. Is that ok?', 'delivered'], ['Yes, approved. Which account should I pay from?', 'delivered'], ['Got it, thanks', 'ack'],
  ['The store is not open yet', 'not a blocker'], ['Thanks! Have a good one?', 'courtesy'], ['Done.', 'delivered'], ["I'll send it tomorrow", 'promise'],
  ['מאושר, תודה', 'delivered'], ['אין בעיה, אעדכן מחר', 'promise'], ['Looks great, no worries on the delay.', 'not a decline'],
  ["Not yet, I'll have it Friday.", 'promise'], ["It won't be long, almost done.", 'not a decline'], ['Happy to help. Any questions?', 'courtesy']
].forEach(([t, why]) => {
  const r = cr(t);
  check('stays as before (' + why + '): ' + t, r.outcome !== 'yours' && r.outcome !== 'declined', r);
});
check('out-of-office still wins over everything', cr('Out of office until Monday. I cannot open email. Which invoice?').outcome === 'auto');
check('an answer plus thanks is still closed', cr('Confirmed for Thursday. Thanks!').outcome === 'closed');
check('payment claim still closes a payment loop', cr('We already paid this yesterday.', payW).outcome === 'paid');

console.log('\n--- applyReply: the ball in your court ---');
{
  const r = cr('Which invoice do you mean?');
  const a = F.applyReply({ kind: 'reply', status: 'waiting', direction: 'theirs', createdAt: NOW, nudges: 0 }, r, NOW);
  check('yours keeps the loop open', !a.close && a.yours === true && a.patch.stage === 'yours', a);
  check('the reminder is for you: next business day', a.patch.chaseIso === '2026-10-06', a.patch);
  check('the reason is kept for the label', a.patch.yoursReason === 'question', a.patch);
  const w = Object.assign({ kind: 'reply', status: 'waiting', direction: 'theirs', createdAt: NOW, nudges: 1, subject: 'Q3 invoice', counterpart: { email: 'a@x.com', name: 'Dana Levi' } }, a.patch);
  check('isYours', F.isYours(w) === true);
  check('stageOf says yours', F.stageOf(w) === 'yours');
  check('summarize counts it', F.summarize([w], NOW).yours === 1 && F.summarize([w], NOW).active === 1);
  check('task title now says what to do', /^Answer Dana/.test(F.taskTitle(w)), F.taskTitle(w));
  check('a blocked loop says resend', /^Resend to Dana/.test(F.taskTitle(Object.assign({}, w, { yoursReason: 'blocked' }))));
  const hb = F.handBackPatch(w, NOW);
  check('answering hands the ball back', hb.stage === 'nudged' && hb.yoursReason === null && hb.chaseIso > '2026-10-05', hb);
  check('a fresh loop hands back to waiting', F.handBackPatch(Object.assign({}, w, { nudges: 0 }), NOW).stage === 'waiting');
  const later = F.applyReply(w, cr('Never mind, found it. Thanks!'), NOW);
  check('if they then settle it themselves, it closes', later.close === true, later);
  const prom = F.applyReply(w, cr("I'll send it by Friday."), NOW);
  check('a later promise moves it to promised', prom.patch && prom.patch.stage === 'promised', prom);
}
check('ack on a yours loop leaves it yours', (() => { const a = F.applyReply({ kind: 'reply', status: 'waiting', direction: 'theirs', stage: 'yours' }, cr('Thanks!'), NOW); return !a.close && !a.patch.stage; })());

console.log('\n--- replies carry how they were understood (for the local-hit rate) ---');
check('a named rule is basis rule', cr('Which invoice do you mean?').basis === 'rule' && cr('Got it, thanks').basis === 'rule' && cr('Confirmed, attached.').basis === 'rule');
check('the old "they wrote, so answered" fallthrough is basis default', cr('Let us see how this evolves over the coming quarter, there are many factors.').basis === 'default', cr('Let us see how this evolves over the coming quarter, there are many factors.'));

console.log('\n--- one story across threads ---');
const inv = { id: 't1', status: 'waiting', direction: 'theirs', kind: 'payment', counterpart: { email: 'dana@acme.com', name: 'Dana' }, subject: 'Invoice INV-204 - October', what: 'Please pay INV-204', amount: { value: 4200, currency: 'ILS', raw: '4,200 ILS' } };
const other = { id: 't2', status: 'waiting', direction: 'theirs', kind: 'reply', counterpart: { email: 'dana@acme.com' }, subject: 'Lease addendum draft', what: 'Please review the addendum' };
const mine = { id: 't3', status: 'waiting', direction: 'mine', counterpart: { email: 'dana@acme.com' }, subject: 'Invoice INV-204 - October', what: 'I will send' };
const m = (msg) => S.match([inv, other, mine], msg, { extract: FlowExtract });
check('normalise: Re/Fwd/tags/case', S.normalizeSubject('RE: Re: [EXTERNAL] Invoice INV-204 - October') === 'invoice inv-204 - october');
check('normalise: Hebrew prefix', S.normalizeSubject('השב: הצעת מחיר לפרויקט') === 'הצעת מחיר לפרויקט');
check('reference numbers: INV-204, PO 7731, #4521, חשבונית 2041', (() => { const r = S.refs('INV-204, PO 7731, #4521, חשבונית 2041'); return r.has('inv204') && r.has('7731') && r.has('4521') && r.has('2041'); })(), [...S.refs('INV-204, PO 7731, #4521, חשבונית 2041')]);
check('a fresh thread naming the invoice number belongs to the loop', (m({ email: 'dana@acme.com', subject: 'paid', text: 'Hi, paid INV-204 today' }) || {}).watch === inv);
check('same subject, Re: dropped, different thread', (m({ email: 'DANA@acme.com', subject: 'Re: Invoice INV-204 - October', text: 'on it' }) || {}).watch === inv);
check('the same amount names the story', (m({ email: 'dana@acme.com', subject: 'transfer', text: 'We transferred 4,200 ILS this morning' }) || {}).watch === inv, m({ email: 'dana@acme.com', subject: 'transfer', text: 'We transferred 4,200 ILS this morning' }));
check('a different person never matches', m({ email: 'eve@acme.com', subject: 'Invoice INV-204 - October', text: 'paid INV-204' }) === null);
check('a generic subject alone never matches', m({ email: 'dana@acme.com', subject: 'Question', text: 'quick one' }) === null);
check('your own promise is never the target of their reply', (m({ email: 'dana@acme.com', subject: 'Invoice INV-204 - October', text: 'x' }) || {}).watch !== mine);
check('two plausible loops: no guess', S.match([inv, Object.assign({}, inv, { id: 'dup' })], { email: 'dana@acme.com', subject: 'Invoice INV-204 - October', text: 'ok' }) === null);
check('a closed loop is not a target', S.match([Object.assign({}, inv, { status: 'resolved' })], { email: 'dana@acme.com', subject: 'Invoice INV-204 - October', text: 'ok' }) === null);
check('no email, no match', S.match([inv], { email: '', subject: 'Invoice INV-204 - October', text: 'INV-204' }) === null);

console.log('\n--- short chasers: two words, real asks ---');
const SHORT_YES = ['Invoice?', 'Signed yet?', 'Any update?', 'Any update on this?', 'Paid?', 'Status?', 'The contract?', 'Done yet?', 'Reviewed?', 'Did you get my email?', 'Hi Dana, any update?',
  'מה הסטטוס?', '?מה המצב', 'שולם?', 'נחתם?', 'יש עדכון?', 'מתי תשלחו?', 'עדכון?'];
SHORT_YES.forEach((t) => check('short chase recognised: ' + t, Boolean(F.classifyOutgoing(t, { now: NOW, extract: FlowExtract, pipeline: P })), F.classifyOutgoing(t, { now: NOW })));
const SHORT_NO = ['Invoice.', 'Invoice', 'Thanks?', 'Ok?', 'How was your weekend?', 'Are you coming?', 'Got it?', 'Why?', 'Really?', 'See you Tuesday', 'Thanks!', 'חשבונית', 'מה נשמע?', 'תודה?'];
SHORT_NO.forEach((t) => check('short message stays silent: ' + t, F.classifyOutgoing(t, { now: NOW, extract: FlowExtract, pipeline: P }) === null, F.classifyOutgoing(t, { now: NOW })));
check('"Paid?" opens a payment loop', (F.classifyOutgoing('Paid?', { now: NOW, extract: FlowExtract, pipeline: P }) || {}).kind === 'payment');
check('"Any update?" is itself a chase of a loop already open', F.looksLikeChase('Any update?') === true && F.looksLikeChase('מה הסטטוס?') === true && F.looksLikeChase('See you Tuesday') === false);

console.log('\n--- evidence: strong vs weak, polite noise vs action ---');
{
  const e = (t) => P.recognize(t).evidence;
  const pay = e('Please pay the 4,200 NIS invoice by Friday.');
  check('a payment ask with amount and date is strong', pay.strength === 'strong' && pay.strong.includes('amount') && pay.strong.includes('date'), pay);
  check('a short chaser is weak/medium and says why', ['weak', 'medium'].includes(e('Any update?').strength) && e('Any update?').strong.includes('short-form'));
  check('thanks carries no actionable strength', e('Thanks!').strength === 'none');
  check('"please find attached" is not actionable', e('Please find attached the report.').strength === 'none');
  check('a promise with a date is strong', e('I will send you the numbers tomorrow.').strength === 'strong');
}

console.log('\n--- local-hit accounting ---');
{
  const st = RS.empty();
  RS.add(st, RS.decide(P.analyze('Please pay the invoice by Friday.'), true));
  RS.add(st, RS.decide(P.analyze('Thanks, see you there.'), false));
  RS.add(st, RS.decideReply(cr('Which invoice do you mean?')));
  RS.add(st, RS.decideReply(cr('Let us see how this evolves over the coming quarter, there are many factors.')));
  const r = RS.rates(st);
  check('hit + silence + hit + residual = 4 decisions', r.total === 4 && st.localHit === 2 && st.localSilence === 1 && st.residual === 1, st);
  check('local share counts hits and confident silence', r.localShare === 0.75, r);
  check('remote share is zero while the remote hook is off', r.remoteShare === 0);
  check('a model-unsure ask is residual, not a silent hit', (() => { const d = RS.decide([{ act: 'ASK', unsure: true, tier: 'model' }], false); return d.kind === 'residual'; })());
  check('stats hold counts only, no text', !JSON.stringify(st).includes('invoice'));
}


console.log('\n--- hand-written replies (fixtures), measured, not just passed ---');
// reply-blind.json was written first and tuned on after its first run (so it is a
// regression guard, not an estimate). reply-fresh.json was written afterwards and
// run once before any fix: its first-run score is in docs/local-detection-plan.md.
// Thresholds equal what was measured; they only ever move up.
function measure(file) {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
  let ok = 0, wrongClose = 0;
  const closing = ['closed', 'declined', 'paid'];
  rows.forEach((r) => {
    const o = F.classifyReply(r.text, { kind: r.kind, status: 'waiting', direction: 'theirs' }, { now: NOW, extract: FlowExtract }).outcome;
    const got = r.kind === 'payment' && o === 'answered' ? 'closed' : o;
    if (got === r.label) ok++;
    if (closing.includes(o) && !closing.includes(r.label)) wrongClose++;
  });
  return { n: rows.length, acc: ok / rows.length, wrongClose };
}
{
  const b = measure('reply-blind.json'), f = measure('reply-fresh.json');
  console.log('  tuned set: ' + (b.acc * 100).toFixed(0) + '% of ' + b.n + ', loops wrongly closed ' + b.wrongClose + ' | fresh set: ' + (f.acc * 100).toFixed(0) + '% of ' + f.n + ', loops wrongly closed ' + f.wrongClose);
  check('tuned set: at least 95%, and no loop closed that should stay open', b.acc >= 0.95 && b.wrongClose === 0, b);
  check('fresh set: at least 85%, and at most one loop wrongly closed', f.acc >= 0.85 && f.wrongClose <= 1, f);
}

console.log('\n--- no external reach ---');
check('the new core files never reach outside the device', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(|\bdocument\.\w|\bwindow\.\w/.test(['reply-meaning.js', 'story.js', 'recognition-stats.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8')).join('\n')));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
