/* Official brand marks for the tool UIs (v2).
   Each mark is the vendor's own logo file kept in glance/brands/ (Google Workspace, Microsoft 365, Slack, WhatsApp, Notion, Calendly,
   Jira, HubSpot via the vendors' published assets / Wikimedia Commons copies of the official files; Morning = the symbol cropped from
   the logo on greeninvoice.co.il). Nothing is redrawn. Rendered inside an <svg><image> so existing sizing rules (".x svg") still apply. */
(function () {
  'use strict';
  var F = { gmail: 'svg', calendar: 'svg', drive: 'svg', docs: 'svg', sheets: 'svg', meet: 'svg', slack: 'svg', teams: 'svg', outlook: 'svg',
            whatsapp: 'svg', onedrive: 'svg', todo: 'svg', notion: 'svg', calendly: 'svg', jira: 'svg', hubspot: 'svg', morning: 'png', xero: 'png' };
  var ALIAS = { outlookcal: 'outlook', whatsapp: 'slack' };
  var intl = (document.documentElement.lang || '').slice(0, 2) !== 'he';
  if (intl) ALIAS.morning = 'xero';
  var B = {};
  function mark(k) {
    return '<svg viewBox="0 0 24 24" class="brand-svg" aria-hidden="true" focusable="false"><image href="glance/brands/' + k + '.' + F[k] +
           '" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>';
  }
  Object.keys(F).forEach(function (k) { B[k] = mark(k); });
  Object.keys(ALIAS).forEach(function (k) { B[k] = B[ALIAS[k]]; });
  /* generic folder glyph for "files" (not a vendor mark) */
  B.files = '<svg viewBox="0 0 24 24"><path fill="#5AC8FA" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l1.6 1.8H18.5A2.5 2.5 0 0 1 21 8.3v9.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';
  function fill(root) {
    (root || document).querySelectorAll('[data-brand]').forEach(function (el) {
      if (el.querySelector('svg')) return;
      el.insertAdjacentHTML('afterbegin', B[el.getAttribute('data-brand')] || '');
    });
  }
  window.BRAND = B; window.fillBrand = fill;
  if (document.readyState !== 'loading') fill(); else document.addEventListener('DOMContentLoaded', function () { fill(); });
})();
