// Which Google account a write may go to. Portable: no chrome.*, no DOM, no
// network. The host reads the account of each candidate token from the
// Gmail profile and asks this module which one may be used.
//
// The account is the one the person consented to in Glance. A token that
// the Chrome profile hands out is the profile's own account, which can be a
// different one. It is used only when its address is the consented one.
const FlowGoogleAccount = (() => {
  const CONNECTED_KEY = 'googleConnectedAccount';

  function norm(value) {
    return String(value || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().toLowerCase();
  }

  function same(a, b) {
    const x = norm(a);
    const y = norm(b);
    return !!x && x === y;
  }

  function emailOfProfile(json) {
    const raw = json && (json.emailAddress || json.email);
    const email = norm(raw);
    return email.indexOf('@') > 0 ? email : '';
  }

  // candidates: [{ token, source, email }] in the order they are preferred.
  // email '' means the account could not be read (the profile call failed or
  // the grant has no Gmail scope). That alone never blocks a write: only an
  // address that is readable and is not the consented one does, so a token
  // that cannot be read is used as before and the write says nothing about
  // the account. connected '' means nothing was recorded yet (an older
  // install): the first readable candidate becomes the account, and adopt
  // says to record it.
  function choose(connected, candidates) {
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.token);
    const readable = list.filter((c) => c.email);
    const want = norm(connected);
    const unread = () => ({ ok: true, token: list[0].token, source: list[0].source, email: '', adopt: false, unverified: true });
    if (!want) {
      const first = readable[0];
      if (first) return { ok: true, token: first.token, source: first.source, email: first.email, adopt: true };
      return list.length ? unread() : { ok: false, reason: 'no-token', found: [] };
    }
    const hit = readable.find((c) => same(c.email, want));
    if (hit) return { ok: true, token: hit.token, source: hit.source, email: hit.email, adopt: false };
    if (readable.length) {
      return { ok: false, reason: 'wrong-account', connected: want, found: readable.map((c) => c.email) };
    }
    return list.length ? unread() : { ok: false, reason: 'no-token', connected: want, found: [] };
  }

  function refusalLine(result, lang) {
    const he = String(lang || '').toLowerCase().indexOf('he') === 0;
    const connected = result && result.connected ? result.connected : '';
    const found = result && Array.isArray(result.found) && result.found.length ? result.found[0] : '';
    if (result && result.reason === 'wrong-account') {
      return he
        ? 'לא כתבתי: האסימון שנמצא שייך ל-' + found + ', ו-Glance מחובר ל-' + connected + '. חבר מחדש את Google עם החשבון הנכון.'
        : 'Nothing was written: the Google sign-in found belongs to ' + found + ' and Glance is connected as ' + connected + '. Reconnect Google with the right account.';
    }
    return he
      ? 'לא הצלחתי לוודא לאיזה חשבון Google אני כותב, אז לא כתבתי כלום.'
      : "Couldn't confirm which Google account this would write to, so nothing was written.";
  }

  return {
    CONNECTED_KEY: CONNECTED_KEY,
    norm: norm,
    same: same,
    emailOfProfile: emailOfProfile,
    choose: choose,
    refusalLine: refusalLine
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleAccount };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleAccount = FlowGoogleAccount;
