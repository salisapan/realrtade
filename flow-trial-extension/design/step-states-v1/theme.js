/* Corner v20 — theme toggle (Light default · Dark = Flow night). Shared by glance.html + integrations-proposals.html */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'glance.corner.theme';
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    var label = document.getElementById('theme-label');
    var btn = document.getElementById('btn-theme');
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    document.dispatchEvent(new CustomEvent('glance:theme', { detail: theme }));
  }
  function init() {
    apply(current());
    var btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); apply(current() === 'dark' ? 'light' : 'dark'); });
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
