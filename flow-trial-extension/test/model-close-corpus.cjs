// Carry until closed, for a loop the model found: core/model-plan.js closeFor() decides what the newest message does to it.
// The follow loop's generic rule closes a 'mine' loop only on a delivery ("attached", "done"); an ask of you closes on your real answer.
// The eval below is a hand-written set of the person's own replies (EN + HE), not real mail. It measures the generic rule against
// closeFor() on an ask of you: real answers closed, and acknowledgements, holding replies and auto-replies wrongly closed (must stay 0).
// Run: node test/model-close-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'reply-meaning.js', 'file-path.js', 'follow-up.js', 'model-plan.js'];
const sb = { module: undefined, console, setTimeout, clearTimeout, Promise };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const M = vm.runInContext('FlowModelPlan', sb), FU = vm.runInContext('FlowFollowUp', sb);
const NOW = Date.parse('2026-10-07T09:00:00'); // a Wednesday
const ON = { aiPlanV1: true };
const watch = (subtype, direction, over) => Object.assign(FU.buildWatch({ threadId: 't-1', now: NOW, subject: 'Lease',
  ask: { kind: FU.KINDS.REPLY, what: 'Could you confirm Thursday at 10?', chaseIso: '2026-10-09', subtype, tier: 'model', direction } }), over || {});
const own = (text) => ({ isOwn: true, text });
const them = (text) => ({ isOwn: false, text });

// The person's own replies to an ask of them. close: true = this answers it.
const EVAL = [
  ['Hi Dana, Thursday at 10 works for me. See you then.', true], ['Yes, confirmed for Thursday.', true], ['Approved, go ahead.', true],
  ['Here is the signed lease.', true], ['The address is 12 Herzl St, Tel Aviv.', true], ['Sure, the code is 4471.', true],
  ['Done, I sent it to the bank this morning.', true], ['No, that does not work for us, sorry.', true],
  ['היי דנה, יום חמישי ב-10 מתאים לי.', true], ['כן, מאשרת.', true], ['מצורף החוזה החתום.', true], ['הכתובת היא הרצל 12, תל אביב.', true],
  ['Got it, thanks!', false], ['Thanks, will look into it.', false], ['I will send it on Thursday.', false], ["Let me check and get back to you.", false],
  ['Still waiting on the accountant, will update you.', false], ['I am out of the office until Monday.', false], ['Noted.', false],
  ['תודה, קיבלתי.', false], ['אבדוק ואחזור אלייך.', false], ['אשלח ביום חמישי.', false], ['רשמתי, תודה', false]
];

(async () => {
  console.log('\n--- an ask of you: before (the generic mine rule) and after (closeFor) ---\n');
  let before = { right: 0, wrong: 0 }, after = { right: 0, wrong: 0 };
  const pos = EVAL.filter((e) => e[1]).length, neg = EVAL.length - pos;
  const he = { pos: 0, right: 0 };
  for (const [text, gold] of EVAL) {
    const w = watch('owe:reply', 'mine');
    const b = FU.deliversFor(w, text, null);                       // what the hosts do today for a 'mine' loop
    const a = M.closeFor(ON, w, own(text), NOW).close === true;
    if (gold) { if (b) before.right++; if (a) after.right++; if (/[֐-׿]/.test(text)) { he.pos++; if (a) he.right++; } } else { if (b) before.wrong++; if (a) after.wrong++; }
    if (gold !== a) console.log('  differs from gold:', JSON.stringify(text), 'after =', a);
  }
  console.log(`  real answers closed: before ${before.right}/${pos}, after ${after.right}/${pos} (Hebrew ${he.right}/${he.pos})`);
  console.log(`  wrong closes (ack, holding, auto): before ${before.wrong}/${neg}, after ${after.wrong}/${neg}`);
  check('closeFor closes more real answers than the generic rule', after.right > before.right, { before, after });
  check('...and wrongly closes nothing (an ack, a holding reply or an auto-reply never closes)', after.wrong === 0, after);

  console.log('\n--- each outcome ---\n');
  const w = () => watch('owe:reply', 'mine');
  const yes = M.closeFor(ON, w(), own('Thursday at 10 works for me.'), NOW);
  check('your answer closes it, as replied', yes.close && yes.patch.status === 'resolved' && yes.patch.closedAs === 'replied');
  const no = M.closeFor(ON, w(), own("Sorry, I can't make it this week."), NOW);
  check('your "no" closes it, as declined (a deliberate release)', no.close && no.patch.closedAs === 'declined');
  const later = M.closeFor(ON, w(), own('I will send it on Thursday.'), NOW);
  check('"I will send it Thursday" keeps it open and moves the day to Thursday', !later.close && later.patch.stage === 'promised' && later.patch.chaseIso === '2026-10-08', later);
  check('"Got it, thanks" keeps it open', M.closeFor(ON, w(), own('Got it, thanks!'), NOW).none === true);
  check('an auto-reply keeps it open', M.closeFor(ON, w(), own('I am out of the office until Monday'), NOW).none === true);
  check('a message from them does not close what you owe', M.closeFor(ON, w(), them('Any update?'), NOW).none === true);
  const kept = M.closeFor(ON, watch('owe:promise', 'mine'), own('Attached is the signed lease.'), NOW);
  check('your own promise: delivering it keeps it (kept)', kept.close && kept.patch.closedAs === 'kept');
  check('your own promise: "Sure." does not', M.closeFor(ON, watch('owe:promise', 'mine'), own('Sure.'), NOW).none === true);
  const moved = M.closeFor(ON, watch('owe:promise', 'mine'), own('I will send it on Thursday.'), NOW);
  check('your own promise: a new day moves it', !moved.close && moved.patch.chaseIso === '2026-10-08', moved);
  const theirs = M.closeFor(ON, watch('promised', 'theirs'), them('Attached is the signed lease.'), NOW);
  check('their promise: their delivery closes it (the follow loop\'s own reply rules)', theirs.close && theirs.patch.status === 'resolved');
  check('their promise: your own message does not close it', M.closeFor(ON, watch('promised', 'theirs'), own('Any news?'), NOW).none === true);

  console.log('\n--- what it never touches ---\n');
  check('switch off: nothing', M.closeFor({}, w(), own('Thursday works for me.'), NOW).none === true);
  check('a loop the engine opened (not the model): nothing', M.closeFor(ON, watch('owe:reply', 'mine', { tier: 'rule' }), own('Thursday works for me.'), NOW).none === true);
  check('a loop that is already closed: nothing', M.closeFor(ON, watch('owe:reply', 'mine', { status: 'resolved' }), own('Thursday works for me.'), NOW).none === true);

  console.log('\n--- a loop the plan opened closes the way its plan says ---\n');
  {
    const p = { step: 'draft', due: '2026-10-08', askSpan: 'Could you confirm Thursday at 10?', evidence: 'Thursday at 10', confidence: 0.9 };
    const r = M.plan(ON, p, { text: 'Hi Sali, could you confirm Thursday at 10? Dana', today: '2026-10-07', lang: 'en', surface: 'gmail' });
    const wt = M.toWatch(r.plan, p, { threadId: 't-9', subject: 'Thursday', counterpart: { email: 'dana@example.com' } }, NOW);
    const c = M.closeFor(ON, wt, own('Thursday at 10 is fine, see you.'), NOW);
    check('plan says reply-sent; the watch it opened closes on the reply', r.plan.doneWhen.kind === 'reply-sent' && wt.subtype === 'owe:reply' && c.close === true, { done: r.plan.doneWhen, c });
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
