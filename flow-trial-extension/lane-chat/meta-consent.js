// One consent for Meta chats. The popup paints the link. Signup calls open().
// This file does not send, and it does not ask for a host on its own.
(function () {
  const PAGE = 'lane-chat/enable.html';
  const MESSAGE = 'flow:open-meta-chats';
  const COPY = {
    en: 'Turn on Meta chats',
    he: 'הפעל צ׳אטים של Meta'
  };
  const ON_COPY = {
    en: 'Meta chats are on',
    he: 'צ׳אטים של Meta פועלים'
  };
  const OFF_COPY = {
    en: 'Off',
    he: 'כבוי'
  };
  const DISCONNECT_COPY = {
    en: 'Disconnect',
    he: 'נתק'
  };
  const KIND_COPY = {
    en: 'Chats',
    he: 'צ׳אטים'
  };
  const ORIGINS = [
    'https://web.whatsapp.com/*',
    'https://www.messenger.com/*',
    'https://messenger.com/*',
    'https://www.facebook.com/messages',
    'https://www.facebook.com/messages/*',
    'https://facebook.com/messages',
    'https://facebook.com/messages/*',
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

  function onLabel(code) {
    const raw = String(code || '').toLowerCase();
    if (raw.indexOf('he') === 0 || raw.indexOf('iw') === 0) return ON_COPY.he;
    return ON_COPY.en;
  }

  function heLang(code) {
    const raw = String(code || '').toLowerCase();
    return raw.indexOf('he') === 0 || raw.indexOf('iw') === 0;
  }

  function offLabel(code) {
    return heLang(code) ? OFF_COPY.he : OFF_COPY.en;
  }

  function disconnectLabel(code) {
    return heLang(code) ? DISCONNECT_COPY.he : DISCONNECT_COPY.en;
  }

  function kindLabel(code) {
    return heLang(code) ? KIND_COPY.he : KIND_COPY.en;
  }

  function doitButton(doc, id, text) {
    const link = doc.createElement('button');
    link.type = 'button';
    link.className = 'primary sm';
    if (id) link.id = id;
    ['shell', 'ring', 'shine'].forEach((name) => {
      const span = doc.createElement('span');
      span.className = name;
      link.appendChild(span);
    });
    const label = doc.createElement('span');
    label.className = 'btn-label';
    label.textContent = text;
    link.appendChild(label);
    return link;
  }

  function disconnect(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.permissions || typeof api.permissions.remove !== 'function') {
      return Promise.resolve({ ok: false });
    }
    return new Promise((resolve) => {
      let settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        resolve({ ok: ok !== false });
      }
      try {
        const result = api.permissions.remove({ origins: ORIGINS.slice() }, done);
        if (result && typeof result.then === 'function') {
          result.then(done, () => done(false));
        }
      } catch (e) {
        done(false);
      }
    });
  }

  // The Connections row. Connect is .primary.sm, the same size as the
  // other rows. Disconnect is .ghost, the same control those rows use.
  function paintConnection(host, opts) {
    if (!host) return null;
    const doc = host.ownerDocument;
    const prior = host.querySelector('[data-glance-connect="meta"]');
    if (prior) prior.remove();
    const granted = Boolean(opts && opts.granted);
    const lang = opts && opts.lang;
    const card = doc.createElement('div');
    card.className = 'conn' + (granted ? ' on' : '');
    card.setAttribute('data-glance-connect', 'meta');
    card.setAttribute('data-provider', 'meta');
    const head = doc.createElement('div');
    head.className = 'conn-head';
    const name = doc.createElement('div');
    name.className = 'conn-name';
    const title = doc.createElement('b');
    title.textContent = 'Meta';
    const kind = doc.createElement('i');
    kind.textContent = kindLabel(lang);
    name.appendChild(title);
    name.appendChild(kind);
    head.appendChild(name);
    const badge = doc.createElement('span');
    badge.className = 'badge' + (granted ? ' on' : '');
    badge.setAttribute('dir', 'auto');
    if (granted) {
      badge.id = 'meta-chats-on';
      badge.textContent = onLabel(lang);
    } else {
      badge.textContent = offLabel(lang);
    }
    head.appendChild(badge);
    card.appendChild(head);
    if (granted) {
      const off = doc.createElement('button');
      off.type = 'button';
      off.className = 'ghost';
      off.textContent = disconnectLabel(lang);
      off.addEventListener('click', () => { disconnect(opts && opts.chrome); });
      card.appendChild(off);
    } else {
      const link = doitButton(doc, 'meta-chats-link', label(lang));
      link.addEventListener('click', (event) => {
        if (event && event.preventDefault) event.preventDefault();
        open(opts && opts.chrome);
      });
      card.appendChild(link);
    }
    host.appendChild(card);
    return granted ? badge : card.querySelector('#meta-chats-link');
  }

  function paintLink(host, opts) {
    if (!host) return null;
    const doc = host.ownerDocument;
    host.replaceChildren();
    host.hidden = false;
    if (opts && opts.granted) {
      const status = doc.createElement('p');
      status.className = 'hint';
      status.id = 'meta-chats-on';
      status.textContent = onLabel(opts && opts.lang);
      host.appendChild(status);
      return status;
    }
    const link = doc.createElement('button');
    link.type = 'button';
    link.className = 'primary sm';
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
    ON_COPY: ON_COPY,
    ORIGINS: ORIGINS,
    label: label,
    onLabel: onLabel,
    paintLink: paintLink,
    paintConnection: paintConnection,
    open: open
  };
})();
