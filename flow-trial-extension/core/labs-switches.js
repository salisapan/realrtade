// The closes that ship behind an off switch, in one list, so a person can see them and turn them on. Portable: no chrome.*,
// no DOM. The popup reads this list and keeps one storage object, glanceSwitches ({ NAME: true }); a missing key is off
// (src/background.js glanceSwitchOn). Nothing here turns a switch on: the person does, one row at a time. None of these has
// passed a live Gate, and every row says so. The words are Hebrew because the popup is.
const FlowLabsSwitches = (() => {
  const LIST = [
    { id: 'TASK_ASK', who: 'תזכורת, מועד אחרון או בקשה לחזור', note: 'בקשה שנכתבה בלי שאלה הופכת למשימה ביום שלה' },
    { id: 'PAYMENT_ASK', who: 'בקשת תשלום', note: '"תעביר 500 שקל עד יום ראשון" הופך למשימה עם הסכום והיום' },
    { id: 'BOOKING_NOTICE', who: 'תור, הזמנה, איסוף או נסיעה', note: 'אישור תור, הזמנה לאירוע או טיסה הופכים לאירוע ביומן' },
    { id: 'SYSTEM_NOTICE', who: 'התראת מערכת עם מועד', note: '"הפרויקט ייעצר", "הדומיין יפוג" הופכים למשימה' },
    { id: 'CHAT_TASK_CARD', who: 'צ\'אט: כרטיס עשה', note: 'וואטסאפ, מסנג\'ר ואינסטגרם: בקשה בצ\'אט מקבלת כרטיס' },
    { id: 'CHAT_PROMISE_CARD', who: 'צ\'אט: הבטחה אליך', note: 'הבטחה שקיבלת בצ\'אט נרשמת כ"ממתין ל..."' },
    { id: 'MEET_LINK', who: 'קישור Meet לשיחה', note: 'שיחה שהוצעה מקבלת אירוע ביומן עם קישור Meet' },
    { id: 'EVENT_CALL_LINK', who: 'קישור Meet לאירוע קיים', note: 'מוסיף קישור לאירוע שאתה מארגן' },
    { id: 'TEAMS_MEETING', who: 'קישור Teams לשיחה', note: 'שיחה שהוצעה ב-Outlook מקבלת אירוע עם קישור Teams' },
    { id: 'OUTLOOK_EVENT_CALL_LINK', who: 'קישור Teams לאירוע קיים', note: 'מוסיף קישור לאירוע קיים ב-Outlook' },
    { id: 'RECURRING_HOLD', who: 'פגישה חוזרת', note: 'חזרה שנאמרה במפורש הופכת לסדרה ביומן' },
    { id: 'RECURRING_REMINDER', who: 'תזכורת חוזרת', note: 'התחייבות חוזרת הופכת לתזכורת חוזרת' },
    { id: 'RECURRING_TODO', who: 'משימה חוזרת', note: 'משימה ב-Microsoft To Do שחוזרת' },
    { id: 'WORKSPACE_FILE', who: 'מסמך, גיליון או מצגת ב-Google', note: 'קובץ ריק בשם שביקשו, ב-Drive' },
    { id: 'ONEDRIVE_NEW_FILE', who: 'קובץ Word או Excel', note: 'קובץ ריק בשם שביקשו, ב-OneDrive' },
    { id: 'PLANNER_TASK', who: 'משימה ב-Planner', note: 'משימה בתוכנית ששמה בא במייל' }
  ];
  const IDS = LIST.map((r) => r.id);
  function isOn(bag, id) { return Boolean(bag && bag[id] === true); }
  // The object to store after one row is flipped. Only known ids are written; anything else in the bag is kept as it is.
  function flipped(bag, id, on) {
    const next = Object.assign({}, bag || {});
    if (IDS.indexOf(id) === -1) return next;
    if (on) next[id] = true; else delete next[id];
    return next;
  }
  function all(bag, on) {
    let next = Object.assign({}, bag || {});
    IDS.forEach((id) => { next = flipped(next, id, on); });
    return next;
  }
  return { LIST, IDS, isOn, flipped, all };
})();
if (typeof module !== 'undefined') module.exports = { FlowLabsSwitches };
