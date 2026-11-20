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
let EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
if (!fs.existsSync(EXE)) {
  try {
    const pw = require('playwright');
    const alt = pw.chromium.executablePath();
    if (alt && fs.existsSync(alt)) EXE = alt;
  } catch (e) { /* playwright's browser is not installed */ }
}
if (!fs.existsSync(EXE)) {
  try {
    const pw = require('@playwright/test');
    const alt = pw.chromium.executablePath();
    if (alt && fs.existsSync(alt)) EXE = alt;
  } catch (e2) { /* the test package is not installed */ }
}
if (!fs.existsSync(EXE)) { console.log('SKIPPED: no chromium at ' + EXE); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const GMAIL_ONLY = ['src/content-gmail.js', 'src/sidebar.js', 'src/brief.js', 'src/weekly.js'];
// Exactly what src/background.js registers for this app: the Gmail list minus the Gmail-only pieces, plus the two WhatsApp files.
const BASE = manifest.content_scripts[0].js.filter((f) => GMAIL_ONLY.indexOf(f) < 0);
const LANE = ['src/chat-compose.js', 'src/chat-host-prompt.js', 'src/chat-self-card.js'];
const SCRIPTS = {
  slack: BASE.concat(LANE).concat(['src/slack-parse.js', 'src/content-slack.js']),
  telegram: BASE.concat(LANE).concat(['src/telegram-parse.js', 'src/content-telegram.js'])
};
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
  await p.route(origin + '/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml }));
  await p.goto(url);
  if (opts.prepare) await opts.prepare(p);
  if (opts.watches) await p.evaluate((w) => { window.__store.followWatches = w; }, opts.watches);
  for (const src of SCRIPTS[kind]) await p.addScriptTag({ path: path.join(ROOT, src) });
  await p.waitForTimeout(opts.wait == null ? 2200 : opts.wait);
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

  const slackSelf = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/slack-web-self.html'), 'utf8');
  const slackFyi = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/slack-web-fyi.html'), 'utf8');
  const tgA = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/telegram-a-self.html'), 'utf8');
  const tgK = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/telegram-k-self.html'), 'utf8');
  t = await open(browser, 'slack', 'https://app.slack.com/client/T01ABC/D02SELF', slackSelf, {});
  s = await t.state();
  const slackDraft = await t.p.locator('[data-glance-do-it]').count();
  check('Slack web fixture: a self-chat ask shows Do It', slackDraft === 1, s);
  check('Slack web fixture: a self-chat ask has no follow-up card', (await t.p.locator('.flow-fu').count()) === 0);
  await t.p.locator('[data-glance-do-it]').click();
  const slackBox = await t.p.locator('.ql-editor').innerText();
  const slackSends = await t.p.evaluate(() => window.__glanceSendClicks || 0);
  check('Slack web fixture: Do It drafts and does not press Send', slackBox.indexOf('Send the invoice by Friday.') >= 0 && slackSends === 0, { slackBox, slackSends });
  await t.p.locator('[data-glance-undo]').click();
  const slackCleared = (await t.p.locator('.ql-editor').innerText()).trim();
  check('Slack web fixture: Undo clears the draft', slackCleared === '', slackCleared);
  await t.ctx.close();

  t = await open(browser, 'slack', 'https://app.slack.com/client/T01ABC/D02FYI', slackFyi, {});
  const slackFyiCount = await t.p.locator('[data-glance-do-it]').count();
  check('Slack web fixture: FYI gets no Do It', slackFyiCount === 0, slackFyiCount);
  check('Slack web fixture: an FYI leaves no follow-up card', (await t.p.locator('.flow-fu').count()) === 0);
  await t.ctx.close();

  const HE_ASK = 'תוכל לשלוח לי את הסיכום ביום שלישי?';
  const HE_FYI = 'רק לעדכון: הפגישה נדחתה לשבוע הבא';
  t = await open(browser, 'slack', 'https://app.slack.com/client/T01ABC/D02SELF', slackHtml('Flow (you)', [S('01', 'Flow', HE_ASK)]), {});
  check('Slack Hebrew self-chat ask shows exactly one Do It chip', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  check('Slack Hebrew self-chat ask has no follow-up card', (await t.p.locator('.flow-fu').count()) === 0);
  check('Slack Hebrew self-chat Do It label is בצע', (await t.p.locator('[data-glance-do-it]').innerText()) === 'בצע');
  check('Slack Hebrew self-chat Undo label is בטל', (await t.p.locator('[data-glance-undo]').innerText()) === 'בטל');
  await t.p.evaluate((text) => {
    const pane = document.querySelector('[data-qa="message_pane"]');
    const row = document.createElement('div');
    row.innerHTML = '<div data-qa="virtual-list-item"><div data-qa="message_container" data-msg-ts="1790800099.000100"><button data-qa="message_sender_name">Flow</button><div data-qa="message-text"></div></div></div>';
    row.querySelector('[data-qa="message-text"]').textContent = text;
    pane.appendChild(row.firstChild);
  }, HE_FYI);
  await t.p.waitForTimeout(2500);
  check('Slack Hebrew self-chat FYI after an ask leaves no Do It chip', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  check('Slack Hebrew self-chat FYI after an ask leaves no follow-up card', (await t.p.locator('.flow-fu').count()) === 0);
  await t.ctx.close();

  t = await open(browser, 'slack', SLACK_DM, slackHtml('Dana Cole', [S('01', SLACK_ME, HE_ASK)]), {});
  s = await t.state();
  const fuDir = await t.p.locator('.flow-fu').getAttribute('dir');
  check('Slack Hebrew 1:1 follow-up card uses Hebrew copy', s.card && s.card.indexOf('האם אתה מחכה לתשובה על זה?') >= 0 && s.card.indexOf('להמשיך לעקוב') >= 0 && s.card.indexOf('לא עכשיו') >= 0 && s.card.indexOf('Waiting on a reply') < 0 && s.card.indexOf('Stay on it') < 0 && s.card.indexOf('Not now') < 0, s.card);
  check('Slack Hebrew 1:1 follow-up card is RTL', fuDir === 'rtl', fuDir);
  check('Slack Hebrew 1:1 follow-up is not a self Do It', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.p.evaluate((text) => {
    const pane = document.querySelector('[data-qa="message_pane"]');
    const row = document.createElement('div');
    row.innerHTML = '<div data-qa="virtual-list-item"><div data-qa="message_container" data-msg-ts="1790800099.000100"><button data-qa="message_sender_name">Sali Sapan</button><div data-qa="message-text"></div></div></div>';
    row.querySelector('[data-qa="message-text"]').textContent = text;
    pane.appendChild(row.firstChild);
  }, HE_FYI);
  await t.p.waitForTimeout(2500);
  s = await t.state();
  check('Slack Hebrew 1:1 FYI after an ask leaves no follow-up card and no Do It', s.card === null && (await t.p.locator('[data-glance-do-it]').count()) === 0 && (await t.p.locator('.flow-fu').count()) === 0, s.card);
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/a/#777000123', tgA, {});
  check('Telegram Web A fixture: a self-chat ask shows Do It', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  await t.p.locator('[data-glance-do-it]').click();
  const tgBox = await t.p.locator('#editable-message-text').innerText();
  const tgSends = await t.p.evaluate(() => window.__glanceSendClicks || 0);
  check('Telegram Web A fixture: Do It drafts and does not press Send', tgBox.indexOf('Send the invoice by Friday.') >= 0 && tgSends === 0, { tgBox, tgSends });
  await t.p.locator('[data-glance-undo]').click();
  check('Telegram Web A fixture: Undo clears the draft', (await t.p.locator('#editable-message-text').innerText()).trim() === '');
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/k/#777000123', tgK, {});
  check('Telegram Web K fixture: a self-chat ask shows Do It', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  await t.ctx.close();

  function liveRow(ts, text) {
    return '<div data-qa="virtual-list-item" data-item-key="' + ts + '"><div data-qa="message_content" class="c-message_kit__blocks"><button type="button" data-qa="message_sender_name">Flow</button><div data-qa="message-text"><div class="p-rich_text_section">' + text + '</div></div></div></div>';
  }
  async function addLiveRow(page, ts, text) {
    await page.evaluate((html) => {
      const list = document.querySelector('[data-qa="message_pane"]');
      const row = document.createElement('div');
      row.innerHTML = html;
      list.appendChild(row.firstChild);
    }, liveRow(ts, text));
  }
  const dmsHtml = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/slack-web-dms.html'), 'utf8');
  const liveHtml = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/slack-web-live.html'), 'utf8');
  const storeSelf = async (p) => {
    await p.evaluate(() => localStorage.setItem('localConfig_v2', JSON.stringify({ teams: { T01ABC: { user_id: 'UFLOW123', token: 'xoxc-secret' } } })));
  };
  t = await open(browser, 'slack', 'https://app.slack.com/client/T01ABC/dms', dmsHtml, { prepare: storeSelf, wait: 400 });
  check('Slack /dms before render: no Do It yet', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.p.waitForTimeout(2000);
  await addLiveRow(t.p, '1732100000.000100', 'Can you send the invoice by Friday?');
  await t.p.waitForTimeout(2500);
  check('Slack /dms late render: self DM by user id shows Do It', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  check('Slack /dms names the signed-in user, not only the title', await t.p.locator('html').getAttribute('data-glance-sender') === 'UFLOW123');
  check('Slack /dms with no selected row is still the self chat', await t.p.locator('html').getAttribute('data-glance-chat') === 'slack:T01ABC:self-UFLOW123');
  const dmsNotes = await t.p.evaluate(() => (window.__msgs || []).filter((m) => m && m.type === 'flow:slack-trace').map((m) => m.line || ''));
  check('Slack /dms logs a selector probe and that the observer attached', dmsNotes.some((line) => line.indexOf('[Glance] slack probe url=') === 0 && line.indexOf('[data-qa="message_pane"]:') >= 0) && dmsNotes.some((line) => line.indexOf('[Glance] slack observer attached target=') === 0) && dmsNotes.some((line) => line.indexOf('[Glance] slack rescan reason=') === 0), dmsNotes);
  check('Slack /dms re-logs when the bubble count changes', dmsNotes.some((line) => line.indexOf('bubbles=0') >= 0) && dmsNotes.some((line) => /bubbles=[1-9]/.test(line)), dmsNotes);
  const dmsHealth = await t.p.evaluate(() => window.__health);
  check('Slack /dms reports the page identified so the panel leaves unrecognized', dmsHealth && dmsHealth.ok === true && dmsHealth.id === 'slack', dmsHealth);
  await t.p.locator('[data-glance-do-it]').click();
  const dmsBox = await t.p.locator('.ql-editor').innerText();
  const dmsSends = await t.p.evaluate(() => window.__glanceSendClicks || 0);
  check('Slack /dms Do It drafts and does not press Send', dmsBox.indexOf('Send the invoice by Friday.') >= 0 && dmsSends === 0, { dmsBox, dmsSends });
  await addLiveRow(t.p, '1732100002.000100', 'Could you send the receipt by Monday?');
  await t.p.waitForTimeout(2500);
  check('Slack /dms a later message still shows a card', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  await t.ctx.close();

  t = await open(browser, 'slack', 'https://app.slack.com/client/T01ABC/D0C9BS6UD9A', liveHtml, { prepare: storeSelf, wait: 400 });
  check('Slack /D before render: no Do It yet', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.p.waitForTimeout(2000);
  await addLiveRow(t.p, '1732100000.000100', 'Can you send the invoice by Friday?');
  await t.p.waitForTimeout(2500);
  check('Slack /D late render without data-msg-ts shows Do It', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  check('Slack /D thread comes from the address', await t.p.locator('html').getAttribute('data-glance-chat') === 'slack:T01ABC:D0C9BS6UD9A');
  await addLiveRow(t.p, '1732100003.000100', 'Please send the file by Thursday?');
  await t.p.waitForTimeout(2500);
  check('Slack /D a later message still shows a card', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  const liveSends = await t.p.evaluate(() => window.__glanceSendClicks || 0);
  check('Slack /D never presses Send', liveSends === 0);
  await t.ctx.close();

  const tgAEmpty = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/telegram-a-empty.html'), 'utf8');
  const tgADm = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/telegram-a-dm.html'), 'utf8');
  const tgKDm = fs.readFileSync(path.join(ROOT, 'e2e/fixtures/telegram-k-dm.html'), 'utf8');
  t = await open(browser, 'telegram', 'https://web.telegram.org/a/#777000123', tgAEmpty, { wait: 500 });
  check('Telegram Web A before render: no Do It yet', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.p.evaluate(() => {
    const list = document.querySelector('#MessageList');
    const row = document.createElement('div');
    row.className = 'Message own';
    row.id = 'message-4242';
    const text = document.createElement('div');
    text.className = 'text-content';
    text.textContent = 'Can you send the invoice by Friday?';
    row.appendChild(text);
    list.appendChild(row);
  });
  await t.p.waitForTimeout(1800);
  check('Telegram Web A late render: Saved Messages shows Do It', (await t.p.locator('[data-glance-do-it]').count()) === 1);
  check('Telegram Web A late render does not press Send', (await t.p.evaluate(() => window.__glanceSendClicks || 0)) === 0);
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/a/#777000123', tgADm, {});
  check('Telegram Web A 1:1 identifies the chat and the other person', await t.p.locator('html').getAttribute('data-glance-chat') === 'tg:777000123' && await t.p.locator('html').getAttribute('data-glance-sender') === 'Dana Cole');
  check('Telegram Web A 1:1 that is not Saved Messages has no self Do It', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.ctx.close();

  t = await open(browser, 'telegram', 'https://web.telegram.org/k/#424242', tgKDm, {});
  check('Telegram Web K 1:1 identifies the chat and the other person', await t.p.locator('html').getAttribute('data-glance-chat') === 'tg:424242' && await t.p.locator('html').getAttribute('data-glance-sender') === 'Dana Cole');
  check('Telegram Web K 1:1 that is not Saved Messages has no self Do It', (await t.p.locator('[data-glance-do-it]').count()) === 0);
  await t.ctx.close();

  await browser.close();
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
