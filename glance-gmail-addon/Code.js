// Glance Gmail Add-on host. Card Service only, so the same card runs in
// Gmail on the web and in the Gmail apps on iOS and Android.
//
// One button, Do It, writes a Calendar event, a Google Task, or a Gmail
// draft — or the short process those three already form. It never sends.
// Judgment is Glance.decide, which runs in this Apps Script project, not
// on the device, and not on Flow's servers.

var GLANCE_TASK_LIST = 'Glance';
var UNDO_PREFIX = 'glanceUndo_';
var CLOSES_KEY = 'glanceFullCloses';

function onHomepage() {
  return [card_('Glance', [
    text_('Open a message.'),
    text_('If one thing is ready to close, Glance shows Do It. Otherwise it stays quiet.')
  ])];
}

function onGmailMessageOpen(e) {
  try {
    var opened = readOpen_(e);
    if (!opened) return [quietCard_('en')];
    var decision = judge_(opened);
    if (!decision.speak) return [quietCard_(decision.lang)];
    var stored = readUndo_(opened.messageId);
    if (stored) return [receiptCard_(stored, opened.messageId)];
    return [proposalCard_(decision, opened.messageId)];
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    return [quietCard_('en')];
  }
}

function onDoIt(e) {
  var opened = null;
  try {
    opened = readOpen_(e);
    if (!opened) return update_(quietCard_('en'));
    var existing = readUndo_(opened.messageId);
    if (existing) return update_(receiptCard_(existing, opened.messageId));

    var decision = judge_(opened);
    if (!decision.speak) return update_(quietCard_(decision.lang));

    var timeZone = (e.commonEventObject && e.commonEventObject.timeZone) || 'Etc/UTC';
    var landed = [];
    var failed = false;
    for (var i = 0; i < decision.steps.length; i++) {
      var written = null;
      try {
        written = writeStep_(decision.steps[i], opened, timeZone);
      } catch (writeErr) {
        console.error(writeErr && writeErr.message ? writeErr.message : writeErr);
        written = null;
      }
      if (!written || !written.ok) {
        failed = true;
        break;
      }
      landed.push(written);
    }

    if (!landed.length) return update_(textCard_('Didn\'t close.', 'Nothing was written.'));

    var full = !failed && landed.length === decision.steps.length;
    var prior = full ? closeCount_() : 0;
    var receipt = Glance.receipt.confirmation({
      succeeded: landed.length,
      total: decision.steps.length,
      priorCloses: prior,
      lang: decision.lang
    });
    var record = {
      full: full,
      counted: full,
      status: receipt.status,
      earlyLine: receipt.earlyLine,
      closedLine: full ? decision.closedLine : null,
      undoLabel: receipt.undoLabel,
      wheres: landed.map(function (row) { return row.where; }),
      urls: landed.map(function (row) { return row.url; }).filter(Boolean),
      refs: landed.map(function (row) { return row.ref; })
    };
    if (!saveUndo_(opened.messageId, record)) {
      var rolled = undoRefs_(record.refs);
      if (rolled.remaining.length) {
        return update_(textCard_('Partly handled.', Glance.receipt.reverseNote({
          reversed: rolled.reversed,
          remaining: rolled.remaining.length,
          keptWhere: rolled.remaining[0] && rolled.remaining[0].where
        })));
      }
      return update_(textCard_('Didn\'t close.', 'Nothing was left behind.'));
    }
    if (full) setCloseCount_(prior + 1);
    return update_(receiptCard_(record, opened.messageId));
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    return update_(textCard_('Didn\'t close.', 'Nothing was written.'));
  }
}

function onUndo(e) {
  try {
    var messageId = messageId_(e);
    var record = messageId ? readUndo_(messageId) : null;
    if (!record || !record.refs || !record.refs.length) {
      return update_(textCard_('Undone.', 'Nothing was left.'));
    }
    var rolled = undoRefs_(record.refs);
    var kept = record.refs.length - rolled.reversed;
    if (rolled.remaining.length) {
      record.refs = rolled.remaining;
      record.wheres = rolled.remaining.map(function (ref) { return ref.where; });
      record.full = false;
      record.undoLabel = record.refs.length > 1 ? 'Undo all' : 'Undo';
      saveUndo_(messageId, record);
      return update_(textCard_('Undo', Glance.receipt.reverseNote({
        reversed: rolled.reversed,
        remaining: kept,
        keptWhere: rolled.remaining[0] && rolled.remaining[0].where
      }), messageId));
    }
    if (record.counted) setCloseCount_(Math.max(0, closeCount_() - 1));
    clearUndo_(messageId);
    return update_(textCard_(Glance.receipt.undoneLine(record.wheres), null));
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    return update_(textCard_('Undo', 'Still there — Undo didn’t remove it.'));
  }
}

function judge_(opened) {
  return Glance.decide(opened.body, {
    senderEmail: opened.fromEmail,
    senderName: opened.fromName,
    now: new Date(),
    threadUrl: opened.threadUrl
  });
}

function readOpen_(e) {
  if (!e || !e.gmail || !e.gmail.accessToken || !e.gmail.messageId) return null;
  var messageId = String(e.gmail.messageId);
  if (!/^[A-Za-z0-9]+$/.test(messageId)) return null;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var message = GmailApp.getMessageById(messageId);
  if (!message) return null;
  var from = parseFrom_(message.getFrom());
  var threadId = e.gmail.threadId ? String(e.gmail.threadId) : '';
  return {
    messageId: messageId,
    threadId: threadId,
    threadUrl: threadId ? 'https://mail.google.com/mail/u/0/#all/' + threadId : '',
    body: String(message.getPlainBody() || '').slice(0, 50000),
    subject: message.getSubject() || '',
    fromName: from.name,
    fromEmail: from.email,
    message: message
  };
}

function parseFrom_(raw) {
  var text = String(raw || '').trim();
  var match = text.match(/^(.*)<([^>]+)>\s*$/);
  if (!match) return { name: '', email: text };
  return { name: match[1].replace(/"/g, '').trim(), email: match[2].trim() };
}

function writeStep_(step, opened, timeZone) {
  if (step.kind === 'calendar') return writeCalendar_(step, opened, timeZone);
  if (step.kind === 'gmailDraft') return writeDraft_(step, opened);
  if (step.kind === 'googleTask') return writeTask_(step, opened);
  return { ok: false };
}

function writeDraft_(step, opened) {
  if (!opened.fromEmail) return { ok: false };
  var body = Glance.payloads.draftBody({
    senderName: opened.fromName,
    params: step.params
  });
  var draft = opened.message.createDraftReply(body);
  var draftId = draft && draft.getId();
  if (!draftId) return { ok: false };
  return {
    ok: true,
    where: 'Gmail',
    url: 'https://mail.google.com/mail/u/0/#drafts',
    ref: { kind: 'draft', draftId: String(draftId), where: 'Gmail' }
  };
}

function writeTask_(step, opened) {
  var payload = Glance.payloads.taskPayload({
    senderName: opened.fromName,
    senderEmail: opened.fromEmail,
    subject: opened.subject,
    threadUrl: opened.threadUrl,
    now: new Date(),
    params: step.params
  });
  var listId = glanceTaskList_();
  var resource = { title: payload.title, notes: payload.notes };
  if (payload.due) resource.due = payload.due;
  var task = Tasks.Tasks.insert(resource, listId);
  if (!task || !task.id) return { ok: false };
  return {
    ok: true,
    where: 'Google Tasks',
    url: 'https://tasks.google.com/embed/list/' + encodeURIComponent(listId) + '?pli=1',
    ref: { kind: 'task', taskListId: listId, taskId: String(task.id), where: 'Google Tasks' }
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
  if (!created || !created.id) throw new Error('Google Tasks did not confirm the list.');
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

function writeCalendar_(step, opened, timeZone) {
  var op = step.params && (step.params.calendarOp === 'delete' || step.params.calendarOp === 'update')
    ? step.params.calendarOp
    : null;
  if (op) return changeCalendar_(step, opened, timeZone, op);
  var payload = Glance.payloads.calendarPayload({
    threadUrl: opened.threadUrl,
    timeZone: timeZone,
    params: step.params
  });
  if (!payload.ok) return { ok: false };
  var event = Calendar.Events.insert(payload.body, 'primary');
  if (!event || !event.id) return { ok: false };
  return {
    ok: true,
    where: 'Google Calendar',
    url: event.htmlLink || '',
    ref: { kind: 'calendar', eventId: String(event.id), where: 'Google Calendar' }
  };
}

function changeCalendar_(step, opened, timeZone, op) {
  var params = step.params || {};
  var lookupDate = op === 'update' ? params.fromDateIso : params.dateIso;
  var lookupHour = op === 'update' ? params.fromHour : params.hour;
  var lookupMinute = op === 'update' ? params.fromMinute : params.minute;
  var start = wallInstant_(lookupDate, lookupHour, lookupMinute, timeZone);
  var end = wallInstant_(lookupDate, lookupHour, lookupMinute, timeZone, 1);
  if (!start || !end) return { ok: false };
  var listed = Calendar.Events.list('primary', {
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 5,
    timeZone: timeZone,
    timeMin: start.toISOString(),
    timeMax: end.toISOString()
  });
  var prefix = String(lookupDate) + 'T' + two_(lookupHour) + ':' + two_(lookupMinute);
  var matches = [];
  var items = (listed && listed.items) || [];
  for (var i = 0; i < items.length; i++) {
    var ev = items[i];
    if (!ev || ev.status === 'cancelled' || !ev.id) continue;
    var at = ev.start && ev.start.dateTime;
    if (typeof at === 'string' && at.indexOf(prefix) === 0) matches.push(ev);
  }
  if (matches.length !== 1) return { ok: false };
  var found = matches[0];
  if (op === 'delete') {
    var restore = { summary: found.summary || 'Hold', start: found.start, end: found.end };
    if (found.description) restore.description = String(found.description).slice(0, 2000);
    if (found.location) restore.location = found.location;
    Calendar.Events.remove('primary', found.id);
    return {
      ok: true,
      where: 'Google Calendar',
      url: '',
      ref: { kind: 'calendar-restore', restore: restore, where: 'Google Calendar' }
    };
  }
  var moved = Glance.payloads.calendarPayload({
    threadUrl: opened.threadUrl,
    timeZone: timeZone,
    params: {
      title: found.summary || params.title,
      dateIso: params.dateIso,
      hour: params.hour,
      minute: params.minute,
      quote: params.quote,
      requireTime: true
    }
  });
  if (!moved.ok) return { ok: false };
  Calendar.Events.patch({ start: moved.body.start, end: moved.body.end }, 'primary', found.id);
  return {
    ok: true,
    where: 'Google Calendar',
    url: found.htmlLink || '',
    ref: {
      kind: 'calendar-patch',
      eventId: String(found.id),
      previousStart: found.start,
      previousEnd: found.end,
      where: 'Google Calendar'
    }
  };
}

function wallInstant_(dateIso, hour, minute, timeZone, addMinutes) {
  if (!Glance.payloads.isoDateOrNull(dateIso)) return null;
  var h = Number(hour);
  var m = Number(minute);
  if (!isFinite(h) || !isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  var extra = addMinutes || 0;
  var parts = String(dateIso).split('-');
  var guess = Date.UTC(+parts[0], +parts[1] - 1, +parts[2], h, m + extra, 0);
  var shown = Utilities.formatDate(new Date(guess), timeZone, 'yyyy/MM/dd HH:mm');
  var bits = shown.split(/[/ :]/);
  var shownUtc = Date.UTC(+bits[0], +bits[1] - 1, +bits[2], +bits[3], +bits[4], 0);
  var desired = Date.UTC(+parts[0], +parts[1] - 1, +parts[2], h, m + extra, 0);
  return new Date(guess + (desired - shownUtc));
}

function two_(value) {
  var n = Number(value);
  return (n < 10 ? '0' : '') + n;
}

function undoRefs_(refs) {
  var reversed = 0;
  for (var i = refs.length - 1; i >= 0; i--) {
    var ok = false;
    try { ok = undoOne_(refs[i]); } catch (err) { ok = false; }
    if (!ok) {
      var remaining = [];
      for (var j = 0; j <= i; j++) remaining.push(refs[j]);
      return { reversed: reversed, remaining: remaining };
    }
    reversed++;
  }
  return { reversed: reversed, remaining: [] };
}

function gone_(err) {
  var msg = String(err && (err.message || err) || '');
  return /not found|404|already deleted|does not exist/i.test(msg);
}

function undoOne_(ref) {
  if (!ref || !ref.kind) return false;
  if (ref.kind === 'draft') {
    if (!ref.draftId) return false;
    try {
      GmailApp.getDraft(ref.draftId).deleteDraft();
      return true;
    } catch (err) {
      return gone_(err);
    }
  }
  if (ref.kind === 'task') {
    if (!ref.taskId || !ref.taskListId) return false;
    try {
      Tasks.Tasks.remove(ref.taskListId, ref.taskId);
      return true;
    } catch (err) {
      return gone_(err);
    }
  }
  if (ref.kind === 'calendar') {
    if (!ref.eventId) return false;
    try {
      Calendar.Events.remove('primary', ref.eventId);
      return true;
    } catch (err) {
      return gone_(err);
    }
  }
  if (ref.kind === 'calendar-restore') {
    if (!ref.restore || !ref.restore.start) return false;
    var restored = Calendar.Events.insert(ref.restore, 'primary');
    return Boolean(restored && restored.id);
  }
  if (ref.kind === 'calendar-patch') {
    if (!ref.eventId || !ref.previousStart) return false;
    Calendar.Events.patch({ start: ref.previousStart, end: ref.previousEnd }, 'primary', ref.eventId);
    return true;
  }
  return false;
}

function messageId_(e) {
  var id = e && e.parameters && e.parameters.messageId;
  if (!id && e && e.gmail) id = e.gmail.messageId;
  id = String(id || '');
  return /^[A-Za-z0-9]+$/.test(id) ? id : '';
}

function props_() {
  return PropertiesService.getUserProperties();
}

function readUndo_(messageId) {
  var raw = props_().getProperty(UNDO_PREFIX + messageId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function saveUndo_(messageId, record) {
  try {
    props_().setProperty(UNDO_PREFIX + messageId, JSON.stringify(record));
    return true;
  } catch (err) {
    return false;
  }
}

function clearUndo_(messageId) {
  props_().deleteProperty(UNDO_PREFIX + messageId);
}

function closeCount_() {
  var n = Number(props_().getProperty(CLOSES_KEY) || 0);
  return isFinite(n) && n > 0 ? n : 0;
}

function setCloseCount_(n) {
  props_().setProperty(CLOSES_KEY, String(n));
}

function proposalCard_(decision, messageId) {
  var section = CardService.newCardSection().addWidget(text_(decision.closingLine));
  section.addWidget(CardService.newTextButton()
    .setText('Do It')
    .setOnClickAction(CardService.newAction()
      .setFunctionName('onDoIt')
      .setLoadIndicator(CardService.LoadIndicator.SPINNER)
      .setParameters({ messageId: messageId })));
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Glance'))
    .addSection(section)
    .build();
}

function receiptCard_(record, messageId) {
  var section = CardService.newCardSection();
  if (record.status) section.addWidget(text_(record.status));
  if (record.closedLine) section.addWidget(text_(record.closedLine));
  if (record.earlyLine) section.addWidget(text_(record.earlyLine));
  var hint = Glance.receipt.undoHint(record.wheres || []);
  if (hint) section.addWidget(text_(hint));
  if (record.refs && record.refs.length && messageId) {
    section.addWidget(CardService.newTextButton()
      .setText(record.undoLabel || 'Undo')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('onUndo')
        .setLoadIndicator(CardService.LoadIndicator.SPINNER)
        .setParameters({ messageId: messageId })));
  }
  var url = record.urls && record.urls.length === 1 ? record.urls[0] : '';
  if (url && /^https:\/\//.test(url)) {
    section.addWidget(CardService.newTextButton()
      .setText('Open')
      .setOpenLink(CardService.newOpenLink().setUrl(url).setOpenAs(CardService.OpenAs.FULL_SIZE)));
  }
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Glance'))
    .addSection(section)
    .build();
}

function quietCard_(lang) {
  return textCard_(lang === 'he' ? Glance.quietHe : Glance.quietEn, null);
}

function textCard_(title, body, messageId) {
  var section = CardService.newCardSection().addWidget(text_(title));
  if (body) section.addWidget(text_(body));
  if (messageId) {
    section.addWidget(CardService.newTextButton()
      .setText('Undo')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('onUndo')
        .setLoadIndicator(CardService.LoadIndicator.SPINNER)
        .setParameters({ messageId: messageId })));
  }
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Glance'))
    .addSection(section)
    .build();
}

function text_(value) {
  var safe = String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return CardService.newTextParagraph().setText(safe);
}

function card_(title, widgets) {
  var section = CardService.newCardSection();
  for (var i = 0; i < widgets.length; i++) section.addWidget(widgets[i]);
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(title))
    .addSection(section)
    .build();
}

function update_(built) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(built))
    .build();
}
