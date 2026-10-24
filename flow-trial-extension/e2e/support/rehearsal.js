// Shared pieces for the scenario rehearsal (docs/glance-ai/scenario-rehearsal.md).
// A step whose path does not exist yet is recorded as expected missing with its
// catalog row, and the test asserts the honest state today (nothing sent, no
// Handled). It never pretends the step ran.

// A one-to-one WhatsApp Web chat: the structure src/content-whatsapp-draft.js reads.
function whatsappHtml(text, opts) {
  const o = opts || {};
  const own = o.own === true;
  return '<!doctype html><html><body><div id="app"><div id="main" data-glance-chat="direct">' +
    '<header><span dir="auto" title="Dana">Dana</span></header>' +
    '<div data-id="' + (own ? 'true' : 'false') + '_972501234567@c.us_' + (o.id || 'AAA') + '"><span class="selectable-text">' + text + '</span></div>' +
    '<footer><div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Type a message"></div>' +
    '<button type="button" aria-label="Send" data-testid="send"></button></footer></div></div></body></html>';
}

// The production WhatsApp lane registration (the lane's own file list through the
// builder the service worker uses), as after the one Meta consent.
async function registerWhatsApp(glance) {
  return glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-whatsapp');
    const id = 'glance-lane-whatsapp-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://web.whatsapp.com/*'],
      js: globalThis.__glanceLaneChatScripts(lane),
      css: ['design/step-states-v1/scoped.css', 'src/chip.css'],
      runAt: 'document_idle'
    }]);
    return (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length === 1;
  });
}

// No Messenger registration: the state before the person turned that host on.
async function dropMessengerLanes(glance) {
  return glance.evaluateWorker(async () => {
    const all = await chrome.scripting.getRegisteredContentScripts();
    const ids = all.map((s) => s.id).filter((id) => id.indexOf('messenger') >= 0);
    if (ids.length) await chrome.scripting.unregisterContentScripts({ ids: ids });
    return (await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.indexOf('messenger') >= 0).length;
  });
}

function expectedMissing(testInfo, row, what) {
  testInfo.annotations.push({ type: 'expected-missing', description: row + ': ' + what });
}

// Any call that would send mail or a chat message on the person's behalf.
const SEND_URL = /\/sendMail\b|\/messages\/send\b|\/drafts\/send\b|\/send$/;

module.exports = { whatsappHtml, registerWhatsApp, dropMessengerLanes, expectedMissing, SEND_URL };
