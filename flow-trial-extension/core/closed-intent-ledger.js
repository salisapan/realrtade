// Closed-intent ledger. A consented, local record of what actually got done.
// Types only: intent type, surface, target system, outcome, confidence bucket,
// latency, schema version, and the UTC day. No mail text, subject, name,
// address, or identifier can be stored. Portable: no browser globals, no network.
//
// Off until the person opts in. Turning it off stops new records immediately.
// Export and delete run on the stored list. Aggregate upload is a disabled stub.
//
// The JSON schema next to this file is the contract Flow templates and Flow
// Shadow can read later. This module enforces the same allowlist.
const FlowClosedIntentLedger = (() => {
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'glanceClosedIntentLedger';
  const CAP = 500;
  const SCHEMA_ID = 'glance.closed-intent-ledger';
  const LATENCY_MAX = 86400000;

  const INTENT_TYPES = ['send_quote', 'create_event', 'create_task', 'draft_reply', 'create_document', 'save_file', 'other'];
  const SURFACES = ['gmail', 'outlook', 'teams', 'whatsapp', 'messenger', 'instagram', 'slack', 'telegram', 'chat', 'addon', 'other'];
  const TARGETS = ['calendar', 'drive', 'onedrive', 'todo', 'tasks', 'drafts', 'docs', 'sheets', 'teams', 'other'];
  const OUTCOMES = ['closed', 'undone', 'failed'];
  const CONFIDENCE = ['high', 'medium', 'low', 'unknown'];
  const KEYS = ['schemaVersion', 'intentType', 'surface', 'targetSystem', 'outcome', 'confidence', 'latencyMs', 'day'];

  const INTENT_MAP = {
    send_quote: 'send_quote', quote: 'send_quote', proposal: 'send_quote',
    create_event: 'create_event', event: 'create_event', calendar: 'create_event',
    hold: 'create_event', schedule: 'create_event', 'schedule-confirm': 'create_event', meeting: 'create_event',
    create_task: 'create_task', task: 'create_task', 'log-it': 'create_task', commitment: 'create_task',
    request: 'create_task', googletask: 'create_task', googletasks: 'create_task',
    outlooktask: 'create_task', microsofttodo: 'create_task',
    draft_reply: 'draft_reply', draft: 'draft_reply', 'reply-track': 'draft_reply', reply: 'draft_reply',
    create_document: 'create_document', document: 'create_document', doc: 'create_document',
    'create-missing': 'create_document', googledoc: 'create_document',
    save_file: 'save_file', file: 'save_file', 'file-it': 'save_file', 'file-on-hold': 'save_file',
    'file-on-task': 'save_file', onedrivefile: 'save_file', drivefile: 'save_file', attachmentsave: 'save_file'
  };

  const SURFACE_MAP = {
    gmail: 'gmail', outlook: 'outlook', teams: 'teams', whatsapp: 'whatsapp',
    messenger: 'messenger', instagram: 'instagram', slack: 'slack', telegram: 'telegram',
    chat: 'chat', addon: 'addon', 'gmail-addon': 'addon'
  };

  const TARGET_MAP = {
    calendar: 'calendar', googlecalendar: 'calendar', outlookcalendar: 'calendar', 'google/calendar': 'calendar',
    drive: 'drive', googledrive: 'drive', drivefile: 'drive', 'google/drive': 'drive',
    onedrive: 'onedrive', onedrivefile: 'onedrive', 'microsoft/onedrive': 'onedrive',
    todo: 'todo', microsofttodo: 'todo', outlooktask: 'todo', outlooktaskclose: 'todo', 'microsoft/todo': 'todo',
    tasks: 'tasks', task: 'tasks', googletask: 'tasks', googletasks: 'tasks', googletaskclose: 'tasks', 'google/tasks': 'tasks',
    drafts: 'drafts', draft: 'drafts', gmaildraft: 'drafts', outlookdraft: 'drafts',
    docs: 'docs', doc: 'docs', googledoc: 'docs', 'google/docs': 'docs',
    sheets: 'sheets', sheet: 'sheets', googlesheets: 'sheets', 'google/sheets': 'sheets',
    teams: 'teams'
  };

  // TODO(closed-intent-ledger): anonymous aggregate sync.
  // A later build may send counts of these types only, after a separate consent,
  // to an endpoint that does not exist yet. This build has no endpoint and
  // makes no request. Do not add a host, a scope, or a caller here.
  const AGGREGATE_SYNC = Object.freeze({ enabled: false, endpoint: null });

  const COPY = {
    en: {
      title: 'Closed-intent ledger',
      hint: 'Off until you turn it on. Stored only on this device. What is recorded: the intent type, the surface, the target system, the outcome, and the day. What is never recorded: mail text, subjects, names, addresses, or identifiers.',
      toggleOff: 'Keep a ledger of what closed',
      toggleOn: 'Ledger on. Tap to stop',
      export: 'Download the ledger',
      deleteAll: 'Delete all',
      deleteConfirm: 'Delete the closed-intent ledger from this device? This cannot be undone.',
      stopped: 'Recording stopped.',
      started: 'Recording is on. Types only, on this device.',
      deleted: 'The ledger was deleted from this device.',
      exported: 'The file downloaded on this device.',
      empty: 'The ledger is empty. The file still downloaded.'
    },
    he: {
      title: 'יומן סגירות',
      hint: 'כבוי עד שמדליקים. נשמר רק על המכשיר. נרשם סוג הכוונה, המשטח, המערכת, התוצאה והיום. לא נרשמים טקסט, נושא, שם, כתובת או מזהה.',
      toggleOff: 'שמור יומן של מה שנסגר',
      toggleOn: 'היומן פועל. לחיצה עוצרת',
      export: 'הורדת היומן',
      deleteAll: 'מחק הכל',
      deleteConfirm: 'למחוק את יומן הסגירות מהמכשיר? אי אפשר לבטל.',
      stopped: 'הרישום נעצר.',
      started: 'הרישום פועל. רק סוגים, על המכשיר.',
      deleted: 'היומן נמחק מהמכשיר.',
      exported: 'הקובץ ירד על המכשיר.',
      empty: 'היומן ריק. הקובץ ירד בכל זאת.'
    }
  };

  function inMemoryAdapter() {
    let value;
    return {
      async get() { return value; },
      async set(_key, next) { value = next; }
    };
  }

  let adapter = inMemoryAdapter();
  let tail = Promise.resolve();

  function setStorageAdapter(next) {
    if (next && typeof next.get === 'function' && typeof next.set === 'function') adapter = next;
  }

  function enqueue(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(function () {}, function () {});
    return run;
  }

  function token(value) {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s) ? s : '';
  }

  function systemToken(value) {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[a-z0-9][a-z0-9./-]{0,48}$/.test(s) ? s : '';
  }

  function validDay(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const parts = s.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function dayOf(input, now) {
    const i = input || {};
    if (typeof i.day === 'string' && validDay(i.day)) return i.day;
    const n = Number.isFinite(i.ts) ? i.ts : (Number.isFinite(i.at) ? i.at : (Number.isFinite(now) ? now : Date.now()));
    if (!Number.isFinite(n)) return '';
    const dt = new Date(n);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  function mapped(map, value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw && map[raw]) return map[raw];
    const t = token(value);
    return t && map[t] ? map[t] : '';
  }

  function intentTypeOf(input) {
    const i = input || {};
    const hints = [i.intentType, i.intentHint, i.processId, i.connectorId];
    for (let n = 0; n < hints.length; n++) {
      const hit = mapped(INTENT_MAP, hints[n]);
      if (hit) return hit;
      const t = token(hints[n]);
      if (t && INTENT_TYPES.indexOf(t) >= 0) return t;
    }
    return 'other';
  }

  function surfaceOf(input) {
    const i = input || {};
    const hit = mapped(SURFACE_MAP, i.surface) || mapped(SURFACE_MAP, i.app);
    if (hit) return hit;
    const t = token(i.surface) || token(i.app);
    return t && SURFACES.indexOf(t) >= 0 ? t : 'other';
  }

  function targetOf(input) {
    const i = input || {};
    const hints = [i.targetSystem, i.connectorId, i.system];
    for (let n = 0; n < hints.length; n++) {
      const raw = systemToken(hints[n]);
      if (raw && TARGET_MAP[raw]) return TARGET_MAP[raw];
      const hit = mapped(TARGET_MAP, hints[n]);
      if (hit) return hit;
    }
    return 'other';
  }

  function outcomeOf(input) {
    const i = input || {};
    if (i.kind === 'undone' || i.undone === true) return 'undone';
    const fetched = i.fetchedBack === true || i.proofFetchedBack === true || (i.proof && i.proof.fetchedBack === true);
    const missed = i.fetchedBack === false || i.proofFetchedBack === false || (i.proof && i.proof.fetchedBack === false);
    if (i.kind === 'failed') return 'failed';
    if (i.kind === 'written' && fetched) return 'closed';
    if (i.kind === 'written' && missed) return 'failed';
    if (i.kind === 'shown' || i.kind === 'clicked' || i.kind === 'dismissed') return '';
    if (!i.kind && OUTCOMES.indexOf(i.outcome) >= 0) return i.outcome;
    return '';
  }

  function confidenceOf(input) {
    const i = input || {};
    const c = token(i.confidence);
    if (CONFIDENCE.indexOf(c) >= 0) return c;
    const score = Number(i.score);
    if (!Number.isFinite(score)) return 'unknown';
    if (score >= 75) return 'high';
    if (score >= 45) return 'medium';
    if (score > 0) return 'low';
    return 'unknown';
  }

  function latencyOf(input) {
    const n = Number(input && input.latencyMs);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), LATENCY_MAX);
  }

  // The only object that may be stored. Unknown keys are dropped. A value that
  // is not an allowlisted type becomes the safe bucket, never the original text.
  function buildRecord(input, now) {
    if (!input || typeof input !== 'object') return null;
    const outcome = outcomeOf(input);
    if (!outcome) return null;
    const day = dayOf(input, now);
    if (!validDay(day)) return null;
    const record = {
      schemaVersion: SCHEMA_VERSION,
      intentType: intentTypeOf(input),
      surface: surfaceOf(input),
      targetSystem: targetOf(input),
      outcome: outcome,
      confidence: confidenceOf(input),
      latencyMs: latencyOf(input),
      day: day
    };
    const keys = Object.keys(record);
    if (keys.length !== KEYS.length) return null;
    for (let i = 0; i < KEYS.length; i++) {
      if (keys.indexOf(KEYS[i]) < 0) return null;
      const value = record[KEYS[i]];
      if (typeof value === 'string' && (/[@\s]/.test(value) || value.length > 40)) return null;
    }
    return record;
  }

  async function read() {
    let raw = null;
    try { raw = await adapter.get(STORAGE_KEY); } catch (e) { raw = null; }
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: !!(raw && raw.enabled === true),
      records: Array.isArray(raw && raw.records) ? raw.records : []
    };
  }

  async function write(state) {
    await adapter.set(STORAGE_KEY, {
      schemaVersion: SCHEMA_VERSION,
      enabled: state.enabled === true,
      records: Array.isArray(state.records) ? state.records : []
    });
  }

  function noteActivity(input, now) {
    const record = buildRecord(input, now);
    if (!record) return Promise.resolve(null);
    return enqueue(async function () {
      const state = await read();
      if (state.enabled !== true) return null;
      const records = state.records.concat([record]);
      const capped = records.length > CAP ? records.slice(records.length - CAP) : records;
      await write({ enabled: true, records: capped });
      return record;
    });
  }

  function setEnabled(on) {
    const next = on === true;
    return enqueue(async function () {
      const state = await read();
      await write({ enabled: next, records: state.records });
      return next;
    });
  }

  function isEnabled() {
    return enqueue(async function () {
      const state = await read();
      return state.enabled === true;
    });
  }

  function exportDocument(state, now) {
    const records = [];
    const list = state && Array.isArray(state.records) ? state.records : [];
    for (let i = 0; i < list.length; i++) {
      const clean = buildRecord(list[i], now);
      if (clean) records.push(clean);
    }
    return {
      schema: SCHEMA_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedDay: dayOf({ ts: Number.isFinite(now) ? now : Date.now() }, now),
      records: records
    };
  }

  function exportAll(now) {
    return enqueue(async function () {
      return exportDocument(await read(), now);
    });
  }

  function deleteAll() {
    return enqueue(async function () {
      const state = await read();
      await write({ enabled: state.enabled === true, records: [] });
      return { deleted: true, enabled: state.enabled === true };
    });
  }

  function uploadAggregate() {
    return Promise.resolve({ ok: false, reason: 'disabled', sent: false, endpoint: null });
  }

  function copy(lang) {
    const src = (lang === 'he' || lang === 'iw') ? COPY.he : COPY.en;
    const out = {};
    const keys = Object.keys(COPY.en);
    for (let i = 0; i < keys.length; i++) out[keys[i]] = src[keys[i]];
    return out;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    CAP: CAP,
    SCHEMA_ID: SCHEMA_ID,
    INTENT_TYPES: INTENT_TYPES,
    SURFACES: SURFACES,
    TARGETS: TARGETS,
    OUTCOMES: OUTCOMES,
    CONFIDENCE: CONFIDENCE,
    KEYS: KEYS,
    AGGREGATE_SYNC: AGGREGATE_SYNC,
    buildRecord: buildRecord,
    noteActivity: noteActivity,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    exportAll: exportAll,
    exportDocument: exportDocument,
    deleteAll: deleteAll,
    uploadAggregate: uploadAggregate,
    copy: copy,
    setStorageAdapter: setStorageAdapter
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowClosedIntentLedger };
else if (typeof globalThis !== 'undefined') globalThis.FlowClosedIntentLedger = FlowClosedIntentLedger;
