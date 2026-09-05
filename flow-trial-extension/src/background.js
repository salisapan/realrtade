// Service worker. Owns the two things a content script cannot safely do
// itself: the OAuth handshake with HubSpot (requires a client secret, which
// must never ship inside the extension) and the actual authenticated write
// against HubSpot's API once connected.
//
// TODO(owner): set this to the Client ID from your HubSpot public app
// (developers.hubspot.com > your app > Auth). The Client ID is not secret —
// it's fine to ship in the extension, the same way GA4's Measurement ID
// ships in plain site HTML. The Client SECRET must never go here; it lives
// only as a Netlify environment variable read by hubspot-oauth-exchange and
// hubspot-oauth-refresh.
const HUBSPOT_CLIENT_ID = 'YOUR_HUBSPOT_CLIENT_ID';

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';
const HUBSPOT_API = 'https://api.hubapi.com';
const EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-exchange';
const REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-refresh';

// HubSpot's documented default association type ID for "note to contact"
// (see developers.hubspot.com > CRM > Associations > default association
// types). If HubSpot ever changes this, note creation fails loudly with a
// 4xx from their API rather than silently miswriting data.
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
});

async function getHubspotAuth() {
  const { hubspotAuth } = await chrome.storage.local.get('hubspotAuth');
  return hubspotAuth || null;
}

async function saveHubspotAuth(tokenResponse) {
  const expires_at = Date.now() + tokenResponse.expires_in * 1000 - 60000; // 60s safety margin
  await chrome.storage.local.set({
    hubspotAuth: {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at
    }
  });
}

async function connectHubspot() {
  if (!HUBSPOT_CLIENT_ID || HUBSPOT_CLIENT_ID === 'YOUR_HUBSPOT_CLIENT_ID') {
    throw new Error('HubSpot isn’t configured yet — set HUBSPOT_CLIENT_ID in background.js.');
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
  await saveHubspotAuth(data);
  return true;
}

async function disconnectHubspot() {
  await chrome.storage.local.remove('hubspotAuth');
}

async function ensureFreshToken() {
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

async function hubspotCreateNote(token, contactId, body) {
  const res = await fetch(HUBSPOT_API + '/crm/v3/objects/notes', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { hs_note_body: body, hs_timestamp: Date.now() },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID }]
        }
      ]
    })
  });
  if (!res.ok) throw new Error('HubSpot note creation failed: ' + res.status);
  return res.json();
}

// The only real write path today. Deliberately conservative: it only ever
// logs a Note on an EXISTING matching Contact — it never creates a new
// Contact, never edits a deal, never sends anything. Safe-by-default while
// the judgment engine upstream is still a keyword stub, not a model.
async function executeHubspotAction(payload) {
  const token = await ensureFreshToken();
  if (!token) return { ok: false, reason: 'not-connected' };
  if (!payload.senderEmail) return { ok: false, reason: 'no-matching-contact' };

  const contact = await hubspotFindContactByEmail(token, payload.senderEmail);
  if (!contact) return { ok: false, reason: 'no-matching-contact', senderEmail: payload.senderEmail };

  const noteBody = 'Flow Trial — ' + payload.label + '\n\n"' + payload.excerpt + '"';
  const note = await hubspotCreateNote(token, contact.id, noteBody);
  return { ok: true, contactId: contact.id, noteId: note.id };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flow:connect-hubspot') {
    connectHubspot()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  if (msg?.type === 'flow:disconnect-hubspot') {
    disconnectHubspot().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === 'flow:hubspot-status') {
    getHubspotAuth().then((auth) => sendResponse({ connected: Boolean(auth) }));
    return true;
  }

  if (msg?.type === 'flow:execute-action') {
    if (msg.payload?.connectorId !== 'hubspot') {
      sendResponse({ ok: false, reason: 'connector-not-live' });
      return true;
    }
    executeHubspotAction(msg.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, reason: 'error', error: String(err.message || err) }));
    return true;
  }
});
