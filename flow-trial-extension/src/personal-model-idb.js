// Personal model store. IndexedDB on the extension origin, AES-GCM payloads.
// A content script must not load this file. Its IndexedDB would be the page origin.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlowPersonalModelStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var DB = 'glance-personal-model';
  var VERSION = 1;
  var STORES = ['entities', 'aliases', 'facts', 'consents', 'tombstones', 'exemplars', 'keys'];
  var ENCRYPTED = { entities: 1, aliases: 1, facts: 1, exemplars: 1 };
  var tail = Promise.resolve();

  function extensionOrigin() {
    try { return String(location.protocol || '') === 'chrome-extension:'; } catch (e) { return false; }
  }

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    if (typeof btoa === 'function') return btoa(s);
    return Buffer.from(bytes).toString('base64');
  }

  function fromB64(text) {
    var s = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function memoryDb() {
    var tables = {};
    STORES.forEach(function (name) { tables[name] = []; });
    return {
      async get(store, id) {
        return tables[store].filter(function (row) { return row.id === id; })[0] || null;
      },
      async put(store, row) {
        var list = tables[store];
        var i = list.findIndex(function (item) { return item.id === row.id; });
        if (i >= 0) list[i] = row;
        else list.push(row);
      },
      async all(store) { return tables[store].slice(); },
      async clear(store) { tables[store] = []; },
      dump: function () {
        return JSON.parse(JSON.stringify(tables, function (key, value) {
          if (value && value.constructor && value.constructor.name === 'CryptoKey') {
            return { type: 'CryptoKey', extractable: value.extractable === true };
          }
          return value;
        }));
      }
    };
  }

  function openIndexedDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { resolve(wrapIdb(req.result)); };
      req.onerror = function () { reject(req.error || new Error('idb')); };
    });
  }

  function wrapIdb(db) {
    function tx(store, mode) { return db.transaction(store, mode).objectStore(store); }
    return {
      async get(store, id) {
        return new Promise(function (resolve, reject) {
          var req = tx(store, 'readonly').get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        });
      },
      async put(store, row) {
        return new Promise(function (resolve, reject) {
          var req = tx(store, 'readwrite').put(row);
          req.onsuccess = function () { resolve(); };
          req.onerror = function () { reject(req.error); };
        });
      },
      async all(store) {
        return new Promise(function (resolve, reject) {
          var req = tx(store, 'readonly').getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { reject(req.error); };
        });
      },
      async clear(store) {
        return new Promise(function (resolve, reject) {
          var req = tx(store, 'readwrite').clear();
          req.onsuccess = function () { resolve(); };
          req.onerror = function () { reject(req.error); };
        });
      },
      dump: function () { return null; }
    };
  }

  async function ensureKey(db) {
    var existing = await db.get('keys', 'primary');
    if (existing && existing.key) return existing.key;
    var key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await db.put('keys', { id: 'primary', key: key });
    return key;
  }

  async function seal(key, obj, aad) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    var ct = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: iv,
      additionalData: new TextEncoder().encode(aad)
    }, key, bytes);
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }

  async function open(key, payload, aad) {
    var plain = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: fromB64(payload.iv),
      additionalData: new TextEncoder().encode(aad)
    }, key, fromB64(payload.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function openRepository(db) {
    var key = await ensureKey(db);
    return {
      async load() {
        if (!key) return { entities: [], aliases: [], facts: [], tombstones: [], exemplars: [] };
        var state = { entities: [], aliases: [], facts: [], tombstones: [], exemplars: [], consents: null };
        var rows = await db.all('facts');
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].payload) continue;
          state.facts.push(await open(key, rows[i].payload, 'facts:' + rows[i].id));
        }
        var aliases = await db.all('aliases');
        for (var a = 0; a < aliases.length; a++) {
          if (!aliases[a].payload) continue;
          state.aliases.push(await open(key, aliases[a].payload, 'aliases:' + aliases[a].id));
        }
        var entities = await db.all('entities');
        for (var e = 0; e < entities.length; e++) {
          if (!entities[e].payload) continue;
          state.entities.push(await open(key, entities[e].payload, 'entities:' + entities[e].id));
        }
        var exemplars = await db.all('exemplars');
        for (var x = 0; x < exemplars.length; x++) {
          if (!exemplars[x].payload) continue;
          state.exemplars.push(await open(key, exemplars[x].payload, 'exemplars:' + exemplars[x].id));
        }
        state.tombstones = await db.all('tombstones');
        var consentRows = await db.all('consents');
        var meta = consentRows.filter(function (row) { return row.id === 'state'; })[0];
        if (meta && meta.state) {
          state.install_id = meta.state.install_id;
          state.consents = meta.state.consents;
          state.style_rules = meta.state.style_rules;
          state.review = meta.state.review;
          state.bandit = meta.state.bandit;
          state.wiped_at = meta.state.wiped_at;
          state.schema_ver = meta.state.schema_ver;
        }
        return state;
      },
      async save(plain) {
        var groups = { entities: plain.entities || [], aliases: plain.aliases || [], facts: plain.facts || [], exemplars: plain.exemplars || [] };
        var names = Object.keys(groups);
        for (var n = 0; n < names.length; n++) {
          var store = names[n];
          await db.clear(store);
          var list = groups[store];
          for (var i = 0; i < list.length; i++) {
            var row = list[i];
            if (!row || !row.id) continue;
            await db.put(store, { id: row.id, payload: await seal(key, row, store + ':' + row.id) });
          }
        }
        await db.clear('tombstones');
        var tombs = plain.tombstones || [];
        for (var t = 0; t < tombs.length; t++) await db.put('tombstones', tombs[t]);
        await db.put('consents', {
          id: 'state',
          state: {
            schema_ver: plain.schema_ver,
            install_id: plain.install_id,
            consents: plain.consents,
            style_rules: plain.style_rules,
            review: plain.review,
            bandit: plain.bandit,
            wiped_at: plain.wiped_at
          }
        });
      },
      dump: function () { return typeof db.dump === 'function' ? db.dump() : null; },
      keyExtractable: function () { return key.extractable === true; },
      async shred() {
        for (var i = 0; i < STORES.length; i++) await db.clear(STORES[i]);
        key = null;
      }
    };
  }

  var liveDb = null;
  function enqueue(fn) {
    var run = tail.then(fn, fn);
    tail = run.then(function () {}, function () {});
    return run;
  }

  async function dbHandle() {
    if (liveDb) return liveDb;
    liveDb = extensionOrigin() ? await openIndexedDb() : memoryDb();
    return liveDb;
  }

  function model() {
    return typeof FlowPersonalModel !== 'undefined' ? FlowPersonalModel : null;
  }

  async function withState(fn) {
    return enqueue(async function () {
      var api = model();
      if (!api) return { ok: false, reason: 'missing' };
      var repo = await openRepository(await dbHandle());
      api.hydrate(await repo.load());
      var result = await fn(api);
      await repo.save(api.snapshot());
      return result;
    });
  }

  function listen() {
    if (typeof document !== 'undefined') return;
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('flow:personal-model-') !== 0) return;
      var done = Promise.resolve({ ok: false });
      if (msg.type === 'flow:personal-model-ingest') done = withState(function (api) { return api.ingestHeaderSync(msg.header); });
      else if (msg.type === 'flow:personal-model-calendar') done = withState(function (api) { return api.ingestCalendarSync(msg.events); });
      else if (msg.type === 'flow:personal-model-view') done = withState(function (api) { return { ok: true, view: api.viewSync() }; });
      else if (msg.type === 'flow:personal-model-consent') done = withState(function (api) { return api.setConsentSync(msg.category, msg.enabled === true, { disclosure: msg.disclosure === true }); });
      else if (msg.type === 'flow:personal-model-confirm') done = withState(function (api) { return api.confirmFactSync(msg.id); });
      else if (msg.type === 'flow:personal-model-edit') done = withState(function (api) { return api.editFactSync(msg.id, msg.object); });
      else if (msg.type === 'flow:personal-model-forget') done = withState(function (api) { return api.forgetFactSync(msg.id); });
      else if (msg.type === 'flow:personal-model-never') done = withState(function (api) { return api.neverSync(msg.predicate, msg.object, msg.email); });
      else if (msg.type === 'flow:personal-model-forget-all') done = withState(function (api) { return api.forgetAllSync(); });
      else if (msg.type === 'flow:personal-model-export') done = withState(function (api) { return { ok: true, doc: api.exportJsonSync() }; });
      else if (msg.type === 'flow:personal-model-rank') done = withState(function (api) { return api.closureAssistSync(msg.input || {}); });
      else if (msg.type === 'flow:personal-model-place') done = withState(function (api) { return api.setPlaceSync(msg.city); });
      else if (msg.type === 'flow:personal-model-style-rule') done = withState(function (api) { return api.setStyleRuleSync(msg.rule); });
      else if (msg.type === 'flow:personal-model-bandit') done = withState(function (api) { return api.setBanditEnabledSync(msg.enabled === true); });
      done.then(sendResponse, function () { sendResponse({ ok: false }); });
      return true;
    });
  }

  if (extensionOrigin()) listen();

  return {
    DB: DB,
    memoryDb: memoryDb,
    openRepository: openRepository,
    withState: withState,
    ingest: function (header) { return withState(function (api) { return api.ingestHeaderSync(header); }); },
    ingestCalendar: function (events) { return withState(function (api) { return api.ingestCalendarSync(events); }); },
    view: function () { return withState(function (api) { return api.viewSync(); }); }
  };
});
