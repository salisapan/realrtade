// Gate100: David's 100-case release set, driven through the real extension (content scripts and
// service worker) in headless Chromium with a fixed clock. Gmail pages are built from the thread
// fixture, Outlook pages from the OWA fixture plus a seeded Graph conversation. A case is read as
// written: card yes/no, the action, the visible reason when there is no card, the task or event
// title and due date, and the receipt wording. The expectations in cases.jsonl are not edited here.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('../../e2e/support/harness');
const DISPLAY = require('../../core/display-copy.js').FlowDisplay;

const CLOCK_ISO = process.env.GLANCE_E2E_CLOCK_ISO;
const CASES = fs.readFileSync(path.join(__dirname, 'cases.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ONLY = process.env.GATE100_ONLY ? new RegExp(process.env.GATE100_ONLY) : null;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// "now" is the fixed clock (a Wednesday). A bare weekday is the first such day after today;
// "next <day>" is that day in the calendar week that starts next Sunday.
function dueFrom(token, now) {
  const m = String(token).trim().match(/^(?:(\+\d+)d|(next )?([a-z]{3}))(?: (\d{1,2}:\d{2}))?$/);
  if (!m) throw new Error('unreadable due token ' + token);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (m[1]) d.setDate(d.getDate() + Number(m[1]));
  else {
    const target = DOW[m[3]];
    let add = (target - d.getDay() + 7) % 7 || 7;
    if (m[2]) add = (7 - d.getDay()) + target;
    d.setDate(d.getDate() + add);
  }
  const clock = m[4] ? m[4].replace(/^(\d):/, '0$1:') : '';
  return { date: ymd(d), clock: clock };
}

// The card and the written bodies show the day as "עד 6 בנוב׳", "Nov 6" or an ISO date. All of them are the same day.
function dayShown(bag, iso) {
  if (bag.indexOf(iso) >= 0) return true;
  const [y, mo, da] = iso.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  const forms = [];
  ['en-US', 'he-IL'].forEach((loc) => ['short', 'long'].forEach((len) => {
    const month = new Intl.DateTimeFormat(loc, { month: len }).format(d);
    forms.push(da + ' ' + month, month + ' ' + da, da + ' ב' + month, 'ב' + month + ' ' + da);
  }));
  const low = bag.toLowerCase();
  return forms.some((f) => low.indexOf(f.toLowerCase()) >= 0);
}

function at(now, day, time) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, Number(time.split(':')[0]), Number(time.split(':')[1]));
  return d;
}
function addr(s) { const m = String(s).match(/<([^>]+)>/); return (m ? m[1] : s).trim().toLowerCase(); }
function nameOf(s) { const m = String(s).match(/^([^<]+)</); return m ? m[1].trim() : ''; }

// The set's why words are the product's own reasons under another name. Each word lists the reason strings that
// mean the same thing: Gmail logs "scan skip: <reason>", Outlook paints data-glance-why="page:<reason>"/"quiet:<reason>".
// A reason that means something else (hedge for resolution, no-chip-candidate for automated) is not accepted.
const WHY_SAME = {
  'no-ask': ['no-ask', 'no-chip-candidate', 'intent-null', 'short-text', 'too-short'],
  'short-text': ['short-text', 'too-short'],
  automated: ['automated', 'noise'],
  audience: ['audience', 'names-pending'],
  hedge: ['hedge'],
  resolution: ['resolution'],
  'past-date': ['past-date'],
  'no-incoming-message': ['no-incoming-message', 'note-to-self']
};
function whyMatches(want, seen) {
  return (WHY_SAME[want] || [want]).some((w) => seen.indexOf(w) >= 0);
}

function actionOfSteps(ids) {
  const has = (re) => ids.some((i) => re.test(i));
  if (has(/^calendar/)) return 'Hold It';
  if (has(/^draft/)) return 'Reply & Track';
  if (has(/^(file|attachmentSave)/)) return 'File it';
  if (has(/^(task|outlookTask)/)) return 'Log It';
  return 'unknown:' + ids.join(',');
}

function processLabel(c, action) {
  if (c.ui !== 'he') return action;
  const loc = DISPLAY.localizeHeading ? DISPLAY.localizeHeading('he', action) : action;
  return loc;
}

const GOOGLE_SCOPE = { tasks: 'https://www.googleapis.com/auth/tasks', calendar: 'https://www.googleapis.com/auth/calendar.events', 'drive.file': 'https://www.googleapis.com/auth/drive.file' };

async function openCase(glance, c, now) {
  const own = c.me;
  const messages = c.thread.map((t, i) => ({ t, i, id: (c.surface === 'gmail' ? 'gm-' : 'AQMkG100') + c.id.replace(/\W/g, '') + '-' + i }));
  const openIx = c.open < 0 ? c.thread.length + c.open : c.open;
  await glance.seed({ glanceUiLanguage: c.ui });
  if (c.surface === 'gmail') {
    const scopes = ['openid', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']
      .concat(c.grants.map((g) => GOOGLE_SCOPE[g]).filter(Boolean));
    await glance.seedGmail({
      glanceDebug: true,
      googleConnectedAccount: { email: own, at: Date.now(), source: 'web' },
      googleGrantedScopes: { version: scopes.sort().join('\n'), status: 'granted', source: 'chrome', at: Date.now() }
    });
    await glance.evaluateWorker((email) => { globalThis.__glanceE2e.tokenAccounts = { 'ya29.e2e': email }; }, own);
    const thread = messages.map(({ t, id }) => ({
      messageId: id, senderEmail: addr(t.from), senderName: nameOf(t.from) || addr(t.from), to: t.to, cc: t.cc,
      body: t.body, attachments: (t.attachments || []).map((a) => ({ name: a.name, mimeType: a.mime }))
    }));
    return glance.openGmail({ messageId: messages[openIx].id, threadId: 'th-' + c.id, subject: c.thread[openIx].subject, ownEmail: own, thread: thread, lang: c.ui });
  }
  await glance.seedOutlook({}, { tasks: c.grants.includes('Tasks'), files: c.grants.includes('Files'), calendar: c.grants.includes('Calendars') });
  const conv = 'conv-G100-' + c.id;
  const rows = messages.map(({ t, id }) => ({
    id: id, conversationId: conv, subject: t.subject,
    receivedDateTime: at(now, t.day, t.time).toISOString(),
    from: { emailAddress: { address: addr(t.from), name: nameOf(t.from) } },
    sender: { emailAddress: { address: addr(t.from), name: nameOf(t.from) } },
    toRecipients: t.to.map((a) => ({ emailAddress: { address: addr(a) } })),
    ccRecipients: t.cc.map((a) => ({ emailAddress: { address: addr(a) } })),
    body: { contentType: 'text', content: t.body }, bodyPreview: t.body.slice(0, 255),
    hasAttachments: (t.attachments || []).length > 0
  }));
  const attachments = {};
  messages.forEach(({ t, id }) => {
    if ((t.attachments || []).length) attachments[id] = t.attachments.map((a, k) => ({ id: id + '-a' + k, name: a.name, contentType: a.mime, size: 2048, '@odata.type': '#microsoft.graph.fileAttachment' }));
  });
  const messagesById = {};
  rows.forEach((r) => { messagesById[r.id] = r; });
  await glance.setScenario({ messages: messagesById, conversation: rows, attachments: attachments });
  const t = c.thread[openIx];
  return glance.openOutlook({
    lang: c.ui, id: messages[openIx].id, convId: conv, subject: t.subject, senderEmail: addr(t.from), senderName: nameOf(t.from),
    to: t.to.map(addr), cc: t.cc.map(addr), body: t.body, receivedDateTime: at(now, t.day, t.time).toISOString(),
    attachments: (t.attachments || []).map((a, k) => ({ name: a.name, size: 2048 }))
  });
}

test.describe('gate100', () => {
  test.beforeAll(() => { if (!CLOCK_ISO) throw new Error('gate100 needs GLANCE_E2E_CLOCK_ISO (see playwright.gate100.config.js)'); });
  const now = new Date(CLOCK_ISO);
  for (const c of CASES) {
    if (ONLY && !ONLY.test(c.id)) continue;
    test(c.id + ' ' + (c.covers || ''), async ({ glance }) => {
      test.setTimeout(60000);
      const logs = [];
      const page = await openCase(glance, c, now);
      page.on('console', (m) => logs.push(m.text()));
      const host = c.surface === 'gmail' ? 'div[role="main"]' : '#ReadingPaneContainerId';
      const card = page.locator(host + ' .flow-chip-host');
      const why = page.locator(host + ' .flow-why-not, ' + host + ' .flow-why-quiet');
      const e = c.expect;
      // A case ends in a card or a visible reason. Neither within the window is a failure of its own.
      const settled = await expect.poll(async () => {
        if (await card.count()) return 'card';
        if (await why.count()) return 'why';
        if (c.surface === 'gmail' && logs.some((l) => /scan skip: /.test(l) && !/chip-present/.test(l))) return 'why';
        return 'wait';
      }, { timeout: 25000, intervals: [300, 500, 1000] }).not.toBe('wait').then(() => true, () => false);
      const hasCard = (await card.count()) > 0;
      const skipLog = logs.filter((l) => /scan skip: /.test(l)).join(' | ');
      const whyAttr = await page.evaluate((sel) => { const n = document.querySelector(sel); return n ? n.getAttribute('data-glance-why') : null; }, host + ' .flow-why-not');
      const state = { id: c.id, settled, hasCard, whyAttr, skipLog };
      expect(hasCard, 'card yes/no ' + JSON.stringify(state)).toBe(e.card);
      if (!e.card) {
        expect(settled, 'a case without a card shows a reason ' + JSON.stringify(state)).toBe(true);
        if (e.why) expect(whyMatches(e.why, String(whyAttr || '') + ' ' + skipLog), 'why ' + e.why + ' ' + JSON.stringify(state)).toBe(true);
        return;
      }
      const textOf = (sel) => page.evaluate((q) => { const n = document.querySelector(q); return n ? (n.innerText || n.textContent || '') : ''; }, sel);
      const cardText = await textOf(host + ' .flow-chip-host');
      if (process.env.GATE100_HTML) console.log('HTML ' + c.id + ' ' + (await page.evaluate((q) => { const n = document.querySelector(q); return n ? n.outerHTML : ''; }, host + ' .flow-chip-host')).slice(0, 4000));
      if (e.action === 'consent:todo') {
        await expect(page.locator(host + ' [data-glance-consent="todo"], ' + host + ' [data-glance-consent]').first(), 'consent card').toBeVisible();
      } else {
        // The card's heading is the intent's own sentence ("שריין ג׳ 11:00", "אישור נדרש"), so the action is read
        // from the steps it will perform: calendar = Hold It, draft + task = Reply & Track, task alone = Log It,
        // a file step = File it.
        const ids = await page.evaluate((q) => Array.from(document.querySelectorAll(q + ' li.act[data-step-id]')).map((n) => n.getAttribute('data-step-id')), host + ' .flow-chip-host');
        const got = actionOfSteps(ids);
        const loose = e.action === "Answer with Dana's address" || e.action === 'Accept the invitation';
        if (!loose) expect(got, 'action ' + JSON.stringify({ ids, state })).toBe(e.action === 'Save the file?' ? 'File it' : e.action);
        else expect(ids.length, 'a card with steps ' + e.action).toBeGreaterThan(0);
      }
      // Writes: press Do It once and read what was sent. Never a send; a draft is a draft.
      const needsWrite = e.title_contains || e.due || c.receipt_excludes;
      let sent = '';
      let after = cardText;
      if (needsWrite && e.action !== 'consent:todo') {
        const clicked = await page.evaluate((q) => { const b = document.querySelector(q); if (b) b.click(); return !!b; }, host + ' .flow-chip-host button.flow-chip');
        if (clicked) {
          await page.waitForTimeout(2500);
          after = await textOf(host + ' .flow-chip-host');
        }
      }
      const calls = await glance.apiCalls();
      sent = calls.filter((x) => x.method !== 'GET').map((x) => x.body || '').join('\n');
      const bag = [cardText, after, sent].join('\n');
      if (process.env.GATE100_DEBUG) console.log('DEBUG ' + c.id + ' ' + JSON.stringify({ cardText, after, sent, calls: calls.map((x) => x.method + ' ' + x.url) }).slice(0, 3000));
      if (e.title_contains) expect(bag.toLowerCase(), 'title_contains ' + e.title_contains).toContain(String(e.title_contains).toLowerCase());
      if (e.due) {
        const due = dueFrom(e.due, now);
        expect(dayShown(bag, due.date), 'due ' + e.due + ' → ' + due.date + ' in ' + bag.slice(0, 600)).toBe(true);
        if (due.clock) expect(bag, 'due clock ' + due.clock).toContain(due.clock);
      }
      (c.receipt_excludes || []).forEach((bad) => expect(after, 'receipt must not say ' + bad).not.toContain(bad));
    });
  }
});
