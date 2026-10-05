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
  const graphMsg = { id: MSG, conversationId: CONV, subject: 'Pilot proposal', isDraft: false, hasAttachments: false, internetMessageId: '<pilot@mail.gmail.com>',
    from: { emailAddress: { name: 'flow', address: 'ai.local.flow@gmail.com' } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: new Date(Date.now() - 5 * 60e3).toISOString(), webLink: 'https://outlook.live.com/owa/?ItemID=x', body: { contentType: 'text', content: BODY } };
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') {
      const u = String(msg.url);
      if (o.graphDown) return { ok: false, status: 0, error: 'network' };
      if (/\/me\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ mail: ME, displayName: 'Glance' }) };
      if (/mailFolders\/inbox\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: o.emptyInbox ? [] : [graphMsg] }) };
      if (/mailFolders\/sentitems\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
      if (/\/me\/messages\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: o.emptyInbox ? [] : [graphMsg] }) };
      return { ok: false, status: 404, body: '{}' };
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
  clearInterval(ad);
  let parsed = null;
  try { parsed = vm.runInContext('FlowOwaParse.readPane(document, location.href, { own: [' + JSON.stringify(ME) + '] })', ctx); } catch (e) { parsed = { error: e.message }; }
  const res = { files, throws, logs, logsAtCard, parsed, store, sent, chip: w.document.querySelector('.flow-chip-host'), doc: w.document };
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

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
