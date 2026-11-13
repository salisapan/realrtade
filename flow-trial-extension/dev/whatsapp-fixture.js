// Dev stand-in only. This file is an extension page script, so the page CSP allows it.
// It does not run on web.whatsapp.com and it does not read a chat until the gesture asks.
window.__glanceChatSurfaces = window.__glanceChatSurfaces || {};
window.__glanceChatSurfaces.whatsapp = {
  scan: function () {
    window.__glanceChatDomReads = (window.__glanceChatDomReads || 0) + 1;
    // The count is also on the DOM so the headless spec can see it. An extension
    // page's script variables are not the world Playwright evaluates in.
    document.documentElement.setAttribute('data-glance-reads', String(window.__glanceChatDomReads));
    return { ok: true, reason: 'fixture-scan' };
  }
};

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect) {
  const port = chrome.runtime.connect({ name: 'glance-fixture-scan' });
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'flow:fixture-scan') return;
    const row = window.__glanceChatSurfaces && window.__glanceChatSurfaces.whatsapp;
    port.postMessage(row && typeof row.scan === 'function' ? row.scan({ gesture: true }) : { ok: false, reason: 'no-scan' });
  });
}
