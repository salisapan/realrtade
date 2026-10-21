// The answer to a "next move" closes the loop it was asked about (core/cross-channel.js judge, opts.moveLink; only with
// CARRY.nextMove on). Glance suggested asking Dana on WhatsApp (or asking Yossi); the person did; the answer arrives there.
// Today (A) that answer reaches the loop only through a reference number or when Dana has a single open loop, and then only as
// a question. With the link (B) the first answer in the app of the move belongs to that loop, and classifyReply still decides
// whether it is an answer. Pinned: switch off = today; "ok", a question back, an out-of-office never close; two loops moved to
// the same app, an old move, a dismissed move or another app: no link. Prints the A/B table. Run: node test/carry-move-answer-corpus.cjs
const { FlowCrossChannel: X } = require('../core/cross-channel.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 86400000;
const NOW = new Date('2026-10-14T12:00:00').getTime(); // a Wednesday
const DANA = { email: 'dana@acme.co.il', phone: '+972501234567', name: 'Dana Cole' };
let graph = I.empty();
graph = I.observe(graph, { app: 'gmail', email: DANA.email, name: DANA.name }, NOW - 90 * DAY).graph;
graph = I.observe(graph, { app: 'whatsapp', phone: DANA.phone, name: DANA.name }, NOW - 80 * DAY).graph;
graph = I.observe(graph, { app: 'contacts', email: DANA.email, phone: DANA.phone, name: DANA.name }, NOW - 70 * DAY).graph;
const fromDanaWa = { app: 'whatsapp', phone: DANA.phone, name: DANA.name };
const fromYossi = { app: 'gmail', email: 'yossi@acme.co.il', name: 'Yossi Levi' };
check('fixture: Dana on WhatsApp is the same person as Dana on mail', I.same(graph, { email: DANA.email }, fromDanaWa));

function loops(lang, moveOverrides) {
  const lease = {
    id: 'lease', threadId: 't-lease', status: 'waiting', direction: 'theirs', kind: 'reply', channel: 'gmail', lang,
    counterpart: { email: DANA.email, name: DANA.name }, subject: lang === 'he' ? 'החוזה החתום' : 'the signed lease',
    what: lang === 'he' ? 'לשלוח את החוזה החתום' : 'send the signed lease', nudges: 3, stage: 'nudged', createdAt: NOW - 30 * DAY,
    moves: [Object.assign({ type: 'channel', app: 'whatsapp', at: NOW - 1 * DAY }, moveOverrides || {})]
  };
  // A second open loop with Dana, not moved: an answer must never close it by accident.
  const quote = {
    id: 'quote', threadId: 't-quote', status: 'waiting', direction: 'theirs', kind: 'reply', channel: 'gmail', lang,
    counterpart: { email: DANA.email, name: DANA.name }, subject: lang === 'he' ? 'הצעת המחיר לרבעון' : 'the Q4 quote',
    what: lang === 'he' ? 'לאשר את הצעת המחיר' : 'approve the Q4 quote', nudges: 1, stage: 'nudged', createdAt: NOW - 10 * DAY
  };
  return [lease, quote];
}
const colleagueMove = { type: 'colleague', to: 'yossi@acme.co.il', at: NOW - 1 * DAY };

// expect: 'close' (a real answer to the moved loop), 'promised' (a day), 'none' (no close: ack, question, out-of-office, chat)
const CASES = [
  // after a channel move to WhatsApp, from Dana
  ['he', 'wa', 'שלחתי לך עכשיו במייל את החוזה החתום', 'close'],
  ['he', 'wa', 'סליחה על העיכוב, שלחתי את זה הבוקר', 'close', 'known: the on-device reply model reads it as interim and holds the loop open'],
  ['he', 'wa', 'חתמתי ושלחתי לך במייל', 'close'],
  ['he', 'wa', 'לא רלוונטי יותר, החלטנו לא להמשיך', 'close'],
  ['he', 'wa', 'סליחה, ראיתי רק עכשיו. אשלח מחר בבוקר', 'promised'],
  ['he', 'wa', 'אני על זה, אשלח עד יום חמישי', 'promised'],
  ['he', 'wa', 'אוקיי', 'none'],
  ['he', 'wa', 'תודה!', 'none'],
  ['he', 'wa', 'איזה חוזה?', 'none'],
  ['he', 'wa', 'מי זה?', 'none'],
  ['en', 'wa', 'Just emailed you the signed lease, sorry for the delay', 'close'],
  ['en', 'wa', 'Signed and sent this morning', 'close'],
  ['en', 'wa', "We decided not to go ahead, so no need anymore", 'close'],
  ['en', 'wa', "Sorry, I'll send it by Friday", 'promised'],
  ['en', 'wa', 'ok', 'none'],
  ['en', 'wa', 'Thanks!', 'none'],
  ['en', 'wa', 'Which lease?', 'none'],
  ['en', 'wa', 'I am out of the office until Sunday', 'none'],
  // after a colleague move, from Yossi (by mail, a new thread)
  ['he', 'yossi', 'דנה בחופשה, מצורף החוזה החתום', 'close', 'known: "בחופשה" reads as an out-of-office; held open'],
  ['he', 'yossi', 'היא בחופשה, אבדוק מחר ואחזור אליך', 'promised', 'known: "בחופשה" reads as an out-of-office; held open'],
  ['he', 'yossi', 'מי שואל?', 'none'],
  ['en', 'yossi', 'Dana is on leave. Attached is the signed lease.', 'close', 'known: "on leave" reads as an out-of-office; held open'],
  ['en', 'yossi', "I'll check with her tomorrow and get back to you", 'promised'],
  ['en', 'yossi', 'Who is asking?', 'none']
];

function run(c, moveLink) {
  const [lang, via, text] = c;
  const ws = via === 'yossi' ? loops(lang).map((w) => (w.id === 'lease' ? Object.assign({}, w, { moves: [colleagueMove] }) : w)) : loops(lang);
  const sender = via === 'yossi' ? fromYossi : fromDanaWa;
  const where = via === 'yossi' ? { channel: 'gmail', thread: 't-new' } : { channel: 'whatsapp', thread: 'wa-dana' };
  return X.judge(ws, graph, sender, text, where, { now: NOW, extract: FlowExtract, moveLink });
}
const outcome = (d) => (!d ? 'none' : d.action === 'close' ? 'close' : d.action === 'promised' ? 'promised' : 'ask');

const tally = {};
function add(arm, lang, key) { const k = arm + '|' + lang; tally[k] = tally[k] || { n: 0, shouldClose: 0, closed: 0, missedClose: 0, wrongClose: 0, wrongLoop: 0, promisedOk: 0, shouldPromise: 0, asked: 0 }; tally[k][key] = (tally[k][key] || 0) + 1; }
console.log('--- the same 24 replies, A (today) and B (move link) ---');
CASES.forEach((c) => {
  ['A', 'B'].forEach((arm) => {
    const d = run(c, arm === 'B');
    const got = outcome(d);
    const exp = c[3];
    ['all', c[0]].forEach((lang) => {
      add(arm, lang, 'n');
      if (exp === 'close') { add(arm, lang, 'shouldClose'); if (got === 'close') add(arm, lang, 'closed'); else add(arm, lang, 'missedClose'); }
      if (exp === 'promised') { add(arm, lang, 'shouldPromise'); if (got === 'promised') add(arm, lang, 'promisedOk'); }
      if (exp !== 'close' && got === 'close') add(arm, lang, 'wrongClose');
      if (d && d.watchId && d.watchId !== 'lease') add(arm, lang, 'wrongLoop');
      if (got === 'ask') add(arm, lang, 'asked');
    });
    // B: a real answer closes, or (no rule cue) asks the person once; a known miss stays open and silent; a non-answer never closes.
    const okB = c[4] ? got === 'none' : exp === 'none' ? got !== 'close' && got !== 'promised' : exp === 'close' ? got === 'close' || got === 'ask' : got === exp;
    if (arm === 'B') check('B: "' + c[2] + '" → ' + (c[4] ? 'held open (' + c[4] + ')' : exp), okB, d && { action: d.action, outcome: d.reply && d.reply.outcome, watch: d.watchId });
    if (arm === 'B') check('B never touches the loop that was not moved: "' + c[2] + '"', !d || d.watchId === 'lease', d && d.watchId);
  });
});

console.log('--- no link when the evidence is not there ---');
const t1 = ['he', 'wa', 'שלחתי לך עכשיו במייל את החוזה החתום'];
const judgeWith = (ws, sender, where) => X.judge(ws, graph, sender, t1[2], where, { now: NOW, extract: FlowExtract, moveLink: true });
const base = loops('he');
check('switch off (no moveLink): exactly today\'s answer on every case', CASES.every((c) => JSON.stringify(run(c, undefined)) === JSON.stringify(run(c, false))));
check('a move 8 days ago: no link', outcome(judgeWith(loops('he', { at: NOW - 8 * DAY }), fromDanaWa, { channel: 'whatsapp' })) === 'none');
check('a dismissed move: no link', outcome(judgeWith(loops('he', { dismissed: true }), fromDanaWa, { channel: 'whatsapp' })) === 'none');
check('an answer in another app than the move (Telegram): no link', outcome(judgeWith(base, { app: 'telegram', phone: DANA.phone }, { channel: 'telegram' })) === 'none');
check('a different person on WhatsApp: no link', outcome(judgeWith(base, { app: 'whatsapp', phone: '+972509999999', name: 'Dana Cohen' }, { channel: 'whatsapp' })) === 'none');
const both = base.map((w) => Object.assign({}, w, { moves: [{ type: 'channel', app: 'whatsapp', at: NOW - DAY }] }));
check('two loops moved to WhatsApp with Dana: no guess', outcome(judgeWith(both, fromDanaWa, { channel: 'whatsapp' })) === 'none');
const answered = base.map((w) => (w.id === 'lease' ? Object.assign({}, w, { lastReplyAt: NOW - 12 * 3600 * 1000 }) : w));
check('she already answered after the move: no second link', outcome(judgeWith(answered, fromDanaWa, { channel: 'whatsapp' })) === 'none');
const notYossi = { app: 'gmail', email: 'rina@acme.co.il', name: 'Rina' };
check('a colleague move links only the colleague who was asked', outcome(X.judge(base.map((w) => (w.id === 'lease' ? Object.assign({}, w, { moves: [colleagueMove] }) : w)), graph, notYossi, 'מצורף החוזה החתום', { channel: 'gmail' }, { now: NOW, extract: FlowExtract, moveLink: true })) === 'none');
const d0 = run(['en', 'wa', 'Just emailed you the signed lease, sorry for the delay'], true);
const patch = X.patchFor(base[0], d0, 'whatsapp', NOW);
check('a close writes the same patch as an answer in the thread, plus where it came from', patch && patch.status === 'resolved' && patch.closedAs === 'replied' && patch.viaChannel === 'whatsapp', patch);

console.log('\n| arm | lang | n | should close | closed | missed close | wrong close | wrong loop | promised day kept | asked |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
['all', 'he', 'en'].forEach((lang) => ['A', 'B'].forEach((arm) => {
  const t = tally[arm + '|' + lang];
  console.log('| ' + arm + ' | ' + lang + ' | ' + t.n + ' | ' + t.shouldClose + ' | ' + t.closed + ' | ' + t.missedClose + ' | ' + t.wrongClose + ' | ' + t.wrongLoop + ' | ' + t.promisedOk + '/' + t.shouldPromise + ' | ' + t.asked + ' |');
}));
const B = tally['B|all'];
check('B: zero wrong closes and zero wrong loops', B.wrongClose === 0 && B.wrongLoop === 0, B);

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
