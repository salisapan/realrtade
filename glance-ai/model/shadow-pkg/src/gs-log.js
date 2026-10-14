/* Glance shadow tier, SERVICE-WORKER side logging (tier A = local only; shadow-logging-spec-v2.md §2, §3, §5, §7).
 * - gate(): kill switch + consent + signed-config + tripwire + allowlist, most restrictive wins. Off => compute/log/count nothing.
 * - buildRecord(): schema glance-shadow/2, one record per (message, candidate model); never text, never features (tier C only).
 * - serialize(): allowlist enum guard; any field outside its enum/regex drops the record and counts shadow.schemaReject.
 * - Store: IndexedDB `glance-shadow` {records, queue, outcomes, meta}; ring buffer 5,000 records / 30 days; records AES-GCM encrypted
 *   under a non-extractable WebCrypto key kept in IndexedDB. `queue` is created but never written in tier A (upload = tier B).
 * Registers self.GlanceShadow.log. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});
  var subtle = function () { return root.crypto && root.crypto.subtle; };
  var DAY = 86400000;

  // ---------------- storage keys (chrome.storage.local)
  var K = { consent: 'consent.shadow', consentUpload: 'consent.shadowUpload', consentTraining: 'consent.training', consentLog: 'consent.log',
    config: 'shadow.config', kill: 'shadow.kill', disabledUntil: 'shadow.disabledUntil', tripCount: 'shadow.tripCount', tripReason: 'shadow.tripReason',
    id: 'shadow.id', secret: 'shadow.localSecret', err: 'shadow.err', schemaReject: 'shadow.schemaReject', stats: 'shadow.stats' };
  var CONSENT_VERSION = 'shadow-consent-v2';

  // ---------------- kv adapters
  function chromeKv() {
    var S = root.chrome.storage.local;
    return { get: function (keys) { return S.get(keys); }, set: function (o) { return S.set(o); }, remove: function (keys) { return S.remove(keys); } };
  }
  function memoryKv(init) {
    var m = Object.assign({}, init || {});
    return { get: function (keys) { var o = {}; [].concat(keys).forEach(function (k) { if (k in m) o[k] = JSON.parse(JSON.stringify(m[k])); }); return Promise.resolve(o); },
      set: function (o) { Object.keys(o).forEach(function (k) { m[k] = JSON.parse(JSON.stringify(o[k])); }); return Promise.resolve(); },
      remove: function (keys) { [].concat(keys).forEach(function (k) { delete m[k]; }); return Promise.resolve(); }, _dump: function () { return m; } };
  }

  // ---------------- enum guard (allowlist schema)
  var REASONS = new Set(['show', 'intent-null', 'own-sender', 'note-to-self', 'quiet:noise', 'quiet:hedge', 'quiet:google', 'quiet:family', 'quiet:low',
    'third-party', 'file', 'file-chain-not-run', 'fact-reply-block', 'no-draft-close', 'too-short', 'google-wait:drive-lookup', 'calendar-wait:file-lookup',
    'chip-low-confidence', 'engine-error', 'no-judge', 'page:attachment-count-unread', 'outlook:attachments-unread', 'other']);
  var REASON_PAT = /^(?:calendar-[a-z0-9-]{1,32}|quiet:[a-z0-9-]{1,24})$/;
  var PRODUCT = new Set(['payment-injection', 'quoted-only', 'negated-ask', 'gmail-onedrive-target', 'no-action-fyi', 'addressed-to-other', 'cc-only', 'marketing', 'conditional-undecided', 'save-target-not-drive']);
  var CAP = new Set(['cap:no-draft-to-self', 'cap:file-chain-owns', 'cap:save-needs-one-attachment', 'cap:negated-save', 'cap:save-target-not-drive', 'cap:outlook-no-bare-calendar', 'cap:own-mail']);
  var LABEL_RX = /^(?:SILENT|[a-z][a-z0-9-]{0,39}\|[a-z][a-z0-9_]{0,23})$/;
  function canonReason(r) {
    var s = String(r == null ? 'other' : r).replace(/\(([a-z0-9-]+)\)$/, ':$1');
    return REASONS.has(s) || REASON_PAT.test(s) ? s : 'other';
  }
  var isReason = function (s) { return typeof s === 'string' && (REASONS.has(s) || REASON_PAT.test(s)); };
  var isVeto = function (s) {
    if (s === null) return true; if (typeof s !== 'string') return false;
    if (s.indexOf('base:') === 0) return isReason(s.slice(5)) && s !== 'base:show';
    if (s.indexOf('product:') === 0) return PRODUCT.has(s.slice(8));
    return CAP.has(s);
  };
  var isBool = function (v) { return v === true || v === false; };
  var isBoolN = function (v) { return v === null || isBool(v); };
  var isNum = function (lo, hi) { return function (v) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }; };
  var isInt = function (lo, hi) { return function (v) { return isNum(lo, hi)(v) && Math.floor(v) === v; }; };
  var oneOf = function (arr) { var s = new Set(arr); return function (v) { return typeof v === 'string' && s.has(v); }; };
  var re = function (rx) { return function (v) { return typeof v === 'string' && rx.test(v); }; };
  var VER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  function schema(classesOf) {
    return {
      v: function (x) { return x === 2; }, ts: re(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/), ext: re(VER), shadowId: re(/^[0-9a-f]{32}$/), msgKey: re(/^[0-9a-f]{64}$/),
      surface: oneOf(['gmail', 'outlook']), direction: oneOf(['inbound', 'outbound', 'self']), lang: oneOf(['he', 'en', 'mixed']), shape: oneOf(['bare', 'mail']),
      attachmentCount: isInt(0, 99), rcpt: oneOf(['to', 'cc-only', 'none']), voc: oneOf(['own', 'other', 'group', 'none']), subjPrefix: isBool, lenBucket: isInt(0, 6),
      incumbent: { engine: re(VER), show: isBool, reason: isReason, label: re(LABEL_RX), normalizedFlip: isBool },
      candidate: { $nullable: true, model: re(/^v[0-9a-z]{1,6}@[0-9a-f]{8}$/), label: function (v, rec) { var cs = classesOf(rec.candidate && rec.candidate.model); return v === 'SILENT' || (cs && cs.indexOf(v) >= 0); },
        top: function (v, rec) { var cs = classesOf(rec.candidate && rec.candidate.model); return Boolean(cs && cs.indexOf(v) >= 0); }, pShow: isNum(0, 1), pLabel: isNum(0, 1), tau: isNum(0, 1),
        floorBlocked: isBool, veto: isVeto, ms: isNum(0, 600000) },
      reason: { $optional: true, $fn: oneOf(['timeout', 'error']) },
      outcome: { shown: isBool, doIt: isBool, fetchedBack: isBoolN, dismiss: isBool, undo: isBool, ignored: isBoolN, implicit: isBoolN }
    };
  }
  // returns null when valid, else the offending path
  function check(rec, sch) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return '$';
    for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k) && !(k in sch)) return k;   // unknown key (incl. `features` in tier A)
    for (var key in sch) {
      var spec = sch[key], v = rec[key];
      if (typeof spec === 'function') { if (!spec(v, rec)) return key; continue; }
      if (spec.$fn) { if (v === undefined && spec.$optional) continue; if (!spec.$fn(v, rec)) return key; continue; }
      if (v === null && spec.$nullable) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return key;
      for (var k2 in v) if (Object.prototype.hasOwnProperty.call(v, k2) && (!(k2 in spec) || k2[0] === '$')) return key + '.' + k2;
      for (var k3 in spec) { if (k3[0] === '$') continue; if (!spec[k3](v[k3], rec)) return key + '.' + k3; }
    }
    if (rec.candidate === null && rec.reason === undefined) return 'reason';
    return null;
  }

  // ---------------- crypto helpers
  function hex(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function randHex(n) { var b = new Uint8Array(n); root.crypto.getRandomValues(b); return hex(b); }
  function sha256Hex(buf) { return subtle().digest('SHA-256', buf).then(hex); }
  function hmacHex(secretHex, msg) {
    return subtle().importKey('raw', unhex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return subtle().sign('HMAC', k, new TextEncoder().encode(msg)); }).then(hex);
  }

  // ---------------- storage backends: same async interface
  function memoryBackend() {
    var st = { records: [], queue: [], outcomes: new Map(), meta: new Map() }, seq = 1;
    return {
      kind: 'memory',
      addRecord: function (r) { r.id = seq++; st.records.push(r); return Promise.resolve(r.id); },
      countRecords: function () { return Promise.resolve(st.records.length); },
      deleteOldest: function (n) { st.records.splice(0, n); return Promise.resolve(); },
      deleteBefore: function (ts) { st.records = st.records.filter(function (r) { return r.ts >= ts; }); st.outcomes.forEach(function (v, k) { if (v.ts < ts) st.outcomes.delete(k); }); return Promise.resolve(); },
      allRecords: function () { return Promise.resolve(st.records.slice()); },
      getOutcome: function (k) { return Promise.resolve(st.outcomes.get(k) || null); },
      putOutcome: function (o) { st.outcomes.set(o.msgKey, o); return Promise.resolve(); },
      getMeta: function (k) { return Promise.resolve(st.meta.has(k) ? st.meta.get(k) : null); },
      putMeta: function (k, v) { st.meta.set(k, v); return Promise.resolve(); },
      queueSize: function () { return Promise.resolve(st.queue.length); },
      clearAll: function () { st.records = []; st.queue = []; st.outcomes.clear(); st.meta.delete('aesKey'); return Promise.resolve(); }
    };
  }
  function idbBackend(idb, name, KeyRange) {
    idb = idb || root.indexedDB; name = name || 'glance-shadow'; KeyRange = KeyRange || root.IDBKeyRange;
    var dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        var q = idb.open(name, 1);
        q.onupgradeneeded = function () {
          var d = q.result;
          var r = d.createObjectStore('records', { keyPath: 'id', autoIncrement: true }); r.createIndex('ts', 'ts');
          d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
          var o = d.createObjectStore('outcomes', { keyPath: 'msgKey' }); o.createIndex('ts', 'ts');
          d.createObjectStore('meta');
        };
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      });
      return dbp;
    }
    function tx(stores, mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(stores, mode), out;
          t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
          out = fn(t);
          if (out && typeof out.then !== 'function' && 'onsuccess' in out) { var rq = out; rq.onsuccess = function () { out = rq.result; }; }
        });
      });
    }
    function cursorDelete(store, range, limit) {
      return tx([store], 'readwrite', function (t) {
        var n = 0, src = range ? t.objectStore(store).index('ts').openCursor(range) : t.objectStore(store).openCursor();
        src.onsuccess = function () { var c = src.result; if (!c || (limit != null && n >= limit)) return; c.delete(); n++; c.continue(); };
      });
    }
    return {
      kind: 'indexeddb',
      addRecord: function (r) { return tx(['records'], 'readwrite', function (t) { return t.objectStore('records').add(r); }); },
      countRecords: function () { return tx(['records'], 'readonly', function (t) { return t.objectStore('records').count(); }); },
      deleteOldest: function (n) { return cursorDelete('records', null, n); },
      deleteBefore: function (ts) { var range = KeyRange.upperBound(ts, true); return cursorDelete('records', range).then(function () { return cursorDelete('outcomes', range); }); },
      allRecords: function () { return tx(['records'], 'readonly', function (t) { return t.objectStore('records').getAll(); }); },
      getOutcome: function (k) { return tx(['outcomes'], 'readonly', function (t) { return t.objectStore('outcomes').get(k); }).then(function (v) { return v || null; }); },
      putOutcome: function (o) { return tx(['outcomes'], 'readwrite', function (t) { return t.objectStore('outcomes').put(o); }); },
      getMeta: function (k) { return tx(['meta'], 'readonly', function (t) { return t.objectStore('meta').get(k); }).then(function (v) { return v === undefined ? null : v; }); },
      putMeta: function (k, v) { return tx(['meta'], 'readwrite', function (t) { return t.objectStore('meta').put(v, k); }); },
      queueSize: function () { return tx(['queue'], 'readonly', function (t) { return t.objectStore('queue').count(); }); },
      clearAll: function () { return tx(['records', 'queue', 'outcomes', 'meta'], 'readwrite', function (t) { ['records', 'queue', 'outcomes'].forEach(function (s) { t.objectStore(s).clear(); }); t.objectStore('meta').delete('aesKey'); }); }
    };
  }

  // ---------------- the log
  function createLog(o) {
    o = o || {};
    var kv = o.kv || chromeKv(), be = o.backend || idbBackend();
    var clock = o.now || function () { return Date.now(); };
    var maxRecords = o.maxRecords || 5000, maxAgeMs = o.maxAgeMs || 30 * DAY;
    var classes = o.classesByModel || {};               // { 'v2@a75d2884': [labels...] }
    var classesOf = function (tag) { return classes[tag] || null; };
    var SCH = schema(classesOf);
    var keyP = null;

    function aesKey() {
      if (keyP) return keyP;
      keyP = be.getMeta('aesKey').then(function (k) {
        if (k) return k;
        return subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']).then(function (nk) { return be.putMeta('aesKey', nk).then(function () { return nk; }); });
      });
      return keyP;
    }
    function bump(key, by) { return kv.get(key).then(function (v) { var o2 = {}; o2[key] = (v[key] || 0) + (by || 1); return kv.set(o2); }); }

    // §7 kill switch: most restrictive wins. Reasons are stable strings for the local metrics page.
    function gate(modelTag) {
      return kv.get([K.kill, K.consent, K.config, K.disabledUntil]).then(function (s) {
        if (s[K.kill] === true) return { on: false, reason: 'kill-local' };
        if (s[K.consent] !== true) return { on: false, reason: 'no-consent' };
        var cfg = s[K.config];
        if (!cfg || cfg.verified !== true) return { on: false, reason: 'no-config' };     // never fetched (or unsigned) = off
        if (cfg.enabled !== true) return { on: false, reason: 'config-disabled' };
        if ((s[K.disabledUntil] || 0) > clock()) return { on: false, reason: 'tripwire' };
        if (modelTag && Array.isArray(cfg.modelAllowlist) && cfg.modelAllowlist.indexOf(modelTag) < 0) return { on: false, reason: 'not-allowlisted' };
        return { on: true, reason: null, config: cfg };
      });
    }
    function identity() {
      return kv.get([K.id, K.secret]).then(function (s) {
        var upd = {}; if (!s[K.id]) upd[K.id] = s[K.id] = randHex(16); if (!s[K.secret]) upd[K.secret] = s[K.secret] = randHex(32);
        return (Object.keys(upd).length ? kv.set(upd) : Promise.resolve()).then(function () { return { shadowId: s[K.id], secret: s[K.secret] }; });
      });
    }
    function msgKey(surface, messageId) { return identity().then(function (idn) { return hmacHex(idn.secret, String(surface) + String(messageId)); }); }

    function r3(x) { return Math.round(x * 1000) / 1000; }
    // one record per (message, model). cand = gs-model decide() output, or null with why='timeout'|'error'
    function buildRecord(si, cand, meta, why) {
      var ts = new Date(clock()).toISOString().replace(/\.\d{3}Z$/, 'Z');
      var rec = { v: 2, ts: ts, ext: meta.ext, shadowId: meta.shadowId, msgKey: meta.msgKey,
        surface: si.surface, direction: si.direction, lang: si.lang, shape: si.shape, attachmentCount: si.attachmentCount, rcpt: si.rcpt, voc: si.voc,
        subjPrefix: si.subjPrefix, lenBucket: si.lenBucket,
        incumbent: { engine: si.incumbent.engine, show: si.incumbent.show, reason: canonReason(si.incumbent.reason), label: si.incumbent.label, normalizedFlip: si.incumbent.normalizedFlip },
        candidate: cand ? { model: cand.model, label: cand.label, top: cand.top, pShow: r3(cand.pShow), pLabel: r3(cand.pLabel), tau: cand.tau, floorBlocked: cand.floorBlocked,
          veto: cand.veto ? canonVeto(cand.veto) : null, ms: Math.round(cand.ms * 10) / 10 } : null,
        outcome: { shown: si.incumbent.show, doIt: false, fetchedBack: null, dismiss: false, undo: false, ignored: null, implicit: null } };
      if (!cand) rec.reason = why || 'error';
      return rec;
    }
    function canonVeto(v) { return v.indexOf('base:') === 0 ? 'base:' + canonReason(v.slice(5)) : v; }
    function validate(rec) { return check(rec, SCH); }
    function serialize(rec) {
      var bad = check(rec, SCH);
      if (bad) return bump(K.schemaReject).then(function () { return null; });
      return Promise.resolve(JSON.stringify(rec));
    }
    function prune() {
      return be.deleteBefore(clock() - maxAgeMs).then(function () { return be.countRecords(); })
        .then(function (n) { return n > maxRecords ? be.deleteOldest(n - maxRecords) : null; });
    }
    function write(rec) {
      return serialize(rec).then(function (json) {
        if (json == null) return false;
        var iv = new Uint8Array(12); root.crypto.getRandomValues(iv);
        return aesKey().then(function (k) { return subtle().encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(json)); })
          .then(function (ct) { return be.addRecord({ ts: Date.parse(rec.ts), msgKey: rec.msgKey, iv: iv, ct: ct }); })
          .then(prune).then(function () { return true; });
      });
    }
    function readAll() {
      return Promise.all([aesKey(), be.allRecords()]).then(function (a) {
        var k = a[0];
        return Promise.all(a[1].map(function (r) {
          return subtle().decrypt({ name: 'AES-GCM', iv: r.iv }, k, r.ct).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); })
            .then(function (rec) { return be.getOutcome(rec.msgKey).then(function (oc) { if (oc) Object.assign(rec.outcome, oc.outcome); return rec; }); });
        }));
      });
    }
    var OUTCOME_KEYS = { doIt: isBool, fetchedBack: isBoolN, dismiss: isBool, undo: isBool, ignored: isBoolN, implicit: isBoolN, shown: isBool };
    // outcome joiner (receipt / undo / card UI paths). patch values must be booleans/null; anything else is rejected.
    function recordOutcome(surface, messageId, patch) {
      return gate().then(function (g) {
        if (!g.on) return false;
        for (var k in patch) if (!OUTCOME_KEYS[k] || !OUTCOME_KEYS[k](patch[k])) return bump(K.schemaReject).then(function () { return false; });
        return msgKey(surface, messageId).then(function (mk) {
          return be.getOutcome(mk).then(function (cur) { var oc = { msgKey: mk, ts: clock(), outcome: Object.assign({}, cur ? cur.outcome : {}, patch) }; return be.putOutcome(oc); }).then(function () { return true; });
        });
      });
    }
    function purge() { keyP = null; return be.clearAll(); }
    // §2: every tier change is logged; turning A off purges and rotates shadowId (tier B/C DELETE is not part of tier A)
    function setConsent(on, ts) {
      return kv.get([K.consentLog]).then(function (s) {
        var log = (s[K.consentLog] || []).concat([{ tier: 'A', on: Boolean(on), version: CONSENT_VERSION, ts: new Date(ts || clock()).toISOString() }]);
        var upd = {}; upd[K.consent] = Boolean(on); upd[K.consentLog] = log;
        if (!on) { upd[K.consentUpload] = false; upd[K.consentTraining] = false; }
        return kv.set(upd).then(function () { if (on) return null; return purge().then(function () { return kv.remove([K.id, K.secret, K.stats]); }); });
      });
    }
    // §7.3 client tripwires
    function trip(reason) {
      return kv.get([K.tripCount]).then(function (s) { var u = {}; u[K.disabledUntil] = clock() + 7 * DAY; u[K.tripCount] = (s[K.tripCount] || 0) + 1; u[K.tripReason] = reason; return kv.set(u); });
    }
    function noteRun(ms, isErr, cfg, memDeltaBytes) {
      return kv.get([K.stats]).then(function (s) {
        var st = s[K.stats] || { n: 0, err: 0, ms: [] };
        st.n++; if (isErr) st.err++; if (typeof ms === 'number') { st.ms.push(Math.round(ms * 10) / 10); if (st.ms.length > 200) st.ms.shift(); }
        var u = {}; u[K.stats] = st;
        return kv.set(u).then(function () {
          var maxP95 = (cfg && cfg.maxMsP95) || 50;
          if (st.ms.length >= 200) { var a = st.ms.slice().sort(function (x, y) { return x - y; }); if (a[Math.floor(0.95 * (a.length - 1))] > maxP95) return trip('p95').then(function () { return 'p95'; }); }
          if (st.n >= 200 && st.err / st.n > 0.01) return trip('error-rate').then(function () { return 'error-rate'; });
          if (memDeltaBytes != null && memDeltaBytes > 20 * 1024 * 1024) return trip('memory').then(function () { return 'memory'; });
          return null;
        });
      });
    }
    return { gate: gate, identity: identity, msgKey: msgKey, buildRecord: buildRecord, validate: validate, serialize: serialize, write: write, readAll: readAll,
      recordOutcome: recordOutcome, purge: purge, setConsent: setConsent, trip: trip, noteRun: noteRun, bump: bump, backend: be, kv: kv, prune: prune };
  }

  var api = { createLog: createLog, chromeKv: chromeKv, memoryKv: memoryKv, memoryBackend: memoryBackend, idbBackend: idbBackend, KEYS: K,
    canonReason: canonReason, sha256Hex: sha256Hex, hmacHex: hmacHex, CONSENT_VERSION: CONSENT_VERSION };
  NS.log = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
