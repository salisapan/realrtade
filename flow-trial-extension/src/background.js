// Service worker. Owns everything a content script must not do itself: holding
// credentials, talking to third-party APIs, and performing the one write per
// click that this product exists for.
//
// Six connectors are wired up here, but only two are meant to be on the
// onboarding path for the MVP: Google Tasks (the default — sign in with the
// Google account already open, zero setup) and Notion (a fallback for anyone
// who'd rather have a database row than a task). HubSpot, Salesforce, Slack,
// and Monday.com are kept working but no longer promoted — they solve a
// team's CRM-hygiene problem, which is a real but different product from
// "don't let this personal commitment slip." Re-promote them once Google
// Tasks + Notion have proven the core loop, not before.
//
//   Google Tasks authenticates via chrome.identity.getAuthToken — Chrome's own
//   Google account chooser, driven by an OAuth Client ID registered for this
//   extension. No server-side exchange, no Client Secret, because Chrome
//   itself is the OAuth client.
//
//   Notion authenticates with an internal integration token the user creates
//   themselves, so there is no app registration, no review queue and no
//   server-side secret anywhere in the path.
//
//   HubSpot, Salesforce, Slack and Monday.com all use OAuth, which requires a
//   registered app whose Client Secret must never ship inside an extension.
//   Each secret lives only as a Netlify environment variable read by that
//   connector's own exchange (and, where the platform issues one, refresh)
//   function. The public Client IDs are read from config/oauth.public.js —
//   the same way a GA4 measurement ID is public — and stay placeholder
//   strings until the owner pastes real ones. See docs/SETUP.md.
//
// Every write path is deliberately additive and conservative: it only ever
// writes to something that already exists — an existing matching Contact, a
// channel or board the user names — never creating or editing a Contact,
// Deal, or item beyond the one new record. Each returns enough information
// to undo it. Nothing here ever edits or deletes something the user already
// had.

import { OAUTH_PUBLIC, publicClientId } from '../config/oauth.public.js';

const HUBSPOT_CLIENT_ID = publicClientId(OAUTH_PUBLIC.hubspotClientId);

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';
const HUBSPOT_API = 'https://api.hubapi.com';
const EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-exchange';
const REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-refresh';

const SALESFORCE_CLIENT_ID = publicClientId(OAUTH_PUBLIC.salesforceClientId);
// login.salesforce.com is the standard entry point and redirects sandbox/My
// Domain orgs correctly on its own; instance_url (returned by the token
// exchange) is what every API call after that actually uses.
const SALESFORCE_AUTH_BASE = 'https://login.salesforce.com/services/oauth2/authorize';
const SALESFORCE_SCOPES = 'api refresh_token';
const SALESFORCE_API_VERSION = 'v59.0';
const SF_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-exchange';
const SF_REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-refresh';

const SLACK_CLIENT_ID = publicClientId(OAUTH_PUBLIC.slackClientId);
const SLACK_AUTH_BASE = 'https://slack.com/oauth/v2/authorize';
// chat:write.public lets the bot post to public channels without an explicit
// /invite first — the closest a bot token gets to Notion's zero-friction feel.
const SLACK_SCOPES = 'chat:write,chat:write.public';
const SLACK_API = 'https://slack.com/api';
const SLACK_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/slack-oauth-exchange';

const MONDAY_CLIENT_ID = publicClientId(OAUTH_PUBLIC.mondayClientId);
const MONDAY_AUTH_BASE = 'https://auth.monday.com/oauth2/authorize';
const MONDAY_API = 'https://api.monday.com/v2';
const MONDAY_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/monday-oauth-exchange';
const MONDAY_REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/monday-oauth-refresh';

// HubSpot's documented default association type ID for "note to contact". If it
// ever changes, note creation fails loudly with a 4xx rather than silently
// writing to the wrong place.
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;

// TODO(owner): create an OAuth Client ID in Google Cloud Console (APIs &
// Services > Credentials > Create Credentials > OAuth client ID > Chrome
// Extension, using this extension's ID — computable from the "key" field
// above) and paste it into manifest.json's oauth2.client_id, replacing this
// same placeholder string. Until then Google Tasks reports itself
// unconfigured, same policy as the four OAuth connectors above.
const GOOGLE_TASKS_CLIENT_ID_PLACEHOLDER = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const GLANCE_TASK_LIST_TITLE = 'Glance';
// Calendar and Gmail share the exact same OAuth grant as Tasks — one
// chrome.identity token, requested with every scope in
// manifest.json's oauth2.scopes at once — so there is one "connect Google"
// step for the whole execution layer.
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
// The Picker API key itself (a second, separate Google Cloud credential
// from the OAuth Client ID above) lives only in picker/picker.js — that
// page is what calls setDeveloperKey(), and there's nothing for this file
// to do with the key itself, only with the OAuth-authed file access above.

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Every write lands in a shared Notion database or a shared CRM contact —
// somewhere a teammate who never installed Flow will see it. One quiet,
// factual line crediting the tool (not a banner, not a plug) is the entire
// distribution channel this trial has: read organically by exactly the
// person it would actually help, at the moment they're already looking at
// proof it works.
// One url per shared destination rather than one shared ATTRIBUTION_URL —
// this file's own comment above already calls this line "this trial's
// entire distribution channel," and a single generic ?ref=note code meant
// every one of those five channels was pooled into one number with no way
// to tell a HubSpot teammate's click from a Slack teammate's. The url
// itself still resolves to the exact same page either way; only the query
// string differs, so nothing about what a reader sees or where they land
// changes — this is purely which of several already-built exposure
// surfaces is worth building on next becoming answerable instead of guessed.
function attributionUrl(surface) {
  return 'https://theflow-ai.com/trial.html?ref=' + surface;
}
const ATTRIBUTION_TEXT = 'Logged by Glance — theflow-ai.com/trial';

// Docks the setup/Open/Activity UI to the side of the browser window instead
// of the small popover a plain default_popup gives — the toolbar icon click
// now opens the same popup/popup.html content as a persistent side panel
// (stays open across clicks elsewhere, same shape as Claude's own Cowork
// panel) rather than a dropdown that vanishes on blur. manifest.json no
// longer declares action.default_popup at all — once this behavior is set,
// a default_popup would just be silently unreachable dead weight, so it was
// removed rather than left stale next to this. This runs unconditionally at
// service-worker startup, not gated behind onInstalled, so it re-applies
// every time the service worker wakes up, the same pattern Chrome's own
// samples use.
//
// Guarded, not a bare top-level call: chrome.sidePanel itself (not just
// setPanelBehavior's promise) can be undefined — an older Chrome build, or
// any timing edge case in how the new sidePanel permission gets applied.
// Accessing .setPanelBehavior on undefined throws SYNCHRONOUSLY, and a
// synchronous throw at the top level of this file stops every line below it
// from ever running — every chrome.runtime.onMessage handler this file
// registers (flow:execute-action, flow:classify-remote, flow:undo-action,
// all of it) would silently never exist. A cosmetic side-panel upgrade must
// never be able to take the whole write/execution engine down with it.
try {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
  }
} catch (error) {
  console.error('[Glance] chrome.sidePanel.setPanelBehavior unavailable — side panel will not open on click, but the rest of the extension is unaffected', error);
}


/* ------------------------------------------------------- stay on this (any page) */
// A right-click on a selection, on ANY page, offers "Glance: stay on this". Nothing is read from the page but the selection the
// person chose and the page's address; both are kept only until the popup asks its one question (core/capture.js, 24 hours).
function ensureCaptureMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'flow-stay-on', title: 'Glance: stay on this', contexts: ['selection'] }, () => void chrome.runtime.lastError);
    });
  } catch (e) { /* the menu is optional */ }
}
function addressWithoutQuery(raw) {
  try { const u = new URL(String(raw || '')); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin + u.pathname : ''; } catch (e) { return ''; }
}
try {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'flow-stay-on') return;
    const text = String(info.selectionText || '').slice(0, 600);
    if (!text.trim()) return;
    await chrome.storage.local.set({ captureNow: { text, pageUrl: addressWithoutQuery(info.pageUrl), at: Date.now() } });
    try { if (tab && tab.id != null && chrome.sidePanel && chrome.sidePanel.open) await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) { /* the popup shows it the next time it opens */ }
  });
} catch (e) { console.error('[Glance] right-click menu unavailable', e); }
chrome.runtime.onInstalled.addListener(() => { ensureCaptureMenu(); });

/* ---------------------------------------------------- other apps (opt-in) */
// Glance starts in Gmail. Another app is added only when the person turns it on in the popup, which asks the browser for that one
// site's permission (an OPTIONAL host permission: the install itself asks for nothing new) and then registers the content scripts for
// it here. Turning it off removes both the scripts and the permission. See docs/multi-platform.md.
const SURFACES = {
  whatsapp: { label: 'WhatsApp Web', origins: ['https://web.whatsapp.com/*'], extra: ['src/whatsapp-parse.js', 'src/content-whatsapp.js'] }
};
// The Gmail-only pieces (chip, sidebar, brief, weekly) are not needed in another app: the follow-up engine and its card are.
const GMAIL_ONLY_SCRIPTS = ['src/content-gmail.js', 'src/sidebar.js', 'src/brief.js', 'src/weekly.js'];

function surfaceScripts(id) {
  const base = (chrome.runtime.getManifest().content_scripts[0].js || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  return base.concat(SURFACES[id].extra);
}

async function registerSurface(id) {
  const def = SURFACES[id];
  if (!def || !chrome.scripting || !chrome.scripting.registerContentScripts) return { ok: false, reason: 'unsupported' };
  const granted = await chrome.permissions.contains({ origins: def.origins });
  if (!granted) return { ok: false, reason: 'no-permission' };
  const script = { id: 'flow-' + id, matches: def.origins, js: surfaceScripts(id), css: ['src/follow.css'], runAt: 'document_idle', persistAcrossSessions: true };
  try { await chrome.scripting.unregisterContentScripts({ ids: [script.id] }); } catch (e) { /* not registered yet */ }
  await chrome.scripting.registerContentScripts([script]);
  return { ok: true };
}

async function readSurfaces() {
  const st = await chrome.storage.local.get({ surfaces: {} });
  return st.surfaces || {};
}

async function enableSurface(id) {
  if (!SURFACES[id]) return { ok: false, reason: 'unknown' };
  const r = await registerSurface(id);
  if (!r.ok) return r;
  const all = await readSurfaces();
  all[id] = { enabled: true, at: Date.now() };
  await chrome.storage.local.set({ surfaces: all });
  return { ok: true };
}

async function disableSurface(id) {
  if (!SURFACES[id]) return { ok: false, reason: 'unknown' };
  try { await chrome.scripting.unregisterContentScripts({ ids: ['flow-' + id] }); } catch (e) { /* already gone */ }
  try { await chrome.permissions.remove({ origins: SURFACES[id].origins }); } catch (e) { /* the browser may refuse; the scripts are gone either way */ }
  const all = await readSurfaces();
  all[id] = { enabled: false, at: Date.now() };
  await chrome.storage.local.set({ surfaces: all });
  const h = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  delete h[id];
  await chrome.storage.local.set({ surfaceHealth: h });
  return { ok: true };
}

// Registered scripts do not survive an extension update, and a person can revoke a permission in the browser's own settings.
async function restoreSurfaces() {
  try {
    const all = await readSurfaces();
    for (const id of Object.keys(all)) {
      if (!all[id] || !all[id].enabled || !SURFACES[id]) continue;
      const r = await registerSurface(id);
      if (!r.ok && r.reason === 'no-permission') { all[id] = { enabled: false, at: Date.now(), revoked: true }; await chrome.storage.local.set({ surfaces: all }); }
    }
  } catch (e) { console.error('[Glance] could not restore the apps that were turned on', e); }
}
restoreSurfaces();
chrome.runtime.onInstalled.addListener(() => { restoreSurfaces(); });

async function surfaceStatus() {
  const surfaces = await readSurfaces();
  const health = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  const out = {};
  for (const id of Object.keys(SURFACES)) {
    out[id] = { label: SURFACES[id].label, enabled: Boolean(surfaces[id] && surfaces[id].enabled), revoked: Boolean(surfaces[id] && surfaces[id].revoked), health: health[id] || null, origins: SURFACES[id].origins };
  }
  return { ok: true, surfaces: out };
}

async function noteSurfaceHealth(id, ok, reason) {
  if (!SURFACES[id]) return { ok: false };
  const h = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  h[id] = { ok: Boolean(ok), reason: ok ? null : String(reason || 'unknown').slice(0, 60), at: Date.now() };
  await chrome.storage.local.set({ surfaceHealth: h });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
  // A fresh install (or an update inheriting a stale badge from a killed
  // service worker) should never show a leftover number before anything has
  // actually been computed — see updateBadge's own comment for why this file
  // never computes the count itself.
  updateBadge(0);
});

/* -------------------------------------------------------- persistent badge */
// The Subtle Persistent Indicator: a small number on the extension icon,
// never a notification, never a popup of its own. Deliberately NOT computed
// here — background.js has never loaded storage.js (see getInstallId's own
// comment below), and re-deriving "how many processes are still open" a
// second way in this file is exactly how two definitions of "pending"
// quietly drift apart, the same failure storage.js's own writeCountsFrom/
// closeCountsFrom comments warn about. Instead, any surface that already
// has FlowStorage loaded — the Gmail content script today, the popup's Open
// tab, a future Calendar or Drive content script — recomputes
// FlowStorage.getPending().length itself and posts it here. This file's only
// job is turning that one number into a badge.
function updateBadge(count) {
  const n = count > 0 ? count : 0;
  chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' });
  if (n) chrome.action.setBadgeBackgroundColor({ color: '#123ccb' });
}

// One optional morning OS notification. The text and the count are a
// snapshot the Gmail tab already published (glanceStillOpenDigest). This
// file does not re-rank mail. At most one ping per local day, and none
// when Gmail itself is the active tab — the Brief already opened there.
// Clicking it asks that tab to open the same list. Dismissing it records
// a single "annoying" flag the content script folds into Still Open metrics.
const STILL_OPEN_NOTIFY_ID = 'glance-still-open';
const STILL_OPEN_DIGEST_MAX_AGE = 36 * 60 * 60 * 1000;

function scheduleStillOpenMorning() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  try {
    const created = chrome.alarms.create('glance-still-open-morning', { when: next.getTime() });
    if (created && created.catch) created.catch((e) => console.error('[Glance] could not schedule the morning list', e));
  } catch (e) {
    console.error('[Glance] could not schedule the morning list', e);
  }
}

function stillOpenNotificationClick() {
  chrome.storage.local.set({ glanceStillOpenOpenBrief: true });
  const openInbox = () => {
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: 'https://mail.google.com/mail/u/0/#inbox' });
  };
  if (!chrome.tabs || !chrome.tabs.query) { openInbox(); return; }
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) { openInbox(); return; }
    chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null && chrome.windows && chrome.windows.update) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
    if (chrome.tabs.sendMessage) {
      chrome.tabs.sendMessage(tab.id, { type: 'flow:still-open-show' }, () => {
        if (chrome.runtime.lastError) { /* the storage flag opens the list on the next load */ }
      });
    }
  });
}

async function maybeNotifyStillOpen() {
  if (!chrome.notifications || !chrome.notifications.create || !chrome.storage || !chrome.tabs) return;
  const data = await chrome.storage.local.get(['glanceStillOpenDigest', 'glanceStillOpenNotifiedDate']);
  const digest = data.glanceStillOpenDigest;
  if (!digest || !digest.count || !digest.text) return;
  if (Date.now() - (digest.updatedAt || 0) > STILL_OPEN_DIGEST_MAX_AGE) return;
  const today = new Date().toDateString();
  if (data.glanceStillOpenNotifiedDate === today) return;
  const active = await chrome.tabs.query({ active: true, url: 'https://mail.google.com/*' });
  if (active && active.length) return;
  await chrome.storage.local.set({ glanceStillOpenNotifiedDate: today });
  chrome.notifications.create(STILL_OPEN_NOTIFY_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Glance',
    message: String(digest.text)
  });
}

try {
  scheduleStillOpenMorning();
  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || alarm.name !== 'glance-still-open-morning') return;
      scheduleStillOpenMorning();
      maybeNotifyStillOpen().catch((e) => console.error('[Glance] morning notification failed', e));
    });
  }
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener((id) => {
      if (id !== STILL_OPEN_NOTIFY_ID) return;
      stillOpenNotificationClick();
    });
  }
  if (chrome.notifications && chrome.notifications.onClosed) {
    chrome.notifications.onClosed.addListener((id, byUser) => {
      if (id !== STILL_OPEN_NOTIFY_ID || !byUser) return;
      chrome.storage.local.set({ glanceStillOpenNotifyDismissed: Date.now() });
    });
  }
} catch (e) {
  console.error('[Glance] morning Still Open notification is unavailable', e);
}

/* ------------------------------------------------------------------ shared */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// judgment.js's evaluate()/factsOnly() both compute a human-readable
// f.dateText onto the facts object they return (via a private humanDate()
// helper) — but intent.js's `facts` is extract.js's raw output re-exposed
// as-is, which never carries that field. Rather than require every future
// caller to remember to pre-populate dateText, factLines() falls back to
// computing the same "Mon D" / "Mon D, YYYY" shape itself. This duplicates
// intent.js's own humanDateFallback() — same justification intent.js gives
// for duplicating judgment.js's private humanDate(): kept in sync by being
// this small.
function humanDateFallback(date) {
  if (!date || !date.iso) return date ? date.raw : null;
  const parts = date.iso.split('-');
  const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ' ' + dt.getFullYear());
}

// Longest a quoted sentence gets before the record itself becomes harder to
// scan than the email it's standing in for — same spirit as the 200-char
// title caps elsewhere in this file, just roomier since this is a notes
// field, not a title.
const QUOTE_MAX_CHARS = 400;

// The lines a human would want to see on the record six months from now.
// Amount/Date/From/Subject/link answer "what kind of thing is this and
// where did it come from" — none of them are the actual substance of what
// was decided. That's entities.what/requestWhat (intent.js's classify()
// output) — the literal sentence Do It was proposed for. Notion's write
// path already includes this as its own "Quote" field (see
// product-architecture.md's worked examples); Google Tasks never did,
// because buildActionPayload() in content-gmail.js never forwarded
// `entities` to this write path at all — only `facts`. A task with a
// title and a date but no quote answers "when" and "how much" while
// leaving out "what was actually said," which is the one thing that makes
// the record readable without reopening Gmail.
function factLines(p) {
  const f = p.facts || {};
  const out = [];
  if (f.moneyText) out.push(['Amount', f.moneyText]);
  const dateText = f.dateText || humanDateFallback(f.date);
  if (dateText) out.push(['Date', dateText + (f.date && f.date.iso && f.date.iso !== dateText ? ' (' + f.date.iso + ')' : '')]);
  if (p.senderName || p.senderEmail) out.push(['From', [p.senderName, p.senderEmail && '<' + p.senderEmail + '>'].filter(Boolean).join(' ')]);
  if (p.subject) out.push(['Subject', p.subject]);
  const e = p.entities || {};
  const quote = e.what || e.requestWhat;
  if (quote) {
    const trimmed = quote.length > QUOTE_MAX_CHARS ? quote.slice(0, QUOTE_MAX_CHARS - 1) + '…' : quote;
    out.push(['Quote', '"' + trimmed + '"']);
  }
  return out;
}

// chrome.identity.launchWebAuthFlow already limits the callback to this
// extension's own redirect URL, but that alone doesn't tie a specific
// callback to the specific request that opened it. A stale authorization
// code sitting in browser history, or a redirect crafted by anything other
// than the provider's real consent screen, would otherwise be indistinguishable
// from a legitimate one. The unpredictable value below has to round-trip
// unchanged for the callback to be trusted — the standard OAuth defense for
// exactly this gap (RFC 6749 §10.12), and previously missing on all four of
// these connectors.
function randomOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Runs one OAuth authorization-code handshake and returns the verified code.
// Centralized so the state round-trip is identical across all four OAuth
// connectors instead of being copy-pasted (and easy to silently omit) four
// separate times.
async function runOAuthFlow(authUrlBase, providerName) {
  const state = randomOAuthState();
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrlBase + '&state=' + encodeURIComponent(state),
    interactive: true
  });
  const params = new URL(resultUrl).searchParams;
  if (params.get('state') !== state) {
    throw new Error(providerName + ' authorization could not be verified. Please try connecting again.');
  }
  const code = params.get('code');
  if (!code) throw new Error(providerName + ' did not return an authorization code.');
  return code;
}

/* ----------------------------------------------------------------- HubSpot */

async function getHubspotAuth() {
  const { hubspotAuth } = await chrome.storage.local.get('hubspotAuth');
  return hubspotAuth || null;
}

async function saveHubspotAuth(tokenResponse, extra) {
  const prev = (await getHubspotAuth()) || {};
  await chrome.storage.local.set({
    hubspotAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Date.now() + tokenResponse.expires_in * 1000 - 60000 // 60s safety margin
    }, extra || {})
  });
}

// The portal id turns a bare contact id into a link somebody can actually click.
async function hubspotPortalId(token) {
  try {
    const res = await fetch(HUBSPOT_API + '/oauth/v1/access-tokens/' + encodeURIComponent(token));
    if (!res.ok) return null;
    const data = await res.json();
    return data.hub_id || null;
  } catch (e) {
    return null;
  }
}

async function connectHubspot() {
  if (!HUBSPOT_CLIENT_ID) {
    throw new Error('HubSpot isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    HUBSPOT_AUTH_BASE +
    '?client_id=' + encodeURIComponent(HUBSPOT_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(HUBSPOT_SCOPES);

  const code = await runOAuthFlow(authUrl, 'HubSpot');

  const res = await fetch(EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HubSpot connection failed.');
  const portalId = await hubspotPortalId(data.access_token);
  await saveHubspotAuth(data, { portalId });
  return true;
}

async function hubspotToken() {
  const auth = await getHubspotAuth();
  if (!auth) return null;
  if (Date.now() < auth.expires_at) return auth.access_token;

  const res = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: auth.refresh_token })
  });
  const data = await res.json();
  if (!res.ok) return null; // refresh failed — caller treats this as "not connected"
  await saveHubspotAuth(data);
  return data.access_token;
}

async function hubspotFindContactByEmail(token, email) {
  const res = await fetch(
    HUBSPOT_API + '/crm/v3/objects/contacts/' + encodeURIComponent(email) + '?idProperty=email',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HubSpot contact lookup failed: ' + res.status);
  return res.json();
}

function hubspotNoteBody(p) {
  const rows = factLines(p).map((r) => '<li><b>' + esc(r[0]) + ':</b> ' + esc(r[1]) + '</li>').join('');
  return [
    '<p><b>' + esc(p.label) + '</b></p>',
    rows ? '<ul>' + rows + '</ul>' : '',
    p.facts && p.facts.quote ? '<blockquote>' + esc(p.facts.quote) + '</blockquote>' : '',
    p.threadUrl ? '<p><a href="' + esc(p.threadUrl) + '">Open the original email in Gmail</a></p>' : '',
    '<p><i>Logged by <a href="' + attributionUrl('hubspot') + '">Glance</a> — one click, from the message itself.</i></p>'
  ].filter(Boolean).join('');
}

// Deliberately conservative: it only ever logs a Note on an EXISTING matching
// Contact. It never creates a Contact, never edits a deal, never sends anything.
async function hubspotWrite(p) {
  const token = await hubspotToken();
  if (!token) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'no-matching-contact' };

  const contact = await hubspotFindContactByEmail(token, p.senderEmail);
  if (!contact) return { ok: false, reason: 'no-matching-contact', senderEmail: p.senderEmail };

  const res = await fetch(HUBSPOT_API + '/crm/v3/objects/notes', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { hs_note_body: hubspotNoteBody(p), hs_timestamp: Date.now() },
      associations: [{
        to: { id: contact.id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID }]
      }]
    })
  });
  if (!res.ok) throw new Error('HubSpot note creation failed: ' + res.status);
  const note = await res.json();

  const auth = await getHubspotAuth();
  const url = auth && auth.portalId
    ? 'https://app.hubspot.com/contacts/' + auth.portalId + '/contact/' + contact.id
    : null;

  return { ok: true, where: 'HubSpot', target: 'the contact record', ref: { noteId: note.id }, url };
}

async function hubspotUndo(ref) {
  const token = await hubspotToken();
  if (!token || !ref || !ref.noteId) return { ok: false };
  const res = await fetch(HUBSPOT_API + '/crm/v3/objects/notes/' + encodeURIComponent(ref.noteId), {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });
  return { ok: res.ok || res.status === 404 };
}

/* -------------------------------------------------------------- Salesforce */

async function getSalesforceAuth() {
  const { salesforceAuth } = await chrome.storage.local.get('salesforceAuth');
  return salesforceAuth || null;
}

async function saveSalesforceAuth(tokenResponse, extra) {
  const prev = (await getSalesforceAuth()) || {};
  await chrome.storage.local.set({
    salesforceAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || prev.refresh_token,
      instance_url: tokenResponse.instance_url || prev.instance_url
      // Salesforce doesn't return expires_in — access tokens are valid until
      // revoked or the org's session-timeout policy ends them. Refresh
      // reactively on a 401 instead of tracking an expiry we're never told.
    }, extra || {})
  });
}

async function connectSalesforce() {
  if (!SALESFORCE_CLIENT_ID) {
    throw new Error('Salesforce isn’t configured on this build yet — it needs a Consumer Key set by whoever built this extension.');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    SALESFORCE_AUTH_BASE +
    '?response_type=code&client_id=' + encodeURIComponent(SALESFORCE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(SALESFORCE_SCOPES);

  const code = await runOAuthFlow(authUrl, 'Salesforce');

  const res = await fetch(SF_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Salesforce connection failed.');
  await saveSalesforceAuth(data);
  return true;
}

async function salesforceRefresh() {
  const auth = await getSalesforceAuth();
  if (!auth || !auth.refresh_token) return null;
  const res = await fetch(SF_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: auth.refresh_token })
  });
  const data = await res.json();
  if (!res.ok) return null; // refresh failed — caller treats this as "not connected"
  await saveSalesforceAuth(data);
  return getSalesforceAuth();
}

// SOQL's escape character is backslash, so a literal backslash must be
// escaped to \\ BEFORE a literal quote is escaped to \' — escaping in the
// other order (the previous code only escaped quotes, which is order-of-one)
// lets an address containing a backslash immediately before a quote produce
// an unescaped quote that closes the string literal early. senderEmail comes
// straight off Gmail's DOM (content-gmail.js reads the `email` attribute
// Gmail itself sets), so it isn't something this file should treat as
// pre-sanitized. Escaping backslash first, as done here, closes that gap
// without rejecting the (rare but legal) apostrophe in an address's local
// part, e.g. o'brien@example.com.
function soqlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function salesforceFindContactByEmail(auth, email) {
  const soql = "SELECT Id FROM Contact WHERE Email = '" + soqlEscape(email) + "' LIMIT 1";
  const res = await fetch(
    auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/query?q=' + encodeURIComponent(soql),
    { headers: { Authorization: 'Bearer ' + auth.access_token } }
  );
  if (res.status === 401) return 'expired';
  if (!res.ok) throw new Error('Salesforce contact lookup failed: ' + res.status);
  const data = await res.json();
  return (data.records && data.records[0]) || null;
}

function salesforceTaskDescription(p) {
  const lines = factLines(p).map((r) => r[0] + ': ' + r[1]);
  if (p.facts && p.facts.quote) lines.push('"' + p.facts.quote + '"');
  if (p.threadUrl) lines.push('Original email: ' + p.threadUrl);
  lines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('salesforce'));
  return lines.join('\n');
}

// Deliberately conservative, same shape as HubSpot: only ever logs a Task on
// an EXISTING matching Contact. Never creates a Contact, never edits a deal.
async function salesforceWrite(p) {
  let auth = await getSalesforceAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'no-matching-contact' };

  let contact = await salesforceFindContactByEmail(auth, p.senderEmail);
  if (contact === 'expired') {
    auth = await salesforceRefresh();
    if (!auth) return { ok: false, reason: 'not-connected' };
    contact = await salesforceFindContactByEmail(auth, p.senderEmail);
  }
  if (!contact) return { ok: false, reason: 'no-matching-contact', senderEmail: p.senderEmail };

  const res = await fetch(auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/sobjects/Task/', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      WhoId: contact.Id,
      Subject: p.label,
      Description: salesforceTaskDescription(p),
      Status: 'Completed',
      ActivityDate: new Date().toISOString().slice(0, 10)
    })
  });
  if (!res.ok) throw new Error('Salesforce task creation failed: ' + res.status);
  const task = await res.json();

  return {
    ok: true,
    where: 'Salesforce',
    target: 'the contact record',
    ref: { taskId: task.id },
    url: auth.instance_url + '/lightning/r/Contact/' + contact.Id + '/view'
  };
}

async function salesforceUndo(ref) {
  const auth = await getSalesforceAuth();
  if (!auth || !ref || !ref.taskId) return { ok: false };
  const res = await fetch(
    auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/sobjects/Task/' + encodeURIComponent(ref.taskId),
    { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.access_token } }
  );
  return { ok: res.ok || res.status === 404 };
}

/* ------------------------------------------------------------------- Slack */

async function getSlackAuth() {
  const { slackAuth } = await chrome.storage.local.get('slackAuth');
  return slackAuth || null;
}

async function connectSlack(channel) {
  if (!SLACK_CLIENT_ID) {
    throw new Error('Slack isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const channelId = String(channel || '').trim();
  if (!channelId) {
    throw new Error('Paste the channel ID Glance should post to — open the channel in Slack, "View channel details", it’s at the bottom.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    SLACK_AUTH_BASE +
    '?client_id=' + encodeURIComponent(SLACK_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(SLACK_SCOPES);

  const code = await runOAuthFlow(authUrl, 'Slack');

  const res = await fetch(SLACK_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Slack connection failed.');

  await chrome.storage.local.set({
    slackAuth: { access_token: data.access_token, teamName: data.team && data.team.name, channelId }
  });
  return { title: (data.team && data.team.name ? data.team.name + ' ' : '') + '#' + channelId };
}

function slackMessageText(p) {
  const lines = factLines(p).map((r) => '*' + r[0] + ':* ' + r[1]);
  const parts = ['*' + p.label + '*'].concat(lines);
  if (p.facts && p.facts.quote) parts.push('> ' + p.facts.quote);
  if (p.threadUrl) parts.push('<' + p.threadUrl + '|Open the original email in Gmail>');
  parts.push('_<' + attributionUrl('slack') + '|Logged by Glance> — one click, from the message itself._');
  return parts.join('\n');
}

async function slackWrite(p) {
  const auth = await getSlackAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const res = await fetch(SLACK_API + '/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: auth.channelId, text: slackMessageText(p), unfurl_links: false })
  });
  const data = await res.json();
  if (!data.ok) {
    if (data.error === 'invalid_auth' || data.error === 'token_revoked') return { ok: false, reason: 'not-connected' };
    throw new Error('Slack post failed: ' + data.error);
  }
  return { ok: true, where: 'Slack', target: '#' + auth.channelId, ref: { channel: data.channel, ts: data.ts }, url: null };
}

async function slackUndo(ref) {
  const auth = await getSlackAuth();
  if (!auth || !ref || !ref.ts) return { ok: false };
  const res = await fetch(SLACK_API + '/chat.delete', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: ref.channel, ts: ref.ts })
  });
  const data = await res.json();
  return { ok: Boolean(data.ok) };
}

/* --------------------------------------------------------------- Monday.com */

async function getMondayAuth() {
  const { mondayAuth } = await chrome.storage.local.get('mondayAuth');
  return mondayAuth || null;
}

async function saveMondayAuth(tokenResponse, extra) {
  const prev = (await getMondayAuth()) || {};
  await chrome.storage.local.set({
    mondayAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || prev.refresh_token
    }, extra || {})
  });
}

async function connectMonday(boardId) {
  if (!MONDAY_CLIENT_ID) {
    throw new Error('Monday.com isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const board = String(boardId || '').trim();
  if (!board) {
    throw new Error('Paste the board ID Glance should write to — open the board in Monday.com, it’s the number in the URL after /boards/.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    MONDAY_AUTH_BASE +
    '?client_id=' + encodeURIComponent(MONDAY_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri);
  // Monday.com's OAuth scopes are configured on the app itself in the developer
  // console rather than requested via URL parameter (unlike HubSpot/Salesforce/
  // Slack above) — deliberately not adding a &scope= here, since guessing at
  // one would misrepresent what this connector actually requests.

  const code = await runOAuthFlow(authUrl, 'Monday.com');

  const res = await fetch(MONDAY_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Monday.com connection failed.');
  await saveMondayAuth(data, { boardId: board });
  return true;
}

// Monday's API v2 takes the token directly as the Authorization header value
// (no "Bearer " prefix) for both personal tokens and OAuth access tokens —
// a genuine quirk of their API, not a typo.
async function mondayGraphQL(token, query, variables) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error((data.errors[0] && data.errors[0].message) || 'Monday.com API error');
  return data.data;
}

function mondayUpdateBody(p) {
  const lines = factLines(p).map((r) => r[0] + ': ' + r[1]);
  if (p.facts && p.facts.quote) lines.push('"' + p.facts.quote + '"');
  if (p.threadUrl) lines.push('Original email: ' + p.threadUrl);
  lines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('monday'));
  return lines.join('\n');
}

// Deliberately simple, for the same reason Notion writes unmatched facts to
// the page body instead of guessing at columns: one new item named after the
// decision, with the facts attached as an Update (Monday's version of a
// comment/note) rather than matched into board-specific column schema.
async function mondayWrite(p) {
  const auth = await getMondayAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  let item;
  try {
    const created = await mondayGraphQL(
      auth.access_token,
      'mutation($board: ID!, $name: String!) { create_item(board_id: $board, item_name: $name) { id } }',
      { board: auth.boardId, name: p.label }
    );
    item = created.create_item;
  } catch (err) {
    if (/invalid|unauthoriz/i.test(String(err.message))) return { ok: false, reason: 'not-connected' };
    throw err;
  }

  await mondayGraphQL(
    auth.access_token,
    'mutation($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }',
    { item: item.id, body: mondayUpdateBody(p) }
  );

  return { ok: true, where: 'Monday.com', target: 'the board', ref: { itemId: item.id }, url: 'https://view.monday.com/' + item.id };
}

async function mondayUndo(ref) {
  const auth = await getMondayAuth();
  if (!auth || !ref || !ref.itemId) return { ok: false };
  try {
    await mondayGraphQL(auth.access_token, 'mutation($item: ID!) { delete_item(item_id: $item) { id } }', { item: ref.itemId });
    return { ok: true };
  } catch (err) {
    return { ok: false };
  }
}

/* ------------------------------------------------------------ Google Tasks */
//
// The MVP write path: no token to paste, no vendor app to authorize —
// chrome.identity.getAuthToken drives Chrome's own Google account chooser
// against the OAuth Client ID registered in manifest.json's oauth2 key. The
// only thing this needs from the account owner is that one Client ID, not a
// server-side exchange or a Client Secret at all, because Chrome itself is
// the OAuth client here rather than a page Flow has to build.

function googleTasksConfigured() {
  const oauth2 = chrome.runtime.getManifest().oauth2;
  return Boolean(oauth2 && oauth2.client_id && oauth2.client_id !== GOOGLE_TASKS_CLIENT_ID_PLACEHOLDER);
}

// Callback-based even inside an MV3 service worker — there is no Promise
// form of this specific identity method.
function getGoogleAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: Boolean(interactive) }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Google sign-in was closed or denied.'));
        return;
      }
      resolve(token);
    });
  });
}

function removeCachedGoogleAuthToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

// Base-URL-parameterized so Calendar and Gmail can reuse the exact same
// token-fetch-and-401-retry logic instead of each writer function
// duplicating it — this is what Google Tasks' own authed fetch became once
// two more Google APIs needed the identical dance.
async function googleAuthedFetch(baseUrl, path, options) {
  const token = await getGoogleAuthToken(true);
  const doFetch = (t) => fetch(baseUrl + path, Object.assign({}, options, {
    headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, (options && options.headers) || {})
  }));
  const res = await doFetch(token);
  if (res.status !== 401) return res;
  // A cached token can go stale (revoked access from the Google Account
  // permissions page, expired) without Chrome knowing yet — evict it and
  // request a fresh one once before surfacing the failure, the same
  // "refresh once, then fail loudly" shape every OAuth connector above uses.
  await removeCachedGoogleAuthToken(token);
  const freshToken = await getGoogleAuthToken(true);
  return doFetch(freshToken);
}

function googleTasksAuthedFetch(path, options) {
  return googleAuthedFetch(GOOGLE_TASKS_API, path, options);
}

async function getGoogleTasksAuth() {
  const { googleTasksAuth } = await chrome.storage.local.get('googleTasksAuth');
  return googleTasksAuth || null;
}

// Calendar and Gmail Draft have no connect-time bookkeeping of their own —
// they piggyback on whatever Google Tasks' own connect step already
// recorded, since a single chrome.identity grant covers all three scopes.
// "Is Google connected" and "is Google Tasks connected" are the same
// question in this MVP (Google Tasks is the one onboarding step that asks
// for the grant at all — see popup.js's connector filter), so this
// deliberately reads the same storage record rather than inventing a
// second, parallel "connected" flag that could drift out of sync with it.
async function googleConnected() {
  return Boolean(await getGoogleTasksAuth());
}

// Every write lands in the same list, found by title rather than an id
// stashed only in local storage — reinstalling the extension (which clears
// chrome.storage.local) still finds the same "Glance" list next time
// instead of creating a second one.
async function findOrCreateGlanceTaskList() {
  const listRes = await googleTasksAuthedFetch('/users/@me/lists?maxResults=100');
  if (!listRes.ok) throw new Error('Could not read your Google Task lists (' + listRes.status + ').');
  const lists = (await listRes.json()).items || [];
  const existing = lists.find((l) => l.title === GLANCE_TASK_LIST_TITLE);
  if (existing) return existing.id;

  const createRes = await googleTasksAuthedFetch('/users/@me/lists', {
    method: 'POST',
    body: JSON.stringify({ title: GLANCE_TASK_LIST_TITLE })
  });
  if (!createRes.ok) throw new Error('Could not create a Glance list in Google Tasks (' + createRes.status + ').');
  return (await createRes.json()).id;
}

async function connectGoogleTasks() {
  if (!googleTasksConfigured()) {
    throw new Error('Google isn’t configured on this build yet — manifest.json’s oauth2.client_id still needs a real Google OAuth Client ID (see the README’s “Set up Google” section).');
  }
  // interactive:true is the one moment Chrome may show the account chooser
  // or consent screen; every later call in this file passes interactive:true
  // too, but resolves instantly from Chrome's own cache once granted.
  await getGoogleAuthToken(true);
  const taskListId = await findOrCreateGlanceTaskList();
  await chrome.storage.local.set({ googleTasksAuth: { taskListId } });
  return true;
}

function googleTaskTitle(p) {
  const identity = (p.senderName || '').trim();
  return identity ? identity + ' — ' + p.label : p.label;
}

// A date the close is willing to write. Anything else — a month that
// doesn't exist, a bare phrase — stays off the task. A wrong due date is
// a worse failure than no due date.
function isoDateOrNull(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}

function plannedAmount(p) {
  const raw = p.params && p.params.amount;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// The calendar day of the write, in local time — the same comparison
// intent.js uses for "this date is already behind today". p.now is only
// how tests pin that day; a real Do It uses the clock at write time.
function localTodayIso(now) {
  const parsed = now ? new Date(now) : new Date();
  const n = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (v) => String(v).padStart(2, '0');
  return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
}

function dueForTask(value, now) {
  const iso = isoDateOrNull(value);
  if (!iso) return null;
  if (iso < localTodayIso(now)) return null;
  return iso;
}

// The task step's params are the close. facts are the fallback for a
// caller that still only has the extracted record. When both name a date
// that is still ahead (or today), the plan wins — that is the date the
// chip showed. A day already behind today is not a due date from either
// source. A wrong due date is a worse failure than no due date.
function taskClosePayload(p) {
  const params = p.params || {};
  const plannedDue = dueForTask(params.dateIso, p.now);
  const factsDue = dueForTask(p.facts && p.facts.date && p.facts.date.iso, p.now);
  const dueIso = plannedDue || factsDue;
  const fromPlan = plannedAmount(p);
  const amount = fromPlan || ((p.facts && p.facts.moneyText) || null);
  const entities = Object.assign({}, p.entities);
  const plannedWhat = typeof params.what === 'string' ? params.what.trim() : '';
  if (!entities.what && !entities.requestWhat && plannedWhat) entities.what = plannedWhat;
  const facts = Object.assign({}, p.facts);
  if (fromPlan) facts.moneyText = fromPlan;
  // Notes follow the due that will actually be written. A past day that
  // was only mentioned (an old invoice date on a current ask) is not a
  // Date line, and a dateText left over from that day must not survive
  // once the due itself was refused.
  if (dueIso) {
    facts.date = { iso: dueIso };
    delete facts.dateText;
  } else {
    delete facts.date;
    delete facts.dateText;
  }
  return { dueIso, amount: amount || null, forNotes: Object.assign({}, p, { facts, entities }) };
}

function taskWrittenLine(dueIso, amount) {
  const parts = ['Google Task'];
  if (amount) parts.push(amount);
  if (dueIso) {
    const human = humanDateFallback({ iso: dueIso });
    parts.push('due ' + (human || dueIso));
  }
  return parts.join(' · ');
}

function draftWrittenLine(params) {
  const what = params && typeof params.what === 'string' ? params.what.replace(/\s+/g, ' ').trim() : '';
  if (!what) return 'Gmail draft';
  const short = what.length > 80 ? what.slice(0, 79) + '…' : what;
  return 'Gmail draft · ' + short;
}

async function googleTasksWrite(p) {
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const taskParams = p.params || {};
  const taskFileTerm = taskParams.fileTerm ? String(taskParams.fileTerm).trim() : '';
  let taskFile = null;
  if (taskFileTerm) {
    const found = await driveFindOneByName(taskFileTerm);
    if (!found || found.match !== 'one' || !found.file || !found.file.url) {
      return { ok: false, reason: 'unclear', error: 'No single file to note on the task.' };
    }
    taskFile = found.file;
  }

  const close = taskClosePayload(p);
  const notesLines = factLines(close.forNotes);
  if (taskFile) notesLines.push(['File', taskFile.name + '\n' + taskFile.url]);
  if (p.threadUrl) notesLines.push(['Open in Gmail', p.threadUrl]);
  const notes = notesLines.map(([k, v]) => k + ': ' + v).join('\n');

  const body = { title: googleTaskTitle(p).slice(0, 1024), notes: notes.slice(0, 8192) };
  // Tasks requires a full RFC3339 timestamp on `due` but only displays the
  // date. Midnight UTC keeps that date from shifting a day in either direction.
  const due = close.dueIso ? close.dueIso + 'T00:00:00.000Z' : null;
  if (due) body.due = due;

  const post = (listId) => googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  let taskListId = auth.taskListId;
  let res = await post(taskListId);

  // The Glance list is the one piece of state this connector keeps a stored
  // id for, and it lives in an app Glance does not own. Deleting a list is
  // ordinary tidying in Google Tasks, and it left the stored id pointing at
  // nothing: every Do It from then on failed with "Google Tasks write failed
  // (404)" — permanently, and with a message naming neither the cause nor
  // the remedy. The only way out was Disconnect/Connect in the popup, which
  // nothing told the user to do.
  //
  // findOrCreateGlanceTaskList already knows how to recover; it was simply
  // only ever called at connect time. Calling it here on a 404 gives the
  // write path the same "re-resolve once, then fail loudly" shape
  // googleAuthedFetch already uses for a stale token one layer down. The new
  // id is persisted so the next write doesn't pay for the round trip again.
  if (res.status === 404) {
    try {
      const freshListId = await findOrCreateGlanceTaskList();
      if (freshListId && freshListId !== taskListId) {
        taskListId = freshListId;
        await chrome.storage.local.set({ googleTasksAuth: Object.assign({}, auth, { taskListId }) });
        res = await post(taskListId);
      }
    } catch (e) {
      // Recovery failed — fall through and report the ORIGINAL 404 below
      // rather than a second, more confusing error about list creation.
    }
  }

  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Google Tasks write failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const task = await res.json();
  return {
    ok: true,
    where: 'Google Tasks',
    target: GLANCE_TASK_LIST_TITLE + ' list',
    // What the receipt says was written. Built from the same due and amount
    // that went into the request body, so the line cannot name a date or a
    // figure the task does not have.
    written: taskWrittenLine(close.dueIso, close.amount),
    // The id actually written to, not the one this function started with —
    // Undo has to delete from the list the task really landed in.
    ref: { taskListId, taskId: task.id },
    url: 'https://tasks.google.com/embed/list/' + encodeURIComponent(taskListId) + '?pli=1'
  };
}

async function googleTasksUndo(ref) {
  const auth = await getGoogleTasksAuth();
  if (!ref || !ref.taskId) return { ok: false };
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId),
    { method: 'DELETE' }
  );
  return { ok: res.ok || res.status === 404 };
}


/* ------------------------------------------------------------- waiting on */
//
// "Waiting on" — things the account asked someone else for. core/follow-up.js
// decides what is worth tracking and when to chase; these are the three
// writes it needs, all to the user's own Google account through the grant
// they already gave: a Task due on the chase day, completing that Task when a
// reply settles it, and an editable Gmail draft nudge (never sent).

async function followTaskCreate(p) {
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const title = String((p && p.title) || '').trim();
  if (!title) return { ok: false, reason: 'invalid', error: 'Nothing to track.' };
  const lines = [];
  if (p.what) lines.push('Asked: ' + String(p.what).slice(0, 300));
  if (p.counterpart) lines.push('Waiting on: ' + String(p.counterpart).slice(0, 200));
  if (p.threadUrl) lines.push('Open in Gmail: ' + p.threadUrl);
  const body = { title: title.slice(0, 1024), notes: lines.join('\n').slice(0, 8192) };
  // Same midnight-UTC convention as googleTasksWrite: the date shown must not
  // shift a day in either direction.
  if (p.dueIso && /^\d{4}-\d{2}-\d{2}$/.test(p.dueIso)) body.due = p.dueIso + 'T00:00:00.000Z';

  const post = (listId) => googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks', { method: 'POST', body: JSON.stringify(body) });
  let taskListId = auth.taskListId;
  let res = await post(taskListId);
  if (res.status === 404) {
    try {
      const fresh = await findOrCreateGlanceTaskList();
      if (fresh && fresh !== taskListId) {
        taskListId = fresh;
        await chrome.storage.local.set({ googleTasksAuth: Object.assign({}, auth, { taskListId }) });
        res = await post(taskListId);
      }
    } catch (e) { /* report the original failure below */ }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) throw new Error('Google Tasks write failed (' + res.status + ')');
  const task = await res.json();
  return {
    ok: true,
    where: 'Google Tasks',
    ref: { taskListId, taskId: task.id },
    url: 'https://tasks.google.com/embed/list/' + encodeURIComponent(taskListId) + '?pli=1'
  };
}

// A reply arrived, so the reminder is no longer needed. Completing (not
// deleting) keeps the record in Tasks. A task the person already deleted or
// completed is fine: nothing left to do is success.
async function followTaskComplete(ref) {
  if (!ref || !ref.taskId) return { ok: false, reason: 'invalid' };
  const auth = await getGoogleTasksAuth();
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false, reason: 'not-connected' };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId),
    { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }
  );
  return { ok: res.ok || res.status === 404 };
}

// Did the person tick a reminder done in Google Tasks (on their phone, say)? One read per reminder, status only.
// 'completed' = they closed it themselves; 'open' = still open; 'gone' = deleted (the loop is NOT closed by a deletion).
async function followTaskStatuses(refs) {
  const list = (Array.isArray(refs) ? refs : []).filter((r) => r && r.taskId).slice(0, 10);
  if (!list.length) return { ok: true, statuses: [] };
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const out = [];
  for (const ref of list) {
    const listId = ref.taskListId || auth.taskListId;
    if (!listId) continue;
    const res = await googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId) + '?fields=status,deleted', { method: 'GET' });
    if (res.status === 404) { out.push({ taskId: ref.taskId, status: 'gone' }); continue; }
    if (!res.ok) continue;
    const t = await res.json();
    out.push({ taskId: ref.taskId, status: t.deleted ? 'gone' : t.status === 'completed' ? 'completed' : 'open' });
  }
  return { ok: true, statuses: out };
}

// The chase day moved (they promised a date, or you chased and it slid out).
// Same midnight-UTC convention as the create. A Task that was deleted is
// reported as 'gone' so the caller can create a fresh one instead of silently
// leaving the loop without a reminder.
async function followTaskPatch(ref, fields) {
  if (!ref || !ref.taskId) return { ok: false, reason: 'invalid' };
  const auth = await getGoogleTasksAuth();
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false, reason: 'not-connected' };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId),
    { method: 'PATCH', body: JSON.stringify(fields) }
  );
  if (res.status === 404) return { ok: false, reason: 'gone' };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  return { ok: res.ok };
}

function followDue(dueIso) {
  return dueIso && /^\d{4}-\d{2}-\d{2}$/.test(dueIso) ? dueIso + 'T00:00:00.000Z' : null;
}

async function followTaskSchedule(ref, dueIso, title) {
  const due = followDue(dueIso);
  if (!due) return { ok: false, reason: 'invalid' };
  const fields = { due };
  // The title follows the state of the loop ("Chase reply" -> "Answer Dana").
  if (typeof title === 'string' && title.trim()) fields.title = title.trim().slice(0, 200);
  return followTaskPatch(ref, fields);
}

// Back from the closed list: the Task is open again, on the new chase day.
async function followTaskReopen(ref, dueIso) {
  const fields = { status: 'needsAction', completed: null };
  const due = followDue(dueIso);
  if (due) fields.due = due;
  return followTaskPatch(ref, fields);
}

async function findThreadIdTo(recipientEmail, subject) {
  if (!recipientEmail) return null;
  try {
    const q = 'to:' + recipientEmail + (subject ? ' subject:"' + String(subject).replace(/^re:\s*/i, '').replace(/"/g, '') + '"' : '');
    const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/threads?maxResults=1&q=' + encodeURIComponent(q));
    if (!res.ok) return null;
    const data = await res.json();
    return (data.threads && data.threads[0] && data.threads[0].id) || null;
  } catch (e) {
    return null;
  }
}

async function followDraftCreate(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const to = String((p && p.to) || '').trim();
  const text = String((p && p.body) || '').trim();
  if (!to || !text) return { ok: false, reason: 'invalid', error: 'No one to write to.' };
  const base = String(p.subject || '').trim();
  const subject = base ? (/^re:/i.test(base) ? base : 'Re: ' + base) : 'Following up';
  // A file prepared for this draft (docs/file-backed-closure-plan.md): either the one
  // file already in the thread (bytes read by the content script) or the one Drive file
  // core/file-path.js picked. If it cannot be read nothing is written: the body says
  // a file is attached, so there is never a substitute file and never a draft that
  // claims one it does not have. The caller then offers the plain draft instead.
  let attachment = null;
  if (p.attachment && p.attachment.base64) {
    const approxBytes = Math.floor((p.attachment.base64.length * 3) / 4);
    if (approxBytes <= GMAIL_ATTACHMENT_MAX_BYTES) attachment = { filename: p.attachment.filename, mimeType: p.attachment.mimeType, base64: p.attachment.base64 };
  } else if (p.driveFileId) {
    attachment = await fetchDriveFileAsAttachment(p.driveFileId);
  }
  if ((p.attachment || p.driveFileId) && !attachment) return { ok: false, reason: 'attach', error: 'Could not attach that file.' };
  const threadId = await findThreadIdTo(to, base);
  const raw = base64UrlEncode(buildMimeMessage({ to: toHeaderValue(to, p.toName), subject, body: text, attachment }));
  const message = { raw };
  if (threadId) message.threadId = threadId;
  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts', { method: 'POST', body: JSON.stringify({ message }) });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) throw new Error('Gmail draft creation failed (' + res.status + ')');
  const draft = await res.json();
  return { ok: true, where: 'Gmail', target: 'a draft follow-up', ref: { draftId: draft.id }, url: 'https://mail.google.com/mail/u/0/#drafts', attached: attachment ? attachment.filename : null };
}

/* --------------------------------------------------------------- Calendar */
//
// The top of the execution priority the spec calls for: a SCHEDULED_EVENT
// classification (intent.js) already required a meeting noun + a resolved
// date + a resolved time together before it was ever offered as an action
// (see actions.js) — there is nothing further to validate here beyond the
// fields actually being present.

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

// No duration is ever stated in an email the way a date or time is, so
// there is nothing to extract — 30 minutes is a plain, documented default
// rather than a guess dressed up as a fact, and the event's own real time
// (not its length) is what actually matters for "don't miss this".
const CALENDAR_DEFAULT_DURATION_MIN = 30;

function calendarDateTime(dateIso, hour, minute, addMinutes) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute + (addMinutes || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
    'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00';
}

// Google Calendar's all-day event shape needs the day AFTER the event as
// its own end.date — {date} is exclusive, unlike {dateTime}'s inclusive
// start/end pair, so a single-day all-day event is start=today, end=tomorrow.
function nextDateIso(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
}

// A date the close is willing to write. A month that doesn't exist, or a
// bare phrase, must not become an event on the wrong day.
function calendarIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}

function calendarClockPart(value, max) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max) return value;
  if (typeof value === 'string' && /^\d{1,2}$/.test(value)) {
    const n = Number(value);
    if (n >= 0 && n <= max) return n;
  }
  return null;
}

// Both fields absent → all-day is allowed (the schedule process). One
// field present, or either field out of range → not a time we may write.
function calendarClock(hour, minute) {
  const hourAbsent = hour == null || hour === '';
  const minuteAbsent = minute == null || minute === '';
  if (hourAbsent && minuteAbsent) return { absent: true };
  const h = calendarClockPart(hour, 23);
  const m = calendarClockPart(minute, 59);
  if (h == null || m == null) return { invalid: true };
  return { hour: h, minute: m };
}

function calendarWhenLabel(dateIso, clock) {
  const human = humanDateFallback({ iso: dateIso }) || dateIso;
  if (!clock || clock.absent) return human;
  const pad = (n) => String(n).padStart(2, '0');
  return human + ' ' + pad(clock.hour) + ':' + pad(clock.minute);
}

function slotStamp(dateIso, hour, minute, addMinutes) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute + (addMinutes || 0), 0);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const wall = calendarDateTime(iso, dt.getHours(), dt.getMinutes());
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return wall + sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}

function eventsStartingAt(items, dateIso, hour, minute) {
  const prefix = dateIso + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  return (items || []).filter((ev) => {
    if (!ev || ev.status === 'cancelled' || typeof ev.id !== 'string' || !ev.id) return false;
    const start = ev.start && ev.start.dateTime;
    return typeof start === 'string' && start.indexOf(prefix) === 0;
  });
}

// Update or delete one event that already starts at the named clock.
// Zero matches, or more than one, is not a write: the receipt must not
// claim a calendar change that did not happen. A new event is never inserted
// on this path.
async function googleCalendarChange(p, op) {
  const params = p.params || {};
  const targetDate = calendarIsoDate(params.dateIso);
  const targetClock = calendarClock(params.hour, params.minute);
  if (!targetDate || !targetClock || targetClock.absent || targetClock.invalid) {
    return { ok: false, reason: 'invalid', error: 'Missing a real time for this change.' };
  }
  const lookupDate = op === 'update' ? calendarIsoDate(params.fromDateIso) : targetDate;
  const lookupClock = op === 'update' ? calendarClock(params.fromHour, params.fromMinute) : targetClock;
  if (!lookupDate || !lookupClock || lookupClock.absent || lookupClock.invalid) {
    return { ok: false, reason: 'invalid', error: 'Missing the time to change.' };
  }
  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '5',
    timeZone: localTimeZone(),
    timeMin: slotStamp(lookupDate, lookupClock.hour, lookupClock.minute, 0),
    timeMax: slotStamp(lookupDate, lookupClock.hour, lookupClock.minute, 1)
  });
  const listed = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events?' + query.toString(), { method: 'GET' });
  if (listed.status === 401 || listed.status === 403) return { ok: false, reason: 'not-connected' };
  if (!listed.ok) return { ok: false, reason: 'not-found' };
  const matches = eventsStartingAt((await listed.json()).items, lookupDate, lookupClock.hour, lookupClock.minute);
  if (matches.length !== 1) return { ok: false, reason: 'not-found' };
  const ev = matches[0];
  const summary = String(ev.summary || params.title || 'Hold').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Hold';
  if (op === 'delete') {
    const restore = { summary: ev.summary || summary, start: ev.start, end: ev.end };
    if (ev.description) restore.description = ev.description;
    if (ev.location) restore.location = ev.location;
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ev.id), { method: 'DELETE' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
    if (!res.ok && res.status !== 404 && res.status !== 410) return { ok: false, reason: 'not-found' };
    return {
      ok: true,
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + summary + ' · off ' + calendarWhenLabel(lookupDate, lookupClock),
      ref: { eventId: ev.id, restore: restore }
    };
  }
  const timeZone = localTimeZone();
  const next = {
    start: { dateTime: calendarDateTime(targetDate, targetClock.hour, targetClock.minute), timeZone: timeZone },
    end: { dateTime: calendarDateTime(targetDate, targetClock.hour, targetClock.minute, CALENDAR_DEFAULT_DURATION_MIN), timeZone: timeZone }
  };
  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ev.id), {
    method: 'PATCH',
    body: JSON.stringify(next)
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) return { ok: false, reason: 'not-found' };
  return {
    ok: true,
    where: 'Google Calendar',
    target: 'your calendar',
    written: 'Calendar · ' + summary + ' · ' + calendarWhenLabel(targetDate, targetClock),
    ref: { eventId: ev.id, previousStart: ev.start, previousEnd: ev.end },
    url: (ev.htmlLink || null)
  };
}

async function googleCalendarWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  if (params.calendarOp === 'delete' || params.calendarOp === 'update') {
    return googleCalendarChange(p, params.calendarOp);
  }
  const dateIso = calendarIsoDate(params.dateIso);
  if (!dateIso) {
    return { ok: false, reason: 'invalid', error: 'Missing a real date for this event.' };
  }
  const clock = calendarClock(params.hour, params.minute);
  if (clock.invalid || (params.requireTime && clock.absent)) {
    return { ok: false, reason: 'invalid', error: 'Missing a real time for this event.' };
  }
  // A meeting the email names a day for but never a clock time — "let's
  // meet Tuesday" — is real, unambiguous evidence a person would act on
  // immediately. That path creates a genuine all-day Calendar entry
  // (Google's own {date} shape, no {dateTime}/{timeZone}) rather than
  // guessing a time that was never stated. A calendar hold sets
  // requireTime and never takes this branch.

  const paramsFile = params.fileTerm ? String(params.fileTerm).trim() : '';
  const shareUrl = googleShareUrl(params.shareUrl);
  if (params.shareLink && !shareUrl && !paramsFile) {
    return { ok: false, reason: 'unclear', error: 'No file link for this event.' };
  }
  let linkedFile = null;
  if (paramsFile) {
    const found = await driveFindOneByName(paramsFile);
    if (!found || found.match !== 'one' || !found.file || !found.file.url) {
      return { ok: false, reason: 'unclear', error: 'No single file to put on the event.' };
    }
    linkedFile = found.file;
  }

  const timeZone = localTimeZone();
  const descriptionLines = [];
  // The sentence Do It actually closed, so the event View opens is the
  // same fact the chip proposed — not only a title and an attribution line.
  const quote = params.quote ? String(params.quote).replace(/[\r\n]+/g, ' ').trim() : '';
  if (quote) descriptionLines.push(quote.slice(0, QUOTE_MAX_CHARS));
  if (linkedFile) descriptionLines.push('File: ' + linkedFile.name + '\n' + linkedFile.url);
  if (shareUrl) descriptionLines.push(shareUrl);
  if (p.threadUrl) descriptionLines.push('Open in Gmail: ' + p.threadUrl);
  descriptionLines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('calendar'));

  const summary = String(params.title || 'Hold').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Hold';
  const body = {
    summary: summary,
    description: descriptionLines.join('\n')
  };
  if (!clock.absent) {
    body.start = { dateTime: calendarDateTime(dateIso, clock.hour, clock.minute), timeZone };
    body.end = { dateTime: calendarDateTime(dateIso, clock.hour, clock.minute, CALENDAR_DEFAULT_DURATION_MIN), timeZone };
  } else {
    body.start = { date: dateIso };
    body.end = { date: nextDateIso(dateIso) };
  }
  const whenLabel = calendarWhenLabel(dateIso, clock);

  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Calendar event creation failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const event = await res.json();
  // A 200 with no id is not an event we can undo, so it is not a success
  // the receipt may name.
  if (!event || typeof event.id !== 'string' || !event.id) {
    return { ok: false, reason: 'error', error: 'Calendar did not confirm the event.' };
  }
  return {
    ok: true,
    where: 'Google Calendar',
    target: 'your calendar',
    // Built from the summary and the start that were posted, so the
    // receipt cannot name a title or a time the event does not have.
    written: 'Calendar · ' + summary + ' · ' + whenLabel,
    ref: { eventId: event.id },
    // htmlLink is a real field the Calendar API documents and always
    // returns on a created event — unlike the Gmail draft link below, this
    // one is safe to hand straight to the user.
    url: event.htmlLink || null
  };
}

async function googleCalendarUndo(ref) {
  if (!ref) return { ok: false };
  if (ref.restore && ref.restore.start) {
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify(ref.restore)
    });
    if (res.ok) return { ok: true };
    return { ok: false };
  }
  if (ref.previousStart && ref.eventId) {
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ref.eventId), {
      method: 'PATCH',
      body: JSON.stringify({ start: ref.previousStart, end: ref.previousEnd })
    });
    if (res.ok) return { ok: true };
    return { ok: false };
  }
  if (!ref.eventId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ref.eventId), {
    method: 'DELETE'
  });
  // 410 Gone is Calendar's own "already deleted" — as final as a 404 anywhere else.
  // Anything else (403, 500, a still-present event) is not undone. The
  // receipt must not say it was.
  if (res.ok || res.status === 404 || res.status === 410) return { ok: true };
  return { ok: false };
}

/* ------------------------------------------------------------- Gmail Draft */
//
// Second in the execution priority: a real draft sitting in Gmail, not a
// task that says "reply to this." Deliberately a lightweight, editable
// skeleton — not an AI-generated reply. That's a different feature
// (glance-assist's Draft-It, see the header comment further down this
// file) with a different backend dependency; this path never calls out to
// anything, so it works the moment Google is connected, same as Calendar
// and Tasks.
//
// No "Logged by Glance" footer here, unlike every other write path in this
// file. Every other connector writes to something only the user's own team
// sees (a CRM note, a Slack channel, a Notion page) — a fair, quiet place
// for one attribution line. A Gmail draft is addressed to the sender and
// will very likely be sent to them close to as-is; putting vendor
// attribution into outbound correspondence with someone else's actual
// client is a different thing entirely, and not a call this file gets to
// make on the user's behalf.

function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2045 caps an encoded body line at 76 characters. Most servers tolerate
// longer lines, but there's no reason to rely on that tolerance when the fix
// is one regex.
function chunk76(b64) {
  return (b64.match(/.{1,76}/g) || []).join('\r\n');
}

// Every value that ends up inside a MIME header or the multipart framing
// below is DOM-derived (Gmail's own subject/sender text) — none of it is
// something this file should trust to be a single line. A raw CR or LF
// spliced into a header value is a classic header-injection vector (the
// email equivalent of HTTP header injection): "Subject: X\r\nBcc:
// attacker@evil.com" would silently add a real header to an outbound
// draft. Folding any embedded CR/LF to a space closes that off at the one
// place every header value passes through, rather than trusting each call
// site to remember to sanitize its own input.
function sanitizeMimeText(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
}

// RFC 2047 encoded-word — only applied when the value actually contains
// something outside ASCII (a Hebrew subject line, a display name with
// diacritics). A raw UTF-8 byte in a header is invalid and Gmail's API
// rejects the whole message rather than mangling it.
function mimeHeader(name, value) {
  const safe = sanitizeMimeText(value);
  if (/^[\x00-\x7F]*$/.test(safe)) return name + ': ' + safe;
  return name + ': =?UTF-8?B?' + btoa(unescape(encodeURIComponent(safe))) + '?=';
}

function toHeaderValue(email, name) {
  const trimmed = (name || '').trim().replace(/"/g, '');
  if (!trimmed) return email;
  if (/^[\x00-\x7F]*$/.test(trimmed)) return '"' + trimmed + '" <' + email + '>';
  return '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(trimmed))) + '?= <' + email + '>';
}

function draftSubject(p) {
  const base = (p.subject || '').trim();
  const params = p.params || {};
  if (!base) return 'Re: ' + String(params.what || 'your message').slice(0, 100);
  return /^re:/i.test(base) ? base : 'Re: ' + base;
}

function draftGreeting(senderName) {
  const name = (senderName || '').trim();
  // Correspondence in this product's actual use (Hebrew and English SMB
  // email) is almost always first-name-only — the full display name Gmail
  // hands back can carry a title or a company suffix that would read oddly
  // as a greeting.
  const first = name ? name.split(/\s+/)[0] : '';
  return first ? 'Hi ' + first + ',' : 'Hi,';
}

// attachment/attachmentSource are optional — every existing caller that
// passes just `p` still gets the exact same body it always did.
// attachmentSource === 'found' or 'template' is the one case worth a line
// in the draft itself: 'thread'/'picked' are things the user already saw
// before Do It was ever clicked, but an auto-found file is Glance's own
// guess, and a guess that lands in a real, sendable draft with no visible
// flag is exactly the kind of silent overreach this product's
// precision-first posture exists to avoid.
// A share-link draft is the file sentence plus the link. A reply-with-facts
// draft is the greeting plus that one fact. Neither one is a rewrite, and
// the user still sends.
function draftBodyText(p, attachment, attachmentSource, shareUrl) {
  const params = p.params || {};
  if (params.replyFact && !params.shareLink) {
    const factLine = String(params.factLine || '').replace(/[\r\n]+/g, ' ').trim();
    return [draftGreeting(p.senderName), '', factLine].join('\n');
  }
  const lines = [draftGreeting(p.senderName), ''];
  if (shareUrl) {
    lines.push(params.what || 'The file is ready.');
    lines.push(shareUrl);
    return lines.join('\n');
  }
  if (params.what && params.when) lines.push('Following up on: ' + params.what + ' (' + params.when + ')');
  else if (params.what) lines.push('Following up on: ' + params.what);
  else lines.push('Following up on your message below.');
  if (attachment && (attachmentSource === 'found' || attachmentSource === 'template')) {
    lines.push('', 'Attached: ' + attachment.filename);
    if (attachmentSource === 'template') {
      const fields = params.fields || [];
      for (const field of fields) {
        if (field && field.label && String(field.value || '').trim()) {
          lines.push(String(field.label) + ': ' + String(field.value).replace(/[\r\n]+/g, ' ').trim());
        }
      }
    }
  }
  lines.push('', '[Write your reply here]');
  return lines.join('\n');
}

// opts: { to, subject, body, attachment: {filename, mimeType, base64} | null }
function buildMimeMessage(opts) {
  const headers = [
    mimeHeader('To', opts.to),
    mimeHeader('Subject', opts.subject),
    'MIME-Version: 1.0'
  ];

  if (!opts.attachment) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + chunk76(btoa(unescape(encodeURIComponent(opts.body))));
  }

  const boundary = 'flow_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  headers.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');
  const parts = [
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(btoa(unescape(encodeURIComponent(opts.body)))),
    '--' + boundary,
    'Content-Type: ' + sanitizeMimeText(opts.attachment.mimeType || 'application/octet-stream'),
    'Content-Disposition: attachment; filename="' + sanitizeMimeText(String(opts.attachment.filename || 'attachment').replace(/"/g, '')) + '"',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(opts.attachment.base64),
    '--' + boundary + '--'
  ];
  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

// Best-effort: finds the Gmail thread this reply belongs to so the draft
// appears inline in the conversation instead of floating on its own.
// Never blocks the write on failing — a standalone draft the user still has
// to attach to the right thread manually is a worse outcome than not
// offering a draft at all, but a strictly better one than failing the
// whole action because a search query came back empty.
async function findThreadId(senderEmail, subject) {
  if (!senderEmail) return null;
  try {
    const q = 'from:' + senderEmail + (subject ? ' subject:"' + subject.replace(/"/g, '') + '"' : '');
    const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/threads?maxResults=1&q=' + encodeURIComponent(q));
    if (!res.ok) return null;
    const data = await res.json();
    return (data.threads && data.threads[0] && data.threads[0].id) || null;
  } catch (e) {
    return null;
  }
}

// Raw byte estimate from the base64 length (4/3 inflation) rather than
// trusting a size the content script reported — comfortably under both
// Gmail's own 25MB compose limit and chrome.runtime.sendMessage's own
// ceiling once base64-encoded.
const GMAIL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

// Same chunked btoa as content-gmail.js's own arrayBufferToBase64 — kept as
// a separate copy rather than a shared import because this file (a service
// worker) and that one (a content script) have never shared code, each
// reading and base64-encoding bytes from a different source (Gmail's
// cookie-authed attachment URLs there, the Drive API's own OAuth-authed
// bytes here).
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Docs, Sheets, and Slides are not byte files. alt=media 404s on them;
// export is the read that produces something a Gmail draft can hold.
const DRIVE_EXPORT = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' }
};

function driveExportPlan(mimeType) {
  return DRIVE_EXPORT[mimeType] || null;
}

function withExportExtension(name, ext) {
  const base = String(name || 'file').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  if (!ext) return base;
  return base + (ext.charAt(0) === '.' ? ext : '.' + ext);
}

// One page is a hundred files. Four pages is the cap: enough to rank a
// real Drive, not a five-file sample, and not an unbounded crawl.
const DRIVE_SEARCH_PAGE_SIZE = 100;
const DRIVE_SEARCH_MAX_FILES = 400;

// q is an already-escaped Drive query (file attach, or a fact lookup built
// here from structured label/kind/name — never a raw q from the page). A
// failed page returns null rather than a short list — ranking a partial
// page is how a second, unseen file becomes "the only match".
async function searchDriveFiles(q) {
  if (!q) return null;
  const files = [];
  let pageToken = '';
  while (files.length < DRIVE_SEARCH_MAX_FILES) {
    let path = '/files?q=' + encodeURIComponent(q)
      + '&pageSize=' + DRIVE_SEARCH_PAGE_SIZE
      + '&corpora=user&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime)');
    if (pageToken) path += '&pageToken=' + encodeURIComponent(pageToken);
    const res = await googleAuthedFetch(GOOGLE_DRIVE_API, path);
    if (!res.ok) return null;
    const data = await res.json();
    const batch = data.files || [];
    for (let i = 0; i < batch.length && files.length < DRIVE_SEARCH_MAX_FILES; i++) files.push(batch[i]);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return files;
}

// Drive files are fetched here, not by content-gmail.js, because reading a
// Drive file needs the same OAuth bearer token every other Google write in
// this file already holds — there is no reason to round-trip a base64
// payload through chrome.runtime.sendMessage between the content script and
// this worker when the worker can just call the Drive API directly.
// Metadata first (cheap) so an oversized file never has its bytes
// downloaded at all, not just rejected after the fact.
async function fetchDriveFileAsAttachment(driveFileId) {
  try {
    const metaRes = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(driveFileId) + '?fields=name,mimeType,size');
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (meta.size && Number(meta.size) > GMAIL_ATTACHMENT_MAX_BYTES) return null;

    const exported = driveExportPlan(meta.mimeType);
    // A Docs/Sheets/Slides file has no bytes at alt=media. Export it.
    // Anything else in the google-apps family (a folder, a form) is not
    // an attachment, and inventing an empty file for it is not a close.
    if (!exported && String(meta.mimeType || '').indexOf('application/vnd.google-apps.') === 0) return null;
    const contentPath = exported
      ? '/files/' + encodeURIComponent(driveFileId) + '/export?mimeType=' + encodeURIComponent(exported.mime)
      : '/files/' + encodeURIComponent(driveFileId) + '?alt=media';
    const contentRes = await googleAuthedFetch(GOOGLE_DRIVE_API, contentPath);
    if (!contentRes.ok) return null;
    const buf = await contentRes.arrayBuffer();
    // Declared size can be absent or wrong; the actual byte count is the
    // real guard — same policy as content-gmail.js's own attachment fetch.
    if (buf.byteLength > GMAIL_ATTACHMENT_MAX_BYTES || buf.byteLength === 0) return null;

    return {
      filename: exported ? withExportExtension(meta.name, exported.ext) : (meta.name || 'attachment'),
      mimeType: exported ? exported.mime : (meta.mimeType || 'application/octet-stream'),
      base64: arrayBufferToBase64(buf)
    };
  } catch (e) {
    return null;
  }
}

// Reply-with-facts reads a Sheet or Doc through the Drive export endpoint.
// drive.readonly already covers that. No spreadsheets scope, no picker,
// and this function does not decide the match — it only returns the few
// candidate texts. Listing goes through searchDriveFiles. More than three
// files, a failed page, or a file too large to prove it holds a single
// cell is truncated so the caller stays silent.
const FACT_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const FACT_DOC_MIME = 'application/vnd.google-apps.document';
const FACT_EXPORT_MAX = 200000;
const FACT_FILE_CAP = 3;

function driveQuote(value) {
  return String(value || '').replace(/[\r\n\u0000]/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim().slice(0, 80);
}

async function factSources(ask) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const factLabel = driveQuote(ask && ask.factLabel);
  const sourceName = driveQuote(ask && ask.sourceName);
  const kind = ask && (ask.sourceKind === 'sheet' || ask.sourceKind === 'doc') ? ask.sourceKind : null;
  if (factLabel.length < 2 || !kind) return { ok: true, sources: [], truncated: false };
  const mime = kind === 'doc'
    ? "mimeType = '" + FACT_DOC_MIME + "'"
    : "mimeType = '" + FACT_SHEET_MIME + "'";
  const needle = sourceName || factLabel;
  const field = sourceName ? 'name' : 'fullText';
  const q = 'trashed = false and ' + mime + ' and ' + field + " contains '" + needle + "'";
  try {
    const files = await searchDriveFiles(q);
    if (files === null) return { ok: false, reason: 'error' };
    if (!files.length) return { ok: true, sources: [], truncated: false };
    // More than a few files is not a sample we export and pick from.
    if (files.length > FACT_FILE_CAP) return { ok: true, sources: [], truncated: true };
    const sources = [];
    for (const f of files) {
      const isSheet = f.mimeType === FACT_SHEET_MIME;
      const isDoc = f.mimeType === FACT_DOC_MIME;
      if (!isSheet && !isDoc) continue;
      const exportType = isSheet ? 'text/csv' : 'text/plain';
      const exp = await googleAuthedFetch(
        GOOGLE_DRIVE_API,
        '/files/' + encodeURIComponent(f.id) + '/export?mimeType=' + encodeURIComponent(exportType)
      );
      if (!exp.ok || typeof exp.text !== 'function') return { ok: true, sources: [], truncated: true };
      const text = await exp.text();
      if (typeof text !== 'string' || text.length > FACT_EXPORT_MAX) return { ok: true, sources: [], truncated: true };
      sources.push({ id: f.id, name: f.name || '', kind: isSheet ? 'sheet' : 'doc', text });
    }
    if (!sources.length) return { ok: true, sources: [], truncated: true };
    return { ok: true, sources, truncated: false };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

async function gmailDraftWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'error', error: 'No sender address to reply to.' };

  const params = p.params || {};
  const shareUrl = googleShareUrl(params.shareUrl);
  if (params.shareLink) {
    if (!shareUrl) return { ok: false, reason: 'unclear', error: 'No file link to share.' };
  }
  // One fact into the shared draft POST. Undo deletes that draft. Never an
  // attachment, never a send, and never a second Drive search that could
  // swap the fact the chip already showed. A share-link draft is not this.
  if (params.replyFact && !params.shareLink) {
    const factLine = String(params.factLine || '').replace(/[\r\n]+/g, ' ').trim();
    if (!factLine || factLine.length > 180) {
      return { ok: false, reason: 'invalid', error: 'No single fact to insert.' };
    }
    params.factLine = factLine;
  }
  let attachment = null;
  let createdFileId = null;
  // 'thread' and 'picked' are files the user already saw. 'found' is the
  // one file core/file-attach.js already ranked as the only high-confidence
  // match — this writer does not search again and does not substitute a
  // different file if that one cannot be read. 'template' is a new file
  // made from an existing company template, never a blank document.
  let attachmentSource = null;
  if (!params.shareLink && !params.replyFact && params.includeAttachment && p.attachment && p.attachment.base64) {
    const approxBytes = Math.floor((p.attachment.base64.length * 3) / 4);
    // Oversized attachments degrade to a plain draft rather than failing the
    // whole action — the same "still useful, just not everything asked for"
    // shape as findThreadId() above.
    if (approxBytes <= GMAIL_ATTACHMENT_MAX_BYTES) {
      attachment = { filename: p.attachment.filename, mimeType: p.attachment.mimeType, base64: p.attachment.base64 };
      attachmentSource = 'thread';
    }
  }
  // A share-link draft (a Doc, Sheet, or saved file this same click
  // already created) and a one-fact reply do not search Drive and do not
  // attach a second file. Family A attach stays on the branches below.
  if (!params.shareLink && !params.replyFact) {
    // Create-when-missing: copy an existing template into a new file, then
    // attach that copy. Refuses when a required field is empty — a blank
    // document is not this close. The company template itself is never
    // modified or deleted.
    if (!attachment && params.templateId) {
      const fields = Array.isArray(params.fields) ? params.fields : [];
      const incomplete = !fields.length || fields.some((field) => !field || !String(field.value || '').trim());
      if (incomplete) return { ok: false, reason: 'error', error: 'Missing a fact the template needs.' };
      const made = await materializeFromTemplate(params.templateId, params.copyTitle || params.what);
      if (!made) return { ok: false, reason: 'error', error: 'Could not prepare a file from that template.' };
      attachment = made.attachment;
      createdFileId = made.createdFileId;
      attachmentSource = 'template';
    }
    // A resolved Drive file (the one high-confidence match, or a file the
    // user picked). If it cannot be read, stop — do not search for a
    // substitute and do not send a draft that claims the file is attached.
    if (!attachment && params.driveFileId) {
      attachment = await fetchDriveFileAsAttachment(params.driveFileId);
      if (!attachment) return { ok: false, reason: 'error', error: 'Could not attach that file.' };
      attachmentSource = params.attachSource === 'found' ? 'found' : 'picked';
    }
  }

  const threadId = await findThreadId(p.senderEmail, p.subject);
  const raw = base64UrlEncode(buildMimeMessage({
    to: toHeaderValue(p.senderEmail, p.senderName),
    subject: draftSubject(p),
    body: draftBodyText(p, attachment, attachmentSource, shareUrl),
    attachment
  }));

  const message = { raw };
  if (threadId) message.threadId = threadId;

  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  if (res.status === 401 || res.status === 403) {
    if (createdFileId) await deleteDriveFile(createdFileId);
    return { ok: false, reason: 'not-connected' };
  }
  if (!res.ok) {
    if (createdFileId) await deleteDriveFile(createdFileId);
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Gmail draft creation failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const draft = await res.json();
  return {
    ok: true,
    where: 'Gmail',
    target: !attachment ? 'a draft reply'
      : attachmentSource === 'template' ? 'a draft reply with a file prepared from your template'
      : 'a draft reply with the attachment',
    written: draftWrittenLine(params),
    ref: createdFileId ? { draftId: draft.id, createdFileId } : { draftId: draft.id },
    // The Drafts API doesn't return a stable, documented deep link to one
    // specific draft the way Calendar's htmlLink does — linking to the
    // Drafts folder itself is the honest version of "go see it" rather than
    // a guessed URL that might not open the right thing.
    url: 'https://mail.google.com/mail/u/0/#drafts'
  };
}

// Reads the template (export for a Doc/Sheet/Slide, bytes otherwise) and
// uploads a new file this app created. drive.file can create and later
// delete that copy. The template id is only ever read.
async function materializeFromTemplate(templateId, title) {
  try {
    const metaRes = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(templateId) + '?fields=name,mimeType,size');
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const exported = driveExportPlan(meta.mimeType);
    if (!exported && String(meta.mimeType || '').indexOf('application/vnd.google-apps.') === 0) return null;
    if (!exported && meta.size && Number(meta.size) > GMAIL_ATTACHMENT_MAX_BYTES) return null;
    const contentPath = exported
      ? '/files/' + encodeURIComponent(templateId) + '/export?mimeType=' + encodeURIComponent(exported.mime)
      : '/files/' + encodeURIComponent(templateId) + '?alt=media';
    const contentRes = await googleAuthedFetch(GOOGLE_DRIVE_API, contentPath);
    if (!contentRes.ok) return null;
    const buf = await contentRes.arrayBuffer();
    if (buf.byteLength > GMAIL_ATTACHMENT_MAX_BYTES || buf.byteLength === 0) return null;
    const ext = exported ? exported.ext : ((String(meta.name || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0]);
    const filename = withExportExtension(title || meta.name || 'file', ext);
    const mimeType = exported ? exported.mime : (meta.mimeType || 'application/octet-stream');
    const created = await uploadDriveCopy(filename, mimeType, buf);
    if (!created || !created.id) return null;
    return { createdFileId: created.id, attachment: { filename, mimeType, base64: arrayBufferToBase64(buf) } };
  } catch (e) {
    return null;
  }
}

// Name-token match for family B and for the "is there already a file?"
// check before a template create. This does not download or attach.
// Family A attach is searchDriveFiles plus core/file-attach.js.
// Zero hits or two-plus hits is not a file this close may use.
function driveNameHits(files, term) {
  function tokens(value) {
    return String(value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }
  const needle = tokens(term);
  if (!needle.length || needle.join('').length < 2) return [];
  const hits = [];
  for (const file of files || []) {
    if (!file || file.trashed) continue;
    const name = tokens(file.name);
    let found = false;
    for (let i = 0; i <= name.length - needle.length; i++) {
      let same = true;
      for (let j = 0; j < needle.length; j++) {
        if (name[i + j] !== needle[j]) { same = false; break; }
      }
      if (same) { found = true; break; }
    }
    if (found) hits.push(file);
  }
  return hits;
}

function driveFileUrl(file) {
  const id = file && file.id;
  if (!id) return null;
  const mime = String((file && file.mimeType) || '');
  if (mime === 'application/vnd.google-apps.document') return 'https://docs.google.com/document/d/' + id + '/edit';
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  if (mime === 'application/vnd.google-apps.presentation') return 'https://docs.google.com/presentation/d/' + id + '/edit';
  return 'https://drive.google.com/file/d/' + id + '/view';
}

async function driveFindOneByName(term) {
  try {
    if (!(await googleConnected())) return { match: 'unknown' };
    const needle = String(term || '').trim();
    if (needle.length < 2) return { match: 'unknown' };
    const escaped = needle.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = "trashed = false and name contains '" + escaped + "'";
    const files = await searchDriveFiles(q);
    if (!files) return { match: 'unknown' };
    const hits = driveNameHits(files, needle);
    if (hits.length !== 1) return { match: hits.length === 0 ? 'none' : 'many' };
    const file = hits[0];
    return {
      match: 'one',
      file: { id: file.id, name: file.name, mimeType: file.mimeType || '', url: driveFileUrl(file) }
    };
  } catch (e) {
    return { match: 'unknown' };
  }
}

function decodeBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function driveFileResult(file, where, written) {
  if (!file || typeof file.id !== 'string' || !file.id) {
    return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  }
  return {
    ok: true,
    where: where,
    target: file.name || 'a file',
    written: written,
    ref: { fileId: file.id },
    url: file.webViewLink || driveFileUrl(file)
  };
}

function safeDriveTitle(value) {
  const title = String(value || 'Glance').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return title || 'Glance';
}

async function googleDriveCreateDoc(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  const html = typeof params.html === 'string' ? params.html.trim() : '';
  if (!html || html.length < 20) return { ok: false, reason: 'unclear', error: 'Nothing to put in the doc.' };
  const title = safeDriveTitle(params.title);
  const created = await uploadDriveCopy(title, 'application/vnd.google-apps.document', new TextEncoder().encode(html), 'text/html; charset=UTF-8');
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Docs', 'Doc · ' + (created.name || title));
}

async function googleDriveCreateSheet(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  const csv = typeof params.csv === 'string' ? params.csv.trim() : '';
  if (!csv || csv.indexOf('\n') === -1) return { ok: false, reason: 'unclear', error: 'Nothing to put in the sheet.' };
  const title = safeDriveTitle(params.title);
  const created = await uploadDriveCopy(title, 'application/vnd.google-apps.spreadsheet', new TextEncoder().encode(csv), 'text/csv; charset=UTF-8');
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Sheets', 'Sheet · ' + (created.name || title));
}

async function googleDriveCopyFile(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const attachment = p.attachment;
  if (!attachment || !attachment.base64) return { ok: false, reason: 'unclear', error: 'No single attachment to save.' };
  const approxBytes = Math.floor((attachment.base64.length * 3) / 4);
  if (approxBytes > GMAIL_ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'unclear', error: 'That attachment is too large to save.' };
  const name = safeDriveTitle(attachment.filename || 'attachment');
  const mime = String(attachment.mimeType || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
  const created = await uploadDriveCopy(name, mime, decodeBase64(attachment.base64));
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Drive', 'Drive · ' + (created.name || name));
}

async function googleDriveTrash(ref) {
  if (!ref || !ref.fileId) return { ok: false };
  return { ok: await deleteDriveFile(ref.fileId) };
}

function googleShareUrl(value) {
  if (typeof value !== 'string') return null;
  if (!/^https:\/\/(?:docs|drive)\.google\.com\//.test(value)) return null;
  return value;
}

async function uploadDriveCopy(name, mimeType, buf, mediaType) {
  const contentType = mediaType || mimeType;
  const boundary = 'flow_upload_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const meta = JSON.stringify({ name: name, mimeType: mimeType });
  const preamble = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + contentType + '\r\n\r\n';
  const ending = '\r\n--' + boundary + '--';
  const head = new TextEncoder().encode(preamble);
  const tail = new TextEncoder().encode(ending);
  const bytes = new Uint8Array(buf);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const res = await googleAuthedFetch('https://www.googleapis.com/upload/drive/v3', '/files?uploadType=multipart&fields=' + encodeURIComponent('id,name,webViewLink,mimeType'), {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  if (res.status === 401 || res.status === 403) return { notConnected: true };
  if (!res.ok) return null;
  const created = await res.json();
  if (!created || !created.id) return null;
  if (!created.webViewLink) created.webViewLink = driveFileUrl(created);
  return created;
}

async function deleteDriveFile(fileId) {
  if (!fileId) return false;
  try {
    const res = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(fileId), { method: 'DELETE' });
    return res.ok || res.status === 404;
  } catch (e) {
    return false;
  }
}

async function gmailDraftUndo(ref) {
  if (!ref || !ref.draftId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts/' + encodeURIComponent(ref.draftId), {
    method: 'DELETE'
  });
  if (!(res.ok || res.status === 404)) return { ok: false };
  // The draft carried a file this close created. Undo removes that file
  // too. It never deletes the template the copy was made from.
  if (ref.createdFileId && !(await deleteDriveFile(ref.createdFileId))) return { ok: false };
  return { ok: true };
}

/* ------------------------------------------------------ Google Drive picker */

// content-gmail.js can't open chrome.windows itself (that API isn't exposed
// to content scripts), and the picker has to live in its own extension page
// rather than be loaded into the Gmail tab — Gmail's own CSP would be the
// one deciding whether https://apis.google.com's gapi loader is even
// allowed to run there, and there is no reason to depend on that. So the
// content script asks this worker to open the window, and this worker
// remembers which Gmail tab asked, keyed by the requestId the content
// script minted — multiple Gmail tabs can each have a picker open at once
// without their results crossing.
const pendingDrivePickers = new Map(); // requestId -> { tabId, windowId }

async function openDrivePicker(payload, sender) {
  const requestId = payload && payload.requestId;
  const tabId = sender && sender.tab && sender.tab.id;
  if (!requestId || !tabId) return { ok: false, error: 'Missing request context.' };

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('picker/picker.html') + '?requestId=' + encodeURIComponent(requestId),
    type: 'popup',
    width: 640,
    height: 620
  });
  if (!win) return { ok: false, error: 'Could not open the Drive picker window.' };
  pendingDrivePickers.set(requestId, { tabId, windowId: win.id });
  return { ok: true };
}

// picker.js posts this once, then closes its own window — this only ever
// routes the result back to the one Gmail tab that asked for it (via
// chrome.tabs.sendMessage), never a broadcast, so a second open Gmail tab
// never sees a file meant for the first.
function deliverDrivePickerResult(payload) {
  const { requestId, file, cancelled } = payload || {};
  const info = pendingDrivePickers.get(requestId);
  if (!info) return { ok: true }; // already delivered, or the requesting tab is gone
  pendingDrivePickers.delete(requestId);
  chrome.tabs.sendMessage(info.tabId, { type: 'flow:drive-file-result', requestId, file, cancelled }).catch(() => {});
  return { ok: true };
}

// The user closing the picker window (Escape, the × button, alt-F4) is a
// cancellation that never posts flow:drive-file-picked at all — without
// this, the content script's awaiting promise would simply hang forever.
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, info] of pendingDrivePickers) {
    if (info.windowId === windowId) {
      pendingDrivePickers.delete(requestId);
      chrome.tabs.sendMessage(info.tabId, { type: 'flow:drive-file-result', requestId, cancelled: true }).catch(() => {});
    }
  }
});

/* ------------------------------------------------------------------ Notion */

async function getNotionAuth() {
  const { notionAuth } = await chrome.storage.local.get('notionAuth');
  return notionAuth || null;
}

function notionHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

// Notion database ids appear in URLs as 32 hex characters, sometimes hyphenated,
// sometimes preceded by a page title slug.
function parseNotionDatabaseId(input) {
  const m = String(input || '').replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!m) return null;
  const h = m[0];
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

// Connecting verifies the credential against the real API before storing it, so
// a typo surfaces immediately in the popup instead of at the first click in Gmail.
async function connectNotion(token, databaseInput) {
  token = String(token || '').trim();
  const databaseId = parseNotionDatabaseId(databaseInput);
  if (!token) throw new Error('Paste the internal integration token from notion.so/my-integrations.');
  if (!databaseId) throw new Error('That doesn’t look like a Notion database link — open the database as a full page and copy the URL.');

  const res = await fetch(NOTION_API + '/databases/' + databaseId, { headers: notionHeaders(token) });
  if (res.status === 401) throw new Error('Notion rejected that token.');
  if (res.status === 404) throw new Error('Notion can see the token but not that database — open the database, click ⋯ › Connections, and add your integration.');
  if (!res.ok) throw new Error('Notion returned ' + res.status + '.');
  const db = await res.json();

  const title = (db.title || []).map((t) => t.plain_text).join('') || 'Untitled database';
  await chrome.storage.local.set({ notionAuth: { token, databaseId, dbTitle: title, schema: db.properties || {} } });
  return { title };
}

// Fills whichever properties the user's own database happens to have, matched by
// name and type. Anything unmatched still reaches the page body, so no extracted
// fact is ever silently dropped just because a column is missing.
function notionProperties(schema, p) {
  const f = p.facts || {};
  const props = {};
  const byType = (type, names) => {
    for (const [name, def] of Object.entries(schema || {})) {
      if (def.type !== type) continue;
      if (names.some((n) => name.toLowerCase().includes(n))) return name;
    }
    return null;
  };

  // The generated label ("Log ₪3,850 confirmed, Sep 22") is a task description,
  // not an identity — on its own in the title column it reads as a cryptic
  // system string. Leading with who the record is about (when Gmail gave us a
  // name) makes the row recognizable at a glance; the label still follows, so
  // no information is lost, only reordered.
  const titleName = Object.entries(schema || {}).find(([, d]) => d.type === 'title');
  if (titleName) {
    const identity = (p.senderName || '').trim();
    const content = identity ? identity + ' — ' + p.label : p.label;
    props[titleName[0]] = { title: [{ text: { content: content.slice(0, 200) } }] };
  }

  const amount = byType('number', ['amount', 'value', 'total', 'price', 'sum']);
  if (amount && f.money) props[amount] = { number: f.money.value };

  const date = byType('date', ['date', 'due', 'deadline', 'when']);
  if (date && f.date && f.date.iso) props[date] = { date: { start: f.date.iso } };

  const email = byType('email', ['email', 'contact', 'from']);
  if (email && p.senderEmail) props[email] = { email: p.senderEmail };

  const url = byType('url', ['url', 'link', 'source', 'email link']);
  if (url && p.threadUrl) props[url] = { url: p.threadUrl };

  // Deliberately not matching a "Company" column: the sender's personal name is
  // not their company, and writing it there would quietly corrupt the database.
  const person = byType('rich_text', ['from', 'sender', 'contact', 'who']);
  if (person && (p.senderName || p.senderEmail)) {
    props[person] = { rich_text: [{ text: { content: (p.senderName || p.senderEmail).slice(0, 200) } }] };
  }

  // Any select column is, by definition, a closed vocabulary the user already
  // typed out themselves (insurer names, product lines, ticket categories,
  // whatever). Rather than hardcoding a domain's worth of keyword lists here,
  // check the column's own configured option names against the source text —
  // this is what actually let "הראל" and "רכב" land in their select columns
  // instead of sitting unpopulated next to a title nobody could read.
  if (p.bodyText) {
    for (const [name, def] of Object.entries(schema || {})) {
      if (def.type !== 'select' || props[name]) continue;
      const options = (def.select && def.select.options) || [];
      const hit = options.find((o) => o.name && p.bodyText.includes(o.name));
      if (hit) props[name] = { select: { name: hit.name } };
    }
  }

  return props;
}

function notionBlocks(p) {
  const blocks = [];
  const lines = factLines(p);
  for (const [k, v] of lines) {
    blocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ text: { content: (k + ': ' + v).slice(0, 1800) } }] }
    });
  }
  if (p.facts && p.facts.quote) {
    blocks.push({ object: 'block', type: 'quote', quote: { rich_text: [{ text: { content: p.facts.quote.slice(0, 1800) } }] } });
  }
  if (p.threadUrl) {
    blocks.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: 'Open the original email in Gmail', link: { url: p.threadUrl } } }] }
    });
  }
  blocks.push({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: ATTRIBUTION_TEXT, link: { url: attributionUrl('notion') } } }, { text: { content: ' — one click, from the message itself.' } }], color: 'gray' }
  });
  return blocks;
}

// The schema captured at connect time goes stale the moment the user adds,
// renames, or retypes a column in their own database — notionProperties()
// would then never see the new column as something to match, so a fact
// that should now land in a real property silently falls back to the page
// body forever, for the life of the connection, with no way to notice
// short of reconnecting. Refetching before every write keeps property
// matching current. If the refresh itself fails (a momentary network
// blip, an expired-but-not-yet-revoked token), fall back to the last known
// schema rather than failing the whole write over a staleness check that
// isn't the reason the user clicked "Do It".
async function notionCurrentSchema(auth) {
  try {
    const res = await fetch(NOTION_API + '/databases/' + auth.databaseId, { headers: notionHeaders(auth.token) });
    if (!res.ok) return auth.schema || {};
    const db = await res.json();
    const schema = db.properties || {};
    // Keep the cached copy warm for anything else that reads getNotionAuth()
    // (e.g. dbTitle display) without making this write wait on it landing.
    chrome.storage.local.set({ notionAuth: Object.assign({}, auth, { schema }) });
    return schema;
  } catch (e) {
    return auth.schema || {};
  }
}

async function notionWrite(p) {
  const auth = await getNotionAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const schema = await notionCurrentSchema(auth);

  const res = await fetch(NOTION_API + '/pages', {
    method: 'POST',
    headers: notionHeaders(auth.token),
    body: JSON.stringify({
      parent: { database_id: auth.databaseId },
      properties: notionProperties(schema, p),
      children: notionBlocks(p)
    })
  });
  if (res.status === 401) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Notion write failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const page = await res.json();
  return { ok: true, where: 'Notion', target: auth.dbTitle || 'your database', ref: { pageId: page.id }, url: page.url || null };
}

// Notion has no hard delete over the API — archiving is the undo, and it is
// exactly what the trash button in the UI does.
async function notionUndo(ref) {
  const auth = await getNotionAuth();
  if (!auth || !ref || !ref.pageId) return { ok: false };
  const res = await fetch(NOTION_API + '/pages/' + encodeURIComponent(ref.pageId), {
    method: 'PATCH', headers: notionHeaders(auth.token), body: JSON.stringify({ archived: true })
  });
  // 404 matches the Google undoers: an already-archived page must not
  // stop a retry of the rest of the chain. Notion has no hard delete;
  // archiving is the undo, and a missing page is already gone.
  return { ok: res.ok || res.status === 404 };
}

/* ------------------------------------------------------------- glance-assist */
//
// Feature 2 (Draft-It) and Feature 3 (attachment X-ray) both need real
// language generation, which the rest of this file's connectors never have
// — every write path above is a structured API call, never a model call.
// content-gmail.js/sidebar.js only ever call FlowPrivacyShield.mask() BEFORE
// handing text to these two functions, so nothing that reaches
// glance-assist.js is a real name, company, amount, date, email, or phone
// number — see
// core/privacyShield.js and netlify/functions/glance-assist/glance-assist.js
// for the two ends of that contract. This file is just the relay: content
// scripts can't call a third-party API directly (no CORS grant, and no
// place to keep this off the page's own origin), so, same as every other
// connector above, the actual fetch happens here in the service worker.

const GLANCE_ASSIST_URL = 'https://theflow-ai.com/.netlify/functions/glance-assist';
const PRO_API = 'https://theflow-ai.com/.netlify/functions';

/* ------------------------------------------------------------- glance pro */
//
// Glance Pro is the paid tier. What it unlocks is exactly what costs us money
// per use: the masked-AI features above (Draft-It, attachment summaries). The
// free product — judging email, the Do It chip, writing to Google, Undo — never
// touches a licence. The policy helpers live in core/entitlements.js (used by
// the popup and the Gmail script); this file owns the only network calls and
// the only writes to the stored record, `proLicense`. The grace window below
// must equal FlowEntitlements.OFFLINE_GRACE_MS — a corpus test pins that.
//
// The server (glance-assist) checks the licence again on every call, so this
// local check is a courtesy that avoids a pointless request, not the gate.

const PRO_STORAGE_KEY = 'proLicense';
const PRO_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const PRO_RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;
const PRO_KEY_RE = /^GLNC(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}){4}$/;

function normalizeProKey(raw) {
  const compact = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 24 || !compact.startsWith('GLNC')) return null;
  const body = compact.slice(4);
  const key = 'GLNC-' + [0, 5, 10, 15].map((i) => body.slice(i, i + 5)).join('-');
  return PRO_KEY_RE.test(key) ? key : null;
}

async function getProRecord() {
  const stored = await chrome.storage.local.get(PRO_STORAGE_KEY);
  return stored[PRO_STORAGE_KEY] || null;
}

function proIsActive(record, now) {
  return Boolean(record && record.valid && record.key && typeof record.activeUntil === 'number' && now < record.activeUntil);
}

function proRecordFrom(key, answer, now) {
  const valid = Boolean(answer && answer.valid);
  return {
    key,
    valid,
    status: (answer && answer.status) || null,
    plan: (answer && answer.plan) || null,
    interval: (answer && answer.interval) || null,
    renewsAt: (answer && answer.renewsAt) || null,
    trialEnds: (answer && answer.trialEnds) || null,
    checkedAt: now,
    activeUntil: valid ? now + PRO_OFFLINE_GRACE_MS : 0
  };
}

async function proPost(endpoint, body) {
  const res = await fetch(PRO_API + '/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// Paste-a-key activation. Only a key the server confirms is stored.
async function activatePro(rawKey) {
  const key = normalizeProKey(rawKey);
  if (!key) return { ok: false, error: 'That does not look like a Glance Pro key. It starts with GLNC- and has four groups of five characters.' };
  let res;
  try {
    res = await proPost('verify-license', { key });
  } catch (e) {
    return { ok: false, error: 'Could not reach the licence server. Check your connection and try again.' };
  }
  if (res.status === 429) return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
  if (!res.ok || !res.data || !res.data.ok) return { ok: false, error: 'Could not check that key right now. Please try again.' };
  if (!res.data.valid) {
    const why = res.data.reason === 'inactive' ? 'That subscription is no longer active.' : 'That key was not recognised. Check it against your email.';
    return { ok: false, error: why };
  }
  const record = proRecordFrom(key, res.data, Date.now());
  await chrome.storage.local.set({ [PRO_STORAGE_KEY]: record });
  return { ok: true, record };
}

// Re-confirms a stored key in the background of normal use. A network failure
// keeps the existing record (the offline grace covers it); only the server
// saying "not valid" ends access early.
async function refreshPro(force) {
  const record = await getProRecord();
  if (!record || !record.key) return record;
  const now = Date.now();
  if (!force && record.checkedAt && now - record.checkedAt < PRO_RECHECK_AFTER_MS) return record;
  let res;
  try {
    res = await proPost('verify-license', { key: record.key });
  } catch (e) {
    return record;
  }
  if (!res.ok || !res.data || !res.data.ok) return record;
  const next = proRecordFrom(record.key, res.data, now);
  await chrome.storage.local.set({ [PRO_STORAGE_KEY]: next });
  return next;
}

async function proStatus() {
  const record = await refreshPro(false);
  return { ok: true, active: proIsActive(record, Date.now()), record: record || null };
}

async function deactivatePro() {
  await chrome.storage.local.remove(PRO_STORAGE_KEY);
  return { ok: true };
}

async function openBillingPortal() {
  const record = await getProRecord();
  if (!record || !record.key) return { ok: false, error: 'No Pro key is activated on this device.' };
  let res;
  try {
    res = await proPost('billing-portal', { key: record.key });
  } catch (e) {
    return { ok: false, error: 'Could not reach billing. Check your connection and try again.' };
  }
  if (!res.ok || !res.data || !res.data.url) return { ok: false, error: (res.data && res.data.error) || 'Could not open billing right now.' };
  return { ok: true, url: res.data.url };
}

function proRequiredError() {
  const err = new Error('This is part of Glance Pro.');
  err.code = 'pro_required';
  return err;
}

async function callGlanceAssist(body) {
  const record = await refreshPro(false);
  if (!proIsActive(record, Date.now())) throw proRequiredError();
  const res = await fetch(GLANCE_ASSIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, body, { licenseKey: record.key }))
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) {
    // The server says this key is not live (cancelled, refunded). Stop offering
    // the features now rather than at the next scheduled recheck.
    await chrome.storage.local.set({ [PRO_STORAGE_KEY]: Object.assign({}, record, { valid: false, activeUntil: 0, checkedAt: Date.now() }) });
    throw proRequiredError();
  }
  if (!res.ok || !data.ok) {
    const message = (data && data.error) || ('Request failed (' + res.status + ')');
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// payload: { lang: 'en'|'he', entries: [{ position, maskedBody }] } — all
// already masked by the caller; see glance-assist.js's draftReply().
async function draftReplyViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'draft-reply', lang: payload.lang, entries: payload.entries, style: payload.style || null });
  return { ok: true, draftText: data.draftText };
}

// payload: { maskedText } — already masked by the caller; see
// glance-assist.js's summarizeAttachment().
async function summarizeAttachmentViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'summarize-attachment', maskedText: payload.maskedText });
  return { ok: true, summary: data.summary, entities: data.entities };
}

// payload: { lang, maskedText } — already masked by the caller; see
// glance-assist.js's classify() and content-gmail.js's
// ensureRemoteClassification() for the one caller of this. Never called for
// every message — only when the local classifier already returned nothing.
async function classifyViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'classify', lang: payload.lang, maskedText: payload.maskedText });
  return { ok: true, result: data.result };
}


/* ------------------------------------------------ a model on this computer */
//
// core/local-lm-server.js is the portable description of this (and what popup.js uses to test it); this is the same
// two request shapes, kept here because the service worker loads no core files. test/local-lm-server-corpus.cjs runs both
// against one fake server and fails if they ever differ. The address is loopback-only, checked here again before every
// request. Nothing leaves this computer, nothing is installed or downloaded, and the answer only ever feeds a proposal.
const LM_SERVER_TIMEOUT_MS = 20000;
let lmServerChain = Promise.resolve();

function lmServerLoopback(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
}

async function lmServerPromptNow(text, schema) {
  const stored = await new Promise((r) => chrome.storage.local.get('localLmServer', r));
  const c = stored && stored.localLmServer;
  if (!c || c.enabled !== true || !c.model || !c.status) return { ok: false, reason: 'off' };
  const base = String(c.baseUrl || (c.provider === 'lmstudio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434')).replace(/\/+$/, '');
  if ((c.provider !== 'ollama' && c.provider !== 'lmstudio') || !lmServerLoopback(base)) return { ok: false, reason: 'refused' };
  const content = String(text || '').slice(0, 4000);
  let url, body;
  if (c.provider === 'ollama') {
    url = base + '/api/chat';
    body = { model: c.model, messages: [{ role: 'user', content }], stream: false, options: { temperature: 0 } };
    if (schema) body.format = schema;
  } else {
    url = base + '/v1/chat/completions';
    body = { model: c.model, messages: [{ role: 'user', content }], temperature: 0, stream: false };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'glance', strict: true, schema } };
  }
  if (!lmServerLoopback(url)) return { ok: false, reason: 'refused' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LM_SERVER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const json = await res.json();
    const out = c.provider === 'ollama' ? (json && json.message && json.message.content) : (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content);
    return typeof out === 'string' ? { ok: true, text: out } : { ok: false, reason: 'bad-response' };
  } catch (e) {
    return { ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally { clearTimeout(timer); }
}

// One question at a time: a laptop model asked several things at once only gets slower.
function lmServerPrompt(text, schema) {
  const run = lmServerChain.then(() => lmServerPromptNow(text, schema));
  lmServerChain = run.catch(() => {});
  return run;
}

/* ---------------------------------------------------------------- dispatch */

// 'googleTask' (singular) is the action *kind* actions.js proposes; 'googleTasks'
// (plural) is the connector id the popup's connect/disconnect flow and
// connectorStatus() use. Same underlying write — kept as two keys pointing at
// the same functions rather than renaming either caller to match the other.
//
// The hubspot/notion/salesforce/slack/monday entries below are no longer
// reachable from the live Gmail chip — content-gmail.js's action-planning
// pipeline (intent.js -> actions.js) only ever proposes calendar/gmailDraft/
// googleTask actions, and scanReadingPane() now stays silent entirely for a
// stored connectorId that isn't 'googleTasks' rather than routing to one of
// these (see the comment at that check). They're left wired here only so
// flow:execute-action/flow:connect keep working for whatever still calls
// them directly (the popup's own connect/disconnect flow, direct testing) —
// not because the multi-action engine still writes to them.
const WRITERS = {
  hubspot: hubspotWrite, notion: notionWrite, salesforce: salesforceWrite, slack: slackWrite, monday: mondayWrite,
  googleTasks: googleTasksWrite, googleTask: googleTasksWrite,
  calendar: googleCalendarWrite, gmailDraft: gmailDraftWrite,
  driveDoc: googleDriveCreateDoc, driveSheet: googleDriveCreateSheet, driveFile: googleDriveCopyFile
};
const UNDOERS = {
  hubspot: hubspotUndo, notion: notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo,
  googleTasks: googleTasksUndo, googleTask: googleTasksUndo,
  calendar: googleCalendarUndo, gmailDraft: gmailDraftUndo,
  driveDoc: googleDriveTrash, driveSheet: googleDriveTrash, driveFile: googleDriveTrash
};

async function connectorStatus() {
  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  const sf = await getSalesforceAuth();
  const sl = await getSlackAuth();
  const md = await getMondayAuth();
  const gt = await getGoogleTasksAuth();
  return {
    googleTasks: {
      connected: Boolean(gt),
      configured: googleTasksConfigured(),
      detail: gt ? GLANCE_TASK_LIST_TITLE + ' list' : null
    },
    hubspot: {
      connected: Boolean(hs),
      configured: Boolean(HUBSPOT_CLIENT_ID)
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null },
    salesforce: {
      connected: Boolean(sf),
      configured: Boolean(SALESFORCE_CLIENT_ID)
    },
    slack: {
      connected: Boolean(sl),
      configured: Boolean(SLACK_CLIENT_ID),
      detail: sl ? '#' + sl.channelId : null
    },
    monday: {
      connected: Boolean(md),
      configured: Boolean(MONDAY_CLIENT_ID),
      detail: md ? 'Board ' + md.boardId : null
    }
  };
}

function reply(sendResponse, promise) {
  promise
    .then((r) => sendResponse(r))
    .catch((err) => sendResponse({ ok: false, reason: 'error', code: (err && err.code) || undefined, error: String((err && err.message) || err) }));
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'flow:connector-status') return reply(sendResponse, connectorStatus());

  if (msg.type === 'flow:connect') {
    if (msg.connectorId === 'googleTasks') return reply(sendResponse, connectGoogleTasks().then(() => ({ ok: true })));
    if (msg.connectorId === 'hubspot') return reply(sendResponse, connectHubspot().then(() => ({ ok: true })));
    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'salesforce') return reply(sendResponse, connectSalesforce().then(() => ({ ok: true })));
    if (msg.connectorId === 'slack') return reply(sendResponse, connectSlack(msg.channel).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'monday') return reply(sendResponse, connectMonday(msg.board).then(() => ({ ok: true })));
    return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
  }

  if (msg.type === 'flow:disconnect') {
    const STORAGE_KEYS = {
      hubspot: 'hubspotAuth', notion: 'notionAuth', salesforce: 'salesforceAuth', slack: 'slackAuth', monday: 'mondayAuth',
      googleTasks: 'googleTasksAuth'
    };
    const key = STORAGE_KEYS[msg.connectorId] || null;
    if (!key) return reply(sendResponse, Promise.resolve({ ok: false }));
    // Google Tasks also evicts Chrome's own cached token, not just Flow's
    // local record of which list to write to — otherwise "Disconnect" then
    // "Connect" again silently reuses the same grant instead of giving the
    // user a real chance to pick a different Google account.
    const extra = msg.connectorId === 'googleTasks'
      ? getGoogleAuthToken(false).then(removeCachedGoogleAuthToken).catch(() => {})
      : Promise.resolve();
    return reply(sendResponse, extra.then(() => chrome.storage.local.remove(key)).then(() => ({ ok: true })));
  }

  if (msg.type === 'flow:fact-sources') {
    return reply(sendResponse, factSources(msg.payload || {}));
  }

  if (msg.type === 'flow:execute-action') {
    const writer = WRITERS[msg.payload && msg.payload.connectorId];
    if (!writer) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
    return reply(sendResponse, writer(msg.payload));
  }

  if (msg.type === 'flow:undo-action') {
    const undoer = UNDOERS[msg.connectorId];
    if (!undoer) return reply(sendResponse, Promise.resolve({ ok: false }));
    return reply(sendResponse, undoer(msg.ref));
  }

  if (msg.type === 'flow:draft-reply') {
    return reply(sendResponse, draftReplyViaBackend(msg.payload || {}));
  }

  if (msg.type === 'flow:summarize-attachment') {
    return reply(sendResponse, summarizeAttachmentViaBackend(msg.payload || {}));
  }

  if (msg.type === 'flow:follow-task') return reply(sendResponse, followTaskCreate(msg.payload || {}));
  if (msg.type === 'flow:follow-complete') return reply(sendResponse, followTaskComplete(msg.ref));
  if (msg.type === 'flow:follow-task-status') return reply(sendResponse, followTaskStatuses(msg.refs));
  if (msg.type === 'flow:follow-reschedule') return reply(sendResponse, followTaskSchedule(msg.ref, msg.dueIso, msg.title));
  if (msg.type === 'flow:follow-reopen') return reply(sendResponse, followTaskReopen(msg.ref, msg.dueIso));
  if (msg.type === 'flow:follow-draft') return reply(sendResponse, followDraftCreate(msg.payload || {}));

  if (msg.type === 'flow:pro-status') return reply(sendResponse, proStatus());
  if (msg.type === 'flow:pro-activate') return reply(sendResponse, activatePro(msg.key));
  if (msg.type === 'flow:pro-deactivate') return reply(sendResponse, deactivatePro());
  if (msg.type === 'flow:pro-billing') return reply(sendResponse, openBillingPortal());

  if (msg.type === 'flow:lm-server-prompt') return reply(sendResponse, lmServerPrompt(msg.text, msg.schema));

  if (msg.type === 'flow:classify-remote') {
    return reply(sendResponse, classifyViaBackend(msg.payload || {}));
  }

  if (msg.type === 'flow:surface-status') return reply(sendResponse, surfaceStatus());
  if (msg.type === 'flow:surface-enable') return reply(sendResponse, enableSurface(msg.id));
  if (msg.type === 'flow:surface-disable') return reply(sendResponse, disableSurface(msg.id));
  if (msg.type === 'flow:surface-health') return reply(sendResponse, noteSurfaceHealth(msg.id, msg.ok, msg.reason));

  // Outside signals (core/outside-signals.js): did a calendar event or a shared file settle a loop? These two read
  // metadata only (ids, times, invitee and sharee addresses), never titles or file contents, and the caller sends
  // the one address it is asking about.
  if (msg.type === 'flow:outside-calendar') {
    return reply(sendResponse, (async () => {
      if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
      const email = String(msg.email || '').slice(0, 200);
      const since = Number(msg.sinceMs);
      if (!email || !(since > 0)) return { ok: false, reason: 'bad-request' };
      const q = new URLSearchParams({ q: email, timeMin: new Date(since - 24 * 3600 * 1000).toISOString(), singleEvents: 'true', maxResults: '25', orderBy: 'startTime',
        fields: 'items(id,status,created,start,organizer(email),attendees(email,responseStatus))' });
      const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events?' + q.toString(), { method: 'GET' });
      if (!res.ok) return { ok: false, reason: 'error' };
      const data = await res.json();
      const events = (data.items || []).map((e) => ({ id: e.id, status: e.status || 'confirmed', startIso: (e.start && (e.start.dateTime || e.start.date)) || null,
        createdMs: e.created ? Date.parse(e.created) : null, organizer: (e.organizer && e.organizer.email) || null,
        attendees: (e.attendees || []).filter((a) => a && a.email).map((a) => ({ email: a.email, response: a.responseStatus || 'needsAction' })) }));
      return { ok: true, events };
    })());
  }

  if (msg.type === 'flow:outside-drive') {
    return reply(sendResponse, (async () => {
      if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
      const since = Number(msg.sinceMs);
      const terms = (Array.isArray(msg.terms) ? msg.terms : []).map((t) => String(t).replace(/['\\]/g, '')).filter((t) => t.length >= 2).slice(0, 8);
      if (!(since > 0) || !terms.length) return { ok: false, reason: 'bad-request' };
      const q = "trashed = false and modifiedTime > '" + new Date(since).toISOString() + "' and (" + terms.map((t) => "name contains '" + t + "'").join(' or ') + ')';
      const path = '/files?q=' + encodeURIComponent(q) + '&pageSize=25&corpora=user&fields=' + encodeURIComponent('files(id,name,modifiedTime,permissions(emailAddress))');
      const res = await googleAuthedFetch(GOOGLE_DRIVE_API, path);
      if (!res.ok) return { ok: false, reason: 'error' };
      const data = await res.json();
      const files = (data.files || []).map((f) => ({ id: f.id, name: f.name, modifiedMs: f.modifiedTime ? Date.parse(f.modifiedTime) : null,
        sharedWith: (f.permissions || []).map((x) => x.emailAddress).filter(Boolean) }));
      return { ok: true, files };
    })());
  }

  if (msg.type === 'flow:search-drive') {
    return reply(sendResponse, (async () => {
      if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
      const files = await searchDriveFiles(msg.query);
      if (!files) return { ok: false, reason: 'error' };
      return { ok: true, files };
    })());
  }

  if (msg.type === 'flow:drive-find-one') {
    return reply(sendResponse, driveFindOneByName(msg.term));
  }

  if (msg.type === 'flow:open-drive-picker') {
    return reply(sendResponse, openDrivePicker(msg.payload || {}, sender));
  }

  if (msg.type === 'flow:drive-file-picked') {
    return reply(sendResponse, Promise.resolve(deliverDrivePickerResult(msg.payload || {})));
  }

  // Fire-and-forget, same as flow:track below — the caller already computed
  // the Still Open count (0–3). This file never re-derives it, and it never
  // talks back, so a slow or missing response can never affect what the
  // sender does next.
  if (msg.type === 'flow:pending-count') {
    updateBadge(Number(msg.count) || 0);
    return;
  }

  // Fire-and-forget: telemetry is never allowed to affect what the caller
  // does next, so this always resolves { ok: true } even if the relay call
  // itself fails. See track-event.js for what does and does not leave the
  // device — never email content, sender identity, or extracted facts.
  if (msg.type === 'flow:track') {
    return reply(sendResponse, trackEvent(msg.event, msg.params).then(() => ({ ok: true })).catch(() => ({ ok: true })));
  }

  // Makes this file's own getInstallId() the single canonical generator —
  // the service worker is the one long-lived instance this extension has,
  // so it's the natural place for "generate once, reuse forever" to
  // actually live. storage.js's own getInstallId() (used by the popup's
  // referral link) asks for this first and only falls back to generating
  // its own if the message fails; see that function's own comment for why
  // two independent generators writing the same chrome.storage.local key
  // was worth closing even though the practical race window was narrow.
  if (msg.type === 'flow:get-install-id') {
    return reply(sendResponse, getInstallId().then((id) => ({ ok: true, id })));
  }
});

// Mirrors storage.js's getInstallId rather than importing it — background.js
// has never loaded storage.js (it talks to chrome.storage.local directly
// throughout this file, same as every other auth blob above), and this way
// the service worker gains no new cross-file dependency for one field.
// Caches the in-flight PROMISE, not just the resolved id — the read-then-
// write below has the same gap storage.js's own getInstallId used to have
// before it became canonical: two concurrent callers (a 'chip_shown'
// trackEvent firing at the same moment a content script's own first-ever
// getInstallId message arrives) can each read `undefined` before either
// write lands, and whichever set() runs second silently overwrites the
// first's id. Caching the promise means every concurrent caller during
// generation awaits the exact same in-progress call instead of racing a
// second one; once resolved, later calls just get the resolved id back
// with no further storage read. Reset only by a service-worker restart,
// which is correct — the NEXT call reads whatever chrome.storage.local
// already has, exactly like before this existed.
let installIdPromise = null;
async function getInstallId() {
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const { installId } = await chrome.storage.local.get('installId');
      if (installId) return installId;
      const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 12);
      await chrome.storage.local.set({ installId: id });
      return id;
    })();
  }
  return installIdPromise;
}

async function trackEvent(name, params) {
  try {
    const installId = await getInstallId();
    await fetch('https://theflow-ai.com/.netlify/functions/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, event: name, params: params || {} })
    });
  } catch (e) {
    // non-fatal — see comment above
  }
}
