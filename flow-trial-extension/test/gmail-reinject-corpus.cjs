// After an update or a browser start, already-open Gmail tabs get the
// content scripts again. A live copy is left alone. An orphaned copy's
// chips are removed. The tab is not reloaded.
// Run: node test/gmail-reinject-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const EXT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(EXT, 'src', 'gmail-reinject.js'), 'utf8');
const background = fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');

check('install, update, and startup inject open Gmail tabs and migrate a prior Google connection once', /onInstalled\.addListener\(\(details\) => \{\s*const reason = details && details\.reason;\s*if \(reason !== 'install' && reason !== 'update'\) return;\s*migrateGoogleEverConnected\(\);\s*injectOpenGmailTabs\(\);/.test(background) && /onStartup\.addListener\(\(\) => \{\s*migrateGoogleEverConnected\(\);\s*injectOpenGmailTabs\(\);/.test(background));
check('injectSurfaceIntoOpenTabs sends Gmail through the no-reload reinject', /id === 'gmail'/.test(background) && /mail\.google\.com/.test(background) && /injectSurfaceIntoOpenTabs\('gmail'/.test(background) && /reload:\s*false/.test(background));
const surfaceFn = background.slice(background.indexOf('async function injectSurfaceIntoOpenTabs'), background.indexOf('async function readSurfaces'));
check('the Gmail branch returns before any tab reload', surfaceFn.indexOf("id === 'gmail'") >= 0 && surfaceFn.indexOf('reinjectGmailTabs') >= 0 && surfaceFn.indexOf('reinjectGmailTabs') < surfaceFn.indexOf('tabs.reload'));
check('reinject does not reload the tab', src.indexOf('tabs.reload') < 0 && src.indexOf('chrome.tabs.reload') < 0 && src.indexOf('executeScript') > 0);
check('the Gmail watcher guards against a second injection', gmail.indexOf('__glanceGmailGuard') > 0 && gmail.indexOf('globalThis.__glanceGmailGuard === true') > 0);
check('the orphan checks chrome.runtime.id and disconnects', gmail.indexOf('chrome.runtime.id') > 0 && gmail.indexOf('observer.disconnect') > 0 && gmail.indexOf('Extension context invalidated') > 0);
check('the calendar payload reads the stored zone', gmail.indexOf('glanceTimeZone') > 0 && gmail.indexOf('glanceUserTimeZone') > 0);

const hosts = [{ removed: false, remove() { this.removed = true; } }];
const injected = [];
const sandbox = {
  console,
  document: { querySelectorAll: (sel) => (sel === '.flow-chip-host' ? hosts.filter((h) => !h.removed) : []) },
  chrome: {
    runtime: {
      id: 'ext',
      getManifest: () => manifest
    },
    tabs: { query: async () => [{ id: 7 }] },
    scripting: {
      insertCSS: async () => {},
      executeScript: async (opts) => {
        if (opts.files) {
          injected.push(opts.files);
          sandbox.__glanceGmailGuard = true;
          hosts.forEach((h) => { h.removed = true; });
          return [];
        }
        return [{ result: opts.func() }];
      }
    }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'gmail-reinject.js' });

function bootOrphan() {
  let touches = 0;
  const observers = [];
  const timers = [];
  let timerSeq = 1;
  let now = 0;
  const liveChrome = {
    runtime: {
      id: 'ext',
      sendMessage() { touches += 1; },
      lastError: null,
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get() { touches += 1; return Promise.resolve({}); },
        set() { touches += 1; return Promise.resolve(); },
        remove() { touches += 1; return Promise.resolve(); }
      },
      onChanged: { addListener() { touches += 1; } }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const page = {
    console,
    document: {
      body: {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    MutationObserver: function MutationObserver(cb) {
      this.cb = cb;
      this.connected = false;
      observers.push(this);
    },
    setTimeout(fn, ms) {
      const id = timerSeq++;
      timers.push({ id, fn, at: now + (ms || 0) });
      return id;
    },
    clearTimeout(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    FlowStorage: { get() { return Promise.resolve({ onboarded: false }); } },
    navigator: { language: 'en' },
    Intl,
    Date,
    chrome: liveChrome
  };
  page.MutationObserver.prototype.observe = function () { this.connected = true; };
  page.MutationObserver.prototype.disconnect = function () { this.connected = false; };
  page.MutationObserver.prototype.takeRecords = function () { return []; };
  page.globalThis = page;
  vm.createContext(page);
  vm.runInContext(gmail, page, { filename: 'content-gmail.js' });
  return {
    page,
    observers,
    flush(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      due.forEach((t) => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      });
      due.forEach((t) => t.fn());
    },
    mutate() {
      observers.forEach((o) => { if (o.connected) o.cb([]); });
    },
    kill() {
      touches = 0;
      page.chrome = new Proxy({}, {
        get() {
          touches += 1;
          throw new Error('Extension context invalidated');
        }
      });
    },
    touches() { return touches; }
  };
}

sandbox.reinjectGmailTabs().then((first) => {
  check('an orphaned Gmail tab is reinjected once and its chips are removed', first === 1 && injected.length === 1 && hosts[0].removed === true && injected[0].indexOf('src/content-gmail.js') >= 0, { first, injected: injected.length, removed: hosts[0].removed });
  return sandbox.reinjectGmailTabs();
}).then((second) => {
  check('a live guard skips a second injection', second === 0 && injected.length === 1, { second, injected: injected.length });
  return new Promise((resolve) => setImmediate(resolve));
}).then(() => {
  const orphan = bootOrphan();
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    orphan.flush(500);
    orphan.kill();
    orphan.mutate();
    orphan.flush(500);
    const after = orphan.touches();
    const disconnected = orphan.observers.length > 0 && orphan.observers.every((o) => o.connected === false);
    check('an invalidated Gmail copy makes one chrome call and tears down', after === 1 && disconnected, { touches: after, observers: orphan.observers.length, disconnected });
    orphan.mutate();
    orphan.flush(500);
    check('a later mutation does not touch chrome again', orphan.touches() === 1, orphan.touches());
  });
}).then(() => {
  const rejections = [];
  const onRejection = (err) => { rejections.push(String(err && err.message || err)); };
  process.on('unhandledRejection', onRejection);
  function matchSel(node, sel) {
    if (!node || !sel) return false;
    if (sel.indexOf(',') >= 0) {
      const parts = sel.split(',');
      for (let i = 0; i < parts.length; i++) {
        if (matchSel(node, parts[i].trim())) return true;
      }
      return false;
    }
    if (sel.charAt(0) === '.') return (' ' + (node.className || '') + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0;
    const attr = /^([a-z0-9]+)?\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i.exec(sel);
    if (!attr) return false;
    if (attr[1] && node.tag !== attr[1]) return false;
    if (!node.attrs || !Object.prototype.hasOwnProperty.call(node.attrs, attr[2])) return false;
    return attr[3] == null || node.attrs[attr[2]] === attr[3];
  }
  function makeNode(tag) {
    const node = {
      tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {},
      isConnected: true, parent: null, removed: false,
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      appendChild(child) { child.parent = this; this.children.push(child); return child; },
      insertBefore(child) { return this.appendChild(child); },
      replaceChildren() {
        this.children = [];
        for (let i = 0; i < arguments.length; i++) this.appendChild(arguments[i]);
      },
      addEventListener(type, fn) {
        this.listeners = this.listeners || {};
        (this.listeners[type] = this.listeners[type] || []).push(fn);
      },
      click() {
        const fns = (this.listeners && this.listeners.click) || [];
        fns.forEach((fn) => fn({}));
      },
      remove() {
        this.removed = true;
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      },
      querySelector(sel) { const found = this.querySelectorAll(sel); return found[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          (n.children || []).forEach((child) => {
            if (matchSel(child, sel)) out.push(child);
            walk(child);
          });
        };
        walk(this);
        return out;
      }
    };
    node.classList = {
      contains(name) { return (' ' + node.className + ' ').indexOf(' ' + name + ' ') >= 0; },
      add(name) { if (!node.classList.contains(name)) node.className = (node.className + ' ' + name).trim(); }
    };
    return node;
  }
  function bootPage(opts) {
    const timers = [];
    let timerSeq = 1;
    let now = 0;
    const body = makeNode('body');
    const account = makeNode('a');
    account.setAttribute('aria-label', 'Google Account: Glance (me@example.com)');
    body.appendChild(account);
    const main = makeNode('div');
    main.setAttribute('role', 'main');
    body.appendChild(main);
    const message = makeNode('div');
    if (opts.shape === 'adn') message.className = 'adn';
    else message.setAttribute('role', 'listitem');
    message.setAttribute('data-legacy-message-id', opts.messageId || 'm-live');
    if (opts.threadId) message.setAttribute('data-legacy-thread-id', opts.threadId);
    const who = makeNode('span');
    who.textContent = 'me';
    who.setAttribute('email', 'me@example.com');
    message.appendChild(who);
    main.appendChild(message);
    const stale = makeNode('div');
    stale.className = 'flow-chip-host';
    stale.textContent = 'Partly handled';
    if (opts.stale) main.appendChild(stale);
    const doc = {
      body: body,
      createElement: (tag) => makeNode(tag),
      querySelector(sel) { const found = this.querySelectorAll(sel); return found[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          if (matchSel(n, sel)) out.push(n);
          (n.children || []).forEach(walk);
        };
        walk(body);
        return out;
      }
    };
    let dead = false;
    const page = {
      console,
      document: doc,
      MutationObserver: function MutationObserver(cb) {
        this.cb = cb;
        this.connected = false;
        page.observers.push(this);
      },
      observers: [],
      sent: [],
      setTimeout(fn, ms) {
        const id = timerSeq++;
        timers.push({ id: id, fn: fn, at: now + (ms || 0) });
        return id;
      },
      clearTimeout(id) {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      clearInterval() {},
      location: { pathname: '/mail/u/0/' },
      navigator: { language: opts.lang || 'en' },
      Intl: Intl,
      Date: Date,
      Promise: Promise,
      FlowStorage: {
        get() { return Promise.resolve({ onboarded: false, log: [] }); },
        hasTerminalOutcome() { return Promise.resolve(false); },
        hasTerminalOutcomeFrom(_settled, id) {
          if (typeof opts.terminal === 'function') return !!opts.terminal(id);
          return opts.terminal === true;
        },
        verifyGateFrom() { return ''; },
        markSeen() { return Promise.resolve(); },
        forgetStillOpenScan() { return Promise.resolve(); },
        markAlreadyClosed() { return Promise.resolve(); }
      },
      chrome: {
        runtime: {
          get id() {
            if (dead) throw new Error('Extension context invalidated');
            return 'ext';
          },
          lastError: null,
          sendMessage(msg, cb) {
            page.sent.push(msg);
            if (typeof cb === 'function') cb({ ok: true });
          },
          onMessage: { addListener() {} }
        },
        storage: {
          local: {
            get(key) {
              if (key === 'glanceLaneUndo') return Promise.resolve({ glanceLaneUndo: opts.lane || null });
              return Promise.resolve({});
            },
            set() {
              if (opts.failSet) {
                const card = makeNode('div');
                card.className = 'flow-chip-host';
                card.textContent = 'Partly handled';
                main.appendChild(card);
                page.diedCard = card;
                throw new Error('Extension context invalidated');
              }
              return Promise.resolve();
            },
            remove() { return Promise.resolve(); }
          },
          onChanged: { addListener() {} }
        },
        i18n: {
          getUILanguage() {
            if (dead) throw new Error('Extension context invalidated');
            return opts.lang || 'en';
          },
          getMessage() {
            if (dead) throw new Error('Extension context invalidated');
            return '';
          }
        }
      }
    };
    page.MutationObserver.prototype.observe = function () { this.connected = true; };
    page.MutationObserver.prototype.disconnect = function () { this.connected = false; };
    page.MutationObserver.prototype.takeRecords = function () { return []; };
    page.globalThis = page;
    page.stale = stale;
    vm.createContext(page);
    vm.runInContext(gmail, page, { filename: 'content-gmail.js' });
    return {
      page: page,
      kill() { dead = true; },
      flush(ms) {
        now += ms;
        const due = timers.filter((t) => t.at <= now);
        due.forEach((t) => {
          const i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
        });
        due.forEach((t) => t.fn());
      }
    };
  }
  const dead = bootPage({ failSet: true });
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    dead.flush(500);
    return new Promise((resolve) => setImmediate(resolve));
  }).then(() => {
    const disconnected = dead.page.observers.length > 0 && dead.page.observers.every((o) => o.connected === false);
    const texts = dead.page.document.querySelectorAll('.flow-chip-written').map((n) => n.textContent);
    check('an invalidated scan removes the old card and rejects nothing',
      disconnected && dead.page.diedCard && dead.page.diedCard.removed === true && rejections.length === 0 && texts.length === 0,
      { disconnected, removed: dead.page.diedCard && dead.page.diedCard.removed, rejections, texts });
    const live = bootPage({
      stale: true,
      lane: {
        'm-live': {
          expires: Date.now() + 86400000,
          steps: [
            { connectorId: 'googleHold', ref: { eventId: 'e1', contentHash: 'h', calendarId: 'primary' }, line: 'Calendar · Thursday', undoLine: 'Calendar event removed.' },
            { connectorId: 'googleLaneTask', ref: { taskId: 't1', taskListId: 'glance-list', contentHash: 'h2' }, line: 'Google Task · Prepare', undoLine: 'Google Task removed.' }
          ]
        }
      }
    });
    return new Promise((resolve) => setImmediate(resolve)).then(() => {
      live.flush(500);
      return new Promise((resolve) => setImmediate(resolve));
    }).then(() => {
      const written = live.page.document.querySelectorAll('.flow-chip-written').map((n) => n.textContent);
      const reloadHandled = live.page.document.querySelector('.flow-chip-handled');
      const reloadUndo = live.page.document.querySelector('.flow-chip-undo');
      check('the new copy drops the previous card and paints the open mail',
        live.page.stale.removed === true && written.indexOf('Calendar · Thursday') >= 0 && written.indexOf('Google Task · Prepare') >= 0 && rejections.length === 0,
        { removed: live.page.stale.removed, written, rejections });
      check('a reload of a handled mail shows the English Handled receipt and Undo',
        reloadHandled && reloadHandled.textContent === 'Handled.' && reloadUndo && reloadUndo.textContent === 'Undo all' &&
        written.indexOf('Calendar · Thursday') >= 0 &&
        live.page.document.querySelector('.flow-chip-written').getAttribute('data-glance-undo-line') === 'Calendar event removed.' &&
        !live.page.document.querySelector('.flow-chip-process-name'),
        { handled: reloadHandled && reloadHandled.textContent, undo: reloadUndo && reloadUndo.textContent, written });
      const he = bootPage({
        lang: 'he',
        lane: {
          'm-live': {
            expires: Date.now() + 86400000,
            steps: [
              { connectorId: 'googleHold', ref: { eventId: 'e1', contentHash: 'h', calendarId: 'primary' }, line: 'Calendar · Thursday', undoLine: 'Calendar event removed.' },
              { connectorId: 'googleLaneTask', ref: { taskId: 't1', taskListId: 'glance-list', contentHash: 'h2' }, line: 'Google Task · Prepare', undoLine: 'Google Task removed.' }
            ]
          }
        }
      });
      return new Promise((resolve) => setImmediate(resolve)).then(() => {
        he.flush(500);
        return new Promise((resolve) => setImmediate(resolve));
      }).then(() => {
        const handled = he.page.document.querySelector('.flow-chip-handled');
        const undo = he.page.document.querySelector('.flow-chip-undo');
        check('a Hebrew UI reload shows Hebrew Handled and Undo all',
          handled && handled.textContent === 'טופל.' && undo && undo.textContent === 'בטל הכל',
          { handled: handled && handled.textContent, undo: undo && undo.textContent });
        const ALLOW = new Set(['glance', 'outlook', 'gmail', 'microsoft', 'pro', 'onedrive', 'teams', 'google', 'drive', 'todo']);
        const kinds = ['handled', 'undo', 'undoAll', 'undoing', 'tryAgain', 'calendarFailed', 'panelHead'];
        const bad = [];
        kinds.forEach((kind) => {
          const line = he.page.glanceUiCopy(kind);
          const words = String(line || '').match(/[A-Za-z][A-Za-z'’]{3,}/g) || [];
          words.forEach((word) => {
            if (!ALLOW.has(word.toLowerCase().replace(/[’']/g, ''))) bad.push(kind + ':' + word);
          });
          if (!line) bad.push(kind + ':empty');
        });
        check('visible Hebrew lint keeps Handled, Undo all, and Try again free of English',
          bad.length === 0 && he.page.glanceUiCopy('tryAgain') === 'נסה שוב' && he.page.glanceUiCopy('handled') === 'טופל.',
          bad);
        const before = rejections.length;
        let caught = 0;
        he.kill();
        try { he.page.chrome.i18n.getUILanguage(); } catch (e) { caught += 1; }
        try { he.page.chrome.i18n.getMessage('handled'); } catch (e) { caught += 1; }
        try { he.page.glanceUiCopy('handled'); } catch (e) { caught += 1; }
        return new Promise((resolve) => setImmediate(resolve)).then(() => {
          check('a dead context plus an i18n call throws nothing', caught === 0 && rejections.length === before && he.page.chrome.i18n.getUILanguage() === '', { caught, rejections: rejections.slice(before) });
          function twoSteps() {
            return [
              { connectorId: 'googleHold', ref: { eventId: 'e1', contentHash: 'h', calendarId: 'primary' }, line: 'Calendar · Thursday', undoLine: 'Calendar event removed.' },
              { connectorId: 'googleLaneTask', ref: { taskId: 't1', taskListId: 'glance-list', contentHash: 'h2' }, line: 'Google Task · Prepare', undoLine: 'Google Task removed.' }
            ];
          }
          function laneRow(extra) {
            return Object.assign({ expires: Date.now() + 86400000, steps: twoSteps() }, extra || {});
          }
          function receipt(page) {
            const handled = page.document.querySelector('.flow-chip-handled');
            const undo = page.document.querySelector('.flow-chip-undo');
            const lines = page.document.querySelectorAll('.flow-chip-written');
            return {
              handled: handled && handled.textContent,
              undo: undo && undo.textContent,
              written: lines.map((n) => n.textContent),
              undoLines: lines.map((n) => n.getAttribute('data-glance-undo-line')),
              doIt: !!page.document.querySelector('.flow-chip-process-name'),
              undoButton: undo
            };
          }
          function settle(booted) {
            return new Promise((resolve) => setImmediate(resolve)).then(() => {
              booted.flush(500);
              return new Promise((resolve) => setImmediate(resolve));
            });
          }
          function showMail(page, id, shape) {
            const main = page.document.querySelector('div[role="main"]');
            main.querySelectorAll('[data-legacy-message-id]').forEach((node) => {
              if (node.parent === main) node.remove();
            });
            const message = makeNode('div');
            if (shape === 'adn') message.className = 'adn';
            else message.setAttribute('role', 'listitem');
            message.setAttribute('data-legacy-message-id', id);
            const who = makeNode('span');
            who.setAttribute('email', 'me@example.com');
            who.textContent = 'me';
            message.appendChild(who);
            main.appendChild(message);
            page.observers.forEach((observer) => { if (observer.connected) observer.cb([]); });
          }
          function ticks(n) {
            let pending = Promise.resolve();
            for (let i = 0; i < n; i++) pending = pending.then(() => new Promise((resolve) => setImmediate(resolve)));
            return pending;
          }
          const navigated = bootPage({
            messageId: 'm-other',
            lane: { 'm-live': laneRow() }
          });
          return settle(navigated).then(() => {
            const beforeNav = receipt(navigated.page);
            check('a mail with no stored record shows no Handled receipt',
              !beforeNav.handled && !beforeNav.undo && beforeNav.written.length === 0,
              beforeNav);
            showMail(navigated.page, 'm-live', 'adn');
            return settle(navigated);
          }).then(() => {
            const en = receipt(navigated.page);
            check('opening a handled mail after navigation shows the English Handled receipt and Undo',
              en.handled === 'Handled.' && en.undo === 'Undo all' && !en.doIt &&
              en.written.indexOf('Calendar · Thursday') >= 0 && en.written.indexOf('Google Task · Prepare') >= 0 &&
              en.undoLines.indexOf('Calendar event removed.') >= 0 && en.undoLines.indexOf('Google Task removed.') >= 0,
              en);
            const heNav = bootPage({
              lang: 'he',
              messageId: 'm-other',
              lane: { 'm-live': laneRow() }
            });
            return settle(heNav).then(() => {
              showMail(heNav.page, 'm-live', 'adn');
              return settle(heNav);
            }).then(() => {
              const heOpen = receipt(heNav.page);
              check('opening a handled mail after navigation shows the Hebrew Handled receipt and Undo',
                heOpen.handled === 'טופל.' && heOpen.undo === 'בטל הכל' && !heOpen.doIt &&
                heOpen.written.indexOf('Calendar · Thursday') >= 0 && heOpen.undoLines.indexOf('אירוע היומן הוסר.') < 0 &&
                heOpen.undoLines.indexOf('Calendar event removed.') >= 0,
                heOpen);
              if (en.undoButton) en.undoButton.click();
              return ticks(8).then(() => {
                const undos = navigated.page.sent.filter((msg) => msg && msg.type === 'flow:google-undo');
                const label = navigated.page.document.querySelector('.flow-chip-label');
                check('Undo from a reopened handled mail deletes the stored steps',
                  undos.length === 2 && undos[0].connectorId === 'googleLaneTask' && undos[0].ref && undos[0].ref.taskId === 't1' &&
                  undos[1].connectorId === 'googleHold' && undos[1].ref && undos[1].ref.eventId === 'e1' &&
                  label && label.textContent.indexOf('Google Task removed.') >= 0 && label.textContent.indexOf('Calendar event removed.') >= 0,
                  { undos, label: label && label.textContent });
                const joined = bootPage({
                  terminal: true,
                  messageId: 'm-live',
                  threadId: 'thread-9',
                  lane: {
                    'h-old': laneRow({ ids: ['h-old', 'm-live', 'scan:thread-9', 'Planning meeting'] }),
                    'thread-9': laneRow(),
                    'Planning meeting': laneRow()
                  }
                });
                return settle(joined).then(() => joined);
              }).then((joined) => {
                const alias = receipt(joined.page);
                check('a new message id does not inherit a record by alias, thread, or subject',
                  !alias.handled && !alias.undo && alias.written.length === 0 && !alias.doIt,
                  alias);
                const folded = bootPage({
                    messageId: '18f3_ABC',
                    shape: 'adn',
                    lane: {
                      '18f3/ABC': {
                        expires: Date.now() + 86400000,
                        steps: [{ connectorId: 'googleHold', ref: { eventId: 'e9', contentHash: 'h', calendarId: 'primary' }, line: 'Calendar · Thursday', undoLine: 'Calendar event removed.' }]
                      }
                    }
                  });
                return settle(folded).then(() => folded);
              }).then((folded) => {
                const canon = receipt(folded.page);
                check('a canon-folded message id still shows the stored receipt',
                  canon.handled === 'Handled.' && canon.undo === 'Undo' && !canon.doIt &&
                  canon.written.indexOf('Calendar · Thursday') >= 0 && canon.undoLines[0] === 'Calendar event removed.',
                  canon);
                const both = bootPage({
                  messageId: 'm-one',
                  lane: { 'm-one': laneRow(), 'm-two': laneRow() }
                });
                const main = both.page.document.querySelector('div[role="main"]');
                const second = makeNode('div');
                second.setAttribute('role', 'listitem');
                second.setAttribute('data-legacy-message-id', 'm-two');
                const who = makeNode('span');
                who.setAttribute('email', 'me@example.com');
                who.textContent = 'me';
                second.appendChild(who);
                main.appendChild(second);
                return settle(both).then(() => both);
              }).then((both) => {
                const one = both.page.document.querySelector('[data-legacy-message-id="m-one"]');
                const two = both.page.document.querySelector('[data-legacy-message-id="m-two"]');
                check('each handled message in the thread shows its own receipt',
                  one && one.querySelector('.flow-chip-handled') && two && two.querySelector('.flow-chip-handled') &&
                  one.querySelector('.flow-chip-undo') && two.querySelector('.flow-chip-undo'),
                  { one: !!(one && one.querySelector('.flow-chip-handled')), two: !!(two && two.querySelector('.flow-chip-handled')) });
                const sibling = bootPage({
                  messageId: 'm-empty',
                  threadId: 'thread-9',
                  lane: { 'm-other': laneRow({ ids: ['m-other', 'scan:thread-9'] }) }
                });
                const expired = bootPage({
                  messageId: 'm-live',
                  lane: { 'm-live': laneRow({ expires: Date.now() - 1000 }) }
                });
                return Promise.all([settle(sibling), settle(expired)]).then(() => ({ sibling, expired }));
              }).then((pages) => {
                const quiet = receipt(pages.sibling.page);
                const old = receipt(pages.expired.page);
                check('a mail that only shares a thread id shows no receipt',
                  !quiet.handled && !quiet.undo && quiet.written.length === 0, quiet);
                check('an expired handled record shows no receipt',
                  !old.handled && !old.undo, old);
                process.off('unhandledRejection', onRejection);
              });
            });
          });
        });
      });
    });
  });
}).then(() => {
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}).catch((e) => {
  console.log('FAIL: reinject threw', e);
  process.exit(1);
});
