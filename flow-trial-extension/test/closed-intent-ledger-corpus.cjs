'use strict';
// Closed-intent ledger: CloudEvents, upcast, privacy, metrics.
// Fixtures use example.com. No real mailbox text.
// Run: node test/closed-intent-ledger-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowClosedIntentLedger: L } = require('../core/closed-intent-ledger.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const NOW = Date.parse('2026-11-20T15:04:00.000Z');
const SUBJECT = 'Please send the quote to Dana at dana@example.com';
const BODY = 'Hi Dana, please send the signed quote for the example.com renewal by Friday.';
const FROM = 'Dana Levi <dana@example.com>';
const PHONE = '+972501234567';
const URL = 'https://mail.google.com/mail/u/0/#inbox/msg-example-1842';
const NEEDLES = [SUBJECT, BODY, FROM, 'dana@example.com', 'sali@example.com', 'Dana Levi', PHONE, URL, 'msg-example-1842', 'AAMkAGI2EXAMPLE'];

function memory() {
  const box = { value: null };
  return {
    box: box,
    async get() { return box.value; },
    async set(_key, value) { box.value = value; }
  };
}

function leaked(value) {
  const blob = JSON.stringify(value);
  return NEEDLES.filter((n) => blob.indexOf(n) >= 0);
}

function poison(extra) {
  return Object.assign({
    subject: SUBJECT, body: BODY, from: FROM, label: SUBJECT, url: URL,
    messageId: 'msg-example-1842', externalId: 'AAMkAGI2EXAMPLE', phone: PHONE
  }, extra || {});
}

console.log('--- envelope and allowlist ---');
check('explore.epsilon is off', L.EXPLORE_EPSILON === 0 && L.DP_NOISE.enabled === false && L.AGGREGATE_SYNC.enabled === false);
const shown = L.buildEvents(poison({
  kind: 'shown', app: 'gmail', intentHint: 'hold', score: 82, ts: NOW, tzOffsetMinutes: 0, engineVersion: 'dev'
}), { now: NOW, seq: 0, installUuid: L.uuidv7(NOW) });
check('a shown row emits a decision and then shown', shown.ok && shown.events && shown.events.length === 2 && shown.events[0].type.indexOf('decision') >= 0 && shown.events[1].type.indexOf('shown') >= 0, shown);
const decision = shown.events && shown.events[0];
check('the decision is CloudEvents 1.0', !!(decision && decision.specversion === '1.0' && decision.seq === 0), decision);
check('score is quantized to 0.05', shown.events && shown.events[0].data.candidates[0].raw_score_q === 0.8);
check('propensity is 1 when deterministic', shown.events && shown.events[0].data.propensity === 1 && shown.events[0].data.deterministic === true && shown.events[0].data.explore_epsilon === 0);
check('fixture mail cannot enter an event', leaked(shown.events).length === 0, leaked(shown.events));
const closed = L.buildEvents({
  kind: 'written', fetchedBack: true, app: 'teams', intentHint: 'task', connectorId: 'googleTask',
  decisionId: shown.decisionId, intentId: shown.intentId, score: 82, ts: NOW, tzOffsetMinutes: -120, engineVersion: 'dev'
}, { now: NOW, seq: 4, installUuid: L.uuidv7(NOW) });
check('a Teams close is surface teams', closed.ok && closed.events[0].data.surface === 'teams' && closed.events[0].data.intent_type === 'create_task');
check('local day uses the offset, not UTC', closed.events && closed.events[0].data.local_day === '2026-11-20' && closed.events[0].data.tz_offset_bucket === 'utc_p2');
const late = L.buildEvents({
  kind: 'written', fetchedBack: true, app: 'gmail', intentType: 'create_event', ts: Date.parse('2026-11-20T22:30:00Z'), tzOffsetMinutes: -120
}, { now: Date.parse('2026-11-20T22:30:00Z'), seq: 1, installUuid: L.uuidv7(NOW) });
check('UTC evening is the next local day', late.events && late.events[0].data.local_day === '2026-11-21');
check('an action is never explored', L.exploreChoice({ chosen: 'create_task', epsilon: 0.9, mode: 'action', allowExplore: true, roll: 0.1, candidates: [{ intentType: 'draft_reply' }] }).chosen === 'create_task');
check('a chip can explore only when a test allows it', L.exploreChoice({ chosen: 'create_task', epsilon: 0.9, mode: 'chip', allowExplore: true, roll: 0.1, candidates: [{ intentType: 'draft_reply' }] }).chosen === 'draft_reply');
check('production explore stays on the chosen type', L.exploreChoice({ chosen: 'create_task', epsilon: 0.9, mode: 'chip', roll: 0.1, candidates: [{ intentType: 'draft_reply' }] }).epsilon === 0);

const v1 = { schemaVersion: 1, intentType: 'create_task', surface: 'gmail', targetSystem: 'tasks', outcome: 'closed', confidence: 'high', latencyMs: 10, day: '2026-11-18' };
const up = L.upcastV1(v1, { installUuid: L.uuidv7(NOW), seq: 0 });
check('v1 upcasts to a closed event', up && up.type.indexOf('closed') >= 0 && up.data.intent_type === 'create_task' && up.data.local_day === '2026-11-18');
check('upcast does not rewrite the stored row', v1.outcome === 'closed' && v1.day === '2026-11-18' && v1.schemaVersion === 1);
check('upcast validates', L.validate(up).ok === true, L.validate(up));

console.log('--- pii fuzz ---');
const junk = ['dana@example.com', PHONE, URL, 'דנה לוי', 'Dana Levi', SUBJECT, 'x'.repeat(400)];
junk.forEach((bad) => {
  const built = L.buildEvents({
    kind: 'written', fetchedBack: true, app: bad, intentType: bad, connectorId: bad,
    decisionId: bad, confidence: bad, ts: NOW, tzOffsetMinutes: 0
  }, { now: NOW, seq: 1, installUuid: L.uuidv7(NOW) });
  check('rejects or strips ' + bad.slice(0, 24), !built.ok || leaked(built.events).length === 0, leaked(built.events));
});

console.log('--- opt-in, cap, metrics ---');
(async function run() {
  const store = memory();
  L.setStorageAdapter(store);
  check('default is off', (await L.isEnabled()) === false);
  const skipped = await L.noteActivity({ kind: 'shown', app: 'gmail', intentHint: 'hold', score: 80, ts: NOW, tzOffsetMinutes: 0 }, NOW);
  check('opt-out writes nothing', skipped.reason === 'off' && (!store.box.value || !store.box.value.events || store.box.value.events.length === 0));
  await L.setEnabled(true);
  const first = await L.noteActivity({ kind: 'shown', app: 'gmail', intentHint: 'hold', score: 90, ts: NOW, tzOffsetMinutes: 0, engineVersion: 'dev' }, NOW);
  const second = await L.noteActivity({
    kind: 'written', fetchedBack: true, app: 'gmail', intentHint: 'hold', connectorId: 'calendar',
    decisionId: first.decisionId, intentId: first.intentId, score: 90, latencyMs: 2500, ts: NOW + 2500, tzOffsetMinutes: 0, engineVersion: 'dev'
  }, NOW + 2500);
  const third = await L.noteActivity({
    kind: 'undone', app: 'gmail', intentHint: 'hold', connectorId: 'calendar',
    decisionId: first.decisionId, intentId: first.intentId, ts: NOW + 60000, tzOffsetMinutes: 0, engineVersion: 'dev'
  }, NOW + 60000);
  check('decision, shown, closed, and undone are stored', store.box.value.events.length === 4, store.box.value.events.map((e) => e.type));
  check('undo keeps the decision id', third.events && third.events[0].data.decision_id === first.decisionId);
  const capped = memory();
  L.setStorageAdapter(capped);
  await L.setEnabled(true);
  capped.box.value.settings.cap = 2;
  for (let n = 0; n < 3; n++) {
    await L.noteActivity({ kind: 'written', fetchedBack: true, app: 'slack', intentType: 'save_file', ts: NOW + n, tzOffsetMinutes: 0 }, NOW + n);
  }
  check('cap rollover keeps a closed count', capped.box.value.events.length === 2 && capped.box.value.settings.rolled.closed === 1);
  L.setStorageAdapter(store);
  const all = await L.readAll();
  const rel = L.relationships(all.events);
  check('closed and undone have a decision and a shown', rel.ok === true, rel);
  const m = L.metrics(all.events, NOW + 60000);
  check('an undo inside 10 minutes is a wrong Do It', m.byEngine.dev && m.byEngine.dev.wrong === 1 && m.byEngine.dev.kept === 0, m.byEngine.dev);
  check('latency p50 is the close latency', m.byEngine.dev.p50 === 2500 && m.byEngine.dev.p95 === 2500);
  const miss = L.buildEvents({ stage: 'missed', app: 'gmail', intentType: 'create_task', ts: NOW, tzOffsetMinutes: 0, engineVersion: 'dev' }, { now: NOW, seq: 9, installUuid: store.box.value.settings.installUuid });
  const missMetrics = L.metrics(miss.events, NOW);
  check('a miss with no shown counts', missMetrics.byEngine.dev.miss === 1);
  const q = L.quality(all.events, store.box.value.settings, NOW + 60000);
  check('quality report has a schema mix', q.schemaMix && q.orphanRate === 0, q);
  const rare = L.exportAggregates(all.events, 5);
  check('k=5 suppresses a single close', rare.suppressed.indexOf('create_event') >= 0 && !rare.counts.create_event);
  const own = L.templateCandidates(all.events);
  check('template candidates are types and frequencies', own.length === 1 && own[0].intent_type === 'create_event' && own[0].frequency === 1 && own[0].human_approval === true);
  const view = L.project(all.events, NOW + 60000, L.MINUTES, store.box.value.settings.rolled);
  check('the week view is an estimate', view.estimate === true && view.weekClosed === 1 && view.minutes === L.MINUTES.create_event);
  check('Hebrew and English value lines differ', L.valueLine('he', view) !== L.valueLine('en', view) && /הערכה|דקות|נסגרו/.test(L.valueLine('he', view)));
  await L.setEnabled(false);
  const after = await L.noteActivity({ kind: 'written', fetchedBack: true, app: 'slack', intentType: 'save_file', ts: NOW, tzOffsetMinutes: 0 }, NOW);
  check('turning off stops the next event', after.reason === 'off');
  const guards = L.guardrails(all.events, store.box.value.settings);
  check('opt-out is counted', guards.optOutRate > 0);
  const upDoc = await L.exportAll(NOW);
  check('export has events and no endpoint', upDoc.events.length >= 1 && upDoc.endpoint === undefined && leaked(upDoc.events).length === 0);
  await L.deleteAll();
  const empty = await L.exportAll(NOW);
  check('delete clears events and keeps the choice', empty.events.length === 0 && (await L.isEnabled()) === false);

  const legacy = memory();
  legacy.box.value = { enabled: true, records: [v1] };
  L.setStorageAdapter(legacy);
  const read = await L.readAll();
  check('a stored v1 row is still the original object', legacy.box.value.records[0] === v1);
  check('readAll upcasts the v1 row', read.events.some((e) => e.data && e.data.intent_type === 'create_task' && e.data.local_day === '2026-11-18'));

  console.log('--- files ---');
  const ROOT = path.join(__dirname, '..');
  const REPO = path.join(ROOT, '..');
  const popup = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  const he = L.copy('he');
  ['title', 'hint', 'toggleOff', 'export', 'deleteAll', 'valueEmpty'].forEach((key) => {
    check('settings show Hebrew ' + key, popup.indexOf(he[key]) >= 0);
  });
  const popupJs = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');
  check('settings paint both languages', popupJs.indexOf('api.copy(lang)') >= 0 && popupJs.indexOf('api.copy(uiLang())') >= 0 && popupJs.indexOf('valueLine') >= 0);
  const hook = fs.readFileSync(path.join(ROOT, 'src/storage.js'), 'utf8');
  check('the hook stamps a random id before the log write', hook.indexOf('stampLedgerIds(state, row)') >= 0 && hook.indexOf('row.ledgerDecisionId') >= 0);
  const callAt = hook.indexOf('const input = {');
  const call = callAt >= 0 ? hook.slice(callAt, hook.indexOf('};', callAt)) : '';
  check('the hook input has no content fields', call.length > 0 && !/messageId|subject|label|sender|threadId|externalId|writtenLine|chatKey/.test(call), call.slice(0, 240));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  check('Slack and Telegram load the ledger', bg.indexOf("slack: { label: 'Slack'") >= 0 && bg.indexOf('src/slack-parse.js') >= 0 && bg.split("label: 'Slack'")[1].slice(0, 220).indexOf('closed-intent-ledger.js') >= 0);
  check('WhatsApp files are not the ledger host', !fs.existsSync(path.join(ROOT, 'src/content-whatsapp.js')) || fs.readFileSync(path.join(ROOT, 'src/content-whatsapp.js'), 'utf8').indexOf('closed-intent-ledger') < 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check('no new permission', manifest.permissions.length === 8 && manifest.version === '0.9.56');
  const plan = fs.readFileSync(path.join(REPO, 'ledger/tracking-plan.yaml'), 'utf8');
  check('the plan says consent and no pii', plan.indexOf('legal_basis: consent') >= 0 && plan.indexOf('pii: none') >= 0 && plan.indexOf('explore_epsilon: 0') >= 0);
  const coreSrc = fs.readFileSync(path.join(ROOT, 'core/closed-intent-ledger.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'chrome.', 'document.', 'window.'].forEach((needle) => {
    check('core has no ' + needle, coreSrc.indexOf(needle) < 0);
  });

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
