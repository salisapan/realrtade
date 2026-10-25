// core/google-task-close.js: closing a task Glance wrote. Completed is not Handled: a GET must show status completed. A task the person
// changed is left as it is, a task already done needs no write, a gone task is not closed, and Undo reopens only an unchanged, completed task.
// Run: node test/google-task-close-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
const box = { module: undefined, console, Date, setTimeout };
vm.createContext(box);
for (const f of ['proof-of-close.js', 'google-config.js', 'google-tasks.js', 'google-task-close.js']) vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), box, { filename: f });
const Close = vm.runInContext('FlowGoogleTaskClose', box);
const Tasks = vm.runInContext('FlowGoogleTasks', box);
const Lane = (() => { vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), box, { filename: 'google-lane.js' }); return vm.runInContext('FlowGoogleLane', box); })();

let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const CLOCK = '2026-10-25T12:00:00.000Z';
const FAST = { readBackDelays: [0, 0, 0] };

function fakeGoogle(seed) {
  const state = { task: Object.assign({ id: 't1', title: 'Waiting on Dana: Payment 500 NIS', due: '2026-10-29T00:00:00.000Z', status: 'needsAction' }, seed || {}), calls: [], lag: 0, gone: false, deny: 0 };
  const http = async (req) => {
    state.calls.push({ method: req.method, url: req.url, body: req.body || null });
    if (state.deny) return { status: state.deny, ok: false, json: null };
    if (state.gone) return { status: 404, ok: false, json: null };
    if (req.method === 'GET') return { status: 200, ok: true, json: JSON.parse(JSON.stringify(state.task)) };
    if (req.method === 'PATCH') {
      const b = JSON.parse(req.body);
      if (b.status === 'completed' && state.lag > 0) { state.lag--; state.pendingStatus = 'completed'; }
      else if (b.status === 'completed') { state.task.status = 'completed'; state.task.completed = CLOCK; }
      else if (b.status === 'needsAction') { state.task.status = 'needsAction'; delete state.task.completed; }
      return { status: 200, ok: true, json: JSON.parse(JSON.stringify(state.task)) };
    }
    return { status: 400, ok: false, json: null };
  };
  return { state, http };
}
const hashOf = (task) => Close.contentHash(task);
const input = (g, extra) => Object.assign({ taskListId: 'L1', taskId: 't1', contentHash: hashOf(g.state.task) }, FAST, extra || {});

(async () => {
  // 1. An unchanged task is completed and read back.
  {
    const g = fakeGoogle();
    const r = await Close.write(input(g), g.http, CLOCK);
    check('an unchanged task is completed, ok with a proof', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.externalId === 't1' && r.ref.closedByGlance === true, r);
    check('the task is completed on the server', g.state.task.status === 'completed');
    check('exactly one write, and no delete', g.state.calls.filter((c) => c.method === 'PATCH').length === 1 && g.state.calls.every((c) => c.method !== 'DELETE'), g.state.calls);
    check('the content hash is unchanged by completing', hashOf(g.state.task) === r.ref.contentHash);
    const u = await Close.undo(r.ref, g.http);
    check('Undo reopens an unchanged completed task', u.ok === true && g.state.task.status === 'needsAction' && !g.state.task.completed, [u, g.state.task]);
  }
  // 2. The person changed the task: left alone, nothing written.
  {
    const g = fakeGoogle();
    const hash = hashOf(g.state.task);
    g.state.task.title = 'Waiting on Dana: Payment 500 NIS (partly paid)';
    const r = await Close.write({ taskListId: 'L1', taskId: 't1', contentHash: hash }, g.http, CLOCK);
    check('an edited task is not closed', r.ok === false && r.reason === 'user-edited' && !r.proof, r);
    check('nothing was written to an edited task', g.state.calls.every((c) => c.method === 'GET') && g.state.task.status === 'needsAction', g.state.calls);
  }
  // 3. Already done: no write, still a read-back proof, Undo leaves it done.
  {
    const g = fakeGoogle({ status: 'completed', completed: CLOCK });
    const r = await Close.write(input(g), g.http, CLOCK);
    check('a task already done needs no write and has a proof', r.ok === true && r.proof && r.ref.closedByGlance === false && g.state.calls.every((c) => c.method === 'GET'), r);
    const u = await Close.undo(r.ref, g.http);
    check('Undo of an already-done task leaves it done', u.ok === true && g.state.task.status === 'completed' && g.state.calls.filter((c) => c.method === 'PATCH').length === 0, u);
  }
  // 4. Gone, denied, unclear input.
  {
    const g = fakeGoogle(); g.state.gone = true;
    const r = await Close.write(input(g, { contentHash: 'x' }), g.http, CLOCK);
    check('a gone task is not closed', r.ok === false && r.reason === 'not-found' && !r.proof, r);
    const d = fakeGoogle(); d.state.deny = 401;
    const rd = await Close.write(input(d, { contentHash: 'x' }), d.http, CLOCK);
    check('a refused token is not-connected', rd.ok === false && rd.reason === 'not-connected', rd);
    const none = await Close.write({ taskListId: 'L1', taskId: '', contentHash: 'x' }, d.http, CLOCK);
    check('no task id is unclear', none.ok === false && none.reason === 'unclear', none);
    const nohash = await Close.write({ taskListId: 'L1', taskId: 't1' }, d.http, CLOCK);
    check('no content hash is unclear (nothing is closed blind)', nohash.ok === false && nohash.reason === 'unclear', nohash);
    const bad = await Close.write({ taskListId: 'L1/../x', taskId: 't1', contentHash: 'x' }, d.http, CLOCK);
    check('a list id with a slash is refused', bad.ok === false && bad.reason === 'unclear', bad);
  }
  // 5. Google lags: the read-back waits; a task that never shows completed is not Handled.
  {
    const g = fakeGoogle(); g.state.lag = 1;
    const r = await Close.write(input(g, { readBackDelays: [0, 0] }), g.http, CLOCK);
    check('Google never shows completed: verify_failed, no proof', r.ok === false && r.reason === 'verify_failed' && !r.proof && !!r.ref, r);
  }
  // 6. Undo guards.
  {
    const g = fakeGoogle({ status: 'completed', completed: CLOCK });
    const ref = { taskListId: 'L1', taskId: 't1', externalId: 't1', contentHash: hashOf(g.state.task), closedByGlance: true };
    g.state.task.notes = 'the person added a note';
    const u = await Close.undo(ref, g.http);
    check('Undo refuses a task the person changed', u.ok === false && u.reason === 'user-edited' && g.state.task.status === 'completed', u);
    const noHash = await Close.undo({ taskListId: 'L1', taskId: 't1' }, g.http);
    check('Undo without a hash does nothing', noHash.ok === false && noHash.reason === 'unconfirmed', noHash);
    const gone = fakeGoogle(); gone.state.gone = true;
    const ug = await Close.undo(ref, gone.http);
    check('Undo of a gone task is fine', ug.ok === true, ug);
  }
  // 7. The lane knows the connector, and a Tasks-written ref closes with the same hash.
  {
    const g = fakeGoogle();
    const made = Tasks.contentHash(g.state.task);
    check('the close hash is the same hash the Tasks writer keeps', made === hashOf(g.state.task));
    const viaLane = await Lane.write('googleTaskClose', input(g), g.http, CLOCK);
    check('the lane dispatches googleTaskClose', viaLane.ok === true && viaLane.proof && viaLane.proof.system === 'google/tasks-close', viaLane);
    const un = await Lane.undo('googleTaskClose', viaLane.ref, g.http);
    check('the lane undoes googleTaskClose', un.ok === true && g.state.task.status === 'needsAction', un);
  }
  console.log(failures ? '\n' + failures + ' FAILED' : '\nAll google-task-close checks passed');
  process.exit(failures ? 1 : 0);
})();
