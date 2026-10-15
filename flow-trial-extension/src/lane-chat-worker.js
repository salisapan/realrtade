// Calendar locations for a chat draft. This file is not loaded by the service
// worker yet. The service worker is an ES module. After #144 merges, apply
// src/lane-chat-worker.import.patch. That patch adds one line after
// #144's native-edit.js import in src/background.js, and leaves that import
// in place:
// import './lane-chat-worker.js';
//
// It answers only flow:chat-evidence.
//
// A place ask needs the location field. Titles, descriptions, and attendees
// are not requested. The token is the one Google connect already stored.
// Nothing here opens a consent window, and nothing here sends a chat message.
const FlowLaneChat = (() => {
  const CALENDAR = 'https://www.googleapis.com/calendar/v3';
  const WEEK_MS = 8 * 24 * 60 * 60 * 1000;

  function notChecked(connected) {
    return { ok: true, sends: false, evidence: { connected: { calendar: Boolean(connected) }, events: null } };
  }

  function silentToken() {
    return new Promise((resolve) => {
      const identity = typeof chrome !== 'undefined' && chrome.identity;
      if (!identity || typeof identity.getAuthToken !== 'function') { resolve(null); return; }
      try {
        identity.getAuthToken({ interactive: false }, (token) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          resolve(!err && token ? token : null);
        });
      } catch (e) { resolve(null); }
    });
  }

  async function authHelpers() {
    try {
      if (typeof require !== 'undefined') return require('./google-web-auth.js');
    } catch (e) { /* the service worker loads it as a module */ }
    return import('./google-web-auth.js');
  }

  async function storedToken() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    const helpers = await authHelpers();
    const stored = await chrome.storage.local.get(['googleTasksAuth', helpers.GOOGLE_WEB_AUTH_STORAGE_KEY]);
    if (!stored || !stored.googleTasksAuth) return null;
    const chromeToken = await silentToken();
    if (chromeToken) return chromeToken;
    const web = stored[helpers.GOOGLE_WEB_AUTH_STORAGE_KEY];
    return helpers.webTokenUsable(web) ? web.accessToken : null;
  }

  // deps.token and deps.fetch are for tests. The live path stays silent when
  // Google is not connected. A failed read is "not checked", never an empty
  // calendar and never a sentence typed into the chat.
  async function placeEvidence(payload, deps) {
    const d = deps || {};
    const tokenOf = d.token || storedToken;
    const fetchOf = d.fetch || ((url, init) => fetch(url, init));
    const window = payload && payload.window;
    const start = window ? Date.parse(window.startIso) : NaN;
    const end = window ? Date.parse(window.endIso) : NaN;
    if (!(end > start) || (end - start) > WEEK_MS) return notChecked(false);
    let token = null;
    try { token = await tokenOf(); } catch (e) { token = null; }
    if (!token) return notChecked(false);
    const q = new URLSearchParams({
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: 'true',
      maxResults: '20',
      orderBy: 'startTime',
      fields: 'items(id,status,location,start)'
    });
    let res;
    try {
      res = await fetchOf(CALENDAR + '/calendars/primary/events?' + q.toString(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch (e) {
      return notChecked(true);
    }
    if (!res || !res.ok || typeof res.json !== 'function') return notChecked(true);
    let data;
    try { data = await res.json(); } catch (e) { return notChecked(true); }
    const events = (Array.isArray(data && data.items) ? data.items : []).slice(0, 20).map((e) => ({
      id: e && e.id || null,
      status: (e && e.status) || 'confirmed',
      location: e && typeof e.location === 'string' ? e.location : '',
      startIso: (e && e.start && (e.start.dateTime || e.start.date)) || null
    }));
    return {
      ok: true,
      sends: false,
      evidence: {
        connected: { calendar: true, sheets: false, docs: false, drive: false, thread: false, gmail: false, outlook: false },
        events
      }
    };
  }

  function ownSender(sender) {
    if (!sender || !sender.id) return true;
    return typeof chrome !== 'undefined' && chrome.runtime && sender.id === chrome.runtime.id;
  }

  function install() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage || !chrome.runtime.onMessage.addListener) return;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'flow:chat-evidence') return;
      if (!ownSender(sender)) {
        sendResponse({ ok: false, sends: false, reason: 'foreign-sender' });
        return;
      }
      const payload = msg.payload || {};
      if (payload.kind !== 'place') {
        sendResponse(notChecked(false));
        return;
      }
      placeEvidence(payload).then(sendResponse).catch(() => sendResponse(notChecked(true)));
      return true;
    });
  }

  install();
  return { placeEvidence };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneChat };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneChat = FlowLaneChat;
