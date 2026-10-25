// Token relay: the one place a vendor's OAuth client secret is applied, so the secret never ships in the extension.
// docs/glance-ai/connectors/token-relay.md. NOT DEPLOYED until the owner says «מאשר» (and sets the env vars below in Netlify).
//
// POST { vendor, grant: "code" | "refresh", redirect_uri, code?, code_verifier?, refresh_token?, install_id }
// It adds the vendor's client id and secret from ENVIRONMENT VARIABLES, forwards ONE token request to that vendor's own
// token URL (hard-coded below, never taken from the request), returns the vendor's answer and forgets it.
//
// Hard rules, each one tested in token-relay.test.cjs against a mock vendor:
//   - fixed allow-list of vendors; each has exactly one token URL. Any other vendor is rejected: this is not an open proxy.
//   - the secret is never returned (a response that contains it is withheld) and never logged; no request or response body
//     is ever logged; only a vendor name and a status code are.
//   - redirect_uri must be this extension's own chromiumapp.org URL (same rule as slack-oauth-exchange).
//   - rate limit per install id (best effort in memory per warm instance; the vendor's own limits are the hard stop).
//   - CORS only for the extension's own origin.
const EXTENSION_ID = 'dnjhplgmnkabbjogfpbhofjedlkehkai';
const LOG_PREFIX = '[token-relay]';

// One entry per vendor. A new connector adds one entry here and its two env vars; nothing else in this file changes.
const VENDORS = {
  notion: {
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    idEnv: 'NOTION_CLIENT_ID',
    secretEnv: 'NOTION_CLIENT_SECRET',
    // Notion takes the client id and secret as HTTP Basic auth and a JSON body (verify against the vendor page before go-live).
    clientAuth: 'basic',
    bodyFormat: 'json',
    extraHeaders: { 'Notion-Version': '2022-06-28' },
    supportsRefresh: true
  },
  asana: {
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    idEnv: 'ASANA_CLIENT_ID',
    secretEnv: 'ASANA_CLIENT_SECRET',
    // Asana takes client_id and client_secret in a form-encoded body; the PKCE code_verifier is forwarded as sent (verify against the vendor page before go-live).
    clientAuth: 'body',
    bodyFormat: 'form',
    extraHeaders: {},
    supportsRefresh: true
  },
  jira: {
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    idEnv: 'JIRA_CLIENT_ID',
    secretEnv: 'JIRA_CLIENT_SECRET',
    // Atlassian takes a JSON body with client_id and client_secret; a refresh needs the offline_access scope and rotates the refresh token (verify against the vendor page before go-live).
    clientAuth: 'body',
    bodyFormat: 'json',
    extraHeaders: {},
    supportsRefresh: true
  },
  linear: {
    tokenUrl: 'https://api.linear.app/oauth/token',
    idEnv: 'LINEAR_CLIENT_ID',
    secretEnv: 'LINEAR_CLIENT_SECRET',
    // Linear takes a form-encoded body with client_id and client_secret; the PKCE code_verifier is forwarded as sent; refresh tokens exist for apps created after Linear introduced them (verify against the vendor page before go-live).
    clientAuth: 'body',
    bodyFormat: 'form',
    extraHeaders: {},
    supportsRefresh: true
  },
  zoom: {
    tokenUrl: 'https://zoom.us/oauth/token',
    idEnv: 'ZOOM_CLIENT_ID',
    secretEnv: 'ZOOM_CLIENT_SECRET',
    // Zoom takes the client id and secret as HTTP Basic auth and a form body; the PKCE code_verifier is forwarded as sent; a refresh rotates the refresh token (verify against the vendor page before go-live).
    clientAuth: 'basic',
    bodyFormat: 'form',
    extraHeaders: {},
    supportsRefresh: true
  },
  // DocuSign: HTTP Basic client auth and a form body (verify against the vendor page before go-live). Production and the developer (demo) servers are two vendors:
  // the integration key is the same, the secret is not.
  docusign: {
    tokenUrl: 'https://account.docusign.com/oauth/token',
    idEnv: 'DOCUSIGN_CLIENT_ID',
    secretEnv: 'DOCUSIGN_CLIENT_SECRET',
    clientAuth: 'basic',
    bodyFormat: 'form',
    extraHeaders: {},
    supportsRefresh: true
  },
  'docusign-demo': {
    tokenUrl: 'https://account-d.docusign.com/oauth/token',
    idEnv: 'DOCUSIGN_CLIENT_ID',
    secretEnv: 'DOCUSIGN_DEMO_CLIENT_SECRET',
    clientAuth: 'basic',
    bodyFormat: 'form',
    extraHeaders: {},
    supportsRefresh: true
  }
};

const RATE_LIMIT = { windowMs: 60 * 1000, max: 12 };
const buckets = new Map();

function allowedExtensionIds(env) {
  return [EXTENSION_ID].concat(String(env.EXTRA_EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
}

function allowedRedirects(env) {
  return allowedExtensionIds(env).reduce((acc, id) => acc.concat(['https://' + id + '.chromiumapp.org/', 'https://' + id + '.chromiumapp.org']), []);
}

function json(statusCode, obj, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers.Vary = 'Origin'; }
  return { statusCode, headers, body: JSON.stringify(obj) };
}

function rateLimited(installId, now) {
  const b = buckets.get(installId);
  if (!b || now - b.start > RATE_LIMIT.windowMs) { buckets.set(installId, { start: now, n: 1 }); return false; }
  b.n += 1;
  return b.n > RATE_LIMIT.max;
}

// deps: { env, fetch, now, log } so the test never touches the network or process.env.
async function relay(event, deps) {
  const env = deps.env || {};
  const doFetch = deps.fetch;
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const log = deps.log || (() => {});
  const headers = (event && event.headers) || {};
  const reqOrigin = String(headers.origin || headers.Origin || '');
  const okOrigins = allowedExtensionIds(env).map((id) => 'chrome-extension://' + id);
  const origin = okOrigins.indexOf(reqOrigin) >= 0 ? reqOrigin : '';

  if (event.httpMethod === 'OPTIONS') {
    if (!origin) return { statusCode: 403, body: '' };
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);
  // A browser request from any other origin is refused outright. (A non-browser caller has no Origin; the redirect_uri,
  // allow-list and rate limit still bind it, and it can only obtain tokens for codes the extension's own user authorised.)
  if (reqOrigin && !origin) return json(403, { error: 'origin_not_allowed' }, '');

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'invalid_json' }, origin); }
  if (!p || typeof p !== 'object') return json(400, { error: 'invalid_json' }, origin);

  const vendorName = String(p.vendor || '');
  const vendor = Object.prototype.hasOwnProperty.call(VENDORS, vendorName) ? VENDORS[vendorName] : null;
  if (!vendor) return json(400, { error: 'vendor_not_allowed' }, origin);

  const grant = String(p.grant || '');
  if (grant !== 'code' && grant !== 'refresh') return json(400, { error: 'bad_grant' }, origin);
  if (grant === 'refresh' && !vendor.supportsRefresh) return json(400, { error: 'refresh_not_supported' }, origin);

  const installId = String(p.install_id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(installId)) return json(400, { error: 'bad_install_id' }, origin);
  if (rateLimited(vendorName + ':' + installId, now)) return json(429, { error: 'rate_limited' }, origin);

  const redirectUri = String(p.redirect_uri || '');
  let form;
  if (grant === 'code') {
    const code = String(p.code || '').trim();
    if (!code || !redirectUri) return json(400, { error: 'missing_code_or_redirect' }, origin);
    if (allowedRedirects(env).indexOf(redirectUri) < 0) return json(400, { error: 'redirect_not_allowed' }, origin);
    form = { grant_type: 'authorization_code', code, redirect_uri: redirectUri };
    if (p.code_verifier) form.code_verifier = String(p.code_verifier);
  } else {
    const rt = String(p.refresh_token || '').trim();
    if (!rt) return json(400, { error: 'missing_refresh_token' }, origin);
    form = { grant_type: 'refresh_token', refresh_token: rt };
  }

  const clientId = env[vendor.idEnv];
  const clientSecret = env[vendor.secretEnv];
  if (!clientId || !clientSecret) { log(LOG_PREFIX, vendorName, 'not_configured'); return json(503, { error: 'vendor_not_configured' }, origin); }

  const reqHeaders = Object.assign({ Accept: 'application/json' }, vendor.extraHeaders || {});
  let body;
  if (vendor.clientAuth === 'basic') {
    reqHeaders.Authorization = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
  } else {
    form.client_id = clientId; form.client_secret = clientSecret;
  }
  if (vendor.bodyFormat === 'json') { reqHeaders['Content-Type'] = 'application/json'; body = JSON.stringify(form); }
  else { reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }

  let res; let text;
  try {
    res = await doFetch(vendor.tokenUrl, { method: 'POST', headers: reqHeaders, body });
    text = await res.text();
  } catch (e) {
    log(LOG_PREFIX, vendorName, 'network_error');
    return json(502, { error: 'vendor_unreachable' }, origin);
  }
  log(LOG_PREFIX, vendorName, grant, res.status);
  // Never hand the secret back, even if a vendor echoed it.
  if (text.indexOf(clientSecret) >= 0) return json(502, { error: 'vendor_response_withheld' }, origin);
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  if (!res.ok || !data) {
    const reason = data && typeof data.error === 'string' ? data.error.slice(0, 60) : 'vendor_rejected';
    const retry = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
    const out = json(res.status === 429 ? 429 : 502, { error: reason, vendor_status: res.status }, origin);
    if (retry) out.headers['Retry-After'] = String(retry);
    return out;
  }
  return json(200, data, origin);
}

exports.handler = async function (event) {
  return relay(event, { env: process.env, fetch: globalThis.fetch, now: Date.now, log: console.log });
};
exports.relay = relay;
exports.VENDORS = VENDORS;
exports._resetRateLimit = function () { buckets.clear(); };
