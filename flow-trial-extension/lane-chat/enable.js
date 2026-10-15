// Turns on one chat host at a time. The browser asks for optional hosts.
// Nothing here is a static content script. After the grant, this page
// registers the reader. business.facebook.com is only an optional host.
// This page does not send.
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
    js: SCRIPTS.concat(['src/whatsapp-parse.js', 'src/content-whatsapp-draft.js'])
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
    js: SCRIPTS.concat(['src/messenger-parse.js', 'src/content-messenger.js'])
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
    js: SCRIPTS.concat(['src/instagram-parse.js', 'src/content-instagram.js'])
  }
];
globalThis.__glanceLaneChat = LANES;

const list = document.getElementById('lanes');
const note = document.getElementById('note');

function say(text) { if (note) note.textContent = text; }

function mark(button, on) {
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.textContent = on ? 'On' : 'Turn on';
}

async function granted(origins) {
  if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.contains) return false;
  try { return await chrome.permissions.contains({ origins: origins }); }
  catch (e) { return false; }
}

async function register(lane) {
  const scripting = typeof chrome !== 'undefined' && chrome.scripting;
  if (!scripting || !scripting.registerContentScripts) return;
  const id = 'glance-lane-' + lane.id;
  try { if (scripting.unregisterContentScripts) await scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* not registered yet */ }
  await scripting.registerContentScripts([{
    id: id,
    matches: lane.origins,
    js: lane.js,
    runAt: 'document_idle',
    persistAcrossSessions: true
  }]);
}

function row(lane) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = lane.title;
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', async () => {
    if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.request) { say('This page cannot ask for that here.'); return; }
    let ok = false;
    try { ok = await chrome.permissions.request({ origins: lane.origins }); }
    catch (e) { ok = false; }
    if (ok) { try { await register(lane); } catch (e) { ok = false; } }
    mark(button, ok);
    say(ok ? (lane.title + ' is on. Open that chat again so a draft can appear.') : (lane.title + ' stays off.'));
  });
  item.append(name, button);
  list.append(item);
  granted(lane.origins).then((on) => {
    mark(button, on);
    if (on) {
      register(lane).catch(() => {
        mark(button, false);
        say(lane.title + ' is allowed, but the reader did not start. Open this page again.');
      });
      return;
    }
    if (lane.id === 'messenger') say('Messenger is off, so Business Suite stays quiet. Turn Messenger on.');
  });
}

LANES.forEach(row);
