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
  const GRAPH_TIMEOUT_MS = 8000;

  function notChecked(connected) {
    const on = connected && typeof connected === 'object'
      ? connected
      : { calendar: Boolean(connected), outlook: false };
    return { ok: true, sends: false, evidence: { connected: on, events: null } };
  }

  // The headless copy sets __glanceE2e.installed. A store build has update_url
  // and never takes this path, even if that global is present.
  function e2eToken() {
    const e2e = typeof globalThis !== 'undefined' ? globalThis.__glanceE2e : null;
    if (!e2e || e2e.installed !== true || typeof e2e.googleAuthToken !== 'function') return null;
    try {
      const manifest = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function'
        ? chrome.runtime.getManifest()
        : null;
      if (manifest && manifest.update_url) return null;
    } catch (e) { return null; }
    return e2e;
  }

  // chrome.identity cannot be replaced inside the service worker. The headless
  // suite sets __glanceE2e.googleAuthToken, the same seam getGoogleAuthToken
  // uses. Production never sets it, so the Chrome call below is unchanged.
  function silentToken() {
    return new Promise((resolve) => {
      const e2e = e2eToken();
      if (e2e) {
        Promise.resolve().then(() => e2e.googleAuthToken(false)).then((token) => resolve(token || null)).catch(() => resolve(null));
        return;
      }
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

  // background.js puts the statically imported helpers on this global.
  // A service worker cannot call import(), and require() exists only in node.
  function authHelpers() {
    const live = typeof globalThis !== 'undefined' ? globalThis.__glanceGoogleAuth : null;
    if (live && live.GOOGLE_WEB_AUTH_STORAGE_KEY && typeof live.webTokenUsable === 'function') return live;
    try {
      if (typeof require !== 'undefined') return require('./google-web-auth.js');
    } catch (e) { /* the service worker has the global, or Google stays unread */ }
    return null;
  }

  // null: Google is not connected. { failed: true }: it is connected and the
  // token cannot be read. That is a failed read, so the chat stays quiet.
  async function storedToken() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    const helpers = authHelpers();
    const key = helpers && helpers.GOOGLE_WEB_AUTH_STORAGE_KEY;
    let stored = null;
    try {
      stored = await chrome.storage.local.get(key ? ['googleTasksAuth', key] : ['googleTasksAuth']);
    } catch (e) { return null; }
    if (!stored || !stored.googleTasksAuth) return null;
    if (!helpers) return { failed: true };
    const chromeToken = await silentToken();
    if (chromeToken) return chromeToken;
    const web = key ? stored[key] : null;
    if (typeof helpers.webTokenUsable === 'function' && helpers.webTokenUsable(web)) return web.accessToken;
    return { failed: true };
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

  function fullAddress(text) {
    return /,/.test(text) || /\d/.test(text);
  }

  // A display name that is only "Taizu" is not the address. Street and city are.
  function outlookPlace(location) {
    if (!location) return '';
    if (typeof location === 'string') return location;
    const named = typeof location.displayName === 'string' ? location.displayName.trim() : '';
    const address = location.address || {};
    const line = [address.street, address.city].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
    if (named && fullAddress(named)) return named;
    // "Taizu" plus "23 Montefiore, Tel Aviv" stays one place: the name and the address.
    if (line && named) return named + ', ' + line;
    if (line) return line;
    return named;
  }

  async function readJson(fetchOf, url, token, extra, signal) {
    let res;
    try {
      const init = { method: 'GET', headers: Object.assign({ Authorization: 'Bearer ' + token }, extra || {}) };
      if (signal) init.signal = signal;
      res = await fetchOf(url, init);
    } catch (e) { return null; }
    if (!res || !res.ok || typeof res.json !== 'function') return null;
    try { return await res.json(); } catch (e) { return null; }
  }

  function abortAfter(timeoutMs) {
    const limit = timeoutMs == null ? GRAPH_TIMEOUT_MS : timeoutMs;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) { /* already settled */ } }, limit) : null;
    return {
      signal: ctrl && ctrl.signal,
      done() { if (timer) clearTimeout(timer); }
    };
  }

  async function readGoogle(fetchOf, token, start, end, timeoutMs) {
    const q = new URLSearchParams({
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: 'true',
      maxResults: '20',
      orderBy: 'startTime',
      fields: 'items(id,status,location,start)'
    });
    const gate = abortAfter(timeoutMs);
    let data = null;
    try {
      data = await readJson(fetchOf, CALENDAR + '/calendars/primary/events?' + q.toString(), token, null, gate.signal);
    } finally { gate.done(); }
    if (!data) return null;
    return (Array.isArray(data.items) ? data.items : []).slice(0, 20).map((e) => ({
      id: e && e.id || null,
      status: (e && e.status) || 'confirmed',
      location: e && typeof e.location === 'string' ? e.location : '',
      startIso: (e && e.start && (e.start.dateTime || e.start.date)) || null
    }));
  }

  async function readOutlook(fetchOf, token, start, end, timeoutMs) {
    const q = new URLSearchParams({
      startDateTime: new Date(start).toISOString(),
      endDateTime: new Date(end).toISOString(),
      $select: 'id,isCancelled,location,start',
      $top: '20'
    });
    const gate = abortAfter(timeoutMs);
    let data = null;
    try {
      data = await readJson(fetchOf, GRAPH + '?' + q.toString(), token, { Prefer: 'outlook.timezone="UTC"' }, gate.signal);
    } finally { gate.done(); }
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
    let googleFailed = false;
    try {
      const got = await tokenOf();
      if (got && typeof got === 'object' && got.failed) googleFailed = true;
      else googleToken = got || null;
    } catch (e) { googleFailed = true; }
    try { outlookToken = await outlookOf(); } catch (e) { outlookToken = null; }
    if (!googleToken && !outlookToken && !googleFailed) return notChecked(false);
    const events = [];
    let failed = googleFailed;
    if (googleToken) {
      const rows = await readGoogle(fetchOf, googleToken, start, end, d.graphTimeout);
      if (!rows) failed = true;
      else rows.forEach((row) => events.push(row));
    }
    if (outlookToken) {
      const rows = await readOutlook(fetchOf, outlookToken, start, end, d.graphTimeout);
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

  // Dev Gate only. A store build has update_url and this returns null even if
  // glanceDevFixture is set. The fixture page is not in that build.
  async function devFixtureReply(sender, storeGet, manifestOf) {
    const url = String((sender && (sender.url || (sender.tab && sender.tab.url))) || '');
    if (url.indexOf('/dev/messenger-fixture.html') < 0) return null;
    let manifest = null;
    try {
      manifest = typeof manifestOf === 'function'
        ? manifestOf()
        : (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function' ? chrome.runtime.getManifest() : null);
    } catch (e) { return null; }
    if (manifest && manifest.update_url) return null;
    const read = storeGet || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get.bind(chrome.storage.local));
    if (typeof read !== 'function') return null;
    let bag = null;
    try { bag = await read('glanceDevFixture'); } catch (e) { return null; }
    if (!bag || bag.glanceDevFixture !== true) return null;
    const one = { id: 'dev-oct-8', status: 'confirmed', location: 'דיזנגוף 99', startIso: '2026-10-08T10:00:00+03:00' };
    const events = /[?&]case=two(?:&|$)/.test(url)
      ? [one, { id: 'dev-oct-8-b', status: 'confirmed', location: 'אבן גבירול 30', startIso: '2026-10-08T19:00:00+03:00' }]
      : [one];
    return {
      ok: true,
      sends: false,
      evidence: { connected: { calendar: true, outlook: false }, events: events }
    };
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
      devFixtureReply(sender).then((fake) => {
        if (fake) return fake;
        if (payload.kind !== 'place') return notChecked(false);
        return placeEvidence(payload);
      }).then(sendResponse).catch(() => sendResponse(notChecked(true)));
      return true;
    });
  }

  install();
  return { placeEvidence, devFixtureReply };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneChat };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneChat = FlowLaneChat;
