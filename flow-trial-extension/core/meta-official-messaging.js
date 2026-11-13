// Official Messenger and Instagram messaging (Meta Graph API only).
// Portable: no chrome.*, no document, no window. The network is injected.
//
// Two switches, both off until the owner turns them on:
//   glanceSwitches.META_OFFICIAL_MESSAGING  (extension, missing key is off)
//   GLANCE_META_OFFICIAL=1                  (server, anything else is off)
// A reply is sent only when the person has approved that exact text (Do It).
// Handled only after the sent message is read back with the same text.
// Meta's Send API cannot take a sent message back: undo is unavailable and the card says so.
// Nothing here reads messenger.com or instagram.com.
const FlowMetaOfficial = (() => {
  const SWITCH = 'META_OFFICIAL_MESSAGING';
  const GRAPH_HOST = 'graph.facebook.com';
  const DEFAULT_VERSION = 'v21.0';
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const MAX_TEXT = 2000;
  const SYSTEMS = { messenger: 'meta/messenger', instagram: 'meta/instagram' };

  function nodeCrypto() {
    try {
      if (typeof require === 'function') return require('crypto');
    } catch (e) { /* the browser has no require */ }
    return null;
  }

  function serverOn(env) {
    return String((env && env.GLANCE_META_OFFICIAL) || '') === '1';
  }

  function switchOn(bag) {
    return Boolean(bag && bag[SWITCH] === true);
  }

  function safeEqualHex(crypto, expectedHex, givenHex) {
    const a = Buffer.from(String(expectedHex), 'utf8');
    const b = Buffer.from(String(givenHex), 'utf8');
    if (a.length !== b.length) {
      crypto.timingSafeEqual(a, a);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  // X-Hub-Signature-256 is HMAC-SHA256 of the raw body, hex, prefixed with sha256=.
  function verifySignature(rawBody, header, secret) {
    const crypto = nodeCrypto();
    if (!crypto || !secret) return false;
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody == null ? '' : rawBody), 'utf8');
    const match = /^sha256=([0-9a-fA-F]{64})$/.exec(String(header || '').trim());
    if (!match) return false;
    const expected = crypto.createHmac('sha256', String(secret)).update(raw).digest('hex');
    return safeEqualHex(crypto, expected, match[1].toLowerCase());
  }

  function verifyToken(given, expected) {
    const crypto = nodeCrypto();
    if (!crypto || !expected) return false;
    const a = Buffer.from(String(given || ''), 'utf8');
    const b = Buffer.from(String(expected), 'utf8');
    if (a.length !== b.length || a.length === 0) {
      crypto.timingSafeEqual(b, b);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  // Meta's handshake. The challenge is echoed only when the verify token matches.
  function verifyChallenge(query, expectedToken) {
    const q = query || {};
    const mode = String(q['hub.mode'] || q.hub_mode || '');
    const token = String(q['hub.verify_token'] || q.hub_verify_token || '');
    const challenge = String(q['hub.challenge'] || q.hub_challenge || '');
    if (mode !== 'subscribe') return { ok: false, reason: 'mode' };
    if (!/^[A-Za-z0-9._~-]{1,256}$/.test(challenge)) return { ok: false, reason: 'challenge' };
    if (!verifyToken(token, expectedToken)) return { ok: false, reason: 'token' };
    return { ok: true, challenge: challenge };
  }

  function isAsk(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 4000) return false;
    if (/[?？؟]/.test(t)) return true;
    if (/\b(please|can you|could you|would you|send me|need you)\b/i.test(t)) return true;
    if (/בבקשה|אפשר|תוכל|תוכלי|תשלח|תעביר|תחזירו|תעדכן/.test(t)) return true;
    return false;
  }

  function draftFor(text) {
    const he = /[\u0590-\u05FF]/.test(String(text || ''));
    return {
      lang: he ? 'he' : 'en',
      draft: he ? 'קיבלתי. אבדוק ואחזור אליך.' : "Got it. I'll check and get back to you."
    };
  }

  function numericId(value) {
    return /^[0-9]{5,32}$/.test(String(value || ''));
  }

  function versionOf(value) {
    const v = String(value || DEFAULT_VERSION);
    return /^v\d+\.\d+$/.test(v) ? v : '';
  }

  function messageIdOk(value) {
    return /^[A-Za-z0-9._:-]{1,200}$/.test(String(value || ''));
  }

  function withinWindow(timestampMs, nowMs) {
    const ts = Number(timestampMs);
    const now = Number(nowMs);
    if (!Number.isFinite(ts) || !Number.isFinite(now)) return false;
    if (ts > now + 5 * 60 * 1000) return false;
    return now - ts <= WINDOW_MS;
  }

  function oneMessage(channel, entryId, event) {
    if (!event || !event.message) return null;
    const message = event.message;
    if (message.is_echo === true || message.is_deleted === true) return null;
    const text = String(message.text || '').trim();
    if (!isAsk(text)) return null;
    const senderId = event.sender && event.sender.id;
    const recipientId = event.recipient && event.recipient.id;
    const pageId = String(entryId || recipientId || '');
    if (!numericId(senderId) || !numericId(pageId)) return null;
    if (String(senderId) === String(pageId)) return null;
    if (!messageIdOk(message.mid)) return null;
    const draft = draftFor(text);
    return {
      channel: channel,
      pageId: String(pageId),
      senderId: String(senderId),
      recipientId: String(senderId),
      messageId: String(message.mid),
      text: text,
      timestamp: Number(event.timestamp),
      draft: draft.draft,
      lang: draft.lang
    };
  }

  // Webhook JSON in, ask proposals out. Echoes, receipts, and non-asks stay quiet.
  function parseWebhook(body) {
    let data = body;
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      try { data = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body); }
      catch (e) { return { ok: false, reason: 'json', items: [] }; }
    }
    if (!data || typeof data !== 'object') return { ok: false, reason: 'json', items: [] };
    const object = String(data.object || '');
    const channel = object === 'page' ? 'messenger' : (object === 'instagram' ? 'instagram' : '');
    if (!channel) return { ok: true, items: [] };
    const items = [];
    const entries = Array.isArray(data.entry) ? data.entry : [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] || {};
      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (let j = 0; j < messaging.length; j++) {
        const row = oneMessage(channel, entry.id, messaging[j]);
        if (row) items.push(row);
      }
    }
    return { ok: true, items: items };
  }

  function graphUrl(version, path) {
    const v = versionOf(version);
    if (!v) return '';
    if (!path || path.indexOf('..') >= 0 || path.charAt(0) !== '/') return '';
    return 'https://' + GRAPH_HOST + '/' + v + path;
  }

  function sendRequest(input) {
    const channel = input && input.channel;
    if (channel !== 'messenger' && channel !== 'instagram') return { ok: false, reason: 'channel' };
    if (!numericId(input.pageId) || !numericId(input.recipientId)) return { ok: false, reason: 'id' };
    const text = String(input.text || '').trim();
    if (!text || text.length > MAX_TEXT) return { ok: false, reason: 'empty' };
    const token = String(input.token || '');
    if (!token || token.length > 4096) return { ok: false, reason: 'not-configured' };
    const url = graphUrl(input.version, '/' + input.pageId + '/messages');
    if (!url) return { ok: false, reason: 'version' };
    const payload = {
      recipient: { id: String(input.recipientId) },
      message: { text: text }
    };
    if (channel === 'messenger') payload.messaging_type = 'RESPONSE';
    return {
      ok: true,
      url: url,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: payload
    };
  }

  function readRequest(input, messageId) {
    if (!messageIdOk(messageId)) return { ok: false, reason: 'id' };
    const url = graphUrl(input.version, '/' + messageId + '?fields=id,message');
    if (!url) return { ok: false, reason: 'version' };
    return {
      ok: true,
      url: url,
      headers: { Authorization: 'Bearer ' + String(input.token || '') }
    };
  }

  function allowedGraphUrl(url) {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return false; }
    return parsed.protocol === 'https:' && parsed.hostname === GRAPH_HOST && parsed.username === '' && parsed.password === '';
  }

  async function graphCall(http, req) {
    if (!req || !req.ok || !allowedGraphUrl(req.url)) return { ok: false, reason: 'host' };
    if (req.url.indexOf(req.headers.Authorization.slice('Bearer '.length)) >= 0) return { ok: false, reason: 'host' };
    const res = await http(req.url, {
      method: req.body ? 'POST' : 'GET',
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      redirect: 'error'
    });
    return res || { ok: false, reason: 'error' };
  }

  // Sends only when approved is exactly true. Read-back must match the text or it is not Handled.
  async function sendApproved(input, http, opts) {
    const o = opts || {};
    const seen = o.seen;
    if (!input || input.approved !== true) return { ok: false, reason: 'not-approved' };
    if (input.enabled !== true) return { ok: false, reason: 'off' };
    const key = String(input.messageId || '');
    if (!messageIdOk(key)) return { ok: false, reason: 'id' };
    if (seen && seen.has(key)) return seen.get(key);
    if (!withinWindow(input.timestamp, o.now != null ? o.now : Date.now())) {
      return { ok: false, reason: 'window' };
    }
    const posted = sendRequest(input);
    if (!posted.ok) return posted;
    const sent = await graphCall(http, posted);
    const mid = sent && sent.json && sent.json.message_id;
    if (!sent || sent.ok !== true || !messageIdOk(mid)) {
      return { ok: false, reason: 'send-failed' };
    }
    const read = readRequest(input, mid);
    const got = await graphCall(http, read);
    const back = got && got.json ? String(got.json.message || '').trim() : '';
    const text = String(input.text || '').trim();
    let result;
    if (got && got.ok === true && back === text) {
      result = {
        ok: true,
        proof: {
          system: SYSTEMS[input.channel],
          externalId: String(mid),
          fetchedBack: true,
          verifiedAt: new Date(o.now != null ? o.now : Date.now()).toISOString()
        }
      };
    } else {
      result = { ok: false, reason: 'unverified', externalId: String(mid) };
    }
    if (seen) seen.set(key, result);
    return result;
  }

  // Meta does not offer a way to take a sent Page or Instagram message back.
  function undo() {
    return {
      ok: false,
      reason: 'no-unsend',
      he: 'אי אפשר למשוך הודעה שנשלחה. Meta לא נותנת לבטל שליחה.',
      en: 'A sent reply stays sent. Meta does not take it back.'
    };
  }

  return {
    SWITCH: SWITCH,
    GRAPH_HOST: GRAPH_HOST,
    DEFAULT_VERSION: DEFAULT_VERSION,
    serverOn: serverOn,
    switchOn: switchOn,
    verifySignature: verifySignature,
    verifyChallenge: verifyChallenge,
    isAsk: isAsk,
    draftFor: draftFor,
    withinWindow: withinWindow,
    parseWebhook: parseWebhook,
    sendRequest: sendRequest,
    sendApproved: sendApproved,
    undo: undo,
    allowedGraphUrl: allowedGraphUrl
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowMetaOfficial };
else if (typeof globalThis !== 'undefined') globalThis.FlowMetaOfficial = FlowMetaOfficial;
