// After an update or a browser start, Gmail tabs that were already open
// still show the previous content-script world. Inject the manifest files
// again. Do not reload the tab. A live copy is left alone. An orphaned
// copy's leftover chips are removed before the new files run.
async function reinjectGmailTabs() {
  const scripting = typeof chrome !== 'undefined' ? chrome.scripting : null;
  const tabsApi = typeof chrome !== 'undefined' ? chrome.tabs : null;
  if (!scripting || typeof scripting.executeScript !== 'function' || !tabsApi || typeof tabsApi.query !== 'function') return 0;
  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
  const blocks = manifest && manifest.content_scripts ? manifest.content_scripts : [];
  const block = blocks.find((s) => (s.matches || []).some((m) => String(m).indexOf('mail.google.com') >= 0));
  if (!block || !block.js || !block.js.length) return 0;
  let tabs = [];
  try { tabs = await tabsApi.query({ url: 'https://mail.google.com/*' }); } catch (e) { return 0; }
  let n = 0;
  for (const tab of tabs || []) {
    if (!tab || typeof tab.id !== 'number') continue;
    try {
      const probe = await scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let alive = false;
          try { alive = Boolean(chrome.runtime && chrome.runtime.id); } catch (e) { alive = false; }
          const guard = globalThis.__glanceGmailGuard === true;
          const hosts = document.querySelectorAll('.flow-chip-host').length;
          return { guard: guard, alive: alive, hosts: hosts };
        }
      });
      const seen = (probe && probe[0] && probe[0].result) || {};
      if (seen.guard && seen.alive) continue;
      if (seen.hosts) {
        await scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            document.querySelectorAll('.flow-chip-host').forEach((node) => node.remove());
          }
        });
      }
      if (block.css && block.css.length && typeof scripting.insertCSS === 'function') {
        try { await scripting.insertCSS({ target: { tabId: tab.id }, files: block.css }); } catch (e) { /* css already there */ }
      }
      await scripting.executeScript({ target: { tabId: tab.id }, files: block.js });
      n += 1;
    } catch (e) { /* the tab closed, or the page is not injectable */ }
  }
  return n;
}

if (typeof globalThis !== 'undefined') globalThis.reinjectGmailTabs = reinjectGmailTabs;
