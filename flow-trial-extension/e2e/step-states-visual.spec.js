const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const kit = path.join(__dirname, '..', 'design', 'step-states-v1');
const sheet = 'file://' + path.join(kit, 'step-states.html');
const harness = 'file://' + path.join(kit, 'scoped-harness.html');
const art = '/opt/cursor/artifacts/step-states';

async function openSheet(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(sheet, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('step-states sheet matches smoke-results.txt', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await openSheet(page);
  const chip = (id) => page.locator('.ss-stage[data-id="' + id + '"] .chip-txt').innerText();
  let c = (await chip('f1')).replace(/\s+/g, ' ').trim();
  expect(c).toBe('+ Glance can close this in 3 steps · Morning · Gmail · Calendar · +1 suggested');
  await page.click('.ss-stage[data-id="f1"] li.act-suggested .act-row');
  c = (await chip('f1')).replace(/\s+/g, ' ').trim();
  expect(c).toBe('+ Glance can close this in 4 steps · Morning · Gmail · Calendar · Drive');
  c = (await chip('f1b')).replace(/\s+/g, ' ').trim();
  expect(c).toContain('4 steps');
  c = (await chip('f6')).replace(/\s+/g, ' ').trim();
  expect(c).toContain('3 צעדים');
  expect(c).toContain('+1');
  await page.click('.ss-stage[data-id="f6"] li.act-suggested .act-row');
  c = (await chip('f6')).replace(/\s+/g, ' ').trim();
  expect(c).toContain('4 צעדים');
  expect(c).not.toContain('מוצע');

  const f3 = () => page.locator('.ss-stage[data-id="f3"]').evaluate((s) => ({
    txt: s.querySelector('.act-text').textContent.replace(/\s+/g, ' ').trim(),
    pills: s.querySelectorAll('.ss-pill').length,
    chip: s.querySelector('.chip-txt').textContent.replace(/\s+/g, ' ').trim()
  }));
  let s3 = await f3();
  expect(s3.txt).toBe('Save 2 of 5 attachments');
  expect(s3.pills).toBe(4);
  expect(s3.chip).toBe('Save 2 of 5 attachments to Drive?');
  await page.click('.ss-stage[data-id="f3"] .ss-pill[data-f="2"]');
  s3 = await f3();
  expect(s3.txt).toBe('Save 3 of 5 attachments');
  expect(s3.chip).toBe('Save 3 of 5 attachments to Drive?');
  await page.click('.ss-stage[data-id="f3"] .ss-pill[data-more]');
  s3 = await f3();
  expect(s3.pills).toBe(6);

  await page.click('.ss-stage[data-id="f4a"] .ss-add-btn');
  await page.fill('.ss-stage[data-id="f4a"] .ss-add-input', 'remind me to call Noa Thursday');
  await page.press('.ss-stage[data-id="f4a"] .ss-add-input', 'Enter');
  c = (await chip('f4a')).replace(/\s+/g, ' ').trim();
  expect(c).toContain('4 steps');
  expect(c).toContain('To Do');
  await expect(page.locator('.ss-stage[data-id="f4a"] li.act-added')).toHaveCount(1);
  await page.click('.ss-stage[data-id="f4a"] .ss-add-btn');
  await page.fill('.ss-stage[data-id="f4a"] .ss-add-input', 'print the contract');
  await page.press('.ss-stage[data-id="f4a"] .ss-add-input', 'Enter');
  c = (await chip('f4a')).replace(/\s+/g, ' ').trim();
  expect(c).toContain('4 steps');
  await expect(page.locator('.ss-stage[data-id="f4a"] li.act-manual')).toHaveCount(1);
  await page.press('.ss-stage[data-id="f4b"] .ss-add-input', 'Enter');
  await expect(page.locator('.ss-stage[data-id="f4b"] li.act-added')).toHaveCount(1);

  await page.click('.ss-stage[data-id="f2"] .do-halo');
  await page.waitForTimeout(1100);
  const settled = await page.locator('.ss-stage[data-id="f2"]').evaluate((s) => s.dataset.state + ' | ' + s.querySelector('.act-res').textContent.replace(/\s+/g, ' ').trim());
  expect(settled.startsWith('settled')).toBe(true);
  expect(settled).toContain('Saved');
  await page.click('.ss-stage[data-id="f2"] .ss-undo');
  await expect(page.locator('.ss-stage[data-id="f2"]')).toHaveAttribute('data-state', 'propose');

  const dis = await page.locator('.ss-stage[data-id="f5"] .approve-btn').evaluateAll((b) => b.map((x) => x.disabled));
  expect(dis).toEqual([true]);
  const f5b = await page.locator('.ss-stage[data-id="f5b"]').evaluate((s) => ({
    approveDisabled: s.querySelector('.approve-btn').disabled,
    failedTag: s.querySelector('.st-failed .act-tag').textContent
  }));
  expect(f5b.approveDisabled).toBe(false);
  expect(f5b.failedTag).toBe('Suggested');
  const lines = await page.locator('.ss-stage[data-id="f5b-done"] li.act').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  expect(lines.length).toBe(4);
  expect(lines.some((l) => /Drive/.test(l))).toBe(false);

  const bad = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ss-stage *').forEach((el) => {
      const cs = getComputedStyle(el);
      [cs.color, cs.backgroundColor, cs.borderTopColor].forEach((color) => {
        const m = String(color).match(/rgba?\((\d+), (\d+), (\d+)/);
        if (!m) return;
        const r = +m[1]; const g = +m[2]; const b = +m[3];
        if ((r - b > 60 && r - g > 40) || (g - r > 60 && g - b > 40)) out.push(String(el.className) + ' ' + color);
      });
    });
    return out.slice(0, 5);
  });
  expect(bad).toEqual([]);
  await page.click('#btn-theme');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});

test('scoped kit has no horizontal scroll at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harness, { waitUntil: 'load' });
  const sw = await page.evaluate(() => {
    window.scrollTo(300, 0);
    return [document.documentElement.scrollWidth, document.documentElement.clientWidth, window.scrollX];
  });
  expect(sw[0]).toBeLessThanOrEqual(sw[1]);
  expect(sw[2]).toBe(0);
  const chip = await page.locator('.ss-stage[data-id="f1"] .chip-txt').innerText();
  expect(chip.replace(/\s+/g, ' ').trim()).toContain('3 steps');
  await page.click('#btn-theme');
  await expect.poll(() => page.locator('#card').getAttribute('data-theme')).toBe('dark');
});

test('rendered frames sit beside the design frames', async ({ page }) => {
  fs.mkdirSync(art, { recursive: true });
  const designDir = '/workspace/step-states-v1-png';
  if (fs.existsSync(designDir)) {
    for (const name of fs.readdirSync(designDir)) {
      if (name.endsWith('.png')) fs.copyFileSync(path.join(designDir, name), path.join(art, 'design-' + name));
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSheet(page);
  const frames = ['F1', 'F1b', 'F2', 'F2-done', 'F3', 'F3-expanded', 'F4', 'F5', 'F5b', 'F6'];
  for (const id of frames) {
    const loc = page.locator('#' + id);
    await loc.scrollIntoViewIfNeeded();
    await loc.screenshot({ path: path.join(art, 'rendered-' + id + '.png') });
  }
  await page.click('#btn-theme');
  await page.locator('#F6').scrollIntoViewIfNeeded();
  await page.locator('#F6').screenshot({ path: path.join(art, 'rendered-F6-dark.png') });
});
