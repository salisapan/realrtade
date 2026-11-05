// A visible chip while Glance reads the open chat on the person's click.
const FlowChatIndicator = (() => {
  const HOST_ID = 'glance-chat-reading-host';

  function label() {
    try {
      const lang = (document.documentElement && document.documentElement.lang) || '';
      if (String(lang).toLowerCase().indexOf('he') === 0) return 'Glance קורא את הצ׳אט הזה…';
    } catch (e) { /* ignore */ }
    return 'Glance is reading this chat…';
  }

  function show() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host{all:initial;position:fixed;bottom:16px;left:16px;z-index:2147483646;font:13px/1.4 system-ui,sans-serif}span{display:inline-block;padding:8px 12px;border-radius:8px;background:#111;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}';
      const span = document.createElement('span');
      span.setAttribute('data-glance-reading', '1');
      span.textContent = label();
      root.appendChild(style);
      root.appendChild(span);
      document.documentElement.appendChild(host);
    }
    return host;
  }

  function hide(host) {
    const node = host || document.getElementById(HOST_ID);
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  return { show, hide, label };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatIndicator };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatIndicator = FlowChatIndicator;
