// core/chat-callback-ask.js: a request to call the sender back on a named day becomes a day, never a call.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-callback-ask-corpus.cjs
const { FlowChatCallbackAsk: A } = require('../core/chat-callback-ask.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Please call me back tomorrow', '2026-10-24'],
  ['Can you give me a call on Monday?', '2026-10-26'],
  ['Call me Thursday', '2026-10-29'],
  ['Ring me back today when you can', '2026-10-23'],
  ['תתקשר אליי מחר', '2026-10-24'],
  ['תחזור אליי ביום שלישי', '2026-10-27'],
  ['תצלצלי אליי היום בערב', '2026-10-23'],
  ['אפשר שתתקשר אליי ביום חמישי?', '2026-10-29']
];
for (const [text, day] of YES) { const r = A.recognize(text, NOW); check('callback: ' + text, r.kind === 'ask' && r.dateIso === day, r); }
const NO = [
  ['Call me', 'no day'],
  ["Don't call me tomorrow", 'refusal'],
  ["I'll call you tomorrow", 'own promise'],
  ['No need to call me back Monday', 'no need'],
  ['Maybe call me Thursday', 'hedge'],
  ['She will call me tomorrow', 'third person'],
  ['He called me yesterday', 'look back'],
  ['Call me on 2025-01-02', 'past'],
  ['Thanks for the call tomorrow', 'no call phrase'],
  ['אל תתקשר אליי מחר', 'refusal'],
  ['אני אתקשר אליך מחר', 'own promise'],
  ['אולי תתקשר אליי ביום שני', 'hedge'],
  ['תתקשר אליי', 'no day'],
  ['', 'empty'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) check('not a callback ask (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-callback-ask checks passed');
process.exit(failures ? 1 : 0);
