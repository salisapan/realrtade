// Completion (glance-ai/scoreboard/capabilities/completion-run.cjs): does the follow loop know that a loop is DONE? A loop is closed on understanding, never on the mere fact that
// someone wrote back, so the error that matters is closing a loop on a reply that did not finish the ask, and chasing a person who said no. Two sets: the held-out completion gold
// (glance-ai/labeling/completion-gold/, never tuned against) and the development rows (completion-dev-v0.cjs, the shapes the held-out set exposed, now fixed). A ratchet, not a target.
// Run: node test/completion-gold-corpus.cjs
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const run = (flag) => { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'completion-run.cjs'), '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26 }); return { r, j: JSON.parse(r.stdout || '{"wrongClose":[],"missed":[],"wrongHold":[]}') }; };
const held = run(''), dev = run('--dev');
check('the completion run works', held.r.status === 0, held.r.stderr && held.r.stderr.slice(0, 300));
check('held-out: no loop is closed on a reply that did not finish the ask', held.j.wrongClose.length === 0, held.j.wrongClose);
check('held-out: no reply that opts out is left open (the person would be chased again)', held.j.detail.filter((d) => d[2] === 'declined' && d[3] !== 'declined').length === 0, held.j.detail.filter((d) => d[2] === 'declined' && d[3] !== 'declined'));
check('held-out: at least 18 of the 20 rows whose loop opens are exactly right', held.j.right >= 18, held.j.right);
check('held-out: the ten rows that open no loop are the information questions asked on purpose (en3, he3)', held.j.noLoop === 10 && held.j.detail.filter((d) => d[3] === 'no-loop').every((d) => /^(en3|he3)$/.test(d[1])), held.j.noLoop);
check('development rows: all exactly right, no loop left unopened', dev.j.noLoop === 0 && dev.j.right === dev.j.n && dev.j.wrongClose.length === 0, dev.j);
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
