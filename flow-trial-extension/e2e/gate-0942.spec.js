// 0.9.42: the Loops tab draws Suggested and Added, a reply-and-confirm
// ask offers a draft, and one promise is one Do It.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const Q3_SUBJECT = 'Gate A 0.9.41 - quick question on the Q3 summary';
const Q3_BODY = 'Can you reply and confirm whether the Q3 summary will include the October numbers?';
const DONT = "Please don't save the attachment to OneDrive";
const PROMISE = "I'll send Dana the numbers by Thursday.";

test('the Loops tab shows Suggested and Added on a loop that has steps', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.seed({
    stillOpenScan: [{
      messageId: 'AQMkGlanceE2EPanelSteps',
      threadId: 'AQQkGlanceE2EPanelSteps',
      threadUrl: 'https://outlook.office.com/mail/id/AQMkGlanceE2EPanelSteps',
      app: 'outlook',
      ts: Date.now(),
      sender: { name: 'Flow', email: S.SENDER },
      subject: 'Transfer',
      text: S.SHOW,
      intent: {
        type: 'request',
        label: 'Confirm the transfer',
        confidence: 'high',
        personalClose: 'follow-up-ask',
        facts: {},
        entities: { what: 'the transfer', requestWhat: 'the transfer' }
      },
      process: {
        id: 'reply-track',
        name: 'Reply',
        steps: [
          { kind: 'outlookDraft', id: 'draft', label: 'Reply about the transfer' },
          {
            kind: 'attachmentSave',
            id: 'attachmentSave',
            label: 'Save contract.pdf',
            copy: { en: 'Save contract.pdf' },
            params: { files: [{ id: 'att-contract', name: 'contract.pdf', size: 4096 }] }
          },
          { kind: 'outlookTask', id: 'added-call', label: 'Call Noa Thursday', added: true }
        ]
      }
    }]
  });
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  const list = popup.locator('#open-list');
  await expect(list.locator('.act-tag', { hasText: 'Suggested' })).toHaveCount(2);
  await expect(list.locator('[data-glance-section="suggested"]')).toBeVisible();
  await expect(list.locator('[data-glance-section="suggested"]')).toHaveText('Suggested');
  await expect(list.locator('.act-tag', { hasText: 'Added' })).toHaveCount(1);
  await expect(list.locator('[data-glance-section="added"]')).toBeVisible();
  await expect(list.locator('[data-glance-section="added"]')).toHaveText('Added');
  const addedStep = list.locator('li.act-added');
  await expect(addedStep).toHaveCount(1);
  await expect(addedStep.getByText('Call Noa Thursday')).toBeVisible();
});

test('the Q3 reply ask offers a draft and a save refusal stays quiet', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceE2EQ3Reply',
    subject: Q3_SUBJECT,
    senderEmail: S.SENDER,
    body: Q3_BODY
  });
  await expect(page.locator('#ReadingPaneContainerId button.flow-chip')).toBeVisible();
  await page.locator('#ReadingPaneContainerId button.flow-chip').click();
  await expect(page.locator('#ReadingPaneContainerId').getByText('Not sent.')).toBeVisible();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    const drafted = calls.some((c) => c.method === 'POST' && c.url.indexOf('/createReply') >= 0);
    const sent = calls.some((c) => /\/sendMail|\/microsoft\.graph\.sendMail|\/me\/sendMail/.test(c.url));
    return drafted && !sent;
  }).toBe(true);

  const quiet = await glance.openOutlook({
    id: 'AQMkGlanceE2EDontSave',
    subject: 'Attachment',
    senderEmail: S.SENDER,
    body: DONT
  });
  await expect(quiet.locator('#ReadingPaneContainerId button.flow-chip')).toHaveCount(0);
  await expect(quiet.locator('#ReadingPaneContainerId').getByText('Save the file?')).toHaveCount(0);
});

test('an excluded file row names the file and why it was skipped', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: {
      AQMkGlanceE2ESkipFile: [
        { id: 'att-board', name: 'board-pack.pdf', contentType: 'application/pdf', size: 4096, isInline: false },
        { id: 'att-contract', name: 'contract.pdf', contentType: 'application/pdf', size: 2200, isInline: true }
      ]
    },
    conversation: []
  });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceE2ESkipFile',
    subject: 'Board pack',
    senderEmail: S.SENDER,
    body: S.SUGGEST_BODY
  });
  await expect(page.locator('#ReadingPaneContainerId').getByText('Save the file?')).toBeVisible();
  await expect(page.locator('#ReadingPaneContainerId').getByText('contract.pdf · skipped · inline')).toBeVisible();
});

test('two mails with the same promise are one Do It in Loops', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.openOutlook({
    id: 'AQMkGlanceE2EPromiseOlder',
    subject: 'Passport',
    senderEmail: S.SENDER,
    body: PROMISE
  });
  await glance.openOutlook({
    id: 'AQMkGlanceE2EPromiseNewer',
    subject: 'Passport again',
    senderEmail: S.SENDER,
    body: PROMISE
  });
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  await expect(popup.locator('#open-list .log-item')).toHaveCount(1);
  await expect(popup.locator('#open-list').getByText('Do It')).toHaveCount(1);
});
