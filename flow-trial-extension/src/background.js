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
//   function; the Client ID constants below are public, in the same way a
//   GA4 measurement ID is public.
//
// Every write path is deliberately additive and conservative: it only ever
// writes to something that already exists — an existing matching Contact, a
// channel or board the user names — never creating or editing a Contact,
// Deal, or item beyond the one new record. Each returns enough information
// to undo it. Nothing here ever edits or deletes something the user already
// had.

// TODO(owner): set this to the Client ID from your HubSpot public app
// (developers.hubspot.com > your app > Auth). Until then the HubSpot connector
// reports itself unconfigured rather than failing halfway through a handshake.
const HUBSPOT_CLIENT_ID = 'YOUR_HUBSPOT_CLIENT_ID';

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';
const HUBSPOT_API = 'https://api.hubapi.com';
const EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-exchange';
const REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-refresh';

// TODO(owner): set this to the Consumer Key from your Salesforce Connected App
// (Setup > App Manager > your app > View > Consumer Key). Until then the
// Salesforce connector reports itself unconfigured rather than failing
// halfway through a handshake.
const SALESFORCE_CLIENT_ID = 'YOUR_SALESFORCE_CLIENT_ID';
// login.salesforce.com is the standard entry point and redirects sandbox/My
// Domain orgs correctly on its own; instance_url (returned by the token
// exchange) is what every API call after that actually uses.
const SALESFORCE_AUTH_BASE = 'https://login.salesforce.com/services/oauth2/authorize';
const SALESFORCE_SCOPES = 'api refresh_token';
const SALESFORCE_API_VERSION = 'v59.0';
const SF_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-exchange';
const SF_REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-refresh';

// TODO(owner): set this to the Client ID from your Slack App
// (api.slack.com/apps > your app > Basic Information > App Credentials).
// Until then the Slack connector reports itself unconfigured rather than
// failing halfway through a handshake.
const SLACK_CLIENT_ID = 'YOUR_SLACK_CLIENT_ID';
const SLACK_AUTH_BASE = 'https://slack.com/oauth/v2/authorize';
// chat:write.public lets the bot post to public channels without an explicit
// /invite first — the closest a bot token gets to Notion's zero-friction feel.
const SLACK_SCOPES = 'chat:write,chat:write.public';
const SLACK_API = 'https://slack.com/api';
const SLACK_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/slack-oauth-exchange';

// TODO(owner): set this to the Client ID from your Monday.com OAuth app
// (monday.com > Developer > My Apps > your app > OAuth). Until then the
// Monday.com connector reports itself unconfigured rather than failing
// halfway through a handshake.
const MONDAY_CLIENT_ID = 'YOUR_MONDAY_CLIENT_ID';
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
// chrome.identity token, requested with all three scopes from
// manifest.json's oauth2.scopes at once — so there is one "connect Google"
// step for the whole execution layer, not three.
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
const ATTRIBUTION_URL = 'https://theflow-ai.com/trial.html?ref=note';
const ATTRIBUTION_TEXT = 'Logged by Glance — theflow-ai.com/trial';

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

// The lines a human would want to see on the record six months from now.
function factLines(p) {
  const f = p.facts || {};
  const out = [];
  if (f.moneyText) out.push(['Amount', f.moneyText]);
  const dateText = f.dateText || humanDateFallback(f.date);
  if (dateText) out.push(['Date', dateText + (f.date && f.date.iso && f.date.iso !== dateText ? ' (' + f.date.iso + ')' : '')]);
  if (p.senderName || p.senderEmail) out.push(['From', [p.senderName, p.senderEmail && '<' + p.senderEmail + '>'].filter(Boolean).join(' ')]);
  if (p.subject) out.push(['Subject', p.subject]);
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
  if (!HUBSPOT_CLIENT_ID || HUBSPOT_CLIENT_ID === 'YOUR_HUBSPOT_CLIENT_ID') {
    throw new Error('HubSpot isn’t configured on this build yet. Notion works today — connect that instead.');
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
    '<p><i>Logged by <a href="' + ATTRIBUTION_URL + '">Glance</a> — one click, from the message itself.</i></p>'
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
  if (!SALESFORCE_CLIENT_ID || SALESFORCE_CLIENT_ID === 'YOUR_SALESFORCE_CLIENT_ID') {
    throw new Error('Salesforce isn’t configured on this build yet. Notion works today — connect that instead.');
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
  lines.push(ATTRIBUTION_TEXT + ' — ' + ATTRIBUTION_URL);
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
  if (!SLACK_CLIENT_ID || SLACK_CLIENT_ID === 'YOUR_SLACK_CLIENT_ID') {
    throw new Error('Slack isn’t configured on this build yet. Notion works today — connect that instead.');
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
  parts.push('_<' + ATTRIBUTION_URL + '|Logged by Glance> — one click, from the message itself._');
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
  if (!MONDAY_CLIENT_ID || MONDAY_CLIENT_ID === 'YOUR_MONDAY_CLIENT_ID') {
    throw new Error('Monday.com isn’t configured on this build yet. Notion works today — connect that instead.');
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
  lines.push(ATTRIBUTION_TEXT + ' — ' + ATTRIBUTION_URL);
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
    throw new Error('Google Tasks isn’t configured on this build yet. Notion works today — connect that instead.');
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

function googleTaskDue(f) {
  if (!f || !f.date || !f.date.iso) return null;
  // The Tasks API requires a full RFC3339 timestamp on `due` but only ever
  // displays and sorts by the date portion — midnight UTC keeps the date
  // from shifting a day either direction regardless of the signed-in
  // account's own timezone setting.
  return f.date.iso + 'T00:00:00.000Z';
}

async function googleTasksWrite(p) {
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const f = p.facts || {};
  const notesLines = factLines(p);
  if (p.threadUrl) notesLines.push(['Open in Gmail', p.threadUrl]);
  const notes = notesLines.map(([k, v]) => k + ': ' + v).join('\n');

  const body = { title: googleTaskTitle(p).slice(0, 1024), notes: notes.slice(0, 8192) };
  const due = googleTaskDue(f);
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

async function googleCalendarWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  if (!params.dateIso || params.hour == null || params.minute == null) {
    return { ok: false, reason: 'error', error: 'Missing a date and time for this event.' };
  }

  const timeZone = localTimeZone();
  const descriptionLines = [];
  if (p.threadUrl) descriptionLines.push('Open in Gmail: ' + p.threadUrl);
  descriptionLines.push(ATTRIBUTION_TEXT + ' — ' + ATTRIBUTION_URL);

  const body = {
    summary: String(params.title || 'Meeting').slice(0, 200),
    description: descriptionLines.join('\n'),
    start: { dateTime: calendarDateTime(params.dateIso, params.hour, params.minute), timeZone },
    end: { dateTime: calendarDateTime(params.dateIso, params.hour, params.minute, CALENDAR_DEFAULT_DURATION_MIN), timeZone }
  };

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
  return {
    ok: true,
    where: 'Google Calendar',
    target: 'your calendar',
    ref: { eventId: event.id },
    // htmlLink is a real field the Calendar API documents and always
    // returns on a created event — unlike the Gmail draft link below, this
    // one is safe to hand straight to the user.
    url: event.htmlLink || null
  };
}

async function googleCalendarUndo(ref) {
  if (!ref || !ref.eventId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ref.eventId), {
    method: 'DELETE'
  });
  // 410 Gone is Calendar's own "already deleted" — as final as a 404 anywhere else.
  return { ok: res.ok || res.status === 404 || res.status === 410 };
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

function draftBodyText(p) {
  const params = p.params || {};
  const lines = [draftGreeting(p.senderName), ''];
  if (params.what && params.when) lines.push('Following up on: ' + params.what + ' (' + params.when + ')');
  else if (params.what) lines.push('Following up on: ' + params.what);
  else lines.push('Following up on your message below.');
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

    const contentRes = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(driveFileId) + '?alt=media');
    if (!contentRes.ok) return null;
    const buf = await contentRes.arrayBuffer();
    // Declared size can be absent or wrong; the actual byte count is the
    // real guard — same policy as content-gmail.js's own attachment fetch.
    if (buf.byteLength > GMAIL_ATTACHMENT_MAX_BYTES) return null;

    return {
      filename: meta.name || 'attachment',
      mimeType: meta.mimeType || 'application/octet-stream',
      base64: arrayBufferToBase64(buf)
    };
  } catch (e) {
    return null;
  }
}

async function gmailDraftWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'error', error: 'No sender address to reply to.' };

  const params = p.params || {};
  let attachment = null;
  if (params.includeAttachment && p.attachment && p.attachment.base64) {
    const approxBytes = Math.floor((p.attachment.base64.length * 3) / 4);
    // Oversized attachments degrade to a plain draft rather than failing the
    // whole action — the same "still useful, just not everything asked for"
    // shape as findThreadId() above.
    if (approxBytes <= GMAIL_ATTACHMENT_MAX_BYTES) {
      attachment = { filename: p.attachment.filename, mimeType: p.attachment.mimeType, base64: p.attachment.base64 };
    }
  }
  // A file the user explicitly picked from Drive takes precedence over a
  // thread attachment neither of them chose — this only ever runs when the
  // thread-attachment branch above found nothing to attach, so a picked
  // file is never silently dropped in favor of one auto-guessed from the
  // thread.
  if (!attachment && params.driveFileId) {
    attachment = await fetchDriveFileAsAttachment(params.driveFileId);
  }

  const threadId = await findThreadId(p.senderEmail, p.subject);
  const raw = base64UrlEncode(buildMimeMessage({
    to: toHeaderValue(p.senderEmail, p.senderName),
    subject: draftSubject(p),
    body: draftBodyText(p),
    attachment
  }));

  const message = { raw };
  if (threadId) message.threadId = threadId;

  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Gmail draft creation failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const draft = await res.json();
  return {
    ok: true,
    where: 'Gmail',
    target: attachment ? 'a draft reply with the attachment' : 'a draft reply',
    ref: { draftId: draft.id },
    // The Drafts API doesn't return a stable, documented deep link to one
    // specific draft the way Calendar's htmlLink does — linking to the
    // Drafts folder itself is the honest version of "go see it" rather than
    // a guessed URL that might not open the right thing.
    url: 'https://mail.google.com/mail/u/0/#drafts'
  };
}

async function gmailDraftUndo(ref) {
  if (!ref || !ref.draftId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts/' + encodeURIComponent(ref.draftId), {
    method: 'DELETE'
  });
  return { ok: res.ok || res.status === 404 };
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
    paragraph: { rich_text: [{ text: { content: ATTRIBUTION_TEXT, link: { url: ATTRIBUTION_URL } } }, { text: { content: ' — one click, from the message itself.' } }], color: 'gray' }
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
  return { ok: res.ok };
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

async function callGlanceAssist(body) {
  const res = await fetch(GLANCE_ASSIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
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
  const data = await callGlanceAssist({ action: 'draft-reply', lang: payload.lang, entries: payload.entries });
  return { ok: true, draftText: data.draftText };
}

// payload: { maskedText } — already masked by the caller; see
// glance-assist.js's summarizeAttachment().
async function summarizeAttachmentViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'summarize-attachment', maskedText: payload.maskedText });
  return { ok: true, summary: data.summary, entities: data.entities };
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
  calendar: googleCalendarWrite, gmailDraft: gmailDraftWrite
};
const UNDOERS = {
  hubspot: hubspotUndo, notion: notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo,
  googleTasks: googleTasksUndo, googleTask: googleTasksUndo,
  calendar: googleCalendarUndo, gmailDraft: gmailDraftUndo
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
      configured: Boolean(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_ID !== 'YOUR_HUBSPOT_CLIENT_ID')
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null },
    salesforce: {
      connected: Boolean(sf),
      configured: Boolean(SALESFORCE_CLIENT_ID && SALESFORCE_CLIENT_ID !== 'YOUR_SALESFORCE_CLIENT_ID')
    },
    slack: {
      connected: Boolean(sl),
      configured: Boolean(SLACK_CLIENT_ID && SLACK_CLIENT_ID !== 'YOUR_SLACK_CLIENT_ID'),
      detail: sl ? '#' + sl.channelId : null
    },
    monday: {
      connected: Boolean(md),
      configured: Boolean(MONDAY_CLIENT_ID && MONDAY_CLIENT_ID !== 'YOUR_MONDAY_CLIENT_ID'),
      detail: md ? 'Board ' + md.boardId : null
    }
  };
}

function reply(sendResponse, promise) {
  promise
    .then((r) => sendResponse(r))
    .catch((err) => sendResponse({ ok: false, reason: 'error', error: String((err && err.message) || err) }));
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

  if (msg.type === 'flow:open-drive-picker') {
    return reply(sendResponse, openDrivePicker(msg.payload || {}, sender));
  }

  if (msg.type === 'flow:drive-file-picked') {
    return reply(sendResponse, Promise.resolve(deliverDrivePickerResult(msg.payload || {})));
  }

  // Fire-and-forget, same as flow:track below — the caller already computed
  // the real number from FlowStorage.getPending().length; this never talks
  // back, so a slow or missing response can never affect what the sender
  // does next.
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
