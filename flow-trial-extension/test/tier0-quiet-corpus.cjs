// Quiet on the engine's own card when the mail says there is nothing to do yet: a hedge, an undecided sender, a deadline already met.
// core/tier0-quiet.js, through core/ai-engine.js. Run: node test/tier0-quiet-corpus.cjs
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
  'ai-floor.js', 'kind-check.js', 'tier0-guard.js', 'tier0-quiet.js', 'ai-engine.js'];
const sb = { module: undefined, console, setTimeout, clearTimeout, Promise };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const Q = vm.runInContext('FlowTier0Quiet', sb), E = vm.runInContext('FlowAiEngine', sb);
const q = (text, step) => Q.check({ text, subject: '' }, step || 'draft');

(async () => {
  console.log('\n--- quiet ---\n');
  check('"when things calm down": a hedge', q("Let's find a time to catch up on the vendor contract when things calm down.") === 'quiet:hedge');
  check('"sometime next month, no rush": a hedge', q('Maybe we could meet sometime next month to talk about the pilot results, no rush.', 'calendar') === 'quiet:hedge');
  check('Hebrew «כשיירגע»: a hedge', q('בוא נמצא זמן לדבר על ההשקה כשיירגע.') === 'quiet:hedge');
  check('Hebrew «אין לחץ, מתישהו»: a hedge', q('אין לחץ, נדבר על זה מתישהו.') === 'quiet:hedge');
  check('Hebrew «עדיין לא החלטנו»: undecided', q('נניח שנאשר ₪40,000 – תוכלו להתחיל ביום ראשון? עדיין לא החלטנו.') === 'quiet:undecided');
  check('"we haven\'t decided yet": undecided', q("If we go ahead, could you start Monday? We haven't decided yet.") === 'quiet:undecided');
  check('Hebrew: a deadline already met', q('החוזה היה אמור להגיע ביום שישי שעבר וחתמנו בזמן.', 'task') === 'quiet:retro');
  check('"it was due last Friday and we already signed": met', q('The contract was due last Friday and we already signed it.', 'task') === 'quiet:retro');

  console.log('\n--- not quiet ---\n');
  check('a hedge with a real deadline still offers ("no rush, but by Friday")', q('No rush, but could you send the deck by Friday?') === null);
  check('a hedge with a clock still offers', q("Let's catch up sometime next week, Tuesday at 10:00?", 'calendar') === null);
  check('Hebrew: «אין לחץ, אבל עד מחר» still offers', q('אין לחץ, אבל אפשר לקבל את הטופס עד מחר?') === null);
  check('a plain dated ask', q('Could you send me the signed lease by Friday?') === null);
  check('last week, but nothing was done: not met', q('The invoice was due last Friday. Could you pay it today?', 'task') === null);
  check('last week, done, and a new meeting: not met', q("Thanks for last week, we signed. Let's meet again on Monday.", 'calendar') === null);
  check('a met deadline does not silence a reply draft', q('The contract was due last Friday and we already signed it.', 'draft') === null);
  check('no card: nothing to keep quiet', Q.check({ text: 'no rush' }, 'SILENT') === null);
  check('the switch is named and off by default', Q.SWITCH === 'aiTier0QuietV1' && Q.DEFAULTS.aiTier0QuietV1 === false && !Q.enabled({}));

  console.log('\n--- through the AI engine ---\n');
  const deps = { tier1: async () => ({ intentions: [] }) };
  const mail = (text, step) => ({ text, subject: 'Idea', today: '2026-10-07', direction: 'inbound', surface: 'gmail', threadId: 't-1', now: Date.parse('2026-10-07T09:00:00'),
    tier0: { quiet: null, step, possible: true } });
  const HEDGE = "Let's find a time to catch up on the vendor contract when things calm down.";
  const off = await E.read(mail(HEDGE, 'draft'), deps, { aiPrimary: true });
  check('switch off: the engine\'s own card as today', off.card && off.card.source === 'engine' && off.card.step === 'draft', off);
  const on = await E.read(mail(HEDGE, 'draft'), deps, { aiPrimary: true, aiTier0QuietV1: true });
  check('switch on: quiet', on.card === null && on.reason === 'quiet:hedge', on);
  const ok = await E.read(mail('Could you send the deck by Friday?', 'draft'), deps, { aiPrimary: true, aiTier0QuietV1: true });
  check('a real ask keeps its card', ok.card && ok.card.step === 'draft', ok);

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/tier0-quiet.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
