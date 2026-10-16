// One consent for Meta chats. The popup paints the link. Signup calls open().
// This file does not send, and it does not ask for a host on its own.
(function () {
  const PAGE = 'lane-chat/enable.html';
  const MESSAGE = 'flow:open-meta-chats';
  const COPY = {
    en: 'Turn on Meta chats',
    he: "הפעל צ'אטים של Meta"
  };
  const ORIGINS = [
    'https://web.whatsapp.com/*',
    'https://www.messenger.com/*',
    'https://messenger.com/*',
    'https://www.facebook.com/messages',
    'https://www.facebook.com/messages/*',
    'https://facebook.com/messages',
    'https://facebook.com/messages/*',
    'https://business.facebook.com/latest/inbox',
    'https://business.facebook.com/latest/inbox/*',
    'https://www.business.facebook.com/latest/inbox',
    'https://www.business.facebook.com/latest/inbox/*',
    'https://www.instagram.com/direct',
    'https://www.instagram.com/direct/*',
    'https://instagram.com/direct',
    'https://instagram.com/direct/*'
  ];

  function label(code) {
    const raw = String(code || '').toLowerCase();
    if (raw.indexOf('he') === 0 || raw.indexOf('iw') === 0) return COPY.he;
    return COPY.en;
  }

  function paintLink(host, opts) {
    if (!host) return null;
    const doc = host.ownerDocument;
    host.replaceChildren();
    if (opts && opts.granted) {
      host.hidden = true;
      return null;
    }
    host.hidden = false;
    const link = doc.createElement('button');
    link.type = 'button';
    link.className = 'primary';
    link.id = 'meta-chats-link';
    ['shell', 'ring', 'shine'].forEach((name) => {
      const span = doc.createElement('span');
      span.className = name;
      link.appendChild(span);
    });
    const text = doc.createElement('span');
    text.className = 'btn-label';
    text.textContent = label(opts && opts.lang);
    link.appendChild(text);
    link.addEventListener('click', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      open(opts && opts.chrome);
    });
    host.appendChild(link);
    return link;
  }

  function open(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (api && api.tabs && typeof api.tabs.create === 'function') {
      let url = PAGE;
      try { if (api.runtime && typeof api.runtime.getURL === 'function') url = api.runtime.getURL(PAGE); } catch (e) { url = PAGE; }
      try {
        api.tabs.create({ url: url });
        return Promise.resolve({ ok: true, page: PAGE });
      } catch (e) { /* the worker can open the tab */ }
    }
    if (!api || !api.runtime || typeof api.runtime.sendMessage !== 'function') {
      return Promise.resolve({ ok: false, page: PAGE });
    }
    return new Promise((resolve) => {
      try {
        api.runtime.sendMessage({ type: MESSAGE }, (reply) => {
          let failed = false;
          try { failed = Boolean(api.runtime.lastError); } catch (e) { failed = false; }
          if (failed) resolve({ ok: false, page: PAGE });
          else resolve(reply && reply.page ? reply : { ok: true, page: PAGE });
        });
      } catch (e) {
        resolve({ ok: false, page: PAGE });
      }
    });
  }

  globalThis.FlowMetaConsent = {
    PAGE: PAGE,
    MESSAGE: MESSAGE,
    COPY: COPY,
    ORIGINS: ORIGINS,
    label: label,
    paintLink: paintLink,
    open: open
  };
})();
