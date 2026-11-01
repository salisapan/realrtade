// Slack (official Web API): the close is "the person's own answer is in the direct message they were asked in", and reading that message
// back is the proof. docs/glance-ai/connectors/slack.md. Portable: no chrome.*, no DOM; the network, the token store, the ledger and the
// clock are injected (src/background.js passes real ones, test/slack-answer-close-corpus.cjs a mock of Slack).
//
// THIS CONNECTOR IS READ-ONLY. It never posts, edits, deletes or reacts to a Slack message: an answer is the person's own words in their own
// voice, and Glance never sends on the person's behalf. Every request is a GET of conversations.history or auth.test (asserted in the tests).
// It reads direct messages only (a conversation id that starts with D), with the user scopes im:history and im:read: never a channel.
// Contract:
//   check(link)   link = { key, conversation (an id or a Slack message link), askedAtIso, direction }. direction "mine": someone asked the person
//                 something in that DM; the loop closes (ok:true, closed:true + proof) ONLY when a message FROM THE PERSON exists in that DM,
//                 sent after the ask, a plain message (not a join, a deletion notice or a bot post), that is a real answer (not an "ok", "thanks"
//                 or a thumbs-up: a short acknowledgement is held open, docs/reply-model.md), AND a second read of that exact message by its
//                 timestamp returns the same message from the same person. direction "theirs": the person asked someone else; a message from the
//                 other side after the ask is reported (answerArrived:true) and NEVER closes the loop.
//   one DM        a loop key is bound to the first DM linked to it; another is refused until the person releases the first.
//   verify(ref)   the same read on a fresh instance (after a reload). A cached "closed" is never trusted without the read.
//   release(key)  the person's deliberate release. Nothing in Slack changes (Glance wrote nothing).
// No message text is returned, stored in the ledger, or put in a proof: only ids, timestamps and the direction. Every id is checked against
// a strict shape before it enters a URL.
const FlowSlackAnswerClose = (() => {
  const API = 'https://slack.com/api';
  const SYSTEM = 'slack/message';
  const MAX_ATTEMPTS = 3;
  const PAGE = 50;
  const MIN_WORDS = 3;
  const FUTURE_SLACK_MS = 5 * 60 * 1000;

  function convOk(c) { return typeof c === 'string' && /^D[A-Z0-9]{8,14}$/.test(c); }
  function tsOk(t) { return typeof t === 'string' && /^\d{10}\.\d{6}$/.test(t); }
  function userOk(u) { return typeof u === 'string' && /^[UW][A-Z0-9]{6,14}$/.test(u); }
  function isoMs(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  }
  function tsMs(t) { return tsOk(t) ? Math.floor(Number(t) * 1000) : NaN; }
  function tsFromMs(ms) { return (Math.floor(ms / 1000)).toString() + '.' + String((ms % 1000) * 1000).padStart(6, '0'); }

  // A direct-message id, or a Slack link to a message in one (https://<workspace>.slack.com/archives/D…/p<digits>).
  function parseConversation(input) {
    const t = String(input == null ? '' : input).trim();
    if (convOk(t)) return t;
    let u = null;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.slack\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/archives\/(D[A-Z0-9]{8,14})(?:\/|$)/);
    return m ? m[1] : null;
  }

  // The words of a message with Slack markup removed (mentions, links, emoji codes). The text never leaves this file.
  function plainText(text) {
    const raw = typeof text === 'string' ? text : '';
    return raw.replace(/<[^>]*>/g, ' ').replace(/:[a-z0-9_+-]+:/gi, ' ').replace(/&(?:amp|lt|gt);/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  }
  const ACK = /^(?:ok(?:ay)?|k|thanks?|thank you|thx|ty|got it|noted|sure|yes|yep|yup|no|nope|great|cool|done|will do|sounds good|👍|🙏|✅|אוקיי?|סבבה|תודה(?: רבה)?|קיבלתי|בסדר|אחלה|כן|לא|יופי|מעולה|עשיתי|טופל)[\s.!,:)👍🙏✅]*$/i;
  function isAnswer(text) {
    const t = plainText(text);
    if (!t) return false;
    if (ACK.test(t)) return false;
    return t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= MIN_WORDS;
  }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    // One authorised GET. Handles the timeout, one token refresh when the token expired, the wait a rate limit asks for, and a 5xx retry.
    async function get(path, state) {
      let last = { error: 'network' };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
          res = await Promise.race([
            d.fetch(API + path, { method: 'GET', headers: { Authorization: 'Bearer ' + state.auth.token, Accept: 'application/json' } }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { last = { error: 'network' }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        if (res.status === 429) {
          const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          last = { error: 'rate-limited' };
          if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue;
        }
        if (res.status >= 500) { last = { error: 'http-' + res.status }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (!res.ok && !body) return { error: 'http-' + res.status };
        if (!body || typeof body !== 'object') return { error: 'verify_failed' };
        if (body.ok === true) return { json: body };
        const err = String(body.error || '');
        if (err === 'token_expired' && state.auth.refreshToken && typeof d.refresh === 'function' && !state.refreshed) {
          state.refreshed = true;
          let fresh = null;
          try { fresh = await d.refresh(state.auth); } catch (e) { fresh = null; }
          if (!fresh || !fresh.token) return { error: 'not-connected' };
          state.auth = Object.assign({}, state.auth, fresh);
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* this session still has it */ } }
          attempt--; continue;
        }
        if (/^(invalid_auth|not_authed|token_revoked|token_expired|account_inactive|no_permission)$/.test(err)) return { error: 'not-connected' };
        if (/^(missing_scope|not_allowed_token_type|access_denied)$/.test(err)) return { error: 'scope-missing' };
        if (/^(channel_not_found|not_in_channel)$/.test(err)) return { notFound: true };
        if (err === 'ratelimited') { last = { error: 'rate-limited' }; if (attempt < MAX_ATTEMPTS) await sleep(1000); continue; }
        return { error: 'slack-' + err.replace(/[^a-z_]/g, '').slice(0, 40) };
      }
      return last;
    }

    function usable(m, askedMs) {
      if (!m || typeof m !== 'object' || !tsOk(String(m.ts)) || !userOk(String(m.user || ''))) return false;
      if (m.subtype) return false; // joins, deletions, bot posts, edits-as-events: not a plain message
      return tsMs(m.ts) >= askedMs;
    }

    function proofFor(conv, ts) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: conv + '/' + ts, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // The read-back: that exact message, by timestamp, in the same DM, from the person, after the ask, still a real answer.
    async function readBack(state, conv, ts, me, askedMs) {
      const r = await get('/conversations.history?channel=' + encodeURIComponent(conv) + '&latest=' + encodeURIComponent(ts) + '&oldest=' + encodeURIComponent(ts) + '&inclusive=true&limit=1', state);
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.error || r.notFound) return { ok: false, reason: 'verify_failed' };
      const rows = Array.isArray(r.json.messages) ? r.json.messages : null;
      const m = rows && rows.length === 1 ? rows[0] : null;
      if (!m || String(m.ts) !== ts || !usable(m, askedMs) || m.user !== me || !isAnswer(m.text)) return { ok: false, reason: 'verify_failed' };
      return { ok: true };
    }

    async function evaluate(state, key, conv, askedMs, direction) {
      const who = await get('/auth.test', state);
      if (who.error) return { ok: false, reason: who.error === 'verify_failed' ? 'verify_failed' : who.error };
      const me = String(who.json.user_id || '');
      if (!userOk(me)) return { ok: false, reason: 'verify_failed' };
      const r = await get('/conversations.history?channel=' + encodeURIComponent(conv) + '&oldest=' + encodeURIComponent(tsFromMs(askedMs)) + '&inclusive=true&limit=' + PAGE, state);
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.notFound) return { ok: false, reason: 'chat-not-found' };
      if (r.error) return { ok: false, reason: r.error === 'rate-limited' ? 'rate-limited' : 'verify_failed' };
      const rows = Array.isArray(r.json.messages) ? r.json.messages : null;
      if (!rows) return { ok: false, reason: 'verify_failed' };
      const after = rows.filter((m) => usable(m, askedMs));
      const first = (list) => list.reduce((a, b) => (tsMs(a.ts) <= tsMs(b.ts) ? a : b));
      if (direction === 'theirs') {
        const theirs = after.filter((m) => m.user !== me);
        if (!theirs.length) return { ok: true, closed: false, waiting: true, proof: null };
        const pick = first(theirs);
        await ledger.set(key, { state: 'answer-arrived', conv: conv, askedMs: askedMs, direction: 'theirs', ts: pick.ts, at: now() });
        return { ok: true, closed: false, answerArrived: true, ts: pick.ts, proof: null };
      }
      const mine = after.filter((m) => m.user === me && isAnswer(m.text));
      if (!mine.length) {
        const shortOnly = after.some((m) => m.user === me);
        await ledger.set(key, { state: 'waiting', conv: conv, askedMs: askedMs, direction: 'mine', at: now() });
        return { ok: true, closed: false, waiting: true, heldOpen: shortOnly ? 'short-reply' : undefined, proof: null };
      }
      const ts = first(mine).ts;
      const rb = await readBack(state, conv, ts, me, askedMs);
      if (!rb.ok) {
        if (rb.reason === 'not-connected' || rb.reason === 'scope-missing') return { ok: false, reason: rb.reason };
        await ledger.set(key, { state: 'seen-unverified', conv: conv, askedMs: askedMs, direction: 'mine', ts: ts, at: now() });
        return { ok: false, reason: 'verify_failed', proof: null };
      }
      const proof = proofFor(conv, ts);
      if (!proof) return { ok: false, reason: 'proof_pending', proof: null };
      await ledger.set(key, { state: 'closed', conv: conv, askedMs: askedMs, direction: 'mine', ts: ts, at: now() });
      return { ok: true, closed: true, where: 'Slack', ref: { key: key, conv: conv, ts: ts, externalId: conv + '/' + ts }, proof: proof };
    }

    async function withAuth() {
      const auth = await d.getAuth();
      return auth && auth.token ? { auth: auth } : null;
    }

    // link: { key, conversation (a DM id or a Slack link), askedAtIso, direction: "mine" | "theirs" }
    async function check(link) {
      const l = link || {};
      const key = String(l.key || '');
      const conv = parseConversation(l.conversation);
      const askedMs = isoMs(l.askedAtIso);
      const direction = l.direction === 'theirs' ? 'theirs' : l.direction === 'mine' ? 'mine' : '';
      if (!key || !conv || askedMs === null || !direction) return { ok: false, reason: 'bad-params' };
      if (askedMs > now() + FUTURE_SLACK_MS) return { ok: false, reason: 'bad-params' };
      const state = await withAuth();
      if (!state) return { ok: false, reason: 'not-connected' };
      const prior = await ledger.get(key);
      if (prior && prior.state !== 'released' && ((prior.conv && prior.conv !== conv) || (prior.direction && prior.direction !== direction))) return { ok: false, reason: 'another-chat-linked' };
      return evaluate(state, key, conv, askedMs, direction);
    }

    async function verify(ref) {
      const key = ref && String(ref.key || '');
      if (!key) return { ok: false, reason: 'bad-params' };
      const rec = await ledger.get(key);
      if (!rec || !rec.conv || rec.state === 'released') return { ok: false, reason: 'no-record' };
      const state = await withAuth();
      if (!state) return { ok: false, reason: 'not-connected' };
      return evaluate(state, key, rec.conv, rec.askedMs, rec.direction);
    }

    async function release(key) {
      const k = String(key || '');
      if (!k) return { ok: false, reason: 'bad-params' };
      const rec = await ledger.get(k);
      if (!rec) return { ok: true, nothingWatched: true };
      await ledger.set(k, { state: 'released', at: now() });
      return { ok: true };
    }

    return { check: check, verify: verify, release: release };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, parseConversation: parseConversation, isAnswer: isAnswer, plainText: plainText };
})();

if (typeof module !== 'undefined') module.exports = { FlowSlackAnswerClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowSlackAnswerClose = FlowSlackAnswerClose;
