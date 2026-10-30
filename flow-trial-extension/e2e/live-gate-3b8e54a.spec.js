// Live Gate 3b8e54a — David's saved Gmail DOM (cases-livegate-3b8e54a.jsonl).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { liveGmailPage, loadCases } = require('./support/live-gate-livedom');
const { e2eGoogleGrantedScopes } = require('./support/launch');

let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  if (!server) return;
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

const cases = loadCases();

for (const row of cases) {
  test(row.id, async ({ glance }) => {
    const pageOpts = row.page || {};
    const seed = Object.assign({
      onboarded: true,
      connectorId: 'googleTasks',
      glanceUiLanguage: row.ui || 'he',
      googleGrantedScopes: {
        version: e2eGoogleGrantedScopes(),
        status: 'granted',
        source: 'chrome',
        at: Date.now()
      }
    }, row.seed || {});
    await glance.seedGmail(seed);
    const html = liveGmailPage(pageOpts);
    const url = 'https://mail.google.com/mail/u/0/#all/' + (pageOpts.messageId || 'fixture');
    const page = await glance.openGmailHtml(html, { messageId: pageOpts.messageId || 'fixture' });
    const exp = row.expect || {};
    const waitMs = row.waitMs || 8000;
    const watchMs = row.watchMs || waitMs;
    const msgSel = pageOpts.messageId
      ? '[data-legacy-message-id="' + pageOpts.messageId + '"]'
      : 'div[role="main"]';

    const stats = await page.evaluate(({ watchMs, msgSel }) => {
      return new Promise((resolve) => {
        const main = document.querySelector('div[role="main"]');
        let inserts = 0;
        let toggleClicks = 0;
        const obs = new MutationObserver((list) => {
          for (const rec of list) {
            rec.addedNodes.forEach((n) => {
              if (n.nodeType === 1 && n.matches && n.matches('.flow-chip-host')) inserts++;
              if (n.nodeType === 1 && n.querySelector && n.querySelector('.flow-chip-host')) inserts++;
            });
          }
        });
        if (main) obs.observe(main, { childList: true, subtree: true });
        document.querySelectorAll('.ajy').forEach((btn) => {
          btn.addEventListener('click', () => { toggleClicks++; }, true);
        });
        setTimeout(() => {
          obs.disconnect();
          const host = document.querySelector(msgSel + ' .flow-chip-host') || document.querySelector('.flow-chip-host');
          const root = document.querySelector(msgSel) || document;
          const detailsOpen = !!(root.querySelector && root.querySelector('.ajB table.ajC, table.ajC'));
          resolve({ inserts, toggleClicks, hasCard: !!host, detailsOpen });
        }, watchMs);
      });
    }, { watchMs, msgSel });

    await page.waitForTimeout(Math.min(waitMs, 500));

    if (exp.card === true) {
      if (exp.cardWithinMs) {
        await expect(page.locator(msgSel + ' .flow-chip-host, div[role="main"] .flow-chip-host').first())
          .toBeVisible({ timeout: exp.cardWithinMs });
      } else {
        expect(stats.hasCard).toBe(true);
      }
    } else {
      expect(stats.hasCard).toBe(false);
      if (exp.neverInserted) expect(stats.inserts).toBe(0);
    }
    if (exp.detailsClose) {
      const maxOpens = exp.detailsClose.maxOpens != null ? exp.detailsClose.maxOpens : 1;
      expect(stats.toggleClicks).toBeLessThanOrEqual(maxOpens * 2);
      expect(stats.detailsOpen).toBe(false);
    }
  });
}
