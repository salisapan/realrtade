// Close map C1: one named clock becomes one calendar hold, then a read-back.
// Switch MEETING_HOLD defaults off. Guests stay empty. Nothing is sent.
// Run: node test/meeting-hold-corpus.cjs
'use strict';
const { FlowMeetingHold: H } = require('../core/meeting-hold.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { MEETING_HOLD: true };
const NOW = new Date(2026, 9, 14, 12, 0, 0);
const base = (text, extra) => Object.assign({ flags: ON, text: text, now: NOW, events: [], timeZone: 'UTC' }, extra || {});

function mockCal(opts) {
  opts = opts || {};
  const calls = [];
  let event = opts.event === undefined ? null : opts.event;
  async function calendar(method, path, body) {
    calls.push({ method: method, path: path, body: body || null });
    if (opts.fail === method) return { status: opts.status || 500, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postStatus) return { status: opts.postStatus, ok: false, json: {} };
      event = {
        id: opts.id || 'ev_hold_1',
        summary: body.summary,
        description: body.description,
        start: body.start,
        end: body.end,
        attendees: Array.isArray(body.attendees) ? body.attendees.slice() : []
      };
      if (opts.afterPost) event = opts.afterPost(event);
      return { status: 200, ok: true, json: { id: event.id } };
    }
    if (method === 'GET') {
      if (opts.getStatus) return { status: opts.getStatus, ok: false, json: null };
      if (!event) return { status: 404, ok: false, json: {} };
      return { status: 200, ok: true, json: event };
    }
    if (method === 'DELETE') {
      if (opts.deleteStatus) return { status: opts.deleteStatus, ok: false, json: {} };
      event = null;
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  }
  return { calendar: calendar, calls: calls, live: () => event };
}

console.log('\n--- one named clock ---\n');
const positives = [
  { text: 'Can we meet Thursday at 16:00?', iso: '2026-10-15', hour: 16, minute: 0, lang: 'en', summary: 'Meeting' },
  { text: "Let's sync this Friday at 3pm about the quote.", iso: '2026-10-16', hour: 15, minute: 0, lang: 'en', summary: 'quote' },
  { text: 'Can we meet Thursday at 16:00 about the quote, and reply to confirm?', iso: '2026-10-15', hour: 16, minute: 0, lang: 'en', summary: 'quote' },
  { text: 'Hold a meeting Thursday at 09:30.', iso: '2026-10-15', hour: 9, minute: 30, lang: 'en', summary: 'Meeting' },
  { text: 'ניפגש ביום חמישי בשעה 16:00', iso: '2026-10-15', hour: 16, minute: 0, lang: 'he', summary: 'פגישה' },
  { text: 'פגישת צוות ביום חמישי בשעה 16:00', iso: '2026-10-15', hour: 16, minute: 0, lang: 'he', summary: 'פגישה' },
  { text: 'Can we meet tomorrow at 10:00?', iso: '2026-10-15', hour: 10, minute: 0, lang: 'en', summary: 'Meeting' }
];
let offered = 0;
for (const p of positives) {
  const card = H.card(base(p.text));
  const ok = card.action === 'offer' && card.approval === 'Do It' && card.sends === false &&
    card.ask.dateIso === p.iso && card.ask.hour === p.hour && card.ask.minute === p.minute &&
    card.ask.lang === p.lang && card.ask.summary === p.summary &&
    card.steps.length === 2 && card.steps[1].proof === 'google/calendar';
  if (ok) offered++;
  check('card offers one hold: ' + p.text, ok, card);
}
const confirm = H.card(base(positives[2].text));
check('a confirm line is still only a hold', confirm.steps.every((s) => s.kind !== 'mail' && s.kind !== 'send'), confirm.steps);
check('the English line names the clock', confirm.line === 'Hold 2026-10-15 16:00 on your calendar?', confirm.line);
const heCard = H.card(base(positives[4].text));
check('the Hebrew line names the clock', heCard.line === 'לקבוע ביומן 2026-10-15 16:00?', heCard.line);
check('the body invites nobody', JSON.stringify((H.eventBody(heCard.ask, 'UTC') || {}).attendees) === '[]');

console.log('\n--- silence ---\n');
const negatives = [
  { why: 'empty', text: '' },
  { why: 'null', text: null },
  { why: 'no clock', text: 'Can we meet Thursday?' },
  { why: 'bare hour, no half of the day', text: 'Can we meet Thursday at 4?' },
  { why: 'no day', text: 'Can we meet at 16:00?' },
  { why: 'find a time', text: 'Find us 30 minutes next week.' },
  { why: 'find a time (he)', text: 'תמצא זמן בשבוע הבא' },
  { why: 'two clocks', text: 'Can we meet Thursday at 16:00 or at 17:00?' },
  { why: 'two days', text: 'Can we meet Thursday or Friday at 16:00?' },
  { why: 'hedge', text: 'Maybe we can meet Thursday at 16:00.' },
  { why: 'negation', text: "Don't meet Thursday at 16:00." },
  { why: 'negation (he)', text: 'אל ניפגש ביום חמישי בשעה 16:00' },
  { why: 'already met', text: 'We already met Thursday at 16:00.' },
  { why: 'status question', text: 'Did we meet Thursday at 16:00?' },
  { why: 'invite', text: 'Send Dana a hold for Thursday at 4pm.' },
  { why: 'invite (he)', text: 'תזמיני את דנה ליום חמישי בשעה 16:00' },
  { why: 'move', text: "Let's push Thursday's call to Friday at 11:00." },
  { why: 'cancel', text: "Thursday's call at 16:00 is cancelled." },
  { why: 'file on the calendar', text: 'Add the quote to my calendar Thursday at 4pm.' },
  { why: 'third party', text: 'Ask Dana if we can meet Thursday at 16:00.' },
  { why: 'a promise, not a meeting', text: 'אחזור אליך ביום חמישי בשעה 16:00' },
  { why: 'thanks for the meeting', text: 'תודה על פגישת הצוות ביום חמישי בשעה 16:00' },
  { why: 'before the meeting', text: 'לפני פגישת הצוות ביום חמישי בשעה 16:00 צריך את המספרים' },
  { why: 'recap', text: 'פגישת הסיכום ביום חמישי בשעה 16:00' },
  { why: 'fyi', text: 'FYI, team meeting Thursday at 16:00.' },
  { why: 'calendar not read', text: 'Can we meet Thursday at 16:00?', events: null },
  { why: 'that clock is already held', text: 'Can we meet Thursday at 16:00?', events: [{ id: 'old', start: { dateTime: '2026-10-15T16:00:00' }, summary: 'Quote' }] }
];
let wrongOffers = 0;
for (const n of negatives) {
  const card = H.card(base(n.text, n.events === undefined ? {} : { events: n.events }));
  if (card.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, card.action === 'silence', card);
}

console.log('\n--- the switch and the approve ---\n');
check('the switch defaults off', H.SWITCH === 'MEETING_HOLD' && H.SWITCH_DEFAULT === false && H.enabled() === false && H.enabled({ MEETING_HOLD: 1 }) === false);
check('switch off is not a card', H.card(base(positives[0].text, { flags: {} })).action === 'off');
const offeredCard = H.card(base(positives[0].text));
check('approve needs an explicit yes', H.approve(offeredCard, false).approved === false && H.approve(null, true).approved === false);
check('approve yes keeps the ask', H.approve(offeredCard, true).approved === true && H.approve(offeredCard, true).ask.dateIso === '2026-10-15');

console.log('\n--- execute reads the event back ---\n');
(async () => {
  const declined = mockCal();
  const no = await H.execute(base(positives[0].text, { approved: false }), { calendar: declined.calendar });
  check('no approve, no write', no.ok === false && no.reason === 'not-approved' && declined.calls.length === 0, no);

  const off = mockCal();
  const offRes = await H.execute(base(positives[0].text, { flags: {}, approved: true }), { calendar: off.calendar });
  check('switch off, no write', offRes.ok === false && offRes.reason === 'switch-off' && off.calls.length === 0, offRes);

  let proved = 0;
  for (const p of positives) {
    const io = mockCal();
    const yes = H.approve(H.card(base(p.text)), true);
    const res = await H.execute(base(p.text, { approved: yes.approved }), { calendar: io.calendar });
    const post = io.calls[0];
    const got = io.calls[1];
    const ok = res.ok === true && Proof.allowsHandled(res) && res.proof.fetchedBack === true &&
      res.proof.system === 'google/calendar' && res.proof.externalId === 'ev_hold_1' &&
      res.proof.verifiedAt === NOW.toISOString() &&
      post.method === 'POST' && post.path.indexOf('sendUpdates=none') !== -1 &&
      post.body.attendees.length === 0 && post.body.summary === p.summary &&
      post.body.start.dateTime === p.iso + 'T' + String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0') + ':00' &&
      got.method === 'GET' && io.calls.length === 2 &&
      !io.calls.some((c) => /\/messages|gmail\.|mail\.send/i.test(c.path));
    if (ok) proved++;
    check('proved hold: ' + p.text, ok, res.ok ? res.proof : res);
  }

  const auth = mockCal({ postStatus: 401 });
  const authRes = await H.execute(base(positives[0].text, { approved: true }), { calendar: auth.calendar });
  check('401 is not Handled', authRes.ok === false && authRes.reason === 'not-connected' && authRes.proof == null, authRes);

  const mismatch = mockCal({ afterPost: (ev) => Object.assign({}, ev, { start: { dateTime: '2026-10-15T17:00:00', timeZone: 'UTC' } }) });
  const bad = await H.execute(base(positives[0].text, { approved: true }), { calendar: mismatch.calendar });
  check('a different clock is not Handled and the write is removed', bad.ok === false && bad.reason === 'verify_failed' && bad.proof == null && mismatch.calls.some((c) => c.method === 'DELETE') && mismatch.live() == null, bad);

  const guest = mockCal({ afterPost: (ev) => Object.assign({}, ev, { attendees: [{ email: 'dana@example.com' }] }) });
  const guestRes = await H.execute(base(positives[0].text, { approved: true }), { calendar: guest.calendar });
  check('a guest on the read-back is not Handled', guestRes.ok === false && guestRes.proof == null && guest.live() == null, guestRes);

  const unread = mockCal({ getStatus: 500 });
  const unreadRes = await H.execute(base(positives[0].text, { approved: true }), { calendar: unread.calendar });
  check('a failed read is not Handled and is not deleted on a guess', unreadRes.ok === false && unreadRes.reason === 'verify_failed' && !unread.calls.some((c) => c.method === 'DELETE'), unread.calls.map((c) => c.method));

  console.log('\n--- undo ---\n');
  const held = mockCal();
  const created = await H.execute(base(positives[0].text, { approved: true }), { calendar: held.calendar });
  const undone = await H.undo({ flags: ON, ref: created.ref, now: NOW }, { calendar: held.calendar });
  check('undo deletes the event it wrote', undone.ok === true && undone.removed === true && held.live() == null && created.proof.fetchedBack === true, undone);
  const again = await H.undo({ flags: ON, ref: created.ref, now: NOW }, { calendar: held.calendar });
  check('a second undo does not invent a delete', again.ok === false && again.reason === 'already-gone', again);

  const edited = mockCal();
  const created2 = await H.execute(base(positives[1].text, { approved: true }), { calendar: edited.calendar });
  const live = edited.live();
  live.summary = 'Someone else edited this';
  const before = edited.calls.length;
  const left = await H.undo({ flags: ON, ref: created2.ref, now: NOW }, { calendar: edited.calendar });
  check('an edited event is left alone', left.ok === false && left.reason === 'edited' && edited.live() && edited.live().summary === 'Someone else edited this' && !edited.calls.slice(before).some((c) => c.method === 'DELETE'), left);

  const offUndo = mockCal();
  const offU = await H.undo({ flags: {}, ref: created.ref, now: NOW }, { calendar: offUndo.calendar });
  check('undo stays off with the switch', offU.reason === 'switch-off' && offUndo.calls.length === 0, offU);

  console.log('\nCOUNTS offers=' + offered + ' silence=' + (negatives.length - wrongOffers) + ' proved=' + proved + ' wrongOffers=' + wrongOffers);
  console.log('TOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
