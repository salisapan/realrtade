'use strict';
// node glance-ai/scoreboard/contrast/test-ratchet.cjs : a contrast pair that passed in baseline-2026-11-11.json must still pass (the suite only gets better).
// Needs the engine environment of glance-ai/model/V23.md. To accept an improvement, rerun `run.cjs --json baseline-<date>.json` and point BASE at it.
const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const BASE = path.join(__dirname, 'baseline-2026-11-11.json');
const out = path.join(os.tmpdir(), 'contrast-now.json');
cp.execFileSync('node', [path.join(__dirname, 'run.cjs'), '--json', out], { stdio: 'ignore' });
const was = Object.fromEntries(JSON.parse(fs.readFileSync(BASE, 'utf8')).map((r) => [r.id, r])), now = JSON.parse(fs.readFileSync(out, 'utf8'));
const broke = now.filter((r) => was[r.id] && was[r.id].pass && !r.pass).map((r) => r.id);
const gained = now.filter((r) => was[r.id] && !was[r.id].pass && r.pass).map((r) => r.id);
if (gained.length) console.log('improved (update the baseline): ' + gained.join(', '));
if (broke.length) { console.error('FAIL: pairs that passed now fail: ' + broke.join(', ')); process.exit(1); }
console.log('PASS: no contrast pair regressed (' + now.filter((r) => r.pass).length + '/' + now.length + ' pass)');
