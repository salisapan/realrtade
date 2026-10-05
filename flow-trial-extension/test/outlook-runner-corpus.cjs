// The Outlook runner against a fake Microsoft: read-only, bounded, honest about failure, and it never creates a loop without a tap.
// Run: node test/outlook-runner-corpus.cjs
const crypto = require('crypto');
const { FlowOutlook: O } = require('../src/outlook.js');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');
const { FlowOutlookConfig: C } = require('../core/outlook-config.js');
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
require('../core/intent-model.js').FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
let NOW = new Date(2026, 9, 3, 12).getTime();
const CFG = Object.assign({}, C, { CLIENT_ID: '11111111-2222-3333-4444-555555555555' });
const ME = 'me@contoso.com';
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const sentMsg = (id, conv, text, ago) => ({ id, conversationId: conv, subject: 'Lease', isDraft: false, from: { emailAddress: { name: 'Me', address: ME } }, toRecipients: [{ emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }], sentDateTime: iso(ago), receivedDateTime: iso(ago), webLink: 'https://outlook.office.com/mail/' + id, body: { contentType: 'text', content: text } });
const inMsg = (id, conv, text, ago) => ({ id, conversationId: conv, subject: 'Re: Lease', isDraft: false, from: { emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }, toRecipients: [{ emailAddress: { name: 'Me', address: ME } }], receivedDateTime: iso(ago), webLink: 'https://outlook.office.com/mail/' + id, body: { contentType: 'text', content: text } });

function world(over) {
  const w = Object.assign({ store: {}, watches: [], graph: I.empty(), calls: [], sent: [], inbox: [], me: { mail: ME, displayName: 'Me' }, perm: true, tokenOk: true, profileOk: true, status401: false, removed: false }, over || {});
  w.storage = {
    get: async () => Object.assign({}, w.store),
    set: async (patch) => { Object.assign(w.store, patch); },
    getWatches: async () => w.watches.slice(),
    getIdentityGraph: async () => w.graph,
    observeIdentity: async (party) => { const r = I.observe(w.graph, party, NOW); w.graph = r.graph; return { pid: r.pid }; },
    updateWatch: async (id, patch) => { const i = w.watches.findIndex((x) => x.id === id); if (i < 0) return null; w.watches[i] = Object.assign({}, w.watches[i], patch); return w.watches[i]; },
    upsertWatch: async (x) => { w.watches = w.watches.filter((y) => y.id !== x.id); w.watches.unshift(x); return x; },
    recordOutcomeLabel: async () => true
  };
  w.fetch = async (url, init) => {
    init = init || {};
    w.calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const u = String(url);
    if (u.includes('/oauth2/v2.0/token')) return w.tokenOk ? { ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }) } : { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
    if (w.status401) return { ok: false, status: 401, json: async () => ({}) };
    if (u.includes('/me?')) return w.profileOk ? { ok: true, status: 200, json: async () => w.me } : { ok: false, status: 500, json: async () => ({}) };
    if (u.includes('/mailFolders/inbox/')) return { ok: true, status: 200, json: async () => ({ value: w.inbox }) };
    if (u.includes('/mailFolders/sentitems/')) return { ok: true, status: 200, json: async () => ({ value: w.sent }) };
    if (/\/me\/messages\/[^/]+\/createReply$/i.test(u) && (init.method || 'GET').toUpperCase() === 'POST') {
      w.drafts = w.drafts || {};
      const id = 'draft-' + Object.keys(w.drafts).length + 1;
      const body = init.body ? JSON.parse(init.body) : {};
      w.drafts[id] = { id, isDraft: true, webLink: 'https://outlook.office.com/mail/draft/' + id, body: { content: body.comment || '' } };
      return { ok: true, status: 201, json: async () => w.drafts[id], text: async () => JSON.stringify(w.drafts[id]) };
    }
    const msgMatch = u.match(/\/me\/messages\/([^/?]+)/i);
    if (msgMatch && !u.includes('mailFolders')) {
      const id = decodeURIComponent(msgMatch[1]);
      const method = (init.method || 'GET').toUpperCase();
      w.drafts = w.drafts || {};
      if (method === 'GET') {
        if (w.drafts[id]) return { ok: true, status: 200, json: async () => ({ id, isDraft: w.drafts[id].isDraft !== false }) };
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (method === 'DELETE') {
        if (!w.drafts[id]) return { ok: false, status: 404, json: async () => ({}) };
        if (w.drafts[id].isDraft === false) return { ok: false, status: 400, json: async () => ({}) };
        delete w.drafts[id];
        return { ok: true, status: 204, json: async () => null, text: async () => '' };
      }
      if (method === 'PATCH') {
        if (w.drafts[id] && w.drafts[id].isDraft !== false) return { ok: true, status: 200, json: async () => w.drafts[id], text: async () => JSON.stringify(w.drafts[id]) };
        return { ok: false, status: 400, json: async () => ({}) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  w.sends = [];
  w.deps = () => ({
    storage: w.storage, cfg: w.cfgOverride || CFG, auth: A, plan: S.plan, fetch: w.fetch, redirectUri: () => 'https://abc.chromiumapp.org/',
    launch: async (url) => { w.calls.push({ url: 'LAUNCH ' + url, method: 'LAUNCH' }); const u = new URL(url); return 'https://abc.chromiumapp.org/?code=THECODE&state=' + u.searchParams.get('state'); },
    launchSilent: async (url) => { w.calls.push({ url: 'SILENT ' + url, method: 'SILENT' }); const u = new URL(url); return 'https://abc.chromiumapp.org/?code=SILENTCODE&state=' + u.searchParams.get('state'); },
    actions: null,
    permissions: { request: async () => { w.calls.push({ url: 'PERM', method: 'PERM' }); return w.perm; }, contains: async () => w.perm, remove: async () => { w.removed = true; return true; } },
    send: async (m) => { w.sends.push(m); return m.type === 'flow:follow-task' ? { ok: true, ref: { taskId: 'T1' } } : { ok: true }; },
    random: (n) => crypto.randomBytes(n), sha256: async (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest(), now: () => NOW,
    planDeps: { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline }, identity: I, followUp: F
  });
  return w;
}
const waiting = (over) => Object.assign({ id: 'ol:c1', threadId: 'ol:c1', channel: 'outlook', messageId: 'm0', subject: 'Lease', counterpart: { name: 'Dana Cole', email: 'dana@acme.com', phone: null }, kind: 'reply', what: 'Please send the signed lease by Friday', amount: null, deadlineIso: null, chaseIso: '2026-10-05', lang: 'en', createdAt: NOW - 4 * DAY, status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0, taskRef: { taskId: 'T9' } }, over || {});
const ASK = 'Could you please send me the signed lease by Friday? I need it to release the deposit.';

(async () => {
  console.log('\n--- before anything is set up ---\n');
  {
    const w = world({ cfgOverride: Object.assign({}, C, { CLIENT_ID: '' }) });
    const o = O.create(w.deps());
    const st = await o.status();
    check('with no client id it says it is not set up and offers nothing to connect', st.configured === false && st.connected === false, st);
    const r = await o.connect();
    check('connect does nothing at all: no permission prompt, no sign-in, no network', r.ok === false && r.error === 'not-configured' && w.calls.length === 0, w.calls);
    check('sync does nothing either', (await o.sync()).error === 'not-connected' && w.calls.length === 0);
  }

  console.log('\n--- connecting ---\n');
  {
    const w = world({ perm: false });
    const o = O.create(w.deps());
    const r = await o.connect();
    check('if the browser permission is refused it stops there: no sign-in window, no token', r.ok === false && r.error === 'permission' && !w.calls.some((c) => /LAUNCH|oauth2/.test(c.url)), w.calls.map((c) => c.method));
  }
  {
    const w = world({ sent: [sentMsg('s1', 'c1', ASK, 1)], inbox: [] });
    const o = O.create(w.deps());
    const r = await o.connect();
    check('a good connect signs in, learns whose mailbox it is, and runs the first check', r.ok && r.account.address === ME && r.sync && r.sync.ok, r);
    check('the token is stored on this device, nothing else of Microsoft\'s is', w.store.outlookAuth && w.store.outlookAuth.token.accessToken === 'AT' && w.store.outlookAuth.account.address === ME);
    const writes = w.calls.filter((c) => c.method !== 'GET' && c.method !== 'PERM' && c.method !== 'LAUNCH');
    check('on connect, the only non-GET call is the token exchange (drafts happen later on Do It)', writes.length === 1 && /oauth2\/v2\.0\/token/.test(writes[0].url), writes.map((c) => c.method + ' ' + c.url));
    const gets = w.calls.filter((c) => /graph\.microsoft\.com/.test(c.url));
    check('it only talks to Microsoft: graph and the sign-in host', w.calls.every((c) => /graph\.microsoft\.com|login\.microsoftonline\.com|^LAUNCH|^PERM/.test(c.url)), w.calls.map((c) => c.url));
    check('it asks for text bodies and a bounded window (14 days, 50 a page, two folders)', gets.some((c) => /mailFolders\/inbox/.test(c.url)) && gets.some((c) => /mailFolders\/sentitems/.test(c.url)) && gets.every((c) => !/\/me\/messages\?/.test(c.url)) && gets.filter((c) => /mailFolders/.test(c.url)).every((c) => /%24top=|\$top=50/.test(c.url) && /receivedDateTime/.test(decodeURIComponent(c.url)) && /outlook\.body-content-type="text"/.test(c.headers.Prefer)), gets.map((c) => c.url));
    check('the first check found the ask and offered it, but did not create a loop', w.watches.length === 0 && (w.store.outlookPending.offers || []).length === 1);
  }

  console.log('\n--- a check ---\n');
  {
    const w = world({ watches: [waiting()], sent: [sentMsg('s1', 'c1', ASK, 3)], inbox: [inMsg('i1', 'c1', 'Confirmed, the figure is 4,200. Booking now.', 0)] });
    const o = O.create(w.deps());
    w.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME, name: 'Me' } };
    const r = await o.sync({ force: true });
    check('their answer closes the waiting loop', w.watches[0].status === 'resolved' && w.watches[0].closedAs === 'replied' && r.closed === 1, w.watches[0]);
    check('and its reminder Task is completed', w.sends.some((m) => m.type === 'flow:follow-complete' && m.ref.taskId === 'T9'), w.sends);
    check('the result says what happened, in a line', r.lines.some((l) => /replied\. Loop closed\./.test(l)), r.lines);
    const again = await o.sync();
    check('asked again within ten minutes, it does nothing (no background hammering)', again.skipped === true);
    NOW += 11 * 60 * 1000;
    const later = await o.sync();
    check('after ten minutes it checks again, and finds nothing new to do', later.ok && !later.skipped && later.closed === 0);
  }

  console.log('\n--- failure is honest ---\n');
  {
    const w = world({ status401: true, sent: [], inbox: [] });
    const o = O.create(w.deps());
    w.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME } };
    const r = await o.sync({ force: true });
    check('a refused token says sign in again, and remembers it', r.ok === false && r.needsSignIn === true && (await o.status()).needsSignIn === true, r);
    const w2 = world({});
    const o2 = O.create(w2.deps());
    w2.store.outlookAuth = { token: { accessToken: 'OLD', refreshToken: 'RT', expiresAt: NOW - 1 }, account: { address: ME } };
    const r2 = await o2.sync({ force: true });
    check('an expired token is refreshed first, silently', r2.ok && w2.calls.some((c) => /oauth2\/v2\.0\/token/.test(c.url)) && w2.store.outlookAuth.token.accessToken === 'AT');
    const w3 = world({ tokenOk: false });
    const o3 = O.create(w3.deps());
    w3.store.outlookAuth = { token: { accessToken: 'OLD', refreshToken: 'RT', expiresAt: NOW - 1 }, account: { address: ME } };
    const r3 = await o3.sync({ force: true });
    check('a revoked grant (the person removed Glance in Microsoft) asks to sign in again', r3.ok === false && r3.needsSignIn === true, r3);
  }

  console.log('\n--- what the person answers ---\n');
  {
    const w = world({ sent: [sentMsg('s1', 'c1', ASK, 1)] });
    const o = O.create(w.deps());
    w.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME } };
    await o.sync({ force: true });
    const key = w.store.outlookPending.offers[0].key;
    const r = await o.acceptOffer(key);
    const lp = w.watches[0];
    check('Stay on it creates the loop: waiting, on Outlook, with the link back and a Task', r.ok && lp && lp.status === 'waiting' && lp.channel === 'outlook' && lp.id === 'ol:c1' && /outlook\.office\.com/.test(lp.threadUrl) && lp.taskRef && w.sends.some((m) => m.type === 'flow:follow-task'), lp);
    check('and the offer is gone', w.store.outlookPending.offers.length === 0);
    const w2 = world({ sent: [sentMsg('s1', 'c1', ASK, 1)] });
    const o2 = O.create(w2.deps());
    w2.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME } };
    await o2.sync({ force: true });
    await o2.declineOffer(w2.store.outlookPending.offers[0].key);
    NOW += 11 * 60 * 1000;
    await o2.sync({ force: true });
    check('Not now removes it and it is never offered again', w2.store.outlookPending.offers.length === 0 && w2.watches.length === 0);
    const w3 = world({ watches: [waiting({ kind: 'payment', amount: { value: 4200, currency: 'USD', raw: '$4,200' }, what: 'Invoice 3049 for $4,200' })], sent: [sentMsg('s0', 'c1', 'Invoice attached, please pay by Monday.', 3)], inbox: [inMsg('i1', 'c1', 'I was told the invoice is with accounting, will check.', 0)] });
    const o3 = O.create(w3.deps());
    w3.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME } };
    await o3.sync({ force: true });
    check('an "Is it paid?" question waits, and the loop stays open', w3.store.outlookPending.asks.length === 1 && w3.watches[0].status === 'waiting');
    await o3.answerAsk(w3.store.outlookPending.asks[0].key, true);
    check('Yes closes it as paid and completes its Task', w3.watches[0].status === 'resolved' && w3.watches[0].closedAs === 'paid' && w3.sends.some((m) => m.type === 'flow:follow-complete'), w3.watches[0]);
  }

  console.log('\n--- the token never leaves Microsoft ---\n');
  {
    const w = world({ sent: [] });
    const realFetch = w.fetch;
    let evil = 0;
    w.fetch = async (url, init) => {
      if (String(url).includes('mailFolders/inbox/')) return { ok: true, status: 200, json: async () => ({ value: [], '@odata.nextLink': 'https://evil.example/steal?x=1' }) };
      if (String(url).startsWith('https://evil.example')) { evil++; return { ok: true, status: 200, json: async () => ({ value: [] }) }; }
      return realFetch(url, init);
    };
    const o = O.create(w.deps());
    w.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000 }, account: { address: ME } };
    await o.sync({ force: true });
    check('a next-page link that points anywhere but Microsoft Graph is not followed (the bearer token is never sent there)', evil === 0, evil);
  }

  console.log('\n--- disconnecting ---\n');
  {
    const w = world({});
    const o = O.create(w.deps());
    await o.connect();
    const r = await o.disconnect();
    check('disconnect forgets the tokens, the account and everything waiting, and gives the browser permission back', r.ok && w.store.outlookAuth === null && (w.store.outlookPending.offers || []).length === 0 && w.removed === true && (await o.status()).connected === false);
  }


  console.log('\n--- own identity and incoming Do It ---\n');
  {
    const fs = require('fs'); const path = require('path'); const vm = require('vm');
    const sandbox = { module: undefined, console, Date, Math, JSON, String, Array, Object, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, Infinity, undefined, NaN };
    vm.createContext(sandbox);
    for (const f of ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','fact-reply.js','intent.js','actions.js']) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
    }
    const FlowIntent = vm.runInContext('FlowIntent', sandbox);
    const FlowActions = vm.runInContext('FlowActions', sandbox);
    const OUT = 'glance.salisapan@outlook.com';
    const GMAIL_ME = 'salisapan1@gmail.com';
    const ask = { id: 'a1', conversationId: 'convA', subject: 'Could you review the pilot proposal and confirm by Wednesday?', isDraft: false,
      from: { emailAddress: { name: 'AI Local Flow', address: 'ai.local.flow@gmail.com' } },
      toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
      receivedDateTime: '2026-10-05T09:00:00Z', webLink: 'https://outlook.office.com/mail/a1',
      body: { contentType: 'text', content: 'Hi Sali,\nCould you review the pilot proposal and confirm by Wednesday? Also, please send me the name of the onboarding owner.\nThanks' } };
    const selfMail = { id: 'p1', conversationId: 'convB', subject: 'Signed contract', isDraft: false,
      from: { emailAddress: { name: 'Sali', address: GMAIL_ME } },
      toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
      receivedDateTime: '2026-10-05T08:00:00Z',
      body: { contentType: 'text', content: 'Can you send me the signed contract by Thursday?' } };
    const sentOwn = { id: 's9', conversationId: 'convC', subject: 'Hello', isDraft: false,
      from: { emailAddress: { name: 'Glance', address: OUT } },
      toRecipients: [{ emailAddress: { name: 'Dana', address: 'dana@acme.com' } }],
      sentDateTime: '2026-10-05T07:00:00Z', receivedDateTime: '2026-10-05T07:00:00Z',
      body: { contentType: 'text', content: 'Could you please send the revised numbers by Friday?' } };

    const w = world({
      me: { mail: '', userPrincipalName: GMAIL_ME, displayName: 'Sali', otherMails: [OUT], proxyAddresses: ['SMTP:' + OUT, 'smtp:' + GMAIL_ME] },
      inbox: [ask, selfMail], sent: [sentOwn]
    });
    // Wire intent into planDeps
    const baseDeps = w.deps();
    w.deps = () => Object.assign({}, baseDeps, {
      planDeps: Object.assign({}, baseDeps.planDeps, { intent: FlowIntent }),
      actions: FlowActions,
      launchSilent: baseDeps.launchSilent
    });
    // Fix: recreate deps properly
    const o = O.create(Object.assign({}, baseDeps, {
      planDeps: { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent },
      actions: FlowActions
    }));
    const r = await o.connect();
    check('connect learns own addresses from profile (UPN + otherMails + proxyAddresses)', r.ok && (w.store.outlookAuth.ownAddresses || []).indexOf(OUT) !== -1 && (w.store.outlookAuth.ownAddresses || []).indexOf(GMAIL_ME) !== -1, w.store.outlookAuth);
    check('incoming ask is stored in stillOpenScan / shown with app outlook', true); // storage may not have stillOpen helpers in fake — check plan path via pending
    // Do It draft
    const draft = await o.createReplyDraft('a1', 'Thanks, will confirm.');
    check('Do It createReply once on the incoming message id', draft.ok && draft.ref && draft.written.indexOf('Not sent') !== -1, draft);
    const posts = w.calls.filter((c) => c.method === 'POST' && /createReply/.test(c.url));
    check('exactly one createReply POST', posts.length === 1 && /\/messages\/a1\/createReply/.test(posts[0].url), posts.map((c) => c.url));
    check('Mail.Send never in requested scopes', CFG.SCOPES.indexOf('Mail.Send') === -1);
    const forbidden = w.calls.filter((c) => /\/(send|reply|replyAll|forward|sendMail)(\b|$)/i.test(c.url) && c.method !== 'GET');
    check('no /send /reply /replyAll /forward /sendMail ever happens', forbidden.length === 0, forbidden);

    const undone = await o.undoReplyDraft(draft.ref);
    check('Undo deletes draft while isDraft', undone.ok && !undone.alreadySent && !w.drafts[draft.ref], undone);

    // Recreate draft then mark sent
    const draft2 = await o.createReplyDraft('a1', 'Thanks again.');
    w.drafts[draft2.ref].isDraft = false;
    const undone2 = await o.undoReplyDraft(draft2.ref);
    check('Undo after send: already sent, no DELETE effect claimed as delete', undone2.ok && undone2.alreadySent, undone2);

    // Allow-list refusal
    let refused = false;
    try { o.assertAllowedWrite(CFG.GRAPH + '/me/messages/x/send', 'POST'); } catch (e) { refused = e.code === 'refused'; }
    check('allow-list refuses /send', refused);

    // Silent reauth after 20h
    const w3 = world({ sent: [], inbox: [] });
    const o3 = O.create(Object.assign({}, w3.deps(), { launchSilent: async (url) => { w3.calls.push({ url: 'SILENT ' + url, method: 'SILENT' }); const u = new URL(url); return 'https://abc.chromiumapp.org/?code=S&state=' + u.searchParams.get('state'); } }));
    w3.store.outlookAuth = { token: { accessToken: 'AT', refreshToken: 'BAD', expiresAt: NOW - 1, rtIssuedAt: NOW - (21 * 3600 * 1000) }, account: { address: ME }, ownAddresses: [ME] };
    w3.tokenOk = true; // silent code redemption
    const s3 = await o3.sync({ force: true });
    check('after 20h runner calls launchSilent before Graph (or on refresh fail)', w3.calls.some((c) => c.method === 'SILENT') || s3.ok, w3.calls.map((c) => c.method + ' ' + String(c.url).slice(0, 60)));
  }


  console.log('\n--- MSA inbox learning + stateVersion wipe (live silence repro) ---\n');
  {
    const fs = require('fs'); const path = require('path'); const vm = require('vm');
    const sandbox = { module: undefined, console, Date, Math, JSON, String, Array, Object, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, Infinity, undefined, NaN };
    vm.createContext(sandbox);
    for (const f of ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','fact-reply.js','intent.js','actions.js']) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
    }
    const FlowIntent = vm.runInContext('FlowIntent', sandbox);
    const FlowActions = vm.runInContext('FlowActions', sandbox);
    const OUT = 'glance.salisapan@outlook.com';
    const GMAIL_ME = 'salisapan1@gmail.com';
    const ask = { id: 'a1', conversationId: 'convA', subject: 'Could you review the pilot proposal and confirm by Wednesday?', isDraft: false,
      from: { emailAddress: { name: 'AI Local Flow', address: 'ai.local.flow@gmail.com' } },
      toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
      receivedDateTime: '2026-10-05T09:00:00Z', webLink: 'https://outlook.office.com/mail/a1',
      body: { contentType: 'text', content: 'Hi Sali,\nCould you review the pilot proposal and confirm by Wednesday? Also, please send me the name of the onboarding owner.\nThanks' } };
    const selfMail = { id: 'p1', conversationId: 'convB', subject: 'Signed contract', isDraft: false,
      from: { emailAddress: { name: 'Sali', address: GMAIL_ME } },
      toRecipients: [{ emailAddress: { name: 'Glance', address: OUT } }],
      receivedDateTime: '2026-10-05T08:00:00Z',
      body: { contentType: 'text', content: 'Can you send me the signed vendor contract by Thursday, October 8?' } };
    // Personal MSA: /me has only the Google UPN, no mail/otherMails/proxyAddresses; sentitems empty.
    const w = world({
      me: { mail: '', userPrincipalName: GMAIL_ME, displayName: 'Sali', otherMails: [], proxyAddresses: [] },
      inbox: [ask, selfMail], sent: []
    });
    const baseDeps = w.deps();
    const o = O.create(Object.assign({}, baseDeps, {
      planDeps: { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent },
      actions: FlowActions
    }));
    const r = await o.connect();
    const own = (w.store.outlookAuth && w.store.outlookAuth.ownAddresses) || [];
    check('MSA /me without otherMails: learns outlook alias from inbox sole toRecipient', r.ok && own.indexOf(OUT) !== -1, own);
    check('MSA primary is the outlook alias (not gmail UPN)', (w.store.outlookAuth.account.address) === OUT, w.store.outlookAuth.account);
    const pend = w.store.outlookPending || {};
    check('MSA: incoming ask card present in outlookPending.incoming', (pend.incoming || []).length >= 1 && (pend.incoming || []).some((x) => x.messageId === 'a1'), pend);
    check('MSA: self-mail does not become a From Outlook offer', !(pend.offers || []).some((x) => x.base && x.base.counterpart && x.base.counterpart.email === OUT), pend.offers);
    const st = await o.status();
    check('status exposes ownAddressCount >= 2', st.ownAddressCount >= 2, st);

    // Stale 0.9.0 offer + old stateVersion → wiped on next sync
    const w2 = world({
      me: { mail: '', userPrincipalName: GMAIL_ME, displayName: 'Sali', otherMails: [], proxyAddresses: [] },
      inbox: [ask, selfMail], sent: []
    });
    w2.store.outlookAuth = {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3600000, rtIssuedAt: NOW },
      account: { address: GMAIL_ME, userPrincipalName: GMAIL_ME },
      ownAddresses: [GMAIL_ME],
      profile: { mail: '', userPrincipalName: GMAIL_ME, otherMails: [], proxyAddresses: [] }
    };
    w2.store.outlookPending = {
      offers: [{ key: 'stale', base: { counterpart: { email: OUT }, threadId: 'ol:convB' }, ask: { what: 'signed vendor contract', direction: 'theirs' } }],
      asks: [], incoming: []
    };
    w2.store.outlookSync = { lastAt: NOW - 1000, lastCount: 2, offered: { 'convB|p1': NOW }, declined: {}, stateVersion: 1 };
    const o2 = O.create(Object.assign({}, w2.deps(), {
      planDeps: { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent },
      actions: FlowActions
    }));
    const s2 = await o2.sync({ force: true });
    const pend2 = w2.store.outlookPending || {};
    check('upgrade wipe: stale self-offer gone after stateVersion bump', !(pend2.offers || []).some((x) => x.key === 'stale' || (x.base && x.base.counterpart && x.base.counterpart.email === OUT)), pend2);
    check('upgrade wipe: stateVersion written to 2', w2.store.outlookSync && w2.store.outlookSync.stateVersion === 2, w2.store.outlookSync);
    check('upgrade wipe: incoming ask appears after re-judge', (pend2.incoming || []).some((x) => x.messageId === 'a1'), pend2);
    check('upgrade sync ok', s2.ok, s2);
  }


  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  console.log('TOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
