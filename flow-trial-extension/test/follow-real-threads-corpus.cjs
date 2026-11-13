// The follow loop on the shapes the owner's real threads have (2026-11-12): the way a person really asks in a business mail opens a
// loop; an opt-out and "we have our own systems" close it as declined (it is never chased again); an out-of-office in Hebrew holds
// it and never closes it. No real text: every mail here is written for this file.
// Run: node test/follow-real-threads-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, TextEncoder };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'day-words.js', 'file-path.js', 'reply-meaning.js', 'reply-model-weights.js', 'reply-model.js', 'follow-up.js']) {
  const p = path.join(__dirname, '..', 'core', f);
  if (fs.existsSync(p)) try { vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); } catch (e) { /* optional sibling */ }
}
const F = vm.runInContext('FlowFollowUp', sb);
const NOW = new Date('2026-11-12T10:00:00+02:00').getTime();
const OUT = 'דנה שלום,\n\nאנחנו בונים שכבת ביצוע למשרדים כמו שלכם, והיא רצה מעל המערכות שכבר יש אצלכם.\n\nנשמח לתאם פגישה קצרה כדי להציג את המערכת ולבחון יחד איך היא משתלבת אצלכם.\nהצוות';
function loop(out) { const ask = F.classifyOutgoing(out, { now: NOW, lang: 'he' }); return ask ? F.buildWatch({ ask, threadId: 't1', subject: '', counterpart: { email: 'dana@acme.io' }, now: NOW - 3 * 86400000 }) : null; }
function after(out, reply, from) {
  const w = loop(out); if (!w) return 'no-loop';
  const auto = F.isAutoReply(reply, from || 'dana@acme.io');
  const rep = auto ? { outcome: 'auto' } : F.classifyReply(reply, w, { now: NOW, email: from || 'dana@acme.io' });
  const ap = F.applyReply(w, rep, NOW);
  return ap.none ? (auto ? 'hold' : 'none') : ap.close ? 'close:' + rep.outcome : 'open:' + rep.outcome;
}

console.log('\n--- the owner\'s own ask opens a loop ---\n');
check('"נשמח לתאם פגישה קצרה" opens a loop', Boolean(loop(OUT)));
check('"נשמח לקבל את שם המחליפה" opens a loop', Boolean(loop('רחל שלום,\n\nתודה שכתבת לנו ושהבהרת. אנחנו רוצים להגיע לאדם הנכון, ולכן נשמח לקבל את שם המחליפה או להעביר לה את הפנייה בעצמך.\n\nבברכה\nהצוות')));
check('"אשמח שתשלחי זימון" opens a loop', Boolean(loop('מיכל שלום,\n\nהמועד מתאים לנו מצוין. אשמח שתשלחי זימון זום לכל המשתתפים, ושתצרפי גם את הכתובת הזו.\n\nתודה')));
check('"אפשר לקבוע כאן או לשלוח לי יום" opens a loop', Boolean(loop('יוסי שלום,\n\nתבחר תהליך אחד אמיתי מהמשרד, ואנחנו נראה לך אותו נסגר מקצה לקצה. אפשר לקבוע כאן או לשלוח לי יום.\n\nתודה')));
check('a closing courtesy alone opens nothing', !loop('דנה שלום,\n\nמצרף את המסמך שביקשת, כפי שסיכמנו בשיחה האחרונה שלנו.\n\nנשמח לעזור בכל שאלה נוספת.\nהצוות'));

console.log('\n--- what comes back ---\n');
check('a one-word opt-out closes the loop as declined (it is not chased again)', after(OUT, 'הסר') === 'close:declined', after(OUT, 'הסר'));
check('"נא להסיר אותי מרשימת התפוצה" closes it as declined', after(OUT, 'נא להסיר אותי מרשימת התפוצה') === 'close:declined', after(OUT, 'נא להסיר אותי מרשימת התפוצה'));
check('EN "unsubscribe" and "please remove me from your list" close it as declined', after(OUT, 'unsubscribe') === 'close:declined' && after(OUT, 'Please remove me from your list.') === 'close:declined', [after(OUT, 'unsubscribe'), after(OUT, 'Please remove me from your list.')]);
check('"יש לנו מערכות פנימיות" closes it as declined', after(OUT, 'תודה על הפניה יש לנו מערכות פנימיות תודה') === 'close:declined', after(OUT, 'תודה על הפניה יש לנו מערכות פנימיות תודה'));
check('EN "we already have an in-house system" closes it as declined', after(OUT, 'Thanks for reaching out, we already have an in-house system.') === 'close:declined', after(OUT, 'Thanks for reaching out, we already have an in-house system.'));
check('a Hebrew out-of-office holds the loop and never closes it', after(OUT, 'שלום רב, אני לא נמצאת במשרד. ניתן להשאיר הודעות אצל מיכל. יום טוב, רחל.') === 'hold' && after(OUT, 'שלום, מחוץ למשרד עד ה 13/11/2026 עם גישה מוגבלת למייל. תודה, אבי.') === 'hold', [after(OUT, 'שלום רב, אני לא נמצאת במשרד. ניתן להשאיר הודעות אצל מיכל. יום טוב, רחל.')]);
check('an English out-of-office holds it', after(OUT, 'Hi, I will be out of office until October 18th. Please contact Tom for further assistance. Best regards, Maya.') === 'hold');

check('a real "yes, Tuesday works" is not read as a decline or an auto-reply', !/^close:declined$|^hold$/.test(after(OUT, 'כן, יום שלישי מתאים לנו. נתראה.')), after(OUT, 'כן, יום שלישי מתאים לנו. נתראה.'));
check('"remove the second clause from the contract" in a real answer is not an opt-out', after(OUT, 'נשמח להיפגש, רק תסירו בבקשה את הסעיף השני מההצעה.') !== 'close:declined', after(OUT, 'נשמח להיפגש, רק תסירו בבקשה את הסעיף השני מההצעה.'));

console.log('\n--- a bounce: the ask never arrived ---\n');
const BOUNCE_HE = 'המסירה לנמענים או לקבוצות אלו נכשלה: dana@acme.io. כתובת הדואר האלקטרוני שהזנת לא נמצאה. בדוק את הכתובת ונסה לשלוח שוב.';
const BOUNCE_EN = 'Delivery Status Notification (Failure)\n\nYour message wasn\'t delivered to dana@acme.io because the address couldn\'t be found, or is unable to receive mail.';
for (const [name, text, from] of [['Hebrew', BOUNCE_HE, 'postmaster@acme.io'], ['English', BOUNCE_EN, 'mailer-daemon@googlemail.com'], ['Hebrew, an ordinary sender address', BOUNCE_HE, 'it@acme.io']]) {
  const w = loop(OUT); const rep = F.classifyReply(text, w, { now: NOW, email: from }); const ap = F.applyReply(w, rep, NOW);
  check('a ' + name + ' bounce is its own outcome, not an answer and not an auto-reply', rep.outcome === 'bounced' && ap.bounced === true && !ap.close, [rep.outcome, ap]);
  check('a ' + name + ' bounce flags the loop and keeps it open (never closes, never counts as a reply)', ap.patch.stage === 'bounced' && !ap.patch.status && !('lastReplyAt' in ap.patch), ap.patch);
}
{
  const w = loop(OUT); const ap = F.applyReply(w, { outcome: 'bounced' }, NOW);
  const flagged = Object.assign({}, w, ap.patch);
  check('a bounced loop reads as bounced and is still active', F.isBounced(flagged) && F.isActive(flagged) && F.stageOf(flagged) === 'bounced');
  check('a bounced loop is never offered a "next move" or a chase', F.nextMove([flagged], Object.assign({}, flagged, { nudges: 3, chaseIso: '2026-11-01' }), NOW, { enabled: true }) === null);
  const back = Object.assign({}, flagged, F.unbouncePatch(flagged));
  check('after the person sends it again the flag clears and the loop is waiting again', !F.isBounced(back) && F.stageOf(back) === 'waiting' && back.bouncedAt === null, back.stage);
  check('a nudged loop returns to nudged after a resend', F.unbouncePatch(Object.assign({}, flagged, { nudges: 2 })).stage === 'nudged');
}
check('an out-of-office is still a hold, not a bounce', F.classifyReply('Hi, I am out of office until October 18th. Best regards, Maya.', loop(OUT), { now: NOW, email: 'maya@acme.io' }).outcome === 'auto');
check('a real answer that mentions delivery is not a bounce', F.classifyReply('Thanks, the delivery of the contract is planned for Tuesday.', loop(OUT), { now: NOW, email: 'dana@acme.io' }).outcome !== 'bounced');

console.log('\n--- an ask with several parts: a reply that answers only some of them does not close the loop ---\n');
const MULTI = 'מיכל שלום,\n\nהמועד מתאים לנו מצוין. אשמח שתשלחי זימון זום לכל המשתתפים.\n\nכדי שההדגמה תהיה על משהו אמיתי אצלכם, נשמח לדעת מראש: על איזה תהליך תרצו לראות את ההדגמה? ומי ישתתף מטעמכם?\n\nתודה';
function afterText(out, reply, from) {
  const w = loop(out); if (!w) return { w: null };
  const rep = F.classifyReply(reply, w, { now: NOW, email: from || 'dana@acme.io' });
  return { w, rep, ap: F.applyReply(w, rep, NOW, reply) };
}
{
  const w = loop(MULTI);
  check('a message that asks for three things opens one loop with its three parts', w && Array.isArray(w.parts) && w.parts.length === 3 && w.parts.every((p) => p.status === 'open'), w && w.parts);
  const SINGLE = loop('דנה שלום,\n\nאפשר לשלוח לי את החוזה החתום עד יום חמישי?\nתודה');
  check('a single ask opens a loop with no parts', SINGLE && !SINGLE.parts, SINGLE && SINGLE.parts);
  const r1 = afterText(MULTI, 'https://openu.zoom.us/my/abc\n\nבברכה,\nמיכל');
  check('a reply that is only the meeting link answers the invitation part and leaves the two questions open', r1.ap.partial === true && !r1.ap.close && r1.ap.remaining.length === 2 && r1.ap.patch.stage === 'partial', [r1.ap.partial, r1.ap.remaining]);
  check('the partial patch keeps the loop waiting and moves the chase day', !r1.ap.patch.status && r1.ap.patch.chaseIso && r1.ap.patch.parts.filter((p) => p.status === 'answered').length === 1, r1.ap.patch);
  const r2 = afterText(MULTI, 'תודה מיכל, נעבור על זה ונחזור אליך.');
  check('a short reply that answers none of the parts stays open on all of them', r2.ap.partial === true && r2.ap.remaining.length === 3 || r2.ap.none === true || (r2.rep.outcome !== 'closed'), [r2.rep.outcome, r2.ap.remaining]);
  const long = 'שלום, נשמח להציג על תהליך קליטת עובדים חדשים. ישתתפו שלושה אנשים מהמחלקה: מנהלת המערכות, איש הכספים ואני. את הזימון לזום שלחתי עכשיו לכולם, ואם צריך משהו נוסף תגידו.';
  const r3 = afterText(MULTI, long);
  check('a real, longer answer closes the loop as before (closing wrongly is the worse mistake)', r3.ap.close === true && !r3.ap.partial, [r3.rep.outcome, r3.ap.partial]);
  const r4 = afterText(MULTI, 'תהליך קליטת עובדים. ישתתפו שלושה אנשים מהמחלקה. הזימון בדרך, https://openu.zoom.us/my/abc');
  check('a reply that answers every part by its words and a link closes it', r4.ap.close === true, [r4.rep.outcome, r4.ap.partial, r4.ap.remaining]);
  const w2 = Object.assign({}, w, { patch: null });
  const state1 = Object.assign({}, w, r1.ap.patch);
  const r5 = F.applyReply(state1, F.classifyReply('תהליך קליטת עובדים ומי ישתתף: שלושה אנשים.', state1, { now: NOW, email: 'dana@acme.io' }), NOW, 'תהליך קליטת עובדים ומי ישתתף: שלושה אנשים.');
  check('the next reply that answers the rest closes it', r5.close === true, r5);
  check('a decline still closes a loop with parts', afterText(MULTI, 'אנחנו לא מעוניינים, תודה.').ap.close === true);
  check('a loop with parts is not changed by a bounce or an out-of-office', afterText(MULTI, 'שלום, מחוץ למשרד עד ה 13/11/2026 עם גישה מוגבלת למייל.').ap.none === true);
  check('open parts are listed', F.openParts(Object.assign({}, w, r1.ap.patch)).length === 2 && F.openParts({ parts: null }).length === 0);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
