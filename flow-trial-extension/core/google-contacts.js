// Read one contact by exact email. contacts.readonly is the scope.
// This module never creates, edits, or deletes a contact.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleContacts = (() => {
  const API = 'https://people.googleapis.com/v1/people:searchContacts';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function emailOf(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!s || s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
    return s;
  }

  function lookupUrl(email) {
    return API + '?query=' + encodeURIComponent(email) + '&readMask=' + encodeURIComponent('names,emailAddresses') + '&pageSize=5';
  }

  function matchOf(json, email) {
    const results = json && json.results;
    if (!Array.isArray(results)) return null;
    for (let i = 0; i < results.length; i++) {
      const person = results[i] && results[i].person;
      const emails = person && person.emailAddresses;
      if (!Array.isArray(emails)) continue;
      for (let j = 0; j < emails.length; j++) {
        if (emailOf(emails[j] && emails[j].value) === email) {
          const names = person.names;
          const display = names && names[0] && names[0].displayName ? String(names[0].displayName).slice(0, 200) : '';
          return { resourceName: String(person.resourceName || '').slice(0, 200), displayName: display, email: email };
        }
      }
    }
    return null;
  }

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  async function lookup(input, http) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_CONTACTS, 'contacts-not-granted');
    if (blocked) return blocked;
    const email = emailOf(i.email || i.query);
    if (!email) return { ok: false, reason: 'unclear' };
    const got = await call(http, { method: 'GET', url: lookupUrl(email) });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (!got.ok) return { ok: false, reason: 'http-' + got.status };
    const match = matchOf(got.json, email);
    return { ok: true, found: !!match, match: match };
  }

  return {
    emailOf: emailOf,
    lookupUrl: lookupUrl,
    lookup: lookup
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleContacts };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleContacts = FlowGoogleContacts;
