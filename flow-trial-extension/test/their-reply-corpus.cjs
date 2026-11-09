// Their reply finishes your wait, proven (close map E9), behind THEIR_REPLY_PROOF (off).
// The reply is read back by id: from the person you wait on, in that thread, after
// you asked, and still meaning done. "I paid" is a claim, not a close. Undo reopens
// only while it is still Glance's close. The mailbox is mocked. Nothing is sent.
// Run: node test/their-reply-corpus.cjs
'use strict';
const { FlowTheirReply: T } = require('../core/their-reply.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { THEIR_REPLY_PROOF: true };
const DANA = 'dana@acme.co.il';
const T0 = Date.parse('2026-11-09T09:00:00Z');
const MIN = 60000;
const loop = (extra) => Object.assign({ id: 'W1', status: 'waiting', direction: 'theirs', kind: 'reply', counterpart: { name: 'Dana', email: DANA }, threadId: 'th1', createdAt: T0, lang: 'en' }, extra || {});
const msg = (id, text, extra) => Object.assign({ id, threadId: 'th1', from: 'Dana Cohen <' + DANA + '>', dateMs: T0 + 30 * MIN, text }, extra || {});
const thread = (...messages) => ({ messages });
const p = (lp, th) => T.plan({ flags: ON, loop: lp, thread: th, now: T0 + 60 * MIN });

// ---- 1. what their words mean ----------------------------------------------------
console.log('\n--- their words: close, hold, or claim ---\n');
const closes = [
  ['Approved, go ahead.', 'replied'],
  ['Attached is the signed contract.', 'replied'],
  ['מצורף החוזה החתום', 'replied'],
  ['אישרתי את ההצעה.', 'replied'],
  ['סגור, מאושר מצדנו.', 'replied'],
  ['We are not going ahead.', 'declined'],
  ['לא מעוניינים, תודה.', 'declined']
];
for (const [text, want] of closes) {
  const r = p(loop(), thread(msg('m1', text)));
  check('closes as ' + want + ': ' + text, r.action === 'close' && r.closedAs === want, r);
}
const holds = [
  ['Perfect', 'not clearly an answer'],
  ['Thanks for letting me know', 'ack'],
  ['I will send it Friday', 'promise'],
  ['Which invoice?', 'question back'],
  ['I never got the attachment', 'blocked'],
  ['לא קיבלתי את הקובץ', 'blocked, Hebrew'],
  ['Out of office until Monday', 'auto-reply'],
  ['אחזור אליך מחר', 'promise, Hebrew']
];
for (const [text, why] of holds) {
  const r = p(loop(), thread(msg('m1', text)));
  check('stays open (' + why + '): ' + text, r.action === 'hold' || r.action === 'silence', r);
}
check('payment loop, "שולם": a claim, not a close', (() => { const r = p(loop({ kind: 'payment' }), thread(msg('m1', 'שולם'))); return r.action === 'hold' && r.reason === 'claimed'; })());
check('payment loop, "Paid via Bit just now": a claim', p(loop({ kind: 'payment' }), thread(msg('m1', 'Paid via Bit just now'))).reason === 'claimed');
check('file loop: closes as delivered', p(loop({ file: 'contract.pdf' }), thread(msg('m1', 'Attached is the signed contract.'))).closedAs === 'delivered');
check('quoted "approved" under a question does not close', p(loop(), thread(msg('m1', 'Which version?\n\nOn Mon, Nov 9 Sali wrote:\n> Approved?'))).action !== 'close');

// ---- 2. who, where, when -----------------------------------------------------------
console.log('\n--- only their own reply, in that thread, after you asked ---\n');
check('switch off: off', T.plan({ loop: loop(), thread: thread(msg('m1', 'Approved.')) }).action === 'off');
check('switch "true": off', T.plan({ flags: { THEIR_REPLY_PROOF: 'true' }, loop: loop(), thread: thread(msg('m1', 'Approved.')) }).action === 'off');
check('someone else: no reply', p(loop(), thread(msg('m1', 'Approved.', { from: 'eve@other.co' }))).reason === 'no-reply');
check('the person themselves: no reply', p(loop(), thread(msg('m1', 'Approved.', { from: 'sali@realtrade.co.il' }))).reason === 'no-reply');
check('another thread: no reply', p(loop(), thread(msg('m1', 'Approved.', { threadId: 'th2' }))).reason === 'no-reply');
check('before the ask: no reply', p(loop(), thread(msg('m1', 'Approved.', { dateMs: T0 - MIN }))).reason === 'no-reply');
check('their draft: no reply', p(loop(), thread(msg('m1', 'Approved.', { labelIds: ['DRAFT'] }))).reason === 'no-reply');
check('my loop (mine, not theirs): silence', p(loop({ direction: 'mine' }), thread(msg('m1', 'Approved.'))).reason === 'no-waiting-loop');
check('already resolved: silence', p(loop({ status: 'resolved' }), thread(msg('m1', 'Approved.'))).reason === 'no-waiting-loop');
check('newest reply decides: approved then a question stays open', p(loop(), thread(msg('m1', 'Approved.'), msg('m2', 'Wait, which invoice?', { dateMs: T0 + 50 * MIN }))).action === 'hold');
check('newest reply decides: question then approved closes on m2', (() => { const r = p(loop(), thread(msg('m1', 'Which one?'), msg('m2', 'Approved, go ahead.', { dateMs: T0 + 50 * MIN }))); return r.action === 'close' && r.messageId === 'm2'; })());
const graph = { id: 'AAMk9', conversationId: 'th1', from: { emailAddress: { address: DANA.toUpperCase() } }, receivedDateTime: new Date(T0 + 20 * MIN).toISOString(), bodyPreview: 'שלחתי לך את הקובץ.' };
check('Outlook Graph reply: close', p(loop({ lang: 'he' }), thread(graph)).action === 'close');
check('Hebrew line', p(loop({ lang: 'he' }), thread(graph)).line === 'ענו לך. הלולאה נסגרה.');

// ---- 3. close: read back by id ------------------------------------------------------
console.log('\n--- close reads their reply back by id ---\n');
const NOW = '2026-11-09T10:00:00.000Z';
const reader = (m, status) => async (id) => (m ? { ok: true, status: 200, message: Object.assign({ id }, m) } : { ok: false, status: status || 404 });

(async () => {
  const lp = loop();
  const planned = p(lp, thread(msg('m1', 'Approved, go ahead.')));
  const good = await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(msg('m1', 'Approved, go ahead.')) });
  check('close ok and Handled', good.ok === true && Proof.allowsHandled(good), good);
  check('proof gmail/message, their message id', good.proof.system === 'gmail/message' && good.proof.externalId === 'm1' && good.proof.fetchedBack === true);
  check('patch: resolved by reply, replied', good.patch.status === 'resolved' && good.patch.resolvedBy === 'reply' && good.patch.closedAs === 'replied');
  const ol = await T.close({ flags: ON, plan: planned, loop: lp, now: NOW, surface: 'outlook' }, { readMessage: reader(msg('m1', 'Approved, go ahead.')) });
  check('Outlook: microsoft/mail', ol.ok && ol.proof.system === 'microsoft/mail');

  let calls = 0;
  const off = await T.close({ plan: planned, loop: lp, now: NOW }, { readMessage: async () => { calls++; return null; } });
  check('switch off: nothing read, no close', off.reason === 'switch-off' && calls === 0);
  const gone = await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(null, 404) });
  check('deleted: verify_failed, not Handled', gone.reason === 'verify_failed' && !Proof.allowsHandled(gone));
  check('401: not-connected', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(null, 401) })).reason === 'not-connected');
  check('network error: not-connected', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: async () => { throw new Error('x'); } })).reason === 'not-connected');
  check('read back from someone else: no close', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(msg('m1', 'Approved.', { from: 'eve@other.co' })) })).why === 'not-from-them');
  check('read back in another thread: no close', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(msg('m1', 'Approved.', { threadId: 'th9' })) })).why === 'other-thread');
  check('read back edited to a question: no close', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: reader(msg('m1', 'Which invoice?')) })).why === 'meaning-differs');
  check('read back another id: no close', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, { readMessage: async () => ({ ok: true, status: 200, message: msg('m7', 'Approved.') }) })).why === 'other-message');
  check('a hold plan never closes', (await T.close({ flags: ON, plan: { action: 'hold', loopId: 'W1' }, loop: lp, now: NOW }, { readMessage: reader(msg('m1', 'Approved.')) })).reason === 'invalid');
  check('no host: no close', (await T.close({ flags: ON, plan: planned, loop: lp, now: NOW }, {})).reason === 'no-host');

  // ---- 4. Undo ---------------------------------------------------------------------
  console.log('\n--- Undo reopens only while it is still our close ---\n');
  const closed = Object.assign({}, lp, good.patch);
  const u = T.undo(good.ref, closed);
  check('Undo reopens to waiting', u.ok && u.patch.status === 'waiting' && u.patch.replyProof === null, u);
  check('person changed it since: refuses', T.undo(good.ref, Object.assign({}, closed, { closedAs: 'released', resolvedBy: 'person' })).reason === 'changed-since');
  check('loop gone: refuses', T.undo(good.ref, null).ok === false);
  check('not ours: refuses', T.undo({ loopId: 'W1' }, closed).ok === false);

  console.log('\n' + (failures ? failures + ' FAILED' : 'All their-reply checks passed.'));
  process.exit(failures ? 1 : 0);
})();
