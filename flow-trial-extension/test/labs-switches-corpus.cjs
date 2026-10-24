'use strict';
// The Labs list must name every off switch the code reads, so none stays invisible, and flipping a row must touch only that row.
// Run: node test/labs-switches-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p);
  }
  return out;
}
const used = new Set();
const named = new Set();
for (const file of walk(path.join(ROOT, 'src'), []).concat(walk(path.join(ROOT, 'core'), []))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/glanceSwitches\.([A-Z][A-Z_0-9]{3,})/g)) used.add(m[1]);
  for (const m of text.matchAll(/glanceSwitchOn\(['"]([A-Z][A-Z_0-9]{3,})['"]\)/g)) used.add(m[1]);
  if (!/labs-switches\.js$/.test(file)) for (const id of L.IDS) if (new RegExp('\\b' + id + '\\b').test(text)) named.add(id);
}
const missing = [...used].filter((id) => L.IDS.indexOf(id) === -1);
check('every switch the code reads is a Labs row', missing.length === 0, missing);
check('every Labs row is named by the code that reads it', L.IDS.every((id) => named.has(id)), L.IDS.filter((id) => !named.has(id)));
check('no duplicate ids', new Set(L.IDS).size === L.IDS.length);
check('every row has Hebrew words and a note', L.LIST.every((r) => /[֐-׿]/.test(r.who) && /[֐-׿]/.test(r.note)));
check('a missing key is off', L.isOn({}, 'TASK_ASK') === false && L.isOn(null, 'TASK_ASK') === false);
check('only true is on', L.isOn({ TASK_ASK: 'yes' }, 'TASK_ASK') === false && L.isOn({ TASK_ASK: true }, 'TASK_ASK') === true);
const bag = { OTHER: true, TASK_ASK: true };
const on = L.flipped(bag, 'PAYMENT_ASK', true);
check('flipping one row keeps the others', on.OTHER === true && on.TASK_ASK === true && on.PAYMENT_ASK === true);
const off = L.flipped(on, 'PAYMENT_ASK', false);
check('turning a row off removes its key', !('PAYMENT_ASK' in off) && off.TASK_ASK === true);
check('an unknown id is never written', !('EVIL' in L.flipped({}, 'EVIL', true)));
check('the input bag is not changed', Object.keys(bag).length === 2);
const every = L.all({}, true);
check('all on sets every row', L.IDS.every((id) => every[id] === true));
check('all off clears every row but keeps unrelated keys', (() => { const x = L.all(Object.assign({ OTHER: true }, every), false); return x.OTHER === true && L.IDS.every((id) => !(id in x)); })());
const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
check('the popup loads the list before popup.js', html.indexOf('labs-switches.js') > -1 && html.indexOf('labs-switches.js') < html.lastIndexOf('popup.js'));
check('the popup has the Labs block', html.indexOf('id="labs-list"') > -1);
const js = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
const body = js.slice(js.indexOf('async function renderLabs'), js.indexOf('async function renderSurfaces'));
check('the popup writes only glanceSwitches', /chrome\.storage\.local\.set\(\{ glanceSwitches:/.test(body) && !/chrome\.permissions|runtime\.sendMessage|\bsend\(/.test(body));
console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
