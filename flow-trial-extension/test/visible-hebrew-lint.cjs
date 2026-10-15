// Visible UI is Hebrew. Brand names stay. A Latin word in the popup shell,
// a card date, a consent label, or the why line fails this lint.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS', name);
  else { failures += 1; console.error('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

const ALLOW = new Set([
  'glance', 'outlook', 'gmail', 'microsoft', 'pro', 'onedrive', 'teams', 'google', 'drive', 'todo'
]);

function latinWords(text) {
  return String(text || '').match(/[A-Za-z][A-Za-z'’]{3,}/g) || [];
}

function offenders(text) {
  return latinWords(text).filter((word) => !ALLOW.has(word.toLowerCase().replace(/[’']/g, '')));
}

const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const visible = body
  .replace(/<[^>]+>/g, ' ')
  .replace(/placeholder="GLNC[^"]*"/g, ' ');
const htmlBad = offenders(visible);
check('popup.html visible text is Hebrew aside from brand names', htmlBad.length === 0, htmlBad);

const popupJs = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
const banned = ['Connect Microsoft', 'Not connected', 'Open event', 'Mail, To Do & Calendar', "el('button', 'ghost sm', 'Turn off')", "el('button', 'ghost sm', 'Check now')", "el('button', 'ghost sm', 'Reconnect')"];
banned.forEach((phrase) => {
  check('popup.js does not paint ' + phrase, popupJs.indexOf(phrase) < 0);
});
check('the calendar row is שמירת זמן ביומן', popupJs.indexOf("svc.id === 'calendar') return 'שמירת זמן ביומן'") >= 0);
check('a connected sign-in can add a scope without turning off', popupJs.indexOf('flow:outlook-consent-scope') >= 0 && popupJs.indexOf('הוסף הרשאה') >= 0);

const page = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('a missing Tasks scope paints the consent card, not a write', page.indexOf('function paintTodoScopeCard') >= 0 && page.indexOf('taskOnlyProcess(ctx.process) && todoAsk') >= 0);
check('paintIfCurrent clears the why line', /function paintIfCurrent\(token, fn\) \{[\s\S]*?clearWhyNot\(mountPoint\(\)\)/.test(page));
check('a mail switch clears the current why', page.indexOf('glanceWhyCurrent: null') >= 0);
check('consent buttons stay אפשר פעם אחת / אפשר תמיד / לא עכשיו', page.indexOf("['אפשר פעם אחת', 'once']") >= 0 && page.indexOf('אין הרשאת To Do') >= 0);
const kit = fs.readFileSync(path.join(ROOT, 'src', 'step-kit.js'), 'utf8');
check('the step-kit button is בצע', kit.indexOf('aria-label="בצע"') >= 0 && kit.indexOf('aria-label="Do It"') < 0 && kit.indexOf('[Do It]') < 0);

const sandbox = { console: console, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'display-copy.js'), 'utf8'), sandbox, { filename: 'display-copy.js' });
const D = sandbox.FlowDisplay;
check('a deadline date is עד 23 באוק׳', D.cardDateLine('2026-10-23') === 'עד 23 באוק׳', D.cardDateLine('2026-10-23'));
check('a hold line has the day and the clock', D.holdWhenLine('2026-10-18', 11, 0) === '18 באוק׳ 11:00', D.holdWhenLine('2026-10-18', 11, 0));
check('a hold with no time is not a line', D.holdWhenLine('2026-10-18', null, null) === '' && D.holdWhenLine('2026-10-18', 11, null) === '');
['intent-null', 'tasks-not-granted', 'not-connected', 'calendar-write-not-granted'].forEach((reason) => {
  const line = D.whyNotShownLine(reason);
  check('why line for ' + reason + ' has no English', offenders(line).length === 0, line);
});

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
