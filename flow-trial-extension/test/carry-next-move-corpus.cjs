// Carry until closed (core/follow-up.js nextMove, switch CARRY.nextMove in config/carry.public.js, off).
// After the third unanswered nudge Glance proposes ONE other way to close the loop: the app where this person really
// answers you, one colleague on the thread who has answered you before, or "Still need this?".
// What is pinned here: with the switch off nothing is proposed; a move needs evidence, never closes, never sends and never
// mutates the loop; money is never released by a question; a move is proposed once per loop and a dismissed one never again;
// Hebrew and English. Run: node test/carry-next-move-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 86400000;
const NOW = new Date('2026-10-11T10:00:00').getTime(); // a Sunday
const ON = (extra) => Object.assign({ enabled: true }, extra || {});
const merged = { keyOf: (w) => w.personKey || (w.counterpart && w.counterpart.email) };

function loop(extra) {
  return Object.assign({
    id: 'w1', threadId: 't1', status: 'waiting', direction: 'theirs', kind: 'reply', channel: 'gmail', lang: 'en',
    counterpart: { email: 'dana@acme.co.il', name: 'Dana Cole' }, personKey: 'p:dana', subject: 'the signed lease',
    nudges: 3, stage: 'nudged', chaseIso: '2026-10-11', createdAt: NOW - 30 * DAY
  }, extra || {});
}
function closed(app, key, email, days, n, start) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = NOW - (start || 120) * DAY + i * 9 * DAY;
    out.push({ id: app + key + i, status: 'resolved', closedAs: 'replied', direction: 'theirs', kind: 'reply', channel: app, personKey: key, counterpart: { email }, createdAt: c, resolvedAt: c + days * DAY });
  }
  return out;
}
const chatHistory = closed('whatsapp', 'p:dana', null, 0.2, 3);

console.log('--- switch off: nothing is proposed ---');
const fixtures = [loop(), loop({ lang: 'he' }), loop({ kind: 'payment', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' } })];
const offOpts = [undefined, null, {}, { enabled: false }, { enabled: 'true' }, { enabled: 1 }];
check('every off form returns null on every fixture', fixtures.every((w) => offOpts.every((o) => F.nextMove(chatHistory.concat([w]), w, NOW, o) === null)));
check('MAX_NUDGE_LEVEL is still 3 and the nudge level still caps at 3', F.MAX_NUDGE_LEVEL === 3 && F.nextNudgeLevel({ nudges: 7 }) === 3);

console.log('--- channel: the app where they answer you ---');
const w = loop();
const frozen = JSON.stringify(w);
const m1 = F.nextMove(chatHistory.concat([w]), w, NOW, ON(merged));
check('3 WhatsApp closes and none on Gmail: ask on WhatsApp', m1 && m1.type === 'channel' && m1.app === 'whatsapp', m1);
check('a move needs a click and never closes', m1 && m1.needsClick === true && m1.closes === false);
check('the move cites its evidence', m1 && m1.evidence.closes === 3 && m1.evidence.closesHere === 0, m1 && m1.evidence);
check('English draft names the first app and the subject', m1 && /Gmail/.test(m1.draft) && /signed lease/.test(m1.draft) && /^Hi Dana,/.test(m1.draft), m1 && m1.draft);
check('the question to the person names the app', m1 && /WhatsApp/.test(m1.question), m1 && m1.question);
check('the loop itself is not touched', JSON.stringify(w) === frozen);
const wh = loop({ lang: 'he', subject: 'החוזה החתום', counterpart: { email: 'dana@acme.co.il', name: 'דנה' } });
const mh = F.nextMove(chatHistory.concat([wh]), wh, NOW, ON(merged));
check('Hebrew: the draft is Hebrew and has no English', mh && mh.type === 'channel' && /^היי דנה,/.test(mh.draft) && !/[A-Za-z]/.test(mh.draft) && /וואטסאפ/.test(mh.question) && /מדנה/.test(mh.question), mh);
check('Hebrew draft asks without a gendered verb ("אפשר להציץ")', mh && /אפשר להציץ/.test(mh.draft), mh && mh.draft);
const unmerged = closed('whatsapp', 'phone:972500000000', null, 0.2, 3);
const mU = F.nextMove(unmerged.concat([w]), w, NOW, ON({}));
check('a WhatsApp history under another key (not the same person) is not this person', !mU || mU.type !== 'channel', mU);
check('an app the surface cannot prepare a message in is not proposed', (F.nextMove(chatHistory.concat([w]), w, NOW, ON(Object.assign({ apps: ['gmail', 'outlook'] }, merged))) || {}).type !== 'channel');
check('one WhatsApp close is not enough', (F.nextMove(closed('whatsapp', 'p:dana', null, 0.2, 1).concat([w]), w, NOW, ON(merged)) || {}).type !== 'channel');
const fastHere = closed('gmail', 'p:dana', 'dana@acme.co.il', 1, 4).concat(closed('whatsapp', 'p:dana', null, 0.5, 3, 80));
check('they answer you on Gmail just as well: no channel move', (F.nextMove(fastHere.concat([w]), w, NOW, ON(merged)) || {}).type !== 'channel');
const slowHere = closed('gmail', 'p:dana', 'dana@acme.co.il', 9, 1).concat(closed('whatsapp', 'p:dana', null, 0.5, 3, 80));
check('one slow Gmail close and three fast WhatsApp closes: ask on WhatsApp', (F.nextMove(slowHere.concat([w]), w, NOW, ON(merged)) || {}).app === 'whatsapp');

console.log('--- not stuck yet: silence ---');
const notYet = [
  ['two nudges', loop({ nudges: 2 })],
  ['they promised a day', loop({ stage: 'promised', promisedIso: '2026-10-14' })],
  ['your own promise', loop({ direction: 'mine' })],
  ['a clock', loop({ direction: 'clock' })],
  ['the ball is in your court', loop({ stage: 'yours' })],
  ['not due today', loop({ chaseIso: '2026-10-12' })],
  ['already closed', loop({ status: 'resolved', closedAs: 'replied', resolvedAt: NOW - DAY })],
  ['stopped', loop({ status: 'stopped' })],
  ['a loop with items (its own reminder)', loop({ items: [{ id: 'a', label: 'deck', status: 'missing' }] })]
];
notYet.forEach(([name, x]) => check(name + ': no move', F.nextMove(chatHistory.concat([x]), x, NOW, ON(merged)) === null));

console.log('--- colleague: one person on the thread who has answered you ---');
const yossi = closed('gmail', 'yossi@acme.co.il', 'yossi@acme.co.il', 1, 2);
const wc = loop({ personKey: null });
const mc = F.nextMove(yossi.concat([wc]), wc, NOW, ON({ threadPeople: [{ email: 'Yossi@acme.co.il', name: 'Yossi Levi' }, { email: 'dana@acme.co.il' }] }));
check('one colleague at acme.co.il with 2 real closes: ask Yossi', mc && mc.type === 'colleague' && mc.to.email === 'yossi@acme.co.il', mc);
check('colleague draft names both people and the subject', mc && /^Hi Yossi,/.test(mc.draft) && /asked Dana/.test(mc.draft) && /signed lease/.test(mc.draft), mc && mc.draft);
const rina = closed('gmail', 'rina@acme.co.il', 'rina@acme.co.il', 1, 2);
check('two such colleagues: no colleague move (no guessing)', (F.nextMove(yossi.concat(rina, [wc]), wc, NOW, ON({ threadPeople: [{ email: 'yossi@acme.co.il' }, { email: 'rina@acme.co.il' }] })) || {}).type !== 'colleague');
const other = closed('gmail', 'yossi@other.com', 'yossi@other.com', 1, 2);
check('a person at another organisation is not a colleague', (F.nextMove(other.concat([wc]), wc, NOW, ON({ threadPeople: [{ email: 'yossi@other.com' }] })) || {}).type !== 'colleague');
check('a colleague with one real close is not enough', (F.nextMove(closed('gmail', 'yossi@acme.co.il', 'yossi@acme.co.il', 1, 1).concat([wc]), wc, NOW, ON({ threadPeople: [{ email: 'yossi@acme.co.il' }] })) || {}).type !== 'colleague');
const free = loop({ personKey: null, counterpart: { email: 'dana@gmail.com', name: 'Dana' } });
const freePals = closed('gmail', 'yossi@gmail.com', 'yossi@gmail.com', 1, 3);
check('free mail (gmail.com) is not an organisation: no colleague', (F.nextMove(freePals.concat([free]), free, NOW, ON({ threadPeople: [{ email: 'yossi@gmail.com' }] })) || {}).type !== 'colleague');
const whc = loop({ personKey: null, lang: 'he', subject: 'החוזה החתום', counterpart: { email: 'dana@acme.co.il', name: 'דנה' } });
const mch = F.nextMove(yossi.concat([whc]), whc, NOW, ON({ threadPeople: [{ email: 'yossi@acme.co.il', name: 'יוסי' }] }));
check('Hebrew colleague draft, gender-neutral ask', mch && mch.type === 'colleague' && /^היי יוסי,/.test(mch.draft) && /פניתי לדנה/.test(mch.draft) && /אפשר לעזור לי/.test(mch.draft) && !/[A-Za-z]/.test(mch.draft), mch);

console.log('--- release: "Still need this?" ---');
const long = loop({ personKey: null, createdAt: NOW - 35 * DAY });
const mr = F.nextMove([long], long, NOW, ON({}));
check('no evidence, 35 days and three nudges: ask "Still need this?"', mr && mr.type === 'release' && mr.draft === null && mr.closes === false, mr);
check('the release question says how long and how many reminders', mr && /3 reminders/.test(mr.question) && /35 days/.test(mr.question), mr && mr.question);
const shortL = loop({ personKey: null, createdAt: NOW - 12 * DAY });
check('no evidence and only 12 days: no release question', F.nextMove([shortL], shortL, NOW, ON({})) === null);
const quick = closed('gmail', 'p:dana', 'dana@acme.co.il', 1, 5);
const wq = loop({ createdAt: NOW - 22 * DAY });
const mq = F.nextMove(quick.concat([wq]), wq, NOW, ON(merged));
check('a person who always answers in a day, silent for 22 days: ask', mq && mq.type === 'release' && mq.evidence.level === 'personal' && mq.evidence.longestDays <= 1.5 && mq.evidence.closes === 5, mq);
const slow = closed('gmail', 'p:dana', 'dana@acme.co.il', 20, 4, 200);
const ws = loop({ createdAt: NOW - 18 * DAY });
check('a person who usually takes 3 weeks, 18 days in: no release question yet', F.nextMove(slow.concat([ws]), ws, NOW, ON(merged)) === null);
const pay = loop({ personKey: null, kind: 'payment', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' }, createdAt: NOW - 60 * DAY });
check('money is never released by a question', F.nextMove([pay], pay, NOW, ON({})) === null);
const payChat = loop({ kind: 'payment', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' } });
check('a payment loop can still be asked on the app where they answer', (F.nextMove(chatHistory.concat([payChat]), payChat, NOW, ON(merged)) || {}).type === 'channel');
const he = loop({ personKey: null, lang: 'he', subject: 'החוזה החתום', counterpart: { email: 'dana@acme.co.il', name: 'דנה' }, createdAt: NOW - 35 * DAY });
const mrh = F.nextMove([he], he, NOW, ON({}));
check('Hebrew release question, gender-neutral', mrh && /^אין תשובה מדנה אחרי 3 תזכורות/.test(mrh.question) && /עדיין צריך את זה\?/.test(mrh.question), mrh && mrh.question);

console.log('--- once per loop, and a no is remembered ---');
const done1 = Object.assign({}, w, F.moveDonePatch(w, m1, NOW));
check('after the channel move the loop is still open and looks again later', done1.status === 'waiting' && done1.chaseIso > '2026-10-11' && done1.moves.length === 1 && !('closedAs' in F.moveDonePatch(w, m1, NOW)));
const later = NOW + 3 * DAY;
const after = Object.assign({}, done1, { chaseIso: '2026-10-14' });
const m2 = F.nextMove(chatHistory.concat([after]), after, later, ON(merged));
check('the channel move is not proposed twice; the next one is the release question', m2 && m2.type === 'release', m2);
const dism = Object.assign({}, long, F.moveDismissPatch(long, mr, NOW));
check('a dismissed release question is never asked again on that loop', F.nextMove([dism], dism, NOW, ON({})) === null && dism.status === 'waiting');
const rel = F.releasePatch(long, NOW);
check('Let it go is a deliberate release, recorded as released, by the person', rel.status === 'resolved' && rel.closedAs === 'released' && rel.resolvedBy === 'person');
const relW = Object.assign({}, long, { personKey: 'p:gone' }, rel);
check('a released loop gets no move', F.nextMove([relW], relW, NOW, ON({})) === null);
const { FlowPersonModel: PM } = require('../core/person-model.js');
check('a released loop is not an answer for the person model', PM.observe([relW], 'p:gone', 'reply', NOW).events.length === 0);

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
