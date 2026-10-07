// Outlook Family B: one named file placed on the calendar at one clock.
// Portable: no chrome.*, no DOM, no network. The host searches Drive, checks
// the token, and posts the body this file builds. A meeting with no file
// is not this close. OneDrive is not searched here.
//
// Creating the event needs delegated Calendars.ReadWrite. The Calendar box
// on the one Connect screen asks for that scope. The default mail sign-in
// does not. Calendars.Read cannot write. A token without the write scope
// stays quiet.
const FlowOutlookCalendar = (() => {
  const WRITE_SCOPE = 'Calendars.ReadWrite';
  const DURATION_MIN = 30;

  function scopeList(scopes) {
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    return String(scopes || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  }

  // The exact delegated scope, or the Graph URL form of that same scope.
  // Calendars.Read and Calendars.ReadWrite.Shared are not this permission.
  function hasWriteScope(scopes) {
    return scopeList(scopes).some((s) => s === WRITE_SCOPE || s === 'https://graph.microsoft.com/' + WRITE_SCOPE);
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
