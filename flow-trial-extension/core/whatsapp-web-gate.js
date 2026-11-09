// WhatsApp Web read gate. Portable: no chrome.*, no DOM.
// The read flag and the consent flag default off. A missing value is off.
// The remote bag is the global kill switch: never fetched, invalid, or whatsapp off blocks the read.
// The per-user kill is glanceChatOff.whatsapp.
const FlowWhatsAppWebGate = (() => {
  const FLAG_KEY = 'glanceWhatsAppWebRead';
  const CONSENT_KEY = 'glanceWhatsAppWebConsent';
  const USER_KILL_KEY = 'glanceChatOff.whatsapp';
  const REMOTE_KEY = 'glanceChatKillRemote';

  function flagOn(value) {
    return value === true;
  }

  function allowed(state) {
    const s = state || {};
    if (s.flag !== true) return { ok: false, reason: 'flag-off' };
    if (s.consent !== true) return { ok: false, reason: 'no-consent' };
    if (s.userOff === true) return { ok: false, reason: 'user-off' };
    const remote = s.remote;
    if (!remote || remote.valid !== true || remote.neverFetched === true) return { ok: false, reason: 'remote-off' };
    if (remote.off && remote.off.whatsapp === true) return { ok: false, reason: 'remote-off' };
    return { ok: true, reason: 'on' };
  }

  function readAllowed(env, opts) {
    if (!opts || opts.gesture !== true) return { ok: false, reason: 'no-gesture' };
    const e = env || {};
    if (e.flag !== true) return { ok: false, reason: 'flag-off' };
    if (e.consent !== true) return { ok: false, reason: 'no-consent' };
    if (e.userOff === true) return { ok: false, reason: 'user-off' };
    if (e.remoteOff === true) return { ok: false, reason: 'remote-off' };
    return { ok: true, reason: 'on' };
  }

  function pageEnv() {
    return {
      flag: globalThis.__glanceWhatsAppWebRead === true,
      consent: globalThis.__glanceWhatsAppWebConsent === true,
      userOff: globalThis.__glanceWhatsAppUserOff === true,
      remoteOff: globalThis.__glanceWhatsAppRemoteOff === true
    };
  }

  return {
    FLAG_KEY: FLAG_KEY,
    CONSENT_KEY: CONSENT_KEY,
    USER_KILL_KEY: USER_KILL_KEY,
    REMOTE_KEY: REMOTE_KEY,
    flagOn: flagOn,
    allowed: allowed,
    readAllowed: readAllowed,
    pageEnv: pageEnv
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowWhatsAppWebGate };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsAppWebGate = FlowWhatsAppWebGate;
