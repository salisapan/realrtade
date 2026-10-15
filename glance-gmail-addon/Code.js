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
  try {
    if (isPrefetch_(e)) {
      var saved = readPrefetch_();
      if (!saved || !saved.title) return update_(render_(Glance.cards.quiet(lang)));
      var prior = readUndo_('prefetch');
      if (prior && prior.view) {
        return update_(render_(Glance.cards.proof(prior.view, lang, { messageId: 'prefetch', source: 'prefetch', undo: true })));
      }
      return finishCreate_({
        title: saved.title,
        due: saved.due || null,
        notes: 'Logged by Glance',
        listId: glanceTaskList_()
      }, 'prefetch', lang);
    }
    var openedRead = emptyRead_(e);
    var opened = readOpen_(e, openedRead);
    if (!opened) throw readFail_('open', openedRead);
    var existing = readUndo_(opened.messageId);
    if (existing && existing.view) {
      return update_(render_(Glance.cards.proof(existing.view, lang, { messageId: opened.messageId, undo: true })));
    }
    var decision = judgeOpen_(opened, e);
    if (!decision.speak) return update_(render_(Glance.cards.quiet(lang)));
    return finishDecision_(decision, opened, opened.messageId, lang, timeZoneOf_(e));
  } catch (err) {
    errorLog_(err);
    if (err && err.diag) return update_(render_(Glance.cards.readError(lang, err.diag)));
    return update_(render_(Glance.cards.unconfirmed(lang)));
  }
}

function onUndo(e) {
  var lang = Glance.i18n.locale(localeOf_(e));
  try {
    var id = undoId_(e);
    var record = id ? readUndo_(id) : null;
    if (!record || !record.snapshot) return update_(render_(Glance.cards.unconfirmed(lang)));
    var result = undoRecord_(record.snapshot);
    if (result.action === 'deleted') {
      clearUndo_(id);
      return update_(render_(Glance.cards.undone(lang)));
    }
    if (result.action === 'refuse') return update_(render_(Glance.cards.edited(lang, result.which)));
    return update_(render_(Glance.cards.unconfirmed(lang)));
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    return update_(render_(Glance.cards.unconfirmed(lang)));
  }
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
  if (typeof Glance.classify !== 'function' || typeof Glance.plan !== 'function') return null;
  // A mail the person sent to themself is still judged. senderIsUser is not set.
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
    listId: glanceTaskList_()
  }, messageId, lang);
}

function finishCalendar_(decision, opened, messageId, lang, timeZone) {
  var eventResult = Glance.execute.performCreateEvent({
    calendarId: 'primary',
    title: decision.title,
    dateIso: decision.dateIso,
    hour: Number.isInteger(decision.hour) ? decision.hour : null,
    minute: Number.isInteger(decision.minute) ? decision.minute : null,
    timeZone: timeZone || 'Etc/UTC',
    description: eventNotes_(opened, decision.quote)
  }, calendarApi_());
  if (!eventResult.confirmed || !eventResult.view) return update_(render_(Glance.cards.unconfirmed(lang)));
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
    Glance.execute.performUndoEvent(eventResult.snapshot, calendarApi_());
    return update_(render_(Glance.cards.unconfirmed(lang)));
  }
  var taskResult = Glance.execute.performCreate({
    title: decision.taskTitle,
    due: decision.taskDue || null,
    notes: notesFor_(opened),
    listId: listId
  }, tasksApi_());
  if (!taskResult.confirmed || !taskResult.view) {
    Glance.execute.performUndoEvent(eventResult.snapshot, calendarApi_());
    return update_(render_(Glance.cards.unconfirmed(lang)));
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
  var result = Glance.execute.performCreate(proposal, tasksApi_());
  if (!result.confirmed || !result.view) return update_(render_(Glance.cards.unconfirmed(lang)));
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

function timeZoneOf_(e) {
  var common = e && e.commonEventObject;
  return (common && common.timeZone) || 'Etc/UTC';
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
