// The Planner destination on the existing Outlook To Do card, behind the owner's off switch
// PLANNER_TASK in glanceSwitches. Unpacked extension, real Outlook page flow, Graph stand-in with
// Planner endpoints (plans, a task with an entity tag, a delete that needs If-Match).
// Switch off or no plan named: the task goes to To Do as it always did.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';
const NAMED = 'Please remember to renew the domain for the new site by Friday. Track it on the Website relaunch plan.';
const UNNAMED = 'Please remember to renew the domain for the new site by Friday.';
const OTHER = 'Please remember to renew the domain for the new site by Friday. Track it on the Retreat plan.';

async function openTask(glance, switches, body, id) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {});
  return glance.openOutlook({ id: id, subject: 'Domain', senderEmail: S.SENDER, body: body });
}
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));
const planner = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.plannerTasks || {}));

test('PLANNER_TASK off: a mail that names a plan still makes the To Do task', async ({ glance }) => {
  const page = await openTask(glance, null, NAMED, 'AQMk-plan-off');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  expect(await planner(glance)).toHaveLength(0);
});

test('PLANNER_TASK on and a plan named: the task is a Planner task in that plan, no assignee, read back, and Undo deletes it with If-Match', async ({ glance }) => {
  const page = await openTask(glance, { PLANNER_TASK: true }, NAMED, 'AQMk-plan-on');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await planner(glance);
  expect(list).toHaveLength(1);
  expect(list[0].planId).toBe('plan-web');
  expect(Object.keys(list[0].assignments || {})).toHaveLength(0);
  expect(await todo(glance)).toHaveLength(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/planner\/tasks\//.test(c.url))).toBe(true);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await planner(glance)).length).toBe(0);
  const del = (await glance.apiCalls()).filter((c) => c.method === 'DELETE' && /\/planner\/tasks\//.test(c.url));
  expect(del).toHaveLength(1);
});

test('PLANNER_TASK on but the mail names no plan, or a plan the person does not have: To Do, as always', async ({ glance }) => {
  let page = await openTask(glance, { PLANNER_TASK: true }, UNNAMED, 'AQMk-plan-none');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  expect(await planner(glance)).toHaveLength(0);
});

test('PLANNER_TASK on but the plan named is not one of the person\'s plans: To Do, as always', async ({ glance }) => {
  const page = await openTask(glance, { PLANNER_TASK: true }, OTHER, 'AQMk-plan-other');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  expect(await planner(glance)).toHaveLength(0);
});
