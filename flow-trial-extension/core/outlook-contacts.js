// Read-only recipient resolve by name through /me/contacts and /me/people.
// Contacts.Read comes from outlook-config.js. An unclear or split match stays
// quiet. No network in the portable helpers: pass call(). The binder at the
// bottom runs only in the extension service worker (one background import).
const FlowOutlookContacts = (() => {
  const CONNECTOR = 'outlookContacts';
  const READ_SCOPE = 'Contacts.Read';

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasReadScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === READ_SCOPE || s === 'https://graph.microsoft.com/' + READ_SCOPE);
  }

  function cleanName(name) {
    let s = String(name || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[.,;:!?]+$/g, '').trim();
    if (!s || s.length > 80) return '';
    if (/[\\/]/.test(s) || s.indexOf('..') !== -1) return '';
    return s;
  }

  function searchQuery(name) {
    return encodeURIComponent('"' + String(name).replace(/"/g, '') + '"');
  }

  function contactsPath(name) {
    return '/me/contacts?$search=' + searchQuery(name) + '&$select=id,displayName,emailAddresses&$top=10';
  }

  function peoplePath(name) {
    return '/me/people?$search=' + searchQuery(name) + '&$top=10';
  }

  function addressesFrom(body, key) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const out = [];
    rows.forEach((row) => {
      const list = row && Array.isArray(row[key]) ? row[key] : [];
      list.forEach((item) => {
        const address = item && item.address ? String(item.address).trim() : '';
        if (!address || address.indexOf('@') < 0) return;
        out.push({
          displayName: (row.displayName && String(row.displayName).trim()) || '',
          address: address
        });
      });
    });
    return out;
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    const m = text.match(/\b(?:look up|lookup|find|resolve)\b[\s\S]{0,40}\bcontacts?\b\s+([A-Za-z][\w.'-]{0,40}(?:\s+[A-Za-z][\w.'-]{0,40})?)/i);
    const name = m ? cleanName(m[1]) : '';
    if (!name) return { show: false };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Contacts',
      lines: [{ label: 'Name', value: name }],
      button: 'Look up',
      closes: false,
      params: { name: name }
    };
  }

  async function run(input, deps) {
    const params = (input && input.params) || {};
    const name = cleanName((input && input.name) || params.name);
    if (!name) return { ok: false, reason: 'unclear' };
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasReadScope(deps.grantedScopes) === false) return { ok: false, reason: 'contacts-not-granted' };
    const contacts = await call({
      method: 'GET',
      path: contactsPath(name),
      headers: { ConsistencyLevel: 'eventual' }
    });
    if (!contacts || (contacts.ok !== true && contacts.status !== 403)) {
      return { ok: false, reason: 'contacts-failed', status: contacts && contacts.status };
    }
    const people = await call({
      method: 'GET',
      path: peoplePath(name),
      headers: { ConsistencyLevel: 'eventual' }
    });
    const fromContacts = contacts && contacts.ok ? addressesFrom(contacts.body, 'emailAddresses') : [];
    const fromPeople = people && people.ok ? addressesFrom(people.body, 'scoredEmailAddresses') : [];
    const byAddress = new Map();
    fromContacts.forEach((row) => {
      const key = row.address.toLowerCase();
      byAddress.set(key, { displayName: row.displayName || name, address: row.address, source: 'contacts' });
    });
    fromPeople.forEach((row) => {
      const key = row.address.toLowerCase();
      const prev = byAddress.get(key);
      if (prev) prev.source = 'both';
      else byAddress.set(key, { displayName: row.displayName || name, address: row.address, source: 'people' });
    });
    if (byAddress.size === 0) return { ok: false, reason: 'not-found' };
    if (byAddress.size > 1) return { ok: false, reason: 'ambiguous' };
    const recipient = byAddress.values().next().value;
    return { ok: true, recipient: recipient, connectorId: CONNECTOR, closes: false };
  }

  function undo() {
    return Promise.resolve({ ok: false, reason: 'no-undo' });
  }

  function receiptFromLog() {
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    READ_SCOPE: READ_SCOPE,
    hasReadScope: hasReadScope,
    contactsPath: contactsPath,
    peoplePath: peoplePath,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

// Service-worker binder. Portable run/offer never call this. It runs only when
// this file is the extension worker (no document, chrome-extension URL).
const LANE_PAGE_FILES = [
  'core/outlook-contacts.js',
  'core/outlook-word.js',
  'core/outlook-excel.js',
  'core/teams-chat.js',
  'core/outlook-send.js',
  'src/lane-ms-page.js'
];
const LANE_WORKER_FILES = [
  'core/outlook-word.js',
  'core/outlook-excel.js',
  'core/teams-chat.js',
  'core/outlook-send.js'
];
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

function laneBindHost() {
  if (typeof document !== 'undefined') return;
  const runtime = globalThis.chrome && globalThis.chrome.runtime;
  if (!runtime || typeof runtime.getURL !== 'function' || typeof runtime.getManifest !== 'function') return;
  let root = '';
  try { root = String(runtime.getURL('') || ''); } catch (e) { return; }
  if (root.indexOf('chrome-extension://') !== 0) return;
  if (globalThis.__glanceLaneMsBound) return;
  globalThis.__glanceLaneMsBound = true;

  const ready = Promise.all(LANE_WORKER_FILES.map((file) => import(runtime.getURL(file)).catch(() => null)));

  try {
    const origManifest = runtime.getManifest.bind(runtime);
    runtime.getManifest = function laneManifest() {
      const raw = origManifest();
      try {
        const copy = JSON.parse(JSON.stringify(raw));
        const js = copy.content_scripts && copy.content_scripts[0] && copy.content_scripts[0].js;
        if (Array.isArray(js)) {
          LANE_PAGE_FILES.forEach((file) => {
            if (js.indexOf(file) < 0) js.push(file);
          });
        }
        return copy;
      } catch (e) {
        return raw;
      }
    };
  } catch (e) { /* manifest stays the package copy */ }

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
      parsed = text ? JSON.parse(text) : null;
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
    try { await ready; } catch (e) { /* a sibling file failed to load */ }
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

  try {
    const origAdd = runtime.onMessage.addListener.bind(runtime.onMessage);
    runtime.onMessage.addListener = function laneAddListener(listener) {
      return origAdd(function (msg, sender, sendResponse) {
        if (!laneId(msg)) return listener(msg, sender, sendResponse);
        dispatch(msg).then(sendResponse, function () { sendResponse({ ok: false, reason: 'lane-failed' }); });
        return true;
      });
    };
  } catch (e) { /* the package listener stays as it is */ }
}

laneBindHost();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
if (typeof module !== 'undefined') module.exports = { FlowOutlookContacts };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
