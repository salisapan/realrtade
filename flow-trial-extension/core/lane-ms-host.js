// Service-worker entry for the Microsoft Graph lane. One background import.
// This file registers its own listener for this lane's message types. It does
// not replace getManifest, content-script registration, or addListener, and it
// does not change the default startup. The import declarations are below the
// export line: the classic corpus harness keeps everything up to that line and
// drops the rest, and a module service worker still loads them. import() is
// not available there.
const FlowLaneMsHost = true;

const LANE_IDS = {
  outlookContacts: 'FlowOutlookContacts',
  outlookWord: 'FlowOutlookWord',
  outlookExcel: 'FlowOutlookExcel',
  teamsChat: 'FlowTeamsChat',
  outlookSend: 'FlowOutlookSend'
};

function laneModule(id) {
  const key = LANE_IDS[id];
  return key ? globalThis[key] : null;
}

function forbiddenSend(path) {
  return /\/(send|reply|replyAll|forward|sendMail)(\b|$)/i.test(path);
}

async function graphCall(access, req) {
  const method = String((req && req.method) || 'GET').toUpperCase();
  const path = String((req && req.path) || '');
  const pathOnly = path.split('?')[0];
  if (path.indexOf('/me/') !== 0 || pathOnly.indexOf('..') >= 0) {
    return { ok: false, status: 0, reason: 'bad-path' };
  }
  const sendMail = method === 'POST' && (pathOnly === '/me/sendMail');
  if (forbiddenSend(pathOnly) && !(req && req.allowSend === true && sendMail)) {
    return { ok: false, status: 0, reason: 'FORBIDDEN_SEND' };
  }
  if (!access) return { ok: false, status: 0, reason: 'not-connected' };
  const headers = { Authorization: 'Bearer ' + access };
  if (req && req.headers) {
    Object.keys(req.headers).forEach((key) => { headers[key] = req.headers[key]; });
  }
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req && req.raw) {
      headers['Content-Type'] = req.contentType || 'application/octet-stream';
      body = req.raw;
    } else if (req && req.body != null) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }
  let res;
  try {
    res = await fetch('https://graph.microsoft.com/v1.0' + path, { method: method, headers: headers, body: body });
  } catch (e) {
    return { ok: false, status: 0, reason: 'network' };
  }
  const status = res.status;
  if (status === 204 || status === 205 || status === 202) {
    return { ok: status >= 200 && status < 300, status: status, body: null };
  }
  let parsed = null;
  try {
    const text = await res.text();
    if (text) {
      try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
    }
  } catch (e) {
    parsed = null;
  }
  return {
    ok: status >= 200 && status < 300,
    status: status,
    body: parsed,
    reason: status >= 200 && status < 300 ? '' : 'http-' + status
  };
}

async function makeDeps() {
  let bag = {};
  try { bag = await globalThis.chrome.storage.local.get('outlookAuth'); } catch (e) { bag = {}; }
  const token = bag && bag.outlookAuth && bag.outlookAuth.token;
  const access = token && token.accessToken ? String(token.accessToken) : '';
  const scopes = token ? (token.grantedScopes || token.scopes || token.scope || null) : null;
  return {
    grantedScopes: scopes,
    now: function () { return new Date().toISOString(); },
    call: function (req) { return graphCall(access, req || {}); }
  };
}

function laneId(msg) {
  if (!msg) return '';
  if (msg.type === 'flow:execute-action') {
    const id = msg.payload && msg.payload.connectorId;
    return LANE_IDS[id] ? id : '';
  }
  if (msg.type === 'flow:undo-action') return LANE_IDS[msg.connectorId] ? msg.connectorId : '';
  return '';
}

async function dispatch(msg) {
  const id = laneId(msg);
  const mod = laneModule(id);
  if (!mod) return { ok: false, reason: 'connector-not-live' };
  const deps = await makeDeps();
  if (msg.type === 'flow:undo-action') {
    if (typeof mod.undo !== 'function') return { ok: false, reason: 'no-undo' };
    return mod.undo(msg.ref || {}, deps);
  }
  const payload = msg.payload || {};
  const params = payload.params || {};
  return mod.run({
    params: params,
    name: params.name,
    fileName: params.fileName,
    text: typeof payload.text === 'string' ? payload.text : '',
    messageId: payload.messageId || '',
    explicitClick: payload.explicitClick === true
  }, deps);
}

function laneListener(msg, sender, sendResponse) {
  if (!laneId(msg)) return;
  dispatch(msg).then(function (result) {
    sendResponse(result);
  }, function () {
    sendResponse({ ok: false, reason: 'lane-failed' });
  });
  return true;
}

function laneInstall() {
  const runtime = globalThis.chrome && globalThis.chrome.runtime;
  const onMessage = runtime && runtime.onMessage;
  if (!onMessage || typeof onMessage.addListener !== 'function') return;
  onMessage.addListener(laneListener);
}

laneInstall();

if (typeof module !== 'undefined') module.exports = { FlowLaneMsHost };
import './outlook-contacts.js';
import './outlook-word.js';
import './outlook-excel.js';
import './teams-chat.js';
import './outlook-send.js';
