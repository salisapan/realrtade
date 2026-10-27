'use strict';
// System notices with a deadline and a preventing action (owner priority 3, 2026-10-21): "your project will be paused on
// October 28 unless you update billing". Known services only, all three of consequence + deadline + action, never a newsletter.
// The lines are invented. Run: node test/system-notice-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'incoming-judge.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const S = vm.runInContext('FlowSystemNotice', box);
const J = vm.runInContext('FlowIncomingJudge', box);
const I = vm.runInContext('FlowIntent', box);
const NOW = new Date('2026-10-20T10:00:00+03:00');
const detect = (email, text, extra) => S.detect(Object.assign({ text, sender: { email }, now: NOW }, extra || {}));

// Positives: a known service, a consequence, a deadline, an action.
const POS = [
  ['noreply@netlify.com', 'Your project will be paused on October 28 unless you update your billing details.', '2026-10-28', /billing/i],
  ['billing@namecheap.com', 'Your domain example.com expires on 2026-11-02. Renew it now to keep it.', '2026-11-02', /renew example\.com/i],
  ['no-reply@vercel.com', 'Your account will be suspended within 48 hours. Please verify your email.', '2026-10-22', /verify your email/i],
  ['alerts@billing.github.com', 'Your plan will be downgraded on 5 November 2026. Please update your payment method.', '2026-11-05', /payment/i],
  ['noreply@supabase.com', 'Your project will be paused on Nov 3rd, 2026 due to inactivity. Upgrade your plan to keep it running.', '2026-11-03', /upgrade/i],
  ['noreply@godaddy.com', 'הדומיין שלך יפוג ב 5 בנובמבר. יש לחדש את הדומיין.', '2026-11-05', /לחדש/]
];
for (const [email, text, due, act] of POS) {
  const r = detect(email, text);
  check('notice: ' + text.slice(0, 40), r && r.dueIso === due && act.test(r.action + ' ' + r.title), r);
}
// Israeli services and a numeric Hebrew date (run 119): day first, a known domain only, never a lookalike, a newsletter or a version number.
const IL = [
  ['noreply@iec.co.il', 'החשבון שלך יחויב ב-5.11. יש לעדכן פרטי תשלום.', '2026-11-05', /IEC/],
  ['noreply@gov.il', 'רישיון העסק שלך יפוג ב-15.11.2026. יש לחדש את הרישיון.', '2026-11-15', /gov\.il/],
  ['billing@cellcom.co.il', 'השירות שלך יושעה עד 30/11. יש לעדכן פרטי תשלום.', '2026-11-30', /Cellcom/],
  ['billing@bezeq.co.il', 'Your service will be suspended on 3 November 2026. Please update your payment method.', '2026-11-03', /Bezeq/]
];
for (const [email, text, due, who] of IL) {
  const r = detect(email, text);
  check('Israeli notice: ' + text.slice(0, 30), r && r.dueIso === due && who.test(r.title), r);
}
for (const [email, text, why] of [
  ['noreply@evil-iec.co.il', 'החשבון שלך יחויב ב-5.11. יש לעדכן פרטי תשלום.', 'a lookalike domain'],
  ['x@iec.co.il.evil.io', 'החשבון שלך יחויב ב-5.11. יש לעדכן פרטי תשלום.', 'a domain that only starts like a known one'],
  ['news@iec.co.il', 'מבצע! הצטרפו לניוזלטר שלנו, הנחה עד 5.11. יש לעדכן פרטים', 'a promotion'],
  ['noreply@iec.co.il', 'גרסה 5.11 של האפליקציה יצאה. יש לעדכן', 'a version number'],
  ['billing@netlify.com', 'Your project will be paused on 5/11 unless you update your billing details.', 'English 5/11 is ambiguous']
]) check('no Israeli notice (' + why + ')', detect(email, text) === null, detect(email, text));
check('the title carries the provider and the date', /\(Netlify\) by Oct 28$/.test(detect(POS[0][0], POS[0][1]).title));
check('a Hebrew title uses the Hebrew date form', /עד 5\.11$/.test(detect(POS[5][0], POS[5][1]).title));
check('a subdomain of a known service counts', Boolean(detect('x@mail.netlify.com', POS[0][1])));
check('the caller can pass a known sender', Boolean(detect('ops@mycompany.example', POS[0][1], { knownSenders: ['mycompany.example'] })));

// Quiet negatives.
check('an unknown sender with the same words stays quiet (phishing shape)', detect('support@netlify-billing.io', POS[0][1]) === null);
check('a lookalike domain stays quiet', detect('noreply@netlify.com.evil.io', POS[0][1]) === null);
check('a bare unknown address stays quiet', detect('someone@gmail.example', POS[0][1]) === null);
check('news@ from a known service stays quiet', detect('news@netlify.com', POS[0][1]) === null);
check('newsletter@ stays quiet', detect('newsletter@vercel.com', POS[0][1]) === null);
check('a promotion stays quiet', detect('noreply@netlify.com', 'Sale! 20% off. Your plan expires October 30, upgrade now.') === null);
check('a newsletter footer stays quiet', detect('noreply@netlify.com', 'Your project will be paused on October 28 unless you update billing. Unsubscribe here.') === null);
check('a webinar stays quiet', detect('noreply@zoom.us', 'Join our webinar before registration expires on October 30. Renew your seat now.') === null);
check('a notice with no deadline stays quiet', detect('noreply@netlify.com', 'Your project will be paused unless you update your billing details.') === null);
check('a deadline in the past stays quiet', detect('noreply@netlify.com', 'Your project was paused on October 2. Update your billing details.') === null);
check('no preventing action stays quiet', detect('noreply@netlify.com', 'Your project will be paused on October 28.') === null);
check('no consequence stays quiet', detect('noreply@netlify.com', 'Please update your billing details by October 28.') === null);
check('an ordinary service message stays quiet', detect('noreply@github.com', 'Dana merged your pull request into main. See the changes on October 21.') === null);
check('a sign-in alert with no deadline stays quiet', detect('no-reply@accounts.google.com', 'New sign-in from Windows. If this was not you, confirm your account.') === null);
check('a slash date is not read', S.deadlineOf('expires 03/11', NOW) === null);
check('an invalid day is not a deadline', S.deadlineOf('expires on February 31', NOW) === null);

// The shared judge: the same decision everywhere, a task with the date.
const base = { systemNoticeOn: true, subject: 'Action required', now: NOW, to: ['me@example.com'], ownAddresses: ['me@example.com'], userName: 'Sam' };
const j = J.judge(Object.assign({}, base, { text: POS[0][1], sender: { email: 'noreply@netlify.com', name: 'Netlify' } }));
check('judge: the notice shows', j.show === true && j.intent.systemNotice === true, j);
const step = j.process && j.process.steps[0];
check('judge: one task step, due on the deadline', j.process.steps.length === 1 && step.kind === 'googleTask' && step.params.dateIso === '2026-10-28', step);
check('judge: the task names the work and the date', /Update your billing details/.test(step.params.title) && /Oct 28/.test(step.params.title), step);
check('judge: no reply draft in it', !J.draftStepOf(j.process));
check('shouldShowChip accepts the notice intent', I.shouldShowChip(j.intent) === true);
const o = J.judge(Object.assign({}, base, { text: POS[0][1], sender: { email: 'noreply@netlify.com' }, surface: 'outlook' }));
check('Outlook gets a Microsoft To Do task, same card', o.show && o.process.steps[0].kind === 'outlookTask', o);
const q = J.judge(Object.assign({}, base, { text: POS[0][1], sender: { email: 'support@netlify-billing.io' } }));
check('judge: an unknown sender stays quiet', q.show === false, q);
const own = J.judge(Object.assign({}, base, { text: POS[0][1], sender: { email: 'noreply@netlify.com' }, senderIsUser: true }));
check('judge: a note the user sent is not a notice', !(own.intent && own.intent.systemNotice), own);
const person = J.judge(Object.assign({}, base, { text: 'Could you send me the report by Thursday?', sender: { email: 'dana@firm.example', name: 'Dana' } }));
check('judge: a person ask is untouched by this path', person.show === true && !person.intent.systemNotice, person);
const quietNews = J.judge(Object.assign({}, base, { text: 'Our newsletter: your plan expires October 30. Renew your plan now. Unsubscribe', sender: { email: 'noreply@netlify.com' } }));
check('judge: a newsletter stays quiet', quietNews.show === false, quietNews);

const off = J.judge(Object.assign({}, base, { systemNoticeOn: false, text: POS[0][1], sender: { email: 'noreply@netlify.com' } }));
check('judge: with the switch off the notice does not show', off.show === false, off);
const gmSrc = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
const olSrc = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('Gmail and Outlook read glanceSwitches.SYSTEM_NOTICE', /SYSTEM_NOTICE === true/.test(gmSrc) && /SYSTEM_NOTICE === true/.test(olSrc) && /systemNoticeOn: systemNoticeSwitch === true/.test(olSrc));

// Wiring: every surface loads it.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const js = manifest.content_scripts[0].js;
check('manifest loads the notice module before the judge', js.indexOf('core/system-notice.js') > -1 && js.indexOf('core/system-notice.js') < js.indexOf('core/incoming-judge.js'));
const gm = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
check('the Gmail page asks the notice module and plans the notice task', /FlowSystemNotice\.detect/.test(gm) && /intent\.systemNotice && intent\.notice/.test(gm));
const bundle = fs.readFileSync(path.join(ROOT, '..', 'glance-gmail-addon', 'CoreBundle.js'), 'utf8');
check('the Workspace card bundle carries the notice module', /FlowSystemNotice/.test(bundle));
const bb = new (require('vm').Script)(bundle);
const bbox = { module: undefined, console };
vm.createContext(bbox);
bb.runInContext(bbox);
const gl = vm.runInContext('Glance', bbox);
const jb = gl.judge(Object.assign({}, base, { text: POS[0][1], sender: { email: 'noreply@netlify.com' } }));
check('the phone card decides the same (a task with the date)', jb.show === true && jb.process.steps[0].params.dateIso === '2026-10-28', jb);

console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
