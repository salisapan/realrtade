// Service worker. Phase 1 has almost nothing to do here — no live model call,
// no connector OAuth yet — but this is where both land later: the content
// script will message this worker to run the expensive judgment stage
// (background.js can hold a fetch() to the Anthropic-backed endpoint that a
// content script's CSP would block) and to make the actual authenticated
// write against whichever connector the user picked.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
});

// Placeholder message channel — the shape future stages will use.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flow:execute-action') {
    // Real implementation: authenticated request to the chosen connector.
    console.warn('[Flow Trial] execute-action is not wired to a live connector yet:', msg.payload);
    sendResponse({ ok: false, reason: 'connector-not-live' });
    return true;
  }
});
