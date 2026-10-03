// Outlook sign-in: PKCE done right, state checked, tokens refreshed, and nothing happens until a client id is set.
// Run: node test/outlook-auth-corpus.cjs
const crypto = require('crypto');
const { FlowOutlookAuth: A } = require('../core/outlook-auth.js');
const { FlowOutlookConfig: C } = require('../core/outlook-config.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const sha256 = async (bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest();
const NOW = 1790000000000;
const CFG = Object.assign({}, C, { CLIENT_ID: '11111111-2222-3333-4444-555555555555' });
const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

(async () => {
  console.log('\n--- PKCE ---\n');
  {
    // RFC 7636 appendix B: this verifier must give this challenge.
    const rfc = await sha256(new TextEncoder().encode('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'));
    check('the S256 challenge matches the RFC 7636 test vector', A.b64url(rfc) === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', A.b64url(rfc));
    const pk = await A.newPkce({ random: (n) => crypto.randomBytes(n), sha256 });
    check('a fresh verifier is 43 url-safe characters and the challenge is its hash', /^[A-Za-z0-9_-]{43}$/.test(pk.verifier) && A.b64url(await sha256(new TextEncoder().encode(pk.verifier))) === pk.challenge, pk);
    const pk2 = await A.newPkce({ random: (n) => crypto.randomBytes(n), sha256 });
    check('every sign-in has its own verifier and state', pk.verifier !== pk2.verifier && pk.state !== pk2.state);
  }

  console.log('\n--- the sign-in address and the way back ---\n');
  {
    const u = new URL(A.authorizeUrl({ authority: CFG.AUTHORITY, clientId: CFG.CLIENT_ID, redirectUri: REDIRECT, scopes: CFG.SCOPES, challenge: 'CH', state: 'ST' }));
    check('it goes to the Microsoft sign-in page with PKCE and the right scopes', u.origin + u.pathname === 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' && u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('response_type') === 'code' && u.searchParams.get('scope') === 'offline_access Mail.Read User.Read', u.toString());
    check('the scopes are read-only: no write permission is ever asked for', !CFG.SCOPES.some((s) => /write|send|readwrite/i.test(s)), CFG.SCOPES);
    check('a good redirect gives the code', A.parseRedirect(REDIRECT + '?code=abc&state=ST', 'ST').code === 'abc');
    check('a different state is refused (someone else\'s redirect)', A.parseRedirect(REDIRECT + '?code=abc&state=EVIL', 'ST').error === 'state-mismatch');
    check('a missing state is refused', A.parseRedirect(REDIRECT + '?code=abc', 'ST').error === 'state-mismatch');
    check('an error from Microsoft is passed on, not mistaken for success', A.parseRedirect(REDIRECT + '?error=access_denied&state=ST', 'ST').error === 'access_denied');
    check('garbage is an error', A.parseRedirect('not a url', 'ST').error === 'bad-redirect' && A.parseRedirect(REDIRECT + '?state=ST', 'ST').error === 'no-code');
  }

  console.log('\n--- tokens ---\n');
  {
    const t = A.normalizeToken({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }, NOW);
    check('a token is kept with a minute of margin', t.accessToken === 'AT' && t.refreshToken === 'RT' && t.expiresAt === NOW + 3540 * 1000, t);
    check('a refresh that returns no new refresh token keeps the old one', A.normalizeToken({ access_token: 'AT2', expires_in: 3600 }, NOW, { refreshToken: 'RT' }).refreshToken === 'RT');
    check('no access token is no token', A.normalizeToken({ error: 'x' }, NOW) === null && A.normalizeToken(null, NOW) === null);
  }

  console.log('\n--- the whole sign-in, with a fake browser ---\n');
  {
    const calls = [];
    const mk = (over) => Object.assign({
      random: (n) => crypto.randomBytes(n), sha256, now: () => NOW,
      launch: async (url) => { const u = new URL(url); return REDIRECT + '?code=THECODE&state=' + u.searchParams.get('state'); },
      fetch: async (url, init) => { calls.push({ url, body: String(init.body) }); return { ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }) }; }
    }, over || {});
    const r = await A.signIn(mk(), CFG, REDIRECT);
    check('sign-in returns a stored-shape token', r.ok && r.token.accessToken === 'AT' && r.token.refreshToken === 'RT', r);
    const body = new URLSearchParams(calls[0].body);
    check('the code is redeemed with the verifier, at Microsoft, with no secret', calls[0].url === 'https://login.microsoftonline.com/common/oauth2/v2.0/token' && body.get('grant_type') === 'authorization_code' && body.get('code') === 'THECODE' && /^[A-Za-z0-9_-]{43}$/.test(body.get('code_verifier')) && !body.has('client_secret'), calls[0]);
    check('no client id means no sign-in at all, and no network', (await A.signIn(mk({ fetch: async () => { throw new Error('must not be called'); }, launch: async () => { throw new Error('must not be called'); } }), C, REDIRECT)).error === 'not-configured');
    check('closing the window is "cancelled"', (await A.signIn(mk({ launch: async () => null }), CFG, REDIRECT)).error === 'cancelled' && (await A.signIn(mk({ launch: async () => { throw new Error('closed'); } }), CFG, REDIRECT)).error === 'cancelled');
    check('a forged redirect is refused before anything is redeemed', (await A.signIn(mk({ launch: async () => REDIRECT + '?code=X&state=EVIL', fetch: async () => { throw new Error('must not be called'); } }), CFG, REDIRECT)).error === 'state-mismatch');
    check('Microsoft saying no is an error, not a token', (await A.signIn(mk({ fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_client', error_description: 'bad' }) }) }), CFG, REDIRECT)).ok === false);
  }

  console.log('\n--- keeping the token fresh ---\n');
  {
    const fresh = { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 600000 };
    const stale = { accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW - 1 };
    let n = 0;
    const deps = (resp) => ({ now: () => NOW, fetch: async () => { n++; return resp; } });
    const a = await A.ensureFresh(deps({}), CFG, fresh);
    check('a fresh token is used as it is, with no network', a.ok && !a.refreshed && n === 0);
    const b = await A.ensureFresh(deps({ ok: true, status: 200, json: async () => ({ access_token: 'AT2', expires_in: 3600 }) }), CFG, stale);
    check('a stale one is refreshed and keeps its refresh token', b.ok && b.refreshed && b.token.accessToken === 'AT2' && b.token.refreshToken === 'RT' && n === 1, b);
    const c = await A.ensureFresh(deps({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }), CFG, stale);
    check('a revoked grant asks the person to sign in again', !c.ok && c.reauth === true, c);
    check('nothing stored means sign in', (await A.ensureFresh(deps({}), CFG, null)).reauth === true);
    check('a stale token with no refresh token means sign in', (await A.ensureFresh(deps({}), CFG, { accessToken: 'x', expiresAt: NOW - 1 })).reauth === true);
  }

  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  console.log('TOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
