// Do It runs the plan on the card. The click does not classify again, and
// the connector family matches the step the card rendered.
// Run: node test/plan-execute-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const { FlowDisplay } = require(path.join(ROOT, 'core/display-copy.js'));
const ME = 'glance.salisapan@outlook.com';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : ''); }
}

check('a generated amount heading is Hebrew and keeps the amount',
  FlowDisplay.localizeHeading('he', 'Log $500 agreed') === 'רשום $500 שסוכם' &&
  FlowDisplay.localizeHeading('en', 'Log $500 agreed') === 'Log $500 agreed');
check('Hebrew step chrome has no Latin calendar, task, or to-do word',
  FlowDisplay.chrome('he').stepCalendar === 'יומן' &&
  FlowDisplay.chrome('he').stepTask === 'משימה' &&
  FlowDisplay.chrome('he').todoApp === 'משימות' &&
  FlowDisplay.chrome('he').doIt === 'בצע' &&
  FlowDisplay.chrome('he').hold === 'השהה' &&
  FlowDisplay.chrome('he').holdAt === 'שריין');
check('the host language reaches the same helper the card uses',
  FlowDisplay.uiLangFrom({ hostLanguage: 'he', uiLanguage: 'en-US' }) === 'he' &&
  FlowDisplay.uiLangFrom({ setting: 'en', hostLanguage: 'he' }) === 'en');

const FAM = {
  calendar: 'calendar', todo: 'task', outlook: 'draft', gmail: 'draft', onedrive: 'file', drive: 'file'
};
function shownFamilies(host) {
  const out = [];
  if (!host) return out;
  host.querySelectorAll('li.act [data-glyph]').forEach((n) => {
    const fam = FAM[n.getAttribute('data-glyph')];
    if (fam && out.indexOf(fam) < 0) out.push(fam);
  });
  return out;
}
function connectorFamily(id) {
  if (id === 'outlookCalendar' || id === 'calendar') return 'calendar';
  if (id === 'outlookTask' || id === 'googleTask' || id === 'googleTasks' || id === 'microsoftTodo') return 'task';
  if (id === 'outlookDraft' || id === 'gmailDraft') return 'draft';
  if (id === 'onedriveFile' || id === 'driveFile' || id === 'attachmentSave' || id === 'googleDriveFile') return 'file';
  return null;
}
function executedFamilies(sent) {
  return (sent || []).filter((m) => m.type === 'flow:execute-action').map((m) => connectorFamily(m.payload && m.payload.connectorId)).filter(Boolean);
}

function lines(text) {
  return String(text || '').split('\n').map((line) => '<div>' + line + '</div>').join('');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pinDate(w) {
  const RealDate = w.Date;
  const fixed = new RealDate(2026, 9, 16, 12).getTime();
  function FixedDate(...a) {
    if (a.length === 0) return new RealDate(fixed);
    return new RealDate(...a);
  }
  FixedDate.now = () => fixed;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  FixedDate.prototype = RealDate.prototype;
  w.Date = FixedDate;
}

function outlookFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

function chromeStub(w, store, sent) {
  function snapshotGet(k, cb) {
    const snap = JSON.parse(JSON.stringify(store));
    let r;
    if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
    else if (typeof k === 'string') r = { [k]: snap[k] };
    else if (Array.isArray(k)) { r = {}; k.forEach((x) => { r[x] = snap[x]; }); }
    else r = snap;
    if (cb) cb(r);
    return Promise.resolve(r);
  }
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth && store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
    if (msg.type === 'flow:execute-action') {
      const id = msg.payload && msg.payload.connectorId;
      if (id === 'outlookCalendar' || id === 'calendar') {
        return { ok: true, fetchedBack: true, ref: { eventId: 'EV-1', created: { subject: 'meet' } }, written: 'Calendar · meet', url: 'https://outlook.live.com/calendar/item/EV-1', where: 'Outlook Calendar' };
      }
      if (id === 'outlookTask' || id === 'googleTask') {
        return { ok: true, fetchedBack: true, proof: { fetchedBack: true, system: 'microsoft/todo', externalId: 'T-1' }, ref: { taskId: 'T-1', externalId: 'T-1' }, written: 'To Do', url: 'https://to-do.office.com/tasks/T-1', where: 'Microsoft To Do' };
      }
      if (id === 'onedriveFile' || id === 'driveFile' || id === 'attachmentSave') {
        return { ok: true, fetchedBack: true, proof: { fetchedBack: true, system: 'microsoft/onedrive', externalId: 'F-1' }, ref: { externalId: 'F-1', itemId: 'F-1' }, written: 'Saved', url: 'https://onedrive.live.com/F-1' };
      }
      return { ok: true, ref: 'draft-1', created: { subject: 'RE', body: 'draft' }, written: 'Reply draft ready in Outlook Drafts. Not sent.', url: 'https://outlook.live.com/mail/0/drafts/draft-1', where: 'https://outlook.live.com/mail/0/drafts/draft-1' };
    }
    return { ok: true };
  }
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: '0.9.56' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => { const r = reply(msg); setTimeout(() => cb && cb(r), 5); return Promise.resolve(r); }
    },
    storage: {
      local: {
        get: (k, cb) => { const p = snapshotGet(k, cb); return p; },
        set: (obj, cb) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); } }
    },
    i18n: { getUILanguage: () => 'en' },
    tabs: { query: () => Promise.resolve([]), sendMessage() {} }
  };
}

async function bootOutlook(o) {
  const html = fs.readFileSync(path.join(ROOT, 'test/fixtures/owa-reading-pane-he.html'), 'utf8');
  const url = 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(o.id);
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  pinDate(w);
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: webcrypto });
  const store = {
    outlookAuth: {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now(), grantedScopes: ['Mail.ReadWrite', 'Calendars.ReadWrite', 'Tasks.ReadWrite', 'Files.ReadWrite'] },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    },
    outlookSync: { stateVersion: 3 }
  };
  const sent = [];
  chromeStub(w, store, sent);
  const ctx = dom.getInternalVMContext();
  for (const f of outlookFiles()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  const heading = w.document.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) heading.textContent = o.subject || 'Plan';
  const body = w.document.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body) body.innerHTML = lines(o.body || 'A quiet note.');
  return { w, doc: w.document, sent, store };
}

function planCtx(kind, surface) {
  const steps = {
    calendar: { id: 'calendar', kind: 'calendar', label: 'Calendar', params: { dateIso: '2099-03-04', hour: 7, minute: 15, title: 'Budget review', quote: 'Budget review', requireTime: true } },
    task: { id: 'task', kind: surface === 'gmail' ? 'googleTask' : 'googleTask', label: 'Task', params: { title: 'Log $500 agreed', dateIso: '2099-04-02' } },
    draft: { id: 'draft', kind: surface === 'gmail' ? 'gmailDraft' : 'gmailDraft', label: 'Draft reply', params: { what: 'Please confirm', includeAttachment: false } },
    file: {
      id: 'file',
      kind: surface === 'gmail' ? 'driveFile' : 'onedriveFile',
      label: surface === 'gmail' ? 'Drive' : 'OneDrive',
      params: { name: 'invoice.pdf', fileName: 'invoice.pdf', copyAttachment: true }
    }
  };
  const ids = { calendar: 'hold', task: 'log-it', draft: 'reply-fact', file: 'suggest-save' };
  const ctx = {
    app: surface,
    uiLang: 'en',
    messageId: 'PLAN-' + surface + '-' + kind,
    outlookIncomingId: 'PLAN-' + surface + '-' + kind,
    subject: 'Dana Levi',
    bodyText: 'Please confirm the note from Dana Levi.',
    threadUrl: surface === 'gmail' ? 'https://mail.google.com/mail/u/0/#inbox/t1' : 'https://outlook.live.com/mail/0/',
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    intent: {
      label: kind === 'task' ? 'Log $500 agreed' : 'Budget review',
      type: 'request',
      signals: { score: 80 },
      entities: kind === 'calendar' ? { dateIso: '2099-03-04', hour: 7, minute: 15, what: 'Budget review' } : {}
    },
    process: {
      id: ids[kind],
      name: kind === 'calendar' ? 'Hold It' : (kind === 'task' ? 'Log It' : kind),
      closingLine: 'Closing.',
      steps: [steps[kind]]
    }
  };
  if (kind === 'file' && surface === 'gmail') {
    ctx.attachments = [{ url: 'https://mail.google.com/mail/u/0?ui=2&attid=invoice.pdf', filename: 'invoice.pdf', mimeType: 'application/pdf' }];
  }
  return ctx;
}

async function bootGmail() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const files = manifest.content_scripts[0].js;
  const html = '<!doctype html><html lang="en"><head><title>Inbox - me@x.com - Gmail</title></head><body><h2 class="hP">Vendor</h2><div role="main"><div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m1"><span email="dana@acme.io">Dana Levi</span><div class="a3s">Hello</div></div></div></body></html>';
  const dom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0/#inbox/t1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  pinDate(w);
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.fetch = async () => ({ ok: true, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer, blob: async () => ({}) });
  const store = { onboarded: true, connectorId: 'googleTasks' };
  const sent = [];
  chromeStub(w, store, sent);
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  return { w, doc: w.document, sent, store };
}

async function clickDo(host) {
  const go = host && (host.querySelector('.do-halo') || host.querySelector('button.flow-chip'));
  if (go) go.click();
  await sleep(700);
  return Boolean(go);
}

(async () => {
  console.log('\n--- the open contract mail is a calendar plan, and Do It writes the event ---\n');
  const live = await bootOutlook({
    id: 'G144b-6',
    subject: 'Contract',
    body: "The old contract was cancelled, so let's meet Monday at 10:00"
  });
  let host = null;
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    host = live.doc.querySelector('.flow-chip-host');
    if (host && host.getAttribute('data-glance-open')) break;
    await sleep(40);
  }
  const shown = shownFamilies(host);
  check('the contract mail shows a calendar plan', shown.indexOf('calendar') >= 0 && shown.indexOf('draft') < 0, { shown, text: host && host.textContent });
  // const FlowIntent is a script binding, not a window property.
  live.w.eval('globalThis.__glanceClassifyOrig = FlowIntent.classify; globalThis.__glanceReplans = 0; FlowIntent.classify = function () { globalThis.__glanceReplans += 1; return null; };');
  await clickDo(host);
  const replans = live.w.__glanceReplans;
  const exec = live.sent.filter((m) => m.type === 'flow:execute-action');
  const cal = exec.find((m) => connectorFamily(m.payload && m.payload.connectorId) === 'calendar');
  check('Do It on that card writes a calendar event, not a reply draft',
    Boolean(cal) && !exec.some((m) => connectorFamily(m.payload.connectorId) === 'draft') &&
    cal.payload.params && cal.payload.params.dateIso === '2026-10-19' && cal.payload.params.hour === 10 && cal.payload.params.meeting === true,
    { exec: exec.map((m) => ({ id: m.payload && m.payload.connectorId, params: m.payload && m.payload.params })), replans });
  check('the click does not classify the mail again', replans === 0, { replans });
  await sleep(50);
  check('Outlook in Hebrew stores the host language for Activity', live.store.glanceHostLanguage === 'he', live.store.glanceHostLanguage);
  live.w.eval('FlowIntent.classify = globalThis.__glanceClassifyOrig;');
  live.w.close();

  console.log('\n--- each rendered plan executes that same kind ---\n');
  const outlook = await bootOutlook({ id: 'PLAN-HOST', subject: 'Note', body: 'A quiet note with no ask.' });
  await sleep(400);
  for (const kind of ['calendar', 'task', 'draft', 'file']) {
    outlook.sent.length = 0;
    const ctx = planCtx(kind, 'outlook');
    const card = outlook.w.__glanceOutlookPage.paintShownPlan(ctx);
    const families = shownFamilies(card);
    const clicked = await clickDo(card);
    const got = executedFamilies(outlook.sent);
    const payload = (outlook.sent.find((m) => m.type === 'flow:execute-action') || {}).payload;
    check('Outlook ' + kind + ' executes the kind on the card',
      clicked && families.length === 1 && families[0] === kind && got.length === 1 && got[0] === kind,
      { families, got, payload: payload && { id: payload.connectorId, params: payload.params } });
    if (kind === 'calendar' && payload && payload.params) {
      check('Outlook calendar uses the rendered step clock',
        payload.params.dateIso === '2099-03-04' && payload.params.hour === 7 && payload.params.minute === 15, payload.params);
    }
    if (kind === 'task' && payload) {
      check('Outlook task uses the rendered step title', payload.params && payload.params.title === 'Log $500 agreed', payload.params);
    }
  }
  outlook.w.close();

  const gmail = await bootGmail();
  check('Gmail exposes the same plan painter', typeof gmail.w.__glanceGmailPage.paintPlan === 'function');
  for (const kind of ['calendar', 'task', 'draft', 'file']) {
    gmail.sent.length = 0;
    const ctx = planCtx(kind, 'gmail');
    const card = gmail.w.__glanceGmailPage.paintPlan(ctx);
    const families = shownFamilies(card);
    const clicked = await clickDo(card);
    const got = executedFamilies(gmail.sent);
    check('Gmail ' + kind + ' executes the kind on the card',
      clicked && families.length === 1 && families[0] === kind && got.length === 1 && got[0] === kind,
      { families, got, sent: gmail.sent.filter((m) => m.type === 'flow:execute-action').map((m) => m.payload && m.payload.connectorId) });
  }
  gmail.w.close();

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.log('FAIL: plan execute threw', err && err.stack ? err.stack : err);
  process.exit(1);
});
