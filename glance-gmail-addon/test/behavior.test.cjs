#!/usr/bin/env node
// Behavior of the Gmail card host, driven the way Gmail drives it:
// open a message, press Do it, press Undo. Code.js and CoreBundle.js run in a
// vm with mocked Google services. Nothing here greps source.
// Run: node glance-gmail-addon/test/behavior.test.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const addon = path.join(__dirname, '..');
const NOW = new Date('2026-10-15T12:00:00Z');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function world() {
  const w = { messages: {}, tasks: {}, events: {}, seq: 1, calls: [], logs: [], forbidden: [], props: {}, readBackBreaks: false };
  function note(name) { w.calls.push(name); }
  function forbid(name) { return function () { w.forbidden.push(name); throw new Error('forbidden call ' + name); }; }
  function widget(type) {
    const node = { type: type, text: '', action: '', params: {} };
    node.setText = function (v) { node.text = v; return node; };
    node.setOnClickAction = function (a) { node.action = a.functionName; node.params = a.params; return node; };
    node.setAuthorizationAction = function (a) { node.action = 'authorize'; return node; };
    node.setTextButtonStyle = function () { return node; };
    return node;
  }
  // Any GmailApp member that is not the read pair is a send, draft, label or
  // thread call. It records itself and throws.
  const gmailReads = {
    setCurrentMessageAccessToken: function () { note('gmail.token'); },
    getMessageById: function (id) { note('gmail.get'); return w.messages[id] || null; }
  };
  const GmailApp = new Proxy(gmailReads, {
    get: function (target, prop) { return prop in target ? target[prop] : forbid('GmailApp.' + String(prop)); }
  });
  const sandbox = {
    console: { log: function (line) { w.logs.push(String(line)); }, warn: function () {}, error: function () {} },
    module: undefined,
    GmailApp: GmailApp,
    MailApp: new Proxy({}, { get: function (t, prop) { return forbid('MailApp.' + String(prop)); } }),
    UrlFetchApp: { fetch: forbid('UrlFetchApp.fetch') },
    PropertiesService: {
      getUserProperties: function () {
        return {
          getProperty: function (k) { return Object.prototype.hasOwnProperty.call(w.props, k) ? w.props[k] : null; },
          setProperty: function (k, v) { w.props[k] = v; },
          deleteProperty: function (k) { delete w.props[k]; }
        };
      },
      getScriptProperties: function () { return { getProperty: function () { return null; } }; }
    },
    Session: {
      getActiveUser: function () { return { getEmail: function () { return 'owner@example.com'; } }; },
      getScriptTimeZone: function () { return 'Etc/UTC'; }
    },
    Tasks: {
      Tasklists: {
        list: function () { return { items: [{ id: 'list1', title: 'Glance' }] }; },
        get: function (id) { return { id: id, title: 'Glance' }; },
        insert: function () { return { id: 'list1', title: 'Glance' }; }
      },
      Tasks: {
        insert: function (r) {
          note('task.insert');
          const t = { id: 'task-' + w.seq++, title: r.title, due: r.due || null, notes: r.notes || '', etag: 'e1', updated: 'u1' };
          w.tasks[t.id] = t;
          return JSON.parse(JSON.stringify(t));
        },
        get: function (l, id) {
          note('task.get');
          if (!w.tasks[id]) throw new Error('missing');
          const t = JSON.parse(JSON.stringify(w.tasks[id]));
          if (w.readBackBreaks) t.title = 'something else';
          return t;
        },
        remove: function (l, id) { note('task.remove'); delete w.tasks[id]; }
      }
    },
    Calendar: {
      Events: {
        insert: function (r, cal) {
          note('event.insert');
          const ev = JSON.parse(JSON.stringify(r));
          ev.id = 'ev-' + w.seq++;
          w.events[ev.id] = ev;
          return JSON.parse(JSON.stringify(ev));
        },
        get: function (cal, id) {
          note('event.get');
          if (!w.events[id]) throw new Error('missing');
          const ev = JSON.parse(JSON.stringify(w.events[id]));
          if (w.readBackBreaks) ev.summary = 'something else';
          return ev;
        },
        remove: function (cal, id) { note('event.remove'); delete w.events[id]; }
      }
    },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      getAuthorizationUrl: function () { return 'https://accounts.google.com/o/oauth2/auth?glance=1'; },
      requireScopes: function () {},
      newTrigger: forbid('ScriptApp.newTrigger'),
      getProjectTriggers: forbid('ScriptApp.getProjectTriggers')
    },
    CardService: {
      LoadIndicator: { SPINNER: 'spinner' },
      TextButtonStyle: { FILLED: 'filled' },
      newTextParagraph: function () { return widget('text'); },
      newTextButton: function () { return widget('button'); },
      newAuthorizationAction: function () { const a = {}; a.setAuthorizationUrl = function () { return a; }; return a; },
      newCardSection: function () { const s = { widgets: [] }; s.addWidget = function (i) { s.widgets.push(i); return s; }; return s; },
      newCardHeader: function () { const h = { title: '' }; h.setTitle = function (v) { h.title = v; return h; }; return h; },
      newCardBuilder: function () {
        const b = { header: null, sections: [] };
        b.setHeader = function (h) { b.header = h; return b; };
        b.addSection = function (s) { b.sections.push(s); return b; };
        b.build = function () { return b; };
        return b;
      },
      newAction: function () {
        const a = { functionName: '', params: {} };
        a.setFunctionName = function (n) { a.functionName = n; return a; };
        a.setLoadIndicator = function () { return a; };
        a.setParameters = function (p) { a.params = p; return a; };
        return a;
      },
      newNavigation: function () { const n = { card: null }; n.updateCard = function (c) { n.card = c; return n; }; return n; },
      newActionResponseBuilder: function () {
        const r = { card: null };
        r.setNavigation = function (n) { r.card = n.card; return r; };
        r.build = function () { return { card: r.card }; };
        return r;
      }
    }
  };
  const RealDate = Date;
  function MockDate() {
    const args = Array.prototype.slice.call(arguments);
    if (!args.length) return new RealDate(NOW.getTime());
    if (args.length === 1) return new RealDate(args[0]);
    return new (RealDate.bind.apply(RealDate, [null].concat(args)))();
  }
  MockDate.now = function () { return NOW.getTime(); };
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;
  MockDate.prototype = RealDate.prototype;
  vm.createContext(sandbox);
  sandbox.Date = MockDate;
  ['BuildSha.js', 'CoreBundle.js', 'Code.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(addon, f), 'utf8'), sandbox, { filename: f });
  });
  w.fn = function (name) { return vm.runInContext(name, sandbox); };

  w.addMessage = function (m) {
    w.messages[m.id] = {
      getSubject: function () { note('msg.subject'); return m.subject; },
      getPlainBody: function () { note('msg.plain'); return m.plain; },
      getBody: function () { return ''; },
      getFrom: function () { return m.from || 'Dana Levi <dana@meridian.com>'; },
      getTo: function () { return m.to || 'owner@example.com'; },
      getCc: function () { return ''; },
      getDate: function () { return new Date('2026-10-15T09:30:00Z'); },
      getAttachments: function () { return []; }
    };
    return {
      gmail: { messageId: m.id, accessToken: 'tok', threadId: 'thread-' + m.id },
      commonEventObject: { userLocale: m.locale || 'en', timeZone: 'Etc/UTC' },
      parameters: { messageId: m.id, source: 'message' }
    };
  };
  return w;
}

function lines(card) {
  return card.sections[0].widgets.filter((x) => x.type === 'text').map((x) => String(x.text).replace(/[\u200e\u200f\u2066-\u2069]/g, '').replace(/<[^>]+>/g, ''));
}
function buttons(card) { return card.sections[0].widgets.filter((x) => x.type === 'button'); }
function logRows(w) {
  const rows = [];
  w.logs.forEach((l) => { try { const r = JSON.parse(l); if (r && typeof r === 'object') rows.push(r); } catch (e) { /* not json */ } });
  return rows;
}
// The open log row (messageId, speak, reason) is the why marker for a card or for silence.
function openRow(w) { return logRows(w).filter((r) => !r.step && Object.prototype.hasOwnProperty.call(r, 'speak'))[0]; }
function noSendReachable(w) { return w.forbidden.length === 0; }

const ASK = 'Please remember to send the contract by Friday.';
const NOISE = 'Hope you are well. Just wanted to say hello and see how things are going this week.';

console.log('\n--- a card shows for a real ask ---');
{
  const w = world();
  const ev = w.addMessage({ id: 'ask1', subject: 'Contract', plain: ASK });
  const card = w.fn('onGmailMessageOpen')(ev)[0];
  const btn = buttons(card);
  check('the ask gets one Do it button', btn.length === 1 && btn[0].action === 'onDoIt', btn.map((b) => b.action));
  check('the card names the task from the mail', lines(card).join('\n').toLowerCase().indexOf('send the contract') !== -1, lines(card));
  check('opening the card writes nothing', Object.keys(w.tasks).length === 0 && Object.keys(w.events).length === 0);
}

console.log('\n--- it reads the whole opened message ---');
{
  const w = world();
  const quotedHistory = [];
  for (let i = 0; i < 120; i++) quotedHistory.push('> earlier line ' + i + ' of the quoted history with ordinary words in it');
  const ev = w.addMessage({ id: 'long1', subject: 'Re: Contract', plain: ASK + '\n\n' + quotedHistory.join('\n') });
  const card = w.fn('onGmailMessageOpen')(ev)[0];
  check('an ask above a long quoted history gets a card', buttons(card).length === 1, lines(card));
  check('the host reads the plain body once through the message access token', w.calls.indexOf('gmail.token') !== -1 && w.calls.indexOf('msg.plain') !== -1);
  check('the host does not reach for other messages of the thread (scope is current message only)', noSendReachable(w) && w.calls.indexOf('gmail.get') !== -1);
  const wl = world();
  const evLast = wl.addMessage({ id: 'long2', subject: 'Re: Meeting', plain: 'Thanks for the update.\n\n' + quotedHistory.join('\n').replace(/^> /gm, '') + '\n\nCould we meet Thursday at 2pm?' });
  const cardLast = wl.fn('onGmailMessageOpen')(evLast)[0];
  check('a meeting ask in the last paragraph of a long (~8000 character) message gets a card', buttons(cardLast).filter((b) => b.action === 'onDoIt').length === 1, lines(cardLast));
  const mk = world();
  const ev2 = mk.addMessage({ id: 'short1', subject: 'Re: Contract', plain: 'Thanks for the update.\n\n> ' + ASK });
  const quotedOnly = mk.fn('onGmailMessageOpen')(ev2)[0];
  check('a quoted old ask alone does not get a card', buttons(quotedOnly).length === 0, lines(quotedOnly));
}

console.log('\n--- it goes quiet on noise, and says why ---');
{
  ['small talk', 'empty'].forEach((kind) => {
    const w = world();
    const ev = w.addMessage({ id: 'noise-' + kind.replace(' ', ''), subject: 'Hello', plain: kind === 'empty' ? '' : NOISE });
    const card = w.fn('onGmailMessageOpen')(ev)[0];
    check(kind + ': no Do it button, one quiet line', buttons(card).filter((b) => b.action === 'onDoIt').length === 0 && lines(card).length === 1 && /Nothing to close/.test(lines(card)[0]), lines(card));
    const plan = openRow(w);
    check(kind + ': the open log carries speak:false and a non-empty why', !!plan && plan.speak === false && typeof plan.reason === 'string' && plan.reason.length > 0, plan);
    check(kind + ': nothing was written', Object.keys(w.tasks).length === 0 && Object.keys(w.events).length === 0 && noSendReachable(w));
  });
  const w = world();
  const ev = w.addMessage({ id: 'relay1', subject: 'NDA', plain: 'Thanks for the update. Please remember to remind Sarah to send the NDA.' });
  const card = w.fn('onGmailMessageOpen')(ev)[0];
  check('a relay to a third party is quiet', buttons(card).filter((b) => b.action === 'onDoIt').length === 0, lines(card));
}

console.log('\n--- every write has ProofOfClose, a read-back and Undo; nothing is sent ---');
[
  { name: 'task', id: 'w-task', plain: ASK, tasks: 1, events: 0 },
  { name: 'calendar hold', id: 'w-hold', plain: 'Could we meet Thursday at 2pm?', tasks: 0, events: 1 },
  { name: 'event plus reminder', id: 'w-sched', plain: 'פגישה ביום חמישי 22/10', subject: 'פגישה ביום חמישי 22/10', from: 'Glance <owner@example.com>', tasks: 1, events: 1 }
].forEach((c) => {
  const w = world();
  const ev = w.addMessage({ id: c.id, subject: c.subject || 'Subject', plain: c.plain, from: c.from });
  const open = w.fn('onGmailMessageOpen')(ev)[0];
  check(c.name + ': the card offers Do it', buttons(open).filter((b) => b.action === 'onDoIt').length === 1, lines(open));
  const proof = w.fn('onDoIt')(ev).card;
  const wrote = Object.keys(w.tasks).length === c.tasks && Object.keys(w.events).length === c.events;
  check(c.name + ': Do it writes exactly the planned items', wrote, { tasks: Object.keys(w.tasks), events: Object.keys(w.events) });
  const backed = ['task', 'event'].every((kind) => {
    const inserts = w.calls.filter((n) => n === kind + '.insert').length;
    const firstInsert = w.calls.indexOf(kind + '.insert');
    const gets = w.calls.filter((n, i) => n === kind + '.get' && i > firstInsert).length;
    return inserts === 0 || gets >= inserts;
  });
  check(c.name + ': each write is read back after it is made (fetchedBack)', backed, w.calls);
  const steps = logRows(w).filter((r) => r.step === 'read-back');
  check(c.name + ': the read-back log says confirmed', steps.length === c.tasks + c.events && steps.every((r) => r.confirmed === true), steps);
  check(c.name + ': the proof card shows the read and offers Undo', buttons(proof).length === 1 && buttons(proof)[0].action === 'onUndo', lines(proof));
  Object.keys(w.events).forEach((id) => {
    const e = w.events[id];
    check(c.name + ': the event has no guests, so no invite goes out', !e.attendees || e.attendees.length === 0, e);
  });
  const undone = w.fn('onUndo')(ev).card;
  check(c.name + ': Undo removes what Do it wrote', Object.keys(w.tasks).length === 0 && Object.keys(w.events).length === 0 && /Undone/.test(lines(undone)[0]), lines(undone));
  check(c.name + ': no send, draft, label or trigger call was reachable', noSendReachable(w), w.forbidden);
});
{
  const w = world();
  const ev = w.addMessage({ id: 'w-bad', subject: 'Contract', plain: ASK });
  w.readBackBreaks = true;
  const out = w.fn('onDoIt')(ev).card;
  const text = lines(out).join('\n');
  check('a read-back that does not match is not called done', /Couldn't confirm/.test(text) && !/In Google Tasks/.test(text) && buttons(out).filter((b) => b.action === 'onUndo').length === 0, text);
}
{
  const w = world();
  const ev = w.addMessage({ id: 'w-edit', subject: 'Contract', plain: ASK });
  w.fn('onDoIt')(ev);
  const id = Object.keys(w.tasks)[0];
  w.tasks[id].title = 'edited by the user';
  const refused = w.fn('onUndo')(ev).card;
  check('Undo leaves a task the user edited', !!w.tasks[id] && /edited/.test(lines(refused)[0]), lines(refused));
}

if (failures) { console.log('\n' + failures + ' check(s) failed'); process.exit(1); }
console.log('\nAll behavior checks passed');
