// Reading indicator shown only during an explicit chat read (PR-0 adapter).
const FlowChatIndicator = (() => {
  const TAG = 'glance-chat-reading-indicator';
  const COPY = {
    en: 'Glance is reading this chat…',
    he: 'Glance קורא את הצ\'אט הזה…'
  };

  function hePage(doc) {
    const lang = String((doc.documentElement && doc.documentElement.lang) || '').toLowerCase();
    return lang.indexOf('he') === 0 || lang.indexOf('iw') === 0 || (doc.documentElement && doc.documentElement.dir === 'rtl');
  }

  function show(doc) {
    const d = doc || document;
    if (!d || !d.body) return;
    let host = d.getElementById(TAG);
    if (!host) {
      host = d.createElement('div');
      host.id = TAG;
      host.setAttribute('data-glance-reading', '1');
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = d.createElement('style');
      style.textContent = ':host{all:initial;position:fixed;bottom:16px;inset-inline-start:16px;z-index:2147483646;font:13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:8px;background:#111;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}';
      const chip = d.createElement('span');
      chip.textContent = hePage(d) ? COPY.he : COPY.en;
      shadow.appendChild(style);
      shadow.appendChild(chip);
      d.body.appendChild(host);
    }
    host.hidden = false;
  }

  function hide(doc) {
    const d = doc || document;
    const host = d && d.getElementById(TAG);
    if (host) host.remove();
  }

  return { show, hide, TAG };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatIndicator };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatIndicator = FlowChatIndicator;
