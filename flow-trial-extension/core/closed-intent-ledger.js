// Closed-intent ledger. Consented, types-only, append-only.
// CloudEvents 1.0 envelopes. Readers upcast the first-run v1 rows in memory
// and do not rewrite them. Portable: no browser globals, no network.
const FlowClosedIntentLedger = (() => {
  const CODE_VERSION = '2.0.0';
  const MODEL = '1-0-0';
  const SETTINGS_KEY = 'glanceClosedIntentLedgerSettings';
  const LEGACY_KEY = 'glanceClosedIntentLedger';
  const EXPLORE_EPSILON = 0;
  const CAP_DEFAULT = 500;
  const RETENTION_DAYS = 365;
  const UUID_ROTATE_MS = 90 * 86400000;
  const K_DEFAULT = 5;
  const KEPT_MS = 10 * 60 * 1000;
  const MISS_MS = 24 * 60 * 60 * 1000;

  const INTENT_TYPES = ['send_quote', 'create_event', 'create_task', 'draft_reply', 'create_document', 'save_file', 'other'];
  const SURFACES = ['gmail', 'outlook', 'teams', 'slack', 'telegram', 'addon', 'other'];
  const TARGETS = ['calendar', 'drive', 'onedrive', 'todo', 'tasks', 'drafts', 'docs', 'sheets', 'teams', 'other'];
  const CONFIDENCE = ['high', 'medium', 'low', 'unknown'];
  const HOURS = ['h00', 'h06', 'h12', 'h18'];
  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const LOCALES = ['he', 'en', 'other'];
  const STAGES = ['decision', 'shown', 'clicked', 'closed', 'undone', 'failed', 'dismissed', 'missed'];
  const MINUTES = { send_quote: 20, create_event: 5, create_task: 3, draft_reply: 8, create_document: 15, save_file: 4, other: 5 };
  const TEMPLATES = {
    send_quote: { inputs: ['intent_type'], steps: ['draft_quote'], human_approval: true, outputs: ['draft'] },
    create_event: { inputs: ['intent_type'], steps: ['create_event'], human_approval: true, outputs: ['calendar_event'] },
    create_task: { inputs: ['intent_type'], steps: ['create_task'], human_approval: true, outputs: ['task'] },
    draft_reply: { inputs: ['intent_type'], steps: ['draft_reply'], human_approval: true, outputs: ['draft'] },
    create_document: { inputs: ['intent_type'], steps: ['create_document'], human_approval: true, outputs: ['document'] },
    save_file: { inputs: ['intent_type'], steps: ['save_file'], human_approval: true, outputs: ['file'] },
    other: { inputs: ['intent_type'], steps: ['review'], human_approval: true, outputs: ['note'] }
  };
  const INTENT_MAP = {
    send_quote: 'send_quote', quote: 'send_quote', proposal: 'send_quote',
    create_event: 'create_event', event: 'create_event', calendar: 'create_event', hold: 'create_event',
    schedule: 'create_event', meeting: 'create_event',
    create_task: 'create_task', task: 'create_task', 'log-it': 'create_task', commitment: 'create_task', request: 'create_task',
    draft_reply: 'draft_reply', draft: 'draft_reply', 'reply-track': 'draft_reply', reply: 'draft_reply',
    create_document: 'create_document', document: 'create_document', doc: 'create_document',
    save_file: 'save_file', file: 'save_file', 'file-it': 'save_file', onedrivefile: 'save_file', drivefile: 'save_file'
  };
  const TARGET_MAP = {
    calendar: 'calendar', googlecalendar: 'calendar', 'google/calendar': 'calendar',
    drive: 'drive', drivefile: 'drive', 'google/drive': 'drive',
    onedrive: 'onedrive', onedrivefile: 'onedrive', 'microsoft/onedrive': 'onedrive',
    todo: 'todo', microsofttodo: 'todo', outlooktask: 'todo', 'microsoft/todo': 'todo',
    tasks: 'tasks', task: 'tasks', googletask: 'tasks', googletasks: 'tasks', 'google/tasks': 'tasks',
    drafts: 'drafts', draft: 'drafts',
    docs: 'docs', doc: 'docs', sheets: 'sheets', teams: 'teams'
  };

  const COPY = {
    en: {
      title: 'What Glance closed for you',
      hint: 'Off until you turn it on. Stored only on this device. Recorded: intent type, surface, target system, outcome, confidence, and your local day. Never recorded: mail text, subjects, names, addresses, or message ids. Time saved is an estimate.',
      toggleOff: 'Keep a ledger of what closed',
      toggleOn: 'Ledger on. Tap to stop',
      export: 'Download the ledger',
      deleteAll: 'Delete all',
      deleteConfirm: 'Delete the closed-intent ledger from this device? This cannot be undone.',
      stopped: 'Recording stopped.',
      started: 'Recording is on. Types only, on this device.',
      deleted: 'The ledger was deleted from this device.',
      exported: 'The file downloaded on this device.',
      empty: 'The ledger is empty. The file still downloaded.',
      valueEmpty: 'This week and this month: nothing closed yet. The estimate shows after a close.',
      value: 'This week {weekClosed} closed, {weekUndone} undone. This month {monthClosed} closed. Estimated time saved: {minutes} minutes.'
    },
    he: {
      title: 'מה Glance סגר בשבילך',
      hint: 'כבוי עד שמדליקים. נשמר רק על המכשיר. נרשם סוג הכוונה, המשטח, המערכת, התוצאה, הביטחון, והיום המקומי. לא נרשמים טקסט, נושא, שם, כתובת או מזהה. הזמן הוא הערכה.',
      toggleOff: 'שמור יומן של מה שנסגר',
      toggleOn: 'היומן פועל. לחיצה עוצרת',
      export: 'הורדת היומן',
      deleteAll: 'מחק הכל',
      deleteConfirm: 'למחוק את יומן הסגירות מהמכשיר? אי אפשר לבטל.',
      stopped: 'הרישום נעצר.',
      started: 'הרישום פועל. רק סוגים, על המכשיר.',
      deleted: 'היומן נמחק מהמכשיר.',
      exported: 'הקובץ ירד על המכשיר.',
      empty: 'היומן ריק. הקובץ ירד בכל זאת.',
      valueEmpty: 'השבוע והחודש: עדיין אין סגירות. ההערכה תופיע אחרי סגירה.',
      value: 'השבוע {weekClosed} נסגרו, {weekUndone} בוטלו. החודש {monthClosed} נסגרו. זמן מוערך: {minutes} דקות.'
    }
  };

  // Disabled. A later federated sink may send on-device aggregates only, after a separate consent.
  const AGGREGATE_SYNC = Object.freeze({ enabled: false, endpoint: null, mode: 'federated-aggregates' });
  const DP_NOISE = Object.freeze({ enabled: false, epsilon: null });

  function memoryRepository() {
    let state = null;
    return {
      async load() { return state; },
      async save(next) { state = next; }
    };
  }

  let repo = memoryRepository();
  let surfaceHint = '';
  let tail = Promise.resolve();

  function setStorageAdapter(adapter) {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') return;
    function blob(state) {
      return { settings: state.settings, events: state.events, records: state.records, enabled: state.settings.enabled === true };
    }
    repo = {
      sync: adapter.sync === true,
      loadSync: function () { return adapter.get(LEGACY_KEY) || null; },
      saveSync: function (state) { adapter.set(LEGACY_KEY, blob(state)); },
      async load() { return (await adapter.get(LEGACY_KEY)) || null; },
      async save(next) { await adapter.set(LEGACY_KEY, next); }
    };
  }

  function setRepository(next) {
    if (next && typeof next.load === 'function' && typeof next.save === 'function') repo = next;
  }

  function setDefaultSurface(surface) {
    const s = token(surface);
    if (SURFACES.indexOf(s) >= 0) surfaceHint = s;
  }

  function defaultSurface() { return surfaceHint; }

  function enqueue(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(function () {}, function () {});
    return run;
  }

  function randomBytes(n) {
    const out = [];
    let cryptoObj = null;
    try { cryptoObj = typeof crypto !== 'undefined' ? crypto : null; } catch (e) { cryptoObj = null; }
    if (cryptoObj && cryptoObj.getRandomValues) {
      const buf = new Uint8Array(n);
      cryptoObj.getRandomValues(buf);
      for (let i = 0; i < n; i++) out.push(buf[i]);
      return out;
    }
    for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256));
    return out;
  }

  function uuidv7(now) {
    const ms = Number.isFinite(now) ? Math.floor(now) : Date.now();
    const b = new Array(16);
    let t = ms;
    for (let i = 5; i >= 0; i--) { b[i] = t & 255; t = Math.floor(t / 256); }
    const rnd = randomBytes(10);
    for (let i = 0; i < 10; i++) b[6 + i] = rnd[i];
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function token(value) {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(s) ? s : '';
  }

  function uuidOk(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  }

  function intentOf(value) {
    const t = token(value);
    if (!t) return 'other';
    if (INTENT_MAP[t]) return INTENT_MAP[t];
    if (INTENT_TYPES.indexOf(t) >= 0) return t;
    return 'other';
  }

  function surfaceOf(value, fallback) {
    const t = token(value) || token(fallback) || token(surfaceHint);
    if (t === 'gmail-addon') return 'addon';
    if (SURFACES.indexOf(t) >= 0) return t;
    return 'other';
  }

  function targetOf(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (TARGET_MAP[raw]) return TARGET_MAP[raw];
    const t = token(value);
    if (t && TARGET_MAP[t]) return TARGET_MAP[t];
    if (t && TARGETS.indexOf(t) >= 0) return t;
    return 'other';
  }

  function confidenceOf(input) {
    const c = token(input && input.confidence);
    if (CONFIDENCE.indexOf(c) >= 0) return c;
    const q = quantizeScore(input && (input.score != null ? input.score : input.rawScore));
    if (q >= 0.75) return 'high';
    if (q >= 0.45) return 'medium';
    if (q > 0) return 'low';
    return 'unknown';
  }

  function quantizeScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const unit = n > 1 ? n / 100 : n;
    const q = Math.round(Math.max(0, Math.min(1, unit)) / 0.05) * 0.05;
    return Math.round(q * 100) / 100;
  }

  function fnv(text) {
    let h = 0x811c9dc5;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function tzBucket(offsetMin) {
    if (!Number.isFinite(offsetMin)) return 'unknown';
    const hours = Math.round(-offsetMin / 60);
    if (hours < -12 || hours > 14) return 'unknown';
    return hours < 0 ? 'utc_m' + String(-hours) : 'utc_p' + String(hours);
  }

  function localParts(ts, offsetMin) {
    const when = Number.isFinite(ts) ? ts : Date.now();
    const off = Number.isFinite(offsetMin) ? offsetMin : new Date(when).getTimezoneOffset();
    const local = new Date(when - off * 60000);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() + 1;
    const d = local.getUTCDate();
    const day = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const hour = local.getUTCHours();
    const bucket = hour < 6 ? 'h00' : hour < 12 ? 'h06' : hour < 18 ? 'h12' : 'h18';
    const abs = Math.abs(off);
    const sign = off <= 0 ? '+' : '-';
    const time = day + 'T' + String(hour).padStart(2, '0') + ':' + String(local.getUTCMinutes()).padStart(2, '0') + ':' +
      String(local.getUTCSeconds()).padStart(2, '0') + sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' +
      String(abs % 60).padStart(2, '0');
    return { localDay: day, weekday: WEEKDAYS[local.getUTCDay()], hourBucket: bucket, tz: tzBucket(off), time: time, offsetMin: off };
  }

  function stageOfKind(input) {
    if (!input) return '';
    if (STAGES.indexOf(input.stage) >= 0) return input.stage;
    if (input.kind === 'shown') return 'shown';
    if (input.kind === 'clicked') return 'clicked';
    if (input.kind === 'dismissed') return 'dismissed';
    if (input.kind === 'missed' || input.kind === 'feedback') return 'missed';
    if (input.kind === 'undone' || input.undone === true) return 'undone';
    if (input.kind === 'failed') return 'failed';
    const fetched = input.fetchedBack === true || input.proofFetchedBack === true;
    const missed = input.fetchedBack === false || input.proofFetchedBack === false;
    if (input.kind === 'written' && fetched) return 'closed';
    if (input.kind === 'written' && missed) return 'failed';
    if (!input.kind && input.outcome === 'closed') return 'closed';
    if (!input.kind && input.outcome === 'undone') return 'undone';
    if (!input.kind && input.outcome === 'failed') return 'failed';
    return '';
  }

  function latencyOf(input) {
    const n = Number(input && input.latencyMs);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), 86400000);
  }

  function candidatesOf(input) {
    const out = [];
    const list = input && Array.isArray(input.candidates) ? input.candidates : [];
    list.forEach(function (c) {
      if (out.length >= 5 || !c) return;
      out.push({
        intent_type: intentOf(c.intent_type || c.intentType || c.type),
        confidence_bucket: confidenceOf(c),
        raw_score_q: quantizeScore(c.raw_score_q != null ? c.raw_score_q : c.score)
      });
    });
    if (!out.length) {
      out.push({
        intent_type: intentOf(input && (input.intentHint || input.intentType)),
        confidence_bucket: confidenceOf(input),
        raw_score_q: quantizeScore(input && input.score)
      });
    }
    return out;
  }

  function exploreChoice(opts) {
    const o = opts || {};
    const allow = o.allowExplore === true && o.mode !== 'action';
    const epsilon = allow ? Math.max(0, Math.min(1, Number(o.epsilon) || 0)) : 0;
    const chosen = intentOf(o.chosen);
    if (!(epsilon > 0)) return { chosen: chosen, epsilon: 0, deterministic: true, propensity: 1 };
    const roll = Number(o.roll);
    if (!(roll >= 0 && roll < epsilon)) return { chosen: chosen, epsilon: epsilon, deterministic: false, propensity: 1 - epsilon };
    const alt = (o.candidates || []).map(function (c) { return intentOf(c.intent_type || c.intentType || c); }).find(function (t) { return t && t !== chosen; });
    return { chosen: alt || chosen, epsilon: epsilon, deterministic: false, propensity: epsilon };
  }

  function pii(value) {
    const blob = JSON.stringify(value);
    if (/@|https?:\/\//.test(blob)) return true;
    // UUIDs and clock strings contain digits. Strip those shapes, then a long digit run is a phone.
    const rest = blob
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, '')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g, '')
      .replace(/\d{4}-\d{2}-\d{2}/g, '');
    return /\d{8,}/.test(rest);
  }

  function envelope(stage, data, ctx) {
    const c = ctx || {};
    const when = localParts(c.now, c.tzOffsetMinutes);
    const surface = data.surface || c.surface || 'other';
    const install = uuidOk(c.installUuid) ? c.installUuid : uuidv7(c.now);
    const id = uuidOk(c.id) ? c.id : uuidv7((c.now || Date.now()) + (c.seq || 0));
    const subject = uuidOk(data.intent_id) ? data.intent_id : (uuidOk(c.intentId) ? c.intentId : uuidv7(c.now));
    const decision = uuidOk(data.decision_id) ? data.decision_id : (uuidOk(c.decisionId) ? c.decisionId : uuidv7(c.now));
    data.decision_id = decision;
    if (stage !== 'decision') data.intent_type = data.intent_type || 'other';
    const event = {
      specversion: '1.0',
      id: id,
      source: 'urn:glance:' + surface + ':' + install,
      type: 'ai.theflow.glance.intent.' + stage + '.v1',
      time: when.time,
      dataschema: stage === 'decision'
        ? 'iglu:ai.theflow.glance/decision/jsonschema/1-0-0'
        : 'iglu:ai.theflow.glance/stage/jsonschema/1-0-0',
      subject: stage === 'decision' ? decision : subject,
      seq: Number.isFinite(c.seq) ? c.seq : 0,
      data: data
    };
    if (pii(event)) return null;
    return event;
  }

  function clockOf(input, now) {
    const ts = Number.isFinite(input && input.ts) ? input.ts : (Number.isFinite(now) ? now : Date.now());
    const off = Number.isFinite(input && input.tzOffsetMinutes) ? input.tzOffsetMinutes : new Date(ts).getTimezoneOffset();
    return { ts: ts, off: off, parts: localParts(ts, off) };
  }

  function buildEvents(input, ctx) {
    const i = input || {};
    const stage = stageOfKind(i);
    if (!stage) return { ok: false, reason: 'ignore', events: [] };
    const c = Object.assign({ now: Date.now(), seq: 0 }, ctx || {});
    const clock = clockOf(i, c.now);
    c.now = clock.ts;
    c.tzOffsetMinutes = clock.off;
    const surface = surfaceOf(i.app || i.surface || i.channel, c.surface);
    const intent = intentOf(i.intentHint || i.intentType || i.connectorId);
    const engine = token(i.engineVersion) || 'dev';
    const threshold = quantizeScore(i.threshold);
    const policy = (engine + ':' + threshold.toFixed(2)).slice(0, 64);
    const decisionId = uuidOk(i.decisionId) ? i.decisionId : uuidv7(clock.ts);
    const intentId = uuidOk(i.intentId) ? i.intentId : uuidv7(clock.ts + 1);
    const explored = exploreChoice({
      chosen: intent,
      candidates: i.candidates,
      epsilon: i.exploreEpsilon,
      mode: i.mode || 'chip',
      allowExplore: i.allowExplore === true,
      roll: i.roll
    });
    const common = {
      surface: surface,
      local_day: clock.parts.localDay,
      tz_offset_bucket: clock.parts.tz,
      weekday: clock.parts.weekday,
      hour_bucket: clock.parts.hourBucket,
      engine_version: engine,
      locale: LOCALES.indexOf(token(i.locale)) >= 0 ? token(i.locale) : 'other'
    };
    const events = [];
    let seq = c.seq;
    if (stage === 'shown' || stage === 'decision') {
      const decision = envelope('decision', Object.assign({
        decision_id: decisionId,
        policy_id: policy,
        chosen_intent_type: explored.chosen,
        propensity: explored.propensity,
        deterministic: explored.deterministic && explored.epsilon === 0,
        explore_epsilon: 0,
        engine_feature_hash: fnv(policy),
        candidates: candidatesOf(i)
      }, common), Object.assign({}, c, { seq: seq, decisionId: decisionId, intentId: intentId, surface: surface }));
      if (!decision) return { ok: false, reason: 'rejected', events: [] };
      decision.data.explore_epsilon = 0;
      events.push(decision);
      seq += 1;
    }
    if (stage !== 'decision') {
      const row = envelope(stage, Object.assign({
        decision_id: decisionId,
        intent_type: explored.chosen,
        target_system: targetOf(i.connectorId || i.targetSystem || i.system),
        confidence_bucket: confidenceOf(i),
        latency_ms: latencyOf(i),
        negative: i.negative === true
      }, common), Object.assign({}, c, { seq: seq, decisionId: decisionId, intentId: intentId, surface: surface }));
      if (!row) return { ok: false, reason: 'rejected', events: [] };
      events.push(row);
    }
    return { ok: true, events: events, decisionId: decisionId, intentId: intentId };
  }

  function upcastV1(record, ctx) {
    const src = record || {};
    const day = typeof src.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.day) ? src.day : '2026-01-01';
    const ts = Date.parse(day + 'T12:00:00Z');
    const stage = src.outcome === 'undone' ? 'undone' : src.outcome === 'failed' ? 'failed' : 'closed';
    const built = buildEvents({
      stage: stage,
      intentType: src.intentType,
      surface: src.surface,
      targetSystem: src.targetSystem,
      confidence: src.confidence,
      latencyMs: src.latencyMs,
      score: src.confidence === 'high' ? 80 : src.confidence === 'medium' ? 50 : src.confidence === 'low' ? 20 : 0,
      ts: ts,
      tzOffsetMinutes: 0
    }, Object.assign({ now: ts, seq: 0 }, ctx || {}));
    return built.ok ? built.events[built.events.length - 1] : null;
  }

  function validate(event) {
    const errors = [];
    if (!event || event.specversion !== '1.0') errors.push('specversion');
    if (!uuidOk(event && event.id)) errors.push('id');
    if (!event || !/^urn:glance:[a-z]+:[0-9a-f-]{36}$/.test(event.source || '')) errors.push('source');
    if (!event || STAGES.every(function (s) { return event.type !== 'ai.theflow.glance.intent.' + s + '.v1'; })) errors.push('type');
    if (!event || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(event.time || '')) errors.push('time');
    if (!uuidOk(event && event.subject)) errors.push('subject');
    if (!event || !Number.isInteger(event.seq) || event.seq < 0) errors.push('seq');
    if (!event || !event.data || pii(event)) errors.push('pii');
    const data = event && event.data || {};
    if (!uuidOk(data.decision_id)) errors.push('decision_id');
    if (event && event.type && event.type.indexOf('.decision.') < 0) {
      if (INTENT_TYPES.indexOf(data.intent_type) < 0) errors.push('intent_type');
      if (SURFACES.indexOf(data.surface) < 0) errors.push('surface');
      if (TARGETS.indexOf(data.target_system) < 0) errors.push('target_system');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function defaultSettings(now) {
    return {
      enabled: false,
      cap: CAP_DEFAULT,
      retentionDays: RETENTION_DAYS,
      installUuid: uuidv7(now || Date.now()),
      installUuidAt: now || Date.now(),
      seq: 0,
      minutes: Object.assign({}, MINUTES),
      rolled: { decision: 0, shown: 0, clicked: 0, closed: 0, undone: 0, failed: 0, dismissed: 0, missed: 0, byType: {} },
      optIn: 0,
      optOut: 0,
      rejected: 0,
      duplicates: 0
    };
  }

  function normalize(raw, now) {
    const settings = defaultSettings(now);
    const records = raw && Array.isArray(raw.records) ? raw.records : [];
    const events = raw && Array.isArray(raw.events) ? raw.events : [];
    if (raw && raw.settings) Object.assign(settings, raw.settings);
    if (raw && raw.enabled === true) settings.enabled = true;
    if (raw && Object.prototype.hasOwnProperty.call(raw, 'enabled') && !raw.settings) settings.enabled = raw.enabled === true;
    if (!settings.rolled || !settings.rolled.byType) settings.rolled = defaultSettings(now).rolled;
    if (!settings.minutes) settings.minutes = Object.assign({}, MINUTES);
    return { settings: settings, events: events, records: records };
  }

  function rotate(settings, now) {
    if (!uuidOk(settings.installUuid) || !settings.installUuidAt || (now - settings.installUuidAt) > UUID_ROTATE_MS) {
      settings.installUuid = uuidv7(now);
      settings.installUuidAt = now;
    }
  }

  function fold(rolled, event) {
    const stage = (event.type || '').match(/intent\.([a-z]+)\.v1$/);
    const name = stage ? stage[1] : '';
    if (rolled[name] != null) rolled[name] += 1;
    const type = event.data && event.data.intent_type;
    if (!type) return;
    if (!rolled.byType[type]) rolled.byType[type] = { closed: 0, undone: 0 };
    if (name === 'closed' || name === 'undone') rolled.byType[type][name] += 1;
  }

  function apply(state, input, now) {
    rotate(state.settings, now || Date.now());
    const built = buildEvents(input, {
      now: now,
      seq: state.settings.seq,
      installUuid: state.settings.installUuid,
      surface: surfaceHint,
      tzOffsetMinutes: input && input.tzOffsetMinutes
    });
    if (!built.ok) {
      state.settings.rejected += 1;
      return { ok: false, reason: built.reason, events: [] };
    }
    const saved = [];
    built.events.forEach(function (event) {
      const check = validate(event);
      if (!check.ok) {
        state.settings.rejected += 1;
        return;
      }
      const dup = state.events.some(function (e) { return e.source === event.source && e.id === event.id; });
      if (dup) {
        state.settings.duplicates += 1;
        return;
      }
      state.events.push(event);
      state.settings.seq = event.seq + 1;
      saved.push(event);
    });
    const cap = Math.max(1, Number(state.settings.cap) || CAP_DEFAULT);
    while (state.events.length > cap) fold(state.settings.rolled, state.events.shift());
    return { ok: saved.length > 0, reason: saved.length ? 'stored' : 'empty', events: saved, decisionId: built.decisionId, intentId: built.intentId };
  }

  function noteActivity(input, now) {
    const run = function (state) {
      if (!state.settings.enabled) return { ok: false, reason: 'off', events: [] };
      return apply(state, input, now || Date.now());
    };
    if (repo.sync && repo.loadSync && repo.saveSync) {
      try {
        const state = normalize(repo.loadSync(), now || Date.now());
        const result = run(state);
        repo.saveSync(state);
        return Promise.resolve(result);
      } catch (e) {
        return Promise.resolve({ ok: false, reason: 'adapter', events: [] });
      }
    }
    return enqueue(async function () {
      const state = normalize(await repo.load(), now || Date.now());
      const result = run(state);
      await repo.save({ settings: state.settings, events: state.events, records: state.records, enabled: state.settings.enabled === true });
      return result;
    });
  }

  function setEnabled(on) {
    return enqueue(async function () {
      const state = normalize(await repo.load(), Date.now());
      const next = on === true;
      if (state.settings.enabled && !next) state.settings.optOut += 1;
      if (!state.settings.enabled && next) state.settings.optIn += 1;
      state.settings.enabled = next;
      await repo.save({ settings: state.settings, events: state.events, records: state.records, enabled: next });
      return next;
    });
  }

  function isEnabled() {
    return enqueue(async function () {
      const state = normalize(await repo.load(), Date.now());
      return state.settings.enabled === true;
    });
  }

  function readAll() {
    return enqueue(async function () {
      const state = normalize(await repo.load(), Date.now());
      const up = [];
      state.records.forEach(function (row) {
        const ev = upcastV1(row, { installUuid: state.settings.installUuid, seq: 0, now: Date.now() });
        if (ev) up.push(ev);
      });
      return { settings: state.settings, events: up.concat(state.events), records: state.records };
    });
  }

  function stageName(event) {
    const m = event && event.type && event.type.match(/intent\.([a-z]+)\.v1$/);
    return m ? m[1] : '';
  }

  function dayKey(event) {
    return event && event.data && event.data.local_day || '';
  }

  function inRange(day, start, end) {
    return day && start && day >= start && day <= end;
  }

  function ymd(ts, off) {
    return localParts(ts, Number.isFinite(off) ? off : new Date(ts).getTimezoneOffset()).localDay;
  }

  function shiftDay(day, days) {
    const t = Date.parse(day + 'T12:00:00Z') + days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  function project(events, now, minutes, rolled) {
    const clock = localParts(now || Date.now());
    const today = clock.localDay;
    const weekStart = shiftDay(today, -6);
    const monthStart = today.slice(0, 8) + '01';
    const table = Object.assign({}, MINUTES, minutes || {});
    const byType = {};
    let weekClosed = 0, weekUndone = 0, monthClosed = 0, monthUndone = 0, estimate = 0;
    (events || []).forEach(function (event) {
      const name = stageName(event);
      const type = event.data && event.data.intent_type || 'other';
      const day = dayKey(event);
      if (!byType[type]) byType[type] = { weekClosed: 0, weekUndone: 0, monthClosed: 0, monthUndone: 0 };
      if (name === 'closed' && inRange(day, weekStart, today)) { weekClosed += 1; byType[type].weekClosed += 1; estimate += table[type] || table.other || 0; }
      if (name === 'undone' && inRange(day, weekStart, today)) { weekUndone += 1; byType[type].weekUndone += 1; }
      if (name === 'closed' && inRange(day, monthStart, today)) { monthClosed += 1; byType[type].monthClosed += 1; }
      if (name === 'undone' && inRange(day, monthStart, today)) { monthUndone += 1; byType[type].monthUndone += 1; }
    });
    let retainedClosed = 0;
    (events || []).forEach(function (event) { if (stageName(event) === 'closed') retainedClosed += 1; });
    return {
      estimate: true,
      weekClosed: weekClosed,
      weekUndone: weekUndone,
      monthClosed: monthClosed,
      monthUndone: monthUndone,
      minutes: estimate,
      byType: byType,
      allClosed: retainedClosed + ((rolled && rolled.closed) || 0)
    };
  }

  function rebuild(events, rolled, now, minutes) {
    return project(events, now, minutes, rolled);
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[i];
  }

  function metrics(events, now) {
    const by = {};
    function b(engine) {
      if (!by[engine]) by[engine] = { kept: 0, wrong: 0, miss: 0, closed: 0, undone: 0, lat: [] };
      return by[engine];
    }
    const shown = {};
    const closed = [];
    const undone = [];
    (events || []).forEach(function (event) {
      const name = stageName(event);
      const engine = (event.data && event.data.engine_version) || 'unknown';
      const row = b(engine);
      if (name === 'shown') shown[event.data.decision_id] = Date.parse(event.time);
      if (name === 'closed') { row.closed += 1; row.lat.push(event.data.latency_ms || 0); closed.push(event); }
      if (name === 'undone') { row.undone += 1; undone.push(event); }
      if (name === 'missed') {
        const seen = shown[event.data.decision_id];
        const at = Date.parse(event.time);
        if (seen == null || (Number.isFinite(at) && Number.isFinite(seen) && at >= seen && at - seen <= MISS_MS && false)) row.miss += 0;
        if (seen == null) row.miss += 1;
      }
    });
    closed.forEach(function (event) {
      const t0 = Date.parse(event.time);
      const id = event.data.decision_id;
      const row = b(event.data.engine_version || 'unknown');
      const soon = undone.some(function (u) {
        return u.data.decision_id === id && Date.parse(u.time) >= t0 && (Date.parse(u.time) - t0) <= KEPT_MS;
      });
      const neg = undone.some(function (u) { return u.data.decision_id === id && u.data.negative === true; });
      if (soon || neg) row.wrong += 1;
      else row.kept += 1;
    });
    const out = {};
    Object.keys(by).forEach(function (engine) {
      const row = by[engine];
      const denom = row.kept + row.wrong;
      out[engine] = {
        precision: denom ? row.kept / denom : null,
        wrongDoIt: row.closed ? row.wrong / row.closed : null,
        miss: row.miss,
        p50: percentile(row.lat, 0.5),
        p95: percentile(row.lat, 0.95),
        kept: row.kept,
        wrong: row.wrong,
        closed: row.closed,
        undone: row.undone
      };
    });
    return { byEngine: out, keptWindowMs: KEPT_MS, missWindowMs: MISS_MS };
  }

  function relationships(events) {
    const decisions = {};
    const shown = {};
    const orphans = [];
    (events || []).forEach(function (event) {
      const name = stageName(event);
      const id = event.data && event.data.decision_id;
      if (name === 'decision') decisions[id] = true;
      if (name === 'shown') shown[id] = true;
    });
    (events || []).forEach(function (event) {
      const name = stageName(event);
      if (name !== 'closed' && name !== 'undone') return;
      const id = event.data && event.data.decision_id;
      if (!decisions[id] || !shown[id]) orphans.push(event.id);
    });
    return { ok: orphans.length === 0, orphans: orphans };
  }

  function quality(events, stats, now) {
    const list = events || [];
    const volume = {};
    const mix = {};
    let skew = 0;
    let newest = 0;
    list.forEach(function (event) {
      const day = dayKey(event);
      const name = stageName(event);
      if (!volume[day]) volume[day] = {};
      volume[day][name] = (volume[day][name] || 0) + 1;
      const schema = event.dataschema || 'unknown';
      mix[schema] = (mix[schema] || 0) + 1;
      const at = Date.parse(event.time);
      if (Number.isFinite(at)) {
        if (at > newest) newest = at;
        if (now && Math.abs(now - at) > 2 * 86400000) skew += 1;
      }
    });
    const rel = relationships(list);
    const rejected = stats && stats.rejected || 0;
    const duplicates = stats && stats.duplicates || 0;
    const attempts = list.length + rejected + duplicates;
    return {
      freshnessMs: newest && now ? Math.max(0, now - newest) : null,
      volume: volume,
      rejectRate: attempts ? rejected / attempts : 0,
      duplicateRate: attempts ? duplicates / attempts : 0,
      orphanRate: list.length ? rel.orphans.length / list.length : 0,
      clockSkew: skew,
      schemaMix: mix
    };
  }

  function exportAggregates(events, k) {
    const min = Number.isFinite(k) ? k : K_DEFAULT;
    const counts = {};
    (events || []).forEach(function (event) {
      if (stageName(event) !== 'closed') return;
      const type = event.data.intent_type || 'other';
      counts[type] = (counts[type] || 0) + 1;
    });
    const kept = {};
    const suppressed = [];
    Object.keys(counts).forEach(function (type) {
      if (counts[type] >= min) kept[type] = counts[type];
      else suppressed.push(type);
    });
    return { k: min, counts: kept, suppressed: suppressed, dp: DP_NOISE.enabled };
  }

  function templateCandidates(events) {
    const agg = exportAggregates(events, 1);
    return Object.keys(agg.counts).map(function (type) {
      const tpl = TEMPLATES[type] || TEMPLATES.other;
      return {
        intent_type: type,
        frequency: agg.counts[type],
        inputs: tpl.inputs,
        steps: tpl.steps,
        human_approval: tpl.human_approval,
        outputs: tpl.outputs
      };
    });
  }

  function guardrails(events, settings) {
    let closed = 0, undone = 0;
    (events || []).forEach(function (event) {
      const name = stageName(event);
      if (name === 'closed') closed += 1;
      if (name === 'undone') undone += 1;
    });
    const optIn = settings && settings.optIn || 0;
    const optOut = settings && settings.optOut || 0;
    return {
      undoRate: closed ? undone / closed : null,
      optOutRate: (optIn + optOut) ? optOut / (optIn + optOut) : null
    };
  }

  function valueLine(lang, view) {
    const L = copy(lang);
    const v = view || {};
    if (!v.weekClosed && !v.monthClosed) return L.valueEmpty;
    return L.value.replace('{weekClosed}', String(v.weekClosed || 0)).replace('{weekUndone}', String(v.weekUndone || 0))
      .replace('{monthClosed}', String(v.monthClosed || 0)).replace('{minutes}', String(v.minutes || 0));
  }

  async function snapshot(now) {
    const state = normalize(await repo.load(), now || Date.now());
    const up = state.records.map(function (row) { return upcastV1(row, { installUuid: state.settings.installUuid, now: now }); }).filter(Boolean);
    return { settings: state.settings, events: up.concat(state.events), records: state.records };
  }

  function exportAll(now) {
    return enqueue(async function () {
      const snap = await snapshot(now);
      return {
        schema: 'glance.closed-intent-ledger',
        model: MODEL,
        code: CODE_VERSION,
        exportedDay: localParts(now || Date.now()).localDay,
        events: snap.events,
        aggregates: exportAggregates(snap.events, K_DEFAULT),
        templates: templateCandidates(snap.events),
        view: project(snap.events, now, snap.settings.minutes, snap.settings.rolled)
      };
    });
  }

  function view(now) {
    return enqueue(async function () {
      const snap = await snapshot(now);
      return project(snap.events, now, snap.settings.minutes, snap.settings.rolled);
    });
  }

  function deleteAll() {
    return enqueue(async function () {
      const state = normalize(await repo.load(), Date.now());
      const enabled = state.settings.enabled === true;
      const fresh = defaultSettings(Date.now());
      fresh.enabled = enabled;
      fresh.installUuid = state.settings.installUuid;
      fresh.installUuidAt = state.settings.installUuidAt;
      fresh.optIn = state.settings.optIn;
      fresh.optOut = state.settings.optOut;
      await repo.save({ settings: fresh, events: [], records: [], enabled: enabled });
      return { deleted: true, enabled: enabled };
    });
  }

  function expire(now) {
    return enqueue(async function () {
      const state = normalize(await repo.load(), now || Date.now());
      const days = state.settings.retentionDays || RETENTION_DAYS;
      const cutoff = (now || Date.now()) - days * 86400000;
      const keep = [];
      state.events.forEach(function (event) {
        const at = Date.parse(event.time);
        if (Number.isFinite(at) && at < cutoff) fold(state.settings.rolled, event);
        else keep.push(event);
      });
      state.events = keep;
      await repo.save({ settings: state.settings, events: state.events, records: state.records, enabled: state.settings.enabled });
      return { kept: keep.length };
    });
  }

  function uploadAggregate() {
    return Promise.resolve({ ok: false, reason: 'disabled', sent: false, endpoint: null, mode: AGGREGATE_SYNC.mode });
  }

  function copy(lang) {
    const src = (lang === 'he' || lang === 'iw') ? COPY.he : COPY.en;
    return Object.assign({}, src);
  }

  function compactPlan(count, cap, usageRatio) {
    const limit = Math.max(1, cap || CAP_DEFAULT);
    let drop = 0;
    if (count > limit) drop = count - limit;
    if (Number.isFinite(usageRatio) && usageRatio >= 0.8) drop = Math.max(drop, Math.ceil(count * 0.1));
    return { drop: drop };
  }

  return {
    CODE_VERSION: CODE_VERSION,
    MODEL: MODEL,
    SETTINGS_KEY: SETTINGS_KEY,
    LEGACY_KEY: LEGACY_KEY,
    EXPLORE_EPSILON: EXPLORE_EPSILON,
    K_DEFAULT: K_DEFAULT,
    INTENT_TYPES: INTENT_TYPES,
    SURFACES: SURFACES,
    TARGETS: TARGETS,
    CONFIDENCE: CONFIDENCE,
    HOURS: HOURS,
    WEEKDAYS: WEEKDAYS,
    STAGES: STAGES,
    MINUTES: MINUTES,
    AGGREGATE_SYNC: AGGREGATE_SYNC,
    DP_NOISE: DP_NOISE,
    uuidv7: uuidv7,
    quantizeScore: quantizeScore,
    exploreChoice: exploreChoice,
    buildEvents: buildEvents,
    upcastV1: upcastV1,
    validate: validate,
    noteActivity: noteActivity,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    readAll: readAll,
    project: project,
    rebuild: rebuild,
    metrics: metrics,
    relationships: relationships,
    quality: quality,
    exportAggregates: exportAggregates,
    templateCandidates: templateCandidates,
    guardrails: guardrails,
    valueLine: valueLine,
    exportAll: exportAll,
    view: view,
    deleteAll: deleteAll,
    expire: expire,
    uploadAggregate: uploadAggregate,
    copy: copy,
    compactPlan: compactPlan,
    setStorageAdapter: setStorageAdapter,
    setRepository: setRepository,
    setDefaultSurface: setDefaultSurface,
    defaultSurface: defaultSurface,
    localParts: localParts
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowClosedIntentLedger };
else if (typeof globalThis !== 'undefined') globalThis.FlowClosedIntentLedger = FlowClosedIntentLedger;
