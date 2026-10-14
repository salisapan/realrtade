// Turns on one chat host at a time. The browser asks, and the content scripts
// in the manifest inject only after that grant. This page does not send.
const LANES = [
  { id: 'whatsapp', title: 'WhatsApp', origins: ['https://web.whatsapp.com/*'] },
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
    ]
  },
  {
    id: 'instagram',
    title: 'Instagram',
    origins: [
      'https://www.instagram.com/direct',
      'https://www.instagram.com/direct/*',
      'https://instagram.com/direct',
      'https://instagram.com/direct/*'
    ]
  }
];

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
    mark(button, ok);
    say(ok ? (lane.title + ' is on. Open that chat again so a draft can appear.') : (lane.title + ' stays off.'));
  });
  item.append(name, button);
  list.append(item);
  granted(lane.origins).then((on) => mark(button, on));
}

LANES.forEach(row);
