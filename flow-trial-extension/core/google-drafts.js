// A reply draft saved in the thread through the Gmail drafts API. Glance
// never sends: users.drafts.create stores a draft and nothing else, and the
// person presses Send. A saved draft is preparation, not completion, so the
// result is a preview (closes false), but it is read back by id before it is
// reported. Portable: no chrome.*, no DOM, no network; the host passes http.
const FlowGoogleDrafts = (() => {
  const SYSTEM = 'gmail/drafts';
  const CONNECTOR = 'googleReplyDraft';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';

  function cfg() {
    if (typeof FlowGoogleConfig !== 'undefined') return FlowGoogleConfig;
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    return g.FlowGoogleConfig || null;
  }

  function emailOf(value) {
    const s = String(value || '').trim();
    if (!s || s.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s)) return '';
    return s;
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    const out = [];
    const enc = unescape(encodeURIComponent(text));
    for (let i = 0; i < enc.length; i++) out.push(enc.charCodeAt(i));
    return Uint8Array.from(out);
  }

  function base64Bytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function base64(text) {
    return base64Bytes(utf8Bytes(text));
  }

  function base64url(text) {
    return base64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64(data) {
    const std = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = std + '==='.slice((std.length + 3) % 4);
    let bin = '';
    try { bin = atob(padded); } catch (e) { return ''; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin));
  }

  function header(value) {
    const clean = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    // eslint-disable-next-line no-control-regex
    if (/^[\x20-\x7e]*$/.test(clean)) return clean;
    return '=?UTF-8?B?' + base64(clean) + '?=';
  }

  function decodeHeader(value) {
    return String(value || '').replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (m, b) => fromBase64(b));
  }

  function subjectOf(value) {
    const raw = String(value || 'Following up').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    if (!raw) return '';
    return /^re:/i.test(raw) ? raw : 'Re: ' + raw;
  }

  function idToken(value) {
    const s = String(value || '').trim();
    return /^<[^<>\s]{1,300}>$/.test(s) ? s : '';
  }

  function threadOf(value) {
    const s = String(value || '').trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
  }

  function normBody(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\s+$/g, '');
  }

  function plan(input) {
    const i = input || {};
    if (i.send === true || i.pressSend === true) return { ok: false, reason: 'never-sends', preview: true, closes: false, sent: false };
    const to = emailOf(i.to);
    const subject = subjectOf(i.subject || i.quote);
    const body = String(i.body || '').slice(0, 8000);
    const threadId = threadOf(i.threadId);
    if (!to || !subject || !body.trim() || !threadId) return { ok: false, reason: 'unclear', preview: true, closes: false, sent: false };
    return {
      ok: true,
      to: to,
      subject: subject,
      body: body,
      threadId: threadId,
      inReplyTo: idToken(i.inReplyTo),
      references: idToken(i.references) || idToken(i.inReplyTo)
    };
  }

  function mime(planned) {
    const lines = ['To: ' + planned.to, 'Subject: ' + header(planned.subject)];
    if (planned.inReplyTo) lines.push('In-Reply-To: ' + planned.inReplyTo);
    if (planned.references) lines.push('References: ' + planned.references);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: base64');
    const wrapped = base64(planned.body).replace(/(.{76})/g, '$1\r\n');
    return lines.join('\r\n') + '\r\n\r\n' + wrapped;
  }

  function request(planned) {
    return {
      method: 'POST',
      url: API,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: base64url(mime(planned)), threadId: planned.threadId } })
    };
  }

  function draftUrl(id) {
    const clean = String(id || '').trim();
    if (!clean || /[\/\\\s]/.test(clean)) return '';
    return API + '/' + encodeURIComponent(clean);
  }

  function headerOf(message, name) {
    const list = message && message.payload && Array.isArray(message.payload.headers) ? message.payload.headers : [];
    const hit = list.find((h) => h && String(h.name || '').toLowerCase() === name.toLowerCase());
    return hit ? decodeHeader(hit.value) : '';
  }

  function bodyOf(message) {
    const payload = message && message.payload;
    if (!payload) return '';
    if (payload.body && payload.body.data) return fromBase64(payload.body.data);
    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    const plain = parts.find((p) => p && /text\/plain/i.test(p.mimeType || '') && p.body && p.body.data);
    return plain ? fromBase64(plain.body.data) : '';
  }

  function seenOf(json) {
    const message = json && json.message;
    return {
      to: headerOf(message, 'To'),
      subject: headerOf(message, 'Subject'),
      body: bodyOf(message),
      threadId: message && message.threadId ? String(message.threadId) : ''
    };
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function contentHash(to, subject, body) {
    return hash(String(to || '') + '\n' + String(subject || '') + '\n' + normBody(body));
  }

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const scopes = i.scopes || i.grantedScopes || null;
    if (C && !C.gmailDraftApiAllowed(scopes)) {
      return {
        ok: false,
        reason: 'compose-closed',
        preview: true,
        closes: false,
        sent: false,
        error: 'Open Reply first. Glance does not press Send.'
      };
    }
    const planned = plan(input);
    if (!planned.ok) return planned;
    const base = {
      where: 'Gmail',
      target: planned.to,
      written: 'Reply draft saved in this thread. You send it.',
      undoHint: 'Undo deletes the draft.',
      preview: true,
      closes: false,
      sent: false,
      url: null
    };
    const posted = await call(http, request(planned));
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected', preview: true, closes: false, sent: false };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, proof: null }, base);
    const id = posted.json && posted.json.id ? String(posted.json.id) : '';
    const named = { object: 'draft', title: planned.subject };
    if (!id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, named, base);
    const ref = { draftId: id, externalId: id, threadId: planned.threadId, to: planned.to };
    const url = draftUrl(id) + '?format=full';
    const got = await call(http, { method: 'GET', url: url });
    if (!got.ok || !got.json || String(got.json.id) !== id) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: ref, proof: null }, named, base);
    }
    const seen = seenOf(got.json);
    const same = seen.to.toLowerCase().indexOf(planned.to.toLowerCase()) >= 0
      && seen.subject === planned.subject
      && normBody(seen.body) === normBody(planned.body)
      && seen.threadId === planned.threadId;
    if (!same) {
      await call(http, { method: 'DELETE', url: draftUrl(id) });
      return Object.assign({ ok: false, reason: 'verify_failed', ref: null, proof: null, seen: seen }, named, base);
    }
    ref.contentHash = contentHash(planned.to, planned.subject, planned.body);
    const proof = C && C.proofOf(SYSTEM, id, null, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, named, base);
    const fields = { to: planned.to, subject: planned.subject, body: planned.body };
    return Object.assign({ ok: true, ref: ref, proof: proof, fields: fields, seen: { to: planned.to, subject: seen.subject, body: seen.body } }, base);
  }

  async function undo(ref, http) {
    const id = ref && (ref.draftId || ref.externalId);
    const url = draftUrl(id);
    if (!url) return { ok: false };
    if (!ref.contentHash) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    const got = await call(http, { method: 'GET', url: url + '?format=full' });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, written: 'Draft removed. Nothing was sent.' };
    if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
    const seen = seenOf(got.json);
    const live = contentHash(ref.to || seen.to, seen.subject, seen.body);
    const ours = ref.contentHash;
    if (live !== ours) {
      return { ok: false, reason: 'user-edited', error: 'You edited this. Undo left it alone.' };
    }
    const del = await call(http, { method: 'DELETE', url: url });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Draft removed. Nothing was sent.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    plan: plan,
    mime: mime,
    request: request,
    contentHash: contentHash,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleDrafts };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleDrafts = FlowGoogleDrafts;
