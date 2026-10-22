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
      eco: {
        google: {
          cta: 'חברו את <bdi>Google</bdi>',
          busy: 'מתחברים ל-<bdi>Google</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Google</bdi>.',
          tools: ['Gmail', 'יומן ו-<bdi>Meet</bdi>', 'משימות', 'Drive', 'Docs', 'Sheets', 'Slides', 'אנשי קשר'],
          display: 'Google'
        },
        microsoft: {
          cta: 'חברו את <bdi>Microsoft</bdi>',
          busy: 'מתחברים ל-<bdi>Microsoft</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Microsoft</bdi>.',
          tools: ['Outlook', 'יומן', 'To Do', 'OneDrive', 'Word', 'Excel', 'PowerPoint', 'Teams', 'OneNote', 'Planner'],
          display: 'Microsoft'
        },
        meta: {
          cta: 'חברו את <bdi>WhatsApp</bdi> ו-<bdi>Meta</bdi>',
          busy: 'מתחברים ל-<bdi>Meta</bdi>…',
          hint: 'ממשיכים בחלון של <bdi>Meta</bdi>.',
          tools: ['WhatsApp', 'Messenger', 'Instagram'],
          display: 'WhatsApp + Meta'
        }
      }
    },
    en: {
      title: 'Connect your accounts',
      lead: 'Each one is a single approval for every tool from that provider.',
      later: 'You can add access later, right where you need it.',
      connected: 'Connected',
      eco: {
        google: {
          cta: 'Connect Google',
          busy: 'Connecting to Google…',
          hint: 'Continue in the Google window.',
          tools: ['Gmail', 'Calendar & Meet', 'Tasks', 'Drive', 'Docs', 'Sheets', 'Slides', 'Contacts'],
          display: 'Google'
        },
        microsoft: {
          cta: 'Connect Microsoft',
          busy: 'Connecting to Microsoft…',
          hint: 'Continue in the Microsoft window.',
          tools: ['Outlook', 'Calendar', 'To Do', 'OneDrive', 'Word', 'Excel', 'PowerPoint', 'Teams', 'OneNote', 'Planner'],
          display: 'Microsoft'
        },
        meta: {
          cta: 'Connect WhatsApp + Meta',
          busy: 'Connecting to Meta…',
          hint: 'Continue in the Meta window.',
          tools: ['WhatsApp', 'Messenger', 'Instagram'],
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

  function googleConnected(status, state) {
    const st = status || {};
    if (st.googleTasks && st.googleTasks.connected) return true;
    if (st.google && st.google.connected) return true;
    return Boolean(state && state.googleTasksAuth && state.googleTasksAuth.taskListId);
  }

  function microsoftConnected(status, state) {
    const st = status || {};
    if (st.microsoft && st.microsoft.connected) return true;
    return Boolean(state && state.outlookAuth && state.outlookAuth.token);
  }

  function metaConnected(status) {
    const st = status || {};
    return Boolean(st.meta && st.meta.connected);
  }

  function accountEmail(ecoId, status, state) {
    if (ecoId === 'google') {
      const hint = state && state.googleWebAuth && state.googleWebAuth.loginHint;
      const acct = state && state.googleConnectedAccount && state.googleConnectedAccount.email;
      return acct || hint || '';
    }
    if (ecoId === 'microsoft') {
      const auth = state && state.outlookAuth;
      return (auth && (auth.email || auth.loginHint)) || '';
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
      const busy = connectingId === eco.id;
      let body;
      if (done) {
        const mail = accountEmail(eco.id, status, state);
        const mailHtml = mail
          ? '<span class="mail"><bdi dir="ltr">' + String(mail).replace(/</g, '&lt;') + '</bdi></span>'
          : '';
        body = '<div class="c3-done" data-eco="' + eco.id + '"><span class="marks" style="display:flex">' + marksHtml(eco.marks) + '</span>' +
          '<span class="who"><span class="name"><bdi>' + c.display + '</bdi></span>' + mailHtml + '</span>' +
          '<span class="ok">' + (SVG.check || '') + T.connected + '</span></div>';
      } else if (busy) {
        body = '<button type="button" class="c3-doit busy" aria-busy="true" disabled>' + spinHtml() +
          '<span class="label">' + c.busy + '</span></button>';
      } else {
        body = '<button type="button" class="c3-doit" data-connect-eco="' + eco.id + '"' + (anyBusy ? ' disabled' : '') + '>' +
          '<span class="marks">' + marksHtml(eco.marks) + '</span><span class="label">' + c.cta + '</span></button>';
      }
      const sub = busy ? c.hint : toolsLine(c.tools);
      return '<li class="c3-item" data-state="' + (done ? 'done' : (busy ? 'busy' : 'idle')) + '">' + body +
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
        if (res && res.ok && refresh) await refresh();
        else paint(host, opts);
      });
    });
  }

  return { SWITCH, switchOn, paint };
})();
