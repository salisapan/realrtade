// Microsoft Contacts (MC1): read-only resolve by name through Graph /me/contacts.
// Contacts.Read only — never creates or updates a contact. $search does not match a
// reversed Hebrew name, so the list is paged and matched here: displayName, fileAs,
// and givenName+surname in both orders, as the same token set. A clear ask becomes
// a reply draft only after exactly one address. Glance never sends. After one match
// is chosen, a GET read-back is the fetchedBack gate. No network in the portable
// helpers: pass call().
const FlowOutlookContacts = (() => {
  const CONNECTOR = 'outlookContacts';
  const SYSTEM = 'microsoft/contacts';
  const READ_SCOPE = 'Contacts.Read';
  const WHY_REASON = 'contacts-not-granted';
  const TOGGLE_OFF = 'contacts-toggle-off';
  const SCOPE_MISSING = 'contacts-scope-missing';
  const CHOICE_KEY = 'glanceContactsChoice';
  // The Outlook row in the Glance popup is where Contacts is ticked. The card
  // says so in Hebrew. Nothing is looked up and nothing is sent.
  const GRANT_HE = 'כדי למצוא את איש הקשר, פתח את חלון Glance וסמן אנשי קשר בשורת Outlook.';
  const ALREADY_LINE = 'אנשי קשר כבר כלולים בכניסה.';
  const DRAFT_FAIL = 'לא הצלחתי להכניס לטיוטה';
  const IN_DRAFT_HE = 'פרטי איש הקשר בטיוטה. אתה שולח.';
  const IN_DRAFT_EN = 'Contact details in the draft. You send it.';

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

  // Granted only when the person left Contacts ticked AND the token scp
  // includes Contacts.Read. A missing choice is off. An old consent on the
  // token does not turn the toggle back on.
  function accessOf(deps) {
    const d = deps || {};
    const toggleOn = d.contactsChoice === true;
    const scopeOn = hasReadScope(d.grantedScopes) === true;
    if (!toggleOn) return { granted: false, reason: WHY_REASON, detail: TOGGLE_OFF };
    if (!scopeOn) return { granted: false, reason: WHY_REASON, detail: SCOPE_MISSING };
    return { granted: true, reason: '', detail: '' };
  }

  // What «הוסף הרשאה» does with the Contacts box. A scope already on the
  // token stays ticked and is named. A missing scope asks with prompt=consent.
  function consentPlan(input) {
    const ticked = !!(input && input.ticked === true);
    const scopeOn = hasReadScope(input && input.scopes) === true;
    if (!ticked) return { choice: false, request: false, already: false, prompt: '', scope: READ_SCOPE, line: '' };
    if (scopeOn) return { choice: true, request: false, already: true, prompt: '', scope: READ_SCOPE, line: ALREADY_LINE };
    return { choice: true, request: true, already: false, prompt: 'consent', scope: READ_SCOPE, line: '' };
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

  // Hebrew letters only, after niqqud is gone. Punctuation, maqaf, and geresh
  // become spaces so «כהן, דנה» and «כהן דנה» are the same tokens.
  function foldName(value) {
    return String(value || '')
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/[^\u05D0-\u05EAA-Za-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function tokensOf(value) {
    const folded = foldName(value);
    if (!folded) return [];
    return folded.split(' ').filter(Boolean);
  }

  function sameTokenSet(want, have) {
    if (!want.length || want.length !== have.length) return false;
    const left = want.slice().sort();
    const right = have.slice().sort();
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
    return true;
  }

  function nameMatches(want, displayName) {
    return sameTokenSet(tokensOf(want), tokensOf(displayName));
  }

  function nameForms(row) {
    const forms = [];
    const display = row && row.displayName ? String(row.displayName) : '';
    const fileAs = row && row.fileAs ? String(row.fileAs) : '';
    const given = row && row.givenName ? String(row.givenName).trim() : '';
    const surname = row && row.surname ? String(row.surname).trim() : '';
    if (display) forms.push(display);
    if (fileAs) forms.push(fileAs);
    if (given && surname) {
      forms.push(given + ' ' + surname);
      forms.push(surname + ' ' + given);
    } else if (given) forms.push(given);
    else if (surname) forms.push(surname);
    return forms;
  }

  function rowMatches(want, row) {
    const wantTokens = tokensOf(want);
    if (!wantTokens.length) return false;
    return nameForms(row).some((form) => sameTokenSet(wantTokens, tokensOf(form)));
  }

  function hashQuery(name) {
    const s = tokensOf(name).join(' ');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function missLine(name, lang) {
    if (lang === 'he') return 'לא מצאתי את ' + name + ' באנשי הקשר';
    return "I didn't find " + name + ' in Contacts';
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
    const access = accessOf(deps);
    if (!access.granted) {
      return { action: 'why', reason: access.reason, detail: access.detail, written: GRANT_HE, connectorId: CONNECTOR };
    }
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

  const PAGE_TOP = 100;
  const PAGE_CAP = 3;
  const LIST_SELECT = 'id,displayName,givenName,surname,fileAs,emailAddresses,businessPhones,mobilePhone';

  function contactsListPath(skip) {
    let path = '/me/contacts?$select=' + LIST_SELECT + '&$top=' + PAGE_TOP;
    if (skip) path += '&$skip=' + String(skip);
    return path;
  }

  function contactsSearchPath(name) {
    return contactsListPath(0);
  }

  function nextContactsPath(body, pages) {
    const link = body && (body['@odata.nextLink'] || body['@odata.nextlink']);
    if (link) {
      try {
        const u = new URL(String(link), 'https://graph.microsoft.com');
        if (u.hostname === 'graph.microsoft.com') {
          const path = u.pathname.replace(/^\/v1\.0/, '') + u.search;
          if (path.indexOf('/me/contacts') === 0 && path.indexOf('..') < 0) return path;
        }
      } catch (e) { /* a bad link stops the page */ }
      return '';
    }
    const rows = body && Array.isArray(body.value) ? body.value : [];
    if (rows.length < PAGE_TOP || pages >= PAGE_CAP) return '';
    return contactsListPath(pages * PAGE_TOP);
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
      if (!rowMatches(wantName, row)) return;
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
      if (!rowMatches(wantName, row)) return;
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

  function grantOffer(rec, detail) {
    return {
      show: true,
      connectorId: CONNECTOR,
      title: titleFor(rec),
      lines: [{ label: '', value: GRANT_HE }],
      written: GRANT_HE,
      button: '',
      grant: true,
      reason: WHY_REASON,
      detail: detail || TOGGLE_OFF,
      closes: false,
      params: { name: rec.name, mode: rec.mode, lang: rec.lang }
    };
  }

  function offer(ctx, deps) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    const rec = recognize(text);
    if (rec.kind !== 'clear') return { show: false };
    const access = accessOf(deps);
    if (!access.granted) return grantOffer(rec, access.detail);
    return {
      show: true,
      lookup: true,
      connectorId: CONNECTOR,
      title: titleFor(rec),
      lines: [],
      button: '',
      closes: false,
      params: { name: rec.name, mode: rec.mode, lang: rec.lang }
    };
  }

  function lookupMeta(name, status, count) {
    return { queryHash: hashQuery(name), status: status == null ? 0 : status, matchCount: count };
  }

  function buttonLabel(lang) {
    return lang === 'he' ? 'הכנס לטיוטה' : 'Put in draft';
  }

  function missResult(rec, status) {
    return Object.assign({
      ok: false,
      reason: 'not-found',
      written: missLine(rec.name, rec.lang),
      button: '',
      posted: false,
      closes: false,
      connectorId: CONNECTOR
    }, lookupMeta(rec.name, status, 0));
  }

  async function confirmCard(card, rec, deps, call) {
    if (!card || !card.id) return { ok: false, reason: 'verify_failed', fetchedBack: false };
    const back = await call({ method: 'GET', path: contactReadPath(card.id) });
    const status = back && typeof back.status === 'number' ? back.status : 0;
    if (!back || back.ok !== true || !bodyMatchesRead(rec.mode, back.body, card)) {
      return { ok: false, reason: 'verify_failed', fetchedBack: false, status: status };
    }
    const proof = proveRead(card.id, deps);
    if (!proof) return { ok: false, reason: 'verify_failed', fetchedBack: false, status: status };
    return { ok: true, fetchedBack: true, proof: proof, status: status };
  }

  function readyResult(rec, card, verified, meta) {
    const draft = draftFromCard(rec, card);
    const value = rec.mode === 'phone' ? card.phone : card.email;
    if (!draft.trim() || !value) return missResult(rec, meta && meta.status);
    return Object.assign({
      ok: true,
      connectorId: CONNECTOR,
      closes: false,
      posted: false,
      draft: draft,
      email: card.email || '',
      phone: card.phone || '',
      button: buttonLabel(rec.lang),
      lines: [{
        label: rec.lang === 'he' ? (rec.mode === 'phone' ? 'טלפון' : 'דוא"ל') : (rec.mode === 'phone' ? 'Phone' : 'Email'),
        value: value
      }],
      fetchedBack: verified.fetchedBack === true,
      proof: verified.proof,
      written: rec.lang === 'he' ? IN_DRAFT_HE : IN_DRAFT_EN,
      verified: false
    }, meta || {});
  }

  async function pageContacts(call) {
    const rows = [];
    let path = contactsListPath(0);
    let status = 0;
    let pages = 0;
    let previous = '';
    while (path && pages < PAGE_CAP && path !== previous) {
      previous = path;
      pages += 1;
      const res = await call({ method: 'GET', path: path });
      status = res && typeof res.status === 'number' ? res.status : 0;
      if (!res || res.ok !== true) return { ok: false, status: status, rows: rows };
      const value = res.body && Array.isArray(res.body.value) ? res.body.value : [];
      value.forEach((row) => rows.push(row));
      path = nextContactsPath(res.body, pages);
    }
    return { ok: true, status: status || 200, rows: rows };
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
    const access = accessOf(deps);
    if (!access.granted) {
      return { ok: false, reason: WHY_REASON, detail: access.detail, written: GRANT_HE, connectorId: CONNECTOR, posted: false, closes: false };
    }

    if (params.chosenId) {
      const back = await call({ method: 'GET', path: contactReadPath(params.chosenId) });
      const status = back && typeof back.status === 'number' ? back.status : 0;
      const row = back && back.ok === true ? back.body : null;
      if (!row || !rowMatches(name, row)) return missResult(rec, status);
      const picked = dedupeKeys(expandCandidates(candidatesFromContacts({ value: [row] }, name), mode));
      const wantEmail = params.chosenEmail ? String(params.chosenEmail).toLowerCase() : '';
      const card = picked.filter((item) => !wantEmail || String(item.email || '').toLowerCase() === wantEmail)[0];
      if (!card || !bodyMatchesRead(mode, row, card)) return missResult(rec, status);
      const proof = proveRead(card.id, deps);
      if (!proof) return Object.assign({ ok: false, reason: 'verify_failed', fetchedBack: false, button: '', posted: false }, lookupMeta(name, status, 0));
      return readyResult(rec, card, { fetchedBack: true, proof: proof }, lookupMeta(name, status, 1));
    }

    const page = await pageContacts(call);
    if (!page.ok) {
      return Object.assign({
        ok: false,
        reason: 'contacts-failed',
        button: '',
        posted: false,
        closes: false,
        written: lang === 'he' ? 'לא הצלחתי לקרוא את אנשי הקשר' : 'Could not read Contacts'
      }, lookupMeta(name, page.status, 0));
    }
    const picked = dedupeKeys(expandCandidates(candidatesFromContacts({ value: page.rows }, name), mode));
    const meta = lookupMeta(name, page.status, picked.length);
    if (!picked.length) return missResult(rec, page.status);
    if (picked.length > 1) {
      return Object.assign({
        ok: false,
        reason: 'ambiguous',
        button: '',
        posted: false,
        closes: false,
        choices: picked.map((item) => ({
          id: item.id,
          displayName: item.displayName,
          email: item.email || '',
          phone: item.phone || ''
        }))
      }, meta);
    }
    const verified = await confirmCard(picked[0], rec, deps, call);
    if (!verified.ok) {
      return Object.assign({
        ok: false,
        reason: 'verify_failed',
        fetchedBack: false,
        button: '',
        posted: false,
        written: missLine(name, lang)
      }, lookupMeta(name, verified.status || page.status, 0));
    }
    return readyResult(rec, picked[0], verified, meta);
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
    WHY_REASON: WHY_REASON,
    TOGGLE_OFF: TOGGLE_OFF,
    SCOPE_MISSING: SCOPE_MISSING,
    CHOICE_KEY: CHOICE_KEY,
    GRANT_HE: GRANT_HE,
    ALREADY_LINE: ALREADY_LINE,
    DRAFT_FAIL: DRAFT_FAIL,
    IN_DRAFT_HE: IN_DRAFT_HE,
    IN_DRAFT_EN: IN_DRAFT_EN,
    accessOf: accessOf,
    consentPlan: consentPlan,
    hasReadScope: hasReadScope,
    recognize: recognize,
    judgeInput: judgeInput,
    contactsPath: contactsPath,
    contactsSearchPath: contactsSearchPath,
    peoplePath: peoplePath,
    contactReadPath: contactReadPath,
    nameMatches: nameMatches,
    rowMatches: rowMatches,
    hashQuery: hashQuery,
    missLine: missLine,
    contactsListPath: contactsListPath,
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
