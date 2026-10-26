// The AI engine, one call: tier 0 card untouched, a model card planned and carried, silence when it cannot be closed.
// Run: node test/ai-engine-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js', 'understanding-router.js', 'ai-engine.js'];
const sb = { module: undefined, console, setTimeout, clearTimeout, Promise };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const E = vm.runInContext('FlowAiEngine', sb);
const today = '2026-10-07';
const NOW = Date.parse('2026-10-07T09:00:00');
const TEXT = 'Hi Sali,\nCould you send me the signed lease by Friday? We need it for the bank.\nDana';
const ask = { intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease by Friday?', evidence_span: 'We need it for the bank.', due_span: 'by Friday', confidence: 0.9 }] };
const mail = (over) => Object.assign({ text: TEXT, subject: 'Lease', today, direction: 'inbound', surface: 'gmail', threadId: 't-1', counterpart: { email: 'dana@example.com' }, now: NOW,
  tier0: { quiet: null, step: 'SILENT', possible: true } }, over || {});
const deps = (answer) => ({ tier1: async () => answer, gate: () => ({ pass: true }), veto: () => null });
const ALL = { aiPrimary: true, aiPlanV1: true };

(async () => {
  console.log('\n--- off ---\n');
  check('aiPrimary off: not used, nothing called', (await E.read(mail(), deps(ask), {})).used === false && (await E.read(mail(), deps(ask), { aiPlanV1: true })).used === false);

  console.log('\n--- tier 0: the engine card as the engine built it ---\n');
  const e = await E.read(mail({ tier0: { quiet: null, step: 'calendar', possible: true } }), deps(ask), ALL);
  check('an engine card comes back untouched, with no model plan and no watch', e.card && e.card.source === 'engine' && e.card.step === 'calendar' && !e.card.plan && e.watch === null, e);
  const q = await E.read(mail({ tier0: { quiet: 'newsletter', step: 'SILENT', possible: true } }), deps(ask), ALL);
  check('a hard quiet: no card', q.card === null && q.reason === 'quiet:newsletter');

  console.log('\n--- a close only the model found ---\n');
  const m = await E.read(mail(), deps(ask), ALL);
  check('a model card: Reply & Track, drawn by the steps list', m.card && m.card.source === 'model' && m.card.plan.processId === 'reply-track' && m.card.rows.length === 2, m.card && m.card.plan);
  check('...carried by the follow loop until the reply goes out', m.watch && m.watch.direction === 'mine' && m.watch.closeWhen === 'reply-sent' && m.watch.chaseIso === '2026-10-09', m.watch);
  check('...and nothing closes, writes or sends', m.card.proposal.closes === false && m.card.plan.closes === false && m.card.plan.steps.every((s) => s.needsClick));
  const np = await E.read(mail(), deps(ask), { aiPrimary: true });
  check('aiPlanV1 off: the model card has no plan and no watch', np.card && np.card.plan === null && np.watch === null);
  const v = await E.read(mail({ text: 'The meeting on October 14 at 3pm is cancelled.' }), deps({ intentions: [{ kind: 'meeting', ask_span: 'The meeting on October 14 at 3pm', evidence_span: 'is cancelled', due_span: 'October 14 at 3pm', confidence: 0.9 }] }), ALL);
  check('a model card the product cannot plan (a cancelled meeting) is not shown', v.card === null && /^plan:/.test(v.reason), v);
  const fsv = await E.read(mail({ attachmentCount: 1 }), deps({ needs: ['file'], intentions: [Object.assign({}, ask.intentions[0])] }), ALL);
  check('a file save goes to suggest-save, not silence and not a model plan', fsv.card && fsv.card.step === 'file_save' && fsv.card.suggestSave === true && fsv.card.plan === null, fsv.card);
  const s = await E.read(mail(), deps({ intentions: [] }), ALL);
  check('a model that says nothing: no card', s.card === null);

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/ai-engine.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
