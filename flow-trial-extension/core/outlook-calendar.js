// Outlook Family B: one named file placed on the calendar at one clock.
// Portable: no chrome.*, no DOM, no network. The host searches Drive, checks
// the token, and posts the body this file builds. A meeting with no file
// is not this close. OneDrive is not searched here.
//
// Creating the event needs delegated Calendars.ReadWrite. The Calendar box
// on the one Connect screen asks for that scope. The default mail sign-in
// does not. Calendars.Read cannot write. A missing scope, the word unknown,
// or a stale cache is not a grant. Hold asks before it writes.
const FlowOutlookCalendar = (() => {
  const WRITE_SCOPE = 'Calendars.ReadWrite';
  const DURATION_MIN = 30;
  // Microsoft's token response uses these spellings. Comparison is
  // case-insensitive; what we store uses this casing so an indexOf still hits.
  const SCOPE_CANON = {
    'calendars.readwrite': 'Calendars.ReadWrite',
    'calendars.read': 'Calendars.Read',
    'calendars.readwrite.shared': 'Calendars.ReadWrite.Shared',
    'tasks.readwrite': 'Tasks.ReadWrite',
    'mail.read': 'Mail.Read',
    'mail.readwrite': 'Mail.ReadWrite',
    'files.readwrite': 'Files.ReadWrite',
    'files.read': 'Files.Read',
    'user.read': 'User.Read',
    'offline_access': 'offline_access',
    'openid': 'openid',
    'profile': 'profile',
    'email': 'email',
    'contacts.read': 'Contacts.Read',
    'chat.read': 'Chat.Read'
  };

  function b64urlJson(segment) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = String(segment || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!clean) return '';
    let bits = '';
    for (let i = 0; i < clean.length; i++) {
      const v = chars.indexOf(clean.charAt(i));
      if (v < 0) return '';
      bits += v.toString(2).padStart(6, '0');
    }
    let text = '';
    for (let i = 0; i + 8 <= bits.length; i += 8) text += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    return text;
  }

  // The access token's scp claim is the delegated list this token can use.
  // A cached token response often omits scope or says "unknown".
  function jwtDelegatedScopes(accessToken) {
    const parts = String(accessToken || '').split('.');
    if (parts.length < 2 || !parts[1]) return null;
    const text = b64urlJson(parts[1]);
    if (!text || text.charAt(0) !== '{') return null;
    let data = null;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || data.scp == null) return null;
    return normalizeDelegatedScopes(data.scp);
  }

  // One scope token: full Graph URI, short name, any case. "unknown" is not a scope.
  function bareScope(value) {
    let s = String(value || '').trim();
    if (!s || /^unknown$/i.test(s)) return '';
    s = s.replace(/^https:\/\/graph\.microsoft\.com\//i, '');
    if (s.indexOf('/') >= 0) s = s.slice(s.lastIndexOf('/') + 1);
    if (!s || /^unknown$/i.test(s)) return '';
    const key = s.toLowerCase();
    return SCOPE_CANON[key] || s;
  }

  // null: the token did not say (missing, "unknown", or only noise).
  // An array may hold one unsplit scope string. Space, comma, and semicolon all separate.
  function normalizeDelegatedScopes(raw) {
    if (raw == null) return null;
    if (typeof raw === 'string' && /^unknown$/i.test(raw.trim())) return null;
    const items = Array.isArray(raw) ? raw : [raw];
    const out = [];
    items.forEach((item) => {
      if (item == null) return;
      String(item).split(/[\s,;]+/).forEach((part) => {
        const name = bareScope(part);
        if (name && out.indexOf(name) < 0) out.push(name);
      });
    });
    return out.length ? out : null;
  }

  // What this stored token can do. The JWT scp wins over a stale grantedScopes
  // list and over a scope field that came back "unknown". Requested scopes
  // are not a grant. null means missing.
  function scopesFromToken(token) {
    if (!token || typeof token !== 'object') return null;
    const scp = jwtDelegatedScopes(token.accessToken);
    if (scp && scp.length) return scp;
    const granted = normalizeDelegatedScopes(token.grantedScopes);
    if (granted && granted.length) return granted;
    const scope = normalizeDelegatedScopes(token.scope);
    if (scope && scope.length) return scope;
    return null;
  }

  // Token-endpoint answer → the list we store. "unknown" and a missing scope
  // are not a grant and do not copy the scopes we asked for.
  function grantedScopesFromResponse(resp, previous) {
    const scp = resp && resp.access_token ? jwtDelegatedScopes(resp.access_token) : null;
    const raw = resp && resp.scope != null ? String(resp.scope).trim() : '';
    const fromScope = (raw && !/^unknown$/i.test(raw)) ? normalizeDelegatedScopes(raw) : null;
    const prev = normalizeDelegatedScopes(previous && previous.grantedScopes) || [];
    if (scp && scp.length) {
      const out = scp.slice();
      prev.concat(fromScope || []).forEach((s) => {
        if (/^(openid|profile|email|offline_access)$/i.test(s) && out.indexOf(s) < 0) out.push(s);
      });
      return out;
    }
    if (fromScope && fromScope.length) return fromScope;
    if (prev.length) return prev;
    return null;
  }

  // Missing calendar scope asks. "unknown" asks. Once asks again next time.
  // Always does not, until Settings revokes it. A Connect checkbox that
  // already granted the scope, with no card policy, does not ask.
  function holdConsentAsk(granted, policy) {
    const p = policy || {};
    if (p.revoked === true) return true;
    if (granted === 'unknown' || granted === 'missing' || !granted) return true;
    if (p.mode === 'once') return true;
    if (p.mode === 'always') return false;
    return false;
  }

  // The exact delegated scope, after the real Microsoft spellings are folded.
  // Calendars.Read and Calendars.ReadWrite.Shared are not this permission.
  // A missing list and the word "unknown" are not this permission.
  function hasWriteScope(scopes) {
    const list = normalizeDelegatedScopes(scopes);
    if (!list) return false;
    return list.some((s) => String(s).toLowerCase() === 'calendars.readwrite');
  }

  function namesCalendar(text) {
    return /(?:\b(?:calendar|invite|event|hold)\b|ביומן|ליומן|בזימון)/i.test(String(text || ''));
  }

  function isoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return value;
  }

  function clockPart(value, max) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max) return value;
    if (typeof value === 'string' && /^\d{1,2}$/.test(value)) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 0 && n <= max) return n;
    }
    return null;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateTime(dateIso, hour, minute, addMinutes) {
    const [y, m, d] = dateIso.split('-').map(Number);
    const dt = new Date(y, m - 1, d, hour, minute + (addMinutes || 0));
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
      'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00';
  }

  // The link that goes in the description. https only. No invitees.
  function fileLink(url) {
    const u = String(url || '').trim();
    if (!/^https:\/\/[^\s]+$/i.test(u) || u.length > 500) return null;
    if (/^https:\/\/[^/\s]*@/i.test(u)) return null;
    return u;
  }

  function eventBody(input) {
    const i = input || {};
    const date = isoDate(i.dateIso);
    const hour = clockPart(i.hour, 23);
    const minute = clockPart(i.minute, 59);
    const link = fileLink(i.fileUrl);
    const name = String(i.fileName || i.fileTerm || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    if (!date || hour == null || minute == null || !link || !name) return null;
    const zone = String(i.timeZone || 'UTC').trim().slice(0, 80) || 'UTC';
    const quote = i.quote ? String(i.quote).replace(/[\r\n]+/g, ' ').trim().slice(0, 500) : '';
    const lines = [];
    if (quote) lines.push(quote);
    lines.push('File: ' + name);
    lines.push(link);
    // POST /me/events. attendees is an empty list so the event invites nobody.
    // isOnlineMeeting is omitted. body.content is plain text and includes the https file link.
    return {
      subject: name,
      body: { contentType: 'Text', content: lines.join('\n') },
      start: { dateTime: dateTime(date, hour, minute, 0), timeZone: zone },
      end: { dateTime: dateTime(date, hour, minute, DURATION_MIN), timeZone: zone },
      showAs: 'busy',
      attendees: []
    };
  }

  function whenLabel(dateIso, hour, minute) {
    const date = isoDate(dateIso);
    const h = clockPart(hour, 23);
    const m = clockPart(minute, 59);
    if (!date || h == null || m == null) return '';
    return date + ' ' + pad(h) + ':' + pad(m);
  }

  // DELETE of the one event this click created. Nothing else.
  function undoRequest(eventId) {
    const id = String(eventId || '').trim();
    if (!id || id.length > 200 || /[\/\\\s]/.test(id)) return null;
    return { method: 'DELETE', path: '/me/events/' + encodeURIComponent(id) };
  }

  // { move:'ignore' } not this close.
  // { move:'wait', fileTerm } the sentence is a calendar place; the host
  // still has to find exactly one file.
  // { move:'silent', reason } sure enough to refuse.
  // { move:'hold', intent, process, params } one file, one clock.
  function decide(input) {
    const i = input || {};
    const text = String(i.text || '');
    if (!text.trim()) return { move: 'ignore' };
    if (typeof FlowIntent === 'undefined' || typeof FlowIntent.classify !== 'function') {
      return { move: 'silent', reason: 'no-intent' };
    }
    const now = i.now instanceof Date ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const intent = FlowIntent.classify(text, {
      senderEmail: i.senderEmail || null,
      senderName: i.senderName || null,
      subject: i.subject || '',
      fileMatch: i.fileMatch || null,
      attachmentCount: 0,
      now: now
    });
    if (intent && intent.googleWait && intent.googleWait.fileTerm) {
      if (!namesCalendar(text)) return { move: 'ignore' };
      return { move: 'wait', fileTerm: String(intent.googleWait.fileTerm) };
    }
    if (!intent || intent.personalClose !== 'file-on-hold') {
      if (intent && intent.googleSilence && namesCalendar(text)) return { move: 'silent', reason: 'google-silence' };
      return { move: 'ignore' };
    }
    if (typeof FlowActions === 'undefined' || typeof FlowActions.planFor !== 'function') {
      return { move: 'silent', reason: 'no-actions' };
    }
    const process = FlowActions.planFor(intent, {});
    const step = process && (process.steps || [])[0];
    if (!process || process.id !== 'file-on-hold' || !step || step.kind !== 'calendar') {
      return { move: 'silent', reason: 'no-calendar-step' };
    }
    return {
      move: 'hold',
      intent: intent,
      process: process,
      fileTerm: (intent.googleClose && intent.googleClose.fileTerm) || step.params.fileTerm,
      params: step.params || {}
    };
  }

  return {
    WRITE_SCOPE: WRITE_SCOPE,
    DURATION_MIN: DURATION_MIN,
    hasWriteScope: hasWriteScope,
    holdConsentAsk: holdConsentAsk,
    normalizeDelegatedScopes: normalizeDelegatedScopes,
    scopesFromToken: scopesFromToken,
    grantedScopesFromResponse: grantedScopesFromResponse,
    namesCalendar: namesCalendar,
    fileLink: fileLink,
    eventBody: eventBody,
    whenLabel: whenLabel,
    undoRequest: undoRequest,
    decide: decide
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookCalendar };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookCalendar = FlowOutlookCalendar;
