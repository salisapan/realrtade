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

console.log('\n--- host boundaries ---');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(addon, 'appsscript.json'), 'utf8'));
  const scopes = manifest.oauthScopes.slice().sort();
  const expected = [
    'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
    'https://www.googleapis.com/auth/gmail.addons.execute',
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/tasks'
  ];
  check('scopes are the four allowed ones', JSON.stringify(scopes) === JSON.stringify(expected), scopes);
  check('no calendar service', !JSON.stringify(manifest).match(/calendar/i));
  check('contextual trigger is message open', manifest.addOns.gmail.contextualTriggers[0].onTriggerFunction === 'onGmailMessageOpen');
  check('locale comes from the app', manifest.addOns.common.useLocaleFromApp === true);
  const host = fs.readFileSync(path.join(addon, 'Code.js'), 'utf8');
  check('host never sends mail', !/gmail\.send|sendEmail|Drafts\.send|MailApp|createDraft|\.send\(/.test(host));
  check('host does not patch a task', !/Tasks\.Tasks\.patch|Tasks\.Tasks\.update/.test(host));
  check('host reads the task back through performCreate', host.indexOf('performCreate') !== -1 && host.indexOf('performUndo') !== -1);
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll checks passed');
