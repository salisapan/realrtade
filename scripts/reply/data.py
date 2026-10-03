# Reply-outcome data, written by the build-time teacher (the assistant), NOT by real senders. Two banks per class and language:
#  TRAIN banks use {N} (a thing asked for) and {D} (a day) slots and are expanded by build.py; EVAL banks are plain, hand-written, never expanded,
#  never seen by the trainer. Classes: ANSWERED (the request is truly finished or decided), INTERIM (a reply that leaves it open),
#  ACK (thanks / got it), OTHER (unrelated, social, forwarding, out of office), HANDBACK (they need something from you), DECLINED.
TRAIN = {
 "ANSWERED": {
  "en": ["Confirmed, the {N} is approved.", "Done, I just sent you the {N}.", "Yes, go ahead with the {N}.", "Attached is the signed {N}.", "The {N} is 4,200 as discussed, all good on our side.", "I've signed the {N} and returned it.", "Approved, please proceed.", "Sorted, the {N} has been paid this morning.", "Yes that works, see you {D}.", "All set, the {N} is in your inbox now.", "We've confirmed it with the team, it is fine.", "Here it is, the final {N}.", "Just uploaded the {N} to the shared folder, it's there.", "Yes, the {N} is correct. Nothing to change.", "Booked for {D} at 10, you'll get the invite.", "Received and approved. Thanks for the quick turnaround, we're good to go.", "The {N} was transferred, reference 88213.", "Yes, I can confirm the {N} for {D}.", "Finished, you have the final version of the {N} now.", "Okay, signed and sent back to you."],
  "he": ["אישרתי את ה{N}, אפשר להמשיך.", "שלחתי לך עכשיו את ה{N}.", "כן, תתקדמו עם ה{N}.", "מצורף ה{N} החתום.", "ה{N} על 4,200 כמו שסיכמנו, הכול טוב מבחינתנו.", "חתמתי על ה{N} והחזרתי.", "מאושר, אפשר להתקדם.", "סגור, שילמתי את ה{N} הבוקר.", "כן זה מתאים, נתראה {D}.", "הכול מוכן, ה{N} אצלך במייל.", "אישרנו מול הצוות, זה בסדר.", "הנה זה, ה{N} הסופי.", "העליתי את ה{N} לתיקייה המשותפת, הוא שם.", "כן, ה{N} נכון, אין מה לשנות.", "נקבע ל{D} בעשר, תקבל זימון.", "קיבלתי ואישרתי, תודה על המהירות, אנחנו בסדר.", "ה{N} הועבר, אסמכתא 88213.", "כן, אני מאשר את ה{N} ל{D}.", "סיימתי, יש לך את הגרסה הסופית של ה{N}.", "אוקיי, חתמתי ושלחתי בחזרה."]
 },
 "INTERIM": {
  "en": ["Looking into the {N} now, will update you.", "Let me check on the {N} and see what I can do.", "Working on the {N}, not finished yet.", "I've started on the {N} but need a bit more time.", "Still waiting on the {N} from our finance team.", "I'll look at it when I get a chance.", "Thanks, I'll look into it.", "I passed the {N} to my manager, no answer yet.", "Not sure yet about the {N}, I'll find out.", "It's on my list, haven't got to the {N} yet.", "Checking with legal on the {N}.", "Sent half of the {N}, the rest is still missing.", "We're still reviewing the {N} internally.", "Haven't had time for the {N} this week, sorry.", "I'm gathering the details for the {N}.", "Waiting to hear back from the vendor about the {N}.", "Will get to it, been a crazy few days.", "The {N} is almost ready, a few things left.", "Need to double check some things before I can give you the {N}.", "Let me see what the others think about the {N}."],
  "he": ["בודק את ה{N} עכשיו, אעדכן.", "תן לי לבדוק מה אפשר לעשות עם ה{N}.", "עובד על ה{N}, עוד לא סיימתי.", "התחלתי עם ה{N} אבל צריך עוד קצת זמן.", "עדיין מחכה ל{N} מהכספים.", "אסתכל על זה כשיהיה לי רגע.", "תודה, אבדוק את זה.", "העברתי את ה{N} למנהל, עוד אין תשובה.", "עוד לא בטוח לגבי ה{N}, אברר.", "זה ברשימה שלי, לא הגעתי ל{N} עדיין.", "מתייעץ עם המשפטי לגבי ה{N}.", "שלחתי חצי מה{N}, השאר עוד חסר.", "אנחנו עדיין בוחנים את ה{N} פנימית.", "לא היה לי זמן ל{N} השבוע, סליחה.", "אוסף את הפרטים בשביל ה{N}.", "מחכה לתשובה מהספק על ה{N}.", "אגיע לזה, היו כמה ימים מטורפים.", "ה{N} כמעט מוכן, נשארו כמה דברים.", "צריך לבדוק עוד כמה דברים לפני שאוכל לתת לך את ה{N}.", "אשמע מה האחרים חושבים על ה{N}."]
 },
 "ACK": {
  "en": ["Got it, thanks!", "Thanks for sending that.", "Noted, thank you.", "Ok thanks.", "Received, thank you.", "Thank you, appreciate it.", "Sounds good.", "Great, thanks for the heads up.", "Thanks, will keep that in mind.", "Perfect, thank you.", "Cheers!", "Understood.", "Thanks for the update.", "Ok, got your message.", "Much appreciated."],
  "he": ["קיבלתי, תודה!", "תודה ששלחת.", "רשמתי, תודה.", "אוקיי תודה.", "התקבל, תודה.", "תודה רבה, מעריך.", "נשמע טוב.", "מעולה, תודה על העדכון.", "תודה, אקח את זה בחשבון.", "מושלם, תודה.", "תודה!", "הבנתי.", "תודה על העדכון.", "אוקיי, קיבלתי את ההודעה.", "מעריך מאוד."]
 },
 "OTHER": {
  "en": ["I am out of the office until {D} with limited access to email.", "Hi, by the way, are you free for lunch next week?", "Forwarding this to the right person.", "Great to meet you at the conference!", "Happy new year to you and your family.", "Can I ask you about something completely different?", "FYI, we're moving offices next month.", "Please see my colleague Dan for this, he handles it now.", "Have a great weekend!", "Did you see the game last night?", "I've added you to the newsletter list.", "Our summer schedule starts in June.", "Just wanted to share this article with you.", "By the way, my new number is in the signature.", "Thanks for the invite to the event, I'll think about it."],
  "he": ["אני לא במשרד עד {D}, גישה מוגבלת למייל.", "היי, דרך אגב, אתה פנוי לארוחת צהריים בשבוע הבא?", "מעביר את זה לאדם הנכון.", "היה כיף להכיר בכנס!", "שנה טובה לך ולמשפחה.", "אפשר לשאול אותך משהו אחר לגמרי?", "לידיעתך, אנחנו עוברים משרדים בחודש הבא.", "תפנה בבקשה לדן, הוא מטפל בזה עכשיו.", "סוף שבוע נעים!", "ראית את המשחק אתמול?", "הוספתי אותך לרשימת התפוצה.", "לוח הזמנים של הקיץ מתחיל ביוני.", "רציתי לשתף אותך במאמר הזה.", "דרך אגב, המספר החדש שלי בחתימה.", "תודה על ההזמנה לאירוע, אחשוב על זה."]
 },
 "HANDBACK": {
  "en": ["Which {N} do you mean?", "Can you resend the {N}? I couldn't open it.", "I never got the {N}, can you send it again?", "The link to the {N} is broken.", "What's the budget for the {N}?", "Could you clarify what you need from me on the {N}?", "Do you want the {N} in PDF or Word?", "The file came through empty, please send again.", "Who should I address the {N} to?", "I need the account number before I can pay the {N}.", "Can you tell me which date you prefer for the {N}?", "Which version of the {N} is the latest one?", "I don't have access to the {N}, can you share it?", "What exactly should the {N} include?", "Please send me the details first, then I can do the {N}."],
  "he": ["לאיזה {N} אתה מתכוון?", "אפשר לשלוח שוב את ה{N}? לא הצלחתי לפתוח.", "לא קיבלתי את ה{N}, תוכל לשלוח שוב?", "הקישור ל{N} שבור.", "מה התקציב ל{N}?", "תוכל להבהיר מה אתה צריך ממני לגבי ה{N}?", "אתה רוצה את ה{N} ב-PDF או בוורד?", "הקובץ הגיע ריק, תשלח שוב בבקשה.", "על שם מי לכתוב את ה{N}?", "אני צריך את מספר החשבון לפני שאוכל לשלם את ה{N}.", "תגיד לי איזה תאריך מתאים לך ל{N}?", "איזו גרסה של ה{N} היא העדכנית?", "אין לי גישה ל{N}, אפשר לשתף?", "מה בדיוק צריך להיות ב{N}?", "שלח לי קודם את הפרטים ואז אוכל לעשות את ה{N}."]
 },
 "DECLINED": {
  "en": ["Sorry, we're not going ahead with the {N}.", "I can't sign the {N}, it doesn't work for us.", "We've decided to pass on the {N}.", "Unfortunately the answer is no.", "That won't be possible, we have to decline the {N}.", "We went with another vendor for the {N}.", "I'm afraid I can't approve the {N}.", "No, we are not interested in the {N}.", "We won't be able to do the {N}, sorry.", "After thinking about it, we are cancelling the {N}."],
  "he": ["סליחה, לא מתקדמים עם ה{N}.", "אני לא יכול לחתום על ה{N}, זה לא מתאים לנו.", "החלטנו לוותר על ה{N}.", "לצערי התשובה היא לא.", "זה לא יהיה אפשרי, אנחנו מסרבים ל{N}.", "בחרנו ספק אחר ל{N}.", "אני חושש שאני לא יכול לאשר את ה{N}.", "לא, אנחנו לא מעוניינים ב{N}.", "לא נוכל לעשות את ה{N}, סליחה.", "אחרי מחשבה, אנחנו מבטלים את ה{N}."]
 }
}
EVAL = {
 "ANSWERED": {
  "en": ["Yes, that's fine with me, go ahead.", "Signed copy attached.", "The numbers are correct, approved.", "I sent the transfer an hour ago, confirmation number 55120.", "Perfect, Thursday at 4 works. See you then.", "Here's the updated document with your changes.", "All done on my end, you should see it now.", "It's 3,850 for the whole project, as agreed.", "Yep, the meeting is set for Monday at 9."],
  "he": ["כן, מצוין מבחינתי, תתקדם.", "מצורף העותק החתום.", "המספרים נכונים, מאושר.", "העברתי את התשלום לפני שעה, אסמכתא 55120.", "מצוין, יום חמישי בארבע מתאים. נתראה.", "הנה המסמך המעודכן עם התיקונים שלך.", "סיימתי מצדי, אתה אמור לראות את זה עכשיו.", "זה 3,850 לכל הפרויקט, כמו שסיכמנו.", "כן, הפגישה קבועה ליום שני בתשע."]
 },
 "INTERIM": {
  "en": ["I'll try to get to this over the weekend.", "Still going through the documents, give me a few days.", "Need to run it by my partner first.", "I haven't looked at it yet but I will.", "Let me talk to the team and see where we are.", "Looking into it, nothing to report yet.", "We are in the middle of our quarterly close, I'll come back to this after.", "Almost there, just waiting on one signature from my side.", "Can't promise anything yet, checking.", "I opened the file but didn't have time to read it properly."],
  "he": ["אנסה להגיע לזה בסוף השבוע.", "עדיין עובר על המסמכים, תן לי כמה ימים.", "צריך להתייעץ קודם עם השותף שלי.", "עוד לא הסתכלתי על זה אבל אסתכל.", "אדבר עם הצוות ואראה איפה אנחנו.", "בודק את זה, אין מה לדווח עדיין.", "אנחנו באמצע סגירת רבעון, אחזור לזה אחר כך.", "כמעט שם, מחכה לחתימה אחת מצידי.", "אי אפשר להבטיח כלום עדיין, בודק.", "פתחתי את הקובץ אבל לא הספקתי לקרוא כמו שצריך."]
 },
 "ACK": {
  "en": ["Thanks a lot!", "OK, noted.", "Got your email, thank you.", "Great, thank you for letting me know.", "Alright, thanks."],
  "he": ["בסדר, רשמתי.", "קיבלתי את המייל, תודה.", "מעולה, תודה שהודעת לי.", "טוב, תודה."]
 },
 "OTHER": {
  "en": ["I'm on vacation until the 20th, I'll respond when I'm back.", "By the way, congratulations on the new office!", "Please direct this to our accounting department.", "Hope you're doing well, it's been a while.", "Adding Sarah to this thread."],
  "he": ["אני בחופשה עד ה-20, אענה כשאחזור.", "דרך אגב, מזל טוב על המשרד החדש!", "תפנה את זה בבקשה למחלקת הנהלת החשבונות.", "מקווה שאתה בסדר, עבר הרבה זמן.", "מוסיף את שרה לשרשור."]
 },
 "HANDBACK": {
  "en": ["Can you remind me what the deadline is?", "Which account should I use?", "The attachment didn't open on my computer.", "Is this the final version or the draft?", "What do you need me to do exactly?"],
  "he": ["אתה יכול להזכיר לי מה המועד האחרון?", "באיזה חשבון להשתמש?", "הקובץ המצורף לא נפתח אצלי במחשב.", "זו הגרסה הסופית או הטיוטה?", "מה בדיוק אתה צריך שאעשה?"]
 },
 "DECLINED": {
  "en": ["We've decided not to move forward, thank you for your time.", "I won't be signing this.", "Not at this price, no.", "We're unable to commit to that date or any other.", "That's a no from me, sorry."],
  "he": ["החלטנו לא להתקדם, תודה על הזמן שלך.", "אני לא אחתום על זה.", "לא במחיר הזה, לא.", "אנחנו לא יכולים להתחייב לתאריך הזה או לאחר.", "זה לא אצלי, סליחה."]
 }
}

TRAIN2 = {
 "ANSWERED": {
  "en": ["Confirmed.", "Done.", "Approved.", "Yes.", "Sure, go ahead.", "Signed.", "Paid.", "Yes, confirmed.", "Sent, please check.", "Fine by me.", "That works for us.", "It's approved, thanks for waiting.", "You're all set.", "Yes, I received it and it's all correct.", "Go ahead, you have my approval.", "I've transferred the money, it should show tomorrow.", "Yes, I'll be there, count me in.", "Delivered this morning, tracking says signed for.", "All good, I made the changes you asked for.", "Yes, the price is fine.", "Done and dusted, nothing else needed from you.", "Never mind, found it. Thanks!", "Found it, thanks!", "Nevermind, I got it sorted.", "I figured it out, no need to resend.", "It's resolved now, thanks for your help.", "Ignore my last message, it works now.", "We reviewed the numbers with finance and the vendor can be booked at the lower rate, so go ahead on your side.", "After going through everything with the board we are happy to accept the revised terms, please send the final paperwork over.", "I checked with the warehouse and your order left this morning, the tracking number is 8831 and it should arrive by Thursday.", "We looked at both options and decided on the second one, so you can proceed with that and invoice us at the quoted price.", "The inspection went fine and the landlord signed the lease addendum yesterday, you will find the scanned copy attached to this email.", "Yes, after speaking with legal everything is cleared, the clause stays as it was and we can close this on Friday as planned.", "Thanks for waiting, I went through your proposal in detail and the scope and the price are both acceptable to us, so let us start next month.", "The invoice is settled as of today.", "Yes, 10am works.", "OK, I confirm the booking.", "I've reviewed it and it's good to go."],
  "he": ["מאושר.", "בוצע.", "אושר.", "כן.", "בטח, תתקדם.", "חתום.", "שולם.", "כן, מאושר.", "נשלח, תבדוק.", "מקובל עליי.", "זה מתאים לנו.", "אושר, תודה שחיכית.", "אתה מסודר.", "כן, קיבלתי והכול נכון.", "תתקדם, יש לך אישור ממני.", "העברתי את הכסף, אמור להופיע מחר.", "כן, אהיה שם, תחשיב אותי.", "נמסר הבוקר, המעקב אומר שנחתם.", "הכול טוב, עשיתי את השינויים שביקשת.", "כן, המחיר בסדר.", "סיימנו, לא צריך ממך עוד כלום.", "עזוב, מצאתי. תודה!", "מצאתי, תודה!", "לא משנה, הסתדרתי.", "הבנתי איך עושים את זה, אין צורך לשלוח שוב.", "זה נפתר עכשיו, תודה על העזרה.", "תתעלם מההודעה הקודמת, זה עובד עכשיו.", "עברנו על המספרים עם הכספים והספק יכול להיסגר במחיר הנמוך, אז תתקדם מהצד שלך.", "אחרי שעברנו על הכול עם ההנהלה אנחנו שמחים לקבל את התנאים המעודכנים, שלח בבקשה את המסמכים הסופיים.", "בדקתי מול המחסן וההזמנה שלך יצאה הבוקר, מספר המעקב 8831 וזה אמור להגיע עד יום חמישי.", "בחנו את שתי האפשרויות והחלטנו על השנייה, אז אפשר להתקדם איתה ולחייב אותנו במחיר שהוצע.", "הבדיקה עברה בסדר והבעלים חתם אתמול על תוספת החוזה, תמצא את העותק הסרוק מצורף למייל הזה.", "כן, אחרי שדיברתי עם המשפטי הכול מאושר, הסעיף נשאר כמו שהיה ונוכל לסגור את זה ביום שישי כמתוכנן.", "תודה שחיכית, עברתי על ההצעה שלך לפרטים והיקף העבודה והמחיר שניהם מקובלים עלינו, אז נתחיל בחודש הבא.", "החשבונית סגורה מהיום.", "כן, עשר בבוקר מתאים.", "אוקיי, אני מאשר את ההזמנה.", "עברתי על זה וזה מוכן."]
 },
 "INTERIM": {
  "en": ["Looking into it.", "On it.", "Will check.", "Let me check.", "Checking.", "I'll get back to you.", "Working on it.", "Let me think about it.", "Give me a day or two.", "Will let you know.", "Not yet, still working on it.", "I'm on it, nothing yet.", "Bear with me, almost there.", "Let me look and revert.", "Hold on, I'm checking with my team.", "In progress.", "Still pending on our side.", "I'll see what I can do.", "Can't say yet.", "Under review."],
  "he": ["בודק.", "על זה.", "אבדוק.", "תן לי לבדוק.", "בבדיקה.", "אחזור אליך.", "עובד על זה.", "תן לי לחשוב על זה.", "תן לי יום או יומיים.", "אעדכן.", "עוד לא, עדיין עובד על זה.", "אני על זה, אין עדיין כלום.", "סבלנות, כמעט שם.", "אסתכל ואחזור.", "רגע, בודק עם הצוות.", "בתהליך.", "עדיין תלוי בצד שלנו.", "אראה מה אפשר לעשות.", "אי אפשר לומר עדיין.", "בבחינה."]
 },
 "ACK": {
  "en": ["Thanks.", "Thx!", "OK.", "Ok!", "Alright.", "Got it.", "Noted.", "Thank you!", "Roger that.", "Will do, thanks."],
  "he": ["תודה.", "תנקס!", "אוקיי.", "אוקי!", "בסדר.", "הבנתי.", "נרשם.", "תודה רבה!", "קיבלתי.", "סבבה, תודה."]
 },
 "OTHER": {
  "en": ["Hope you're well.", "Happy holidays!", "Out of office until Monday.", "Automatic reply: I am away.", "See attached newsletter.", "Congrats on the launch!", "How was your trip?", "Let's catch up soon.", "Sent from my iPhone.", "Unsubscribe from this list."],
  "he": ["מקווה שאתה בסדר.", "חג שמח!", "לא במשרד עד יום שני.", "מענה אוטומטי: אני לא זמין.", "ראה מצורף את הניוזלטר.", "מזל טוב על ההשקה!", "איך היה הטיול?", "בוא נתעדכן בקרוב.", "נשלח מהאייפון.", "הסר אותי מהרשימה."]
 },
 "HANDBACK": {
  "en": ["What's the deadline?", "Which one?", "Can you clarify?", "Where should I send it?", "How much is it?", "What do you mean?", "Who is this for?", "Please resend.", "Can't open it.", "Which date works for you?", "Do you have the account details?", "What's the reference number?", "Is it the new version?", "Could you explain what you need?", "The file is corrupted."],
  "he": ["מה המועד האחרון?", "איזה מהם?", "אפשר להבהיר?", "לאן לשלוח?", "כמה זה?", "למה אתה מתכוון?", "בשביל מי זה?", "שלח שוב בבקשה.", "לא נפתח.", "איזה תאריך מתאים לך?", "יש לך את פרטי החשבון?", "מה מספר האסמכתא?", "זו הגרסה החדשה?", "תוכל להסביר מה אתה צריך?", "הקובץ פגום."]
 },
 "DECLINED": {
  "en": ["No.", "Not interested.", "Sorry, no.", "We'll pass.", "Can't do it.", "Declined.", "No thanks.", "That's not going to happen.", "I have to say no.", "Not for us."],
  "he": ["לא.", "לא מעוניין.", "סליחה, לא.", "נוותר.", "לא יכול.", "נדחה.", "לא תודה.", "זה לא יקרה.", "אני חייב לומר לא.", "לא בשבילנו."]
 }
}
EVAL2 = {
 "ANSWERED": {
  "en": ["Yes, that is correct.", "OK, I've approved it.", "The signed contract is attached.", "It's done, enjoy.", "Alright, booked for Wednesday at 2.", "I have paid the invoice, here is the receipt.", "Sure, you can start.", "Great, we agree on 5,000."],
  "he": ["כן, זה נכון.", "אוקיי, אישרתי.", "החוזה החתום מצורף.", "זה בוצע, בהצלחה.", "טוב, קבענו ליום רביעי בשתיים.", "שילמתי את החשבונית, הנה הקבלה.", "בטח, אפשר להתחיל.", "מעולה, מסכימים על 5,000."]
 },
 "INTERIM": {
  "en": ["I'll look at it tomorrow.", "Haven't gotten to it yet, been swamped.", "Need a few more days, sorry.", "Let me ask around and come back to you.", "Sorry for the delay, still on it.", "I'll review it properly and let you know."],
  "he": ["אסתכל על זה מחר.", "עוד לא הגעתי לזה, הייתי מוצף.", "צריך עוד כמה ימים, סליחה.", "תן לי לשאול ולחזור אליך.", "סליחה על העיכוב, עדיין על זה.", "אעבור על זה כמו שצריך ואעדכן."]
 },
 "ACK": {
  "en": ["Thanks, got it.", "Appreciate it.", "Perfect, thanks."],
  "he": ["תודה, הבנתי.", "מעריך.", ]
 },
 "OTHER": {
  "en": ["I'm away this week, back Monday.", "Loved your talk yesterday!", "Forwarding to Mike."],
  "he": ["אני לא כאן השבוע, חוזר ביום שני.", "אהבתי את ההרצאה שלך אתמול!", "מעביר למיכאל."]
 },
 "HANDBACK": {
  "en": ["Which invoice number?", "I can't see the attachment.", "What time did you have in mind?"],
  "he": ["איזה מספר חשבונית?", "אני לא רואה את הקובץ המצורף.", "באיזו שעה חשבת?"]
 },
 "DECLINED": {
  "en": ["We're not able to proceed, apologies.", "I decline."],
  "he": ["אנחנו לא יכולים להתקדם, מתנצל.", "אני מסרב."]
 }
}
