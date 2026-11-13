// Scripted lines. Hebrew is the default. English is a faithful rendering of
// the same script, used only when the user writes in English.
const BOOKING_URL = 'https://calendar.app.google/FLWjDDQWAiM3bHvc9';

const SECTORS = [
  { id: 'sector_legal', he: 'עורכי דין', en: 'Lawyers' },
  { id: 'sector_insurance', he: 'ביטוח', en: 'Insurance' },
  { id: 'sector_accounting', he: 'ראיית חשבון', en: 'Accounting' },
  { id: 'sector_other', he: 'אחר', en: 'Other' },
];

const HE = {
  opening:
    'היי, כאן Flow 👋 שמחים שפניתם.\n' +
    'Flow מכין את הצעדים הבאים במערכות שכבר יש לכם, עוצר לאישור שלכם, ואחרי לחיצה אחת על Do It מבצע, כל פעם באותה דרך.\n' +
    'באיזה תחום אתם עובדים?',
  openingBody: 'באיזה תחום אתם עובדים?',
  sectorListButton: 'בחירה',
  sectorListSection: 'תחום',
  qProcess: 'איזו עבודה חוזרת אצלכם הכי גוזלת זמן?',
  qTeamSize: 'כמה אנשים במשרד עובדים עליה בערך?',
  qSensitivity: 'המידע שאתם עובדים איתו רגיש? (לקוחות, פוליסות, תיקים)',
  // Explanation only — not a fourth qualify question, and not a price claim.
  // Never say that installing on employees' computers is included in the price.
  dataLocation:
    'המידע יכול להישאר בענן מאובטח שמסתיר מידע רגיש לפני העיבוד, רק במחשב של העובד, או בשרת ייעודי ברשת המשרד.',
  close: 'נשמע שזה בדיוק המקום ש-Flow נבנה בשבילו. רוצים לקבוע הדגמה קצרה של 20 דקות?',
  yes: 'כן',
  no: 'לא',
  noPath: 'בכיף. אם תרצו, אפשר להשאיר שם ומייל ונחזור אליכם.',
  booking: 'אפשר לקבוע כאן: ' + BOOKING_URL,
  handoff: 'העברתי לצוות, נחזור אליכם בהקדם.',
  outOfHours: 'נחזור אליכם ביום העבודה הבא.',
  price: 'המחיר תלוי בתהליכים ובגודל המשרד. בהדגמה נבנה לכם הצעה מדויקת.',
  sensitive: 'תודה, אין צורך לשלוח כאן מידע של לקוחות.',
  nudge: 'אפשר לכתוב כאן או לבחור מהאפשרויות.',
  thanksContact: 'תודה, קיבלנו.',
};

const EN = {
  opening:
    'Hi, this is Flow 👋 Glad you reached out.\n' +
    'Flow prepares the next steps in the systems you already have, pauses for your approval, and after one click on Do It it carries them out, the same way each time.\n' +
    'What field do you work in?',
  openingBody: 'What field do you work in?',
  sectorListButton: 'Choose',
  sectorListSection: 'Field',
  qProcess: 'Which recurring task takes the most time in your office?',
  qTeamSize: 'About how many people in the office work on it?',
  qSensitivity: 'Is the information you work with sensitive? (clients, policies, case files)',
  dataLocation:
    'The data can stay in a secure cloud that masks sensitive information before processing, only on the employee’s computer, or on a dedicated server in the office network.',
  close: 'This sounds like exactly what Flow was built for. Want to book a short 20-minute demo?',
  yes: 'Yes',
  no: 'No',
  noPath: 'Of course. If you’d like, you can leave a name and email and we’ll get back to you.',
  booking: 'You can book here: ' + BOOKING_URL,
  handoff: 'I’ve passed this to the team — we’ll get back to you shortly.',
  outOfHours: 'We’ll get back to you on the next business day.',
  price: 'Pricing depends on the processes and the size of the office. In the demo we’ll build you an exact proposal.',
  sensitive: 'Thanks, there’s no need to send client information here.',
  nudge: 'You can write here or choose from the options.',
  thanksContact: 'Thanks, we’ve got it.',
};

function t(lang) {
  return lang === 'en' ? EN : HE;
}

function sectorTitle(id, lang) {
  const row = SECTORS.find((s) => s.id === id);
  if (!row) return '';
  return lang === 'en' ? row.en : row.he;
}

module.exports = { BOOKING_URL, SECTORS, HE, EN, t, sectorTitle };
