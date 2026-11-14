// Every document a mail can ask for, not only a quote: type, Hebrew title,
// sections, placeholders, and the decision to create, open, or update.
// Quote HTML stays on the original path. Run: node test/document-kinds-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'google-closes.js'), 'utf8'), sandbox, { filename: 'google-closes.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'style-profile.js'), 'utf8'), sandbox, { filename: 'style-profile.js' });
globalThis.FlowGoogleCloses = sandbox.FlowGoogleCloses;
globalThis.FlowStyle = sandbox.FlowStyle;
const { FlowFullDocumentClose: F } = require('../core/full-document-close.js');
const { FlowGoogleDocs: Docs } = require('../core/google-docs.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

const flags = { [F.SWITCH]: true };

function mail(subject, body) {
  return String(subject || '') + '. ' + String(body || '');
}

function offer(subject, body, extra) {
  return F.plan(Object.assign({
    flags: flags,
    text: mail(subject, body),
    lang: 'he',
    threadId: 't-1'
  }, extra || {}));
}

const FIXTURES = [
  {
    type: 'agreement',
    subject: 'הסכם שכירות למשרד',
    body: 'שלום, נא לנסח טיוטת הסכם שכירות בין דנה כהן לבין רוני לוי. תקופה: שנה. דמי שכירות: 5,000 ש״ח לחודש.',
    title: 'הסכם — שכירות למשרד',
    has: ['דנה כהן', 'רוני לוי', 'שנה', '5,000 ש״ח לחודש'],
    sections: ['צדדים', 'נושא', 'כתובת', 'תנאים', 'תוקף', 'חתימות'],
    placeholder: 'חתימות'
  },
  {
    type: 'meeting-summary',
    subject: 'סיכום פגישה — תקציב רבעון',
    body: 'נא להכין סיכום פגישה. משתתפים: דנה כהן, רוני לוי ונועה. סוכם להתחיל ביום ראשון. משימה: נועה שולחת את המספרים.',
    title: 'סיכום פגישה — תקציב רבעון',
    has: ['דנה כהן', 'סוכם להתחיל ביום ראשון', 'נועה שולחת את המספרים'],
    sections: ['משתתפים', 'נושאים', 'החלטות', 'משימות להמשך'],
    placeholder: ''
  },
  {
    type: 'work-plan',
    subject: 'תוכנית עבודה לרבעון הראשון',
    body: 'נא להכין תוכנית עבודה. מטרה: השקת האתר. שלב א: אפיון. שלב ב: פיתוח. אחראית: נועה.',
    title: 'תוכנית עבודה — רבעון הראשון',
    has: ['השקת האתר', 'אפיון', 'פיתוח', 'נועה'],
    sections: ['מטרה', 'שלבים', 'לוח זמנים', 'אחראים'],
    placeholder: 'לוח זמנים'
  },
  {
    type: 'letter',
    subject: 'מכתב תודה ללקוח',
    body: 'נא לכתוב מכתב לדנה כהן על סיום הפרויקט.',
    title: 'מכתב — תודה ללקוח',
    has: ['דנה כהן', 'סיום הפרויקט'],
    sections: ['נמען', 'נושא', 'תוכן', 'סיום'],
    placeholder: 'סיום'
  },
  {
    type: 'report',
    subject: 'דוח חודשי מרץ',
    body: 'נא להכין דוח חודשי. ממצאים: העלייה במכירות. מסקנה: להמשיך באותה דרך.',
    title: 'דוח — חודשי מרץ',
    has: ['העלייה במכירות', 'להמשיך באותה דרך'],
    sections: ['רקע', 'ממצאים', 'מסקנות', 'המלצות'],
    placeholder: 'המלצות'
  },
  {
    type: 'proposal',
    subject: 'הצעה לשיתוף פעולה',
    body: 'נא להכין הצעה לשיתוף פעולה עם סטודיו נור. בלי מחיר.',
    title: 'הצעה — שיתוף פעולה',
    has: ['סטודיו נור'],
    sections: ['רקע', 'ההצעה', 'היקף', 'הצעד הבא'],
    placeholder: 'היקף'
  },
  {
    type: 'spec',
    subject: 'אפיון מערכת הזמנות',
    body: 'נא להכין אפיון. דרישות: התחברות, הזמנה ותשלום.',
    title: 'אפיון — מערכת הזמנות',
    has: ['התחברות', 'הזמנה', 'תשלום'],
    sections: ['מטרה', 'דרישות', 'מחוץ להיקף', 'קבלה'],
    placeholder: 'קבלה'
  },
  {
    type: 'form',
    subject: 'טופס קליטת לקוח',
    body: 'נא להכין טופס קליטת לקוח. שדות: שם, טלפון ואימייל.',
    title: 'טופס — קליטת לקוח',
    has: ['שם', 'טלפון', 'אימייל'],
    sections: ['שדות', 'הנחיות'],
    placeholder: 'הנחיות'
  },
  {
    type: 'document',
    subject: 'מסמך הנחיות למשלוח',
    body: 'נא להכין מסמך עם הנחיות למשלוח: אריזה, ביטוח וכתובת.',
    title: 'מסמך — הנחיות למשלוח',
    has: ['אריזה', 'ביטוח', 'כתובת'],
    sections: ['נושא', 'תוכן', 'הערות'],
    placeholder: 'הערות'
  }
];

FIXTURES.forEach((row) => {
  const classified = F.classifyDocument(mail(row.subject, row.body));
  check(row.type + ' classifies from the Hebrew subject and body', classified === row.type, classified);
  const p = offer(row.subject, row.body);
  const html = (p.built && p.built.html) || '';
  check(row.type + ' is offered once, preview only, nothing sent',
    p.action === 'offer' && p.mode === 'create' && p.previewOnly === true && p.closes === false && p.docType === row.type, p);
  check(row.type + ' title is ' + row.title,
    p.built && p.built.title === row.title && html.indexOf('<h1>' + row.title + '</h1>') >= 0, p.built && p.built.title);
  check(row.type + ' Hebrew card names the document',
    p.cardLine && p.cardLine.indexOf(F.DOC_TYPES[row.type].he) >= 0 && p.cardLine.indexOf('לא נשלחה') >= 0, p.cardLine);
  row.sections.forEach((label) => {
    check(row.type + ' section ' + label, html.indexOf(label + ':') >= 0, html);
  });
  row.has.forEach((bit) => {
    check(row.type + ' keeps ' + bit + ' from the mail', html.indexOf(bit) >= 0, html);
  });
  if (row.placeholder) {
    check(row.type + ' placeholder for ' + row.placeholder,
      html.indexOf('[להשלים: ' + row.placeholder + ']') >= 0, html);
  }
  check(row.type + ' does not invent an English Party/Amount label',
    html.indexOf('Party:') < 0 && html.indexOf('Amount:') < 0 && html.indexOf('Title:') < 0, html);
});

check('a proposal is not a quote', offer('הצעה לשיתוף פעולה', 'נא להכין הצעה לשיתוף פעולה עם סטודיו נור.').docType === 'proposal');
check('English meeting summary is classified', F.classifyDocument('Please draft a meeting summary for the budget review.') === 'meeting-summary');
check('English agreement is classified', F.classifyDocument('Please draw up an agreement with Dana.') === 'agreement');

const quote = offer('בקשה להצעת מחיר לאתר חדש', 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג.');
check('a quote that mentions a form stays a quote and keeps the price placeholder',
  quote.docType === 'quote' && quote.built && quote.built.html.indexOf('הצעת מחיר') >= 0 && quote.built.html.indexOf(F.PRICE_PLACEHOLDER) >= 0 && quote.built.html.indexOf('[להשלים:') < 0,
  quote.built && quote.built.html);

const fyi = offer('דוח חודשי', 'לידיעתך, הדוח החודשי מצורף. אין צורך בפעולה.');
check('an FYI that only mentions a document has no Do It', fyi.action === 'silence' && fyi.reason === 'not-a-request', fyi);
const news = F.plan({ flags: flags, text: 'הצעת מחיר מיוחדת לחברים. להסרה מרשימת התפוצה לחצו כאן.', lang: 'he' });
check('a newsletter that mentions a quote has no Do It', news.action === 'silence' && news.reason === 'not-a-request', news);

const attached = offer('בקשה להצעת מחיר', 'נא להכין הצעת מחיר לאתר.', {
  attachments: [{ filename: 'הצעת מחיר.pdf', mimeType: 'application/pdf' }]
});
check('a mail that already attaches the document does not create', attached.action === 'silence' && attached.reason === 'already-attached', attached);
const photo = offer('בקשה להצעת מחיר', 'נא להכין הצעת מחיר לאתר.', {
  attachments: [{ filename: 'logo.png', mimeType: 'image/png' }]
});
check('an unrelated image does not block the quote', photo.action === 'offer' && photo.docType === 'quote' && photo.mode === 'create', photo);

function glanceFile(id, thread, type, title, at) {
  return {
    id: id,
    name: title,
    webViewLink: 'https://docs.google.com/document/d/' + id + '/edit',
    trashed: false,
    appProperties: {
      glanceDoc: '1',
      glanceThread: thread,
      glanceType: type,
      glanceTitle: String(title || '').toLowerCase(),
      glanceAt: at || '2026-11-14',
      glanceHash: 'abc'
    },
    description: 'glance ' + JSON.stringify({ glance: true, thread: thread, type: type, title: String(title || '').toLowerCase(), at: at || '2026-11-14' })
  };
}

const again = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר החדש.', {
  existingDocs: [glanceFile('doc-1', 't-1', 'quote', 'הצעת מחיר', '2026-11-14')]
});
check('the same thread offers the existing Doc to update, with the day it was made',
  again.action === 'offer' && again.mode === 'update' && again.writes === true &&
  again.existing && again.existing.id === 'doc-1' &&
  again.doItLabel === 'עדכן' && again.cardLine === 'כבר קיים מסמך מהשרשור הזה מ-14/11',
  again);
check('an update still does not send', again.previewOnly === true && again.closes === false);

const otherThread = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר החדש.', {
  threadId: 't-2',
  existingDocs: [glanceFile('doc-9', 't-1', 'quote', again.titleKey || 'הצעת מחיר', '2026-11-14')]
});
check('a matching Doc from another thread is opened, not updated and not duplicated',
  otherThread.mode === 'open' && otherThread.doItLabel === 'פתח את הקיים' && otherThread.writes !== true &&
  otherThread.existing && otherThread.existing.id === 'doc-9',
  otherThread);

const two = offer('סיכום פגישה — תקציב', 'נא להכין סיכום פגישה על התקציב.', {
  existingDocs: [
    glanceFile('a', 't-1', 'meeting-summary', 'סיכום פגישה', '2026-11-14'),
    glanceFile('b', 't-1', 'meeting-summary', 'סיכום פגישה', '2026-11-01')
  ]
});
check('two Docs from the same thread are named and nothing is created',
  two.mode === 'ambiguous' && two.noDoIt === true && two.cardLine.indexOf('לא נוצר מסמך') >= 0, two);

const draft = offer('הסכם שכירות', 'נא לנסח הסכם שכירות למשרד.', {
  drafts: [{ subject: 'הסכם שכירות למשרד', href: 'https://mail.google.com/mail/u/0/#drafts/d1', source: 'page' }]
});
check('a visible draft of the same document is opened and not created',
  draft.mode === 'open' && draft.doItLabel === 'פתח את הקיים' && draft.cardLine.indexOf('טיוטה') >= 0, draft);
const bareDraft = offer('הסכם שכירות', 'נא לנסח הסכם שכירות למשרד.', {
  drafts: [{ subject: '', source: 'page' }]
});
check('a reply draft with no document title is not treated as the document',
  bareDraft.mode === 'create' && bareDraft.docType === 'agreement', bareDraft);

const liveMeet = offer('סיכום פגישה', 'נא להכין סיכום פגישה. השתתפו: דנה, רוני. החלטות: הוחלט: לאשר את התקציב. משימות: נועה שולחת את המספרים. לביצוע: רוני סוגר את הדוח.');
const liveMeetHtml = (liveMeet.built && liveMeet.built.html) || '';
check('live meeting «השתתפו: דנה, רוני» is the attendee list, not a placeholder',
  liveMeetHtml.indexOf('<li>דנה</li>') >= 0 && liveMeetHtml.indexOf('<li>רוני</li>') >= 0 && liveMeetHtml.indexOf('[להשלים: משתתפים]') < 0, liveMeetHtml);
check('live meeting «נכחו» and «נוכחים» without a colon are names too',
  (offer('סיכום פגישה', 'נא להכין סיכום פגישה. נכחו דנה ורוני.').built.html || '').indexOf('<li>דנה</li>') >= 0 &&
  (offer('סיכום פגישה', 'נא להכין סיכום פגישה. נוכחים: דנה, רוני.').built.html || '').indexOf('<li>רוני</li>') >= 0);
check('live meeting decisions and tasks drop the cue and are one list item each',
  liveMeetHtml.indexOf('<li>לאשר את התקציב</li>') >= 0 && liveMeetHtml.indexOf('<li>נועה שולחת את המספרים</li>') >= 0 &&
  liveMeetHtml.indexOf('<li>רוני סוגר את הדוח</li>') >= 0 && liveMeetHtml.indexOf('הוחלט') < 0 && liveMeetHtml.indexOf('<li>משימות') < 0 &&
  liveMeetHtml.indexOf('<li>לביצוע') < 0, liveMeetHtml);

const liveAgree = offer('הסכם שכירות', 'נא לנסח הסכם שכירות. רחוב הרצל 10 תל אביב. לשנה מ-1/1/2027. תנאים: 3,000 ש״ח לחודש כולל מע״מ.');
const liveAgreeHtml = (liveAgree.built && liveAgree.built.html) || '';
check('live agreement keeps the address, the term with its start date, and the amount period',
  liveAgreeHtml.indexOf('רחוב הרצל 10 תל אביב') >= 0 && liveAgreeHtml.indexOf('לשנה מ-1/1/2027') >= 0 &&
  liveAgreeHtml.indexOf('3,000 ש״ח לחודש') >= 0 && liveAgreeHtml.indexOf('כולל מע״מ') >= 0 &&
  liveAgreeHtml.indexOf('[להשלים: תוקף]') < 0 && liveAgreeHtml.indexOf('[להשלים: כתובת]') < 0, liveAgreeHtml);
const hourly = offer('הסכם', 'נא לנסח הסכם. רח\' אלנבי 4 חיפה. תנאים: 200 ש״ח לשעה לא כולל מע״מ.');
check('an abbreviated street and an hourly amount keep לא כולל מע״מ',
  (hourly.built.html || '').indexOf("רח' אלנבי 4 חיפה") >= 0 && (hourly.built.html || '').indexOf('200 ש״ח לשעה') >= 0 &&
  (hourly.built.html || '').indexOf('לא כולל מע״מ') >= 0, hourly.built && hourly.built.html);

const signoffTemplates = ['quote'].concat(Object.keys(F.DOC_TYPES).filter((type) => type !== 'quote'));
signoffTemplates.forEach((type) => {
  const row = type === 'quote'
    ? offer('בקשה להצעת מחיר לאתר חדש', 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג.')
    : offer(FIXTURES.filter((item) => item.type === type)[0].subject, FIXTURES.filter((item) => item.type === type)[0].body);
  const html = (row.built && row.built.html) || '';
  check(type + ' sign-off is exactly בברכה,', html.indexOf('<p>בברכה,</p>') >= 0 && html.indexOf('<p>ברכה,</p>') < 0 && html.indexOf('>ברכה,<') < 0, html.slice(-80));
});
const brakha = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר.', { styleSummary: { signoff: 'brakha', greeting: 'shalom' } });
const bekavod = offer('מכתב תודה ללקוח', 'נא לכתוב מכתב לדנה כהן על סיום הפרויקט.', { styleSummary: { signoff: 'bekavod', greeting: 'shalom' } });
check('a brakha profile still signs בברכה, and bekavod signs בכבוד רב,',
  (brakha.built.html || '').indexOf('<p>בברכה,</p>') >= 0 && (bekavod.built.html || '').indexOf('<p>בכבוד רב,</p>') >= 0,
  { quote: brakha.built && brakha.built.html, letter: bekavod.built && bekavod.built.html });
const english = F.plan({ flags: flags, text: 'Please draft a meeting summary for the budget review.', lang: 'en', threadId: 't-1' });
check('an English template signs off exactly Best,', (english.built && english.built.html || '').indexOf('<p>Best,</p>') >= 0, english.built && english.built.html);

const ownFile = glanceFile('doc-own', 't-1', 'quote', 'הצעת מחיר', '2026-11-14');
ownFile.appProperties.glanceMessage = 'm-1';
const sameCard = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר החדש.', {
  messageId: 'm-1',
  existingDocs: [ownFile]
});
check('the Doc this same card created is not a pre-existing match', sameCard.mode === 'create' && sameCard.doItLabel !== 'עדכן', sameCard);
const byId = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר החדש.', {
  ownDocumentIds: ['doc-own'],
  existingDocs: [glanceFile('doc-own', 't-1', 'quote', 'הצעת מחיר', '2026-11-14')]
});
check('a receipt document id is not a pre-existing match', byId.mode === 'create', byId);
const otherMessage = offer('בקשה להצעת מחיר לאתר', 'נא להכין הצעת מחיר לאתר החדש.', {
  messageId: 'm-2',
  existingDocs: [ownFile]
});
check('another message in the thread still offers the existing Doc', otherMessage.mode === 'update' && otherMessage.doItLabel === 'עדכן', otherMessage);

console.log('\n--- verify normalization for each new template ---\n');

function asGoogleExport(html) {
  let text = Docs.htmlToPlain(html);
  const items = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html))) {
    const item = Docs.htmlToPlain(m[1]).replace(/\s+/g, ' ').trim();
    if (item) items.push(item);
  }
  items.forEach((item, i) => {
    const mark = ['* ', '• ', '● '][i % 3];
    text = text.replace(item, '\n' + mark + item);
  });
  return '\uFEFF\u200F' + text.replace(/\n/g, '\r\n');
}

FIXTURES.forEach((row) => {
  const p = offer(row.subject, row.body);
  const html = p.built.html;
  const wrapped = Docs.wrapDocHtml(html, html);
  const exported = asGoogleExport(html);
  check(row.type + ' Google export with BOM, bidi, CRLF and bullets still verifies',
    wrapped.indexOf('dir="rtl"') >= 0 && wrapped.indexOf('lang="he"') >= 0 &&
    Docs.exportContains(exported, Docs.htmlToPlain(html), wrapped) === true, exported.slice(0, 180));
  check(row.type + ' a different export does not verify',
    Docs.exportContains('\uFEFFמסמך אחר\r\n* לא קשור\r\n', Docs.htmlToPlain(html), wrapped) === false);
});

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
