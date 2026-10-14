// The Plan (M5): a grounded model proposal becomes the product's own closing process, drawn by the steps list, with the plan gate on every step.
// Run: node test/model-plan-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js', 'understanding.js', 'model-plan.js'];
function load(extra) {
  const sb = { module: undefined, console };
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
  if (extra) vm.runInContext(extra, sb);
  return sb;
}
const sb = load();
const P = vm.runInContext('FlowModelPlan', sb);
const U = vm.runInContext('FlowUnderstanding', sb);
const ON = { aiPlanV1: true };
const today = '2026-10-07';
const ASK = { step: 'draft', due: '2026-10-16', askSpan: 'Hi Sali, could you send me the signed lease by Friday?', evidence: 'We need it for the bank.', proposalOnly: true, needsClick: true, closes: false };
const MEET = { step: 'calendar', due: '2026-10-14', due_time: { hour: 15, minute: 0 }, askSpan: "Let's meet on October 14 at 3pm", evidence: 'to go over the budget' };
const PROMISE_HE = { step: 'task', due: '2026-10-13', askSpan: 'אשלח לך את החוזה עד שלישי', evidence: 'אשלח לך את החוזה עד שלישי' };

console.log('\n--- the off switch ---\n');
check('switch off: not used, nothing built', P.plan({}, ASK, { today }).used === false && P.plan(undefined, ASK).used === false && P.plan({ aiPlanV1: 'yes' }, ASK).used === false);
check('the switch is named and defaults off', P.SWITCH === 'aiPlanV1' && P.DEFAULTS.aiPlanV1 === false);

console.log('\n--- a proposal becomes the product\'s own process ---\n');
let r = P.plan(ON, ASK, { today });
check('an ask of me becomes Reply & Track: a draft, then a task', r.plan.processId === 'reply-track' && r.plan.steps.map((s) => s.kind).join() === 'gmailDraft,googleTask', r.plan);
check('the task carries the date the device read, the title is the quoted ask without the greeting', r.plan.steps[1].params.dateIso === '2026-10-16' && /^could you send me the signed lease/i.test(r.plan.steps[1].params.title), r.plan.steps[1].params);
check('done when: a reply the person sent (the draft is not completion)', r.plan.doneWhen.kind === 'reply-sent' && r.plan.doneWhen.notCompletion === 'the prepared draft');
check('carry: Glance looks again on the due day', r.plan.carry.checkOn === '2026-10-16' && r.plan.carry.then === 'remind');
check('the steps list draws it: two rows, the first is the anchor', r.rows.length === 2 && r.rows[0].role === 'anchor' && r.rows[0].kind === 'gmailDraft');
check('every step needs the person\'s click, and the plan never closes', r.plan.steps.every((s) => s.needsClick === true) && r.plan.closes === false);
r = P.plan(ON, MEET, { today });
check('a meeting becomes Schedule It, anchored on a calendar event at 15:00 on the read date', r.plan.processId === 'schedule' && r.plan.steps[0].kind === 'calendar' && r.plan.steps[0].params.dateIso === '2026-10-14' && r.plan.steps[0].params.hour === 15, r.plan.steps[0]);
check('done when: the event is read back', r.plan.doneWhen.kind === 'event-exists');
r = P.plan(ON, PROMISE_HE, { today, lang: 'he' });
check('a Hebrew promise to me becomes Log It: one task on the promised day', r.plan.processId === 'log-it' && r.plan.steps.length === 1 && r.plan.steps[0].params.dateIso === '2026-10-13', r.plan);
check('done when: the promised thing arrived (the tracking task is not completion)', r.plan.doneWhen.kind === 'promised-arrived' && r.plan.doneWhen.notCompletion === 'the tracking task');
check('carry: chase the day after the promised day', r.plan.carry.checkOn === '2026-10-14' && r.plan.carry.then === 'chase');
r = P.plan(ON, ASK, { today, surface: 'outlook' });
check('on Outlook the same plan writes to Outlook (draft and To Do)', r.plan.steps.map((s) => s.kind).join() === 'outlookDraft,outlookTask', r.plan.steps.map((s) => s.kind));
check('an ask with no date still plans a draft, and carry asks the person', (() => { const x = P.plan(ON, Object.assign({}, ASK, { due: null }), { today }); return x.plan && x.plan.steps[0].kind === 'gmailDraft' && x.plan.carry.then === 'ask-the-person'; })());
check('a due day already behind today is checked today, not in the past', P.carryFor({ step: 'draft', due: '2026-10-01' }, today).checkOn === today);

console.log('\n--- what a plan never is ---\n');
check('silence plans nothing', P.plan(ON, { step: 'SILENT' }, { today }).plan === null && P.plan(ON, null, { today }).plan === null);
check('a file save is suggest-save\'s decision on the real files, not a model plan', P.plan(ON, { step: 'file_save', askSpan: 'save it' }, { today }).reason === 'file-save-is-suggest-save');
check('an unknown step plans nothing', P.plan(ON, { step: 'wire_money', askSpan: 'pay' }, { today }).plan === null);

console.log('\n--- the plan gate (a planner that misbehaves) ---\n');
const fake = (steps) => load(`FlowActions.planFor = function () { return { id: 'x', name: 'X', steps: ${JSON.stringify(steps)} }; };`);
const run = (steps, p) => vm.runInContext('FlowModelPlan', fake(steps)).plan(ON, p || ASK, { today });
check('a send step is refused', run([{ kind: 'gmailDraft', params: {} }, { kind: 'gmailSend', params: {} }]).reason === 'plan:kind-not-allowed:gmailSend');
check('a page action is refused', run([{ kind: 'gmailDraft', params: {} }, { kind: 'computerClick', params: {} }]).reason === 'plan:kind-not-allowed:computerClick');
check('a date the device did not read is refused', run([{ kind: 'gmailDraft', params: {} }, { kind: 'googleTask', params: { dateIso: '2026-10-30' } }]).reason === 'plan:date-not-read-by-device');
check('an anchor of another kind is refused (a reply must anchor on a draft)', run([{ kind: 'googleTask', params: { dateIso: '2026-10-16' } }]).reason === 'plan:anchor-mismatch:googleTask');
check('more than three steps is refused', run([{ kind: 'gmailDraft' }, { kind: 'googleTask' }, { kind: 'googleTask' }, { kind: 'googleTask' }]).reason === 'plan:too-many-steps');
check('an empty plan is refused', run([]).reason === 'plan:empty');
check('a planner that throws is silence', vm.runInContext('FlowModelPlan', load("FlowActions.planFor = function () { throw new Error('x'); };")).plan(ON, ASK, { today }).reason === 'planner-error');

console.log('\n--- from a model answer to a plan, end to end on the device ---\n');
{
  const text = 'Hi Sali,\nCould you send me the signed lease by Friday? We need it for the bank.\nDana';
  const v = U.validate({ intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease by Friday?', evidence_span: 'We need it for the bank.', due_span: 'by Friday', confidence: 0.9 }] }, text, { today });
  const p = U.proposal(v.understanding);
  const x = P.plan(ON, p, { today });
  check('validated answer -> one proposal -> Reply & Track due Friday 9 October', p.step === 'draft' && x.plan.processId === 'reply-track' && x.plan.steps[1].params.dateIso === '2026-10-09', x);
}

console.log('\n--- portability ---\n');
const src = fs.readFileSync(path.join(__dirname, '../core/model-plan.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('no chrome.*, document or window', !/\bchrome\.|\bdocument\.|\bwindow\./.test(src));
check('no network', !/fetch\(|XMLHttpRequest|WebSocket/.test(src));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
