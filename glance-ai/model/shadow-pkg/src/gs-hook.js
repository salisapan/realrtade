/* Glance shadow tier, CONTENT-SCRIPT hook (v2.2 drop-in package). One call after each FlowIncomingJudge.judge(...) result,
 * on show AND on silence. Checks the kill switch / consent / sampling BEFORE doing any work, defers to idle time (never on the
 * UI path), builds the text-free ShadowInput (gs-prepare) and posts it to the service worker. Exceptions are swallowed.
 * Registers self.GlanceShadow.afterJudge. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});
  var req = typeof require === 'function' ? require : null;
  var PR = NS.prepare || req('./gs-prepare.js');
  var T = NS.text || req('./gs-text.js');
  function idle(fn) { if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 0); }
  function storage() { return root.chrome && root.chrome.storage && root.chrome.storage.local; }
  // cheap pre-gate: same order as gs-log gate(); the SW re-checks everything
  function preGate(s, messageId, now) {
    if (s['shadow.kill'] === true) return false;
    if (s['consent.shadow'] !== true) return false;
    var cfg = s['shadow.config']; if (!cfg || cfg.verified !== true || cfg.enabled !== true) return false;
    if ((s['shadow.disabledUntil'] || 0) > now) return false;
    var rate = typeof cfg.sampleRate === 'number' ? cfg.sampleRate : 1;
    return rate >= 1 || (T.fnv1a('sample:' + messageId) / 4294967296) < rate;
  }
  /**
   * afterJudge(caseIn, judgeResult, opts): fire-and-forget.
   * caseIn  = { surface, direction, from:{name,email}, to:[], cc:[], subject, body, attachmentCount }  (body = the text the judge saw)
   * opts    = { messageId, ownEmail, ownNames, engineVersion, now }
   */
  function afterJudge(caseIn, judgeResult, opts) {
    try {
      var S = storage(); if (!S) return;
      S.get(['shadow.kill', 'consent.shadow', 'shadow.config', 'shadow.disabledUntil']).then(function (s) {
        if (!preGate(s, opts.messageId, Date.now())) return;
        idle(function () {
          try {
            var si = PR.prepare(caseIn, Object.assign({}, opts, { judgeResult: judgeResult }));
            root.chrome.runtime.sendMessage({ type: 'glance-shadow/input', si: si }).catch(function () {});
          } catch (e) { /* swallowed; the SW counts errors it sees */ }
        });
      }).catch(function () {});
    } catch (e) { /* never surfaces */ }
  }
  NS.afterJudge = afterJudge; NS.preGate = preGate;
  if (typeof module === 'object' && module && module.exports) module.exports = { afterJudge: afterJudge, preGate: preGate };
})(typeof self !== 'undefined' ? self : globalThis);
