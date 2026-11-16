'use strict';
// Owner decision 2026-10-14 (C-1, glance-ai/labeling/owner-rules.md 3b): a mail that only confirms an amount or an approved budget and asks
// nothing is silence. The engine still offers the confirmed-amount close by DEFAULT; `ctx.confirmedAmountSilent === true` is the alignment, off
// until a host passes it (none does yet). This corpus pins both halves: the default is byte-identical, the option silences only the no-ask case.
// Run: node test/confirmed-amount-silent-corpus.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const ROOT = path.join(__dirname, '..');
const sb = { module: undefined, console }; vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sb, { filename: f });
const FlowIntent = vm.runInContext('FlowIntent', sb);
const NOW = new Date('2026-10-07T12:00:00+03:00');
const typeOf = (t, extra) => { const i = FlowIntent.classify(t, Object.assign({ now: NOW, namesWaitDone: true, ownNames: ['Sali', 'סאלי'], to: ['ai.local.flow@gmail.com'], cc: [], ownAddresses: ['ai.local.flow@gmail.com'], inbound: true, direction: 'inbound' }, extra || {})); return i && i.type ? i.type : null; };
const NO_ASK = ['Hi Sali,\n\nThe fee was approved at $4,200.\n\nThanks,\nDana', 'היי סאלי,\n\nאושר תקציב של ₪4,200.\n\nתודה, דנה', 'We approved $3,900 for the Q4 plan.'];
for (const t of NO_ASK) {
  const def = typeOf(t), on = typeOf(t, { confirmedAmountSilent: true });
  check('default unchanged, still a confirmed-amount close: ' + t.slice(0, 30).replace(/\n/g, ' '), def === 'decision', def);
  check('with the option the mail is silent: ' + t.slice(0, 30).replace(/\n/g, ' '), on === null, on);
}
const ASKS = ['Hi Sali,\n\nPlease confirm the $4,200 payment by Friday.\n\nDana', 'היי סאלי,\n\nנא לאשר את התשלום של ₪4,200 עד יום שישי.\n\nדנה'];
for (const t of ASKS) check('an amount WITH an ask is untouched by the option: ' + t.slice(0, 30).replace(/\n/g, ' '), typeOf(t, { confirmedAmountSilent: true }) === typeOf(t), [typeOf(t), typeOf(t, { confirmedAmountSilent: true })]);
const PROMISE = 'Hi Sali,\n\nI will pay the $500 invoice on Friday.\n\nDana';
check('a dated promise with an amount is untouched by the option', typeOf(PROMISE, { confirmedAmountSilent: true }) === typeOf(PROMISE), [typeOf(PROMISE), typeOf(PROMISE, { confirmedAmountSilent: true })]);
check('a falsy or string option does not switch it on', typeOf(NO_ASK[0], { confirmedAmountSilent: 'true' }) === 'decision' && typeOf(NO_ASK[0], { confirmedAmountSilent: 1 }) === 'decision');
console.log(failures ? '\nFAILURES: ' + failures : '\nTOTAL FAILURES: 0'); process.exit(failures ? 1 : 0);
