// Graph mock and Outlook-card injection for the Microsoft Graph lane.
// launch.js stays the 0.9.56 copy. This file wraps the worker fetch that
// launch.js already installed, and injects the lane content scripts into the
// open Outlook tab after the Glance card is on the page.
const { SHOW } = require('./sentences');

const LANE_FILES = [
  'core/outlook-contacts.js',
  'core/outlook-word.js',
  'core/outlook-excel.js',
  'core/teams-chat.js',
  'core/outlook-send.js',
  'src/lane-ms-page.js',
  'src/content-outlook-lane-ms.js'
];

function installLaneMock(cfg) {
  const e2e = globalThis.__glanceE2e;
  if (!e2e) return { ok: false, reason: 'no-e2e' };
  const c = cfg || {};
  const lane = {
    active: true,
    contacts: c.contacts || [],
    people: c.people || [],
    peopleStatus: c.peopleStatus || 200,
    chats: c.chats || [],
    driveItems: {},
    driveByName: {},
    workbooks: {},
    seq: 1,
    stamp: { eTag: 'e-lane', lastModifiedDateTime: '2026-10-14T12:00:00Z' }
  };
  (c.driveSeed || []).forEach((item) => {
    if (!item || !item.id) return;
    const row = {
      id: item.id,
      name: item.name || '',
      webUrl: item.webUrl || '',
      eTag: item.eTag || lane.stamp.eTag,
      lastModifiedDateTime: item.lastModifiedDateTime || lane.stamp.lastModifiedDateTime
    };
    lane.driveItems[row.id] = row;
    if (row.name) lane.driveByName[row.name] = row;
  });
  (c.workbookSeed || []).forEach((book) => {
    if (!book || !book.itemId) return;
    lane.workbooks[book.itemId] = {
      tables: (book.tables || []).map((table) => ({
        id: table.id,
        name: table.name || 'Table1',
        rows: (table.rows || []).map((row) => row.slice())
      }))
    };
  });
  e2e.lane = lane;
  if (e2e.laneMock) return { ok: true, already: true };
  e2e.laneMock = true;
  const prev = globalThis.fetch.bind(globalThis);

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  function empty(status) {
    return new Response(null, { status: status });
  }
  function textBody(status, text) {
    return new Response(String(text || ''), {
      status: status,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  globalThis.fetch = function laneMsFetch(input, init) {
    const live = globalThis.__glanceE2e && globalThis.__glanceE2e.lane;
    if (!live || live.active !== true) return prev(input, init);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let parsed;
    try { parsed = new URL(url); } catch (err) { return prev(input, init); }
    if (parsed.hostname !== 'graph.microsoft.com') return prev(input, init);
    const method = String((init && init.method) || 'GET').toUpperCase();
    const path = decodeURIComponent(parsed.pathname);
    if (path.indexOf('/me/') < 0) return prev(input, init);

    function hit(res) {
      const calls = globalThis.__glanceE2e.calls || (globalThis.__glanceE2e.calls = []);
      calls.push({ url: url, method: method, at: Date.now() });
      return Promise.resolve(res);
    }
    function posted() {
      try { return init && init.body ? JSON.parse(init.body) : {}; } catch (err) { return {}; }
    }
    function bookOf(itemId) {
      if (!live.workbooks[itemId]) live.workbooks[itemId] = { tables: [] };
      return live.workbooks[itemId];
    }

    if (path.indexOf('/me/contacts') >= 0 && method === 'GET') {
      return hit(json(200, { value: live.contacts }));
    }
    if (path.indexOf('/me/people') >= 0 && method === 'GET') {
      if (live.peopleStatus !== 200) return hit(json(live.peopleStatus, { error: { code: 'ErrorAccessDenied' } }));
      return hit(json(200, { value: live.people }));
    }
    if (path.indexOf('/me/chats') >= 0) {
      if (method !== 'GET') return hit(json(403, { error: { code: 'ErrorAccessDenied' } }));
      return hit(json(200, { value: live.chats }));
    }
    if (path.indexOf('/me/sendMail') >= 0) return hit(empty(202));

    const contentPut = path.match(/\/me\/drive\/root:\/(.+):\/content$/);
    if (contentPut && method === 'PUT') {
      const name = contentPut[1];
      const prevItem = live.driveByName[name];
      const id = prevItem ? prevItem.id : ('lane-file-' + (live.seq++));
      const item = {
        id: id,
        name: name,
        webUrl: 'https://onedrive.live.com/file/' + id,
        eTag: live.stamp.eTag,
        lastModifiedDateTime: live.stamp.lastModifiedDateTime
      };
      live.driveItems[id] = item;
      live.driveByName[name] = item;
      return hit(json(prevItem ? 200 : 201, item));
    }
    const rootGet = path.match(/\/me\/drive\/root:\/([^/]+)$/);
    if (rootGet && method === 'GET') {
      const item = live.driveByName[rootGet[1]];
      return hit(item ? json(200, item) : json(404, { error: { code: 'itemNotFound' } }));
    }
    const itemContent = path.match(/\/me\/drive\/items\/([^/]+)\/content$/);
    if (itemContent && method === 'GET') {
      const item = live.driveItems[itemContent[1]];
      if (!item) return prev(input, init);
      return hit(textBody(200, 'word/document.xml ' + (item.name || '')));
    }
    const versions = path.match(/\/me\/drive\/items\/([^/]+)\/versions$/);
    if (versions && method === 'GET') {
      if (!live.driveItems[versions[1]]) return prev(input, init);
      return hit(json(200, { value: [{ id: 'ver-prev' }] }));
    }
    if (/\/restoreVersion$/.test(path) && method === 'POST') return hit(empty(204));
    const driveItem = path.match(/\/me\/drive\/items\/([^/]+)$/);
    if (driveItem) {
      const id = driveItem[1];
      const item = live.driveItems[id];
      if (!item) return prev(input, init);
      if (method === 'DELETE') {
        if (item.name) delete live.driveByName[item.name];
        delete live.driveItems[id];
        return hit(empty(204));
      }
      return hit(json(200, item));
    }

    const workbook = path.match(/\/me\/drive\/items\/([^/]+)\/workbook(?:\/(.*))?$/);
    if (workbook) {
      const itemId = workbook[1];
      if (!live.driveItems[itemId]) return prev(input, init);
      const rest = workbook[2] || '';
      const wb = bookOf(itemId);
      const body = posted();
      if (rest === 'createSession' && method === 'POST') {
        wb.session = 'sess-' + itemId;
        return hit(json(201, { id: wb.session }));
      }
      if (rest === 'closeSession' && method === 'POST') return hit(empty(204));
      if (rest.indexOf('range') >= 0 && method === 'PATCH') {
        wb.range = body.values || [];
        return hit(json(200, { values: wb.range }));
      }
      if (rest === 'tables/add' && method === 'POST') {
        const id = 'lane-table-' + (live.seq++);
        const rows = (wb.range || []).map((row) => row.slice());
        wb.tables.push({ id: id, name: 'Table1', rows: rows });
        return hit(json(201, { id: id, name: 'Table1' }));
      }
      if (rest === 'tables' && method === 'GET') {
        return hit(json(200, { value: wb.tables.map((table) => ({ id: table.id, name: table.name })) }));
      }
      const rowAdd = rest.match(/^tables\/([^/]+)\/rows\/add$/);
      if (rowAdd && method === 'POST') {
        const table = wb.tables.find((item) => item.id === rowAdd[1]);
        if (!table) return hit(json(404, { error: { code: 'itemNotFound' } }));
        const row = (body.values && body.values[0]) || [];
        table.rows.push(row.slice());
        return hit(json(201, { index: table.rows.length - 1, values: [row] }));
      }
      const rowAt = rest.match(/^tables\/([^/]+)\/rows\/itemAt\(index=(\d+)\)$/);
      if (rowAt && method === 'GET') {
        const table = wb.tables.find((item) => item.id === rowAt[1]);
        const index = Number(rowAt[2]);
        const row = table && table.rows[index];
        if (!row) return hit(json(404, { error: { code: 'itemNotFound' } }));
        return hit(json(200, { index: index, values: [row] }));
      }
      const rowDel = rest.match(/^tables\/([^/]+)\/rows\/itemAt\(index=(\d+)\)\/delete$/);
      if (rowDel && method === 'POST') {
        const table = wb.tables.find((item) => item.id === rowDel[1]);
        const index = Number(rowDel[2]);
        if (!table || !table.rows[index]) return hit(json(404, { error: { code: 'itemNotFound' } }));
        table.rows.splice(index, 1);
        return hit(empty(204));
      }
      const rowList = rest.match(/^tables\/([^/]+)\/rows$/);
      if (rowList && method === 'GET') {
        const table = wb.tables.find((item) => item.id === rowList[1]);
        if (!table) return hit(json(404, { error: { code: 'itemNotFound' } }));
        return hit(json(200, {
          value: table.rows.map((values, index) => ({ index: index, values: [values] }))
        }));
      }
      const tableDel = rest.match(/^tables\/([^/]+)$/);
      if (tableDel && method === 'DELETE') {
        wb.tables = wb.tables.filter((item) => item.id !== tableDel[1]);
        return hit(empty(204));
      }
    }
    return prev(input, init);
  };
  return { ok: true };
}

async function grantScopes(glance, scopes) {
  if (!scopes || !scopes.length) return;
  await glance.evaluateWorker(async (extra) => {
    const bag = await chrome.storage.local.get('outlookAuth');
    const auth = bag && bag.outlookAuth;
    const token = auth && auth.token;
    if (!token) return { ok: false };
    const list = Array.isArray(token.grantedScopes) ? token.grantedScopes.slice() : [];
    extra.forEach((scope) => { if (list.indexOf(scope) < 0) list.push(scope); });
    token.grantedScopes = list;
    token.scopes = list.slice();
    token.scope = list.join(' ');
    await chrome.storage.local.set({ outlookAuth: auth });
    return { ok: true };
  }, scopes);
}

async function prepare(glance, opts) {
  const o = opts || {};
  const scenario = o.scenario || {};
  await grantScopes(glance, o.scopes || []);
  if (scenario && Object.keys(scenario).length) {
    const mail = Object.assign({}, scenario);
    delete mail.contacts;
    delete mail.people;
    delete mail.chats;
    delete mail.driveSeed;
    delete mail.workbookSeed;
    delete mail.peopleStatus;
    await glance.setScenario(mail);
  }
  return glance.evaluateWorker(installLaneMock, {
    contacts: scenario.contacts || [],
    people: scenario.people || [],
    peopleStatus: scenario.peopleStatus || 200,
    chats: scenario.chats || [],
    driveSeed: scenario.driveSeed || [],
    workbookSeed: scenario.workbookSeed || []
  });
}

async function inject(glance) {
  const page = glance.page;
  const chip = page.locator('#ReadingPaneContainerId .flow-chip-host');
  try {
    await chip.waitFor({ state: 'attached', timeout: 20000 });
  } catch (err) {
    const url = page.url();
    const text = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    throw new Error('NO_OUTLOOK_CARD url=' + url + ' text=' + JSON.stringify(text.slice(0, 400)) + ' html=' + html.slice(0, 500));
  }
  return glance.evaluateWorker(async (files) => {
    const tabs = await chrome.tabs.query({});
    const tab = (tabs || []).filter((item) => item.url && item.url.indexOf('outlook.live.com') >= 0).pop();
    if (!tab) return { ok: false, reason: 'no-tab' };
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: files, world: 'ISOLATED' });
    return { ok: true, tabId: tab.id };
  }, LANE_FILES);
}

function mailWithCard(mail) {
  const o = Object.assign({}, mail || {});
  const body = String(o.body || '');
  if (body.indexOf(SHOW) < 0) o.body = SHOW + '\n' + body;
  return o;
}

async function openOutlook(glance, mail) {
  const page = await glance.openOutlook(mailWithCard(mail));
  const injected = await inject(glance);
  if (!injected || injected.ok !== true) throw new Error('LANE_INJECT_FAILED:' + JSON.stringify(injected));
  return page;
}

async function release(glance) {
  await glance.evaluateWorker(() => {
    const e2e = globalThis.__glanceE2e;
    if (e2e && e2e.lane) e2e.lane.active = false;
  });
}

async function run(glance, opts, mail, fn) {
  try {
    await prepare(glance, opts);
    const page = await openOutlook(glance, mail);
    await fn(page);
  } finally {
    await release(glance);
  }
}

module.exports = { prepare, openOutlook, release, run, installLaneMock, LANE_FILES };
