// Follow loop with items (core/follow-up.js + core/client-requests.js, switch CLIENT_REQUESTS.items, off).
// One request, several things: the loop carries each one and closes only when all of them really arrived.
// What is pinned here: with the switch off nothing changes; with it on, a partial answer never closes the loop,
// the reminder asks only for what is missing, a file that was not read back or a "sent it on WhatsApp" never counts,
// a decline still closes, and the close carries proof. Run: node test/follow-items-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-11T10:00:00').getTime(); // a Sunday
const ctx = (items) => ({ now: NOW, extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, items });
const off = (t) => F.classifyOutgoing(t, ctx(undefined));
const on = (t) => F.classifyOutgoing(t, ctx(true));

const TEXTS = [
  'Hi Dana, could you send the signed lease by Friday? We need it to release the deposit.',
  'Please confirm the final figure by Monday so I can book the vendor.',
  'שלום דני,\nנא להעביר:\n- דפי בנק לחודשים 7-8/2026\n- חשבוניות הוצאה לאוגוסט\n- טופס 106 לשנת 2025',
  'Hi Tom, please send me the signed agreement and a copy of your ID by Thursday.',
  'Thanks for the call today. Let me know what you think.',
  'Great meeting you yesterday, have a lovely weekend!'
];

console.log('--- switch off: the follow loop is unchanged ---');
TEXTS.forEach((t) => {
  const a = off(t), b = F.classifyOutgoing(t, ctx(false));
  check('off and items:false give the same answer: ' + t.slice(0, 40), JSON.stringify(a) === JSON.stringify(b));
  check('off: no items on the ask: ' + t.slice(0, 40), !a || a.items === undefined);
});
const offWatch = F.buildWatch({ threadId: 't0', ask: off(TEXTS[0]), counterpart: { email: 'dana@x.com' }, now: NOW });
check('off: the watch has no items field', !('items' in offWatch));

console.log('--- switch on: what is being asked, item by item ---');
const he = on(TEXTS[2]);
check('a Hebrew list opens one loop with three items', he && he.items && he.items.length === 3, he && he.items && he.items.map((i) => i.key));
const en = on(TEXTS[3]);
check('an English ask for two documents opens one loop with two items', en && en.items && en.items.length === 2, en && en.items && en.items.map((i) => i.key));
check('the deadline of the ask is kept', en && en.deadlineIso === '2026-10-15', en && en.deadlineIso);
check('a courtesy line still opens nothing', on(TEXTS[4]) === null && on(TEXTS[5]) === null);
const plain = on(TEXTS[1]);
check('an ask with no named documents keeps its old shape and gets no items', plain && plain.items === undefined);

const w0 = F.buildWatch({ threadId: 't1', messageId: 'm1', ask: en, counterpart: { email: 'Tom@Client.com', name: 'Tom Levi' }, now: NOW });
check('the watch carries its items', F.hasItems(w0) && w0.items.length === 2);
check('counts: 0 of 2 done', JSON.stringify(F.itemCounts(w0)) === JSON.stringify({ total: 2, done: 0, missing: w0.items.map((i) => i.key) }));
const keyOf = (w, re) => w.items.find((i) => re.test(i.key)).key;
const agreementKey = keyOf(w0, /agreement/), idKey = keyOf(w0, /^id/);

console.log('--- a partial answer never closes ---');
const from = { email: 'tom@client.com' };
const t1 = 'Hi, here is the signed agreement. Thanks!';
const r1 = F.classifyReply(t1, w0, { now: NOW });
const a1 = F.applyReplyItems(w0, r1, { messageId: 'm2', from, text: t1, attachments: [{ id: 'a1', name: 'signed_agreement.pdf', size: 90000 }], fetchedBack: true }, NOW);
check('the reply alone would close the loop (that is the old risk)', F.applyReply(w0, r1, NOW).close === true, r1);
check('with items it stays open: one of two arrived', !a1.close && a1.partial && a1.patch.stage === 'partial', a1);
const w1 = Object.assign({}, w0, a1.patch);
check('the agreement is received with read-back proof', w1.items.find((i) => i.key === agreementKey).status === 'received' && w1.items.find((i) => i.key === agreementKey).proof[0].fetchedBack === true);
check('the ID copy is still missing', JSON.stringify(F.itemCounts(w1).missing) === JSON.stringify([idKey]));
const n1 = F.nudgeText(w1, 1, NOW);
check('the reminder thanks for what came and asks only for the ID copy', /received/i.test(n1) && /ID/i.test(n1) && !/still missing:\n[^]*agreement/i.test(n1), n1);
check('with the switch off the reminder is the old text', F.nudgeText(offWatch, 1, NOW).indexOf('quick follow-up') >= 0);

console.log('--- words and unread files do not count ---');
const t2 = 'I sent you my ID on WhatsApp';
const a2 = F.applyReplyItems(w1, F.classifyReply(t2, w1, { now: NOW }), { messageId: 'm3', from, text: t2, attachments: [], fetchedBack: true }, NOW);
check('"sent it on WhatsApp" with no file does not close', !a2.close);
const a3 = F.applyReplyItems(w1, F.classifyReply('Attached', w1, { now: NOW }), { messageId: 'm4', from, text: 'Attached', attachments: [{ id: 'a2', name: 'id_copy.pdf', size: 90000 }], fetchedBack: false }, NOW);
check('a file the host did not read back does not close', !a3.close);
const a4 = F.applyReplyItems(w1, F.classifyReply('Attached', w1, { now: NOW }), { messageId: 'm5', from: { email: 'someone@else.com' }, text: 'Attached', attachments: [{ id: 'a3', name: 'id_copy.pdf', size: 90000 }], fetchedBack: true }, NOW);
check('a file from someone else does not close', !a4.close);

console.log('--- the whole set closes, with proof ---');
const a5 = F.applyReplyItems(w1, F.classifyReply('Attached', w1, { now: NOW }), { messageId: 'm6', from, text: 'Attached', attachments: [{ id: 'a4', name: 'id_copy.pdf', size: 90000 }], fetchedBack: true }, NOW);
check('the last item arrives and the loop closes as delivered', a5.close && a5.patch.status === 'resolved' && a5.patch.closedAs === 'delivered', a5);
check('the close carries one read-back proof per item', a5.patch.proof.length === 2 && a5.patch.proof.every((p) => p.fetchedBack === true && p.system && p.externalId && p.verifiedAt), a5.patch.proof);

console.log('--- the person settles items, and a decline still closes ---');
const d1 = F.decideItem(w1, idKey, 'release', NOW);
check('releasing the last missing item closes the loop', d1.close && d1.patch.closedAs === 'delivered');
const d2 = F.decideItem(F.decideItem(w0, idKey, 'release', NOW).patch.items ? Object.assign({}, w0, F.decideItem(w0, idKey, 'release', NOW).patch) : w0, agreementKey, 'release', NOW);
check('releasing everything closes it as released, not delivered', d2.close && d2.patch.closedAs === 'released');
const t3 = 'We decided not to go ahead, sorry.';
const r3 = F.classifyReply(t3, w0, { now: NOW });
const a6 = F.applyReplyItems(w0, r3, { messageId: 'm7', from, text: t3, attachments: [], fetchedBack: true }, NOW);
check('a decline closes the loop as declined', r3.outcome === 'declined' && a6.close && a6.patch.closedAs === 'declined', r3);
const t4 = "Sorry, I won't be able to send these.";
const a7 = F.applyReplyItems(w0, F.classifyReply(t4, w0, { now: NOW }), { messageId: 'm9', from, text: t4, attachments: [], fetchedBack: true }, NOW);
check('an unclear "won\'t be able to" with nothing attached holds the loop open (the person decides)', !a7.close, a7);
check('"send me your user ID" and "the ID scan feature" are not document asks', on('Can you send me your user ID for the portal by Monday?').items === undefined && (on('The ID scan feature is broken, please fix it by Monday') || {}).items === undefined);
const auto = F.applyReplyItems(w0, { outcome: 'auto' }, { messageId: 'm8', from, text: 'Out of office', attachments: [], fetchedBack: true }, NOW);
check('an out-of-office changes nothing', auto.none === true);
check('a watch without items falls back to the old applyReply', JSON.stringify(F.applyReplyItems(offWatch, { outcome: 'closed' }, null, NOW)) === JSON.stringify(F.applyReply(offWatch, { outcome: 'closed' }, NOW)));

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
