/* Corner v21 — theme toggle (Light default · Dark = Flow night). Shared by glance.html + integrations-proposals.html */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'glance.ui.theme'; /* sessionStorage: day by default on every new visit, independent of Flow's flow.theme */
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { sessionStorage.setItem(KEY, theme); } catch (e) {}
    var label = document.getElementById('theme-label');
    var btn = document.getElementById('btn-theme');
    var lang = (document.documentElement.lang || '').slice(0, 2) || 'en';
    var he = lang === 'he';
    var S = (window.GLANCE_I18N && window.GLANCE_I18N.STR && window.GLANCE_I18N.STR[lang]) || null;
    if (label) label.textContent = theme === 'dark' ? ((S && S.light) || (he ? 'בהיר' : 'Light')) : ((S && S.dark) || (he ? 'כהה' : 'Dark'));
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? ((S && S.themeToLight) || (he ? 'מצב יום' : 'Switch to light theme')) : ((S && S.themeToDark) || (he ? 'מצב לילה' : 'Switch to dark theme')));
    document.dispatchEvent(new CustomEvent('glance:theme', { detail: theme }));
  }
  function init() {
    apply(current());
    var btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); apply(current() === 'dark' ? 'light' : 'dark'); });
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
