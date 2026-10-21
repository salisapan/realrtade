// Glance card host for Gmail on the web and in the Gmail apps on iOS and Android.
// Card Service only. Do it writes one task, one calendar hold, or a scheduled
// event plus its reminder, then reads each write back.
// Undo deletes only when that read still matches. This file never sends mail.

var GLANCE_TASK_LIST = 'Glance';
var UNDO_PREFIX = 'glanceUndo_';
var PREFETCH_KEY = 'glancePrefetch';

function onHomepage(e) {
  var lang = Glance.i18n.locale(localeOf_(e));
  try {
    var existing = readUndo_('prefetch');
    if (existing && existing.view) {
      return [render_(Glance.cards.proof(existing.view, lang, { messageId: 'prefetch', source: 'prefetch', undo: true }))];
    }
    var next = loadPrefetch_();
    if (next) savePrefetch_(next);
    else clearPrefetch_();
    return [render_(Glance.cards.homepage(next, lang))];
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    return [render_(Glance.cards.homepage(null, lang))];
  }
}

function onGmailMessageOpen(e) {
  var lang = Glance.i18n.locale(localeOf_(e));
  var read = emptyRead_(e);
  try {
    var calendarService = noteCalendar_();
    var opened = readOpen_(e, read);
    if (!opened) throw readFail_('open', read);
    var existing = readUndo_(opened.messageId);
    if (existing && existing.view) {
      logOpen_(read, { speak: true, reason: 'proof', planId: existing.view.kind || 'task', calendarService: calendarService });
      return [render_(Glance.cards.proof(existing.view, lang, { messageId: opened.messageId, undo: true }))];
    }
    var decision = judgeOpen_(opened, e);
    logOpen_(read, {
      speak: decision.speak,
      reason: decision.reason,
      planId: decision.planId,
      calendarService: calendarService
    });
    if (!decision.speak) return [render_(Glance.cards.quiet(lang))];
    return [render_(Glance.cards.proposal(decision, opened.messageId, lang))];
  } catch (err) {
    errorLog_(err);
    var snap = err && err.read ? err.read : read;
    logOpen_(snap, { speak: false, reason: 'error', planId: null, calendarService: calendarReady_() });
    return [render_(Glance.cards.readError(lang, err && err.diag ? err.diag : 'open'))];
  }
}

function onDoIt(e) {
  var lang = Glance.i18n.locale(localeOf_(e));
  var job;
  try {
    job = stageDoIt_(e, lang);
  } catch (err) {
    return finishDoError_(err, lang);
  }
  if (job.card) return job.card;
  // requireScopes must not be caught. Apps Script turns that exception
  // into its own authorization prompt. A caught copy never shows it.
  requireScopesNow_(job.scopes);
  try {
    return job.write();
  } catch (err) {
    return finishDoError_(err, lang);
  }
}

function stageDoIt_(e, lang) {
  if (isPrefetch_(e)) {
    var saved = readPrefetch_();
    planLog_({
      speak: !!(saved && saved.title),
      kind: 'task',
      planId: 'prefetch',
      reason: saved && saved.title ? 'prefetch' : 'quiet',
      title: saved && saved.title
    }, 'prefetch');
    if (!saved || !saved.title) return { card: update_(render_(Glance.cards.quiet(lang))) };
    var prior = readUndo_('prefetch');
    if (prior && prior.view) {
      stepLog_({ step: 'proof', messageId: 'prefetch' });
      return { card: update_(render_(Glance.cards.proof(prior.view, lang, { messageId: 'prefetch', source: 'prefetch', undo: true }))) };
    }
    return {
      scopes: scopesForKind_('task'),
      write: function () {
        return finishCreate_({
          title: saved.title,
          due: saved.due || null,
          notes: 'Logged by Glance',
          listId: glanceTaskList_(),
          timeZone: timeZoneOf_(e)
        }, 'prefetch', lang);
      }
    };
  }
  var openedRead = emptyRead_(e);
  var opened = readOpen_(e, openedRead);
  if (!opened) throw readFail_('open', openedRead);
  var existing = readUndo_(opened.messageId);
  if (existing && existing.view) {
    stepLog_({ step: 'proof', messageId: opened.messageId, kind: existing.view.kind || 'task' });
    return { card: update_(render_(Glance.cards.proof(existing.view, lang, { messageId: opened.messageId, undo: true }))) };
  }
  var decision = judgeOpen_(opened, e);
  planLog_(decision, opened.messageId);
  if (!decision.speak) return { card: update_(render_(Glance.cards.quiet(lang))) };
  return {
    scopes: scopesForKind_(decision.kind),
    write: function () {
      return finishDecision_(decision, opened, opened.messageId, lang, timeZoneOf_(e));
    }
  };
}

function onUndo(e) {
  var lang = Glance.i18n.locale(localeOf_(e));
  var job;
  try {
    job = stageUndo_(e, lang);
  } catch (err) {
    return finishUndoError_(err, lang);
  }
  if (job.card) return job.card;
  requireScopesNow_(job.scopes);
  try {
    return job.write();
  } catch (err) {
    return finishUndoError_(err, lang);
  }
}

function stageUndo_(e, lang) {
  var id = undoId_(e);
  var record = id ? readUndo_(id) : null;
  stepLog_({
    step: 'undo',
    messageId: id || '',
    kind: record && record.snapshot ? record.snapshot.kind || 'task' : null
  });
  if (!record || !record.snapshot) {
    stepLog_({ step: 'unconfirmed', reason: 'no-snapshot' });
    return { card: update_(render_(Glance.cards.unconfirmed(lang))) };
  }
  return {
    scopes: scopesForKind_(record.snapshot.kind),
    write: function () {
      var result = undoRecord_(record.snapshot);
      stepLog_({
        step: 'read-back',
        target: record.snapshot.kind || 'task',
        action: result && result.action || null,
        which: result && result.which || null,
        reason: result && result.reason || null
      });
      if (resultNeedsGrant_(result)) {
        var err = new Error((result && result.detail) || 'missing-scope');
        err.name = (result && result.name) || 'Error';
        throw err;
      }
      if (result.action === 'deleted') {
        clearUndo_(id);
        return update_(render_(Glance.cards.undone(lang)));
      }
      if (result.action === 'refuse') return update_(render_(Glance.cards.edited(lang, result.which)));
      stepLog_({ step: 'unconfirmed', reason: (result && (result.reason || result.action)) || 'undo-failed' });
      return update_(render_(Glance.cards.unconfirmed(lang)));
    }
  };
}

function finishDoError_(err, lang) {
  if (authFailure_(err)) {
    console.warn(scopeWarn_(err));
    throw err;
  }
  errorLog_(err);
  if (err && err.diag) return update_(render_(Glance.cards.readError(lang, err.diag)));
  stepLog_({ step: 'unconfirmed', reason: unconfirmedReason_(err) });
  return update_(render_(Glance.cards.unconfirmed(lang)));
}

function finishUndoError_(err, lang) {
  if (authFailure_(err)) {
    console.warn(scopeWarn_(err));
    throw err;
  }
  errorLog_(err);
  stepLog_({ step: 'unconfirmed', reason: unconfirmedReason_(err) });
  return update_(render_(Glance.cards.unconfirmed(lang)));
}

function onAuthCard(e) {
  return render_(Glance.cards.grant(Glance.i18n.locale(localeOf_(e))));
}

function judgeOpen_(opened, e) {
  var now = new Date();
  var timeZone = timeZoneOf_(e);
  var engine = function (raw) { return engineHit_(raw, opened, now); };
  var decision = Glance.intent.resolveTask(opened.body, { now: now, timeZone: timeZone, engine: engine });
  if (!decision.speak && opened.subject) {
    decision = Glance.intent.resolveTask(opened.subject, { now: now, timeZone: timeZone, engine: engine });
  }
  return decision;
}

function engineHit_(text, opened, now) {
  // The same decision every Glance surface makes: FlowIncomingJudge (judgment, quiets, veto, gates, plan). This card only
  // differs in what it can write: a task or a calendar hold. A reply draft in the plan is left to the surfaces that can draft.
  if (typeof Glance.judge === 'function') {
    var judged = Glance.judge({
      text: text,
      subject: opened.subject || '',
      sender: { email: opened.fromEmail || null, name: opened.fromName || null },
      to: opened.toList || [],
      ownAddresses: opened.ownAddresses || [],
      now: now,
      surface: 'gmail',
      attachmentCount: 0
    });
    if (!judged || !judged.show) return { intent: judged ? judged.intent : null, plan: null };
    return { intent: judged.intent, plan: judged.process };
  }
  if (typeof Glance.classify !== 'function' || typeof Glance.plan !== 'function') return null;
  var intent = Glance.classify(text, {
    senderEmail: opened.fromEmail || null,
    senderName: opened.fromName || null,
    now: now,
    calibration: null,
    calibrationByType: null
  });
  if (!intent || !intent.type) return { intent: intent, plan: null };
  return {
    intent: intent,
    plan: Glance.plan(intent, {
      threadUrl: opened.threadUrl || null,
      hasThreadAttachment: false,
      executionMemory: null
    })
  };
}

function finishDecision_(decision, opened, messageId, lang, timeZone) {
  if (decision.kind === 'hold' || decision.kind === 'schedule') {
    return finishCalendar_(decision, opened, messageId, lang, timeZone);
  }
  return finishCreate_({
    title: decision.title,
    due: decision.due || null,
    notes: notesFor_(opened),
    listId: glanceTaskList_(),
    timeZone: timeZone
  }, messageId, lang);
}

function finishCalendar_(decision, opened, messageId, lang, timeZone) {
  stepLog_({
    step: 'write',
    target: 'event',
    title: decision.title,
    dateIso: decision.dateIso,
    hour: Number.isInteger(decision.hour) ? decision.hour : null,
    minute: Number.isInteger(decision.minute) ? decision.minute : null,
    timeZone: timeZone
  });
  var eventResult = Glance.execute.performCreateEvent({
    calendarId: 'primary',
    title: decision.title,
    dateIso: decision.dateIso,
    hour: Number.isInteger(decision.hour) ? decision.hour : null,
    minute: Number.isInteger(decision.minute) ? decision.minute : null,
    timeZone: timeZone || 'Asia/Jerusalem',
    description: eventNotes_(opened, decision.quote)
  }, calendarApi_());
  logReadBack_('event', eventResult);
  if (!eventResult.confirmed || !eventResult.view) return unconfirmedResult_(eventResult, lang, 'event');
  if (decision.kind === 'hold') {
    var holdView = {
      kind: 'hold',
      id: eventResult.view.id,
      title: eventResult.view.title,
      when: eventResult.view.when
    };
    var holdSaved = saveUndo_(messageId, {
      view: holdView,
      snapshot: { kind: 'event', event: eventResult.snapshot }
    });
    return update_(render_(Glance.cards.proof(holdView, lang, {
      messageId: messageId,
      source: 'message',
      undo: holdSaved
    })));
  }
  var listId;
  try { listId = glanceTaskList_(); } catch (err) {
    errorLog_(err);
    stepLog_({ step: 'undo-event', reason: 'task-list' });
    Glance.execute.performUndoEvent(eventResult.snapshot, calendarApi_());
    if (authFailure_(err)) throw err;
    stepLog_({ step: 'unconfirmed', reason: 'task-list' });
    return update_(render_(Glance.cards.unconfirmed(lang)));
  }
  stepLog_({ step: 'write', target: 'task', title: decision.taskTitle, due: decision.taskDue || null });
  var taskResult = Glance.execute.performCreate({
    title: decision.taskTitle,
    due: decision.taskDue || null,
    notes: notesFor_(opened),
    listId: listId,
    timeZone: timeZone
  }, tasksApi_());
  logReadBack_('task', taskResult);
  if (!taskResult.confirmed || !taskResult.view) {
    stepLog_({ step: 'undo-event', reason: (taskResult && taskResult.reason) || 'task-read-back' });
    Glance.execute.performUndoEvent(eventResult.snapshot, calendarApi_());
    return unconfirmedResult_(taskResult, lang, 'task');
  }
  var scheduleView = {
    kind: 'schedule',
    id: eventResult.view.id,
    title: eventResult.view.title,
    when: eventResult.view.when,
    taskId: taskResult.view.id,
    taskTitle: taskResult.view.title,
    taskDue: taskResult.view.due
  };
  var scheduleSaved = saveUndo_(messageId, {
    view: scheduleView,
    snapshot: { kind: 'schedule', event: eventResult.snapshot, task: taskResult.snapshot }
  });
  return update_(render_(Glance.cards.proof(scheduleView, lang, {
    messageId: messageId,
    source: 'message',
    undo: scheduleSaved
  })));
}

function undoRecord_(snapshot) {
  if (snapshot.kind === 'schedule') {
    return Glance.execute.performUndoSchedule(snapshot, { calendar: calendarApi_(), tasks: tasksApi_() });
  }
  if (snapshot.kind === 'event') {
    return Glance.execute.performUndoEvent(snapshot.event, calendarApi_());
  }
  return Glance.execute.performUndo(snapshot, tasksApi_());
}

function eventNotes_(opened, quote) {
  var lines = [];
  if (quote) lines.push(quote);
  if (opened && opened.subject) lines.push('Subject: ' + Glance.intent.sanitizeTitle(opened.subject));
  if (opened && opened.threadUrl) lines.push(opened.threadUrl);
  lines.push('Logged by Glance');
  return lines.join('\n').slice(0, 2000);
}

function finishCreate_(proposal, messageId, lang) {
  stepLog_({ step: 'write', target: 'task', title: proposal.title, due: proposal.due || null });
  var result = Glance.execute.performCreate(proposal, tasksApi_());
  logReadBack_('task', result);
  if (!result.confirmed || !result.view) return unconfirmedResult_(result, lang, 'task');
  var saved = saveUndo_(messageId, { view: result.view, snapshot: result.snapshot });
  return update_(render_(Glance.cards.proof(result.view, lang, {
    messageId: messageId,
    source: messageId === 'prefetch' ? 'prefetch' : 'message',
    undo: saved
  })));
}

function readOpen_(e, read) {
  read = read || emptyRead_(e);
  if (!e || !e.gmail || !e.gmail.messageId) throw readFail_('no-event', read);
  read.messageId = String(e.gmail.messageId);
  if (!e.gmail.accessToken) throw readFail_('no-token', read);
  if (!messageIdOk_(read.messageId)) throw readFail_('bad-id', read);
  read.tokenCalled = true;
  try {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  } catch (err) {
    read.tokenOk = false;
    throw readFail_('token', read, err);
  }
  read.tokenOk = true;
  var message;
  try {
    message = GmailApp.getMessageById(read.messageId);
  } catch (err) {
    throw readFail_('message', read, err);
  }
  if (!message) throw readFail_('message', read);
  var plain;
  var subject;
  var fromRaw;
  var toRaw;
  try {
    plain = String(message.getPlainBody() || '');
    read.plainBodyLength = plain.length;
    subject = String(message.getSubject() || '');
    read.subject = subject.slice(0, 300);
    fromRaw = message.getFrom();
    var parsed = parseFrom_(fromRaw);
    read.from = parsed.email;
    toRaw = typeof message.getTo === 'function' ? message.getTo() : '';
    read.isSelf = isSelfMail_(parsed.email, toRaw);
  } catch (err) {
    throw readFail_('body', read, err);
  }
  var from = parseFrom_(fromRaw);
  var threadId = e.gmail.threadId ? String(e.gmail.threadId) : '';
  return {
    messageId: read.messageId,
    threadId: threadId,
    threadUrl: messageIdOk_(threadId) ? 'https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(threadId) : '',
    body: plain.slice(0, 20000),
    plainBodyLength: plain.length,
    subject: read.subject,
    fromName: from.name,
    fromEmail: from.email,
    isSelf: read.isSelf
  };
}

function messageIdOk_(id) {
  return /^[A-Za-z0-9:_-]{1,200}$/.test(String(id || ''));
}

function emptyRead_(e) {
  var gmail = e && e.gmail;
  return {
    messageId: gmail && gmail.messageId ? String(gmail.messageId) : '',
    tokenCalled: false,
    tokenOk: false,
    subject: '',
    plainBodyLength: null,
    from: '',
    isSelf: false
  };
}

function readFail_(diag, read, cause) {
  var err = new Error(cause && cause.message ? String(cause.message) : String(diag));
  err.name = cause && cause.name ? String(cause.name) : 'Error';
  err.diag = diag;
  err.read = read;
  if (cause && cause.stack) err.stack = cause.stack;
  return err;
}

function errorLog_(err) {
  console.error(
    (err && err.name ? err.name : 'Error') + '\n' +
    (err && err.message ? err.message : String(err)) + '\n' +
    (err && err.stack ? err.stack : '')
  );
}

function stepLog_(fields) {
  console.log(JSON.stringify(fields || {}));
}

function planLog_(decision, messageId) {
  var choice = decision || {};
  stepLog_({
    step: 'plan',
    messageId: messageId || '',
    speak: choice.speak === true,
    kind: choice.kind || null,
    planId: choice.planId || null,
    reason: choice.reason || null,
    title: choice.title || null,
    taskTitle: choice.taskTitle || null,
    dateIso: choice.dateIso || choice.due || null,
    hour: Number.isInteger(choice.hour) ? choice.hour : null,
    minute: Number.isInteger(choice.minute) ? choice.minute : null
  });
}

function logReadBack_(target, result) {
  var view = result && result.view;
  stepLog_({
    step: 'read-back',
    target: target,
    confirmed: !!(result && result.confirmed && view),
    id: view && view.id ? view.id : null,
    reason: result && result.reason || null,
    detail: result && result.detail || null
  });
}

function unconfirmedReason_(err) {
  if (!err) return 'error';
  if (err.diag) return String(err.diag);
  if (err.reason) return String(err.reason);
  return (err.name ? String(err.name) + ': ' : '') + String(err.message || 'error');
}

function unconfirmedResult_(result, lang, target) {
  if (resultNeedsGrant_(result)) {
    var err = new Error((result && result.detail) || 'missing-scope');
    err.name = (result && result.name) || 'AuthorizationException';
    throw err;
  }
  stepLog_({ step: 'unconfirmed', reason: (result && result.reason) || (target + '-read-back') });
  return update_(render_(Glance.cards.unconfirmed(lang)));
}

var SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks';
var SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events';

function scopesForKind_(kind) {
  if (kind === 'hold' || kind === 'event') return [SCOPE_CALENDAR_EVENTS];
  if (kind === 'schedule') return [SCOPE_CALENDAR_EVENTS, SCOPE_TASKS];
  return [SCOPE_TASKS];
}

function authFailure_(err) {
  if (!err) return false;
  var name = String(err.name || '');
  var msg = String(err.message || '');
  if (name === 'AuthorizationException') return true;
  return /insufficient authentication scopes|insufficient permission|specified permissions are not sufficient|have not been authorized|required scope|authorization required|sufficient permissions|missing permissions/i.test(msg);
}

function resultNeedsGrant_(result) {
  if (!result) return false;
  return authFailure_({ name: result.name, message: result.detail || '' });
}

function scopeWarn_(err) {
  return (err && err.name ? err.name : 'Error') + '\n' +
    (err && err.message ? err.message : String(err)) + '\n' +
    (err && err.stack ? err.stack : '');
}

function requireScopesNow_(scopes) {
  console.warn('requireScopes ' + scopes.join(' '));
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, scopes);
  stepLog_({ step: 'scopes', granted: true, scopes: scopes });
}

function raiseGrant_() {
  CardService.newAuthorizationException()
    .setAuthorizationUrl(ScriptApp.getAuthorizationUrl())
    .setCustomUiCallback('onAuthCard')
    .throwException();
}

function logOpen_(read, decision) {
  var snap = read || {};
  var choice = decision || {};
  console.log(JSON.stringify({
    messageId: snap.messageId || '',
    tokenCalled: snap.tokenCalled === true,
    tokenOk: snap.tokenOk === true,
    subject: snap.subject == null ? '' : String(snap.subject).slice(0, 300),
    plainBodyLength: typeof snap.plainBodyLength === 'number' ? snap.plainBodyLength : null,
    from: snap.from || '',
    isSelf: snap.isSelf === true,
    speak: choice.speak === true,
    reason: choice.reason || null,
    planId: choice.planId || null,
    calendarService: choice.calendarService === true
  }));
}

function calendarReady_() {
  return typeof Calendar !== 'undefined' && !!Calendar && !!Calendar.Events && typeof Calendar.Events.insert === 'function';
}

function noteCalendar_() {
  if (calendarReady_()) return true;
  console.error('Calendar advanced service is missing. Push appsscript.json with the Calendar advanced service (userSymbol Calendar, serviceId calendar, version v3) and update the test deployment so calendar.events is granted.');
  return false;
}

function emailsIn_(raw) {
  var found = String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  var out = [];
  for (var i = 0; i < found.length; i++) {
    var email = found[i].toLowerCase();
    if (out.indexOf(email) === -1) out.push(email);
  }
  return out;
}

function isSelfMail_(fromEmail, toRaw) {
  var from = String(fromEmail || '').trim().toLowerCase();
  if (!from || from.indexOf('@') === -1) return false;
  var tos = emailsIn_(toRaw);
  if (!tos.length) return false;
  for (var i = 0; i < tos.length; i++) if (tos[i] !== from) return false;
  return true;
}

function parseFrom_(raw) {
  var text = String(raw || '').trim();
  var match = text.match(/^(.*)<([^>]+)>\s*$/);
  if (!match) return { name: '', email: text.slice(0, 200) };
  return { name: match[1].replace(/"/g, '').trim().slice(0, 120), email: match[2].trim().slice(0, 200) };
}

function notesFor_(opened) {
  var lines = [];
  if (opened.subject) lines.push('Subject: ' + Glance.intent.sanitizeTitle(opened.subject));
  if (opened.threadUrl) lines.push(opened.threadUrl);
  lines.push('Logged by Glance');
  return lines.join('\n').slice(0, 2000);
}

function tasksApi_() {
  return {
    insert: function (listId, resource) { return Tasks.Tasks.insert(resource, listId); },
    get: function (listId, taskId) { return Tasks.Tasks.get(listId, taskId); },
    remove: function (listId, taskId) { Tasks.Tasks.remove(listId, taskId); }
  };
}

function calendarApi_() {
  return {
    insert: function (calendarId, resource) { return Calendar.Events.insert(resource, calendarId); },
    get: function (calendarId, eventId) { return Calendar.Events.get(calendarId, eventId); },
    remove: function (calendarId, eventId) { Calendar.Events.remove(calendarId, eventId); }
  };
}

function glanceTaskList_() {
  var props = PropertiesService.getUserProperties();
  var cached = props.getProperty('glanceTaskListId');
  if (cached && taskListExists_(cached)) return cached;
  var lists = Tasks.Tasklists.list();
  var items = (lists && lists.items) || [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].title === GLANCE_TASK_LIST && items[i].id) {
      props.setProperty('glanceTaskListId', items[i].id);
      return items[i].id;
    }
  }
  var created = Tasks.Tasklists.insert({ title: GLANCE_TASK_LIST });
  if (!created || !created.id) throw new Error('task list was not created');
  props.setProperty('glanceTaskListId', created.id);
  return created.id;
}

function taskListExists_(listId) {
  try {
    var list = Tasks.Tasklists.get(listId);
    return Boolean(list && list.id);
  } catch (err) {
    return false;
  }
}

function loadPrefetch_() {
  var url = scriptProperty_('GLANCE_PREFETCH_URL');
  var result = Glance.prefetch.fetchNext({ url: url, fetch: urlFetch_ });
  return result && result.next ? result.next : null;
}

function urlFetch_(url, options) {
  var res = UrlFetchApp.fetch(url, options || {});
  return { status: res.getResponseCode(), body: res.getContentText() };
}

function scriptProperty_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (err) {
    return '';
  }
}

function localeOf_(e) {
  var common = e && e.commonEventObject;
  return (common && common.userLocale) || (e && e.userLocale) || '';
}

function zoneId_(value) {
  if (value && typeof value === 'object') return zoneId_(value.id);
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

// commonEventObject.timeZone is {id, offset} when useLocaleFromApp is on.
// Take .id first. The script zone in appsscript.json is only a fallback.
function timeZoneOf_(e) {
  var common = e && e.commonEventObject;
  var id = zoneId_(common && common.timeZone);
  if (!id) id = zoneId_(e && e.userTimezone && e.userTimezone.id);
  if (!id && e && e.userTimezone) id = zoneId_(e.userTimezone);
  if (id) return id;
  try {
    if (typeof CalendarApp !== 'undefined' && CalendarApp.getDefaultCalendar) {
      var calendar = CalendarApp.getDefaultCalendar();
      id = zoneId_(calendar && calendar.getTimeZone && calendar.getTimeZone());
      if (id) return id;
    }
  } catch (err) {
    console.warn('calendar zone skipped ' + (err && err.message ? err.message : err));
  }
  try {
    if (typeof Session !== 'undefined' && Session.getScriptTimeZone) {
      id = zoneId_(Session.getScriptTimeZone());
      if (id) return id;
    }
  } catch (err) {
    console.warn('script zone skipped ' + (err && err.message ? err.message : err));
  }
  return 'Asia/Jerusalem';
}

function isPrefetch_(e) {
  var params = e && e.parameters;
  return Boolean(params && (params.source === 'prefetch' || params.messageId === 'prefetch'));
}

function undoId_(e) {
  var params = e && e.parameters;
  var id = params && params.messageId ? String(params.messageId) : '';
  if (id === 'prefetch') return 'prefetch';
  if (messageIdOk_(id)) return id;
  var fromEvent = e && e.gmail && e.gmail.messageId ? String(e.gmail.messageId) : '';
  return messageIdOk_(fromEvent) ? fromEvent : '';
}

function undoKey_(messageId) {
  return UNDO_PREFIX + String(messageId || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

function props_() {
  return PropertiesService.getUserProperties();
}

function readUndo_(messageId) {
  var raw = props_().getProperty(undoKey_(messageId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function saveUndo_(messageId, record) {
  try {
    props_().setProperty(undoKey_(messageId), JSON.stringify(record));
    return true;
  } catch (err) {
    return false;
  }
}

function clearUndo_(messageId) {
  props_().deleteProperty(undoKey_(messageId));
}

function readPrefetch_() {
  var raw = props_().getProperty(PREFETCH_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function savePrefetch_(next) {
  props_().setProperty(PREFETCH_KEY, JSON.stringify({ title: next.title, due: next.due || null }));
}

function clearPrefetch_() {
  props_().deleteProperty(PREFETCH_KEY);
}

function render_(model) {
  var section = CardService.newCardSection();
  var widgets = (model && model.widgets) || [];
  for (var i = 0; i < widgets.length; i++) {
    var widget = widgets[i];
    if (widget.type === 'text') section.addWidget(text_(widget.text));
    if (widget.type === 'button' && widget.action === 'authorize') section.addWidget(authButton_(widget));
    if (widget.type === 'button' && (widget.action === 'onDoIt' || widget.action === 'onUndo')) {
      section.addWidget(button_(widget));
    }
  }
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Glance'))
    .addSection(section)
    .build();
}

function text_(value) {
  var safe = String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return CardService.newTextParagraph().setText(safe);
}

function authButton_(widget) {
  var action = CardService.newAuthorizationAction().setAuthorizationUrl(ScriptApp.getAuthorizationUrl());
  var button = CardService.newTextButton().setText(String(widget.text || '')).setAuthorizationAction(action);
  if (widget.style === 'filled' && CardService.TextButtonStyle && CardService.TextButtonStyle.FILLED) {
    button.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  }
  return button;
}

function button_(widget) {
  var params = {};
  var source = widget.params || {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) params[key] = String(source[key]);
  }
  var action = CardService.newAction()
    .setFunctionName(widget.action)
    .setLoadIndicator(CardService.LoadIndicator.SPINNER)
    .setParameters(params);
  var button = CardService.newTextButton().setText(String(widget.text || '')).setOnClickAction(action);
  if (widget.style === 'filled' && CardService.TextButtonStyle && CardService.TextButtonStyle.FILLED) {
    button.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  }
  return button;
}

function update_(built) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(built))
    .build();
}
