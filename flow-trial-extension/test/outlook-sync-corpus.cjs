// Outlook sync planning: the same careful rules as Gmail, decided as plain data.
// Run: node test/outlook-sync-corpus.cjs
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
const { FlowIntentModel } = require('../core/intent-model.js');
FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sandbox = { module: undefined, console, require };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 3, 12).getTime();
const ME = 'me@contoso.com';
const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
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
  const FlowActions = vm.runInContext('FlowActions', sandbox);
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
  const intentDeps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
  const planLive = (me) => S.plan({ messages: [ask, prev], me, watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps });

  const both = planLive([OUT, GMAIL_ME]);
  check('live messages with both own addresses: one incoming from ai.local.flow', both.incoming.length === 1 && both.incoming[0].base.counterpart.email === 'ai.local.flow@gmail.com', both.incoming);
  check('incoming label mentions the request and Wed Oct 7', /Reply requested/i.test(both.incoming[0].intent.label) && /Oct 7/.test(both.incoming[0].intent.label), both.incoming[0].intent.label);
  check('self mail produces no offer whose counterpart is an own address', !both.offers.some((o) => o.base.counterpart.email === OUT || o.base.counterpart.email === GMAIL_ME), both.offers);

  const aliasOnly = S.plan({
    messages: [{ id: 'alias1', conversationId: 'convAlias', subject: 'Q4 pricing sheet', isDraft: false,
      from: { emailAddress: { name: 'Sali', address: GMAIL_ME } },
      toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
      receivedDateTime: '2026-10-06T09:00:00Z',
      body: { contentType: 'text', content: "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?" } }],
    me: [OUT, GMAIL_ME], watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps
  });
  check('mail from an alias of the same account stays silent', aliasOnly.incoming.length === 0 && aliasOnly.offers.length === 0, { incoming: aliasOnly.incoming, offers: aliasOnly.offers, diag: aliasOnly.diagnostics });

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
  // Gmail parity (0.9.14): Gmail shows its Do It on a new ask in a thread that has a loop, and the loop moves to "yours".
  // Outlook does both too, instead of swallowing the ask into the loop (one of the live "no card" causes).
  check('incoming ask in a conversation that already has a loop: the loop moves to "yours"', withLoop.patches.some((x) => x.id === 'ol:convA' && x.patch.stage === 'yours'), withLoop);
  check('incoming ask in a conversation that already has a loop: and the ask still gets its Do It (Gmail parity)', withLoop.incoming.length === 1 && withLoop.incoming[0].messageId === 'a1', withLoop);

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
  const FlowActions = vm.runInContext('FlowActions', sandbox);
  const NOW2 = Date.parse('2026-10-05T14:06:00+03:00');
  const OUT = 'glance.salisapan@outlook.com';
  const LIVE_BODY = 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team';
  const ask = { id: 'a1', conversationId: 'convA', subject: 'Could you review the pilot proposal and confirm by Wednesday?', isDraft: false,
    from: { emailAddress: { name: 'flow', address: 'ai.local.flow@gmail.com' } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
    receivedDateTime: '2026-10-05T10:21:00Z', webLink: 'https://outlook.office.com/mail/id/a1',
    body: { contentType: 'text', content: LIVE_BODY } };
  const intentDeps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
  const r = S.plan({ messages: [ask], me: [OUT, 'salisapan1@gmail.com'], watches: [], graph: I.empty(), state: {}, now: NOW2, deps: intentDeps });
  check('live Flow-team body: one incoming (not quiet:hedge)', r.incoming.length === 1 && r.incoming[0].base.counterpart.email === 'ai.local.flow@gmail.com', { incoming: r.incoming, diagnostics: r.diagnostics });
  check('live Flow-team body: process has outlookDraft', r.incoming[0] && r.incoming[0].process && (r.incoming[0].process.steps || []).some((s) => s.kind === 'outlookDraft'), r.incoming[0] && r.incoming[0].process);
  check('live Flow-team body: Why not shown omits shown-incoming', !(r.diagnostics || []).some((d) => String(d.reason || '').indexOf('shown-') === 0), r.diagnostics);
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
  const CID = 'outlook_de6b4487c57f9cb0@outlook.com';
  check('isOpaqueMailbox detects CID form', G.isOpaqueMailbox(CID) === true && G.isOpaqueMailbox(OUT) === false);
  const primaryCid = G.pickPrimary([CID, OUT], { mail: CID, userPrincipalName: CID }, [OUT]);
  check('pickPrimary skips opaque outlook_HEX@outlook.com when human alias exists', primaryCid === OUT, primaryCid);
  const onlyCid = G.pickPrimary([CID], { mail: CID, userPrincipalName: CID }, []);
  check('pickPrimary falls back to CID only when nothing human learned', onlyCid === CID, onlyCid);
}

console.log('\n--- every incoming message ends in a card or a reason (never neither) ---\n');
{
  const T = (conv, from, text, ago, extra) => Object.assign({ id: 'z' + (++n), conversationId: conv, subject: 'S ' + conv, isDraft: false, from: { emailAddress: { name: from.split('@')[0], address: from } }, toRecipients: [{ emailAddress: { name: 'Me', address: ME } }], receivedDateTime: iso(ago), webLink: 'https://outlook.office.com/mail/id/z' + n, body: { contentType: 'text', content: text } }, extra || {});
  const msgs = [
    T('k1', 'dana@acme.com', ASK, 0.1),
    T('k2', 'dana@acme.com', 'Thanks so much, all good on my side. Have a great weekend!', 0.2),
    T('k3', 'avi@partner.io', '', 0.3),                                                      // empty body
    T('k4', ME, 'Note to self: call the bank.', 0.4, { toRecipients: [{ emailAddress: { name: 'Me', address: ME } }] }),
    T('k5', 'noa@vendor.co', 'Could you send me the signed contract by Friday?', 0.5),       // a file ask Outlook cannot attach
    T('k6', 'yael@client.org', 'Confirmed, the figure is 4,200. Booking now.', 0.6),         // answers a waiting loop
    T('k7', 'tom@corp.com', 'Please confirm by Monday that the new pricing works for you.', 0.7),
    T('k8', 'liz@corp.com', 'Can we meet on Thursday at 3pm to go over the rollout plan?', 0.8),
    T('k9', 'ops@corp.com', 'This week we shipped the new dashboard. No action needed.', 0.9)
  ];
  const watches = [loop('k6', { counterpart: { name: 'Yael', email: 'yael@client.org', phone: null } })];
  const r = plan(msgs, watches, { me: ME, state: { incomingDeclined: { ['k7|' + msgs[6].id]: NOW } } });
  const inbound = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];
  const unexplained = inbound.filter((c) => !r.incoming.some((x) => x.conversationId === c) && !r.diagnostics.some((d) => d.conversationId === c));
  check('each of nine different inbound messages is either an incoming card or a Why-not-shown line', unexplained.length === 0, { unexplained, diagnostics: r.diagnostics.map((d) => d.conversationId + ':' + d.reason), incoming: r.incoming.map((x) => x.conversationId) });
  const why = (c) => (r.diagnostics.find((d) => d.conversationId === c) || {}).reason;
  check('an empty body says no-text', why('k3') === 'no-text', why('k3'));
  check('an answer that settled a waiting loop says so', /answered-loop|has-open-loop|has-loop/.test(why('k6') || ''), why('k6'));
  check('a declined ask says incoming-declined', why('k7') === 'incoming-declined', why('k7'));
}

console.log('\n--- OneDrive save reaches a card, and a drop still has a reason ---\n');
{
  const { FlowOwaParse: Owa } = require('../core/owa-parse.js');
  const { FlowGraphMail: GM } = require('../core/graph-mail.js');
  const upper = Owa.urlIds('https://outlook.live.com/mail/0/inbox/id/AQQKADAwATM0MDAAMS0wZTAw');
  const lower = Owa.urlIds('https://outlook.live.com/mail/0/inbox/id/AQQkADAwATM0MDAAMS0wZTAw');
  check('an uppercase AQQK address is a conversation, not a message id',
    upper.kind === 'conversation' && upper.itemId == null && upper.conversationId && /^AQQK/i.test(upper.conversationId), upper);
  check('a lowercase AQQk address is still a conversation',
    lower.kind === 'conversation' && lower.itemId == null, lower);
  const SAVE = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
  const pdf = { id: 'att1', name: 'Gate-0935-signed-NDA.pdf', isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
  const one = theirs('od1', SAVE, 0.1, 'Gate 0.9.35 OneDrive save');
  one.hasAttachments = true;
  one.attachments = [pdf];
  one.from.emailAddress.address = 'ai.local.flow@gmail.com';
  one.toRecipients = [{ emailAddress: { name: 'Glance', address: ME } }];
  const shown = plan([one]);
  const kinds = shown.incoming[0] && shown.incoming[0].process && shown.incoming[0].process.steps.map((s) => s.kind);
  check('one PDF on a OneDrive save is an incoming card',
    shown.incoming.length === 1 && kinds && kinds[0] === 'onedriveFile' && kinds[1] === 'outlookDraft' &&
    shown.incoming[0].process.steps[0].label === 'OneDrive' && shown.diagnostics.length === 0,
    { incoming: shown.incoming.map((x) => x.subject), kinds, diagnostics: shown.diagnostics });
  const two = theirs('od2', SAVE, 0.1, 'Gate two files');
  two.hasAttachments = true;
  two.attachments = [pdf, Object.assign({}, pdf, { id: 'att2', name: 'other.pdf' })];
  const twoPlan = plan([two]);
  const twoWhy = (twoPlan.diagnostics.find((d) => d.conversationId === 'od2') || {}).reason;
  check('two non-inline files stay silent with a reason',
    twoPlan.incoming.length === 0 && twoWhy === 'quiet:google', { incoming: twoPlan.incoming.length, why: twoWhy });
  const unread = theirs('od3', SAVE, 0.1, 'Gate attachments unread');
  unread.hasAttachments = true;
  unread.attachmentsUnread = true;
  const unreadPlan = plan([unread]);
  const unreadWhy = (unreadPlan.diagnostics.find((d) => d.conversationId === 'od3') || {}).reason;
  check('an attachment list that could not be read is not a fake count',
    unreadPlan.incoming.length === 0 && unreadWhy === 'outlook:attachments-unread', unreadWhy);
  const preview = theirs('od4', '', 0.1, 'Gate preview');
  preview.body = { contentType: 'text', content: '' };
  preview.bodyPreview = SAVE;
  preview.hasAttachments = true;
  preview.attachments = [pdf];
  const previewU = GM.toUtterance(preview, ME);
  const previewPlan = plan([preview]);
  check('an empty body falls through to bodyPreview and can show',
    previewU && /OneDrive/.test(previewU.text) && previewPlan.incoming.length === 1,
    { text: previewU && previewU.text, incoming: previewPlan.incoming.length, diagnostics: previewPlan.diagnostics });
  const refusal = "please don't save the attachment to OneDrive.";
  let lead = 'Hi, Please save the attachment to OneDrive by Friday so finance can file the signed pack. ';
  while ((lead + refusal).length < 400) lead += 'The PDF is the one we discussed on the call yesterday. ';
  const fullMail = lead + refusal;
  const cut = fullMail.slice(0, 255);
  check('the sample mail is about 400 characters and the preview drops the refusal',
    fullMail.length >= 400 && fullMail.length < 520 && cut.length === 255 && !/don't save/.test(cut) && /OneDrive/.test(cut),
    { full: fullMail.length, cut: cut.length });
  const truncated = theirs('od-preview-cut', '', 0.12, 'Gate preview cut');
  truncated.body = { contentType: 'text', content: '   ' };
  truncated.bodyPreview = cut;
  truncated.hasAttachments = true;
  truncated.attachments = [pdf];
  const truncatedPlan = plan([truncated]);
  const truncatedWhy = (truncatedPlan.diagnostics.find((d) => d.conversationId === 'od-preview-cut') || {}).reason;
  check('a truncated body preview does not show a file card',
    truncatedPlan.incoming.length === 0 && truncatedWhy === 'outlook:body-preview-only',
    { incoming: truncatedPlan.incoming.length, why: truncatedWhy, diagnostics: truncatedPlan.diagnostics });
  const whole = theirs('od-preview-full', fullMail, 0.12, 'Gate preview full');
  whole.bodyPreview = cut;
  whole.hasAttachments = true;
  whole.attachments = [pdf];
  const wholePlan = plan([whole]);
  const wholeWhy = (wholePlan.diagnostics.find((d) => d.conversationId === 'od-preview-full') || {}).reason;
  check('the full body keeps the refusal and stays quiet',
    wholePlan.incoming.length === 0 && wholeWhy === 'quiet:google',
    { incoming: wholePlan.incoming.length, why: wholeWhy });
  const noConv = theirs('od5', 'Could you please send me the signed lease by Friday? I need it to release the deposit.', 0.1, 'Gate no conversation');
  delete noConv.conversationId;
  const noConvPlan = plan([noConv]);
  const noConvLine = noConvPlan.diagnostics.find((d) => d.messageId === noConv.id) || noConvPlan.incoming.find((x) => x.messageId === noConv.id);
  check('a message with no conversation id is a card or a reason',
    Boolean(noConvLine) && (noConvPlan.incoming.some((x) => x.messageId === noConv.id) || noConvPlan.diagnostics.some((d) => d.messageId === noConv.id)),
    { incoming: noConvPlan.incoming.map((x) => x.messageId), diagnostics: noConvPlan.diagnostics });
  const flagOnly = [
    ['od-flag-onedrive', 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks'],
    ['od-flag-drive', 'Please save the attached file to Drive.']
  ];
  const itemOnly = theirs('od-item', SAVE, 0.1, 'Gate item attachment');
  itemOnly.hasAttachments = true;
  itemOnly.attachments = [{ id: 'item1', name: 'forwarded.eml', isInline: false, '@odata.type': '#microsoft.graph.itemAttachment' }];
  const itemPlan = plan([itemOnly]);
  const itemWhy = (itemPlan.diagnostics.find((d) => d.conversationId === 'od-item') || {}).reason;
  check('an attached message is not a file', itemPlan.incoming.length === 0 && itemWhy !== 'outlook:attachments-unread', { why: itemWhy, incoming: itemPlan.incoming.length });
  check('a page that could not count files keeps a mailbox file card',
    S.keepMailboxFileCard(
      { none: true, reason: 'page:attachment-count-unread' },
      { messageId: 'm1', process: { steps: [{ kind: 'onedriveFile' }, { kind: 'outlookDraft' }] } }
    ) === true);
  check('a page miss without a file step does not keep a card',
    S.keepMailboxFileCard({ none: true, reason: 'page:attachment-count-unread' }, { messageId: 'm1', process: { steps: [{ kind: 'outlookTask' }] } }) === false
    && S.keepMailboxFileCard({ none: true, reason: 'intent-null' }, { messageId: 'm1', process: { steps: [{ kind: 'driveFile' }] } }) === false
    && S.keepMailboxFileCard({ none: true, reason: 'page:attachment-count-unread' }, { process: { steps: [{ kind: 'onedriveFile' }] } }) === false);
  flagOnly.forEach((pair) => {
    const row = theirs(pair[0], pair[1], 0.1, 'Gate flag only');
    row.hasAttachments = true;
    delete row.attachments;
    const planned = plan([row]);
    const why = (planned.diagnostics.find((d) => d.conversationId === pair[0]) || {}).reason;
    check('hasAttachments without a file list is not one file: ' + pair[0],
      planned.incoming.length === 0 && why === 'outlook:attachments-unread',
      { incoming: planned.incoming.length, why: why, kinds: planned.incoming[0] && planned.incoming[0].process && planned.incoming[0].process.steps.map((s) => s.kind) });
  });
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
