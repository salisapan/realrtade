// Lane host for the service worker. background.js imports this once.
// Loading it registers the lane messages and stores a fetch function.
// It does not call chrome.identity or fetch until a message arrives.
import '../core/google-config.js';
import '../core/google-calendar.js';
import '../core/google-tasks.js';
import '../core/google-drive.js';
import '../core/google-docs.js';
import '../core/google-sheets.js';
import '../core/google-contacts.js';
import '../core/google-compose.js';
import '../core/google-proof.js';
import './google-lane.js';

const Lane = typeof FlowGoogleLane !== 'undefined' ? FlowGoogleLane : globalThis.FlowGoogleLane;

const RECONNECT_KEY = 'googleReconnect';
const RECONNECT_LABEL = 'התחבר מחדש ל-Google';
let laneSource = 'chrome';

// Identity first, then the stored Connect token. Interactive stays false.
// The stored record is googleWebAuth. No e2e hook is required.
function laneToken() {
  const WEB_SKEW_MS = 60 * 1000;
  function usable(record) {
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
        const ready = usable(record);
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
  return identityToken().then((token) => {
    if (token) {
      laneSource = 'chrome';
      return token;
    }
    laneSource = 'web';
    return storedConnectToken();
  });
}

function laneGoogleStatus(auth, reconnect, token) {
  const had = Boolean(auth);
  const usable = typeof token === 'string' && token.length > 0;
  const needs = had && Boolean(reconnect && reconnect.needed);
  const connected = had && usable && !needs;
  return {
    connected: connected,
    needsReconnect: needs,
    reconnectLabel: needs ? RECONNECT_LABEL : '',
    label: connected ? 'Connected' : (needs ? RECONNECT_LABEL : '')
  };
}

function hadGoogleGrant() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return Promise.resolve(false);
  return Promise.resolve()
    .then(() => chrome.storage.local.get('googleTasksAuth'))
    .then((bag) => Boolean(bag && bag.googleTasksAuth))
    .catch(() => false);
}

function noteGoogleAuthFailure(reason) {
  return hadGoogleGrant().then((had) => {
    if (!had || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    return chrome.storage.local.set({
      [RECONNECT_KEY]: { needed: true, reason: String(reason || 'auth') }
    });
  }).catch(() => {});
}

function noteGoogleAuthOk() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.remove !== 'function') {
    return Promise.resolve();
  }
  return Promise.resolve()
    .then(() => chrome.storage.local.remove(RECONNECT_KEY))
    .catch(() => {});
}

function retryLane(cred) {
  const bridge = typeof globalThis !== 'undefined' ? globalThis.FlowGoogleAccess : null;
  if (!bridge || typeof bridge.retry !== 'function') return Promise.resolve(null);
  return Promise.resolve().then(() => bridge.retry(cred)).catch(() => null);
}

function settleAuth(res) {
  if (!res) return Promise.resolve(res);
  if (res.status === 401 || res.status === 403) {
    const reason = res.status === 403 ? 'missing scope' : '401';
    return noteGoogleAuthFailure(reason).then(() => res);
  }
  if (res.ok) return noteGoogleAuthOk().then(() => res);
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

function laneHttp(req) {
  const request = req || {};
  const method = request.method || 'GET';
  const url = laneUrl(request.url);
  const gate = undoGate;
  return Promise.resolve()
    .then(() => laneToken())
    .then((token) => {
      const cred = token ? { token: token, source: laneSource } : null;
      if (!token) return noteGoogleAuthFailure('not signed in').then(() => ({ status: 401, ok: false, json: null }));
      if (gate && isTrashOrDelete(method, url, request.body) && trashBlocked(gate)) {
        return { status: 0, ok: false, json: null };
      }
      const send = (signal) => {
        if (gate && isTrashOrDelete(method, url, request.body) && trashBlocked(gate)) {
          return Promise.resolve({ status: 0, ok: false, json: null });
        }
        const once = (bearer) => {
          const headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + bearer });
          const init = { method: method, headers: headers };
          if (request.body != null) init.body = request.body;
          if (signal) init.signal = signal;
          return fetch(url, init).then(readBody);
        };
        return once(token).then((res) => {
          if (!res || res.status !== 401) return settleAuth(res);
          return retryLane(cred).then((next) => {
            if (!next || !next.token || next.token === token) return settleAuth(res);
            return once(next.token).then(settleAuth);
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

function csvRow(csv) {
  const line = String(csv || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
  if (!line) return null;
  const cells = line.split(',').map((c) => c.trim()).filter(Boolean);
  return cells.length ? cells : null;
}

async function prepareWrite(connectorId, input) {
  const i = input || {};
  const params = i.params || {};
  if (connectorId === 'googleLaneTask') {
    return {
      title: i.title || i.label || params.title || params.what || i.subject || '',
      taskListId: i.taskListId || params.taskListId || await storedTaskListId(),
      notes: i.notes || '',
      dueIso: params.dateIso || i.dueIso || null
    };
  }
  if (connectorId === 'googleHold') {
    return {
      dateIso: params.dateIso || i.dateIso,
      hour: params.hour != null ? params.hour : i.hour,
      minute: params.minute != null ? params.minute : i.minute,
      fileName: params.fileName || params.fileTerm || i.fileName || '',
      fileUrl: params.fileUrl || params.shareUrl || i.fileUrl || '',
      quote: params.quote || i.quote || '',
      timeZone: params.timeZone || i.timeZone
    };
  }
  if (connectorId === 'googleDriveSave') return i;
  if (connectorId === 'googleDoc') {
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
  if (connectorId !== 'googleLaneTask') return ref;
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

function localizeUndo(result) {
  if (!result || result.reason !== 'unconfirmed') return result;
  const line = unconfirmedRefusal(uiLanguage());
  return Object.assign({}, result, { error: line, written: line });
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
      return Object.assign({}, value, { needsReconnect: true, reconnectLabel: RECONNECT_LABEL });
    })
    .catch(() => value);
}

function onLaneMessage(msg, sender, sendResponse) {
  if (!msg || !Lane) return undefined;
  if (msg.type === 'flow:google-write') {
    Promise.resolve(prepareWrite(msg.connectorId, msg.input))
      .then((input) => Lane.write(msg.connectorId, input))
      .then((result) => decorate(result))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }));
    return true;
  }
  if (msg.type === 'flow:google-undo') {
    const gate = beginUndo();
    Promise.resolve(prepareUndo(msg.connectorId, msg.ref))
      .then((ref) => Lane.undo(msg.connectorId, ref))
      .then((result) => decorate(result))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }))
      .finally(() => endUndo(gate));
    return true;
  }
  if (msg.type === 'flow:google-contacts') {
    Promise.resolve(Lane.lookupContacts(msg.input || msg))
      .then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' }));
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
