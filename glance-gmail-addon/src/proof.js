// ProofOfClose for one Google Task, and the Undo gate.
// A match is id + title + due on the object just read back.
// Undo deletes only when title, due, etag, and updated are still the
// values from that read. Any difference is a user edit: do not delete.

var GlanceProof = (function () {
  function normTitle(value) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    try { text = text.normalize('NFC'); } catch (err) { /* already a string */ }
    return text;
  }

  function pad(n) {
    n = Number(n);
    return (n < 10 ? '0' : '') + n;
  }

  // A Calendar timeZone must be an IANA id. The card event sends an
  // object {id, offset}; that object is not a zone.
  function ianaZone(value) {
    if (value && typeof value === 'object') return ianaZone(value.id);
    if (typeof value !== 'string') return '';
    var text = value.trim();
    if (!/^[A-Za-z0-9_+\-\/]{1,80}$/.test(text)) return '';
    try {
      Intl.DateTimeFormat('en-US', { timeZone: text });
      return text;
    } catch (err) {
      return '';
    }
  }

  function zoneParts(utcMs, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    var map = {};
    fmt.formatToParts(new Date(utcMs)).forEach(function (part) {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    var hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: hour,
      minute: Number(map.minute),
      second: Number(map.second)
    };
  }

  function zoneOffsetMs(utcMs, timeZone) {
    var p = zoneParts(utcMs, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
  }

  // Wall-clock time in `timeZone`, as a UTC millisecond instant.
  function wallToUtcMs(dateIso, hour, minute, second, timeZone) {
    var parts = String(dateIso).split('-');
    var guess = Date.UTC(+parts[0], +parts[1] - 1, +parts[2], hour, minute, second || 0);
    var offset = zoneOffsetMs(guess, timeZone);
    var instant = guess - offset;
    var offset2 = zoneOffsetMs(instant, timeZone);
    if (offset2 !== offset) instant = guess - offset2;
    return instant;
  }

  function offsetText(totalMinutes) {
    var sign = totalMinutes >= 0 ? '+' : '-';
    var abs = Math.abs(totalMinutes);
    return sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
  }

  // Local midnight in the user's zone. The date in the string is the due date.
  function dueRfc3339(dateIso, timeZone) {
    var zone = ianaZone(timeZone) || 'Asia/Jerusalem';
    var ms = wallToUtcMs(dateIso, 0, 0, 0, zone);
    return dateIso + 'T00:00:00' + offsetText(Math.round(zoneOffsetMs(ms, zone) / 60000));
  }

  function instantUtc(dateIso, hour, minute, timeZone) {
    var zone = ianaZone(timeZone) || 'Asia/Jerusalem';
    return new Date(wallToUtcMs(dateIso, hour, minute, 0, zone)).toISOString().replace('.000Z', 'Z');
  }

  function parsePointMs(dateTime, timeZone) {
    var text = String(dateTime || '').trim();
    var match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
    if (!match) return null;
    var hour = match[2] == null ? 0 : +match[2];
    var minute = match[3] == null ? 0 : +match[3];
    var second = match[4] ? +match[4] : 0;
    if (!match[5]) {
      var zone = ianaZone(timeZone);
      if (!zone) return null;
      return wallToUtcMs(match[1], hour, minute, second, zone);
    }
    var year = +match[1].slice(0, 4);
    var month = +match[1].slice(5, 7);
    var day = +match[1].slice(8, 10);
    var civil = Date.UTC(year, month - 1, day, hour, minute, second);
    if (match[5] === 'Z') return civil;
    var body = match[5].slice(1).replace(':', '');
    var sign = match[5].charAt(0) === '-' ? -1 : 1;
    var offMin = sign * ((+body.slice(0, 2)) * 60 + (+body.slice(2, 4) || 0));
    return civil - offMin * 60000;
  }

  function normalizeDue(value, timeZone) {
    if (value == null || value === '') return null;
    var match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    var zone = ianaZone(timeZone);
    if (!zone || String(value).trim().length === 10) return match[1];
    var ms = parsePointMs(value, zone);
    if (ms == null) return match[1];
    var p = zoneParts(ms, zone);
    return p.year + '-' + pad(p.month) + '-' + pad(p.day);
  }

  function snapshotOf(task, listId, timeZone) {
    var zone = ianaZone(timeZone) || '';
    return {
      listId: String(listId || ''),
      id: String(task.id),
      title: normTitle(task.title),
      due: normalizeDue(task.due, zone),
      timeZone: zone,
      etag: task.etag ? String(task.etag) : '',
      updated: task.updated ? String(task.updated) : ''
    };
  }

  // Compare the create response with the following GET.
  function compareCreated(created, fetched, timeZone) {
    if (!created || !fetched) return { ok: false, reason: 'mismatch' };
    if (fetched.deleted) return { ok: false, reason: 'mismatch' };
    if (!created.id || String(fetched.id) !== String(created.id)) return { ok: false, reason: 'mismatch' };
    if (normTitle(fetched.title) !== normTitle(created.title)) return { ok: false, reason: 'mismatch' };
    if (normalizeDue(fetched.due, timeZone) !== normalizeDue(created.due, timeZone)) return { ok: false, reason: 'mismatch' };
    return { ok: true, snapshot: null };
  }

  function unchanged(snapshot, current) {
    if (!snapshot || !current || current.deleted) return false;
    if (String(current.id) !== String(snapshot.id)) return false;
    if (normTitle(current.title) !== snapshot.title) return false;
    if (normalizeDue(current.due, snapshot.timeZone) !== snapshot.due) return false;
    var etag = current.etag ? String(current.etag) : '';
    if (snapshot.etag && etag && snapshot.etag !== etag) return false;
    var updated = current.updated ? String(current.updated) : '';
    if (snapshot.updated && updated && snapshot.updated !== updated) return false;
    return true;
  }

  function undoDecision(snapshot, current) {
    if (!current) return { action: 'missing' };
    if (current.deleted) return { action: 'missing' };
    if (!unchanged(snapshot, current)) return { action: 'refuse' };
    return { action: 'delete' };
  }

  // The fields a later edit would change. A local time plus its zone and
  // the same instant written with Z are one time, not an edit.
  function canonicalEvent(event) {
    function when(point) {
      if (!point) return '';
      if (point.dateTime) {
        var ms = parsePointMs(point.dateTime, point.timeZone);
        if (ms == null) return 't:' + String(point.dateTime).slice(0, 16);
        return 'u:' + String(ms);
      }
      if (point.date) return 'd:' + String(point.date).slice(0, 10);
      return '';
    }
    var attendees = [];
    var list = (event && event.attendees) || [];
    for (var i = 0; i < list.length; i++) {
      var email = list[i] && list[i].email ? String(list[i].email).toLowerCase() : '';
      if (email) attendees.push(email);
    }
    attendees.sort();
    return {
      summary: normTitle(event && event.summary),
      start: when(event && event.start),
      end: when(event && event.end),
      description: normTitle(event && event.description),
      location: normTitle(event && event.location),
      attendees: attendees.join(',')
    };
  }

  function contentHash(event) {
    var body = JSON.stringify(canonicalEvent(event));
    var hash = 5381;
    for (var i = 0; i < body.length; i++) {
      hash = ((hash << 5) + hash + body.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  }

  function whenOf(event) {
    var start = event && event.start;
    if (!start) return '';
    if (start.dateTime) {
      var ms = parsePointMs(start.dateTime, start.timeZone);
      var zone = ianaZone(start.timeZone);
      if (ms == null || !zone) return String(start.dateTime).slice(0, 16).replace('T', ' ');
      var p = zoneParts(ms, zone);
      return p.year + '-' + pad(p.month) + '-' + pad(p.day) + ' ' + pad(p.hour) + ':' + pad(p.minute);
    }
    if (start.date) return String(start.date).slice(0, 10);
    return '';
  }

  function compareEvent(created, fetched) {
    if (!created || !fetched) return { ok: false, reason: 'mismatch' };
    if (fetched.status === 'cancelled') return { ok: false, reason: 'mismatch' };
    if (!created.id || String(fetched.id) !== String(created.id)) return { ok: false, reason: 'mismatch' };
    var left = canonicalEvent(created);
    var right = canonicalEvent(fetched);
    if (left.summary !== right.summary) return { ok: false, reason: 'mismatch' };
    if (left.start !== right.start || left.end !== right.end) return { ok: false, reason: 'mismatch' };
    if (left.description !== right.description) return { ok: false, reason: 'mismatch' };
    if (left.location !== right.location) return { ok: false, reason: 'mismatch' };
    if (left.attendees !== right.attendees) return { ok: false, reason: 'mismatch' };
    return { ok: true };
  }

  function eventSnapshot(event, calendarId) {
    var canonical = canonicalEvent(event);
    return {
      calendarId: String(calendarId || 'primary'),
      id: String(event.id),
      contentHash: contentHash(event),
      summary: canonical.summary,
      start: canonical.start,
      end: canonical.end
    };
  }

  // No stored hash is not a license to delete. An edit is a different hash.
  function eventUndoDecision(snapshot, current) {
    if (!snapshot || !snapshot.contentHash) return { action: 'refuse', which: 'event' };
    if (!current || current.status === 'cancelled') return { action: 'missing' };
    if (String(current.id) !== String(snapshot.id)) return { action: 'refuse', which: 'event' };
    if (contentHash(current) !== snapshot.contentHash) return { action: 'refuse', which: 'event' };
    return { action: 'delete' };
  }

  return {
    normTitle: normTitle,
    normalizeDue: normalizeDue,
    ianaZone: ianaZone,
    dueRfc3339: dueRfc3339,
    instantUtc: instantUtc,
    snapshotOf: snapshotOf,
    compareCreated: compareCreated,
    unchanged: unchanged,
    undoDecision: undoDecision,
    canonicalEvent: canonicalEvent,
    contentHash: contentHash,
    whenOf: whenOf,
    compareEvent: compareEvent,
    eventSnapshot: eventSnapshot,
    eventUndoDecision: eventUndoDecision
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceProof;
