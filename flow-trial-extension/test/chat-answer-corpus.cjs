// A place question in a 1:1 chat. One calendar or opened-mail hit is a draft.
// Zero hits, or two or more, stay silent. A chat send is Handled only when
// the outgoing line was read back. Run: node test/chat-answer-corpus.cjs
const { FlowChatAnswer: A } = require('../core/chat-answer.js');
const { FlowChatAnswerWorker: W } = require('../src/chat-answer-worker.js');
const { FlowProofOfClose: P } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = '2026-10-08T12:00:00';
const HE = 'איפה אכלנו בשבוע שעבר?';
const EN = 'Where did we eat last week?';
const VERIFIED = '2026-10-08T12:30:00.000Z';

function place(title, date, extra) {
  return Object.assign({ id: title + '@' + date, status: 'confirmed', summary: title, start: { date: date } }, extra || {});
}

function ask(text) {
  return A.decide({
    text: text || HE,
    now: NOW,
    events: arguments.length > 1 ? arguments[1] : [place('פורט סעיד', '2026-10-01')],
    mail: arguments.length > 2 ? arguments[2] : [],
    calendarChecked: true,
    mailChecked: true,
    oneToOne: true,
    host: 'web.whatsapp.com'
  });
}

console.log('\n--- the question ---\n');
{
  const he = A.detect(HE, NOW);
  const en = A.detect(EN, NOW);
  check('Hebrew last week is a place question', he && he.lang === 'he' && he.window.startYmd === '2026-09-27' && he.window.endYmd === '2026-10-04', he && he.window);
  check('English last week uses the same Sunday window', en && en.lang === 'en' && en.window.startYmd === '2026-09-27' && en.window.endYmd === '2026-10-04', en && en.window);
  check('Thursday 1 Oct is inside that week', he.window.startYmd <= '2026-10-01' && '2026-10-01' < he.window.endYmd);
  check('a place question with no period stays silent', A.detect('איפה אכלנו?', NOW) === null && A.detect('Where did we eat?', NOW) === null);
  check('next week stays silent', A.detect('איפה אכלנו בשבוע הבא?', NOW) === null && A.detect('Where did we eat next week?', NOW) === null);
  check('a greeting stays silent', A.detect('How are you?', NOW) === null);
  check('a file ask stays silent', A.detect('תשלח לי את הקובץ', NOW) === null);
  check('where\'d we eat last week is the same question', A.detect("Where'd we eat last week?", NOW) && A.detect("Where'd we eat last week?", NOW).lang === 'en');
  check('only web.whatsapp.com is a host', A.hostAllowed('web.whatsapp.com') === true && A.hostAllowed('www.messenger.com') === false && A.hostAllowed('web.whatsapp.com.evil.com') === false);
}

console.log('\n--- one hit, or silence ---\n');
{
  const one = ask();
  check('one calendar place is a draft and nothing is sent', one.show === true && one.reason === 'one-hit' && one.sends === false && one.draft === 'אכלנו בפורט סעיד.' && one.hit.place === 'פורט סעיד' && one.hit.whenLabel === 'יום חמישי' && one.hit.source === 'calendar', one);
  check('the English draft names the place', A.draftFor('Port Said', 'en') === 'We ate at Port Said.');
  const two = ask(HE, [place('פורט סעיד', '2026-10-01'), place('החצר', '2026-10-02')]);
  check('two restaurants stay silent', two.show === false && two.reason === 'silent-many' && two.sends === false && two.draft === '', two);
  const none = ask(HE, [], []);
  check('zero hits stay silent', none.show === false && none.reason === 'silent-zero' && none.sends === false, none);
  const withMeeting = ask(HE, [place('Team standup', '2026-10-01'), place('פורט סעיד', '2026-09-30')]);
  check('a meeting beside one restaurant is still one hit', withMeeting.show === true && withMeeting.hit.place === 'פורט סעיד', withMeeting);
  const meal = ask(EN, [place('Dinner', '2026-10-01'), place('Dinner at Port Said', '2026-10-02')]);
  check('a meal with no place is ignored and the named place is kept', meal.show === true && meal.lang === 'en' && meal.draft === 'We ate at Port Said.' && meal.hit.whenLabel === 'Friday', meal);
  const cancelled = ask(HE, [place('פורט סעיד', '2026-10-01', { status: 'cancelled' })]);
  check('a cancelled event is not a hit', cancelled.show === false && cancelled.reason === 'silent-zero', cancelled);
  const outside = ask(HE, [place('פורט סעיד', '2026-10-04')]);
  check('the Sunday that starts this week is outside last week', outside.show === false && outside.reason === 'silent-zero', outside);
  const same = ask(HE, [place('פורט סעיד', '2026-09-28'), place('Dinner at פורט סעיד', '2026-10-01')]);
  check('the same place twice is one hit', same.show === true && same.hit.place === 'פורט סעיד', same);
  const mailIgnored = ask(HE, [place('פורט סעיד', '2026-10-01')], [{ id: 'm1', subject: 'Reservation at The Grill for Thursday', dateIso: '2026-10-01', body: 'table for two' }]);
  check('one calendar hit does not consult a different mail place', mailIgnored.show === true && mailIgnored.hit.source === 'calendar' && mailIgnored.hit.place === 'פורט סעיד', mailIgnored);
  const fromMail = ask(HE, [], [{ id: 'm1', subject: 'Reservation at Port Said for Thursday', dateIso: '2026-10-01', body: 'See you there.' }]);
  check('an empty calendar then one reservation mail is the draft', fromMail.show === true && fromMail.hit.source === 'mail' && fromMail.hit.place === 'Port Said' && fromMail.draft === 'אכלנו בPort Said.', fromMail);
  const heMail = ask(HE, [], [{ id: 'm2', subject: 'הזמנה לפורט סעיד ליום חמישי', dateIso: '2026-10-01', body: 'שולחן לזוג' }]);
  check('a Hebrew reservation mail names the place', heMail.show === true && heMail.hit.place === 'פורט סעיד' && heMail.draft === 'אכלנו בפורט סעיד.', heMail);
  const twoMail = ask(HE, [], [
    { id: 'm1', subject: 'Reservation at Port Said for Thursday', dateIso: '2026-10-01', body: 'table for two' },
    { id: 'm2', subject: 'Reservation at The Grill for Friday', dateIso: '2026-10-02', body: 'table for two' }
  ]);
  check('two mail places stay silent', twoMail.show === false && twoMail.reason === 'silent-many', twoMail);
  const unread = A.decide({ text: HE, now: NOW, events: [place('פורט סעיד', '2026-10-01')], calendarChecked: false, oneToOne: true, host: 'web.whatsapp.com' });
  check('an unread calendar stays silent even when a place is in the list', unread.show === false && unread.reason === 'sources-unread' && unread.sends === false, unread);
  const truncated = A.decide({ text: HE, now: NOW, events: [place('פורט סעיד', '2026-10-01')], truncated: true, calendarChecked: true, oneToOne: true, host: 'web.whatsapp.com' });
  check('a truncated calendar stays silent', truncated.show === false && truncated.reason === 'sources-unread', truncated);
  const group = A.decide({ text: HE, now: NOW, events: [place('פורט סעיד', '2026-10-01')], calendarChecked: true, oneToOne: false, host: 'web.whatsapp.com' });
  check('a group stays silent', group.show === false && group.reason === 'not-one-to-one', group);
  const answered = A.decide({ text: HE, now: NOW, events: [place('פורט סעיד', '2026-10-01')], calendarChecked: true, oneToOne: true, alreadyAnswered: true, host: 'web.whatsapp.com' });
  check('a question already answered stays silent', answered.show === false && answered.reason === 'already-answered', answered);
  const messenger = A.decide({ text: HE, now: NOW, events: [place('פורט סעיד', '2026-10-01')], calendarChecked: true, mailChecked: true, oneToOne: true, host: 'www.messenger.com' });
  check('Messenger stays silent', messenger.show === false && messenger.reason === 'wrong-host', messenger);
}

console.log('\n--- the worker looks up, and does not send ---\n');
{
  const span = A.lastWeek(A.parseNow(NOW));
  const path = W.calendarPath(span);
  check('the calendar path asks for the title and the place', path.indexOf('summary') >= 0 && path.indexOf('location') >= 0 && path.indexOf('maxResults=250') >= 0 && path.indexOf('singleEvents=true') >= 0 && path.indexOf('2026-09-27') >= 0, path);
  const listed = W.normalizeEvents({ items: [place('פורט סעיד', '2026-10-01'), { status: 'confirmed' }] });
  check('events keep a title and a date, and drop a row with no title', listed.events.length === 2 && listed.events[0].summary === 'פורט סעיד' && listed.truncated === false, listed);
  check('250 events is a truncated read', W.normalizeEvents({ items: new Array(250).fill(place('פורט סעיד', '2026-10-01')) }).truncated === true);
}

function search(fetchCalendar, readOpenedMail) {
  return W.search({ text: HE, now: NOW, oneToOne: true, host: 'web.whatsapp.com', fetchCalendar: fetchCalendar, readOpenedMail: readOpenedMail });
}

Promise.resolve()
  .then(() => search(() => ({ ok: true, items: [place('פורט סעיד', '2026-10-01')] })))
  .then((hit) => {
    check('a fetched calendar hit is the draft', hit.show === true && hit.draft === 'אכלנו בפורט סעיד.' && hit.sends === false, hit);
    return search(() => { throw new Error('offline'); });
  })
  .then((miss) => {
    check('a calendar fetch that throws stays silent', miss.show === false && miss.reason === 'sources-unread' && miss.sends === false, miss);
    return search(
      () => ({ ok: true, items: [] }),
      () => [{ id: 'm1', subject: 'Reservation at Port Said for Thursday', date: '2026-10-01', body: 'table for two' }]
    );
  })
  .then((mail) => {
    check('an empty calendar then opened mail is the draft', mail.show === true && mail.hit.source === 'mail' && mail.hit.place === 'Port Said' && mail.sends === false, mail);
    return search(() => ({ ok: false }));
  })
  .then((down) => {
    check('a calendar that was not read stays silent', down.show === false && down.reason === 'sources-unread', down);
  })
  .then(() => {
    console.log('\n--- Handled only after the line is read back ---\n');
    const bare = [{ action: { kind: 'chatAnswer' }, response: { ok: true } }];
    check('ok without a read-back is not Handled', P.isChatAnswerKind('chatAnswer') === true && P.isProofTaskKind('chatAnswer') === true && P.shouldRecordTrustedClose(bare) === false && P.stepCountsAsHandled(bare[0]) === false);
    check('calendar without this proof is unchanged', P.isProofTaskKind('calendar') === false && P.shouldRecordTrustedClose([{ action: { kind: 'calendar' }, response: { ok: true } }]) === true);
    const built = P.buildProof({ system: P.SYSTEM_WHATSAPP_WEB, externalId: 'true_972541234567@c.us_S1', fetchedBack: true, verifiedAt: VERIFIED });
    const proved = [{ action: { kind: 'chatAnswer' }, response: { ok: true, proof: built } }];
    check('a read-back proof is Handled', built && built.system === 'whatsapp/web' && built.fetchedBack === true && P.shouldRecordTrustedClose(proved) === true, built);
    check('fetchedBack false builds no proof', P.buildProof({ system: 'whatsapp/web', externalId: 'true_x', fetchedBack: false, verifiedAt: VERIFIED }) === null);
    const missing = {
      kind: 'written', messageId: 'q1', questionId: 'q1', connectorId: 'chatAnswer', system: 'whatsapp/web',
      externalId: 'true_x', fetchedBack: false, verifiedAt: VERIFIED, writtenLine: 'אכלנו בפורט סעיד.'
    };
    check('a WhatsApp row without fetchedBack is not a receipt', P.taskReceiptFromLog([missing], { messageIds: ['q1'] }) === null && P.remountCopy(missing) === null);
    const row = {
      kind: 'written', messageId: 'true_972541234567@c.us_S1', questionId: 'q1', connectorId: 'chatAnswer',
      system: 'whatsapp/web', externalId: 'true_972541234567@c.us_S1', fetchedBack: true, verifiedAt: VERIFIED,
      writtenLine: 'אכלנו בפורט סעיד.', receiptStatus: 'טופל.', undoAvailable: false
    };
    const mounted = P.taskReceiptFromLog([row], { messageIds: ['q1'] });
    const copy = P.remountCopy(mounted);
    check('a read-back row remounts the Hebrew receipt', mounted && copy && copy.status === 'טופל.' && copy.writtenLine === 'אכלנו בפורט סעיד.' && copy.undoHint === 'Undo unavailable', copy);
    const unavailable = P.applyChatUndo([row], { messageIds: ['q1', row.externalId] }, 'unavailable');
    check('Undo unavailable clears Handled', unavailable.ok === true && unavailable.stayedHandled === false && unavailable.log[0].kind === 'undone' && unavailable.log[0].fetchedBack === false && unavailable.log[0].label === 'Undo unavailable' && P.taskReceiptFromLog(unavailable.log, { messageIds: ['q1'] }) === null, unavailable);
    const deleted = P.applyChatUndo([row], { messageIds: ['q1'] }, 'deleted');
    check('a deleted message records the undone line', deleted.ok === true && deleted.stayedHandled === false && deleted.log[0].label === P.CHAT_UNDONE_LINE && P.CHAT_UNDO_UNAVAILABLE === 'Undo unavailable', deleted.log[0]);
    console.log('\nTOTAL FAILURES:', failures);
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.log('FAIL: worker search threw', err && err.stack ? err.stack : err);
    console.log('\nTOTAL FAILURES:', failures + 1);
    process.exit(1);
  });
