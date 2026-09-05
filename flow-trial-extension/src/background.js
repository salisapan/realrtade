// Service worker. Owns everything a content script must not do itself: holding
// credentials, talking to third-party APIs, and performing the one write per
// click that this product exists for.
//
// Two connectors are wired up here.
//
//   Notion works today. It authenticates with an internal integration token the
//   user creates themselves, so there is no app registration, no review queue and
//   no server-side secret anywhere in the path.
//
//   HubSpot uses OAuth, which requires a registered app whose Client Secret must
//   never ship inside an extension. The secret lives only as a Netlify
//   environment variable read by the two exchange functions; the Client ID below
//   is public, in the same way a GA4 measurement ID is public.
//
// Both write paths are deliberately additive: they create one new record and
// return enough information to undo it. Nothing here ever edits or deletes
// something the user already had.

// TODO(owner): set this to the Client ID from your HubSpot public app
// (developers.hubspot.com > your app > Auth). Until then the HubSpot connector
// reports itself unconfigured rather than failing halfway through a handshake.
const HUBSPOT_CLIENT_ID = 'YOUR_HUBSPOT_CLIENT_ID';

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';
const HUBSPOT_API = 'https://api.hubapi.com';
const EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-exchange';
const REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-refresh';

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

const WRITERS = { hubspot: hubspotWrite, notion: notionWrite };
const UNDOERS = { hubspot: hubspotUndo, notion: notionUndo };

async function connectorStatus() {
  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  return {
    hubspot: {
      connected: Boolean(hs),
      configured: Boolean(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_ID !== 'YOUR_HUBSPOT_CLIENT_ID')
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null }
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
    return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
  }

  if (msg.type === 'flow:disconnect') {
    const key = msg.connectorId === 'hubspot' ? 'hubspotAuth' : msg.connectorId === 'notion' ? 'notionAuth' : null;
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
