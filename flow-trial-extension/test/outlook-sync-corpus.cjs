// Outlook sync planning: the same careful rules as Gmail, decided as plain data.
// Run: node test/outlook-sync-corpus.cjs
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
const { FlowIntentModel } = require('../core/intent-model.js');
FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 3, 12).getTime();
const ME = 'me@contoso.com';
const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline };
let n = 0;
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const mine = (conv, text, ago, subject) => ({ id: 'm' + (++n), conversationId: conv, subject: subject || 'Lease', isDraft: false, from: { emailAddress: { name: 'Me', address: ME } }, toRecipients: [{ emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }], sentDateTime: iso(ago), webLink: 'https://outlook.office.com/mail/id/' + n, body: { contentType: 'text', content: text } });
const theirs = (conv, text, ago, subject) => ({ id: 'm' + (++n), conversationId: conv, subject: subject || 'Re: Lease', isDraft: false, from: { emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }, toRecipients: [{ emailAddress: { name: 'Me', address: ME } }], receivedDateTime: iso(ago), webLink: 'https://outlook.office.com/mail/id/' + n, body: { contentType: 'text', content: text } });
const loop = (conv, over) => Object.assign({ id: 'ol:' + conv, threadId: 'ol:' + conv, channel: 'outlook', messageId: 'm0', subject: 'Lease', counterpart: { name: 'Dana Cole', email: 'dana@acme.com', phone: null }, kind: 'reply', what: 'Please send the signed lease by Friday', amount: null, deadlineIso: null, chaseIso: '2026-10-05', lang: 'en', createdAt: NOW - 4 * DAY, status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0 }, over || {});
const plan = (messages, watches, extra) => S.plan(Object.assign({ messages, me: ME, watches: watches || [], graph: I.empty(), state: {}, now: NOW, deps }, extra || {}));
const ASK = 'Could you please send me the signed lease by Friday? I need it to release the deposit.';

console.log('\n--- your message is the newest ---\n');
{
  const r = plan([mine('c1', ASK, 1)]);
  check('an ask of yours with no loop becomes an offer, never a loop', r.offers.length === 1 && r.patches.length === 0, r);
  const o = r.offers[0];
  check('the offer knows the conversation, the person and the link back to the message', o.base.threadId === 'ol:c1' && o.base.channel === 'outlook' && o.base.counterpart.email === 'dana@acme.com' && /outlook\.office\.com/.test(o.base.threadUrl) && o.ask.direction === 'theirs', o);
  check('a courtesy closer is not an offer', plan([mine('c2', 'Thanks so much for the call today. Let me know if you have any questions.', 1)]).offers.length === 0);
  const m = mine('c1', ASK, 1);
  check('an offer already shown is not made again', plan([m], [], { state: { offered: { ['c1|' + m.id]: NOW } } }).offers.length === 0);
  check('an offer already declined is not made again', plan([m], [], { state: { declined: { ['c1|' + m.id]: NOW } } }).offers.length === 0);
  check('a conversation that already has a closed loop is not offered again', plan([mine('c1', ASK, 1)], [loop('c1', { status: 'resolved' })]).offers.length === 0);
  const many = []; for (let i = 0; i < 9; i++) many.push(mine('k' + i, ASK, 1));
  check('at most five offers per check', plan(many).offers.length === S.MAX_OFFERS);
  const promise = plan([mine('c3', "I'll send you the revised numbers by Friday.", 1)]);
  check('a promise of yours becomes an offer on your side', promise.offers.length === 1 && promise.offers[0].ask.direction === 'mine', promise.offers);
  const chase = plan([mine('c1', ASK, 3), mine('c1', 'Hi Dana, just following up on this, any update?', 0)], [loop('c1', { messageId: 'old' })]);
  check('your chase on a waiting loop moves the day and is noted', chase.patches.length === 1 && chase.patches[0].id === 'ol:c1' && chase.patches[0].patch.nudges === 1, chase.patches);
}

console.log('\n--- their message is the newest ---\n');
{
  const w = loop('c1');
  const askMsg = mine('c1', ASK, 3), ansMsg = theirs('c1', 'Confirmed, the figure is 4,200. Booking now.', 0);
  let r = plan([askMsg, ansMsg], [w]);
  check('a real answer closes the loop', r.patches.length === 1 && r.patches[0].patch.status === 'resolved' && r.patches[0].patch.closedAs === 'replied' && r.stats.closed === 1, r.patches);
  check('and it will not be judged twice (the loop remembers the message)', Boolean(r.patches[0].patch.lastReplyMessageId));
  const again = plan([askMsg, ansMsg], [Object.assign({}, w, { lastReplyMessageId: r.patches[0].patch.lastReplyMessageId })]);
  check('judged again later, it does nothing', again.patches.length === 0);
  const thanks = plan([mine('c1', ASK, 3), theirs('c1', 'Got it, thanks!', 0)], [w]);
  check('"got it, thanks" leaves it open and says nothing (at most it notes that they wrote)', !thanks.patches.some((p) => p.patch.status) && thanks.lines.length === 0 && thanks.asks.length === 0, thanks);
  check('an out-of-office is ignored', plan([mine('c1', ASK, 3), theirs('c1', 'I am out of the office until Oct 12 with limited access to email.', 0)], [w]).patches.length === 0);
  const promised = plan([mine('c1', ASK, 3), theirs('c1', "Thanks, I'll get back to you by Friday.", 0)], [w]);
  check('a promised day keeps it open and moves the day', promised.patches.length === 1 && promised.patches[0].patch.stage === 'promised' && promised.patches[0].patch.status === undefined && promised.stats.moved === 1, promised.patches);
  const pay = loop('c1', { kind: 'payment', what: 'Invoice 3049 for $4,200', amount: { value: 4200, currency: 'USD', raw: '$4,200' } });
  const paid = plan([mine('c1', 'Invoice attached, please pay by Monday.', 3), theirs('c1', 'Paid today, the transfer is on its way.', 0)], [pay]);
  check('"paid" on a payment loop closes it as paid', paid.patches[0] && paid.patches[0].patch.closedAs === 'paid', paid.patches);
  const unsure = plan([mine('c1', 'Invoice attached, please pay by Monday.', 3), theirs('c1', 'I was told the invoice is with accounting, will check.', 0)], [pay]);
  check('a payment reply that never says "paid" asks, and the loop stays open', unsure.asks.length === 1 && /Is it paid/.test(unsure.asks[0].title) && unsure.asks[0].yes.closedAs === 'paid' && !(unsure.patches[0] && unsure.patches[0].patch.status), unsure);
  check('your own promise is not settled by their message', plan([mine('c1', "I'll send the numbers.", 3), theirs('c1', 'Great, thanks a lot, looking forward to it.', 0)], [loop('c1', { direction: 'mine' })]).patches.length === 0);
  check('a stopped loop is left alone', plan([mine('c1', ASK, 3), theirs('c1', 'Confirmed, sending today.', 0)], [loop('c1', { status: 'stopped' })]).patches.length === 0);
}

console.log('\n--- an answer that arrives somewhere else ---\n');
{
  const gmailLoop = { id: 'g1', threadId: 'g1', channel: 'gmail', messageId: 'gm1', subject: 'Lease INV-204', counterpart: { name: 'Dana Cole', email: 'dana@acme.com', phone: null }, kind: 'reply', what: 'Please send the signed lease INV-204 by Friday', amount: null, deadlineIso: null, chaseIso: '2026-10-05', lang: 'en', createdAt: NOW - 4 * DAY, status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0 };
  const r = plan([theirs('zz', 'Sent you the signed lease INV-204 an hour ago, confirmed.', 0, 'Lease INV-204')], [gmailLoop]);
  check('a reply in a thread of its own, from the same address and naming the same reference, settles the Gmail loop (the story)', r.patches.length === 1 && r.patches[0].id === 'g1' && r.patches[0].patch.status === 'resolved' && r.patches[0].patch.viaChannel === 'outlook', r.patches);
  const nolink = plan([theirs('zz', "Sorry for the delay, I'll get back to you by Friday afternoon, promise.", 0, 'Hello')], [gmailLoop]);
  check('a reply with no link to the loop only asks', nolink.asks.length === 1 && /wrote in Outlook/.test(nolink.asks[0].title) && !(nolink.patches.find((p) => p.patch.status)), nolink);
  check('and the loop is marked so it is not asked about again for three days', nolink.patches.some((p) => p.id === 'g1' && p.patch.crossAskedAt === NOW));
  check('a stranger\'s message touches nothing', plan([Object.assign(theirs('zz', 'Sent you the signed lease INV-204, confirmed.', 0, 'Lease INV-204'), { from: { emailAddress: { name: 'Eve', address: 'eve@else.com' } } })], [gmailLoop]).patches.length === 0);
}

console.log('\n--- people and drafts ---\n');
{
  const r = plan([mine('c1', ASK, 2), theirs('c1', 'Confirmed.', 1), mine('c9', ASK, 1)]);
  check('the people met are reported once each, for the identity graph', r.parties.length === 1 && r.parties[0].email === 'dana@acme.com' && r.parties[0].channel === 'outlook', r.parties);
  check('a draft is never read', plan([Object.assign(mine('c1', ASK, 1), { isDraft: true })]).offers.length === 0);
  check('an empty mailbox plans nothing and never throws', JSON.stringify(plan([]).patches) === '[]' && plan(null).offers.length === 0);
  check('only the text you wrote this time counts, not the quoted history', plan([mine('c5', 'Thanks!\n\nOn Mon, Oct 1, 2026 at 9:00 AM Dana Cole <dana@acme.com> wrote:\n> Could you please send me the signed lease by Friday?', 1)]).offers.length === 0);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
