// Carry until closed, wired (config/carry.public.js -> service worker 'flow:carry' -> src/follow.js and the Loops panel).
// Pinned: both switches are off in this build; every new path is gated on its switch being exactly true; nothing in the
// wiring sends (a mail move is a Gmail draft, a chat move is copied for the person); the answer link is passed only with
// nextMove on. With the switches off the follow loop and the panel run exactly as before. Run: node test/carry-wiring-corpus.cjs
const fs = require('fs');
const path = require('path');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const cfg = read('config/carry.public.js');
const m = /export const CARRY = (\{[^}]*\});/.exec(cfg);
const CARRY = m ? Function('return ' + m[1])() : null;
check('config: every carry switch is off', CARRY && Object.keys(CARRY).length >= 3 && Object.values(CARRY).every((v) => v === false), CARRY);

const bg = read('src/background.js');
check('service worker imports the carry switches', /import \{ CARRY \} from '\.\.\/config\/carry\.public\.js';/.test(bg));
check('flow:carry answers only "=== true" values', /flow:carry'\) return reply\(sendResponse, Promise\.resolve\(\{ ok: true, nextMove: CARRY\.nextMove === true, invoices: CARRY\.invoices === true \}\)\)/.test(bg));

const fu = read('src/follow.js');
check('follow.js: an invoice loop is asked for only when nothing else opened one', /if \(!ask && !watch\) ask = await invoiceAsk\(ctx, last, mineText\);/.test(fu));
check('follow.js: invoiceAsk returns null unless the invoices switch is exactly true', /if \(sw\.invoices !== true \|\| typeof FlowOutsideSignals === 'undefined'/.test(fu));
check('follow.js: the answer link is passed only with nextMove exactly true', /moveLink: sw\.nextMove === true/.test(fu));
check('follow.js: invoice fields are added only to invoice loops', /if \(ask\.basis === 'invoice'\) \{ watch\.invoiceNo/.test(fu));

const pop = read('popup/popup.js');
check('panel: a move is computed only with nextMove exactly true', /const move = \(carrySw \|\| \{\}\)\.nextMove === true && FlowFollowUp\.nextMove \?/.test(pop));
check('panel: without a move the nudge branches run as before', /\} else if \(!FlowFollowUp\.isMine\(w\) && !FlowFollowUp\.isClock\(w\) && !FlowFollowUp\.isYours\(w\) && w\.counterpart && w\.counterpart\.email\) \{\n      const level = FlowFollowUp\.nextNudgeLevel\(w\);/.test(pop));
const moveFn = (pop.split('function moveActions(')[1] || '').split('\n  function waitingItem(')[0];
check('panel: the move card never sends (no send type other than draft, complete and track)', moveFn.length > 200 && !/flow:(?!follow-draft|follow-complete|track)[a-z-]+/.test(moveFn), (moveFn.match(/flow:[a-z-]+/g) || []));
check('panel: a chat move copies and opens the chat; the person sends', /navigator\.clipboard\.writeText\(move\.draft\)/.test(moveFn) && /send it yourself/.test(moveFn));
check('panel: Let it go is the release patch and completes the task', /FlowFollowUp\.releasePatch\(w, Date\.now\(\)\)/.test(moveFn) && /flow:follow-complete/.test(moveFn));
check('panel: Hebrew labels on Hebrew loops', /לשחרר/.test(moveFn) && /להמשיך לעקוב/.test(moveFn) && /לא עכשיו/.test(moveFn));

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
