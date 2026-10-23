// Lane host for the service worker. background.js imports this once.
// Loading it registers the lane messages and stores a fetch function.
// It does not call chrome.identity or fetch until a message arrives.
import '../core/google-config.js';
import '../core/google-account.js';
import '../core/google-calendar.js';
// FlowMeetLink: the Meet link on a hold, switch MEET_LINK, off.
import '../core/meet-link.js';
// FlowRecurringReminder: a repeat on the Hold It, switch RECURRING_HOLD, off.
import '../core/recurring-reminder.js';
// FlowWorkspaceFile: an empty Doc, Sheet or Slides deck from a request, switch WORKSPACE_FILE, off.
import '../core/workspace-file.js';
// FlowEventCallLink: a Meet link on an event already on the calendar, switch EVENT_CALL_LINK, off.
import '../core/event-call-link.js';
// FlowFullDocumentClose: a full quote/proposal Doc in the person's style (Gmail+Docs), switch FULL_DOCUMENT_CLOSE, off.
import '../core/google-closes.js';
import '../core/style-profile.js';
import '../core/full-document-close.js';
// FlowGoogleContacts: resolve a name in Google Contacts (G8), switch GOOGLE_CONTACTS, off.
import '../core/google-contacts.js';
import '../core/google-tasks.js';
import '../core/google-task-close.js';
import '../core/google-drive.js';
import '../core/google-docs.js';
import '../core/google-sheets.js';
import '../core/google-compose.js';
import '../core/google-drafts.js';
import '../core/google-proof.js';
import './google-lane.js';

const Lane = typeof FlowGoogleLane !== 'undefined' ? FlowGoogleLane : globalThis.FlowGoogleLane;

const RECONNECT_KEY = 'googleReconnect';
const RECONNECT_LABEL = 'חבר מחדש את Google';
let laneSource = 'chrome';

// The token of the account the person consented to in Glance, and only that.
// The stored Connect token and Chrome's own token are both read, each one's
// account comes from the Gmail profile, and the account recorded at Connect
// decides. Chrome's token is used only when it is the same account. Interactive
// stays false. No e2e hook is required.
const CONNECTED_ACCOUNT_KEY = 'googleConnectedAccount';
const SEEN_MS = 5 * 60 * 1000;
const seenAccounts = new Map();

function Account() {
  return typeof FlowGoogleAccount !== 'undefined' ? FlowGoogleAccount : globalThis.FlowGoogleAccount;
}

function webTokenReady(record) {
  const WEB_SKEW_MS = 60 * 1000;
  if (!record || typeof record.accessToken !== 'string' || !record.accessToken) return '';
  if (record.expiresAt == null || record.expiresAt === '') return record.accessToken;
  const at = Number(record.expiresAt);
  if (!Number.isFinite(at) || at - WEB_SKEW_MS <= Date.now()) return '';
  return record.accessToken;
}

function storedConnectToken() {
  const store = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (!store || typeof store.get !== 'function') return Promise.resolve('');
  return Promise.resolve()
    .then(() => store.get('googleWebAuth'))
    .then((bag) => {
      const record = bag && (bag.googleWebAuth || (typeof bag.accessToken === 'string' ? bag : null));
      const ready = webTokenReady(record);
      if (ready) return ready;
      if (!record || !record.accessToken) return '';
      const bridge = typeof globalThis !== 'undefined' ? globalThis.FlowGoogleAccess : null;
      if (!bridge || typeof bridge.refreshSilent !== 'function') return '';
      return Promise.resolve().then(() => bridge.refreshSilent()).then((next) => {
        if (next && typeof next === 'object' && next.token) return next.token;
        if (typeof next === 'string') return next;
        return '';
      }).catch(() => '');
    })
    .catch(() => '');
}

function identityToken() {
  return new Promise((resolve) => {
    const identity = typeof chrome !== 'undefined' ? chrome.identity : null;
    if (!identity || typeof identity.getAuthToken !== 'function') {
      resolve('');
      return;
    }
    try {
      identity.getAuthToken({ interactive: false }, (token) => {
        const err = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
        if (err || !token) resolve('');
        else resolve(String(token));
      });
    } catch (e) {
      resolve('');
    }
  });
}

// The address a token belongs to, from the Gmail profile (gmail.compose is
// on the grant). A 401 here is this probe's answer: the token is kept.
async function accountOfToken(token) {
  const hit = seenAccounts.get(token);
  if (hit && Date.now() - hit.at < SEEN_MS) return hit.email;
  let email = '';
  try {
    const res = await fetch(laneUrl('https://gmail.googleapis.com/gmail/v1/users/me/profile'), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      email = Account().emailOfProfile(json);
    }
  } catch (e) { email = ''; }
  if (email) seenAccounts.set(token, { email: email, at: Date.now() });
  return email;
}

async function readConnectedAccount() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return '';
    const bag = await chrome.storage.local.get(CONNECTED_ACCOUNT_KEY);
    const rec = bag && bag[CONNECTED_ACCOUNT_KEY];
    return rec && typeof rec.email === 'string' ? Account().norm(rec.email) : '';
  } catch (e) {
    return '';
  }
}

// Called when the person connects in Glance (an interactive Connect or the
// one consent window) and when an older install is adopted on its first write.
async function recordConnectedAccount(token, source) {
  if (!token) return '';
  const email = await accountOfToken(token);
  if (!email) return '';
  try {
    await chrome.storage.local.set({ [CONNECTED_ACCOUNT_KEY]: { email: email, source: source || null, at: Date.now() } });
  } catch (e) { /* the write below still checks the account */ }
  return email;
}

async function consentRevokedBlocksLane() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return false;
    const bag = await chrome.storage.local.get([RECONNECT_KEY, EVER_KEY, 'googleTasksAuth', 'googleWebAuth', 'glanceLaneUndo']);
    const flag = bag && bag[RECONNECT_KEY];
    if (!flag || !flag.needed || !priorGoogleRecord(bag)) return false;
    const r = String(flag.reason || '');
    return r === 'revoked' || r === '401' || r === 'not signed in' || r === 'missing scope';
  } catch (e) {
    return false;
  }
}

async function laneCredential(tab) {
  if (await consentRevokedBlocksLane()) {
    const connected = await readConnectedAccount();
    const want = Account().norm(tab) || connected;
    return { ok: false, reason: 'no-token', connected: connected, tab: want, found: [], consentRevoked: true };
  }
  const A = Account();
  const connected = await readConnectedAccount();
  const stored = await storedConnectToken();
  const chromeToken = await identityToken();
  const candidates = [];
  if (stored) candidates.push({ token: stored, source: 'web' });
  if (chromeToken && chromeToken !== stored) candidates.push({ token: chromeToken, source: 'chrome' });
  for (let i = 0; i < candidates.length; i++) candidates[i].email = await accountOfToken(candidates[i].token);
  const picked = A.choose(connected, candidates, tab);
  if (picked.ok && picked.adopt) await recordConnectedAccount(picked.token, picked.source);
  laneSource = picked.ok ? picked.source : 'web';
  return picked;
}

globalThis.FlowGoogleLaneAccount = {
  read: readConnectedAccount,
  accountOf: accountOfToken,
  record: recordConnectedAccount,
  ensureGlanceList: ensureGlanceList,
  forget: () => seenAccounts.clear()
};

function statusLanguage() {
  const code = String(uiLanguage() || '').trim().toLowerCase().replace(/_/g, '-');
  return (code === 'he' || code.indexOf('he-') === 0) ? 'he' : 'en';
}

const EVER_KEY = 'googleEverConnected';

function reconnectWords() {
  return statusLanguage() === 'he' ? RECONNECT_LABEL : 'Reconnect Google';
}

function connectWords() {
  return statusLanguage() === 'he' ? 'התחבר ל-Google' : 'Connect Google';
}

function everConnectedRecord(value) {
  return value === true || !!(value && value.connected);
}

function priorGoogleRecord(bag) {
  if (!bag) return false;
  if (everConnectedRecord(bag[EVER_KEY]) || everConnectedRecord(bag.everConnected)) return true;
  if (bag.googleTasksAuth || bag.tasksAuth) return true;
  const web = bag.googleWebAuth || bag.webAuth;
  if (web && (web.accessToken || web.refreshToken)) return true;
  const undo = bag.glanceLaneUndo || bag.laneUndo;
  if (undo && typeof undo === 'object') {
    const keys = Object.keys(undo);
    for (let i = 0; i < keys.length; i++) {
      const row = undo[keys[i]];
      if (row && Array.isArray(row.steps) && row.steps.length) return true;
    }
  }
  return false;
}

function laneGoogleStatus(auth, reconnect, token, ever, extras) {
  const had = Boolean(auth);
  const extra = extras || {};
  const previous = had || everConnectedRecord(ever) || priorGoogleRecord(extra);
  const usable = typeof token === 'string' && token.length > 0;
  const flagged = Boolean(reconnect && reconnect.needed);
  const connected = had && usable && !flagged;
  const needs = previous && !connected;
  const label = reconnectWords();
  return {
    connected: connected,
    needsReconnect: needs,
    reconnectLabel: needs ? label : '',
    label: connected ? 'Connected' : (needs ? label : connectWords())
  };
}

function noteGoogleAuthFailure(reason, account) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return Promise.resolve();
  return Promise.resolve()
    .then(() => chrome.storage.local.get([EVER_KEY, 'googleTasksAuth', 'googleWebAuth', 'glanceLaneUndo']))
    .then((bag) => {
      if (!priorGoogleRecord(bag)) return null;
      const ever = bag && everConnectedRecord(bag[EVER_KEY]);
      const flag = { needed: true, reason: String(reason || 'auth') };
      if (account) flag.account = String(account);
      const patch = { [RECONNECT_KEY]: flag };
      if (!ever) patch[EVER_KEY] = { connected: true };
      return chrome.storage.local.set(patch);
    })
    .catch(() => {});
}

function retryLane(cred) {
  const bridge = typeof globalThis !== 'undefined' ? globalThis.FlowGoogleAccess : null;
  if (!bridge || typeof bridge.retry !== 'function') return Promise.resolve(null);
  return Promise.resolve().then(() => bridge.retry(cred)).catch(() => null);
}

// A later 2xx does not clear googleReconnect. Only Connect, which stores a
// new token, removes the flag.
function criticalUrl(url) {
  const C = typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : globalThis.FlowGoogleConfig;
  return !!(C && typeof C.isCriticalUrl === 'function' && C.isCriticalUrl(url));
}

// A 401 or 403 from an API a card does not write to is that API's answer.
// It does not say the token is wrong, so it neither flags Reconnect nor
// triggers a refresh. Only the Tasks, Calendar, Drive, Docs, Sheets and
// Gmail hosts can end the grant.
function settleAuth(res, url) {
  if (!res) return Promise.resolve(res);
  if (url && !criticalUrl(url)) return Promise.resolve(res);
  if (res.status === 401 || res.status === 403) {
    const reason = res.status === 403 ? 'missing scope' : '401';
    return noteGoogleAuthFailure(reason).then(() => res);
  }
  return Promise.resolve(res);
}

function laneUrl(url) {
  const e2e = typeof globalThis !== 'undefined' ? globalThis.__glanceE2e : null;
  const origin = e2e && typeof e2e.httpOrigin === 'string' ? e2e.httpOrigin : '';
  if (!origin || !url) return url;
  try {
    const u = new URL(url);
    const base = new URL(origin);
    return base.origin + u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

// One undo generation. A verify GET that does not answer in 8 seconds marks
// the generation dead and aborts the read. Trash and delete run only when
// that same generation is still the live one and the read confirmed it.
const VERIFY_MS = 8000;
let undoGate = null;

function beginUndo() {
  undoGate = { id: (undoGate ? undoGate.id : 0) + 1, dead: false, confirmed: false };
  return undoGate;
}

function endUndo(gate) {
  if (!gate) return;
  gate.dead = true;
  gate.confirmed = false;
  if (undoGate === gate) undoGate = null;
}

function bodyText(body) {
  return typeof body === 'string' ? body : '';
}

function isTrashOrDelete(method, url, body) {
  const raw = bodyText(body);
  if (method === 'DELETE') return true;
  if (method === 'PATCH' && raw.indexOf('"trashed":true') >= 0) return true;
  if (method === 'POST' && (url.indexOf(':clear') >= 0 || url.indexOf(':batchUpdate') >= 0)) return true;
  return false;
}

function trashBlocked(gate) {
  return !gate || gate.dead || !gate.confirmed || undoGate !== gate;
}

function readBody(res) {
  return res.text().then((text) => {
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch (e) { json = null; }
    }
    return { status: res.status, ok: res.ok, json: json };
  });
}

// The confirming GET for Drive, Docs, and Sheets Undo. The timer and the
// abort settle the read. A body that arrives after that must not arm trash.
function verifyGet(gate, exec) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let settled = false;
  let timer = null;
  return new Promise((resolve) => {
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      resolve(result);
    };
    Promise.resolve()
      .then(() => exec(ctl ? ctl.signal : null))
      .then((result) => {
        if (settled || gate.dead || undoGate !== gate) {
          finish({ status: 0, ok: false, json: null });
          return;
        }
        gate.confirmed = !!(result && result.ok);
        finish(result);
      })
      .catch(() => {
        finish({ status: 0, ok: false, json: null });
      });
    timer = setTimeout(() => {
      gate.dead = true;
      gate.confirmed = false;
      if (ctl) {
        try { ctl.abort(); } catch (e) { /* already aborted */ }
      }
      finish({ status: 0, ok: false, json: null });
    }, VERIFY_MS);
  });
}

// The Gmail tab of the message being handled: every Google call inside it
// picks its token by that account, not by the one recorded at Connect.
let activeTab = '';

function laneHttp(req) {
  const request = req || {};
  const method = request.method || 'GET';
  const url = laneUrl(request.url);
  const gate = undoGate;
  return Promise.resolve()
    .then(() => laneCredential(request.tab || activeTab))
    .then((picked) => {
      if (!picked.ok && picked.reason !== 'no-token') return { status: 0, ok: false, json: null, account: picked };
      const token = picked.ok ? picked.token : '';
      const cred = token ? { token: token, source: picked.source } : null;
      if (!token) return noteGoogleAuthFailure('not signed in').then(() => ({ status: 401, ok: false, json: null }));
      const trashGate = gate && isTrashOrDelete(method, url, request.body) && trashBlocked(gate) && !request.unverifiedUndo;
      if (trashGate) {
        return { status: 0, ok: false, json: null };
      }
      const send = (signal) => {
        if (gate && isTrashOrDelete(method, url, request.body) && trashBlocked(gate) && !request.unverifiedUndo) {
          return Promise.resolve({ status: 0, ok: false, json: null });
        }
        const once = (bearer) => {
          const headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + bearer });
          const init = { method: method, headers: headers };
          if (request.body != null) init.body = request.body;
          if (signal) init.signal = signal;
          return fetch(url, init).then(readBody);
        };
        const settle = (res) => settleAuth(res, request.url);
        return once(token).then((res) => {
          if (!res || res.status !== 401 || !criticalUrl(request.url)) return settle(res);
          return retryLane(cred).then((next) => {
            if (next && next.revoked) return settle(res);
            if (!next || !next.token || next.token === token) return once(token).then(settle);
            return accountOfToken(next.token).then((email) => {
              if (!email || !Account().same(email, picked.email)) return once(token).then(settle);
              return once(next.token).then(settle);
            });
          });
        });
      };
      if (gate && method === 'GET') return verifyGet(gate, send);
      return send(null);
    })
    .catch(() => ({ status: 0, ok: false, json: null }));
}

if (Lane && typeof Lane.setHttp === 'function') Lane.setHttp(laneHttp);

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function storedTimeZone() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return '';
    const bag = await chrome.storage.local.get('glanceTimeZone');
    const raw = bag && bag.glanceTimeZone;
    if (typeof raw === 'string') return raw.trim().slice(0, 80);
    if (raw && typeof raw.timeZone === 'string') return raw.timeZone.trim().slice(0, 80);
    return '';
  } catch (e) {
    return '';
  }
}

async function storedTaskListId() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return '';
    const bag = await chrome.storage.local.get('googleTasksAuth');
    const id = bag && bag.googleTasksAuth && bag.googleTasksAuth.taskListId;
    return id ? String(id) : '';
  } catch (e) {
    return '';
  }
}

// The one list Glance writes to is titled Glance. It is looked up by title
// first and made only when the account has none, once: concurrent callers
// share one flight, and a failed read never leads to a create. The title is
// a constant. Nothing derives a list name from the extension id, the
// redirect address, or any page text.
const GLANCE_LIST_TITLE = 'Glance';
let glanceListFlight = null;

async function findListByTitle(base, title) {
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const url = base + '?maxResults=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await laneHttp({ method: 'GET', url: url });
    if (!res || !res.ok || !res.json) return { read: false, id: '' };
    const items = Array.isArray(res.json.items) ? res.json.items : [];
    const hit = items.find((l) => l && l.title === title && l.id);
    if (hit) return { read: true, id: String(hit.id) };
    pageToken = res.json.nextPageToken ? String(res.json.nextPageToken) : '';
    if (!pageToken) break;
  }
  return { read: true, id: '' };
}

function ensureGlanceList() {
  if (!glanceListFlight) {
    glanceListFlight = (async () => {
      const base = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';
      const found = await findListByTitle(base, GLANCE_LIST_TITLE);
      if (!found.read) return '';
      if (found.id) return found.id;
      const made = await laneHttp({
        method: 'POST',
        url: base,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: GLANCE_LIST_TITLE })
      });
      if (made && made.ok && made.json && made.json.id && made.json.title === GLANCE_LIST_TITLE) return String(made.json.id);
      const again = await findListByTitle(base, GLANCE_LIST_TITLE);
      return again.id || '';
    })().finally(() => { glanceListFlight = null; });
  }
  return glanceListFlight;
}

// A stored list id the API no longer knows is replaced by the list titled
// Glance. The answer is saved so the next write starts right.
async function resolveExistingTaskList() {
  const id = await ensureGlanceList();
  if (!id) return '';
  try {
    const bag = await chrome.storage.local.get('googleTasksAuth');
    const prior = bag && bag.googleTasksAuth && typeof bag.googleTasksAuth === 'object' ? bag.googleTasksAuth : {};
    await chrome.storage.local.set({ googleTasksAuth: Object.assign({}, prior, { taskListId: id }) });
  } catch (e) { /* the retry below still uses the id */ }
  return id;
}

// The owner's off switches live in one storage object. A missing key is off.
async function laneSwitchOn(name) {
  try {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    return !!(bag.glanceSwitches && bag.glanceSwitches[name] === true);
  } catch (e) { return false; }
}

// A Hold It for a mail that proposes a video call carries a Google Meet link,
// only when MEET_LINK is on (default off). The link is read back by id; with no
// link the event is deleted again. No attendee is added, so nobody is invited.
async function meetWanted(connectorId, msgInput) {
  const M = globalThis.FlowMeetLink;
  if (connectorId !== 'googleHold' || !M || typeof M.callAsked !== 'function') return false;
  const text = msgInput && msgInput.params && msgInput.params.callText;
  if (!text || !M.callAsked(text)) return false;
  return laneSwitchOn(M.SWITCH);
}

// A Hold It for "every Tuesday at 10:00" creates the repeating series, only when RECURRING_HOLD
// is on (default off) and the hold's own date is an occurrence of the one rule the mail states.
async function seriesWanted(connectorId, msgInput, first) {
  const R = globalThis.FlowRecurringReminder;
  if (connectorId !== 'googleHold' || !R || typeof R.seriesFor !== 'function') return '';
  const text = msgInput && msgInput.params && msgInput.params.callText;
  if (!text) return '';
  const rule = R.seriesFor(text, first && first.dateIso);
  if (!rule) return '';
  return (await laneSwitchOn(R.HOLD_SWITCH)) ? rule : '';
}

async function writeWithListRecovery(connectorId, msgInput, cred) {
  const first = await prepareWrite(connectorId, msgInput, cred);
  const rule = await seriesWanted(connectorId, msgInput, first);
  const meet = await meetWanted(connectorId, msgInput);
  if (rule || meet) {
    const http = rule ? globalThis.FlowRecurringReminder.withRecurrence(laneHttp, rule) : laneHttp;
    const written = meet
      ? await globalThis.FlowMeetLink.holdWithMeet(first, http, undefined, globalThis.FlowGoogleCalendar)
      : await globalThis.FlowGoogleCalendar.write(first, http);
    return rule ? globalThis.FlowRecurringReminder.confirmSeries(written, rule, laneHttp) : written;
  }
  const result = await Lane.write(connectorId, first);
  const given = msgInput && (msgInput.taskListId || (msgInput.params && msgInput.params.taskListId));
  if (connectorId !== 'googleLaneTask' || !result || result.reason !== 'list-missing' || given) return result;
  const fresh = await resolveExistingTaskList();
  if (!fresh || fresh === first.taskListId) return result;
  return Lane.write(connectorId, Object.assign({}, first, { taskListId: fresh }));
}


// Both refusals write nothing and keep the Reconnect offer on the card.
// reconnectAccount is the address the Reconnect button asks Google for: the
// account of the Gmail tab, or failing that the recorded one.
function wrongAccountResult(picked, extra, lang) {
  const line = Account().refusalLine(picked, lang || uiLanguage());
  const tab = picked.tab || picked.connected || '';
  const token = picked.found && picked.found[0] ? picked.found[0] : '';
  const wrong = picked.reason === 'wrong-account';
  return noteGoogleAuthFailure(wrong ? 'wrong-account' : 'account-unverified', tab).then(() => Object.assign({
    ok: false,
    reason: wrong ? 'wrong-account' : 'account-unverified',
    why: picked.why || '',
    error: line,
    written: line,
    connected: picked.connected || '',
    tabAccount: tab,
    tokenAccount: token,
    account: token,
    reconnectAccount: tab,
    needsReconnect: true,
    reconnectLabel: reconnectWords(),
    proof: null
  }, extra || {}));
}

// A write goes out only on the verified token of the account the Gmail tab
// shows. The result names that account, so the card can say where it landed.
async function guardedWrite(connectorId, input, ctx) {
  const c = ctx || {};
  activeTab = c.tab || '';
  const picked = await laneCredential(c.tab);
  if (!picked.ok && picked.consentRevoked) {
    return noteGoogleAuthFailure('revoked', picked.tab || picked.connected || '').then(() => ({
      ok: false,
      reason: 'not-connected',
      needsReconnect: true,
      reconnectLabel: reconnectWords(),
      error: statusLanguage() === 'he' ? 'חבר מחדש את Google כדי להמשיך.' : 'Reconnect Google to continue.',
      written: '',
      proof: null
    }));
  }
  if (!picked.ok && picked.reason !== 'no-token') return wrongAccountResult(picked, null, c.lang);
  const result = await writeWithListRecovery(connectorId, input, picked.ok ? picked : null);
  if (result && picked.ok && result.ok !== undefined) result.account = picked.email;
  return result;
}

async function guardedUndo(connectorId, ref, ctx) {
  const c = ctx || {};
  activeTab = c.tab || '';
  const picked = await laneCredential(c.tab);
  if (!picked.ok && picked.consentRevoked) {
    return noteGoogleAuthFailure('revoked', picked.tab || picked.connected || '').then(() => ({
      ok: false,
      reason: 'not-connected',
      needsReconnect: true,
      reconnectLabel: reconnectWords(),
      proof: null
    }));
  }
  if (!picked.ok && picked.reason !== 'no-token') return wrongAccountResult(picked, null, c.lang);
  const prepared = await prepareUndo(connectorId, ref);
  return Lane.undo(connectorId, prepared);
}

function csvRow(csv) {
  const line = String(csv || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
  if (!line) return null;
  const cells = line.split(',').map((c) => c.trim()).filter(Boolean);
  return cells.length ? cells : null;
}

async function prepareWrite(connectorId, input, cred) {
  const i = input || {};
  const params = i.params || {};
  if (connectorId === 'googleLaneTask') {
    return {
      title: i.title || i.label || params.title || params.what || i.subject || '',
      taskListId: i.taskListId || params.taskListId || await storedTaskListId() || await resolveExistingTaskList() || '@default',
      notes: i.notes || '',
      dueIso: params.dateIso || i.dueIso || null
    };
  }
  if (connectorId === 'googleTaskClose') {
    return {
      taskListId: i.taskListId || params.taskListId || await storedTaskListId() || await resolveExistingTaskList() || '@default',
      taskId: i.taskId || params.taskId || i.externalId || '',
      contentHash: i.contentHash || params.contentHash || ''
    };
  }
  if (connectorId === 'googleHold') {
    let zone = String(params.timeZone || i.timeZone || '').trim();
    if (!zone) zone = await storedTimeZone();
    if (!zone) {
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
    }
    return {
      dateIso: params.dateIso || i.dateIso,
      hour: params.hour != null ? params.hour : i.hour,
      minute: params.minute != null ? params.minute : i.minute,
      durationMinutes: params.durationMinutes != null ? params.durationMinutes : i.durationMinutes,
      fileName: params.fileName || params.fileTerm || i.fileName || '',
      fileUrl: params.fileUrl || params.shareUrl || i.fileUrl || '',
      fileTerm: params.fileTerm || i.fileTerm || '',
      title: params.title || i.title || i.label || '',
      quote: params.quote || i.quote || '',
      timeZone: zone,
      expectAccount: cred && cred.email ? cred.email : ''
    };
  }
  if (connectorId === 'googleRecurringReminder') {
    const R = globalThis.FlowRecurringReminder;
    let zone = String(params.timeZone || i.timeZone || '').trim();
    if (!zone) zone = await storedTimeZone();
    if (!zone) {
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
    }
    return {
      flags: R ? { [R.SWITCH]: await laneSwitchOn(R.SWITCH) } : {},
      title: params.title || i.title || '',
      rrule: params.rrule || i.rrule || '',
      when: params.when || i.when || null,
      timeZone: zone,
      expectAccount: cred && cred.email ? cred.email : '',
      now: new Date().toISOString()
    };
  }
  if (connectorId === 'googleEventCallLink') {
    const E = globalThis.FlowEventCallLink;
    return {
      flags: E ? { [E.SWITCH]: await laneSwitchOn(E.SWITCH) } : {},
      event: params.event || i.event || null,
      now: new Date().toISOString()
    };
  }
  if (connectorId === 'googleNewFile') {
    const W = globalThis.FlowWorkspaceFile;
    return {
      flags: W ? { [W.SWITCH]: await laneSwitchOn(W.SWITCH) } : {},
      fileKind: params.fileKind || i.fileKind || '',
      name: params.name || i.name || '',
      now: new Date().toISOString()
    };
  }
  if (connectorId === 'googleDriveSave') return i;
  if (connectorId === 'googleDoc' || connectorId === 'googleDocFull') {
    const text = params.text || i.text || plainText(params.html || i.html || '');
    const documentId = i.documentId || params.documentId || '';
    return {
      title: params.title || i.title || 'Note',
      name: params.title || i.title || 'Note',
      text: text,
      documentId: documentId,
      origin: documentId ? (i.origin || params.origin || 'picked') : 'created'
    };
  }
  if (connectorId === 'googleSheetAppend') {
    const spreadsheetId = i.spreadsheetId || params.spreadsheetId || '';
    return {
      name: params.title || i.title || 'Sheet',
      row: params.row || i.row || csvRow(params.csv || i.csv),
      spreadsheetId: spreadsheetId,
      origin: spreadsheetId ? (i.origin || params.origin || 'picked') : 'created'
    };
  }
  return i;
}

async function prepareUndo(connectorId, ref) {
  if (connectorId !== 'googleLaneTask' && connectorId !== 'googleTaskClose') return ref;
  const next = ref && typeof ref === 'object' ? Object.assign({}, ref) : { externalId: ref };
  if (!next.taskListId && !next.listId) {
    const id = await storedTaskListId();
    if (id) next.taskListId = id;
  }
  return next;
}

function unconfirmedRefusal(lang) {
  const code = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  if (code === 'he' || code.indexOf('he-') === 0) {
    return 'לא הצלחתי לאמת שלא השתנה — השארתי אותו כמו שהוא';
  }
  return "Couldn't confirm it's unchanged. Undo left it alone.";
}

function uiLanguage() {
  try {
    const i18n = typeof chrome !== 'undefined' && chrome.i18n;
    if (i18n && typeof i18n.getUILanguage === 'function') {
      const lang = i18n.getUILanguage();
      if (lang) return lang;
    }
  } catch (e) { /* fall through to the browser locale */ }
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  } catch (e) { /* English */ }
  return 'en';
}

function calendarRefusal(lang) {
  const code = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  if (code === 'he' || code.indexOf('he-') === 0) return 'אין מועד אחד לאירוע הזה.';
  return 'No single time for this event.';
}

function editedRefusal(lang) {
  const code = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  if (code === 'he' || code.indexOf('he-') === 0) return 'שינית את זה. Undo השאיר אותו כמו שהוא.';
  return '';
}

function localizeUndo(result) {
  if (!result || result.ok !== false) return result;
  if (result.reason === 'unconfirmed') {
    const line = unconfirmedRefusal(uiLanguage());
    return Object.assign({}, result, { error: line, written: line });
  }
  if (result.reason === 'user-edited' || result.reason === 'range-edited') {
    const line = editedRefusal(uiLanguage());
    if (line) return Object.assign({}, result, { error: line, written: line });
  }
  if (result.reason === 'unclear' && /time for this event|file and time/i.test(result.error || '')) {
    const line = calendarRefusal(uiLanguage());
    return Object.assign({}, result, { error: line });
  }
  return result;
}

function decorate(result) {
  const value = localizeUndo(result);
  if (!value || value.ok !== false || value.reason !== 'not-connected') return Promise.resolve(value);
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return Promise.resolve(value);
  return Promise.resolve()
    .then(() => chrome.storage.local.get(RECONNECT_KEY))
    .then((bag) => {
      const flag = bag && bag[RECONNECT_KEY];
      if (!flag || flag.needed !== true) return value;
      return Object.assign({}, value, { needsReconnect: true, reconnectLabel: reconnectWords() });
    })
    .catch(() => value);
}

// Gmail answers an attachment link with a redirect to a Google content host.
// The page cannot follow it across origins. The worker holds the host
// permission and follows it, with the account's own cookies. Only a Google
// host is fetched. The bytes go back to the page and nowhere else.
const ATTACH_FETCH_MAX = 8 * 1024 * 1024;

function trustedAttachmentHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    return h === 'google.com' || h.endsWith('.google.com') || h === 'googleusercontent.com' || h.endsWith('.googleusercontent.com');
  } catch (e) {
    return false;
  }
}

function bytesToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fetchAttachment(msg) {
  const url = String((msg && msg.url) || '');
  if (!trustedAttachmentHost(url)) return { ok: false, reason: 'untrusted' };
  const cap = Math.min(Number(msg.maxBytes) || ATTACH_FETCH_MAX, ATTACH_FETCH_MAX);
  try {
    const res = await fetch(laneUrl(url), { credentials: 'include', redirect: 'follow' });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // A signed-out session answers with a sign-in page, not the file.
    if (type === 'text/html' && String(msg.expectMime || '').toLowerCase() !== 'text/html') return { ok: false, reason: 'not-a-file' };
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > cap) return { ok: false, reason: 'too-big' };
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return { ok: false, reason: 'empty' };
    if (buf.byteLength > cap) return { ok: false, reason: 'too-big' };
    return { ok: true, base64: bytesToBase64(buf), mimeType: (res.headers.get('content-type') || '').split(';')[0].trim() };
  } catch (e) {
    return { ok: false, reason: 'unavailable' };
  }
}

// Reopening a mail repaints its receipt from storage. Before a checkmark
// shows, every stored id is read from Google with the connected account's
// token. present: the API returned it. missing: 404/410, cancelled, deleted
// or trashed. unknown: no answer or no verified token, which is never a tick.
function verifyUrlFor(connectorId, ref) {
  const r = ref || {};
  const enc = encodeURIComponent;
  if (connectorId === 'googleHold' || connectorId === 'googleEventCallLink' || connectorId === 'googleRecurringReminder') {
    const id = r.eventId || r.externalId;
    return id ? 'https://www.googleapis.com/calendar/v3/calendars/' + enc(r.calendarId || 'primary') + '/events/' + enc(id) : '';
  }
  if (connectorId === 'googleLaneTask' || connectorId === 'googleTaskClose') {
    const id = r.taskId || r.externalId;
    return id && r.taskListId ? 'https://tasks.googleapis.com/tasks/v1/lists/' + enc(r.taskListId) + '/tasks/' + enc(id) : '';
  }
  if (connectorId === 'gmailCompose' || connectorId === 'googleReplyDraft') {
    const id = r.draftId;
    return id ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/' + enc(id) + '?format=minimal' : '';
  }
  const fileId = r.fileId || r.documentId || r.spreadsheetId;
  if (fileId && /^google(DriveSave|Doc|SheetAppend|NewFile)$/.test(connectorId)) {
    return 'https://www.googleapis.com/drive/v3/files/' + enc(fileId) + '?fields=' + enc('id,trashed');
  }
  if (connectorId === 'googleDocFull' && fileId) {
    return 'https://www.googleapis.com/drive/v3/files/' + enc(fileId) + '?fields=' + enc('id,trashed');
  }
  return '';
}

async function verifyStep(step) {
  const url = verifyUrlFor(step && step.connectorId, step && step.ref);
  if (!url) return 'unknown';
  const res = await laneHttp({ method: 'GET', url: url });
  if (!res) return 'unknown';
  if (res.status === 404 || res.status === 410) return 'missing';
  if (!res.ok || !res.json) return 'unknown';
  const j = res.json;
  if (j.status === 'cancelled' || j.deleted === true || j.trashed === true) return 'missing';
  return j.id ? 'present' : 'unknown';
}

async function verifySteps(steps, tab) {
  activeTab = tab || '';
  const picked = await laneCredential(tab);
  if (!picked.ok) return { ok: false, reason: picked.reason === 'no-token' ? 'unverified' : 'unverified', states: [] };
  const states = [];
  for (let i = 0; i < (steps || []).length; i++) {
    try { states.push(await verifyStep(steps[i])); } catch (e) { states.push('unknown'); }
  }
  return { ok: true, account: picked.email, states: states };
}

function onLaneMessage(msg, sender, sendResponse) {
  activeTab = msg && typeof msg.tabAccount === 'string' ? msg.tabAccount : '';
  if (msg && msg.type === 'flow:fetch-attachment') {
    fetchAttachment(msg).then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }));
    return true;
  }
  if (!msg || !Lane) return undefined;
  if (msg.type === 'flow:google-write') {
    Promise.resolve(guardedWrite(msg.connectorId, msg.input, { tab: msg.tabAccount, lang: msg.lang }))
      .then((result) => decorate(result))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }));
    return true;
  }
  if (msg.type === 'flow:google-event-link-plan') {
    // The page asks; the worker owns the switch and reads the calendar (the lane's own account check
    // applies). Off, unreadable or no single event that fits: the page shows nothing.
    const E = globalThis.FlowEventCallLink;
    Promise.resolve((async () => {
      if (!E || typeof E.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
      if (!(await laneSwitchOn(E.SWITCH))) return { action: 'off', reason: 'switch-off' };
      const text = String(msg.text || '').slice(0, 4000);
      // Nothing is read from the calendar unless the mail asks for a call link at all.
      if (E.recognize(text, Date.now()).kind !== 'clear') return { action: 'silence', reason: 'no-ask' };
      const from = new Date();
      const to = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
      const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=100&timeMin=' + encodeURIComponent(from.toISOString()) + '&timeMax=' + encodeURIComponent(to.toISOString());
      const listed = await laneHttp({ method: 'GET', url: url });
      if (!listed || !listed.ok || !listed.json || !Array.isArray(listed.json.items)) return { action: 'silence', reason: 'not-searched' };
      return E.plan({ flags: { [E.SWITCH]: true }, text: text, events: listed.json.items, now: from });
    })()).then(sendResponse, () => sendResponse({ action: 'silence', reason: 'error' }));
    return true;
  }
  if (msg.type === 'flow:google-recurring-plan') {
    // The page asks; the worker owns the switch. Off or silent: the page shows nothing.
    const R = globalThis.FlowRecurringReminder;
    Promise.resolve((async () => {
      if (!R || typeof R.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
      if (!(await laneSwitchOn(R.SWITCH))) return { action: 'off', reason: 'switch-off' };
      return R.plan({ flags: { [R.SWITCH]: true }, text: String(msg.text || '').slice(0, 4000), todayIso: new Date().toISOString().slice(0, 10) });
    })()).then(sendResponse, () => sendResponse({ action: 'silence', reason: 'error' }));
    return true;
  }
  if (msg.type === 'flow:google-contacts-plan') {
    const G = globalThis.FlowGoogleContacts;
    Promise.resolve((async () => {
      if (!G || typeof G.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
      if (!(await laneSwitchOn(G.SWITCH))) return { action: 'off', reason: 'switch-off' };
      const bag = await chrome.storage.local.get(['googleGrantedScopes', 'glanceUserContext']);
      const grantedRec = bag.googleGrantedScopes;
      const grantedScopes = grantedRec && typeof grantedRec.version === 'string'
        ? grantedRec.version.split('\n').filter(Boolean)
        : null;
      const profile = bag.glanceUserContext && typeof bag.glanceUserContext === 'object' ? bag.glanceUserContext : {};
      const text = String(msg.text || '').slice(0, 4000);
      const choiceIndex = typeof msg.choiceIndex === 'number' ? msg.choiceIndex : undefined;
      return G.plan(
        { flags: { [G.SWITCH]: true }, text: text, choiceIndex: choiceIndex },
        { http: laneHttp, grantedScopes: grantedScopes, profile: profile, flags: { [G.SWITCH]: true } }
      );
    })()).then(sendResponse, () => sendResponse({ action: 'silence', reason: 'error' }));
    return true;
  }
  if (msg.type === 'flow:google-new-file-plan') {
    // The page asks; the worker owns the switch. Off or silent: the page shows nothing.
    const W = globalThis.FlowWorkspaceFile;
    Promise.resolve((async () => {
      if (!W || typeof W.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
      if (!(await laneSwitchOn(W.SWITCH))) return { action: 'off', reason: 'switch-off' };
      return W.plan({ flags: { [W.SWITCH]: true }, text: String(msg.text || '').slice(0, 4000) });
    })()).then(sendResponse, () => sendResponse({ action: 'silence', reason: 'error' }));
    return true;
  }
  if (msg.type === 'flow:google-full-document-plan') {
    const F = globalThis.FlowFullDocumentClose;
    Promise.resolve((async () => {
      if (!F || typeof F.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
      if (!(await laneSwitchOn(F.SWITCH))) return { action: 'off', reason: 'switch-off' };
      return F.plan({
        flags: { [F.SWITCH]: true },
        text: String(msg.text || '').slice(0, 8000),
        lang: msg.lang === 'he' ? 'he' : 'en',
        styleSummary: msg.styleSummary || null,
        companyTemplate: msg.companyTemplate || null,
        template: msg.companyTemplate || msg.template || null
      });
    })()).then(sendResponse, () => sendResponse({ action: 'silence', reason: 'error' }));
    return true;
  }
  if (msg.type === 'flow:google-verify') {
    Promise.resolve(verifySteps(Array.isArray(msg.steps) ? msg.steps.slice(0, 8) : [], msg.tabAccount))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unverified', states: [] }));
    return true;
  }
  if (msg.type === 'flow:google-undo') {
    const gate = beginUndo();
    Promise.resolve(guardedUndo(msg.connectorId, msg.ref, { tab: msg.tabAccount, lang: msg.lang }))
      .then((result) => decorate(result))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }))
      .finally(() => endUndo(gate));
    return true;
  }
  if (msg.type === 'flow:gmail-compose') {
    const Compose = typeof FlowGoogleCompose !== 'undefined' ? FlowGoogleCompose : globalThis.FlowGoogleCompose;
    const input = msg.input || msg.payload || {};
    if (!Compose || typeof Compose.fill !== 'function') {
      sendResponse({ ok: false, reason: 'unavailable', preview: true, closes: false, sent: false });
      return true;
    }
    sendResponse(Compose.fill(input, input.state || { to: '', subject: '', body: '', sendClicks: 0 }));
    return true;
  }
  return undefined;
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
  chrome.runtime.onMessage.addListener(onLaneMessage);
}
