// Google lane for the full flavor. Portable: no chrome.*, no DOM, no network.
//
// Unpacked manifest key → extension id dnjjhplgmnkabbjogfpbhofjedlkehkai, OAuth
// client hsd2u2 (manifest.json). Store item lbihckfmoffgjjlnneoeaehbhoonfenh
// uses client aup7do, swapped in by the store build. Web client gstvm1 is for
// launchWebAuthFlow (config/oauth.public.js).
//
// Allowed scopes, and nothing else: openid, userinfo.profile, userinfo.email,
// drive.file, calendar.events, tasks. Restricted Gmail scopes and drive-wide
// read scopes are refused here. Gmail is read and filled on the Gmail page.
// Glance never sends.
const FlowGoogleConfig = (() => {
  const CLIENT_ID = '93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com'; // store build only
  const EXTENSION_ID = 'lbihckfmoffgjjlnneoeaehbhoonfenh'; // store build only
  const SCOPE_OPENID = 'openid';
  const SCOPE_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';
  const SCOPE_PROFILE = 'https://www.googleapis.com/auth/userinfo.profile';
  const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
  const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
  const SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks';
  const SCOPES = [
    SCOPE_OPENID,
    SCOPE_EMAIL,
    SCOPE_PROFILE,
    SCOPE_DRIVE_FILE,
    SCOPE_CALENDAR,
    SCOPE_TASKS
  ];

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  // Restricted Gmail scopes need CASA. Drive-wide read scopes are refused.
  // documents and spreadsheets scopes are not this grant:
  // those APIs are called only with drive.file, on a file this app created
  // or the person picked.
  function refusalReason(scope) {
    const s = String(scope || '').trim();
    if (!s) return 'empty';
    if (/gmail/i.test(s) || /mail\.google/i.test(s) || /Mail\.Send/i.test(s)) return 'gmail-scope';
    if (/drive\.readonly/i.test(s) || /\/auth\/drive$/i.test(s)) return 'drive-wide';
    if (/\/auth\/documents/i.test(s) || /\/auth\/spreadsheets/i.test(s)) return 'docs-scope';
    if (SCOPES.indexOf(s) < 0) return 'not-allowed';
    return '';
  }

  function refused(scopes) {
    const list = scopeList(scopes) || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const why = refusalReason(list[i]);
      if (why) out.push({ scope: list[i], reason: why });
    }
    return out;
  }

  function assertAllowed(scopes) {
    const bad = refused(scopes);
    return bad.length ? { ok: false, reason: bad[0].reason, refused: bad } : { ok: true, scopes: scopeList(scopes) };
  }

  // null: the token did not say. false: the list is known and the scope is missing.
  function hasScope(scopes, needed) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.indexOf(needed) >= 0;
  }

  // A known list must be the allowlist and must include the one scope this
  // write needs. Unknown scopes stay quiet and let the call try.
  function gate(scopes, needed, missingReason) {
    if (scopes != null) {
      const checked = assertAllowed(scopes);
      if (!checked.ok) return { ok: false, reason: checked.reason };
    }
    if (hasScope(scopes, needed) === false) return { ok: false, reason: missingReason };
    return null;
  }

  function proofOf(system, externalId, url, verifiedAt) {
    const Proof = typeof globalThis !== 'undefined' ? globalThis.FlowProofOfClose : null;
    const input = {
      system: system,
      externalId: externalId,
      fetchedBack: true,
      verifiedAt: verifiedAt
    };
    if (url) input.url = url;
    if (Proof && typeof Proof.buildProof === 'function') return Proof.buildProof(input);
    if (!system || !externalId || !verifiedAt) return null;
    if (Number.isNaN(Date.parse(verifiedAt))) return null;
    const proof = { system: system, externalId: externalId, fetchedBack: true, verifiedAt: verifiedAt };
    if (url) proof.url = url;
    return proof;
  }

  // The APIs whose 401 means the grant itself is gone: the ones a card
  // writes to. Any other Google URL (a profile read, a stray lookup) can
  // answer 401 without the token being wrong, and that answer must never
  // throw the token away or flag Reconnect.
  function isCriticalUrl(url) {
    let u;
    try { u = new URL(String(url || '')); } catch (e) { return false; }
    const host = u.hostname;
    const path = u.pathname || '';
    if (host === 'tasks.googleapis.com' || host === 'docs.googleapis.com' || host === 'sheets.googleapis.com' || host === 'gmail.googleapis.com') return true;
    if (host === 'www.googleapis.com') return /^\/(calendar|drive|upload\/drive)\//.test(path);
    return false;
  }

  function clockIso(clock) {
    if (typeof clock === 'function') return clock();
    if (typeof clock === 'string' && !Number.isNaN(Date.parse(clock))) return clock;
    return new Date().toISOString();
  }

  return {
    CLIENT_ID: CLIENT_ID,
    EXTENSION_ID: EXTENSION_ID,
    SCOPES: SCOPES,
    SCOPE_OPENID: SCOPE_OPENID,
    SCOPE_EMAIL: SCOPE_EMAIL,
    SCOPE_PROFILE: SCOPE_PROFILE,
    SCOPE_DRIVE_FILE: SCOPE_DRIVE_FILE,
    SCOPE_CALENDAR: SCOPE_CALENDAR,
    SCOPE_TASKS: SCOPE_TASKS,
    scopeList: scopeList,
    refusalReason: refusalReason,
    refused: refused,
    assertAllowed: assertAllowed,
    hasScope: hasScope,
    gate: gate,
    proofOf: proofOf,
    isCriticalUrl: isCriticalUrl,
    clockIso: clockIso
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleConfig };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleConfig = FlowGoogleConfig;
