/* Isolated Flow WhatsApp inquiry button.
   Hidden when FLOW_CONFIG.whatsappNumber is unset. Does not change layout of
   existing CTAs: it sits in the end/bottom corner, below the nav and mobile
   menu, and uses logical inset properties so RTL flips correctly. */
(function () {
  var cfg = window.FLOW_CONFIG || {};
  var raw = String(cfg.whatsappNumber || cfg.whatsapp || '').trim();
  var digits = raw.replace(/[^\d]/g, '');
  if (!digits) return;
  if (document.getElementById('flow-whatsapp-button')) return;

  var prefill = encodeURIComponent('היי, אשמח לשמוע על Flow');
  var href = 'https://wa.me/' + digits + '?text=' + prefill;
  var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  var hebrew = lang.indexOf('he') === 0 || document.documentElement.getAttribute('dir') === 'rtl';
  var label = hebrew ? 'שיחה עם Flow ב-WhatsApp' : 'Chat with Flow on WhatsApp';

  var style = document.createElement('style');
  style.setAttribute('data-flow-whatsapp-button', 'true');
  style.textContent = [
    '#flow-whatsapp-button{',
    'position:fixed;',
    'inset-inline-end:max(16px, env(safe-area-inset-right, 0px));',
    'inset-block-end:max(16px, env(safe-area-inset-bottom, 0px));',
    'z-index:40;',
    'width:56px;height:56px;',
    'border-radius:50%;',
    'background:#2D5EFF;',
    'color:#fff;',
    'display:inline-flex;align-items:center;justify-content:center;',
    'box-shadow:0 8px 24px rgba(45,94,255,.35);',
    'text-decoration:none;',
    'line-height:0;',
    '}',
    '#flow-whatsapp-button:hover{filter:brightness(1.06);}',
    '#flow-whatsapp-button:focus-visible{outline:2px solid #2D5EFF;outline-offset:3px;}',
    '@media (max-width:640px){',
    '#flow-whatsapp-button{inset-block-end:max(20px, env(safe-area-inset-bottom, 0px));}',
    '}'
  ].join('');
  document.head.appendChild(style);

  var a = document.createElement('a');
  a.id = 'flow-whatsapp-button';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', label);
  a.setAttribute('data-ga', 'whatsapp_float');
  a.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.43 2.15 11.89c0 1.77.46 3.5 1.34 5.02L2 22l5.24-1.37a9.86 9.86 0 0 0 4.8 1.22h.01c5.46 0 9.89-4.43 9.89-9.89C21.94 6.43 17.5 2 12.04 2zm5.76 14.01c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.78-4.17-4.93-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.15.07.15.12.32.02.52-.1.2-.15.32-.29.5-.14.17-.3.39-.43.52-.14.15-.29.31-.12.6.16.29.73 1.2 1.57 1.95 1.08.96 1.99 1.26 2.28 1.4.29.15.45.12.62-.07.16-.2.7-.81.89-1.09.19-.27.38-.23.64-.14.26.1 1.66.78 1.94.92.29.14.48.21.55.33.07.12.07.68-.17 1.36z"/></svg>';
  document.body.appendChild(a);
})();
