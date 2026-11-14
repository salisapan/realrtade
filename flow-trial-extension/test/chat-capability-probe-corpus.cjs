// The chat capability probe (glance-ai/scoreboard/capabilities/chat-run.cjs): one hand-written line per kind of close a one-to-one chat can carry, through the chat
// recognition as src/chat-task-card.js runs it (the shared judge with surface 'chat', then the chat readers and the call reader). Every row must be right:
// a close kind the chat can carry, or silence for the negatives (an acknowledgement, a hedge, the past, a group, a changed bank, one question, another call tool).
// Rows are written for this lab; no real chat. Run: node test/chat-capability-probe-corpus.cjs
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const run = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'chat-run.cjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
check('the chat probe runs', run.status === 0, run.stderr && run.stderr.slice(0, 300));
const j = JSON.parse(run.stdout || '{"out":{},"detail":[],"tot":{}}');
check('no chat row is a miss or a wrong Do It', j.detail.filter((d) => !d[6]).length === 0, j.detail.filter((d) => !d[6]));
check('no negative chat row is offered', j.detail.filter((d) => d[2] === 'none' && d[3] !== 'none').length === 0);
check('the chat probe covers at least 17 kinds', Object.keys(j.out).length >= 17, Object.keys(j.out).length);
check('a group chat, a changed bank and another call tool stay quiet', ['chat.neg.group', 'chat.neg.bank', 'chat.neg.other-tool'].every((k) => j.out[k] && j.out[k].right === j.out[k].n));
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
