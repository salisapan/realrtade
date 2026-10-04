// The service-worker side of the hybrid execution path: consent, the offscreen document that holds the model, the mirror of its state, the one
// permanent "disabled" flag, the retry back-off, and the licence-checked server call. docs/hybrid-execution-architecture.md.
// Self-contained, as background.js is: no core imports (the status wording lives in core/hybrid-status.js, used by the popup).
//
// Why an offscreen document and not the worker itself: a service worker is stopped when idle, which would drop the model from memory and cut a
// multi-gigabyte download off. The worker only orchestrates; the page (src/offscreen.js) downloads and runs the model.
//
// The rules this file enforces:
//   - config.enabled false (the default, config/hybrid.public.js): nothing here does anything, no offscreen page is ever created.
//   - Silent capability probe BEFORE any download. A machine that cannot run the model (no WebGPU, no adapter, no shader-f16, too little memory or
//     GPU buffer) gets ONE permanent flag: the offscreen page is closed, every alarm is cleared, and nothing wakes again. Only the person can reset it.
//   - A download that fails (network, a hash mismatch, a bad manifest, an engine that will not start) is retried with exponential back-off, 15 minutes
//     then 60 minutes, and after the THIRD failure it gives up for good (the same permanent flag, kind 'gave-up'): execution stays on the server.
//   - Consents are changed only from an extension page (the popup), never from a content script.
const FlowHybridSW = (() => {
  const KEY_CONSENT = 'glanceHybridConsent';
  const KEY_STATE = 'glanceHybridState';
  const KEY_FLAGS = 'glanceHybridFlags';
  const ALARM_TICK = 'glance-hybrid-tick';       // wakes a download that is only PAUSED (offline, metered, data saver); not a failure
  const ALARM_RETRY = 'glance-hybrid-retry';     // the back-off after a FAILED attempt
  const OFFSCREEN_URL = 'src/offscreen.html';
  const TICK_MINUTES = 30;
  const RETRY_MINUTES = [15, 60];                // after failure 1 and failure 2; failure 3 gives up
  const MAX_ATTEMPTS = 3;

  function create(chromeApi, deps) {
    const c = chromeApi;
    const d = deps || {};
    const cfg = Object.assign({ enabled: false, autoDownload: false, serverFallback: true }, d.config || {});
    const now = () => (typeof d.now === 'function' ? d.now() : Date.now());

    async function read(key) { const s = await c.storage.local.get(key); return s && s[key]; }
    async function consent() {
      const v = (await read(KEY_CONSENT)) || {};
      return { localModel: v.localModel === undefined ? cfg.autoDownload === true : v.localModel === true, server: v.server === undefined ? cfg.serverFallback === true : v.server === true };
    }
    async function mirror() { return (await read(KEY_STATE)) || null; }
    async function flags() { return Object.assign({ disabled: null, attempts: 0, nextRetryAt: null }, (await read(KEY_FLAGS)) || {}); }
    async function saveFlags(f) { await c.storage.local.set({ [KEY_FLAGS]: f }); return f; }

    async function hasOffscreen() {
      if (!c.runtime.getContexts) return false;
      const ctx = await c.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return Boolean(ctx && ctx.length);
    }
    async function ensureOffscreen() {
      if (!cfg.enabled || (await flags()).disabled) return false;               // a disabled feature never creates the page
      if (!c.offscreen || !c.offscreen.createDocument) return false;
      if (await hasOffscreen()) return true;
      try {
        await c.offscreen.createDocument({ url: OFFSCREEN_URL, reasons: ['WORKERS'], justification: 'Holds the on-device model.' });
        return true;
      } catch (e) {
        return /only a single|already exists/i.test(String(e && e.message || e));
      }
    }
    async function toOffscreen(msg) {
      if (!cfg.enabled) return { ok: false, reason: 'not-enabled' };
      if ((await flags()).disabled) return { ok: false, reason: 'disabled' };
      if (!(await ensureOffscreen())) return { ok: false, reason: 'offscreen-unavailable' };
      try { return (await c.runtime.sendMessage(msg)) || { ok: false, reason: 'no-answer' }; } catch (e) { return { ok: false, reason: 'offscreen-unreachable' }; }
    }

    // ---- the permanent flag ------------------------------------------------------------------------------------------------------------------
    async function disable(kind, reason) {
      const f = await flags();
      f.disabled = { kind, reason: String(reason || '').slice(0, 120), at: now() };
      f.nextRetryAt = null;
      await saveFlags(f);
      await c.alarms.clear(ALARM_TICK);
      await c.alarms.clear(ALARM_RETRY);
      try { if (c.offscreen && c.offscreen.closeDocument && (await hasOffscreen())) await c.offscreen.closeDocument(); } catch (e) { /* already closed */ }
      return f;
    }

    // ---- the state the offscreen page reports ---------------------------------------------------------------------------------------------------
    async function onState(state) {
      await c.storage.local.set({ [KEY_STATE]: state || null });
      if (!state) return;
      const f = await flags();
      if (f.disabled) return;
      if (state.status === 'unsupported') { await disable('incapable', state.unsupportedReason || 'unsupported'); return; }
      if (state.status === 'ready' || state.isModelLoaded === true) {
        if (f.attempts || f.nextRetryAt) { f.attempts = 0; f.nextRetryAt = null; await saveFlags(f); }
        await c.alarms.clear(ALARM_RETRY);
        return;
      }
      if (state.status === 'failed') {
        f.attempts = (f.attempts || 0) + 1;
        if (f.attempts >= MAX_ATTEMPTS) { await saveFlags(f); await disable('gave-up', 'after ' + MAX_ATTEMPTS + ' failed attempts: ' + (state.lastError || 'unknown')); return; }
        const minutes = RETRY_MINUTES[f.attempts - 1];
        f.nextRetryAt = now() + minutes * 60000;
        await saveFlags(f);
        c.alarms.create(ALARM_RETRY, { delayInMinutes: minutes });
        return;
      }
      if (state.status === 'paused') c.alarms.create(ALARM_TICK, { delayInMinutes: TICK_MINUTES, periodInMinutes: TICK_MINUTES });
    }

    async function status() {
      const [k, s, f] = await Promise.all([consent(), mirror(), flags()]);
      const active = cfg.enabled && !f.disabled;
      return { ok: true, enabled: cfg.enabled, consent: k, flags: f, state: s,
        isModelLoaded: Boolean(active && k.localModel && s && s.isModelLoaded === true),
        serverConsent: Boolean(cfg.enabled && k.server) };
    }

    // The silent capability probe: asks the offscreen page what this machine supports; downloads and stores nothing. A permanent "no" disables everything.
    async function probe() {
      if (!cfg.enabled) return { ok: false, reason: 'not-enabled' };
      if ((await flags()).disabled) return { ok: true, eligible: false, disabled: true };
      const r = await toOffscreen({ type: 'hybrid:probe' });
      if (r && r.ok && r.eligible === false && r.permanent === true) await disable('incapable', r.reason);
      return r;
    }

    async function startDownload() {
      const [k, f] = await Promise.all([consent(), flags()]);
      if (!cfg.enabled || f.disabled || !k.localModel) return { ok: false, reason: f.disabled ? 'disabled' : 'no-consent' };
      toOffscreen({ type: 'hybrid:start' });                                      // not awaited: the download takes as long as it takes
      return { ok: true, started: true };
    }

    // Install, browser start: probe silently; on a capable machine, start only if the person wants it (consent, or the autoDownload setting).
    async function boot() {
      if (!cfg.enabled) return { ok: true, skipped: 'not-enabled' };
      const f = await flags();
      if (f.disabled) return { ok: true, skipped: 'disabled' };
      const p = await probe();
      if (!p || p.ok !== true || p.eligible !== true) return { ok: true, skipped: p && p.reason || 'ineligible' };
      return startDownload();
    }

    async function setConsent(patch) {
      const cur = await consent();
      const next = { localModel: patch.localModel === undefined ? cur.localModel : patch.localModel === true, server: patch.server === undefined ? cur.server : patch.server === true };
      await c.storage.local.set({ [KEY_CONSENT]: next });
      if (patch.localModel === true) {
        await toOffscreen({ type: 'hybrid:consent', given: true });
        const p = await probe();                                                  // never a download before the probe
        if (p && p.ok && p.eligible) startDownload();
      } else if (patch.localModel === false) {
        await c.alarms.clear(ALARM_TICK); await c.alarms.clear(ALARM_RETRY);
        if (await hasOffscreen()) await toOffscreen({ type: 'hybrid:remove' });
        await c.storage.local.remove(KEY_STATE);
      }
      return { ok: true, consent: next };
    }

    // The person's own "try again": clears the permanent flag and the attempt count, then probes again. The only way out of a disabled state.
    async function reset() {
      await saveFlags({ disabled: null, attempts: 0, nextRetryAt: null });
      await c.storage.local.remove(KEY_STATE);
      return boot();
    }

    async function tick(name) {
      const [k, s, f] = await Promise.all([consent(), mirror(), flags()]);
      if (!cfg.enabled || f.disabled || !k.localModel) { await c.alarms.clear(ALARM_TICK); await c.alarms.clear(ALARM_RETRY); return { ok: true, skipped: f.disabled ? 'disabled' : 'off' }; }
      if (name === ALARM_TICK && !(s && s.status === 'paused')) { await c.alarms.clear(ALARM_TICK); return { ok: true, skipped: s && s.status || 'idle' }; }   // the periodic wake is only for a paused download
      if (s && (s.status === 'ready' || s.isModelLoaded === true)) return { ok: true, skipped: s.status };
      return toOffscreen({ type: 'hybrid:start' });
    }

    // Returns a promise for messages this module owns, undefined for the rest.
    function handle(msg, sender) {
      if (!msg || typeof msg.type !== 'string') return undefined;
      const own = !sender || !sender.id || sender.id === (c.runtime && c.runtime.id);
      if (!own) return Promise.resolve({ ok: false, reason: 'foreign-sender' });
      const fromPage = Boolean(sender && sender.tab);
      switch (msg.type) {
        case 'flow:hybrid-status': return status();
        case 'flow:hybrid-probe': return probe();
        case 'flow:hybrid-consent': return fromPage ? Promise.resolve({ ok: false, reason: 'popup-only' }) : (cfg.enabled ? setConsent(msg.patch || {}) : Promise.resolve({ ok: false, reason: 'not-enabled' }));
        case 'flow:hybrid-retry': return fromPage ? Promise.resolve({ ok: false, reason: 'popup-only' }) : (cfg.enabled ? reset() : Promise.resolve({ ok: false, reason: 'not-enabled' }));
        case 'flow:hybrid-infer': return (async () => {
          const s = await status();
          if (!s.isModelLoaded) return { ok: false, reason: 'not-loaded' };
          return toOffscreen({ type: 'hybrid:infer', prompt: String(msg.prompt || ''), opts: { maxTokens: msg.opts && msg.opts.maxTokens } });
        })();
        case 'flow:execute': return (async () => {
          const k = await consent();
          if (!cfg.enabled || !k.server) return { ok: false, reason: 'needs-consent' };
          const p = msg.payload || {};
          try {
            const data = await d.callAssist({ action: 'execute', lang: p.lang === 'he' ? 'he' : 'en', maskedPrompt: String(p.maskedPrompt || ''), instructions: String(p.instructions || '') });
            return { ok: true, text: data.text };
          } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 120), status: e && e.status }; }
        })();
        case 'hybrid:state': return (async () => {
          if (sender && sender.tab) return { ok: false, reason: 'offscreen-only' };
          await onState(msg.state);
          return { ok: true };
        })();
        default: return undefined;
      }
    }

    function install() {
      if (!cfg.enabled) return;                                                    // a disabled path registers nothing
      if (c.alarms && c.alarms.onAlarm) c.alarms.onAlarm.addListener((a) => { if (a && (a.name === ALARM_TICK || a.name === ALARM_RETRY)) tick(a.name); });
      if (c.runtime.onStartup) c.runtime.onStartup.addListener(() => { boot(); });
      if (c.runtime.onInstalled) c.runtime.onInstalled.addListener(() => { boot(); });
    }

    return { handle, status, tick, boot, probe, setConsent, reset, install, ensureOffscreen, disable, onState };
  }

  return { KEY_CONSENT, KEY_STATE, KEY_FLAGS, ALARM_TICK, ALARM_RETRY, OFFSCREEN_URL, RETRY_MINUTES, MAX_ATTEMPTS, create };
})();

if (typeof module !== 'undefined') module.exports = { FlowHybridSW };
else if (typeof globalThis !== 'undefined') globalThis.FlowHybridSW = FlowHybridSW;
