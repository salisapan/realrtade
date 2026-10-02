// Training-data generator for the on-device intent model.
//
// The model learns from sentences produced here by a grammar: many phrasing
// frames x many objects x many verbs x tails, in English and Hebrew, with
// politeness, greetings, sign-offs, typos and decoys (statements that reuse the
// same verbs and objects as requests). It NEVER sees the hand-written
// evaluation sets in flow-trial-extension/test/fixtures/; those measure how well
// the model generalises to phrasings this grammar did not write. Seeded, so a
// run is reproducible.
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeGenerator(seed) {
  const rnd = mulberry32(seed || 7);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (p) => rnd() < p;

  // ---------------- English ----------------
  const NAMES = ['Dana', 'Sam', 'Priya', 'Tom', 'Noa', 'Alex', 'Maria', 'Jon', 'Lee', 'Yossi', 'Chen', 'Ravi', 'Emma', 'Omar', 'Lena'];
  const NP = {
    document: ['the signed contract', 'the lease', 'the NDA', 'the agreement', 'the onboarding form', 'the certificate', 'a copy of your passport', 'the ID scan', 'the tax forms', 'the W-9', 'the deck', 'the slides', 'the brochure', 'the logo files', 'the artwork', 'the photos', 'the receipts', 'the spreadsheet', 'the proposal', 'the itinerary', 'the project brief', 'the spec', 'the minutes', 'the transcript', 'the attachment', 'the paperwork', 'the application', 'the insurance policy', 'the report'],
    money: ['the invoice', 'the payment', 'the deposit', 'the balance', 'the retainer', 'the refund', 'the fee', 'the wire', 'the purchase order', 'the outstanding amount', 'the installment', 'the reimbursement', 'the March invoice', 'the transfer'],
    meeting: ['a call', 'the meeting', 'a demo', 'a walkthrough', 'an interview', 'a sync', 'the review session', 'a workshop', 'the kickoff', 'a quick chat', 'the site visit', 'a time to talk'],
    decision: ['the budget', 'the scope', 'the offer', 'the plan', 'the vendor choice', 'the timeline', 'the headcount', 'the proposal', 'the pricing', 'the new direction', 'the revised terms'],
    work: ['the draft', 'the design', 'the bug', 'the ticket', 'the migration', 'the release', 'the copy', 'the mockup', 'the checklist', 'the test plan', 'the analysis', 'the first version', 'the fix', 'the update to the site', 'the announcement'],
    info: ['the status', 'an update', 'the answer', 'the ETA', 'the address', 'the phone number', 'the details', 'your feedback', 'your thoughts', 'the numbers', 'the latest figures', 'the owner of this', 'the shipping date']
  };
  const VERBS_ASK = {
    document: ['send', 'share', 'forward', 'upload', 'attach', 'provide', 'drop me', 'email me', 'return', 'resend', 'sign', 'countersign', 'get me', 'send over', 'bring', 'point me to', 'pass along', 'hand over', 'dig up', 'track down', 're-send'],
    money: ['pay', 'send', 'wire', 'settle', 'transfer', 'release', 'process', 'confirm', 'look into', 'clear'],
    meeting: ['schedule', 'book', 'set up', 'arrange', 'find a time for', 'confirm', 'move', 'plan', 'reschedule', 'put in the calendar'],
    decision: ['approve', 'confirm', 'sign off on', 'decide on', 'choose', 'pick', 'authorize', 'green-light', 'finalize', 'accept'],
    work: ['review', 'check', 'fix', 'finish', 'complete', 'prepare', 'look at', 'proofread', 'update', 'test', 'finalize', 'comment on', 'take another pass at', 'go over', 'run through', 'have a look at', 'sanity-check', 'look through', 'weigh in on', 'pull together', 'put together', 'wrap up', 'knock out', 'polish'],
    info: ['send me', 'tell me', 'let me know', 'share', 'confirm', 'update me on', 'give me', 'reply with', 'find out', 'check']
  };
  const VERBS_PROM = {
    document: ['send', 'share', 'forward', 'upload', 'get back to you with', 'attach', 'email you', 'return', 'send over', 'drop off'],
    money: ['pay', 'send', 'wire', 'settle', 'transfer', 'release', 'process', 'clear', 'take care of'],
    meeting: ['schedule', 'book', 'set up', 'arrange', 'propose', 'put in the calendar', 'confirm', 'plan'],
    decision: ['approve', 'confirm', 'decide on', 'choose', 'sign off on', 'finalize', 'review'],
    work: ['review', 'check', 'fix', 'finish', 'complete', 'prepare', 'look at', 'update', 'test', 'draft', 'take care of', 'go over', 'run through', 'pull together', 'put together', 'wrap up', 'polish', 'sort out'],
    info: ['find out', 'check', 'look into', 'confirm', 'report back on', 'update you on', 'dig into', 'get you']
  };
  const PAST = {
    document: ['sent', 'shared', 'forwarded', 'uploaded', 'signed', 'filed', 'attached', 'returned', 'received', 'archived', 'scanned'],
    money: ['paid', 'sent', 'received', 'settled', 'wired', 'transferred', 'refunded', 'processed', 'cleared'],
    meeting: ['scheduled', 'booked', 'moved', 'arranged', 'held', 'cancelled', 'confirmed'],
    decision: ['approved', 'confirmed', 'decided on', 'rejected', 'signed off on', 'finalized', 'accepted'],
    work: ['reviewed', 'fixed', 'finished', 'completed', 'prepared', 'tested', 'updated', 'shipped', 'proofread', 'merged'],
    info: ['checked', 'confirmed', 'shared', 'updated', 'looked into', 'verified', 'found']
  };
  const TAIL_FUT = ['', '', '', ' by Friday', ' by end of day', ' before Monday', ' this week', ' tomorrow', ' today', ' by the 15th', ' as soon as you can', ' by 3pm', ' before the call', ' next week', ' by Wednesday', ' in the next day or two', ' this afternoon', ' asap'];
  const TAIL_PROM = ['', '', ' by Friday', ' by end of day', ' before Monday', ' this week', ' tomorrow', ' today', ' by the 15th', ' later today', ' tonight', ' early next week', ' by Wednesday', ' first thing in the morning', ' once legal signs off', ' as soon as I can'];
  const TAIL_PAST = ['', ' yesterday', ' last week', ' on Monday', ' this morning', ' already', ' two days ago', ' on the 3rd', ' last night', ' earlier today', ' a few days ago', ' on Friday afternoon'];
  const GREET = ['', '', '', '', 'Hi {n}, ', 'Hey {n}, ', 'Hello, ', 'Morning {n}, ', 'Quick one: ', 'Dear {n}, ', 'Hi, ', 'Hi {n}! ', 'One more thing: ', 'Following up: '];
  const SIGN = ['', '', '', '', '', ' Thanks!', ' Thanks in advance.', ' Cheers', ' Appreciate it.', ' Thank you.', ' Best,', ' Many thanks.', ' Talk soon.'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'tomorrow', 'next week', 'Thursday afternoon', 'Tuesday morning', 'later this week'];

  const ASK_FRAMES = [
    (v, np, t) => `Could you ${v} ${np}${t}?`, (v, np, t) => `Can you ${v} ${np}${t}?`, (v, np, t) => `Would you mind ${v}ing ${np}${t}?`,
    (v, np, t) => `Please ${v} ${np}${t}.`, (v, np, t) => `${cap(v)} ${np}${t}, please.`, (v, np, t) => `I need you to ${v} ${np}${t}.`,
    (v, np, t) => `We need you to ${v} ${np}${t}.`, (v, np, t) => `Any chance you could ${v} ${np}${t}?`, (v, np, t) => `Is it possible to ${v} ${np}${t}?`,
    (v, np, t) => `Would you be able to ${v} ${np}${t}?`, (v, np, t) => `Just checking if you could ${v} ${np}${t}.`, (v, np, t) => `Let me know if you can ${v} ${np}${t}.`,
    (v, np, t) => `Kindly ${v} ${np}${t}.`, (v, np, t) => `Do you think you could ${v} ${np}${t}?`, (v, np, t) => `I'd appreciate it if you could ${v} ${np}${t}.`,
    (v, np, t) => `Have you had a chance to ${v} ${np} yet?`, (v, np, t) => `Did you get a chance to ${v} ${np}?`, (v, np, t) => `Mind if we ${v} ${np}${t}?`,
    (v, np, t) => `Can we ${v} ${np}${t}?`, (v, np, t) => `Do you want to ${v} ${np}${t}?`, (v, np, t) => `Would it be possible for you to ${v} ${np}${t}?`
  ];
  const ASK_NP_FRAMES = [
    (np, t) => `We are still missing ${np} from your side.`, (np, t) => `Still waiting on ${np}.`, (np, t) => `Waiting for ${np} from you${t}.`,
    (np, t) => `Do you have ${np}?`, (np, t) => `Do you still have ${np}?`, (np, t) => `Would be great to get ${np}${t}.`, (np, t) => `I'd appreciate ${np}${t}.`,
    (np, t) => `When can I expect ${np}?`, (np, t) => `When can we expect ${np}?`, (np, t) => `What's the status of ${np}?`, (np, t) => `Reminder: ${np} is still outstanding.`,
    (np, t) => `Gentle reminder about ${np}.`, (np, t) => `Any news on ${np}?`, (np, t) => `Any update on ${np}?`, (np, t) => `Where are we with ${np}?`,
    (np, t) => `I haven't seen ${np} yet, can you point me to it?`, (np, t) => `${cap(np)} is still pending on your side${t}.`, (np, t) => `Could I get ${np}${t}?`,
    (np, t) => `Can I get ${np}${t}?`, (np, t) => `We'd love ${np}${t}.`, (np, t) => `${cap(np)}, when you have a moment?`, (np, t) => `${cap(np)}?`
  ];
  const ASK_MEET = [
    (np) => `Are you free ${pick(DAYS)} for ${np}?`, (np) => `What works for you for ${np}?`, (np) => `Which day is best for ${np}?`, (np) => `How about ${pick(DAYS)} for ${np}?`,
    (np) => `When are you available for ${np}?`, (np) => `Let's find a time for ${np}, what suits you?`, (np) => `Does ${pick(DAYS)} work for ${np}?`, (np) => `Can we move ${np} to ${pick(DAYS)}?`
  ];
  const PROM_FRAMES = [
    (v, np, t) => `I'll ${v} ${np}${t}.`, (v, np, t) => `I will ${v} ${np}${t}.`, (v, np, t) => `We'll ${v} ${np}${t}.`, (v, np, t) => `We will ${v} ${np}${t}.`,
    (v, np, t) => `I can ${v} ${np}${t}.`, (v, np, t) => `Let me ${v} ${np} and get back to you.`, (v, np, t) => `I am going to ${v} ${np}${t}.`, (v, np, t) => `I plan to ${v} ${np}${t}.`,
    (v, np, t) => `On it, I'll ${v} ${np}${t}.`, (v, np, t) => `I should be able to ${v} ${np}${t}.`, (v, np, t) => `Leave it with me, I'll ${v} ${np}${t}.`, (v, np, t) => `I'll make sure to ${v} ${np}${t}.`,
    (v, np, t) => `Happy to ${v} ${np}${t}, will do.`, (v, np, t) => `Let me ${v} ${np}${t}.`, (v, np, t) => `We're going to ${v} ${np}${t}.`, (v, np, t) => `I'm on it, will ${v} ${np}${t}.`
  ];
  const PROM_NP_FRAMES = [
    (np, t) => `You'll get ${np}${t}.`, (np, t) => `You'll have ${np}${t}.`, (np, t) => `Expect ${np}${t}.`, (np, t) => `${cap(np)} will be with you${t}.`, (np, t) => `${cap(np)} is on its way.`,
    (np, t) => `I'll take care of ${np}${t}.`, (np, t) => `I'll sort out ${np}${t}.`, (np, t) => `We'll have ${np} ready${t}.`, (np, t) => `I'll get you ${np}${t}.`, (np, t) => `I'll handle ${np}${t}.`,
    (np, t) => `I'll circle back on ${np}${t}.`, (np, t) => `I'll keep you posted on ${np}.`
  ];
  const PROM_GENERIC = ["I'll get back to you{t}.", "I'll check and let you know{t}.", "Let me look into it and come back to you{t}.", "I'll circle back{t}.", "I'll follow up{t}.", "We'll be in touch{t}.", "I'll ping you once I know{t}.", "Will revert{t}."];
  const INFORM_FRAMES = [
    (pv, np, t) => `I ${pv} ${np}${t}.`, (pv, np, t) => `We ${pv} ${np}${t}.`, (pv, np, t) => `${cap(np)} was ${pv}${t}.`, (pv, np, t) => `${cap(np)} has been ${pv}${t}.`,
    (pv, np, t) => `We already ${pv} ${np}${t}.`, (pv, np, t) => `${pick(NAMES)} ${pv} ${np}${t}.`, (pv, np, t) => `${cap(np)} was ${pv} and filed.`,
    (pv, np, t) => `Just so you know, ${np} was ${pv}${t}.`, (pv, np, t) => `FYI, ${np} got ${pv}${t}.`, (pv, np, t) => `Good news: ${np} has been ${pv}.`
  ];
  const INFORM_STATE = [
    (np) => `Here is ${np}.`, (np) => `Attached is ${np}.`, (np) => `${cap(np)} is attached.`, (np) => `${cap(np)} arrived this morning.`, (np) => `${cap(np)} looks fine to me.`,
    (np) => `I think ${np} is mostly done.`, (np) => `${cap(np)} is in the shared folder.`, (np) => `${cap(np)} takes about two days.`,
    (np) => `${cap(np)} is standard, nothing unusual.`, (np) => `It looks like ${np} is handled by the other team.`, (np) => `${cap(np)} costs around five hundred dollars.`,
    (np) => `${cap(np)} was discussed at length in the last meeting.`, (np) => `The owner of ${np} is out of office until the 12th.`, (np) => `${cap(np)} is due on the 15th.`,
    (np) => `We charge a flat rate for ${np}.`, (np) => `I looked at ${np} and the structure is solid.`, (np) => `Our policy on ${np} changed in January.`
  ];
  const INFORM_GENERIC = ['Our office is next to the elevators.', 'Revenue was up eight percent this quarter.', 'The webinar starts at noon Eastern.', 'We are closed on Monday for the holiday.', 'The shipment left the warehouse on Tuesday.',
    'Traffic was heavy this morning.', 'The new hire starts next month.', 'It rained all weekend.', 'The server was restarted overnight.', 'Our flight lands at six.', 'The quarterly numbers look healthy.', 'The conference was well attended.',
    'The team is based in Lisbon.', 'Version two ships in the spring.', 'The room seats about forty people.', 'I am out of the office until Monday.', 'Dana is on vacation next week.'];
  // Phrases that LOOK like requests but are not: the standard email boilerplate
  // ("Please find attached"), idioms, rhetorical questions.
  const EN_DECOYS_INFORM = ['Please find attached {np}.', 'Please see below for {np}.', 'Please note that {np} is due on the 15th.', 'Please be aware that {np} has changed.', 'Please find {np} enclosed for your records.', 'Please note the office is closed on Monday.', 'Please see the attached notes from the call.', 'Kindly note that the portal will be down tonight.', 'Please be advised that {np} was updated this morning.'];
  const EN_DECOYS_ACK = ['Please enjoy the rest of your day.', 'Please give my regards to the team.', 'Please accept my apologies for the delay.', 'Could you believe how fast that went?', 'Can you believe it?', 'Would you look at that, it worked!', "Isn't that great news?", 'Please excuse the typos.', 'Please take care of yourself.', 'Do you know what, that is brilliant.', 'Can you imagine, it is already October.'];
  const HE_DECOYS_INFORM = ['נא לשים לב ש{np} השתנה.', 'ראה מצורף את {np}.', 'לידיעתך, {np} עודכן הבוקר.', 'שים לב, המשרד סגור ביום שני.', 'נא לשים לב: הפורטל לא יהיה זמין הלילה.', 'מצורפות הערות מהשיחה.'];
  const HE_DECOYS_ACK = ['בבקשה תיהנו משארית היום.', 'תמסור דרישת שלום לצוות.', 'אתה מאמין כמה מהר זה עבר?', 'אפשר להאמין, כבר אוקטובר.', 'איזה יופי, זה עבד!', 'בבקשה סלח על הטעויות.', 'שמור על עצמך בבקשה.'];
  // Questions that are conversation, not a task: nobody needs to be chased for them.
  const EN_SOCIAL_Q = ['Are you coming to the party on Friday?', 'Will you be at the conference this year?', 'Will you be in town next month?', 'Did you have a good trip?', 'Have you tried the new cafe downstairs?', 'Are you going to the game tonight?', 'Will you be joining us for lunch?', 'Did you enjoy the show?', 'How was your weekend?', 'Are you around next week?', 'Will you be at the offsite in {city}?', 'Do you like the new layout?', 'Have you been to {city} before?'].concat(['Will you be at the {ev} {when}?', 'Will you be attending the {ev} {when}?', 'Are you going to the {ev} {when}?', 'Are you joining the {ev} {when}?', 'Will you make it to the {ev} {when}?', 'Are you coming to the {ev} {when}?', 'Will you be at the {ev} meeting {when}?'].map(function (t) { return t; }));
  const SOCIAL_EV = ['offsite', 'conference', 'party', 'dinner', 'team lunch', 'workshop', 'summit', 'happy hour', 'wedding', 'barbecue', 'retreat', 'meetup'];
  const SOCIAL_WHEN = ['next Tuesday afternoon', 'on Friday', 'this year', 'tomorrow evening', 'next week', 'on Thursday', 'this weekend', 'next month'];
  const HE_SOCIAL_Q = ['אתה בא למסיבה ביום שישי?', 'תהיה בכנס השנה?', 'תהיה בעיר בחודש הבא?', 'היה לך טיול טוב?', 'ניסית את בית הקפה החדש?', 'אתה הולך למשחק הערב?', 'תצטרף אלינו לארוחת צהריים?', 'נהנית מההופעה?', 'איך היה סוף השבוע?', 'אתה בסביבה בשבוע הבא?', 'תהיה בנופש בעיר {city}?', 'אהבת את העיצוב החדש?'];
  const CITIES = ['Lisbon', 'Berlin', 'Boston', 'Tel Aviv', 'Austin', 'Paris'];
  const THANKS_FOR = ['Thanks for the {x}.', 'Thank you for the {x}.', 'Thanks for your {x}.', 'Great {x} today.', 'Appreciate the {x}.', 'Thanks again for the {x}.', 'Loved the {x}.', 'Enjoyed the {x} today.'];
  const THANKS_X = ['call', 'meeting', 'help', 'quick reply', 'update', 'chat', 'presentation', 'intro', 'lunch', 'coffee', 'feedback', 'time', 'support', 'heads up', 'walkthrough', 'demo', 'note', 'prompt response'];
  const HTHANKS_FOR = ['תודה על ה{x}.', 'תודה רבה על ה{x}.', 'היה מעולה, ה{x} היום.', 'מעריך את ה{x}.', 'נהניתי מה{x}.'];
  const HTHANKS_X = ['שיחה', 'פגישה', 'עזרה', 'מענה המהיר', 'עדכון', 'מצגת', 'היכרות', 'ארוחה', 'משוב', 'זמן', 'תמיכה', 'הערה', 'הדגמה'];
  const ACK_PARTS = ['Thanks!', 'Thank you so much.', 'Thanks a lot, really helpful.', 'Got it.', 'Got it, thanks.', 'Sounds good.', 'Sounds great to me.', 'Perfect.', 'Perfect, thank you.', 'Noted.', 'Noted, thanks for the heads up.', 'Appreciate it.', 'Much appreciated.', 'No problem at all.',
    'Talk soon.', 'Speak soon.', 'Have a great weekend!', 'Have a good one.', 'Best regards', 'Kind regards', 'Cheers.', 'Congrats on the launch!', 'Congratulations, well deserved.', 'Happy to help.', 'Understood.', 'Okay.', 'Sure thing.', 'Absolutely.', 'Love it.',
    'Looking forward to it.', 'Looking forward to seeing you.', 'Hope you are well.', 'Take care.', 'Welcome aboard!', 'Thanks for the quick reply.', 'Thanks for your help with this.', 'Thanks for sending that over.', 'Thanks for letting me know.', 'Thanks for the update.',
    'Great, see you then.', 'Great, see you Tuesday.', 'Awesome, thanks.', 'That works, thank you.', 'No worries, take your time.', 'All good on my side.', 'Wonderful news.', 'Thanks again for your time today.', 'Enjoy your trip!', 'Sorry for the delay.', 'Thank you both.', 'Glad that worked out.'];
  const EINFORM_DECIDE = ['We decided to go with the second option.', 'We postponed it to next quarter.', 'Legal reviewed it and signed off.', 'Management has not decided on hiring yet.', 'The board met and approved the plan.', 'We settled it with the vendor last week.', 'The team reached a conclusion after the review.'];

  // ---------------- Hebrew ----------------
  const HNP = {
    document: ['את החוזה החתום', 'את ההסכם', 'את הטופס', 'את התעודה', 'את הסריקה של הדרכון', 'את המצגת', 'את הקבצים', 'את התמונות', 'את הקבלות', 'את הגיליון', 'את ההצעה', 'את המסמך', 'את הנספח', 'את האישור', 'את הדוח'],
    money: ['את התשלום', 'את החשבונית', 'את המקדמה', 'את היתרה', 'את ההחזר', 'את העמלה', 'את ההעברה הבנקאית', 'את התשלום על החשבונית'],
    meeting: ['פגישה', 'שיחה', 'הדגמה', 'את הפגישה', 'מפגש', 'שיחת סנכרון', 'את הביקור באתר'],
    decision: ['את התקציב', 'את ההיקף', 'את ההצעה', 'את התוכנית', 'את הבחירה בספק', 'את לוח הזמנים', 'את התמחור'],
    work: ['את הטיוטה', 'את העיצוב', 'את הבאג', 'את הגרסה', 'את הרשימה', 'את התוכנית לבדיקות', 'את הניתוח', 'את התיקון', 'את ההודעה'],
    info: ['את הסטטוס', 'עדכון', 'את התשובה', 'את הכתובת', 'את מספר הטלפון', 'את הפרטים', 'משוב', 'את המספרים']
  };
  const HVERB = {
    document: { inf: ['לשלוח', 'להעביר', 'לחתום על', 'להעלות', 'לצרף', 'להחזיר', 'לשתף', 'לספק'], imp: ['שלח', 'העבר', 'חתום על', 'העלה', 'צרף', 'החזר', 'שתף'], fut: ['אשלח', 'אעביר', 'אחתום על', 'אעלה', 'אצרף', 'אחזיר', 'אשתף'], futp: ['נשלח', 'נעביר', 'נחתום על', 'נעלה', 'נצרף', 'נחזיר'], past: ['שלחתי', 'העברתי', 'חתמתי על', 'העליתי', 'צירפתי', 'החזרתי', 'קיבלתי'], pass: ['נשלח', 'הועבר', 'נחתם', 'הועלה', 'צורף', 'הוחזר', 'התקבל'] },
    money: { inf: ['לשלם', 'להעביר', 'לסגור', 'לשחרר', 'לטפל ב', 'לאשר'], imp: ['שלם', 'העבר', 'סגור', 'שחרר', 'טפל ב', 'אשר'], fut: ['אשלם', 'אעביר', 'אסגור', 'אשחרר', 'אטפל ב', 'אאשר'], futp: ['נשלם', 'נעביר', 'נסגור', 'נשחרר', 'נטפל ב'], past: ['שילמתי', 'העברתי', 'סגרתי', 'שחררתי', 'קיבלתי', 'טיפלתי ב'], pass: ['שולם', 'הועבר', 'נסגר', 'שוחרר', 'התקבל', 'טופל'] },
    meeting: { inf: ['לקבוע', 'לתאם', 'לארגן', 'לאשר', 'להזיז', 'לתכנן'], imp: ['קבע', 'תאם', 'ארגן', 'אשר', 'הזז', 'תכנן'], fut: ['אקבע', 'אתאם', 'אארגן', 'אאשר', 'אזיז', 'אציע זמן ל'], futp: ['נקבע', 'נתאם', 'נארגן', 'נאשר'], past: ['קבעתי', 'תיאמתי', 'ארגנתי', 'אישרתי', 'הזזתי', 'ביטלתי'], pass: ['נקבעה', 'תואמה', 'אורגנה', 'אושרה', 'הוזזה', 'בוטלה'] },
    decision: { inf: ['לאשר', 'להחליט על', 'לבחור', 'לחתום על', 'לסגור', 'לקבל'], imp: ['אשר', 'החלט על', 'בחר', 'חתום על', 'סגור', 'קבל'], fut: ['אאשר', 'אחליט על', 'אבחר', 'אחתום על', 'אסגור', 'אקבל'], futp: ['נאשר', 'נחליט על', 'נבחר', 'נסגור'], past: ['אישרתי', 'החלטתי על', 'בחרתי', 'חתמתי על', 'סגרתי', 'דחיתי'], pass: ['אושר', 'הוחלט', 'נבחר', 'נחתם', 'נסגר', 'נדחה'] },
    work: { inf: ['לבדוק', 'לעבור על', 'לתקן', 'לסיים', 'להשלים', 'להכין', 'לבחון', 'לעדכן'], imp: ['בדוק', 'עבור על', 'תקן', 'סיים', 'השלם', 'הכן', 'בחן', 'עדכן'], fut: ['אבדוק', 'אעבור על', 'אתקן', 'אסיים', 'אשלים', 'אכין', 'אבחן', 'אעדכן'], futp: ['נבדוק', 'נעבור על', 'נתקן', 'נסיים', 'נכין', 'נעדכן'], past: ['בדקתי', 'עברתי על', 'תיקנתי', 'סיימתי', 'השלמתי', 'הכנתי', 'בחנתי', 'עדכנתי'], pass: ['נבדק', 'תוקן', 'הסתיים', 'הושלם', 'הוכן', 'עודכן'] },
    info: { inf: ['לעדכן', 'לשלוח', 'לברר', 'לבדוק', 'לאשר', 'להשיב'], imp: ['עדכן', 'שלח', 'ברר', 'בדוק', 'אשר', 'השב'], fut: ['אעדכן', 'אשלח', 'אברר', 'אבדוק', 'אאשר', 'אשיב'], futp: ['נעדכן', 'נשלח', 'נברר', 'נבדוק'], past: ['עדכנתי', 'שלחתי', 'בררתי', 'בדקתי', 'אישרתי'], pass: ['עודכן', 'נשלח', 'התברר', 'נבדק', 'אושר'] }
  };
  const HTAIL_FUT = ['', '', 'עד יום חמישי', 'עד סוף היום', 'לפני יום שני', 'השבוע', 'מחר', 'היום', 'בהקדם', 'לפני הפגישה', 'עד ה-15', 'בשבוע הבא', 'עד יום רביעי', 'עד הצהריים', 'בהקדם האפשרי', 'עד סוף השבוע'];
  const HTAIL_PROM = ['', '', 'עד יום חמישי', 'עד סוף היום', 'לפני יום שני', 'השבוע', 'מחר', 'היום', 'הערב', 'בתחילת השבוע הבא', 'עד יום רביעי', 'מחר בבוקר', 'ברגע שאוכל', 'ברגע שהמשפטי יאשר'];
  const HTAIL_PAST = ['', 'אתמול', 'בשבוע שעבר', 'ביום שני', 'הבוקר', 'כבר', 'לפני יומיים', 'ב-3 בחודש', 'אתמול בערב', 'מוקדם יותר היום', 'לפני כמה ימים', 'ביום שישי אחר הצהריים'];
  const HGREET = ['', '', '', 'היי, ', 'שלום, ', 'בוקר טוב, ', 'היי {n}, ', 'שלום {n}, ', 'רק עניין אחד: ', 'בהמשך לשיחה: '];
  const HNAMES = ['דנה', 'יוסי', 'נועה', 'גיל', 'מאיה', 'רון', 'שירה', 'עומר', 'ליאור', 'תמר'];
  const HASK_FRAMES = [
    (inf, np, t) => `תוכל ${inf} ${np} ${t}?`, (inf, np, t) => `תוכלי ${inf} ${np} ${t}?`, (inf, np, t) => `תוכלו ${inf} ${np} ${t}?`, (inf, np, t) => `אפשר ${inf} ${np} ${t}?`,
    (inf, np, t) => `נא ${inf} ${np} ${t}.`, (inf, np, t) => `בבקשה ${inf} ${np} ${t}.`, (inf, np, t) => `אשמח אם תוכל ${inf} ${np} ${t}.`, (inf, np, t) => `צריך ש${hfut2(inf)} ${np} ${t}.`,
    (inf, np, t) => `הספקת ${inf} ${np}?`, (inf, np, t) => `יש סיכוי שתוכל ${inf} ${np} ${t}?`, (inf, np, t) => `אפשר בבקשה ${inf} ${np} ${t}?`, (inf, np, t) => `האם תוכל ${inf} ${np} ${t}?`,
    (inf, np, t) => `מבקש ${inf} ${np} ${t}.`, (inf, np, t) => `אני צריך ${inf} ${np} ${t}.`
  ];
  const HASK_IMP = [(imp, np, t) => `${imp} לי ${np} ${t}.`, (imp, np, t) => `${imp} ${np} ${t}, בבקשה.`, (imp, np, t) => `בבקשה ${imp} ${np} ${t}.`];
  const HASK_NP = [
    (np, t) => `אשמח לקבל ${np} ${t}.`, (np, t) => `עדיין מחכה ל${strip(np)} ${t}.`, (np, t) => `ממתין ל${strip(np)} ממך.`, (np, t) => `חסר לנו ${strip(np)} מהצד שלכם.`, (np, t) => `יש לך ${strip(np)}?`,
    (np, t) => `מתי אפשר לקבל ${np}?`, (np, t) => `מה המצב עם ${strip(np)}?`, (np, t) => `תזכורת: ${strip(np)} עדיין פתוח.`, (np, t) => `יש עדכון לגבי ${strip(np)}?`, (np, t) => `אפשר לקבל ${np} ${t}?`, (np, t) => `צריך ${strip(np)} ${t}.`
  ];
  const HPROM_FRAMES = [
    (fut, np, t) => `${fut} ${np} ${t}.`, (fut, np, t) => `אני ${fut} ${np} ${t}.`, (fut, np, t) => `אני על זה, ${fut} ${np} ${t}.`, (fut, np, t) => `בטח, ${fut} ${np} ${t}.`, (fut, np, t) => `אדאג ש${strip(np)} יהיה מוכן ${t}.`,
    (fut, np, t) => `תן לי ${hinf(fut)} ${np}, אחזור אליך.`, (fut, np, t) => `אחרי שאבדוק, ${fut} ${np} ${t}.`
  ];
  const HPROM_FUTP = [(futp, np, t) => `${futp} ${np} ${t}.`, (futp, np, t) => `אנחנו ${futp} ${np} ${t}.`];
  const HPROM_EXTRA = [
    (fut, np, t) => `תקבל ${np} ${t}.`, (fut, np, t) => `${strip(np)} יהיה אצלך ${t}.`, (fut, np, t) => `${strip(np)} יישלח אליך ${t}.`, (fut, np, t) => `${pick(['הצוות', 'המשפטי', 'הנה"ח', 'הספק', 'השותף שלנו'])} יטפל ב${strip(np)} ${t}.`,
    (fut, np, t) => `${strip(np)} יטופל ${t}.`, (fut, np, t) => `נוכל להשלים את ${strip(np)} ${t}.`, (fut, np, t) => `יהיה לך את ${strip(np)} ${t}.`
  ];
  const HINFORM_DECIDE = ['החלטנו ללכת על האפשרות השנייה.', 'החלטנו לדחות את זה לרבעון הבא.', 'אישרנו את השינוי בישיבה.', 'הנהלה עדיין לא החליטה לגבי הגיוס.', 'המשפטי בדק ואישר.', 'סגרנו את העניין מול הספק.', 'הצוות שלנו הגיע למסקנה אחרי הבדיקה.'];
  const HPROM_GENERIC = ['אחזור אליך {t}.', 'אבדוק ואעדכן {t}.', 'אטפל בזה {t}.', 'אני על זה.', 'אעדכן אותך ברגע שאדע.', 'נחזור אליכם {t}.', 'אברר ואחזור אליך {t}.', 'אשאיר אותך מעודכן.'];
  const HINFORM_FRAMES = [
    (past, np, t) => `${past} ${np} ${t}.`, (past, np, t) => `כבר ${past} ${np} ${t}.`, (past, np, t) => `${strip(np)} ${pickPass(past)} ${t}.`, (past, np, t) => `רק שתדע, ${past} ${np} ${t}.`
  ];
  const HINFORM_STATE = [
    (np) => `מצורף ${strip(np)}.`, (np) => `הנה ${strip(np)}.`, (np) => `${strip(np)} הגיע הבוקר.`, (np) => `נראה לי ש${strip(np)} כמעט מוכן.`, (np) => `${strip(np)} לוקח בערך יומיים.`,
    (np) => `${strip(np)} סטנדרטי, אין שום דבר חריג.`, (np) => `${strip(np)} נדון בהרחבה בפגישה האחרונה.`, (np) => `הגרסה של ${strip(np)} השתנתה בינואר.`, (np) => `${strip(np)} נמצא בתיקייה המשותפת.`
  ];
  const HINFORM_GENERIC = ['המשרד שלנו ליד המעליות.', 'ההכנסות עלו בשמונה אחוזים ברבעון.', 'הוובינר מתחיל בצהריים.', 'אנחנו סגורים ביום שני בגלל החג.', 'המשלוח יצא מהמחסן ביום שלישי.', 'הייתה תנועה כבדה הבוקר.',
    'העובד החדש מתחיל בחודש הבא.', 'ירד גשם כל סוף השבוע.', 'השרת הופעל מחדש בלילה.', 'הטיסה שלנו נוחתת בשש.', 'המספרים הרבעוניים נראים בריאים.', 'הכנס היה מלא.', 'הצוות יושב בליסבון.', 'אני לא במשרד עד יום שני.', 'דנה בחופשה בשבוע הבא.'];
  const HACK = ['תודה!', 'תודה רבה.', 'תודה רבה, זה עזר.', 'קיבלתי.', 'קיבלתי, תודה.', 'נשמע טוב.', 'נשמע מצוין.', 'מושלם.', 'מושלם, תודה.', 'רשמתי.', 'מעריך את זה.', 'אין בעיה בכלל.', 'נדבר בקרוב.', 'שבוע טוב!', 'סופ"ש נעים!', 'בברכה', 'להתראות.',
    'מזל טוב על ההשקה!', 'בשמחה.', 'הבנתי.', 'סבבה.', 'אוקיי.', 'בטח.', 'מצפה לזה.', 'מצפה לראות אותך.', 'מקווה שאתה בסדר.', 'שמור על עצמך.', 'ברוך הבא!', 'תודה על המענה המהיר.', 'תודה על העזרה.', 'תודה ששלחת.', 'תודה על העדכון.', 'מעולה, נתראה אז.',
    'כיף לשמוע.', 'תודה על הזמן היום.', 'סליחה על העיכוב.', 'תודה לשניכם.', 'שמח שזה הסתדר.', 'נסיעה טובה!'];

  // What a verb DOES, for the model's action head (the action it asks for or promises).
  const TOPIC_DEFAULT = { money: 'pay', meeting: 'schedule', document: 'send', decision: 'approve', work: 'complete', info: 'reply' };
  function actionOfVerb(v, topic) {
    const x = String(v);
    if (/^(?:pay|wire|settle|transfer|release|process|clear|take care of)$/.test(x) && topic === 'money') return 'pay';
    if (/sign off|approve|authorize|green-light|accept/.test(x)) return 'approve';
    if (/countersign|^sign$/.test(x)) return 'sign';
    if (/schedule|book|set up|arrange|find a time|reschedule|plan|calendar|^move$|^propose$/.test(x)) return 'schedule';
    if (/decide|choose|pick/.test(x)) return 'decide';
    if (/review|check|look at|look into|look through|proofread|comment|test|pass at|go over|run through|have a look|sanity|weigh in/.test(x)) return 'review';
    if (/fix|finish|complete|prepare|update$|draft|finalize|take care of|pull together|put together|wrap up|knock out|polish|sort out/.test(x)) return 'complete';
    if (/confirm/.test(x)) return 'confirm';
    if (/tell me|let me know|update me|update you|reply with|find out|report back|dig into|get you|get back/.test(x)) return 'reply';
    if (/send|share|forward|upload|attach|provide|drop|email|return|resend|get me|bring|give me|point me|pass along|hand over|dig up|track down|re-send/.test(x)) return 'send';
    return TOPIC_DEFAULT[topic] || 'reply';
  }
  function heAction(v, topic) {
    const x = String(v);
    if (/חתו?ם|חתמ/.test(x)) return 'sign';
    if (/קבע|תאם|ארגן|הזז|תכנן/.test(x)) return 'schedule';
    if (/החלט|בחר/.test(x)) return 'decide';
    if (/בדוק|בדק|עבור|בחן|עברת/.test(x)) return 'review';
    if (/תקן|סיים|השלם|הכן|עדכן|אעדכן/.test(x) && topic !== 'info') return 'complete';
    if (/ברר|השב|עדכ|אשיב/.test(x)) return 'reply';
    if (/אשר|אאשר/.test(x)) return topic === 'info' ? 'confirm' : 'approve';
    if (/שלם|שחרר|סגור|טפל/.test(x) && topic === 'money') return 'pay';
    if (/שלח|העבר|העל|צרף|החזר|שתף|ספק|אשלח/.test(x)) return 'send';
    return TOPIC_DEFAULT[topic] || 'reply';
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function strip(np) { return String(np).replace(/^את /, ''); }
  function hinf(fut) { return fut.replace(/^א/, 'ל'); }
  function hfut2(inf) { return inf.replace(/^ל/, 'ת'); }
  function pickPass(past) { return pick(['נשלח', 'אושר', 'הועבר', 'הוכן', 'נסגר']); }
  function norm(s) { return s.replace(/על את /g, 'על ').replace(/\s+/g, ' ').replace(/\s+([?.!,])/g, '$1').replace(/^\s+|\s+$/g, ''); }
  function typo(s) {
    if (s.length < 8 || !chance(0.08)) return s;
    const i = 1 + Math.floor(rnd() * (s.length - 3));
    const mode = Math.floor(rnd() * 3);
    if (mode === 0) return s.slice(0, i) + s.slice(i + 1);
    if (mode === 1) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
    return s.slice(0, i) + s[i] + s.slice(i);
  }
  function wrap(core, he) {
    const n = he ? pick(HNAMES) : pick(NAMES);
    let s = (pick(he ? HGREET : GREET) || '').replace('{n}', n) + core;
    if (!he && chance(0.4)) s += pick(SIGN).replace('{n}', n);
    if (chance(0.05)) s = s.toLowerCase();
    return norm(typo(s));
  }
  function wrapAck(core, he) { return norm(typo((chance(0.3) ? pick(he ? HGREET : GREET).replace('{n}', pick(he ? HNAMES : NAMES)) : '') + core)); }
  const TOPIC_KEYS = Object.keys(NP);

  function en(act) {
    const topic = pick(TOPIC_KEYS);
    const np = pick(NP[topic]);
    let core, t = 'other', action = 'none';
    if (act === 'ASK') {
      const r = rnd();
      if (topic === 'meeting' && r < 0.45) { core = pick(ASK_MEET)(np); action = 'schedule'; }
      else if (r < 0.6) { const v = pick(VERBS_ASK[topic]); core = pick(ASK_FRAMES)(v, np, pick(TAIL_FUT)); action = actionOfVerb(v, topic); }
      else { core = pick(ASK_NP_FRAMES)(np, pick(TAIL_FUT)); action = TOPIC_DEFAULT[topic]; }
      t = topic;
    } else if (act === 'PROMISE') {
      if (chance(0.15)) { core = pick(PROM_GENERIC).replace('{t}', pick(TAIL_PROM)); t = 'info'; action = 'reply'; }
      else if (chance(0.7)) { const v = pick(VERBS_PROM[topic]); core = pick(PROM_FRAMES)(v, np, pick(TAIL_PROM)); t = topic; action = actionOfVerb(v, topic); }
      else { core = pick(PROM_NP_FRAMES)(np, pick(TAIL_PROM)); t = topic; action = TOPIC_DEFAULT[topic]; }
    } else if (act === 'INFORM') {
      if (chance(0.1)) { core = pick(EN_DECOYS_INFORM).replace('{np}', np); t = topic; }
      else if (chance(0.12)) { core = pick(EINFORM_DECIDE); t = 'decision'; }
      else if (chance(0.2)) { core = pick(INFORM_GENERIC); t = 'other'; if (/office|elevator|warehouse|server/.test(core)) t = 'info'; }
      else if (chance(0.6)) { core = pick(INFORM_FRAMES)(pick(PAST[topic]), np, pick(TAIL_PAST)); t = topic; }
      else { core = pick(INFORM_STATE)(np); t = topic; }
    } else {
      core = chance(0.18) ? pick(THANKS_FOR).replace('{x}', pick(THANKS_X)) : chance(0.15) ? pick(EN_DECOYS_ACK) : chance(0.12) ? pick(EN_SOCIAL_Q).replace('{city}', pick(CITIES)).replace('{ev}', pick(SOCIAL_EV)).replace('{when}', pick(SOCIAL_WHEN)) : pick(ACK_PARTS);
      if (chance(0.2)) core += ' ' + pick(ACK_PARTS);
    }
    return { t: act === 'ACK' ? wrapAck(core, false) : wrap(core, false), act, topic: t, action, lang: 'en' };
  }

  function he(act) {
    const topic = pick(TOPIC_KEYS);
    const np = pick(HNP[topic]);
    const V = HVERB[topic];
    let core, t = topic, action = 'none';
    if (act === 'ASK') {
      const r = rnd();
      if (topic === 'meeting' && r < 0.4) {
        action = 'schedule';
        core = pick(['אתה פנוי ' + pick(['ביום חמישי', 'מחר', 'ביום שלישי בבוקר']) + ' ל' + strip(np) + '?', 'מה מתאים לך ל' + strip(np) + '?', 'איזה יום נוח ל' + strip(np) + '?', 'בוא נקבע זמן ל' + strip(np) + ', מה אתה אומר?', 'אפשר להזיז את ' + strip(np) + ' ל' + pick(['מחר', 'יום רביעי']) + '?']);
      }
      else if (r < 0.5) { const v = pick(V.inf); core = pick(HASK_FRAMES)(v, np, pick(HTAIL_FUT)); action = heAction(v, topic); }
      else if (r < 0.7) { const v = pick(V.imp); core = pick(HASK_IMP)(v, np, pick(HTAIL_FUT)); action = heAction(v, topic); }
      else { core = pick(HASK_NP)(np, pick(HTAIL_FUT)); action = TOPIC_DEFAULT[topic]; }
    } else if (act === 'PROMISE') {
      if (chance(0.15)) { core = pick(HPROM_GENERIC).replace('{t}', pick(HTAIL_PROM)); t = 'info'; action = 'reply'; }
      else if (chance(0.2)) { const v = pick(V.fut); core = pick(HPROM_EXTRA)(v, np, pick(HTAIL_PROM)); action = heAction(v, topic); }
      else if (chance(0.75)) { const v = pick(V.fut); core = pick(HPROM_FRAMES)(v, np, pick(HTAIL_PROM)); action = heAction(v, topic); }
      else { const v = pick(V.futp); core = pick(HPROM_FUTP)(v, np, pick(HTAIL_PROM)); action = heAction(v, topic); }
    } else if (act === 'INFORM') {
      if (chance(0.2)) { core = pick(HINFORM_GENERIC); t = 'other'; }
      else if (chance(0.1)) { core = pick(HE_DECOYS_INFORM).replace('{np}', strip(np)); t = topic; }
      else if (chance(0.12)) { core = pick(HINFORM_DECIDE); t = 'decision'; }
      else if (chance(0.6)) core = pick(HINFORM_FRAMES)(pick(V.past).replace(/תי( |$)/, chance(0.3) ? 'נו$1' : 'תי$1'), np, pick(HTAIL_PAST));
      else core = pick(HINFORM_STATE)(np);
    } else {
      core = chance(0.18) ? pick(HTHANKS_FOR).replace('{x}', pick(HTHANKS_X)) : chance(0.15) ? pick(HE_DECOYS_ACK) : chance(0.12) ? pick(HE_SOCIAL_Q).replace('{city}', pick(['ליסבון', 'ברלין', 'בוסטון', 'אילת', 'פריז'])) : pick(HACK);
      if (chance(0.2)) core += ' ' + pick(HACK);
      t = 'other';
    }
    return { t: act === 'ACK' ? wrapAck(core, true) : wrap(core, true), act, topic: t, action, lang: 'he' };
  }

  function dataset(nEn, nHe) {
    const out = [];
    const acts = ['ASK', 'PROMISE', 'INFORM', 'ACK'];
    for (let i = 0; i < nEn; i++) out.push(en(acts[i % 4]));
    for (let i = 0; i < nHe; i++) out.push(he(acts[i % 4]));
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = out[i]; out[i] = out[j]; out[j] = x; }
    return out;
  }
  return { dataset, en, he };
}

module.exports = { makeGenerator };
