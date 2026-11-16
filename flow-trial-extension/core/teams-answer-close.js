// Microsoft Teams (Graph): the close is "the person's own answer is in the chat they were asked in", and reading that message
// back is the proof. docs/glance-ai/connectors/teams.md. Portable: no chrome.*, no DOM; the Graph call, the ledger and the clock are
// injected (src/background.js passes the Outlook connection's own Graph caller, test/teams-answer-close-corpus.cjs a mock of Graph).
//
// THIS CONNECTOR IS READ-ONLY. It never posts, edits, deletes or reacts to a message: an answer is the person's own words in their own
// voice, and Glance never sends on the person's behalf. Every request this file makes is a GET (asserted in the tests). It needs only
// the delegated scope the Connect screen's Teams box already asks, Chat.Read: no new scope, no secret, no relay.
// Contract:
//   check(link)   link = { key, chatId, askedAtIso, direction }. direction "mine": someone asked the person something in that chat;
//                 the loop closes (ok:true, closed:true + proof) ONLY when a message FROM THE PERSON exists in that chat, created after
//                 the ask, not deleted, that is a real answer (not an "ok", "thanks" or a thumbs-up: a short acknowledgement is held
//                 open, docs/reply-model.md), AND a second GET of that message by id returns the same message in the same chat.
//                 direction "theirs": the person asked someone else; a message from the other side after the ask is reported
//                 (answerArrived:true) and NEVER closes the loop: a reply arriving is not the request being done, the person decides.
//   one chat      a loop key is bound to the first chat linked to it; another chat for the same loop is refused until the person
//                 releases the first.
//   verify(ref)   the same read on a fresh instance (after a reload). A cached "closed" is never trusted without the read.
//   release(key)  the person's deliberate release: the loop is no longer watched. Nothing in Teams changes (Glance wrote nothing).
// No message text is returned, stored in the ledger, or put in a proof: only ids, times and the direction.
// Every id is checked against a strict shape before it enters a URL.
const FlowTeamsAnswerClose = (() => {
  const SYSTEM = 'teams/chat-message';
  const MAX_ATTEMPTS = 3;
  const PAGE = 50;
  const MIN_WORDS = 3;
  const FUTURE_SLACK_MS = 5 * 60 * 1000;

  function chatIdOk(c) { return typeof c === 'string' && /^19:[A-Za-z0-9._@-]{3,200}$/.test(c); }
  function msgIdOk(m) { return typeof m === 'string' && /^\d{10,20}$/.test(m); }
  function userIdOk(u) { return typeof u === 'string' && /^[0-9a-fA-F-]{8,64}$/.test(u); }
  function isoMs(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  }

  // A Teams chat link (https://teams.microsoft.com/l/chat/<chat id>/0 or teams.live.com), or a bare chat id. The id may be percent-encoded.
  function parseChatId(input) {
    const t = String(input == null ? '' : input).trim();
    if (chatIdOk(t)) return t;
    let u = null;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !/^(teams\.microsoft\.com|teams\.live\.com)$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/l\/chat\/([^/]+)/);
    if (!m) return null;
    let id = '';
    try { id = decodeURIComponent(m[1]); } catch (e) { return null; }
    return chatIdOk(id) ? id : null;
  }

  // The words of a message with markup, entities and emoji tags removed. The text never leaves this function.
  function plainText(body) {
    const raw = body && typeof body.content === 'string' ? body.content : '';
    return raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  const ACK = /^(?:ok(?:ay)?|k|thanks?|thank you|thx|ty|got it|noted|sure|yes|yep|yup|no|nope|great|cool|done|will do|sounds good|👍|🙏|✅|אוקיי?|סבבה|תודה(?: רבה)?|קיבלתי|בסדר|אחלה|כן|לא|יופי|מעולה|עשיתי|טופל)[\s.!,:)👍🙏✅]*$/i;
  // A real answer: at least a few words, and not only an acknowledgement. A short reply is held open (docs/reply-model.md).
  function isAnswer(body) {
    const t = plainText(body);
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

    // One GET. Handles the timeout and the wait a rate limit asks for; a 5xx is retried a couple of times (a read is safe to repeat).
    async function get(path) {
      let last = { error: 'network' };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
          res = await Promise.race([
            d.graph('GET', path),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { last = { error: 'network' }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        if (!res || typeof res.status !== 'number') { last = { error: 'network' }; continue; }
        if (res.status === 401 || (res.status === 0 && res.notConnected)) return { error: 'not-connected' };
        if (res.status === 403) return { error: 'scope-missing' };
        if (res.status === 404) return { notFound: true };
        if (res.status === 429) {
          const h = res.headers && typeof res.headers.get === 'function' ? Number(res.headers.get('retry-after')) : NaN;
          last = { error: 'rate-limited' };
          if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(h) && h > 0 ? Math.min(h, 10) * 1000 : 1000);
          continue;
        }
        if (res.status >= 500) { last = { error: 'http-' + res.status }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        if (!res.ok) return { error: 'http-' + res.status };
        return { json: res.json };
      }
      return last;
    }

    async function whoAmI() {
      const r = await get('/me?$select=id');
      if (r.error || r.notFound) return { error: r.error || 'not-connected' };
      const id = r.json && r.json.id;
      return userIdOk(String(id || '')) ? { id: String(id).toLowerCase() } : { error: 'verify_failed' };
    }

    function fromId(m) { const u = m && m.from && m.from.user && m.from.user.id; return typeof u === 'string' ? u.toLowerCase() : ''; }
    function usable(m, askedMs) {
      if (!m || typeof m !== 'object' || !msgIdOk(String(m.id))) return false;
      if (m.messageType !== 'message' || m.deletedDateTime) return false;
      const at = Date.parse(m.createdDateTime);
      return Number.isFinite(at) && at >= askedMs;
    }

    function proofFor(messageId) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: messageId, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // The read-back: the same message, by id, in the same chat, from the person, after the ask, not deleted, still a real answer.
    async function readBack(chatId, messageId, meId, askedMs) {
      const r = await get('/me/chats/' + encodeURIComponent(chatId) + '/messages/' + encodeURIComponent(messageId));
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.error || r.notFound) return { ok: false, reason: 'verify_failed' };
      const m = r.json;
      if (!m || String(m.id) !== String(messageId) || !usable(m, askedMs) || fromId(m) !== meId) return { ok: false, reason: 'verify_failed' };
      if (typeof m.chatId === 'string' && m.chatId !== chatId) return { ok: false, reason: 'verify_failed' };
      if (!isAnswer(m.body)) return { ok: false, reason: 'verify_failed' };
      return { ok: true };
    }

    async function evaluate(key, chatId, askedMs, direction) {
      const me = await whoAmI();
      if (me.error) return { ok: false, reason: me.error === 'verify_failed' ? 'verify_failed' : me.error };
      const r = await get('/me/chats/' + encodeURIComponent(chatId) + '/messages?$top=' + PAGE + '&$orderby=createdDateTime%20desc');
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.notFound) return { ok: false, reason: 'chat-not-found' };
      if (r.error) return { ok: false, reason: r.error === 'rate-limited' ? 'rate-limited' : 'verify_failed' };
      const rows = r.json && Array.isArray(r.json.value) ? r.json.value : null;
      if (!rows) return { ok: false, reason: 'verify_failed' };
      const after = rows.filter((m) => usable(m, askedMs));
      if (direction === 'theirs') {
        const theirs = after.filter((m) => fromId(m) && fromId(m) !== me.id);
        if (!theirs.length) return { ok: true, closed: false, waiting: true, proof: null };
        const first = theirs.reduce((a, b) => (Date.parse(a.createdDateTime) <= Date.parse(b.createdDateTime) ? a : b));
        await ledger.set(key, { state: 'answer-arrived', chatId: chatId, askedMs: askedMs, direction: 'theirs', messageId: String(first.id), at: now() });
        return { ok: true, closed: false, answerArrived: true, messageId: String(first.id), proof: null };
      }
      const mine = after.filter((m) => fromId(m) === me.id && isAnswer(m.body));
      if (!mine.length) {
        const shortOnly = after.some((m) => fromId(m) === me.id);
        await ledger.set(key, { state: 'waiting', chatId: chatId, askedMs: askedMs, direction: 'mine', at: now() });
        return { ok: true, closed: false, waiting: true, heldOpen: shortOnly ? 'short-reply' : undefined, proof: null };
      }
      const pick = mine.reduce((a, b) => (Date.parse(a.createdDateTime) <= Date.parse(b.createdDateTime) ? a : b));
      const messageId = String(pick.id);
      const rb = await readBack(chatId, messageId, me.id, askedMs);
      if (!rb.ok) {
        if (rb.reason === 'not-connected' || rb.reason === 'scope-missing') return { ok: false, reason: rb.reason };
        await ledger.set(key, { state: 'seen-unverified', chatId: chatId, askedMs: askedMs, direction: 'mine', messageId: messageId, at: now() });
        return { ok: false, reason: 'verify_failed', proof: null };
      }
      const proof = proofFor(messageId);
      if (!proof) return { ok: false, reason: 'proof_pending', proof: null };
      await ledger.set(key, { state: 'closed', chatId: chatId, askedMs: askedMs, direction: 'mine', messageId: messageId, at: now() });
      return { ok: true, closed: true, where: 'Teams', ref: { key: key, chatId: chatId, messageId: messageId, externalId: messageId }, proof: proof };
    }

    // link: { key, chatId (an id or a Teams chat link), askedAtIso, direction: "mine" | "theirs" }
    async function check(link) {
      const l = link || {};
      const key = String(l.key || '');
      const chatId = parseChatId(l.chatId);
      const askedMs = isoMs(l.askedAtIso);
      const direction = l.direction === 'theirs' ? 'theirs' : l.direction === 'mine' ? 'mine' : '';
      if (!key || !chatId || askedMs === null || !direction) return { ok: false, reason: 'bad-params' };
      if (askedMs > now() + FUTURE_SLACK_MS) return { ok: false, reason: 'bad-params' };
      const prior = await ledger.get(key);
      if (prior && prior.state !== 'released' && prior.chatId && prior.chatId !== chatId) return { ok: false, reason: 'another-chat-linked' };
      if (prior && prior.state !== 'released' && prior.direction && prior.direction !== direction) return { ok: false, reason: 'another-chat-linked' };
      return evaluate(key, chatId, askedMs, direction);
    }

    async function verify(ref) {
      const key = ref && String(ref.key || '');
      if (!key) return { ok: false, reason: 'bad-params' };
      const rec = await ledger.get(key);
      if (!rec || !rec.chatId || rec.state === 'released') return { ok: false, reason: 'no-record' };
      return evaluate(key, rec.chatId, rec.askedMs, rec.direction);
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

  return { SYSTEM: SYSTEM, create: create, parseChatId: parseChatId, isAnswer: isAnswer, plainText: plainText };
})();

if (typeof module !== 'undefined') module.exports = { FlowTeamsAnswerClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsAnswerClose = FlowTeamsAnswerClose;
