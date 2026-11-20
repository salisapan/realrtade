// Sets the surface token from the page host. Events are sent to the service
// worker. This file does not open IndexedDB and does not run on WhatsApp.
(function () {
  if (typeof FlowClosedIntentLedger === 'undefined' || typeof FlowClosedIntentLedger.setDefaultSurface !== 'function') return;
  var host = '';
  try { host = String(location.hostname || ''); } catch (e) { host = ''; }
  var surface = '';
  if (host.indexOf('teams.microsoft.') === 0 || host.indexOf('teams.live.') === 0) surface = 'teams';
  else if (host.indexOf('slack.com') >= 0) surface = 'slack';
  else if (host.indexOf('telegram.org') >= 0) surface = 'telegram';
  else if (host.indexOf('outlook.') === 0) surface = 'outlook';
  else if (host === 'mail.google.com') surface = 'gmail';
  if (surface) FlowClosedIntentLedger.setDefaultSurface(surface);
})();
