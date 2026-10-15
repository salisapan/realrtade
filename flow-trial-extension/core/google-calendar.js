// Google Calendar Hold It. One named file, one clock, one event.
// Portable: no chrome.*, no DOM, no network. The host posts the body,
// reads the event back, and deletes it on Undo. calendar.events is the
// scope. Attendees stay empty, so the write does not invite anyone.
// A meeting with no file is not this close.
const FlowGoogleCalendar = (() => {
  const SYSTEM = 'google/calendar';
  const CONNECTOR = 'googleHold';
  const DURATION_MIN = 30;
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function hasWriteScope(scopes) {
    const C = cfg();
    if (!C) return null;
    return C.hasScope(scopes, C.SCOPE_CALENDAR);
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
    const parts = dateIso.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2], hour, minute + (addMinutes || 0));
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
      'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00';
  }

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
    return {
      summary: name,
      description: lines.join('\n'),
      start: { dateTime: dateTime(date, hour, minute, 0), timeZone: zone },
      end: { dateTime: dateTime(date, hour, minute, DURATION_MIN), timeZone: zone },
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

  function eventUrl(id) {
    const clean = String(id || '').trim();
    if (!clean || /[\/\\\s]/.test(clean)) return '';
    return API + '/' + encodeURIComponent(clean) + '?sendUpdates=none';
  }

  function createRequest(body) {
    if (!body || (Array.isArray(body.attendees) && body.attendees.length) || body.isOnlineMeeting) return null;
    return { method: 'POST', url: API + '?sendUpdates=none', json: body };
  }

  function undoRequest(eventId) {
    const url = eventUrl(eventId);
    if (!url) return null;
    return { method: 'DELETE', url: url };
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function contentHash(ev) {
    const summary = ev && ev.summary ? String(ev.summary) : '';
    const description = ev && ev.description ? String(ev.description) : '';
    const start = ev && ev.start ? String(ev.start.dateTime || ev.start.date || '') : '';
    return hash(summary + '\n' + description + '\n' + start);
  }

  function namesCalendar(text) {
    return /(?:\b(?:calendar|invite|event|hold)\b|ביומן|ליומן|בזימון)/i.test(String(text || ''));
  }

  // Same gate as the Outlook hold: one file, one clock, or silence.
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

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  function authFail(status) {
    if (status === 401 || status === 403) return { ok: false, reason: 'not-connected' };
    return null;
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_CALENDAR, 'calendar-not-granted');
    if (blocked) return blocked;
    const body = eventBody(i);
    const req = createRequest(body);
    if (!req) return { ok: false, reason: 'unclear', error: 'No single file and time for this event.' };
    const posted = await call(http, Object.assign({ body: JSON.stringify(req.json), headers: { 'Content-Type': 'application/json' } }, req));
    const denied = authFail(posted.status);
    if (denied) return denied;
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    const event = posted.json || {};
    const pending = 'proof_pending';
    const failed = 'verify_failed';
    const when = whenLabel(i.dateIso, i.hour, i.minute);
    const base = {
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + body.summary + (when ? ' · ' + when : ''),
      url: null
    };
    if (!event.id) return Object.assign({ ok: false, reason: pending, ref: null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: eventUrl(event.id) });
    if (!got.ok || !got.json || got.json.id !== event.id || got.json.status === 'cancelled') {
      return Object.assign({ ok: false, reason: failed, ref: { eventId: event.id, externalId: event.id }, proof: null }, base);
    }
    const link = event.htmlLink && String(event.htmlLink).slice(0, 8) === 'https://' ? event.htmlLink : null;
    if (link) base.url = link;
    const proof = C && C.proofOf(SYSTEM, event.id, link, C.clockIso(clock));
    const ref = { eventId: event.id, externalId: event.id, contentHash: contentHash(got.json) };
    if (!proof) return Object.assign({ ok: false, reason: pending, ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  function unconfirmedUndo() {
    return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
  }

  async function undo(ref, http) {
    const id = ref && typeof ref === 'object' ? (ref.externalId || ref.eventId) : ref;
    const req = undoRequest(id);
    if (!req) return { ok: false };
    if (!ref || typeof ref !== 'object' || !ref.contentHash) return unconfirmedUndo();
    const got = await call(http, { method: 'GET', url: eventUrl(id) });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, written: 'Calendar event removed.' };
    if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
    if (contentHash(got.json) !== ref.contentHash) {
      return { ok: false, reason: 'user-edited', error: 'Undo stopped. You changed the event, so it was left as you left it.' };
    }
    const del = await call(http, req);
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok || del.status === 204 || del.status === 404 || del.status === 410) {
      return { ok: true, written: 'Calendar event removed.' };
    }
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    DURATION_MIN: DURATION_MIN,
    hasWriteScope: hasWriteScope,
    eventBody: eventBody,
    contentHash: contentHash,
    whenLabel: whenLabel,
    createRequest: createRequest,
    undoRequest: undoRequest,
    decide: decide,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleCalendar };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleCalendar = FlowGoogleCalendar;
