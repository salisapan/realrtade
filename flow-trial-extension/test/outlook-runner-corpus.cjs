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
    return { ok: false, status: 404, json: async () => ({}) };
  };
  w.sends = [];
  w.deps = () => ({
    storage: w.storage, cfg: w.cfgOverride || CFG, auth: A, plan: S.plan, fetch: w.fetch, redirectUri: () => 'https://abc.chromiumapp.org/',
    launch: async (url) => { w.calls.push({ url: 'LAUNCH ' + url, method: 'LAUNCH' }); const u = new URL(url); return 'https://abc.chromiumapp.org/?code=THECODE&state=' + u.searchParams.get('state'); },
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
    const w = world({ cfgOverride: C });
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
    check('the ONLY non-GET call is the token exchange: the mailbox is never written to', writes.length === 1 && /oauth2\/v2\.0\/token/.test(writes[0].url), writes.map((c) => c.method + ' ' + c.url));
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

  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  console.log('TOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
