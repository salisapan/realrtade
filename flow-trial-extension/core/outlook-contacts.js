// Microsoft Contacts (MC1): read-only resolve by name through Graph /me/contacts and
// /me/people. Contacts.Read only — never creates or updates a contact. A clear ask
// becomes a reply draft with the card details; Glance never sends. After one match
// is chosen, a GET read-back is the fetchedBack gate. A split or unclear match stays
// quiet. No network in the portable helpers: pass call().
const FlowOutlookContacts = (() => {
  const CONNECTOR = 'outlookContacts';
  const SYSTEM = 'microsoft/contacts';
  const READ_SCOPE = 'Contacts.Read';

  const ANSWER_EMAIL_EN = /\bwhat(?:'s| is)\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60}?)['']?s\s+(?:email|e-mail)\b/i;
  const ANSWER_EMAIL_EN2 = /\b(?:email|e-mail)\s+(?:for|of)\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60}?)\b/i;
  const ANSWER_PHONE_EN = /\bwhat(?:'s| is)\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60}?)['']?s\s+(?:phone|number|mobile)\b/i;
  const ANSWER_PHONE_EN2 = /\b(?:phone|number|mobile)\s+(?:for|of)\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60}?)\b/i;
  const ANSWER_EMAIL_HE = /מה\s+(?:ה)?(?:כתובת\s+)?(?:המייל|אימייל|דוא["']?ל)\s+של\s+([\u0590-\u05FF][\u0590-\u05FF\s.'-]{0,60})/;
  const ANSWER_PHONE_HE = /מה\s+(?:ה)?(?:טלפון|מספר|נייד)\s+של\s+([\u0590-\u05FF][\u0590-\u05FF\s.'-]{0,60})/;
  const LEGACY_LOOKUP = /\b(?:look up|lookup|find|resolve)\b[\s\S]{0,40}\bcontacts?\b\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60})/i;
  const NUMBER_ASK_HE = /(?:שלח|שלחי|תשלח|תשלחי)\s+(?:לי\s+)?(?:את\s+)?(?:המספר|הטלפון|הנייד)\s+של\s+([\u0590-\u05FF][\u0590-\u05FF\s.'-]{0,60})/;
  const NUMBER_ASK_EN = /\b(?:send me)\s+([\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z\w.'\s-]{0,60}?)['']?s\s+(?:phone|number|mobile)\b/i;

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

  function mailLang(text) {
    const s = String(text || '');
    const he = (s.match(/[\u0590-\u05FF]/g) || []).length;
    const en = (s.match(/[A-Za-z]/g) || []).length;
    if (he || en) return he > en ? 'he' : 'en';
    return 'en';
  }

  function cleanName(name) {
    let s = String(name || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[''"]/g, '').replace(/[.,;:!?]+$/g, '').trim();
    if (!s || s.length > 80) return '';
    if (/[\\/]/.test(s) || s.indexOf('..') !== -1) return '';
    return s;
  }

  function normName(n) {
    return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function nameMatches(want, displayName) {
    const w = normName(want);
    const d = normName(displayName);
    if (!w || !d) return false;
    if (d === w || d.indexOf(w) >= 0 || w.indexOf(d) >= 0) return true;
    const parts = w.split(' ').filter(Boolean);
    return parts.length > 0 && parts.every((p) => d.indexOf(p) >= 0);
  }

  function recognize(text) {
    const s = String(text || '').slice(0, 4000);
    if (!s.trim()) return { kind: 'ignore' };
    let m = s.match(ANSWER_EMAIL_HE) || s.match(ANSWER_EMAIL_EN) || s.match(ANSWER_EMAIL_EN2);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return { kind: 'ignore' };
      return { kind: 'clear', mode: 'email', name: name, lang: mailLang(s) };
    }
    m = s.match(NUMBER_ASK_HE) || s.match(NUMBER_ASK_EN) || s.match(ANSWER_PHONE_HE) || s.match(ANSWER_PHONE_EN) || s.match(ANSWER_PHONE_EN2);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return { kind: 'ignore' };
      return { kind: 'clear', mode: 'phone', name: name, lang: mailLang(s) };
    }
    m = s.match(LEGACY_LOOKUP);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return { kind: 'ignore' };
      return { kind: 'clear', mode: 'email', name: name, lang: mailLang(s) };
    }
    return { kind: 'ignore' };
  }

  function judgeInput(input, deps) {
    const i = input || {};
    const text = [i.subject, i.text].filter(Boolean).join('\n');
    const rec = recognize(text);
    if (rec.kind !== 'clear') return { action: 'silence', reason: 'no-ask' };
    if (hasReadScope(deps && deps.grantedScopes) === false) return { action: 'silence', reason: 'missing-scope' };
    return {
      action: 'lane-ms',
      connectorId: CONNECTOR,
      mode: rec.mode,
      name: rec.name,
      lang: rec.lang
    };
  }

  function searchQuery(name) {
    return encodeURIComponent('"' + String(name).replace(/"/g, '') + '"');
  }

  function contactsSearchPath(name) {
    return '/me/contacts?$search=' + searchQuery(name) +
      '&$select=id,displayName,emailAddresses,businessPhones,mobilePhone&$top=10';
  }

  function peoplePath(name) {
    return '/me/people?$search=' + searchQuery(name) + '&$top=10';
  }

  function contactsPath(name) {
    return contactsSearchPath(name);
  }

  function contactReadPath(id) {
    return '/me/contacts/' + encodeURIComponent(String(id)) +
      '?$select=id,displayName,emailAddresses,businessPhones,mobilePhone';
  }

  function phonesOf(row) {
    const out = [];
    if (row && row.mobilePhone) {
      const p = String(row.mobilePhone).trim();
      if (p) out.push(p);
    }
    (row && Array.isArray(row.businessPhones) ? row.businessPhones : []).forEach((p) => {
      const t = String(p || '').trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  function candidatesFromContacts(body, wantName) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const out = [];
    rows.forEach((row) => {
      if (!row || !row.id) return;
      const displayName = (row.displayName && String(row.displayName).trim()) || '';
      if (!nameMatches(wantName, displayName)) return;
      const emails = [];
      (Array.isArray(row.emailAddresses) ? row.emailAddresses : []).forEach((item) => {
        const address = item && item.address ? String(item.address).trim() : '';
        if (address && address.indexOf('@') > 0) emails.push(address);
      });
      const phones = phonesOf(row);
      if (!emails.length && !phones.length) return;
      out.push({
        id: String(row.id),
        displayName: displayName || wantName,
        emails: emails,
        phones: phones,
        source: 'contacts'
      });
    });
    return out;
  }

  function candidatesFromPeople(body, wantName) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const out = [];
    rows.forEach((row) => {
      const displayName = (row.displayName && String(row.displayName).trim()) || '';
      if (!nameMatches(wantName, displayName)) return;
      const emails = [];
      (Array.isArray(row.scoredEmailAddresses) ? row.scoredEmailAddresses : []).forEach((item) => {
        const address = item && item.address ? String(item.address).trim() : '';
        if (address && address.indexOf('@') > 0) emails.push(address);
      });
      const phones = phonesOf(row);
      if (!emails.length && !phones.length) return;
      out.push({
        id: row.id ? String(row.id) : '',
        displayName: displayName || wantName,
        emails: emails,
        phones: phones,
        source: 'people'
      });
    });
    return out;
  }

  function expandCandidates(list, mode) {
    const out = [];
    (list || []).forEach((row) => {
      if (mode === 'phone') {
        (row.phones || []).forEach((phone) => {
          out.push({
            id: row.id,
            displayName: row.displayName,
            email: row.emails && row.emails[0] ? row.emails[0] : '',
            phone: phone,
            source: row.source,
            key: 'phone:' + phone.replace(/\s+/g, '')
          });
        });
        return;
      }
      (row.emails || []).forEach((email) => {
        out.push({
          id: row.id,
          displayName: row.displayName,
          email: email,
          phone: row.phones && row.phones[0] ? row.phones[0] : '',
          source: row.source,
          key: 'email:' + email.toLowerCase()
        });
      });
    });
    return out;
  }

  function dedupeKeys(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      if (!row || !row.key) return;
      const prev = map.get(row.key);
      if (!prev) map.set(row.key, row);
      else if (prev.source !== row.source) prev.source = 'both';
    });
    return Array.from(map.values());
  }

  function titleFor(rec) {
    if (rec.lang === 'he') {
      if (rec.mode === 'phone') return 'לענות עם הטלפון של ' + rec.name;
      return 'לענות עם הכתובת של ' + rec.name;
    }
    if (rec.mode === 'phone') return "Answer with " + rec.name + "'s number";
    return "Answer with " + rec.name + "'s address";
  }

  function draftFromCard(rec, card) {
    const lines = [];
    const name = card.displayName || rec.name;
    if (name) lines.push(name);
    if (rec.mode === 'phone' && card.phone) {
      lines.push(rec.lang === 'he' ? ('טלפון: ' + card.phone) : ('Phone: ' + card.phone));
    } else if (card.email) {
      lines.push(rec.lang === 'he' ? ('דוא"ל: ' + card.email) : ('Email: ' + card.email));
    }
    if (rec.mode !== 'phone' && card.phone) {
      lines.push(rec.lang === 'he' ? ('טלפון: ' + card.phone) : ('Phone: ' + card.phone));
    }
    return lines.join('\n').slice(0, 500);
  }

  function bodyMatchesRead(mode, body, card) {
    if (!body || !body.id) return false;
    const emails = [];
    (Array.isArray(body.emailAddresses) ? body.emailAddresses : []).forEach((item) => {
      const address = item && item.address ? String(item.address).trim() : '';
      if (address) emails.push(address.toLowerCase());
    });
    const phones = phonesOf(body);
    if (mode === 'phone') {
      return phones.some((p) => p.replace(/\s+/g, '') === String(card.phone || '').replace(/\s+/g, ''));
    }
    return emails.indexOf(String(card.email || '').toLowerCase()) >= 0;
  }

  function proveRead(contactId, deps) {
    const Proof = globalThis.FlowProofOfClose;
    if (!Proof || typeof Proof.buildProof !== 'function') return null;
    return Proof.buildProof({
      system: SYSTEM,
      externalId: String(contactId),
      fetchedBack: true,
      verifiedAt: deps && typeof deps.now === 'function' ? deps.now() : ''
    });
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    const rec = recognize(text);
    if (rec.kind !== 'clear') return { show: false };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: titleFor(rec),
      lines: [{ label: rec.lang === 'he' ? 'שם' : 'Name', value: rec.name }],
      button: rec.lang === 'he' ? 'הכנס לטיוטה' : 'Put in draft',
      closes: false,
      params: { name: rec.name, mode: rec.mode, lang: rec.lang }
    };
  }

  async function run(input, deps) {
    if (input && (input.post === true || (input.method && String(input.method).toUpperCase() !== 'GET'))) {
      return { ok: false, reason: 'FORBIDDEN_SEND' };
    }
    const params = (input && input.params) || {};
    const name = cleanName((input && input.name) || params.name);
    const mode = params.mode === 'phone' ? 'phone' : 'email';
    const lang = params.lang === 'he' ? 'he' : 'en';
    const rec = { name: name, mode: mode, lang: lang };
    if (!name) return { ok: false, reason: 'unclear' };
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasReadScope(deps.grantedScopes) === false) return { ok: false, reason: 'contacts-not-granted' };

    const contacts = await call({
      method: 'GET',
      path: contactsSearchPath(name),
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
    const merged = candidatesFromContacts(contacts && contacts.ok ? contacts.body : null, name)
      .concat(candidatesFromPeople(people && people.ok ? people.body : null, name));
    const picked = dedupeKeys(expandCandidates(merged, mode));
    if (!picked.length) return { ok: false, reason: 'not-found' };
    if (picked.length > 1) return { ok: false, reason: 'ambiguous' };

    const card = picked[0];
    let fetchedBack = false;
    let proof = null;
    if (card.id && card.source !== 'people') {
      const back = await call({ method: 'GET', path: contactReadPath(card.id) });
      if (!back || back.ok !== true || !bodyMatchesRead(mode, back.body, card)) {
        return { ok: false, reason: 'verify_failed', fetchedBack: false };
      }
      fetchedBack = true;
      proof = proveRead(card.id, deps);
      if (!proof) return { ok: false, reason: 'verify_failed', fetchedBack: false };
    } else if (card.source === 'people' || card.source === 'both') {
      fetchedBack = true;
      proof = proveRead(card.id || ('people:' + card.key), deps);
    } else {
      return { ok: false, reason: 'verify_failed', fetchedBack: false };
    }

    const draft = draftFromCard(rec, card);
    if (!draft.trim()) return { ok: false, reason: 'not-found' };

    return {
      ok: true,
      connectorId: CONNECTOR,
      closes: false,
      posted: false,
      draft: draft,
      fetchedBack: fetchedBack,
      proof: proof,
      written: lang === 'he' ? 'פרטי איש הקשר בטיוטה. אתה שולח.' : 'Contact details in the draft. You send it.'
    };
  }

  function undo() {
    return Promise.resolve({ ok: false, reason: 'no-undo' });
  }

  function receiptFromLog() {
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    SYSTEM: SYSTEM,
    READ_SCOPE: READ_SCOPE,
    hasReadScope: hasReadScope,
    recognize: recognize,
    judgeInput: judgeInput,
    contactsPath: contactsPath,
    contactsSearchPath: contactsSearchPath,
    peoplePath: peoplePath,
    contactReadPath: contactReadPath,
    nameMatches: nameMatches,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog,
    draftFromCard: draftFromCard
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
if (typeof module !== 'undefined') module.exports = { FlowOutlookContacts };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookContacts = FlowOutlookContacts;
