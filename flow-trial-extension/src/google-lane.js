// Dispatcher for the Google lane. The host injects http. This file does not
// read background.js and does not answer messages that belong to it.
// Glance never presses Send. A compose fill is a preview, not a close.
const FlowGoogleLane = (() => {
  const WRITERS = {
    googleHold: 'FlowGoogleCalendar',
    googleLaneTask: 'FlowGoogleTasks',
    googleTaskClose: 'FlowGoogleTaskClose',
    googleDriveSave: 'FlowGoogleDrive',
    googleDoc: 'FlowGoogleDocs',
    googleDocFull: 'FlowGoogleDocs',
    googleSheetAppend: 'FlowGoogleSheets',
    googleNewFile: 'FlowWorkspaceFile',
    googleEventCallLink: 'FlowEventCallLink',
    googleRecurringReminder: 'FlowRecurringReminder',
    googleReplyDraft: 'FlowGoogleDrafts'
  };

  let injected = null;

  function mod(name) {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    return g[name] || null;
  }

  function writer(connectorId) {
    const name = WRITERS[connectorId];
    return name ? mod(name) : null;
  }

  function setHttp(fn) {
    injected = typeof fn === 'function' ? fn : null;
  }

  async function httpOf(explicit) {
    if (typeof explicit === 'function') return explicit;
    if (injected) return injected;
    return async function offline() {
      return { status: 0, ok: false, json: null };
    };
  }

  function isLaneMessage(msg) {
    const type = msg && msg.type;
    return type === 'flow:google-write' || type === 'flow:google-undo';
  }

  async function write(connectorId, input, http, clock) {
    if (connectorId === 'gmailCompose') {
      const Compose = mod('FlowGoogleCompose');
      if (!Compose) return { ok: false, reason: 'unavailable' };
      const state = input && input.state ? input.state : { to: '', subject: '', body: '', sendClicks: 0 };
      return Compose.fill(input, state, clock);
    }
    const api = writer(connectorId);
    if (!api || typeof api.write !== 'function') return { ok: false, reason: 'unknown' };
    return api.write(input, await httpOf(http), clock);
  }

  async function undo(connectorId, ref, http, state) {
    if (connectorId === 'gmailCompose') {
      const Compose = mod('FlowGoogleCompose');
      if (!Compose) return { ok: false, reason: 'unavailable' };
      return Compose.undo(ref, state || { to: '', subject: '', body: '', sendClicks: 0 });
    }
    const api = writer(connectorId);
    if (!api || typeof api.undo !== 'function') return { ok: false, reason: 'unknown' };
    return api.undo(ref, await httpOf(http));
  }

  async function dispatch(msg, http, clock) {
    if (!isLaneMessage(msg)) return undefined;
    if (msg.type === 'flow:google-undo') return undo(msg.connectorId, msg.ref, http, msg.state);
    return write(msg.connectorId, msg.input, http, clock);
  }

  function install(chromeLike) {
    const c = chromeLike || (typeof chrome !== 'undefined' ? chrome : null);
    if (!c || !c.runtime || !c.runtime.onMessage || typeof c.runtime.onMessage.addListener !== 'function') return;
    c.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!isLaneMessage(msg)) return undefined;
      Promise.resolve(dispatch(msg)).then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }));
      return true;
    });
  }

  return {
    WRITERS: WRITERS,
    setHttp: setHttp,
    isLaneMessage: isLaneMessage,
    write: write,
    undo: undo,
    dispatch: dispatch,
    install: install
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleLane };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleLane = FlowGoogleLane;
