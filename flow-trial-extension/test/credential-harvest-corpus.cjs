// A request to hand over card, bank or login details under a threat ("submit your payment details on our secure site to avoid suspension", «הזן את פרטי כרטיס האשראי... החשבון ייחסם») is
// a credential harvest and gets no card. The ask without the threat ("send me the invoice details by Friday") is an ordinary work ask and still gets one. Run: node test/credential-harvest-corpus.cjs
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
const QUIET = [
  'Please submit your payment details on our secure site to avoid suspension',
  'Please update your billing information to avoid account suspension',
  'Please confirm your card details within 24 hours or your account will be closed',
  'הזן את פרטי כרטיס האשראי שלך כדי למנוע השעיה, החשבון ייחסם תוך 24 שעות'
];
const ASK = [
  'Please send me the invoice details by Friday',
  'Please send the bank details for the transfer by Thursday',
  'Please confirm your account number for the payment by Monday',
  'Can you update your billing address on the contract by Friday?',
  'Please provide the payment details of the vendor by Wednesday'
];
const quietOf = (t) => { const r = judge(Object.assign({ text: t }, base), {}); return !(Boolean(r.show) && !String(r.reason || '').startsWith('quiet')); };
const shown = (t) => { const r = judge(Object.assign({ text: t }, base), {}); return Boolean(r.show) || (r.intent && r.intent.type === 'request' && !String(r.reason || '').startsWith('quiet')); };
for (const t of QUIET) check('stays quiet: ' + t, !shown(t));
for (const t of ASK) check('still asks: ' + t, shown(t));
console.log(failures ? failures + ' FAILED' : 'All credential-harvest checks passed');
process.exit(failures ? 1 : 0);
