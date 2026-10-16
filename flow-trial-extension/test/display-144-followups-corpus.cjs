// David's follow-ups on #144. The Hold card names the weekday and the clock
// in its own text. Card chrome follows the host UI language through one
// helper. The Activity tab uses that same helper, so the tab is one language.
// Run: node test/display-144-followups-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS', name);
  else { failures += 1; console.error('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

const sandbox = { console: console, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'display-copy.js'), 'utf8'), sandbox, { filename: 'display-copy.js' });
const D = sandbox.FlowDisplay;

console.log('\n--- hold card text ---\n');
check('an English hold card says Hold Mon 10:00', D.holdCardText('en', '2026-10-19', 10, 0) === 'Hold Mon 10:00', D.holdCardText('en', '2026-10-19', 10, 0));
check('a Hebrew hold card says שריין and the weekday', D.holdCardText('he', '2026-10-19', 10, 0) === 'שריין ב׳ 10:00', D.holdCardText('he', '2026-10-19', 10, 0));
check('Sunday is Sun / א׳', D.holdCardText('en', '2026-10-18', 11, 0) === 'Hold Sun 11:00' && D.holdCardText('he', '2026-10-18', 11, 0) === 'שריין א׳ 11:00');
check('השהה stays the Hold It button, not the card line', D.chrome('he').hold === 'השהה' && D.chrome('he').holdAt === 'שריין' && D.chrome('en').hold === 'Hold It');
check('a hold with no clock is not a card line', D.holdCardText('en', '2026-10-19', null, null) === '' && D.holdCardText('he', '2026-10-19', 10, null) === '');
check('the Hebrew chip date stays the calendar day', D.holdWhenLine('2026-10-18', 11, 0) === '18 באוק׳ 11:00');
check('an English chip date is English', D.holdWhenLine('2026-10-18', 11, 0, 'en') === 'Oct 18 11:00', D.holdWhenLine('2026-10-18', 11, 0, 'en'));
check('an English deadline is English', D.cardDateLine('2026-10-23', 'en') === 'until Oct 23', D.cardDateLine('2026-10-23', 'en'));
check('a deadline with no language stays Hebrew', D.cardDateLine('2026-10-23') === 'עד 23 באוק׳');

const holdCtx = {
  glanceChain: 'calendar-hold',
  process: { id: 'hold', name: 'Hold It', steps: [{ kind: 'calendar', params: { dateIso: '2026-10-19', hour: 10, minute: 0 } }] },
  intent: { label: 'Hold the slot' }
};
check('the card title is the hold line, not only a chip', D.cardTitle('en', holdCtx, 'Hold It') === 'Hold Mon 10:00');
check('a Hebrew card title is the Hebrew hold line', D.cardTitle('he', holdCtx, 'Hold It') === 'שריין ב׳ 10:00');
check('a hold without a clock keeps the process name', D.cardTitle('en', { process: { id: 'hold', name: 'Hold It' } }, 'Hold It') === 'Hold It');
check('a reply card keeps its own title', D.cardTitle('en', { process: { id: 'reply-track', name: 'Reply & Track' } }, 'Reply & Track') === 'Reply & Track');

console.log('\n--- one locale helper ---\n');
check('the host page language wins over the browser', D.uiLangFrom({ hostLanguage: 'he-IL', uiLanguage: 'en-US', navigatorLanguage: 'en' }) === 'he');
check('a stored setting still wins over the host page', D.uiLangFrom({ setting: 'en', hostLanguage: 'he', uiLanguage: 'he', navigatorLanguage: 'he' }) === 'en');
check('iw on the host page is Hebrew', D.uiLangFrom({ hostLanguage: 'iw-IL', uiLanguage: 'en' }) === 'he');
check('a French host stays English', D.uiLangFrom({ hostLanguage: 'fr', uiLanguage: 'fr' }) === 'en');

const outlook = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
const host = fs.readFileSync(path.join(ROOT, 'src', 'chip-host.js'), 'utf8');
check('Outlook reads the host page language through the helper', outlook.indexOf('hostLanguage') >= 0 && outlook.indexOf('FlowDisplay.uiLangFrom') >= 0);
check('Gmail reads the host page language through the same helper', gmail.indexOf('hostLanguage') >= 0 && gmail.indexOf('FlowDisplay.uiLangFrom') >= 0);
check('Outlook and Gmail put the hold line in the card title', outlook.indexOf('FlowDisplay.cardTitle') >= 0 || host.indexOf('FlowDisplay.cardTitle') >= 0);
check('Gmail puts the hold line in the card title', gmail.indexOf('FlowDisplay.cardTitle') >= 0);

console.log('\n--- Activity is one language ---\n');
const quiet = 'Trusted closes 1 this week · Undo 0 · Silence this week 1 · family 1';
const heQuiet = D.activityMetric('he', quiet);
check('a Hebrew Activity line drops the English frame', heQuiet.indexOf('Trusted') < 0 && heQuiet.indexOf('Undo') < 0 && heQuiet.indexOf('Silence') < 0 && heQuiet.indexOf('family') < 0, heQuiet);
check('a Hebrew Activity line keeps the counts', /1/.test(heQuiet) && /0/.test(heQuiet) && /משפחה/.test(heQuiet), heQuiet);
check('an English Activity line stays the stored sentence', D.activityMetric('en', quiet) === quiet);
const close = 'Full closes 1 · Returns 1 · Turned down 1 · False-close 50%';
const heClose = D.activityMetric('he', close);
check('a Hebrew close line has no English frame', heClose.indexOf('Full') < 0 && heClose.indexOf('False-close') < 0 && /50%/.test(heClose), heClose);
check('a still-open line follows the helper', D.activityMetric('he', 'Still open — shown 2 · Do It 1 · undo 0 · false-close 0').indexOf('Do It') < 0);

const popupJs = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
check('Activity paints through the same helper', popupJs.indexOf('FlowDisplay.activityMetric') >= 0 && popupJs.indexOf('function uiLang()') >= 0);

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { JSDOM = null; }
if (!JSDOM) {
  check('jsdom is installed', false);
} else {
  function mount(lang, hostLang) {
    const dom = new JSDOM('<!doctype html><html lang="' + hostLang + '"><body><div id="mount"></div></body></html>', {
      url: 'https://outlook.live.com/mail/0/inbox',
      runScripts: 'outside-only'
    });
    const w = dom.window;
    ['core/display-copy.js', 'core/step-list.js', 'src/step-kit.js', 'src/step-list-view.js', 'src/chip-host.js'].forEach((rel) => {
      w.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    });
    const ctx = {
      uiLang: lang,
      app: 'outlook',
      glanceChain: 'calendar-hold',
      process: {
        id: 'hold',
        name: 'Hold It',
        closingLine: 'Putting this on your calendar.',
        steps: [{ kind: 'calendar', id: 'cal', label: 'calendar', params: { dateIso: '2026-10-19', hour: 10, minute: 0 } }]
      },
      intent: { label: 'Hold the slot', lang: 'en' }
    };
    w.FlowChipHost.inject(w.document.getElementById('mount'), ctx, {});
    return w.document.querySelector('.flow-chip-host');
  }
  const enCard = mount('en', 'en');
  const enTitle = enCard && enCard.querySelector('.gs-intent, .flow-chip-process-name');
  check('the English card text itself is Hold Mon 10:00', enTitle && enTitle.textContent === 'Hold Mon 10:00', enTitle && enTitle.textContent);
  const enWhen = enCard && enCard.querySelector('.flow-chip-when');
  check('the English chip is not the only place, and it is English', !enWhen || (enWhen.textContent.indexOf('10:00') >= 0 && enWhen.textContent.indexOf('באוק') < 0), enWhen && enWhen.textContent);
  check('an English card does not mix Hebrew chrome', enCard && !/בצע|הסתר|מוצע|השהה|שריין/.test(enCard.textContent), enCard && enCard.textContent);

  const heCard = mount('he', 'he');
  const heTitle = heCard && heCard.querySelector('.gs-intent, .flow-chip-process-name');
  const heHold = heCard && heCard.querySelector('.chip-hold');
  check('the Hebrew card text itself is שריין plus the time', heTitle && heTitle.textContent === 'שריין ב׳ 10:00', heTitle && heTitle.textContent);
  check('the Hebrew Hold It button stays השהה', heHold && heHold.textContent === 'השהה', heHold && heHold.textContent);
  const heText = heCard ? heCard.textContent : '';
  check('a Hebrew card does not mix English chrome', heCard && !/\bDo It\b/.test(heText) && !/\bDismiss\b/.test(heText) && !/\bSuggested\b/.test(heText) && !/\bHold It\b/.test(heText) && !/\bQueued\b/.test(heText), heText);
  const dismiss = heCard && heCard.querySelector('.chip-x');
  check('Hebrew chrome buttons are on the card', heCard && /בצע/.test(heText) && dismiss && dismiss.getAttribute('aria-label') === 'הסתר', dismiss && dismiss.getAttribute('aria-label'));
}

const { load } = require('./popup-open-corpus.cjs');
(async function activity() {
  const stored = {
    glanceUiLanguage: 'he',
    log: [{ ts: Date.now(), kind: 'written', label: 'Log the invoice', messageId: 'm1', where: 'Google Tasks', connectorId: 'googleTask' }],
    quietMetrics: null
  };
  const { sandbox: box, document } = load(stored);
  const Quiet = vm.runInContext('FlowQuietMetrics', box);
  const now = Date.now();
  let quietMetrics = Quiet.noteHandled(Quiet.emptyState(), { messageId: 'm1', ts: now });
  quietMetrics = Quiet.noteSilence(quietMetrics, { messageId: 's1', reason: 'family', ts: now });
  stored.quietMetrics = quietMetrics;
  const he = load(stored);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8'), he.sandbox, { filename: 'popup.js' });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  function find(node, cls, out) {
    out = out || [];
    if (String(node.className || '').split(/\s+/).includes(cls)) out.push(node);
    for (const c of node.children || []) find(c, cls, out);
    return out;
  }
  const kinds = find(he.document.getElementById('log-list'), 'log-kind').map((n) => n.textContent);
  check('a Hebrew Activity row says טופל', kinds.indexOf('טופל') >= 0 && kinds.indexOf('Handled') < 0, kinds);
  const week = he.document.getElementById('weekLabel').textContent;
  check('the Hebrew week line is Hebrew', week.indexOf('נרשמו') >= 0 && week.indexOf('logged') < 0, week);
  const quietNode = he.document.getElementById('quietMetrics').textContent;
  check('the Hebrew Activity metric is one language', quietNode.indexOf('Trusted') < 0 && quietNode.indexOf('Silence') < 0 && /משפחה/.test(quietNode), quietNode);
  const empty = he.document.getElementById('log-empty').textContent;
  check('the Hebrew empty line has no English frame', empty.indexOf('Nothing yet') < 0 && /עדיין/.test(empty), empty);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
