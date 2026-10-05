// Google sign-in when chrome.identity.getAuthToken cannot run.
//
// getAuthToken is still the primary path (Chrome's own account chooser,
// manifest oauth2 Chrome-extension client). On profiles where browser
// sign-in is off — and on Brave/Edge, which fail that call the same way —
// there is no Chrome-cached token to use. launchWebAuthFlow with a Web
// application client is the fallback: implicit response_type=token, redirect
// https://<extension-id>.chromiumapp.org/, same scopes as manifest oauth2.
//
// Auth-code + PKCE is not used. A Google Web client redeems an authorization
// code with a client secret, and this extension has no token endpoint. The
// implicit token never leaves the extension: launchWebAuthFlow hands the
// redirect URL (hash included) to the service worker, which stores the
// access token in chrome.storage.local.

export const GOOGLE_WEB_AUTH_STORAGE_KEY = 'googleWebAuth';

// Used only when manifest oauth2.scopes is missing. Keep this list identical
// to manifest.json so a fallback grant covers the same APIs as getAuthToken.
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
];

const WEB_TOKEN_SKEW_MS = 60 * 1000;

// The user closed or denied a window that was actually shown. Those must
// not open a second consent window. "Turned off browser sign-in" is not a
// cancel — it is the failure this fallback exists for.
export function isUserCancelMessage(message) {
  const msg = String(message || '');
  if (!msg) return false;
  return /did not approve|user cancell?ed|cancell?ed the|closed or denied|access_denied|popup_closed|closed the (?:signin |sign-in |consent )?window/i.test(msg);
}

export function shouldFallbackFromGetAuthToken(message, options) {
  const msg = String(message || '');
  if (!msg) return false;
  if (isUserCancelMessage(msg)) return false;
  const interactive = !options || options.interactive !== false;
  // A non-interactive probe that needs UI must not pop the web flow.
  if (/user interaction required/i.test(msg)) return interactive;
  return true;
}

export function googleRedirectUriForExtension(extensionId) {
  const id = String(extensionId || '').trim();
  if (!id) return '';
  return 'https://' + id + '.chromiumapp.org/';
}

export function googleOAuthScopesFrom(scopes) {
  const list = Array.isArray(scopes) ? scopes.map((s) => String(s || '').trim()).filter(Boolean) : [];
  return list.length ? list : GOOGLE_OAUTH_SCOPES.slice();
}

export function googleImplicitAuthUrl(opts) {
  const options = opts || {};
  const params = new URLSearchParams();
  params.set('client_id', options.clientId || '');
  params.set('response_type', 'token');
  params.set('redirect_uri', options.redirectUri || '');
  params.set('scope', (Array.isArray(options.scopes) ? options.scopes : []).join(' '));
  params.set('include_granted_scopes', 'true');
  if (options.state) params.set('state', options.state);
  if (options.prompt) params.set('prompt', options.prompt);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function formParams(serialized) {
  const out = Object.create(null);
  const raw = String(serialized || '').replace(/^[?#]/, '');
  if (!raw) return out;
  raw.split('&').forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const key = decodeURIComponent((idx === -1 ? pair : pair.slice(0, idx)).replace(/\+/g, ' '));
    const value = decodeURIComponent((idx === -1 ? '' : pair.slice(idx + 1)).replace(/\+/g, ' '));
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = value;
  });
  return out;
}

// Implicit grants return the token in the hash. Some redirects also put it
// in the query. Hash wins when both are present. state must round-trip.
export function parseGoogleImplicitRedirect(redirectUrl, expectedState) {
  let url;
  try {
    url = new URL(String(redirectUrl || ''));
  } catch (e) {
    throw new Error('Google sign-in did not return a valid redirect.');
  }
  const hash = formParams(url.hash);
  const query = formParams(url.search);
  const pick = (key) => {
    if (Object.prototype.hasOwnProperty.call(hash, key)) return hash[key];
    if (Object.prototype.hasOwnProperty.call(query, key)) return query[key];
    return null;
  };
  const state = pick('state');
  if (expectedState && state !== expectedState) {
    throw new Error('Google authorization could not be verified. Please try connecting again.');
  }
  const err = pick('error');
  if (err) {
    if (err === 'access_denied' || err === 'popup_closed_by_user') {
      throw new Error('Google sign-in was closed or denied.');
    }
    throw new Error('Google sign-in failed (' + err + ').');
  }
  const accessToken = pick('access_token');
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Google did not return an access token.');
  }
  const expiresRaw = pick('expires_in');
  const expiresIn = expiresRaw == null || expiresRaw === '' ? null : Number(expiresRaw);
  return {
    accessToken: accessToken.trim(),
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null
  };
}

export function webTokenUsable(record, now, skewMs) {
  if (!record || typeof record.accessToken !== 'string' || !record.accessToken) return false;
  if (record.expiresAt == null || record.expiresAt === '') return true;
  const skew = Number.isFinite(skewMs) ? skewMs : WEB_TOKEN_SKEW_MS;
  const at = Number(record.expiresAt);
  if (!Number.isFinite(at)) return false;
  return at - skew > (now == null ? Date.now() : now);
}

function backupUnconfigured(message) {
  return /backup Google sign-in isn[’']t configured/i.test(String(message || ''));
}

function browserSigninOff(message) {
  return /turned off browser sign[-\s]?in/i.test(String(message || ''));
}

// Shown when getAuthToken and the web flow both fail. Never the raw
// "turned off browser signin" string on its own.
export function googleConnectErrorMessage(primaryMessage, fallbackMessage) {
  const primary = String(primaryMessage || '');
  const fallback = String(fallbackMessage || '');
  const signinOff = browserSigninOff(primary);
  if (backupUnconfigured(fallback)) {
    return signinOff
      ? 'Chrome’s Google sign-in is turned off on this profile, and Glance’s backup Google sign-in isn’t set up on this build yet.'
      : 'Glance couldn’t use Chrome’s Google sign-in, and the backup sign-in isn’t set up on this build yet.';
  }
  if (isUserCancelMessage(fallback)) {
    return 'Google sign-in was closed before Glance could connect. Open Connect Google again and finish the Google window.';
  }
  if (signinOff) {
    return 'Chrome’s Google sign-in is turned off on this profile, and the backup Google window didn’t finish. Turn browser sign-in on in Chrome settings, or try Connect Google again and complete the Google window.';
  }
  return 'Glance couldn’t connect Google. Try again, and if Chrome isn’t signed in, finish the Google window that opens.';
}
