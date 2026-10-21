// One close the host can write, or silence.
//
// Order: an explicit "please remember to" / "don't forget" / "תזכיר לי"
// ask is a task even when the shared classifier would plan a meeting or a
// draft. Otherwise the shared classifier is asked.
// One Google Task stays a task. A calendar hold (one timed event) stays a
// hold. A schedule plan (one event plus one reminder task) stays that plan.
// A draft, a file, or any other shape stays quiet.
// This file does not write and does not send.

var GlanceIntent = (function () {
  var MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
    december: 12, dec: 12
  };
  var DAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

  function collapse(value) {
    return String(value == null ? '' : value).replace(/[\u2018\u2019\u201B]/g, "'").replace(/\s+/g, ' ').trim();
  }

  function sanitizeTitle(value) {
    var text = collapse(value).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F]/g, '').trim();
    if (text.length > 300) text = text.slice(0, 299) + '…';
    return text;
  }

  function pad(n) {
    n = Number(n);
    return (n < 10 ? '0' : '') + n;
  }

  function todayIso(now, timeZone) {
    var date = now ? new Date(now) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    try {
      var fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      var parts = fmt.formatToParts(date);
      var y = '';
      var m = '';
      var d = '';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'year') y = parts[i].value;
        if (parts[i].type === 'month') m = parts[i].value;
        if (parts[i].type === 'day') d = parts[i].value;
      }
      if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(d)) return y + '-' + m + '-' + d;
    } catch (err) { /* UTC below */ }
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function validIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var parts = iso.split('-');
    var y = +parts[0];
    var m = +parts[1];
    var d = +parts[2];
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function addDays(iso, days) {
    var parts = iso.split('-');
    var dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + days));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function notPast(iso, now, timeZone) {
    if (!validIso(iso)) return null;
    if (iso < todayIso(now, timeZone)) return null;
    return iso;
  }

  function pullDue(text, now, timeZone) {
    var rest = text;
    var due = null;
    function accept(iso, raw) {
      var kept = notPast(iso, now, timeZone);
      if (!kept) return false;
      due = kept;
      rest = rest.replace(raw, ' ');
      return true;
    }

    var iso = rest.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) accept(iso[1], iso[0]);

    if (!due) {
      var dmy = rest.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
      if (dmy) accept(dmy[3] + '-' + pad(dmy[2]) + '-' + pad(dmy[1]), dmy[0]);
    }

    if (!due) {
      var named = rest.match(/\b(?:by|on|due|before|until)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/i);
      if (named) {
        var month = MONTHS[named[1].toLowerCase()];
        var year = named[3] ? +named[3] : +todayIso(now, timeZone).slice(0, 4);
        var candidate = year + '-' + pad(month) + '-' + pad(named[2]);
        if (!notPast(candidate, now, timeZone) && !named[3]) candidate = (year + 1) + '-' + pad(month) + '-' + pad(named[2]);
        accept(candidate, named[0]);
      }
    }

    if (!due) {
      var weekday = rest.match(/\b(?:by|on|due)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i);
      if (weekday) {
        var today = todayIso(now, timeZone);
        var current = new Date(today + 'T00:00:00Z').getUTCDay();
        var target = DAYS[weekday[1].toLowerCase()];
        var delta = (target - current + 7) % 7;
        accept(addDays(today, delta), weekday[0]);
      }
    }

    if (!due) {
      var word = rest.match(/(?:^|\s)(tomorrow)(?=\s|[.,]|$)/i) || rest.match(/(?:^|\s)(מחר)(?=\s|[.,]|$)/);
      if (word) accept(addDays(todayIso(now, timeZone), 1), word[0]);
    }

    rest = collapse(rest)
      .replace(/\b(?:by|on|due|before|until)\b(?=\s*[.,;:]?\s*$)/i, '')
      .replace(/\s+עד(?=\s*[.,;:]?\s*$)/, '')
      .replace(/[.,;:\-–—]+$/g, '')
      .trim();
    rest = collapse(rest);
    return { due: due, text: rest };
  }

  function localRemember(text, now, timeZone) {
    var raw = collapse(text);
    if (!raw || raw.length > 8000) return null;
    raw = raw.replace(/^(?:hi|hello|hey)(?:\s+[^,]{1,40})?[,!]?\s+/i, '');
    raw = raw.replace(/^dear\s+[^,]{1,40},\s+/i, '');
    raw = raw.replace(/^(?:שלום|היי|הי)\s*[,!]?\s+/, '');
    var match = raw.match(/^(?:please remember to|(?:do not|don't|dont) forget(?: to)?)\s+(.+)$/i);
    var lang = 'en';
    if (!match) {
      match = raw.match(/^תזכיר(?:י)?\s+לי\s+(.+)$/);
      if (match) lang = 'he';
    }
    if (!match) {
      match = raw.match(/^אל תשכח(?:י)?\s+(.+)$/);
      if (match) lang = 'he';
    }
    if (!match) return null;
    var pulled = pullDue(match[1], now, timeZone);
    var title = sanitizeTitle(pulled.text);
    if (!title || title.length < 2) return null;
    return { speak: true, source: 'local', kind: 'task', title: title, due: pulled.due, lang: lang, reason: 'local', planId: null };
  }

  function isoOrNull(value, now, timeZone) {
    if (typeof value !== 'string' || !validIso(value)) return null;
    return notPast(value, now, timeZone);
  }

  function clockOf(params) {
    if (!params) return null;
    var hour = params.hour;
    var minute = params.minute;
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour: hour, minute: minute };
  }

  function stepKind(step) {
    return step && step.kind;
  }

  // A draft or a file step is not rewritten into a task or an event.
  function mapEngine(result, now, timeZone) {
    if (!result || !result.plan || !result.plan.steps) return null;
    var steps = result.plan.steps;
    if (!steps.length) return null;
    // The shared plan may carry a reply draft beside the task ("Draft reply" + "Task"). This card writes no draft, so it
    // offers the task or hold step only; the detection is the same one every surface made.
    var writable = steps.filter(function (st) { var k = stepKind(st); return k === 'googleTask' || k === 'calendar'; });
    if (writable.length && writable.length < steps.length && steps.every(function (st) { var k = stepKind(st); return k === 'googleTask' || k === 'calendar' || k === 'gmailDraft' || k === 'outlookDraft'; })) {
      steps = writable;
    }
    for (var i = 0; i < steps.length; i++) {
      var kind = stepKind(steps[i]);
      var params = (steps[i] && steps[i].params) || {};
      if (params.send === true) return null;
      if (kind !== 'googleTask' && kind !== 'calendar') return null;
      if (params.calendarOp === 'delete' || params.calendarOp === 'update') return null;
    }
    if (steps.length === 1 && steps[0].kind === 'googleTask') {
      var taskParams = steps[0].params || {};
      var title = sanitizeTitle(taskParams.title || taskParams.what || steps[0].label || '');
      if (!title) return null;
      return {
        speak: true,
        source: 'engine',
        kind: 'task',
        title: title,
        due: isoOrNull(taskParams.dateIso, now, timeZone),
        lang: null,
        reason: 'task',
        planId: result.plan.id || 'task'
      };
    }
    if (steps.length === 1 && steps[0].kind === 'calendar' && result.plan.id === 'hold') {
      var holdParams = steps[0].params || {};
      var holdClock = clockOf(holdParams);
      var holdDate = isoOrNull(holdParams.dateIso, now, timeZone);
      var holdTitle = sanitizeTitle(holdParams.title || '');
      if (!holdClock || !holdDate || !holdTitle || holdParams.requireTime === false) return null;
      return {
        speak: true,
        source: 'engine',
        kind: 'hold',
        title: holdTitle,
        due: holdDate,
        dateIso: holdDate,
        hour: holdClock.hour,
        minute: holdClock.minute,
        quote: sanitizeTitle(holdParams.quote || ''),
        lang: null,
        reason: 'hold',
        planId: 'hold'
      };
    }
    if (steps.length === 2 && result.plan.id === 'schedule') {
      var calendarStep = null;
      var taskStep = null;
      for (var s = 0; s < steps.length; s++) {
        if (steps[s].kind === 'calendar') calendarStep = steps[s];
        if (steps[s].kind === 'googleTask') taskStep = steps[s];
      }
      if (!calendarStep || !taskStep) return null;
      var calendarParams = calendarStep.params || {};
      var reminderParams = taskStep.params || {};
      var clock = clockOf(calendarParams);
      if (calendarParams.requireTime && !clock) return null;
      var dateIso = isoOrNull(calendarParams.dateIso, now, timeZone);
      var calendarTitle = sanitizeTitle(calendarParams.title || '');
      var taskTitle = sanitizeTitle(reminderParams.title || reminderParams.what || '');
      if (!dateIso || !calendarTitle || !taskTitle) return null;
      return {
        speak: true,
        source: 'engine',
        kind: 'schedule',
        title: calendarTitle,
        due: dateIso,
        dateIso: dateIso,
        hour: clock ? clock.hour : null,
        minute: clock ? clock.minute : null,
        quote: sanitizeTitle(calendarParams.quote || ''),
        taskTitle: taskTitle,
        taskDue: isoOrNull(reminderParams.dateIso, now, timeZone),
        lang: null,
        reason: 'schedule',
        planId: 'schedule'
      };
    }
    return null;
  }

  // glance-assist action "classify" shape. A request or an event is not a
  // task on this host. Commitment, decision, and follow-up are.
  function mapClassifierResult(body, now, timeZone) {
    var parsed = body;
    if (typeof body === 'string') {
      try { parsed = JSON.parse(body); } catch (err) { return null; }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    var result = parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed;
    if (!result || typeof result.type !== 'string') return null;
    if (result.type !== 'commitment' && result.type !== 'decision' && result.type !== 'followup') return null;
    var title = sanitizeTitle(result.what || result.requestWhat || '');
    if (!title) return null;
    return {
      speak: true,
      source: 'classifier',
      kind: 'task',
      title: title,
      due: isoOrNull(result.dateIso, now, timeZone),
      lang: null,
      reason: 'classifier',
      planId: null
    };
  }

  // Same invisible-format strip the extension applies before it judges,
  // then the same quote cut (FlowJudgment.newContent) so a flattened
  // getPlainBody does not judge the quoted history.
  function prepareText(text) {
    var raw = String(text == null ? '' : text)
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u202F]/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    if (typeof FlowJudgment !== 'undefined' && typeof FlowJudgment.newContent === 'function') {
      return FlowJudgment.newContent(raw);
    }
    return raw;
  }

  // Card chrome follows the Gmail locale. The title written on the event
  // and the reminder comes from the mail. A Hebrew meeting keeps its noun,
  // the date as written, and the clock. An English meeting keeps the
  // classifier's short label.
  var MEETING_NOUNS_HE = [
    'שיחת טלפון', 'פגישת עבודה', 'שיחת זום', 'שיחת וידאו', 'עמידה יומית',
    'פגישה', 'שיחה', 'ראיון', 'סנכרון', 'תיאום', 'ייעוץ', 'הדגמה', 'מפגש', 'ועידה'
  ];

  function mailIsHebrew(text) {
    var raw = String(text || '');
    var he = (raw.match(/[\u0590-\u05FF]/g) || []).length;
    var en = (raw.match(/[A-Za-z]/g) || []).length;
    return he > 0 && he >= en;
  }

  function meetingNoun(text) {
    var raw = String(text || '');
    for (var i = 0; i < MEETING_NOUNS_HE.length; i++) {
      if (raw.indexOf(MEETING_NOUNS_HE[i]) !== -1) return MEETING_NOUNS_HE[i];
    }
    return 'פגישה';
  }

  function writtenDate(text, dateIso) {
    var raw = String(text || '');
    var re = /(\d{1,2})[./](\d{1,2})(?:[./]\d{2,4})?/g;
    var match;
    var fallback = '';
    var wantDay = null;
    var wantMonth = null;
    if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      var bits = dateIso.split('-');
      wantMonth = +bits[1];
      wantDay = +bits[2];
    }
    while ((match = re.exec(raw))) {
      var shown = String(+match[1]) + '/' + String(+match[2]);
      if (!fallback) fallback = shown;
      if (wantDay != null && +match[1] === wantDay && +match[2] === wantMonth) return shown;
    }
    if (fallback) return fallback;
    if (wantDay != null) return String(wantDay) + '/' + String(wantMonth);
    return '';
  }

  function contentTitle(text, decision) {
    if (!decision || (decision.kind !== 'schedule' && decision.kind !== 'hold')) return decision;
    if (!mailIsHebrew(text)) return decision;
    var datePart = writtenDate(text, decision.dateIso || decision.due || '');
    var timePart = '';
    if (Number.isInteger(decision.hour) && Number.isInteger(decision.minute)) {
      timePart = pad(decision.hour) + ':' + pad(decision.minute);
    }
    var title = meetingNoun(text);
    if (datePart) title += ' ' + datePart;
    if (timePart) title += ' ' + timePart;
    decision.title = sanitizeTitle(title);
    if (decision.kind === 'schedule') decision.taskTitle = decision.title;
    return decision;
  }

  function silence(reason, planId, extra) {
    extra = extra || {};
    return {
      speak: false,
      source: null,
      kind: null,
      title: null,
      due: null,
      lang: null,
      reason: reason || 'quiet',
      planId: planId || null,
      droppedPlanId: extra.droppedPlanId || planId || null,
      intentType: extra.intentType || null
    };
  }

  function resolveTask(text, ctx) {
    ctx = ctx || {};
    var prepared;
    try { prepared = prepareText(text); } catch (err) {
      err.diag = err.diag || 'judge';
      throw err;
    }
    var local = localRemember(prepared, ctx.now, ctx.timeZone);
    if (local) return local;
    if (typeof ctx.engine === 'function') {
      var hit = null;
      try { hit = ctx.engine(prepared, ctx); } catch (err) {
        err.diag = err.diag || 'judge';
        throw err;
      }
      var mapped = mapEngine(hit, ctx.now, ctx.timeZone);
      if (mapped) return contentTitle(prepared, mapped);
      if (hit && hit.plan && hit.plan.id) {
        return silence('dropped', hit.plan.id, {
          droppedPlanId: hit.plan.id,
          intentType: hit.intent && hit.intent.type ? hit.intent.type : null
        });
      }
      if (hit && hit.intent && !hit.intent.type) return silence('intent-null', null);
      return silence('no-plan', null);
    }
    if (ctx.classifierResult) {
      var fromApi = mapClassifierResult(ctx.classifierResult, ctx.now, ctx.timeZone);
      if (fromApi) return fromApi;
    }
    return silence('quiet', null);
  }

  return {
    resolveTask: resolveTask,
    localRemember: localRemember,
    mapEngine: mapEngine,
    mapClassifierResult: mapClassifierResult,
    sanitizeTitle: sanitizeTitle,
    prepareText: prepareText,
    contentTitle: contentTitle,
    silence: silence
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceIntent;
