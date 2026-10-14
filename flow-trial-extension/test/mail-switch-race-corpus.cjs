// Gate 0.9.55. A scan that already read mail A must not paint A's card after
// the open mail is B, and a click on a card bound to A must not run on B.
// Run: node test/mail-switch-race-corpus.cjs
// Needs jsdom (not a dependency of this repo): npm i --no-save jsdom
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIPPED: jsdom not available'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const ME = 'glance.salisapan@outlook.com';
const FLOW = 'ai.local.flow@gmail.com';
const ID_A = 'MSG-Q3-SUMMARY-111';
const ID_B = 'MSG-OFFICE-MOVE-222';
const SUBJ_A = 'Gate A 0.9.41 – quick question on the Q3 summary';
const SUBJ_B = 'Office move - can you confirm the date?';
const BODY_A = 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow';
const BODY_B = 'Hi,\nCan you reply and confirm whether the office move is still on for October 20?\nThanks,\nFlow';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : '');
  }
}

function registeredFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

function urlFor(id) {
  return 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(id);
}

function showMail(doc, win, mail) {
  win.history.pushState({}, '', urlFor(mail.id));
  const heading = doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) {
    heading.textContent = mail.subject;
    heading.setAttribute('title', mail.subject);
  }
  const to = doc.querySelector('#ReadingPaneContainerId .to');
  if (to) to.innerHTML = mail.toHtml;
  let cc = doc.querySelector('#ReadingPaneContainerId .cc');
  if (mail.ccHtml) {
    if (!cc) {
      cc = doc.createElement('div');
      cc.className = 'cc';
      if (to && to.parentNode) to.parentNode.insertBefore(cc, to.nextSibling);
    }
    cc.innerHTML = mail.ccHtml;
  } else if (cc) cc.remove();
  const body = doc.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body) body.innerHTML = mail.bodyHtml;
}

function lines(text) {
  return String(text || '').split('\n').map((line) => '<div>' + line + '</div>').join('');
}

const MAIL_A = {
  id: ID_A,
  subject: SUBJ_A,
  toHtml: 'אל: <span>' + ME + '</span>',
  ccHtml: '',
  bodyHtml: lines(BODY_A)
};
const MAIL_B = {
  id: ID_B,
  subject: SUBJ_B,
  toHtml: 'אל: <span>' + FLOW + '</span>',
  ccHtml: 'עותק: <span>' + ME + '</span>',
  bodyHtml: lines(BODY_B)
};

function boundTo(host, id) {
  const raw = host && host.getAttribute ? (host.getAttribute('data-glance-message') || '') : '';
  return raw.split('|').indexOf(id) >= 0;
}

function chipText(doc) {
  const host = doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
  return host ? String(host.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

async function boot(opts) {
  const o = opts || {};
  const files = registeredFiles();
  let html = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-he.html'), 'utf8');
  const dom = new JSDOM(html, { url: urlFor(ID_A), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
    }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const logs = [];
  w.console = Object.assign({}, console, {
    log: (...a) => logs.push(a.map(String).join(' ')),
    info: (...a) => logs.push(a.map(String).join(' ')),
    debug: (...a) => logs.push(a.map(String).join(' ')),
    warn: (...a) => logs.push(a.map(String).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
  });
  const store = {
    outlookAuth: {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now() },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    },
    outlookSync: { stateVersion: 3 }
  };
  const sent = [];
  const queued = [];
  let armed = false;
  let released = !o.holdAfterRead;
  function snapshotGet(k, cb) {
    const snap = JSON.parse(JSON.stringify(store));
    let r;
    if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
    else if (typeof k === 'string') r = { [k]: snap[k] };
    else if (Array.isArray(k)) { r = {}; k.forEach((x) => { r[x] = snap[x]; }); }
    else r = snap;
    if (cb) cb(r);
    return r;
  }
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') {
      const u = String(msg.url || '');
      if (/\/me\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ mail: ME, displayName: 'Glance' }) };
      if (/\/me\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
      return { ok: false, status: 404, body: '{}' };
    }
    if (msg.type === 'flow:execute-action') return { ok: true, ref: 'draft-1', where: 'drafts', url: 'https://outlook.live.com/mail/0/drafts' };
    if (msg.type === 'flow:undo-action') return { ok: true, written: 'Undone' };
    return { ok: true };
  }
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: 'test' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => { const r = reply(msg); setTimeout(() => cb && cb(r), 5); }
    },
    storage: {
      local: {
        get: (k, cb) => {
          const run = () => snapshotGet(k, cb);
          if (armed && !released) { queued.push(run); return; }
          setTimeout(run, 1);
        },
        set: (p, cb) => { Object.assign(store, JSON.parse(JSON.stringify(p))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => cb && cb({}) }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  vm.runInContext(`
    (function () {
      const orig = FlowOwaParse.readPane;
      FlowOwaParse.readPane = function () {
        const pane = orig.apply(this, arguments);
        if (globalThis.__onRead) globalThis.__onRead(pane);
        return pane;
      };
    })();
  `, ctx);
  w.__onRead = () => { if (o.holdAfterRead && !released) armed = true; };
  showMail(w.document, w, MAIL_A);
  return {
    w, doc: w.document, logs, sent, queued, store,
    release() { released = true; const pending = queued.splice(0); pending.forEach((fn) => fn()); }
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const race = await boot({ holdAfterRead: true });
  const waitHold = Date.now() + 4000;
  while (Date.now() < waitHold && race.queued.length === 0) await sleep(20);
  check('mail A scan is waiting after it read the pane', race.queued.length > 0, { queued: race.queued.length });
  showMail(race.doc, race.w, MAIL_B);
  race.release();
  let sawAonB = false;
  let sample = '';
  const until = Date.now() + 900;
  while (Date.now() < until) {
    const host = race.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    const heading = race.doc.querySelector('#ReadingPaneContainerId [role="heading"]');
    const onB = heading && String(heading.textContent || '').indexOf('Office move') >= 0;
    if (onB && host && (boundTo(host, ID_A) || /Reply/.test(host.textContent || ''))) {
      sawAonB = true;
      sample = chipText(race.doc);
      break;
    }
    await sleep(15);
  }
  check('a late result from Q3 does not paint Reply & Track on Office move', !sawAonB, { sample: sample, text: chipText(race.doc) });
  race.w.close();

  const click = await boot({ holdAfterRead: false });
  const waitCard = Date.now() + 5000;
  let hostA = null;
  while (Date.now() < waitCard && !hostA) {
    const host = click.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    if (host && boundTo(host, ID_A)) hostA = host;
    await sleep(30);
  }
  check('Q3 in To paints a card bound to that mail', Boolean(hostA), { text: chipText(click.doc) });
  const parent = hostA && hostA.parentNode;
  showMail(click.doc, click.w, MAIL_B);
  await sleep(40);
  if (hostA && parent && !hostA.isConnected) parent.insertBefore(hostA, parent.firstChild);
  const btn = hostA && (hostA.querySelector('button.flow-chip') || hostA.querySelector('.do-halo') || hostA.querySelector('.flow-chip'));
  const before = click.sent.filter((m) => m.type === 'flow:execute-action').length;
  if (btn) btn.click();
  await sleep(400);
  const acts = click.sent.filter((m) => m.type === 'flow:execute-action');
  const ignored = click.logs.some((line) => line.indexOf('stale card click ignored') >= 0);
  check('a click on a card bound to the previous mail does nothing',
    Boolean(hostA) && Boolean(btn) && acts.length === before && ignored,
    { acts: acts.length, ignored: ignored, logs: click.logs.filter((l) => /stale|decision|Glance:/.test(l)).slice(-6) });
  click.w.close();

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
