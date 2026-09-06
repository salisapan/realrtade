// Service worker. Owns everything a content script must not do itself: holding
// credentials, talking to third-party APIs, and performing the one write per
// click that this product exists for.
//
// Five connectors are wired up here.
//
//   Notion works today. It authenticates with an internal integration token the
//   user creates themselves, so there is no app registration, no review queue and
//   no server-side secret anywhere in the path.
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

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Every write lands in a shared Notion database or a shared CRM contact —
// somewhere a teammate who never installed Flow will see it. One quiet,
// factual line crediting the tool (not a banner, not a plug) is the entire
// distribution channel this trial has: read organically by exactly the
// person it would actually help, at the moment they're already looking at
// proof it works.
const ATTRIBUTION_URL = 'https://theflow-ai.com/trial.html?ref=note';
const ATTRIBUTION_TEXT = 'Logged by Flow — theflow-ai.com/trial';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
});

/* ------------------------------------------------------------------ shared */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The lines a human would want to see on the record six months from now.
function factLines(p) {
  const f = p.facts || {};
  const out = [];
  if (f.moneyText) out.push(['Amount', f.moneyText]);
  if (f.dateText) out.push(['Date', f.dateText + (f.date && f.date.iso && f.date.iso !== f.dateText ? ' (' + f.date.iso + ')' : '')]);
  if (p.senderName || p.senderEmail) out.push(['From', [p.senderName, p.senderEmail && '<' + p.senderEmail + '>'].filter(Boolean).join(' ')]);
  if (p.subject) out.push(['Subject', p.subject]);
  return out;
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

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(resultUrl).searchParams.get('code');
  if (!code) throw new Error('HubSpot did not return an authorization code.');

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
    '<p><i>Logged by <a href="' + ATTRIBUTION_URL + '">Flow</a> — one click, from the message itself.</i></p>'
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

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(resultUrl).searchParams.get('code');
  if (!code) throw new Error('Salesforce did not return an authorization code.');

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

async function salesforceFindContactByEmail(auth, email) {
  const soql = "SELECT Id FROM Contact WHERE Email = '" + email.replace(/'/g, "\\'") + "' LIMIT 1";
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
    throw new Error('Paste the channel ID Flow should post to — open the channel in Slack, "View channel details", it’s at the bottom.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    SLACK_AUTH_BASE +
    '?client_id=' + encodeURIComponent(SLACK_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(SLACK_SCOPES);

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(resultUrl).searchParams.get('code');
  if (!code) throw new Error('Slack did not return an authorization code.');

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
  parts.push('_<' + ATTRIBUTION_URL + '|Logged by Flow> — one click, from the message itself._');
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
    throw new Error('Paste the board ID Flow should write to — open the board in Monday.com, it’s the number in the URL after /boards/.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    MONDAY_AUTH_BASE +
    '?client_id=' + encodeURIComponent(MONDAY_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri);

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(resultUrl).searchParams.get('code');
  if (!code) throw new Error('Monday.com did not return an authorization code.');

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

  const titleName = Object.entries(schema || {}).find(([, d]) => d.type === 'title');
  if (titleName) props[titleName[0]] = { title: [{ text: { content: p.label.slice(0, 200) } }] };

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

async function notionWrite(p) {
  const auth = await getNotionAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const res = await fetch(NOTION_API + '/pages', {
    method: 'POST',
    headers: notionHeaders(auth.token),
    body: JSON.stringify({
      parent: { database_id: auth.databaseId },
      properties: notionProperties(auth.schema, p),
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

/* ---------------------------------------------------------------- dispatch */

const WRITERS = { hubspot: hubspotWrite, notion: notionWrite, salesforce: salesforceWrite, slack: slackWrite, monday: mondayWrite };
const UNDOERS = { hubspot: hubspotUndo, notion: notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo };

async function connectorStatus() {
  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  const sf = await getSalesforceAuth();
  const sl = await getSlackAuth();
  const md = await getMondayAuth();
  return {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'flow:connector-status') return reply(sendResponse, connectorStatus());

  if (msg.type === 'flow:connect') {
    if (msg.connectorId === 'hubspot') return reply(sendResponse, connectHubspot().then(() => ({ ok: true })));
    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'salesforce') return reply(sendResponse, connectSalesforce().then(() => ({ ok: true })));
    if (msg.connectorId === 'slack') return reply(sendResponse, connectSlack(msg.channel).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'monday') return reply(sendResponse, connectMonday(msg.board).then(() => ({ ok: true })));
    return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
  }

  if (msg.type === 'flow:disconnect') {
    const STORAGE_KEYS = {
      hubspot: 'hubspotAuth', notion: 'notionAuth', salesforce: 'salesforceAuth', slack: 'slackAuth', monday: 'mondayAuth'
    };
    const key = STORAGE_KEYS[msg.connectorId] || null;
    if (!key) return reply(sendResponse, Promise.resolve({ ok: false }));
    return reply(sendResponse, chrome.storage.local.remove(key).then(() => ({ ok: true })));
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
});
