// Multi-platform core: one vocabulary for every app, people merged on hard evidence only, and an answer in one app
// settling a loop opened in another only when that is safe.
// Run: node test/multi-platform-corpus.cjs
const { FlowChannel: C } = require('../core/channel.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowCrossChannel: X } = require('../core/cross-channel.js');
const { FlowExtract } = require('../core/extract.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 3, 12).getTime();

console.log('\n--- the shared vocabulary ---\n');
{
  check('an Israeli number written with a leading 0 becomes the international digits', C.normalizePhone('054-123-4567') === '972541234567' && C.normalizePhone('+972 54 123 4567') === '972541234567' && C.normalizePhone('00972541234567') === '972541234567');
  check('a foreign number keeps its own country code', C.normalizePhone('+1 (415) 555-2671') === '14155552671');
  check('something that cannot be a phone number is null', C.normalizePhone('1234') === null && C.normalizePhone('abc') === null && C.normalizePhone('') === null && C.normalizePhone(null) === null);
  check('emails are lower-cased and checked', C.normalizeEmail(' Dana@Acme.COM ') === 'dana@acme.com' && C.normalizeEmail('not an email') === null);
  check('a full name is a key, a first name alone is not', C.nameKey('Dana Cole') === 'dana cole' && C.nameKey('Dana') === null && C.nameKey('D C') === null);
  check('names compare without case, punctuation or accents', C.nameKey('DANA  cole.') === C.nameKey('Dána Cole'));
  const k = C.keys({ channel: 'whatsapp', name: 'Dana Cole', phone: '054-123-4567' });
  check('keys separate hard evidence from the name hint', k.hard.length === 1 && k.hard[0] === 'phone:972541234567' && k.soft === 'name:dana cole', k);
  check('an unknown channel is a web page and cannot draft', C.known('telegram-x') === 'web' && !C.canDraft('web') && C.canDraft('gmail') && !C.canDraft('whatsapp'));
  const u = C.utterance({ channel: 'whatsapp', thread: 'chat1', id: 'm1', ts: NOW, direction: 'out', from: { name: 'Me' }, text: 'x'.repeat(9000) });
  check('an utterance is normalised and bounded', u.channel === 'whatsapp' && u.direction === 'out' && u.text.length === 6000 && u.from.channel === 'whatsapp');
}

console.log('\n--- one person, many apps ---\n');
{
  let g = I.empty();
  let r = I.observe(g, { channel: 'gmail', name: 'Dana Cole', email: 'dana@acme.com' }, NOW); g = r.graph;
  const dana = r.pid;
  check('a first sighting creates a person', dana && I.personOf(g, dana).emails[0] === 'dana@acme.com');
  r = I.observe(g, { channel: 'gmail', name: 'Dana C.', email: 'DANA@acme.com' }, NOW + 1); g = r.graph;
  check('the same email is the same person, with the new name added', r.pid === dana && I.personOf(g, dana).names.length === 2 && Object.keys(g.people).length === 1);
  r = I.observe(g, { channel: 'whatsapp', name: 'Dana Cole', phone: '054-123-4567' }, NOW + 2); g = r.graph;
  check('the same full name on another app with a new phone is NOT merged', r.pid !== dana && Object.keys(g.people).length === 2, g.people);
  check('it is suggested once, as a question', r.suggested && r.suggested.a === dana && r.suggested.b === r.pid && I.pendingLinks(g).length === 1, r.suggested);
  const wa = r.pid;
  r = I.observe(g, { channel: 'whatsapp', name: 'Dana Cole', phone: '+972541234567' }, NOW + 3); g = r.graph;
  check('seeing her again does not suggest again', r.pid === wa && r.suggested === null && I.pendingLinks(g).length === 1);
  check('hard keys alone never connect the two before the answer', !I.same(g, { email: 'dana@acme.com' }, { phone: '0541234567' }));
  const yes = I.answer(g, dana, wa, true);
  check('"same person" merges them: both addresses answer to one person', Object.keys(yes.people).length === 1 && I.same(yes, { email: 'dana@acme.com' }, { phone: '0541234567' }) && I.pendingLinks(yes).length === 0, yes.people);
  check('and it holds when she appears again by either key', I.resolve(yes, { phone: '0541234567' }) === I.resolve(yes, { email: 'dana@acme.com' }));
  const no = I.answer(g, dana, wa, false);
  check('"not the same" is remembered and never suggested again', I.pendingLinks(no).length === 0 && !I.same(no, { email: 'dana@acme.com' }, { phone: '0541234567' }) && no.denied.length === 1);
  const again = I.observe(no, { channel: 'whatsapp', name: 'Dana Cole', phone: '0509998888' }, NOW + 5);
  check('a third Dana Cole after a "no" does not re-ask about the denied pair', !again.suggested || again.suggested.a !== dana || again.suggested.b !== wa);
  // two people with the same full name: no suggestion when it would be ambiguous
  let h = I.empty();
  h = I.observe(h, { channel: 'gmail', name: 'Dana Cole', email: 'a@x.com' }, NOW).graph;
  h = I.observe(h, { channel: 'gmail', name: 'Dana Cole', email: 'b@y.com' }, NOW).graph;
  const amb = I.observe(h, { channel: 'whatsapp', name: 'Dana Cole', phone: '0541112222' }, NOW);
  check('two people already called Dana Cole: no guess at which one this is', amb.suggested === null && I.pendingLinks(amb.graph).length === 0);
  // one sighting that carries both keys is hard evidence
  let m = I.empty();
  m = I.observe(m, { channel: 'gmail', email: 'eli@z.com', name: 'Eli Bar' }, NOW).graph;
  m = I.observe(m, { channel: 'whatsapp', phone: '0521230000', name: 'Eli B' }, NOW).graph;
  check('before any card, an email and a phone are two people', Object.keys(m.people).length === 2);
  m = I.observe(m, { channel: 'web', email: 'eli@z.com', phone: '0521230000' }, NOW).graph;
  check('a sighting that carries both joins them', Object.keys(m.people).length === 1 && I.same(m, { email: 'eli@z.com' }, { phone: '0521230000' }), m);
  check('a name with no key at all is not a person', I.observe(I.empty(), { channel: 'web', name: 'Dana' }, NOW).pid === null);
  check('the graph stores no message text', !/lease|invoice|please/i.test(JSON.stringify(g)));
  let big = I.empty();
  for (let i = 0; i < I.MAX_PEOPLE + 40; i++) big = I.observe(big, { channel: 'gmail', email: 'p' + i + '@x.com', name: 'Person ' + i + 'x' }, NOW + i).graph;
  check('the graph is capped, oldest first', Object.keys(big.people).length === I.MAX_PEOPLE && !big.index['email:p0@x.com'] && big.index['email:p' + (I.MAX_PEOPLE + 39) + '@x.com']);
  check('aliases gather every address and number of a person', (() => { const a = I.aliasesOf(yes, { phone: '0541234567' }); return a.emails.includes('dana@acme.com') && a.phones.includes('972541234567'); })());
}

console.log('\n--- an answer in another app ---\n');
{
  let g = I.empty();
  g = I.observe(g, { channel: 'gmail', name: 'Dana Cole', email: 'dana@acme.com' }, NOW).graph;
  g = I.observe(g, { channel: 'whatsapp', name: 'Dana Cole', phone: '0541234567', email: 'dana@acme.com' }, NOW).graph; // joined by a card
  const wa = { channel: 'whatsapp', name: 'Dana Cole', phone: '0541234567' };
  const loop = (over) => Object.assign({ id: 't1', threadId: 't1', channel: 'gmail', status: 'waiting', direction: 'theirs', kind: 'reply', subject: 'Lease INV-204', what: 'Please send the signed lease INV-204 by Friday', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, createdAt: NOW - 3 * DAY, lang: 'en' }, over || {});
  const where = { channel: 'whatsapp', thread: 'chat1' };
  const opt = { now: NOW, extract: FlowExtract };
  let d = X.judge([loop()], g, wa, 'Sent you the signed lease INV-204 a minute ago, check your inbox. Confirmed.', where, opt);
  check('a message naming the same reference, from the same person, closes the loop', d && d.action === 'close' && d.watchId === 't1' && d.link === 'ref', d);
  d = X.judge([loop({ kind: 'payment', subject: 'Invoice', what: 'Please pay the invoice, 4,200 USD', amount: { value: 4200, currency: 'USD', raw: '$4,200' } })], g, wa, 'Paid $4,200 just now, transfer is on the way.', where, opt);
  check('the same amount on a payment loop, said as paid, closes it as paid', d && d.action === 'close' && d.reply.outcome === 'paid' && d.link === 'amount', d);
  d = X.judge([loop()], g, wa, 'Sure, I will get it to you by Friday afternoon for sure.', where, opt);
  check('a promise with no topical link only asks (it could be about anything)', d && d.action === 'ask' && d.link === 'person', d);
  d = X.judge([loop()], g, wa, 'ok thanks', where, opt);
  check('"ok thanks" never asks and never closes', d === null, d);
  d = X.judge([loop()], g, wa, 'Out of office until Monday, limited access to messages.', where, opt);
  check('an out-of-office is ignored', d === null, d);
  d = X.judge([loop(), loop({ id: 't2', threadId: 't2', subject: 'Venue', what: 'Please confirm the venue booking' })], g, wa, 'Yes, that is fine with me, go ahead as we said before.', where, opt);
  check('two open loops with that person and no topical link: silence', d === null, d);
  d = X.judge([loop(), loop({ id: 't2', threadId: 't2', subject: 'Venue', what: 'Please confirm the venue booking' })], g, wa, 'Signed lease INV-204 is attached to my last email, confirmed.', where, opt);
  check('two open loops, but the message names one of them: that one', d && d.watchId === 't1' && d.action === 'close', d);
  d = X.judge([loop()], g, { channel: 'whatsapp', name: 'Dana Cole', phone: '0509998888' }, 'Sent you the signed lease INV-204, confirmed.', where, opt);
  check('a different phone number that merely has the same name is a different person: nothing', d === null, d);
  d = X.judge([loop({ direction: 'mine' })], g, wa, 'Sent you the signed lease INV-204, confirmed.', where, opt);
  check('your own promise is never settled by someone else\'s message', d === null, d);
  d = X.judge([loop({ status: 'resolved' })], g, wa, 'Sent you the signed lease INV-204, confirmed.', where, opt);
  check('a closed loop is left alone', d === null, d);
  d = X.judge([loop({ crossAskedAt: NOW - DAY })], g, wa, 'Sure, I will get it to you by Friday afternoon for sure.', where, opt);
  check('a loop asked about yesterday is not asked about again', d === null, d);
  d = X.judge([loop({ channel: 'whatsapp', threadId: 'chat1' })], g, wa, 'Sent you the signed lease INV-204, confirmed.', where, opt);
  check('the same conversation is the normal path, not a cross-channel one', d === null, d);
  d = X.judge([loop()], g, wa, "Sorry for the delay, I'll get back to you on lease INV-204 by Friday.", where, opt);
  check('a promise with a topical link only moves the day (never closes)', d && d.action === 'promised', d);
  const patch = X.patchFor(loop(), X.judge([loop()], g, wa, 'Sent you the signed lease INV-204 a minute ago, check your inbox. Confirmed.', where, opt), 'whatsapp', NOW);
  check('the close patch says where the answer came from', patch && patch.status === 'resolved' && patch.resolvedBy === 'reply' && patch.viaChannel === 'whatsapp', patch);
}

console.log('\n--- one heading per person, across apps ---\n');
{
  const { FlowFollowUp: F } = require('../core/follow-up.js');
  let g = I.empty();
  g = I.observe(g, { channel: 'gmail', name: 'Dana Cole', email: 'dana@acme.com' }, NOW).graph;
  g = I.observe(g, { channel: 'web', email: 'dana@acme.com', phone: '0541234567' }, NOW).graph;
  const mk = (id, channel, cp, over) => Object.assign({ id, threadId: id, channel, status: 'waiting', direction: 'theirs', kind: 'reply', what: 'x', subject: 's', counterpart: cp, createdAt: NOW - DAY, lang: 'en', chaseIso: '2026-10-05', stage: 'waiting', nudges: 0 }, over || {});
  const loops = [mk('a', 'gmail', { name: 'Dana Cole', email: 'dana@acme.com' }), mk('b', 'whatsapp', { name: 'Dana Cole', phone: '972541234567' }), mk('c', 'gmail', { name: 'Omer', email: 'omer@x.com' })];
  const keyOf = (w) => { const a = I.aliasesOf(g, Object.assign({ channel: w.channel }, w.counterpart)); return a.emails[0] || (a.phones[0] ? 'phone:' + a.phones[0] : null); };
  const groups = F.groupByPerson(loops, NOW, { keyOf });
  const dana = groups.find((x) => x.name === 'Dana');
  check('the same person by email and on WhatsApp is one heading with both loops', groups.length === 2 && dana.loops.length === 2 && dana.apps.sort().join() === 'gmail,whatsapp', groups.map((x) => [x.name, x.loops.length, x.apps]));
  check('without the identity graph they stay apart (nothing is guessed)', F.groupByPerson(loops, NOW).length === 3);
  check('a loop that has only a phone number still gets a heading', F.groupByPerson([mk('d', 'whatsapp', { name: null, phone: '972501112222' })], NOW)[0].key === 'phone:972501112222');
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
