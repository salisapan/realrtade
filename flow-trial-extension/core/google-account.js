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
  // the grant has no Gmail scope).
  //
  // The token is chosen by the account of the Gmail tab, never by which one
  // answers first. tab is the address the open tab shows; when the tab says
  // nothing, the account recorded at Connect stands in for it. A write needs
  // a POSITIVE match: the token's own address, read from the Gmail profile,
  // is the same address as that account. A readable token of another account
  // is refused and names both. A token whose address cannot be read, or no
  // account at all to compare it with, is refused as account-unverified: the
  // card says so and offers Reconnect. Nothing is ever written on a guess.
  // With no record and a tab that matches, the match is recorded (adopt).
  function choose(connected, candidates, tab) {
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.token);
    const readable = list.filter((c) => c.email);
    const recorded = norm(connected);
    const want = norm(tab) || recorded;
    if (!list.length) return { ok: false, reason: 'no-token', connected: recorded, tab: want, found: [] };
    if (!want) return { ok: false, reason: 'account-unverified', why: 'no-account', connected: '', tab: '', found: readable.map((c) => c.email) };
    const hit = readable.find((c) => same(c.email, want));
    if (hit) return { ok: true, token: hit.token, source: hit.source, email: hit.email, adopt: !recorded };
    if (readable.length) {
      return { ok: false, reason: 'wrong-account', connected: recorded || want, tab: want, found: readable.map((c) => c.email) };
    }
    return { ok: false, reason: 'account-unverified', why: 'profile-unreadable', connected: recorded, tab: want, found: [] };
  }

  // Both addresses are named: the account of the tab and the account of the
  // sign-in that was found. lang is the language of Glance's own UI.
  function refusalLine(result, lang) {
    const he = String(lang || '').toLowerCase().indexOf('he') === 0;
    const tab = result && (result.tab || result.connected) ? (result.tab || result.connected) : '';
    const found = result && Array.isArray(result.found) && result.found.length ? result.found[0] : '';
    if (result && result.reason === 'wrong-account') {
      return he
        ? 'לא כתבתי: Gmail פתוח על ' + tab + ', אבל ה-Google שמחובר ל-Glance הוא ' + found + '. חבר מחדש את Google עם ' + tab + '.'
        : 'Nothing was written: this Gmail tab is ' + tab + ', but the Google sign-in Glance has is ' + found + '. Reconnect Google as ' + tab + '.';
    }
    return he
      ? 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש. לא נכתב דבר.'
      : "Couldn't verify the account — reconnect Google. Nothing was written.";
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
