'use strict';
// Extra phrasings (round 2) to widen template diversity — the held-out split is by template, so phrasing variety is
// what the model generalizes from. Merged into templates.cjs scenarios by build-dataset.cjs.
module.exports = {
  en: {
    request_reply: ['Send me the {obj} {date}, please.', 'Kindly forward the {obj} {date}.', 'When you get a moment, please send the {obj} {date}.',
      'Could you get the {obj} over to me {date}?', 'Please share the final {obj} with me {date}.', 'Any chance you can send the {obj} {date}?',
      'Please confirm {date} that the {obj} is final.', 'Can you sign the {obj} and send it back {date}?', 'Please sign and return the {obj} {date}.',
      'I would appreciate it if you could send the {obj} {date}.', 'Can you please approve {topic} {date}?', 'Please let me know {date} if {day} works for {topic}.'],
    payment: ['Please wire {amt} for {topic} {date}.', 'Could you process the {amt} payment {date}?', 'Please pay the {amt} renewal fee {date}.', 'The {amt} invoice for {topic} needs to be paid {date}.'],
    commitment_reader: ['Following up: you said you would send the {obj} {date}.', 'You mentioned you would {task} {date}.', 'As promised on the call, you will share the {obj} {date}.'],
    meeting: ['How about a {meet} on {day} at {time}?', 'Let\'s set up a {meet} for {day} at {time}.', 'I booked a {meet} for us on {day} at {time} to cover {topic}.',
      'Can you do {day} at {time} for the {meet}?', 'Let\'s get together {day} at {time} to review {topic}.', 'Please join the {meet} on {day} at {time}.'],
    decision: ['We approved {amt} for {topic}.', 'Decision made: {vendor} is our vendor for {topic} at {amt}.', 'Confirming the amount is {amt} for {topic}.', 'We agreed on {amt} for the {topic} work.'],
    drive_save: ['Please keep the attached {obj} in {dest}.', 'Could you save the attachment to {dest} {date}?', 'Please save this attachment to {dest}.'],
    onedrive_save: ['Please keep the attached {obj} on OneDrive.', 'Could you save the attachment to OneDrive {date}?', 'Please save this attachment to OneDrive.'],
    negation: ['Please don\'t book the {meet} yet.', 'Do not pay the {amt} invoice until we confirm.', 'No need to save this attachment to {dest}.', 'Please don\'t keep the attached {obj} on OneDrive.'],
    hedge: ['If it\'s not too much trouble, maybe send the {obj} at some point.', 'We could possibly meet {day} at {time}, I\'ll confirm.', 'Perhaps save the attached file to {dest} when convenient.'],
    fyi: ['FYI: the {obj} was sent to accounting yesterday.', 'Just so you know, {topic} moved to {day}. Nothing needed from you.', 'For visibility only, the {obj} is attached.'],
    past: ['Thanks again for meeting with us yesterday about {topic}.', 'It was great speaking with you on Monday.', 'Following our call last Tuesday, all good on our side.']
  },
  he: {
    request_reply: ['שלח לי בבקשה את {obj} {date}.', 'אשמח אם תעביר לי את {obj} {date}.', 'תוכלי להעביר אליי את {obj} {date}?', 'נא לשלוח את {obj} {date}.',
      'אפשר לקבל ממך את {obj} {date}?', 'בבקשה תחתום על {obj} ותחזיר אליי {date}.', 'תאשר לי בבקשה {date} שהמסמך סופי.', 'נשמח לקבל את {obj} {date}.',
      'תעדכן אותי {date} אם {topic} מאושר.', 'אפשר לשלוח לי את {obj} המעודכן {date}?', 'תוכל לבדוק את {obj} ולאשר {date}?', 'אני צריך ממך את {obj} {date}.'],
    payment: ['נא להעביר {amt} {date}.', 'אפשר לשלם את החשבונית של {amt} {date}?', 'בבקשה להעביר את דמי החידוש בסך {amt} {date}.', 'צריך לשלם {amt} עבור {topic} {date}.'],
    commitment_reader: ['אמרת שתשלח את {obj} {date}.', 'הבטחת {task} {date}.', 'כמו שסיכמנו בשיחה, אתה מעביר את {obj} {date}.', 'רק תזכורת: התחייבת לשלוח את {obj} {date}.'],
    meeting: ['מה דעתך על {meet} {day} {time}?', 'קבעתי לנו {meet} {day} {time} בנושא {topic}.', 'תוכל להגיע ל{meet} {day} {time}?', 'בוא ניפגש {day} {time} לעבור על {topic}.',
      'אני מזמין אותך ל{meet} {day} {time}.', 'נדבר {day} {time} על {topic}?'],
    decision: ['אישרנו {amt} עבור {topic}.', 'הוחלט: {vendor} הספק שלנו ל{topic} ב-{amt}.', 'מאשר שהסכום הוא {amt} עבור {topic}.', 'סגרנו על {amt} לעבודה על {topic}.'],
    task_ask: ['תזכיר לי {task} {date}.', 'בבקשה תרשום משימה {task} {date}.', 'צריך להוסיף למשימות {task} {date}.'],
    calendar_hold: ['אתקשר {day} {time} לגבי {topic}.', 'אצטרף ל{meet} {day} {time}.', 'אהיה אצלכם {day} {time}.'],
    drive_save: ['שמור בבקשה את הקובץ המצורף {dest}.', 'אפשר לשמור את המצורף {dest} {date}?', 'נא לשמור את {obj} המצורף {dest}.'],
    onedrive_save: ['שמור בבקשה את הקובץ המצורף ב-OneDrive.', 'אפשר לשמור את המצורף בוואן דרייב {date}?'],
    negation: ['אל תשלם את החשבונית של {amt} עד שנאשר.', 'אין צורך לקבוע את ה{meet}.', 'לא צריך לשלוח את {obj}.', 'בבקשה אל תשמרי את המצורף {dest}.'],
    hedge: ['אם יוצא לך, אולי תעביר את {obj}.', 'אולי נדבר {day} {time}, אאשר.', 'אולי כדאי לשמור את הקובץ {dest} מתישהו.'],
    fyi: ['לידיעתך, {obj} נשלח להנהלת החשבונות אתמול.', 'רק שתדע, {topic} זז ל{day}. לא נדרש ממך כלום.', 'לעדכונך בלבד, {obj} מצורף.'],
    past: ['תודה שנפגשתם איתנו אתמול לגבי {topic}.', 'היה נעים לדבר ביום שני.', 'בהמשך לשיחה שלנו בשבוע שעבר, הכל טוב מצדנו.'],
    third_party: ['{name}, תעביר בבקשה את {obj} ל{vendor} {date}.', '{name}, תוכלי לטפל בתשלום של {amt} {date}?'],
    ack: ['סבבה, תודה.', 'קיבלתי, תודה רבה!', 'מעולה, נדבר.']
  }
};
