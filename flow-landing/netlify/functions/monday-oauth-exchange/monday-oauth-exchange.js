// Exchanges a Monday.com OAuth authorization code for an access + refresh
// token. This is the one step in the Monday.com connection that MUST run
// server-side: it requires the app's Client Secret, which must never be
// shipped inside the browser extension. Everything else (starting the OAuth
// window, the actual GraphQL API calls once connected) happens directly
// from the extension's background service worker.
const LOG_PREFIX = '[monday-oauth-exchange]';

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

  const clientId = process.env.MONDAY_CLIENT_ID;
  const clientSecret = process.env.MONDAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logErr('MONDAY_CLIENT_ID / MONDAY_CLIENT_SECRET not set in this environment');
    return { statusCode: 500, body: JSON.stringify({ error: 'Monday.com app is not configured on the server' }) };
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });

  try {
    const res = await fetch('https://auth.monday.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (!res.ok) {
      logErr('Monday.com token exchange rejected', { status: res.status, data });
      return { statusCode: 502, body: JSON.stringify({ error: data.error_description || data.error || 'Monday.com token exchange failed' }) };
    }
    log('token exchange succeeded');
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    logErr('network error calling Monday.com', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach Monday.com' }) };
  }
};
