// MV3 sandbox page: remote gapi is allowed here, not on extension_pages.
// picker.html (extension page) passes the OAuth token via postMessage.

function parentOrigin() {
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch (e) { /* fall through */ }
  return '*';
}

function postToParent(msg) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(msg, parentOrigin());
  }
}

function openPicker(cfg) {
  const view = new google.picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);
  const builder = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(cfg.token)
    .setDeveloperKey(cfg.apiKey);
  if (cfg.appId) builder.setAppId(cfg.appId);
  builder
    .setCallback((data) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs[0];
        postToParent({
          type: 'glance-picker-result',
          requestId: cfg.requestId,
          file: { id: doc.id, name: doc.name, mimeType: doc.mimeType },
          cancelled: false
        });
      } else if (data.action === google.picker.Action.CANCEL) {
        postToParent({ type: 'glance-picker-result', requestId: cfg.requestId, file: null, cancelled: true });
      }
    })
    .build()
    .setVisible(true);
}

function start(cfg) {
  if (!cfg || !cfg.token || !cfg.apiKey || !cfg.requestId) {
    postToParent({ type: 'glance-picker-error', requestId: cfg && cfg.requestId, error: 'Missing picker configuration.' });
    return;
  }
  const run = () => gapi.load('picker', () => openPicker(cfg));
  if (typeof gapi !== 'undefined' && gapi.load) run();
  else postToParent({ type: 'glance-picker-error', requestId: cfg.requestId, error: 'Could not load Google picker.' });
}

window.addEventListener('message', (ev) => {
  const data = ev.data;
  if (!data || data.type !== 'glance-picker-init') return;
  start(data);
});
