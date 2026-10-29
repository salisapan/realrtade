const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { ME } = require('./sentences');
const { gmailHtml, outlookHtml, outlookUrl, gmailUrl } = require('./fixtures');

const EXT_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', 'e2e', 'e2e-report', 'test-results', 'playwright-report', 'test']);

function manifestGoogleGrantedVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'manifest.json'), 'utf8'));
  const scopes = (manifest.oauth2 && manifest.oauth2.scopes) || [];
  return scopes.slice().sort().join('\n');
}

function copyExtension(opts) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-ext-'));
  fs.cpSync(EXT_ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(EXT_ROOT, src);
      if (!rel) return true;
      const top = rel.split(path.sep)[0];
      return !SKIP_DIRS.has(top);
    }
  });
  const manifestPath = path.join(dest, 'manifest.json');
  if (opts && opts.bare) return dest;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const hostExtra = [
    'https://outlook.live.com/*',
    'https://outlook.office.com/*',
    'https://outlook.office365.com/*',
    'https://graph.microsoft.com/*',
    'https://login.microsoftonline.com/*',
    'http://127.0.0.1/*',
    'http://localhost/*'
  ];
  const optionalChat = [
    // E2E copy only. v1 product manifest omits chat optional hosts; Meta lane specs patch them in.
    'https://www.messenger.com/*',
    'https://messenger.com/*',
    'https://web.whatsapp.com/*',
    'https://www.facebook.com/messages',
    'https://www.facebook.com/messages/*',
    'https://facebook.com/messages',
    'https://facebook.com/messages/*',
    'https://business.facebook.com/latest/inbox',
    'https://business.facebook.com/latest/inbox/*',
    'https://www.business.facebook.com/latest/inbox',
    'https://www.business.facebook.com/latest/inbox/*',
    'https://www.instagram.com/direct',
    'https://www.instagram.com/direct/*',
    'https://instagram.com/direct',
    'https://instagram.com/direct/*'
  ];
  manifest.host_permissions = Array.from(new Set((manifest.host_permissions || []).concat(hostExtra, optionalChat)));
  manifest.optional_host_permissions = Array.from(new Set((manifest.optional_host_permissions || []).concat(optionalChat)));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dest;
}

function outlookAuth(opts) {
  const o = opts || {};
  const scopes = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite'];
  if (o.tasks !== false) scopes.push('Tasks.ReadWrite');
  if (o.files !== false) scopes.push('Files.ReadWrite');
  if (o.calendar === true) {
    scopes.push('Calendars.ReadWrite');
    scopes.push('MailboxSettings.Read');
  }
  if (o.sharepoint === true) scopes.push('Sites.ReadWrite.All');
  const now = Date.now();
  return {
    token: {
      accessToken: 'AT-e2e',
      refreshToken: 'RT-e2e',
      expiresAt: now + 60 * 60 * 1000,
      rtIssuedAt: now,
      grantedScopes: scopes.slice(),
      scopes: scopes.slice(),
      scope: scopes.join(' ')
    },
    account: { address: ME, name: o.name || 'Glance', mail: ME, userPrincipalName: ME },
    ownAddresses: Array.isArray(o.ownAddresses) && o.ownAddresses.length ? o.ownAddresses.slice() : [ME],
    profile: { mail: ME, userPrincipalName: ME, displayName: o.name || 'Glance', givenName: o.givenName || null, surname: o.surname || null },
    requestedScopes: scopes.slice()
  };
}

// Installed inside the service worker. Inert unless this harness calls it.
// Network mocks live here because extension fetches do not always hit context.route.
// chrome.identity.launchWebAuthFlow cannot be replaced here. background.js
// calls e2e.launchWebAuthFlow when that function is set. Rebind it on every
// install, including the already-installed reset path. This helper stays
// inside installE2EHooks because Playwright serializes only that function.
function installE2EHooks() {
  function bindGlanceE2eWebAuth(e2e) {
    if (!e2e) return;
    e2e.flows = e2e.flows || [];
    e2e.launchWebAuthFlow = function (details) {
      e2e.flows.push({
        url: details && details.url,
        interactive: details ? details.interactive : undefined,
        at: Date.now()
      });
      return Promise.reject(new Error(e2e.webFlowError || 'e2e-no-window'));
    };
  }
  if (globalThis.__glanceE2e && globalThis.__glanceE2e.installed) {
    bindGlanceE2eWebAuth(globalThis.__glanceE2e);
    return { ok: true, already: true };
  }
  const e2e = globalThis.__glanceE2e || {};
  e2e.installed = true;
  e2e.calls = e2e.calls || [];
  e2e.authCalls = e2e.authCalls || [];
  e2e.flows = e2e.flows || [];
  e2e.authFail = false;
  e2e.scenario = e2e.scenario || { inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] };
  e2e.googleTasks = e2e.googleTasks || {};
  e2e.tokenAccounts = e2e.tokenAccounts || { 'ya29.e2e': 'me@x.com' };
  e2e.todoTasks = e2e.todoTasks || {};
  e2e.outlookEvents = e2e.outlookEvents || {};
  e2e.drafts = e2e.drafts || {};
  e2e.driveItems = e2e.driveItems || {};
  e2e.driveByName = e2e.driveByName || {};
  e2e.seq = e2e.seq || 1;
  globalThis.__glanceE2e = e2e;

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  function empty(status) {
    return new Response(null, { status: status });
  }
  function graphFilterValue(search) {
    const m = String(search || '').match(/(?:^|[?&])(?:\$|%24)filter=([^&]*)/i);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (err) { return m[1]; }
  }

  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function glanceE2EFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let parsed;
    try { parsed = new URL(url); } catch (err) { return origFetch(input, init); }
    const host = parsed.hostname;
    const watched = host === 'graph.microsoft.com' || host === 'login.microsoftonline.com' ||
      host === 'tasks.googleapis.com' || host === 'gmail.googleapis.com' ||
      host === 'www.googleapis.com' || host === 'oauth2.googleapis.com' || host === 'theflow-ai.com';
    if (!watched) return origFetch(input, init);
    const method = String((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
    e2e.calls.push({ url: url, method: method, at: Date.now() });
    const path = decodeURIComponent(parsed.pathname);
    const scenario = e2e.scenario || {};

    if (host === 'login.microsoftonline.com') return Promise.resolve(json(400, { error: 'e2e-no-login' }));
    function googleAccountEmailFromAuth(initBag) {
      const auth = String((initBag && initBag.headers && (initBag.headers.Authorization || initBag.headers.authorization)) || '');
      const token = auth.replace(/^Bearer\s+/i, '');
      return (e2e.tokenAccounts || {})[token] || 'me@x.com';
    }
    function googleUserinfoBody(initBag) {
      const email = googleAccountEmailFromAuth(initBag);
      return {
        email: email,
        emailAddress: email,
        name: 'Glance E2E',
        given_name: 'Glance',
        family_name: 'E2E',
        verified_email: true
      };
    }
    if (host === 'gmail.googleapis.com' && /\/users\/me\/profile$/.test(path)) {
      const email = googleAccountEmailFromAuth(init);
      return Promise.resolve(json(200, { emailAddress: email, messagesTotal: 1, threadsTotal: 1, historyId: '1' }));
    }
    if (host === 'theflow-ai.com' || host === 'gmail.googleapis.com' || host === 'oauth2.googleapis.com') {
      return Promise.resolve(json(200, {}));
    }
    if (host === 'www.googleapis.com') {
      if (path.indexOf('/calendar/') >= 0) {
        const loc = scenario.chatGoogleLocation || '';
        const start = parsed.searchParams.get('timeMin');
        if (!loc || !start || !Number.isFinite(Date.parse(start))) return Promise.resolve(json(200, { items: [] }));
        const pinned = scenario.chatEventIso && Number.isFinite(Date.parse(scenario.chatEventIso)) ? scenario.chatEventIso : null;
        const when = pinned || new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
        return Promise.resolve(json(200, {
          items: [{ id: 'e2e-gcal-1', status: 'confirmed', location: loc, start: { dateTime: when } }]
        }));
      }
      if (/\/oauth2\/(v2|v3)\/userinfo/.test(path)) {
        return Promise.resolve(json(200, googleUserinfoBody(init)));
      }
      if (path.indexOf('/oauth2/') >= 0 || path.indexOf('/drive/') >= 0) {
        return Promise.resolve(json(200, { files: [], items: [] }));
      }
      return Promise.resolve(json(200, {}));
    }

    if (host === 'tasks.googleapis.com') {
      const one = path.match(/\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      const col = path.match(/\/lists\/([^/]+)\/tasks$/);
      if (one) {
        const id = one[2];
        if (method === 'DELETE') {
          delete e2e.googleTasks[id];
          return Promise.resolve(empty(204));
        }
        const task = e2e.googleTasks[id];
        return Promise.resolve(task ? json(200, task) : json(404, { error: { message: 'missing' } }));
      }
      const knownList = (id) => id === 'glance-list' || id === '@default';
      if (col && !knownList(col[1])) return Promise.resolve(json(404, { error: { code: 404, message: 'Invalid task list ID', status: 'NOT_FOUND' } }));
      if (col && method === 'POST') {
        const id = 'e2e-gtask-' + (e2e.seq++);
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        const task = { kind: 'tasks#task', id: id, title: posted.title || '', status: 'needsAction' };
        if (posted.notes) task.notes = posted.notes;
        if (posted.due) task.due = String(posted.due).slice(0, 10) + 'T00:00:00.000Z';
        e2e.googleTasks[id] = task;
        return Promise.resolve(json(200, task));
      }
      const oneList = path.match(/\/users\/@me\/lists\/([^/]+)$/);
      if (oneList) {
        return Promise.resolve(knownList(oneList[1])
          ? json(200, { kind: 'tasks#taskList', id: oneList[1] === '@default' ? 'glance-list' : oneList[1], title: 'Glance' })
          : json(404, { error: { code: 404, message: 'Invalid task list ID', status: 'NOT_FOUND' } }));
      }
      if (path.indexOf('/users/') >= 0 && path.indexOf('/lists') >= 0) {
        return Promise.resolve(json(200, { items: [{ id: 'glance-list', title: 'Glance' }] }));
      }
      return Promise.resolve(json(404, { error: { message: 'e2e-unmocked', path: path } }));
    }

    if (host === 'graph.microsoft.com') {
      const attItem = path.match(/\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/);
      if (attItem) {
        const messageId = attItem[1];
        const attachmentId = attItem[2];
        const list = (scenario.attachments && scenario.attachments[messageId]) || [];
        const row = list.find((a) => a && a.id === attachmentId) || { id: attachmentId, name: 'file.bin' };
        return Promise.resolve(json(200, {
          id: attachmentId,
          name: row.name || 'file.bin',
          contentType: row.contentType || 'application/octet-stream',
          size: row.size || 3,
          contentBytes: row.contentBytes || 'ZTJlLXBkZg=='
        }));
      }
      const att = path.match(/\/me\/messages\/([^/]+)\/attachments$/);
      if (att && method === 'GET') {
        const id = att[1];
        if (scenario.attachmentFailIds && scenario.attachmentFailIds.indexOf(id) >= 0) {
          return Promise.resolve(json(500, { error: { message: 'unread' } }));
        }
        const list = (scenario.attachments && scenario.attachments[id]) || [];
        return Promise.resolve(json(200, { value: list }));
      }
      if (att && method === 'POST') {
        return Promise.resolve(json(201, { id: 'e2e-att-' + (e2e.seq++) }));
      }
      // SharePoint: sites found by name, and each site's own library (the same item store as OneDrive, keyed with the site id).
      const SITES = scenario.sites || [{ id: 'contoso.sharepoint.com,s1,w1', displayName: 'Marketing', name: 'marketing', webUrl: 'https://contoso.sharepoint.com/sites/marketing' }];
      if (/\/sites$/.test(path) && method === 'GET') {
        const q = String(parsed.searchParams.get('search') || '').toLowerCase();
        return Promise.resolve(json(200, { value: SITES.filter((x) => (String(x.displayName) + ' ' + String(x.name)).toLowerCase().indexOf(q) >= 0) }));
      }
      const siteOne = path.match(/\/sites\/([^/]+)$/);
      if (siteOne && method === 'GET') {
        const hit = SITES.find((x) => x.id === siteOne[1]);
        return Promise.resolve(hit ? json(200, hit) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const siteContent = path.match(/\/sites\/([^/]+)\/drive\/root:\/(.+):\/content$/);
      if (siteContent && method === 'PUT') {
        const key = siteContent[1] + '/' + siteContent[2];
        if (/conflictBehavior=fail/.test(parsed.search || '') && e2e.driveByName[key]) return Promise.resolve(json(409, { error: { code: 'nameAlreadyExists' } }));
        const id = 'e2e-spfile-' + (e2e.seq++);
        const bodyLen = init && init.body && (init.body.byteLength != null ? init.body.byteLength : init.body.length);
        const item = { id: id, name: siteContent[2].split('/').pop(), webUrl: 'https://contoso.sharepoint.com/sites/marketing/Shared Documents/' + siteContent[2], file: { mimeType: (init && init.headers && init.headers['Content-Type']) || 'application/octet-stream' }, size: bodyLen || 1, eTag: '"{e2e-' + id + '},1"', lastModifiedDateTime: '2026-10-25T09:00:00Z' };
        item.__key = key;
        item.__site = siteContent[1];
        e2e.driveItems[id] = item;
        e2e.driveByName[key] = item;
        e2e.drivePuts = (e2e.drivePuts || []).concat([key]);
        return Promise.resolve(json(201, item));
      }
      const siteItem = path.match(/\/sites\/([^/]+)\/drive\/items\/([^/]+)$/);
      if (siteItem) {
        const id = siteItem[2];
        const cur = e2e.driveItems[id];
        if (method === 'DELETE') {
          if (cur && cur.__key) delete e2e.driveByName[cur.__key];
          e2e.driveDeletes = (e2e.driveDeletes || []).concat([id]);
          delete e2e.driveItems[id];
          return Promise.resolve(empty(204));
        }
        return Promise.resolve(cur && cur.__site === siteItem[1] ? json(200, cur) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const driveContent = path.match(/\/me\/drive\/root:\/(.+):\/content$/);
      if (driveContent && scenario.driveUnauthorized) {
        return Promise.resolve(json(401, { error: { code: 'InvalidAuthenticationToken' } }));
      }
      if (driveContent && method === 'PUT') {
        const key = driveContent[1];
        // conflictBehavior=fail on a name that is taken is a 409, as Graph answers; nothing is replaced.
        if (/conflictBehavior=fail/.test(parsed.search || '') && e2e.driveByName[key]) {
          return Promise.resolve(json(409, { error: { code: 'nameAlreadyExists' } }));
        }
        const id = 'e2e-file-' + (e2e.seq++);
        const bodyLen = init && init.body && (init.body.byteLength != null ? init.body.byteLength : init.body.length);
        const item = { id: id, name: decodeURIComponent(key.split('/').pop()), webUrl: 'https://onedrive.live.com/file/' + id, parentReference: { path: '/drive/root:/' + key.split('/').slice(0, -1).join('/') }, file: { mimeType: (init && init.headers && init.headers['Content-Type']) || 'application/octet-stream' }, size: bodyLen || 1, eTag: '"{e2e-' + id + '},1"', lastModifiedDateTime: '2026-10-21T09:00:00Z' };
        item.__key = key;
        e2e.driveItems[id] = item;
        e2e.driveByName[key] = item;
        e2e.drivePuts = (e2e.drivePuts || []).concat([key]);
        return Promise.resolve(json(201, item));
      }
      const driveRoot = path.match(/\/me\/drive\/root:\/(.+)$/);
      if (driveRoot && method === 'GET') {
        const item = e2e.driveByName[driveRoot[1]];
        return Promise.resolve(item ? json(200, item) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const driveItem = path.match(/\/me\/drive\/items\/([^/]+)$/);
      if (driveItem) {
        const id = driveItem[1];
        if (method === 'DELETE') {
          const gone = e2e.driveItems[id];
          if (gone && gone.__key) delete e2e.driveByName[gone.__key];
          e2e.driveDeletes = (e2e.driveDeletes || []).concat([id]);
          delete e2e.driveItems[id];
          return Promise.resolve(empty(204));
        }
        const item = e2e.driveItems[id];
        return Promise.resolve(item ? json(200, item) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const createdReply = path.match(/\/me\/messages\/([^/]+)\/createReply$/);
      if (createdReply && method === 'POST') {
        const id = 'e2e-draft-' + (e2e.seq++);
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        e2e.drafts[id] = {
          id: id,
          isDraft: true,
          subject: 'RE: e2e',
          body: { contentType: 'Text', content: posted.comment || '' },
          toRecipients: []
        };
        return Promise.resolve(json(201, e2e.drafts[id]));
      }
      // Outlook calendar events. An online meeting gets a Teams join link and, on read, Microsoft's
      // own join block appended to the body, as Graph does. scenario.eventNoTeams leaves the link out;
      // scenario.eventDropsRule stores the event without its repeat rule.
      const eventOne = path.match(/\/me\/events\/([^/?]+)$/);
      const eventCol = path.match(/\/me\/events$/);
      if (eventCol && method === 'POST') {
        const id = 'e2e-event-' + (e2e.seq++);
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        const stored = Object.assign({}, posted, { id: id, isCancelled: false, webLink: 'https://outlook.office.com/calendar/item/' + id, organizer: { emailAddress: { address: 'glance.salisapan@outlook.com' } } });
        ['start', 'end'].forEach((k) => {
          if (stored[k] && stored[k].dateTime && !/\./.test(stored[k].dateTime)) stored[k] = { dateTime: stored[k].dateTime + '.0000000', timeZone: stored[k].timeZone };
        });
        if (posted.isOnlineMeeting === true && !scenario.eventNoTeams) {
          stored.onlineMeeting = { joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_e2e%40thread.v2/0?context=%7b%7d' };
        } else {
          stored.isOnlineMeeting = false;
          stored.onlineMeeting = null;
        }
        if (scenario.eventDropsRule) stored.recurrence = null;
        else if (stored.recurrence == null) stored.recurrence = null;
        e2e.outlookEvents[id] = stored;
        e2e.lastEvent = id;
        return Promise.resolve(json(201, { id: id, webLink: stored.webLink }));
      }
      // Only when a spec seeded Outlook events; otherwise the scenario's place events (below) answer.
      if (/\/me\/calendarView$/.test(path) && method === 'GET' && Object.keys(e2e.outlookEvents || {}).length) {
        return Promise.resolve(json(200, { value: Object.values(e2e.outlookEvents).map((ev) => JSON.parse(JSON.stringify(ev))) }));
      }
      if (eventOne) {
        const id = eventOne[1];
        if (method === 'DELETE') {
          delete e2e.outlookEvents[id];
          return Promise.resolve(empty(204));
        }
        const event = e2e.outlookEvents[id];
        if (!event) return Promise.resolve(json(404, { error: { message: 'missing' } }));
        if (method === 'PATCH') {
          let patch = {};
          try { patch = JSON.parse((init && init.body) || '{}'); } catch (err) { patch = {}; }
          Object.assign(event, patch);
          if (patch.isOnlineMeeting === true && !scenario.eventNoTeams) {
            event.onlineMeeting = { joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_e2e_patch%40thread.v2/0?context=%7b%7d' };
          } else if (patch.isOnlineMeeting === false) {
            event.onlineMeeting = null;
          }
          return Promise.resolve(json(200, event));
        }
        const shown = JSON.parse(JSON.stringify(event));
        if (shown.isOnlineMeeting === true && shown.body && !/Microsoft Teams/.test(String(shown.body.content || ''))) {
          shown.body = { contentType: 'html', content: '<div>' + String((shown.body && shown.body.content) || '') + '</div><div>________________________________________________________________________________</div><div>Microsoft Teams meeting</div><div><a href="' + shown.onlineMeeting.joinUrl + '">Join the meeting now</a></div>' };
        }
        return Promise.resolve(json(200, shown));
      }
      const todoOne = path.match(/\/me\/todo\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      const todoCol = path.match(/\/me\/todo\/lists\/([^/]+)\/tasks$/);
      if (todoOne) {
        const id = todoOne[2];
        if (method === 'DELETE') {
          delete e2e.todoTasks[id];
          return Promise.resolve(empty(204));
        }
        if (method === 'GET' && scenario.todoVerifyFail) {
          return Promise.resolve(json(404, { error: { message: 'verify-fail' } }));
        }
        const task = e2e.todoTasks[id];
        if (task && method === 'PATCH') {
          let patch = {};
          try { patch = JSON.parse((init && init.body) || '{}'); } catch (err) { patch = {}; }
          if (patch.status === 'completed') task.completedDateTime = { dateTime: '2026-10-25T09:00:00.0000000', timeZone: 'UTC' };
          if (patch.status === 'notStarted') delete task.completedDateTime;
          Object.assign(task, patch);
          return Promise.resolve(json(200, task));
        }
        return Promise.resolve(task ? json(200, task) : json(404, { error: { message: 'missing' } }));
      }
      if (todoCol && method === 'POST') {
        const id = 'e2e-todo-' + (e2e.seq++);
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        // Read-back compares this body with the POST. A stand-in title is a mismatch.
        const stored = { id: id, status: 'notStarted' };
        ['title', 'body', 'dueDateTime', 'status', 'importance', 'recurrence', 'isReminderOn', 'reminderDateTime'].forEach((key) => {
          if (posted[key] != null) stored[key] = posted[key];
        });
        e2e.todoTasks[id] = stored;
        return Promise.resolve(json(200, stored));
      }
      // Planner, like Graph: the person's plans, a task with an entity tag, and a delete that needs If-Match.
      if (path.endsWith('/me/planner/plans') && method === 'GET') {
        return Promise.resolve(json(200, { value: scenario.plannerPlans || [{ id: 'plan-web', title: 'Website relaunch' }, { id: 'plan-off', title: 'Offsite' }] }));
      }
      if (path.endsWith('/planner/tasks') && method === 'POST') {
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        const id = 'e2e-planner-' + (e2e.seq++);
        e2e.plannerTasks = e2e.plannerTasks || {};
        const stored = Object.assign({ id: id, '@odata.etag': 'W/"p1"' }, posted);
        e2e.plannerTasks[id] = stored;
        return Promise.resolve(json(201, stored));
      }
      const plannerOne = path.match(/\/planner\/tasks\/([^/]+)$/);
      if (plannerOne) {
        const tasksNow = e2e.plannerTasks || {};
        const task = tasksNow[decodeURIComponent(plannerOne[1])];
        if (!task) return Promise.resolve(json(404, { error: { message: 'missing' } }));
        if (method === 'DELETE') {
          const given = init && init.headers && (init.headers['If-Match'] || init.headers['if-match']);
          if (given !== task['@odata.etag']) return Promise.resolve(json(412, { error: { message: 'etag' } }));
          delete tasksNow[task.id];
          return Promise.resolve(empty(204));
        }
        return Promise.resolve(json(200, task));
      }
      if (path === '/v1.0/me/todo/lists' || path.endsWith('/me/todo/lists')) {
        return Promise.resolve(json(200, { value: [{ id: 'todo-list', wellknownListName: 'defaultList', displayName: 'Tasks' }] }));
      }
      if (path.indexOf('/me/mailFolders/inbox/messages') >= 0) {
        const search = parsed.search || '';
        if (scenario.inboxFilterFails && /\$orderby=/.test(search) && /\$filter=/.test(search)) {
          return Promise.resolve(json(400, { error: { code: 'ErrorInvalidUrlQueryFilter', message: 'restriction or sort order too complex' } }));
        }
        return Promise.resolve(json(200, { value: scenario.inbox || [] }));
      }
      if (path.indexOf('/me/mailFolders/sentitems/messages') >= 0) {
        return Promise.resolve(json(200, { value: scenario.sent || [] }));
      }
      // conversationId in $select is not a conversation lookup. Only a $filter
      // on conversationId is. A mailbox subject query selects conversationId
      // and must fall through to the subject filter below.
      if (path.indexOf('/me/messages') >= 0 && /conversationId/i.test(graphFilterValue(parsed.search))) {
        const filter = graphFilterValue(parsed.search);
        const convMatch = filter.match(/conversationId\s+eq\s+'([^']+)'/i);
        const convId = convMatch ? convMatch[1] : '';
        const enrich = (row) => {
          if (!row || !row.id) return row;
          const full = scenario.messages && scenario.messages[row.id];
          return full ? Object.assign({}, row, full) : row;
        };
        const pool = []
          .concat(scenario.conversation || [])
          .concat(scenario.inbox || [])
          .concat(scenario.sent || [])
          .concat(Object.values(scenario.messages || {}));
        const seen = new Set();
        const matched = [];
        for (let i = 0; i < pool.length; i++) {
          const row = pool[i];
          if (!row || !row.id || seen.has(row.id)) continue;
          if (convId && String(row.conversationId || '') !== convId) continue;
          seen.add(row.id);
          matched.push(enrich(row));
        }
        return Promise.resolve(json(200, { value: matched }));
      }
      if (path.indexOf('/me/mailboxSettings') >= 0) {
        return Promise.resolve(json(200, scenario.mailboxSettings || { timeFormat: 'h:mm tt', timeZone: 'UTC' }));
      }
      if (path.indexOf('/me/messages') >= 0 && (parsed.search.indexOf('$filter=') >= 0 || parsed.search.indexOf('%24filter') >= 0 || parsed.search.indexOf('$skip=') >= 0 || parsed.search.indexOf('$skiptoken') >= 0)) {
        if (scenario.mailboxOverflow) {
          const filler = [];
          for (let i = 0; i < 200; i++) {
            filler.push({ id: 'overflow-' + i, subject: 'overflow', conversationId: 'c-overflow', from: { emailAddress: { address: 'a@b.com' } }, receivedDateTime: '2026-10-08T10:00:00.000Z' });
          }
          return Promise.resolve(json(200, {
            value: filler,
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=more'
          }));
        }
        if (scenario.badNextLink) {
          return Promise.resolve(json(200, {
            value: (scenario.inbox || []).slice(0, 1),
            '@odata.nextLink': 'https://evil.example/me/messages?$skiptoken=x'
          }));
        }
        const search = decodeURIComponent(parsed.search || '');
        const matched = (scenario.mailbox || scenario.inbox || []).filter((m) => {
          if (!m) return false;
          const sub = String(m.subject || '');
          const from = String((m.from && m.from.emailAddress && m.from.emailAddress.address) || '');
          if (sub && search.indexOf(sub) < 0 && search.indexOf(sub.replace(/'/g, "''")) < 0) return false;
          if (from && search.toLowerCase().indexOf(from.toLowerCase()) < 0) return false;
          return true;
        });
        let top = 50;
        let skip = 0;
        const topM = search.match(/\$top=(\d+)/);
        const skipM = search.match(/\$skip=(\d+)/);
        if (topM) top = +topM[1];
        if (skipM) skip = +skipM[1];
        const slice = matched.slice(skip, skip + top);
        const body = { value: slice };
        if (skip + top < matched.length) {
          body['@odata.nextLink'] = 'https://graph.microsoft.com/v1.0/me/messages?$top=' + top + '&$skip=' + (skip + top) + '&$filter=' + encodeURIComponent('kept');
        }
        return Promise.resolve(json(200, body));
      }
      const msg = path.match(/\/me\/messages\/([^/]+)$/);
      if (msg) {
        const id = msg[1];
        if (e2e.drafts[id]) {
          if (method === 'DELETE') {
            delete e2e.drafts[id];
            return Promise.resolve(empty(204));
          }
          if (method === 'PATCH') {
            let patch = {};
            try { patch = JSON.parse((init && init.body) || '{}'); } catch (err) { patch = {}; }
            if (patch.body) e2e.drafts[id].body = patch.body;
            if (patch.subject) e2e.drafts[id].subject = patch.subject;
            return Promise.resolve(json(200, e2e.drafts[id]));
          }
          return Promise.resolve(json(200, e2e.drafts[id]));
        }
        const row = scenario.messages && Object.prototype.hasOwnProperty.call(scenario.messages, id) ? scenario.messages[id] : null;
        if (row && row.id) return Promise.resolve(json(200, row));
        return Promise.resolve(json(404, { error: { code: 'ErrorItemNotFound' } }));
      }
      if (path === '/v1.0/me' || path.endsWith('/me')) {
        if (scenario.meFail) return Promise.resolve(json(500, { error: { message: 'me-failed' } }));
        const me = scenario.me || { mail: 'glance.salisapan@outlook.com', userPrincipalName: 'glance.salisapan@outlook.com', displayName: 'Glance' };
        return Promise.resolve(json(200, me));
      }
      if (path.indexOf('/me/calendarView') >= 0 && method === 'GET') {
        const start = parsed.searchParams.get('startDateTime');
        const loc = scenario.chatLocation || '';
        if (!loc || !start || !Number.isFinite(Date.parse(start))) return Promise.resolve(json(200, { value: [] }));
        const pinned = scenario.chatEventIso && Number.isFinite(Date.parse(scenario.chatEventIso)) ? scenario.chatEventIso : null;
        const when = pinned || new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
        return Promise.resolve(json(200, {
          value: [{
            id: 'e2e-cal-1',
            isCancelled: false,
            location: { displayName: loc },
            start: { dateTime: when, timeZone: 'UTC' }
          }]
        }));
      }
      return Promise.resolve(json(404, { error: { message: 'e2e-unmocked', path: path } }));
    }
    return Promise.resolve(json(599, { error: 'e2e-unmocked' }));
  };

  e2e.googleAuthToken = function (interactive) {
    e2e.authCalls.push({ interactive: Boolean(interactive), at: Date.now() });
    if (e2e.authFail) return Promise.reject(new Error('The user did not approve access.'));
    return Promise.resolve(e2e.identityToken || 'ya29.e2e');
  };
  bindGlanceE2eWebAuth(e2e);

  const identity = chrome.identity;
  if (!identity) return { ok: true, authWritable: false, identity: false };
  const authStub = function (details, cb) {
    const interactive = Boolean(details && details.interactive);
    e2e.authCalls.push({ interactive: interactive, at: Date.now() });
    const done = typeof cb === 'function' ? cb : function () {};
    if (e2e.authFail) {
      try { chrome.runtime.lastError = { message: 'The user did not approve access.' }; } catch (err) { /* native lastError */ }
      done(undefined);
      return;
    }
    try { chrome.runtime.lastError = undefined; } catch (err2) { /* native lastError */ }
    done(e2e.identityToken || 'ya29.e2e');
  };
  const flowStub = function (details, cb) {
    e2e.flows.push({
      url: details && details.url,
      interactive: details ? details.interactive : undefined,
      at: Date.now()
    });
    const done = typeof cb === 'function' ? cb : function () {};
    try { chrome.runtime.lastError = { message: 'e2e-no-window' }; } catch (err) { /* native */ }
    done(undefined);
  };
  const removeStub = function (details, cb) {
    e2e.authCalls.push({ removeCached: true, at: Date.now() });
    if (typeof cb === 'function') cb();
  };
  function force(obj, name, value) {
    if (!obj) return 'missing';
    try {
      obj[name] = value;
      if (obj[name] === value) return 'assigned';
    } catch (err) { /* try defineProperty */ }
    try {
      Object.defineProperty(obj, name, { configurable: true, writable: true, value: value });
      if (obj[name] === value) return 'defined';
    } catch (err) { return 'frozen'; }
    return 'unchanged';
  }
  const proto = Object.getPrototypeOf(identity);
  const authHow = force(identity, 'getAuthToken', authStub) + (proto ? '/' + force(proto, 'getAuthToken', authStub) : '');
  const flowHow = force(identity, 'launchWebAuthFlow', flowStub);
  const removeHow = force(identity, 'removeCachedAuthToken', removeStub);
  let desc = null;
  try {
    const d = Object.getOwnPropertyDescriptor(identity, 'getAuthToken') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(identity), 'getAuthToken');
    desc = d ? { writable: d.writable, configurable: d.configurable } : null;
  } catch (err) { desc = null; }
  e2e.authWritable = identity.getAuthToken === authStub;
  return { ok: true, authWritable: e2e.authWritable, authHow: authHow, flowHow: flowHow, removeHow: removeHow, desc: desc };
}

async function boot() {
  const extDir = copyExtension();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-profile-'));
  const context = await chromium.launchPersistentContext(userData, {
    // Cloud sessions ship one Chromium whose build differs from this Playwright
    // pin. GLANCE_CHROMIUM=/opt/pw-browsers/chromium uses it; CI leaves it unset.
    executablePath: process.env.GLANCE_CHROMIUM || undefined,
    headless: false,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extDir,
      '--load-extension=' + extDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage'
    ]
  });

  const documents = new Map();
  await context.route(/https:\/\/(mail\.google\.com|outlook\.live\.com|web\.whatsapp\.com|www\.messenger\.com|messenger\.com|business\.facebook\.com|www\.business\.facebook\.com|www\.instagram\.com)\//, async (route) => {
    const req = route.request();
    const bare = req.url().split('#')[0];
    if (req.resourceType() === 'document' && documents.has(bare)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: documents.get(bare)
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  const consoleErrors = [];
  function noteError(source, text) {
    const line = source + ': ' + String(text || '').slice(0, 500);
    consoleErrors.push(line);
  }
  function watchWorker(sw) {
    if (!sw || sw.__glanceWatched) return;
    sw.__glanceWatched = true;
    sw.on('console', (msg) => { if (msg.type() === 'error') noteError('worker', msg.text()); });
    sw.on('pageerror', (err) => noteError('worker-pageerror', err && err.message ? err.message : err));
  }
  context.on('serviceworker', (next) => { worker = next; watchWorker(next); });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  watchWorker(worker);

  async function currentWorker() {
    const live = context.serviceWorkers();
    if (!live.length) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    else if (!live.includes(worker)) worker = live[0];
    return worker;
  }

  const harness = {
    context,
    extDir,
    documents,
    worker: null,
    page: null,
    keepPopup: false,
    consoleErrors
  };

  async function evalWorker(fn, arg) {
    const w = await currentWorker();
    harness.worker = w;
    return w.evaluate(fn, arg);
  }

  const hooked = await evalWorker(installE2EHooks);
  harness.identityHook = hooked;
  let e2eDefaultSwitches = {};
  try { e2eDefaultSwitches = JSON.parse(String(process.env.GLANCE_E2E_SWITCHES || '{}')); } catch (err) { e2eDefaultSwitches = {}; }
  if (Object.keys(e2eDefaultSwitches).length) {
    await evalWorker(async (sw) => {
      await chrome.storage.local.set({ glanceSwitches: sw });
    }, e2eDefaultSwitches);
  }
  await evalWorker(() => { globalThis.__glanceE2e.authCalls = []; globalThis.__glanceE2e.calls = []; });

  const extensionId = worker.url().split('/')[2];
  harness.extensionId = extensionId;

  function popupUrl() {
    return 'chrome-extension://' + extensionId + '/popup/popup.html';
  }

  async function closeStrayPopups() {
    for (const p of context.pages()) {
      if (!harness.keepPopup && p.url().indexOf('popup/popup.html') >= 0) {
        await p.close().catch(() => {});
      }
    }
  }
  await closeStrayPopups();

  harness.seed = async function seed(data) {
    await evalWorker(async (bag) => {
      const e = globalThis.__glanceE2e;
      if (e && e.todoTasks) {
        const rows = (bag && bag.log) || [];
        rows.forEach((row) => {
          if (!row || row.kind !== 'written' || row.deleted === true || row.glanceDeleted === true) return;
          const todo = row.system === 'microsoft/todo' || row.connectorId === 'outlookTask' || row.connectorId === 'microsoftTodo';
          if (!todo) return;
          const id = row.externalId || (row.ref && (row.ref.taskId || row.ref.externalId));
          if (!id || e.todoTasks[id]) return;
          e.todoTasks[id] = { id: id, title: row.actionTitle || row.label || 'e2e', status: 'notStarted' };
        });
      }
      await chrome.storage.local.set(bag);
    }, data);
  };

  harness.storage = async function storage() {
    return evalWorker(() => new Promise((resolve) => chrome.storage.local.get(null, resolve)));
  };

  harness.apiCalls = async function apiCalls() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.calls) || []);
  };

  harness.authCalls = async function authCalls() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.authCalls) || []);
  };

  harness.flows = async function flows() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.flows) || []);
  };

  harness.setAuthFail = async function setAuthFail(fail) {
    await evalWorker((on) => { globalThis.__glanceE2e.authFail = Boolean(on); }, fail);
  };

  harness.setScenario = async function setScenario(scenario) {
    await evalWorker((next) => { globalThis.__glanceE2e.scenario = next; }, scenario || {});
  };

  harness.now = async function now() {
    return evalWorker(() => Date.now());
  };

  // Runs in the service worker. Content-script globals live in the isolated
  // world, so a page.evaluate on the mail tab cannot see them.
  harness.evaluateWorker = function evaluateWorker(fn, arg) {
    return evalWorker(fn, arg);
  };

  harness.reset = async function reset() {
    harness.keepPopup = false;
    // Close the mail and the panel before wiping storage. A page that is
    // still scanning writes its log back after a clear, and the next mail
    // then inherits that promise.
    const closing = [];
    for (const p of context.pages()) {
      const url = p.url();
      if (url.indexOf('popup/popup.html') >= 0 || url.indexOf('mail.google.com') >= 0 || url.indexOf('outlook.live.com') >= 0 || url.indexOf('messenger.com') >= 0 || url.indexOf('web.whatsapp.com') >= 0 || url.indexOf('business.facebook.com') >= 0 || url.indexOf('instagram.com') >= 0 || url.indexOf('/dev/messenger-fixture.html') >= 0) {
        closing.push(p.close().catch(() => {}));
      }
    }
    await Promise.all(closing);
    harness.page = null;
    let e2eDefaultSwitches = {};
    try { e2eDefaultSwitches = JSON.parse(String(process.env.GLANCE_E2E_SWITCHES || '{}')); } catch (err) { e2eDefaultSwitches = {}; }
    await evalWorker(installE2EHooks);
    await evalWorker(async (sw) => {
      await chrome.storage.local.clear();
      if (sw && Object.keys(sw).length) await chrome.storage.local.set({ glanceSwitches: sw });
      const e = globalThis.__glanceE2e;
      e.calls = [];
      e.authCalls = [];
      e.flows = [];
      e.authFail = false;
      e.scenario = { inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] };
      e.googleTasks = {};
      e.todoTasks = {};
      e.outlookEvents = {};
      e.drafts = {};
      e.driveItems = {};
      e.driveByName = {};
      e.seq = 1;
      delete e.httpOrigin;
      if (globalThis.FlowGoogleLaneAccount && globalThis.FlowGoogleLaneAccount.forget) globalThis.FlowGoogleLaneAccount.forget();
    }, e2eDefaultSwitches);
  };

  async function openDocument(url, html) {
    documents.set(url.split('#')[0], html);
    const page = await context.newPage();
    page.on('pageerror', (err) => noteError('page', err && err.message ? err.message : err));
    page.on('console', (msg) => { if (msg.type() === 'error') noteError('page', msg.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    return page;
  }

  async function registerOutlookGraphMessage(o) {
    const mail = o || {};
    const id = mail.id;
    if (!id) return;
    await evalWorker((m) => {
      const e = globalThis.__glanceE2e;
      const prev = e.scenario || {};
      const sc = Object.assign({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] }, prev);
      if (prev.me) sc.me = prev.me;
      if (prev.meFail) sc.meFail = prev.meFail;
      if (prev.attachments) sc.attachments = Object.assign({}, prev.attachments, sc.attachments);
      const urlId = String(m.id || '');
      if (!urlId) return;
      const isConvUrl = /^AQQk/i.test(urlId);
      let convId = m.convId ? String(m.convId) : (isConvUrl ? urlId : '');
      let msgId = m.graphMessageId ? String(m.graphMessageId) : (isConvUrl ? '' : urlId);
      function convPeersFor(id) {
        const pool = (sc.conversation || [])
          .concat(sc.inbox || [])
          .concat(sc.sent || [])
          .concat(Object.values(sc.messages || {}));
        const seen = new Set();
        const out = [];
        for (let i = 0; i < pool.length; i++) {
          const peer = pool[i];
          if (!peer || !peer.id || seen.has(peer.id)) continue;
          if (String(peer.conversationId || '') !== id) continue;
          seen.add(peer.id);
          out.push(peer);
        }
        return out;
      }
      function sizeFromLabel(label) {
        const raw = String(label || '').trim();
        const kb = raw.match(/^([\d.]+)\s*KB$/i);
        if (kb) return Math.round(parseFloat(kb[1]) * 1024);
        const b = raw.match(/^([\d.]+)\s*B$/i);
        if (b) return Math.round(parseFloat(b[1]));
        return null;
      }
      function pickConvPeer(peers) {
        if (!peers.length) return null;
        if (m.graphMessageId) {
          const byId = peers.find((peer) => String(peer.id) === String(m.graphMessageId));
          if (byId) return byId;
        }
        const attHints = [];
        (m.attachments || []).forEach((a) => {
          if (!a) return;
          if (a.name) attHints.push(String(a.name));
          if (a.titleName) attHints.push(String(a.titleName));
        });
        const wantSize = m.attachments && m.attachments[0] && sizeFromLabel(m.attachments[0].sizeLabel);
        if (wantSize != null) {
          const bySize = peers.filter((peer) => {
            const atts = sc.attachments && sc.attachments[peer.id];
            return atts && atts.some((att) => att && Math.abs(Number(att.size || 0) - wantSize) <= 512);
          });
          if (bySize.length === 1) return bySize[0];
        }
        if (attHints.length) {
          for (let i = 0; i < peers.length; i++) {
            const atts = sc.attachments && sc.attachments[peers[i].id];
            if (!atts || !atts.length) continue;
            for (let j = 0; j < atts.length; j++) {
              const an = String(atts[j].name || '');
              for (let k = 0; k < attHints.length; k++) {
                const hint = attHints[k];
                if (an === hint || an.indexOf(hint) >= 0 || hint.indexOf(an) >= 0) return peers[i];
              }
            }
          }
        }
        const whenOpen = m.receivedDateTime || m.received || '';
        if (whenOpen) {
          const byWhen = peers.find((peer) => String(peer.receivedDateTime || '') === String(whenOpen));
          if (byWhen) return byWhen;
        }
        const subj = m.subject ? String(m.subject) : '';
        if (subj) {
          const subPeers = peers.filter((peer) => String(peer.subject || '') === subj);
          if (subPeers.length === 1) return subPeers[0];
        }
        return peers.find((peer) => /^AQMk/i.test(String(peer.id || ''))) || peers[0];
      }
      if (isConvUrl && !msgId) {
        const hit = pickConvPeer(convPeersFor(convId));
        if (hit && hit.id) msgId = String(hit.id);
      }
      if (!msgId) msgId = isConvUrl ? (urlId + '-open') : urlId;
      if (!convId) convId = 'conv-' + msgId;
      const toList = Array.isArray(m.to) ? m.to : ['glance.salisapan@outlook.com'];
      const ccList = Array.isArray(m.cc) ? m.cc : [];
      const row = {
        id: msgId,
        conversationId: convId,
        subject: m.subject || 'Hello',
        receivedDateTime: m.receivedDateTime || m.received || new Date().toISOString(),
        from: { emailAddress: { address: String(m.senderEmail || 'ai.local.flow@gmail.com').toLowerCase(), name: m.senderName || '' } },
        sender: { emailAddress: { address: String(m.senderEmail || 'ai.local.flow@gmail.com').toLowerCase(), name: m.senderName || '' } },
        toRecipients: toList.map((address) => ({ emailAddress: { address: String(address || '').toLowerCase() } })),
        ccRecipients: ccList.map((address) => ({ emailAddress: { address: String(address || '').toLowerCase() } })),
        body: { contentType: 'text', content: String(m.body || '') },
        bodyPreview: String(m.body || '').slice(0, 255)
      };
      const existing = sc.messages[msgId] || (sc.conversation || []).find((peer) => peer && peer.id === msgId);
      if (existing) {
        if (existing.from) row.from = existing.from;
        if (existing.sender) row.sender = existing.sender;
        if (existing.subject) row.subject = existing.subject;
        if (existing.conversationId) row.conversationId = existing.conversationId;
        if (existing.receivedDateTime && !m.receivedDateTime && !m.received) row.receivedDateTime = existing.receivedDateTime;
        if (existing.hasAttachments != null) row.hasAttachments = existing.hasAttachments;
        if (existing.body && existing.body.content && (!m.body || !String(m.body).trim())) {
          row.body = existing.body;
          row.bodyPreview = existing.bodyPreview || row.bodyPreview;
        }
      }
      const atts = sc.attachments && sc.attachments[msgId];
      if (atts && atts.length) row.hasAttachments = true;
      sc.messages[msgId] = row;
      const convPeers = (sc.conversation || []).filter((peer) => peer && peer.id !== msgId);
      const sameConv = convPeers.filter((peer) => String(peer.conversationId || '') === convId);
      sc.conversation = sameConv.concat([row]);
      e.scenario = sc;
    }, mail);
  }

  harness.openOutlook = async function openOutlook(opts) {
    const o = opts || {};
    if (!o.convId && o.id && /^AQMk/i.test(String(o.id))) {
      o.convId = 'conv-' + String(o.id);
    }
    await registerOutlookGraphMessage(o);
    const id = o.id;
    const url = outlookUrl(id);
    return openDocument(url, outlookHtml(o));
  };

  function watchSend() {
    return context.addInitScript(() => {
      window.__glanceSendClicks = 0;
      document.addEventListener('click', (ev) => {
        const label = ev.target && ev.target.getAttribute && (ev.target.getAttribute('aria-label') || '');
        if (/^send$/i.test(String(label || ''))) window.__glanceSendClicks += 1;
      }, true);
    });
  }

  harness.openMessenger = async function openMessenger(html) {
    await watchSend();
    return openDocument('https://www.messenger.com/t/100012345678', html);
  };

  harness.openWhatsApp = async function openWhatsApp(html) {
    await watchSend();
    return openDocument('https://web.whatsapp.com/', html);
  };

  harness.openInstagram = async function openInstagram(html) {
    await watchSend();
    return openDocument('https://www.instagram.com/direct/t/abc/', html);
  };

  harness.openFixture = async function openFixture(search) {
    const url = 'chrome-extension://' + extensionId + '/dev/messenger-fixture.html' + (search || '');
    const page = await context.newPage();
    page.on('pageerror', (err) => noteError('page', err && err.message ? err.message : err));
    page.on('console', (msg) => { if (msg.type() === 'error') noteError('page', msg.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    return page;
  };

  harness.openBusiness = async function openBusiness(html) {
    await watchSend();
    return openDocument('https://business.facebook.com/latest/inbox/all/?selected_item_id=bs-existing', html);
  };

  harness.openGmail = async function openGmail(opts) {
    const o = opts || {};
    const url = gmailUrl(o.messageId, o.accountIndex);
    return openDocument(url, gmailHtml(o));
  };

  harness.openGmailHtml = async function openGmailHtml(html, opts) {
    const o = opts || {};
    const url = gmailUrl(o.messageId, o.accountIndex);
    return openDocument(url, html);
  };

  harness.seedOutlook = async function seedOutlook(extra, authOpts) {
    const bag = Object.assign({
      onboarded: true,
      outlookAuth: outlookAuth(authOpts)
    }, extra || {});
    await harness.seed(bag);
  };

  harness.seedGmail = async function seedGmail(extra) {
    await harness.seed(Object.assign({
      onboarded: true,
      connectorId: 'googleTasks',
      googleTasksAuth: { taskListId: 'glance-list' },
      // Headless Chrome has no browser sign-in. The lane asks identity first,
      // then this stored Connect token. Production never reads an e2e hook for it.
      googleWebAuth: { accessToken: 'ya29.e2e', expiresAt: Date.now() + 60 * 60 * 1000 },
      googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' },
      googleGrantedScopes: {
        version: manifestGoogleGrantedVersion(),
        status: 'granted',
        source: 'chrome',
        at: Date.now()
      }
    }, extra || {}));
  };

  harness.openPopup = async function openPopup() {
    harness.keepPopup = true;
    const page = await context.newPage();
    await page.addInitScript(() => {
      const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = function (msg, cb) {
        if (msg && msg.type === 'flow:build-stamp' && typeof cb === 'function') {
          return orig(msg, (r) => {
            try { document.documentElement.setAttribute('data-glance-stamp', (r && r.build) || ''); } catch (e) { /* page gone */ }
            cb(r);
          });
        }
        return orig(msg, cb);
      };
    });
    await page.goto(popupUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    return page;
  };

  const popup = await context.newPage();
  await popup.goto(popupUrl(), { waitUntil: 'commit', timeout: 30000 });
  const enabled = await popup.evaluate(() => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'flow:surface-enable', id: 'outlook' }, (r) => {
      resolve(r || { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
  }));
  await popup.close().catch(() => {});
  if (!enabled || !enabled.ok) throw new Error('OUTLOOK_SURFACE_FAILED:' + JSON.stringify(enabled));

  harness.close = async function close() {
    await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  };

  harness.outlookAuth = outlookAuth;
  return harness;
}

module.exports = { boot, outlookAuth, copyExtension };
