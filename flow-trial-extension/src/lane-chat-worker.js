// Calendar locations for a chat draft. The service worker is an ES module and
// loads this file with a static import in src/background.js, on the line after
// native-edit.js. That import stays in this branch.
//
// It answers only flow:chat-evidence.
//
// A place ask needs the location field. Titles, descriptions, and attendees
// are not requested. Google uses the token Google connect already stored.
// Outlook uses the Graph token already stored for mail. This file does not
// ask for a new scope and does not open a consent window. Nothing here sends
// a chat message.
//
// Every connected calendar is read (Google, Outlook, or both) and the events
// are merged. The judge drafts only when one of those locations is a full
// address. Two different addresses stay quiet.
const FlowLaneChat = (() => {
  const CALENDAR = 'https://www.googleapis.com/calendar/v3';
  const GRAPH = 'https://graph.microsoft.com/v1.0/me/calendarView';
  const WEEK_MS = 8 * 24 * 60 * 60 * 1000;

  function notChecked(connected) {
    const on = connected && typeof connected === 'object'
      ? connected
      : { calendar: Boolean(connected), outlook: false };
    return { ok: true, sends: false, evidence: { connected: on, events: null } };
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

  // The token Outlook connect already saved. An expired token is not refreshed
  // here: a refresh can open a window, and this read must not.
  async function storedOutlookToken() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    let bag = null;
    try { bag = await chrome.storage.local.get('outlookAuth'); } catch (e) { return null; }
    const token = bag && bag.outlookAuth && bag.outlookAuth.token;
    if (!token || !token.accessToken) return null;
    if (typeof token.expiresAt === 'number' && token.expiresAt <= Date.now()) return null;
    return token.accessToken;
  }

  function graphStartIso(start) {
    if (!start || typeof start.dateTime !== 'string') return null;
    let raw = start.dateTime.trim();
    if (!raw) return null;
    if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) return raw;
    raw = raw.replace(/\.\d+$/, '');
    return raw + 'Z';
  }

  function outlookPlace(location) {
    if (!location) return '';
    if (typeof location === 'string') return location;
    const named = typeof location.displayName === 'string' ? location.displayName.trim() : '';
    if (named) return named;
    const address = location.address || {};
    return [address.street, address.city, address.state, address.postalCode, address.countryOrRegion]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  async function readJson(fetchOf, url, token, extra) {
    let res;
    try {
      res = await fetchOf(url, { method: 'GET', headers: Object.assign({ Authorization: 'Bearer ' + token }, extra || {}) });
    } catch (e) { return null; }
    if (!res || !res.ok || typeof res.json !== 'function') return null;
    try { return await res.json(); } catch (e) { return null; }
  }

  async function readGoogle(fetchOf, token, start, end) {
    const q = new URLSearchParams({
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: 'true',
      maxResults: '20',
      orderBy: 'startTime',
      fields: 'items(id,status,location,start)'
    });
    const data = await readJson(fetchOf, CALENDAR + '/calendars/primary/events?' + q.toString(), token);
    if (!data) return null;
    return (Array.isArray(data.items) ? data.items : []).slice(0, 20).map((e) => ({
      id: e && e.id || null,
      status: (e && e.status) || 'confirmed',
      location: e && typeof e.location === 'string' ? e.location : '',
      startIso: (e && e.start && (e.start.dateTime || e.start.date)) || null
    }));
  }

  async function readOutlook(fetchOf, token, start, end) {
    const q = new URLSearchParams({
      startDateTime: new Date(start).toISOString(),
      endDateTime: new Date(end).toISOString(),
      $select: 'id,isCancelled,location,start',
      $top: '20'
    });
    const data = await readJson(fetchOf, GRAPH + '?' + q.toString(), token, { Prefer: 'outlook.timezone="UTC"' });
    if (!data) return null;
    return (Array.isArray(data.value) ? data.value : []).slice(0, 20).map((e) => ({
      id: e && e.id || null,
      status: e && e.isCancelled ? 'cancelled' : 'confirmed',
      location: outlookPlace(e && e.location),
      startIso: graphStartIso(e && e.start)
    }));
  }

  // deps.token, deps.outlookToken, and deps.fetch are for tests. A source
  // with no token is skipped. A source that fails is not an empty calendar:
  // the whole read stays unchecked so a missed second address cannot draft.
  async function placeEvidence(payload, deps) {
    const d = deps || {};
    const tokenOf = d.token || storedToken;
    const outlookOf = d.outlookToken || storedOutlookToken;
    const fetchOf = d.fetch || ((url, init) => fetch(url, init));
    const window = payload && payload.window;
    const start = window ? Date.parse(window.startIso) : NaN;
    const end = window ? Date.parse(window.endIso) : NaN;
    if (!(end > start) || (end - start) > WEEK_MS) return notChecked(false);
    let googleToken = null;
    let outlookToken = null;
    try { googleToken = await tokenOf(); } catch (e) { googleToken = null; }
    try { outlookToken = await outlookOf(); } catch (e) { outlookToken = null; }
    if (!googleToken && !outlookToken) return notChecked(false);
    const events = [];
    let failed = false;
    if (googleToken) {
      const rows = await readGoogle(fetchOf, googleToken, start, end);
      if (!rows) failed = true;
      else rows.forEach((row) => events.push(row));
    }
    if (outlookToken) {
      const rows = await readOutlook(fetchOf, outlookToken, start, end);
      if (!rows) failed = true;
      else rows.forEach((row) => events.push(row));
    }
    if (failed) return notChecked({ calendar: true, outlook: Boolean(outlookToken) });
    return {
      ok: true,
      sends: false,
      evidence: {
        connected: { calendar: true, sheets: false, docs: false, drive: false, thread: false, gmail: false, outlook: Boolean(outlookToken) },
        events: events
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
