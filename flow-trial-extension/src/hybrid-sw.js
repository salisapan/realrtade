// The service-worker side of the hybrid execution path: consent, the offscreen document that holds the model, the mirror of its state, the
// alarm that lets a paused download resume, and the one server call. docs/hybrid-execution-architecture.md.
// NOT referenced by background.js until the activation steps in that document are done. Self-contained, as background.js is: no core imports.
//
// Why an offscreen document and not the worker itself: a service worker is stopped when idle, which would drop the model from memory and
// cut a multi-gigabyte download off. The worker only orchestrates (consent, alarms, messages, the licence-checked server call); the page
// (src/offscreen.js) does the downloading and the inference. This is the one deliberate difference from "download in the service worker".
//
// Two separate consents, both default false, both changed only from an extension page (the popup), never from a content script:
//   localModel  may Glance download and run an on-device model (disk, bandwidth, GPU)?
//   server      may a MASKED prompt be sent to our server when the device is unsure? (the privacy page must say so before this is ever offered)
const FlowHybridSW = (() => {
  const KEY_CONSENT = 'glanceHybridConsent';
  const KEY_STATE = 'glanceHybridState';
  const ALARM = 'glance-hybrid-tick';
  const OFFSCREEN_URL = 'src/offscreen.html';
  const TICK_MINUTES = 30;
  const RESUMABLE = ['idle', 'awaiting-consent', 'downloading', 'paused', 'failed'];
  // A failure that retrying cannot fix (a wrong hash, a bad manifest, a redirect off the allowlist, a library that is not bundled) must not wake the
  // download every half hour: that would burn the person's bandwidth on a file that will never verify.
  const FATAL = /^(hash-mismatch|manifest-|redirect-host|model-lib-not-bundled|runtime-missing)/;

  function create(chromeApi, deps) {
    const c = chromeApi;
    const d = deps || {};

    async function consent() {
      const s = await c.storage.local.get(KEY_CONSENT);
      const v = s && s[KEY_CONSENT] || {};
      return { localModel: v.localModel === true, server: v.server === true };
    }
    async function mirror() { const s = await c.storage.local.get(KEY_STATE); return s && s[KEY_STATE] || null; }

    async function hasOffscreen() {
      if (!c.runtime.getContexts) return false;
      const ctx = await c.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return Boolean(ctx && ctx.length);
    }
    async function ensureOffscreen() {
      if (!c.offscreen || !c.offscreen.createDocument) return false;
      if (await hasOffscreen()) return true;
      try {
        await c.offscreen.createDocument({ url: OFFSCREEN_URL, reasons: ['WORKERS'], justification: 'Holds the on-device model the person turned on.' });
        return true;
      } catch (e) {
        return /only a single|already exists/i.test(String(e && e.message || e));      // a race with another caller is fine
      }
    }
    async function toOffscreen(msg) {
      if (!(await ensureOffscreen())) return { ok: false, reason: 'offscreen-unavailable' };
      try { return (await c.runtime.sendMessage(msg)) || { ok: false, reason: 'no-answer' }; } catch (e) { return { ok: false, reason: 'offscreen-unreachable' }; }
    }

    // Can this machine run the model, and how big is the download? Asks the offscreen page (the only place WebGPU can be asked); downloads nothing.
    async function probe() { return toOffscreen({ type: 'hybrid:probe' }); }

    async function status() {
      const [k, s] = await Promise.all([consent(), mirror()]);
      return { ok: true, isModelLoaded: Boolean(k.localModel && s && s.isModelLoaded === true), serverConsent: k.server, localModelConsent: k.localModel, state: s };
    }

    async function setConsent(patch) {
      const cur = await consent();
      const next = { localModel: patch.localModel === undefined ? cur.localModel : patch.localModel === true, server: patch.server === undefined ? cur.server : patch.server === true };
      await c.storage.local.set({ [KEY_CONSENT]: next });
      if (patch.localModel === true) {
        await toOffscreen({ type: 'hybrid:consent', given: true });
        c.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: TICK_MINUTES });
        toOffscreen({ type: 'hybrid:start' });                                        // started, not awaited: the download takes as long as it takes
      } else if (patch.localModel === false) {
        await c.alarms.clear(ALARM);
        if (await hasOffscreen()) await toOffscreen({ type: 'hybrid:remove' });        // turning it off frees the disk too
        await c.storage.local.remove(KEY_STATE);
      }
      return { ok: true, consent: next };
    }

    async function tick() {
      const [k, s] = await Promise.all([consent(), mirror()]);
      if (!k.localModel) { await c.alarms.clear(ALARM); return { ok: true, skipped: 'no-consent' }; }
      if (s && s.status === 'unsupported') { await c.alarms.clear(ALARM); return { ok: true, skipped: 'unsupported' }; }     // this machine cannot run it: stop waking up
      if (s && s.status === 'failed' && FATAL.test(String(s.lastError || ''))) { await c.alarms.clear(ALARM); return { ok: true, skipped: 'fatal' }; }
      if (s && (s.isModelLoaded === true || s.status === 'ready')) return { ok: true, skipped: s.status };
      if (s && RESUMABLE.indexOf(s.status) < 0) return { ok: true, skipped: s.status };
      return toOffscreen({ type: 'hybrid:start' });
    }

    // Returns a promise for messages this module owns, undefined for the rest (background.js keeps its own handlers).
    function handle(msg, sender) {
      if (!msg || typeof msg.type !== 'string') return undefined;
      const own = !sender || !sender.id || sender.id === (c.runtime && c.runtime.id);
      if (!own) return Promise.resolve({ ok: false, reason: 'foreign-sender' });
      const fromPage = Boolean(sender && sender.tab);                                   // a content script (a tab), as opposed to the popup
      switch (msg.type) {
        case 'flow:hybrid-status': return status();
        case 'flow:hybrid-probe': return probe();
        case 'flow:hybrid-consent': return fromPage ? Promise.resolve({ ok: false, reason: 'popup-only' }) : setConsent(msg.patch || {});
        case 'flow:hybrid-infer': return (async () => {
          const s = await status();
          if (!s.isModelLoaded) return { ok: false, reason: 'not-loaded' };
          return toOffscreen({ type: 'hybrid:infer', prompt: String(msg.prompt || ''), opts: { maxTokens: msg.opts && msg.opts.maxTokens } });
        })();
        case 'flow:execute': return (async () => {
          const k = await consent();
          if (!k.server) return { ok: false, reason: 'needs-consent' };
          const p = msg.payload || {};
          try {
            const data = await d.callAssist({ action: 'execute', lang: p.lang === 'he' ? 'he' : 'en', maskedPrompt: String(p.maskedPrompt || ''), instructions: String(p.instructions || '') });
            return { ok: true, text: data.text };
          } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 120), status: e && e.status }; }
        })();
        case 'hybrid:state': return (async () => {
          if (sender && sender.tab) return { ok: false, reason: 'offscreen-only' };
          await c.storage.local.set({ [KEY_STATE]: msg.state || null });
          return { ok: true };
        })();
        default: return undefined;
      }
    }

    function install() {
      c.alarms.onAlarm.addListener((a) => { if (a && a.name === ALARM) tick(); });
      c.runtime.onStartup.addListener(() => { tick(); });
    }

    return { handle, status, tick, setConsent, install, ensureOffscreen, probe };
  }

  return { KEY_CONSENT, KEY_STATE, ALARM, OFFSCREEN_URL, create };
})();

if (typeof module !== 'undefined') module.exports = { FlowHybridSW };
else if (typeof globalThis !== 'undefined') globalThis.FlowHybridSW = FlowHybridSW;
