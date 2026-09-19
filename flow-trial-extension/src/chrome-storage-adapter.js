// The one piece of glue that wires core/execution-memory.js's storage seam
// to how Glance actually persists things — chrome.storage.local. This file
// is pure client code: it exists only because Glance runs inside Chrome.
// A future Flow runtime would write its own equivalent (a database-backed
// adapter, say) and never touch this file or core/execution-memory.js at
// all — that's the whole point of the seam.
//
// Loaded once, right after execution-memory.js and before anything that
// might call it (content-gmail.js, popup.js) — see manifest.json's
// content_scripts order and popup.html's script tags. The call below is
// the only thing this file does; there is nothing to export.

if (typeof FlowExecutionMemory !== 'undefined') {
  FlowExecutionMemory.setStorageAdapter({
    async get(key) {
      const result = await chrome.storage.local.get(key);
      return result[key];
    },
    async set(key, value) {
      await chrome.storage.local.set({ [key]: value });
    }
  });
}
