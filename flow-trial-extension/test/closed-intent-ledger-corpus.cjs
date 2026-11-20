'use strict';
// Closed-intent ledger: types only, opt-in, export, delete, undo.
// Fixture mail uses example.com. No real mailbox text.
// Run: node test/closed-intent-ledger-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowClosedIntentLedger: L } = require('../core/closed-intent-ledger.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const NOW = Date.parse('2026-11-20T15:04:00.000Z');
const LATER = Date.parse('2026-11-20T23:50:00.000Z');
const NEXT = Date.parse('2026-11-21T00:10:00.000Z');

const SUBJECT = 'Please send the quote to Dana at dana@example.com';
const BODY = 'Hi Dana, please send the signed quote for the example.com renewal by Friday.';
const FROM = 'Dana Levi <dana@example.com>';
const TO = 'Sali <sali@example.com>';
const MSG = 'msg-example-1842';
const THREAD = 'thread-example-99';
const EXT = 'AAMkAGI2EXAMPLE';
const NEEDLES = [SUBJECT, BODY, FROM, TO, 'dana@example.com', 'sali@example.com', 'Dana Levi', MSG, THREAD, EXT, 'example.com renewal'];

function memory() {
  const box = { value: undefined };
  return {
    box: box,
    async get() { return box.value; },
    async set(_key, value) { box.value = value; }
  };
}

function arm(store) {
  L.setStorageAdapter(store);
}

function poison(extra) {
  return Object.assign({
    subject: SUBJECT,
    body: BODY,
    bodyText: BODY,
    from: FROM,
    to: TO,
    sender: FROM,
    label: SUBJECT,
    name: 'Dana Levi',
    messageId: MSG,
    threadId: THREAD,
    externalId: EXT,
    url: 'https://mail.google.com/mail/u/0/#inbox/' + MSG,
    ref: { externalId: EXT, taskId: MSG },
    writtenLine: BODY,
    closedLine: SUBJECT,
    intentType: SUBJECT,
    surface: 'dana@example.com',
    targetSystem: 'Dana Levi',
    outcome: SUBJECT,
    confidence: 'dana@example.com',
    day: SUBJECT,
    latencyMs: SUBJECT,
    note: BODY
  }, extra || {});
}

function leaked(value) {
  const blob = JSON.stringify(value);
  return NEEDLES.filter((n) => blob.indexOf(n) >= 0);
}

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'core/closed-intent-ledger.schema.json'), 'utf8'));

console.log('--- schema allowlist ---');
check('schema rejects extra properties', schema.additionalProperties === false);
check('schema version is 1', schema.properties.schemaVersion.const === 1 && L.SCHEMA_VERSION === 1);
check('intent types match the schema', JSON.stringify(schema.properties.intentType.enum) === JSON.stringify(L.INTENT_TYPES));
check('surfaces match the schema', JSON.stringify(schema.properties.surface.enum) === JSON.stringify(L.SURFACES));
check('targets match the schema', JSON.stringify(schema.properties.targetSystem.enum) === JSON.stringify(L.TARGETS));
check('outcomes match the schema', JSON.stringify(schema.properties.outcome.enum) === JSON.stringify(L.OUTCOMES));
check('confidence buckets match the schema', JSON.stringify(schema.properties.confidence.enum) === JSON.stringify(L.CONFIDENCE));
check('required keys are the record keys', JSON.stringify(schema.required) === JSON.stringify(L.KEYS));

const closed = L.buildRecord(poison({
  kind: 'written',
  fetchedBack: true,
  app: 'gmail',
  connectorId: 'googleTask',
  intentHint: 'log-it',
  score: 82,
  latencyMs: 1200,
  ts: NOW
}), NOW);
check('a proved write builds one record', !!closed);
check('record keys are the allowlist', closed && JSON.stringify(Object.keys(closed).sort()) === JSON.stringify(L.KEYS.slice().sort()));
check('intent type is the catalog type', closed && closed.intentType === 'create_task');
check('surface and target are types', closed && closed.surface === 'gmail' && closed.targetSystem === 'tasks');
check('outcome is closed', closed && closed.outcome === 'closed');
check('confidence is a bucket, not the score', closed && closed.confidence === 'high' && closed.score === undefined);
check('day is UTC day granularity', closed && closed.day === '2026-11-20' && closed.day.indexOf('T') < 0);
check('the same UTC day collapses the clock', L.buildRecord(poison({ kind: 'written', fetchedBack: true, app: 'outlook', ts: LATER }), LATER).day === '2026-11-20');
check('the next UTC day is the next day', L.buildRecord(poison({ kind: 'written', fetchedBack: true, ts: NEXT }), NEXT).day === '2026-11-21');
check('fixture mail cannot enter a record', leaked(closed).length === 0, leaked(closed));

const direct = L.buildRecord({
  outcome: 'closed',
  intentType: 'send_quote',
  surface: 'teams',
  targetSystem: 'calendar',
  confidence: 'medium',
  latencyMs: 40,
  day: '2026-11-20',
  subject: SUBJECT,
  messageId: MSG
}, NOW);
check('a direct types call keeps send_quote on teams', direct && direct.intentType === 'send_quote' && direct.surface === 'teams' && direct.targetSystem === 'calendar');
check('a direct call still drops the fixture', leaked(direct).length === 0, leaked(direct));

['send_quote', 'create_event', 'create_task', 'draft_reply', 'create_document', 'save_file'].forEach((type) => {
  const row = L.buildRecord({ outcome: 'closed', intentType: type, surface: 'gmail', targetSystem: 'other', day: '2026-11-20' }, NOW);
  check('enum ' + type + ' is stored as itself', row && row.intentType === type);
});

check('a sentence intent becomes other', L.buildRecord(poison({ outcome: 'closed', intentType: SUBJECT, day: '2026-11-20' }), NOW).intentType === 'other');
check('a name is not a surface', L.buildRecord(poison({ outcome: 'closed', surface: 'Dana Levi', day: '2026-11-20' }), NOW).surface === 'other');
check('an address is not a target', L.buildRecord(poison({ outcome: 'closed', targetSystem: 'dana@example.com', day: '2026-11-20' }), NOW).targetSystem === 'other');
check('a shown row is not a record', L.buildRecord(poison({ kind: 'shown', app: 'gmail', ts: NOW }), NOW) === null);
check('a click is not a record', L.buildRecord(poison({ kind: 'clicked', ts: NOW }), NOW) === null);
check('an unproved write is failed', L.buildRecord(poison({ kind: 'written', fetchedBack: false, app: 'outlook', connectorId: 'outlookTask', ts: NOW }), NOW).outcome === 'failed');
const undone = L.buildRecord(poison({ kind: 'undone', app: 'gmail', connectorId: 'calendar', intentHint: 'hold', ts: NOW }), NOW);
check('undo marks outcome undone', undone && undone.outcome === 'undone' && undone.intentType === 'create_event' && undone.targetSystem === 'calendar');
check('an undo record has no fixture text', leaked(undone).length === 0, leaked(undone));
check('a string latency cannot ride along', L.buildRecord(poison({ outcome: 'closed', latencyMs: SUBJECT, day: '2026-11-20' }), NOW).latencyMs === 0);
check('latency is capped', L.buildRecord({ outcome: 'closed', latencyMs: 999999999, day: '2026-11-20' }, NOW).latencyMs === 86400000);

console.log('--- opt-in, export, delete ---');
(async function run() {
  const store = memory();
  arm(store);
  check('default is off', (await L.isEnabled()) === false);
  const skipped = await L.noteActivity(poison({ kind: 'written', fetchedBack: true, app: 'gmail', connectorId: 'draft', intentHint: 'draft', score: 50, ts: NOW }), NOW);
  check('opt-out writes nothing', skipped === null && (!store.box.value || !store.box.value.records || store.box.value.records.length === 0));
  check('turning on is explicit', (await L.setEnabled(true)) === true && (await L.isEnabled()) === true);
  const kept = await L.noteActivity(poison({ kind: 'written', fetchedBack: true, app: 'gmail', connectorId: 'googleTask', intentHint: 'task', score: 90, latencyMs: 10, ts: NOW }), NOW);
  check('opt-in appends the clean record', kept && kept.outcome === 'closed' && store.box.value.records.length === 1);
  check('stored row has no fixture', leaked(store.box.value).length === 0, leaked(store.box.value));
  const back = await L.noteActivity(poison({ kind: 'undone', app: 'gmail', connectorId: 'googleTask', intentHint: 'task', ts: LATER }), LATER);
  check('undo appends outcome undone', back && back.outcome === 'undone' && store.box.value.records.length === 2 && store.box.value.records[0].outcome === 'closed');
  check('turning off stops the next record', (await L.setEnabled(false)) === false);
  const after = await L.noteActivity(poison({ kind: 'written', fetchedBack: true, app: 'outlook', ts: NEXT }), NEXT);
  check('a record after off is dropped and the old rows remain', after === null && store.box.value.records.length === 2 && store.box.value.enabled === false);

  await L.setEnabled(true);
  store.box.value.records.push({
    schemaVersion: 1,
    intentType: 'create_task',
    surface: 'gmail',
    targetSystem: 'tasks',
    outcome: 'closed',
    confidence: 'low',
    latencyMs: 1,
    day: '2026-11-20',
    subject: SUBJECT,
    messageId: MSG,
    from: FROM
  });
  const doc = await L.exportAll(NOW);
  check('export is the schema document', doc.schema === 'glance.closed-intent-ledger' && doc.schemaVersion === 1 && doc.exportedDay === '2026-11-20');
  check('export drops a smuggled content field', doc.records.every((r) => leaked(r).length === 0 && Object.keys(r).length === L.KEYS.length), leaked(doc));
  check('export has no network field', doc.endpoint === undefined && doc.url === undefined);

  const removed = await L.deleteAll();
  const empty = await L.exportAll(NOW);
  check('delete all clears rows and keeps the choice', removed.deleted === true && removed.enabled === true && empty.records.length === 0 && (await L.isEnabled()) === true);
  const off = await L.deleteAll();
  await L.setEnabled(false);
  check('delete still works while off', off.deleted === true && (await L.isEnabled()) === false);

  let calls = 0;
  const transport = () => { calls += 1; return Promise.resolve({ ok: true }); };
  const up = await L.uploadAggregate(transport);
  check('upload is disabled and does not call a transport', up.ok === false && up.reason === 'disabled' && up.sent === false && up.endpoint === null && calls === 0 && L.AGGREGATE_SYNC.enabled === false && L.AGGREGATE_SYNC.endpoint === null);

  const src = fs.readFileSync(path.join(ROOT, 'core/closed-intent-ledger.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'chrome.', 'document.', 'window.'].forEach((needle) => {
    check('ledger source has no ' + needle, src.indexOf(needle) < 0);
  });

  console.log('--- Hebrew and English ---');
  const en = L.copy('en');
  const he = L.copy('he');
  const keys = Object.keys(en).sort();
  check('copy keys match', JSON.stringify(keys) === JSON.stringify(Object.keys(he).sort()) && keys.length > 0);
  keys.forEach((key) => {
    check('en ' + key + ' is plain text', typeof en[key] === 'string' && en[key].length > 0 && /[A-Za-z]/.test(en[key]));
    check('he ' + key + ' is Hebrew', typeof he[key] === 'string' && /[\u0590-\u05FF]/.test(he[key]));
    check(key + ' is not the same sentence twice', en[key] !== he[key]);
  });
  check('English says what is recorded and what is never recorded', /What is recorded:/.test(en.hint) && /What is never recorded:/.test(en.hint) && /mail text/.test(en.hint));
  check('Hebrew says what is recorded and what is never recorded', /נרשם/.test(he.hint) && /לא נרשמים/.test(he.hint) && /מזהה/.test(he.hint));
  const popup = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  ['title', 'hint', 'toggleOff', 'export', 'deleteAll'].forEach((key) => {
    check('settings show the Hebrew ' + key, popup.indexOf(he[key]) >= 0);
  });
  const popupJs = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');
  check('settings paint both languages from the ledger copy', popupJs.indexOf('FlowClosedIntentLedger') >= 0 && popupJs.indexOf('api.copy(uiLang())') >= 0 && popupJs.indexOf('api.copy(lang)') >= 0 && popupJs.indexOf('closedIntentExport') >= 0 && popupJs.indexOf('closedIntentDelete') >= 0);

  console.log('--- activity log hook ---');
  const hook = fs.readFileSync(path.join(ROOT, 'src/storage.js'), 'utf8');
  check('appendLog notes the ledger after the log write', /await set\(patch\);\s*await Promise\.resolve\(noteClosedIntent\(state, row\)\)/.test(hook));
  const callAt = hook.indexOf('api.noteActivity({');
  const call = callAt >= 0 ? hook.slice(callAt, hook.indexOf('});', callAt)) : '';
  check('the hook projection has no content fields', call.length > 0 && !/messageId|subject|label|sender|threadId|externalId|writtenLine|chatKey/.test(call), call.slice(0, 300));

  const store2 = memory();
  const bag = {};
  const sandbox = {
    module: undefined,
    console: console,
    crypto: { randomUUID: () => 'test-uuid' },
    chrome: {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = {};
            Object.keys(keys || {}).forEach((k) => {
              result[k] = Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : keys[k];
            });
            cb(result);
          },
          set: (patch, cb) => { Object.assign(bag, patch); if (cb) cb(); }
        }
      },
      runtime: { sendMessage: (_msg, cb) => { if (cb) cb(undefined); } }
    }
  };
  vm.createContext(sandbox);
  for (const file of ['pmf-metrics.js', 'classification-metrics.js', 'close-quality-metrics.js', 'quiet-metrics.js', 'privacyShield.js', 'learning-ledger.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', file), 'utf8'), sandbox, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/closed-intent-ledger.js'), 'utf8'), sandbox, { filename: 'closed-intent-ledger.js' });
  sandbox.FlowClosedIntentLedger.setStorageAdapter(store2);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/storage.js'), 'utf8'), sandbox, { filename: 'storage.js' });
  const FlowStorage = vm.runInContext('FlowStorage', sandbox);
  await sandbox.FlowClosedIntentLedger.setEnabled(true);
  await FlowStorage.appendLog({
    kind: 'shown',
    messageId: MSG,
    label: SUBJECT,
    subject: SUBJECT,
    sender: FROM,
    process: { id: 'hold', name: SUBJECT },
    intent: { type: 'event', label: SUBJECT },
    score: 80,
    app: 'gmail',
    ts: NOW - 2500
  });
  await FlowStorage.appendLog({
    kind: 'written',
    label: SUBJECT,
    messageId: MSG,
    threadId: THREAD,
    subject: SUBJECT,
    sender: FROM,
    url: 'https://mail.google.com/mail/u/0/#inbox/' + MSG,
    ref: { externalId: EXT },
    connectorId: 'calendar',
    app: 'gmail',
    fetchedBack: true,
    writtenLine: BODY,
    ts: NOW
  });
  await FlowStorage.appendLog({
    kind: 'undone',
    label: SUBJECT,
    messageId: MSG,
    connectorId: 'calendar',
    app: 'outlook',
    undone: true,
    ts: LATER
  });
  const logged = store2.box.value.records;
  check('the log hook stored a close and an undo', Array.isArray(logged) && logged.length === 2, logged);
  check('the hooked close is create_event on the calendar', logged && logged[0].intentType === 'create_event' && logged[0].targetSystem === 'calendar' && logged[0].outcome === 'closed' && logged[0].confidence === 'high' && logged[0].surface === 'gmail');
  check('the hooked undo is outlook and undone', logged && logged[1].outcome === 'undone' && logged[1].surface === 'outlook');
  check('latency is the gap from shown to written, not a clock in the text', logged && logged[0].latencyMs === 2500);
  check('hooked rows contain no fixture mail', leaked(logged).length === 0, leaked(logged));
  await sandbox.FlowClosedIntentLedger.setEnabled(false);
  await FlowStorage.appendLog({ kind: 'written', fetchedBack: true, messageId: 'other', label: SUBJECT, app: 'gmail', connectorId: 'task', ts: NEXT });
  check('the hook stays quiet after opt-out', store2.box.value.records.length === 2);

  console.log('--- where it loads ---');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const gmailJs = manifest.content_scripts[0].js;
  check('Gmail loads the ledger before the storage adapter', gmailJs.indexOf('core/closed-intent-ledger.js') >= 0 && gmailJs.indexOf('core/closed-intent-ledger.js') < gmailJs.indexOf('src/chrome-storage-adapter.js'));
  check('Gmail content script is still last', gmailJs[gmailJs.length - 1] === 'src/content-gmail.js');
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  check('the chat base does not take the ledger', only.indexOf('core/closed-intent-ledger.js') >= 0);
  const chatBase = gmailJs.filter((f) => only.indexOf(f) < 0);
  check('WhatsApp loader list stays without the ledger', chatBase.indexOf('core/closed-intent-ledger.js') < 0 && chatBase.indexOf('src/closed-intent-ledger-wire.js') < 0);
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  check('Outlook loads the ledger and the wire', extra.indexOf('core/closed-intent-ledger.js') >= 0 && extra.indexOf('src/closed-intent-ledger-wire.js') >= 0);
  check('no new manifest permission', JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'identity', 'sidePanel', 'alarms', 'notifications', 'scripting', 'contextMenus', 'offscreen']));
  check('manifest version was not published', manifest.version === '0.9.56');
  const readme = fs.readFileSync(path.join(ROOT, 'core/README.md'), 'utf8');
  check('core README names the module', readme.indexOf('`closed-intent-ledger.js`') >= 0);
  const popupHtml = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  check('the popup loads the module before the adapter', popupHtml.indexOf('core/closed-intent-ledger.js') >= 0 && popupHtml.indexOf('core/closed-intent-ledger.js') < popupHtml.indexOf('src/chrome-storage-adapter.js'));

  const bundleList = fs.readFileSync(path.join(REPO, 'glance-gmail-addon/scripts/build-bundle.js'), 'utf8');
  check('CoreBundle source list is unchanged for this module', bundleList.indexOf('closed-intent-ledger') < 0);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
