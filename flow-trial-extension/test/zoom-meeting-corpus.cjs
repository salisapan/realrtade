// A Zoom call proposed with one day and one clock becomes one Do It, behind ZOOM_MEETING (off). Hebrew and English,
// positive and negative. Pure recognition and plan: nothing is called. Run: node test/zoom-meeting-corpus.cjs
'use strict';
const { FlowZoomMeeting: Z } = require('../core/zoom-meeting.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { ZOOM_MEETING: true };
const NOW = new Date('2026-10-19T09:00:00Z'); // a Monday

console.log('\n--- a Zoom call proposed with one day and one clock ---\n');
const yes = [
  ['Can we do a Zoom call tomorrow at 15:00?', '2026-10-20', 15, 0],
  ["Let's hop on a Zoom meeting on Thursday at 14:00.", '2026-10-22', 14, 0],
  ['Could we set up a call on Zoom on 2026-10-23 at 10:30?', '2026-10-23', 10, 30],
  ['How about a Zoom call Wednesday at 4pm?', '2026-10-21', 16, 0],
  ['Shall we schedule a Zoom session on Oct 22 at 11:00?', '2026-10-22', 11, 0],
  ['נעשה שיחה בזום מחר ב-15:00', '2026-10-20', 15, 0],
  ['בואו נקבע פגישת זום ביום חמישי ב-14:00', '2026-10-22', 14, 0],
  ['אפשר שיחת וידאו בזום ביום רביעי בשעה 10:30?', '2026-10-21', 10, 30]
];
for (const [text, d, h, m] of yes) {
  const r = Z.recognize(text, NOW);
  check('clear: ' + text, r.kind === 'clear' && r.dateIso === d && r.hour === h && r.minute === m, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ["Let's do a Zoom call tomorrow at 3pm or Thursday at 4pm.", 'several-times'],
  ["Let's do a Zoom call tomorrow at 15:00 or 16:00.", 'several-times'],
  ["Let's do a Teams call or a Zoom call tomorrow at 15:00.", 'other-tool'],
  ["Let's do a Google Meet instead of Zoom tomorrow at 15:00.", 'other-tool'],
  ['בואו נעשה שיחה בטימס או בזום מחר ב-15:00', 'other-tool'],
  ["I'll send a Zoom link for tomorrow at 15:00, can we do that?", 'they-host'],
  ["Let's talk tomorrow at 15:00 on my Zoom.", 'they-host'],
  ['אני אשלח קישור לזום, בואו נדבר מחר ב-15:00', 'they-host'],
  ['Maybe we could do a Zoom call tomorrow at 15:00 if you want.', 'hedge'],
  ['Can we do a Zoom call sometime?', 'hedge'],
  ['אולי נעשה שיחה בזום מחר ב-15:00', 'hedge'],
  ['FYI here is the recording of the Zoom call from today at 15:00.', 'fyi'],
  ['Join our Zoom webinar, let\'s start tomorrow at 15:00. Unsubscribe here.', 'fyi'],
  ['Ask Dana to set up a Zoom call tomorrow at 15:00.', 'third-party'],
  ['No need for a Zoom call tomorrow at 15:00.', 'negation'],
  ['אין צורך בשיחה בזום מחר ב-15:00', 'negation'],
  ['The Zoom call is tomorrow at 15:00.', 'no-proposal'],
  ["Let's do a Zoom call tomorrow.", 'no-clock'],
  ["Let's do a Zoom call at 15:00.", 'no-day'],
  ["Let's do a Zoom call on 2026-10-12 at 10:00.", 'past']
];
for (const [text, why] of no) {
  const r = Z.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind !== 'clear' && r.reason === why, r);
}
for (const text of ['Lunch tomorrow at 13:00?', "Let's do a video call tomorrow at 15:00.", 'Can we do a Teams call tomorrow at 15:00?', 'Please send me the Zoom link for tomorrow.', '', null]) {
  check('ignored: ' + String(text), Z.recognize(text, NOW).kind === 'ignore' || Z.recognize(text, NOW).kind === 'block' && Z.recognize(text, NOW).reason !== undefined && Z.plan({ flags: ON, text, now: NOW }).action === 'silence');
}
check('a generic video call is NOT a Zoom ask (the mailbox\'s own tool owns it)', Z.plan({ flags: ON, text: "Let's do a video call tomorrow at 15:00.", now: NOW }).action === 'silence');

console.log('\n--- the switch, the plan and the start instant ---\n');
check('off by default', Z.SWITCH_DEFAULT === false && Z.plan({ text: yes[0][0], now: NOW }).action === 'off');
const p = Z.plan({ flags: ON, text: yes[0][0], now: NOW, senderName: 'Dana' });
check('one Do It, clock as named, topic with the name, proof system zoom/meeting', p.action === 'offer' && p.approval === 'DoIt' && p.topic === 'Zoom call with Dana' && p.when.dateIso === '2026-10-20' && p.when.hour === 15 && p.steps[0].proof === 'zoom/meeting', p);
check('the share step is the person\'s, not Glance\'s; nothing says send or invite', p.steps.some((s) => s.kind === 'manual') && !p.steps.some((s) => /send|invite/i.test(s.kind)), p.steps);
const ph = Z.plan({ flags: ON, text: yes[5][0], now: NOW });
check('Hebrew plan: Hebrew line and topic', ph.lang === 'he' && ph.topic === 'שיחת Zoom' && /Zoom/.test(ph.line), ph);
check('a hostile sender name stays one clipped line in the topic', Z.plan({ flags: ON, text: yes[0][0], now: NOW, senderName: 'A\n"}, "type":1' + 'x'.repeat(200) }).topic.indexOf('\n') < 0);
check('a silent ask has no plan', Z.plan({ flags: ON, text: no[0][0], now: NOW }).action === 'silence');
const r0 = Z.recognize(yes[0][0], NOW);
check('start instant uses the device offset the host passes (Israel summer +180 -> +03:00)', Z.startIsoFor(r0, 180) === '2026-10-20T15:00:00+03:00');
check('negative and half-hour offsets', Z.startIsoFor(r0, -300) === '2026-10-20T15:00:00-05:00' && Z.startIsoFor(r0, 330) === '2026-10-20T15:00:00+05:30');
check('a missing or absurd offset gives no instant (never guessed)', Z.startIsoFor(r0, undefined) === null && Z.startIsoFor(r0, 2000) === null && Z.startIsoFor(r0, 1.5) === null);
const { FlowZoomClose } = require('../core/zoom-close.js');
check('the start instant is one the engine accepts', (() => { const ms = Date.parse(Z.startIsoFor(r0, 180)); return Number.isFinite(ms); })() && FlowZoomClose.SYSTEM === Z.SYSTEM);

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
