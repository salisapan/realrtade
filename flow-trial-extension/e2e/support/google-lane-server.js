// Local Google API stand-in. The extension's fetch hits this process.
// It is not a replacement of fetch inside the service worker.
const http = require('http');
const crypto = require('crypto');

// Ids look like the real ones: opaque, no prefix a code path could lean on.
function opaqueId(kind, n) {
  const digest = crypto.createHash('sha1').update(kind + ':' + n).digest();
  if (kind === 'list') return Buffer.from(String(10000000000000000000 + n * 7919) + ':0:0').toString('base64').replace(/=+$/, '');
  if (kind === 'event') return digest.toString('hex').slice(0, 26).replace(/[w-z]/g, '0');
  if (kind === 'task') return digest.toString('base64').replace(/[+/=]/g, 'x').slice(0, 22);
  return digest.toString('hex').slice(0, 24);
}

const GOOGLE_AUTH_401 = { error: { code: 401, message: 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.', status: 'UNAUTHENTICATED' } };
const GOOGLE_404 = (what) => ({ error: { code: 404, message: what || 'Not Found', errors: [{ message: what || 'Not Found', domain: 'global', reason: 'notFound' }], status: 'NOT_FOUND' } });
const GOOGLE_400 = (msg) => ({ error: { code: 400, message: msg, status: 'INVALID_ARGUMENT' } });

const TASK_FIELDS = ['title', 'notes', 'due', 'status', 'completed', 'parent', 'previous', 'id', 'kind', 'etag', 'selfLink', 'updated', 'position', 'links', 'deleted', 'hidden', 'webViewLink', 'assignmentInfo'];
const EVENT_FIELDS = ['summary', 'description', 'location', 'start', 'end', 'attendees', 'reminders', 'colorId', 'visibility', 'transparency', 'status', 'recurrence', 'source', 'attachments', 'conferenceData', 'extendedProperties', 'guestsCanModify', 'id', 'sequence', 'anyoneCanAddSelf', 'guestsCanInviteOthers', 'guestsCanSeeOtherGuests', 'originalStartTime', 'gadget', 'eventType'];
const LIST_FIELDS = ['title', 'id', 'kind', 'etag', 'selfLink', 'updated'];

function unknownField(body, allowed) {
  const keys = Object.keys(body || {});
  const bad = keys.filter((k) => allowed.indexOf(k) < 0);
  return bad.length ? bad[0] : '';
}

// Calendar answers an instant in the zone's own offset form, not as sent.
function offsetForm(iso, zone) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || !zone) return iso;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const bag = {};
    fmt.formatToParts(new Date(ms)).forEach((p) => { if (p.type !== 'literal') bag[p.type] = p.value; });
    const hour = bag.hour === '24' ? '00' : bag.hour;
    const wall = Date.UTC(+bag.year, +bag.month - 1, +bag.day, +hour, +bag.minute, +bag.second);
    const diff = Math.round((wall - ms) / 60000);
    const sign = diff < 0 ? '-' : '+';
    const abs = Math.abs(diff);
    const off = sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
    return bag.year + '-' + bag.month + '-' + bag.day + 'T' + hour + ':' + bag.minute + ':' + bag.second + off;
  } catch (e) {
    return iso;
  }
}

function hashBytes(buf) {
  return crypto.createHash('md5').update(Buffer.from(buf || [])).digest('hex');
}

function parseDriveUpload(buf) {
  const text = Buffer.from(buf || []).toString('binary');
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.indexOf('}');
  let meta = {};
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try { meta = JSON.parse(text.slice(jsonStart, jsonEnd + 1)); } catch (e) { meta = {}; }
  }
  const marker = '\r\n\r\n';
  const first = text.indexOf(marker);
  const second = first >= 0 ? text.indexOf(marker, first + marker.length) : -1;
  const end = text.lastIndexOf('\r\n--glance_lane_drive');
  let bytes = Buffer.alloc(0);
  if (second >= 0 && end > second) bytes = Buffer.from(text.slice(second + marker.length, end), 'binary');
  return { meta: meta, bytes: bytes };
}


// Drive answers only the fields it was asked for, and refuses a name it does
// not know. The stand-in does the same, so a request for a field that does
// not exist fails here the way it fails live.
const DRIVE_FIELDS = ['id', 'name', 'mimeType', 'trashed', 'parents', 'md5Checksum', 'headRevisionId', 'version', 'modifiedTime', 'webViewLink'];

function driveFields(file, param) {
  if (!param) return { status: 200, body: file };
  const wanted = String(param).split(',').map((f) => f.trim()).filter(Boolean);
  const bad = wanted.filter((f) => f !== '*' && DRIVE_FIELDS.indexOf(f) < 0);
  if (bad.length) return { status: 400, body: { error: { code: 400, message: 'Invalid field selection ' + bad[0] } } };
  if (wanted.indexOf('*') >= 0) return { status: 200, body: file };
  const out = {};
  wanted.forEach((f) => { if (file[f] !== undefined && file[f] !== null) out[f] = file[f]; });
  return { status: 200, body: out };
}

function stampFile(file) {
  if (!file) return file;
  if (!file.headRevisionId) file.headRevisionId = 'rev-' + file.id + '-1';
  if (file.version == null || file.version === '') file.version = '1';
  if (!file.modifiedTime) file.modifiedTime = '2026-10-15T00:00:00.000Z';
  return file;
}

function bumpFile(file) {
  if (!file) return file;
  const n = Number(file.version || '1') + 1;
  file.version = String(n);
  file.headRevisionId = 'rev-' + file.id + '-' + n;
  file.modifiedTime = '2026-10-15T00:0' + String(n % 10) + ':00.000Z';
  return file;
}

function docBody(text, name) {
  const body = String(text || '');
  const end = 1 + body.length;
  const doc = {
    revisionId: 'rev-' + (name || 'doc'),
    body: {
      content: [{
        paragraph: {
          elements: [{ startIndex: 1, endIndex: end, textRun: { content: body } }]
        }
      }]
    },
    namedRanges: {}
  };
  if (name) {
    doc.namedRanges[name] = {
      name: name,
      namedRanges: [{
        namedRangeId: 'kix.' + name,
        name: name,
        ranges: [{ startIndex: 1, endIndex: end }]
      }]
    };
  }
  return doc;
}

function startGoogleLaneServer() {
  const state = {
    seq: 1,
    calls: [],
    tasks: {},
    events: {},
    files: {},
    docs: {},
    sheets: {},
    last: {},
    account: 'ai.local.flow@gmail.com',
    tokens: {},
    drafts: {},
    lists: [],
    listCreates: [],
    unauthorized: [],
    failGets: [],
    rejectOnce: [],
    driveHits: [],
    lagGets: []
  };
  seedLists();

  function seedLists() {
    state.lists = [
      { kind: 'tasks#taskList', id: opaqueId('list', 1), title: 'My Tasks', updated: '2026-10-01T08:00:00.000Z' },
      { kind: 'tasks#taskList', id: 'glance-list', title: 'Glance', updated: '2026-10-01T08:00:00.000Z' }
    ];
    state.defaultList = state.lists[0].id;
    state.listCreates = [];
  }

  function reset() {
    state.seq = 1;
    state.calls = [];
    state.tasks = {};
    state.events = {};
    state.files = {};
    state.docs = {};
    state.sheets = {};
    state.last = {};
    state.account = 'ai.local.flow@gmail.com';
    state.tokens = {};
    state.drafts = {};
    state.unauthorized = [];
    state.failGets = [];
    state.rejectOnce = [];
    state.driveHits = [];
    state.lagGets = [];
    state.noMeetLink = false;
    seedLists();
  }

  function accountFor(req) {
    const m = /^Bearer\s+(\S+)/.exec(String(req.headers.authorization || ''));
    const token = m ? m[1] : '';
    return state.tokens[token] || state.account;
  }

  function findList(id) {
    const want = id === '@default' ? state.defaultList : id;
    return state.lists.find((l) => l.id === want) || null;
  }

  function send(res, status, obj) {
    const text = obj == null ? '' : JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(text);
  }

  function publicTask(task) {
    const out = Object.assign({}, task);
    delete out.__list;
    return out;
  }

  function readJson(buf) {
    if (!buf || !buf.length) return {};
    try { return JSON.parse(buf.toString('utf8')); } catch (e) { return {}; }
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      let url;
      try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) {
        send(res, 400, { error: 'bad-url' });
        return;
      }
      const path = decodeURIComponent(url.pathname);
      const method = String(req.method || 'GET').toUpperCase();
      const parsed = (method === 'POST' || method === 'PATCH' || method === 'PUT') ? readJson(raw) : null;
      state.calls.push({
        method: method,
        path: path,
        search: url.search,
        at: Date.now(),
        bearer: (/^Bearer\s+(\S+)/.exec(String(req.headers.authorization || '')) || [])[1] || '',
        body: parsed && Object.keys(parsed).length ? parsed : null
      });

      const e2ePath = path.indexOf('/e2e/') === 0;
      const bearer = /^Bearer\s+\S+/.test(String(req.headers.authorization || ''));
      if (!e2ePath && !bearer) { send(res, 401, GOOGLE_AUTH_401); return; }
      if (!e2ePath && state.unauthorized.some((part) => path.indexOf(part) >= 0)) { send(res, 401, GOOGLE_AUTH_401); return; }

      if (!e2ePath) {
        const once = state.rejectOnce.findIndex((part) => path.indexOf(part) >= 0);
        if (once >= 0) { state.rejectOnce.splice(once, 1); send(res, 401, GOOGLE_AUTH_401); return; }
      }
      if (method === 'GET' && !e2ePath) {
        const lag = state.lagGets.find((l) => path.indexOf(l.part) >= 0 && l.left > 0);
        if (lag) { lag.left -= 1; send(res, 404, GOOGLE_404('Not Found')); return; }
      }

      if (method === 'GET' && !e2ePath && state.failGets.some((part) => path.indexOf(part) >= 0)) { send(res, 500, { error: { code: 500, message: 'Backend Error', status: 'INTERNAL' } }); return; }

      if (method === 'GET' && path === '/e2e/att/board.pdf') {
        res.writeHead(302, { Location: '/e2e/att-final/board.pdf' });
        res.end();
        return;
      }
      if (method === 'GET' && path === '/e2e/att-final/board.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end(Buffer.from('%PDF-e2e-redirected'));
        return;
      }
      if (method === 'GET' && path === '/e2e/att/signin.pdf') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html>Sign in</html>');
        return;
      }
      if (method === 'GET' && path === '/e2e/att/gone.pdf') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('gone');
        return;
      }

      if (method === 'GET' && path === '/drive/v3/files') {
        const q = url.searchParams.get('q') || '';
        if (q.indexOf('application/vnd.google-apps.folder') >= 0) {
          const named = /name\s*=\s*'([^']*)'/.exec(q);
          const hits = Object.keys(state.files).map((k) => state.files[k]).filter((f) => f.mimeType === 'application/vnd.google-apps.folder' && !f.trashed && (!named || f.name === named[1]));
          send(res, 200, { files: hits.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })) });
          return;
        }
        if (q.indexOf('glance-pricing-q4.pdf') >= 0) {
          send(res, 200, { files: [{ id: 'pricing-pdf', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' }] });
          return;
        }
        send(res, 200, { files: state.driveHits.slice() });
        return;
      }

      const oneFile = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
      if (oneFile && method === 'GET') {
        const file = state.files[oneFile[1]];
        if (!file) { send(res, 404, { error: 'missing' }); return; }
        const picked = driveFields(file, url.searchParams.get('fields'));
        send(res, picked.status, picked.body);
        if (file.__settles) { file.__settles = false; bumpFile(file); }
        return;
      }
      if (oneFile && method === 'PATCH') {
        const file = state.files[oneFile[1]];
        if (!file) { send(res, 404, { error: 'missing' }); return; }
        Object.assign(file, readJson(raw));
        send(res, 200, file);
        return;
      }
      if (path === '/drive/v3/files' && method === 'POST') {
        const meta = readJson(raw);
        const id = 'e2e-file-' + (state.seq++);
        const file = stampFile({ id: id, name: meta.name || 'file', mimeType: meta.mimeType || '', trashed: false, parents: meta.parents || null });
        if (/^application\/vnd\.google-apps\./.test(String(meta.mimeType || ''))) file.webViewLink = 'https://docs.google.com/document/d/' + id + '/edit';
        state.files[id] = file;
        if (meta.mimeType === 'application/vnd.google-apps.document') {
          state.docs[id] = docBody('', '');
          state.last.doc = id;
        }
        if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
          state.sheets[id] = { row: null, range: '' };
          state.last.sheet = id;
        }
        state.last.file = id;
        send(res, 200, file);
        return;
      }
      if (path.indexOf('/upload/drive/v3/files') === 0 && method === 'POST') {
        const packed = parseDriveUpload(raw);
        const id = 'e2e-upload-' + (state.seq++);
        const file = stampFile({
          id: id,
          name: packed.meta.name || 'upload.bin',
          mimeType: packed.meta.mimeType || 'application/octet-stream',
          trashed: false,
          md5Checksum: hashBytes(packed.bytes),
          parents: packed.meta.parents || null
        });
        Object.defineProperty(file, '__settles', { value: true, writable: true, enumerable: false });
        state.files[id] = file;
        state.last.file = id;
        const echoed = driveFields(file, url.searchParams.get('fields'));
        send(res, echoed.status, echoed.body);
        return;
      }

      if (method === 'GET' && path === '/gmail/v1/users/me/profile') {
        send(res, 200, { emailAddress: accountFor(req), messagesTotal: 120, threadsTotal: 80, historyId: '9001' });
        return;
      }
      const draftCol = path === '/gmail/v1/users/me/drafts';
      const draftOne = path.match(/^\/gmail\/v1\/users\/me\/drafts\/([^/]+)$/);
      if (draftCol && method === 'POST') {
        const body = readJson(raw);
        const bad = unknownField(body, ['message']);
        const msg = body.message || {};
        const badMsg = unknownField(msg, ['raw', 'threadId']);
        if (bad || badMsg || !msg.raw) { send(res, 400, GOOGLE_400('Invalid JSON payload received. Unknown name "' + (bad || badMsg || 'raw') + '": Cannot find field.')); return; }
        const text = Buffer.from(String(msg.raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const headers = {};
        const split = text.split(/\r?\n\r?\n/);
        split[0].split(/\r?\n/).forEach((line) => {
          const i = line.indexOf(':');
          if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        });
        const id = 'r' + opaqueId('draft', state.seq++);
        const mid = opaqueId('msg', state.seq++);
        let part = split.slice(1).join('\n\n');
        if (/base64/i.test(headers['content-transfer-encoding'] || '')) part = Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8');
        const draft = { id: id, message: { id: mid, threadId: msg.threadId || mid, labelIds: ['DRAFT'], headers: headers, body: part, who: accountFor(req) } };
        state.drafts[id] = draft;
        state.last.draft = id;
        send(res, 200, { id: id, message: { id: mid, threadId: draft.message.threadId, labelIds: ['DRAFT'] } });
        return;
      }
      if (draftOne && method === 'GET') {
        const draft = state.drafts[draftOne[1]];
        if (!draft || draft.message.who !== accountFor(req)) { send(res, 404, GOOGLE_404('Requested entity was not found.')); return; }
        const h = draft.message.headers;
        send(res, 200, {
          id: draft.id,
          message: {
            id: draft.message.id,
            threadId: draft.message.threadId,
            labelIds: ['DRAFT'],
            payload: {
              headers: Object.keys(h).map((k) => ({ name: k.replace(/(^|-)([a-z])/g, (m0, a, b) => a + b.toUpperCase()), value: h[k] })),
              body: { size: draft.message.body.length, data: Buffer.from(draft.message.body, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_') }
            }
          }
        });
        return;
      }
      if (draftOne && method === 'DELETE') {
        if (!state.drafts[draftOne[1]]) { send(res, 404, GOOGLE_404('Requested entity was not found.')); return; }
        delete state.drafts[draftOne[1]];
        res.writeHead(204);
        res.end();
        return;
      }

      const calCol = path.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
      const calOne = path.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/);
      const calId = calCol ? calCol[1] : (calOne ? calOne[1] : '');
      const who = accountFor(req);
      if (calId && calId !== 'primary' && calId.toLowerCase() !== who.toLowerCase()) {
        send(res, 404, GOOGLE_404('Not Found'));
        return;
      }
      if (calCol && method === 'POST') {
        const body = readJson(raw);
        const bad = unknownField(body, EVENT_FIELDS);
        if (bad) { send(res, 400, GOOGLE_400('Invalid JSON payload received. Unknown name "' + bad + '": Cannot find field.')); return; }
        const id = opaqueId('event', state.seq++);
        const event = Object.assign({}, body, {
          kind: 'calendar#event',
          etag: '"3' + id.slice(0, 12) + '"',
          id: id,
          status: 'confirmed',
          htmlLink: 'https://www.google.com/calendar/event?eid=' + Buffer.from(id + ' ' + who).toString('base64').replace(/=+$/, ''),
          created: '2026-10-18T09:00:00.000Z',
          updated: '2026-10-18T09:00:00.000Z',
          creator: { email: who, self: true },
          organizer: { email: who, self: true },
          iCalUID: id + '@google.com',
          sequence: 0,
          reminders: { useDefault: true },
          eventType: 'default'
        });
        ['start', 'end'].forEach((k) => {
          if (event[k] && event[k].dateTime) event[k] = { dateTime: offsetForm(event[k].dateTime, event[k].timeZone), timeZone: event[k].timeZone };
        });
        delete event.attendees;
        // Like Calendar: a conference request is honoured only with conferenceDataVersion=1,
        // and then the event carries a Meet link. Without the parameter it is ignored.
        if (event.conferenceData && event.conferenceData.createRequest) {
          if (url.searchParams.get('conferenceDataVersion') === '1' && !state.noMeetLink) {
            const link = 'https://meet.google.com/abc-defg-hij';
            event.hangoutLink = link;
            event.conferenceData = { createRequest: { requestId: event.conferenceData.createRequest.requestId, status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: link }], conferenceId: 'abc-defg-hij' };
          } else {
            delete event.conferenceData;
          }
        }
        Object.defineProperty(event, '__account', { value: who, enumerable: false });
        state.events[id] = event;
        state.last.event = id;
        send(res, 200, event);
        return;
      }
      if (calOne && method === 'GET') {
        const event = state.events[calOne[2]];
        const mine = event && (!event.__account || event.__account === who);
        send(res, mine ? 200 : 404, mine ? event : GOOGLE_404('Not Found'));
        return;
      }
      if (calOne && method === 'DELETE') {
        const gone = state.events[calOne[2]];
        if (!gone || (gone.__account && gone.__account !== who)) { send(res, 404, GOOGLE_404('Not Found')); return; }
        delete state.events[calOne[2]];
        res.writeHead(204);
        res.end();
        return;
      }

      const listsCol = path === '/tasks/v1/users/@me/lists';
      const listsOne = path.match(/^\/tasks\/v1\/users\/@me\/lists\/([^/]+)$/);
      const taskCol = path.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks$/);
      const taskOne = path.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      if (listsCol && method === 'GET') {
        send(res, 200, { kind: 'tasks#taskLists', etag: '"e2e"', items: state.lists });
        return;
      }
      if (listsCol && method === 'POST') {
        const body = readJson(raw);
        const bad = unknownField(body, LIST_FIELDS);
        if (bad) { send(res, 400, GOOGLE_400('Invalid JSON payload received. Unknown name "' + bad + '": Cannot find field.')); return; }
        const made = { kind: 'tasks#taskList', id: opaqueId('list', state.lists.length + 1), title: body.title || '', updated: '2026-10-18T09:00:00.000Z' };
        state.lists.push(made);
        state.listCreates.push(made.title);
        send(res, 200, made);
        return;
      }
      if (listsOne && method === 'GET') {
        const list = findList(listsOne[1]);
        send(res, list ? 200 : 404, list || GOOGLE_404('Invalid task list ID'));
        return;
      }
      if (taskCol || taskOne) {
        const listId = (taskCol || taskOne)[1];
        if (!findList(listId)) { send(res, 404, GOOGLE_404('Invalid task list ID')); return; }
      }
      if (taskCol && method === 'POST') {
        const body = readJson(raw);
        const bad = unknownField(body, TASK_FIELDS);
        if (bad) { send(res, 400, GOOGLE_400('Invalid JSON payload received. Unknown name "' + bad + '": Cannot find field.')); return; }
        const id = opaqueId('task', state.seq++);
        const task = {
          kind: 'tasks#task', id: id, etag: '"e2e' + id.slice(0, 6) + '"', title: body.title || '',
          updated: '2026-10-18T09:00:00.000Z', selfLink: 'https://www.googleapis.com/tasks/v1/lists/' + taskCol[1] + '/tasks/' + id,
          position: '00000000000000000000', status: 'needsAction', links: [], webViewLink: 'https://tasks.google.com/task/' + id
        };
        if (body.notes) task.notes = body.notes;
        if (body.due) task.due = String(body.due).slice(0, 10) + 'T00:00:00.000Z';
        task.__list = taskCol[1];
        state.tasks[id] = task;
        state.last.task = id;
        state.last.taskList = taskCol[1];
        send(res, 200, publicTask(task));
        return;
      }
      if (taskOne && method === 'GET') {
        const task = state.tasks[taskOne[2]];
        send(res, task && task.__list === taskOne[1] ? 200 : 404, task && task.__list === taskOne[1] ? publicTask(task) : GOOGLE_404('Not Found'));
        return;
      }
      if (taskOne && method === 'DELETE') {
        if (!state.tasks[taskOne[2]]) { send(res, 404, GOOGLE_404('Not Found')); return; }
        delete state.tasks[taskOne[2]];
        res.writeHead(204);
        res.end();
        return;
      }

      const docBatch = path.match(/^\/v1\/documents\/([^/:]+):batchUpdate$/);
      const docGet = path.match(/^\/v1\/documents\/([^/:]+)$/);
      if (docBatch && method === 'POST') {
        const id = docBatch[1];
        const body = readJson(raw);
        const requests = body.requests || [];
        let text = '';
        let name = '';
        requests.forEach((item) => {
          if (item.insertText && item.insertText.text) text = item.insertText.text;
          if (item.createNamedRange && item.createNamedRange.name) name = item.createNamedRange.name;
        });
        state.docs[id] = docBody(text, name);
        bumpFile(state.files[id]);
        state.last.doc = id;
        send(res, 200, {});
        return;
      }
      if (docGet && method === 'GET') {
        const doc = state.docs[docGet[1]];
        send(res, doc ? 200 : 404, doc || { error: 'missing' });
        return;
      }

      const append = path.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+):append$/);
      const clear = path.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+):clear$/);
      const values = path.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/);
      if (append && method === 'POST') {
        const id = append[1];
        const body = readJson(raw);
        const row = (body.values && body.values[0]) || [];
        const end = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.max(row.length - 1, 0)] || 'A';
        const range = 'Sheet1!A1:' + end + '1';
        state.sheets[id] = { row: row, range: range };
        bumpFile(state.files[id]);
        state.last.sheet = id;
        send(res, 200, { updates: { updatedRange: range, updatedRows: 1 } });
        return;
      }
      if (clear && method === 'POST') {
        const sheet = state.sheets[clear[1]];
        if (sheet) sheet.row = [];
        send(res, 200, {});
        return;
      }
      if (values && method === 'GET') {
        const sheet = state.sheets[values[1]];
        if (!sheet || !sheet.row) { send(res, 404, { error: 'missing' }); return; }
        send(res, 200, { values: [sheet.row] });
        return;
      }

      send(res, 404, { error: 'e2e-unmocked', path: path, method: method });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        origin: 'http://127.0.0.1:' + port,
        get calls() { return state.calls; },
        get last() { return state.last; },
        reset: reset,
        get account() { return state.account; },
        setAccount: (email) => { state.account = email; },
        registerToken: (token, email) => { state.tokens[token] = email; },
        get drafts() { return state.drafts; },
        get lists() { return state.lists; },
        get listCreates() { return state.listCreates; },
        get defaultList() { return state.defaultList; },
        rejectAuth: (part) => { state.unauthorized.push(part); },
        rejectOnce: (part) => { state.rejectOnce.push(part); },
        driveHits: (files) => { state.driveHits = (files || []).slice(); },
        lagGets: (part, count) => { state.lagGets.push({ part: part, left: count }); },
        failGet: (part) => { state.failGets.push(part); },
        clearFailGets: () => { state.failGets = []; },
        events: () => state.events,
        tasks: () => state.tasks,
        deleteEvent: (id) => { delete state.events[id]; },
        setNoMeetLink: (on) => { state.noMeetLink = on === true; },
        deleteTask: (id) => { delete state.tasks[id]; },
        task: (id) => state.tasks[id],
        event: (id) => state.events[id],
        file: (id) => state.files[id],
        files: () => state.files,
        doc: (id) => state.docs[id],
        sheet: (id) => state.sheets[id],
        editTask: (id, patch) => Object.assign(state.tasks[id], patch),
        editEvent: (id, patch) => Object.assign(state.events[id], patch),
        editFile: (id, patch) => { Object.assign(state.files[id], patch); bumpFile(state.files[id]); },
        editDocText: (id, text) => {
          const doc = state.docs[id];
          if (!doc) return;
          const name = Object.keys(doc.namedRanges || {})[0] || '';
          state.docs[id] = docBody(text, name);
          bumpFile(state.files[id]);
        },
        editSheetRow: (id, row) => {
          if (state.sheets[id]) state.sheets[id].row = row;
          bumpFile(state.files[id]);
        },
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}

module.exports = { startGoogleLaneServer };
