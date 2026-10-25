// Connect per ecosystem (C1): one consent per provider. Portable — no chrome.*, no DOM, no network.
// The popup screen (connect-3.js) and the service worker share this catalogue and step list.
const FlowConnectEcosystem = (() => {
  const ECOSYSTEMS = ['google', 'microsoft', 'meta'];

  const MICROSOFT_SCOPES = [
    'offline_access',
    'openid',
    'profile',
    'User.Read',
    'Mail.ReadWrite',
    'Tasks.ReadWrite',
    'Files.ReadWrite'
  ];

  // Work-account-only or card-time incremental scopes (not in one-consent).
  const MICROSOFT_OPTIONAL_SCOPES = {
    planner: ['Group.Read.All'],
    teamsChat: ['Chat.Read'],
    contacts: ['Contacts.Read']
  };

  const MS_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

  // Same list as lane-chat/meta-consent.js FlowMetaConsent.ORIGINS (lane restoreLaneChats).
  const META_ORIGINS = [
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

  // Office surfaces named on the connect-3 screen (catalog only; one Graph sign-in covers them).
  const OFFICE_CATALOG = [
    { id: 'ms-planner', label: 'Planner', detail: 'Add one task to a named plan. Undo deletes it.', group: 'microsoft' },
    { id: 'ms-onenote', label: 'OneNote', detail: 'Read notebooks you already use.', group: 'microsoft' },
    { id: 'ms-word', label: 'Word', detail: 'Create one empty document when a request asks for it.', group: 'microsoft' },
    { id: 'ms-excel', label: 'Excel', detail: 'Create one empty spreadsheet when a request asks for it.', group: 'microsoft' },
    { id: 'ms-powerpoint', label: 'PowerPoint', detail: 'Create one empty deck when a request asks for it.', group: 'microsoft' }
  ];

  // Task O will call the token endpoint through this shape (PKCE public client, no secret).
  const PKCE_REFRESH_INTERFACE = {
    tokenPath: '/oauth2/v2.0/token',
    grants: {
      authorization_code: ['client_id', 'grant_type', 'code', 'redirect_uri', 'code_verifier', 'scope'],
      refresh_token: ['client_id', 'grant_type', 'refresh_token', 'scope']
    },
    grantTypes: { code: 'authorization_code', refresh: 'refresh_token' }
  };

  function normalizeEco(id) {
    const s = String(id || '');
    if (s === 'googleTasks' || s === 'googleTask' || s === 'google') return 'google';
    if (s === 'microsoft' || s === 'microsoftTodo' || s === 'outlook') return 'microsoft';
    if (s === 'meta') return 'meta';
    return s;
  }

  function dropSend(scopes) {
    const out = [];
    (scopes || []).forEach((sc) => {
      const x = String(sc || '');
      if (!x || /Mail\.Send/i.test(x) || /\.Send$/i.test(x)) return;
      if (out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }

  function microsoftScopes() {
    return dropSend(MICROSOFT_SCOPES);
  }

  function scopeNames(raw) {
    if (raw == null) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    const out = [];
    items.forEach((item) => {
      String(item == null ? '' : item).split(/[\s,;]+/).forEach((part) => {
        let s = String(part || '').trim();
        if (!s || /^unknown$/i.test(s)) return;
        if (/^https:\/\/graph\.microsoft\.com\//i.test(s)) s = s.replace(/^https:\/\/graph\.microsoft\.com\//i, '');
        else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return;
        if (!s || s.indexOf('/') >= 0) return;
        if (out.indexOf(s) < 0) out.push(s);
      });
    });
    return out;
  }

  function hasScopes(granted, required) {
    const have = scopeNames(granted);
    return (required || []).every((need) => have.indexOf(need) >= 0);
  }

  function microsoftRequiredScopes() {
    return microsoftScopes().filter((s) => s !== 'offline_access' && s !== 'openid' && s !== 'profile');
  }

  function microsoftConsentScopes() {
    return microsoftScopes();
  }

  const PLANNER_GROUP_SCOPE = 'Group.Read.All';

  function decodeJwtPayload(idToken) {
    const parts = String(idToken || '').split('.');
    if (parts.length < 2 || !parts[1]) return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const segment = parts[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    let acc = 0;
    let bits = 0;
    const bytes = [];
    for (let i = 0; i < segment.length; i++) {
      const v = alphabet.indexOf(segment[i]);
      if (v < 0) return null;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 255);
      }
    }
    let raw = '';
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function tenantIdFromIdToken(idToken) {
    const json = decodeJwtPayload(idToken);
    const tid = json && json.tid != null ? String(json.tid).trim().toLowerCase() : '';
    return tid;
  }

  function microsoftOwnAddresses(profile) {
    const s = new Set();
    const add = (a) => {
      const e = String(a || '').trim().toLowerCase();
      if (e && e.indexOf('@') > 0) s.add(e);
    };
    const p = profile || {};
    add(p.mail);
    add(p.userPrincipalName);
    (p.otherMails || []).forEach(add);
    (p.proxyAddresses || []).forEach((raw) => {
      const m = String(raw || '').match(/^smtp:(.+)$/i);
      if (m) add(m[1]);
    });
    return Array.from(s);
  }

  function looksLikeJwt(token) {
    const parts = String(token || '').split('.');
    return parts.length >= 2 && parts[1] && parts[1].length > 0;
  }

  function graphIdMeansPersonal(id) {
    const s = String(id == null ? '' : id).trim();
    return /^[0-9a-f]{16}$/i.test(s);
  }

  // Personal vs work: token tid (consumer tenant), then Graph /me hints — never email-domain suffix alone.
  function resolveMicrosoftAccountKind(idToken, profile) {
    const tid = tenantIdFromIdToken(idToken);
    if (tid === MS_CONSUMER_TENANT_ID) return 'personal';
    if (tid) return 'work';
    if (idToken && !looksLikeJwt(idToken)) return 'personal';
    const p = profile || {};
    if (graphIdMeansPersonal(p.id)) return 'personal';
    const upn = String(p.userPrincipalName || '').toLowerCase();
    if (upn.indexOf('#ext#') >= 0) return 'work';
    const mail = String(p.mail || '').toLowerCase();
    if (mail.indexOf('#ext#') >= 0) return 'work';
    const guid = String(p.id == null ? '' : p.id).trim();
    if (!tid && guid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid)) return 'unknown';
    if (!idToken && (/@gmail\.com$/i.test(upn) || /@gmail\.com$/i.test(mail))) return 'personal';
    return 'unknown';
  }

  function primaryMicrosoftEmail(account) {
    const fields = [account && account.userPrincipalName, account && account.mail, account && account.address];
    for (let i = 0; i < fields.length; i++) {
      const raw = String(fields[i] || '').trim().toLowerCase();
      if (!raw || raw.indexOf('@') < 0) continue;
      return raw;
    }
    return '';
  }

  function isPersonalMicrosoftAccount(account) {
    if (account && account.microsoftAccountKind === 'personal') return true;
    if (account && account.microsoftAccountKind === 'unknown') return true;
    if (account && account.microsoftAccountKind === 'work') return false;
    const token = account && account.idToken;
    const profile = account && account.profile ? account.profile : account;
    if (token || profile) {
      const kind = resolveMicrosoftAccountKind(token, profile);
      return kind === 'personal' || kind === 'unknown';
    }
    return false;
  }

  function isWorkMicrosoftAccount(account) {
    if (account && account.microsoftAccountKind === 'work') return true;
    if (account && (account.microsoftAccountKind === 'personal' || account.microsoftAccountKind === 'unknown')) return false;
    const token = account && account.idToken;
    const profile = account && account.profile ? account.profile : account;
    if (token || profile) return resolveMicrosoftAccountKind(token, profile) === 'work';
    return false;
  }

  function optionalScopesForAccount(account) {
    const out = Object.assign({}, MICROSOFT_OPTIONAL_SCOPES);
    if (!isWorkMicrosoftAccount(account)) {
      delete out.planner;
      delete out.teamsChat;
    }
    return out;
  }

  function hasPlannerGroupScope(grantedScopes) {
    return hasScopes(grantedScopes, [PLANNER_GROUP_SCOPE]);
  }

  // C1 consent helper for M8 Planner (card wiring is another agent). Never requests on personal accounts.
  function plannerAccess(account, grantedScopes) {
    if (isPersonalMicrosoftAccount(account)) return 'personal';
    if (hasPlannerGroupScope(grantedScopes)) return 'granted';
    return 'needs-consent';
  }

  function plannerShowsPlannerCard(access) {
    return access === 'granted' || access === 'needs-consent';
  }

  function plannerShouldRequestGroupConsent(access) {
    return access === 'needs-consent';
  }

  const PLANNER_ADMIN_CONSENT_RE = /AADSTS65001|AADSTS90094|admin_consent|admin consent required/i;

  function plannerConsentOutcome(authResult) {
    const r = authResult || {};
    if (r.ok === true) return 'granted';
    const blob = [r.error, r.description, r.aadsts, r.reason].filter(Boolean).join(' ');
    if (PLANNER_ADMIN_CONSENT_RE.test(blob)) return 'admin-required';
    return 'denied';
  }

  // Host uses this after consent: personal → To Do silently; admin/denied → To Do with explanation (display-copy).
  function plannerExecutionRoute(access, consentOutcome) {
    const accessState = access || 'needs-consent';
    const outcome = consentOutcome || null;
    if (accessState === 'personal') {
      return { destination: 'todo', requestGroupConsent: false, showPlannerCard: false, explainTodoFallback: false };
    }
    if (accessState === 'granted' || outcome === 'granted') {
      return { destination: 'planner', requestGroupConsent: false, showPlannerCard: true, explainTodoFallback: false };
    }
    if (accessState === 'needs-consent' && !outcome) {
      return { destination: 'planner', requestGroupConsent: true, showPlannerCard: true, explainTodoFallback: false };
    }
    if (outcome === 'admin-required' || outcome === 'denied') {
      return { destination: 'todo', requestGroupConsent: false, showPlannerCard: false, explainTodoFallback: true };
    }
    return { destination: 'todo', requestGroupConsent: false, showPlannerCard: false, explainTodoFallback: false };
  }

  // Exactly one permission step per ecosystem id.
  function stepsFor(ecoId) {
    const id = normalizeEco(ecoId);
    if (id === 'google') {
      return {
        steps: [{ type: 'google-ecosystem', includeGrantedScopes: true }],
        dropped: ECOSYSTEMS.indexOf(id) < 0 ? [ecoId] : []
      };
    }
    if (id === 'microsoft') {
      return {
        steps: [{ type: 'microsoft-ecosystem', scopes: microsoftScopes() }],
        dropped: []
      };
    }
    if (id === 'meta') {
      return {
        steps: [{ type: 'meta-host-permissions', origins: META_ORIGINS.slice() }],
        dropped: []
      };
    }
    return { steps: [], dropped: [ecoId] };
  }

  function catalog() {
    return OFFICE_CATALOG.map((row) => Object.assign({}, row));
  }

  // Connect-3 tool lines (design/connect-3/index.html). Office names come from catalog().
  const CONNECT_SCREEN_TOOLS = {
    he: {
      google: ['Gmail', 'יומן ו-<bdi>Meet</bdi>', 'משימות', 'Drive', 'Docs', 'Sheets', 'Slides'],
      meta: ['WhatsApp', 'Messenger', 'Instagram']
    },
    en: {
      google: ['Gmail', 'Calendar & Meet', 'Tasks', 'Drive', 'Docs', 'Sheets', 'Slides'],
      meta: ['WhatsApp', 'Messenger', 'Instagram']
    }
  };

  function microsoftConnectTools(lang) {
    const office = catalog().map((row) => row.label);
    const word = office.find((l) => l === 'Word') || 'Word';
    const excel = office.find((l) => l === 'Excel') || 'Excel';
    const ppt = office.find((l) => l === 'PowerPoint') || 'PowerPoint';
    const onenote = office.find((l) => l === 'OneNote') || 'OneNote';
    const planner = office.find((l) => l === 'Planner') || 'Planner';
    if (lang === 'en') {
      return ['Outlook', 'Calendar', 'To Do', 'OneDrive', word, excel, ppt, 'Teams', onenote, planner];
    }
    return ['Outlook', 'יומן', 'To Do', 'OneDrive', word, excel, ppt, 'Teams', onenote, planner];
  }

  function connectScreenTools(ecoId, lang) {
    const L = lang === 'en' ? 'en' : 'he';
    const id = normalizeEco(ecoId);
    if (id === 'microsoft') return microsoftConnectTools(L);
    const pack = CONNECT_SCREEN_TOOLS[L] || CONNECT_SCREEN_TOOLS.he;
    if (id === 'google') return pack.google.slice();
    if (id === 'meta') return pack.meta.slice();
    return [];
  }

  function connectorIds() {
    return { google: 'googleTasks', microsoft: 'microsoft', meta: 'meta' };
  }

  function googleRow(googleTasksStatus, extras) {
    const st = googleTasksStatus || {};
    const connected = Boolean(st.connected);
    const partial = Boolean(st.needsReconnect || st.warning);
    return {
      connected: connected && !partial,
      partial: connected && partial,
      needsReconnect: Boolean(st.needsReconnect),
      detail: st.detail || null
    };
  }

  function microsoftRow(auth, sync, now) {
    if (!auth || !auth.token || !auth.token.accessToken) {
      return { connected: false, partial: false, needsReconnect: false, detail: null };
    }
    const Auth = (typeof FlowOutlookAuth !== 'undefined' ? FlowOutlookAuth : null)
      || (typeof globalThis !== 'undefined' ? globalThis.FlowOutlookAuth : null);
    const face = Auth && typeof Auth.microsoftConnection === 'function'
      ? Auth.microsoftConnection(auth, sync, now)
      : 'missing';
    if (face === 'missing') return { connected: false, partial: false, needsReconnect: false, detail: null };
    if (face === 'expired' || face === 'missing-scope') {
      return { connected: false, partial: true, needsReconnect: face === 'expired', detail: face };
    }
    const granted = scopeNames((auth.token && auth.token.grantedScopes) || auth.requestedScopes);
    const Cal = (typeof FlowOutlookCalendar !== 'undefined' ? FlowOutlookCalendar : null)
      || (typeof globalThis !== 'undefined' ? globalThis.FlowOutlookCalendar : null);
    if (Cal && typeof Cal.scopesFromToken === 'function') {
      const fromTok = Cal.scopesFromToken(auth.token);
      if (fromTok && fromTok.length) granted.splice(0, granted.length, ...fromTok);
    }
    const need = microsoftRequiredScopes();
    const full = hasScopes(granted, need);
    return {
      connected: full,
      partial: !full,
      needsReconnect: false,
      detail: full ? 'Microsoft' : 'partial'
    };
  }

  function metaRow(granted) {
    const on = Boolean(granted);
    return { connected: on, partial: false, needsReconnect: false, detail: on ? 'Meta' : null };
  }

  function statusSnapshot(input) {
    const bag = input || {};
    const now = typeof bag.now === 'number' ? bag.now : Date.now();
    return {
      google: googleRow(bag.googleTasks, bag),
      microsoft: microsoftRow(bag.outlookAuth, bag.outlookSync, now),
      meta: metaRow(bag.metaGranted)
    };
  }

  function disconnectTargets(ecoId) {
    const id = normalizeEco(ecoId);
    if (id === 'google') return ['googleTasks'];
    if (id === 'microsoft') return ['microsoft'];
    if (id === 'meta') return ['meta'];
    return [];
  }

  return {
    ECOSYSTEMS: ECOSYSTEMS,
    MICROSOFT_SCOPES: microsoftScopes(),
    microsoftScopes: microsoftScopes,
    microsoftOptionalScopes: MICROSOFT_OPTIONAL_SCOPES,
    META_ORIGINS: META_ORIGINS.slice(),
    PKCE_REFRESH_INTERFACE: PKCE_REFRESH_INTERFACE,
    catalog: catalog,
    connectScreenTools: connectScreenTools,
    stepsFor: stepsFor,
    connectorIds: connectorIds,
    normalizeEco: normalizeEco,
    statusSnapshot: statusSnapshot,
    disconnectTargets: disconnectTargets,
    microsoftRequiredScopes: microsoftRequiredScopes,
    microsoftConsentScopes: microsoftConsentScopes,
    optionalScopesForAccount: optionalScopesForAccount,
    isWorkMicrosoftAccount: isWorkMicrosoftAccount,
    hasScopes: hasScopes,
    scopeNames: scopeNames,
    plannerAccess: plannerAccess,
    plannerShowsPlannerCard: plannerShowsPlannerCard,
    plannerShouldRequestGroupConsent: plannerShouldRequestGroupConsent,
    plannerConsentOutcome: plannerConsentOutcome,
    plannerExecutionRoute: plannerExecutionRoute,
    isPersonalMicrosoftAccount: isPersonalMicrosoftAccount,
    resolveMicrosoftAccountKind: resolveMicrosoftAccountKind,
    microsoftOwnAddresses: microsoftOwnAddresses,
    tenantIdFromIdToken: tenantIdFromIdToken,
    MS_CONSUMER_TENANT_ID: MS_CONSUMER_TENANT_ID
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowConnectEcosystem };
else if (typeof globalThis !== 'undefined') globalThis.FlowConnectEcosystem = FlowConnectEcosystem;
