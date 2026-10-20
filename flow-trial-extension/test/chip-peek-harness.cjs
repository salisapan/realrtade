'use strict';
// The peek pops up in view when a Glance offer sits below the fold, points at the card, and writes nothing.
// Real Chromium, the real chip.css and chip-peek.js on a long mail. SKIPPED without Playwright.
// Run: node test/chip-peek-harness.cjs
const path = require('path');
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); } catch (e) { console.log('SKIPPED: playwright is not installed'); process.exit(0); }

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const exe = process.env.CHROME_BIN || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));

(async () => {
  const browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await page.setContent('<!doctype html><html lang="he"><body style="margin:0"><div id="mail" style="padding:20px"><p style="height:1400px">long mail body</p></div></body></html>');
  await page.addStyleTag({ path: path.join(ROOT, 'src', 'chip.css') });
  await page.addScriptTag({ path: path.join(ROOT, 'src', 'chip-peek.js') });
  const addHost = (state) => page.evaluate((st) => {
    document.querySelectorAll('.flow-chip-host').forEach((n) => n.remove());
    const h = document.createElement('div');
    h.className = 'flow-chip-host';
    const n = document.createElement('span'); n.className = 'flow-chip-process-name'; n.textContent = 'Reply & Track'; h.appendChild(n);
    const t = document.createElement('p'); t.className = 'flow-chip-text';
    const b = document.createElement('span'); b.className = 'flow-chip-brand'; b.textContent = 'Glance';
    t.appendChild(b); t.appendChild(document.createTextNode(' is drafting a reply to the request and opening a follow-up task.'));
    h.appendChild(t);
    const row = document.createElement('div'); row.className = 'flow-chip-main-row';
    const c = document.createElement('button'); c.className = 'flow-chip ' + st;
    ['shell', 'ring', 'shine'].forEach((k) => { const s = document.createElement('span'); s.className = k; c.appendChild(s); });
    const l = document.createElement('span'); l.className = 'flow-chip-do-label'; l.textContent = 'Do It'; c.appendChild(l);
    c.addEventListener('click', () => { window.__realClicks = (window.__realClicks || 0) + 1; });
    row.appendChild(c); h.appendChild(row);
    document.getElementById('mail').appendChild(h);
    window.scrollTo(0, 0);
  }, state || '');
  const tick = () => page.evaluate(() => { FlowChipPeek.tick(document, window); return !!document.getElementById('glance-peek'); });

  await addHost('');
  check('an offer below the fold pops up', await tick() === true);
  const box = await page.evaluate(() => { const r = document.getElementById('glance-peek').getBoundingClientRect(); return { b: r.bottom, r: r.right, vh: innerHeight, vw: innerWidth }; });
  check('the peek is inside the viewport', box.b <= box.vh && box.r <= box.vw, box);
  check('the peek is the same card: same sentence, brand and process name', await page.evaluate(() => {
    const p = document.getElementById('glance-peek'), h = document.querySelector('.flow-chip-host');
    return p.querySelector('.flow-chip-text').textContent === h.querySelector('.flow-chip-text').textContent
      && p.querySelector('.flow-chip-process-name').textContent === 'Reply & Track' && !!p.querySelector('.flow-chip-brand');
  }));
  check('the peek button is the canonical Do It (shell, ring, shine, label)', await page.evaluate(() => {
    const c = document.querySelector('#glance-peek .flow-chip');
    return !!c && !!c.querySelector('.shell') && !!c.querySelector('.ring') && !!c.querySelector('.shine') && c.querySelector('.flow-chip-do-label').textContent === 'Do It';
  }));
  check('the peek adds no look of its own: same card background, border and radius as the real card', await page.evaluate(() => {
    const keys = ['backgroundImage', 'borderTopColor', 'borderRadius', 'boxShadow', 'fontFamily'];
    const a = getComputedStyle(document.getElementById('glance-peek')), b = getComputedStyle(document.querySelector('.flow-chip-host'));
    return keys.every((k) => a[k] === b[k]);
  }));

  await page.click('#glance-peek .flow-chip');
  await page.waitForTimeout(900);
  check('Do It on the peek runs the real card Do It once', await page.evaluate(() => window.__realClicks) === 1);
  check('and brings the real card into view for the receipt', await page.evaluate(() => { const r = document.querySelector('.flow-chip-host').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  check('the peek leaves once the card is on screen', await tick() === false);

  await addHost('');
  await tick();
  await page.click('#glance-peek .flow-chip-dismiss');
  check('dismiss hides the peek for that card', await tick() === false);

  await addHost('flow-chip-pending');
  check('a card that is working shows no peek', await tick() === false);
  await addHost('flow-chip-error');
  check('a failed card shows no peek', await tick() === false);
  await page.evaluate(() => document.querySelectorAll('.flow-chip-host').forEach((n) => n.remove()));
  check('no card, no peek', await tick() === false);

  await page.evaluate(() => { document.getElementById('mail').insertAdjacentHTML('afterbegin', '<div class="flow-chip-host"><p class="flow-chip-text"><span class="flow-chip-brand">Glance</span> ok</p><button class="flow-chip"></button></div>'); window.scrollTo(0, 0); });
  check('an offer already in view shows no peek', await tick() === false);

  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL: harness error', e.message); process.exit(1); });
