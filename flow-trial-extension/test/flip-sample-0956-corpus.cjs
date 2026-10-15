// Human-labeled silent→offer flips vs 43c83f1. Judge at 2026-10-05T09:00:00Z
// with the row's surface, direction, and addressee. A wrong Do It stays quiet
// or becomes the one right offer. A correct one stays offered.
// Named regressions: v2syn-16558, v2syn-14842, v2syn-6405, v2syn-16594, v2syn-8062.
// Run: node test/flip-sample-0956-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const X = vm.runInContext('FlowExtract', engine);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const NOW = new Date('2026-10-05T09:00:00Z');
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];

function judge(row) {
  const surface = row.surface || 'outlook';
  const own = OWN[surface];
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: row.from || { name: 'Dana Levi', email: 'dana@acme.io' },
    now: NOW,
    surface: surface,
    attachmentCount: row.attachmentCount || 0,
    to: row.to || [own],
    cc: row.cc || [],
    ownAddresses: [own],
    userName: 'Sali',
    ownNames: NAMES,
    direction: row.direction || 'inbound',
    inbound: (row.direction || 'inbound') === 'inbound',
    threadUrl: 'https://example.invalid/t'
  });
}
function kinds(out) {
  return ((out && out.process && out.process.steps) || []).map((s) => s.kind);
}
function draftKind(k) { return k === 'gmailDraft' || k === 'outlookDraft'; }
function taskKind(k) { return k === 'googleTask' || k === 'googleTasks' || k === 'outlookTask'; }

const QUIET = 'quiet';
const HOLD = 'hold';
const TASK = 'task';
const OFFER = 'offer';
const FILE = 'file';

const ROWS = [
  { id: 'v2syn-14731', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Michael Ross', email: 'michael@northwind.com' }, to: ['noa@northwind.com', OWN.outlook], subject: 'Meeting request',
    body: "Dear Noa,\nLet's sync Thursday at 14:30 about onboarding\nBest,\nMichael" },
  { id: 'v2syn-23180', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'הילה שמש', email: 'hila@acme.co.il' }, to: ['colleague4@acme.co.il', OWN.outlook], subject: 'שיחת זום',
    body: 'שלום רב,\nעומר, נוכל לעשות שיחה קצרה ביום ראשון ב-11:15?\nיום נעים,\nהילה' },
  { id: 'v2syn-14842', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [OWN.outlook], subject: 'Reminder',
    body: "I'll send the tax form over tomorrow at 9am.\nThank you,\nDana" },
  { id: 'v2syn-16558', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Ethan Hunt', email: 'ethan@initech.com' }, to: [OWN.outlook], subject: 'RE: Change of plans',
    body: 'Good morning,\nWe need to postpone the review meeting on Wednesday at 11:15.\nThanks,\nEthan' },
  { id: 'v2syn-6405', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Billing', email: 'billing@initech.com' }, to: ['colleague@acme.io', OWN.outlook], subject: 'Re: the budget',
    body: 'Michael, can you schedule the review meeting with Acme on next Monday at 9am?' },
  { id: 'v2syn-2047', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Rachel Green', email: 'rachel@umbrella.io' }, to: [OWN.outlook], subject: 'Re: onboarding',
    body: 'Hi, I will send the W-9 Monday at 16:00. Cheers' },
  { id: 'v2syn-1638', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Tom Baker', email: 'tom@hooli.xyz' }, to: ['lior@hooli.xyz', OWN.outlook], subject: 'check-in October 19',
    body: 'Lior,\nHope you are well.\nCan we meet Tuesday at 11:15 to go over the migration?\nRegards,\nTom' },
  { id: 'v2syn-16594', expect: QUIET, surface: 'outlook', direction: 'self', attachmentCount: 0,
    from: { name: 'Sali Sapan', email: OWN.outlook }, to: [OWN.outlook], subject: 'Re: Re: Change of plans',
    body: 'We need to postpone the check-in on Thursday at 2pm.\nThanks!\nSali' },
  { id: 'v2rtest-outlook-calendar-corpus-1384', expect: HOLD, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [OWN.outlook], subject: '',
    body: 'Can we meet tomorrow at 10:00' },
  { id: 'v2syn-14487', expect: HOLD, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Michael Ross', email: 'michael@northwind.com' }, to: [OWN.outlook], subject: "Re: Let's meet",
    body: 'Hey,\nQuick one:\nCan we meet Sunday at 14:30?\nRegards,\nMichael' },
  { id: 'v2syn-8062', expect: TASK, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'נועה פרץ', email: 'noa@monday-partner.co.il' }, to: [OWN.gmail], subject: 'השב: תזכורת',
    body: 'תזכיר לי להתקשר לרו״ח עד 20/10.\nבתודה,\nנועה' },
  { id: 'v2syn-8070', expect: TASK, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'נועה פרץ', email: 'noa@monday-partner.co.il' }, to: [OWN.outlook], subject: 'הועבר: משימה',
    body: 'סאלי, תזכיר לי לשלם את חשבון החשמל עד 20/10. בברכה' },
  { id: 'v2syn-19791', expect: OFFER, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: [OWN.gmail], subject: 'החוזה החתום',
    body: 'היי לכולם,\nאשמח אם תוכל לבדוק את תעודת ההתאגדות עד 20/10?\nיום נעים,\nיוסי' },
  { id: 'v2syn-7341', expect: OFFER, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'נועה פרץ', email: 'noa@monday-partner.co.il' }, to: [OWN.outlook], subject: 'תזכורת תשלום',
    body: 'סאלי, תזכורת: תשלום של ₪3,400 עד 20/10. נא לטפל.\nתודה רבה,\nנועה' },
  { id: 'v2syn-18768', expect: OFFER, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'אבי בירנבאום', email: 'avi@cyber.co.il' }, to: [OWN.gmail], subject: 'הועבר: בהמשך לקליטת העובד',
    body: 'שלום רב, נא לחתום ולהחזיר את גיליון התמחור עד 20/10 בברכה' },
  { id: 'v2syn-22035', expect: OFFER, surface: 'gmail', direction: 'inbound', attachmentCount: 1,
    from: { name: 'אבי בירנבאום', email: 'avi@cyber.co.il' }, to: [OWN.gmail], subject: 'חשבונית $2,000',
    body: 'סאלי, תוכל לסגור את היתרה של $500 עד 20/10?' },
  { id: 'v2syn-19914', expect: OFFER, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: [OWN.gmail], subject: 'RE: דוח ההוצאות',
    body: 'אשמח אם תוכלי להכין את תעודת ההתאגדות עד 20/10?' },
  { id: 'v2syn-7563', expect: OFFER, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: [OWN.gmail], subject: 'תגובה: סיכום',
    body: 'היי לכולם,\nכמו שדיברנו, את אמורה להתקשר לרו״ח עד 20/10.\nבתודה,\nיוסי' },
  { id: 'v2syn-8736', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 2,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: [OWN.outlook], cc: ['colleague4@initech.co.il'], subject: 'קובץ',
    body: 'סאלי, מצורף תעודת ההתאגדות. נא לשמור אותו ב-Google Drive עד 20/10. בתודה' },
  { id: 'v2syn-8743', expect: QUIET, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'אבי בירנבאום', email: 'avi@cyber.co.il' }, to: [OWN.gmail], subject: 'המצגת מצורף',
    body: 'הי סאלי,\nמצורף ה-PO. נא לשמור אותו ב-Google Drive עד 20/10.\nתודה רבה,\nאבי' },
  // v2syn-6393 and v2syn-14708 are not in this tree. The bodies below are
  // synthesized from the parity report: a hold or ask addressed to someone
  // else after the opening line. The AI Engineer should check them against
  // the real rows on the box.
  { id: 'v2syn-6393', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [OWN.outlook], subject: 'Thursday',
    body: "Hi,\nFollowing the thread.\nNoa, can we meet Thursday at 14:30?\nThanks,\nDana" },
  { id: 'v2syn-14708', expect: QUIET, surface: 'outlook', direction: 'inbound', attachmentCount: 0,
    from: { name: 'הילה שמש', email: 'hila@acme.co.il' }, to: [OWN.outlook], subject: 'שיחת זום',
    body: 'היי,\nבהמשך לשרשור.\nעומר, נוכל לעשות שיחה קצרה ביום ראשון ב-11:15?\nיום נעים,\nהילה' },
  { id: 'v2syn-8733', expect: FILE, surface: 'outlook', direction: 'inbound', attachmentCount: 1,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: [OWN.outlook], subject: 'השב: הצעת המחיר מצורף',
    body: 'בוקר טוב, מצורף גיליון התמחור. נא לשמור אותו ל-Drive עד 20/10. המשך יום טוב' },
  { id: 'v2syn-7321', expect: QUIET, surface: 'gmail', direction: 'outbound', attachmentCount: 0,
    from: { name: 'Sali Sapan', email: OWN.gmail }, to: ['sarah@northwind.co.il'], subject: 'חשבונית ₪450',
    body: 'נא להסדיר את היתרה של ₪450 עד 20/10. תודה רבה' },
  { id: 'v2syn-22027', expect: QUIET, surface: 'gmail', direction: 'inbound', attachmentCount: 0,
    from: { name: 'יוסי אברהם', email: 'yossi@initech.co.il' }, to: ['colleague4@initech.co.il', OWN.gmail], subject: 'Re: חשבונית ₪500',
    body: 'בוקר טוב שירן,\nתוכל לסגור את היתרה של ₪15,000 עד 20/10?\nתודה רבה,\nיוסי' }
];

function summarise(out) {
  return {
    show: out && out.show, reason: out && out.reason,
    type: out && out.intent && out.intent.type,
    close: out && out.intent && out.intent.personalClose,
    explicit: out && out.intent && out.intent.explicitHold,
    noReply: out && out.intent && out.intent.noReplyDraft,
    id: out && out.process && out.process.id,
    kinds: kinds(out),
    date: out && out.intent && out.intent.entities && out.intent.entities.dateIso
  };
}

console.log('\n--- labeled flips ---\n');
let wrong = 0;
for (const row of ROWS) {
  const out = judge(row);
  const k = kinds(out);
  let ok = false;
  if (row.expect === QUIET) {
    ok = out.show !== true && !k.some(draftKind);
  } else if (row.expect === HOLD) {
    ok = out.show === true && out.intent && out.intent.personalClose === 'calendar-hold' && out.intent.explicitHold === true &&
      out.process && out.process.id === 'hold' && k.indexOf('calendar') !== -1 && !k.some(draftKind);
  } else if (row.expect === TASK) {
    ok = out.show === true && out.intent && out.intent.noReplyDraft === true && out.intent.entities && out.intent.entities.dateIso === '2026-10-20' &&
      out.process && out.process.id === 'log-it' && k.length > 0 && k.every(taskKind);
  } else if (row.expect === FILE) {
    ok = out.show === true && out.intent && out.intent.personalClose === 'drive-file' &&
      out.process && out.process.id === 'file-it' &&
      k.some((kind) => kind === 'driveFile' || kind === 'onedriveFile');
  } else {
    ok = out.show === true && out.intent && out.intent.entities && out.intent.entities.dateIso === '2026-10-20' && !k.some((kind) => kind === 'calendar');
  }
  if (!ok) wrong++;
  check(row.id + ' ' + row.expect, ok, summarise(out));
}
check('0 wrong Do Its in the ' + ROWS.length, wrong === 0, wrong);

console.log('\n--- slash context, day first ---\n');
function iso(text) {
  const d = X.parseDate(text, NOW);
  return d && d.iso;
}
check('עד 20/10 is 20 October', iso('נא לטפל עד 20/10') === '2026-10-20', iso('נא לטפל עד 20/10'));
check('by Friday 23/10 keeps the slash day', iso('please remember to renew your gym membership by Friday 23/10') === '2026-10-23', iso('please remember to renew your gym membership by Friday 23/10'));
check('a meeting slash is the day', iso('פגישה 18/10 11:00 רוטשילד 12') === '2026-10-18', iso('פגישה 18/10 11:00 רוטשילד 12'));
check('a slash alone is not a date', !iso('see 20/10 in the file'), iso('see 20/10 in the file'));
check('an invoice slash is not a date', !iso('invoice 20/10 is attached'), iso('invoice 20/10 is attached'));
check('a version slash is not a date', !iso('shipped in v2/10 of the build'), iso('shipped in v2/10 of the build'));
check('a past slash is not a date', !iso('עד 20/10/2024'), iso('עד 20/10/2024'));
check('5/6 stays unresolved', !iso('the ref is 5/6 today'), iso('the ref is 5/6 today'));

console.log('\n--- recall mails still caught ---\n');
const gym = judge({
  surface: 'outlook', direction: 'inbound', attachmentCount: 0,
  from: { name: 'Dana Cohen', email: 'dana.cohen@gmail.com' }, to: [OWN.outlook],
  subject: 'Renew gym membership by Friday',
  body: 'please remember to renew your gym membership by Friday 23/10'
});
check('gym renew is a To Do due 23/10',
  gym.show === true && gym.intent && gym.intent.noReplyDraft === true && gym.intent.entities && gym.intent.entities.dateIso === '2026-10-23' &&
    gym.process && gym.process.id === 'log-it' && kinds(gym).every(taskKind),
  summarise(gym));
const hold = judge({
  surface: 'outlook', direction: 'inbound', attachmentCount: 0,
  from: { name: 'Dana Cohen', email: 'dana.cohen@gmail.com' }, to: [OWN.outlook],
  subject: 'פגישה 18/10 11:00 רוטשילד 12',
  body: 'תשמור לי את הזמן'
});
check('Hebrew hold is a Hold at 18/10 11:00',
  hold.show === true && hold.intent && hold.intent.personalClose === 'calendar-hold' && hold.intent.explicitHold === true &&
    hold.intent.entities && hold.intent.entities.dateIso === '2026-10-18' && hold.intent.entities.hour === 11 && hold.intent.entities.minute === 0 &&
    hold.process && hold.process.id === 'hold',
  summarise(hold));

console.log('\n--- a newsletter that says remember stays quiet ---\n');
const news = judge({
  surface: 'gmail', direction: 'inbound', attachmentCount: 0,
  from: { name: 'Promo Team', email: 'news@promo-mail.com' }, to: [OWN.gmail],
  subject: 'Newsletter',
  body: 'Unsubscribe from this newsletter. תזכיר לי להתקשר עד 20/10. View in browser.'
});
check('newsletter remember stays quiet', news.show !== true, summarise(news));

console.log('\nFAILURES: ' + failures);
process.exit(failures ? 1 : 0);
