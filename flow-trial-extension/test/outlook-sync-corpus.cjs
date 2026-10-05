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

console.log('\n--- incoming asks (someone else asked you) ---\n');
{
  // Load FlowIntent the way the popup does (globals).
  const fs = require('fs'); const path = require('path'); const vm = require('vm');
  const sandbox = { module: undefined, console, Date, Math, JSON, String, Array, Object, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, Infinity, undefined, NaN };
  vm.createContext(sandbox);
  for (const f of ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','fact-reply.js','intent.js','actions.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
  }
  const FlowIntent = vm.runInContext('FlowIntent', sandbox);
  const NOW2 = Date.parse('2026-10-05T10:00:00Z');
  const OUT = 'glance.salisapan@outlook.com';
  const GMAIL_ME = 'salisapan1@gmail.com';
  const ask = { id: 'a1', conversationId: 'convA', subject: 'Could you review the pilot proposal and confirm by Wednesday?', isDraft: false,
    from: { emailAddress: { name: 'AI Local Flow', address: 'ai.local.flow@gmail.com' } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
    receivedDateTime: '2026-10-05T09:00:00Z', webLink: 'https://outlook.office.com/mail/id/a1',
    body: { contentType: 'text', content: 'Hi Sali,\nCould you review the pilot proposal and confirm by Wednesday? Also, please send me the name of the onboarding owner.\nThanks' } };
  const prev = { id: 'p1', conversationId: 'convB', subject: 'Signed contract', isDraft: false,
    from: { emailAddress: { name: 'Sali Sapan', address: GMAIL_ME } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
    receivedDateTime: '2026-10-05T08:00:00Z',
    body: { contentType: 'text', content: 'Can you send me the signed contract by Thursday?' } };
  const intentDeps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent };
  const planLive = (me) => S.plan({ messages: [ask, prev], me, watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps });

  const both = planLive([OUT, GMAIL_ME]);
  check('live messages with both own addresses: one incoming from ai.local.flow', both.incoming.length === 1 && both.incoming[0].base.counterpart.email === 'ai.local.flow@gmail.com', both.incoming);
  check('incoming label mentions the request and Wed Oct 7', /Reply requested/i.test(both.incoming[0].intent.label) && /Oct 7/.test(both.incoming[0].intent.label), both.incoming[0].intent.label);
  check('self mail produces no offer whose counterpart is an own address', !both.offers.some((o) => o.base.counterpart.email === OUT || o.base.counterpart.email === GMAIL_ME), both.offers);

  const oldMe = planLive(GMAIL_ME);
  check('old behaviour input (me = gmail only): incoming ask still yields one incoming item', oldMe.incoming.length === 1, oldMe.incoming);

  const courtesy = S.plan({
    messages: [{ id: 'c1', conversationId: 'cC', subject: 'Thanks', isDraft: false,
      from: { emailAddress: { name: 'Dana', address: 'dana@acme.com' } },
      toRecipients: [{ emailAddress: { name: 'Me', address: OUT } }],
      receivedDateTime: '2026-10-05T09:00:00Z',
      body: { contentType: 'text', content: 'Thanks for today, talk soon' } }],
    me: OUT, watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps
  });
  check('courtesy mail from someone else: silence bar holds', courtesy.incoming.length === 0 && courtesy.offers.length === 0, courtesy);

  const withLoop = S.plan({
    messages: [ask],
    me: [OUT, GMAIL_ME],
    watches: [{ id: 'ol:convA', threadId: 'ol:convA', channel: 'outlook', messageId: 'old', subject: 'pilot', counterpart: { name: 'AI Local Flow', email: 'ai.local.flow@gmail.com', phone: null }, kind: 'reply', what: 'review', status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0, createdAt: NOW2 - 86400000, chaseIso: '2026-10-07', lang: 'en', amount: null, deadlineIso: null }],
    graph: I.empty(), state: {}, now: NOW2, deps: intentDeps
  });
  check('incoming ask in a conversation that already has a loop: handled as reply, not a second incoming', withLoop.incoming.length === 0, withLoop);

  const replyClose = S.plan({
    messages: [
      ask,
      { id: 's1', conversationId: 'convA', subject: 'RE: Could you review the pilot proposal and confirm by Wednesday?', isDraft: false, _folder: 'sentitems',
        from: { emailAddress: { name: 'Glance', address: OUT } },
        toRecipients: [{ emailAddress: { name: 'AI Local Flow', address: 'ai.local.flow@gmail.com' } }],
        sentDateTime: '2026-10-05T11:00:00Z',
        body: { contentType: 'text', content: 'Confirmed, and the onboarding owner is Dana.' } }
    ],
    me: [OUT, GMAIL_ME],
    watches: [{ id: 'ol:convA', threadId: 'ol:convA', channel: 'outlook', messageId: 'a1', fromIncoming: true, subject: 'pilot', counterpart: { name: 'AI Local Flow', email: 'ai.local.flow@gmail.com', phone: null }, kind: 'reply', what: 'review', status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0, createdAt: NOW2 - 86400000, chaseIso: '2026-10-07', lang: 'en', amount: null, deadlineIso: null }],
    graph: I.empty(), state: {}, now: NOW2, deps: intentDeps
  });
  check('user later reply in sentitems closes the incoming item', replyClose.patches.some((p) => p.id === 'ol:convA' && p.patch.status === 'resolved'), replyClose.patches);

  const draftOnly = S.plan({
    messages: [ask, Object.assign({}, ask, { id: 'd1', isDraft: true, subject: 'RE: pilot' })],
    me: [OUT, GMAIL_ME],
    watches: [{ id: 'ol:convA', threadId: 'ol:convA', channel: 'outlook', messageId: 'a1', fromIncoming: true, subject: 'pilot', counterpart: { name: 'AI Local Flow', email: 'ai.local.flow@gmail.com', phone: null }, kind: 'reply', what: 'review', status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0, createdAt: NOW2 - 86400000, chaseIso: '2026-10-07', lang: 'en', amount: null, deadlineIso: null }],
    graph: I.empty(), state: {}, now: NOW2, deps: intentDeps
  });
  check('a draft alone does NOT close the incoming item', !draftOnly.patches.some((p) => p.patch && p.patch.status === 'resolved'), draftOnly.patches);
}



console.log('\n--- live 0.9.2 silence: confirm by Wednesday whether ---\n');
{
  const fs = require('fs'); const path = require('path'); const vm = require('vm');
  const sandbox = { module: undefined, console, Date, Math, JSON, String, Array, Object, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, Infinity, undefined, NaN };
  vm.createContext(sandbox);
  for (const f of ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','fact-reply.js','intent.js','actions.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
  }
  const FlowIntent = vm.runInContext('FlowIntent', sandbox);
  const NOW2 = Date.parse('2026-10-05T14:06:00+03:00');
  const OUT = 'glance.salisapan@outlook.com';
  const LIVE_BODY = 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team';
  const ask = { id: 'a1', conversationId: 'convA', subject: 'Could you review the pilot proposal and confirm by Wednesday?', isDraft: false,
    from: { emailAddress: { name: 'flow', address: 'ai.local.flow@gmail.com' } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
    receivedDateTime: '2026-10-05T10:21:00Z', webLink: 'https://outlook.office.com/mail/id/a1',
    body: { contentType: 'text', content: LIVE_BODY } };
  const intentDeps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent };
  const r = S.plan({ messages: [ask], me: [OUT, 'salisapan1@gmail.com'], watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps });
  check('live Flow-team body: one incoming (not quiet:hedge)', r.incoming.length === 1 && r.incoming[0].base.counterpart.email === 'ai.local.flow@gmail.com', { incoming: r.incoming, diagnostics: r.diagnostics });
  check('live Flow-team body: diagnostic shows shown-incoming', (r.diagnostics || []).some((d) => d.reason === 'shown-incoming'), r.diagnostics);
  const bare = FlowIntent.classify(LIVE_BODY, { senderEmail: 'ai.local.flow@gmail.com', senderName: 'flow', now: new Date(NOW2) });
  check('classify alone: request chip for confirm-by-Wednesday-whether', bare.type === 'request' && FlowIntent.shouldShowChip(bare), { type: bare.type, quiet: bare.quiet, label: bare.label });
  const hedgeStill = FlowIntent.classify('Can you confirm whether the proposal at $3,900 still works?', { senderEmail: 'x@y.com', senderName: 'X', now: new Date(NOW2) });
  check('bare confirm-whether (no "confirm by") still quiet hedge', !hedgeStill.type && hedgeStill.quiet === 'hedge', hedgeStill);
}

console.log('\n--- learn own addresses from inbox recipients ---\n');
{
  const { FlowGraphMail: G } = require('../core/graph-mail.js');
  const OUT = 'glance.salisapan@outlook.com';
  const GMAIL_ME = 'salisapan1@gmail.com';
  const ask = { from: { emailAddress: { address: 'ai.local.flow@gmail.com' } }, toRecipients: [{ emailAddress: { address: OUT } }] };
  const selfIn = { from: { emailAddress: { address: GMAIL_ME } }, toRecipients: [{ emailAddress: { address: OUT } }] };
  const multi = { from: { emailAddress: { address: 'boss@acme.com' } }, toRecipients: [
    { emailAddress: { address: 'a@acme.com' } }, { emailAddress: { address: 'b@acme.com' } }
  ] };
  const learned = G.learnOwnFromMessages([ask, selfIn, multi], []);
  check('learnOwnFromMessages picks sole inbox toRecipient', learned.indexOf(OUT) !== -1, learned);
  check('learnOwnFromMessages does not add multi-recipient coworkers from one message', learned.indexOf('a@acme.com') === -1 && learned.indexOf('b@acme.com') === -1, learned);
  const primary = G.pickPrimary([GMAIL_ME, OUT], { mail: '', userPrincipalName: GMAIL_ME }, [OUT, OUT]);
  check('pickPrimary prefers outlook alias over gmail UPN when inbox-received', primary === OUT, primary);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
