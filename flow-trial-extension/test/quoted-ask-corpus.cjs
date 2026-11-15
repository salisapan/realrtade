// A command inside quoted or forwarded history is someone else's, not an ask of this reader. Covers a Gmail
// "On … wrote:" / "בתאריך … :" / "ב-… כתבה:" header, a From: header block (Sent:, Date:, To:, Subject:, and the Hebrew
// מאת:/נשלח:/תאריך:), Original Message and forward banners (EN and HE), Outlook's underscore rule, "Begin forwarded
// message:", ">" lines, and a command in quotation marks. New ask patterns (IMPERATIVE_ASK_HE, ADD_TASK_ASK) and
// existing ones (could you, תוכל, תשלח לי) both. An own ask above quoted history, a quoted title inside an own ask,
// and a Hebrew acronym's gershayim still show. Strings are written for this test.
// v3 adds a whole-message gate (FlowJudgment.newAskOpen): the two new ask patterns stay off for a message with any sign
// of quoted or forwarded text in its raw body or subject, so a new-pattern ask written above quoted history is left to
// the older rules (the cost of the gate; those shapes are checked quiet below). Hebrew Gmail web/mobile replies and
// forwards, ״…״ «…» quotes, pasted history with no banner, a single quoted line, Fwd/FW/הועבר subjects; a plain Re:
// subject with no quoted body keeps them on.
// Run: node test/quoted-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} } };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'incoming-judge.js', 'draft-reply.js']) {
  const p = path.join(__dirname, '..', 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f });
}
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const J = g('FlowIncomingJudge');
const DEPS = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const NOW = new Date('2026-11-09T12:00:00+02:00');
function judge(text, surface, subject) {
  return J.judge({ text, subject: subject || 'Update', sender: { name: 'Jamie P.', email: 'jamie@example.com' }, now: NOW, threadUrl: 'https://mail.google.com/x',
    hasThreadAttachment: false, attachmentCount: 0, surface: surface || 'gmail', ownNames: ['Sali', 'Sali Sapan', 'סאלי'], namesPending: false, namesWaitDone: true }, DEPS);
}
let failures = 0;
function expect(name, ok, detail) { if (!ok) { failures++; console.error('FAIL', name, detail || ''); } else console.log('ok  ', name); }
const kinds = (r) => (r.show && r.process && r.process.steps ? r.process.steps.map((s) => s.kind) : []);
const quiet = [
  "Thanks Sali, noted.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n> Please add a task to renew the lease by Friday.",
  "Thanks, noted.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n\nPlease add a task to renew the lease by Friday.",
  "FYI below.\n\n---------- Forwarded message ---------\nFrom: Dana Cole <dana@example.com>\nDate: Mon, Nov 9, 2026 at 9:00 AM\nSubject: Lease\nTo: Avi <avi@example.com>\n\nAvi, please add a task to renew the lease by Friday.",
  "Noted.\n\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\nTo: Avi <avi@example.com>\nSubject: Lease\n\nPlease add a task to renew the lease by Friday.",
  "See below.\n\n-----Original Message-----\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\n\nPlease add a task to renew the lease by Friday.",
  "Forwarding for context.\n\nFrom: Dana Cole <dana@example.com>\nDate: Monday, November 9, 2026\nSubject: Lease\n\nPlease add a task to renew the lease by Friday.",
  "Noted, thanks.\n________________________________\nFrom: Dana Cole <dana@example.com>\nPlease add a task to renew the lease by Friday.",
  "FYI.\n\nBegin forwarded message:\n\nDana Cole <dana@example.com>\nPlease add a task to renew the lease by Friday.",
  "Sali, just so you know, Dana wrote to the vendor \"please add a task to renew the lease by Friday\". Nothing needed from you.",
  "Thanks.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n> Can you send me the report by Thursday?",
  "See below.\n\n-----Original Message-----\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\n\nCould you please send me the signed form by Friday?",
  "Forwarding for context.\n\nFrom: Dana Cole <dana@example.com>\nDate: Monday, November 9, 2026\nSubject: Report\n\nCould you send me the report by Thursday?",
  "תודה, ראיתי.\n\nבתאריך יום ב׳, 9 בנוב׳ 2026 ב-9:00 מאת דנה כהן <dana@example.com>:\n> תשלח לי את הסיכום עד מחר.",
  "תודה, ראיתי.\n\nב-9 בנוב׳ 2026, 9:00, דנה כהן כתבה:\nתשלח לי את הסיכום עד מחר.",
  "לידיעתך.\n\n---------- הודעה שהועברה ---------\nמאת: דנה כהן <dana@example.com>\nתאריך: יום ב׳, 9 בנוב׳ 2026\nנושא: חוזה\n\nתוסיף משימה לחדש את החוזה עד יום שישי.",
  "ראיתי.\n\nמאת: דנה כהן <dana@example.com>\nנשלח: יום שני 9 בנובמבר 2026 9:00\nאל: אבי\nנושא: חוזה\n\nבבקשה שלח לי את החוזה המעודכן.",
  "ראיתי.\n\n-----הודעה מקורית-----\nמאת: דנה כהן\n\nתשתף אותי בטבלת התקציב עד יום רביעי.",
  "לידיעתך.\n\nמאת: דנה כהן <dana@example.com>\nתאריך: יום שני 9 בנובמבר 2026\nנושא: דוח\n\nתעדכן אותי על הסטטוס עד מחר.",
  "סאלי, לידיעתך, דנה כתבה ללקוח \"תשלח לי את הסיכום עד מחר\". אין צורך לעשות כלום.",
  "סאלי, לידיעתך, הספק ביקש מדנה “תוסיף משימה לחדש את החוזה עד יום שישי”. זה אצלה.",
  "תודה.\n\nבתאריך יום ב׳, 9 בנוב׳ 2026 ב-9:00 מאת דנה כהן <dana@example.com>:\n> תוכל לשלוח לי את הדוח עד מחר?",
  "לידיעתך.\n\nמאת: דנה כהן <dana@example.com>\nתאריך: יום שני 9 בנובמבר 2026\nנושא: דוח\n\nתוכל לשלוח לי את הדוח עד מחר?"
];
for (const surface of ['gmail', 'outlook']) for (const t of quiet) {
  const r = judge(t, surface);
  expect(surface + ' quoted stays quiet: ' + t.replace(/\n/g, ' ').slice(0, 60), !r.show && r.reason !== 'file' && r.reason !== 'file-chain-not-run', JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
const shows = [
  "Sali, please add a task to review the \"Q4 plan\" by Friday.",
  "סאלי, תשלח לי את הסיכום עד מחר.\n\nבתאריך יום ב׳, 9 בנוב׳ 2026 ב-9:00 מאת אבי לוי <avi@example.com>:\n> תודה על העדכון.",
  "סאלי, תשלח לי את הדו\"ח עד מחר.",
  "סאלי, תשלח לי את המסמך \"הצעה סופית\" עד מחר."
];
for (const surface of ['gmail', 'outlook']) for (const t of shows) {
  const r = judge(t, surface);
  expect(surface + ' own ask shows: ' + t.replace(/\n/g, ' ').slice(0, 60), r.show || r.reason === 'file' || r.reason === 'file-chain-not-run', JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
// v3: more quoted and forwarded shapes. The old rules stay quiet on these on 7246b617 and the new patterns must too.
const quietV3 = [
  ["he", "Update", "מעולה, תודה!\n\nב-יום ב׳, 9 בנוב׳ 2026 ב-8:40 רונית שמש <ronit@example.com> כתבה:\n\nתעדכן אותי בבקשה מתי הטכנאי מגיע."],
  ["he", "Update", "בסדר גמור\n\nבתאריך יום ב׳, 9 בנוב׳ 2026, 8:40, מאת רונית שמש ‏<ronit@example.com>‏:\n\nתשלח לי את הקבלה מהחודש שעבר."],
  ["he", "Update", "שולחת לך לידיעה בלבד.\n\n---------- הודעה שהועברה ---------\nמאת: יואב ברק <yoav@example.com>\nDate: יום א׳, 8 בנוב׳ 2026 ב-17:05\nSubject: שיפוץ\nTo: <sali@example.com>\n\nתכין לי הצעת מחיר לחלונות עד יום חמישי."],
  ["he", "Update", "ראיתי, נדבר מחר\n\nהשג את Outlook עבור Android\n\nמאת: מיכל דור\nנשלח: יום ראשון, 8 בנובמבר 2026 21:10\nאל: סאלי\nנושא: הזמנה\n\nבבקשה שלח לי את רשימת המוזמנים."],
  ["he", "Update", "רק לעדכן: הלקוח ביקש מהמזכירה \"תוסיף תזכורת לפגישה ביום שלישי\" וזה כבר בוצע."],
  ["he", "Update", "מעולה.\nתודה,\nנועה\n\nהיי נועה,\nתשתף אותי בבקשה במסמך הדרישות עד מחר.\nתודה, דני"],
  ["he", "Update", "קיבלתי, תודה\n\n-------- הודעה מקורית --------\nנושא: ספקים\nתאריך: 08/11/2026 19:02\nמאת: גלעד <gilad@example.com>\n\nתוסיף משימה לבדוק את הספק החדש."],
  ["en", "Update", "FYI, the client's note just said \"please add a task for the Q1 audit\" and nothing else."],
  ["en", "Update", "Agreed with this part:\n> please add a task to renew the domain for next week\nAll good otherwise."],
  ["en", "Update", "Got it, will do.\nThanks,\nMaya\n\nHi Maya,\nPlease add a task to call the insurer for Tuesday.\nBest,\nTom"],
  ["en", "Update", "Merci !\n\nLe lun. 9 nov. 2026 à 08:40, Ronit <ronit@example.com> a écrit :\n\nPlease add a task to send the invoice for Friday."],
  ["en", "Update", "Sounds good.\n\n> On Nov 9, 2026, at 08:40, Ronit <ronit@example.com> wrote:\n>\n> Please add a task to book the venue for Thursday."]
];
for (const surface of ['gmail', 'outlook']) for (const [, subject, t] of quietV3) {
  const r = judge(t, surface, subject);
  expect(surface + ' v3 quoted stays quiet: ' + t.replace(/\n/g, ' ').slice(0, 60), !r.show && r.reason !== 'file' && r.reason !== 'file-chain-not-run', JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
// A new-pattern ask written above quoted history: the gate keeps the new patterns off, and no older rule reads it.
const offAboveHistory = [
  "Sali, please add a task to renew the lease by Friday.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Avi Levi <avi@example.com> wrote:\n> Thanks for the update.",
  "Sali, please add a task to renew the lease by Friday.\n\nFrom: Avi Levi <avi@example.com>\nSent: Monday, November 9, 2026 9:00 AM\nTo: Sali\nSubject: Lease\n\nThanks for the update.",
  "סאלי, תוסיף משימה לחדש את החוזה עד יום שישי.\n\nמאת: אבי לוי <avi@example.com>\nנשלח: יום שני 9 בנובמבר 2026 9:00\nאל: סאלי\nנושא: חוזה\n\nתודה.",
  "סאלי, תשתף אותי בטבלת התקציב עד יום רביעי.\n\nב-9 בנוב׳ 2026, 9:00, אבי לוי כתב:\nתודה."
];
for (const surface of ['gmail', 'outlook']) for (const t of offAboveHistory) {
  const r = judge(t, surface);
  expect(surface + ' new-pattern ask above history is left to older rules: ' + t.replace(/\n/g, ' ').slice(0, 50), !r.show && r.reason !== 'file' && r.reason !== 'file-chain-not-run', JSON.stringify({ reason: r.reason }));
}
const showV3 = [
  ["he", "Re: דוח הוצאות", "סאלי, תשלח לי בבקשה את דוח ההוצאות של אוקטובר עד יום רביעי."],
  ["en", "Re: parking", "Hi Sali,\nPlease add a task to renew the parking permit for Monday.\nThanks,\nTom"],
  ["he", "Update", "סאלי, תעדכן אותי לגבי הדו\"ח הרבעוני עד מחר."],
  ["he", "Update", "היי סאלי,\nתכין לי בבקשה את המצגת לישיבה ביום חמישי.\nתודה,\nאורי"]
];
for (const surface of ['gmail', 'outlook']) for (const [, subject, t] of showV3) {
  const r = judge(t, surface, subject);
  expect(surface + ' v3 own ask shows: ' + t.replace(/\n/g, ' ').slice(0, 60), r.show || r.reason === 'file' || r.reason === 'file-chain-not-run', JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
// The gate itself, on every shape: closed on any sign of quoted or forwarded text (including the shapes older rules
// already card), open on a clean message, a plain Re: subject, a quoted title with no command, and gershayim.
const FJ = g('FlowJudgment');
const closed = [
  ["", "Update", "Thanks Sali, noted.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n> Please add a task to renew the lease by Friday."],
  ["", "Update", "Thanks, noted.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "FYI below.\n\n---------- Forwarded message ---------\nFrom: Dana Cole <dana@example.com>\nDate: Mon, Nov 9, 2026 at 9:00 AM\nSubject: Lease\nTo: Avi <avi@example.com>\n\nAvi, please add a task to renew the lease by Friday."],
  ["", "Update", "Noted.\n\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\nTo: Avi <avi@example.com>\nSubject: Lease\n\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "See below.\n\n-----Original Message-----\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\n\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "Forwarding for context.\n\nFrom: Dana Cole <dana@example.com>\nDate: Monday, November 9, 2026\nSubject: Lease\n\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "Noted, thanks.\n________________________________\nFrom: Dana Cole <dana@example.com>\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "FYI.\n\nBegin forwarded message:\n\nDana Cole <dana@example.com>\nPlease add a task to renew the lease by Friday."],
  ["", "Update", "Sali, just so you know, Dana wrote to the vendor \"please add a task to renew the lease by Friday\". Nothing needed from you."],
  ["", "Update", "Thanks.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Dana Cole <dana@example.com> wrote:\n> Can you send me the report by Thursday?"],
  ["", "Update", "See below.\n\n-----Original Message-----\nFrom: Dana Cole <dana@example.com>\nSent: Monday, November 9, 2026 9:00 AM\n\nCould you please send me the signed form by Friday?"],
  ["", "Update", "Forwarding for context.\n\nFrom: Dana Cole <dana@example.com>\nDate: Monday, November 9, 2026\nSubject: Report\n\nCould you send me the report by Thursday?"],
  ["", "Update", "תודה, ראיתי.\n\nבתאריך יום ב׳, 9 בנוב׳ 2026 ב-9:00 מאת דנה כהן <dana@example.com>:\n> תשלח לי את הסיכום עד מחר."],
  ["", "Update", "תודה, ראיתי.\n\nב-9 בנוב׳ 2026, 9:00, דנה כהן כתבה:\nתשלח לי את הסיכום עד מחר."],
  ["", "Update", "לידיעתך.\n\n---------- הודעה שהועברה ---------\nמאת: דנה כהן <dana@example.com>\nתאריך: יום ב׳, 9 בנוב׳ 2026\nנושא: חוזה\n\nתוסיף משימה לחדש את החוזה עד יום שישי."],
  ["", "Update", "ראיתי.\n\nמאת: דנה כהן <dana@example.com>\nנשלח: יום שני 9 בנובמבר 2026 9:00\nאל: אבי\nנושא: חוזה\n\nבבקשה שלח לי את החוזה המעודכן."],
  ["", "Update", "ראיתי.\n\n-----הודעה מקורית-----\nמאת: דנה כהן\n\nתשתף אותי בטבלת התקציב עד יום רביעי."],
  ["", "Update", "לידיעתך.\n\nמאת: דנה כהן <dana@example.com>\nתאריך: יום שני 9 בנובמבר 2026\nנושא: דוח\n\nתעדכן אותי על הסטטוס עד מחר."],
  ["", "Update", "סאלי, לידיעתך, דנה כתבה ללקוח \"תשלח לי את הסיכום עד מחר\". אין צורך לעשות כלום."],
  ["", "Update", "סאלי, לידיעתך, הספק ביקש מדנה “תוסיף משימה לחדש את החוזה עד יום שישי”. זה אצלה."],
  ["", "Update", "תודה.\n\nבתאריך יום ב׳, 9 בנוב׳ 2026 ב-9:00 מאת דנה כהן <dana@example.com>:\n> תוכל לשלוח לי את הדוח עד מחר?"],
  ["", "Update", "לידיעתך.\n\nמאת: דנה כהן <dana@example.com>\nתאריך: יום שני 9 בנובמבר 2026\nנושא: דוח\n\nתוכל לשלוח לי את הדוח עד מחר?"],
  ["he", "Update", "מעולה, תודה!\n\nב-יום ב׳, 9 בנוב׳ 2026 ב-8:40 רונית שמש <ronit@example.com> כתבה:\n\nתעדכן אותי בבקשה מתי הטכנאי מגיע."],
  ["he", "Update", "בסדר גמור\n\nבתאריך יום ב׳, 9 בנוב׳ 2026, 8:40, מאת רונית שמש ‏<ronit@example.com>‏:\n\nתשלח לי את הקבלה מהחודש שעבר."],
  ["he", "Update", "שולחת לך לידיעה בלבד.\n\n---------- הודעה שהועברה ---------\nמאת: יואב ברק <yoav@example.com>\nDate: יום א׳, 8 בנוב׳ 2026 ב-17:05\nSubject: שיפוץ\nTo: <sali@example.com>\n\nתכין לי הצעת מחיר לחלונות עד יום חמישי."],
  ["he", "Update", "ראיתי, נדבר מחר\n\nהשג את Outlook עבור Android\n\nמאת: מיכל דור\nנשלח: יום ראשון, 8 בנובמבר 2026 21:10\nאל: סאלי\nנושא: הזמנה\n\nבבקשה שלח לי את רשימת המוזמנים."],
  ["he", "Update", "אבי כתב לספק ״תשלח לי את החשבונית המתוקנת״ ואני מחכה לראות מה יענה."],
  ["he", "Update", "רק לעדכן: הלקוח ביקש מהמזכירה \"תוסיף תזכורת לפגישה ביום שלישי\" וזה כבר בוצע."],
  ["he", "Update", "הוא פשוט כתב «תשלח לי את זה עד מחר» בלי להסביר."],
  ["he", "Update", "מעולה.\nתודה,\nנועה\n\nהיי נועה,\nתשתף אותי בבקשה במסמך הדרישות עד מחר.\nתודה, דני"],
  ["he", "Update", "בסדר\n\nנשלח מה-iPhone שלי\n\nתעדכן אותי לגבי ההזמנה עד הערב"],
  ["he", "Fwd: חשבונית", "תשלח לי את החשבונית המקורית בבקשה."],
  ["he", "הועבר: חוזה", "בבקשה שלח לי את החוזה החתום עד יום שני."],
  ["he", "Update", "קיבלתי, תודה\n\n-------- הודעה מקורית --------\nנושא: ספקים\nתאריך: 08/11/2026 19:02\nמאת: גלעד <gilad@example.com>\n\nתוסיף משימה לבדוק את הספק החדש."],
  ["en", "Update", "FYI, the client's note just said \"please add a task for the Q1 audit\" and nothing else."],
  ["en", "Update", "Agreed with this part:\n> please add a task to renew the domain for next week\nAll good otherwise."],
  ["en", "Update", "Got it, will do.\nThanks,\nMaya\n\nHi Maya,\nPlease add a task to call the insurer for Tuesday.\nBest,\nTom"],
  ["en", "Update", "Merci !\n\nLe lun. 9 nov. 2026 à 08:40, Ronit <ronit@example.com> a écrit :\n\nPlease add a task to send the invoice for Friday."],
  ["en", "Update", "Sure.\n\nGet Outlook for Android\n\nPlease add a task to renew the parking permit for Monday."],
  ["en", "FW: permit", "Please add a task to renew the parking permit for Monday."],
  ["en", "Update", "Sounds good.\n\n> On Nov 9, 2026, at 08:40, Ronit <ronit@example.com> wrote:\n>\n> Please add a task to book the venue for Thursday."],
  ["", "Update", "Sali, please add a task to renew the lease by Friday.\n\nOn Mon, Nov 9, 2026 at 9:00 AM Avi Levi <avi@example.com> wrote:\n> Thanks for the update."],
  ["", "Update", "Sali, please add a task to renew the lease by Friday.\n\nFrom: Avi Levi <avi@example.com>\nSent: Monday, November 9, 2026 9:00 AM\nTo: Sali\nSubject: Lease\n\nThanks for the update."],
  ["", "Update", "סאלי, תוסיף משימה לחדש את החוזה עד יום שישי.\n\nמאת: אבי לוי <avi@example.com>\nנשלח: יום שני 9 בנובמבר 2026 9:00\nאל: סאלי\nנושא: חוזה\n\nתודה."],
  ["", "Update", "סאלי, תשתף אותי בטבלת התקציב עד יום רביעי.\n\nב-9 בנוב׳ 2026, 9:00, אבי לוי כתב:\nתודה."]
];
for (const [, subject, t] of closed) expect('gate closed: ' + t.replace(/\n/g, ' ').slice(0, 60), !!FJ && typeof FJ.newAskOpen === 'function' && FJ.newAskOpen(t, subject) === false);
const open_ = [
  ["he", "Re: דוח הוצאות", "סאלי, תשלח לי בבקשה את דוח ההוצאות של אוקטובר עד יום רביעי."],
  ["en", "Re: parking", "Hi Sali,\nPlease add a task to renew the parking permit for Monday.\nThanks,\nTom"],
  ["he", "Update", "סאלי, תעדכן אותי לגבי הדו\"ח הרבעוני עד מחר."],
  ["he", "Update", "היי סאלי,\nתכין לי בבקשה את המצגת לישיבה ביום חמישי.\nתודה,\nאורי"],
  ["", "Update", "Sali, please add a task to review the \"Q4 plan\" by Friday."],
  ["", "Update", "סאלי, תשלח לי את הדו\"ח עד מחר."],
  ["", "Update", "סאלי, תשלח לי את המסמך \"הצעה סופית\" עד מחר."]
];
for (const [, subject, t] of open_) expect('gate open: ' + t.replace(/\n/g, ' ').slice(0, 60), !!FJ && typeof FJ.newAskOpen === 'function' && FJ.newAskOpen(t, subject) === true);
if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('quoted-ask-corpus: all passed');
