'use strict';
// Round-3 readers with every labs switch OFF: an Outlook invitation mail becomes "Accept the invitation" (a calendar entry on the person's
// own calendar, no RSVP, no attendees); a request to look up a person's address is quiet with the visible "contacts-unavailable" why; an
// ask to prepare a document and send it back on Outlook is a Reply & Track, not a file chain. Run: node test/gate-round3-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'day-words.js', 'chat-appointment-notice.js', 'chat-invitation-notice.js', 'incoming-judge.js', 'display-copy.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', box);
const D = vm.runInContext('FlowDisplay', box);
const NOW = new Date(2026, 10, 4, 12, 0, 0); // Wednesday
const ME = 'sali@mine.example';
const judge = (text, subject, surface) => J.judge({ text, subject: subject || 'Hello', sender: { name: 'Dana Levi', email: 'dana@example.com' }, senderEmail: 'dana@example.com', now: NOW, surface: surface || 'outlook', inbound: true, to: [ME], cc: [], ownAddresses: [ME], namesWaitDone: true });

// Invitation mails
const inv = judge("You're invited: Steering committee, Wednesday 15:00. Accept / Tentative / Decline", 'Invitation: Steering committee');
check('invitation mail: shown', inv.show === true, inv);
check('invitation mail: process is Accept the invitation', inv.process && inv.process.name === 'Accept the invitation', inv.process && inv.process.name);
const st = inv.process && inv.process.steps[0];
check('invitation mail: one calendar step, titled, dated, no RSVP', st && st.kind === 'calendar' && st.params.title === 'Steering committee' && st.params.dateIso === '2026-11-11' && st.params.hour === 15 && st.params.noRsvp === true && inv.process.steps.length === 1, st);
check('invitation mail: face title', D.cardFace(inv.process, inv.intent, { bodyText: 'You are invited' }).title === 'Accept the invitation?');
check('invitation mail: face title in Hebrew', D.cardFace(inv.process, inv.intent, { bodyText: 'הזמנה' }).title === 'לאשר את ההזמנה?');
const gm = judge("You're invited: Steering committee, Wednesday 15:00. Accept / Tentative / Decline", 'Invitation: Steering committee', 'gmail');
check('invitation mail: not on Gmail', !(gm.process && gm.process.name === 'Accept the invitation'), gm.reason);
const party = judge("You're invited to my birthday on Saturday at 8pm", 'Party');
check('a party invitation without invitation controls stays quiet by default', party.show === false, party.reason);
const nodate = judge('You are invited: Steering committee. Accept / Decline', 'Invitation: Steering committee');
check('invitation without a day and clock: no card', !(nodate.process && nodate.process.name === 'Accept the invitation'), nodate.reason);

// Contacts lookups
check('contactsAsk: English name + email', J.contactsAsk("What's Dana's email?") === true);
check('contactsAsk: not a venue address', J.contactsAsk("What's the address of the venue?") === false);
const c = judge("What's Dana's email address? I need to forward her the file.", 'Quick one');
check('contacts ask: quiet with the contacts why', c.show === false && /contacts-unavailable/.test(c.reason), c);
check('contacts why: has an English line', /Contacts/.test(D.whyNotShownLine('contacts-unavailable', 'en')) || /Contacts/.test(String(D.whyNotShownLine('contacts-unavailable'))), D.whyNotShownLine('contacts-unavailable'));
check('contacts why: Hebrew line is not the generic fallback', D.whyNotShownLine('contacts-unavailable') !== D.whyNotShownLine('intent-null'));

// Authoring asks on Outlook
const au = judge('Please prepare the quarterly report and send it to me by Sunday.', 'Report');
check('authoring ask on Outlook: card shown, not a file chain', au.show === true && !/file-chain/.test(au.reason || ''), au);
check('authoring ask: the card has a draft step', JSON.stringify(au.process || {}).indexOf('draft') !== -1, au.process && au.process.name);

if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
console.log('\nAll round-3 checks passed.');
