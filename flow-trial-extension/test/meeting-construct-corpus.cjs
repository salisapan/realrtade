// Hebrew construct-state meeting nouns ("פגישת צוות", "שיחת צוות") are the
// meeting. The absolute form ("פגישה") already filed a calendar hold; the
// tav form stayed silent. A thanks line, a deadline, a negation, an
// artifact, and an FYI stay quiet. Run: node test/meeting-construct-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);

const NOW = new Date('2026-10-07T09:00:00Z');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
function classify(text) {
  return FlowIntent.classify(text, { senderEmail: 'sara@partner.example', senderName: 'Sara', now: NOW, calibration: null, ownNames: ['Sali', 'סאלי'], namesWaitDone: true });
}

const TEAM = [
  'סאלי, פגישת צוות ביום רביעי בשעה 15:00 במשרד לגבי תוכנית הרבעון.\nשרה',
  'סאלי, פגישת צוות ביום ראשון בשעה 14:00 במשרד לגבי תוכנית הגיוס.\nמיכאל',
  'סאלי, פגישת צוות ביום ראשון בשעה 14:00 במשרד לגבי התקציב.\nמיכאל',
  'סאלי, פגישת צוות ביום רביעי בשעה 14:00 במשרד לגבי תוצאות הפיילוט.\nדנה',
  'סאלי, פגישת צוות ביום שני בשעה 15:00 במשרד לגבי תוכנית הגיוס.\nמיכאל'
];
for (const text of TEAM) {
  const intent = classify(text);
  check('team meeting in construct state is a scheduled event',
    intent && intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && FlowIntent.shouldShowChip(intent),
    intent && { type: intent.type, quiet: intent.quiet, hour: intent.entities && intent.entities.hour });
}

const absolute = classify('סאלי, פגישה ביום רביעי בשעה 15:00 במשרד לגבי תוכנית הרבעון.');
const construct = classify('סאלי, פגישת צוות ביום רביעי בשעה 15:00 במשרד לגבי תוכנית הרבעון.');
check('construct and absolute forms resolve the same day and hour',
  absolute && construct &&
  absolute.type === FlowIntent.TYPES.SCHEDULED_EVENT &&
  construct.type === FlowIntent.TYPES.SCHEDULED_EVENT &&
  absolute.entities.dateIso === construct.entities.dateIso &&
  absolute.entities.hour === 15 && construct.entities.hour === 15 &&
  absolute.entities.minute === 0 && construct.entities.minute === 0,
  { absolute: absolute && absolute.entities, construct: construct && construct.entities });

const call = classify('שיחת צוות ביום שני בשעה 10:00 במשרד.');
check('שיחת צוות with a clock time is a scheduled event',
  call && call.type === FlowIntent.TYPES.SCHEDULED_EVENT && call.entities.hour === 10,
  call && { type: call.type, hour: call.entities && call.entities.hour });

const fyi = classify('לידיעתך, פגישת צוות ביום רביעי בשעה 15:00. אין צורך בפעולה.');
check('an FYI team meeting stays quiet', fyi && !fyi.type && Boolean(fyi.quiet), fyi);

const refused = classify('לא נוכל לקיים את פגישת הצוות ביום שני בשעה 15:00.');
check('a refused team meeting stays silent', !refused || !refused.type, refused && refused.type);

const deadline = classify('תשלח לי את החוזה לפני פגישת הצוות מחר.');
check('a meeting noun used only as a deadline stays a request',
  deadline && deadline.type === FlowIntent.TYPES.REQUEST, deadline && deadline.type);

const summary = classify('פגישת הסיכום מתוכננת ליום שישי בשעה 10:00.');
check('פגישת הסיכום is the summary, not a meeting to schedule', !summary || !summary.type, summary && summary.type);

const thanks = classify('תודה על פגישת הצוות ביום שני בשעה 14:00, היה מצוין.');
check('thanks for the team meeting is a recap, not a new event', !thanks || thanks.type !== FlowIntent.TYPES.SCHEDULED_EVENT, thanks && thanks.type);

const promise = classify('תודה על השיחה. נעביר את החשבונית עד יום חמישי.');
check('a thanks-plus-delivery stays off the calendar', !promise || promise.type !== FlowIntent.TYPES.SCHEDULED_EVENT, promise && promise.type);

const recording = classify('Could you send me the call recording by Friday?');
check('an English meeting-artifact request stays a request',
  recording && recording.type === FlowIntent.TYPES.REQUEST, recording && recording.type);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
