import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Glance · Step states v1 — PNG frames + smoke. Box only, file:// only.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..');
const outDir = path.join(dir, 'png');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ERRS = [];
async function open(theme = 'light', { dpr = 2, w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ERRS.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') ERRS.push(m.text()); });
  page.on('requestfailed', (r) => ERRS.push('requestfailed ' + r.url()));
  await page.addInitScript((t) => { try { localStorage.setItem('glance.corner.theme', t); } catch (e) {} }, theme);
  await page.goto('file://' + path.join(dir, 'step-states.html'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  page.__ctx = ctx;
  return page;
}
async function shot(name, sel, { theme = 'light', full = false, w, h, prep } = {}) {
  const page = await open(theme, { dpr: full ? 1 : 2, w, h });
  if (prep) await prep(page);
  await page.waitForTimeout(700);
  const out = path.join(outDir, name + '.png');
  if (full) await page.screenshot({ path: out, fullPage: true });
  else { await page.locator(sel).scrollIntoViewIfNeeded(); await page.locator(sel).screenshot({ path: out }); }
  console.log('OK', path.relative(__dirname, out), fs.statSync(out).size);
  await page.__ctx.close();
}
const only = process.argv[2];
const jobs = [
  ['F1-light', '#F1'], ['F1b-light', '#F1b'], ['F2-light', '#F2'], ['F2-done-light', '#F2-done'],
  ['F3-light', '#F3'], ['F3-expanded-light', '#F3-expanded'], ['F4-light', '#F4'], ['F5-light', '#F5'], ['F5b-light', '#F5b'],
  ['F6-rtl-light', '#F6'], ['F1-dark', '#F1', { theme: 'dark' }], ['F6-rtl-dark', '#F6', { theme: 'dark' }],
  ['full-sheet-light', null, { full: true }], ['full-sheet-dark', null, { full: true, theme: 'dark' }],
  ['full-sheet-390-light', null, { full: true, w: 390, h: 844 }],
];
for (const [n, s, o] of jobs) if (!only || n.includes(only)) await shot(n, s, o || {});

// ---------- smoke ----------
const R = [];
const fail = (m) => { throw new Error('SMOKE FAIL: ' + m); };
{
  const p = await open('light', { dpr: 1 });
  const chip = (id) => p.$eval(`.ss-stage[data-id="${id}"] .chip-txt`, (e) => e.textContent.replace(/\s+/g, ' ').trim());
  let c = await chip('f1'); if (c !== '+ Glance can close this in 3 steps · Morning · Gmail · Calendar · +1 suggested') fail('f1 chip ' + c); R.push('F1 chip: ' + c);
  await p.click('.ss-stage[data-id="f1"] li.act-suggested .act-row');
  c = await chip('f1'); if (c !== '+ Glance can close this in 4 steps · Morning · Gmail · Calendar · Drive') fail('f1 checked chip ' + c); R.push('F1 check suggested → ' + c);
  c = await chip('f1b'); if (!/4 steps/.test(c)) fail('f1b'); R.push('F1b chip: ' + c);
  c = await chip('f6'); if (!/3 צעדים/.test(c) || !/\+1/.test(c)) fail('f6 chip ' + c); R.push('F6 chip: ' + c);
  await p.click('.ss-stage[data-id="f6"] li.act-suggested .act-row'); c = await chip('f6'); if (!/4 צעדים/.test(c) || /מוצע/.test(c)) fail('f6 checked ' + c); R.push('F6 check suggested → ' + c);
  // F3 pills
  const f3 = () => p.$eval('.ss-stage[data-id="f3"]', (s) => ({ txt: s.querySelector('.act-text').textContent, pills: s.querySelectorAll('.ss-pill').length, chip: s.querySelector('.chip-txt').textContent }));
  let s3 = await f3(); if (s3.txt !== 'Save 2 of 5 attachments' || s3.pills !== 4) fail('f3 ' + JSON.stringify(s3)); R.push('F3 collapsed: ' + JSON.stringify(s3));
  await p.click('.ss-stage[data-id="f3"] .ss-pill[data-f="2"]'); s3 = await f3(); if (s3.txt !== 'Save 3 of 5 attachments') fail('f3 toggle ' + s3.txt); R.push('F3 pill toggle → ' + s3.txt + ' · ' + s3.chip);
  await p.click('.ss-stage[data-id="f3"] .ss-pill[data-more]'); s3 = await f3(); if (s3.pills !== 6) fail('f3 expand ' + s3.pills); R.push('F3 +2 → expanded (' + s3.pills + ' pills incl. Less)');
  // F4 add-step
  await p.click('.ss-stage[data-id="f4a"] .ss-add-btn'); await p.fill('.ss-stage[data-id="f4a"] .ss-add-input', 'remind me to call Noa Thursday'); await p.press('.ss-stage[data-id="f4a"] .ss-add-input', 'Enter');
  c = await chip('f4a'); if (!/4 steps/.test(c) || !(await p.$('.ss-stage[data-id="f4a"] li.act-added'))) fail('f4 resolve todo ' + c); R.push('F4 Enter "remind me to call Noa Thursday" → To Do row, ' + c);
  await p.click('.ss-stage[data-id="f4a"] .ss-add-btn'); await p.fill('.ss-stage[data-id="f4a"] .ss-add-input', 'print the contract'); await p.press('.ss-stage[data-id="f4a"] .ss-add-input', 'Enter');
  c = await chip('f4a'); if (!/4 steps/.test(c) || !(await p.$('.ss-stage[data-id="f4a"] li.act-manual'))) fail('f4 resolve manual ' + c); R.push('F4 Enter "print the contract" → Manual row, not counted (' + c + ')');
  await p.press('.ss-stage[data-id="f4b"] .ss-add-input', 'Enter'); if (!(await p.$('.ss-stage[data-id="f4b"] li.act-added'))) fail('f4b enter'); R.push('F4b Enter resolves the typed demo phrase');
  // F2 run
  await p.click('.ss-stage[data-id="f2"] .do-halo'); await p.waitForTimeout(1100);
  const st = await p.$eval('.ss-stage[data-id="f2"]', (s) => s.dataset.state + ' | ' + s.querySelector('.act-res').textContent.trim());
  if (!/^settled/.test(st)) fail('f2 run ' + st); R.push('F2 Do It → ' + st);
  await p.click('.ss-stage[data-id="f2"] .ss-undo'); if ((await p.$eval('.ss-stage[data-id="f2"]', (s) => s.dataset.state)) !== 'propose') fail('f2 undo'); R.push('F2 Undo → propose');
  // F5 / F5b
  const dis = await p.$$eval('.ss-stage[data-id="f5"] .approve-btn', (b) => b.map((x) => x.disabled)); if (dis.join() !== 'true') fail('f5 approve ' + dis); R.push('F5 Approve disabled after explicit step fails');
  const f5b = await p.$eval('.ss-stage[data-id="f5b"]', (s) => ({ approveDisabled: s.querySelector('.approve-btn').disabled, failedTag: s.querySelector('.st-failed .act-tag').textContent }));
  if (f5b.approveDisabled || f5b.failedTag !== 'Suggested') fail('f5b ' + JSON.stringify(f5b)); R.push('F5b suggested fails → Approve enabled · tag ' + f5b.failedTag);
  const lines = await p.$$eval('.ss-stage[data-id="f5b-done"] li.act', (els) => els.filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  if (lines.some((l) => /Drive/.test(l)) || lines.length !== 4) fail('f5b receipt ' + lines); R.push('F5b receipt lines: ' + lines.join(' | '));
  // palette: no red / green / amber anywhere
  const bad = await p.evaluate(() => { const out = []; document.querySelectorAll('*').forEach((el) => { const cs = getComputedStyle(el); [cs.color, cs.backgroundColor, cs.borderTopColor].forEach((c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return; const [r, g, b] = [+m[1], +m[2], +m[3]]; if ((r - b > 60 && r - g > 40) || (g - r > 60 && g - b > 40)) out.push(el.className + ' ' + c); }); }); return out.slice(0, 5); });
  if (bad.length) fail('off-palette colors ' + bad); R.push('palette: no red/green/amber computed colors');
  // theme toggle
  await p.click('#btn-theme'); if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== 'dark') fail('toggle'); R.push('Light/Dark toggle works');
  await p.__ctx.close();
}
for (const w of [390, 768, 1440]) {
  const p = await open('light', { dpr: 1, w, h: 844 });
  const sw = await p.evaluate(() => { window.scrollTo(300, 0); return [document.documentElement.scrollWidth, document.documentElement.clientWidth, window.scrollX]; });
  if (sw[0] > sw[1] || sw[2] !== 0) fail('horizontal overflow at ' + w + ': ' + sw);
  // nothing inside a card overflows its row
  const clip = await p.evaluate(() => [...document.querySelectorAll('.act-text,.act-tag,.chip-txt,.ss-pill,.gs-intent')].filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ':' + e.textContent.slice(0, 30)));
  if (clip.length) fail('clipped at ' + w + ': ' + clip);
  R.push('no horizontal scroll / no clipped text at ' + w + 'px (' + sw[0] + ' <= ' + sw[1] + ')');
  await p.__ctx.close();
}
for (const t of ['light', 'dark']) { const p = await open(t, { dpr: 1 }); await p.__ctx.close(); }
if (ERRS.length) fail('console/page errors: ' + [...new Set(ERRS)].join(' || '));
R.push('no console errors');
console.log(R.join('\n'));
fs.writeFileSync(path.join(outDir, 'smoke-results.txt'), R.join('\n') + '\n');
await browser.close();
