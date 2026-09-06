// Exchanges a Salesforce refresh token for a fresh access token. Same reason
// this has to be server-side as salesforce-oauth-exchange: the Consumer
// Secret never leaves this function.
const LOG_PREFIX = '[salesforce-oauth-refresh]';

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

  const refreshToken = String(payload.refresh_token || '').trim();
  if (!refreshToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing refresh_token' }) };
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logErr('SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET not set in this environment');
    return { statusCode: 500, body: JSON.stringify({ error: 'Salesforce app is not configured on the server' }) };
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });

  try {
    const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (!res.ok) {
      logErr('Salesforce token refresh rejected', { status: res.status, data });
      return { statusCode: 502, body: JSON.stringify({ error: data.error_description || 'Salesforce token refresh failed' }) };
    }
    log('token refresh succeeded');
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    logErr('network error calling Salesforce', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach Salesforce' }) };
  }
};
