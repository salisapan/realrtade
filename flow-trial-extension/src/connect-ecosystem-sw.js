// Service-worker wiring for C1 connect per ecosystem. Uses core/connect-ecosystem.js.
import { GOOGLE_EVER_CONNECTED_STORAGE_KEY, GOOGLE_WEB_AUTH_STORAGE_KEY, googleRedirectUriForExtension, googleOAuthScopesFrom } from './google-web-auth.js';

const OUTLOOK_AUTH_KEY = 'outlookAuth';
const OUTLOOK_STATE_KEY = 'outlookSync';
const OUTLOOK_GRAPH_ORIGINS = ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'];
const OUTLOOK_OWA_ORIGINS = ['https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'];

function eco() {
  return globalThis.FlowConnectEcosystem || null;
}

async function metaGranted() {
  const Meta = globalThis.FlowMetaConsent;
  const origins = (eco() && eco().META_ORIGINS) || (Meta && Meta.ORIGINS) || [];
  if (!origins.length || !chrome.permissions || typeof chrome.permissions.contains !== 'function') return false;
  try { return await chrome.permissions.contains({ origins: origins }); } catch (e) { return false; }
}

async function connectMetaEcosystem() {
  const E = eco();
  const origins = (E && E.META_ORIGINS) || [];
  if (!origins.length) return { ok: false, reason: 'not-configured' };
  const granted = await new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: origins }, (g) => resolve(Boolean(g)));
    } catch (e) { resolve(false); }
  });
  if (!granted) return { ok: false, reason: 'permission-denied' };
  return { ok: true, partial: false };
}

async function outlookFetchProfile(token) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName,otherMails,proxyAddresses', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch (e) { return null; }
}

function outlookAuthDeps(launch) {
  return {
    fetch: (u, i) => fetch(u, i),
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: (b) => crypto.subtle.digest('SHA-256', b),
    launch: launch
  };
}

async function connectMicrosoftEcosystem(launchInteractive, deps) {
  const E = eco();
  const A = globalThis.FlowOutlookAuth;
  const cfg = globalThis.FlowOutlookConfig;
  if (!E || !A || !cfg || !cfg.CLIENT_ID) return { ok: false, reason: 'not-configured' };
  const origins = OUTLOOK_GRAPH_ORIGINS.concat(OUTLOOK_OWA_ORIGINS);
  const perm = await new Promise((resolve) => {
    try { chrome.permissions.request({ origins: origins }, (g) => resolve(Boolean(g))); } catch (e) { resolve(false); }
  });
  if (!perm) return { ok: false, reason: 'permission-denied' };
  const scopes = E.MICROSOFT_SCOPES;
  const r = await A.signIn(outlookAuthDeps(launchInteractive), cfg, chrome.identity.getRedirectURL(), { scopes: scopes });
  if (!r || !r.ok || !r.token) return { ok: false, reason: (r && r.error) || 'cancelled' };
  const profile = await outlookFetchProfile(r.token.accessToken);
  if (!profile) return { ok: false, reason: 'profile' };
  const primary = String(profile.mail || profile.userPrincipalName || '').toLowerCase();
  if (!primary) return { ok: false, reason: 'profile' };
  const account = { address: primary, name: profile.displayName || null, mail: profile.mail || null, userPrincipalName: profile.userPrincipalName || null };
  const storedProfile = {
    mail: profile.mail, userPrincipalName: profile.userPrincipalName, displayName: profile.displayName || null,
    givenName: profile.givenName || null, surname: profile.surname || null,
    otherMails: profile.otherMails || [], proxyAddresses: profile.proxyAddresses || []
  };
  await chrome.storage.local.set({
    [OUTLOOK_AUTH_KEY]: {
      token: r.token,
      account,
      ownAddresses: [primary],
      requestedScopes: scopes,
      profile: storedProfile,
      ecosystem: true
    },
    [OUTLOOK_STATE_KEY]: { needsSignIn: false, error: null }
  });
  const granted = E.scopeNames(r.token.grantedScopes || scopes);
  const partial = !E.hasScopes(granted, E.microsoftRequiredScopes());
  if (typeof deps.enableSurface === 'function') {
    try { await deps.enableSurface('outlook'); } catch (e) { /* panel may enable */ }
  }
  return { ok: true, partial: partial };
}

async function disconnectMicrosoftEcosystem() {
  await chrome.storage.local.remove([OUTLOOK_AUTH_KEY, OUTLOOK_STATE_KEY, 'outlookPending']);
  try {
    await chrome.permissions.remove({ origins: OUTLOOK_GRAPH_ORIGINS.concat(OUTLOOK_OWA_ORIGINS) });
  } catch (e) { /* token cleared */ }
  try { await chrome.runtime.sendMessage({ type: 'flow:surface-disable', id: 'outlook' }); } catch (e) { /* ignore */ }
  return { ok: true };
}

async function disconnectMetaEcosystem() {
  const Meta = globalThis.FlowMetaConsent;
  if (Meta && typeof Meta.disconnect === 'function') return Meta.disconnect(chrome);
  const origins = (eco() && eco().META_ORIGINS) || [];
  if (!origins.length) return { ok: false };
  return new Promise((resolve) => {
    try { chrome.permissions.remove({ origins: origins }, (ok) => resolve({ ok: ok !== false })); }
    catch (e) { resolve({ ok: false }); }
  });
}

async function ecosystemStatusExtras(bag) {
  const E = eco();
  if (!E) return {};
  return E.statusSnapshot({
    googleTasks: bag.googleTasks,
    outlookAuth: bag.outlookAuth,
    outlookSync: bag.outlookSync,
    metaGranted: await metaGranted(),
    now: Date.now()
  });
}

export async function connectEcosystemConnector(connectorId, deps) {
  const E = eco();
  const id = E ? E.normalizeEco(connectorId) : connectorId;
  if (id === 'google') {
    if (typeof deps.connectGoogleTasks !== 'function') return { ok: false, reason: 'not-configured' };
    await deps.connectGoogleTasks(true);
    const bag = await chrome.storage.local.get(['googleTasksAuth', GOOGLE_WEB_AUTH_STORAGE_KEY]);
    const partial = Boolean(bag.googleTasksAuth && !bag[GOOGLE_WEB_AUTH_STORAGE_KEY]);
    return { ok: true, partial: partial };
  }
  if (id === 'microsoft') return connectMicrosoftEcosystem(deps.launchInteractive, deps);
  if (id === 'meta') return connectMetaEcosystem();
  return { ok: false, reason: 'connector-not-live' };
}

export async function disconnectEcosystemConnector(connectorId, deps) {
  const E = eco();
  const id = E ? E.normalizeEco(connectorId) : connectorId;
  if (id === 'google' && typeof deps.disconnectConnector === 'function') return deps.disconnectConnector('googleTasks');
  if (id === 'microsoft') return disconnectMicrosoftEcosystem();
  if (id === 'meta') return disconnectMetaEcosystem();
  return { ok: false };
}

export { ecosystemStatusExtras, metaGranted };
