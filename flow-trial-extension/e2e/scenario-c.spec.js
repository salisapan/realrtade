// Scenario C, headless. A fixture WhatsApp page and a fixture calendar.
// One hit: approve, send, read the line back, reload the receipt.
// Two restaurants, zero hits, and Messenger stay silent.
// Nothing is sent until the approve click. Undo deletes only when the
// fixture exposes a delete control; otherwise the receipt says Undo unavailable.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const ROOT = path.join(__dirname, '..');
const NOW = '2026-10-08T12:00:00';
const HE = 'איפה אכלנו בשבוע שעבר?';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pageHtml(question, hostNote) {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<div id="app"><div id="main">' +
    '<header><span title="Dana">Dana</span></header>' +
    '<div data-id="' + (hostNote || 'false_972541234567@c.us_Q1') + '"><span class="selectable-text"></span></div>' +
    '<div id="extra"></div>' +
    '<footer><div contenteditable="true" data-tab="10"></div>' +
    '<button type="button" data-glance-send aria-label="Send">Send</button></footer>' +
    '</div></div>' +
    '<script>(function () {' +
    'var q = document.querySelector("#main [data-id] span.selectable-text");' +
    'q.textContent = ' + JSON.stringify(question) + ';' +
    'function rows() { try { return JSON.parse(localStorage.getItem("glance-wa-extra") || "[]"); } catch (e) { return []; } }' +
    'function save(list) { localStorage.setItem("glance-wa-extra", JSON.stringify(list)); }' +
    'function paint(row) {' +
    '  var n = document.createElement("div"); n.setAttribute("data-id", row.id);' +
    '  if (row.canDelete) { var d = document.createElement("button"); d.setAttribute("data-glance-delete", "1"); d.type = "button"; d.textContent = "Delete";' +
    '    d.addEventListener("click", function () { n.remove(); save(rows().filter(function (r) { return r.id !== row.id; })); }); n.appendChild(d); }' +
    '  var s = document.createElement("span"); s.className = "selectable-text"; s.textContent = row.text; n.appendChild(s);' +
    '  document.getElementById("extra").appendChild(n);' +
    '}' +
    'rows().forEach(paint);' +
    'document.querySelector("[data-glance-send]").addEventListener("click", function () {' +
    '  var box = document.querySelector("[contenteditable=true]"); var text = (box.textContent || "").replace(/\\s+/g, " ").trim(); if (!text) return;' +
    '  var id = "true_972541234567@c.us_S" + Date.now();' +
    '  var row = { id: id, text: text, canDelete: window.__glanceCanDelete === true };' +
    '  var list = rows(); list.push(row); save(list); paint(row); box.textContent = "";' +
    '});' +
    '})();</script></body></html>';
}

async function openFixture(glance, name, html, bag) {
  const page = await glance.context.newPage();
  await page.addInitScript((payload) => {
    const host = location.hostname;
    if (host !== 'web.whatsapp.com' && host !== 'www.messenger.com') return;
    if (!sessionStorage.getItem('glance-c-keep')) {
      try {
        localStorage.removeItem('glance-chat-answer-log');
        localStorage.removeItem('glance-wa-extra');
      } catch (e) { /* private */ }
      sessionStorage.setItem('glance-c-keep', '1');
    }
    window.__glanceChatAnswer = payload.bag;
    window.__glanceCanDelete = payload.canDelete === true;
  }, { bag: bag, canDelete: bag && bag.canDelete === true });
  for (const rel of ['core/chat-answer.js', 'core/proof-of-close.js', 'src/whatsapp-parse.js', 'src/whatsapp-composer.js']) {
    await page.addInitScript({ content: read(rel) });
  }
  const origin = name.indexOf('messenger') === 0 ? 'https://www.messenger.com/' : 'https://web.whatsapp.com/';
  await page.route(origin + '**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(origin + name);
  return page;
}

function bag(events, extra) {
  return Object.assign({
    events: events,
    mail: [],
    now: NOW,
    calendarChecked: true,
    mailChecked: true,
    canDelete: false
  }, extra || {});
}

test('one calendar hit sends only after approve, reads the line back, and remounts', async ({ glance }) => {
  const page = await openFixture(
    glance,
    'scenario-c-one',
    pageHtml(HE),
    bag([{ id: 'cal-port', status: 'confirmed', summary: 'פורט סעיד', start: { date: '2026-10-01' } }])
  );
  const card = page.locator('#glance-answer-card');
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'draft');
  await expect(card).toHaveAttribute('dir', 'rtl');
  await expect(card.locator('.glance-answer-place')).toHaveText('פורט סעיד');
  await expect(card.locator('.glance-answer-draft')).toHaveText('אכלנו בפורט סעיד.');
  await expect(page.locator('[contenteditable="true"]')).toHaveText('');
  await expect(page.locator('[data-id^="true_"]')).toHaveCount(0);

  await card.locator('button.flow-chip').click();
  await expect(page.locator('[data-id^="true_"] .selectable-text')).toHaveText('אכלנו בפורט סעיד.');
  await expect(card.locator('.glance-answer-status')).toHaveText('טופל.');
  const sent = await page.evaluate(() => JSON.parse(localStorage.getItem('glance-chat-answer-log') || '[]'));
  expect(sent[0].system).toBe('whatsapp/web');
  expect(sent[0].fetchedBack).toBe(true);
  expect(sent[0].externalId).toBe(sent[0].messageId);
  expect(String(sent[0].externalId).indexOf('true_972541234567@c.us_S')).toBe(0);
  expect(sent[0].verifiedAt).toBeTruthy();

  await page.reload();
  await expect(page.locator('#glance-answer-card .glance-answer-status')).toHaveText('טופל.');
  await expect(page.locator('[data-id^="true_"] .selectable-text')).toHaveText('אכלנו בפורט סעיד.');
  await page.close();
});

test('two restaurants stay silent', async ({ glance }) => {
  const page = await openFixture(
    glance,
    'scenario-c-two',
    pageHtml(HE),
    bag([
      { id: 'a', status: 'confirmed', summary: 'פורט סעיד', start: { date: '2026-10-01' } },
      { id: 'b', status: 'confirmed', summary: 'החצר', start: { date: '2026-10-02' } }
    ])
  );
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'silent');
  await expect(page.locator('#glance-answer-card')).toHaveCount(0);
  await expect(page.locator('[data-id^="true_"]')).toHaveCount(0);
  await page.close();
});

test('zero hits stay silent', async ({ glance }) => {
  const page = await openFixture(glance, 'scenario-c-zero', pageHtml(HE), bag([]));
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'silent');
  await expect(page.locator('#glance-answer-card')).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]')).toHaveText('');
  await page.close();
});

test('Undo removes the line when a delete control exists', async ({ glance }) => {
  const page = await openFixture(
    glance,
    'scenario-c-undo',
    pageHtml(HE),
    bag([{ id: 'cal-port', status: 'confirmed', summary: 'פורט סעיד', start: { date: '2026-10-01' } }], { canDelete: true })
  );
  await page.locator('#glance-answer-card button.flow-chip').click();
  await expect(page.locator('#glance-answer-card .glance-answer-status')).toHaveText('טופל.');
  await expect(page.locator('[data-glance-delete]')).toHaveCount(1);
  await page.locator('#glance-answer-card button.glance-answer-ghost').click();
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'undone');
  await expect(page.locator('[data-id^="true_"]')).toHaveCount(0);
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('glance-chat-answer-log') || '[]'));
  expect(log.some((row) => row.kind === 'written' && row.fetchedBack === true)).toBe(false);
  expect(log.some((row) => row.kind === 'undone')).toBe(true);
  await page.close();
});

test('Undo unavailable is explicit when the chat will not delete', async ({ glance }) => {
  const page = await openFixture(
    glance,
    'scenario-c-no-undo',
    pageHtml(HE),
    bag([{ id: 'cal-port', status: 'confirmed', summary: 'פורט סעיד', start: { date: '2026-10-01' } }])
  );
  await page.locator('#glance-answer-card button.flow-chip').click();
  await expect(page.locator('#glance-answer-card .glance-answer-status')).toHaveText('טופל.');
  const undo = page.locator('#glance-answer-card button.glance-answer-ghost');
  await expect(undo).toHaveText('Undo unavailable');
  await undo.click();
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'unavailable');
  await expect(page.locator('[data-id^="true_"] .selectable-text')).toHaveText('אכלנו בפורט סעיד.');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('glance-chat-answer-log') || '[]'));
  expect(log.some((row) => row.kind === 'written' && row.fetchedBack === true)).toBe(false);
  expect(log.some((row) => row.label === 'Undo unavailable')).toBe(true);
  await page.close();
});

test('Messenger stays quiet', async ({ glance }) => {
  const page = await openFixture(
    glance,
    'messenger-scenario-c',
    pageHtml(HE),
    bag([{ id: 'cal-port', status: 'confirmed', summary: 'פורט סעיד', start: { date: '2026-10-01' } }])
  );
  await expect(page.locator('html')).toHaveAttribute('data-glance-answer-state', 'silent');
  await expect(page.locator('#glance-answer-card')).toHaveCount(0);
  await page.close();
});
