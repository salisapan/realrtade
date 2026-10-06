// Pure write payloads for the three allowed closes. No network, no
// Apps Script globals. Code.js posts these objects. A draft payload is
// body text only — nothing here can send.

var GlancePayloads = (function () {
  var ATTRIBUTION = 'Logged by Glance — theflow-ai.com/trial';
  var DURATION_MIN = 30;
  var QUOTE_MAX = 400;

  function pad(n) {
    n = Number(n);
    return (n < 10 ? '0' : '') + n;
  }

  function isoDateOrNull(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var parts = value.split('-');
    var y = +parts[0];
    var m = +parts[1];
    var d = +parts[2];
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return value;
  }

  function localTodayIso(now) {
    var parsed = now ? new Date(now) : new Date();
    if (isNaN(parsed.getTime())) parsed = new Date();
    return parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
  }

  function futureIso(value, now) {
    var iso = isoDateOrNull(value);
    if (!iso) return null;
    if (iso < localTodayIso(now)) return null;
    return iso;
  }

  function clock(hour, minute) {
    var hourAbsent = hour == null || hour === '';
    var minuteAbsent = minute == null || minute === '';
    if (hourAbsent && minuteAbsent) return { absent: true };
    function part(value, max) {
      if (typeof value === 'number' && value === Math.floor(value) && value >= 0 && value <= max) return value;
      if (typeof value === 'string' && /^\d{1,2}$/.test(value)) {
        var n = Number(value);
        if (n >= 0 && n <= max) return n;
      }
      return null;
    }
    var h = part(hour, 23);
    var m = part(minute, 59);
    if (h == null || m == null) return { invalid: true };
    return { hour: h, minute: m };
  }

  function addMinutes(dateIso, hour, minute, extra) {
    var parts = dateIso.split('-');
    var dt = new Date(+parts[0], +parts[1] - 1, +parts[2], hour, minute + (extra || 0), 0);
    return {
      dateIso: dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()),
      hour: dt.getHours(),
      minute: dt.getMinutes()
    };
  }

  function wall(dateIso, hour, minute) {
    return dateIso + 'T' + pad(hour) + ':' + pad(minute) + ':00';
  }

  function nextDate(dateIso) {
    var parts = dateIso.split('-');
    var dt = new Date(+parts[0], +parts[1] - 1, +parts[2] + 1);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function oneLine(value, max) {
    var text = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (max && text.length > max) text = text.slice(0, max - 1) + '…';
    return text;
  }

  function firstName(senderName) {
    var name = oneLine(senderName, 80);
    if (!name) return '';
    return name.split(' ')[0];
  }

  function draftBody(input) {
    input = input || {};
    var params = input.params || {};
    var first = firstName(input.senderName);
    var lines = [first ? 'Hi ' + first + ',' : 'Hi,', ''];
    var what = oneLine(params.what, 500);
    var when = oneLine(params.when, 80);
    if (what && when) lines.push('Following up on: ' + what + ' (' + when + ')');
    else if (what) lines.push('Following up on: ' + what);
    else lines.push('Following up on your message below.');
    lines.push('', '[Write your reply here]');
    return lines.join('\n');
  }

  function taskPayload(input) {
    input = input || {};
    var params = input.params || {};
    var label = oneLine(params.title || input.label, 300) || 'Task';
    var who = oneLine(input.senderName, 120);
    var title = (who ? who + ' — ' + label : label).slice(0, 1024);
    var dueIso = futureIso(params.dateIso, input.now);
    var amount = oneLine(params.amount, 40);
    var notes = [];
    if (amount) notes.push('Amount: ' + amount);
    if (dueIso) notes.push('Date: ' + dueIso);
    var from = [who, input.senderEmail ? '<' + oneLine(input.senderEmail, 200) + '>' : ''].filter(Boolean).join(' ');
    if (from) notes.push('From: ' + from);
    if (input.subject) notes.push('Subject: ' + oneLine(input.subject, 200));
    var quote = oneLine(params.what, QUOTE_MAX);
    if (quote) notes.push('Quote: "' + quote + '"');
    if (input.threadUrl) notes.push('Open in Gmail: ' + oneLine(input.threadUrl, 500));
    notes.push(ATTRIBUTION);
    return {
      where: 'Google Tasks',
      title: title,
      notes: notes.join('\n').slice(0, 8000),
      due: dueIso ? dueIso + 'T00:00:00.000Z' : null,
      dueIso: dueIso
    };
  }

  function calendarPayload(input) {
    input = input || {};
    var params = input.params || {};
    var dateIso = isoDateOrNull(params.dateIso);
    if (!dateIso) return { ok: false, reason: 'invalid' };
    var time = clock(params.hour, params.minute);
    if (time.invalid || (params.requireTime && time.absent)) return { ok: false, reason: 'invalid' };
    var summary = oneLine(params.title, 200) || (params.requireTime ? 'Hold' : 'Meeting');
    var lines = [];
    var quote = oneLine(params.quote, QUOTE_MAX);
    if (quote) lines.push(quote);
    if (input.threadUrl) lines.push('Open in Gmail: ' + oneLine(input.threadUrl, 500));
    lines.push(ATTRIBUTION);
    var timeZone = oneLine(input.timeZone, 80) || 'Etc/UTC';
    var body = { summary: summary, description: lines.join('\n') };
    if (!time.absent) {
      var end = addMinutes(dateIso, time.hour, time.minute, DURATION_MIN);
      body.start = { dateTime: wall(dateIso, time.hour, time.minute), timeZone: timeZone };
      body.end = { dateTime: wall(end.dateIso, end.hour, end.minute), timeZone: timeZone };
    } else {
      body.start = { date: dateIso };
      body.end = { date: nextDate(dateIso) };
    }
    return { ok: true, where: 'Google Calendar', body: body, op: params.calendarOp || null };
  }

  return {
    draftBody: draftBody,
    taskPayload: taskPayload,
    calendarPayload: calendarPayload,
    isoDateOrNull: isoDateOrNull,
    ATTRIBUTION: ATTRIBUTION
  };
})();
