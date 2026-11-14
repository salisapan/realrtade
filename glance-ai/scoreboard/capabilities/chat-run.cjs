'use strict';
// Chat capability probe (2026-11-14): one hand-written line per KIND of close a one-to-one chat (WhatsApp Web, Messenger, Instagram) can carry, through the
// product's chat recognition as src/chat-task-card.js runs it for an incoming message: the shared judge with surface 'chat' (directAskOn, oneToOne), then the
// chat readers (appointment, delivery window, trip, invitation, pickup, payment, reminder, deadline, callback) and the Meet/Teams call reader. Lab only, nothing is
// written. Rows are written for this file; no real chat. usage: node scoreboard/capabilities/chat-run.cjs [--list] [--json]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load, ROOT } = require('./load.cjs');
const L = load(), g = L.g;
for (const f of ['teams-meeting.js', 'meet-link.js']) try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), L.sb, { filename: f }); } catch (e) { /* already declared */ }
const J = g('FlowIncomingJudge');
const D = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const at = new Date(L.NOW);
const READERS = [['ChatAppointmentNotice', 'calendar'], ['ChatDeliveryWindow', 'calendar'], ['ChatTravelNotice', 'calendar'], ['ChatInvitationNotice', 'calendar'], ['ChatPickupNotice', 'calendar'],
  ['ChatPaymentAsk', 'pay'], ['ChatReminder', 'task'], ['ChatDeadlineAsk', 'task'], ['ChatCallbackAsk', 'task'], ['TeamsMeeting', 'video_link'], ['MeetLink', 'video_link']];
function familyOf(r) {
  if (!r || !r.show) return 'none';
  const k = (r.process && r.process.steps || []).map((s) => s.kind), id = (r.process && r.process.id) || '';
  if (/pay/i.test(JSON.stringify((r.intent && r.intent.personalClose) || ''))) return 'pay';
  if (k.some((x) => /calendar|Event/i.test(x))) return 'calendar';
  if (k.some((x) => /Draft$/.test(x))) return 'draft';
  if (k.some((x) => /Task/.test(x))) return 'task';
  return 'other:' + id;
}
function recognizeChat(text, over) {
  let r; try { r = J.judge(Object.assign({ text, subject: '', sender: { name: 'Dana', email: '' }, surface: 'chat', now: at, attachmentCount: 0, directAskOn: true, oneToOne: true, taskAskOn: true, paymentAskOn: true, bookingNoticeOn: true, namesWaitDone: true, ownNames: ['Sali', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true }, over || {}), D); } catch (e) { r = { show: false, reason: 'ERR ' + e.message }; }
  let fam = familyOf(r), via = 'judge';
  // a reader that fires is the more specific reading (the card prefers the payment reader over the judge's generic reply for the same words)
  for (const [n, f] of READERS) {
    const m = g('Flow' + n); if (!m || !m.recognize) continue;
    let x; try { x = m.recognize(text, at); } catch (e) { x = null; }
    if (x && x.kind && !/^(ignore|block|none)$/.test(x.kind) && (fam === 'none' || n === 'ChatPaymentAsk')) { fam = f; via = n; break; }
  }
  return { fam, via, reason: r && r.show ? '' : (r && r.reason) || '' };
}
// [kind, lang, text, want, over]
const ROWS = [
  ['chat.deadline', 'he', 'תשלם את החשבונית עד יום חמישי', 'task'], ['chat.deadline', 'en', 'Please send me the signed form by Thursday', 'task'],
  ['chat.callback', 'he', 'תחזור אליי מחר בבקשה', 'task'], ['chat.callback', 'en', 'Call me back tomorrow', 'task'],
  ['chat.payment', 'he', 'תעביר לי 500 שקל עד יום ראשון', 'pay'], ['chat.payment', 'en', 'Please transfer 500 NIS to me by Sunday', 'pay'],
  ['chat.appointment', 'he', 'התור שלך נקבע ליום ראשון בשעה 10:00', 'calendar'], ['chat.appointment', 'en', 'Your appointment is confirmed for Sunday at 10:00', 'calendar'],
  ['chat.delivery', 'he', 'השליח יגיע מחר בין 8 ל-12', 'calendar'], ['chat.delivery', 'en', 'The courier will arrive tomorrow between 8 and 12', 'calendar'],
  ['chat.trip', 'en', 'Your flight is on Thursday at 06:30', 'calendar'], ['chat.trip', 'he', 'הטיסה שלך ביום חמישי בשעה 06:30', 'calendar'],
  ['chat.invite', 'en', 'You are invited to the launch party on Saturday at 20:00', 'calendar'],
  ['chat.hold', 'he', 'בוא ניפגש ביום ראשון בשעה 14:00', 'calendar'], ['chat.hold', 'en', "Let's meet on Sunday at 14:00", 'calendar'],
  ['chat.video', 'he', 'נעשה שיחת וידאו ביום שלישי ב-15:00?', 'video_link'], ['chat.video', 'en', 'Can we do a Google Meet on Tuesday at 3pm?', 'video_link'],
  ['chat.questions', 'he', 'היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', 'draft'], ['chat.questions', 'en', 'Hi, what is the price for ten users? Which plan includes onboarding support?', 'draft'],
  ['chat.neg.one-question', 'en', 'Hi, how long does onboarding take with you guys?', 'none'],
  ['chat.reminder', 'en', 'Remind me to call the bank tomorrow', 'task'],
  // second pass: other wording of the same kinds
  ['chat.deadline', 'he', 'תשלח לי את החוזה החתום עד מחר בערב', 'task'], ['chat.deadline', 'en', 'Can you get me the final numbers by Monday?', 'task'],
  ['chat.callback', 'he', 'תתקשר אליי ביום שלישי, זה דחוף', 'task'], ['chat.payment', 'he', 'תשלם לי 320 שקל עד יום חמישי', 'pay'],
  ['chat.appointment', 'en', 'See you Tuesday at 09:30 at the clinic, your appointment is booked', 'calendar'],
  // by design, not rows: «המשלוח יגיע ...» without «שלך» is not read as the person's own delivery (core/chat-delivery-window.js), and «נתראה ביום חמישי ב-18:00» is a goodbye, not a proposal.
  ['chat.neg.ack', 'en', 'sounds good, talk soon', 'none'], ['chat.neg.past', 'he', 'שילמתי את החשבונית אתמול', 'none'],
  ['chat.neg.negation', 'he', 'אין צורך לשלוח לי את החוזה', 'none'], ['chat.neg.hedge', 'en', 'maybe we could meet sometime next week, no rush', 'none'],
  ['chat.neg.other-tool', 'he', 'נעשה שיחה בזום ביום שלישי ב-15:00?', 'none'],
  // negatives
  ['chat.neg.ack', 'en', 'ok thanks', 'none'], ['chat.neg.ack', 'he', 'תודה רבה, סבבה', 'none'],
  ['chat.neg.hedge', 'he', 'אולי נדבר מתישהו בשבוע הבא', 'none'], ['chat.neg.past', 'en', 'I paid the invoice yesterday', 'none'],
  ['chat.neg.group', 'he', 'היי, מה המחיר לעשרה משתמשים? כמה זמן לוקח ההטמעה אצלכם?', 'none', { oneToOne: false, group: true }],
  ['chat.neg.bank', 'en', 'Our bank details changed, please pay the 4,000 invoice to the new account by Friday', 'none'],
  ['chat.neg.other-tool', 'en', 'Can we do a Zoom call Tuesday at 3pm?', 'none']
];
const SAME = { video_link: ['calendar'], draft: ['task'], task: ['draft'] };
const ok = (w, g2) => (w === 'none' ? g2 === 'none' : g2 !== 'none' && (g2 === w || (SAME[w] || []).indexOf(g2) >= 0));
const out = {}, detail = [];
for (const [kind, lang, text, want, over] of ROWS) {
  const rec = recognizeChat(text, over), right = ok(want, rec.fam);
  const k = out[kind] = out[kind] || { n: 0, right: 0 }; k.n++; if (right) k.right++;
  detail.push([kind, lang, want, rec.fam, rec.via, rec.reason, right]);
}
const tot = detail.reduce((a, d) => { a.n++; if (d[6]) a.right++; else if (d[2] === 'none') a.falseOffer++; else a.miss++; return a; }, { n: 0, right: 0, miss: 0, falseOffer: 0 });
if (process.argv.includes('--json')) { console.log(JSON.stringify({ out, detail, tot })); process.exit(0); }
console.log('| kind | rows | right |\n|---|---|---|\n' + Object.entries(out).map(([k, v]) => `| ${k} | ${v.n} | ${v.right} |`).join('\n') + `\n| **all** | ${tot.n} | ${tot.right} |  (misses ${tot.miss}, offered where silence is right ${tot.falseOffer})`);
if (process.argv.includes('--list')) console.log('\n' + detail.filter((d) => !d[6]).map((d) => d.slice(0, 6).join(' | ')).join('\n'));
