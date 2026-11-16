'use strict';
// The first wave of Labs closes starts ON in an unpacked (non-store) install (core/labs-seed.js; owner, 2026-11-16: «תדליק»). The person's own choice always wins, a store install
// never seeds, an e2e copy opts out, and the wave is only closes that write through a writer with a read-back and an Undo. Run: node test/labs-seed-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowLabsSeed: S } = require('../core/labs-seed.js');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
check('the wave is exactly the four task and hold closes the owner approved', JSON.stringify(S.DEFAULT_ON) === JSON.stringify(['TASK_ASK', 'PAYMENT_ASK', 'BOOKING_NOTICE', 'SYSTEM_NOTICE']), S.DEFAULT_ON);
check('every row in the wave is a real Labs row', S.DEFAULT_ON.every((id) => L.IDS.indexOf(id) >= 0), S.DEFAULT_ON);
check('CALENDAR_CHANGE is not in the wave: a delete or an update of an existing event has no read-back path wired yet', S.DEFAULT_ON.indexOf('CALENDAR_CHANGE') < 0);
check('DECOMPOSE, and every chat, Meta, Planner, SharePoint, Forms and full-document row, stay off', ['DECOMPOSE', 'CHAT_TASK_CARD', 'CHAT_PROMISE_CARD', 'META_CHAT_LANES', 'PLANNER_TASK', 'SHAREPOINT_NEW_FILE', 'GOOGLE_FORMS', 'FULL_DOCUMENT_CLOSE', 'USER_CONTEXT_WRITER'].every((id) => S.DEFAULT_ON.indexOf(id) < 0));
const first = S.seed({}, 0);
check('a fresh install gets the wave', S.DEFAULT_ON.every((id) => first.bag[id] === true) && first.changed === true && first.version === S.SEED_VERSION, first);
check('the person who already chose keeps the choice and other rows are kept', (() => { const r = S.seed({ TASK_ASK: true, MEET_LINK: true }, 0); return r.bag.MEET_LINK === true && r.bag.TASK_ASK === true && r.bag.PAYMENT_ASK === true; })());
check('a row the person turned off (deleted) is not seeded again once the version marker is set', (() => { const r = S.seed({ PAYMENT_ASK: true }, S.SEED_VERSION); return r.changed === false && !('TASK_ASK' in r.bag) && r.bag.PAYMENT_ASK === true; })());
check('the seed does not touch the input object', (() => { const bag = { MEET_LINK: true }; S.seed(bag, 0); return Object.keys(bag).join() === 'MEET_LINK'; })());
check('junk input is safe', S.seed(undefined, undefined).bag.TASK_ASK === true && S.seed(null, 'x').bag.TASK_ASK === true);
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
check('background.js seeds behind the store lock and the e2e opt-out', /async function seedLabsDefaults\(\)/.test(bg) && /mf\.update_url \|\| mf\.glance_no_seed === true/.test(bg) && /import '\.\.\/core\/labs-seed\.js'/.test(bg));
check('the e2e copy of the manifest opts out of the seed', /manifest\.glance_no_seed = true/.test(fs.readFileSync(path.join(__dirname, '..', 'e2e', 'support', 'launch.js'), 'utf8')));
check('the product manifest is untouched (no new key, host, scope or permission)', !('glance_no_seed' in JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'))));
check('the popup flips a seeded row off by deleting its key, which the marker keeps off', (() => { const bag = L.flipped(S.seed({}, 0).bag, 'TASK_ASK', false); return !('TASK_ASK' in bag) && S.seed(bag, S.SEED_VERSION).changed === false; })());
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
