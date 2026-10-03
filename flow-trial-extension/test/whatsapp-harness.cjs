// WhatsApp Web through the REAL content scripts, in a page that imitates WhatsApp Web's structure: #main, a header title, rows with
// data-id ("true_<number>@c.us_<hash>"), and selectable-text spans. This proves the wiring (script order, the one-to-one rule, the
// card, the stored loop, cross-app closing). It does NOT prove WhatsApp's live markup: only a real WhatsApp Web can, which is why
// the surface is opt-in, labelled experimental, and goes quiet (and says so) when it cannot read the page.
// Needs Playwright with a Chromium (PW_CHROMIUM). Without it the file reports SKIPPED and exits 0.
// Run: node test/whatsapp-harness.cjs
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); } catch (e2) { console.log('SKIPPED: playwright not available'); process.exit(0); }
}
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
if (!fs.existsSync(EXE)) { console.log('SKIPPED: no chromium at ' + EXE); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const GMAIL_ONLY = ['src/content-gmail.js', 'src/sidebar.js', 'src/brief.js', 'src/weekly.js'];
// Exactly what src/background.js registers for this app: the Gmail list minus the Gmail-only pieces, plus the two WhatsApp files.
const SCRIPTS = manifest.content_scripts[0].js.filter((f) => GMAIL_ONLY.indexOf(f) < 0).concat(['src/whatsapp-parse.js', 'src/content-whatsapp.js']);
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'glance-wa-'));
const { FlowIdentity } = require('../core/identity-graph.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ME = (id, text) => ({ id: 'true_972541234567@c.us_' + id, text });
const THEM = (id, text) => ({ id: 'false_972541234567@c.us_' + id, text });
function html(title, rows, opts) {
  opts = opts || {};
  const items = rows.map((r) => `<div role="row"><div data-id="${r.id}" class="${r.id.startsWith('true_') ? 'message-out' : 'message-in'}"><div class="copyable-text"><span class="selectable-text copyable-text"><span>${r.text}</span></span></div></div></div>`).join('\n');
  return `<!doctype html><html><body><div id="app"><div id="main"><header><span dir="auto" title="${title}">${title}</span></header>${opts.noRows ? '<div class="unknown-layout">hello</div>' : items}</div></div></body></html>`;
}

function stub() {
  // Pin "now" to Thursday 1 Oct 2026, noon, so every date below is stable.
  const RealDate = Date;
  const fixed = new RealDate(2026, 9, 1, 12).getTime();
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  window.Date = FixedDate;
  const store = { onboarded: true, connectorId: 'googleTasks' };
  window.__msgs = [];
  const reply = (m) => {
    window.__msgs.push(m);
    if (m.type === 'flow:pro-status') return { ok: true, active: !!window.__pro, record: window.__pro ? { key: 'k', valid: true, activeUntil: Date.now() + 1e9 } : null };
    if (m.type === 'flow:follow-task') return { ok: true, ref: { taskListId: 'L', taskId: 'T1' } };
    if (m.type === 'flow:connector-status') return { googleTasks: { connected: true, configured: true } };
    if (m.type === 'flow:surface-health') { window.__health = m; return { ok: true }; }
    if (m.type === 'flow:search-drive') return { ok: true, files: window.__driveFiles || [] };
    return { ok: true };
  };
  window.chrome = {
    runtime: { lastError: null, getURL: (s) => s, sendMessage: (m, cb) => { const r = reply(m); if (cb) setTimeout(() => cb(r), 0); }, onMessage: { addListener() {} } },
    storage: { local: {
      get: (k, cb) => { let r; if (k == null) r = { ...store }; else if (typeof k === 'string') r = { [k]: store[k] }; else if (Array.isArray(k)) r = Object.fromEntries(k.map((x) => [x, store[x]])); else r = { ...k, ...store }; if (cb) cb(r); return Promise.resolve(r); },
      set: (o, cb) => { Object.assign(store, o); if (cb) cb(); return Promise.resolve(); },
      remove: (k, cb) => { if (cb) cb(); return Promise.resolve(); }
    }, onChanged: { addListener() {} } },
    identity: {}, alarms: {}, tabs: {}
  };
  window.__store = store;
  // A Gmail attachment's bytes (the content script fetches them with the page's cookies).
  window.fetch = async () => ({ ok: true, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });
}

async function open(browser, name, title, rows, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(stub);
  const file = path.join(TMP, name + '.html');
  fs.writeFileSync(file, html(title, rows, opts));
  await p.goto('file://' + file);
  if (opts.watches) await p.evaluate((w) => { window.__store.followWatches = w; }, opts.watches);
  if (opts.store) await p.evaluate((st) => { Object.assign(window.__store, st); }, opts.store);
  for (const src of SCRIPTS) await p.addScriptTag({ path: path.join(ROOT, src) });
  await p.waitForTimeout(2200);   // the adapter waits 1.2 s after the page settles
  const state = async () => ({
    errs,
    card: await p.evaluate(() => { const h = document.getElementById('flow-follow-host'); return h ? h.innerText.replace(/\n+/g, ' | ') : null; }),
    types: await p.evaluate(() => window.__msgs.map((m) => m.type)),
    watches: await p.evaluate(() => window.__store.followWatches || []),
    health: await p.evaluate(() => window.__health || null)
  });
  return { p, ctx, state };
}

const ASKW = 'Could you please send me the signed lease by Friday? I need it to release the deposit.';
const baseWatch = { id: 'g1', threadId: 'g1', channel: 'gmail', messageId: 'gm1', subject: 'Lease INV-204', counterpart: { email: 'dana@acme.com', name: 'Dana Cole', phone: null }, kind: 'reply', what: 'Please send the signed lease INV-204 by Friday', amount: null, deadlineIso: '2026-10-02', chaseIso: '2026-10-05', lang: 'en', createdAt: new Date(2026, 9, 1, 12).getTime() - 3 * 24 * 3600 * 1000, status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0 };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  // 1. my message in a one-to-one chat asks for something -> the same card; clicking stores a loop that knows it is WhatsApp
  let t = await open(browser, 'offer', 'Dana Cole', [THEM('A1', 'Hi, on it.'), ME('A2', ASKW)]);
  let s = await t.state();
  check('an ask in my last WhatsApp message shows the card', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s);
  check('nothing is written until I click', !s.types.includes('flow:follow-task') && s.watches.length === 0, s.types);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(500);
  s = await t.state();
  const w = s.watches[0];
  check('the loop is stored as a WhatsApp loop with the number, never an email', w && w.status === 'waiting' && w.channel === 'whatsapp' && w.counterpart.phone === '972541234567' && !w.counterpart.email && w.threadId === 'wa:972541234567@c.us', w);
  check('it is keyed to the person across apps', w && w.personKey === 'phone:972541234567', w && w.personKey);
  check('the reminder goes to Google Tasks, and nothing is ever typed, sent or drafted in the chat', s.types.includes('flow:follow-task') && !s.types.some((x) => /draft|send|execute/.test(x)), s.types);
  const g = await t.p.evaluate(() => window.__store.identityGraph);
  check('the person was remembered by number and name, with no message text', g && Object.values(g.people).some((p) => p.phones.includes('972541234567') && p.names.includes('Dana Cole')) && !/lease|deposit|Friday/i.test(JSON.stringify(g)), g);
  check('the page told the extension it can read this layout', s.health && s.health.ok === true, s.health);
  check('no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  // 2. a group chat is left alone, completely
  const GROUP_ROW = (id, text) => ({ id: id, text });
  t = await open(browser, 'group', 'Family', [GROUP_ROW('false_120363041234567890@g.us_AA1_972501112222@c.us', 'Could you please send me the signed lease by Friday?'), GROUP_ROW('true_120363041234567890@g.us_AA2_972541234567@c.us', ASKW)]);
  s = await t.state();
  check('a group chat shows nothing, stores nothing and reads nothing', s.card === null && s.watches.length === 0 && !s.types.includes('flow:follow-task'), s);
  check('and it is not reported as a broken layout (leaving groups alone is on purpose)', !s.health || s.health.ok === true, s.health);
  await t.ctx.close();

  // 3. they answer in the chat -> the same rules settle it
  t = await open(browser, 'settle', 'Dana Cole', [ME('B1', ASKW), THEM('B2', 'Confirmed, the figure is 4,200. Booking now.')],
    { watches: [Object.assign({}, baseWatch, { id: 'wa:972541234567@c.us', threadId: 'wa:972541234567@c.us', channel: 'whatsapp', messageId: 'true_972541234567@c.us_B1', counterpart: { email: null, name: 'Dana Cole', phone: '972541234567' }, personKey: 'phone:972541234567' })] });
  s = await t.state();
  check('their answer in the same chat closes the loop', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'replied', s.watches[0]);
  check('with a one-line receipt', /Dana replied after 3 days\. Loop closed\./.test(s.card || ''), s.card);
  await t.ctx.close();
  t = await open(browser, 'ack', 'Dana Cole', [ME('C1', ASKW), THEM('C2', 'got it, thanks!')],
    { watches: [Object.assign({}, baseWatch, { id: 'wa:972541234567@c.us', threadId: 'wa:972541234567@c.us', channel: 'whatsapp', messageId: 'true_972541234567@c.us_C1', counterpart: { email: null, name: 'Dana Cole', phone: '972541234567' } })] });
  s = await t.state();
  check('"got it, thanks!" leaves it open and says nothing', s.watches[0].status === 'waiting' && s.card === null, s);
  await t.ctx.close();

  // 4. strict: a chat sentence only the learned model would propose never creates an offer
  t = await open(browser, 'strict', 'Dana Cole', [THEM('D1', 'Hi'), ME('D2', 'I was thinking we could maybe try a different approach.')]);
  s = await t.state();
  check('wording only the learned model would act on is ignored on a new surface', s.card === null && s.watches.length === 0, s);
  const aq = await t.p.evaluate(() => window.__store.activeQuestion);
  check('and no question is queued from a chat either', !aq || !aq.pending, aq);
  await t.ctx.close();

  // 5. an answer on WhatsApp settles a loop opened by email, when it is the same person and names the same reference
  let graph = FlowIdentity.empty();
  graph = FlowIdentity.observe(graph, { channel: 'gmail', name: 'Dana Cole', email: 'dana@acme.com' }, 1).graph;
  graph = FlowIdentity.observe(graph, { channel: 'web', email: 'dana@acme.com', phone: '0541234567' }, 2).graph;     // a contact card joined them
  t = await open(browser, 'cross', 'Dana Cole', [ME('E1', 'Hi Dana, did you see my email?'), THEM('E2', 'Sent you the signed lease INV-204 an hour ago, confirmed.')], { watches: [baseWatch], store: { identityGraph: graph } });
  s = await t.state();
  const gw = s.watches.find((x) => x.id === 'g1');
  check('a WhatsApp answer naming the same reference closes the EMAIL loop', gw && gw.status === 'resolved' && gw.viaChannel === 'whatsapp', gw);
  check('and the receipt says where the answer came from', /Dana replied on WhatsApp after 3 days\. Loop closed\./.test(s.card || ''), s.card);
  check('with Reopen, as every close has', /Reopen/.test(s.card || ''), s.card);
  await t.ctx.close();
  t = await open(browser, 'cross-ask', 'Dana Cole', [ME('F1', 'Hi Dana, did you see my email?'), THEM('F2', "Sorry for the delay, I'll get back to you by Friday afternoon, promise.")], { watches: [baseWatch], store: { identityGraph: graph } });
  s = await t.state();
  check('an answer with no link to the loop only asks, and the loop stays open', /Does this settle/.test(s.card || '') && s.watches.find((x) => x.id === 'g1').status === 'waiting', { card: s.card });
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(300);
  s = await t.state();
  check('"Not yet" leaves the loop untouched', s.watches.find((x) => x.id === 'g1').status === 'waiting' && s.card === null, s);
  await t.ctx.close();
  t = await open(browser, 'cross-other', 'Dana Cole', [ME('G1', 'Hi'), THEM('G2', 'Sent you the signed lease INV-204 an hour ago, confirmed.')], { watches: [baseWatch] });
  s = await t.state();
  check('with no proof that this number is that email, nothing is closed (a name alone is never enough)', s.watches.find((x) => x.id === 'g1').status === 'waiting' && s.card === null, s);
  const sug = await t.p.evaluate(() => window.__store.identityGraph && window.__store.identityGraph.pending);
  check('it is kept as a question instead ("same person?"), asked in the popup', Array.isArray(sug), sug);
  await t.ctx.close();

  // 6. a page Glance cannot make sense of: silent, and says so once
  t = await open(browser, 'broken', 'Dana Cole', [], { noRows: true });
  s = await t.state();
  check('an unrecognised layout is silent and reported as such', s.card === null && s.watches.length === 0 && s.health && s.health.ok === false && /no-messages-recognised/.test(s.health.reason || ''), s.health);
  await t.ctx.close();

  await browser.close();
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
