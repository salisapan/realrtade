// Google Contacts (G8): read-only People API resolve by name; compose fill only, never send.
// Behind switch GOOGLE_CONTACTS (default off). Portable: no chrome.*, no DOM.
const FlowGoogleContacts = (() => {
  const SWITCH = 'GOOGLE_CONTACTS';
  const SWITCH_DEFAULT = false;
  const CONNECTOR = 'googleContacts';
  const READ_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
  const OTHER_READ_SCOPE = 'https://www.googleapis.com/auth/contacts.other.readonly';
  const PEOPLE = 'https://people.googleapis.com/v1';

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function oauthScopesForSwitch(flags) {
    if (!enabled(flags)) return [];
    return [READ_SCOPE];
  }

  function hasReadScope(scopes) {
    const C = typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
    if (C && typeof C.hasScope === 'function') {
      const h = C.hasScope(scopes, READ_SCOPE);
      if (h === false) return false;
      if (h === true) return true;
    }
    const list = Array.isArray(scopes) ? scopes : String(scopes || '').split(/[\s,]+/);
    return list.some((s) => s === READ_SCOPE || /contacts\.readonly$/i.test(s));
  }

  function cleanName(raw) {
    let s = String(raw || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[''"]/g, '').replace(/[.,;:!?]+$/g, '').trim();
    if (!s || s.length > 60 || /[\\/]/.test(s)) return '';
    return s;
  }

  function mailLang(text) {
    const s = String(text || '');
    const he = (s.match(/[\u0590-\u05FF]/g) || []).length;
    const en = (s.match(/[A-Za-z]/g) || []).length;
    if (he || en) return he > en ? 'he' : 'en';
    return 'en';
  }

  function display() {
    return typeof FlowDisplay !== 'undefined' ? FlowDisplay : null;
  }

  function titleFor(mode, name, lang) {
    const D = display();
    if (D && typeof D.googleContactTitle === 'function') return D.googleContactTitle(mode, name, lang);
    if (mode === 'forward') return lang === 'he' ? ('להעביר ל' + name) : ('Forward to ' + name);
    return lang === 'he' ? ('לענות עם הכתובת של ' + name) : ("Answer with " + name + "'s address");
  }

  function notFoundLine(lang) {
    const D = display();
    if (D && typeof D.chrome === 'function') {
      const pack = D.chrome(lang === 'he' ? 'he' : 'en');
      if (pack && pack.googleContactNotFound) return pack.googleContactNotFound;
    }
    return lang === 'he' ? 'לא נמצא איש קשר בשם הזה באנשי הקשר.' : 'No contact matched that name in Google Contacts.';
  }

  function contactLogHash(value) {
    let h = 5381;
    const s = String(value || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'gc_' + h.toString(16);
  }

  function chooseLine(name, lang) {
    const D = display();
    if (D && typeof D.googleContactChoose === 'function') return D.googleContactChoose(name, lang);
    return lang === 'he' ? ('איזו ' + name + ' התכוונת?') : ('Which ' + name + ' did you mean?');
  }

  const ANSWER_EN = /\bwhat(?:'s| is)\s+([A-Za-z][\w.'-]{0,40}(?:\s+[A-Za-z][\w.'-]{0,40})?)['']?s\s+email\b/i;
  const ANSWER_EN2 = /\b(?:email|e-mail)\s+(?:for|of)\s+([A-Za-z][\w.'-]{0,40}(?:\s+[A-Za-z][\w.'-]{0,40})?)\b/i;
  const ANSWER_HE = /מה\s+(?:ה)?(?:כתובת\s+)?(?:המייל|אימייל|דוא["']?ל)\s+של\s+([\u0590-\u05FF][\u0590-\u05FF\s.'-]{0,40})/;
  const FWD_EN = /\b(?:send|forward)\s+(?:this|it)\s+to\s+([A-Za-z][\w.'-]{0,40}(?:\s+[A-Za-z][\w.'-]{0,40})?)\b/i;
  const FWD_HE = /(?:להעביר|תעביר|תעבירי|שלח|שלחי)\s+(?:ל|אל)\s*([\u0590-\u05FF][\u0590-\u05FF\s.'-]{0,40})/;

  function recognize(text) {
    const s = String(text || '').slice(0, 4000);
    if (!s.trim()) return { kind: 'ignore' };
    let m = s.match(ANSWER_HE) || s.match(ANSWER_EN) || s.match(ANSWER_EN2);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return { kind: 'ignore' };
      return { kind: 'clear', mode: 'answer', name: name, lang: mailLang(s) };
    }
    m = s.match(FWD_HE) || s.match(FWD_EN);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return { kind: 'ignore' };
      return { kind: 'clear', mode: 'forward', name: name, lang: mailLang(s) };
    }
    return { kind: 'ignore' };
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

  function emailsFromPerson(person) {
    const out = [];
    const rows = person && Array.isArray(person.emailAddresses) ? person.emailAddresses : [];
    rows.forEach((row) => {
      const v = row && (row.value || row.email);
      const address = String(v || '').trim();
      if (address && address.indexOf('@') > 0) out.push(address);
    });
    return out;
  }

  function displayFromPerson(person, fallback) {
    const names = person && person.names && person.names[0];
    const dn = names && (names.displayName || names.givenName || names.familyName);
    return cleanName(dn || fallback) || fallback;
  }

  function flattenPeopleResults(json) {
    const people = json && Array.isArray(json.results) ? json.results.map((r) => r.person).filter(Boolean) : [];
    const out = [];
    people.forEach((person) => {
      const emails = emailsFromPerson(person);
      const displayName = displayFromPerson(person, '');
      emails.forEach((address) => {
        out.push({ displayName: displayName || address.split('@')[0], address: address, source: 'people' });
      });
    });
    return out;
  }

  function dedupeCandidates(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = String(row.address || '').toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, row);
    });
    return Array.from(map.values());
  }

  function knownFromProfile(name, profile) {
    const want = cleanName(name);
    if (!want || !profile || !Array.isArray(profile.knownPeople)) return [];
    return profile.knownPeople.filter((row) => row && row.address && nameMatches(want, row.displayName || row.name || ''))
      .map((row) => ({ displayName: row.displayName || row.name || want, address: row.address, source: 'profile' }));
  }

  async function searchPeople(name, deps) {
    const http = deps && deps.http;
    if (typeof http !== 'function') return { ok: false, reason: 'unconfigured' };
    const fromProfile = knownFromProfile(name, deps && deps.profile);
    const q = encodeURIComponent(String(name).replace(/"/g, ''));
    const searchUrl = PEOPLE + '/people:searchContacts?query=' + q + '&readMask=names,emailAddresses&pageSize=15';
    const res = await http({ method: 'GET', url: searchUrl });
    if (!res || !res.ok) return { ok: false, reason: 'people-failed', status: res && res.status };
    const fromApi = flattenPeopleResults(res.json || {});
    const merged = dedupeCandidates(fromProfile.concat(fromApi));
    const filtered = merged.filter((c) => nameMatches(name, c.displayName) || nameMatches(name, c.address.split('@')[0]));
    return { ok: true, candidates: filtered.length ? filtered : merged };
  }

  function pickCandidates(candidates, choiceIndex) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return { ok: false, reason: 'not-found' };
    if (list.length === 1) return { ok: true, recipient: list[0] };
    const idx = typeof choiceIndex === 'number' ? choiceIndex : -1;
    if (idx < 0 || idx >= list.length) return { ok: false, reason: 'ambiguous', candidates: list };
    return { ok: true, recipient: list[idx] };
  }

  async function plan(input, deps) {
    const flags = (input && input.flags) || (deps && deps.flags) || {};
    if (!enabled(flags)) return { action: 'off', reason: 'switch-off' };
    const text = String((input && input.text) || '');
    const rec = recognize(text);
    if (rec.kind !== 'clear') return { action: 'silence', reason: 'no-ask' };
    if (hasReadScope(deps && deps.grantedScopes) === false) return { action: 'silence', reason: 'missing-scope' };
    const searched = await searchPeople(rec.name, deps);
    if (!searched.ok) return { action: 'silence', reason: searched.reason || 'search-failed' };
    const picked = pickCandidates(searched.candidates, input && input.choiceIndex);
    if (picked.reason === 'not-found') {
      return { action: 'not-found', line: notFoundLine(rec.lang), name: rec.name, lang: rec.lang };
    }
    if (picked.reason === 'ambiguous') {
      return {
        action: 'choose',
        line: chooseLine(rec.name, rec.lang),
        name: rec.name,
        mode: rec.mode,
        lang: rec.lang,
        candidates: picked.candidates
      };
    }
    const title = titleFor(rec.mode, rec.name, rec.lang);
    return {
      action: 'offer',
      mode: rec.mode,
      name: rec.name,
      lang: rec.lang,
      title: title,
      line: title,
      email: picked.recipient.address,
      displayName: picked.recipient.displayName,
      connectorId: CONNECTOR
    };
  }

  function composeInputFromOffer(offer, ctx) {
    const mode = offer.mode;
    const email = offer.email;
    const subject = ctx && ctx.subject ? String(ctx.subject) : '';
    if (mode === 'forward') {
      return {
        to: email,
        subject: subject ? (/^fwd:/i.test(subject) ? subject : 'Fwd: ' + subject) : 'Fwd:',
        body: (ctx && ctx.quote) ? String(ctx.quote).slice(0, 4000) : '',
        useDraft: false,
        overwriteTo: true,
        overwriteSubject: true
      };
    }
    const replyTo = (ctx && ctx.senderEmail) || '';
    return {
      to: replyTo,
      subject: subject,
      body: email,
      useDraft: false,
      showCopy: true,
      copyText: email
    };
  }

  async function write(input, http, clock) {
    const Compose = typeof FlowGoogleCompose !== 'undefined' ? FlowGoogleCompose : null;
    if (!Compose || typeof Compose.fill !== 'function') return { ok: false, reason: 'unavailable' };
    const deps = { http: http, grantedScopes: input && input.grantedScopes, profile: input && input.profile, flags: input && input.flags };
    const planned = await plan({ text: input && input.text, flags: deps.flags, choiceIndex: input && input.choiceIndex }, deps);
    if (planned.action !== 'offer') return { ok: false, reason: planned.reason || 'no-offer', error: planned.line };
    const composeIn = composeInputFromOffer(planned, input || {});
    const state = (input && input.state) || { to: '', subject: '', body: '', sendClicks: 0 };
    const out = Compose.fill(composeIn, state, clock);
    if (out && out.ok) {
      out.showCopy = planned.mode === 'answer';
      out.copyText = planned.mode === 'answer' ? planned.email : '';
      out.written = planned.mode === 'answer'
        ? (planned.lang === 'he' ? 'הכתובת בטיוטה. אתה שולח.' : 'Address in the draft. You send it.')
        : (planned.lang === 'he' ? 'ההעברה מוכנה. אתה שולח.' : 'Forward ready in compose. You send it.');
    }
    return out;
  }

  async function undo(ref, http, state) {
    const Compose = typeof FlowGoogleCompose !== 'undefined' ? FlowGoogleCompose : null;
    if (!Compose || typeof Compose.undo !== 'function') return { ok: false, reason: 'unavailable' };
    return Compose.undo(ref, state);
  }

  return {
    SWITCH: SWITCH,
    SWITCH_DEFAULT: SWITCH_DEFAULT,
    CONNECTOR: CONNECTOR,
    READ_SCOPE: READ_SCOPE,
    OTHER_READ_SCOPE: OTHER_READ_SCOPE,
    enabled: enabled,
    oauthScopesForSwitch: oauthScopesForSwitch,
    hasReadScope: hasReadScope,
    recognize: recognize,
    plan: plan,
    searchPeople: searchPeople,
    pickCandidates: pickCandidates,
    composeInputFromOffer: composeInputFromOffer,
    write: write,
    undo: undo,
    titleFor: titleFor,
    contactLogHash: contactLogHash
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleContacts };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleContacts = FlowGoogleContacts;
