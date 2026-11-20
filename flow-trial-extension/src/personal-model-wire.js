// Sends header metadata to the extension origin. This file does not open
// IndexedDB and does not read a message body. It does not run on WhatsApp.
(function () {
  function emailOf(value) {
    var s = String(value || '').trim().toLowerCase();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
  }
  function nameOf(value) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  }
  function idOf(value) {
    var s = String(value || '').trim();
    if (!s || s.length > 128 || /@|\s|https?:/i.test(s)) return '';
    return s;
  }
  function people(list) {
    return (Array.isArray(list) ? list : []).slice(0, 20).map(function (p) {
      if (typeof p === 'string') return { email: emailOf(p), name: '' };
      return { email: emailOf(p && (p.email || p.address)), name: nameOf(p && (p.name || p.displayName)) };
    }).filter(function (p) { return p.email; });
  }
  function offer(input) {
    var src = input || {};
    var header = {
      surface: src.surface === 'outlook' ? 'outlook' : 'gmail',
      messageId: idOf(src.messageId),
      threadId: idOf(src.threadId),
      ts: Number.isFinite(src.ts) ? src.ts : Date.now(),
      from: { email: emailOf(src.from && src.from.email), name: nameOf(src.from && src.from.name) },
      to: people(src.to),
      cc: people(src.cc),
      isOwn: src.isOwn === true,
      ownEmail: emailOf(src.ownEmail),
      ownName: nameOf(src.ownName),
      contentLanguage: src.contentLanguage === 'he' || src.contentLanguage === 'en' ? src.contentLanguage : '',
      signatureRole: src.isOwn === true ? nameOf(src.signatureRole) : '',
      signatureOrg: src.isOwn === true ? nameOf(src.signatureOrg) : ''
    };
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'flow:personal-model-ingest', header: header });
      }
    } catch (e) { /* learning stays quiet */ }
    return header;
  }
  var api = { offer: offer };
  if (typeof module !== 'undefined' && module.exports) module.exports = { FlowPersonalModelWire: api };
  else globalThis.FlowPersonalModelWire = api;
})();
