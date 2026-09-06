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
