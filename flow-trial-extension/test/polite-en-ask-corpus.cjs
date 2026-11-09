// Four polite English forms that are an ask of the reader and were quiet: "I'd be grateful if you could ...", "Do you think you could ...?",
// "If you could send ... that would be perfect", "We need the signed form back by Friday" / "We need the figures from you by Monday",
// and "It would be helpful to have the signed NDA before Thursday". Lines under SHOW were not used to write the patterns; the QUIET lines
// are look-alikes that are not an ask of the reader. Run: node test/polite-en-ask-corpus.cjs
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'];
const sb = { console }; vm.createContext(sb);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const judge = vm.runInContext('FlowIncomingJudge.judge', sb);
const base = { subject: 'Re: x', sender: { email: 'dana@firm.example', name: 'Dana' }, to: ['me@example.com'], ownAddresses: ['me@example.com'], now: new Date('2026-10-26T10:00:00+02:00'), attachmentCount: 0, userName: 'Sali', ownNames: ['Sali'], surface: 'outlook' };
const ask = (t) => { const r = judge(Object.assign({ text: t }, base), {}); return Boolean(r.show) || (r.intent && r.intent.type === 'request'); };
let failures = 0;
function check(name, cond) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name); } }
const SHOW = [
  "I'd be grateful if you could review the draft by tomorrow",
  "We'd be grateful if you could confirm the booking by Wednesday",
  'Do you think you could check the figures by Thursday?',
  'If you could send the photos by Wednesday that would be perfect',
  'If you could please sign the agreement before Friday, we can start',
  'We need the signed form back by Friday',
  'I need the updated deck back by Monday',
  'We need the figures from you by Monday',
  'It would be helpful to have the signed NDA before Thursday',
  'It would be great to get the final numbers by Tuesday'
];
const QUIET = [
  'If you could see the view from here, you would love it',
  "I'd be grateful if you could forgive me",
  'I need the keys back from the shop, but I will handle it',
  'We need the bike back, thanks for the loan last year',
  'It would be great to have the weekend off',
  'I need a break from you guys, haha'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All polite-en-ask checks passed');
process.exit(failures ? 1 : 0);
