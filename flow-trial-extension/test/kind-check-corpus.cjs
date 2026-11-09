// Who owes what: core/kind-check.js corrects a model's kind from its own quotes; the person's own promise becomes their Follow-through.
// Run: node test/kind-check-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js', 'understanding-router.js',
  'ai-floor.js', 'kind-check.js', 'ai-engine.js'];
const sb = { module: undefined, console, setTimeout, clearTimeout, Promise };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const K = vm.runInContext('FlowKindCheck', sb), U = vm.runInContext('FlowUnderstanding', sb), E = vm.runInContext('FlowAiEngine', sb);
const today = '2026-10-07';
const NOW = Date.parse('2026-10-07T09:00:00');
const ON = { aiPrimary: true, aiPlanV1: true, aiKindCheckV1: true };
const OFF = { aiPrimary: true, aiPlanV1: true };
const it = (kind, ask, due) => ({ kind, actor: 'sender', ask_span: ask, evidence_span: ask, due_span: due, confidence: 0.9 });

(async () => {
  console.log('\n--- the frames ---\n');
  const k = (kind, s) => K.kindFor(kind, s).kind;
  check('a reminder of your own promise is your promise, not a reply', k('ask_of_me', 'Sali, you mentioned you would send the signed lease back on Monday.') === 'promise_by_me');
  check('"as promised, you will" is your promise, not theirs', k('promise_to_me', 'As promised on the call, you will share the W-9 by Thursday.') === 'promise_by_me');
  check('Hebrew: «הבטחת שתשלחי» is your promise', k('promise_to_me', 'הבטחת שתשלחי את הטופס עד מחר') === 'promise_by_me');
  check('Hebrew: «אמרת שתעביר» is your promise', k('ask_of_me', 'אמרת שתעביר את החוזה עד יום שלישי') === 'promise_by_me');
  check('Hebrew: an ask of you («תעבירי לי בבקשה») is an ask, not a promise to you', k('promise_to_me', 'סאלי, תעבירי לי בבקשה את גיליון התמחור עד יום שלישי.') === 'ask_of_me');
  check('"Could you send me" is an ask, not a promise to you', k('promise_to_me', 'Could you send me the deck by Friday?') === 'ask_of_me');
  check('"I will send" is their promise, not an ask of you', k('ask_of_me', 'I will send the contract on Friday.') === 'promise_to_me');
  check('Hebrew: «אשלח לך» is their promise', k('ask_of_me', 'אשלח לך את החוזה עד יום שלישי') === 'promise_to_me');
  check('an ask stays an ask', k('ask_of_me', 'Could you send me the lease by Friday?') === 'ask_of_me');
  check('a promise to you stays one', k('promise_to_me', 'I will send the contract on Friday.') === 'promise_to_me');
  check('"I will…, could you…" both: the model\'s kind stays', k('ask_of_me', 'I will send the draft, could you sign it by Friday?') === 'ask_of_me' && k('promise_to_me', 'I will send the draft, could you sign it by Friday?') === 'promise_to_me');
  check('a meeting is never re-kinded', k('meeting', 'you mentioned you would join the call on Monday at 10:00') === 'meeting');
  check('«תודה» is not an ask', k('promise_to_me', 'תודה, אשלח את זה מחר') === 'promise_to_me');

  console.log('\n--- check() and wrap() ---\n');
  const a = { intentions: [it('ask_of_me', 'you mentioned you would send the lease on Monday', 'on Monday')] };
  const c = K.check(a);
  check('check() returns a corrected copy and names the change', c.answer.intentions[0].kind === 'promise_by_me' && c.changes.length === 1 && c.changes[0].why === 'kind:reminder-of-own-promise');
  check('...and never changes the model\'s object', a.intentions[0].kind === 'ask_of_me');
  check('no intentions: the answer comes back as it was', K.check({ intentions: [] }).changes.length === 0 && K.check('x').answer === 'x');
  const fn = async () => a;
  check('switch off: wrap() hands back the same function', K.wrap({}, fn) === fn);
  check('switch on: the wrapped answer is corrected', (await K.wrap(ON, fn)('t')).intentions[0].kind === 'promise_by_me');
  check('a JSON string from a device session is parsed and corrected', (await K.wrap(ON, async () => JSON.stringify(a))('t')).intentions[0].kind === 'promise_by_me');
  check('an unreadable string is passed on for the validator to refuse', (await K.wrap(ON, async () => 'not json')('t')) === 'not json');

  console.log('\n--- proposal(): your own promise ---\n');
  const u = (intentions) => ({ relevant: 'unknown', state: 'open', needs: [], intentions });
  const own = K.proposal(U, u([Object.assign(it('promise_by_me', 'send the lease on Monday'), { due: '2026-10-12' })]), {});
  check('a dated own promise: a task the person owes', own.step === 'task' && own.kind === 'promise_by_me' && own.due === '2026-10-12', own);
  const undated = K.proposal(U, u([it('promise_by_me', 'send the lease')]), {});
  check('an undated own promise: silence', undated.step === 'SILENT' && undated.reason === 'own-promise-without-date', undated);
  const theirs = K.proposal(U, u([Object.assign(it('promise_to_me', 'I will send the lease'), { due: '2026-10-12' })]), {});
  check('a promise to you is read exactly as before (a task, not marked as the person\'s own)', theirs.step === 'task' && theirs.kind !== 'promise_by_me', theirs);
  check('U.proposal() itself still has no step for promise_by_me', U.proposal(u([Object.assign(it('promise_by_me', 'send the lease'), { due: '2026-10-12' })]), {}).step === 'SILENT');

  console.log('\n--- through the AI engine ---\n');
  const TEXT = 'Sali, you mentioned you would send the signed lease back on Monday.\nMany thanks,\nMichael';
  const mail = (text) => ({ text, subject: 'Lease', today, direction: 'inbound', surface: 'gmail', lang: 'en', threadId: 't-1', counterpart: { email: 'm@example.com' }, now: NOW,
    tier0: { quiet: null, step: 'SILENT', possible: true } });
  const deps = (answer) => ({ tier1: async () => answer });
  const model = { intentions: [it('ask_of_me', 'you mentioned you would send the signed lease back on Monday', 'on Monday')] };
  const before = await E.read(mail(TEXT), deps(model), OFF);
  check('switch off: the model\'s reply card stays (today\'s behaviour)', before.card && before.card.step === 'draft' && before.card.plan.processId === 'reply-track', before.card);
  const after = await E.read(mail(TEXT), deps(model), ON);
  check('switch on: the person\'s own promise, planned as their Follow-through', after.card && after.card.step === 'task' && after.card.proposal.kind === 'promise_by_me' && after.card.plan.processId === 'follow-through', after.card);
  check('...closed only when the person sends it, not by the task or the draft', after.card.plan.doneWhen.kind === 'promise-kept' && after.card.plan.closes === false && after.card.plan.steps.every((s) => s.needsClick));
  check('...and carried as theirs to keep: direction mine, owe:promise, looked at on Monday', after.watch && after.watch.direction === 'mine' && after.watch.subtype === 'owe:promise' && after.watch.chaseIso === '2026-10-12', after.watch);
  const HE = 'סאלי, תעבירי לי בבקשה את גיליון התמחור עד יום שלישי.';
  const heModel = { intentions: [it('promise_to_me', HE, 'עד יום שלישי')] };
  const heOff = await E.read(Object.assign(mail(HE), { lang: 'he' }), deps(heModel), OFF);
  const heOn = await E.read(Object.assign(mail(HE), { lang: 'he' }), deps(heModel), ON);
  check('Hebrew ask: off, tracked as something owed to her', heOff.card && heOff.card.step === 'task', heOff.card);
  check('Hebrew ask: on, a reply she owes, carried until her reply goes out', heOn.card && heOn.card.step === 'draft' && heOn.watch && heOn.watch.closeWhen === 'reply-sent', heOn.card);
  const pay = 'Sali, you mentioned you would pay the invoice on Monday.';
  const money = await E.read(mail(pay), deps({ intentions: [it('ask_of_me', pay, 'on Monday')] }), ON);
  check('the floor still runs after the correction: a payment stays silent', money.card === null && money.reason === 'veto:money-movement', money);

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/kind-check.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
