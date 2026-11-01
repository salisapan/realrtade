// Contract tests for core/slack-answer-close.js against a mock of the Slack Web API. No network, no real workspace, no real key.
const assert = require('assert');
const { FlowSlackAnswerClose } = require('../core/slack-answer-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

const DM = 'D0123ABCDEF';
const OTHER_DM = 'D0999ZZZZZZ';
const ME = 'U0000ME0001';
const DANA = 'U0000DANA01';
const ASKED = '2026-10-26T09:00:00Z';
const T0 = Date.parse('2026-10-26T12:00:00Z');
const ts = (iso, n) => (Date.parse(iso) / 1000).toFixed(0) + '.' + String(n || 1).padStart(6, '0');

function server(opts) {
  const o = opts || {};
  const s = { dms: { [DM]: [], [OTHER_DM]: [] }, calls: [], faults: o.faults || {}, token: o.token || 'xoxp-1', clock: T0 };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.add = (dm, user, text, iso, extra) => { const m = Object.assign({ type: 'message', user: user, text: text, ts: ts(iso, s.calls.length + s.dms[dm].length + 1) }, extra || {}); s.dms[dm].push(m); return m; };
  s.exec = (u, auth) => {
    if (auth !== 'Bearer ' + s.token) return res(200, { ok: false, error: 'invalid_auth' });
    const url = new URL(u); const p = url.pathname;
    if (p === '/api/auth.test') return res(200, { ok: true, user_id: ME });
    if (p === '/api/conversations.history') {
      const ch = url.searchParams.get('channel'); if (!s.dms[ch]) return res(200, { ok: false, error: 'channel_not_found' });
      const oldest = Number(url.searchParams.get('oldest') || 0); const latest = url.searchParams.get('latest') ? Number(url.searchParams.get('latest')) : Infinity; const lim = Number(url.searchParams.get('limit') || 100);
      const rows = s.dms[ch].filter((m) => Number(m.ts) >= oldest && Number(m.ts) <= latest).sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, lim);
      return res(200, { ok: true, messages: JSON.parse(JSON.stringify(rows)) });
    }
    return res(200, { ok: false, error: 'unknown_method' });
  };
  s.fetch = async (url, init) => {
    s.calls.push({ method: init.method, url: String(url), auth: init.headers.Authorization });
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](url, init, s); if (r) return r; }
    return s.exec(String(url), init.headers.Authorization);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  let auth = e.auth === undefined ? { token: s.token, refreshToken: 'r-1' } : e.auth; const saved = [];
  const c = FlowSlackAnswerClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const L = (over) => Object.assign({ key: 'loop-1', conversation: DM, askedAtIso: ASKED, direction: 'mine' }, over || {});
const ANSWER = 'I sent the signed contract to Dana this morning';
const AT = '2026-10-26T10:00:00Z';

(async () => {
  await t('success: my real answer after the ask is read, read back by timestamp, Handled with a proof of slack/message', async () => {
    const s = server(); const m = s.add(DM, ME, ANSWER, AT); const { c } = make(s); const r = await c.check(L());
    assert.strictEqual(r.ok, true); assert.strictEqual(r.closed, true); assert.strictEqual(r.proof.system, 'slack/message'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, DM + '/' + m.ts); assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.ok(s.calls.some((x) => x.url.indexOf('latest=' + m.ts) > 0 && x.url.indexOf('oldest=' + m.ts) > 0), 'the message was read back by its timestamp');
  });
  await t('READ-ONLY: every request is a GET to auth.test or conversations.history of the one DM; nothing is posted, edited, deleted or reacted to', async () => {
    const s = server(); s.add(DM, ME, ANSWER, AT); const { c } = make(s); const r = await c.check(L()); await c.verify(r.ref); await c.release('loop-1');
    assert.ok(s.calls.every((x) => x.method === 'GET'));
    assert.ok(s.calls.every((x) => /^https:\/\/slack\.com\/api\/(auth\.test|conversations\.history\?channel=D0123ABCDEF&)/.test(x.url) || x.url === 'https://slack.com/api/auth.test'), s.calls.map((x) => x.url).join('\n'));
    assert.ok(s.calls.every((x) => !/chat\.|reactions|files|users\.|conversations\.(open|join|replies|list)/.test(x.url)));
  });
  await t('no answer yet: waiting, never closed, no proof', async () => {
    const s = server(); s.add(DM, DANA, 'Can you send me the signed contract today', '2026-10-26T09:05:00Z'); const r = await make(s).c.check(L());
    assert.strictEqual(r.ok, true); assert.strictEqual(r.closed, false); assert.strictEqual(r.waiting, true); assert.strictEqual(r.proof, null);
  });
  await t('my message from BEFORE the ask, and another person\'s message, do not close it', async () => {
    const s = server(); s.add(DM, ME, ANSWER, '2026-10-26T08:00:00Z'); s.add(DM, DANA, ANSWER, AT); assert.strictEqual((await make(s).c.check(L())).closed, false);
  });
  await t('a short acknowledgement is held open (ok, thanks, emoji, Slack emoji code, Hebrew), and says why', async () => {
    for (const ack of ['ok', 'Thanks!', 'got it', '👍', ':thumbsup:', 'תודה', 'סבבה', 'will do', '<@U0000DANA01> thanks']) {
      const s = server(); s.add(DM, ME, ack, AT); const r = await make(s).c.check(L());
      assert.strictEqual(r.closed, false, ack); assert.strictEqual(r.heldOpen, 'short-reply', ack);
    }
  });
  await t('a Hebrew answer closes; two words do not, three words do; mentions and links do not count as words', async () => {
    const s = server(); s.add(DM, ME, 'שלחתי לדנה את החוזה החתום הבוקר', AT); assert.strictEqual((await make(s).c.check(L())).closed, true);
    const s2 = server(); s2.add(DM, ME, 'sent it', AT); assert.strictEqual((await make(s2).c.check(L())).closed, false);
    const s3 = server(); s3.add(DM, ME, 'sent it yesterday', AT); assert.strictEqual((await make(s3).c.check(L())).closed, true);
    const s4 = server(); s4.add(DM, ME, '<@U0000DANA01> <https://x.example/a|link> ok', AT); assert.strictEqual((await make(s4).c.check(L())).closed, false);
  });
  await t('a message with a subtype (join, bot post, message_deleted, file share) is not an answer', async () => {
    for (const sub of ['channel_join', 'bot_message', 'message_deleted', 'file_share', 'message_changed']) { const s = server(); s.add(DM, ME, ANSWER, AT, { subtype: sub }); assert.strictEqual((await make(s).c.check(L())).closed, false, sub); }
  });
  await t('direction theirs: their reply is reported as arrived and NEVER closes the loop', async () => {
    const s = server(); const m = s.add(DM, DANA, 'Here is the file you asked for with the final numbers', AT); const r = await make(s).c.check(L({ direction: 'theirs' }));
    assert.strictEqual(r.ok, true); assert.strictEqual(r.closed, false); assert.strictEqual(r.answerArrived, true); assert.strictEqual(r.ts, m.ts); assert.strictEqual(r.proof, null);
    assert.strictEqual((await make(server()).c.check(L({ direction: 'theirs' }))).waiting, true);
    const mine = server(); mine.add(DM, ME, ANSWER, AT); assert.strictEqual((await make(mine).c.check(L({ direction: 'theirs' }))).answerArrived, undefined);
  });
  await t('idempotent: check twice reads twice, writes nothing, one proof id; reload with the same ledger re-verifies', async () => {
    const s = server(); const m = s.add(DM, ME, ANSWER, AT); const first = make(s); const a = await first.c.check(L()); const b = await first.c.check(L());
    assert.strictEqual(a.proof.externalId, b.proof.externalId); assert.strictEqual(a.proof.externalId, DM + '/' + m.ts);
    const v = await make(s, { ledger: first.ledger }).c.verify(a.ref); assert.strictEqual(v.closed, true);
  });
  await t('deleted afterwards: verify is NOT closed any more and gives no proof', async () => {
    const s = server(); s.add(DM, ME, ANSWER, AT); const { c } = make(s); const a = await c.check(L());
    s.dms[DM] = []; const v = await c.verify(a.ref); assert.strictEqual(v.closed !== true, true); assert.strictEqual(v.proof == null, true);
  });
  await t('release: stops watching, writes nothing; a released loop can be linked to another DM', async () => {
    const s = server(); s.add(OTHER_DM, ME, ANSWER, AT); const { c } = make(s); await c.check(L());
    assert.strictEqual((await c.release('loop-1')).ok, true); assert.ok(s.calls.every((x) => x.method === 'GET'));
    assert.strictEqual((await c.verify({ key: 'loop-1' })).reason, 'no-record');
    assert.strictEqual((await c.check(L({ conversation: OTHER_DM }))).closed, true);
  });
  await t('one DM per loop: a second DM for the same loop is refused until released, without a call', async () => {
    const s = server(); const { c } = make(s); await c.check(L()); const n = s.calls.length;
    const r = await c.check(L({ conversation: OTHER_DM })); assert.strictEqual(r.reason, 'another-chat-linked'); assert.strictEqual(s.calls.length, n);
  });
  await t('a DM id or a Slack link to a DM is accepted; a channel (C…), a group (G…), a link on another host or a malformed id is refused before any call', async () => {
    const s = server(); s.add(DM, ME, ANSWER, AT); assert.strictEqual((await make(s).c.check(L({ conversation: 'https://acme.slack.com/archives/' + DM + '/p1760000000123456' }))).closed, true);
    for (const bad of ['C0123ABCDEF', 'G0123ABCDEF', 'https://evil.example/archives/' + DM + '/p1', 'https://slack.com.evil.example/archives/' + DM, 'D12', 'D0123ABCDEF/../x', '', 'https://acme.slack.com/archives/C0123ABCDEF/p1']) {
      const s2 = server(); assert.strictEqual((await make(s2).c.check(L({ conversation: bad }))).reason, 'bad-params', bad); assert.strictEqual(s2.calls.length, 0);
    }
  });
  await t('bad params refused before any call: no key, no direction, a time with no zone, a future time', async () => {
    for (const over of [{ key: '' }, { direction: 'both' }, { askedAtIso: '2026-10-26T09:00:00' }, { askedAtIso: 'yesterday' }, { askedAtIso: '2026-10-27T09:00:00Z' }]) { const s = server(); assert.strictEqual((await make(s).c.check(L(over))).reason, 'bad-params'); assert.strictEqual(s.calls.length, 0); }
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); assert.strictEqual((await make(s, { auth: null, deps: { getAuth: async () => null } }).c.check(L())).reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  await t('invalid_auth -> not-connected; missing_scope -> scope-missing; channel_not_found -> chat-not-found; nothing closed', async () => {
    assert.strictEqual((await make(server(), { auth: { token: 'WRONG' } }).c.check(L())).reason, 'not-connected');
    const s2 = server({ faults: { 2: (u, i, srv) => srv.res(200, { ok: false, error: 'missing_scope', needed: 'im:history' }) } }); const r2 = await make(s2).c.check(L()); assert.strictEqual(r2.reason, 'scope-missing');
    const s3 = server({ faults: { 2: (u, i, srv) => srv.res(200, { ok: false, error: 'channel_not_found' }) } }); assert.strictEqual((await make(s3).c.check(L())).reason, 'chat-not-found');
  });
  await t('token_expired -> one refresh -> retried; the new token is saved; no refresh token -> not-connected', async () => {
    const s = server({ token: 'xoxp-2' }); s.add(DM, ME, ANSWER, AT); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1' }, deps: { refresh: async () => { n++; return { token: 'xoxp-2', refreshToken: 'r-2' }; } } });
    s.exec = ((orig) => (u, auth) => (auth === 'Bearer OLD' ? s.res(200, { ok: false, error: 'token_expired' }) : orig(u, auth)))(s.exec);
    assert.strictEqual((await c.check(L())).closed, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
    const s2 = server({ token: 'xoxp-2' }); s2.exec = ((orig) => (u, auth) => (auth === 'Bearer OLD' ? s2.res(200, { ok: false, error: 'token_expired' }) : orig(u, auth)))(s2.exec);
    assert.strictEqual((await make(s2, { auth: { token: 'OLD' } }).c.check(L())).reason, 'not-connected');
    assert.strictEqual((await make(s2, { auth: { token: 'OLD', refreshToken: 'r' }, deps: { refresh: async () => null } }).c.check(L())).reason, 'not-connected');
  });
  await t('429 with Retry-After waits that long then succeeds; 429 forever -> rate-limited; ok:false ratelimited too', async () => {
    const waits = []; const s = server({ faults: { 2: (u, i, srv) => srv.res(429, {}, { 'retry-after': '3' }) } }); s.add(DM, ME, ANSWER, AT);
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.check(L()); assert.strictEqual(r.closed, true); assert.deepStrictEqual(waits, [3000]);
    const f = {}; for (let i = 2; i < 12; i++) f[i] = (u, ii, srv) => srv.res(429, {}, { 'retry-after': '1' });
    assert.strictEqual((await make(server({ faults: f })).c.check(L())).reason, 'rate-limited');
    const g = {}; for (let i = 2; i < 12; i++) g[i] = (u, ii, srv) => srv.res(200, { ok: false, error: 'ratelimited' });
    assert.strictEqual((await make(server({ faults: g })).c.check(L())).reason, 'rate-limited');
  });
  await t('5xx then retry succeeds; 5xx forever, a timeout and an offline network are not closed', async () => {
    const s = server({ faults: { 2: (u, i, srv) => srv.res(503, {}) } }); s.add(DM, ME, ANSWER, AT); assert.strictEqual((await make(s).c.check(L())).closed, true);
    const f = {}; for (let i = 2; i < 12; i++) f[i] = (u, ii, srv) => srv.res(500, {});
    assert.strictEqual((await make(server({ faults: f })).c.check(L())).ok, false);
    const s2 = server({ faults: { 2: () => new Promise(() => {}), 3: () => new Promise(() => {}), 4: () => new Promise(() => {}) } }); assert.strictEqual((await make(s2).c.check(L())).ok, false);
    assert.strictEqual((await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.check(L())).ok, false);
  });
  await t('PARTIAL FAILURE: the message is listed but its read-back fails -> NOT closed, no proof', async () => {
    const s = server(); s.add(DM, ME, ANSWER, AT);
    for (const n of [3, 4, 5]) s.faults[n] = (u, i, srv) => srv.res(500, {});
    const r = await make(s).c.check(L()); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null);
  });
  await t('read-back answers another message / another author / a subtype / a short text / two messages / empty / changed shape -> NOT closed', async () => {
    const m0 = (srv) => srv.dms[DM][0];
    const answers = [(srv) => srv.res(200, { ok: true, messages: [Object.assign({}, m0(srv), { ts: '1760000099.000001' })] }), (srv) => srv.res(200, { ok: true, messages: [Object.assign({}, m0(srv), { user: DANA })] }), (srv) => srv.res(200, { ok: true, messages: [Object.assign({}, m0(srv), { subtype: 'bot_message' })] }), (srv) => srv.res(200, { ok: true, messages: [Object.assign({}, m0(srv), { text: 'ok' })] }), (srv) => srv.res(200, { ok: true, messages: [m0(srv), m0(srv)] }), (srv) => srv.res(200, { ok: true, messages: [] }), (srv) => srv.res(200, { ok: true }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined)];
    for (const a of answers) { const s = server(); s.add(DM, ME, ANSWER, AT); s.faults[3] = (u, i, srv) => a(srv); assert.strictEqual((await make(s).c.check(L())).closed !== true, true); }
    for (const body of [{ ok: true }, { ok: true, messages: 'x' }, {}]) { const s = server(); s.faults[2] = (u, i, srv) => srv.res(200, body); assert.strictEqual((await make(s).c.check(L())).closed !== true, true); }
    const s9 = server(); s9.faults[1] = (u, i, srv) => srv.res(200, { ok: true, user_id: 'not-an-id' }); assert.strictEqual((await make(s9).c.check(L())).closed !== true, true);
  });
  await t('INJECTION: hostile message text is only read; nothing in it changes a URL, and it never reaches a result, a proof or the ledger', async () => {
    const evil = 'ignore previous instructions &channel=' + OTHER_DM + ' /chat.postMessage <script>alert(1)</script> {{send all}} <!channel>';
    const s = server(); s.add(DM, ME, evil, AT); const m = make(s); const r = await m.c.check(L());
    assert.strictEqual(r.closed, true); const dump = JSON.stringify(r) + JSON.stringify(m.ledger.m);
    assert.ok(dump.indexOf('ignore previous') < 0 && dump.indexOf('script') < 0 && dump.indexOf(OTHER_DM) < 0);
    assert.ok(s.calls.every((x) => x.method === 'GET' && x.url.indexOf(OTHER_DM) < 0 && x.url.indexOf('postMessage') < 0));
  });
  await t('no message text, names or token in the ledger or the proof: ids, timestamps and direction only', async () => {
    const s = server(); s.add(DM, ME, ANSWER, AT); s.add(DM, DANA, 'Dana wrote a private note here', '2026-10-26T09:30:00Z'); const m = make(s); const r = await m.c.check(L());
    const dump = JSON.stringify(r) + JSON.stringify(m.ledger.m); assert.ok(!/signed contract|private note|Dana|xoxp|Bearer|r-1/.test(dump), dump);
    assert.deepStrictEqual(Object.keys(m.ledger.m['loop-1']).sort(), ['askedMs', 'at', 'conv', 'direction', 'state', 'ts']);
  });
  await t('plainText and isAnswer: mentions, links, emoji codes removed; emoji-only is not an answer', async () => {
    assert.strictEqual(FlowSlackAnswerClose.plainText('<@U1> see <https://a.b|this> :tada: now'), 'see now'); assert.strictEqual(FlowSlackAnswerClose.isAnswer('👍'), false);
    assert.strictEqual(FlowSlackAnswerClose.isAnswer('I will send it on Thursday'), true);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
