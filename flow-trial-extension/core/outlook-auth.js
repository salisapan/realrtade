// Sign in to Microsoft (OAuth 2.0 authorization code with PKCE) and keep the tokens fresh. Portable: no chrome.*, no DOM.
// The browser pieces (the sign-in window, fetch, the clock, randomness) are handed in, so this file is tested without a browser.
//
// What is asked of the person: Mail.Read (read, never write), User.Read (which address is theirs) and offline_access (stay signed in
// without asking every hour). The tokens are kept only in this browser's extension storage, like the Google connectors' tokens.
// Nothing here talks to Glance's servers.
const FlowOutlookAuth = (() => {
  function b64url(bytes) {
    let s = '';
    const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // deps: { random(n) -> Uint8Array, sha256(Uint8Array) -> Promise<ArrayBuffer> }
  async function newPkce(deps) {
    const verifier = b64url(deps.random(32));
    const digest = await deps.sha256(new TextEncoder().encode(verifier));
    return { verifier, challenge: b64url(digest), state: b64url(deps.random(16)) };
  }

  function authorizeUrl(o) {
    const q = new URLSearchParams({
      client_id: o.clientId, response_type: 'code', redirect_uri: o.redirectUri, response_mode: 'query',
      scope: o.scopes.join(' '), code_challenge: o.challenge, code_challenge_method: 'S256', state: o.state, prompt: 'select_account'
    });
    return o.authority + '/oauth2/v2.0/authorize?' + q.toString();
  }

  // The address the sign-in window ended on -> { code } or { error }. The state must match what was sent.
  function parseRedirect(url, state) {
    let u;
    try { u = new URL(String(url || '')); } catch (e) { return { error: 'bad-redirect' }; }
    const p = u.searchParams;
    if (p.get('error')) return { error: String(p.get('error')).slice(0, 80) };
    if (!state || p.get('state') !== state) return { error: 'state-mismatch' };
    const code = p.get('code');
    return code ? { code } : { error: 'no-code' };
  }

  function form(obj) { return new URLSearchParams(obj).toString(); }
  function codeBody(o) { return form({ client_id: o.clientId, grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier, scope: o.scopes.join(' ') }); }
  function refreshBody(o) { return form({ client_id: o.clientId, grant_type: 'refresh_token', refresh_token: o.refreshToken, scope: o.scopes.join(' ') }); }

  // The token endpoint's answer -> what is stored. A minute of margin so a token is never used in its last seconds.
  function normalizeToken(resp, now, previous) {
    if (!resp || !resp.access_token) return null;
    const t = typeof now === 'number' ? now : Date.now();
    return {
      accessToken: String(resp.access_token),
      refreshToken: resp.refresh_token ? String(resp.refresh_token) : (previous && previous.refreshToken) || null,
      expiresAt: t + Math.max(0, (Number(resp.expires_in) || 3600) - 60) * 1000
    };
  }

  async function post(deps, url, body) {
    const res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.error) return { ok: false, error: (data && (data.error_description || data.error)) ? String(data.error).slice(0, 60) : 'http-' + res.status };
    return { ok: true, data };
  }

  // deps: { fetch, random, sha256, launch(url) -> Promise<redirectUrl|null>, now() }. cfg: FlowOutlookConfig. redirectUri: the extension's own.
  async function signIn(deps, cfg, redirectUri) {
    if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured' };
    const pk = await newPkce(deps);
    const url = authorizeUrl({ authority: cfg.AUTHORITY, clientId: cfg.CLIENT_ID, redirectUri, scopes: cfg.SCOPES, challenge: pk.challenge, state: pk.state });
    let back;
    try { back = await deps.launch(url); } catch (e) { return { ok: false, error: 'cancelled' }; }
    if (!back) return { ok: false, error: 'cancelled' };
    const r = parseRedirect(back, pk.state);
    if (r.error) return { ok: false, error: r.error };
    const t = await post(deps, cfg.AUTHORITY + '/oauth2/v2.0/token', codeBody({ clientId: cfg.CLIENT_ID, code: r.code, redirectUri, verifier: pk.verifier, scopes: cfg.SCOPES }));
    if (!t.ok) return { ok: false, error: t.error };
    const tok = normalizeToken(t.data, deps.now());
    return tok ? { ok: true, token: tok } : { ok: false, error: 'no-token' };
  }

  // A usable access token: the stored one while it is fresh, otherwise a refreshed one. { ok, token } or { ok:false, error, reauth }.
  async function ensureFresh(deps, cfg, token) {
    if (!token || !token.accessToken) return { ok: false, error: 'not-connected', reauth: true };
    if (token.expiresAt > deps.now()) return { ok: true, token, refreshed: false };
    if (!token.refreshToken) return { ok: false, error: 'expired', reauth: true };
    const t = await post(deps, cfg.AUTHORITY + '/oauth2/v2.0/token', refreshBody({ clientId: cfg.CLIENT_ID, refreshToken: token.refreshToken, scopes: cfg.SCOPES }));
    if (!t.ok) return { ok: false, error: t.error, reauth: t.error === 'invalid_grant' || t.error === 'interaction_required' };
    return { ok: true, token: normalizeToken(t.data, deps.now(), token), refreshed: true };
  }

  return { b64url, newPkce, authorizeUrl, parseRedirect, codeBody, refreshBody, normalizeToken, signIn, ensureFresh };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookAuth };
