#!/usr/bin/env node
// Card building, intent mapping, Proof mismatch, and Undo.
// Run: node glance-gmail-addon/test/v1.test.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const addon = path.join(__dirname, '..');
const repo = path.join(addon, '..');
const i18n = require('../src/i18n.js');
const intent = require('../src/intent.js');
const proof = require('../src/proof.js');
const execute = require('../src/execute.js');
const cards = require('../src/cards.js');
const prefetch = require('../src/prefetch.js');
const remote = require('../src/remote.js');

const NOW = new Date('2026-10-15T12:00:00Z');
const TZ = 'UTC';
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function plain(value) {
  return String(value || '').replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
}

function widgetText(model) {
  return (model.widgets || []).filter((w) => w.type === 'text').map((w) => plain(w.text));
}

function loadEngine() {
  const files = [
    'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js'
  ];
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  for (const name of files) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'flow-trial-extension', 'core', name), 'utf8'), sandbox, { filename: name });
  }
  const classify = vm.runInContext('FlowIntent.classify', sandbox);
  const planFor = vm.runInContext('FlowActions.planFor', sandbox);
  return function engine(text) {
    const classified = classify(text, { now: NOW, senderEmail: 'dana@meridian.com', calibration: null, calibrationByType: null });
    if (!classified || !classified.type) return { intent: classified, plan: null };
    return {
      intent: classified,
      plan: planFor(classified, { threadUrl: null, hasThreadAttachment: false, executionMemory: null })
    };
  };
}

const engine = loadEngine();

function judge(text, extra) {
  return intent.resolveTask(text, Object.assign({ now: NOW, timeZone: TZ, engine: engine }, extra || {}));
}

console.log('\n--- intent ---');
{
  const remembered = judge('Please remember to send the signed contract by Friday.');
  check('please remember is a task', remembered.speak === true && remembered.source === 'local', remembered);
  check('please remember title drops the day', remembered.title === 'send the signed contract', remembered.title);
  check('Friday from 2026-10-15 is 2026-10-16', remembered.due === '2026-10-16', remembered.due);
}
{
  const forgot = judge("Don't forget to file the taxes by 2026-11-01.");
  check("don't forget is a task", forgot.speak === true && forgot.source === 'local' && forgot.title === 'file the taxes', forgot);
  check("don't forget keeps the iso due", forgot.due === '2026-11-01', forgot.due);
}
{
  const he = judge('תזכיר לי לשלוח את החשבונית');
  check('תזכיר לי is a task', he.speak === true && he.source === 'local' && he.title === 'לשלוח את החשבונית', he);
  check('תזכיר לי has no invented due', he.due === null, he.due);
}
{
  const tomorrow = judge('תזכיר לי מחר לשלוח את החוזה');
  check('מחר is the next day', tomorrow.speak && tomorrow.due === '2026-10-16' && tomorrow.title === 'לשלוח את החוזה', tomorrow);
}
{
  const hi = judge('Hi Dana, please remember to call the client.');
  check('a greeting still leaves an explicit ask', hi.speak === true && hi.title === 'call the client', hi);
}
check('a remember phrase buried in the mail stays quiet', judge('Thanks for the update. Please remember to send the file.').speak === false);
check('small talk stays quiet', judge('Hope you are well. Just wanted to say hello and see how things are going this week.').speak === false);
check('empty stays quiet', judge('').speak === false);
check('a send ask is not rewritten into a task', judge('Could you please send the signed contract?').speak === false);

{
  const forced = intent.resolveTask('Please remember to call the client tomorrow.', {
    now: NOW,
    timeZone: TZ,
    engine: function () {
      return { plan: { steps: [{ kind: 'calendar', params: { title: 'Meeting' } }] } };
    }
  });
  check('an explicit ask stays a task when the classifier wants a meeting', forced.source === 'local' && forced.title === 'call the client', forced);
}

{
  const approved = judge('Approved — go ahead on the contract.');
  check('the repo classifier plans one task for a decision', approved.speak === true && approved.source === 'engine' && approved.title.length > 0, approved);
}

{
  const mixed = intent.mapEngine({
    plan: { steps: [{ kind: 'gmailDraft', params: {} }, { kind: 'googleTask', params: { title: 'Reply' } }] }
  }, NOW, TZ);
  check('a draft plus a task is not a task card', mixed === null, mixed);
  const two = intent.mapEngine({
    plan: { steps: [{ kind: 'googleTask', params: { title: 'One' } }, { kind: 'googleTask', params: { title: 'Two' } }] }
  }, NOW, TZ);
  check('two tasks are not collapsed into one card', two === null, two);
  check('a calendar step that is not a hold is not rewritten into a task', intent.mapEngine({
    plan: { steps: [{ kind: 'calendar', params: { title: 'Meeting', dateIso: '2026-10-22', hour: 15, minute: 0 } }] }
  }, NOW, TZ) === null);
}
{
  const held = judge('Could we meet Thursday at 3pm?');
  check('a timed meeting ask is a calendar hold', held.speak === true && held.kind === 'hold' && held.hour === 15 && held.minute === 0 && held.dateIso === '2026-10-22', held);
}
{
  const meeting = judge('פגישה ביום חמישי 22/10');
  check('the Hebrew meeting is a schedule, not silence', meeting.speak === true && meeting.kind === 'schedule' && meeting.dateIso === '2026-10-22' && meeting.hour === null, meeting);
}

{
  check('classifier commitment maps to a task', intent.mapClassifierResult({
    result: { type: 'commitment', what: 'Send the report', dateIso: '2026-11-02' }
  }, NOW, TZ).title === 'Send the report');
  check('classifier request is not a task', intent.mapClassifierResult({ result: { type: 'request', what: 'Send the file' } }, NOW, TZ) === null);
  check('classifier event is not a task', intent.mapClassifierResult({ result: { type: 'event', what: 'Call Friday' } }, NOW, TZ) === null);
  check('classifier null stays quiet', intent.mapClassifierResult({ result: { type: null } }, NOW, TZ) === null);
}

console.log('\n--- cards ---');
{
  const card = cards.proposal({ title: 'send the contract', due: '2026-10-16' }, 'abc123', 'en');
  const buttons = cards.buttons(card);
  check('proposal has one Do it button', buttons.length === 1 && buttons[0].text === 'Do it' && buttons[0].action === 'onDoIt' && buttons[0].style === 'filled', buttons);
  check('proposal shows title and due', widgetText(card).indexOf('send the contract') !== -1 && widgetText(card).some((line) => line.indexOf('2026-10-16') !== -1), widgetText(card));
  check('english card is not rtl', card.rtl === false && card.lang === 'en');
}
{
  const card = cards.proposal({ title: 'לשלוח את החשבונית', due: '2026-10-16' }, 'abc123', 'he');
  const buttons = cards.buttons(card);
  check('hebrew locale uses the hebrew button', plain(buttons[0].text) === 'בצע', buttons[0].text);
  check('hebrew card is rtl and marks the line', card.rtl === true && buttons[0].text.charCodeAt(0) === 0x202B, buttons[0].text);
  check('hebrew due keeps the date', widgetText(card).some((line) => line.indexOf('יעד') !== -1 && line.indexOf('2026-10-16') !== -1));
}
check('locale he and iw are hebrew', i18n.locale('he-IL') === 'he' && i18n.locale('iw') === 'he');
check('other locales stay english', i18n.locale('en-US') === 'en' && i18n.locale('fr') === 'en' && i18n.locale('') === 'en');
{
  const quiet = cards.quiet('en');
  check('silence has no button', cards.buttons(quiet).length === 0 && plain(quiet.widgets[0].text) === 'Nothing to close.');
  const miss = cards.unconfirmed('en');
  check("mismatch card is Couldn't confirm", cards.buttons(miss).length === 0 && plain(miss.widgets[0].text) === "Couldn't confirm");
  check('mismatch card does not claim the task', JSON.stringify(miss).indexOf('In Google Tasks') === -1 && JSON.stringify(miss).indexOf('Undone') === -1);
  const refuse = cards.edited('en');
  check('edited card is the one refuse line', refuse.widgets.length === 1 && plain(refuse.widgets[0].text) === "The task was edited, so I won't undo it" && cards.buttons(refuse).length === 0);
  const heRefuse = cards.edited('he');
  check('hebrew refuse line', plain(heRefuse.widgets[0].text) === 'המשימה נערכה, אז לא אבטל אותה');
}
{
  const proved = cards.proof({ id: 'task-1', title: 'send the contract', due: '2026-10-16' }, 'en', { messageId: 'abc', undo: true });
  const lines = widgetText(proved);
  check('proof shows id, title, and due', lines.some((l) => l.indexOf('task-1') !== -1) && lines.indexOf('send the contract') !== -1 && lines.some((l) => l.indexOf('2026-10-16') !== -1) && lines.indexOf('In Google Tasks.') !== -1, lines);
  check('proof offers undo', cards.buttons(proved).length === 1 && cards.buttons(proved)[0].action === 'onUndo' && cards.buttons(proved)[0].text === 'Undo');
}
{
  const home = cards.homepage(null, 'en');
  check('homepage without a cache has no Do it', cards.buttons(home).length === 0 && plain(home.widgets[0].text) === 'Open a message.');
  const next = cards.homepage({ title: 'file the taxes', due: '2026-11-01' }, 'en');
  check('homepage shows the cached next action', widgetText(next).indexOf('file the taxes') !== -1 && cards.buttons(next).length === 1 && cards.buttons(next)[0].params.source === 'prefetch');
}

console.log('\n--- proof and undo ---');
function api(current, inserted) {
  const calls = [];
  return {
    calls: calls,
    insert: function (listId, resource) {
      calls.push('insert');
      return inserted || { id: 'task-1', title: resource.title, due: resource.due || null, etag: 'e1', updated: 'u1' };
    },
    get: function () {
      calls.push('get');
      return current();
    },
    remove: function () { calls.push('remove'); },
    patch: function () { calls.push('patch'); throw new Error('patch must not run'); }
  };
}

{
  const created = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' };
  const client = api(() => created);
  const result = execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client);
  check('a matching read-back confirms', result.confirmed === true && result.view.id === 'task-1' && result.view.title === 'send the contract' && result.view.due === '2026-10-16', result);
  check('create reads back and does not patch', client.calls.join(',') === 'insert,get', client.calls);
  const again = api(() => Object.assign({}, created));
  const undo = execute.performUndo(result.snapshot, again);
  check('unchanged task is deleted', undo.action === 'deleted' && again.calls.join(',') === 'get,remove', { undo: undo, calls: again.calls });
}
{
  const inserted = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' };
  const client = api(() => Object.assign({}, inserted, { title: 'send the invoice' }), inserted);
  const result = execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client);
  check('title mismatch does not confirm', result.confirmed === false && result.reason === 'mismatch', result);
  check('mismatch does not delete', client.calls.indexOf('remove') === -1 && client.calls.indexOf('patch') === -1, client.calls);
}
{
  const inserted = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z' };
  const client = api(() => Object.assign({}, inserted, { id: 'other' }), inserted);
  check('id mismatch does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client).confirmed === false);
  const dueClient = api(() => Object.assign({}, inserted, { due: '2026-12-01T00:00:00.000Z' }), inserted);
  check('due mismatch does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, dueClient).confirmed === false);
  const thrown = api(() => { throw new Error('404'); }, inserted);
  check('a failed read does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, thrown).confirmed === false);
}
{
  const snapshot = { listId: 'list', id: 'task-1', title: 'send the contract', due: '2026-10-16', etag: 'e1', updated: 'u1' };
  const edited = api(() => ({ id: 'task-1', title: 'I changed this', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' }));
  const refused = execute.performUndo(snapshot, edited);
  check('an edited title is refused and not deleted', refused.action === 'refuse' && edited.calls.join(',') === 'get', edited.calls);
  const etag = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e2', updated: 'u1' }));
  check('a changed etag is refused', execute.performUndo(snapshot, etag).action === 'refuse' && etag.calls.indexOf('remove') === -1);
  const updated = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u2' }));
  check('a changed updated timestamp is refused', execute.performUndo(snapshot, updated).action === 'refuse' && updated.calls.indexOf('remove') === -1);
  const due = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-12-01T00:00:00.000Z', etag: 'e1', updated: 'u1' }));
  check('a changed due date is refused', execute.performUndo(snapshot, due).action === 'refuse' && due.calls.indexOf('remove') === -1);
}

console.log('\n--- calendar proof ---');
{
  const timed = execute.eventBody({ title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Asia/Jerusalem', description: 'Logged by Glance' });
  check('a hold is 30 minutes and has no guests', timed.start.dateTime === '2026-10-22T15:00:00' && timed.end.dateTime === '2026-10-22T15:30:00' && timed.start.timeZone === 'Asia/Jerusalem' && !timed.attendees, timed);
  const allDay = execute.eventBody({ title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null });
  check('a dateless clock is an all-day event', allDay.start.date === '2026-10-22' && allDay.end.date === '2026-10-23' && !allDay.start.dateTime, allDay);
  const late = execute.eventBody({ title: 'Late', dateIso: '2026-10-22', hour: 23, minute: 45, timeZone: 'Etc/UTC' });
  check('thirty minutes can cross midnight', late.end.dateTime === '2026-10-23T00:15:00', late.end);
}
function memoryCalendar() {
  const calls = [];
  const events = {};
  let n = 1;
  return {
    calls: calls,
    events: events,
    insert: function (calendarId, resource) {
      calls.push('insert');
      const ev = JSON.parse(JSON.stringify(resource));
      ev.id = 'ev-' + (n++);
      events[ev.id] = ev;
      return JSON.parse(JSON.stringify(ev));
    },
    get: function (calendarId, id) {
      calls.push('get');
      if (!events[id]) throw new Error('missing');
      return JSON.parse(JSON.stringify(events[id]));
    },
    remove: function (calendarId, id) {
      calls.push('remove');
      delete events[id];
    }
  };
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null, description: 'Logged by Glance'
  }, cal);
  check('an all-day read-back confirms', created.confirmed === true && created.view.when === '2026-10-22' && created.snapshot.contentHash, created);
  check('create reads the event back', cal.calls.join(',') === 'insert,get', cal.calls);
  const undo = execute.performUndoEvent(created.snapshot, cal);
  check('an unchanged event is deleted', undo.action === 'deleted' && !cal.events[created.view.id], undo);
}
{
  check('no event snapshot refuses and does not read', execute.performUndoEvent(null, memoryCalendar()).action === 'refuse');
  const bare = memoryCalendar();
  check('a snapshot without a content hash refuses', execute.performUndoEvent({ id: 'ev-1', calendarId: 'primary' }, bare).action === 'refuse' && bare.calls.length === 0, bare.calls);
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC', description: 'Logged by Glance'
  }, cal);
  cal.events[created.view.id].etag = 'changed-by-google';
  const etagOnly = execute.performUndoEvent(created.snapshot, cal);
  check('an etag-only change still matches the content hash', etagOnly.action === 'deleted', etagOnly);
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC'
  }, cal);
  cal.events[created.view.id].summary = 'I moved it';
  const refused = execute.performUndoEvent(created.snapshot, cal);
  check('an edited event is refused and kept', refused.action === 'refuse' && refused.which === 'event' && cal.events[created.view.id].summary === 'I moved it', refused);
  const guest = memoryCalendar();
  const held = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC'
  }, guest);
  guest.events[held.view.id].attendees = [{ email: 'ada@meridian.com' }];
  check('a guest added later is an edit', execute.performUndoEvent(held.snapshot, guest).action === 'refuse' && guest.events[held.view.id]);
}
{
  const cal = memoryCalendar();
  cal.get = function () { return { id: 'ev-x', summary: 'Other', start: { date: '2026-10-22' }, end: { date: '2026-10-23' } }; };
  const missed = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null
  }, cal);
  check('a read-back that disagrees does not confirm', missed.confirmed === false && missed.reason === 'mismatch', missed);
}

console.log('\n--- prefetch and classifier stubs ---');
{
  let called = false;
  const empty = prefetch.fetchNext({ url: '', fetch: function () { called = true; } });
  check('unset prefetch url makes no call', empty.called === false && empty.next === null && called === false);
  const bad = prefetch.fetchNext({ url: 'http://169.254.169.254/latest', fetch: function () { called = true; } });
  check('prefetch refuses a non-https and metadata host', bad.called === false && called === false, bad);
  const ok = prefetch.fetchNext({
    url: 'https://prefetch.example.com/next',
    fetch: function (url, options) {
      check('prefetch sends no authorization', !options.headers.Authorization && !options.headers.authorization);
      return { status: 200, body: JSON.stringify({ next: { title: 'file the taxes', due: '2026-11-01', notes: 'ignore' } }) };
    }
  });
  check('prefetch keeps title and due only', ok.called === true && ok.next.title === 'file the taxes' && ok.next.due === '2026-11-01' && !ok.next.notes, ok);
  const down = prefetch.fetchNext({ url: 'https://prefetch.example.com/next', fetch: function () { return { status: 500, body: '' }; } });
  check('prefetch error stays empty', down.called === true && down.next === null);
}
{
  const call = remote.buildCall('https://classifier.example.com/glance-assist', 'Please remember to call', 'en');
  check('classifier call has no bearer token', call && !call.headers.Authorization && call.payload.indexOf('"action":"classify"') !== -1, call && call.headers);
  check('classifier rejects http', remote.buildCall('http://classifier.example.com/', 'x', 'en') === null);
  let used = false;
  const off = remote.fetchClassification({ url: '', text: 'hello', fetch: function () { used = true; } });
  check('unset classifier url makes no call', off.called === false && used === false);
}

console.log('\n--- bundle ---');
{
  const bundlePath = path.join(addon, 'CoreBundle.js');
  check('bundle exists', fs.existsSync(bundlePath));
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: 'CoreBundle.js' });
  const bundled = sandbox.Glance.intent.resolveTask('Please remember to send the contract by Friday.', { now: NOW, timeZone: TZ });
  check('bundle local ask matches the module', bundled.speak === true && bundled.title === 'send the contract' && bundled.due === '2026-10-16', bundled);
  const classified = sandbox.Glance.classify('Approved — go ahead on the contract.', { now: NOW, calibration: null, calibrationByType: null });
  check('bundle still calls the repo classifier', classified && classified.type === 'decision', classified && classified.type);
}

// A manifest flag that makes Google demand a scope. The declared
// oauthScopes must be exactly that set: missing fails the card at open,
// and an extra scope is a wider grant than this host uses.
function scopeUrl(id) {
  return 'https://www.googleapis.com/auth/' + id;
}

function scopesRequiredByManifest(manifest, hostSource) {
  const required = [];
  function add(id) {
    const url = scopeUrl(id);
    if (required.indexOf(url) === -1) required.push(url);
  }
  const common = (manifest.addOns && manifest.addOns.common) || {};
  const gmail = (manifest.addOns && manifest.addOns.gmail) || {};
  const services = (manifest.dependencies && manifest.dependencies.enabledAdvancedServices) || [];

  if (common.useLocaleFromApp === true) add('script.locale');
  if (common.homepageTrigger || gmail.homepageTrigger || (gmail.contextualTriggers && gmail.contextualTriggers.length) || gmail.composeTrigger) {
    add('gmail.addons.execute');
  }
  if (gmail.contextualTriggers && gmail.contextualTriggers.length) {
    if (gmail.currentMessageAccess === 'metadata') add('gmail.addons.current.message.metadata');
    else add('gmail.addons.current.message.readonly');
  }
  if (gmail.composeTrigger) add('gmail.addons.current.action.compose');
  services.forEach((service) => {
    if (service.serviceId === 'tasks' || service.userSymbol === 'Tasks') add('tasks');
    if (service.serviceId === 'calendar' || service.userSymbol === 'Calendar') add('calendar.events');
  });
  if (hostSource && /UrlFetchApp/.test(hostSource)) add('script.external_request');
  return required.sort();
}

console.log('\n--- host boundaries ---');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(addon, 'appsscript.json'), 'utf8'));
  const host = fs.readFileSync(path.join(addon, 'Code.js'), 'utf8');
  const scopes = manifest.oauthScopes.slice().sort();
  const expected = scopesRequiredByManifest(manifest, host);
  check('every manifest flag has its scope, and there are no extras', JSON.stringify(scopes) === JSON.stringify(expected), { scopes: scopes, expected: expected });
  check('useLocaleFromApp requires script.locale', expected.indexOf(scopeUrl('script.locale')) !== -1 && scopes.indexOf(scopeUrl('script.locale')) !== -1);
  check('message open reads the body, not metadata', scopes.indexOf(scopeUrl('gmail.addons.current.message.readonly')) !== -1 && scopes.indexOf(scopeUrl('gmail.addons.current.message.metadata')) === -1);
  check('there is no compose scope', !manifest.addOns.gmail.composeTrigger && scopes.indexOf(scopeUrl('gmail.addons.current.action.compose')) === -1);

  const withCompose = JSON.parse(JSON.stringify(manifest));
  withCompose.addOns.gmail.composeTrigger = { draftAccess: 'NONE' };
  withCompose.oauthScopes = scopes.slice();
  const composeNeed = scopesRequiredByManifest(withCompose, host);
  check('a compose trigger would require the compose scope', composeNeed.indexOf(scopeUrl('gmail.addons.current.action.compose')) !== -1);

  const metadataOnly = JSON.parse(JSON.stringify(manifest));
  metadataOnly.addOns.gmail.currentMessageAccess = 'metadata';
  const metadataNeed = scopesRequiredByManifest(metadataOnly, host);
  check('metadata access would require the metadata scope and not the body scope', metadataNeed.indexOf(scopeUrl('gmail.addons.current.message.metadata')) !== -1 && metadataNeed.indexOf(scopeUrl('gmail.addons.current.message.readonly')) === -1);

  const localeOff = JSON.parse(JSON.stringify(manifest));
  localeOff.addOns.common.useLocaleFromApp = false;
  check('locale off drops script.locale', scopesRequiredByManifest(localeOff, host).indexOf(scopeUrl('script.locale')) === -1);
  check('calendar service asks only for calendar.events',
    manifest.dependencies.enabledAdvancedServices.some((service) => service.serviceId === 'calendar' && service.userSymbol === 'Calendar' && service.version === 'v3') &&
    scopes.indexOf(scopeUrl('calendar.events')) !== -1 &&
    scopes.indexOf(scopeUrl('calendar')) === -1);
  check('host does not patch an event', !/Calendar\.Events\.patch|Calendar\.Events\.update/.test(host));
  check('contextual trigger is message open', manifest.addOns.gmail.contextualTriggers[0].onTriggerFunction === 'onGmailMessageOpen');
  check('locale comes from the app', manifest.addOns.common.useLocaleFromApp === true);
  check('host never sends mail', !/gmail\.send|sendEmail|Drafts\.send|MailApp|createDraft|\.send\(/.test(host));
  check('host does not patch a task', !/Tasks\.Tasks\.patch|Tasks\.Tasks\.update/.test(host));
  check('host reads the task back through performCreate', host.indexOf('performCreate') !== -1 && host.indexOf('performUndo') !== -1);
  check('host reads an event back through performCreateEvent', host.indexOf('performCreateEvent') !== -1 && host.indexOf('performUndoEvent') !== -1);
}

console.log('\n--- message path parity ---');
{
  const state = { props: {}, messages: {}, events: {}, tasks: {}, eventSeq: 1, taskSeq: 1, fetches: 0 };
  function reset() {
    state.props = {};
    state.messages = {};
    state.events = {};
    state.tasks = {};
    state.eventSeq = 1;
    state.taskSeq = 1;
    state.fetches = 0;
  }
  function widget(kind) {
    const node = { type: kind, text: '', action: '', params: {}, style: '' };
    node.setText = function (value) { node.text = value; return node; };
    node.setOnClickAction = function (action) { node.action = action.functionName; node.params = action.params; return node; };
    node.setTextButtonStyle = function (value) { node.style = value; return node; };
    return node;
  }
  const sandbox = {
    console: console,
    module: undefined,
    GmailApp: {
      setCurrentMessageAccessToken: function () {},
      getMessageById: function (id) { return state.messages[id] || null; }
    },
    PropertiesService: {
      getUserProperties: function () {
        return {
          getProperty: function (key) { return Object.prototype.hasOwnProperty.call(state.props, key) ? state.props[key] : null; },
          setProperty: function (key, value) { state.props[key] = value; },
          deleteProperty: function (key) { delete state.props[key]; }
        };
      },
      getScriptProperties: function () {
        return { getProperty: function () { return null; } };
      }
    },
    UrlFetchApp: { fetch: function () { state.fetches += 1; throw new Error('prefetch must not run'); } },
    Tasks: {
      Tasklists: {
        list: function () { return { items: [{ id: 'list1', title: 'Glance' }] }; },
        get: function (id) { return { id: id, title: 'Glance' }; },
        insert: function () { return { id: 'list1', title: 'Glance' }; }
      },
      Tasks: {
        insert: function (resource) {
          const task = {
            id: 'task-' + state.taskSeq++,
            title: resource.title,
            due: resource.due || null,
            notes: resource.notes || '',
            etag: 'e1',
            updated: 'u1'
          };
          state.tasks[task.id] = task;
          return JSON.parse(JSON.stringify(task));
        },
        get: function (listId, id) {
          if (!state.tasks[id]) throw new Error('missing');
          return JSON.parse(JSON.stringify(state.tasks[id]));
        },
        remove: function (listId, id) { delete state.tasks[id]; }
      }
    },
    Calendar: {
      Events: {
        insert: function (resource, calendarId) {
          const ev = JSON.parse(JSON.stringify(resource));
          ev.id = 'ev-' + state.eventSeq++;
          ev.calendarId = calendarId;
          state.events[ev.id] = ev;
          return JSON.parse(JSON.stringify(ev));
        },
        get: function (calendarId, id) {
          if (!state.events[id]) throw new Error('missing');
          return JSON.parse(JSON.stringify(state.events[id]));
        },
        remove: function (calendarId, id) { delete state.events[id]; }
      }
    },
    CardService: {
      LoadIndicator: { SPINNER: 'spinner' },
      TextButtonStyle: { FILLED: 'filled' },
      newTextParagraph: function () { return widget('text'); },
      newTextButton: function () { return widget('button'); },
      newCardSection: function () {
        const section = { widgets: [] };
        section.addWidget = function (item) { section.widgets.push(item); return section; };
        return section;
      },
      newCardHeader: function () {
        const header = { title: '' };
        header.setTitle = function (value) { header.title = value; return header; };
        return header;
      },
      newCardBuilder: function () {
        const builder = { header: null, sections: [] };
        builder.setHeader = function (header) { builder.header = header; return builder; };
        builder.addSection = function (section) { builder.sections.push(section); return builder; };
        builder.build = function () { return builder; };
        return builder;
      },
      newAction: function () {
        const action = { functionName: '', params: {} };
        action.setFunctionName = function (name) { action.functionName = name; return action; };
        action.setLoadIndicator = function () { return action; };
        action.setParameters = function (params) { action.params = params; return action; };
        return action;
      },
      newNavigation: function () {
        const nav = { card: null };
        nav.updateCard = function (card) { nav.card = card; return nav; };
        return nav;
      },
      newActionResponseBuilder: function () {
        const response = { card: null };
        response.setNavigation = function (nav) { response.card = nav.card; return response; };
        response.build = function () { return { card: response.card }; };
        return response;
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8'), sandbox, { filename: 'CoreBundle.js' });
  vm.runInContext(fs.readFileSync(path.join(addon, 'Code.js'), 'utf8'), sandbox, { filename: 'Code.js' });
  const openMessage = vm.runInContext('onGmailMessageOpen', sandbox);
  const doIt = vm.runInContext('onDoIt', sandbox);
  const undo = vm.runInContext('onUndo', sandbox);
  const classify = vm.runInContext('FlowIntent.classify', sandbox);
  const planFor = vm.runInContext('FlowActions.planFor', sandbox);
  const shouldShow = vm.runInContext('FlowIntent.shouldShowChip', sandbox);

  function linesOf(card) {
    return card.sections[0].widgets.filter((item) => item.type === 'text').map((item) => plain(item.text));
  }
  function buttonsOf(card) {
    return card.sections[0].widgets.filter((item) => item.type === 'button');
  }
  function gmailMessage(fields) {
    const calls = [];
    return {
      calls: calls,
      getSubject: function () { calls.push('getSubject'); return fields.subject; },
      getPlainBody: function () { calls.push('getPlainBody'); return fields.plain; },
      getBody: function () { calls.push('getBody'); return fields.html; },
      getFrom: function () { calls.push('getFrom'); return fields.from; },
      getDate: function () { calls.push('getDate'); return fields.date; }
    };
  }
  function extensionOffer(text, fromEmail, fromName, threadUrl) {
    const intent = classify(text, {
      now: new Date(),
      senderEmail: fromEmail || null,
      senderName: fromName || null,
      calibration: null,
      calibrationByType: null
    });
    if (!shouldShow(intent)) return null;
    const plan = planFor(intent, { threadUrl: threadUrl || null, hasThreadAttachment: false, executionMemory: null });
    if (!plan || !plan.steps) return null;
    const kinds = plan.steps.map((step) => step.kind);
    if (plan.id === 'hold' && kinds.length === 1 && kinds[0] === 'calendar') return plan;
    if (plan.id === 'schedule' && kinds.length === 2 && kinds.indexOf('calendar') !== -1 && kinds.indexOf('googleTask') !== -1) return plan;
    if (kinds.length === 1 && kinds[0] === 'googleTask') return plan;
    return null;
  }
  function judgedPlan(fields) {
    const fromEmail = 'dana@meridian.com';
    const fromName = 'Dana Levi';
    const threadUrl = 'https://mail.google.com/mail/u/0/#all/' + fields.threadId;
    const bodyPlan = extensionOffer(String(fields.plain || ''), fromEmail, fromName, threadUrl);
    if (bodyPlan) return bodyPlan;
    return extensionOffer(String(fields.subject || ''), fromEmail, fromName, threadUrl);
  }
  function assertOffer(name, card, plan, lang) {
    const lines = linesOf(card);
    const buttons = buttonsOf(card);
    const joined = lines.join('\n');
    if (!plan) {
      const quiet = lang === 'he' ? 'אין מה לסגור.' : 'Nothing to close.';
      check(name + ' stays quiet', joined.indexOf(quiet) !== -1 && buttons.length === 0, lines);
      return;
    }
    const label = lang === 'he' ? 'בצע' : 'Do it';
    check(name + ' offers one Do it', buttons.length === 1 && plain(buttons[0].text) === label && buttons[0].action === 'onDoIt', buttons.map((item) => item.text));
    const calendarStep = plan.steps.filter((step) => step.kind === 'calendar')[0];
    const taskStep = plan.steps.filter((step) => step.kind === 'googleTask')[0];
    if (plan.id === 'hold') {
      const mark = lang === 'he' ? 'החזקה ביומן' : 'Calendar hold';
      const clock = String(calendarStep.params.hour).padStart(2, '0') + ':' + String(calendarStep.params.minute).padStart(2, '0');
      check(name + ' matches the hold', joined.indexOf(mark) !== -1 && joined.indexOf(calendarStep.params.title) !== -1 && joined.indexOf(calendarStep.params.dateIso) !== -1 && joined.indexOf(clock) !== -1, lines);
    } else if (plan.id === 'schedule') {
      const mark = lang === 'he' ? 'יומן ותזכורת.' : 'Calendar and a reminder.';
      check(name + ' matches the schedule',
        joined.indexOf('Nothing to close.') === -1 && joined.indexOf('אין מה לסגור.') === -1 &&
        joined.indexOf('Calendar hold') === -1 && joined.indexOf('החזקה ביומן') === -1 &&
        joined.indexOf(mark) !== -1 && joined.indexOf(calendarStep.params.title) !== -1 && joined.indexOf(calendarStep.params.dateIso) !== -1,
        lines);
      if (Number.isInteger(calendarStep.params.hour)) {
        const clock = String(calendarStep.params.hour).padStart(2, '0') + ':' + String(calendarStep.params.minute).padStart(2, '0');
        check(name + ' shows the stated clock', joined.indexOf(clock) !== -1, lines);
      }
    } else {
      check(name + ' matches the task', joined.indexOf(taskStep.params.title) !== -1 && joined.indexOf('Calendar hold') === -1 && joined.indexOf('Calendar and a reminder.') === -1, lines);
    }
  }
  function openOf(fields) {
    reset();
    const message = gmailMessage(fields);
    state.messages[fields.id] = message;
    const event = {
      gmail: { messageId: fields.id, accessToken: 'token', threadId: fields.threadId },
      commonEventObject: { userLocale: fields.locale || 'en', timeZone: 'Etc/UTC' }
    };
    const cards = openMessage(event);
    check(fields.id + ' reads the plain body, not the html', message.calls.indexOf('getPlainBody') !== -1 && message.calls.indexOf('getSubject') !== -1 && message.calls.indexOf('getFrom') !== -1 && message.calls.indexOf('getBody') === -1, message.calls);
    check(fields.id + ' does not call prefetch', state.fetches === 0);
    assertOffer(fields.id, cards[0], judgedPlan(fields), fields.locale === 'he' || fields.locale === 'he-IL' ? 'he' : 'en');
    return { event: event, plan: judgedPlan(fields) };
  }
  const quietHtml = '<div>Hope you are well. Just wanted to say hello and see how things are going this week with the whole team.</div>';
  const hebrew = {
    id: 'heb1',
    threadId: 'thread1',
    subject: 'פגישה ביום חמישי 22/10',
    plain: 'שלום,\n\nפגישה ביום חמישי 22/10\n\nתודה,\nדנה',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T08:00:00Z')
  };
  const opened = openOf(hebrew);
  check('heb1 does not invent a midnight clock', linesOf(openMessage({
    gmail: { messageId: 'heb1', accessToken: 'token', threadId: 'thread1' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' }
  })[0]).join('\n').indexOf('00:00') === -1);
  openOf({
    id: 'heb2',
    threadId: 'thread2',
    subject: 'פגישה ביום חמישי 22/10',
    plain: '',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T08:00:00Z')
  });
  openOf(Object.assign({}, hebrew, { id: 'heb3', threadId: 'thread3', locale: 'he-IL' }));
  openOf({
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  });
  openOf({
    id: 'sched1',
    threadId: 'thread5',
    subject: 'Review',
    plain: 'The review meeting is on Thursday at 15:00.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:30:00Z')
  });
  openOf({
    id: 'task1',
    threadId: 'thread6',
    subject: 'Contract',
    plain: 'Approved — go ahead on the contract.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T10:00:00Z')
  });
  openOf({
    id: 'quiet1',
    threadId: 'thread7',
    subject: 'Hello',
    plain: 'Hope you are well. Just wanted to say hello and see how things are going this week.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T10:30:00Z')
  });

  reset();
  state.messages.heb1 = gmailMessage(hebrew);
  const click = {
    gmail: { messageId: 'heb1', accessToken: 'token', threadId: 'thread1' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'heb1', source: 'message' }
  };
  const proof = doIt(click).card;
  const proofLines = linesOf(proof).join('\n');
  const eventIds = Object.keys(state.events);
  const taskIds = Object.keys(state.tasks);
  check('Do it writes one all-day event and one task', eventIds.length === 1 && taskIds.length === 1, { events: eventIds, tasks: taskIds });
  const written = state.events[eventIds[0]];
  const originalSummary = written.summary;
  check('the event is the plan date with no guests', written.start.date === opened.plan.steps[0].params.dateIso && written.end.date && !written.start.dateTime && !written.attendees, written);
  check('the proof shows the event and the task that were read back',
    proofLines.indexOf('On your calendar.') !== -1 && proofLines.indexOf(eventIds[0]) !== -1 &&
    proofLines.indexOf('In Google Tasks.') !== -1 && proofLines.indexOf(taskIds[0]) !== -1 &&
    buttonsOf(proof).length === 1 && buttonsOf(proof)[0].action === 'onUndo', proofLines);
  state.events[eventIds[0]].summary = 'Changed in Calendar';
  const refused = undo(click).card;
  check('an edited event refuses undo for both writes',
    plain(linesOf(refused)[0]) === "The event was edited, so I won't undo it" &&
    state.events[eventIds[0]] && state.tasks[taskIds[0]], linesOf(refused));
  state.events[eventIds[0]].summary = originalSummary;
  const undone = undo(click).card;
  check('undo deletes both when the content hash still matches', plain(linesOf(undone)[0]) === 'Undone.' && !state.events[eventIds[0]] && !state.tasks[taskIds[0]], linesOf(undone));

  reset();
  state.messages.hold1 = gmailMessage({
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  });
  const holdFields = {
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  };
  const holdPlan = judgedPlan(holdFields);
  const held = doIt({
    gmail: { messageId: 'hold1', accessToken: 'token', threadId: 'thread4' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'hold1', source: 'message' }
  }).card;
  const holdIds = Object.keys(state.events);
  const holdClock = String(holdPlan.steps[0].params.hour).padStart(2, '0') + ':' + String(holdPlan.steps[0].params.minute).padStart(2, '0');
  const holdStart = holdPlan.steps[0].params.dateIso + 'T' + holdClock + ':00';
  check('a hold writes one timed event and no task', holdIds.length === 1 && Object.keys(state.tasks).length === 0 && state.events[holdIds[0]].start.dateTime === holdStart && state.events[holdIds[0]].end.dateTime.indexOf('T') === 10, state.events[holdIds[0]]);
  check('the hold proof names the event', linesOf(held).join('\n').indexOf('On your calendar.') !== -1 && linesOf(held).join('\n').indexOf(holdIds[0]) !== -1);
  delete state.props['glanceUndo_hold1'];
  const noSnap = undo({
    gmail: { messageId: 'hold1', accessToken: 'token', threadId: 'thread4' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'hold1', source: 'message' }
  }).card;
  check('undo with no snapshot does not delete the event', state.events[holdIds[0]] && plain(linesOf(noSnap)[0]) === "Couldn't confirm", linesOf(noSnap));
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll checks passed');
