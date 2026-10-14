// Slack and Telegram Web through the REAL content scripts, in a page that imitates WhatsApp Web's structure: #main, a header title, rows with
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
const BASE = manifest.content_scripts[0].js.filter((f) => GMAIL_ONLY.indexOf(f) < 0);
const SCRIPTS = { slack: BASE.concat(['src/slack-parse.js', 'src/content-slack.js']), telegram: BASE.concat(['src/telegram-parse.js', 'src/content-telegram.js']) };
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'glance-chat-'));
const { FlowIdentity } = require('../core/identity-graph.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
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


const ASKW = 'Could you please send me the signed lease by Friday? I need it to release the deposit.';

// Slack: message_container rows with data-msg-ts, the sender shown once, a header title, and the address that says which conversation.
const SLACK_ME = 'Sali Sapan';
function slackHtml(title, rows, opts) {
  opts = opts || {};
  const items = rows.map((r, i) => `<div data-qa="virtual-list-item"><div data-qa="message_container" data-msg-ts="${r.ts}">${r.showSender === false ? '' : `<button data-qa="message_sender_name">${r.sender}</button>`}<div data-qa="message-text"><div class="p-rich_text_section">${r.text}</div></div></div></div>`).join('');
  return `<!doctype html><html><body><div data-qa="channel_name">${title}</div><div data-qa="message_pane">${opts.noRows ? '<div class="unknown">hello</div>' : items}</div></body></html>`;
}
const S = (ts, sender, text, showSender) => ({ ts: '17908000' + ts + '.000100', sender, text, showSender });

// Telegram: .Message[id=message-N], class "own" for mine, .text-content, a header title, and the address #<peer>.
function tgHtml(title, rows, opts) {
  opts = opts || {};
  const items = rows.map((r) => `<div class="Message${r.own ? ' own' : ''}" id="message-${r.id}"><div class="text-content">${r.text}</div></div>`).join('');
  return `<!doctype html><html><body><div class="MiddleHeader"><div class="ChatInfo"><div class="title">${title}</div></div></div><div id="MessageList">${opts.noRows ? '<div class="unknown">hello</div>' : items}</div></body></html>`;
}

async function open(browser, kind, url, pageHtml, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(stub);
  const origin = new URL(url).origin;
  await p.route(origin + '/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageHtml }));
  await p.goto(url);
  if (opts.watches) await p.evaluate((w) => { window.__store.followWatches = w; }, opts.watches);
  for (const src of SCRIPTS[kind]) await p.addScriptTag({ path: path.join(ROOT, src) });
  await p.waitForTimeout(2200);
  const state = async () => ({
    errs,
    card: await p.evaluate(() => { const h = document.getElementById('flow-follow-host'); return h ? h.innerText.replace(/\n+/g, ' | ') : null; }),
    types: await p.evaluate(() => window.__msgs.map((m) => m.type)),
    watches: await p.evaluate(() => window.__store.followWatches || []),
    health: await p.evaluate(() => window.__health || null)
  });
  return { p, ctx, state };
}

const baseWatch = (channel, threadId, id, name) => ({ id: threadId, threadId, channel, messageId: id, subject: name, counterpart: { email: null, name, phone: null }, kind: 'reply', what: 'Please send the signed lease INV-204 by Friday', amount: null, deadlineIso: '2026-10-02', chaseIso: '2026-10-05', lang: 'en', createdAt: new Date(2026, 8, 28, 12).getTime(), sentAt: new Date(2026, 8, 28, 12).getTime(), status: 'waiting', nudges: 0 });

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const SLACK_DM = 'https://app.slack.com/client/T01ABC/D02XYZ';

  // ---- Slack ----
  let t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', 'Dana Cole', 'Hi, on it.'), S('02', SLACK_ME, ASKW)]), {});
  let s = await t.state();
  check('Slack: an ask in my last direct message shows the card', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s);
  check('Slack: nothing is written until I click', !s.types.includes('flow:follow-task') && s.watches.length === 0, s.types);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(500);
  s = await t.state();
  const w = s.watches[0];
  check('Slack: the loop is stored as a Slack loop for that person and conversation, never an email', w && w.status === 'waiting' && w.channel === 'slack' && !w.counterpart.email && w.threadId === 'slack:T01ABC:D02XYZ' && w.counterpart.name === 'Dana Cole', w);
  check('Slack: nothing is ever typed, sent or drafted in the app', s.types.includes('flow:follow-task') && !s.types.some((x) => /draft|send|execute/.test(x)), s.types);
  check('Slack: the page told the extension it can read this layout', s.health && s.health.ok === true && s.health.id === 'slack', s.health);
  check('Slack: no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', SLACK_ME, 'Hi Dana, quick one.', true), S('02', SLACK_ME, ASKW, false)]), {});
  s = await t.state();
  check('Slack: my second message in a row (shown without my name) still reads as mine and offers', /Stay on it/.test(s.card || ''), s);
  await t.ctx.close();

  for (const [name, url] of [['a channel', 'https://app.slack.com/client/T01ABC/C09CHAN'], ['a group message', 'https://app.slack.com/client/T01ABC/G09GRP'], ['a thread', SLACK_DM + '/thread/D02XYZ-1790800001.000100']]) {
    t = await open(browser, 'slack', url, slackHtml('team', [S('01', 'Dana Cole', 'Hi'), S('02', SLACK_ME, ASKW)]), {});
    s = await t.state();
    check('Slack: ' + name + ' shows nothing, stores nothing, and is not reported as broken', s.card === null && s.watches.length === 0 && !s.types.includes('flow:follow-task') && (!s.health || s.health.ok === true), s);
    await t.ctx.close();
  }

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', SLACK_ME, ASKW), S('02', 'Dana Cole', 'Confirmed, the figure is 4,200. Booking now.')]),
    { watches: [baseWatch('slack', 'slack:T01ABC:D02XYZ', '17908000' + '01.000100', 'Dana Cole')] });
  s = await t.state();
  check('Slack: their answer in the same conversation closes the loop with a receipt', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'replied' && /Dana replied/.test(s.card || ''), { w: s.watches[0], card: s.card });
  await t.ctx.close();

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', SLACK_ME, ASKW), S('02', 'Dana Cole', 'got it, thanks!')]),
    { watches: [baseWatch('slack', 'slack:T01ABC:D02XYZ', '17908000' + '01.000100', 'Dana Cole')] });
  s = await t.state();
  check('Slack: "got it, thanks!" leaves it open and says nothing', s.watches[0].status === 'waiting' && s.card === null, s);
  await t.ctx.close();

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', 'Dana Cole', 'Hi'), S('02', SLACK_ME, 'I was thinking we could maybe try a different approach.')]), {});
  s = await t.state();
  check('Slack: wording only the learned model would act on is ignored (strict, like WhatsApp)', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [], { noRows: true }), { noRows: true });
  s = await t.state();
  check('Slack: an unrecognised layout is silent and reported as such', s.card === null && s.watches.length === 0 && s.health && s.health.ok === false && /no-messages-recognised/.test(s.health.reason || ''), s.health);
  await t.ctx.close();

  // ---- Telegram ----
  const TG_DM = 'https://web.telegram.org/a/#777000123';
  t = await open(browser, 'telegram', TG_DM, tgHtml('Dana Cole', [{ id: 101, text: 'Hi, on it.' }, { id: 102, own: true, text: ASKW }]), {});
  s = await t.state();
  check('Telegram: an ask in my last message shows the card', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s);
  check('Telegram: nothing is written until I click', !s.types.includes('flow:follow-task') && s.watches.length === 0, s.types);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(500);
  s = await t.state();
  const tw = s.watches[0];
  check('Telegram: the loop is stored as a Telegram loop for that person, never an email', tw && tw.status === 'waiting' && tw.channel === 'telegram' && !tw.counterpart.email && tw.threadId === 'tg:777000123' && tw.counterpart.name === 'Dana Cole', tw);
  check('Telegram: nothing is ever typed, sent or drafted in the app', s.types.includes('flow:follow-task') && !s.types.some((x) => /draft|send|execute/.test(x)), s.types);
  check('Telegram: the page told the extension it can read this layout', s.health && s.health.ok === true && s.health.id === 'telegram', s.health);
  check('Telegram: no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/a/#-1001234567890', tgHtml('Family', [{ id: 1, text: 'Hi' }, { id: 2, own: true, text: ASKW }]), {});
  s = await t.state();
  check('Telegram: a group or a channel shows nothing, stores nothing, and is not reported as broken', s.card === null && s.watches.length === 0 && (!s.health || s.health.ok === true), s);
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/a/#@some_bot', tgHtml('Some bot', [{ id: 1, text: 'Hi' }, { id: 2, own: true, text: ASKW }]), {});
  s = await t.state();
  check('Telegram: an @username (could be a bot or a channel) is left alone', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();

  t = await open(browser, 'telegram', TG_DM, tgHtml('Dana Cole', [{ id: 201, own: true, text: ASKW }, { id: 202, text: 'Confirmed, the figure is 4,200. Booking now.' }]),
    { watches: [baseWatch('telegram', 'tg:777000123', '201', 'Dana Cole')] });
  s = await t.state();
  check('Telegram: their answer closes the loop with a receipt', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'replied' && /Dana replied/.test(s.card || ''), { w: s.watches[0], card: s.card });
  await t.ctx.close();

  t = await open(browser, 'telegram', TG_DM, tgHtml('Dana Cole', [], { noRows: true }), { noRows: true });
  s = await t.state();
  check('Telegram: an unrecognised layout is silent and reported as such', s.card === null && s.watches.length === 0 && s.health && s.health.ok === false && /no-messages-recognised/.test(s.health.reason || ''), s.health);
  await t.ctx.close();

  await browser.close();
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
