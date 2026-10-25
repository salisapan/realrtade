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

  function englishMonthDayToSlash(segment) {
    var m = String(segment || '').match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})\b/i);
    if (!m) return segment;
    var mo = MONTHS[m[1].toLowerCase()];
    if (!mo) return segment;
    return String(+m[2]) + '/' + String(mo);
  }

  function localizeEngineTitle(text, title) {
    var t = String(title || '');
    if (!t || !mailIsHebrew(text)) return sanitizeTitle(t);
    if (!/\bby\b/i.test(t) && !/reply requested/i.test(t) && !/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)) return sanitizeTitle(t);
    t = t.replace(/\s+by\s+/gi, ' עד ');
    t = t.replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}\b/gi, englishMonthDayToSlash);
    return sanitizeTitle(t);
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

  function readerNameList(ctx) {
    var names = [];
    if (ctx && ctx.userName) names.push(String(ctx.userName).toLowerCase());
    if (ctx && ctx.ownNames) {
      for (var i = 0; i < ctx.ownNames.length; i++) {
        if (ctx.ownNames[i]) names.push(String(ctx.ownNames[i]).toLowerCase());
      }
    }
    if (ctx && ctx.readerEmail) {
      var local = String(ctx.readerEmail).split('@')[0] || '';
      if (local) {
        names.push(local.toLowerCase());
        names.push(local.replace(/[._-]+/g, ' ').toLowerCase());
      }
    }
    return names;
  }

  function nameIsReader(name, ctx) {
    var who = String(name || '').toLowerCase().replace(/[^\w\u0590-\u05FF'’\s-]/g, '').trim();
    if (!who) return false;
    var list = readerNameList(ctx);
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (who === n || who.indexOf(n) !== -1 || n.indexOf(who) !== -1) return true;
    }
    return false;
  }

  function nameMatchesRecipient(who, recipients) {
    if (typeof FlowNameMatch !== 'undefined' && FlowNameMatch.matchesRecipient) {
      return FlowNameMatch.matchesRecipient(who, recipients);
    }
    var name = String(who || '').toLowerCase().replace(/[^\w\u0590-\u05FF'’\s-]/g, '').trim();
    if (!name || !recipients || !recipients.length) return false;
    for (var i = 0; i < recipients.length; i++) {
      var r = recipients[i] || {};
      var display = String(r.name || '').toLowerCase().trim();
      var local = String(r.localPart || (r.email ? r.email.split('@')[0] : '') || '').toLowerCase();
      if (display && (name === display || name.indexOf(display) !== -1 || display.indexOf(name) !== -1)) return true;
      if (local && (name === local || name.replace(/\s+/g, '') === local.replace(/[._-]+/g, ''))) return true;
    }
    return false;
  }

  function readerInTo(ctx) {
    var email = String((ctx && ctx.readerEmail) || '').toLowerCase();
    if (!email) return true;
    var all = ((ctx && ctx.toRecipients) || []).concat((ctx && ctx.ccRecipients) || []);
    if (!all.length) return true;
    for (var i = 0; i < all.length; i++) {
      if (all[i] && String(all[i].email || '').toLowerCase() === email) return true;
    }
    return false;
  }

  function greetOnly(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    return /^(?:hi|hello|hey)\s+[A-Za-z][\w'’-]*\s*[!?.]?$/i.test(t)
      || /^(?:שלום|היי|הי)\s+[\u0590-\u05FF][\u0590-\u05FF'’\s-]*\s*[!?.]?$/u.test(t);
  }

  function greetingToOther(text, ctx) {
    var raw = String(text || '');
    var m = raw.match(/^(?:hi|hello|hey)(?:\s+there)?\s+([^,!\n]{1,40})[,!]/i);
    var hm = raw.match(/^(?:שלום|היי|הי)\s+([^,!\n]{1,40})(?:[,!]|\s*$)/);
    var who = m ? m[1].trim() : (hm ? hm[1].trim() : '');
    if (!who) return false;
    if (/^(there|team|all|everyone)$/i.test(who)) return false;
    if (nameIsReader(who, ctx)) return false;
    if (!readerInTo(ctx)) return true;
    var others = ((ctx && ctx.toRecipients) || []).concat((ctx && ctx.ccRecipients) || []).filter(function (r) {
      return r && String(r.email || '').toLowerCase() !== String((ctx && ctx.readerEmail) || '').toLowerCase();
    });
    return nameMatchesRecipient(who, others);
  }

  function relayTargetIsThirdParty(who) {
    var name = String(who || '').toLowerCase().replace(/[^\w\u0590-\u05FF'’\s-]/g, '').trim();
    if (!name) return false;
    if (/^(you|ya|u|me|us|your|yours|yourself|yourselves)$/.test(name)) return false;
    if (/^(לך|לכם|לי|לנו|אותך|אתכם|אותי)$/.test(name)) return false;
    return true;
  }

  function taskTitleIsMeaningful(title) {
    var t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2) return false;
    if (/^handle this note$/i.test(t)) return false;
    if (t === 'לטפל בהערה') return false;
    return true;
  }

  function stripSignatureFromText(text) {
    var lines = String(text || '').split('\n');
    var end = lines.length;
    while (end > 0 && !String(lines[end - 1] || '').trim()) end--;
    while (end > 0) {
      var line = String(lines[end - 1] || '').trim();
      if (!line) {
        end--;
        continue;
      }
      if (/^(?:thanks|thank you|best|regards|cheers|sincerely),?\.?$/i.test(line)) {
        end--;
        continue;
      }
      if (/^(?:תודה|בברכה|יום נעים),?\.?$/i.test(line)) {
        end--;
        continue;
      }
      if (lines.length > 1 && line.split(/\s+/).length === 1 && !/[.!?,:]/.test(line) && /^[\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z'’-]{0,50}$/.test(line)) {
        end--;
        continue;
      }
      break;
    }
    return lines.slice(0, end).join('\n').trim();
  }

  function mailLang(text) {
    return mailIsHebrew(text) ? 'he' : 'en';
  }

  function spottedSheetPlan(prepared, hit) {
    if (/\b(?:send|email|forward)\s+me\b[^.\n]{0,100}\b(?:sheet|spreadsheet|balance\s+sheet)\b/i.test(prepared)) return null;
    if (!/\b(?:sheet|spreadsheet|excel)\b|(?:גיליון|טבלה|אקסל)/i.test(prepared)) return null;
    var writeEn = /\b(?:record|add|put|enter|update|fill|log)\b/i;
    var writeEnAsk = /\b(?:can|could|would)\s+you\b[^.\n]{0,80}\b(?:record|add|put|enter|update|fill|log)\b/i;
    var writeHe = /(?:רשום|תרשום|להוסיף|לעדכן|להכניס|למלא|תמלא|תעדכן|תוסיף)/;
    if (writeEn.test(prepared) || writeEnAsk.test(prepared) || writeHe.test(prepared)) return 'sheet';
    if (hit && hit.intent && hit.intent.signals && hit.intent.signals.workAsk) return 'sheet';
    return null;
  }

  function localRelayQuiet(raw) {
    var text = String(raw || '');
    if (/\b(?:please\s+)?remind\s+me\b/i.test(text)) return false;
    if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+לי|להזכיר\s+לי|אל\s+תשכח(?:י|ו)?\s+לי)\b/.test(text)) return false;
    var enForgetRelay = text.match(/\b(?:please\s+)?(?:do not|don't|dont)\s+forget\s+to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
    if (enForgetRelay && relayTargetIsThirdParty(enForgetRelay[1])) return true;
    var enRememberRelay = text.match(/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
    if (enRememberRelay && relayTargetIsThirdParty(enRememberRelay[1])) return true;
    var enVerb = text.match(/\b(?:remind|tell|ask|notify|ping|nudge)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\s+(?:to|that)\b/i);
    if (enVerb && relayTargetIsThirdParty(enVerb[1])) return true;
    if (/אל\s+תשכח\s+להזכיר\s+ל(?!י(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותך|אתכם|אותי)/.test(text)) return true;
    if (/תזכור\s+ל(?:הזכיר|זכיר)\s+ל(?!י(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותך|אתכם|אותי)[\u0590-\u05FF]{2,}/.test(text)) return true;
    if (/תזכור\s+לשאול\s+את\s+/.test(text)) return true;
    if (/תזכור\s+להגיד\s+ל(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותי|אותנו)/.test(text)) return true;
    if (/להגיד\s+ל(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותי|אותנו)[\u0590-\u05FF]{2,}/.test(text)) return true;
    if (/לעדכן\s+אות(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|כם)/.test(text)) return true;
    return false;
  }

  function localRemember(text, ctx) {
    var now = ctx && ctx.now;
    var timeZone = ctx && ctx.timeZone;
    var raw = collapse(text);
    if (!raw || raw.length > 8000) return null;
    if (localRelayQuiet(raw)) return null;
    if (greetingToOther(raw, ctx)) return null;
    raw = raw.replace(/^(?:hi|hello|hey)(?:\s+[^,!\n]{1,40})?[,!]\s*/i, '');
    raw = raw.replace(/^dear\s+[^,]{1,40},\s+/i, '');
    raw = raw.replace(/^(?:שלום|היי|הי)\s+[^,!\n]{1,40}[,!]\s*/, '');
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
  var ADDON_UNSUPPORTED_PLAN = {
    'reply-fact': true,
    'file-it': true,
    'attach-invite': true,
    'create-missing': true,
    'file-on-hold': true,
    'file-on-task': true,
    'clear-it': true,
    'move-it': true
  };

  function mapEngine(result, now, timeZone, sourceText) {
    if (!result || !result.plan || !result.plan.steps) return null;
    var planId = String(result.plan.id || '');
    if (ADDON_UNSUPPORTED_PLAN[planId]) return null;
    var steps = result.plan.steps;
    if (planId === 'reply-track') {
      steps = steps.filter(function (st) { return st && st.kind === 'googleTask'; });
      if (!steps.length) return null;
    }
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
      if (!taskTitleIsMeaningful(title) && result.intent && result.intent.entities) {
        var alt = result.intent.entities.requestWhat || result.intent.entities.what;
        if (alt) title = sanitizeTitle(alt);
      }
      if (!taskTitleIsMeaningful(title)) return null;
      var dueIso = isoOrNull(taskParams.dateIso, now, timeZone);
      if (planId === 'reply-track') {
        title = replyTrackCardTitle(sourceText || '', title, dueIso);
      }
      title = localizeEngineTitle(sourceText || '', title);
      return {
        speak: true,
        source: 'engine',
        kind: 'task',
        title: title,
        due: dueIso,
        lang: mailLang(sourceText || ''),
        reason: 'task',
        planId: result.plan.id || 'task'
      };
    }
    if (steps.length === 1 && steps[0].kind === 'calendar' && result.plan.id === 'hold') {
      var holdParams = steps[0].params || {};
      var holdClock = clockOf(holdParams);
      var holdDate = isoOrNull(holdParams.dateIso, now, timeZone);
      var holdTitle = sanitizeTitle(holdParams.title || '');
      if (!holdClock || !holdDate || !holdTitle) return null;
      if (holdParams.requireTime === false && !holdClock) return null;
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
        lang: mailLang(sourceText || ''),
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
        lang: mailLang(sourceText || ''),
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
    var en = raw.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})\b/i);
    if (en) {
      var mo = MONTHS[en[1].toLowerCase()];
      if (mo) return String(+en[2]) + '/' + String(mo);
    }
    return '';
  }

  function replyTrackCardTitle(text, rawTitle, dueIso) {
    var title = String(rawTitle || '').trim();
    var he = mailIsHebrew(text);
    var isReplyLabel = /^reply requested\b/i.test(title) || (he && /^נדרשת תשובה/.test(title));
    if (!isReplyLabel && !(he && /reply requested/i.test(title))) return sanitizeTitle(title);
    var sendReportEn = /\b(?:please\s+)?send\b[^.\n]{0,80}\breport\b/i.test(text);
    var sendReportHe = /(?:בבקשה\s+)?תשלח[^.\n]{0,80}דוח/.test(text);
    if (sendReportEn || sendReportHe) {
      var dueSend = writtenDate(text, dueIso || '');
      if (he) return dueSend ? sanitizeTitle('תשלח את הדוח עד ' + dueSend) : sanitizeTitle('תשלח את הדוח');
      return dueSend ? sanitizeTitle('Send the report by ' + dueSend) : sanitizeTitle('Send the report');
    }
    var payEn = /\b(?:please\s+)?pay\b[^.\n]{0,100}\binvoice\b/i.test(text);
    var payHe = /(?:בבקשה\s+)?(?:ל)?שלם[^.\n]{0,100}חשבונית/.test(text);
    if (payEn || payHe) {
      var amt = title.match(/,\s*((?:₪|\$|€|£)\s?[\d,]+(?:\.\d+)?)\s*$/);
      if (!amt) amt = String(text || '').match(/((?:₪|\$|€|£)\s?[\d,]+(?:\.\d+)?)/);
      if (!amt) {
        var amtAfter = String(text || '').match(/([\d,]+(?:\.\d+)?)\s*(₪|\$|€|£)/);
        if (amtAfter) amt = [amtAfter[0], amtAfter[2] + amtAfter[1]];
      }
      var suffix = amt ? ', ' + String(amt[1] || amt[0]).trim() : '';
      if (he) {
        if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i.test(String(text || ''))) {
          var dueEn = writtenDate(text, dueIso || '');
          if (dueEn) return sanitizeTitle('לשלם חשבונית' + suffix + ' עד ' + dueEn);
        }
        return sanitizeTitle('לשלם חשבונית' + suffix);
      }
      return sanitizeTitle('Pay invoice' + suffix);
    }
    var due = writtenDate(text, dueIso || '');
    if (he) {
      if (due) return sanitizeTitle('להשיב עד ' + due);
      return 'נדרשת תשובה';
    }
    if (due) return sanitizeTitle('Reply by ' + due);
    return 'Reply requested';
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
    var bodyText = stripSignatureFromText(prepared);
    if (greetingToOther(prepared, ctx) || greetingToOther(bodyText, ctx)) return silence('hedge', null);
    var local = localRemember(bodyText, ctx);
    if (local) return local;
    if (typeof ctx.engine === 'function') {
      var hit = null;
      try { hit = ctx.engine(bodyText); } catch (err) {
        err.diag = err.diag || 'judge';
        throw err;
      }
      var sheetOnly = spottedSheetPlan(bodyText, hit);
      if (hit && hit.reason && String(hit.reason).indexOf('quiet:') === 0) {
        if (sheetOnly) {
          return silence('dropped', sheetOnly, { droppedPlanId: sheetOnly, intentType: hit && hit.intent && hit.intent.type ? hit.intent.type : null });
        }
        return silence(String(hit.reason).slice(6), null);
      }
      if (sheetOnly) {
        return silence('dropped', sheetOnly, { droppedPlanId: sheetOnly, intentType: hit && hit.intent && hit.intent.type ? hit.intent.type : null });
      }
      var mapped = mapEngine(hit, ctx.now, ctx.timeZone, bodyText);
      if (mapped) return contentTitle(prepared, mapped);
      if (hit && hit.plan && hit.plan.id) {
        var dropId = spottedSheetPlan(prepared, hit) || hit.plan.id;
        return silence('dropped', dropId, {
          droppedPlanId: dropId,
          intentType: hit.intent && hit.intent.type ? hit.intent.type : null
        });
      }
      if (hit && hit.intent && !hit.intent.type) return silence('intent-null', null);
      if (greetOnly(bodyText) || greetOnly(prepared)) return silence('hedge', null);
      return silence('no-plan', null);
    }
    if (ctx.classifierResult) {
      var fromApi = mapClassifierResult(ctx.classifierResult, ctx.now, ctx.timeZone);
      if (fromApi) return fromApi;
    }
    if (greetOnly(bodyText) || greetOnly(prepared)) return silence('hedge', null);
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
    replyTrackCardTitle: replyTrackCardTitle,
    silence: silence
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceIntent;
