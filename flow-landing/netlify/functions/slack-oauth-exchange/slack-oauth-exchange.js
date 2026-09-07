// Exchanges a Slack OAuth authorization code for a bot access token. This is
// the one step in the Slack connection that MUST run server-side: it
// requires the app's Client Secret, which must never be shipped inside the
// browser extension. Everything else (starting the OAuth window, the actual
// chat.postMessage / chat.delete calls once connected) happens directly
// from the extension's background service worker.
//
// Unlike HubSpot, Salesforce and Monday.com, there is no matching
// slack-oauth-refresh function: a Slack bot token issued this way does not
// expire on its own unless the app owner has explicitly turned on token
// rotation (Slack's opt-in "token rotation" beta) — which this app does not
// use, so there is nothing to refresh.
// The sideload/dev extension ID (fixed by manifest.json's "key" field) stays
// allowed by default. A Chrome Web Store listing gets its own ID assigned on
// first upload -- unpredictable in advance, and the manifest "key" field must
// be removed for that first upload anyway -- so once that ID exists it goes
// here via an env var rather than a code change: set EXTRA_EXTENSION_IDS to a
// comma-separated list (e.g. the real Web Store ID) in Netlify's environment
// variables and both distribution channels work without redeploying.
const EXTENSION_ID = 'dnjhplgmnkabbjogfpbhofjedlkehkai';
const EXTRA_EXTENSION_IDS = String(process.env.EXTRA_EXTENSION_IDS || '')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const ALLOWED_EXTENSION_IDS = [EXTENSION_ID].concat(EXTRA_EXTENSION_IDS);
const ALLOWED_REDIRECTS = ALLOWED_EXTENSION_IDS.reduce(function (acc, id) {
  return acc.concat(['https://' + id + '.chromiumapp.org/', 'https://' + id + '.chromiumapp.org']);
}, []);
const LOG_PREFIX = '[slack-oauth-exchange]';

exports.handler = async function (event) {
  const log = (msg, extra) => console.log(LOG_PREFIX, msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, msg, extra !== undefined ? extra : '');

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const code = String(payload.code || '').trim();
  const redirectUri = String(payload.redirect_uri || '').trim();
  if (!code || !redirectUri) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing code or redirect_uri' }) };
  }
  // Without this the endpoint is a free token-minting oracle: anyone could POST
  // a code plus their own redirect_uri and have Flow's server apply its client
  // secret on their behalf. Chrome derives this URL from the extension's public
  // key in manifest.json, so it is fixed for every real install.
  if (!ALLOWED_REDIRECTS.includes(redirectUri)) {
    logErr('rejected: redirect_uri is not this extension', redirectUri);
    return { statusCode: 400, body: JSON.stringify({ error: 'Unrecognised redirect_uri' }) };
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logErr('SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set in this environment');
    return { statusCode: 500, body: JSON.stringify({ error: 'Slack app is not configured on the server' }) };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });

  try {
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    // Slack's OAuth endpoint returns HTTP 200 even on failure — the real
    // success signal is the `ok` field in the body, not the status code.
    if (!res.ok || !data.ok) {
      logErr('Slack token exchange rejected', { status: res.status, data });
      return { statusCode: 502, body: JSON.stringify({ error: data.error || 'Slack token exchange failed' }) };
    }
    log('token exchange succeeded');
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    logErr('network error calling Slack', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach Slack' }) };
  }
};
