// wa.me deep link for a one-to-one WhatsApp reply. Portable: no chrome.*, no network.
// Opens WhatsApp with a prefilled draft; the person presses Send. Never auto-sends.
const FlowWaMeLink = (() => {
  function channelApi() {
    if (typeof FlowChannel !== 'undefined') return FlowChannel;
    try { return typeof require !== 'undefined' ? require('./channel.js').FlowChannel : null; } catch (e) { return null; }
  }

  function digitsOnly(phone) {
    const C = channelApi();
    if (C && typeof C.normalizePhone === 'function') return C.normalizePhone(phone);
    let d = String(phone == null ? '' : phone).replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '972' + d.slice(1);
    d = d.replace(/\D/g, '');
    return d.length >= 9 && d.length <= 15 ? d : null;
  }

  // https://wa.me/<digits>?text=<urlencoded draft>
  function build(phone, draftText) {
    const digits = digitsOnly(phone);
    if (!digits) return null;
    const body = String(draftText == null ? '' : draftText).trim();
    const base = 'https://wa.me/' + digits;
    if (!body) return base;
    return base + '?text=' + encodeURIComponent(body);
  }

  return { digitsOnly, build };
})();

if (typeof module !== 'undefined') module.exports = { FlowWaMeLink };
else if (typeof globalThis !== 'undefined') globalThis.FlowWaMeLink = FlowWaMeLink;
