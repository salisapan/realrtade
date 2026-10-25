// Contract tests for core/zoom-close.js against a mock of the Zoom API. No network, no real account, no real key.
const assert = require('assert');
const { FlowZoomClose } = require('../core/zoom-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

const T0 = Date.parse('2026-10-26T08:00:00Z');
const START = '2026-10-27T13:00:00+03:00'; // 10:00 UTC
function server(opts) {
  const o = opts || {};
  const s = { meetings: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: T0, faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.exec = (req) => {
    const m = req.path.match(/^\/meetings\/(\d+)/);
    if (req.path === '/users/me/meetings' && req.method === 'POST') {
      const id = String(81000000000 + (++s.seq)); s.clock += 1000;
      s.meetings[id] = { id: Number(id), topic: req.body.topic, type: 2, start_time: req.body.start_time, duration: req.body.duration, timezone: req.body.timezone, created_at: new Date(s.clock).toISOString(), join_url: 'https://us02web.zoom.us/j/' + id + '?pwd=SECRETPWD', start_url: 'https://us02web.zoom.us/s/' + id + '?zak=HOSTTOKEN', password: 'SECRETPWD', settings: req.body.settings };
      return res(201, s.meetings[id]);
    }
    if (m && req.method === 'GET') { const x = s.meetings[m[1]]; return x ? res(200, x) : res(404, { code: 3001, message: 'Meeting does not exist' }); }
    if (m && req.method === 'DELETE') { if (!s.meetings[m[1]]) return res(404, { code: 3001 }); delete s.meetings[m[1]]; return res(204, undefined); }
    if (req.path.indexOf('/users/me/meetings?') === 0 && req.method === 'GET') return res(200, { meetings: Object.values(s.meetings).map((x) => ({ id: x.id, topic: x.topic, start_time: x.start_time, created_at: x.created_at, join_url: x.join_url })) });
    return res(400, { code: 300, message: 'unrouted' });
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: url.replace('https://api.zoom.us/v2', ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { code: 124, message: 'Invalid access token.' });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  let auth = e.auth === undefined ? { token: s.token, refreshToken: 'r-1' } : e.auth; const saved = [];
  const c = FlowZoomClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const P = { key: 'loop-1', topic: 'Call with Dana about the renewal', startIso: START, durationMin: 45 };
const posts = (s) => s.calls.filter((x) => x.method === 'POST').length;
const count = (s) => Object.keys(s.meetings).length;
const ID1 = '81000000001';
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system zoom/meeting and the JOIN link', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'zoom/meeting'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, ID1); assert.ok(/^https:\/\/us02web\.zoom\.us\/j\//.test(r.proof.url));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path.replace(/\d{11}/, 'ID')), ['POST /users/me/meetings', 'GET /meetings/ID']);
    assert.ok(FlowProofOfClose.isProof(r.proof));
  });
  await t('the request creates a scheduled meeting in UTC with no invitees: nobody is contacted, waiting room on, host first', async () => {
    const s = server(); await make(s).c.write(P); const b = s.calls[0].body;
    assert.deepStrictEqual(Object.keys(b).sort(), ['duration', 'settings', 'start_time', 'timezone', 'topic', 'type']);
    assert.strictEqual(b.type, 2); assert.strictEqual(b.start_time, '2026-10-27T10:00:00Z'); assert.strictEqual(b.timezone, 'UTC'); assert.strictEqual(b.duration, 45);
    assert.deepStrictEqual(Object.keys(b.settings).sort(), ['host_video', 'join_before_host', 'participant_video', 'waiting_room']);
    assert.strictEqual(b.settings.join_before_host, false); assert.strictEqual(b.settings.waiting_room, true);
    assert.ok(!('meeting_invitees' in b.settings) && !('registrants_email_notification' in b.settings) && !('agenda' in b));
  });
  await t('only the meeting endpoints used for a close: no users list beyond me, no recordings, no chat, no contacts', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/(users\/me\/meetings(\?type=upcoming&page_size=100)?|meetings\/\d+(\?schedule_for_reminder=false)?)$/.test(x.path)), s.calls.map((x) => x.path).join());
  });
  await t('the host start link and the passcode never reach the result, the proof or the ledger', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P);
    const dump = JSON.stringify(r) + JSON.stringify(m.ledger.m);
    assert.ok(dump.indexOf('HOSTTOKEN') < 0 && dump.indexOf('zak=') < 0 && dump.indexOf('/s/') < 0, 'start_url');
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0, 'token');
  });
  await t('default length is 30 minutes; a length outside 15..480 or not a whole number is refused before any call', async () => {
    const s = server(); await make(s).c.write({ key: 'k', topic: 'x', startIso: START }); assert.strictEqual(s.calls[0].body.duration, 30);
    for (const bad of [14, 481, 30.5, 'abc', -5]) { const s2 = server(); assert.strictEqual((await make(s2).c.write(Object.assign({}, P, { durationMin: bad }))).reason, 'bad-params'); assert.strictEqual(s2.calls.length, 0); }
  });
  await t('a start with no zone, a malformed start, or a start in the past is refused before any call (never guessed)', async () => {
    for (const [bad, why] of [['2026-10-27T13:00:00', 'bad-params'], ['next tuesday', 'bad-params'], ['2026-13-40T10:00:00Z', 'bad-params'], ['2026-10-20T10:00:00Z', 'start-in-past'], [undefined, 'bad-params']]) {
      const s = server(); const r = await make(s).c.write(Object.assign({}, P, { startIso: bad })); assert.strictEqual(r.reason, why, String(bad)); assert.strictEqual(s.calls.length, 0);
    }
  });
  await t('idempotent: second click and retry never create a second meeting', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('deleted by someone else: verify is NOT Handled and gives no proof', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    delete s.meetings[ID1]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('rescheduled or renamed by the person: verify is NOT Handled (it is no longer the meeting Glance made)', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.meetings[ID1].start_time = '2026-10-28T10:00:00Z'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.meetings[ID1].start_time = '2026-10-27T10:00:00Z'; s.meetings[ID1].topic = 'Something else'; assert.strictEqual((await c.verify(a.ref)).ok, false);
  });
  await t('Undo deletes and reads back a 404; twice is fine; a new approve afterwards makes a fresh meeting', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
    assert.ok(s.calls.some((x) => x.method === 'DELETE' && x.path.indexOf('schedule_for_reminder=false') > 0));
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, '81000000002');
  });
  await t('Undo REFUSES a meeting the person edited (topic or start) and deletes nothing', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.meetings[ID1].topic = 'Dana + Avi: renewal and pricing'; const u = await c.undo(a.ref);
    assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(count(s), 1); assert.ok(!s.calls.some((x) => x.method === 'DELETE'));
    s.meetings[ID1].topic = P.topic; s.meetings[ID1].start_time = '2026-10-29T10:00:00Z'; assert.strictEqual((await c.undo(a.ref)).reason, 'edited-by-person');
  });
  await t('Undo whose read-back still finds the meeting is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 2] = (req, srv) => srv.res(204, undefined); // the DELETE answers 204, deletes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of a meeting that is already gone is ok without claiming a read-back; with no ledger record it refuses', async () => {
    const s = server(); const { c, ledger } = make(s); const a = await c.write(P); delete s.meetings[ID1];
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    assert.strictEqual((await make(server()).c.undo({ meetingId: '81000000009', key: 'nobody' })).reason, 'no-record');
  });
  await t('Undo rejects an id that is not digits (no path injection) and a ref with no key', async () => {
    const s = server(); const { c } = make(s);
    assert.strictEqual((await c.undo({ meetingId: '123/../users/me', key: 'k' })).ok, false); assert.strictEqual((await c.undo({ meetingId: ID1 })).ok, false); assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried; new token saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1' }, deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 and refresh fails / no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: { token: 'OLD', refreshToken: 'r' }, deps: { refresh: async () => null } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: 'OLD' } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(count(s), 0);
  });
  await t('403 (missing scope) -> scope-missing, one POST, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { code: 4711, message: 'no scope' }) } });
    const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(posts(s), 1);
  });
  await t('400 (Zoom rejects the request) -> bad-params, one POST', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(400, { code: 300, message: 'Invalid field' }) } }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'bad-params'); assert.strictEqual(posts(s), 1);
  });
  await t('429 with Retry-After: waits that long, then one meeting', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID create: the retry adopts it, one meeting', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('5xx that did NOT create: retried, one meeting', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (meeting created): looked up, adopted, one meeting', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('adoption never takes an older meeting with the same topic and time (created before this attempt)', async () => {
    const s = server(); s.meetings['81000000777'] = { id: 81000000777, topic: P.topic, start_time: '2026-10-27T10:00:00Z', created_at: '2026-10-01T00:00:00Z', join_url: 'https://us02web.zoom.us/j/81000000777' };
    s.faults[1] = (req, srv) => srv.res(503, {}); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.notStrictEqual(r.proof.externalId, '81000000777'); assert.strictEqual(count(s), 2);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const r = await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P); assert.strictEqual(r.ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back answers another meeting / empty / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { id: 777777777, topic: P.topic, start_time: '2026-10-27T10:00:00Z', join_url: 'https://us02web.zoom.us/j/777777777' }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, [])]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back with a different topic / start / no join link / a join link on another host -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const x = JSON.parse(JSON.stringify(srv.meetings[ID1])); fn(x); return srv.res(200, x); };
    for (const f of [(x) => { x.topic = 'changed'; }, (x) => { x.start_time = '2026-10-27T15:00:00Z'; }, (x) => { delete x.join_url; }, (x) => { x.join_url = 'https://evil.example/j/81000000001'; }, (x) => { x.join_url = 'https://zoom.us.evil.example/j/81000000001'; }, (x) => { x.join_url = 'http://us02web.zoom.us/j/81000000001'; }]) {
      const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false);
    }
  });
  await t('POST answers 201 with an empty or id-less body: looked up, adopted, one meeting', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(201, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('INJECTION: a hostile topic stays one string; the endpoint, the type and the field names do not move', async () => {
    const evil = 'x","type":1,"settings":{"meeting_invitees":[{"email":"a@b.c"}]},"agenda":"hi"} ../../users/me <script>alert(1)</script>\n[[l]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', topic: evil, startIso: START }); assert.strictEqual(r.ok, true);
    const post = s.calls[0].body; assert.deepStrictEqual(Object.keys(post).sort(), ['duration', 'settings', 'start_time', 'timezone', 'topic', 'type']);
    assert.strictEqual(post.type, 2); assert.ok(!('meeting_invitees' in post.settings));
    assert.ok(s.calls.every((x) => /^\/(users\/me\/meetings|meetings\/\d+)$/.test(x.path)), 'no request path moved');
  });
  await t('topic clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowZoomClose.clipTopic('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowZoomClose.clipTopic('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', topic: '  ', startIso: START })).reason, 'bad-params');
  });
  await t('the loop key is never sent to Zoom', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { key: 'secret-loop-key-123' })); assert.ok(JSON.stringify(s.calls).indexOf('secret-loop-key-123') < 0);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
