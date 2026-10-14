// Read-only recipient resolve by name through /me/contacts and /me/people.
// Contacts.Read comes from outlook-config.js. An unclear or split match stays
// quiet. No network in the portable helpers: pass call(). The binder at the
// bottom runs only in the extension service worker (one background import).
const FlowOutlookContacts = (() => {
  const CONNECTOR = 'outlookContacts';
  const READ_SCOPE = 'Contacts.Read';

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasReadScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === READ_SCOPE || s === 'https://graph.microsoft.com/' + READ_SCOPE);
  }

  function cleanName(name) {
    let s = String(name || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[.,;:!?]+$/g, '').trim();
    if (!s || s.length > 80) return '';
    if (/[\\/]/.test(s) || s.indexOf('..') !== -1) return '';
    return s;
  }

  function searchQuery(name) {
    return encodeURIComponent('"' + String(name).replace(/"/g, '') + '"');
  }

  function contactsPath(name) {
    return '/me/contacts?$search=' + searchQuery(name) + '&$select=id,displayName,emailAddresses&$top=10';
  }

  function peoplePath(name) {
    return '/me/people?$search=' + searchQuery(name) + '&$top=10';
  }

  function addressesFrom(body, key) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const out = [];
    rows.forEach((row) => {
      const list = row && Array.isArray(row[key]) ? row[key] : [];
      list.forEach((item) => {
        const address = item && item.address ? String(item.address).trim() : '';
        if (!address || address.indexOf('@') < 0) return;
        out.push({
          displayName: (row.displayName && String(row.displayName).trim()) || '',
          address: address
        });
      });
    });
    return out;
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    const m = text.match(/\b(?:look up|lookup|find|resolve)\b[\s\S]{0,40}\bcontacts?\b\s+([A-Za-z][\w.'-]{0,40}(?:\s+[A-Za-z][\w.'-]{0,40})?)/i);
    const name = m ? cleanName(m[1]) : '';
    if (!name) return { show: false };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Contacts',
      lines: [{ label: 'Name', value: name }],
      button: 'Look up',
      closes: false,
      params: { name: name }
    };
  }

  async function run(input, deps) {
    const params = (input && input.params) || {};
    const name = cleanName((input && input.name) || params.name);
    if (!name) return { ok: false, reason: 'unclear' };
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasReadScope(deps.grantedScopes) === false) return { ok: false, reason: 'contacts-not-granted' };
    const contacts = await call({
      method: 'GET',
      path: contactsPath(name),
      headers: { ConsistencyLevel: 'eventual' }
    });
    if (!contacts || (contacts.ok !== true && contacts.status !== 403)) {
      return { ok: false, reason: 'contacts-failed', status: contacts && contacts.status };
    }
    const people = await call({
      method: 'GET',
      path: peoplePath(name),
      headers: { ConsistencyLevel: 'eventual' }
    });
    const fromContacts = contacts && contacts.ok ? addressesFrom(contacts.body, 'emailAddresses') : [];
    const fromPeople = people && people.ok ? addressesFrom(people.body, 'scoredEmailAddresses') : [];
    const byAddress = new Map();
    fromContacts.forEach((row) => {
      const key = row.address.toLowerCase();
      byAddress.set(key, { displayName: row.displayName || name, address: row.address, source: 'contacts' });
    });
    fromPeople.forEach((row) => {
      const key = row.address.toLowerCase();
      const prev = byAddress.get(key);
      if (prev) prev.source = 'both';
      else byAddress.set(key, { displayName: row.displayName || name, address: row.address, source: 'people' });
    });
    if (byAddress.size === 0) return { ok: false, reason: 'not-found' };
    if (byAddress.size > 1) return { ok: false, reason: 'ambiguous' };
    const recipient = byAddress.values().next().value;
    return { ok: true, recipient: recipient, connectorId: CONNECTOR, closes: false };
  }

  function undo() {
    return Promise.resolve({ ok: false, reason: 'no-undo' });
  }

  function receiptFromLog() {
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    READ_SCOPE: READ_SCOPE,
    hasReadScope: hasReadScope,
    contactsPath: contactsPath,
    peoplePath: peoplePath,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
if (typeof module !== 'undefined') module.exports = { FlowOutlookContacts };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
