// Sign in to Microsoft (OAuth 2.0 authorization code with PKCE) and keep the tokens fresh. Portable: no chrome.*, no DOM.
// The browser pieces (the sign-in window, fetch, the clock, randomness, silent launch) are handed in, so this file is tested without a browser.
//
// What is asked of the person: Mail.Read, Mail.ReadWrite (drafts only, by code), User.Read and offline_access.
// Never Mail.Send. The tokens are kept only in this browser's extension storage. Nothing here talks to Glance's servers.
//
// SPA refresh tokens last 24h and do not slide (Microsoft). silentReauth renews with prompt=none before that window
// ends; only login_required / interaction_required / consent_required force a visible reconnect.
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
      scope: o.scopes.join(' '), code_challenge: o.challenge, code_challenge_method: 'S256', state: o.state
    });
    if (o.prompt) q.set('prompt', o.prompt);
    else q.set('prompt', 'select_account');
    if (o.loginHint) q.set('login_hint', o.loginHint);
    return o.authority + '/oauth2/v2.0/authorize?' + q.toString();
  }

  // Surface Microsoft's real error: code (<=60), first line of description (<=200, strip Trace/Correlation/Timestamp), AADSTS\d+.
  // Tokens never appear in any error string.
  function explainError(error, description) {
    const code = String(error || '').slice(0, 60);
    let desc = String(description || '');
    desc = desc.split(/\r?\n/).filter((l) => !/^\s*(Trace ID|Correlation ID|Timestamp)\s*:/i.test(l)).join(' ').trim();
    desc = desc.slice(0, 200);
    const m = (code + ' ' + desc).match(/AADSTS\d+/i);
    const aadsts = m ? m[0].toUpperCase() : null;
    // Never echo anything that looks like a token
    if (/eyJ[A-Za-z0-9_-]{10,}/.test(desc) || /access_token|refresh_token/i.test(desc)) desc = '';
    return { error: code || 'error', description: desc || null, aadsts };
  }

  // The address the sign-in window ended on -> { code } or { error, description, aadsts }. The state must match what was sent.
  function parseRedirect(url, state) {
    let u;
    try { u = new URL(String(url || '')); } catch (e) { return { error: 'bad-redirect' }; }
    const p = u.searchParams;
    if (p.get('error')) return explainError(p.get('error'), p.get('error_description'));
    if (!state || p.get('state') !== state) return { error: 'state-mismatch' };
    const code = p.get('code');
    return code ? { code } : { error: 'no-code' };
  }

  function form(obj) { return new URLSearchParams(obj).toString(); }
  function codeBody(o) { return form({ client_id: o.clientId, grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier, scope: o.scopes.join(' ') }); }
  function refreshBody(o) { return form({ client_id: o.clientId, grant_type: 'refresh_token', refresh_token: o.refreshToken, scope: o.scopes.join(' ') }); }

  // The token endpoint's answer -> what is stored. A minute of margin so a token is never used in its last seconds.
  // rtIssuedAt is set when a CODE is redeemed (interactive or silent). A refresh_token grant keeps the previous rtIssuedAt
  // (SPA refresh tokens inherit the original 24h expiry).
  function normalizeToken(resp, now, previous, fromCode) {
    if (!resp || !resp.access_token) return null;
    const t = typeof now === 'number' ? now : Date.now();
    const rtIssuedAt = fromCode ? t : ((previous && previous.rtIssuedAt) || t);
    return {
      accessToken: String(resp.access_token),
      refreshToken: resp.refresh_token ? String(resp.refresh_token) : (previous && previous.refreshToken) || null,
      expiresAt: t + Math.max(0, (Number(resp.expires_in) || 3600) - 60) * 1000,
      rtIssuedAt: rtIssuedAt,
      grantedScopes: resp.scope ? String(resp.scope).split(/\s+/).filter(Boolean) : (previous && previous.grantedScopes) || null
    };
  }

  async function post(deps, url, body) {
    const res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.error) {
      const ex = explainError(data && data.error, data && data.error_description);
      if (!ex.error || ex.error === 'error') ex.error = 'http-' + res.status;
      return Object.assign({ ok: false }, ex);
    }
    return { ok: true, data };
  }

  const INTERACTION_ERRORS = { login_required: true, interaction_required: true, consent_required: true, invalid_grant: true };

  // deps: { fetch, random, sha256, launch(url) -> Promise<redirectUrl|null>, now() }. cfg: FlowOutlookConfig. redirectUri: the extension's own.
  async function signIn(deps, cfg, redirectUri, opts) {
    if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured' };
    const o = opts || {};
    const pk = await newPkce(deps);
    const url = authorizeUrl({
      authority: cfg.AUTHORITY, clientId: cfg.CLIENT_ID, redirectUri, scopes: cfg.SCOPES,
      challenge: pk.challenge, state: pk.state, prompt: o.prompt || 'select_account', loginHint: o.loginHint || null
    });
    let back;
    try { back = await deps.launch(url); } catch (e) { return { ok: false, error: 'cancelled' }; }
    if (!back) return { ok: false, error: 'cancelled' };
    const r = parseRedirect(back, pk.state);
    if (r.error) return { ok: false, error: r.error, description: r.description || null, aadsts: r.aadsts || null };
    const t = await post(deps, cfg.AUTHORITY + '/oauth2/v2.0/token', codeBody({ clientId: cfg.CLIENT_ID, code: r.code, redirectUri, verifier: pk.verifier, scopes: cfg.SCOPES }));
    if (!t.ok) return { ok: false, error: t.error, description: t.description || null, aadsts: t.aadsts || null };
    const tok = normalizeToken(t.data, deps.now(), null, true);
    return tok ? { ok: true, token: tok } : { ok: false, error: 'no-token' };
  }

  // Silent renewal: same authorize URL with prompt=none and login_hint. deps.launchSilent(url) -> redirect url | null.
  // Never opens a visible window. Returns { ok, token } or { ok:false, error, aadsts, needsInteraction }.
  async function silentReauth(deps, cfg, redirectUri, loginHint) {
    if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured', needsInteraction: true };
    if (typeof deps.launchSilent !== 'function') return { ok: false, error: 'no-silent', needsInteraction: true };
    const pk = await newPkce(deps);
    const url = authorizeUrl({
      authority: cfg.AUTHORITY, clientId: cfg.CLIENT_ID, redirectUri, scopes: cfg.SCOPES,
      challenge: pk.challenge, state: pk.state, prompt: 'none', loginHint: loginHint || null
    });
    let back;
    try { back = await deps.launchSilent(url); } catch (e) { return { ok: false, error: 'silent-failed', needsInteraction: true }; }
    if (!back) return { ok: false, error: 'silent-failed', needsInteraction: true };
    const r = parseRedirect(back, pk.state);
    if (r.error) {
      const needs = Boolean(INTERACTION_ERRORS[r.error] || r.error === 'login_required');
      return { ok: false, error: r.error, description: r.description || null, aadsts: r.aadsts || null, needsInteraction: needs || true };
    }
    const t = await post(deps, cfg.AUTHORITY + '/oauth2/v2.0/token', codeBody({ clientId: cfg.CLIENT_ID, code: r.code, redirectUri, verifier: pk.verifier, scopes: cfg.SCOPES }));
    if (!t.ok) {
      return { ok: false, error: t.error, description: t.description || null, aadsts: t.aadsts || null, needsInteraction: Boolean(INTERACTION_ERRORS[t.error]) || true };
    }
    const tok = normalizeToken(t.data, deps.now(), null, true);
    return tok ? { ok: true, token: tok } : { ok: false, error: 'no-token', needsInteraction: true };
  }

  // A usable access token: the stored one while it is fresh, otherwise a refreshed one. { ok, token } or { ok:false, error, reauth, description, aadsts }.
  async function ensureFresh(deps, cfg, token) {
    if (!token || !token.accessToken) return { ok: false, error: 'not-connected', reauth: true };
    if (token.expiresAt > deps.now()) return { ok: true, token, refreshed: false };
    if (!token.refreshToken) return { ok: false, error: 'expired', reauth: true };
    const t = await post(deps, cfg.AUTHORITY + '/oauth2/v2.0/token', refreshBody({ clientId: cfg.CLIENT_ID, refreshToken: token.refreshToken, scopes: cfg.SCOPES }));
    if (!t.ok) {
      return {
        ok: false, error: t.error, description: t.description || null, aadsts: t.aadsts || null,
        reauth: t.error === 'invalid_grant' || t.error === 'interaction_required' || t.error === 'login_required'
      };
    }
    return { ok: true, token: normalizeToken(t.data, deps.now(), token, false), refreshed: true };
  }

  // Plain sentence for the Outlook row. Known AADSTS codes get a short explanation.
  function errorSentence(error, description, aadsts) {
    const code = aadsts || (String(error || '').match(/AADSTS\d+/i) || [])[0] || null;
    const upper = code ? String(code).toUpperCase() : null;
    const map = {
      AADSTS9002326: 'Wrong platform type: register the redirect as Single-page application',
      AADSTS700084: '24h sign-in window ended',
      AADSTS65001: 'Consent needed',
      AADSTS50020: 'Account issue — try another Microsoft account',
      AADSTS50076: 'Multi-factor authentication required'
    };
    if (error === 'consent_required') return 'Consent needed' + (upper ? ' (' + upper + ')' : '');
    if (upper && map[upper]) return map[upper] + ' (' + upper + ')';
    const first = (description || '').split(/[.!]/)[0].trim() || String(error || 'error');
    return first.slice(0, 120) + (upper ? ' (' + upper + ')' : (error && error !== first ? ' (' + String(error).slice(0, 40) + ')' : ''));
  }

  return {
    b64url, newPkce, authorizeUrl, parseRedirect, codeBody, refreshBody, normalizeToken,
    explainError, errorSentence, signIn, ensureFresh, silentReauth
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookAuth };
