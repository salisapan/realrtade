// Event log in IndexedDB. Settings and cursors stay in chrome.storage.local.
// Loaded by the service worker and the popup (extension origin only).
// A content script must not load this file: its IndexedDB would be the page origin.
var FlowClosedIntentStore = (function () {
  var DB = 'glance-closed-intent-ledger';
  var STORE = 'events';
  var SETTINGS = 'glanceClosedIntentLedgerSettings';

  function extensionOrigin() {
    try { return String(location.protocol || '') === 'chrome-extension:'; } catch (e) { return false; }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('time', 'time');
          store.createIndex('type', 'type');
          store.createIndex('engine_version', 'engine_version');
          store.createIndex('decision_id', 'decision_id');
          store.createIndex('source_id', 'source_id', { unique: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb')); };
    });
  }

  function recordOf(event) {
    return {
      id: event.id,
      time: event.time,
      type: event.type,
      engine_version: (event.data && event.data.engine_version) || '',
      decision_id: (event.data && event.data.decision_id) || '',
      source_id: event.source + '\n' + event.id,
      event: event
    };
  }

  function settingsGet() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(SETTINGS, function (bag) { resolve((bag && bag[SETTINGS]) || null); });
      } catch (e) { resolve(null); }
    });
  }

  function settingsSet(value) {
    return new Promise(function (resolve) {
      try {
        var patch = {};
        patch[SETTINGS] = value;
        chrome.storage.local.set(patch, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  function allEvents(db) {
    return new Promise(function (resolve, reject) {
      var out = [];
      var tx = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).index('time').openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) { resolve(out); return; }
        if (cur.value && cur.value.event) out.push(cur.value.event);
        cur.continue();
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function putEvent(db, event) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      var existing = store.index('source_id').get(event.source + '\n' + event.id);
      existing.onsuccess = function () {
        if (existing.result) { resolve({ duplicate: true }); return; }
        var add = store.add(recordOf(event));
        add.onsuccess = function () { resolve({ stored: true }); };
        add.onerror = function () { reject(add.error); };
      };
      existing.onerror = function () { reject(existing.error); };
    });
  }

  function clearEvents(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      var req = tx.objectStore(STORE).clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function deleteOlder(db, cutoffMs) {
    return new Promise(function (resolve, reject) {
      var dropped = [];
      var tx = db.transaction(STORE, 'readwrite');
      var req = tx.objectStore(STORE).index('time').openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) { resolve(dropped); return; }
        var at = Date.parse(cur.value && cur.value.time);
        if (Number.isFinite(at) && at < cutoffMs && cur.value.event) {
          dropped.push(cur.value.event);
          cur.delete();
        }
        cur.continue();
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  var batch = [];
  var flushing = null;

  function legacyRecords() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get('glanceClosedIntentLedger', function (bag) {
          var raw = bag && bag.glanceClosedIntentLedger;
          resolve(raw && Array.isArray(raw.records) ? raw.records : []);
        });
      } catch (e) { resolve([]); }
    });
  }

  function repository() {
    return {
      async load() {
        var settings = await settingsGet();
        var records = await legacyRecords();
        var db = await openDb();
        var events = await allEvents(db);
        db.close();
        return { settings: settings, events: events, records: records };
      },
      async save(state) {
        var settings = Object.assign({}, state.settings || {});
        settings.enabled = state.enabled === true || settings.enabled === true;
        await settingsSet(settings);
        var db = await openDb();
        await clearEvents(db);
        var events = state.events || [];
        for (var i = 0; i < events.length; i++) {
          try { await putEvent(db, events[i]); } catch (e) { /* skip a row that the store rejects */ }
        }
        db.close();
      }
    };
  }

  async function flush() {
    if (flushing) return flushing;
    flushing = (async function () {
      var pending = batch.splice(0, batch.length);
      if (!pending.length) return { ok: true, stored: 0 };
      var api = typeof FlowClosedIntentLedger !== 'undefined' ? FlowClosedIntentLedger : null;
      if (!api) return { ok: false, reason: 'missing' };
      api.setRepository(repository());
      var stored = 0;
      for (var i = 0; i < pending.length; i++) {
        var result = await api.noteActivity(pending[i]);
        if (result && result.events) stored += result.events.length;
      }
      return { ok: true, stored: stored };
    })();
    try { return await flushing; } finally { flushing = null; }
  }

  function appendInput(input) {
    batch.push(input || {});
    var wait = flush();
    return wait;
  }

  async function view() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    return api.view(Date.now());
  }

  async function exportAll() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    return api.exportAll(Date.now());
  }

  async function deleteAll() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    var result = await api.deleteAll();
    try { var db = await openDb(); await clearEvents(db); db.close(); } catch (e) { /* settings already cleared */ }
    return result;
  }

  async function setEnabled(on) {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    return api.setEnabled(on);
  }

  async function isEnabled() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    return api.isEnabled();
  }

  async function expire() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    var snap = await api.readAll();
    var days = (snap.settings && snap.settings.retentionDays) || 365;
    var cutoff = Date.now() - days * 86400000;
    try {
      var db = await openDb();
      var dropped = await deleteOlder(db, cutoff);
      db.close();
      dropped.forEach(function (event) {
        if (snap.settings && snap.settings.rolled) {
          var m = event.type && event.type.match(/intent\.([a-z]+)\.v1$/);
          if (m && snap.settings.rolled[m[1]] != null) snap.settings.rolled[m[1]] += 1;
        }
      });
      await settingsSet(snap.settings);
    } catch (e) { /* keep the log if the delete fails */ }
    return api.expire(Date.now());
  }

  async function rebuild() {
    var api = FlowClosedIntentLedger;
    api.setRepository(repository());
    var snap = await api.readAll();
    return api.rebuild(snap.events, snap.settings.rolled, Date.now(), snap.settings.minutes);
  }

  function estimate() {
    var storage = (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) ? navigator.storage.estimate() : Promise.resolve(null);
    var bytes = new Promise(function (resolve) {
      try {
        if (chrome.storage && chrome.storage.local && chrome.storage.local.getBytesInUse) {
          chrome.storage.local.getBytesInUse(SETTINGS, function (n) { resolve(n || 0); });
          return;
        }
      } catch (e) { /* settings size stays unknown */ }
      resolve(0);
    });
    return Promise.all([storage, bytes]).then(function (pair) {
      var est = pair[0] || {};
      var ratio = est.quota ? (est.usage || 0) / est.quota : 0;
      return { usage: est.usage || 0, quota: est.quota || 0, ratio: ratio, settingsBytes: pair[1] };
    });
  }

  function schedule() {
    if (typeof document !== 'undefined') return;
    if (!chrome.alarms || !chrome.alarms.create) return;
    try { chrome.alarms.create('glance-ledger-retain', { periodInMinutes: 24 * 60 }); } catch (e) { /* alarms unavailable */ }
    if (chrome.alarms.onAlarm) {
      chrome.alarms.onAlarm.addListener(function (alarm) {
        if (!alarm || alarm.name !== 'glance-ledger-retain') return;
        expire().catch(function () {});
      });
    }
  }

  function listen() {
    if (typeof document !== 'undefined') return;
    if (!chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('flow:ledger-') !== 0) return;
      var done = Promise.resolve({ ok: false });
      if (msg.type === 'flow:ledger-append') done = appendInput(msg.input);
      else if (msg.type === 'flow:ledger-export') done = exportAll().then(function (doc) { return { ok: true, doc: doc }; });
      else if (msg.type === 'flow:ledger-delete') done = deleteAll();
      else if (msg.type === 'flow:ledger-enabled') done = setEnabled(msg.on === true).then(function (on) { return { ok: true, enabled: on }; });
      else if (msg.type === 'flow:ledger-view') done = view().then(function (v) { return { ok: true, view: v }; });
      else if (msg.type === 'flow:ledger-rebuild') done = rebuild().then(function (v) { return { ok: true, view: v }; });
      done.then(sendResponse, function () { sendResponse({ ok: false }); });
      return true;
    });
  }

  if (extensionOrigin()) {
    schedule();
    listen();
  }

  return {
    appendInput: appendInput,
    view: view,
    exportAll: exportAll,
    deleteAll: deleteAll,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    expire: expire,
    rebuild: rebuild,
    estimate: estimate,
    recordOf: recordOf,
    DB: DB,
    STORE: STORE
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowClosedIntentStore };
else if (typeof globalThis !== 'undefined') globalThis.FlowClosedIntentStore = FlowClosedIntentStore;
