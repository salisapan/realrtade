// The reply you owed was really sent (close map E3), behind REPLY_SENT_CLOSE (off).
// A draft is preparation; the loop closes only when a message the person sent in
// that thread, after the ask, answers. A holding reply or a bare "thanks" stays
// open. The sent message is read back by id before the loop says closed. Undo
// reopens the loop only while it is still Glance's close. The mailbox is mocked.
// Nothing is sent. Run: node test/reply-sent-corpus.cjs
'use strict';
const { FlowReplySent: R } = require('../core/reply-sent.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { REPLY_SENT_CLOSE: true };
const ME = 'sali@realtrade.co.il';
const T0 = Date.parse('2026-11-02T09:00:00Z');
const MIN = 60000;
const loop = (extra) => Object.assign({ id: 'L1', status: 'open', direction: 'mine', threadId: 'th1', askAt: T0, lang: 'en', draftRef: { draftId: 'd1', threadId: 'th1' } }, extra || {});
const gm = (id, text, extra) => Object.assign({ id, threadId: 'th1', labelIds: ['SENT'], from: 'Sali <' + ME + '>', dateMs: T0 + 30 * MIN, text }, extra || {});
const thread = (...messages) => ({ messages });

// ---- 1. what the sent words do ----------------------------------------------
console.log('\n--- an answer, a hold, an acknowledgement ---\n');
const words = [
  ['Yes, Thursday at 16:00 works for me.', 'answer'],
  ['Confirmed.', 'answer'],
  ['Attached is the signed agreement.', 'answer'],
  ['כן, יום חמישי ב-16:00 מתאים לי.', 'answer'],
  ['מאשר, נתראה ביום חמישי.', 'answer'],
  ['מצורף ההסכם החתום.', 'answer'],
  ["I'll get back to you tomorrow.", 'hold'],
  ['Let me check and confirm.', 'hold'],
  ['Will check and revert shortly.', 'hold'],
  ['Still checking with the team.', 'hold'],
  ['אחזור אליך מחר.', 'hold'],
  ['אבדוק ואעדכן.', 'hold'],
  ['רגע, בודק ומעדכן', 'hold'],
  ['Thanks!', 'ack'],
  ['OK 👍', 'ack'],
  ['תודה רבה!', 'ack'],
  ['סבבה', 'ack'],
  ['', 'empty'],
  ['Yes, that works.\n\nOn Mon, Nov 2, 2026 at 11:00 Dana wrote:\n> Can you confirm Thursday?', 'answer'],
  ['Thanks!\n\nOn Mon, Nov 2, 2026 at 11:00 Dana wrote:\n> Can you confirm Thursday? I will get back to you', 'ack'],
  ['תודה\n\nבתאריך יום ב׳, 2 בנוב׳ 2026 ב-11:00 מאת דנה נכתב:\n> אפשר לאשר את יום חמישי?', 'ack'],
  ['> quoted only line', 'empty']
];
for (const [text, want] of words) {
  const got = R.readReply(text);
  check(JSON.stringify(text.slice(0, 40)) + ' is ' + want, got === want, got);
}

// ---- 2. the plan ------------------------------------------------------------
console.log('\n--- the plan closes only on a real sent answer ---\n');
const p = (lp, th, me) => R.plan({ flags: ON, loop: lp, thread: th, me: me === undefined ? ME : me });

check('switch off: off, nothing read', R.plan({ loop: loop(), thread: thread(gm('m1', 'Yes.')), me: ME }).action === 'off');
check('switch false: off', R.plan({ flags: { REPLY_SENT_CLOSE: 'true' }, loop: loop(), thread: thread(gm('m1', 'Yes.')), me: ME }).action === 'off');
const okPlan = p(loop(), thread(gm('m1', 'Yes, Thursday works.')));
check('Gmail sent answer: close', okPlan.action === 'close' && okPlan.messageId === 'm1' && okPlan.threadId === 'th1', okPlan);
check('English line', okPlan.line === 'You replied. Loop closed.');
check('Hebrew line', p(loop({ lang: 'he' }), thread(gm('m1', 'כן, מתאים.'))).line === 'ענית. הלולאה נסגרה.');
check('still a draft: silence draft-unsent', p(loop(), thread(gm('m1', 'Yes.', { labelIds: ['DRAFT'] }))).reason === 'draft-unsent');
check('DRAFT and SENT labels together: not sent', p(loop(), thread(gm('m1', 'Yes.', { labelIds: ['SENT', 'DRAFT'] }))).reason === 'draft-unsent');
check('nothing from me: not-sent', p(loop(), thread(gm('m1', 'Yes.', { from: 'dana@acme.co.il' }))).reason === 'not-sent');
check('sent before the ask: not-sent', p(loop(), thread(gm('m1', 'Yes.', { dateMs: T0 - MIN }))).reason === 'not-sent');
check('sent in another thread: not-sent', p(loop(), thread(gm('m1', 'Yes.', { threadId: 'th2' }))).reason === 'not-sent');
check('holding reply: hold, loop open', p(loop(), thread(gm('m1', "I'll get back to you tomorrow."))).action === 'hold');
check('Hebrew holding reply: hold', p(loop(), thread(gm('m1', 'אחזור אליך מחר.'))).action === 'hold');
check('thanks only: silence ack-only', p(loop(), thread(gm('m1', 'Thanks!'))).reason === 'ack-only');
check('hold then answer: close on the answer', (() => {
  const r = p(loop(), thread(gm('m1', 'Let me check.'), gm('m2', 'Yes, Thursday works.', { dateMs: T0 + 90 * MIN })));
  return r.action === 'close' && r.messageId === 'm2';
})());
check('answer then thanks: close on the answer', (() => {
  const r = p(loop(), thread(gm('m1', 'Confirmed for Thursday.'), gm('m2', 'Thanks!', { dateMs: T0 + 90 * MIN })));
  return r.action === 'close' && r.messageId === 'm1';
})());
check('no identity: silence', p(loop(), thread(gm('m1', 'Yes.')), '').reason === 'no-identity');
check('loop already resolved: silence', p(loop({ status: 'resolved' }), thread(gm('m1', 'Yes.'))).reason === 'no-open-reply');
check('their loop (theirs, not mine): silence', p(loop({ direction: 'theirs' }), thread(gm('m1', 'Yes.'))).reason === 'no-open-reply');
check('no ask time: silence', p(loop({ askAt: undefined }), thread(gm('m1', 'Yes.'))).reason === 'no-ask-time');
check('thread id only on the draft ref still works', p(loop({ threadId: undefined }), thread(gm('m1', 'Yes.'))).action === 'close');
const graphMsg = { id: 'AAMk1', conversationId: 'th1', isDraft: false, from: { emailAddress: { address: ME.toUpperCase() } }, sentDateTime: new Date(T0 + 20 * MIN).toISOString(), bodyPreview: 'כן, מאשר את יום חמישי.' };
check('Outlook Graph sent message: close', p(loop(), thread(graphMsg)).action === 'close');
check('Outlook isDraft true: draft-unsent', p(loop(), thread(Object.assign({}, graphMsg, { isDraft: true }))).reason === 'draft-unsent');
check('several addresses of mine', p(loop(), thread(gm('m1', 'Yes.', { from: 'sali@gmail.com' })), [ME, 'sali@gmail.com']).action === 'close');

// ---- 3. close: read back by id ----------------------------------------------
console.log('\n--- close reads the sent message back by id ---\n');
const NOW = '2026-11-02T10:00:00.000Z';
const reader = (msg, status) => async (id) => (msg ? { ok: true, status: 200, message: Object.assign({ id }, msg) } : { ok: false, status: status || 404 });

(async () => {
  const lp = loop();
  const planned = p(lp, thread(gm('m1', 'Yes, Thursday works.')));
  const good = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes, Thursday works.')) });
  check('close ok', good.ok === true, good);
  check('proof fetchedBack by id', good.proof && good.proof.fetchedBack === true && good.proof.externalId === 'm1' && good.proof.system === 'gmail/message', good.proof);
  check('proof allows Handled', Proof.allowsHandled(good) === true);
  check('patch: resolved, kept, reply-sent', good.patch.status === 'resolved' && good.patch.closedAs === 'kept' && good.patch.resolvedBy === 'reply-sent');
  check('sent mail Undo unavailable', good.sentUndo === 'unavailable');

  const outlook = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW, surface: 'outlook' }, { readMessage: reader({ id: 'm1', conversationId: 'th1', isDraft: false, from: { emailAddress: { address: ME } }, bodyPreview: 'Yes, Thursday works.' }) });
  check('Outlook proof system microsoft/mail', outlook.ok && outlook.proof.system === 'microsoft/mail', outlook);

  const off = await R.close({ plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.')) });
  check('switch off: no close', off.ok === false && off.reason === 'switch-off');
  let calls = 0;
  await R.close({ plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: async () => { calls++; return null; } });
  check('switch off: nothing read', calls === 0);

  const gone = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(null, 404) });
  check('deleted message: verify_failed, not Handled', gone.ok === false && gone.reason === 'verify_failed' && !Proof.allowsHandled(gone));
  const auth = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(null, 401) });
  check('401: not-connected', auth.reason === 'not-connected');
  const thrown = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: async () => { throw new Error('net'); } });
  check('network error: not-connected, no close', thrown.ok === false && thrown.reason === 'not-connected');
  const backToDraft = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.', { labelIds: ['DRAFT'] })) });
  check('read back as a draft: no close', backToDraft.ok === false && backToDraft.why === 'not-sent');
  const otherThread = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.', { threadId: 'th9' })) });
  check('read back in another thread: no close', otherThread.why === 'other-thread');
  const otherFrom = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.', { from: 'eve@evil.co' })) });
  check('read back from someone else: no close', otherFrom.why === 'not-from-person');
  const holdNow = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', "I'll get back to you.")) });
  check('read back is a hold: no close', holdNow.why === 'not-an-answer');
  const swapped = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, { readMessage: async () => ({ ok: true, status: 200, message: gm('m7', 'Yes.') }) });
  check('read back another id: no close', swapped.why === 'other-message');
  const noHost = await R.close({ flags: ON, plan: planned, loop: lp, me: ME, now: NOW }, {});
  check('no host reader: no close', noHost.reason === 'no-host');
  const wrongLoop = await R.close({ flags: ON, plan: planned, loop: loop({ id: 'L2' }), me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.')) });
  check('plan for another loop: invalid', wrongLoop.reason === 'invalid');
  const holdPlan = await R.close({ flags: ON, plan: { action: 'hold', loopId: 'L1' }, loop: lp, me: ME, now: NOW }, { readMessage: reader(gm('m1', 'Yes.')) });
  check('a hold plan never closes', holdPlan.ok === false && holdPlan.reason === 'invalid');

  // ---- 4. Undo ----------------------------------------------------------------
  console.log('\n--- Undo reopens only while it is still our close ---\n');
  const closed = Object.assign({}, lp, good.patch);
  const u = R.undo(good.ref, closed);
  check('Undo reopens', u.ok === true && u.patch.status === 'open' && u.patch.replyProof === null && u.patch.resolvedBy === null, u);
  const edited = Object.assign({}, closed, { resolvedBy: 'person', closedAs: 'released' });
  const u2 = R.undo(good.ref, edited);
  check('person changed it since: Undo refuses', u2.ok === false && u2.reason === 'changed-since' && u2.undoUnavailable === true);
  check('loop gone: refuses', R.undo(good.ref, null).ok === false);
  check('not ours: refuses', R.undo({ loopId: 'L1' }, closed).ok === false);

  console.log('\n' + (failures ? failures + ' FAILED' : 'All reply-sent checks passed.'));
  process.exit(failures ? 1 : 0);
})();
