'use strict';
// Zero-config sight, measured as its opposite (2026-11-16): how many of the closes the product can already read are OFF until the person turns them on, and what evidence each has.
// The owner's bar (Instinct): it sees what matters without being set up. Every row of core/labs-switches.js is a capability that does not meet that bar yet. For each switch: where it is
// read (core/src), the corpus tests and headless e2e specs that name it, whether a live Gate is recorded in the docs, and whether a held-out set covers its kind. Lab only; it changes nothing.
// usage: node scoreboard/capabilities/switch-readiness.cjs [--md out.md]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const EXT = path.join(ROOT, 'flow-trial-extension');
const labs = fs.readFileSync(path.join(EXT, 'core', 'labs-switches.js'), 'utf8');
const rows = [...labs.matchAll(/\{ id: '([A-Z_]+)', who: '((?:[^'\\]|\\.)*)'/g)].map((m) => ({ id: m[1], who: m[2].replace(/\\'/g, "'") }));
const ls = (d, re) => fs.readdirSync(d).filter((f) => re.test(f));
const read = (p) => fs.readFileSync(p, 'utf8');
const tests = ls(path.join(EXT, 'test'), /\.cjs$/).map((f) => [f, read(path.join(EXT, 'test', f))]);
const e2e = fs.existsSync(path.join(EXT, 'e2e')) ? ls(path.join(EXT, 'e2e'), /\.spec\.js$/).map((f) => [f, read(path.join(EXT, 'e2e', f))]) : [];
const code = []; for (const d of ['core', 'src']) for (const f of ls(path.join(EXT, d), /\.js$/)) code.push([d + '/' + f, read(path.join(EXT, d, f))]);
const docsAll = ['docs/glance-ai/ecosystem-coverage.md', 'docs/open-tasks.md'].map((p) => read(path.join(ROOT, p))).join('\n');
// kinds covered by a held-out set (kind-frozen v0/v1, slot gold, completion gold)
const HELD = { TASK_ASK: 'task', PAYMENT_ASK: 'pay', BOOKING_NOTICE: 'booking', SYSTEM_NOTICE: 'notice', WORKSPACE_FILE: 'doc/sheet/slides', ONEDRIVE_NEW_FILE: 'word/excel', DECOMPOSE: 'none (no real multi-intent set)', CALENDAR_CHANGE: 'move/cancel (probe, corpus)', MEET_LINK: 'video', TEAMS_MEETING: 'video', RECURRING_HOLD: 'recurring', CHAT_TASK_CARD: 'chat probe (38 lines)' };
const out = rows.map((r) => {
  const re = new RegExp('\\b' + r.id + '\\b');
  const reads = code.filter(([, t]) => re.test(t)).map(([f]) => f).filter((f) => !/labs-switches/.test(f));
  const tc = tests.filter(([, t]) => re.test(t)).map(([f]) => f);
  const ee = e2e.filter(([, t]) => re.test(t)).map(([f]) => f);
  const gate = new RegExp(r.id + '[^\\n]{0,400}(?:live gate (?:passed|PASS)|Gate PASS)', 'i').test(docsAll);
  return { id: r.id, who: r.who, readBy: reads.length, corpora: tc.length, e2e: ee.length, liveGate: gate, held: HELD[r.id] || 'no held-out set' };
});
const md = ['| switch | what it does | read in | corpus tests | headless e2e | live Gate recorded | held-out coverage |', '|---|---|---|---|---|---|---|']
  .concat(out.map((o) => `| ${o.id} | ${o.who} | ${o.readBy} files | ${o.corpora} | ${o.e2e} | ${o.liveGate ? 'yes' : 'no'} | ${o.held} |`)).join('\n');
console.log(`${out.length} Labs rows, all off until the person turns them on (SWITCH_DEFAULT false); live Gate recorded for ${out.filter((o) => o.liveGate).length}; held-out set for ${out.filter((o) => !/^no held/.test(o.held)).length}; headless e2e for ${out.filter((o) => o.e2e).length}`);
console.log(md);
const a = process.argv.indexOf('--md'); if (a > 0) fs.writeFileSync(process.argv[a + 1], md + '\n');
