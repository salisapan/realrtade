// Shlomo's six release conditions for WhatsApp Web. Each condition is asserted here.
// Run: node test/whatsapp-legal-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const { FlowWhatsAppWebGate } = require('../core/whatsapp-web-gate.js');
const draftSrc = src('src/content-whatsapp-draft.js');
const followSrc = src('src/content-whatsapp.js');
const onDemandSrc = src('src/chat-on-demand.js');
const consentSrc = src('lane-chat/meta-consent.js');
const enableHtml = src('lane-chat/enable.html');
const manifest = JSON.parse(src('manifest.json'));
const backgroundSrc = src('src/background.js');
const labsSrc = src('core/labs-switches.js');

const onRemote = { off: {}, fetchedAt: 1, neverFetched: false, valid: true };
const killedRemote = { off: { whatsapp: true }, fetchedAt: 1, neverFetched: false, valid: true };

check('1 flag default is off', FlowWhatsAppWebGate.flagOn(undefined) === false && FlowWhatsAppWebGate.flagOn(false) === false && FlowWhatsAppWebGate.allowed({}).reason === 'flag-off');
check('1 read without a gesture is refused', FlowWhatsAppWebGate.readAllowed({ flag: true, consent: true }, {}).reason === 'no-gesture');
check('1 follow lane has no MutationObserver', !/MutationObserver/.test(followSrc));
check('1 draft lane has no MutationObserver', !/MutationObserver/.test(draftSrc));
check('1 no prefetch and no scrolling', !/scrollIntoView|scrollTo|prefetch|pane-side/.test(draftSrc + followSrc + onDemandSrc));

check('2 draft lane never clicks Send', !/\.click\(/.test(draftSrc) && !/data-testid=["']send["']/.test(draftSrc));
check('2 on-demand path never clicks Send', !/\.click\(/.test(onDemandSrc));
check('2 no WhatsApp send API', !/Store\.|WAWeb|webpackChunk|sendTextMessage/.test(draftSrc + followSrc + onDemandSrc));

check('3 a draft is typed only from the gesture scan', /function scan\(opts\)/.test(draftSrc) && /maybeDraft\(main, list\)/.test(draftSrc));
check('3 the composer is taken from the open chat', /function composerBox\(main\)/.test(draftSrc) && /function chatPane\(\)/.test(draftSrc));

const disclosure = consentSrc + '\n' + enableHtml;
check('4 consent names other people\'s messages', /other people|אנשים אחרים/.test(disclosure));
check('4 consent names AI providers', /AI providers|ספקי AI/.test(disclosure));
check('4 consent names retention', /session/.test(disclosure) && /deleted|נמחק/.test(disclosure));
check('4 consent says no training', /not used to train|לא משמש לאימון/.test(disclosure));
check('4 consent says not WhatsApp-approved and names account risk', /not approved by WhatsApp|אינו מאושר על ידי WhatsApp/.test(disclosure) && /account at risk|לסכן את חשבון/.test(disclosure));
check('4 consent says the user is the only one who sends', /only one who sends|רק אתה שולח/.test(disclosure));
check('4 withdraw clears the read consent', /clearReadConsent\(/.test(consentSrc) && /glanceWhatsAppWebRead/.test(consentSrc) && /glanceWhatsAppWebConsent/.test(consentSrc));

check('5 visible DOM only, no internal WhatsApp modules', !/Store|WAWeb|webpackChunk|importScripts\(|chrome\.debugger/.test(draftSrc + followSrc));

check('6 per-user kill blocks', FlowWhatsAppWebGate.allowed({ flag: true, consent: true, userOff: true, remote: onRemote }).reason === 'user-off');
check('6 global kill blocks', FlowWhatsAppWebGate.allowed({ flag: true, consent: true, userOff: false, remote: killedRemote }).reason === 'remote-off');
check('6 never-fetched global kill blocks', FlowWhatsAppWebGate.allowed({ flag: true, consent: true, remote: { neverFetched: true, valid: false, off: {} } }).reason === 'remote-off');
check('6 an allowed read needs flag, consent, and both kills open', FlowWhatsAppWebGate.allowed({ flag: true, consent: true, userOff: false, remote: onRemote }).ok === true);

const hosts = manifest.host_permissions || [];
const contentScripts = JSON.stringify(manifest.content_scripts || []);
check('v1 host_permissions lists no WhatsApp host', hosts.every((h) => !/whatsapp|wa\.me/i.test(h)));
check('v1 content_scripts list no WhatsApp host', !/whatsapp|wa\.me/i.test(contentScripts));
check('service worker does not turn the read flag on', !/glanceWhatsAppWebRead['"]?\s*:\s*true/.test(backgroundSrc));
check('labs switches are not turned on in this gate', !/META_CHAT_LANES['"]?\s*:\s*true/.test(labsSrc) && /id: 'META_CHAT_LANES'/.test(labsSrc));

const dom = new (require('jsdom').JSDOM)('<div id="app"><div id="main" data-glance-chat="direct"><header><span title="Dana">Dana</span></header><div data-id="false_972501234567@c.us_AAA"><span class="selectable-text">please send the file by Friday</span></div><footer><div data-glance-composer="1" contenteditable="true"></div></footer></div></div>', {
  url: 'https://web.whatsapp.com/',
  runScripts: 'outside-only'
});
const w = dom.window;
w.FlowWhatsAppParse = {
  parseDataId() { return { fromMe: false }; },
  isOneToOne() { return true; },
  joinText(pieces) { return pieces.map((p) => p.text).join(' '); },
  partyFromChat() { return { name: 'Dana', phone: '972501234567' }; },
  threadIdFor() { return 'wa-thread'; }
};
w.FlowChatLane = { draftInto() { return Promise.resolve({ ok: true, sends: false }); } };
w.FlowWhatsAppWebGate = FlowWhatsAppWebGate;
w.chrome = { runtime: { sendMessage() {}, lastError: null, id: 'x' } };
vm.runInContext(draftSrc, w, { filename: 'content-whatsapp-draft.js' });
let mainReads = 0;
const origGet = w.document.getElementById.bind(w.document);
w.document.getElementById = function (id) {
  if (id === 'main') mainReads += 1;
  return origGet(id);
};
const noGesture = w.__glanceChatSurfaces.whatsapp.scan({});
const flagOff = w.__glanceChatSurfaces.whatsapp.scan({ gesture: true });
w.__glanceWhatsAppWebRead = true;
const noConsent = w.__glanceChatSurfaces.whatsapp.scan({ gesture: true });
check('1 a loaded draft script does not read the open chat', mainReads === 0 && noGesture.reason === 'no-gesture' && flagOff.reason === 'flag-off');
check('4 no read before consent', noConsent.reason === 'no-consent' && mainReads === 0);
w.__glanceWhatsAppWebConsent = true;
Promise.resolve(w.__glanceChatSurfaces.whatsapp.scan({ gesture: true })).then((once) => {
  check('1 one gesture reads the open chat once', once.ok === true && once.sends === false && mainReads === 1);
  const consentDom = new (require('jsdom').JSDOM)('<div id="host"></div>', { runScripts: 'outside-only', url: 'chrome-extension://glance/popup/popup.html' });
  vm.runInContext(consentSrc, consentDom.window, { filename: 'meta-consent.js' });
  const removed = [];
  consentDom.window.FlowMetaConsent.paintConnection(consentDom.window.document.getElementById('host'), {
    granted: true,
    lang: 'en',
    chrome: {
      permissions: { remove() { return Promise.resolve(true); } },
      storage: { local: { remove(keys) { removed.push([].concat(keys)); } } }
    }
  });
  const withdraw = consentDom.window.document.querySelector('button.ghost');
  check('4 settings shows Disconnect', withdraw && withdraw.textContent === 'Disconnect');
  withdraw.click();
  check('4 Disconnect withdraws the read consent', removed.length === 1 && removed[0].indexOf('glanceWhatsAppWebRead') >= 0 && removed[0].indexOf('glanceWhatsAppWebConsent') >= 0);
  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  process.exit(failures ? 1 : 0);
}).catch((err) => {
  console.log('FAIL: gesture scan', err && err.message);
  process.exit(1);
});
