// One build stamp, loaded by the service worker and by the page.
// The panel compares the two. A worker that is still the previous registration
// does not match, and the panel says so. This is not chrome.runtime.getManifest.
const FlowBuild = (() => {
  const STAMP = '0.9.47';
  return { STAMP: STAMP };
})();

if (typeof module !== 'undefined') module.exports = { FlowBuild };
else if (typeof globalThis !== 'undefined') globalThis.FlowBuild = FlowBuild;
