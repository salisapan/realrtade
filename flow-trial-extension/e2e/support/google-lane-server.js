// Local Google API stand-in. The extension's fetch hits this process.
// It is not a replacement of fetch inside the service worker.
const http = require('http');

function hashBytes(buf) {
  let h = 5381;
  const arr = buf || [];
  for (let i = 0; i < arr.length; i++) h = ((h * 33) ^ arr[i]) >>> 0;
  return h.toString(16);
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
    last: {}
  };

  function reset() {
    state.seq = 1;
    state.calls = [];
    state.tasks = {};
    state.events = {};
    state.files = {};
    state.docs = {};
    state.sheets = {};
    state.last = {};
  }

  function send(res, status, obj) {
    const text = obj == null ? '' : JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(text);
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
        body: parsed && Object.keys(parsed).length ? parsed : null
      });

      if (method === 'GET' && path === '/drive/v3/files') {
        const q = url.searchParams.get('q') || '';
        if (q.indexOf('glance-pricing-q4.pdf') >= 0) {
          send(res, 200, { files: [{ id: 'pricing-pdf', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' }] });
          return;
        }
        send(res, 200, { files: [] });
        return;
      }

      const oneFile = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
      if (oneFile && method === 'GET') {
        const file = state.files[oneFile[1]];
        send(res, file ? 200 : 404, file || { error: 'missing' });
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
        const file = stampFile({ id: id, name: meta.name || 'file', mimeType: meta.mimeType || '', trashed: false, contentHash: 'created' });
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
          contentHash: hashBytes(packed.bytes)
        });
        state.files[id] = file;
        state.last.file = id;
        send(res, 200, file);
        return;
      }

      if (path === '/calendar/v3/calendars/primary/events' && method === 'POST') {
        const body = readJson(raw);
        const id = 'e2e-event-' + (state.seq++);
        const event = Object.assign({}, body, {
          id: id,
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/calendar/event?eid=' + id
        });
        state.events[id] = event;
        state.last.event = id;
        send(res, 200, event);
        return;
      }
      const oneEvent = path.match(/^\/calendar\/v3\/calendars\/primary\/events\/([^/]+)$/);
      if (oneEvent && method === 'GET') {
        const event = state.events[oneEvent[1]];
        send(res, event ? 200 : 404, event || { error: 'missing' });
        return;
      }
      if (oneEvent && method === 'DELETE') {
        delete state.events[oneEvent[1]];
        res.writeHead(204);
        res.end();
        return;
      }

      const taskCol = path.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks$/);
      const taskOne = path.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      if (taskCol && method === 'POST') {
        const body = readJson(raw);
        const id = 'e2e-task-' + (state.seq++);
        const task = { id: id, title: body.title || '', notes: body.notes || '', due: body.due || '', status: 'needsAction' };
        state.tasks[id] = task;
        state.last.task = id;
        send(res, 200, task);
        return;
      }
      if (taskOne && method === 'GET') {
        const task = state.tasks[taskOne[2]];
        send(res, task ? 200 : 404, task || { error: 'missing' });
        return;
      }
      if (taskOne && method === 'DELETE') {
        delete state.tasks[taskOne[2]];
        res.writeHead(204);
        res.end();
        return;
      }

      if (path === '/v1/people:searchContacts' && method === 'GET') {
        const query = url.searchParams.get('query') || '';
        state.last.contact = query;
        send(res, 200, {
          results: [{
            person: {
              resourceName: 'people/c1',
              names: [{ displayName: 'Flow' }],
              emailAddresses: [{ value: query }]
            }
          }]
        });
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
        task: (id) => state.tasks[id],
        event: (id) => state.events[id],
        file: (id) => state.files[id],
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
