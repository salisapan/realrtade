// Visible chip while Glance reads the open chat (one-shot, gesture-triggered).
const FlowChatIndicator = (() => {
  let host = null;

  function label(lang) {
    const he = String(lang || '').toLowerCase().indexOf('he') === 0 || String(lang || '').toLowerCase().indexOf('iw') === 0;
    return he ? 'Glance קורא את הצ׳אט הזה…' : 'Glance is reading this chat…';
  }

  function show(doc, lang) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.body) return;
    hide(d);
    host = d.createElement('div');
    host.id = 'glance-chat-reading';
    host.setAttribute('data-glance-reading', '1');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = d.createElement('style');
    style.textContent = '#chip{position:fixed;bottom:88px;right:20px;z-index:2147483646;padding:10px 14px;border-radius:12px;background:#111;color:#fff;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);direction:rtl}';
    const chip = d.createElement('div');
    chip.id = 'chip';
    chip.textContent = label(lang);
    shadow.appendChild(style);
    shadow.appendChild(chip);
    d.body.appendChild(host);
  }

  function hide(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    if (d) {
      const old = d.getElementById('glance-chat-reading');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
  }

  return { show, hide, label };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatIndicator };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatIndicator = FlowChatIndicator;
