'use strict';
// Card task/hold titles: mail language, no signature bleed, non-empty meaningful titles.
// Run: node test/card-titles-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const addon = path.join(__dirname, '..');
const sandbox = { console, Buffer, Intl };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'BuildSha.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'src', 'intent.js'), 'utf8'), sandbox, { filename: 'intent.js' });
sandbox.Glance = { intent: sandbox.GlanceIntent };
const resolveTask = sandbox.Glance.intent.resolveTask;
const NOW = new Date('2026-10-15T12:00:00Z');
const READER = 'salisapan1@gmail.com';
const ctxBase = {
  now: NOW,
  timeZone: 'Etc/UTC',
  readerEmail: READER,
  userName: 'Salisapan1',
  ownNames: ['Salisapan1', 'Sali'],
  toRecipients: [{ name: '', email: READER, localPart: 'salisapan1' }],
  ccRecipients: [],
  engine: function (text) {
    const j = sandbox.FlowIncomingJudge.judge({
      text,
      subject: '',
      sender: { email: 'dana@meridian.com', name: 'Dana Levi' },
      to: [READER],
      ownAddresses: [READER],
      userName: 'Salisapan1',
      ownNames: ['Salisapan1', 'Sali'],
      readerEmail: READER,
      namesWaitDone: true,
      now: NOW,
      surface: 'gmail',
      inbound: true
    }, {});
    if (!j || !j.show) return { intent: j && j.intent, plan: null, reason: j && j.reason };
    return { intent: j.intent, plan: j.process };
  }
};

function hebrewMail(text) {
  const he = (String(text).match(/[\u0590-\u05FF]/g) || []).length;
  const en = (String(text).match(/[A-Za-z]/g) || []).length;
  return he > 0 && he >= en;
}

const ROWS = [
  ['en-doc', 'Hi Sali, could you send the signed document by Friday?', true],
  ['en-inv', 'Hi Sali, could you send the invoice for October?', true],
  ['en-meet', 'Hi Sali, could we meet Thursday at 3pm?', true],
  ['en-rem', 'Hi Sali, please remember to call the client.', true],
  ['en-reply-deadline', 'Hi Sali, could you send the signed document by Friday?\n\nThanks,\nDana', true],
  ['en-hold', 'Could we meet Thursday at 3pm?', true],
  ['en-sheet-quiet', 'Can you record the payment in the payments sheet?', false],
  ['en-balance-doc', 'Hi Sali, could you send the invoice for October?', true],
  ['en-sig-strip', 'Hi Sali, could you send the invoice for October?\n\nBest regards,\nDana Levi', true],
  ['en-meaningful', 'Hi Sali, could you confirm the wire arrived by Monday?', true],
  ['he-doc', 'היי סאלי, תוכל לשלוח את המסמך החתום?', true],
  ['he-inv', 'היי סאלי, תוכל לשלוח את החשבונית?', true],
  ['he-meet', 'היי סאלי, נוכל להיפגש ביום חמישי בשעה 15:00?', true],
  ['he-rem', 'היי סאלי, תזכיר לי לשלוח את החוזה מחר.', true],
  ['he-reply-deadline', 'היי סאלי, תוכל לשלוח את המסמך החתום?\n\nתודה,\nדנה', true],
  ['he-hold', 'נוכל להיפגש ביום חמישי בשעה 15:00?', true],
  ['he-sheet', 'תוכל לרשום את התשלום בגיליון התשלומים?', false],
  ['he-sig', 'היי סאלי, תוכל לשלוח את החשבונית?\n\nבברכה,\nדנה לוי', true],
  ['he-meaningful', 'היי סאלי, תוכל לשלוח את החשבונית?', true],
  ['he-no-en-title', 'תשלח את הדוח עד יום חמישי.', true],
  ['he-pay-remember', 'תזכור להעביר את התשלום עד יום ראשון.', true],
  ['en-reply-track-deadline', 'Hi Sali, please confirm the wire arrived by Monday, October 20.', true],
  ['en-reply-track-nodeadline', 'Hi Sali, could you send the invoice for October?', true],
  ['he-reply-track-deadline', 'היי סאלי, תוכל לשלוח את המסמך החתום עד 23/10?', true],
  ['he-reply-track-nodeadline', 'היי סאלי, תוכל לשלוח את החשבונית?', true],
  ['en-pay-invoice-amount', 'Please pay the invoice of ₪3,200 by Thursday.', true],
  ['he-pay-invoice-thursday', 'נא לשלם את החשבונית של ₪3,200 עד יום חמישי.', true],
  ['he-send-report-notify', 'בבקשה תשלח את הדוח עד יום חמישי ואל תשכח להגיד לנו כשזה מוכן.', true],
  ['he-greet-noa', 'היי נועה', false]
];

for (const row of ROWS) {
  const id = row[0];
  const body = row[1];
  const expectSpeak = row[2];
  const ctx = Object.assign({}, ctxBase);
  if (id === 'he-greet-noa') {
    ctx.readerEmail = 'noa@meridian.com';
    ctx.userName = 'Noa Cohen';
    ctx.ownNames = ['Noa', 'Noa Cohen'];
    ctx.toRecipients = [{ name: 'Noa Cohen', email: 'noa@meridian.com', localPart: 'noa' }];
  }
  const decision = resolveTask(body, ctx);
  const he = hebrewMail(body);
  check(id + ' speak', decision.speak === expectSpeak, { speak: decision.speak, reason: decision.reason });
  if (!expectSpeak || !decision.speak) continue;
  const title = String(decision.title || '');
  check(id + ' non-empty title', title.length >= 3, title);
  check(id + ' not Handle this note', !/^handle this note$/i.test(title) && title !== 'לטפל בהערה', title);
  if (he) {
    check(id + ' Hebrew title has no Reply requested', !/reply requested/i.test(title), title);
    check(id + ' Hebrew title has Hebrew letters', /[\u0590-\u05FF]/.test(title), title);
  } else {
    check(id + ' English title has no Hebrew', !/[\u0590-\u05FF]/.test(title), title);
  }
  check(id + ' title not signature name only', !/^dana levi$/i.test(title.trim()) && title !== 'דנה לוי', title);
  if (id === 'en-reply-track-deadline') {
    check(id + ' Reply by', /^Reply by \d{1,2}\/\d{1,2}$/.test(title), title);
  }
  if (id === 'en-reply-track-nodeadline') {
    check(id + ' Reply requested', title === 'Reply requested', title);
  }
  if (id === 'he-reply-track-deadline') {
    check(id + ' להשיב עד', /^להשיב עד \d{1,2}\/\d{1,2}$/.test(title), title);
  }
  if (id === 'he-reply-track-nodeadline') {
    check(id + ' נדרשת תשובה', title === 'נדרשת תשובה', title);
  }
  if (id === 'he-pay-remember') {
    check(id + ' no English by leak', !/\sby\s/i.test(title), title);
    check(id + ' Hebrew date suffix', /\d{1,2}\/\d{1,2}/.test(title) || /יום\s+[\u0590-\u05FF]+/.test(title), title);
  }
  if (id === 'en-pay-invoice-amount') {
    check(id + ' Pay invoice with amount', /^Pay invoice,\s*₪3,200$/.test(title), title);
  }
  if (id === 'he-pay-invoice-thursday') {
    check(id + ' Hebrew pay invoice title', title === 'לשלם חשבונית, ₪3,200', title);
  }
  if (id === 'he-send-report-notify') {
    check(id + ' Hebrew send report title', /^תשלח את הדוח עד \d{1,2}\/\d{1,2}$/.test(title), title);
  }
  if (id === 'he-greet-noa') {
    check(id + ' quiet greeting', decision.speak === false && (decision.reason === 'hedge' || String(decision.reason || '').indexOf('hedge') >= 0), decision.reason);
  }
}

console.log('\nFAILURES: ' + failures);
process.exit(failures ? 1 : 0);
