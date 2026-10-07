// Public OAuth client IDs for the four connectors that cannot authenticate
// with a user-pasted token. These values are not secrets: they ship inside
// the extension the same way a GA4 measurement ID does.
//
// Replace each REPLACE_WITH_* string with the real public client ID from
// that vendor's app settings. Client secrets do not belong in this file —
// they are Netlify environment variables. The full list is docs/SETUP.md.
//
// publicClientId() treats "" and any YOUR_* / REPLACE_WITH_* value as
// unset, so a half-edited build reports the connector as not configured
// instead of starting an OAuth handshake that cannot succeed.

export const OAUTH_PUBLIC = {
  hubspotClientId: 'REPLACE_WITH_HUBSPOT_CLIENT_ID',
  salesforceClientId: 'REPLACE_WITH_SALESFORCE_CLIENT_ID',
  slackClientId: 'REPLACE_WITH_SLACK_CLIENT_ID',
  mondayClientId: 'REPLACE_WITH_MONDAY_CLIENT_ID'
};

// Web application OAuth client for chrome.identity.launchWebAuthFlow.
// One client for both extension IDs (unpacked and Chrome Web Store). GCP
// project Flow Extension (oceanic-spider-509610-c1). Redirect URIs already
// on this client:
//   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
//   https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/
// This is not a Chrome-extension client. manifest.json oauth2.client_id
// stays the unpacked Chrome-extension client for getAuthToken, and
// build-cws.sh swaps only that manifest field for the store item. Do not
// put this Web client id into oauth2.client_id.
export const WEB_OAUTH_CLIENT_ID = '93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com';

const UNCONFIGURED_CLIENT_ID = /^(YOUR_|REPLACE_WITH_)/;

export function publicClientId(value) {
  const id = String(value == null ? '' : value).trim();
  if (!id || UNCONFIGURED_CLIENT_ID.test(id)) return '';
  return id;
}
