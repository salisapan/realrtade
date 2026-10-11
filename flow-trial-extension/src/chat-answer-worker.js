// Service-worker side of a chat answer. The decision lives in
// core/chat-answer.js. This file only reads mail the person already
// opened, from chrome.storage.local glanceOpenedMail, and only when
// readStoredOpenedMail is called. It does not send.
//
// The message handler that calls search() is not registered until the
// service worker can take the import. Until then a missing handler
// leaves the card silent.
const FlowChatAnswerWorker = (() => {
  function engine() {
    if (typeof FlowChatAnswer !== 'undefined') return FlowChatAnswer;
    try { return typeof require !== 'undefined' ? require('../core/chat-answer.js').FlowChatAnswer : null; } catch (e) { return null; }
  }

  function readStoredOpenedMail() {
    const lib = engine();
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ glanceOpenedMail: [] }, (bag) => {
          const rows = bag && Array.isArray(bag.glanceOpenedMail) ? bag.glanceOpenedMail : [];
          resolve(lib ? lib.normalizeMail(rows) : []);
        });
      } catch (e) { resolve([]); }
    });
  }

  function search(input) {
    const lib = engine();
    if (!lib) return Promise.resolve({ show: false, reason: 'sources-unread', hit: null, draft: '', sends: false });
    return lib.search(input);
  }

  return {
    get MAX_EVENTS() { const lib = engine(); return lib ? lib.MAX_EVENTS : 250; },
    calendarPath: function (span) { const lib = engine(); return lib ? lib.calendarPath(span) : ''; },
    normalizeEvents: function (payload) { const lib = engine(); return lib ? lib.normalizeEvents(payload) : { events: [], truncated: false }; },
    normalizeMail: function (rows) { const lib = engine(); return lib ? lib.normalizeMail(rows) : []; },
    readStoredOpenedMail: readStoredOpenedMail,
    search: search
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatAnswerWorker };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatAnswerWorker = FlowChatAnswerWorker;
