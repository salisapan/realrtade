#!/usr/bin/env node

const { judgeSharedText, draftForShare, waMePrefill } = require('../src/bridge/runtime.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

const NOW = new Date('2026-10-15T12:00:00Z');

{
  const judged = judgeSharedText('Could we meet Thursday at 3pm?', {
    now: NOW,
    surface: 'extension',
    sender: { email: 'dana@example.com' },
    to: ['me@example.com'],
    ownAddresses: ['me@example.com']
  });
  check('bridge judges a meeting hold', judged && judged.show && judged.process && judged.process.id === 'hold', judged && judged.process && judged.process.id);
}

{
  const draft = draftForShare('Please send me the report by Friday.', {
    now: NOW,
    surface: 'gmail',
    sender: { email: 'dana@example.com', name: 'Dana' },
    to: ['me@example.com'],
    ownAddresses: ['me@example.com'],
    subject: 'Report'
  });
  check('bridge builds a draft for reply-track', draft && draft.length > 20, draft && draft.slice(0, 30));
  const link = waMePrefill(draft);
  check('wa.me prefill is honest draft ready', link && link.indexOf('wa.me') !== -1 && link.indexOf(encodeURIComponent('Please send')) !== -1, link);
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll bridge checks passed');
