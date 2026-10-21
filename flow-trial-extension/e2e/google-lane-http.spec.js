// Each card clicks through the Gmail page, then the lane fetch hits a local
// HTTP server. The service worker's fetch stand-in is not the proof.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const QUOTE = 'Please prepare a quote for Dana Cole at $3,900, titled "14th floor".';
// Dates follow the real clock so the spec does not go stale: a payment a few days
// back, a file on the calendar a week ahead, a Hebrew weekday date about ten days out.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_AHEAD = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);
const BACK = DAYS_AHEAD(-3);
const SHEET = 'Please log $4,200 confirmed on ' + MONTHS[BACK.getMonth()] + ' ' + BACK.getDate() + ' in a new spreadsheet.';
const SAVE = 'Please save the attached pdf to Drive.';
const WEEK = DAYS_AHEAD(7);
const HOLD = 'Put the glance-pricing-q4.pdf file on my calendar on ' + MONTHS[WEEK.getMonth()] + ' ' + WEEK.getDate() + ', ' + WEEK.getFullYear() + ' at 10:00.';
const DRAFT = 'Could you confirm the transfer by Friday?';
const PDF = 'application/pdf:board.pdf:https://mail.googleusercontent.com/e2e/board.pdf';

let server;

test.beforeAll(async () => {
  server = await startGoogleLaneServer();
});

test.afterAll(async () => {
  if (server) await server.close();
});

test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
  }, server.origin);
});

function wrote(method, part) {
  return server.calls.some((c) => c.method === method && c.path.indexOf(part) >= 0);
}

async function clickDoIt(page) {
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
}

async function uncheck(page, id) {
  await expect(page.locator('div[role="main"] button.flow-chip')).toBeVisible({ timeout: 20000 });
  const box = page.locator('li[data-step-id="' + id + '"] input.act-check');
  if (!(await box.count())) return;
  await box.evaluate((el) => {
    el.checked = false;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function open(glance, opts) {
  await glance.seedGmail(opts.seed || {});
  return glance.openGmail(opts.mail);
}

test('A reply draft is a real drafts.create read back by id, nothing calls the people API, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-people',
      threadId: 't-people',
      subject: 'Transfer',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: DRAFT
    }
  });
  await uncheck(page, 'task');
  await clickDoIt(page);
  await expect.poll(() => wrote('POST', '/gmail/v1/users/me/drafts')).toBe(true);
  const id = server.last.draft;
  await expect.poll(() => server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/drafts/' + id) >= 0)).toBe(true);
  expect(server.calls.some((c) => c.path.indexOf('people.googleapis') >= 0 || c.path.indexOf('/v1/people') >= 0)).toBe(false);
  expect(server.drafts[id].message.threadId).toBe('t-people');
  expect(server.calls.some((c) => c.path.indexOf('/messages/send') >= 0 || c.path.indexOf('/drafts/send') >= 0)).toBe(false);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/drafts/' + id) >= 0)).toBe(true);
  expect(server.drafts[id]).toBeUndefined();
});

test('Calendar Hold It posts to the local server, reads the event back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-hold',
      threadId: 't-hold',
      subject: 'Pricing',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: HOLD
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.event;
  expect(wrote('POST', '/calendar/v3/calendars/primary/events')).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
});

test('Calendar Undo refuses after the event is edited and leaves it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-hold-edit',
      threadId: 't-hold-edit',
      subject: 'Pricing',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: HOLD
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.event;
  server.editEvent(id, { summary: 'Moved by the person' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('Undo stopped');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.event(id).summary).toBe('Moved by the person');
});

test('Drive save posts the attachment, reads it back, and Undo trashes it', async ({ glance }) => {
  await glance.context.route('https://mail.googleusercontent.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-e2e') });
  });
  const page = await open(glance, {
    mail: {
      messageId: 'm-drive',
      threadId: 't-drive',
      subject: 'Board pack',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: SAVE,
      downloadUrl: PDF
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.file;
  expect(server.calls.some((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') >= 0)).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path === '/drive/v3/files/' + id)).toBe(true);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'PATCH' && c.path === '/drive/v3/files/' + id)).toBe(true);
  expect(server.file(id).trashed).toBe(true);
});

test('Drive Undo refuses after the file is renamed and leaves it', async ({ glance }) => {
  await glance.context.route('https://mail.googleusercontent.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-e2e') });
  });
  const page = await open(glance, {
    mail: {
      messageId: 'm-drive-edit',
      threadId: 't-drive-edit',
      subject: 'Board pack',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: SAVE,
      downloadUrl: PDF
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.file;
  server.editFile(id, { name: 'board-edited.pdf' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.file(id).name).toBe('board-edited.pdf');
  expect(server.file(id).trashed).not.toBe(true);
});

test('Docs insert posts the document, reads the range back, and Undo removes it', async ({ glance }) => {
  const page = await open(glance, {
    seed: {
      glanceCompanyTemplate: {
        artifact: 'quote',
        kind: 'doc',
        name: 'Acme quote',
        logo: 'Acme',
        intro: 'Prepared from the Acme quote template.',
        slots: ['party', 'amount', 'title']
      }
    },
    mail: {
      messageId: 'm-doc',
      threadId: 't-doc',
      subject: 'Quote',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: QUOTE
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.doc;
  expect(server.calls.some((c) => c.method === 'POST' && c.path === '/drive/v3/files')).toBe(true);
  expect(server.calls.some((c) => c.method === 'POST' && c.path.indexOf('/v1/documents/' + id + ':batchUpdate') >= 0)).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path === '/v1/documents/' + id)).toBe(true);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'PATCH' && c.path === '/drive/v3/files/' + id)).toBe(true);
});

test('Docs Undo refuses after the inserted text is edited and leaves it', async ({ glance }) => {
  const page = await open(glance, {
    seed: {
      glanceCompanyTemplate: {
        artifact: 'quote',
        kind: 'doc',
        name: 'Acme quote',
        logo: 'Acme',
        intro: 'Prepared from the Acme quote template.',
        slots: ['party', 'amount', 'title']
      }
    },
    mail: {
      messageId: 'm-doc-edit',
      threadId: 't-doc-edit',
      subject: 'Quote',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: QUOTE
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.doc;
  server.editDocText(id, 'The person rewrote this paragraph.');
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  const text = server.doc(id).body.content[0].paragraph.elements[0].textRun.content;
  expect(text).toBe('The person rewrote this paragraph.');
});

test('Sheets append posts one row, reads it back, and Undo removes the sheet', async ({ glance }) => {
  const page = await open(glance, {
    seed: {
      glanceCompanyTemplate: {
        artifact: 'amount-sheet',
        kind: 'sheet',
        name: 'Acme ledger',
        slots: ['amount', 'date']
      }
    },
    mail: {
      messageId: 'm-sheet',
      threadId: 't-sheet',
      subject: 'Ledger',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: SHEET
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.sheet;
  expect(server.calls.some((c) => c.method === 'POST' && c.path.indexOf('/v4/spreadsheets/' + id + '/values/') >= 0 && c.path.indexOf(':append') >= 0)).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/v4/spreadsheets/' + id + '/values/') >= 0)).toBe(true);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'PATCH' && c.path === '/drive/v3/files/' + id)).toBe(true);
});

test('Sheets Undo refuses after the row is edited and leaves it', async ({ glance }) => {
  const page = await open(glance, {
    seed: {
      glanceCompanyTemplate: {
        artifact: 'amount-sheet',
        kind: 'sheet',
        name: 'Acme ledger',
        slots: ['amount', 'date']
      }
    },
    mail: {
      messageId: 'm-sheet-edit',
      threadId: 't-sheet-edit',
      subject: 'Ledger',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: SHEET
    }
  });
  await uncheck(page, 'draft');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.sheet;
  const edited = ['edited-by-person', '1'];
  server.editSheetRow(id, edited);
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.sheet(id).row).toEqual(edited);
});

test('A pre-filled Reply keeps To, Subject, signature, and the quote, and the body is inserted above them', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-reply',
      threadId: 't-reply',
      subject: 'Transfer',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: DRAFT,
      composeReply: true,
      composeTo: S.SENDER,
      composeSubject: 'Re: Transfer',
      signature: 'Best, Ada',
      quoted: 'Could you confirm the transfer by Friday?'
    }
  });
  await uncheck(page, 'task');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-written')).toContainText('Compose filled');
  await expect(page.locator('textarea[name="to"]')).toHaveValue(S.SENDER);
  await expect(page.locator('input[name="subjectbox"]')).toHaveValue('Re: Transfer');
  const body = page.locator('[aria-label="Message Body"]');
  await expect(body).toContainText('Could you confirm the transfer by Friday?');
  await expect(body.locator('.gmail_signature')).toHaveText('Best, Ada');
  await expect(body.locator('blockquote')).toHaveText('Could you confirm the transfer by Friday?');
  const order = await body.evaluate((el) => {
    const draft = el.querySelector('[data-glance-draft]');
    const sig = el.querySelector('.gmail_signature');
    const quote = el.querySelector('.gmail_quote');
    if (!draft || !sig || !quote) return false;
    const after = Node.DOCUMENT_POSITION_FOLLOWING;
    return (draft.compareDocumentPosition(sig) & after) !== 0 && (sig.compareDocumentPosition(quote) & after) !== 0;
  });
  expect(order).toBe(true);
  await body.locator('[data-glance-draft]').evaluate((el) => { el.textContent = 'Typed by the person'; });
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  await expect(body.locator('[data-glance-draft]')).toHaveText('Typed by the person');
  await expect(body.locator('.gmail_signature')).toHaveText('Best, Ada');
});

test('Compose fill writes the Gmail window, reads it back, and Undo clears it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-compose',
      threadId: 't-compose',
      subject: 'Transfer',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: DRAFT,
      compose: true
    }
  });
  await uncheck(page, 'task');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-written')).toContainText('Compose filled');
  await expect(page.locator('textarea[name="to"]')).toHaveValue(S.SENDER);
  await expect(page.locator('input[name="subjectbox"]')).not.toHaveValue('');
  const body = page.locator('[aria-label="Message Body"]');
  await expect(body).not.toHaveText('');
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('Nothing was sent');
  await expect(body).toHaveText('');
});

test('Compose Undo refuses after the person types and leaves their text', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-compose-edit',
      threadId: 't-compose-edit',
      subject: 'Transfer',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: DRAFT,
      compose: true
    }
  });
  await uncheck(page, 'task');
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-written')).toContainText('Compose filled');
  const body = page.locator('[aria-label="Message Body"]');
  await body.evaluate((el) => { el.textContent = 'Edited by the person'; });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  await expect(body).toHaveText('Edited by the person');
  expect(server.calls.slice(before).filter((c) => c.method !== 'GET').length).toBe(0);
});

test('A task card posts to the local server, reads the task back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-task-http',
      threadId: 't-task-http',
      subject: 'Contract',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: S.HEBREW_TASK
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.task;
  expect(server.calls.some((c) => c.method === 'POST' && c.path.indexOf('/tasks/v1/lists/glance-list/tasks') >= 0)).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/tasks/' + id) >= 0)).toBe(true);
  const stub = await glance.apiCalls();
  expect(stub.some((c) => String(c.url || '').indexOf('tasks.googleapis.com') >= 0)).toBe(false);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/tasks/' + id) >= 0)).toBe(true);
});

test('Task Undo refuses after the title is edited and leaves it', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-task-edit',
      threadId: 't-task-edit',
      subject: 'Contract',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: S.HEBREW_TASK
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.task;
  server.editTask(id, { title: 'Changed by the person' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('Undo stopped');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.task(id).title).toBe('Changed by the person');
});

// The next Thursday at least four days out, 14:00 in Jerusalem, and the UTC instant that is.
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const THURSDAY = (() => {
  const d = DAYS_AHEAD(4);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  return d;
})();
function jerusalemToUtcIso(y, m, d, hour) {
  const wall = Date.UTC(y, m - 1, d, hour, 0, 0);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const wallOf = (ms) => {
    const bag = {};
    fmt.formatToParts(new Date(ms)).forEach((p) => { if (p.type !== 'literal') bag[p.type] = p.value; });
    return Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), Number(bag.hour) % 24, Number(bag.minute), Number(bag.second));
  };
  let utc = wall - (wallOf(wall) - wall);
  utc = wall - (wallOf(utc) - utc);
  return new Date(utc).toISOString().replace(/\.000Z$/, 'Z');
}
const HEBREW_HOLD = 'פגישה ביום ' + HE_DAYS[THURSDAY.getDay()] + ' ' + THURSDAY.getDate() + '/' + (THURSDAY.getMonth() + 1) + ' בשעה 14:00';
const HEBREW_HOLD_UTC = jerusalemToUtcIso(THURSDAY.getFullYear(), THURSDAY.getMonth() + 1, THURSDAY.getDate(), 14);

test('Hebrew weekday date and hour posts one Jerusalem hold at 14:00 Jerusalem time', async ({ glance }) => {
  const page = await open(glance, {
    seed: { glanceTimeZone: 'Asia/Jerusalem' },
    mail: {
      messageId: 'm-he-hold',
      threadId: 't-he-hold',
      subject: 'פגישה',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: HEBREW_HOLD
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const posts = server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/calendar/v3/calendars/primary/events') >= 0);
  expect(posts).toHaveLength(1);
  const post = posts[0];
  expect(post.search || '').toContain('sendUpdates=none');
  expect(post.body.attendees || []).toEqual([]);
  expect(post.body.start.timeZone).toBe('Asia/Jerusalem');
  expect(post.body.start.dateTime).toBe(HEBREW_HOLD_UTC);
  expect(new Date(post.body.start.dateTime).toISOString()).toBe(HEBREW_HOLD_UTC.replace(/Z$/, '.000Z'));
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/events/' + server.last.event) >= 0)).toBe(true);
});

test('Undo after a Gmail reload deletes the task', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-task-reload',
      threadId: 't-task-reload',
      subject: 'Contract',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: S.HEBREW_TASK
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.task;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div[role="main"] button.flow-chip-undo')).toBeVisible({ timeout: 20000 });
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/tasks/' + id) >= 0)).toBe(true);
});

const TWO_STEP = "Let's do a call on Thursday at 2:00pm to review the contract.";

test('Undo after a reload deletes the calendar and the task in reverse and names both', async ({ glance }) => {
  const page = await open(glance, {
    seed: { glanceTimeZone: 'Asia/Jerusalem' },
    mail: {
      messageId: 'm-two-reload',
      threadId: 't-two-reload',
      subject: 'Review',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: TWO_STEP
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const taskId = server.last.task;
  const eventId = server.last.event;
  expect(taskId).toBeTruthy();
  expect(eventId).toBeTruthy();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div[role="main"] button.flow-chip-undo')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"]')).toContainText('Calendar');
  await expect(page.locator('div[role="main"]')).toContainText('Google Task');
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => {
    const after = server.calls.slice(before);
    const taskDel = after.findIndex((c) => c.method === 'DELETE' && c.path.indexOf('/tasks/' + taskId) >= 0);
    const eventDel = after.findIndex((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + eventId) >= 0);
    return taskDel >= 0 && eventDel > taskDel;
  }).toBe(true);
  await expect(page.locator('div[role="main"]')).toContainText('Google Task removed');
  await expect(page.locator('div[role="main"]')).toContainText('Calendar event removed');
});

test('Undo after a reload refuses an edited task and still removes the calendar', async ({ glance }) => {
  const page = await open(glance, {
    seed: { glanceTimeZone: 'Asia/Jerusalem' },
    mail: {
      messageId: 'm-two-edit',
      threadId: 't-two-edit',
      subject: 'Review',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: TWO_STEP
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const taskId = server.last.task;
  const eventId = server.last.event;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div[role="main"] button.flow-chip-undo')).toBeVisible({ timeout: 20000 });
  server.editTask(taskId, { title: 'Changed by the person' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('Undo stopped');
  await expect(page.locator('div[role="main"]')).toContainText('Calendar event removed');
  const after = server.calls.slice(before);
  expect(after.some((c) => c.method === 'DELETE' && c.path.indexOf('/tasks/' + taskId) >= 0)).toBe(false);
  expect(after.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + eventId) >= 0)).toBe(true);
  expect(server.task(taskId).title).toBe('Changed by the person');
});

test('Undo after a reload refuses an edited task', async ({ glance }) => {
  const page = await open(glance, {
    mail: {
      messageId: 'm-task-reload-edit',
      threadId: 't-task-reload-edit',
      subject: 'Contract',
      senderEmail: S.SENDER,
      senderName: 'flow',
      body: S.HEBREW_TASK
    }
  });
  await clickDoIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.task;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div[role="main"] button.flow-chip-undo')).toBeVisible({ timeout: 20000 });
  server.editTask(id, { title: 'Changed by the person' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('Undo stopped');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.task(id).title).toBe('Changed by the person');
});
