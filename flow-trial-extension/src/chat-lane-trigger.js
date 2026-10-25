// Floating Glance control only. No chat DOM reads until the person clicks or uses the shortcut.
(() => {
  if (window.__glanceChatTrigger) return;
  window.__glanceChatTrigger = true;
  window.__glanceChatDomReads = 0;

  function surfaceKey() {
    if (typeof FlowLaneChatSurfaces !== 'undefined' && FlowLaneChatSurfaces.matchSurface) {
      const row = FlowLaneChatSurfaces.matchSurface(location.href);
      return row ? row.key : null;
    }
    if (/web\.whatsapp\.com/.test(location.href)) return 'whatsapp';
    if (/messenger\.com|facebook\.com\/messages|business\.facebook\.com\/latest\/inbox/.test(location.href)) return 'messenger';
    if (/instagram\.com\/direct/.test(location.href)) return 'instagram';
    return null;
  }

  function lang() {
    try {
      const l = (document.documentElement && document.documentElement.lang) || navigator.language || 'en';
      return String(l);
    } catch (e) {
      return 'en';
    }
  }

  function mount() {
    if (document.getElementById('glance-chat-trigger')) return;
    const key = surfaceKey();
    if (!key) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'glance-chat-trigger';
    btn.setAttribute('data-glance-surface', key);
    btn.setAttribute('aria-label', lang().indexOf('he') >= 0 ? 'נתח את הצ׳אט הזה' : 'Analyze this chat');
    btn.textContent = lang().indexOf('he') >= 0 ? 'נתח צ׳אט' : 'Glance chat';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483645',
      padding: '10px 14px',
      borderRadius: '999px',
      border: 'none',
      background: '#1a73e8',
      color: '#fff',
      font: '600 13px system-ui,sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)'
    });
    btn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'flow:chat-on-demand', surface: key, source: 'button' }, () => void chrome.runtime.lastError);
      } catch (e) { /* extension context gone */ }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
