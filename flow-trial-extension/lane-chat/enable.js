// One consent for Meta chats. The browser asks once, for every Meta host.
// Nothing here is a static content script. After the grant, every lane is on.
// There is no per-feature switch to turn one of them off.
// business.facebook.com stays an optional host. This page does not send.
const SCRIPTS = [
  'core/fact-reply.js',
  'core/close-chains.js',
  'src/chat-draft.js',
  'src/chat-compose.js',
  'src/chat-lane.js'
];
const LANES = [
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    origins: ['https://web.whatsapp.com/*'],
    js: SCRIPTS.concat(['src/whatsapp-parse.js', 'src/content-whatsapp.js', 'src/content-whatsapp-draft.js'])
  },
  {
    id: 'messenger',
    title: 'Messenger',
    origins: [
      'https://www.messenger.com/*',
      'https://messenger.com/*',
      'https://www.facebook.com/messages',
      'https://www.facebook.com/messages/*',
      'https://facebook.com/messages',
      'https://facebook.com/messages/*',
      'https://business.facebook.com/latest/inbox',
      'https://business.facebook.com/latest/inbox/*',
      'https://www.business.facebook.com/latest/inbox',
      'https://www.business.facebook.com/latest/inbox/*'
    ],
    js: SCRIPTS.concat(['src/lane-draft-store.js', 'src/group-word.js', 'src/messenger-parse.js', 'src/content-messenger.js'])
  },
  {
    id: 'instagram',
    title: 'Instagram',
    origins: [
      'https://www.instagram.com/direct',
      'https://www.instagram.com/direct/*',
      'https://instagram.com/direct',
      'https://instagram.com/direct/*'
    ],
    js: SCRIPTS.concat([
      'core/chat-kill-switch.js',
      'src/chat-redact.js',
      'src/chat-indicator.js',
      'src/lane-draft-store.js',
      'src/group-word.js',
      'src/instagram-parse.js',
      'src/content-instagram.js'
    ])
  }
];
globalThis.__glanceLaneChat = LANES;

const doc = document;
const list = doc.getElementById('lanes');
const note = doc.getElementById('note');

function say(text) { if (note) note.textContent = text; }

function showCopy(code) {
  const he = isHe(code);
  const blocks = doc.querySelectorAll('[data-lang]');
  blocks.forEach((node) => {
    node.hidden = (node.getAttribute('data-lang') === 'he') !== he;
  });
  try {
    doc.documentElement.lang = he ? 'he' : 'en';
    doc.documentElement.dir = he ? 'rtl' : 'ltr';
    doc.title = he ? 'טיוטה בצ׳אט' : 'A draft in the chat';
  } catch (e) { /* the words are still in the page */ }
}

function isHe(code) {
  const raw = String(code || '').toLowerCase();
  return raw.indexOf('he') === 0 || raw.indexOf('iw') === 0;
}

function buttonLabel(code) {
  if (typeof FlowMetaConsent !== 'undefined' && FlowMetaConsent && typeof FlowMetaConsent.label === 'function') return FlowMetaConsent.label(code);
  return 'Turn on Meta chats';
}

function metaOrigins() {
  if (typeof FlowMetaConsent !== 'undefined' && FlowMetaConsent && Array.isArray(FlowMetaConsent.ORIGINS) && FlowMetaConsent.ORIGINS.length) {
    return FlowMetaConsent.ORIGINS.slice();
  }
  const out = [];
  LANES.forEach((lane) => {
    lane.origins.forEach((origin) => { if (out.indexOf(origin) < 0) out.push(origin); });
  });
  return out;
}

function nowOn(code) {
  return isHe(code)
    ? 'צ׳אטים של Meta פועלים. פתח את הצ׳אט שוב כדי שטיוטה תוכל להופיע.'
    : 'Meta chats are on. Open the chat again so a draft can appear.';
}
function staysOff(code) {
  return isHe(code) ? 'צ׳אטים של Meta נשארים כבויים.' : 'Meta chats stay off.';
}
function readerFailed(code) {
  return isHe(code)
    ? 'צ׳אטים של Meta מותרים, אבל הקורא לא עלה. פתח את הדף שוב.'
    : 'Meta chats are allowed, but the reader did not start. Open this page again.';
}
function cannotAsk(code) {
  return isHe(code) ? 'הדף הזה לא יכול לבקש את זה מכאן.' : 'This page cannot ask for that here.';
}

async function preferredLang() {
  let setting = '';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
      const bag = await chrome.storage.local.get('glanceUiLanguage');
      setting = bag && bag.glanceUiLanguage ? String(bag.glanceUiLanguage) : '';
    }
  } catch (e) { setting = ''; }
  let ui = '';
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') ui = chrome.i18n.getUILanguage() || '';
  } catch (e) { ui = ''; }
  let nav = '';
  try { nav = (navigator && navigator.language) || ''; } catch (e) { nav = ''; }
  const panel = (doc.documentElement && doc.documentElement.lang) || '';
  if (typeof FlowDisplay !== 'undefined' && FlowDisplay && typeof FlowDisplay.uiLangFrom === 'function') {
    return FlowDisplay.uiLangFrom({ setting: setting || panel, uiLanguage: ui, navigatorLanguage: nav });
  }
  const raw = (setting || panel || ui || nav || 'en').toLowerCase();
  if (raw === 'he' || raw.indexOf('he-') === 0 || raw === 'iw' || raw.indexOf('iw-') === 0) return 'he';
  return 'en';
}

async function granted(origins) {
  if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.contains) return false;
  try { return await chrome.permissions.contains({ origins: origins }); }
  catch (e) { return false; }
}

async function registerAll() {
  const scripting = typeof chrome !== 'undefined' && chrome.scripting;
  if (!scripting || !scripting.registerContentScripts) return;
  const ids = LANES.map((lane) => 'glance-lane-' + lane.id);
  try { if (scripting.unregisterContentScripts) await scripting.unregisterContentScripts({ ids: ids }); } catch (e) { /* not registered yet */ }
  await scripting.registerContentScripts(LANES.map((lane) => ({
    id: 'glance-lane-' + lane.id,
    matches: lane.origins,
    js: lane.js,
    runAt: 'document_idle',
    persistAcrossSessions: true
  })));
}

function showButton(code) {
  if (!list) return;
  list.replaceChildren();
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.id = 'meta-turn-on';
  ['shell', 'ring', 'shine'].forEach((name) => {
    const span = doc.createElement('span');
    span.className = name;
    button.appendChild(span);
  });
  const label = doc.createElement('span');
  label.className = 'btn-label';
  label.textContent = buttonLabel(code);
  button.appendChild(label);
  button.addEventListener('click', () => { turnOn(code); });
  list.append(button);
  try {
    doc.documentElement.lang = isHe(code) ? 'he' : 'en';
    doc.documentElement.dir = isHe(code) ? 'rtl' : 'ltr';
  } catch (e) { /* the page still shows the label */ }
}

async function turnOn(code) {
  if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.request) { say(cannotAsk(code)); return; }
  let ok = false;
  try { ok = await chrome.permissions.request({ origins: metaOrigins() }); }
  catch (e) { ok = false; }
  if (!ok) { say(staysOff(code)); return; }
  try { await registerAll(); }
  catch (e) { say(readerFailed(code)); return; }
  if (list) list.replaceChildren();
  say(nowOn(code));
}

async function start() {
  const code = await preferredLang();
  showCopy(code);
  const on = await granted(metaOrigins());
  if (!on) { showButton(code); return; }
  try {
    await registerAll();
    if (list) list.replaceChildren();
    say(nowOn(code));
  } catch (e) {
    showButton(code);
    say(readerFailed(code));
  }
}

start();
