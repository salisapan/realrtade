// Learning ledger: every entry is a plain state, masked, capped, and removable.
// Run: node test/learning-ledger-corpus.cjs
const { FlowLedger: L } = require('../core/learning-ledger.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = 1790000000000;
const cp = { name: 'Dana Cohen', email: 'dana.cohen@acme.example' };

console.log('\n--- the phrase an entry may show ---\n');
{
  const p = L.phrase('Dana, could you send the signed lease to Acme Corp by Friday 10/12? Call 054-234-1998 or dana.cohen@acme.example', cp);
  check('the salutation name, the phone, the address and the date are gone', p && !/Dana|054|acme|10\/12|@/i.test(p), p);
  check('digits never survive', !/\d/.test(L.phrase('Please pay invoice 3049 for 4,200 dollars this week, thanks a lot', cp)));
  check('the other person\'s name is removed wherever it appears', !/Cohen|Dana/.test(L.phrase('Please ask Cohen and Dana whether the lease is ready this week', cp)));
  check('Hebrew gets no phrase at all (the shield has no Hebrew name rules)', L.phrase('אודה לסיוע בנידון, תודה מראש', cp) === null);
  check('long sentences are cut to the limit', L.phrase('Could you please send the revised statement of work with all the appendices attached together before the board meeting begins', cp).length <= L.PHRASE_MAX);
  check('too little left to show means no phrase', L.phrase('ok', cp) === null && L.phrase('', cp) === null && L.phrase(null, cp) === null);
}

console.log('\n--- entries ---\n');
{
  const e = L.make('askConfirmed', { text: 'Could you please send the signed lease by Friday?', counterpart: cp, about: 'a file' }, NOW);
  check('an entry is a time, a kind and one sentence', e && e.t === NOW && e.kind === 'askConfirmed' && typeof e.line === 'string', e);
  check('it quotes the masked phrase', /signed lease/.test(e.line));
  const he = L.make('askMissed', { text: 'אודה לסיוע בנידון', counterpart: cp }, NOW);
  check('Hebrew entries still read as a sentence, without a quote', he && !/[“”]/.test(he.line), he);
  const noText = L.make('askConfirmed', { about: 'a payment' }, NOW);
  check('with no text it says what it was about instead', /about a payment/.test(noText.line), noText);
  check('an unknown kind makes nothing', L.make('nonsense', {}, NOW) === null);
  const all = L.KINDS.map((k) => L.make(k, { text: 'Could you send the report', who: 'Dana', days: 3, expectDays: 2, note: 'short, no greeting', about: 'a file' }, NOW));
  check('every kind has a sentence', all.every((x) => x && x.line.length > 10), all);
  check('no sentence claims cleverness (docs/product-identity.md)', all.every((x) => !/\bAI\b|smart|intelligen|understands|assistant|copilot|chatbot|sparkle/i.test(x.line)), all.map((x) => x.line));
  const timing = L.make('timing', { who: 'Dana', days: 1, expectDays: 2 }, NOW);
  check('timing says days in the right number', /took 1 day to answer/.test(timing.line) && /about 2 from them/.test(timing.line), timing);
}

console.log('\n--- the list ---\n');
{
  let list = [];
  const e1 = L.make('accepted', { text: 'Can you confirm the venue booking this week please' }, NOW);
  list = L.append(list, e1);
  list = L.append(list, L.make('accepted', { text: 'Can you confirm the venue booking this week please' }, NOW + 3600 * 1000));
  check('the same thing twice in one day is one entry', list.length === 1, list);
  list = L.append(list, L.make('accepted', { text: 'Can you confirm the venue booking this week please' }, NOW + 2 * 24 * 3600 * 1000));
  check('on another day it is a new entry', list.length === 2);
  for (let i = 0; i < 80; i++) list = L.append(list, L.make('turnedDown', { text: 'Could you review proposal number ' + 'abcdefghij'[i % 10] + ' soon please thanks' + 'x'.repeat(i % 7) }, NOW + (3 + i) * 24 * 3600 * 1000));
  check('capped at ' + L.CAP + ', oldest dropped', list.length === L.CAP && list[0].kind === 'turnedDown', list.length);
  check('recent() is newest first and limited', L.recent(list, 3).length === 3 && L.recent(list, 3)[0].t >= L.recent(list, 3)[1].t);
  check('append on garbage input never throws and never grows', L.append(null, null).length === 0 && L.append([], { t: 1 }).length === 0);
  check('summary is plain', L.summary([]) === null && L.summary([1]) === '1 adjustment so far' && L.summary([1, 2]) === '2 adjustments so far');
  check('an entry carries only time, kind and line: nothing else of the mail', Object.keys(e1).sort().join() === 'kind,line,t');
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
