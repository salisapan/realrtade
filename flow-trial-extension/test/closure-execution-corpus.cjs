// Weight of intention, time as part of the intention, and the prepared reply
// (docs/closure-plan.md). Precision first: money, a deadline and an explicit
// chase must never be silenced by the weight rule.
// Run: node test/closure-execution-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-05T12:00:00').getTime();
const out = (t) => F.classifyOutgoing(t, { now: NOW, extract: FlowExtract, pipeline: P });

console.log('\n--- knowing when not to start: soft asks with nothing behind them ---');
[
  'Thanks for the chat earlier. Let me know what you think when you get a moment.',
  'Here are the notes from today. Any thoughts on the overall direction?',
  'I put together a first draft of the plan. Keep me posted on how it lands with the team.',
  'Great meeting you at the conference. Feel free to reach out whenever you want to catch up.',
  'Just wanted to share the article with you, let me know what you think of it.',
  'תודה על השיחה היום. תעדכן אותי מה אתה חושב כשיהיה לך זמן.'
].forEach((t) => check('no loop for a soft ask: ' + t.slice(0, 60), out(t) === null, out(t)));

console.log('\n--- but weight is never withheld from money, a deadline, or a concrete ask ---');
[
  ['Could you let me know by Friday whether the board approved the proposal?', 'reply'],
  ['Please confirm the final figure by Monday so I can book the vendor.', 'reply'],
  ['Can you let me know by 10/09 whether the board accepted the proposal?', 'reply'],
  ['Could you send me the signed contract when you can?', 'reply'],
  ['Please let me know whether you will sign the agreement.', 'reply'],
  ['Attached is invoice #3049 for $4,200, due next Monday. Let me know when it is sent.', 'payment'],
  ['Could you approve the budget? I am waiting on this to move forward.', 'reply'],
  ['תוכל לשלוח לי את החוזה החתום עד יום חמישי?', 'reply']
].forEach(([t, kind]) => { const r = out(t); check('still a loop (' + kind + '): ' + t.slice(0, 60), r && r.kind === kind, r); });

console.log('\n--- the weight explains itself ---');
{
  const r = out('Please confirm the final figure by Monday so I can book the vendor.');
  check('a deadline and a concrete action are named as the reason', r.weight && r.weight.level === 'real' && r.weight.signals.includes('deadline') && r.weight.signals.includes('concrete-action'), r.weight);
  const w = F.intentionWeight({ line: 'Let me know what you think.', money: false, deadline: false, payment: false, req: null });
  check('a bare soft ask is light', w.level === 'light' && w.signals.includes('soft'), w);
  check('a soft ask with an amount is real', F.intentionWeight({ line: 'Let me know what you think of the 4,000 quote.', money: true, deadline: false, payment: false, req: null }).level === 'real');
}
check('a two-word chase is never weighed away', out('Any update?') !== null && out('Signed yet?') !== null);

console.log('\n--- time is part of the intention ---');
{
  const w = { status: 'waiting', direction: 'theirs', kind: 'reply', lang: 'en', deadlineIso: '2026-10-01', what: 'Please confirm the figure by Thursday.', counterpart: { name: 'Dana Cole', email: 'd@x.com' }, createdAt: new Date('2026-09-28T12:00:00').getTime(), nudges: 1 };
  check('a deadline in the past is its own state', F.deadlinePassed(w, NOW) === true);
  check('a deadline today or later is not', F.deadlinePassed(Object.assign({}, w, { deadlineIso: '2026-10-05' }), NOW) === false && F.deadlinePassed(Object.assign({}, w, { deadlineIso: '2026-10-09' }), NOW) === false);
  check('no deadline, no such state', F.deadlinePassed(Object.assign({}, w, { deadlineIso: null }), NOW) === false);
  check('your own promise is not "their" deadline', F.deadlinePassed(Object.assign({}, w, { direction: 'mine' }), NOW) === false);
  check('a closed loop has no deadline state', F.deadlinePassed(Object.assign({}, w, { status: 'resolved' }), NOW) === false);
  const n2 = F.nudgeText(w, 2, NOW);
  check('the firmer nudge names the deadline that was set', /The deadline was .*Oct 1/.test(n2), n2);
  check('the deadline line sits after the greeting, before the sign-off', n2.split('\n\n')[0] === 'Hi Dana,' && /Thanks,$/.test(n2), n2);
  check('the friendly first nudge stays friendly (no deadline line)', !/deadline/i.test(F.nudgeText(w, 1, NOW)));
  check('Hebrew too', /המועד שנקבע היה/.test(F.nudgeText(Object.assign({}, w, { lang: 'he' }), 3, NOW)));
  check('no deadline passed: the nudge is unchanged', F.nudgeText(Object.assign({}, w, { deadlineIso: '2026-10-09' }), 2, NOW) === F.nudgeText(Object.assign({}, w, { deadlineIso: null }), 2, NOW));
}

console.log('\n--- the prepared reply: a starting point, never sent ---');
{
  const reply = (t, kind) => F.classifyReply(t, { kind: kind || 'reply', status: 'waiting', direction: 'theirs' }, { now: NOW, extract: FlowExtract });
  const base = { kind: 'reply', status: 'waiting', direction: 'theirs', lang: 'en', createdAt: NOW, subject: 'Vendor booking', counterpart: { name: 'Dana Cole', email: 'd@x.com' } };
  const q = reply('Which vendor do you mean? We have two.');
  const a = F.applyReply(base, q, NOW);
  check('the sentence that put the ball in your court is kept', a.patch.yoursLine === 'Which vendor do you mean?', a.patch);
  const w = Object.assign({}, base, a.patch);
  const d = F.replyDraft(w);
  check('the draft greets by name and quotes the question', /^Hi Dana,/.test(d) && d.includes('"Which vendor do you mean?"'), d);
  check('the draft leaves a visible place for your answer', /\[Your answer here\]/.test(d));
  const blocked = Object.assign({}, base, F.applyReply(base, reply('I never got the attachment, can you resend?'), NOW).patch);
  const db = F.replyDraft(blocked);
  check('for "could not open it" the draft is a resend note with a place to attach', /resending/.test(db) && /Attach the file here/.test(db) && blocked.yoursReason === 'blocked', db);
  const he = Object.assign({}, base, { lang: 'he' }, F.applyReply(Object.assign({}, base, { lang: 'he' }), reply('איזו חשבונית?'), NOW).patch);
  check('Hebrew draft quotes the Hebrew question', /^היי Dana,/.test(F.replyDraft(he)) && F.replyDraft(he).includes('"איזו חשבונית?"'), F.replyDraft(he));
  check('handing back clears the line and the reason', (() => { const h = F.handBackPatch(w, NOW); return h.yoursLine === null && h.yoursReason === null; })());
  check('a draft is never a send: the core has no send path', !/messages\/send|sendMessage\(|\.send\(/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'follow-up.js'), 'utf8')));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
