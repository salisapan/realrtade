// The chip and the header follow the UI language. A partial lane failure
// is a warning, never Connected. Reconnect only after a successful Connect.
// Run: node test/lane-header-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const EXT = path.join(__dirname, '..');
const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
const start = gmail.indexOf('function glancePickLang');
const end = gmail.indexOf('(function flowGmailWatcher');
const reason = gmail.slice(gmail.indexOf('function reasonMessage'), gmail.indexOf('function arrayBufferToBase64'));
check('the chip does not render a stored reconnect label', reason.indexOf('response.reconnectLabel') < 0 && reason.indexOf('glanceUiCopy(\'reconnect\')') > 0);
check('a partial lane failure records googleLaneWarning', gmail.indexOf('googleLaneWarning') > 0 && gmail.indexOf('noteLaneOutcome') > 0);

function load(lang) {
  const sandbox = {
    console,
    chrome: { i18n: { getUILanguage: () => lang } },
    navigator: { language: 'en' }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(gmail.slice(start, end), sandbox, { filename: 'glance-ui-copy.js' });
  return sandbox.glanceUiCopy;
}

const en = load('en');
const he = load('he');
check('English UI reconnect is Reconnect Google', en('reconnect') === 'Reconnect Google' && en('calendar').indexOf('file') < 0 && en('calendar') === 'No single time for this event.');
check('Hebrew UI reconnect and calendar refusal are Hebrew', he('reconnect') === 'התחבר מחדש ל-Google' && he('calendar') === 'אין מועד אחד לאירוע הזה.' && he('edited').indexOf('שינית') === 0, { reconnect: he('reconnect'), calendar: he('calendar'), edited: he('edited') });

const web = fs.readFileSync(path.join(EXT, 'src', 'google-web-auth.js'), 'utf8').replace(/^export /gm, '');
const box = { console, URL, URLSearchParams };
box.globalThis = box;
vm.createContext(box);
vm.runInContext(web, box, { filename: 'google-web-auth.js' });
const state = box.googleConnectionState;
const warned = state({ taskListId: 'L' }, null, { lang: 'en', warning: { needed: true } });
const bare = state(null, { needed: true }, { lang: 'en' });
const again = state(null, { needed: true }, { lang: 'en', everConnected: { connected: true } });
check('a warning header is not Connected', warned.connected === false && warned.headerLabel === 'A step did not finish');
check('never connected shows Connect', bare.connected === false && bare.needsReconnect === false && bare.headerLabel === 'Connect Google', bare);
check('a previous Connect shows Reconnect', again.needsReconnect === true && again.headerLabel === 'Reconnect Google', again);

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall passed');
