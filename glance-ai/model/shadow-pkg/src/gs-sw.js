/* Glance shadow tier, SERVICE-WORKER runner (v2.2 drop-in package). Wires gs-model + gs-log:
 *   ShadowInput (from the content script, text-free) -> gate -> lazy weights load (+sha256 check) -> v2 (primary) and v2.1 (second)
 *   -> one glance-shadow/2 record per model -> enum guard -> encrypted local ring buffer. Never changes what the user sees.
 * Weights come from the extension package only (chrome.runtime.getURL); any other URL is refused (no remote fetch).
 * Registers self.GlanceShadow.sw. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});
  var req = typeof require === 'function' ? require : null;
  var MD = NS.model || req('./gs-model.js');
  var LG = NS.log || req('./gs-log.js');
  var HARD_MS = 100;

  // the only loader the package itself offers: a file inside the extension package
  function packagedLoader(base) {
    return function (file) {
      var url = root.chrome.runtime.getURL((base || '') + file);
      if (url.indexOf('chrome-extension://' + root.chrome.runtime.id + '/') !== 0) return Promise.reject(new Error('refusing non-package URL'));
      return root.fetch(url).then(function (r) { if (!r.ok) throw new Error('weights ' + r.status); return r.arrayBuffer(); });
    };
  }

  /**
   * createRunner({ manifest, loadWeights(file)->Promise<ArrayBuffer>, kv, backend, ext:'0.9.39', now, memProbe })
   * manifest = weights/manifest.json (bundled as data; sha256 per model).
   */
  function createRunner(o) {
    var man = o.manifest, models = null, loading = null;
    var order = Object.keys(man.models).sort(function (a, b) { return (man.models[a].role === 'primary' ? 0 : 1) - (man.models[b].role === 'primary' ? 0 : 1); });
    var classesByModel = {};
    var log = LG.createLog({ kv: o.kv, backend: o.backend, now: o.now, classesByModel: classesByModel, maxRecords: o.maxRecords, maxAgeMs: o.maxAgeMs });
    var mem0 = null;

    function ensureModels() {
      if (models) return Promise.resolve(models);
      if (loading) return loading;
      loading = Promise.all(order.map(function (k) {
        var m = man.models[k];
        return o.loadWeights(m.file).then(function (buf) {
          return LG.sha256Hex(buf).then(function (sha) {
            if (sha !== m.sha256) { var e = new Error('sha256 mismatch ' + k); e.code = 'weights-sha'; throw e; }
            var mod = MD.load(buf, m.kind, sha.slice(0, 8)); classesByModel[mod.tag] = mod.classes; return mod;
          });
        });
      })).then(function (ms) { models = ms; loading = null; return ms; }, function (e) { loading = null; throw e; });
      return loading;
    }

    // returns { written: n, skipped: reason|null }
    function handle(si) {
      return log.gate().then(function (g) {
        if (!g.on) return { written: 0, skipped: g.reason };                  // off: compute nothing, log nothing, count nothing
        if (si && si.v !== 1) return log.bump(LG.KEYS.err).then(function () { return { written: 0, skipped: 'bad-input' }; });
        return ensureModels().then(function (ms) {
          if (mem0 == null && o.memProbe) mem0 = o.memProbe();
          return Promise.all([log.identity(), log.msgKey(si.surface, si.messageId)]).then(function (a) {
            var meta = { ext: o.ext, shadowId: a[0].shadowId, msgKey: a[1] };
            var allow = g.config.modelAllowlist;
            var recs = [], maxMs = 0, err = false;
            ms.forEach(function (m) {
              if (Array.isArray(allow) && allow.indexOf(m.tag) < 0) return;
              var cand = null, why = null;
              try {
                var d = MD.decide(m, si); d.ms = (si.prepMs || 0) + d.scoreMs;
                maxMs = Math.max(maxMs, d.ms);
                if (d.ms > HARD_MS) why = 'timeout'; else cand = d;
              } catch (e) { why = 'error'; err = true; }
              recs.push(log.buildRecord(si, cand, meta, why));
            });
            return recs.reduce(function (p, r) { return p.then(function (n) { return log.write(r).then(function (ok) { return n + (ok ? 1 : 0); }); }); }, Promise.resolve(0))
              .then(function (n) { return log.noteRun(maxMs, err, g.config, o.memProbe && mem0 != null ? o.memProbe() - mem0 : null).then(function (tripped) { return { written: n, skipped: null, tripped: tripped }; }); });
          });
        }, function (e) {
          if (e && e.code === 'weights-sha') return log.trip('weights-sha').then(function () { return { written: 0, skipped: 'weights-sha' }; });
          throw e;
        });
      }).catch(function (e) {                                                  // never surfaces to the user
        return log.bump(LG.KEYS.err).then(function () { return { written: 0, skipped: 'error', error: String(e && e.message || e) }; });
      });
    }
    // MV3 wiring: content script -> chrome.runtime.sendMessage({ type: 'glance-shadow/input', si })
    function listen() {
      root.chrome.runtime.onMessage.addListener(function (msg, sender) {
        if (!msg || msg.type !== 'glance-shadow/input' || !sender || sender.id !== root.chrome.runtime.id) return false;
        handle(msg.si); return false;                                          // fire-and-forget, no response
      });
    }
    return { handle: handle, listen: listen, log: log, ensureModels: ensureModels };
  }

  var api = { createRunner: createRunner, packagedLoader: packagedLoader, HARD_MS: HARD_MS };
  NS.sw = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
