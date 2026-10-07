'use strict';
// v2.1 phrasing pool: BARE / SHORT asks (EN+HE). One-line asks with no greeting or signature, imperative fragments,
// "need X by D", "X by D pls", question fragments, plus short silent controls (acks, FYI, negations, holds) so the
// shape itself never becomes a show cue. Each generated string = one frame with its own templateId (v21:<lang>:<sc>:<i>);
// split is by frame bucket like v2, and near-duplicates of existing v1/v2 frames inherit THAT frame's split (see builder).
// Slots reuse the v1+v2 slot tables. Labels come from engine 0.9.35 + product rules like every other row.
const X = (...lists) => lists.reduce((acc, l) => acc.flatMap((a) => l.map((b) => a + b)), ['']);
const EN = {
  request_reply: [
    ...X(['Send me the {obj} {date}', 'Send over the {obj} {date}', 'Please send the {obj} {date}', 'Pls send the {obj} {date}', 'Kindly send the {obj} {date}'], ['', '.', ', thanks', ' - thx']),
    ...X(['Need the {obj} {date}', 'Still need the {obj} {date}', 'We need the {obj} {date}', 'I need the {obj} back {date}'], ['', '.', ', pls']),
    '{obj} {date} pls', '{obj} {date}, thanks', 'The {obj}, {date} please', 'Quick ask: the {obj} {date}?', 'Any update on the {obj}?', 'Where are we on the {obj}?', 'Status on {topic}?',
    'Can you confirm {topic} {date}?', 'Confirm {topic} {date}?', 'Confirm {topic} {date} pls', 'Thoughts on the {obj}?', 'Let me know {date} if {topic} is a go', 'LMK on {topic} {date}',
    'Review the {obj} and send comments {date}', 'Pls review the {obj} {date}', 'Sign and return the {obj} {date}', 'Sign the {obj} {date}?', 'Approve the {obj} {date}?', 'Need your OK on {topic} {date}',
    'Get back to me on {topic} {date}', 'Reply with your comments on the {obj} {date}', 'Fill in the {obj} {date} please', 'Update the {obj} and resend {date}'
  ],
  payment: [
    'Pay the {amt} invoice {date}', 'Please pay {amt} to {vendor} {date}', 'Pls transfer {amt} {date}', '{amt} due {date}, please pay', 'Invoice for {amt} - due {date}', 'Settle the {amt} balance {date}?',
    'Wire {amt} to {vendor} {date}', 'Reminder: {amt} payment {date}', 'Can you pay the {amt} {date}?', 'Payment of {amt} {date} please'
  ],
  meeting: [
    ...X(['{meet} {day} at {time}?', 'Free for a {meet} {day} at {time}?', 'Can we do a {meet} {day} at {time}?', '{meet} {day} {time} work?', 'Quick {meet} {day} at {time}?'], ['', ' Thx']),
    'Book a {meet} with {vendor} {day} at {time}', 'Set up a {meet} {day} at {time}', 'Move our {meet} to {day} at {time}?', 'Push the {meet} to {day} {time}?', 'Call me {day} at {time}', 'Ping me {day} at {time} for the {meet}'
  ],
  calendar_hold: ['Hold {day} at {time} for the {meet}', 'Block {day} {time} for {topic}', 'Save the date: {meet} {day} at {time}', 'Pencil in {day} at {time}', 'Keep {day} {time} free for the {meet}'],
  drive_save: ['Save the attachment to {dest}', 'Pls save the attached {obj} to {dest}', 'Save to {dest}', 'Attached {obj} - save to {dest} pls', 'Upload the attached file to {dest}', 'Put the attached {obj} in {dest}', 'Store this in {dest} please'],
  onedrive_save: ['Save the attachment to OneDrive', 'Pls save the attached {obj} to OneDrive', 'Upload the attached file to OneDrive', 'Attached {obj} - OneDrive pls', 'Put this in OneDrive please'],
  task_ask: ['Reminder: {task} {date}', 'Don\'t forget to {task} {date}', 'Please {task} {date}', 'Can you {task} {date}?', 'Pls {task} {date}', 'Need you to {task} {date}', 'Add a to-do: {task} {date}', 'Todo: {task} {date}'],
  commitment_reader: ['You said you\'d {task} {date}', 'You owe me the {obj} {date}', 'Per your note, you\'ll {task} {date}', 'Your action item: {task} {date}'],
  decision: ['Go ahead with {vendor}', 'Approved - go with {vendor} at {amt}', 'Decision: {vendor}, {amt}', 'Green light on {topic}', 'Final: {vendor} for {topic}'],
  // reader families in bare form (sender's own commitment, event statement, decision statement): the engine shows these
  sender_commitment: ['I\'ll send the {obj} {date}', 'I will send it over {date}', 'We\'ll pay the {amt} {date}', 'I\'ll confirm {topic} {date}', 'We will transfer {amt} {date}', 'I\'ll get you the {obj} {date}', 'Will send the {obj} {date}', 'We\'ll have the {obj} ready {date}'],
  event_statement: ['The {meet} is on {day} at {time}', '{meet} is set for {day} at {time}', 'Our {meet} is {day} at {time} at the office', 'Confirmed: {meet} {day} at {time}', 'See you {day} at {time} for the {meet}'],
  decision_statement: ['{topic} approved at {amt}', 'We\'re going with {vendor}', 'Budget approved: {amt}', 'Signed off on {topic}', 'Decided: {vendor} at {amt}'],
  // silent controls in the same bare shape
  ack: ['Thanks, got it', 'Got the {obj}, thanks', 'Received, thx', '{obj} received', 'Perfect, thanks!', 'Noted', 'Thanks!', 'Sounds good', 'Great, all set', 'Will do', 'On it'],
  fyi: ['FYI the {obj} is attached', 'FYI - {topic} is done', '{obj} attached for your records', 'FYI only, no action needed', 'Heads up: {topic} moved to {day}', 'Just FYI, {vendor} signed'],
  negation: ['Don\'t send the {obj} yet', 'No need to pay {amt}', 'Hold off on the {obj}', 'Ignore my last email', 'Never mind the {obj}', 'Don\'t save the attachment', 'No need to reply'],
  hedge: ['Maybe look at the {obj} sometime', 'No rush on the {obj}', 'If you get a chance, the {obj}', 'Whenever, no rush'],
  past: ['Paid {amt} {date}', 'Sent the {obj} yesterday', '{meet} was great, thanks', 'Signed and filed the {obj}'],
  cancelled: ['{meet} {day} is cancelled', 'Cancel the {meet} {day}, sorry', 'Calling off {day}\'s {meet}']
};
const HE = {
  request_reply: [
    ...X(['שלח לי את {obj} {date}', 'תשלח את {obj} {date}', 'תשלחי את {obj} {date}', 'תשלחו את {obj} {date}', 'תעביר לי את {obj} {date}', 'תעבירי את {obj} {date}'], ['', ', תודה', ' בבקשה']),
    ...X(['צריך את {obj} {date}', 'צריכה את {obj} {date}', 'עדיין צריך את {obj} {date}', 'חסר לי {obj} {date}'], ['', ', תודה']),
    '{obj} {date} בבקשה', '{obj} {date} פליז', 'את {obj} {date}, תודה', 'מה עם {obj}?', 'מה המצב עם {obj}?', 'עדכון לגבי {topic}?', 'איפה עומד {topic}?',
    'לאשר את {topic} {date}?', 'מאשר את {topic}?', 'מאשרת את {topic}?', 'תאשר {topic} {date}', 'תחזור אליי {date} לגבי {topic}', 'תחזרי אליי לגבי {topic} {date}',
    'תעבור על {obj} ותחזיר הערות {date}', 'תעברי על {obj} {date}', 'לחתום על {obj} ולהחזיר {date}', 'תחתום על {obj} {date}?', 'למלא את {obj} {date} בבקשה', 'לעדכן את {obj} ולשלוח שוב {date}'
  ],
  payment: ['לשלם {amt} ל{vendor} {date}', 'נא לשלם {amt} {date}', 'תעביר {amt} {date}', '{amt} לתשלום {date}', 'חשבונית {amt} – לתשלום {date}', 'תסגור את היתרה של {amt} {date}?', 'תזכורת: תשלום {amt} {date}', 'אפשר להעביר {amt} {date}?'],
  meeting: [
    ...X(['{meet} {day} {time}?', 'פנוי ל{meet} {day} {time}?', 'פנויה ל{meet} {day} {time}?', 'אפשר {meet} {day} {time}?', 'מתאים {meet} {day} {time}?'], ['', ' תודה']),
    'לקבוע {meet} עם {vendor} {day} {time}', 'תקבע {meet} {day} {time}', 'להזיז את ה{meet} ל{day} {time}?', 'תתקשר אליי {day} {time}', 'נדבר {day} {time}?'
  ],
  calendar_hold: ['לשריין {day} {time} ל{meet}', 'תשריין {day} {time}', 'תחסום {day} {time} ל{topic}', 'שמור את {day} {time} פנוי ל{meet}'],
  drive_save: ['תשמור את המצורף {dest}', 'לשמור את הקובץ המצורף {dest} בבקשה', 'תשמרי את {obj} המצורף {dest}', 'מצורף {obj} – לשמור {dest}', 'להעלות את המצורף {dest}', 'תעלה את הקובץ {dest}'],
  onedrive_save: ['תשמור את המצורף בוואן דרייב', 'לשמור את הקובץ המצורף ב-OneDrive', 'תעלי את המצורף לוואן דרייב', 'מצורף {obj} – ל-OneDrive בבקשה'],
  task_ask: ['תזכורת: {task} {date}', 'אל תשכח {task} {date}', 'אל תשכחי {task} {date}', 'נא {task} {date}', 'צריך {task} {date}', 'משימה: {task} {date}', 'תוכל {task} {date}?'],
  commitment_reader: ['אמרת שתדאג {task} {date}', 'הבטחת לשלוח את {obj} {date}', 'לפי מה שסיכמנו, אתה {task} {date}', 'נשאר עליך {task} {date}'],
  decision: ['סגרנו עם {vendor}', 'מאושר – הולכים עם {vendor} ב-{amt}', 'החלטה: {vendor}, {amt}', 'אור ירוק ל{topic}'],
  sender_commitment: ['אשלח את {obj} {date}', 'אעביר לך את {obj} {date}', 'נעביר את התשלום של {amt} {date}', 'אאשר את {topic} {date}', 'נשלם {amt} {date}', 'אחזור אליך לגבי {topic} {date}', 'נכין את {obj} {date}'],
  event_statement: ['ה{meet} {day} {time}', 'ה{meet} נקבע ל{day} {time}', 'נפגשים {day} {time} במשרד', 'מאושר: {meet} {day} {time}', 'נתראה {day} {time} ב{meet}'],
  decision_statement: ['{topic} אושר ב-{amt}', 'הולכים עם {vendor}', 'התקציב אושר: {amt}', 'החלטנו: {vendor} ב-{amt}'],
  ack: ['תודה, קיבלתי', 'קיבלתי את {obj}, תודה', '{obj} התקבל', 'מעולה, תודה!', 'רשמתי', 'תודה!', 'נשמע טוב', 'סגור', 'אין בעיה', 'מטפל בזה'],
  fyi: ['לידיעתך, {obj} מצורף', 'לידיעתך – {topic} הסתיים', '{obj} מצורף לתיעוד', 'רק לידיעה, לא נדרשת פעולה', 'עדכון: {topic} עבר ל{day}', 'לידיעתך, {vendor} חתמו'],
  negation: ['אל תשלח את {obj} עדיין', 'לא צריך לשלם {amt}', 'תעצור עם {obj}', 'תתעלם מהמייל הקודם', 'עזוב את {obj}', 'אל תשמור את המצורף', 'אין צורך לענות'],
  hedge: ['אולי תסתכל על {obj} מתישהו', 'לא דחוף לגבי {obj}', 'אם יוצא לך, {obj}', 'מתי שנוח, לא דחוף'],
  past: ['שילמתי {amt} {date}', 'שלחתי את {obj} אתמול', 'ה{meet} היה מצוין, תודה', 'חתמתי ותייקתי את {obj}'],
  cancelled: ['ה{meet} {day} מבוטל', 'מבטלים את ה{meet} {day}, סליחה', 'אין {meet} {day}']
};
// subject-only fillers (body nearly empty, the ask lives in the subject line)
const SUBJECT_ONLY_FILLER = { en: ['', 'Thanks', 'thx', 'See subject', '?', 'Pls', 'TIA'], he: ['', 'תודה', 'ראה נושא', '?', 'בבקשה', 'תודה מראש'] };
module.exports = { EN, HE, SUBJECT_ONLY_FILLER };
