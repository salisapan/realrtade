// Calendar hold built from facts the chip already has.
//
// Do It still writes the connected destination. The same click also opens
// Google's public event template — no Calendar API, no OAuth, no new
// permission. The user saves or discards the event on Google's page.
//
// Run: node test/calendar-hold.cjs
//
// Manual check (needs a loaded extension and a Gmail account; this file
// cannot do that part):
// 1. Load unpacked flow-trial-extension/. Connect a destination. Save & start.
// 2. Open a decided email that states an amount and a date. The Hebrew lead
//    mentions a calendar draft (טיוטת אירוע). The button still says Do It.
// 3. Click Do It. The destination record is created. A tab opens to
//    https://calendar.google.com/calendar/render?action=TEMPLATE with the
//    amount, the email's day at 10:00-10:45, the quote, and the Gmail link.
//    The event is not on the calendar until you press Save there.
// 4. The chip receipt says the destination was written, and that the hold
//    was only opened / is ready — you still save it. View opens the
//    destination. Calendar draft reopens the template. Undo removes only
//    the destination record.
// 5. On a decided email with no extracted date, the template day is the
//    next weekday (Monday–Friday, strictly after today), 10:00-10:45, and
//    the details say no date was extracted.
// 6. manifest.json gains no calendar host permission and no OAuth scope.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const sandbox = { module: undefined, console, URL, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'calendarHold.js'), 'utf8'), sandbox, { filename: 'calendarHold.js' });
const FlowCalendarHold = vm.runInContext('FlowCalendarHold', sandbox);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.error('  FAIL ' + name);
    console.error('       ' + (err && err.stack || err));
  }
}

function local(y, m, d, h) {
  return new Date(y, m - 1, d, h == null ? 12 : h, 0, 0, 0);
}

function built(input) {
  const hold = FlowCalendarHold.build(input);
  const url = new URL(hold.url);
  return { hold, url, dates: url.searchParams.get('dates'), details: url.searchParams.get('details'), text: url.searchParams.get('text') };
}

function weekday(y, m, d) {
  return local(y, m, d).getDay();
}

// 2026-09-04 is a Friday in every timezone when constructed as a local date.
assert.strictEqual(weekday(2026, 9, 4), 5, 'fixture Friday');
assert.strictEqual(weekday(2026, 9, 5), 6, 'fixture Saturday');
assert.strictEqual(weekday(2026, 9, 6), 0, 'fixture Sunday');
assert.strictEqual(weekday(2026, 9, 7), 1, 'fixture Monday');

const LEASE = {
  now: local(2026, 9, 6),
  subject: 'Re: Office Lease — Meridian Tower',
  senderName: 'Dana Cole',
  senderEmail: 'dana@meridian.com',
  threadUrl: 'https://mail.google.com/mail/u/0/#all/18f2abc',
  facts: {
    moneyText: '$3,900',
    dateText: 'Sep 7',
    date: { raw: 'Sep 7', iso: '2026-09-07' },
    quote: 'We\'re good at $3,900/mo for the 14th floor, signing Monday.'
  }
};

check('template url shape', () => {
  const { url, hold } = built(LEASE);
  assert.strictEqual(url.protocol, 'https:');
  assert.strictEqual(url.hostname, 'calendar.google.com');
  assert.strictEqual(url.pathname, '/calendar/render');
  assert.strictEqual(url.searchParams.get('action'), 'TEMPLATE');
  assert.strictEqual(url.username, '');
  assert.strictEqual(url.password, '');
  assert.strictEqual(FlowCalendarHold.isTemplateUrl(hold.url), true);
  assert.strictEqual(hold.durationMinutes, 45);
  assert.ok(hold.durationMinutes >= 30 && hold.durationMinutes <= 60);
});

check('extracted day keeps a literal slash and a 45-minute morning hold', () => {
  const { hold, dates, details } = built(LEASE);
  assert.strictEqual(dates, '20260907T100000/20260907T104500');
  assert.ok(hold.url.includes('dates=20260907T100000/20260907T104500'), 'slash must stay unencoded');
  assert.ok(!/dates=[^&]*Z/.test(hold.url), 'floating local time, not UTC');
  assert.strictEqual(new URL(hold.url).searchParams.get('ctz'), null);
  assert.strictEqual(hold.usedDefaultDay, false);
  assert.ok(details.includes('The email named a day but no clock time'));
  assert.ok(details.includes('10:00-10:45'));
});

check('title and details come from the judgment, not a Log line', () => {
  const { text, details, url } = built(LEASE);
  assert.strictEqual(text, 'Hold: $3,900, Sep 7');
  assert.ok(!/^Log\b/.test(text));
  assert.ok(details.includes('Amount: $3,900'));
  assert.ok(details.includes('Date in the email: Sep 7'));
  assert.ok(details.includes('Quote: We\'re good at $3,900/mo for the 14th floor, signing Monday.'));
  assert.ok(details.includes('Gmail: https://mail.google.com/mail/u/0/#all/18f2abc'));
  assert.ok(details.includes('From: Dana Cole <dana@meridian.com>'));
  assert.ok(details.includes('Subject: Re: Office Lease — Meridian Tower'));
  assert.ok(details.includes('Nothing is on your calendar until you press Save'));
  assert.ok(details.includes('Glance did not write this event'));
  assert.strictEqual(url.searchParams.get('add'), null, 'do not invite the sender');
  assert.ok(!/calendar api|synced|wrote to your calendar/i.test(details));
});

check('no date uses the next weekday, 45 minutes at 10:00', () => {
  const cases = [
    [local(2026, 9, 4, 23), '20260907T100000/20260907T104500'], // Friday night → Monday
    [local(2026, 9, 5), '20260907T100000/20260907T104500'], // Saturday → Monday
    [local(2026, 9, 6), '20260907T100000/20260907T104500'], // Sunday → Monday
    [local(2026, 9, 7), '20260908T100000/20260908T104500'], // Monday → Tuesday
    [local(2026, 9, 10), '20260911T100000/20260911T104500'] // Thursday → Friday
  ];
  for (const [now, dates] of cases) {
    const row = built({ now, facts: { moneyText: '$12' } });
    assert.strictEqual(row.dates, dates, String(now));
    assert.strictEqual(row.hold.usedDefaultDay, true);
    assert.ok(row.details.includes('No date was extracted'));
    assert.ok(row.details.includes('next weekday'));
  }
});

check('a named weekend day is not moved to Monday', () => {
  const row = built({
    now: local(2026, 9, 4),
    facts: { date: { iso: '2026-09-05' }, dateText: 'Sep 5' }
  });
  assert.strictEqual(row.dates, '20260905T100000/20260905T104500');
  assert.strictEqual(row.hold.usedDefaultDay, false);
});

check('a past ISO date is kept', () => {
  const row = built({
    now: local(2026, 9, 6),
    facts: { date: { iso: '2020-01-15' }, dateText: 'Jan 15 2020' }
  });
  assert.strictEqual(row.dates, '20200115T100000/20200115T104500');
});

check('ambiguous or empty dates fall through to the default day', () => {
  for (const date of [null, undefined, { raw: '3/4', iso: null }, { iso: '2026-02-31' }, { iso: '09/07/2026' }, 'Sep 7']) {
    const row = built({ now: local(2026, 9, 6), facts: { date } });
    assert.strictEqual(row.hold.usedDefaultDay, true, JSON.stringify(date));
    assert.strictEqual(row.dates, '20260907T100000/20260907T104500');
  }
});

check('null input, special characters, and non-http links', () => {
  const empty = FlowCalendarHold.build(null);
  assert.strictEqual(FlowCalendarHold.isTemplateUrl(empty.url), true);
  assert.strictEqual(new URL(empty.url).searchParams.get('text'), 'Hold');

  const messy = built({
    now: local(2026, 9, 6),
    subject: 'Re: Q&A <script>\nignore',
    senderName: 'A & B',
    senderEmail: 'a@b.co',
    threadUrl: 'javascript:alert(1)',
    facts: {
      moneyText: '$1',
      dateText: 'Sep 7',
      date: { iso: '2026-09-07' },
      quote: 'Save "now" & then <script>alert(1)</script>',
      body: 'SENTINEL_FULL_BODY_MUST_NOT_LEAK'
    }
  });
  assert.strictEqual(messy.text, 'Hold: $1, Sep 7');
  assert.ok(messy.details.includes('Save "now" & then <script>alert(1)</script>'));
  assert.ok(!messy.details.includes('SENTINEL_FULL_BODY_MUST_NOT_LEAK'));
  assert.ok(!messy.details.includes('javascript:'));
  assert.ok(messy.details.includes('Subject: Re: Q&A <script> ignore'));
  assert.ok(messy.url.toString().startsWith('https://calendar.google.com/calendar/render?'));
});

check('a huge quote cannot blow the url up', () => {
  const row = built({
    now: local(2026, 9, 6),
    facts: {
      date: { iso: '2026-09-07' },
      quote: 'x'.repeat(20000) + ' &'
    }
  });
  assert.ok(row.hold.url.length <= 7000, String(row.hold.url.length));
  assert.strictEqual(FlowCalendarHold.isTemplateUrl(row.hold.url), true);
  assert.ok(row.details.includes('Quote:'));
});

check('subject titles the hold only when amount and date text are absent', () => {
  const row = built({ now: local(2026, 9, 6), subject: 'Re: migration plan', facts: {} });
  assert.strictEqual(row.text, 'Hold: migration plan');
  assert.strictEqual(row.hold.usedDefaultDay, true);
});

check('copy does not claim a Calendar API write', () => {
  const opened = FlowCalendarHold.receiptNote(true);
  const ready = FlowCalendarHold.receiptNote(false);
  const undo = FlowCalendarHold.undoNote('Notion');
  const activity = FlowCalendarHold.activityNote(true);
  for (const line of [opened, ready, undo, activity, FlowCalendarHold.LEAD_SUFFIX]) {
    assert.ok(!/calendar api|synced|wrote to your calendar|deleted the event|removed from calendar/i.test(line), line);
  }
  assert.ok(/still save it in Google Calendar/.test(opened));
  assert.ok(/Open it and save it/.test(ready));
  assert.ok(/never saved the Calendar hold/.test(undo));
  assert.ok(/you still save it in Google Calendar/.test(activity));
  assert.ok(FlowCalendarHold.LEAD_SUFFIX.includes('טיוטת אירוע'));
  assert.strictEqual(FlowCalendarHold.activityNote(false), null);
});

check('template allowlist rejects anything that is not the public form', () => {
  const ok = FlowCalendarHold.build(LEASE).url;
  const bad = [
    'https://evil.example/calendar/render?action=TEMPLATE',
    'https://calendar.google.com.evil.example/calendar/render?action=TEMPLATE',
    'https://calendar.google.com/calendar/render?action=EDIT',
    'https://calendar.google.com/calendar/r?action=TEMPLATE',
    'http://calendar.google.com/calendar/render?action=TEMPLATE',
    'https://user:pass@calendar.google.com/calendar/render?action=TEMPLATE',
    'javascript:alert(1)',
    'https://calendar.google.com/calendar/render/?action=TEMPLATE',
    '',
    null,
    undefined,
    ok + '#@evil' // hash is fine; still the template page
  ];
  assert.strictEqual(FlowCalendarHold.isTemplateUrl(ok), true);
  assert.strictEqual(FlowCalendarHold.isTemplateUrl(bad.pop()), true);
  for (const url of bad) assert.strictEqual(FlowCalendarHold.isTemplateUrl(url), false, String(url));
});

check('manifest does not gain a Calendar permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const hosts = manifest.host_permissions || [];
  assert.ok(!hosts.some((h) => /calendar|googleapis\.com/i.test(h)), hosts.join(','));
  assert.ok(!manifest.oauth2, 'no oauth2 block');
  const perms = JSON.stringify(manifest.permissions || []);
  assert.ok(!/calendar/i.test(perms));
  const scripts = manifest.content_scripts[0].js;
  const holdAt = scripts.indexOf('src/calendarHold.js');
  const gmailAt = scripts.indexOf('src/content-gmail.js');
  assert.ok(holdAt >= 0 && holdAt < gmailAt, scripts.join(','));
});

check('background allowlist matches the builder, and the chip opens that url', () => {
  const bg = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
  const m = bg.match(/function isCalendarTemplateUrl\(url\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'background.js must define isCalendarTemplateUrl');
  const checkUrl = vm.runInNewContext(m[0] + '\nisCalendarTemplateUrl', { URL });
  const samples = [
    FlowCalendarHold.build(LEASE).url,
    'https://calendar.google.com/calendar/render?action=TEMPLATE',
    'https://evil.example/',
    'https://calendar.google.com/calendar/v3/calendars/primary/events',
    'http://calendar.google.com/calendar/render?action=TEMPLATE'
  ];
  for (const url of samples) {
    assert.strictEqual(checkUrl(url), FlowCalendarHold.isTemplateUrl(url), String(url));
  }
  assert.ok(!/calendar\/v3|auth\/calendar|calendar\.events/i.test(bg));
  assert.ok(bg.includes("type === 'flow:open-calendar-hold'"));

  const chip = fs.readFileSync(path.join(root, 'src', 'content-gmail.js'), 'utf8');
  assert.ok(chip.includes('FlowCalendarHold.build'));
  assert.ok(chip.includes('FlowCalendarHold.LEAD_SUFFIX'));
  assert.ok(chip.includes('FlowCalendarHold.receiptNote'));
  assert.ok(chip.includes('FlowCalendarHold.undoNote'));
  assert.ok(chip.includes("type: 'flow:open-calendar-hold'"));
  assert.ok(!/calendar\/v3|identity\.getAuthToken/i.test(chip));
});

if (failed) {
  console.error('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall calendar-hold checks passed');
