// Connect, then one Do It, on the panel that just connected. The inbox
// already shows one safe task, one two-step ask, and one hedge. Only the
// task is offered. Handled waits for the read-back. The whole path stays
// inside 60 seconds. Nothing is sent.
const { test, expect } = require('./support/harness');

function futurePhrase(from) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + 40);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    phrase: months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(),
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate()
  };
}

test('connecting Google offers one safe task and one click closes it', async ({ glance }) => {
  const when = futurePhrase(new Date());
  const safe = 'I will send you the signed contract by ' + when.phrase + '.';
  const ask = 'Please follow up with Dana about the invoice.';
  const hedge = 'I might send the contract by ' + when.phrase + '.';
  const page = await glance.openGmail({
    inboxOnly: true,
    inboxRows: [
      { threadId: 't-hedge', subject: 'Maybe', snippet: hedge, email: 'dana@acme.com', name: 'Dana' },
      { threadId: 't-ask', subject: 'Invoice', snippet: ask, email: 'dana@acme.com', name: 'Dana' },
      { threadId: 't-safe', subject: 'Contract', snippet: safe, email: 'dana@acme.com', name: 'Dana' }
    ]
  });
  await page.waitForSelector('tr.zA', { timeout: 15000 });

  const started = Date.now();
  const popup = await glance.openPopup();
  await expect(popup.locator('#firstClose')).toBeHidden();
  await popup.getByRole('button', { name: 'Connect Google' }).click();
  await expect(popup.locator('#statusPill')).toHaveText('Google connected');

  const card = popup.locator('#firstClose');
  const button = card.getByRole('button', { name: 'Do It' });
  await expect(button).toBeVisible();
  const offeredAt = Date.now();
  await expect(card).toContainText('You promised this by ' + when.short);
  await expect(card).not.toContainText('still owed');
  await expect(card).not.toContainText('might');
  await expect(card.getByRole('button', { name: 'Do It' })).toHaveCount(1);

  await button.click();
  await expect(card).toContainText('Handled.');
  const closedAt = Date.now();
  const calls = await glance.apiCalls();
  const posts = calls.filter((c) => c.method === 'POST' && c.url.indexOf('tasks.googleapis.com') >= 0 && /\/tasks$/.test(c.url.split('?')[0]));
  const reads = calls.filter((c) => c.method === 'GET' && /\/tasks\/e2e-gtask-/.test(c.url));
  const sent = calls.filter((c) => /\/sendMail|\/microsoft\.graph\.sendMail|\/me\/sendMail/.test(c.url));
  expect(posts.length).toBe(1);
  expect(reads.length).toBe(1);
  expect(sent.length).toBe(0);
  expect(offeredAt - started).toBeLessThan(60000);
  expect(closedAt - started).toBeLessThan(60000);

  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toContainText('Undone.');
  await expect.poll(async () => {
    const after = await glance.apiCalls();
    return after.some((c) => c.method === 'DELETE' && c.url.indexOf('tasks.googleapis.com') >= 0);
  }).toBe(true);
  console.log('FIRST_CLOSE_MS offer=' + (offeredAt - started) + ' close=' + (closedAt - started) + ' budget=60000');
});
