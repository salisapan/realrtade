// Is a mail worth a model read? core/cloud-worth.js: no sign of something to do -> no model is asked, neither the device model nor the cloud.
// Run: node test/cloud-worth-corpus.cjs
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
  'ai-floor.js', 'kind-check.js', 'tier0-guard.js', 'tier0-quiet.js', 'cloud-worth.js', 'ai-engine.js'];
const sb = { module: undefined, console, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const W = vm.runInContext('FlowCloudWorth', sb), E = vm.runInContext('FlowAiEngine', sb);
const w = (text, over) => W.worth(Object.assign({ text, subject: '' }, over || {}));

(async () => {
  console.log('\n--- nothing to do: not worth a read ---\n');
  check('a thank-you', w('Thanks for the great session yesterday, team!') === false);
  check('a photo share', w('Lovely photos from the trip :)') === false);
  check('Hebrew: «תודה רבה על האירוח, היה כיף»', w('תודה רבה על האירוח, היה כיף') === false);

  console.log('\n--- any sign of something to do: worth a read ---\n');
  check('a question', w('Did the package arrive?') === true);
  check('a request', w('Please send the signed lease.') === true);
  check('a promise', w("I'll get the numbers to you soon.") === true);
  check('a reminder of your promise', w("You said you'd get back to me with the CV.") === true);
  check('a meeting time', w('Lunch at 12:30 works.') === true);
  check('a weekday', w('Talk Thursday.') === true);
  check('an attachment, whatever the text says', w('FYI.', { attachmentCount: 1 }) === true);
  check('Hebrew: an ask', w('אפשר לקבל את הטופס?') === true);
  check('Hebrew: a meeting', w('נתראה בפגישה ביום שלישי') === true);
  check('Hebrew: a confirmed amount (the owner\'s rule 3b decides it, not this filter)', w('מאשרת את הסכום: ₪450') === true);
  check('Hebrew: a promise', w('אשלח לך את זה') === true);
  check('the subject counts too', w('Thanks!', { subject: 'Contract to sign' }) === true);
  check('the switch is named and off by default', W.SWITCH === 'aiCloudWorthV1' && W.DEFAULTS.aiCloudWorthV1 === false && !W.enabled({}));

  console.log('\n--- through the AI engine ---\n');
  const calls = { n: 0 };
  const deps = { tier1: async () => { calls.n++; return { intentions: [] }; }, tier2: async () => { calls.n++; return { intentions: [] }; }, mask: (t) => ({ ok: true, text: t }) };
  const mail = (text, step) => ({ text, subject: '', today: '2026-10-07', direction: 'inbound', surface: 'gmail', threadId: 't-1', cloudConsent: true,
    now: Date.parse('2026-10-07T09:00:00'), tier0: { quiet: null, step: step || 'SILENT', possible: !step } });
  const THANKS = 'Thanks for the great session yesterday, team!';
  await E.read(mail(THANKS), deps, { aiPrimary: true });
  check('switch off: a model is asked as today', calls.n > 0, calls.n);
  calls.n = 0;
  const on = await E.read(mail(THANKS), deps, { aiPrimary: true, aiCloudWorthV1: true });
  check('switch on: no model is asked, no card', calls.n === 0 && on.card === null && on.reason === 'no-signal', { calls: calls.n, on });
  calls.n = 0;
  await E.read(mail('Could you send the deck by Friday?'), deps, { aiPrimary: true, aiCloudWorthV1: true });
  check('a mail with an ask is still read', calls.n > 0);
  const engine = await E.read(mail(THANKS, 'draft'), deps, { aiPrimary: true, aiCloudWorthV1: true });
  check('the engine\'s own card is never touched', engine.card && engine.card.source === 'engine' && engine.card.step === 'draft', engine);

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/cloud-worth.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
