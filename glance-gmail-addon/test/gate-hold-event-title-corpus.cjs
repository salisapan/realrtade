'use strict';
// Live Gate on #290: the Gmail add-on Do It on
// "[G-Calendar] שיחת וידאו עם אופק על ה-onboarding" wrote an event titled
// «שיחת וידאו 17/11 10:00» (the card chrome) instead of the meeting subject.
// The description's Subject line also kept the tag. The event title is now
// the subject with reply prefixes and [tags] stripped; the card chrome stays.
// Run: node test/gate-hold-event-title-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const addon = path.join(__dirname, '..');
const sandbox = { console, Buffer, Intl, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'BuildSha.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(addon, 'src', 'intent.js'), 'utf8'), sandbox, { filename: 'intent.js' });
sandbox.Glance = { intent: sandbox.GlanceIntent };

const SUBJECT = '[G-Calendar] שיחת וידאו עם אופק על ה-onboarding';
const TITLE = 'שיחת וידאו עם אופק על ה-onboarding';
const BODY = 'בוא נקבע שיחת וידאו ביום שלישי 17/11 בשעה 10:00 עד 10:30 על ה-onboarding של אופק. תשריין ביומן ותוסיף לינק ל-Meet.';
const NOW = new Date('2026-11-13T10:50:00Z');
const READER = 'ai.local.flow@gmail.com';

const judgeDeps = {
  intent: sandbox.FlowIntent,
  actions: sandbox.FlowActions,
  factReply: sandbox.FlowFactReply,
  fileAttach: sandbox.FlowFileAttach,
  resolution: sandbox.FlowResolution
};

function engineFor(subject, self) {
  return function (text) {
    const j = sandbox.FlowIncomingJudge.judge({
      text,
      subject: subject,
      sender: { email: self ? READER : 'dana@example.com', name: self ? 'flow' : 'Dana' },
      to: [READER],
      ownAddresses: [READER],
      userName: 'flow',
      ownNames: ['Sali', 'flow'],
      readerEmail: READER,
      namesWaitDone: true,
      now: NOW,
      surface: 'gmail',
      inbound: !self
    }, judgeDeps);
    if (!j || !j.show) return { intent: j && j.intent, plan: null, reason: j && j.reason };
    return { intent: j.intent, plan: j.process };
  };
}

function decide(subject, self) {
  return sandbox.Glance.intent.resolveTask(BODY, {
    now: NOW,
    timeZone: 'Asia/Jerusalem',
    engine: engineFor(subject, self)
  });
}

for (const self of [false, true]) {
  const who = self ? 'self-mail' : 'inbound';
  const d = decide(SUBJECT, self);
  check(who + ' is a hold', d && d.speak === true && d.kind === 'hold' && d.hour === 10 && d.dateIso === '2026-11-17', d);
  check(who + ' card chrome stays שיחת וידאו 17/11 10:00', d && d.title === 'שיחת וידאו 17/11 10:00', d && d.title);
  check(who + ' event title is the subject without [G-Calendar]', d && d.eventTitle === TITLE, d && d.eventTitle);
}

{
  const d = decide('Re: Fw: ' + SUBJECT, false);
  check('Re:/Fw:/[G-Calendar] still leave the meeting subject as the event title', d && d.eventTitle === TITLE, d && d.eventTitle);
  check('the card chrome is unchanged with a tagged subject', d && d.title === 'שיחת וידאו 17/11 10:00', d && d.title);
}

{
  const d = decide('', false);
  check('empty subject: event title falls back to the sentence, not the card chrome',
    d && d.eventTitle && d.eventTitle !== 'שיחת וידאו 17/11 10:00' && /שיחת וידאו|onboarding|אופק/.test(d.eventTitle),
    d && d.eventTitle);
}

{
  const clean = vm.runInContext('FlowActions.holdSubjectTitle', sandbox);
  check('holdSubjectTitle strips [G-Calendar]', clean(SUBJECT) === TITLE, clean(SUBJECT));
  check('holdSubjectTitle strips Re: Fw: and the tag', clean('Re: Fw: ' + SUBJECT) === TITLE, clean('Re: Fw: ' + SUBJECT));
  check('holdSubjectTitle leaves a plain subject', clean(TITLE) === TITLE, clean(TITLE));
}

if (failures) {
  console.error('\nFAILURES: ' + failures);
  process.exit(1);
}
console.log('\nall passed');
