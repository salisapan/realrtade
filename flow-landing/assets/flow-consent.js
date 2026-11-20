/* Flow Clarity cookieless mode (patch 019, v3 - no banner).
   1. Immediately expires any pre-existing first-party Clarity cookies (_clck/_clsk),
      so a returning visitor's old identifiers cannot be sent even before the tag runs.
   2. Loads Microsoft Clarity and signals consentv2 denied for every visitor,
      queued synchronously before the tag can execute.
   Result: Clarity's supported no-consent mode - no first/third-party cookies,
   a unique ID per page view, limited tracking (no cross-session persistence).
   Source: learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode
           learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
   No consent banner is shown. If full analytics with cookies is ever wanted,
   call window.clarity('consentv2', {ad_Storage:'granted', analytics_Storage:'granted'})
   after collecting a valid visitor consent. */
(function (c, l, a, r, i, t, y) {
  var d = '; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  var host = l.location.hostname;
  l.cookie = '_clck=x' + d;
  l.cookie = '_clsk=x' + d;
  l.cookie = '_clck=x' + d + '; domain=.' + host;
  l.cookie = '_clsk=x' + d + '; domain=.' + host;
  c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
  c[a]('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
  y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
})(window, document, 'clarity', 'script', 'z5f28ql416');
