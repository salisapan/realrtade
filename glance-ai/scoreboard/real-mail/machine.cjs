// One command for every measurement: held-out v2 / v2b, dev sets, the old kind-frozen sets, the corpora. Prints a table against the owner's goals.
//   node machine.cjs [--no-corpora]
// Held-out sets print aggregates only. The three known red corpora are ignored.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const PRIV = process.env.GLANCE_PRIVATE || path.join(__dirname, 'private');
const ROOT = path.join(__dirname, '..', '..', '..');
const run = (args, env) => { try { return cp.execFileSync(process.execPath, args, { env: Object.assign({}, process.env, env || {}), encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { return String(e.stdout || ''); } };
const rows = [];
for (const set of ['v2', 'v2b', 'dev2', 'dev3']) {
  if (!fs.existsSync(path.join(PRIV, set))) continue;
  let j; try { j = JSON.parse(run([path.join(__dirname, 'real-eval.cjs'), set, '--json'])); } catch (e) { continue; }
  for (const key of ['inbox/gmail', 'inbox/outlook', 'sent/follow']) {
    const v = j.out[key]; if (!v) continue;
    const pos = v.pos || 0, hit = v.hit || 0, fo = v.falseOffer || 0, wt = v.wrongType || 0;
    rows.push([set + (set.startsWith('v2') ? ' (held-out)' : ''), key, hit + '/' + pos, pos ? Math.round(100 * hit / pos) + '%' : '-', 'wrong ' + (fo + wt) + ' (false ' + fo + ', type ' + wt + ')']);
  }
}
const kf = (v1) => { try { const j = JSON.parse(run([path.join(ROOT, 'glance-ai', 'scoreboard', 'capabilities', 'kind-frozen-run.cjs'), '--json'].concat(v1 ? ['--v1'] : []), { GLANCE_SHIPPED: 'wave2' })); return j.tot || j; } catch (e) { return null; } };
for (const [name, v1] of [['old kind-frozen v0', false], ['old kind-frozen v1', true]]) { const t = kf(v1); if (t) rows.push([name, 'kinds', t.posRight + '/' + t.posN, Math.round(100 * t.posRight / t.posN) + '%', 'false offers ' + t.falseOffers]); }
let corpora = 'skipped';
if (!process.argv.includes('--no-corpora')) {
  let fails = []; const dir = path.join(ROOT, 'flow-trial-extension');
  for (const t of fs.readdirSync(path.join(dir, 'test')).filter((f) => f.endsWith('.cjs'))) { try { cp.execFileSync(process.execPath, [path.join('test', t)], { cwd: dir, stdio: 'ignore', timeout: 300000 }); } catch (e) { fails.push(t); } }
  const KNOWN = ['follow-gmail-harness.cjs', 'gate-0950-proof.cjs', 'owa-page-harness.cjs'];
  const extra = fails.filter((f) => KNOWN.indexOf(f) < 0);
  corpora = extra.length ? 'NEW FAILURES: ' + extra.join(' ') : 'green (only the 3 known red)';
}
const w = [26, 14, 9, 6]; console.log('GOALS  v2 inbox >=60% | v2 sent >=90% | wrong Do It 0 | old sets must not drop (70/89, 54/70, 0 false)\n');
for (const r of rows) console.log(r[0].padEnd(w[0]), r[1].padEnd(w[1]), r[2].padEnd(w[2]), r[3].padEnd(w[3]), r[4]);
console.log('\ncorpora:', corpora);
