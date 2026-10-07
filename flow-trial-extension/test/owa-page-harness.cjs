// Outlook on the web, end to end in a fake page: the EXACT file list background.js registers for the Outlook surface
// (manifest content_scripts minus the Gmail-only files, plus SURFACES.outlook.extra), loaded in order into one isolated
// world, on a Hebrew outlook.live.com reading pane whose ad slot changes every 200 ms, with the Graph mailbox behind the
// worker faked. It must mount the Glance card in the open message and log each stage in debug mode.
//
// Needs jsdom (not a dependency of this repo): `npm i --no-save jsdom` or NODE_PATH pointing at one. Without it, SKIPPED.
// Run: node test/owa-page-harness.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('SKIPPED: jsdom not available'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 600) : ''); }
}

// The registered list, read the way background.js builds it.
function registeredFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

const CONV = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEABHUtuqMLBpTa8pX9R6Eknj';
const MSG = 'AQMkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoARgAAA_8Kq-Pilot=';
const ME = 'glance.salisapan@outlook.com';
const BODY = 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team';

async function runPage(opts) {
  const o = opts || {};
  const files = registeredFiles();
  let html = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-he.html'), 'utf8');
  if (o.htmlPatch) html = o.htmlPatch(html);
  const url = o.url || ('https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(o.urlId || CONV));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // innerText needs layout in a real browser; here block elements become lines.
  // Quoted attributes may contain ">" (the persona title is flow &lt;addr&gt;). A [^>]+ strip would end the tag there and leak the attribute into the text.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim(); } });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const logs = [];
  w.console = Object.assign({}, console, {
    log: (...a) => logs.push(a.map(String).join(' ')), info: (...a) => logs.push(a.map(String).join(' ')),
    debug: (...a) => logs.push(a.map(String).join(' ')), warn: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
  });
  const store = Object.assign({
    outlookAuth: { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now() }, account: { address: ME, name: 'Glance' }, ownAddresses: [ME] },
    outlookSync: { stateVersion: 3 }
  }, o.store || {});
  const sent = [];
  const graphMsg = { id: o.messageId || MSG, conversationId: o.listedConversationId || CONV, subject: o.listedSubject || 'Pilot proposal', isDraft: false, hasAttachments: o.hasAttachments === true, internetMessageId: '<pilot@mail.gmail.com>',
    from: { emailAddress: o.graphFrom || { name: 'flow', address: 'ai.local.flow@gmail.com' } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: new Date(Date.now() - 5 * 60e3).toISOString(), webLink: 'https://outlook.live.com/owa/?ItemID=x', body: { contentType: 'text', content: o.mailBody || BODY } };
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') {
      const u = String(msg.url);
      const hdrs = (msg.init && msg.init.headers) || {};
      const bearer = /^Bearer\s+\S+/.test(String(hdrs.Authorization || ''));
      const immutable = /IdType="ImmutableId"/.test(String(hdrs.Prefer || ''));
      if (o.graphDown) return { ok: false, status: 0, error: 'network' };
      if (o.requireOutlookAuth && !bearer) return { ok: false, status: 401, body: '{"error":{"code":"InvalidAuthenticationToken"}}' };
      if (/\/me\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ mail: ME, displayName: 'Glance' }) };
      if (/mailFolders\/inbox\/messages/.test(u)) {
        if (o.inboxLookupEmpty) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
        return { ok: true, status: 200, body: JSON.stringify({ value: o.emptyInbox ? [] : [graphMsg] }) };
      }
      if (/mailFolders\/sentitems\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
      if (/\/me\/messages\?/.test(u)) {
        // Live Graph often answers the conversationId filter with an empty page (or refuses it).
        // The inbox list above is the fallback the open page must use.
        if (o.convFilterEmpty && /conversationId/.test(decodeURIComponent(u))) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
        if (o.convLookupEmpty) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
        return { ok: true, status: 200, body: JSON.stringify({ value: o.emptyInbox ? [] : [graphMsg] }) };
      }
      // Attachments are not the message. A conversation id on this path is a 400.
      // Handle it before the message GET, which would otherwise swallow "/attachments".
      if (o.gateAttachments && /\/me\/messages\/[^?]+\/attachments/.test(u)) {
        const asked = decodeURIComponent((u.match(/\/me\/messages\/([^?]+)\/attachments/) || [])[1] || '');
        const conv = String(o.urlId || o.listedConversationId || '');
        const canon = (s) => String(s || '').replace(/[+\-]/g, '-').replace(/[/_]/g, '_').replace(/=+$/, '');
        if (conv && (asked === conv || canon(asked) === canon(conv))) {
          return { ok: false, status: 400, body: '{"error":{"code":"ErrorInvalidIdMalformed"}}' };
        }
        if (o.attachmentReads === 'fail') return { ok: false, status: 0, error: 'network' };
        if (asked === graphMsg.id) {
          return { ok: true, status: 200, body: JSON.stringify({ value: o.attachmentFiles || [] }) };
        }
        return { ok: false, status: 404, body: '{}' };
      }
      const directMsg = u.match(/\/me\/messages\/([^?]+)/);
      if (directMsg) {
        if (o.pathRestMissUntilClick && !o._doIt) return { ok: false, status: 404, body: '{}' };
        if (o.pathRestNeedsImmutable && !immutable) return { ok: false, status: 404, body: '{}' };
        if (typeof o.pathRestMisses === 'number' && o.pathRestMisses > 0) {
          o.pathRestMisses -= 1;
          return { ok: false, status: 404, body: '{}' };
        }
        if (o.pathRestHit) {
          const asked = decodeURIComponent(directMsg[1]);
          const want = String(o.pathRestId || '');
          const canon = want.replace(/[+\-]/g, '-').replace(/[/_]/g, '_').replace(/=+$/, '');
          if (asked === want || (canon && asked === canon)) {
            return { ok: true, status: 200, body: JSON.stringify(Object.assign({}, graphMsg, { id: o.pathRestGraphId || canon || graphMsg.id, conversationId: o.listedConversationId || CONV })) };
          }
        }
        return { ok: false, status: 404, body: '{}' };
      }
      return { ok: false, status: 404, body: '{}' };
    }
    if (msg.type === 'flow:drive-find-one') return o.driveFind || { match: 'none' };
    if (msg.type === 'flow:execute-action') {
      const p = msg.payload || {};
      if (p.connectorId === 'outlookCalendar') {
        return { ok: true, ref: { eventId: 'ev-hold-1' }, where: 'Outlook Calendar', url: 'https://outlook.live.com/calendar/item/ev-hold-1', written: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00' };
      }
      if (p.driveFileId) return { ok: true, attachmentId: 'att-1', ref: 'draft-1', where: 'https://outlook.live.com/mail/0/drafts', url: 'https://outlook.live.com/mail/0/drafts' };
      return { ok: true, ref: 'draft-1', where: 'https://outlook.live.com/mail/0/drafts', url: 'https://outlook.live.com/mail/0/drafts' };
    }
    if (msg.type === 'flow:undo-action') {
      if (msg.connectorId === 'outlookCalendar') return { ok: true, written: 'Calendar event removed.' };
      return { ok: true, written: 'Reply draft removed. Not sent.' };
    }
    if (msg.type === 'flow:search-drive') {
      const base = o.driveResult
        ? o.driveResult
        : (o.driveDown
          ? { ok: false, reason: 'drive-search-failed', status: 500, error: 'down', files: [], fileCount: 0 }
          : { ok: true, status: 200, files: o.driveFiles || [], fileCount: (o.driveFiles || []).length });
      if (msg.trace) return Object.assign({}, base, { scopes: o.driveScopes || { ok: true, scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/tasks'] } });
      return base;
    }
    return { ok: true };
  }
  w.chrome = {
    runtime: { id: 'dnjhplgmnkabbjogfpbhofjedlkehkai', lastError: null, getURL: (s) => 'chrome-extension://x/' + s, getManifest: () => ({ version: 'test' }), onMessage: { addListener() {} },
      sendMessage: (msg, cb) => { const r = reply(msg); setTimeout(() => cb && cb(r), 5); } },
    storage: {
      local: {
        get: (k, cb) => { const snap = JSON.parse(JSON.stringify(store)); let r; if (k && typeof k === 'object' && !Array.isArray(k)) { r = Object.assign({}, k, snap); } else if (typeof k === 'string') { r = { [k]: snap[k] }; } else if (Array.isArray(k)) { r = {}; k.forEach((x) => { r[x] = snap[x]; }); } else r = snap; if (cb) setTimeout(() => cb(r), 1); return Promise.resolve(r); },
        set: (p, cb) => { Object.assign(store, JSON.parse(JSON.stringify(p))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => delete store[x]); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} }, sync: { get: (k, cb) => cb({}) }
    },
    i18n: { getUILanguage: () => 'he' }
  };
  const ctx = dom.getInternalVMContext();
  const throws = [];
  for (const f of files) {
    try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx); }
    catch (e) { throws.push(f + ': ' + e.message.split('\n')[0]); }
  }
  // OWA never stops changing the page: an ad slot, presence, "x min ago".
  let n = 0;
  const ad = o.quiet ? null : setInterval(() => { const a = w.document.getElementById('ad'); if (a) a.textContent = 'ad ' + (++n); }, 200);
  const deadline = Date.now() + (o.waitMs || 6000);
  while (Date.now() < deadline && !w.document.querySelector('.flow-chip-host')) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const logsAtCard = logs.length;
  // A live re-parse: the open message's header changes under the card (the address leaves the persona).
  if (typeof o.mutate === 'function') o.mutate(w.document);
  // Keep the page churning with the card up, to see whether the open message is judged again on every tick.
  if (o.afterMs) await new Promise((r) => setTimeout(r, o.afterMs));
  let chipMessage = null;
  if (o.clickDoIt) {
    o._doIt = true;
    const hostBefore = w.document.querySelector('.flow-chip-host');
    chipMessage = hostBefore && hostBefore.getAttribute('data-glance-message');
    const btn = w.document.querySelector('.flow-chip-host .flow-chip');
    if (btn) btn.click();
    const until = Date.now() + 2500;
    while (Date.now() < until && !sent.some((m) => m.type === 'flow:execute-action')) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 200));
    if (o.shadowShown) {
      const live = w.document.querySelector('.flow-chip-host');
      const id = (live && live.getAttribute('data-glance-message')) || chipMessage;
      const log = Array.isArray(store.log) ? store.log.slice() : [];
      log.unshift({ ts: Date.now() + 50, kind: 'shown', messageId: id, app: 'outlook', label: 'Hold the file' });
      store.log = log;
    }
    if (o.rescan) {
      try { vm.runInContext('if (globalThis.__glanceOutlookPage) __glanceOutlookPage.rescan()', ctx); } catch (e) { /* page script missing */ }
      await new Promise((r) => setTimeout(r, o.afterClickMs || 1200));
    }
    if (o.clickUndo) {
      const undo = w.document.querySelector('.flow-chip-undo');
      if (undo) undo.click();
      const untilUndo = Date.now() + 2000;
      while (Date.now() < untilUndo && !sent.some((m) => m.type === 'flow:undo-action')) await new Promise((r) => setTimeout(r, 40));
      await new Promise((r) => setTimeout(r, 150));
    }
  } else if (o.clickUndo) {
    const undo = w.document.querySelector('.flow-chip-undo');
    if (undo) undo.click();
    const untilUndo = Date.now() + 2000;
    while (Date.now() < untilUndo && !sent.some((m) => m.type === 'flow:undo-action')) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
  }
  clearInterval(ad);
  let parsed = null;
  try { parsed = vm.runInContext('FlowOwaParse.readPane(document, location.href, { own: [' + JSON.stringify(ME) + '] })', ctx); } catch (e) { parsed = { error: e.message }; }
  const res = { files, throws, logs, logsAtCard, parsed, store, sent, chip: w.document.querySelector('.flow-chip-host'), chipMessage, doc: w.document };
  w.close();
  return res;
}

(async () => {
  console.log('\n--- the registered file list ---\n');
  const files = registeredFiles();
  check('every registered file exists in the extension', files.every((f) => fs.existsSync(path.join(ROOT, f))), files.filter((f) => !fs.existsSync(path.join(ROOT, f))));
  check('no file is registered twice (a second const declaration would throw in the shared isolated world)', new Set(files).size === files.length);
  check('the Outlook page gets the shared judge and the page script last', files.indexOf('core/incoming-judge.js') >= 0 && files[files.length - 1] === 'src/content-outlook.js', files.slice(-3));

  console.log('\n--- a Hebrew outlook.live.com reading pane, the Pilot proposal open, debug on ---\n');
  {
    const r = await runPage({ store: { glanceDebug: true } });
    check('every registered file loads in order without throwing', r.throws.length === 0, r.throws);
    check('the first Glance line says the Outlook page script started', r.logs.some((l) => /^Glance: outlook content start/.test(l)), r.logs.slice(0, 5));
    check('the Glance card is mounted in the open message', Boolean(r.chip), r.logs.filter((l) => /^Glance:/.test(l)));
    check('it is inside the reading pane, not the message list', r.chip && !r.chip.closest('[role="listbox"]') && Boolean(r.chip.closest('#ReadingPaneContainerId')));
    for (const stage of ['parsed', 'matched', 'judged', 'decision', 'rendered']) {
      check('debug logs the "' + stage + '" stage', r.logs.some((l) => new RegExp('^Glance: ' + stage).test(l)), r.logs.filter((l) => /^Glance:/.test(l)));
    }
    check('matched by the conversation id in the URL', r.logs.some((l) => /^Glance: matched/.test(l) && /conversation/.test(l)), r.logs.filter((l) => /^Glance: matched/.test(l)));
  }
  console.log('\n--- debug off: one start line, nothing else ---\n');
  {
    const r = await runPage({});
    check('the card still mounts', Boolean(r.chip));
    check('only the start line is logged', r.logs.filter((l) => /^Glance:/.test(l)).length === 1, r.logs.filter((l) => /^Glance:/.test(l)));
  }
  console.log('\n--- when there is no card, there is a reason ---\n');
  {
    const r = await runPage({ emptyInbox: true, graphDown: false, urlId: CONV, store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3 }, account: { address: ME } } }, waitMs: 3000 });
    // The mailbox does not have it (e.g. not synced yet) and the open text is still judged by the same engine: the card
    // needs a Graph message id for createReply. Either a card or a recorded page reason, never neither.
    const reasons = (r.store.outlookPageDiag || []).map((d) => d.reason);
    check('no synced message: either a card or a reason in Why not shown', Boolean(r.chip) || reasons.length > 0, { chip: Boolean(r.chip), reasons });
  }
  {
    const r = await runPage({ store: { outlookAuth: null }, waitMs: 2000 });
    const reasons = (r.store.outlookPageDiag || []).map((d) => d.reason);
    check('Outlook not connected: no card, and the reason is recorded', !r.chip && reasons.indexOf('page:not-connected') >= 0, reasons);
  }

  {
    // A message is open but none of the body anchors are on the page (Outlook changed its markup): the reason says so.
    const strip = (h) => h.replace('role="document" aria-label="גוף ההודעה" class="XbIp4 allowTextSelection"', 'class="XbIp4"');
    const r = await runPage({ htmlPatch: strip, waitMs: 2500 });
    const diag = (r.store.outlookPageDiag || []).find((d) => d.reason === 'page:pane-unreadable');
    check('an open message whose body Glance cannot find: "page:pane-unreadable", with the anchors it saw', !r.chip && diag && diag.anchors && diag.anchors.main === 1, r.store.outlookPageDiag);
  }
  {
    // The conversation is in the mailbox but the address carries a message id Graph spells with the other alphabet.
    const r = await runPage({ urlId: MSG.replace(/_/g, '/').replace(/-/g, '+'), store: { glanceDebug: true } });
    check('a message id in EWS spelling (+ and /) still matches the Graph id (- and _)', Boolean(r.chip) && r.logs.some((l) => /^Glance: matched/.test(l) && /message id/.test(l)), r.logs.filter((l) => /^Glance: matched/.test(l)));
  }

  console.log('\n--- live shape (0.9.15 live pass): the sender name is the heading inside the message, no address on the page ---\n');
  {
    // Real Hebrew OWA: subject "Pilot proposal" in the reading-pane header above the message; inside the message a heading
    // with only the display name "flow" (the address lives in a hover card) and the "אל: <me>" row. 0.9.15 read "flow" as
    // the subject and an empty sender, so the subject+sender fallback could never work.
    const live = (h) => h.replace(/<div class="persona">[\s\S]*?<\/div>/, '<div class="persona"><div role="heading" aria-level="3" class="senderName"><span>flow</span></div></div>');
    const r = await runPage({ htmlPatch: live, store: { glanceDebug: true }, afterMs: 2500 });
    const p = r.parsed || {};
    check('live shape: subject is the reading-pane header "Pilot proposal", not the sender name', p.subject === 'Pilot proposal', p);
    check('live shape: sender name is "flow", and the own address in the "אל:" row is never the sender', p.senderName === 'flow' && p.senderEmail !== ME, p);
    check('live shape: the card still mounts (matched by conversation id)', Boolean(r.chip), r.logs.filter((l) => /^Glance:/.test(l)));
    const after = r.logs.slice(r.logsAtCard).filter((l) => /^Glance: (parsed|matched|judged|decision|rendered)/.test(l));
    check('same open message, same text, card up: not parsed/matched/judged again on every tick (2.5 s of page churn)', after.length === 0, after);
    const parsedLines = r.logs.filter((l) => /^Glance: parsed/.test(l));
    check('the parsed line is logged once, with subject and sender name', parsedLines.length === 1 && /Pilot proposal/.test(parsedLines[0]) && /"senderName":"flow"/.test(parsedLines[0]), parsedLines);

    // Same page, but the address carries no id at all: only the subject + sender-name fallback can find the message.
    const n = await runPage({ htmlPatch: live, url: 'https://outlook.live.com/mail/0/inbox', store: { glanceDebug: true } });
    check('no id in the address: the card mounts, matched by subject and sender name', Boolean(n.chip) && n.logs.some((l) => /^Glance: matched/.test(l) && /subject and sender name/.test(l)), n.logs.filter((l) => /^Glance: (parsed|matched|decision)/.test(l)));

    // A different sender with the same subject must not be taken for this message when there is no id to go on.
    const other = (h) => live(h).replace('<span>flow</span></div></div>', '<span>Someone Else</span></div></div>');
    const o = await runPage({ htmlPatch: other, url: 'https://outlook.live.com/mail/0/inbox', store: { glanceDebug: true }, waitMs: 2500 });
    check('no id, same subject, different sender name: no card from the wrong message', !o.chip && !o.logs.some((l) => /^Glance: matched/.test(l) && /subject and sender name/.test(l)), o.logs.filter((l) => /^Glance: (matched|decision)/.test(l)));
  }
  {
    // The original fixture (address in the persona title) keeps working: subject from the header, address as the sender.
    const r = await runPage({});
    const p = r.parsed || {};
    check('fixture with the address on the page: subject "Pilot proposal", sender ai.local.flow@gmail.com', p.subject === 'Pilot proposal' && p.senderEmail === 'ai.local.flow@gmail.com', p);
  }

  console.log('\n--- a date row next to the sender (0.9.17 live miss) ---\n');
  {
    // Real Hebrew OWA: the first read of the open message is correct (subject, address, display name "flow").
    // A later read of the same message no longer has the address, and the date/time row beside the sender
    // ("ג 06/10/2026" + an RTL mark + "01:16") was taken as the sender name. That changed the scan signature
    // and matched/judged the same message again.
    const DATE = '\u05d2 06/10/2026 \u200f01:16';
    const dateRow = (h) => h.replace(
      '<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div role="heading" aria-level="3" class="dateRow">' + DATE + '</div>'
    );
    // The name lives only in the persona, not in a heading. The date row is the heading nearest the body.
    const nameOnly = (h) => dateRow(h).replace(
      /<div class="persona">[\s\S]*?<\/div>/,
      '<div class="persona"><span class="senderName">flow</span></div>'
    );
    const r = await runPage({ htmlPatch: nameOnly, store: { glanceDebug: true } });
    const p = r.parsed || {};
    check('date row adjacent to the persona is not the sender name', p.subject === 'Pilot proposal' && p.senderName === 'flow' && p.senderEmail !== ME, p);

    // No persona element: the sender heading, then the date heading. The date must not win by being nearer the body.
    const headingOnly = (h) => dateRow(h).replace(
      /<div class="persona">[\s\S]*?<\/div>/,
      '<div role="heading" aria-level="3" class="senderHeading"><span>flow</span></div>'
    );
    const h = await runPage({ htmlPatch: headingOnly, store: { glanceDebug: true } });
    check('a date heading after the sender heading is rejected', (h.parsed || {}).senderName === 'flow', h.parsed);
    const wed = await runPage({ htmlPatch: (html) => headingOnly(html).replace(DATE, 'Wed 06/10/2026 01:16'), store: { glanceDebug: true } });
    check('an English weekday date row is not the sender name', (wed.parsed || {}).senderName === 'flow', wed.parsed);
    const dot = await runPage({ htmlPatch: (html) => headingOnly(html).replace(DATE, '06.10.2026 01:16'), store: { glanceDebug: true } });
    check('a dotted date row is not the sender name', (dot.parsed || {}).senderName === 'flow', dot.parsed);

    // First read has the address. Then the address leaves the header and the page reads the message again.
    const again = await runPage({
      htmlPatch: dateRow,
      store: { glanceDebug: true },
      afterMs: 3000,
      mutate(doc) {
        const span = doc.querySelector('.persona span');
        if (span) { span.removeAttribute('title'); span.removeAttribute('aria-label'); }
        if (doc.defaultView && doc.defaultView.__glanceOutlookPage) doc.defaultView.__glanceOutlookPage.rescan();
      }
    });
    const parsedLines = again.logs.filter((l) => /^Glance: parsed/.test(l));
    const first = parsedLines[0] || '';
    const last = parsedLines[parsedLines.length - 1] || '';
    check('the first parse keeps the address and the name "flow"', parsedLines.length >= 1 && /"sender":"ai\.local\.flow@gmail\.com"/.test(first) && /"senderName":"flow"/.test(first), parsedLines);
    check('a re-parse of the same conversation keeps the last good sender, not the date row',
      parsedLines.length === 2 && /"sender":"ai\.local\.flow@gmail\.com"/.test(last) && /"senderName":"flow"/.test(last) && !/2026/.test(last),
      parsedLines);
    const judged = again.logs.filter((l) => /^Glance: judged/.test(l));
    check('the date row does not judge the same message on every tick', judged.length === 2, judged.map((l) => l.slice(0, 160)));
  }

  console.log('\n--- a file ask: Drive and this thread, the same chain as Gmail ---\n');
  {
    const invoice = (h) => h.replace(
      'Could you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.',
      'Please send me the invoice by Thursday.'
    );
    const missing = await runPage({ htmlPatch: invoice, emptyInbox: true, urlId: MSG, driveFiles: [], store: { glanceDebug: true }, waitMs: 5000 });
    check('the open invoice ask searches Drive', missing.sent.some((m) => m.type === 'flow:search-drive'), missing.sent.map((m) => m.type));
    check('nothing in Drive or this thread: a holding card', missing.chip && missing.chip.getAttribute('data-glance-chain') === 'needs-you', missing.logs.filter((l) => /^Glance:/.test(l)));
    check('that card drafts a holding reply and is not labelled Do It', missing.chip && /Draft a holding reply/.test(missing.chip.textContent) && !/Do It/.test(missing.chip.textContent), missing.chip && missing.chip.textContent);
    check('the page did not send', !missing.sent.some((m) => /send/i.test(String(m.type)) && m.type !== 'flow:search-drive'));
    const found = await runPage({
      htmlPatch: invoice, emptyInbox: true, urlId: MSG, waitMs: 4000,
      driveFiles: [{ id: 'f1', name: 'Invoice 204.pdf', mimeType: 'application/pdf' }]
    });
    const reasons = (found.store.outlookPageDiag || []).map((d) => d.reason);
    check('one Drive file offers Do It and does not claim the file is already attached', found.chip && found.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(found.chip.textContent) && !/attached/i.test(found.chip.textContent) && reasons.indexOf('outlook:file-found-no-attach') < 0, { reasons, text: found.chip && found.chip.textContent });
    const he = (h) => h.replace(
      'Could you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.',
      'שלח לי את החשבונית עד יום חמישי.'
    );
    const hebrew = await runPage({ htmlPatch: he, emptyInbox: true, urlId: MSG, driveFiles: [], waitMs: 5000 });
    check('the Hebrew direct ask gets the Hebrew holding label', hebrew.chip && hebrew.chip.getAttribute('data-glance-chain') === 'needs-you' && /טיוטת תשובת ביניים/.test(hebrew.chip.textContent), hebrew.chip && hebrew.chip.textContent);
  }

  console.log('\n--- Q4 pricing sheet: mocked Drive, the file chain actually runs ---\n');
  {
    const Q4 = "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?";
    const q4html = (h) => h.replace(
      'Could you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.',
      Q4
    );
    const file = { id: 'f-q4', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' };
    const reasonsOf = (r) => ({
      page: (r.store.outlookPageDiag || []).map((d) => d.reason),
      plan: ((r.store.outlookSync && r.store.outlookSync.diagnostics) || []).map((d) => d.reason)
    });
    const stalled = (bag) => bag.page.indexOf('file-needs-drive') >= 0 || bag.plan.indexOf('file-needs-drive') >= 0 || bag.page.indexOf('file-chain-not-run') >= 0 || bag.plan.indexOf('file-chain-not-run') >= 0;

    const one = await runPage({ htmlPatch: q4html, mailBody: Q4, driveFiles: [file], afterMs: 800, waitMs: 6000 });
    const oneQuery = (one.sent.find((m) => m.type === 'flow:search-drive') || {}).query || '';
    check('one Drive file: the query names the cited slug', /glance-pricing-q4/.test(oneQuery), one.sent.filter((m) => m.type === 'flow:search-drive'));
    check('one Drive file: Do It is ready to attach, and the search was not traced', one.chip && one.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(one.chip.textContent) && !one.sent.some((m) => m.type === 'flow:search-drive' && m.trace), { text: one.chip && one.chip.textContent, traced: one.sent.filter((m) => m.trace) });
    const oneWhy = reasonsOf(one);
    check('one Drive file: Why not shown drops the file stall', !stalled(oneWhy), oneWhy);

    const none = await runPage({ htmlPatch: q4html, mailBody: Q4, driveFiles: [], waitMs: 6000 });
    check('zero Drive files: a holding card, not Do It', none.chip && none.chip.getAttribute('data-glance-chain') === 'needs-you' && /Draft a holding reply/.test(none.chip.textContent) && !/Do It/.test(none.chip.textContent), none.chip && none.chip.textContent);

    const failed = await runPage({
      htmlPatch: q4html, mailBody: Q4, waitMs: 5000,
      driveResult: { ok: false, reason: 'drive-search-failed', status: 503, error: 'backend', files: [], fileCount: 0 }
    });
    const failedWhy = reasonsOf(failed);
    check('a failed search stays silent', !failed.chip, failed.chip && failed.chip.textContent);
    check('a failed search says drive-search-failed', failedWhy.page.indexOf('drive-search-failed') >= 0 || failedWhy.plan.indexOf('drive-search-failed') >= 0, failedWhy);
    check('a failed search is not file-needs-drive or file-chain-not-run', !stalled(failedWhy), failedWhy);

    const denied = await runPage({
      htmlPatch: q4html, mailBody: Q4, waitMs: 5000,
      driveResult: { ok: false, reason: 'drive-not-granted', status: 403, error: 'insufficientPermissions', files: [], fileCount: 0 }
    });
    const deniedWhy = reasonsOf(denied);
    check('a missing Drive grant says drive-not-granted', !denied.chip && (deniedWhy.page.indexOf('drive-not-granted') >= 0 || deniedWhy.plan.indexOf('drive-not-granted') >= 0), deniedWhy);
    check('a missing Drive grant is not the old stall', !stalled(deniedWhy), deniedWhy);

    const traced = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], afterMs: 800, waitMs: 6000,
      store: { glanceOutlookFileTrace: 1 }
    });
    const line = traced.logs.find((l) => l.indexOf('Glance: file-trace ') === 0) || '';
    let payload = null;
    try { payload = JSON.parse(line.slice('Glance: file-trace '.length)); } catch (e) { payload = { parse: e.message, line: line }; }
    check('the armed trace logs one Glance: file-trace line', Boolean(payload && payload.decide), payload);
    check('the trace records the decision, the search, the query, the file count, the scopes, and prepare',
      payload && payload.decide && payload.decide.reason === 'file-chain-not-run' && payload.resolveFileChain === 'searched'
      && payload.gate && payload.gate.kind === 'clear' && /glance-pricing-q4/.test(String(payload.driveQuery || ''))
      && payload.search && payload.search.ok === true && payload.search.fileCount === 1
      && payload.scopes && payload.scopes.scopes && payload.scopes.scopes.indexOf('https://www.googleapis.com/auth/drive.readonly') >= 0
      && payload.final === 'prepare', payload);
    check('the armed search asks the worker for scopes', traced.sent.some((m) => m.type === 'flow:search-drive' && m.trace === true), traced.sent.filter((m) => m.type === 'flow:search-drive'));
    check('the trace still prepares the file', traced.chip && traced.chip.getAttribute('data-glance-chain') === 'prepare', traced.chip && traced.chip.getAttribute('data-glance-chain'));

    const staleSchedule = {
      messageId: MSG,
      outlookIncomingId: MSG,
      outlookConversationId: CONV,
      threadId: 'ol:' + CONV,
      subject: 'Pilot proposal',
      sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
      intent: { type: 'event', label: 'Schedule the meeting' },
      process: {
        id: 'schedule-confirm',
        name: 'Schedule & Confirm',
        closingLine: 'Scheduling this, drafting a reply to confirm, and setting a follow-up.',
        steps: []
      }
    };
    const stuckFailed = await runPage({
      htmlPatch: q4html, mailBody: Q4, waitMs: 5000,
      driveResult: { ok: false, reason: 'drive-search-failed', status: 503, error: 'backend', files: [], fileCount: 0 },
      store: { outlookPending: { offers: [], asks: [], incoming: [staleSchedule] }, outlookSync: { stateVersion: 4 } }
    });
    const stuckFailedWhy = reasonsOf(stuckFailed);
    check('a stored Scheduling card does not stay up when the search fails', !stuckFailed.chip && !/Scheduling/.test((stuckFailed.doc && stuckFailed.doc.body && stuckFailed.doc.body.textContent) || ''), stuckFailed.chip && stuckFailed.chip.textContent);
    check('that failed search and the page agree on drive-search-failed', stuckFailedWhy.page.indexOf('drive-search-failed') >= 0, stuckFailedWhy);

    const stuckDenied = await runPage({
      htmlPatch: q4html, mailBody: Q4, waitMs: 5000,
      driveResult: { ok: false, reason: 'drive-not-granted', status: 403, error: 'insufficientPermissions', files: [], fileCount: 0 },
      store: { outlookPending: { offers: [], asks: [], incoming: [staleSchedule] }, outlookSync: { stateVersion: 4 } }
    });
    const stuckDeniedWhy = reasonsOf(stuckDenied);
    check('Google disconnected: no schedule card, drive-not-granted', !stuckDenied.chip && !/Scheduling/.test((stuckDenied.doc && stuckDenied.doc.body && stuckDenied.doc.body.textContent) || '') && stuckDeniedWhy.page.indexOf('drive-not-granted') >= 0, stuckDeniedWhy);

    const stuckOne = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], afterMs: 800, waitMs: 6000,
      store: { outlookPending: { offers: [], asks: [], incoming: [staleSchedule] }, outlookSync: { stateVersion: 4 } }
    });
    check('one Drive file replaces the stored Scheduling card with prepare', stuckOne.chip && stuckOne.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(stuckOne.chip.textContent) && !/Scheduling/.test(stuckOne.chip.textContent), stuckOne.chip && stuckOne.chip.textContent);

    const alias = await runPage({
      htmlPatch: q4html, mailBody: Q4, waitMs: 4500,
      graphFrom: { name: 'Sali', address: ME },
      store: {
        outlookAuth: {
          token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now() },
          account: { address: ME, name: 'Glance' },
          ownAddresses: [ME, 'salisapan1@gmail.com']
        },
        outlookSync: { stateVersion: 4, diagnostics: [{ conversationId: CONV, subject: 'Pilot proposal', reason: 'own-sender', counterpart: ME }] },
        outlookPending: { offers: [], asks: [], incoming: [staleSchedule] }
      }
    });
    const aliasWhy = reasonsOf(alias);
    check('mail from the same account stays silent, schedule card included', !alias.chip && !/Scheduling/.test((alias.doc && alias.doc.body && alias.doc.body.textContent) || ''), alias.chip && alias.chip.textContent);
    check('the page records own-sender or note-to-self', aliasWhy.page.indexOf('own-sender') >= 0 || aliasWhy.page.indexOf('note-to-self') >= 0 || aliasWhy.plan.indexOf('own-sender') >= 0 || aliasWhy.plan.indexOf('note-to-self') >= 0, aliasWhy);

    // Live 0.9.19: itemId null, conversationId set, Drive fileCount 1, prepare chosen,
    // conversationId $filter returned nothing, showFilePrepare returned false, final outlook:file-found-no-attach.
    const convOnly = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000,
      convFilterEmpty: true, listedConversationId: CONV + '==', listedSubject: 'Q4 pricing sheet - retest 3',
      store: { glanceOutlookFileTrace: 1 }
    });
    const convLine = convOnly.logs.find((l) => l.indexOf('Glance: file-trace ') === 0) || '';
    let convPayload = null;
    try { convPayload = JSON.parse(convLine.slice('Glance: file-trace '.length)); } catch (e) { convPayload = { parse: e.message, line: convLine }; }
    const convWhy = reasonsOf(convOnly);
    check('conversation id only, filter empty, inbox list has the mail: floating Do It', convOnly.chip && convOnly.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(convOnly.chip.textContent) && !/Scheduling/.test(convOnly.chip.textContent), convOnly.chip && convOnly.chip.textContent);
    check('that card is not silenced as outlook:file-found-no-attach', convWhy.page.indexOf('outlook:file-found-no-attach') < 0 && convPayload && convPayload.final === 'prepare', { why: convWhy, payload: convPayload });
    check('the trace names how the message id was resolved and that showFilePrepare showed', convPayload && convPayload.messageIdFrom === 'inbox-list' && convPayload.showFilePrepare === 'shown', convPayload);
    check('the resolved id is the Graph message, not the conversation id', convOnly.chip && convOnly.chip.getAttribute('data-glance-message') === MSG, convOnly.chip && convOnly.chip.getAttribute('data-glance-message'));

    const noId = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 5500,
      convFilterEmpty: true, inboxLookupEmpty: true, convLookupEmpty: true,
      store: { glanceOutlookFileTrace: 1 }
    });
    const noIdLine = noId.logs.find((l) => l.indexOf('Glance: file-trace ') === 0) || '';
    let noIdPayload = null;
    try { noIdPayload = JSON.parse(noIdLine.slice('Glance: file-trace '.length)); } catch (e) { noIdPayload = { parse: e.message, line: noIdLine }; }
    const noIdWhy = reasonsOf(noId);
    check('Drive hit with no Graph message id still floats Do It, not a blank or a schedule card', noId.chip && noId.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(noId.chip.textContent) && !/Scheduling/.test((noId.doc && noId.doc.body && noId.doc.body.textContent) || ''), noId.chip && noId.chip.textContent);
    check('a missing message id is logged and is not outlook:file-found-no-attach', noIdPayload && noIdPayload.showFilePrepare === 'shown-without-message-id' && noIdPayload.messageIdFrom === 'none' && noIdPayload.final === 'prepare' && noIdWhy.page.indexOf('outlook:file-found-no-attach') < 0, { why: noIdWhy, payload: noIdPayload });

    const clicked = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000,
      convFilterEmpty: true, listedConversationId: CONV + '==', listedSubject: 'Q4 pricing sheet - retest 3', clickDoIt: true, clickUndo: true
    });
    const drafted = clicked.sent.filter((m) => m.type === 'flow:execute-action');
    const draft = drafted[0] && drafted[0].payload;
    check('Do It writes one Outlook draft with the Drive file and does not send', drafted.length === 1 && draft && draft.connectorId === 'outlookDraft' && draft.driveFileId === file.id && draft.outlookIncomingId === MSG && !clicked.sent.some((m) => /\/(send|sendMail)/.test(String(m.type)) || m.type === 'flow:send'), { types: clicked.sent.map((m) => m.type), draft: draft && { connectorId: draft.connectorId, driveFileId: draft.driveFileId, outlookIncomingId: draft.outlookIncomingId } });
    check('Undo deletes that draft', clicked.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookDraft' && m.ref === 'draft-1'), clicked.sent.filter((m) => m.type === 'flow:undo-action'));

    // Live 0.9.20: /inbox/id/<AQQk…/…> mounted the card, Do It said "Could not find that message".
    // CoS: that path RestId is the Graph message id. GET it (canon spelling), keep the conversation fallbacks.
    const PATH_REST = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEADOYVBZWJ53SZbHJB/BYaEW';
    const PATH_GRAPH = PATH_REST.replace(/\//g, '_');
    const pathHit = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000, urlId: PATH_REST,
      convFilterEmpty: true, inboxLookupEmpty: true, convLookupEmpty: true,
      pathRestHit: true, pathRestId: PATH_REST, pathRestGraphId: PATH_GRAPH,
      clickDoIt: true, clickUndo: true,
      store: { glanceOutlookFileTrace: 1 }
    });
    const pathLine = pathHit.logs.find((l) => l.indexOf('Glance: file-trace ') === 0) || '';
    let pathPayload = null;
    try { pathPayload = JSON.parse(pathLine.slice('Glance: file-trace '.length)); } catch (e) { pathPayload = { parse: e.message, line: pathLine }; }
    const pathDrafts = pathHit.sent.filter((m) => m.type === 'flow:execute-action');
    const pathDraft = pathDrafts[0] && pathDrafts[0].payload;
    const pathGets = pathHit.sent.filter((m) => m.type === 'flow:outlook-fetch' && /\/me\/messages\/[^?]/.test(String(m.url)));
    check('path /inbox/id/{restId} resolves by GET /me/messages/{canon id}', pathPayload && pathPayload.messageIdFrom === 'path-rest-id' && pathPayload.showFilePrepare === 'shown' && pathHit.chipMessage === PATH_GRAPH, { messageIdFrom: pathPayload && pathPayload.messageIdFrom, show: pathPayload && pathPayload.showFilePrepare, message: pathHit.chipMessage, gets: pathGets.map((m) => m.url) });
    check('that Do It writes one draft with the Drive file on the Graph id and does not send', pathDrafts.length === 1 && pathDraft && pathDraft.connectorId === 'outlookDraft' && pathDraft.driveFileId === file.id && pathDraft.outlookIncomingId === PATH_GRAPH && !pathHit.sent.some((m) => m.type === 'flow:send'), { types: pathHit.sent.map((m) => m.type), id: pathDraft && pathDraft.outlookIncomingId });
    check('Undo deletes the path-id draft', pathHit.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookDraft' && m.ref === 'draft-1'));
    check('Do It does not clear an armed file trace', pathHit.store.glanceOutlookFileTrace === 1, pathHit.store.glanceOutlookFileTrace);

    // The card mounted with no id (show-time GETs missed). The click must still resolve the same path id.
    const pathLate = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000, urlId: PATH_REST,
      convFilterEmpty: true, inboxLookupEmpty: true, convLookupEmpty: true,
      pathRestHit: true, pathRestId: PATH_REST, pathRestGraphId: PATH_GRAPH, pathRestMissUntilClick: true,
      clickDoIt: true,
      store: { glanceOutlookFileTrace: 1 }
    });
    const lateDrafts = pathLate.sent.filter((m) => m.type === 'flow:execute-action');
    const lateDraft = lateDrafts[0] && lateDrafts[0].payload;
    const lateDoIt = pathLate.logs.filter((l) => l.indexOf('Glance: file-trace ') === 0).map((l) => {
      try { return JSON.parse(l.slice('Glance: file-trace '.length)); } catch (e) { return null; }
    }).find((p) => p && p.phase === 'do-it');
    check('a card that mounted without a message id still drafts on Do It from the path RestId', pathLate.chip && pathLate.chip.getAttribute('data-glance-message') === '' && lateDrafts.length === 1 && lateDraft && lateDraft.outlookIncomingId === PATH_GRAPH && lateDraft.driveFileId === file.id && lateDraft.connectorId === 'outlookDraft', { attr: pathLate.chip && pathLate.chip.getAttribute('data-glance-message'), id: lateDraft && lateDraft.outlookIncomingId, text: pathLate.chip && pathLate.chip.textContent });
    check('the click trace names path-rest-id and the flag stays armed', lateDoIt && lateDoIt.messageIdFrom === 'path-rest-id' && lateDoIt.resolved === true && pathLate.store.glanceOutlookFileTrace === 1, { lateDoIt, flag: pathLate.store.glanceOutlookFileTrace });

    // Live 0.9.21: the same path id, Drive hit, messageIdFrom none. The page GET carried no bearer.
    function traceLines(r) {
      return r.logs.filter((l) => l.indexOf('Glance: file-trace ') === 0).map((l) => {
        try { return JSON.parse(l.slice('Glance: file-trace '.length)); } catch (e) { return null; }
      }).filter(Boolean);
    }
    const authed = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000, urlId: PATH_REST,
      convFilterEmpty: true, inboxLookupEmpty: true, convLookupEmpty: true,
      requireOutlookAuth: true, pathRestHit: true, pathRestId: PATH_REST, pathRestGraphId: PATH_GRAPH,
      clickDoIt: true,
      store: { glanceOutlookFileTrace: 1 }
    });
    const authDoIt = traceLines(authed).find((p) => p.phase === 'do-it');
    const authScan = traceLines(authed).find((p) => p.final === 'prepare');
    const authGets = authed.sent.filter((m) => m.type === 'flow:outlook-fetch' && /\/me\/messages\/[^?]/.test(String(m.url)));
    const authDraft = (authed.sent.find((m) => m.type === 'flow:execute-action') || {}).payload;
    check('the path GET carries the mailbox bearer and Do It drafts that message', authGets.length >= 1 && authGets.every((m) => /^Bearer\s+AT$/.test(String((m.init && m.init.headers && m.init.headers.Authorization) || ''))) && authDraft && authDraft.outlookIncomingId === PATH_GRAPH && authDraft.driveFileId === file.id && authDraft.connectorId === 'outlookDraft', { gets: authGets.map((m) => m.init && m.init.headers), id: authDraft && authDraft.outlookIncomingId });
    check('the click trace records status, pathId, conversationId, and itemId', authDoIt && authDoIt.resolved === true && authDoIt.messageIdFrom === 'path-rest-id' && authDoIt.pathId === PATH_REST && authDoIt.conversationId === PATH_REST && authDoIt.itemId == null && Array.isArray(authDoIt.graph) && authDoIt.graph.some((a) => a && a.status === 200 && a.how === 'path-rest-id'), authDoIt);
    check('the scan trace names the same path id', authScan && authScan.pathId === PATH_REST && authScan.conversationId === PATH_REST && authScan.messageIdFrom === 'path-rest-id', authScan);

    const imm = await runPage({
      htmlPatch: q4html, mailBody: Q4, driveFiles: [file], waitMs: 6000, urlId: PATH_REST,
      convFilterEmpty: true, inboxLookupEmpty: true, convLookupEmpty: true,
      requireOutlookAuth: true, pathRestNeedsImmutable: true,
      pathRestHit: true, pathRestId: PATH_REST, pathRestGraphId: PATH_GRAPH,
      clickDoIt: true, clickUndo: true,
      store: { glanceOutlookFileTrace: 1 }
    });
    const immDraft = (imm.sent.find((m) => m.type === 'flow:execute-action') || {}).payload;
    const immGets = imm.sent.filter((m) => m.type === 'flow:outlook-fetch' && /\/me\/messages\/[^?]/.test(String(m.url)) && /IdType="ImmutableId"/.test(String((m.init && m.init.headers && m.init.headers.Prefer) || '')));
    const immUndo = imm.sent.find((m) => m.type === 'flow:undo-action');
    check('an AQQk id that Graph only accepts as an immutable id still drafts, and Undo keeps that header flag', immGets.length >= 1 && immDraft && immDraft.outlookIncomingId === PATH_GRAPH && immDraft.outlookImmutableId === true && immUndo && immUndo.outlookImmutableId === true, { prefer: immGets.length, immutable: immDraft && immDraft.outlookImmutableId, undo: immUndo && immUndo.outlookImmutableId });
  }

  console.log('\n--- Family B file on the calendar (engineering gate, 0.9.27) ---\n');
  {
    const GATE = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
    const gateHtml = (h) => h
      .replace('flow &lt;ai.local.flow@gmail.com&gt;', 'Glance &lt;' + ME + '&gt;')
      .replace('aria-label="מאת: flow">flow', 'aria-label="מאת: Glance">Glance')
      .replace(/<div>Hi Sali,<\/div>[\s\S]*?<div>Flow team<\/div>/, '<div>' + GATE + '</div>');
    const file = { id: 'f1', name: 'glance-pricing-q4.pdf', url: 'https://drive.google.com/file/d/f1/view' };
    const blocked = await runPage({
      htmlPatch: gateHtml, waitMs: 2500,
      store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.Read', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] } },
      driveFind: { match: 'one', file: file }
    });
    const blockedWhy = (blocked.store.outlookPageDiag || []).map((d) => d.reason);
    check('without Calendars.ReadWrite the note stays quiet and names the missing scope', !blocked.chip && blockedWhy.indexOf('outlook-calendar-write-not-granted') >= 0, blockedWhy);
    check('that quiet path does not draft a reply', !blocked.sent.some((m) => m.type === 'flow:execute-action'), blocked.sent.map((m) => m.type));

    const shown = await runPage({
      htmlPatch: gateHtml, waitMs: 4000,
      store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] } },
      driveFind: { match: 'one', file: file }
    });
    check('a note to yourself with one Drive file shows Hold it',
      Boolean(shown.chip) && /Hold it/.test(shown.chip.textContent) && shown.chip.getAttribute('data-glance-chain') === 'calendar-hold' && /Do It/.test(shown.chip.textContent),
      shown.chip && shown.chip.textContent);
    const acted = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, clickDoIt: true, rescan: true,
      store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] } },
      driveFind: { match: 'one', file: file }
    });
    const holdPayload = (acted.sent.find((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar') || {}).payload;
    const params = holdPayload && holdPayload.params;
    check('Do It posts the calendar event with the file link and the clock',
      params && params.fileUrl === file.url && params.fileName === file.name && params.dateIso === '2026-10-08' && params.hour === 10 && params.minute === 0 && params.fileTerm === 'glance-pricing-q4.pdf',
      params);
    const actedWhy = (acted.store.outlookPageDiag || []).map((d) => d.reason);
    check('the on-page receipt still says Handled after the next scan',
      Boolean(acted.chip) && acted.chip.classList.contains('flow-chip-settled') && /Handled\./.test(acted.chip.textContent) && /Open event/.test(acted.chip.textContent) && /Undo/.test(acted.chip.textContent) && actedWhy.indexOf('page:already-handled') < 0 && !acted.sent.some((m) => m.payload && m.payload.connectorId === 'outlookDraft'),
      { text: acted.chip && acted.chip.textContent, why: actedWhy });
    const holdId = shown.chip && shown.chip.getAttribute('data-glance-message');
    const reloaded = await runPage({
      htmlPatch: gateHtml, waitMs: 4000,
      store: {
        outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] },
        log: [{
          ts: Date.now(), kind: 'written', messageId: holdId, app: 'outlook', connectorId: 'outlookCalendar',
          ref: { eventId: 'ev-hold-1' }, where: 'Outlook Calendar',
          url: 'https://outlook.live.com/calendar/item/ev-hold-1',
          label: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00'
        }]
      },
      driveFind: { match: 'one', file: file }
    });
    check('opening the thread again shows Handled on the page, from the written row',
      Boolean(holdId) && Boolean(reloaded.chip) && reloaded.chip.classList.contains('flow-chip-settled') && /Handled\./.test(reloaded.chip.textContent) && /Open event/.test(reloaded.chip.textContent) && /Undo/.test(reloaded.chip.textContent) && !/Hold it/.test(reloaded.chip.textContent),
      { id: holdId, text: reloaded.chip && reloaded.chip.textContent, why: (reloaded.store.outlookPageDiag || []).map((d) => d.reason) });
    const shadowed = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, clickDoIt: true, shadowShown: true, rescan: true,
      store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] } },
      driveFind: { match: 'one', file: file }
    });
    check('a newer shown row does not put Hold back over Handled',
      Boolean(shadowed.chip) && shadowed.chip.classList.contains('flow-chip-settled') && /Handled\./.test(shadowed.chip.textContent) && /Undo/.test(shadowed.chip.textContent) && !/Hold it/.test(shadowed.chip.textContent) && !/Do It/.test(shadowed.chip.textContent),
      shadowed.chip && shadowed.chip.textContent);
    const auth = { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] };
    const shownOnTop = await runPage({
      htmlPatch: gateHtml, waitMs: 4000,
      store: {
        outlookAuth: auth,
        log: [
          { ts: Date.now(), kind: 'shown', messageId: holdId, app: 'outlook', label: 'Hold the file' },
          {
            ts: Date.now() - 1000, kind: 'written', messageId: holdId, app: 'outlook', connectorId: 'outlookCalendar',
            ref: { eventId: 'ev-hold-1' }, where: 'Outlook Calendar',
            url: 'https://outlook.live.com/calendar/item/ev-hold-1',
            label: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00',
            calendarHoldKey: 'glance-pricing-q4.pdf|2026-10-08|10|0'
          }
        ]
      },
      driveFind: { match: 'one', file: file }
    });
    check('reopen with shown newest still mounts Handled, not Hold',
      Boolean(shownOnTop.chip) && shownOnTop.chip.classList.contains('flow-chip-settled') && /Handled\./.test(shownOnTop.chip.textContent) && /Open event/.test(shownOnTop.chip.textContent) && /Undo/.test(shownOnTop.chip.textContent) && !/Hold it/.test(shownOnTop.chip.textContent),
      shownOnTop.chip && shownOnTop.chip.textContent);
    // Live Exchange ids differ by alphabet and padding (REST _/- versus EWS / and +, ol: prefix, trailing =).
    // The page address uses one spelling. The written row keeps the spelling Do It stored.
    // That stored string is the key Undo used on the leftover 0.9.25 receipt. Reload must
    // mount Handled from it, and Undo must convert that same row, even when a newer shown
    // line carries the page spelling.
    const pageSpell = 'AQQkADAwAT_M0MDAA_MS0wZTAwAC04MzYzLTAwAi0wMAoAEABHUtuqMLBp';
    const storedSpell = 'ol:AQQkADAwAT_M0MDAA/MS0wZTAwAC04MzYzLTAwAi0wMAoAEABHUtuqMLBp=';
    const canonSpell = (id) => String(id || '').replace(/^ol:/, '').replace(/[+\-]/g, '-').replace(/[/_]/g, '_').replace(/=+$/, '');
    const spellLog = [
      { ts: Date.now(), kind: 'shown', messageId: pageSpell, app: 'outlook', label: 'Hold the file' },
      {
        ts: Date.now() - 1000, kind: 'written', messageId: storedSpell, app: 'outlook', connectorId: 'outlookCalendar',
        ref: { eventId: 'ev-spell-1' }, where: 'Outlook Calendar',
        url: 'https://outlook.live.com/calendar/item/ev-spell-1',
        label: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00'
      }
    ];
    const spelled = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, urlId: pageSpell,
      store: { outlookAuth: auth, log: spellLog },
      driveFind: { match: 'one', file: file }
    });
    check('reload mounts Handled from the stored message id when the page spelling differs',
      storedSpell !== pageSpell && canonSpell(storedSpell) === canonSpell(pageSpell) &&
      Boolean(spelled.chip) && spelled.chip.classList.contains('flow-chip-settled') &&
      spelled.chip.getAttribute('data-glance-message') === storedSpell &&
      /Handled\./.test(spelled.chip.textContent) && /Open event/.test(spelled.chip.textContent) && /Undo/.test(spelled.chip.textContent) &&
      !/Hold it/.test(spelled.chip.textContent),
      { page: pageSpell, stored: spelled.chip && spelled.chip.getAttribute('data-glance-message'), text: spelled.chip && spelled.chip.textContent });
    const spelledUndo = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, urlId: pageSpell, clickUndo: true,
      store: { outlookAuth: auth, log: spellLog.map((row) => Object.assign({}, row)) },
      driveFind: { match: 'one', file: file }
    });
    const storedAfter = (spelledUndo.store.log || []).filter((e) => e && e.connectorId === 'outlookCalendar' && e.messageId === storedSpell);
    check('Undo on that reloaded receipt converts the stored row, the same key the leftover Handled used',
      spelledUndo.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookCalendar' && m.ref && m.ref.eventId === 'ev-spell-1') &&
      storedAfter.length === 1 && storedAfter[0].kind === 'undone' && storedAfter[0].outlookReopen === true &&
      !(spelledUndo.store.log || []).some((e) => e && e.kind === 'written' && e.connectorId === 'outlookCalendar' && e.messageId === storedSpell),
      storedAfter.map((e) => ({ kind: e.kind, messageId: e.messageId })));
    const undone = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, clickDoIt: true, rescan: true, clickUndo: true,
      store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] } },
      driveFind: { match: 'one', file: file }
    });
    check('Undo on the on-page receipt deletes that calendar event', undone.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookCalendar' && m.ref && m.ref.eventId === 'ev-hold-1'), undone.sent.filter((m) => m.type === 'flow:undo-action'));
    const undoneReload = await runPage({
      htmlPatch: gateHtml, waitMs: 4000, clickUndo: true,
      store: {
        outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [ME] },
        log: [{
          ts: Date.now(), kind: 'written', messageId: holdId, app: 'outlook', connectorId: 'outlookCalendar',
          ref: { eventId: 'ev-from-log' }, where: 'Outlook Calendar',
          url: 'https://outlook.live.com/calendar/item/ev-from-log',
          label: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00'
        }]
      },
      driveFind: { match: 'one', file: file }
    });
    check('Undo on a reopened thread deletes the event from that receipt', undoneReload.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookCalendar' && m.ref && m.ref.eventId === 'ev-from-log'), undoneReload.sent.filter((m) => m.type === 'flow:undo-action'));
  }

  console.log('\n--- Gate 0.9.36: a conversation id is not the attachment message ---\n');
  {
    const GATE_CONV = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX/C+aXV';
    const SAVE = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
    const DONT = "Hi, Please don't save the attachment to OneDrive. Thanks";
    const file = { id: 'att1', name: 'Gate-0935-signed-NDA.pdf', isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
    const gateHtml = (text) => (h) => h
      .replace('title="Pilot proposal">Pilot proposal', 'title="Gate 0.9.35 OneDrive save">Gate 0.9.35 OneDrive save')
      .replace(/<div>Hi Sali,<\/div>[\s\S]*?<div>Flow team<\/div>/, '<div>' + text + '</div>');
    const gate = {
      htmlPatch: gateHtml(SAVE), urlId: GATE_CONV, listedConversationId: GATE_CONV,
      listedSubject: 'Gate 0.9.35 OneDrive save', messageId: 'M1', mailBody: SAVE,
      gateAttachments: true, attachmentFiles: [file], hasAttachments: true, waitMs: 4500
    };
    const shown = await runPage(gate);
    const shownLog = (shown.store.log || []).find((e) => e && e.kind === 'shown');
    const kinds = shownLog && shownLog.process && shownLog.process.steps && shownLog.process.steps.map((s) => s.kind);
    const fetches = shown.sent.filter((m) => m.type === 'flow:outlook-fetch').map((m) => String(m.url));
    const att = fetches.filter((u) => /\/attachments/.test(u));
    check('the open page resolves M1 and shows OneDrive plus the Outlook draft',
      Boolean(shown.chip) && /OneDrive/.test(shown.chip.textContent) && /Do It/.test(shown.chip.textContent) &&
      kinds && kinds[0] === 'onedriveFile' && kinds[1] === 'outlookDraft' &&
      att.some((u) => /\/messages\/M1\/attachments/.test(u)) &&
      !att.some((u) => /AQQk/.test(decodeURIComponent(u))),
      { text: shown.chip && shown.chip.textContent, kinds: kinds, att: att, why: (shown.store.outlookPageDiag || []).map((d) => d.reason), parsed: shown.parsed && { itemId: shown.parsed.itemId, pathId: shown.parsed.pathId, subject: shown.parsed.subject, text: shown.parsed.text } });
    const refused = await runPage(Object.assign({}, gate, { htmlPatch: gateHtml(DONT), mailBody: DONT, waitMs: 3500 }));
    const refusedWhy = (refused.store.outlookPageDiag || []).map((d) => d.reason);
    check('don\'t save stays quiet when the resolved message has one file',
      !refused.chip && refusedWhy.some((r) => r === 'quiet:google' || r === 'page:quiet:google'),
      { text: refused.chip && refused.chip.textContent, why: refusedWhy });
    const unread = await runPage(Object.assign({}, gate, { attachmentReads: 'fail', attachmentsUnread: true, waitMs: 3500 }));
    const unreadWhy = (unread.store.outlookPageDiag || []).map((d) => d.reason);
    check('an unreadable attachment count is logged and is not a silent zero',
      !unread.chip && (unreadWhy.indexOf('page:attachment-count-unread') >= 0 || unreadWhy.indexOf('outlook:attachments-unread') >= 0) &&
      !unreadWhy.some((r) => r === 'quiet:google' || r === 'page:quiet:google'),
      { text: unread.chip && unread.chip.textContent, why: unreadWhy });
    function fileIncoming(store) {
      return ((store.outlookPending && store.outlookPending.incoming) || []).filter((e) => {
        return ((e && e.process && e.process.steps) || []).some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile'));
      });
    }
    const twoFiles = [file, Object.assign({}, file, { id: 'att2', name: 'other.pdf' })];
    const two = await runPage(Object.assign({}, gate, { attachmentFiles: twoFiles, waitMs: 3500 }));
    check('two files on the resolved message stay off the card and off Loops',
      !two.chip && fileIncoming(two.store).length === 0,
      { text: two.chip && two.chip.textContent, incoming: fileIncoming(two.store).length, why: (two.store.outlookPageDiag || []).map((d) => d.reason) });
    const twoFail = await runPage(Object.assign({}, gate, { attachmentFiles: twoFiles, attachmentReads: 'fail', waitMs: 3500 }));
    check('two files with an unreadable list stay off the card and off Loops',
      !twoFail.chip && fileIncoming(twoFail.store).length === 0,
      { text: twoFail.chip && twoFail.chip.textContent, incoming: fileIncoming(twoFail.store).length, why: (twoFail.store.outlookPageDiag || []).map((d) => d.reason) });
    const itemOnly = await runPage(Object.assign({}, gate, {
      attachmentFiles: [{ id: 'mail1', name: 'Forwarded', isInline: false, '@odata.type': '#microsoft.graph.itemAttachment' }],
      waitMs: 3500
    }));
    check('an attached message is not a file, so the card stays off',
      !itemOnly.chip && fileIncoming(itemOnly.store).length === 0,
      { text: itemOnly.chip && itemOnly.chip.textContent, incoming: fileIncoming(itemOnly.store).length, why: (itemOnly.store.outlookPageDiag || []).map((d) => d.reason) });
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
