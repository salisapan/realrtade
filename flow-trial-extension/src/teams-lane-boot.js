// First Teams content script. Logs and marks the frame before the rest of the lane runs,
// including a /v2/ shell and a nested or about:blank frame of that shell.
(() => {
  function here() {
    try { return String(location.href || ''); } catch (e) { return ''; }
  }
  try { console.info('[Glance] teams lane injected ' + here()); } catch (e) { /* no console */ }
  function mark() {
    try {
      const root = document.documentElement;
      if (root && root.getAttribute('data-glance-lane-teams') !== 'on') root.setAttribute('data-glance-lane-teams', 'on');
    } catch (e) { /* not a document yet */ }
  }
  mark();
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mark, { once: true });
  } catch (e) { /* already closed */ }
  try { window.__glanceLaneTeamsBoot = true; } catch (e) { /* no window */ }
})();
