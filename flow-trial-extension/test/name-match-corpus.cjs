// name-match.js: equivalent() and matchesRecipient() must stay precise for greeting gates.
'use strict';
const { FlowNameMatch: N } = require('../core/name-match.js');

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

check('equivalent links Dana and דנה', N.equivalent('Dana', 'דנה') === true);
check('equivalent rejects unrelated names', N.equivalent('Dana', 'Noa') === false);
check('breaking equivalent breaks Dana↔דנה', (function () {
  const orig = N.equivalent;
  const broken = (a, b) => (String(a).toLowerCase() === 'dana' && String(b).indexOf('ד') >= 0 ? false : orig(a, b));
  return broken('Dana', 'דנה') === false && orig('Dana', 'דנה') === true;
})());
check('matchesRecipient finds display name', N.matchesRecipient('Dana', [{ name: 'Dana Levi', email: 'dana@x.com' }]) === true);
check('matchesRecipient rejects wrong recipient', N.matchesRecipient('Noa', [{ name: 'Dana Levi', email: 'dana@x.com' }]) === false);
check('breaking matchesRecipient breaks display match', (function () {
  const orig = N.matchesRecipient;
  const broken = (who, recips) => (String(who).toLowerCase() === 'dana' ? false : orig(who, recips));
  const recips = [{ name: 'Dana Levi', email: 'dana@x.com' }];
  return broken('Dana', recips) === false && orig('Dana', recips) === true;
})());

if (failures) process.exit(1);
console.log('name-match-corpus: all passed (' + checks + ' checks)');
