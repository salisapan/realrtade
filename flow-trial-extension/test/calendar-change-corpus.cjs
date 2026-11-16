// Move or cancel one named meeting (Labs row CALENDAR_CHANGE, off; close map rows C2 and C3). Found by the capability probe on 2026-11-14: «the Thursday sync at 10:00 is
// moved to Friday at 11:00» and «the meeting on Thursday at 10:00 is cancelled» were silent, because the two-clock stand-down and the meeting veto ran before the family that
// reads them. With the flag the judge offers Move It / Clear It for ONE named slot; without it nothing changes. Texts are written for this file. Run: node test/calendar-change-corpus.cjs
const { load } = require('../../glance-ai/scoreboard/capabilities/load.cjs');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const L = load(), g = L.g, J = g('FlowIncomingJudge');
const D = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const OWN = 'ai.local.flow@gmail.com';
function judge(text, on) {
  return J.judge({ text, subject: 'Sync', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(L.NOW), surface: 'gmail', to: [OWN], cc: [], ownAddresses: [OWN],
    ownNames: ['Sali', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true, calendarChangeOn: on === true }, D);
}
const id = (r) => (r.show ? r.process.id : 'SILENT(' + r.reason + ')');
const MOVES = ["Hi Sali, let's push Thursday's call at 10:00 to Friday at 11:00.", 'Hi Sali, the Thursday sync at 10:00 is moved to Friday at 11:00.',
  'Hi Sali, can we move our Thursday 10:00 call to Friday at 11:00?', 'Hi Sali, the Thursday meeting at 10:00 has been rescheduled to Friday at 11:00.',
  'היי סאלי, הפגישה ביום חמישי ב-10:00 נדחתה ליום שישי ב-11:00.'];
const CANCELS = ['Hi Sali, the meeting on Thursday at 10:00 is cancelled.', 'היי סאלי, הפגישה ביום חמישי ב-10:00 בוטלה.', 'היי סאלי, הפגישה ביום חמישי ב-10:00 לא תתקיים.'];
console.log('\n--- off by default: nothing changes ---\n');
for (const t of MOVES.slice(0, 4).concat(CANCELS.slice(0, 2))) check('off: ' + t.slice(0, 50), !judge(t, false).show, id(judge(t, false)));
console.log('\n--- on: one named slot is the close ---\n');
for (const t of MOVES) check('move: ' + t.slice(0, 50), id(judge(t, true)) === 'move-it', id(judge(t, true)));
for (const t of CANCELS) check('cancel: ' + t.slice(0, 50), id(judge(t, true)) === 'clear-it', id(judge(t, true)));
const mv = judge(MOVES[0], true);
check('the move card names the NEW slot, with the old one as the slot to patch', mv.intent.label === 'Meeting Oct 9 11:00' && mv.intent.entities.fromDateIso === '2026-10-08' && mv.intent.entities.fromHour === 10 && mv.intent.entities.hour === 11, mv.intent);
const cn = judge(CANCELS[0], true);
check('the cancel card names the one slot to delete', cn.intent.entities.calendarOp === 'delete' && cn.intent.entities.dateIso === '2026-10-08' && cn.intent.entities.hour === 10, cn.intent.entities);
console.log('\n--- on: the cases that must stay quiet ---\n');
const QUIET = [
  ['a cancel that also proposes another meeting has two clocks (which event?)', 'Hi Sali, the Thursday 10:00 meeting is cancelled but we will meet Friday at 11:00.'],
  ['a meeting last Thursday is behind us', 'Hi Sali, the meeting last Thursday at 10:00 was cancelled.'],
  ['a hedge', 'Hi Sali, we could move the Thursday 10:00 meeting to Friday at 11:00 if that works.'],
  ['a hedged cancel', 'Hi Sali, I might need to cancel the Thursday 10:00 meeting.'],
  ['a negation', 'Hi Sali, do not move the Thursday call at 10:00 to Friday at 11:00.'],
  ['a cancel with no slot', 'Hi Sali, the meeting is cancelled.'],
  ['a package is not a meeting', 'Hi Sali, the package was moved to the other warehouse on Friday at 11:00.'],
  ['one clock cannot be a move (no old slot)', 'Hi Sali, the sync is moved to Friday at 11:00.'],
  ['an ambiguous pair of clocks is still ambiguous', "Hi Sali, let's meet at 10:00 or 11:00 on Thursday."],
  ['a hold at a named clock is still a hold, not a move', 'Hi Sali, are you free to meet on Tuesday at 16:00?']
];
for (const [why, t] of QUIET) { const r = judge(t, true); check('quiet (' + why + ')', !(r.show && /^(move-it|clear-it)$/.test(r.process.id)), id(r)); }
check('a hold at a named clock still shows with the flag on', id(judge('Hi Sali, are you free to meet on Tuesday at 16:00?', true)) === 'hold', id(judge('Hi Sali, are you free to meet on Tuesday at 16:00?', true)));
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
