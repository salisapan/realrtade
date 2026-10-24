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
  'glance', 'outlook', 'gmail', 'microsoft', 'pro', 'onedrive', 'teams', 'google', 'drive', 'todo',
  'meta', 'slack', 'telegram', 'planner'
]);
const BRAND_PHRASES = ['glance pro', 'telegram web', 'google', 'meta', 'slack'];

function latinWords(text) {
  return String(text || '').match(/[A-Za-z][A-Za-z'’]{3,}/g) || [];
}

function offenders(text) {
  let raw = String(text || '');
  BRAND_PHRASES.forEach((phrase) => {
    raw = raw.replace(new RegExp(phrase.replace(/ /g, '\\s+'), 'ig'), ' ');
  });
  return latinWords(raw).filter((word) => !ALLOW.has(word.toLowerCase().replace(/[’']/g, '')));
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
check('Hebrew reconnect is חבר מחדש את Google', popupJs.indexOf('חבר מחדש את Google') >= 0 && popupJs.indexOf('התחבר מחדש ל-Google') < 0);
check('Connections dedupes providers before paint', popupJs.indexOf('connectionProviders(') >= 0);
check('a Hebrew connect click does not hard-code Connecting', popupJs.indexOf("setBtnLabel(btn, 'Connecting…')") < 0 && popupJs.indexOf("googleChromeLabel('busy')") >= 0);
check('a connected sign-in can add a scope without turning off', popupJs.indexOf('flow:outlook-consent-scope') >= 0 && popupJs.indexOf('הוסף הרשאה') >= 0);

const page = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('a missing Tasks scope paints the consent card, not a write', page.indexOf('function paintTodoScopeCard') >= 0 && page.indexOf('taskOnlyProcess(ctx.process) && todoAsk') >= 0);
check('paintIfCurrent clears the why line', /function paintIfCurrent\(token, fn\) \{[\s\S]*?clearWhyNot\(mountPoint\(\)\)/.test(page));
check('a mail switch clears the current why', page.indexOf('glanceWhyCurrent: null') >= 0);
check('consent buttons stay אפשר פעם אחת / אפשר תמיד / לא עכשיו', page.indexOf("['אפשר פעם אחת', 'once']") >= 0 && page.indexOf('אין הרשאת To Do') >= 0);
const kit = fs.readFileSync(path.join(ROOT, 'src', 'step-kit.js'), 'utf8');
check('the step kit takes its button from the UI-language table', kit.indexOf('FlowDisplay.chrome') >= 0 && kit.indexOf('doItHTML(L.doIt') >= 0);

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

check('a stored UI language wins over the browser', D.uiLangFrom({ setting: 'he', uiLanguage: 'en-US', navigatorLanguage: 'en' }) === 'he');
check('a stored UI language wins over the page', D.uiLangFrom({ setting: 'en', hostLanguage: 'he', uiLanguage: 'he' }) === 'en');
check('the page language wins over the browser UI', D.uiLangFrom({ setting: '', hostLanguage: 'he', uiLanguage: 'en-US', navigatorLanguage: 'en' }) === 'he');
check('the browser UI language wins over navigator', D.uiLangFrom({ setting: '', uiLanguage: 'he-IL', navigatorLanguage: 'en' }) === 'he');
check('a Hebrew meeting is titled פגישה', D.cardFace({ id: 'hold', name: 'Hold It' }, { label: 'Hold It' }, { bodyText: 'פגישת סנכרון ביום חמישי ב-11:00' }).title === 'פגישה');
check('an English meeting is titled Meeting', D.cardFace({ id: 'hold', name: 'Hold It' }, { label: 'Hold It' }, { bodyText: 'Sync on Thursday at 11:00' }).title === 'Meeting');
check('an invite file card uses its title', D.cardFace({ id: 'attach-invite', name: 'Attach it' }, { inviteFile: true, label: 'לצרף קובץ לזימון' }, {}).title === 'לצרף קובץ לזימון');
check('navigator.language is the last source', D.uiLangFrom({ setting: null, uiLanguage: '', navigatorLanguage: 'iw' }) === 'he');
check('an empty locale stays English', D.uiLangFrom({}) === 'en' && D.uiLangFrom({ navigatorLanguage: 'fr' }) === 'en');
const heChrome = D.chrome('he');
const heBad = [];
Object.keys(heChrome).forEach((key) => {
  const bad = offenders(String(heChrome[key]).replace(/\{(\w+)\}/g, ' '));
  if (bad.length) heBad.push(key + ':' + bad.join(','));
});
check('Hebrew chrome has no English besides brand names', heBad.length === 0, heBad);
check('a Hebrew UI day is 17 באוק׳', D.localeDay('2026-10-17', 'he') === '17 באוק׳', D.localeDay('2026-10-17', 'he'));
check('an English UI day is Oct 17', D.localeDay('2026-10-17', 'en') === 'Oct 17', D.localeDay('2026-10-17', 'en'));
const ariaDiag = D.namesDiagFrom([], 'Sali Sapan');
check('an aria name is labelled aria-label', D.namesDiagLine(ariaDiag) === 'Names: Sali Sapan, source: aria-label', D.namesDiagLine(ariaDiag));
check('a profile name wins over the aria label', D.namesDiagLine(D.namesDiagFrom(['Sali Sapan'], 'Other')) === 'Names: Sali Sapan, source: profile');
check('no name is source none', D.namesDiagLine(D.namesDiagFrom(['Glance', 'me'], '')) === 'Names: —, source: none');
check('Hebrew chrome names the card buttons', heChrome.doIt === 'בצע' && heChrome.dismiss === 'הסתר' && heChrome.suggested === 'מוצע' && heChrome.added === 'נוסף' && heChrome.view === 'הצג' && heChrome.undo === 'בטל');
check('English chrome keeps the English buttons', D.chrome('en').doIt === 'Do It' && D.chrome('en').dismiss === 'Dismiss' && D.chrome('en').suggested === 'Suggested');

vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'step-kit.js'), 'utf8'), sandbox, { filename: 'step-kit.js' });
const card = sandbox.FlowStepKit.stageHTML({
  uiLang: 'he',
  intent: 'Confirm the transfer',
  state: 'propose',
  rows: [
    { id: '1', kind: 'suggested', suggested: true, text: 'Confirm the transfer', tag: 'מוצע', app: 'Outlook', tool: 'outlook', checked: true, out: 'בתור' },
    { id: '2', kind: 'multi', suggested: true, files: [{ n: 'a.pdf', on: true }, { n: 'b.pdf', on: true }, { n: 'c.pdf', on: false }, { n: 'd.pdf', on: true }], expanded: true, app: 'OneDrive', tool: 'onedrive', tag: 'מוצע' }
  ]
});
const cardText = String(card).replace(/Confirm the transfer/g, ' ').replace(/<[^>]+>/g, ' ');
check('a Hebrew card paints no English chrome', offenders(cardText).length === 0, offenders(cardText));
const tagged = sandbox.FlowStepKit.stageHTML({
  uiLang: 'he',
  he: true,
  intent: 'Reply and Track',
  state: 'propose',
  rows: [
    { id: '1', text: 'Draft reply', tag: 'Suggested', app: 'Outlook', tool: 'outlook', checked: true, out: 'בתור' }
  ]
});
const taggedText = String(tagged).replace(/Reply and Track/g, ' ').replace(/Draft reply/g, ' ').replace(/<[^>]+>/g, ' ');
check('a step tagged Suggested follows the UI language', /מוצע/.test(tagged) && offenders(taggedText).length === 0, offenders(taggedText));
const added = sandbox.FlowStepKit.stageHTML({
  uiLang: 'he', he: true, intent: 'Reply and Track', state: 'propose',
  rows: [
    { id: '1', text: 'Draft reply', tag: 'Added', added: true, app: 'Outlook', tool: 'outlook', checked: true, out: 'בתור' },
    { id: '2', kind: 'manual', text: 'Call the client', tag: 'Manual', app: 'You', tool: 'manual' },
    { id: '3', kind: 'close', text: 'Saved', tag: 'after Approve', st: '' }
  ]
});
const addedText = String(added).replace(/Reply and Track/g, ' ').replace(/Draft reply/g, ' ').replace(/Call the client/g, ' ').replace(/Saved/g, ' ').replace(/<[^>]+>/g, ' ');
check('Added, Manual, and after Approve follow the UI language', /נוסף/.test(added) && /ידני/.test(added) && offenders(addedText).length === 0, offenders(addedText));
const phrases = Object.keys(D.chrome('en')).map((key) => D.chrome('en')[key]).filter((line) => typeof line === 'string' && line.indexOf('{') < 0);
phrases.push('Deleted in To Do');
const shown = phrases.map((line) => D.showChrome('he', line)).join('\n');
check('a Hebrew receipt and panel show no English chrome', offenders(shown).length === 0 && /טופל/.test(shown) && /נמחק ב-To Do/.test(shown) && /לא אומת/.test(shown) && /מוצע/.test(shown) && /הסתר/.test(shown) && /בצע/.test(shown) && /בטל/.test(shown), offenders(shown));
check('English UI keeps the English receipt chrome', D.showChrome('en', 'Handled.') === 'Handled.' && D.showChrome('en', "Couldn't confirm") === "Couldn't confirm" && D.showChrome('en', 'Deleted in To Do') === 'Deleted in To Do' && D.showChrome('en', 'Do It') === 'Do It' && D.showChrome('en', 'Suggested') === 'Suggested');
check('Hebrew chrome shown on an English UI stays the English sentence', D.showChrome('en', 'טופל.') === 'Handled.' && D.showChrome('en', 'בצע') === 'Do It' && D.showChrome('en', 'נמחק ב-To Do') === 'Deleted in To Do');
check('a mail-language title is not chrome', D.showChrome('he', 'Confirm the transfer') === 'Confirm the transfer');
check('the popup asks the shared table for Loops chrome', popupJs.indexOf('function words()') >= 0 && popupJs.indexOf('Lw.suggested') >= 0 && popupJs.indexOf('L.dismiss') >= 0 && popupJs.indexOf('L.doIt') >= 0);
check('the mail page sets card chrome from the UI language', page.indexOf('ctx.uiLang = pageUiLang()') >= 0 && page.indexOf('pageChrome().undo') >= 0 && page.indexOf('pageChrome().handled') >= 0 && page.indexOf('pageShow(') >= 0 && page.indexOf('pageChrome().couldntPlain') >= 0 && page.indexOf('pageChrome().verifyingNow') >= 0);
check('the popup shows a deleted To Do in the UI language', popupJs.indexOf('showWords(entry.deletedLine') >= 0 && popupJs.indexOf('function showWords(') >= 0);
const host = fs.readFileSync(path.join(ROOT, 'src', 'chip-host.js'), 'utf8');
check('a receipt status goes through the UI-language table', host.indexOf('FlowDisplay.showChrome') >= 0);

console.log('\n--- receipt and status lines the Hebrew UI shows ---\n');
const statusLines = [
  'Nothing was written.',
  'Not closed — the task was not confirmed.',
  'Not closed — Glance could not read that task back.',
  'That action isn’t wired up yet.',
  'Couldn’t complete that action.',
  'Open Reply first. Glance does not press Send.',
  'The compose window is still empty.',
  'Closed — saved the file.',
  'Closed — scheduled and set a reminder.',
  'Closed — scheduled, drafted a reply, and set a reminder.',
  'Closed — wrote the doc and wrote the sheet.',
  'Closed — completed one step.',
  'Microsoft To Do can keep that task on screen for about two minutes. A reload shows it gone.',
  'Undo all removes the Gmail draft and the Calendar event.',
  'Undo all removes the Google Task, the Gmail draft, and the Calendar event.',
  'Undone — the Gmail draft and the Calendar event were removed.',
  'Undone — the Google Task, the Gmail draft, and the Calendar event were removed.',
  'The Gmail draft is still there. Undo again to remove it.',
  'Not all of it is gone. Undo again to remove what’s left.',
  'Skipped — an earlier step in this process didn’t complete.'
];
const closedLines = [];
['core/actions.js', 'core/incoming-judge.js', 'src/content-gmail.js'].forEach((file) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /closedLine:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) closedLines.push(m[1].replace(/\\'/g, "'"));
});
check('the catalog closed lines were found', closedLines.length >= 15, closedLines.length);
const closedBad = [];
closedLines.concat(statusLines).forEach((line) => {
  const he = D.showChrome('he', line);
  const bad = offenders(he);
  if (he === line || bad.length) closedBad.push(line + ' => ' + he);
  const back = D.showChrome('en', he);
  if (D.showChrome('en', line) !== line) closedBad.push('en changed: ' + line);
});
check('every closed line and status line is Hebrew in a Hebrew UI', closedBad.length === 0, closedBad);
check('Nothing was written. reads שום דבר לא נכתב.', D.showChrome('he', 'Nothing was written.') === 'שום דבר לא נכתב.', D.showChrome('he', 'Nothing was written.'));
check('Closed — saved the file. keeps the close and names the file', /^נסגר — /.test(D.showChrome('he', 'Closed — saved the file.')) && /הקובץ/.test(D.showChrome('he', 'Closed — saved the file.')), D.showChrome('he', 'Closed — saved the file.'));
const receiptSb = { console };
vm.createContext(receiptSb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'receipt-copy.js'), 'utf8'), receiptSb, { filename: 'receipt-copy.js' });
const R = vm.runInContext('FlowReceipt', receiptSb);
const wheresAll = ['Google Tasks', 'Microsoft To Do', 'Gmail', 'Google Calendar', 'Google Docs', 'Google Sheets', 'Google Drive'];
const receiptBad = [];
wheresAll.forEach((a, i) => {
  const combos = [[a], [a, wheresAll[(i + 1) % wheresAll.length]], [a, wheresAll[(i + 1) % wheresAll.length], wheresAll[(i + 2) % wheresAll.length]]];
  combos.forEach((w) => {
    [R.undoHint(w), R.undoneLine(w), R.reverseNote({ reversed: 0, remaining: 1, keptWhere: a }), R.reverseNote({ reversed: 1, remaining: 1, keptWhere: a })].forEach((line) => {
      const he = D.showChrome('he', line);
      if (he === line || offenders(he).length) receiptBad.push(line + ' => ' + he);
    });
  });
});
check('every undo and reverse line built from receipt-copy is Hebrew in a Hebrew UI', receiptBad.length === 0, receiptBad);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
