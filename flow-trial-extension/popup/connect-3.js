// Connect per ecosystem (C1): three-provider onboarding. Behind glanceSwitches.CONNECT_ECOSYSTEM (off).
// Hebrew copy is verbatim from design/connect-3/notes-he.md.
const ConnectEcosystemUI = (function () {
  const SWITCH = 'CONNECT_ECOSYSTEM';
  const SVG = (typeof Connect3Brands !== 'undefined') ? Connect3Brands : {};

  const COPY = {
    he: {
      title: 'חברו את החשבונות',
      lead: 'כל חיבור הוא אישור אחד שכולל את כל הכלים של אותו ספק.',
      later: 'אפשר להוסיף גישה בהמשך, בדיוק איפה שצריך.',
      connected: 'מחובר',
      partial: 'מחובר חלקית',
      reconnectNeeded: 'צריך להתחבר מחדש',
      reconnect: 'חבר מחדש',
      disconnect: 'נתק',
      expired: 'פג תוקף',
      eco: {
        google: {
          cta: 'חברו את <bdi>Google</bdi>',
          busy: 'מתחברים ל-<bdi>Google</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Google</bdi>.',
          tools: null,
          display: 'Google'
        },
        microsoft: {
          cta: 'חברו את <bdi>Microsoft</bdi>',
          busy: 'מתחברים ל-<bdi>Microsoft</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Microsoft</bdi>.',
          tools: null,
          display: 'Microsoft'
        },
        meta: {
          cta: 'חברו את <bdi>WhatsApp</bdi> ו-<bdi>Meta</bdi>',
          busy: 'מתחברים ל-<bdi>Meta</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Meta</bdi>.',
          tools: null,
          display: 'WhatsApp + Meta'
        }
      }
    },
    en: {
      title: 'Connect your accounts',
      lead: 'Each one is a single approval for every tool from that provider.',
      later: 'You can add access later, right where you need it.',
      connected: 'Connected',
      partial: 'Partly connected',
      reconnectNeeded: 'Reconnect needed',
      reconnect: 'Reconnect',
      disconnect: 'Disconnect',
      expired: 'Expired',
      eco: {
        google: {
          cta: 'Connect Google',
          busy: 'Connecting to Google…',
          hint: 'Continue in the Google window.',
          tools: null,
          display: 'Google'
        },
        microsoft: {
          cta: 'Connect Microsoft',
          busy: 'Connecting to Microsoft…',
          hint: 'Continue in the Microsoft window.',
          tools: null,
          display: 'Microsoft'
        },
        meta: {
          cta: 'Connect WhatsApp + Meta',
          busy: 'Connecting to Meta…',
          hint: 'Continue in the Meta window.',
          tools: null,
          display: 'WhatsApp + Meta'
        }
      }
    }
  };

  const ECOS = [
    { id: 'google', marks: ['google'], connectorId: 'googleTasks' },
    { id: 'microsoft', marks: ['microsoft'], connectorId: 'microsoft' },
    { id: 'meta', marks: ['whatsapp', 'meta'], connectorId: 'meta' }
  ];

  let connectingId = null;

  function ecoToolsList(ecoId, lang) {
    const E = globalThis.FlowConnectEcosystem;
    if (E && typeof E.connectScreenTools === 'function') {
      const fromCore = E.connectScreenTools(ecoId, lang);
      if (fromCore && fromCore.length) return fromCore;
    }
    const pack = COPY[lang] && COPY[lang].eco && COPY[lang].eco[ecoId];
    return (pack && pack.tools) ? pack.tools : [];
  }

  function toolsLine(list) {
    return list.map((t) => {
      const wrap = /<bdi>|[\u0590-\u05ff]/.test(t);
      return '<span class="t">' + (wrap ? t : '<bdi>' + t + '</bdi>') + '</span>';
    }).join(', ');
  }

  function marksHtml(keys) {
    return keys.map((k) => {
      const cls = k === 'microsoft' ? ' c3-tile ms' : ' c3-tile';
      return '<span class="' + cls.trim() + '">' + (SVG[k] || '') + '</span>';
    }).join('');
  }

  function spinHtml() {
    let s = '<span class="c3-spin" aria-hidden="true">';
    for (let i = 0; i < 12; i++) s += '<i style="--i:' + i + '"></i>';
    return s + '</span>';
  }

  function ecoRow(status, ecoId) {
    const st = status || {};
    const row = st[ecoId];
    if (row && typeof row === 'object') return row;
    return null;
  }

  function googleConnected(status, state) {
    const row = ecoRow(status, 'google');
    if (row && (row.connected || row.partial)) return true;
    const st = status || {};
    if (st.googleTasks && st.googleTasks.connected) return true;
    return Boolean(state && state.googleTasksAuth && state.googleTasksAuth.taskListId);
  }

  function microsoftConnected(status, state) {
    const row = ecoRow(status, 'microsoft');
    if (row && (row.connected || row.partial)) return true;
    const st = status || {};
    if (st.microsoft && st.microsoft.connected) return true;
    return Boolean(state && state.outlookAuth && state.outlookAuth.token);
  }

  function metaConnected(status) {
    const row = ecoRow(status, 'meta');
    if (row) return Boolean(row.connected);
    const st = status || {};
    return Boolean(st.meta && st.meta.connected);
  }

  function isPartial(ecoId, status) {
    const row = ecoRow(status, ecoId);
    return Boolean(row && row.partial && !row.connected);
  }

  function needsReconnect(ecoId, status) {
    const row = ecoRow(status, ecoId);
    return Boolean(row && row.needsReconnect);
  }

  function statusDetail(ecoId, status) {
    const row = ecoRow(status, ecoId);
    return row && row.detail ? String(row.detail) : '';
  }

  function accountEmail(ecoId, status, state) {
    if (ecoId === 'google') {
      const hint = state && state.googleWebAuth && state.googleWebAuth.loginHint;
      const acct = state && state.googleConnectedAccount && state.googleConnectedAccount.email;
      return acct || hint || '';
    }
    if (ecoId === 'microsoft') {
      const auth = state && state.outlookAuth;
      const acct = auth && auth.account;
      return (acct && (acct.address || acct.mail)) || (auth && (auth.email || auth.loginHint)) || '';
    }
    if (ecoId === 'meta') {
      const m = state && state.metaAuth;
      return (m && m.email) || '';
    }
    return '';
  }

  function isConnected(ecoId, status, state) {
    if (ecoId === 'google') return googleConnected(status, state);
    if (ecoId === 'microsoft') return microsoftConnected(status, state);
    if (ecoId === 'meta') return metaConnected(status);
    return false;
  }

  async function switchOn() {
    try {
      const bag = await chrome.storage.local.get({ glanceSwitches: {} });
      return !!(bag.glanceSwitches && bag.glanceSwitches[SWITCH] === true);
    } catch (e) {
      return false;
    }
  }

  function themeFromPopup() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? 'dark' : 'light';
  }

  function paint(host, opts) {
    if (!host) return;
    const lang = (opts && opts.lang === 'en') ? 'en' : 'he';
    const T = COPY[lang];
    const status = (opts && opts.status) || {};
    const state = (opts && opts.state) || {};
    const send = opts && opts.send;
    const refresh = opts && opts.refresh;
    const anyBusy = Boolean(connectingId);

    host.className = 'connect-ecosystem';
    host.setAttribute('data-theme', themeFromPopup());
    host.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    host.setAttribute('lang', lang);

    const list = ECOS.map((eco) => {
      const c = T.eco[eco.id];
      const done = isConnected(eco.id, status, state);
      const partial = done && isPartial(eco.id, status);
      const reconnect = needsReconnect(eco.id, status);
      const busy = connectingId === eco.id;
      const err = (opts && opts.connectError && opts.connectError.ecoId === eco.id) ? String(opts.connectError.message || '') : '';
      let body;
      if (done) {
        const mail = accountEmail(eco.id, status, state);
        const mailHtml = mail
          ? '<span class="mail"><bdi dir="ltr">' + String(mail).replace(/</g, '&lt;') + '</bdi></span>'
          : '';
        let okLabel = T.connected;
        if (reconnect) okLabel = T.reconnectNeeded;
        else if (partial) okLabel = (statusDetail(eco.id, status) === 'expired' ? T.expired : T.partial);
        const showActions = send && (partial || reconnect || (!partial && !reconnect));
        const actions = showActions
          ? ('<div class="c3-actions">' +
            ((partial || reconnect)
              ? ('<button type="button" class="c3-reconnect" data-reconnect-eco="' + eco.id + '">' + T.reconnect + '</button>')
              : '') +
            '<button type="button" class="c3-disc" data-disconnect-eco="' + eco.id + '">' + T.disconnect + '</button>' +
            '</div>')
          : '';
        const errHtml = err ? ('<p class="c3-err" role="alert">' + err.replace(/</g, '&lt;') + '</p>') : '';
        body = '<div class="c3-done' + (partial || reconnect ? ' c3-partial' : '') + '" data-eco="' + eco.id + '"><span class="marks" style="display:flex">' + marksHtml(eco.marks) + '</span>' +
          '<span class="who"><span class="name"><bdi>' + c.display + '</bdi></span>' + mailHtml + '</span>' +
          '<span class="ok">' + (partial || reconnect ? '' : (SVG.check || '')) + okLabel + '</span>' + actions + errHtml + '</div>';
      } else if (busy) {
        body = '<button type="button" class="c3-doit busy" aria-busy="true" disabled>' + spinHtml() +
          '<span class="label">' + c.busy + '</span></button>';
      } else {
        const errHtml = err ? ('<p class="c3-err" role="alert">' + err.replace(/</g, '&lt;') + '</p>') : '';
        body = '<button type="button" class="c3-doit" data-connect-eco="' + eco.id + '"' + (anyBusy ? ' disabled' : '') + '>' +
          '<span class="marks">' + marksHtml(eco.marks) + '</span><span class="label">' + c.cta + '</span></button>' + errHtml;
      }
      const sub = busy ? c.hint : toolsLine(ecoToolsList(eco.id, lang));
      const stateName = done ? (partial ? 'partial' : 'done') : (busy ? 'busy' : 'idle');
      return '<li class="c3-item" data-state="' + stateName + '">' + body +
        '<p class="c3-tools">' + sub + '</p></li>';
    }).join('');

    host.innerHTML =
      '<div class="c3-sheet" role="region" aria-labelledby="c3-title">' +
      '<p class="c3-kicker"><bdi>Glance</bdi></p>' +
      '<h2 class="c3-title" id="c3-title">' + T.title + '</h2>' +
      '<p class="c3-lead">' + T.lead + '</p>' +
      '<ul class="c3-list">' + list + '</ul>' +
      '<p class="c3-later">' + T.later + '</p></div>';

    host.querySelectorAll('[data-connect-eco]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ecoId = btn.getAttribute('data-connect-eco');
        const row = ECOS.find((e) => e.id === ecoId);
        if (!row || !send) return;
        connectingId = ecoId;
        paint(host, opts);
        const res = await send({ type: 'flow:connect', connectorId: row.connectorId });
        connectingId = null;
        if (res && res.ok) {
          if (refresh) await refresh();
          else paint(host, Object.assign({}, opts, { status: opts.status, connectError: null }));
        } else {
          const msg = (res && (res.description || res.reason || res.error)) || 'connect-failed';
          paint(host, Object.assign({}, opts, { connectError: { ecoId: ecoId, message: msg } }));
        }
      });
    });
    host.querySelectorAll('[data-reconnect-eco]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ecoId = btn.getAttribute('data-reconnect-eco');
        const row = ECOS.find((e) => e.id === ecoId);
        if (!row || !send) return;
        connectingId = ecoId;
        paint(host, opts);
        const res = await send({ type: 'flow:connect', connectorId: row.connectorId });
        connectingId = null;
        if (res && res.ok) {
          if (refresh) await refresh();
          else paint(host, Object.assign({}, opts, { status: opts.status, connectError: null }));
        } else {
          const msg = (res && (res.description || res.reason || res.error)) || 'connect-failed';
          paint(host, Object.assign({}, opts, { connectError: { ecoId: ecoId, message: msg } }));
        }
      });
    });
    host.querySelectorAll('[data-disconnect-eco]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ecoId = btn.getAttribute('data-disconnect-eco');
        const row = ECOS.find((e) => e.id === ecoId);
        if (!row || !send) return;
        btn.disabled = true;
        await send({ type: 'flow:disconnect', connectorId: row.connectorId });
        if (refresh) await refresh();
        else paint(host, opts);
      });
    });
  }

  return { SWITCH, switchOn, paint };
})();
