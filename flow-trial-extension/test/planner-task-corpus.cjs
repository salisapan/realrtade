// Add a task to a named Microsoft Planner plan, behind PLANNER_TASK (off).
// An explicit ask with a title and a plan name, exactly one plan of that name in the
// person's plans, a task created with no assignee, read back by id for title, plan and
// date. Undo deletes it with If-Match and refuses after the person edited it.
// Graph is mocked. Nothing is sent and nobody is notified.
// Run: node test/planner-task-corpus.cjs
'use strict';
const { FlowPlannerTask: P } = require('../core/planner-task.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { PLANNER_TASK: true };
const NOW = new Date('2026-10-21T09:00:00Z'); // a Wednesday
const STAMP = '2026-10-21T09:05:00.000Z';
const PLANS = [{ id: 'P1', title: 'Website relaunch' }, { id: 'P2', title: 'Offsite' }, { id: 'P3', title: 'Finance' }, { id: 'P4', title: 'שיווק רבעון 4' }, { id: 'P5', title: 'Ops' }, { id: 'P6', title: 'ops' }, { id: 'P7', title: 'משפטי' }];

console.log('\n--- an explicit ask with a title and a plan ---\n');
const yes = [
  ['Please add the task "Send contract to Dana" to the Website relaunch plan by Friday.', 'Send contract to Dana', 'Website relaunch', '2026-10-23'],
  ['Can you add a task to review the pricing page on the Website relaunch board?', 'review the pricing page', 'Website relaunch', null],
  ["Please put 'Book venue' on the Offsite plan.", 'Book venue', 'Offsite', null],
  ['Could you create a task: collect invoices in the Finance plan by 2026-10-30', 'collect invoices', 'Finance', '2026-10-30'],
  ['תוסיף בבקשה משימה "לשלוח הצעת מחיר" לתוכנית שיווק רבעון 4 עד יום חמישי', 'לשלוח הצעת מחיר', 'שיווק רבעון 4', '2026-10-22'],
  ['תוסיף משימה לבדוק את החוזה לתוכנית משפטי', 'לבדוק את החוזה', 'משפטי', null]
];
for (const [text, title, planName, due] of yes) {
  const r = P.recognize(text, NOW);
  check('clear: ' + text, r.kind === 'clear' && r.title === title && r.planName === planName && r.dueIso === due, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Maybe add the task "Book venue" to the Offsite plan if you want.', 'hedge'],
  ['Ask Dana to add the task "Book venue" to the Offsite plan.', 'third-party'],
  ['No need to add the task "Book venue" to the Offsite plan.', 'negation'],
  ['FYI I will add the task "Book venue" to the Offsite plan.', 'fyi'],
  ['Please add the task "Book venue" to the Jira board in the Offsite plan.', 'other-app'],
  ['אולי תוסיף משימה "לשלוח הצעה" לתוכנית שיווק', 'hedge']
];
for (const [text, why] of no) {
  const r = P.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind === 'block' && r.reason === why, r);
}
for (const text of ['The task "Book venue" was added to the Offsite plan.', 'Add the task "Book venue".', 'Please add a task to Asana plan Launch', 'Lunch tomorrow?']) {
  check('ignored (no plan named): ' + text, P.recognize(text, NOW).kind === 'ignore');
}

console.log('\n--- the switch, the plan list and the plan ---\n');
check('off by default', P.SWITCH_DEFAULT === false && P.plan({ text: yes[0][0], plans: PLANS, now: NOW }).action === 'off');
const p = P.plan({ flags: ON, text: yes[0][0], plans: PLANS, now: NOW });
check('one Do It; the plan is the person\'s own plan, with its id', p.action === 'offer' && p.approval === 'DoIt' && p.plan.id === 'P1' && p.dueIso === '2026-10-23' && /Website relaunch plan/.test(p.line), p);
check('the step says assigned to no one', /assigned to no one/.test(p.steps[0].label), p.steps);
check('Hebrew plan: Hebrew line', /^להוסיף ל-Planner/.test(P.plan({ flags: ON, text: yes[4][0], plans: PLANS, now: NOW }).line));
check('an unknown plan is silence, not a guess', P.plan({ flags: ON, text: 'Please put "Book venue" on the Retreat plan.', plans: PLANS, now: NOW }).reason === 'unknown-plan');
check('two plans of one name are silence', P.plan({ flags: ON, text: 'Please put "Call vendor" on the Ops plan.', plans: PLANS, now: NOW }).reason === 'ambiguous-plan');
check('a plan list that was not read is silence', P.plan({ flags: ON, text: yes[0][0], now: NOW }).reason === 'not-listed');

// ---- the write, mocked ---------------------------------------------------------
function makeGraph(opts) {
  opts = opts || {};
  const log = [];
  const tasks = {};
  const api = async (method, path, body, headers) => {
    log.push({ method, path, body, headers });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postFails) return { status: 500, ok: false, json: null };
      tasks.T1 = Object.assign({ id: 'T1', '@odata.etag': 'W/"e1"' }, body);
      return { status: 201, ok: true, json: JSON.parse(JSON.stringify(tasks.T1)) };
    }
    const id = decodeURIComponent(path.split('/tasks/')[1]);
    if (method === 'GET') {
      const t = tasks[id];
      if (!t) return { status: 404, ok: false, json: null };
      const copy = JSON.parse(JSON.stringify(t));
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'DELETE') {
      if (opts.deleteFails) return { status: 500, ok: false, json: null };
      if (headers && headers['If-Match'] !== tasks[id]['@odata.etag'] && headers['If-Match'] !== '*') return { status: 412, ok: false, json: null };
      delete tasks[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, tasks };
}
const input = { flags: ON, plan: { id: 'P1', title: 'Website relaunch' }, title: 'Send contract to Dana', dueIso: '2026-10-23', now: STAMP };
const io = (g) => ({ graph: g.api });

(async () => {
  console.log('\n--- Do It: create, read back ---\n');
  let g = makeGraph();
  let r = await P.create(input, io(g));
  const post = g.log.find((l) => l.method === 'POST');
  check('creates in the plan with no assignee (nobody is notified)', post.path === '/planner/tasks' && post.body.planId === 'P1' && Object.keys(post.body.assignments).length === 0 && post.body.dueDateTime === '2026-10-23T12:00:00Z', post);
  check('Handled needs the read-back: proof fetchedBack, system, id, etag kept', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'microsoft/planner' && r.proof.externalId === 'T1' && r.ref.etag === 'W/"e1"', r);
  check('only Planner is called, nothing is sent', g.log.every((l) => /^\/planner\/tasks/.test(l.path)), g.log.map((l) => l.path));

  g = makeGraph();
  r = await P.create(Object.assign({}, input, { dueIso: null }), io(g));
  check('no date in the ask: no date written', r.ok === true && !('dueDateTime' in g.log[0].body), g.log[0].body);

  g = makeGraph({ mutate: (t) => { t.title = 'Other'; } });
  r = await P.create(input, io(g));
  check('another title on the read-back: deleted again, no Handled', r.ok === false && r.reason === 'verify_failed' && r.removed === true && !g.tasks.T1, r);
  g = makeGraph({ mutate: (t) => { t.planId = 'P9'; } });
  r = await P.create(input, io(g));
  check('another plan on the read-back is not the task asked for', r.ok === false && /plan-differs/.test(r.why), r);
  g = makeGraph({ mutate: (t) => { t.dueDateTime = '2026-10-25T12:00:00Z'; } });
  r = await P.create(input, io(g));
  check('another date on the read-back is not the task asked for', r.ok === false && /date-differs/.test(r.why), r);
  g = makeGraph({ mutate: (t) => { t.assignments = { 'u-1': {} }; } });
  r = await P.create(input, io(g));
  check('an assignee means someone is notified: not Handled', r.ok === false && /has-assignee/.test(r.why), r);
  g = makeGraph({ mutate: (t) => { t.title = 'Other'; }, deleteFails: true });
  r = await P.create(input, io(g));
  check('cannot delete it either: the ref is kept for Undo', r.ok === false && r.removed === false && r.ref && r.ref.taskId === 'T1', r);
  check('not connected is said', (await P.create(input, io(makeGraph({ auth: 401 })))).reason === 'not-connected');
  check('a failed write is a failed write', (await P.create(input, io(makeGraph({ postFails: true })))).reason === 'write-failed');
  g = makeGraph();
  r = await P.create(Object.assign({}, input, { flags: {} }), io(g));
  check('switch off: no call', r.reason === 'switch-off' && g.log.length === 0);
  g = makeGraph();
  r = await P.create(Object.assign({}, input, { title: 'x' }), io(g));
  check('a title that is too short makes no call', r.reason === 'unclear' && g.log.length === 0, r);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  g = makeGraph();
  r = await P.create(input, io(g));
  let u = await P.undo(r.ref, io(g));
  check('untouched: Undo deletes it with If-Match and the read confirms', u.ok === true && u.undone === true && !g.tasks.T1 && g.log.some((l) => l.method === 'DELETE' && l.headers['If-Match'] === 'W/"e1"'), u);

  g = makeGraph();
  r = await P.create(input, io(g));
  g.tasks.T1['@odata.etag'] = 'W/"e2"';
  u = await P.undo(r.ref, io(g));
  check('the person changed the task (etag moved): Undo unavailable, task stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!g.tasks.T1, u);

  g = makeGraph();
  r = await P.create(input, io(g));
  const bare = Object.assign({}, r.ref, { etag: null });
  u = await P.undo(bare, io(g));
  check('no stored etag: cannot confirm, leaves it', u.ok === false && u.reason === 'unconfirmed' && !!g.tasks.T1, u);

  g = makeGraph();
  r = await P.create(input, io(g));
  delete g.tasks.T1;
  check('already deleted by the person: nothing to undo', (await P.undo(r.ref, io(g))).ok === true);
  check('a ref that is not Glance\'s is refused', (await P.undo({ taskId: 'T9' }, io(makeGraph()))).reason === 'not-ours');

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
