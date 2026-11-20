// Personal model. On-device, user-owned, off until a category is consented.
// Facts are bi-temporal: a new value inserts a row and closes the old one.
// Portable: no chrome.*, no document, no window, no network.
const FlowPersonalModel = (() => {
  const SCHEMA = '1-0-0';
  const CATEGORIES = ['people', 'habits', 'style', 'work', 'places', 'identity'];
  const WEIGHTS = { recency: 0.45, frequency: 0.35, reciprocity: 0.20 };
  const RECENCY_HALF_DAYS = 30;
  const FREQUENCY_CAP = 20;
  const GUARD = 0.8;
  const ARMS = [0.8, 0.85, 0.9, 0.95];
  const EXEMPLAR_CAP = 24;
  const EXEMPLAR_MAX = 160;
  const DIM = 6;
  const THIRD_PARTY_PREDICATES = [
    'person.tie_strength', 'person.reply_latency_to', 'person.reply_latency_from',
    'person.channel', 'person.language', 'person.relation'
  ];
  const WORK_PREDICATES = ['work.works_on', 'work.client_of', 'work.commitment'];
  const HALF = {
    'person.tie_strength': 30, 'person.reply_latency_to': 30, 'person.reply_latency_from': 30,
    'person.channel': 60, 'person.language': 90, 'person.relation': 90,
    'habit.meeting_hour': 30, 'habit.duration': 30, 'habit.tool': 60, 'habit.working_hours': 30,
    'place.city': 180, 'style.greeting': 90, 'style.signoff': 90, 'style.length': 90,
    'style.formality': 90, 'style.emoji': 90, 'style.mixing': 90, 'style.vector': 90,
    'work.works_on': 60, 'work.client_of': 90, 'work.commitment': 30, 'work.org': 180,
    'identity.name': 365, 'identity.role': 180, 'identity.org': 180
  };
  const FREEMAIL = /^(?:gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|walla)\./i;
  const BLOCK = [
    { id: 'health', re: /\b(clinic|hospital|diagnosis|cancer|therapy|hiv|tumor|symptom|prescription|disease)\b|מחלה|אבחנה|בית חולים|בריאות|תרופה/i },
    { id: 'religion', re: /\b(church|mosque|synagogue|pastor|rabbi|baptism)\b|בית כנסת|מסגד|כנסייה/i },
    { id: 'politics', re: /\b(election|ballot|political party)\b|מפלגה|בחירות|ליכוד/i },
    { id: 'sexuality', re: /\b(gay|lesbian|bisexual|sexual orientation)\b|נטייה מינית/i },
    { id: 'ethnicity', re: /\b(ethnicity|racial)\b|מוצא אתני/i },
    { id: 'union', re: /\b(trade union|labor union|union)\b|הסתדרות|ועד עובדים/i },
    { id: 'criminal', re: /\b(felony|convicted|prison|indictment)\b|כלא|הרשעה|כתב אישום/i },
    { id: 'precise_location', re: /\b\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b|\bgps\b|\bplus\s*code\b|\bstreet\b|\broad\b|\bavenue\b|רחוב|שדרות|סמטה/i },
    { id: 'finances', re: /\b(their|his|her)\s+(salary|iban|bank account)\b|משכורת של|חשבון בנק של/i },
    { id: 'minors', re: /\b(my son|my daughter|minor child)\b|הבן שלי|הבת שלי|קטין/i }
  ];
  const PROVENANCE = ['user_said', 'user_sent', 'user_action', 'third_party_content'];
  const RETRIEVAL = { recency: 0.4, importance: 0.3, cosine: 0.3 };

  const COPY = {
    en: {
      title: 'What Glance knows about me',
      hint: 'Off until you turn a category on. It stays on this computer. You can see it, edit it, and delete it.',
      confirm: 'I understand',
      later: 'Not now',
      forgetAll: 'Forget all',
      export: 'Export JSON',
      confirmFact: 'Confirm',
      edit: 'Edit',
      forget: 'Forget',
      never: 'Never learn this',
      source: 'Source',
      why: '{count} notes, {from} to {to}',
      deleted: 'Deleted from this computer.',
      saved: 'Saved on this computer.',
      disclosure: {
        people: 'Glance can remember people you write with: a name, an address, how often, which app, and which language. It stays on this computer. You can edit or delete every row.',
        habits: 'Glance can remember the hours you usually meet, from your own calendar. It stays on this computer. You can edit or delete every row.',
        style: 'Glance can remember how you write to a client or a colleague, from mail you sent, including a short example with addresses removed. It stays on this computer.',
        work: 'Glance can remember your organization and the projects you confirm. It stays on this computer. You can edit or delete every row.',
        places: 'Off unless you turn it on. Glance stores a city only, from your calendar or from what you type. Never a street or a map pin.',
        identity: 'Glance can remember your own name and a role or organization taken from mail you sent. It stays on this computer.'
      }
    },
    he: {
      title: 'Glance יודע עליי',
      hint: 'כבוי עד שמדליקים קטגוריה. נשאר על המחשב הזה. אפשר לראות, לתקן ולמחוק.',
      confirm: 'הבנתי',
      later: 'לא עכשיו',
      forgetAll: 'שכח הכל',
      export: 'ייצוא JSON',
      confirmFact: 'אישור',
      edit: 'עריכה',
      forget: 'שכח',
      never: 'אל תלמד את זה',
      source: 'מקור',
      why: '{count} אזכורים, {from} עד {to}',
      deleted: 'נמחק מהמחשב הזה.',
      saved: 'נשמר על המחשב הזה.',
      disclosure: {
        people: 'Glance יכול לזכור אנשים שכותבים איתך: שם, כתובת, תדירות, באיזה יישום, ובאיזו שפה. זה נשאר על המחשב הזה. כל שורה ניתנת לעריכה ולמחיקה.',
        habits: 'Glance יכול לזכור באילו שעות אתה נפגש בדרך כלל, מהיומן שלך. זה נשאר על המחשב הזה. כל שורה ניתנת לעריכה ולמחיקה.',
        style: 'Glance יכול לזכור איך אתה כותב ללקוח או לעמית, מדואר ששלחת, כולל דוגמה קצרה בלי כתובות. זה נשאר על המחשב הזה.',
        work: 'Glance יכול לזכור את הארגון שלך ופרויקטים שתאשר. זה נשאר על המחשב הזה. כל שורה ניתנת לעריכה ולמחיקה.',
        places: 'כבוי עד שמדליקים. Glance שומר עיר בלבד, מהיומן או ממה שמקלידים. לא רחוב ולא נקודה במפה.',
        identity: 'Glance יכול לזכור את השם שלך ותפקיד או ארגון מתוך דואר ששלחת. זה נשאר על המחשב הזה.'
      }
    }
  };

  function empty(now) {
    const ts = Number.isFinite(now) ? now : Date.now();
    return {
      schema_ver: SCHEMA,
      install_id: uuid(ts),
      consents: blankConsents(),
      entities: [],
      aliases: [],
      facts: [],
      tombstones: [],
      exemplars: [],
      style_rules: [],
      review: [],
      bandit: freshBandit(),
      wiped_at: 0,
      silentThreads: {},
      approvals: [],
      ngrams: []
    };
  }

  function blankConsents() {
    const out = {};
    CATEGORIES.forEach((c) => { out[c] = false; });
    return out;
  }

  function freshBandit() {
    const arms = {};
    ARMS.forEach((threshold) => {
      const id = 't' + Math.round(threshold * 100);
      arms[id] = { id: id, threshold: threshold, A: eye(DIM), b: zeros(DIM), pulls: 0, reward: 0 };
    });
    return { enabled: false, alpha: 0.2, arms: arms };
  }

  function zeros(n) { const out = []; for (let i = 0; i < n; i++) out.push(0); return out; }
  function eye(n) { const A = []; for (let i = 0; i < n; i++) { const row = zeros(n); row[i] = 1; A.push(row); } return A; }

  function uuid(now) {
    const ms = Number.isFinite(now) ? Math.floor(now) : Date.now();
    const b = new Array(16);
    let t = ms;
    for (let i = 5; i >= 0; i--) { b[i] = t & 255; t = Math.floor(t / 256); }
    const rnd = randomBytes(10);
    for (let i = 0; i < 10; i++) b[6 + i] = rnd[i];
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function randomBytes(n) {
    const out = [];
    let cryptoObj = null;
    try { cryptoObj = typeof crypto !== 'undefined' ? crypto : null; } catch (e) { cryptoObj = null; }
    if (cryptoObj && cryptoObj.getRandomValues) {
      const buf = new Uint8Array(n);
      cryptoObj.getRandomValues(buf);
      for (let i = 0; i < n; i++) out.push(buf[i]);
      return out;
    }
    for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256));
    return out;
  }

  function fnv(value) {
    let h = 2166136261;
    const s = String(value || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function hashKey(value) { return fnv(value).toString(16).padStart(8, '0'); }

  function isoOf(now) {
    const ms = Number.isFinite(now) ? now : Date.now();
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
  }

  function clamp01(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
  }

  function emailOf(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || s.length > 254) return '';
    return s;
  }

  function idOf(value) {
    const s = String(value || '').trim();
    if (!s || s.length > 128 || /@|\s|https?:/i.test(s)) return '';
    return s;
  }

  function nameOf(value) {
    const s = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 80 || /@|https?:/i.test(s)) return '';
    if (sensitive(s)) return '';
    return s;
  }

  function sensitive(value) {
    const s = String(value || '');
    if (!s) return '';
    for (let i = 0; i < BLOCK.length; i++) {
      if (BLOCK[i].re.test(s)) return BLOCK[i].id;
    }
    return '';
  }

  function sensitiveLocation(value) {
    const s = String(value || '');
    if (/\d/.test(s)) return 'precise_location';
    return sensitive(s);
  }

  function cityOf(raw) {
    const s = String(raw || '').trim();
    if (!s || s.length > 80) return '';
    if (sensitiveLocation(s)) return '';
    if (/\b(street|st\.|road|rd\.|ave|blvd|gps|lat|lng)\b/i.test(s)) return '';
    const first = s.split(',')[0].trim();
    if (!/^[A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF .'-]{1,39}$/.test(first)) return '';
    return first;
  }

  function holdoutBucket(id) { return fnv(String(id || '')) % 10; }
  function isHoldout(id) { return holdoutBucket(id) === 0; }

  function domainOf(email) { return (email.split('@')[1] || '').toLowerCase(); }

  function tombstoneKey(predicate, object, email) {
    return hashKey([predicate, String(object || '').toLowerCase(), String(email || '').toLowerCase()].join('|'));
  }

  function isTombstoned(state, predicate, object, email) {
    const key = tombstoneKey(predicate, object, email);
    return state.tombstones.some((row) => row.key_hash === key);
  }

  function addTombstone(state, predicate, object, email, now) {
    const key = tombstoneKey(predicate, object, email);
    if (state.tombstones.some((row) => row.key_hash === key)) return;
    state.tombstones.push({ id: uuid(now), key_hash: key, predicate: predicate, created_at: isoOf(now) });
  }

  function openFacts(state, subjectId, predicate) {
    return state.facts.filter((f) => f.subject_id === subjectId && f.predicate === predicate && !f.valid_to);
  }

  function putFact(state, draft, now) {
    if (!draft || CATEGORIES.indexOf(draft.consent_category) < 0) return { ok: false, reason: 'category' };
    if (state.consents[draft.consent_category] !== true) return { ok: false, reason: 'consent' };
    if (sensitive(draft.object)) return { ok: false, reason: 'sensitive' };
    const email = draft.email || '';
    if (isTombstoned(state, draft.predicate, draft.object, email)) return { ok: false, reason: 'tombstone' };
    const object = String(draft.object || '').slice(0, 80);
    if (!object) return { ok: false, reason: 'empty' };
    const current = openFacts(state, draft.subject_id, draft.predicate);
    const same = current.filter((f) => f.object === object)[0];
    const provenance = PROVENANCE.indexOf(draft.provenance) >= 0 ? draft.provenance : 'user_action';
    const status = draft.status === 'candidate' || provenance === 'third_party_content' ? 'candidate' : 'active';
    if (same) {
      const seen = {};
      same.evidence = same.evidence || [];
      same.evidence.forEach((e) => { if (e && e.message_or_event_id) seen[e.message_or_event_id] = 1; });
      (draft.evidence || []).forEach((e) => {
        if (!e || !e.message_or_event_id || seen[e.message_or_event_id] || same.evidence.length >= 8) return;
        same.evidence.push(evidenceOf(e));
        seen[e.message_or_event_id] = 1;
      });
      if (same.status === 'candidate' && status === 'active') {
        const atPromote = isoOf(now);
        same.valid_to = atPromote;
        same.retired_at = atPromote;
      } else {
        return { ok: true, fact: same, inserted: false };
      }
    }
    const at = isoOf(now);
    current.forEach((old) => { if (!old.valid_to) { old.valid_to = at; old.retired_at = at; } });
    const fact = {
      id: uuid(now + state.facts.length),
      subject_id: draft.subject_id,
      predicate: draft.predicate,
      object: object,
      source: draft.source === 'user_stated' || draft.source === 'inferred' ? draft.source : 'observed',
      confidence: clamp01(draft.confidence),
      evidence: (draft.evidence || []).slice(0, 8).map(evidenceOf).filter((e) => e.message_or_event_id),
      evidence_ids: Array.isArray(draft.evidence_ids) ? draft.evidence_ids.slice(0, 8) : [],
      valid_from: at,
      learned_at: at,
      consent_category: draft.consent_category,
      schema_ver: SCHEMA,
      provenance: provenance,
      status: status,
      memory_space: draft.memory_space || 'work',
      context_of_origin: draft.context_of_origin || 'mail',
      importance: clamp01(draft.importance == null ? draft.confidence : draft.importance)
    };
    state.facts.push(fact);
    return { ok: true, fact: fact, inserted: true };
  }

  function evidenceOf(e) {
    const row = {
      surface: e.surface === 'outlook' || e.surface === 'calendar' ? e.surface : 'gmail',
      message_or_event_id: idOf(e.message_or_event_id || e.messageId),
      ts: isoOf(Number.isFinite(e.ts) ? e.ts : Date.parse(e.ts))
    };
    if (Number.isInteger(e.span_start) && Number.isInteger(e.span_end) && e.span_end >= e.span_start && e.span_end - e.span_start <= 80) {
      row.span_start = e.span_start;
      row.span_end = e.span_end;
    }
    return row;
  }

  function decayed(fact, now) {
    if (!fact) return 0;
    if (fact.source === 'user_stated' && fact.confidence === 1) return 1;
    const half = HALF[fact.predicate] || 0;
    if (!half) return fact.confidence;
    const age = (now - Date.parse(fact.learned_at || fact.valid_from)) / 86400000;
    if (!Number.isFinite(age) || age <= 0) return fact.confidence;
    return clamp01(fact.confidence * Math.pow(0.5, age / half));
  }

  function entityByEmail(state, email) {
    return state.entities.filter((e) => e.email === email)[0] || null;
  }

  function ensureEntity(state, email, kind, now) {
    let row = entityByEmail(state, email);
    if (row) return row;
    if (isTombstoned(state, 'entity.email', email, email)) return null;
    row = {
      id: uuid(now + state.entities.length + 3),
      kind: kind === 'user' ? 'user' : 'person',
      email: email,
      sent: 0,
      received: 0,
      last_ms: 0,
      latency_to: [],
      latency_from: [],
      channels: {},
      langs: {}
    };
    state.entities.push(row);
    return row;
  }

  function addAlias(state, entity, alias, lang, now) {
    if (!entity || !alias) return;
    if (isTombstoned(state, 'person.alias', alias, entity.email)) return;
    const have = state.aliases.some((a) => a.subject_id === entity.id && a.alias.toLowerCase() === alias.toLowerCase());
    if (have) return;
    state.aliases.push({ id: uuid(now + state.aliases.length + 9), subject_id: entity.id, alias: alias, lang: lang || 'other' });
    const key = latinKey(alias);
    if (!key) return;
    state.entities.forEach((other) => {
      if (other.id === entity.id || other.email === entity.email) return;
      const hit = state.aliases.some((a) => a.subject_id === other.id && latinKey(a.alias) === key);
      if (!hit) return;
      const pair = [entity.id, other.id].sort().join('|');
      if (state.review.some((r) => r.left_id + '|' + r.right_id === pair || r.right_id + '|' + r.left_id === pair)) return;
      if (isTombstoned(state, 'review.pair', pair, '')) return;
      state.review.push({ id: uuid(now + 11), left_id: entity.id, right_id: other.id, reason: 'alias', status: 'pending' });
    });
  }

  const HE_MAP = {
    א: [''], ב: ['b'], ג: ['g'], ד: ['d'], ה: ['h'], ו: ['o', 'u'], ז: ['z'], ח: ['h', 'ch'],
    ט: ['t'], י: ['i', 'y'], כ: ['k'], ך: ['k'], ל: ['l'], מ: ['m'], ם: ['m'], נ: ['n'], ן: ['n'],
    ס: ['s'], ע: [''], פ: ['p', 'f'], ף: ['f'], צ: ['ts'], ץ: ['ts'], ק: ['k'], ר: ['r'], ש: ['sh'], ת: ['t']
  };

  function hebrewVariants(token) {
    let lists = [''];
    const chars = String(token || '').split('');
    for (let i = 0; i < chars.length; i++) {
      const opts = HE_MAP[chars[i]];
      if (!opts) return [];
      const next = [];
      lists.forEach((prefix) => {
        opts.forEach((opt) => { if (next.length < 32) next.push(prefix + opt); });
      });
      lists = next;
    }
    return lists.filter(Boolean);
  }

  function latinKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (/[\u0590-\u05FF]/.test(raw)) {
      const variants = hebrewVariants(raw.replace(/[^\u0590-\u05FF]/g, ''));
      const keys = variants.map(latinKey);
      return keys.sort()[0] || '';
    }
    const t = raw.replace(/[^a-z]/g, '').replace(/y/g, 'i').replace(/w/g, 'v');
    return t.replace(/[aeiou]/g, '');
  }

  function namesMatch(a, b) {
    if (!a || !b) return false;
    if (String(a).toLowerCase() === String(b).toLowerCase()) return true;
    const ka = latinKey(a);
    const kb = latinKey(b);
    return Boolean(ka && kb && ka === kb);
  }

  function langOfName(name, hint) {
    if (hint === 'he' || hint === 'en') return hint;
    if (/[\u0590-\u05FF]/.test(name || '')) return 'he';
    if (/[A-Za-z]/.test(name || '')) return 'en';
    return 'other';
  }

  function tieScore(entity, now) {
    const sent = entity.sent || 0;
    const received = entity.received || 0;
    const n = sent + received;
    if (!n) return 0;
    const ageDays = entity.last_ms ? Math.max(0, (now - entity.last_ms) / 86400000) : 30;
    const recency = Math.exp(-Math.LN2 * ageDays / RECENCY_HALF_DAYS);
    const frequency = Math.min(1, Math.log(1 + n) / Math.log(1 + FREQUENCY_CAP));
    const reciprocity = sent > 0 && received > 0 ? Math.min(sent, received) / Math.max(sent, received) : 0;
    return clamp01(WEIGHTS.recency * recency + WEIGHTS.frequency * frequency + WEIGHTS.reciprocity * reciprocity);
  }

  function latencyBucket(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    if (ms < 3600000) return 'lt_1h';
    if (ms < 86400000) return 'lt_1d';
    if (ms < 7 * 86400000) return 'lt_1w';
    return 'slower';
  }

  function median(list) {
    if (!list.length) return null;
    const s = list.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function modeKey(map) {
    let best = '';
    let n = 0;
    Object.keys(map || {}).forEach((k) => { if (map[k] > n) { best = k; n = map[k]; } });
    return best;
  }

  function pointer(header) {
    return { surface: header.surface, message_or_event_id: header.messageId || header.threadId || 'header', ts: header.ts };
  }

  function headerOf(input) {
    const src = input || {};
    const person = (p) => ({ email: emailOf(p && (p.email || p)), name: nameOf(p && (p.name || p.displayName || '')) });
    const list = (rows) => (Array.isArray(rows) ? rows : []).slice(0, 20).map(person).filter((p) => p.email);
    const own = emailOf(src.ownEmail);
    const from = person(src.from || {});
    return {
      surface: src.surface === 'outlook' ? 'outlook' : 'gmail',
      messageId: idOf(src.messageId),
      threadId: idOf(src.threadId),
      ts: Number.isFinite(src.ts) ? src.ts : Date.now(),
      from: from,
      to: list(src.to),
      cc: list(src.cc),
      isOwn: src.isOwn === true || (own && from.email === own),
      ownEmail: own,
      ownName: nameOf(src.ownName),
      contentLanguage: src.contentLanguage === 'he' || src.contentLanguage === 'en' ? src.contentLanguage : '',
      signatureRole: src.isOwn === true ? nameOf(src.signatureRole) : '',
      signatureOrg: src.isOwn === true ? nameOf(src.signatureOrg) : '',
      inReplyToMs: Number.isFinite(src.inReplyToMs) ? src.inReplyToMs : null,
      replyDirection: src.replyDirection === 'to_user' || src.replyDirection === 'from_user' ? src.replyDirection : ''
    };
  }

  function relationOf(userEmail, otherEmail) {
    const a = domainOf(userEmail);
    const b = domainOf(otherEmail);
    if (!a || !b || FREEMAIL.test(a) || FREEMAIL.test(b)) return 'external';
    if (a === b) return 'colleague';
    return 'client';
  }

  function bind(state) {
    function assistFor(category) {
      if (state.consents[category] !== true) return 'off';
      if (isHoldout(state.install_id)) return 'holdout';
      return 'on';
    }

    function modelAssistFor(intent) {
      const token = String(intent || '').toLowerCase();
      if (token === 'create_event' || token === 'event' || token === 'meeting' || token === 'hold') return assistFor('habits');
      if (token === 'draft_reply' || token === 'draft' || token === 'reply') return assistFor('people');
      return '';
    }

    function ingestHeader(input, now) {
      const header = headerOf(input);
      const at = Number.isFinite(now) ? now : header.ts;
      let written = 0;
      if (!header.ownEmail) return { written: 0, reason: 'no-user' };
      const user = state.consents.identity || state.consents.people || state.consents.work
        ? ensureEntity(state, header.ownEmail, 'user', at) : null;
      if (user && state.consents.identity && header.isOwn) {
        if (header.ownName) addAlias(state, user, header.ownName, langOfName(header.ownName), at);
        if (header.from.name) addAlias(state, user, header.from.name, langOfName(header.from.name, header.contentLanguage), at);
        [header.ownName, header.from.name].forEach((nm) => {
          if (!nm) return;
          const row = putFact(state, { subject_id: user.id, predicate: 'identity.name', object: nm, consent_category: 'identity', confidence: 0.8, evidence: [pointer(header)], email: user.email }, at);
          if (row.inserted) written += 1;
        });
        if (header.signatureRole) {
          const row = putFact(state, { subject_id: user.id, predicate: 'identity.role', object: header.signatureRole, consent_category: 'identity', confidence: 0.7, evidence: [pointer(header)], email: user.email }, at);
          if (row.inserted) written += 1;
        }
        if (header.signatureOrg) {
          const row = putFact(state, { subject_id: user.id, predicate: 'identity.org', object: header.signatureOrg, consent_category: 'identity', confidence: 0.7, evidence: [pointer(header)], email: user.email }, at);
          if (row.inserted) written += 1;
        }
      }
      if (user && state.consents.work && !FREEMAIL.test(domainOf(header.ownEmail))) {
        const row = putFact(state, { subject_id: user.id, predicate: 'work.org', object: domainOf(header.ownEmail), consent_category: 'work', confidence: 0.9, evidence: [pointer(header)], email: user.email }, at);
        if (row.inserted) written += 1;
      }
      const others = [];
      if (!header.isOwn && header.from.email && header.from.email !== header.ownEmail) others.push(header.from);
      header.to.concat(header.cc).forEach((p) => { if (p.email !== header.ownEmail) others.push(p); });
      if (state.consents.people !== true) return { written: written, header: 'dropped-body' };
      others.forEach((p) => {
        const person = ensureEntity(state, p.email, 'person', at);
        if (!person) return;
        if (header.isOwn) { person.sent += 1; } else if (header.from.email === p.email) { person.received += 1; }
        else person.received += 1;
        person.last_ms = at;
        person.channels[header.surface] = (person.channels[header.surface] || 0) + 1;
        const lang = langOfName(p.name, header.contentLanguage);
        person.langs[lang] = (person.langs[lang] || 0) + 1;
        if (p.name) addAlias(state, person, p.name, lang, at);
        if (header.inReplyToMs != null && header.ts > header.inReplyToMs) {
          const delta = header.ts - header.inReplyToMs;
          const bucketList = header.replyDirection === 'from_user' || header.isOwn ? person.latency_from : person.latency_to;
          bucketList.push(delta);
          if (bucketList.length > 20) bucketList.shift();
        }
        const evidence = [pointer(header)];
        const tie = tieScore(person, at);
        const channel = modeKey(person.channels) || header.surface;
        const language = modeKey(person.langs) || 'other';
        const rel = relationOf(header.ownEmail, p.email);
        const toBucket = latencyBucket(median(person.latency_to));
        const fromBucket = latencyBucket(median(person.latency_from));
        const rows = [
          ['person.tie_strength', tie.toFixed(2), tie],
          ['person.channel', channel, 0.7],
          ['person.language', language, 0.7],
          ['person.relation', rel, 0.75]
        ];
        if (toBucket) rows.push(['person.reply_latency_to', toBucket, 0.6]);
        if (fromBucket) rows.push(['person.reply_latency_from', fromBucket, 0.6]);
        rows.forEach((spec) => {
          if (THIRD_PARTY_PREDICATES.indexOf(spec[0]) < 0) return;
          if (header.isOwn) person.corroborated = true;
          const saved = putFact(state, {
            subject_id: person.id, predicate: spec[0], object: spec[1], consent_category: 'people',
            confidence: spec[2], evidence: evidence, email: person.email,
            provenance: header.isOwn || person.corroborated ? 'user_sent' : 'third_party_content',
            status: header.isOwn || person.corroborated ? 'active' : 'candidate',
            memory_space: header.space || 'work',
            context_of_origin: header.surface
          }, at);
          if (saved.inserted) written += 1;
        });
      });
      return { written: written };
    }

    function reduceCalendarItems(items) {
      return (Array.isArray(items) ? items : []).slice(0, 100).map((ev) => {
        if (!ev) return null;
        const start = (ev.start && (ev.start.dateTime || ev.start.date)) || (typeof ev.start === 'string' ? ev.start : '');
        const end = (ev.end && (ev.end.dateTime || ev.end.date)) || (typeof ev.end === 'string' ? ev.end : '');
        if (!start) return null;
        const city = cityOf(ev.city || ev.location || '');
        const row = { start: String(start), end: end ? String(end) : '', tool: toolOf(ev) };
        if (city) row.city = city;
        return row;
      }).filter(Boolean);
    }

    function toolOf(ev) {
      if (ev && (ev.tool === 'meet' || ev.tool === 'teams' || ev.tool === 'zoom' || ev.tool === 'other')) return ev.tool;
      const link = String((ev && (ev.hangoutLink || '')) || '');
      const conf = JSON.stringify((ev && ev.conferenceData) || '');
      const blob = link + ' ' + conf;
      if (/meet\.google/i.test(blob)) return 'meet';
      if (/teams\.microsoft|teams\.live/i.test(blob)) return 'teams';
      if (/zoom\.us/i.test(blob)) return 'zoom';
      return 'other';
    }

    function ingestCalendar(events, now) {
      const at = Number.isFinite(now) ? now : Date.now();
      const rows = Array.isArray(events) && events[0] && events[0].start && events[0].start.dateTime
        ? reduceCalendarItems(events) : (events || []);
      if (state.consents.habits !== true && state.consents.places !== true) return { written: 0, reason: 'consent' };
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (!user) return { written: 0, reason: 'no-user' };
      const hours = {};
      const durations = [];
      const tools = {};
      const hoursBand = [];
      const cities = {};
      rows.forEach((ev) => {
        const startMs = Date.parse(ev.start);
        const endMs = Date.parse(ev.end || ev.start);
        if (!Number.isFinite(startMs)) return;
        const d = new Date(startMs);
        const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()];
        const bucket = hourBucket(d.getUTCHours());
        const key = weekday + ':' + bucket;
        hours[key] = (hours[key] || 0) + 1;
        if (Number.isFinite(endMs) && endMs > startMs) durations.push((endMs - startMs) / 60000);
        const tool = ev.tool || 'other';
        tools[tool] = (tools[tool] || 0) + 1;
        hoursBand.push(d.getUTCHours());
        if (Number.isFinite(endMs)) hoursBand.push(new Date(endMs).getUTCHours());
        const city = cityOf(ev.city || '');
        if (city) cities[city] = (cities[city] || 0) + 1;
      });
      let written = 0;
      const evidence = [{ surface: 'calendar', message_or_event_id: 'calendar', ts: at }];
      if (state.consents.habits === true) {
        const total = Object.keys(hours).reduce((s, k) => s + hours[k], 0) || 1;
        Object.keys(hours).forEach((key) => {
          const saved = putFact(state, {
            subject_id: user.id, predicate: 'habit.meeting_hour', object: key, consent_category: 'habits',
            confidence: clamp01(hours[key] / total), evidence: evidence, email: user.email
          }, at);
          if (saved.inserted) written += 1;
        });
        const med = median(durations);
        if (med) {
          const rounded = [15, 30, 45, 60, 90, 120].reduce((best, n) => Math.abs(n - med) < Math.abs(best - med) ? n : best, 30);
          const saved = putFact(state, {
            subject_id: user.id, predicate: 'habit.duration', object: String(rounded), consent_category: 'habits',
            confidence: 0.7, evidence: evidence, email: user.email
          }, at);
          if (saved.inserted) written += 1;
        }
        const tool = modeKey(tools);
        if (tool) {
          const saved = putFact(state, {
            subject_id: user.id, predicate: 'habit.tool', object: tool, consent_category: 'habits',
            confidence: 0.7, evidence: evidence, email: user.email
          }, at);
          if (saved.inserted) written += 1;
        }
        if (hoursBand.length) {
          const lo = Math.min.apply(null, hoursBand);
          const hi = Math.max.apply(null, hoursBand);
          const band = 'h' + String(lo).padStart(2, '0') + '-h' + String(hi).padStart(2, '0');
          const saved = putFact(state, {
            subject_id: user.id, predicate: 'habit.working_hours', object: band, consent_category: 'habits',
            confidence: 0.6, evidence: evidence, email: user.email
          }, at);
          if (saved.inserted) written += 1;
        }
      }
      if (state.consents.places === true) {
        Object.keys(cities).forEach((city) => {
          const saved = putFact(state, {
            subject_id: user.id, predicate: 'place.city', object: city, consent_category: 'places',
            confidence: 0.6, source: 'observed', evidence: evidence, email: user.email
          }, at);
          if (saved.inserted) written += 1;
        });
      }
      return { written: written };
    }

    function hourBucket(hour) {
      if (hour < 8 || hour >= 22) return 'other';
      const base = hour - (hour % 2);
      return 'h' + String(base).padStart(2, '0');
    }

    function setPlace(city, now) {
      const clean = cityOf(city);
      if (!clean) return { ok: false, reason: sensitive(city) || 'not-city' };
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (!user) return { ok: false, reason: 'no-user' };
      return putFact(state, {
        subject_id: user.id, predicate: 'place.city', object: clean, consent_category: 'places',
        confidence: 1, source: 'user_stated', evidence: [], email: user.email
      }, now || Date.now());
    }

    function resolvePerson(query, now) {
      const at = Number.isFinite(now) ? now : Date.now();
      const assist = assistFor('people');
      if (assist !== 'on') return { applied: false, model_assist: assist, status: 'none', candidates: [], chosen: null };
      const q = nameOf(query) || String(query || '').trim().slice(0, 80);
      if (!q || sensitive(q)) return { applied: false, model_assist: 'on', status: 'none', candidates: [], chosen: null };
      const scored = [];
      state.entities.forEach((entity) => {
        if (entity.kind === 'user') return;
        const names = state.aliases.filter((a) => a.subject_id === entity.id).map((a) => a.alias);
        if (emailOf(q) && emailOf(q) === entity.email) names.push(entity.email);
        const matched = names.some((nm) => namesMatch(q, nm)) || namesMatch(q, entity.email.split('@')[0]);
        if (!matched) return;
        if (!entity.corroborated) {
          const active = openFacts(state, entity.id, 'person.tie_strength').filter((f) => f.status !== 'candidate');
          if (!active.length) return;
        }
        const tieFact = openFacts(state, entity.id, 'person.tie_strength').filter((f) => f.status !== 'candidate')[0];
        const tie = tieFact ? Number(tieFact.object) : tieScore(entity, at);
        const confidence = clamp01(0.55 + 0.45 * (Number.isFinite(tie) ? tie : 0));
        scored.push({
          subjectId: entity.id,
          display: names[0] || '',
          address: entity.email,
          confidence: confidence
        });
      });
      scored.sort((a, b) => b.confidence - a.confidence);
      const top = scored[0];
      const second = scored[1];
      let status = 'none';
      if (top && (!second || top.confidence - second.confidence >= 0.15) && top.confidence >= 0.72) status = 'one';
      else if (top) status = 'ask';
      return {
        applied: status !== 'none',
        model_assist: 'on',
        status: status,
        candidates: scored.slice(0, 5),
        chosen: status === 'one' ? top : null
      };
    }

    function suggestSlots(durationHint, now) {
      const assist = assistFor('habits');
      if (assist !== 'on') return { applied: false, model_assist: assist, status: 'none', candidates: [], chosen: null };
      const hint = Number(durationHint);
      const duration = openFacts(state, (state.entities.filter((e) => e.kind === 'user')[0] || {}).id, 'habit.duration')[0];
      if (Number.isFinite(hint) && duration && Math.abs(Number(duration.object) - hint) > 45) {
        return { applied: true, model_assist: 'on', status: 'ask', candidates: [], chosen: null };
      }
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      const rows = user ? openFacts(state, user.id, 'habit.meeting_hour') : [];
      const candidates = rows.map((f) => {
        const parts = String(f.object).split(':');
        return { weekday: parts[0] || '', hour: parts[1] || '', confidence: decayed(f, now || Date.now()) };
      }).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
      const top = candidates[0];
      const second = candidates[1];
      let status = 'none';
      if (top && (!second || top.confidence - second.confidence >= 0.1) && top.confidence >= 0.34) status = 'one';
      else if (top) status = 'ask';
      return {
        applied: status !== 'none',
        model_assist: 'on',
        status: status,
        candidates: candidates,
        chosen: status === 'one' ? top : null
      };
    }

    function closureAssist(input, now) {
      const i = input || {};
      const intent = i.intent === 'create_event' ? 'create_event' : 'draft_reply';
      if (intent === 'create_event') return suggestSlots(i.durationHint, now);
      return resolvePerson(i.name || i.person || '', now);
    }

    function gateHold(result, input) {
      if (!result || result.move !== 'hold') return result;
      const assist = closureAssist(Object.assign({ intent: 'create_event' }, input || {}));
      if (!assist || !assist.applied) return result;
      if (assist.status === 'ask') return { move: 'silent', reason: 'personal-model-ask', personalModel: { status: 'ask', model_assist: 'on' } };
      return result;
    }

    function setConsent(category, enabled, opts, now) {
      if (CATEGORIES.indexOf(category) < 0) return { ok: false, reason: 'category' };
      const at = now || Date.now();
      if (enabled === true && !(opts && opts.disclosure === true)) return { ok: false, reason: 'disclosure' };
      state.consents[category] = enabled === true;
      return { ok: true, category: category, enabled: state.consents[category], at: isoOf(at) };
    }

    function confirmFact(id, now) {
      const fact = state.facts.filter((f) => f.id === id)[0];
      if (!fact || fact.valid_to) return { ok: false, reason: 'missing' };
      const at = isoOf(now || Date.now());
      fact.valid_to = at;
      fact.retired_at = at;
      const next = {
        id: uuid(now || Date.now()),
        subject_id: fact.subject_id,
        predicate: fact.predicate,
        object: fact.object,
        source: 'user_stated',
        confidence: 1,
        evidence: (fact.evidence || []).slice(),
        valid_from: at,
        learned_at: at,
        consent_category: fact.consent_category,
        schema_ver: SCHEMA,
        provenance: 'user_said',
        status: 'active',
        memory_space: fact.memory_space || 'work',
        context_of_origin: 'user',
        importance: 1
      };
      state.facts.push(next);
      const entity = state.entities.filter((e) => e.id === fact.subject_id)[0];
      if (entity) entity.corroborated = true;
      return { ok: true, fact: next };
    }

    function editFact(id, object, now) {
      const clean = nameOf(object) || String(object || '').trim().slice(0, 80);
      if (!clean || sensitive(clean)) return { ok: false, reason: 'sensitive' };
      const fact = state.facts.filter((f) => f.id === id)[0];
      if (!fact || fact.valid_to) return { ok: false, reason: 'missing' };
      const at = isoOf(now || Date.now());
      fact.valid_to = at;
      fact.retired_at = at;
      const next = {
        id: uuid((now || Date.now()) + 1),
        subject_id: fact.subject_id,
        predicate: fact.predicate,
        object: clean,
        source: 'user_stated',
        confidence: 1,
        evidence: (fact.evidence || []).slice(),
        valid_from: at,
        learned_at: at,
        consent_category: fact.consent_category,
        schema_ver: SCHEMA,
        provenance: 'user_said',
        status: 'active',
        memory_space: fact.memory_space || 'work',
        context_of_origin: 'user',
        importance: 1
      };
      state.facts.push(next);
      return { ok: true, fact: next };
    }

    function forgetFact(id, now) {
      const fact = state.facts.filter((f) => f.id === id)[0];
      if (!fact) return { ok: false, reason: 'missing' };
      const entity = state.entities.filter((e) => e.id === fact.subject_id)[0];
      addTombstone(state, fact.predicate, fact.object, entity ? entity.email : '', now || Date.now());
      state.facts = state.facts.filter((f) => f.id !== id && !(f.subject_id === fact.subject_id && f.predicate === fact.predicate && f.object === fact.object));
      return { ok: true };
    }

    function never(predicate, object, email, now) {
      addTombstone(state, predicate, object, email || '', now || Date.now());
      state.facts = state.facts.filter((f) => !(f.predicate === predicate && f.object === object));
      return { ok: true };
    }

    function forgetAll(now) {
      const at = now || Date.now();
      state.entities.forEach((e) => addTombstone(state, 'entity.email', e.email, e.email, at));
      state.facts.forEach((f) => {
        const entity = state.entities.filter((e) => e.id === f.subject_id)[0];
        addTombstone(state, f.predicate, f.object, entity ? entity.email : '', at);
      });
      state.aliases.forEach((a) => {
        const entity = state.entities.filter((e) => e.id === a.subject_id)[0];
        addTombstone(state, 'person.alias', a.alias, entity ? entity.email : '', at);
      });
      state.entities = [];
      state.aliases = [];
      state.facts = [];
      state.exemplars = [];
      state.style_rules = [];
      state.review = [];
      state.wiped_at = at;
      return { ok: true };
    }

    function minimized(email) {
      const entity = entityByEmail(state, emailOf(email));
      if (!entity || entity.kind === 'user') return null;
      const facts = state.facts.filter((f) => f.subject_id === entity.id && !f.valid_to && THIRD_PARTY_PREDICATES.indexOf(f.predicate) >= 0);
      return {
        address: entity.email,
        aliases: state.aliases.filter((a) => a.subject_id === entity.id).map((a) => a.alias),
        facts: facts.map((f) => ({ predicate: f.predicate, object: f.object }))
      };
    }

    function scrub(text) {
      return String(text || '')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
        .replace(/\+?\d[\d\s().-]{7,}\d/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, EXEMPLAR_MAX);
    }

    function audienceOf(input, email) {
      if (input && input.audience === 'family' && input.audienceSource === 'user_stated') return 'family';
      if (input && (input.audience === 'client' || input.audience === 'colleague' || input.audience === 'unknown')) {
        if (input.audience !== 'family') return input.audience;
      }
      const rel = openFacts(state, (entityByEmail(state, email) || {}).id, 'person.relation')[0];
      if (rel && rel.object === 'colleague') return 'colleague';
      if (rel && rel.object === 'client') return 'client';
      return 'unknown';
    }

    function featuresOf(text) {
      const raw = String(text || '');
      const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
      const first = lines[0] || '';
      const last = lines[lines.length - 1] || '';
      const he = (raw.match(/[\u0590-\u05FF]/g) || []).length;
      const la = (raw.match(/[A-Za-z]/g) || []).length;
      let lang = 'en';
      if (he && la) lang = 'mixed';
      else if (he) lang = 'he';
      let greeting = 'none';
      if (/^היי\b/.test(first)) greeting = 'hi-name';
      else if (/^שלום\b/.test(first)) greeting = 'shalom-name';
      else if (/^(hi|hey)\b/i.test(first)) greeting = 'hi-name';
      else if (/^hello\b/i.test(first)) greeting = 'hello-name';
      else if (/^dear\b/i.test(first)) greeting = 'dear-name';
      let signoff = 'none';
      if (/בברכה|בכבוד/.test(last)) signoff = 'brakha';
      else if (/תודה/.test(last)) signoff = 'toda';
      else if (/^thanks\b/i.test(last)) signoff = 'thanks';
      else if (/^best\b/i.test(last)) signoff = 'best';
      else if (/^regards\b/i.test(last)) signoff = 'regards';
      const words = (raw.match(/\S+/g) || []).length;
      const length = words < 40 ? 'short' : words < 120 ? 'medium' : 'long';
      let formality = 'neutral';
      if (/^dear\b/i.test(first) || /בכבוד|regards/i.test(last)) formality = 'formal';
      else if (/^(hi|hey|היי)\b/i.test(first)) formality = 'casual';
      let emoji = 0;
      for (let i = 0; i < raw.length;) {
        const cp = raw.codePointAt(i);
        if (cp > 0x1F000) emoji += 1;
        i += cp > 0xFFFF ? 2 : 1;
      }
      const emojiRate = words ? Math.round(Math.min(1, emoji / words) * 20) / 20 : 0;
      return { lang: lang, greeting: greeting, signoff: signoff, length: length, formality: formality, emojiRate: emojiRate, mixing: lang === 'mixed' };
    }

    function vectorOf(text) {
      const f = featuresOf(text);
      const words = (String(text || '').match(/\S+/g) || []).length;
      return [
        Math.min(1, words / 200),
        f.formality === 'formal' ? 1 : f.formality === 'casual' ? 0 : 0.5,
        f.emojiRate,
        f.mixing ? 1 : 0,
        f.lang === 'he' ? 1 : f.lang === 'mixed' ? 0.5 : 0,
        f.greeting === 'none' ? 0 : 1,
        f.signoff === 'none' ? 0 : 1,
        /\b!/.test(text || '') ? 1 : 0
      ].map((n) => Math.round(n * 20) / 20);
    }

    function ingestOwnSent(input, now) {
      const src = input || {};
      if (src.isOwn !== true) return { written: 0, reason: 'not-own' };
      if (state.consents.style !== true) return { written: 0, reason: 'consent' };
      if (sensitive(src.text)) return { written: 0, reason: 'sensitive' };
      const at = now || Date.now();
      const user = state.entities.filter((e) => e.kind === 'user')[0] || ensureEntity(state, emailOf(src.ownEmail) || 'me@example.com', 'user', at);
      if (!user) return { written: 0, reason: 'no-user' };
      const feat = featuresOf(src.text || '');
      const audience = audienceOf(src, emailOf(src.recipient));
      const snippet = scrub(src.text);
      if (!snippet) return { written: 0, reason: 'empty' };
      const evidence = [{ surface: src.surface === 'outlook' ? 'outlook' : 'gmail', message_or_event_id: idOf(src.messageId) || 'sent', ts: at }];
      let written = 0;
      const specs = [
        ['style.greeting', audience + '|' + feat.lang + '|' + feat.greeting],
        ['style.signoff', audience + '|' + feat.lang + '|' + feat.signoff],
        ['style.length', audience + '|' + feat.lang + '|' + feat.length],
        ['style.formality', audience + '|' + feat.lang + '|' + feat.formality],
        ['style.emoji', audience + '|' + feat.lang + '|' + String(feat.emojiRate)],
        ['style.mixing', audience + '|' + feat.lang + '|' + (feat.mixing ? 'yes' : 'no')],
        ['style.vector', vectorOf(src.text).join(',')]
      ];
      specs.forEach((spec) => {
        const saved = putFact(state, {
          subject_id: user.id, predicate: spec[0], object: spec[1], consent_category: 'style',
          confidence: 0.7, evidence: evidence, email: user.email
        }, at);
        if (saved.inserted) written += 1;
      });
      state.exemplars.push({
        id: uuid(at + state.exemplars.length),
        audience: audience,
        lang: feat.lang,
        snippet: snippet,
        greeting: feat.greeting,
        signoff: feat.signoff,
        created_at: isoOf(at)
      });
      state.exemplars = state.exemplars.slice(-EXEMPLAR_CAP);
      return { written: written, exemplars: state.exemplars.length };
    }

    function setStyleRule(rule, now) {
      if (state.consents.style !== true) return { ok: false, reason: 'consent' };
      const audience = ['client', 'colleague', 'family', 'unknown'].indexOf(rule && rule.audience) >= 0 ? rule.audience : '';
      const lang = rule && (rule.lang === 'he' || rule.lang === 'en' || rule.lang === 'mixed') ? rule.lang : '';
      if (!audience || !lang) return { ok: false, reason: 'shape' };
      if (audience === 'family' && !(rule && rule.audienceSource === 'user_stated')) return { ok: false, reason: 'family' };
      const row = {
        id: uuid(now || Date.now()),
        audience: audience,
        lang: lang,
        greeting: nameOf(rule.greeting) || 'hi-name',
        signoff: nameOf(rule.signoff) || 'thanks',
        formality: rule.formality === 'formal' || rule.formality === 'casual' ? rule.formality : 'neutral'
      };
      state.style_rules = state.style_rules.filter((r) => !(r.audience === audience && r.lang === lang));
      state.style_rules.push(row);
      return { ok: true, rule: row };
    }

    function topExemplars(audience, lang) {
      return state.exemplars.filter((ex) => ex.audience === audience && (ex.lang === lang || lang === 'mixed')).slice(-3);
    }

    function conditionDraft(text, ctx) {
      const assist = assistFor('style');
      const thread = ctx && idOf(ctx.thread);
      if (thread && state.silentThreads[thread]) {
        return { applied: false, model_assist: assist, status: 'none', text: text, exemplarIds: [], reason: 'without-memory' };
      }
      if (assist !== 'on') return { applied: false, model_assist: assist, status: 'none', text: text, exemplarIds: [] };
      const lang = ctx && ctx.lang === 'he' ? 'he' : 'en';
      const audience = audienceOf(ctx || {}, emailOf(ctx && ctx.recipient));
      const exemplars = topExemplars(audience, lang);
      const rule = state.style_rules.filter((r) => r.audience === audience && r.lang === lang)[0];
      if (!rule) {
        const greetings = openFacts(state, (state.entities.filter((e) => e.kind === 'user')[0] || {}).id, 'style.greeting')
          .filter((f) => String(f.object).indexOf(audience + '|' + lang + '|') === 0);
        if (greetings.length !== 1) {
          return { applied: greetings.length > 1, model_assist: 'on', status: greetings.length > 1 ? 'ask' : 'none', text: text, exemplarIds: exemplars.map((e) => e.id) };
        }
      }
      const greeting = rule ? rule.greeting : 'hi-name';
      const signoff = rule ? rule.signoff : 'thanks';
      const line = lang === 'he' ? (greeting.indexOf('shalom') === 0 ? 'שלום,' : 'היי,') : (greeting === 'dear-name' ? 'Hello,' : 'Hi,');
      const end = lang === 'he' ? (signoff === 'brakha' ? 'בברכה,' : 'תודה,') : (signoff === 'best' ? 'Best,' : signoff === 'regards' ? 'Regards,' : 'Thanks,');
      const lines = String(text || '').split('\n');
      if (lines.length && /^(hi|hey|hello|dear|היי|שלום)\b/i.test(lines[0])) lines[0] = line;
      else lines.unshift(line);
      if (!lines.some((l) => l === end)) lines.push(end);
      return { applied: true, model_assist: 'on', status: 'one', text: lines.join('\n'), exemplarIds: exemplars.map((e) => e.id), chosen: null };
    }

    function styleDistance(draft, sent) {
      const a = String(draft || '').slice(0, 400);
      const b = String(sent || '').slice(0, 400);
      const d = levenshtein(a, b);
      const denom = Math.max(a.length, b.length, 1);
      return { style_edit_q: Math.round((d / denom) * 20) / 20 };
    }

    function styleVector(text, lmVector) {
      const det = vectorOf(text);
      if (Array.isArray(lmVector) && lmVector.length === 8 && lmVector.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) {
        return { source: 'on_device', vector: lmVector.map((n) => Math.round(n * 20) / 20) };
      }
      return { source: 'deterministic', vector: det };
    }

    function extractFacts(text, opts, now) {
      const at = now || Date.now();
      if (state.consents.work !== true) return { written: 0, reason: 'consent', facts: [] };
      if (sensitive(text)) return { written: 0, reason: 'sensitive', facts: [] };
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (!user) return { written: 0, reason: 'no-user', facts: [] };
      const found = deterministicFacts(String(text || ''));
      const o = opts || {};
      const modelOk = typeof o.askModel === 'function' && o.allowModel === true && (o.onDevice === true || (o.zeroRetention === true && o.perRequest === true));
      if (modelOk) {
        try {
          const raw = o.askModel(String(text || '').slice(0, 2000));
          parseModelFacts(String(text || ''), raw).forEach((row) => found.push(row));
        } catch (e) { /* a model miss writes nothing extra */ }
      }
      let written = 0;
      const kept = [];
      found.forEach((row) => {
        if (WORK_PREDICATES.indexOf(row.predicate) < 0) return;
        if (sensitive(row.object)) return;
        const saved = putFact(state, {
          subject_id: user.id,
          predicate: row.predicate,
          object: row.object,
          consent_category: 'work',
          confidence: row.confidence || 0.6,
          source: row.source || 'observed',
          evidence: [{ surface: 'gmail', message_or_event_id: idOf(o.messageId) || 'span', ts: at, span_start: row.span_start, span_end: row.span_end }],
          email: user.email
        }, at);
        if (saved.ok) { written += saved.inserted ? 1 : 0; kept.push(saved.fact); }
      });
      return { written: written, facts: kept };
    }

    function deterministicFacts(text) {
      const rules = [
        { predicate: 'work.works_on', re: /\bproject\s+([A-Za-z][\w .-]{1,40})/i },
        { predicate: 'work.works_on', re: /פרויקט\s+([^\n,.]{1,40})/ },
        { predicate: 'work.client_of', re: /\bclient\s+([A-Za-z][\w .-]{1,40})/i },
        { predicate: 'work.client_of', re: /לקוח\s+([^\n,.]{1,40})/ },
        { predicate: 'work.commitment', re: /\bby\s+([A-Z][a-z]+ \d{1,2})/ },
        { predicate: 'work.commitment', re: /עד\s+(\d{1,2}\/\d{1,2})/ }
      ];
      const out = [];
      rules.forEach((rule) => {
        const m = rule.re.exec(text);
        if (!m || m.index == null) return;
        const object = String(m[1] || '').trim().slice(0, 80);
        if (!object || sensitive(object) || /@|\d{8,}/.test(object)) return;
        const start = m.index + m[0].indexOf(m[1]);
        out.push({ predicate: rule.predicate, object: object, span_start: start, span_end: start + m[1].length, confidence: 0.66, source: 'observed' });
      });
      return out;
    }

    function parseModelFacts(text, raw) {
      let data = raw;
      if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch (e) { return []; }
      }
      const list = Array.isArray(data) ? data : (data && data.facts) || [];
      const out = [];
      list.slice(0, 8).forEach((row) => {
        if (!row) return;
        const start = Number(row.span_start);
        const end = Number(row.span_end);
        if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start || end - start > 80) return;
        const slice = text.slice(start, end).trim();
        const object = String(row.object || '').trim();
        if (!slice || slice !== object) return;
        if (WORK_PREDICATES.indexOf(row.predicate) < 0) return;
        out.push({ predicate: row.predicate, object: object, span_start: start, span_end: end, confidence: 0.7, source: 'inferred' });
      });
      return out;
    }

    function reviewMerge(id, accept, now) {
      const row = state.review.filter((r) => r.id === id && r.status === 'pending')[0];
      if (!row) return { ok: false, reason: 'missing' };
      const at = now || Date.now();
      if (accept !== true) {
        row.status = 'denied';
        addTombstone(state, 'review.pair', [row.left_id, row.right_id].sort().join('|'), '', at);
        return { ok: true, status: 'denied' };
      }
      state.aliases.forEach((a) => { if (a.subject_id === row.right_id) a.subject_id = row.left_id; });
      const moving = state.facts.filter((f) => f.subject_id === row.right_id && !f.valid_to);
      moving.forEach((f) => {
        f.valid_to = isoOf(at);
        f.retired_at = isoOf(at);
        const copy = Object.assign({}, f);
        copy.id = uuid(at + state.facts.length);
        copy.subject_id = row.left_id;
        copy.valid_from = isoOf(at);
        copy.learned_at = isoOf(at);
        delete copy.valid_to;
        delete copy.retired_at;
        state.facts.push(copy);
      });
      state.entities = state.entities.filter((e) => e.id !== row.right_id);
      row.status = 'merged';
      return { ok: true, status: 'merged' };
    }

    function coreProfile() {
      const lines = [];
      state.facts.forEach((f) => {
        if (f.valid_to) return;
        const strong = (f.source === 'user_stated' && f.confidence === 1) || f.confidence >= 0.85;
        if (!strong) return;
        if (f.predicate.indexOf('person.') === 0) return;
        if (String(f.object).indexOf('@') >= 0) return;
        lines.push(f.predicate + ': ' + f.object);
      });
      const kept = lines.slice(0, 12);
      return { lines: kept, text: kept.join('\n').slice(0, 800) };
    }

    function contextOf(ctx) {
      const c = ctx || {};
      const hour = Number.isFinite(c.hour) ? c.hour : 12;
      return [
        1,
        c.intent === 'create_event' ? 1 : 0,
        c.intent === 'draft_reply' ? 1 : 0,
        hour < 12 ? 1 : 0,
        c.surface === 'gmail' ? 1 : 0,
        c.mode === 'action' ? 0 : 1
      ];
    }

    function banditChoose(ctx) {
      if (!state.bandit.enabled) return { applied: false, mode: 'off', threshold: null };
      if (ctx && ctx.mode === 'action') return { applied: false, mode: 'blocked', threshold: GUARD, reason: 'action-not-explored' };
      const x = contextOf(ctx);
      let best = null;
      let bestScore = -Infinity;
      Object.keys(state.bandit.arms).forEach((id) => {
        const arm = state.bandit.arms[id];
        if (arm.threshold < GUARD) return;
        const score = ucb(arm.A, arm.b, x, state.bandit.alpha);
        if (score > bestScore) { bestScore = score; best = arm; }
      });
      if (!best) return { applied: false, mode: 'blocked', threshold: GUARD, reason: 'guard' };
      return { applied: true, mode: 'passive', threshold: best.threshold, arm: best.id, model_assist: assistFor('habits') === 'holdout' ? 'holdout' : 'on' };
    }

    function banditObserve(armId, reward, ctx) {
      if (!state.bandit.enabled) return { applied: false, mode: 'off' };
      if (ctx && ctx.mode === 'action') return { applied: false, mode: 'blocked' };
      const arm = state.bandit.arms[armId];
      if (!arm || arm.threshold < GUARD) return { applied: false, reason: 'guard' };
      const x = contextOf(ctx);
      const y = reward === 1 ? 1 : 0;
      for (let i = 0; i < DIM; i++) {
        for (let j = 0; j < DIM; j++) arm.A[i][j] += x[i] * x[j];
        arm.b[i] += y * x[i];
      }
      arm.pulls += 1;
      arm.reward += y;
      return { applied: true, mode: 'passive' };
    }

    function setBanditEnabled(on) {
      state.bandit.enabled = on === true;
      return { enabled: state.bandit.enabled };
    }

    function liftReport(events) {
      const groups = { on: blankLift(), holdout: blankLift(), off: blankLift() };
      (events || []).forEach((ev) => {
        const key = ev && ev.data && ev.data.model_assist;
        if (!groups[key]) return;
        const type = String(ev.type || '');
        if (type.indexOf('.closed.') >= 0) groups[key].closed += 1;
        else if (type.indexOf('.undone.') >= 0) groups[key].undone += 1;
        else if (type.indexOf('.missed.') >= 0) groups[key].missed += 1;
        else if (type.indexOf('.failed.') >= 0) groups[key].failed += 1;
        else if (type.indexOf('.decision.') >= 0) groups[key].decisions += 1;
      });
      Object.keys(groups).forEach((key) => {
        const s = groups[key];
        const denom = s.closed + s.undone + s.failed;
        s.precision = denom ? Math.round((s.closed / denom) * 1000) / 1000 : null;
        s.undo_rate = (s.closed + s.undone) ? Math.round((s.undone / (s.closed + s.undone)) * 1000) / 1000 : null;
        s.miss_rate = s.decisions ? Math.round((s.missed / s.decisions) * 1000) / 1000 : null;
      });
      return groups;
    }

    function confirmedFrom(source) {
      const facts = (source && source.facts) || state.facts;
      return facts.filter((f) => f && !f.valid_to && f.source === 'user_stated' && f.confidence === 1 && String(f.object).indexOf('@') < 0).map((f) => ({
        predicate: f.predicate,
        object: f.object,
        consent_category: f.consent_category,
        confidence: 1
      }));
    }

    function view(now) {
      const at = now || Date.now();
      return {
        consents: Object.assign({}, state.consents),
        banditEnabled: state.bandit.enabled === true,
        categories: CATEGORIES.map((cat) => ({
          id: cat,
          enabled: state.consents[cat] === true,
          facts: state.facts.filter((f) => !f.valid_to && f.consent_category === cat).map((f) => card(f, at))
        })),
        review: state.review.filter((r) => r.status === 'pending').map((r) => ({ id: r.id, left_id: r.left_id, right_id: r.right_id, reason: r.reason }))
      };
    }

    function card(f, now) {
      const ev = f.evidence || [];
      const times = ev.map((e) => Date.parse(e.ts)).filter((n) => Number.isFinite(n));
      return {
        id: f.id,
        predicate: f.predicate,
        object: f.object,
        source: f.source,
        confidence: decayed(f, now),
        confirmed: f.source === 'user_stated' && f.confidence === 1,
        evidenceCount: ev.length,
        from: times.length ? new Date(Math.min.apply(null, times)).toISOString().slice(0, 10) : '',
        to: times.length ? new Date(Math.max.apply(null, times)).toISOString().slice(0, 10) : '',
        surface: ev[0] ? ev[0].surface : '',
        messageId: ev[0] ? ev[0].message_or_event_id : ''
      };
    }

    function learnText(text, meta, now) {
      const provenance = meta && PROVENANCE.indexOf(meta.provenance) >= 0 ? meta.provenance : 'third_party_content';
      if (sensitive(text)) return { written: 0, used: false, reason: 'sensitive' };
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (!user) return { written: 0, used: false, reason: 'no-user' };
      const object = String(text || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!object) return { written: 0, used: false, reason: 'empty' };
      const saved = putFact(state, {
        subject_id: user.id,
        predicate: 'style.greeting',
        object: object,
        consent_category: 'style',
        confidence: 0.4,
        provenance: provenance,
        status: provenance === 'third_party_content' ? 'candidate' : 'active',
        evidence: [{ surface: 'gmail', message_or_event_id: idOf(meta && meta.messageId) || 'note', ts: now || Date.now() }],
        email: user.email,
        memory_space: (meta && meta.space) || 'work'
      }, now || Date.now());
      return { written: saved && saved.inserted ? 1 : 0, used: provenance !== 'third_party_content', fact: saved && saved.fact };
    }

    function retrievalScore(parts, weights) {
      const w = weights || RETRIEVAL;
      const recency = clamp01(parts && parts.recency);
      const importance = clamp01(parts && parts.importance);
      const cosine = clamp01(parts && parts.cosine);
      const sum = (Number(w.recency) || 0) + (Number(w.importance) || 0) + (Number(w.cosine) || 0) || 1;
      return Math.round(((w.recency * recency + w.importance * importance + w.cosine * cosine) / sum) * 1000) / 1000;
    }

    function consolidate(now) {
      const at = now || Date.now();
      const stale = state.facts.filter((f) => !f.valid_to && f.source !== 'user_stated' && f.status !== 'candidate' && decayed(f, at) < 0.25);
      if (!stale.length) return { closed: 0, derived: 0 };
      const ids = stale.map((f) => f.id);
      stale.forEach((f) => { f.valid_to = isoOf(at); f.retired_at = isoOf(at); });
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (user && state.consents.identity) {
        putFact(state, {
          subject_id: user.id,
          predicate: 'identity.name',
          object: 'derived',
          consent_category: 'identity',
          confidence: 0.5,
          source: 'inferred',
          provenance: 'user_action',
          status: 'active',
          evidence_ids: ids,
          evidence: [{ surface: 'gmail', message_or_event_id: 'derived', ts: at }],
          email: user.email
        }, at);
      }
      return { closed: ids.length, derived: user ? 1 : 0, kept: state.facts.filter((f) => ids.indexOf(f.id) >= 0).length };
    }

    function memoryPolicy(fact, useSpace) {
      const home = (fact && fact.memory_space) || 'work';
      const thread = fact && fact.thread;
      if (thread && state.silentThreads[thread]) return { ok: false, reason: 'without-memory' };
      if (!useSpace || useSpace === home) return { ok: true };
      if ((state.approvals || []).indexOf(home + '>' + useSpace) >= 0) return { ok: true };
      return { ok: false, reason: 'cross-space' };
    }

    function approveSpace(from, to) {
      const key = String(from || 'work') + '>' + String(to || 'personal');
      if (state.approvals.indexOf(key) < 0) state.approvals.push(key);
      return { ok: true, key: key };
    }

    function withoutMemory(threadId, on) {
      const id = idOf(threadId) || 'thread';
      if (on === false) delete state.silentThreads[id];
      else state.silentThreads[id] = true;
      return { ok: true, silent: state.silentThreads[id] === true };
    }

    function editSummary(text, space, now) {
      const user = state.entities.filter((e) => e.kind === 'user')[0];
      if (!user) return { ok: false, reason: 'no-user' };
      const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!line || sensitive(line)) return { ok: false, reason: 'sensitive' };
      return putFact(state, {
        subject_id: user.id,
        predicate: 'identity.name',
        object: line,
        consent_category: 'identity',
        confidence: 1,
        source: 'user_stated',
        provenance: 'user_said',
        status: 'active',
        memory_space: space || 'personal',
        context_of_origin: 'summary',
        evidence: [],
        email: user.email
      }, now || Date.now());
    }

    function learnNgrams(text) {
      const words = String(text || '').toLowerCase().replace(/[^a-z\u0590-\u05FF\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1).slice(0, 40);
      for (let i = 0; i < words.length; i++) {
        const uni = words[i];
        const bi = words[i + 1] ? uni + ' ' + words[i + 1] : '';
        [uni, bi].forEach((token) => {
          if (!token) return;
          const row = state.ngrams.filter((n) => n.token === token)[0];
          if (row) row.n += 1;
          else if (state.ngrams.length < 64) state.ngrams.push({ token: token, n: 1 });
        });
      }
      return { size: state.ngrams.length };
    }

    function exportJson() {
      return {
        schema_ver: SCHEMA,
        consents: state.consents,
        facts: state.facts,
        aliases: state.aliases.map((a) => ({ id: a.id, subject_id: a.subject_id, alias: a.alias, lang: a.lang })),
        exemplars: state.exemplars,
        style_rules: state.style_rules,
        profile: coreProfile()
      };
    }

    return {
      state: state,
      ingestHeader: ingestHeader,
      ingestCalendar: ingestCalendar,
      reduceCalendarItems: reduceCalendarItems,
      setPlace: setPlace,
      resolvePerson: resolvePerson,
      suggestSlots: suggestSlots,
      closureAssist: closureAssist,
      gateHold: gateHold,
      setConsent: setConsent,
      confirmFact: confirmFact,
      editFact: editFact,
      forgetFact: forgetFact,
      never: never,
      forgetAll: forgetAll,
      minimized: minimized,
      ingestOwnSent: ingestOwnSent,
      setStyleRule: setStyleRule,
      conditionDraft: conditionDraft,
      styleDistance: styleDistance,
      styleVector: styleVector,
      extractFacts: extractFacts,
      reviewMerge: reviewMerge,
      coreProfile: coreProfile,
      banditChoose: banditChoose,
      banditObserve: banditObserve,
      setBanditEnabled: setBanditEnabled,
      liftReport: liftReport,
      confirmedFrom: confirmedFrom,
      view: view,
      exportJson: exportJson,
      learnText: learnText,
      retrievalScore: retrievalScore,
      consolidate: consolidate,
      memoryPolicy: memoryPolicy,
      approveSpace: approveSpace,
      withoutMemory: withoutMemory,
      editSummary: editSummary,
      learnNgrams: learnNgrams,
      modelAssistFor: modelAssistFor,
      assistFor: assistFor,
      decayed: (fact, now) => decayed(fact, now || Date.now()),
      sensitive: sensitive
    };
  }

  function blankLift() { return { decisions: 0, closed: 0, undone: 0, missed: 0, failed: 0, precision: null, undo_rate: null, miss_rate: null }; }

  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let pivot = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
      const swap = M[c]; M[c] = M[pivot]; M[pivot] = swap;
      const div = M[c][c] || 1e-9;
      for (let k = c; k <= n; k++) M[c][k] /= div;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const factor = M[r][c];
        for (let k = c; k <= n; k++) M[r][k] -= factor * M[c][k];
      }
    }
    return M.map((row) => row[n]);
  }

  function ucb(A, b, x, alpha) {
    try {
      const theta = solve(A, b);
      const invx = solve(A, x);
      return dot(theta, x) + alpha * Math.sqrt(Math.max(0, dot(x, invx)));
    } catch (e) { return 0; }
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    let prev = zeros(n + 1).map((_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  let current = empty(Date.now());

  function live() { return bind(current); }

  function create(opts) {
    const o = opts || {};
    const state = empty(o.now || Date.now());
    if (o.installId) state.install_id = String(o.installId);
    if (o.consents) {
      Object.keys(o.consents).forEach((key) => {
        if (CATEGORIES.indexOf(key) >= 0) state.consents[key] = o.consents[key] === true;
      });
    }
    return bind(state);
  }

  function normalize(raw) {
    const state = empty(Date.now());
    if (!raw || typeof raw !== 'object') return state;
    state.schema_ver = SCHEMA;
    if (typeof raw.install_id === 'string' && raw.install_id) state.install_id = raw.install_id;
    CATEGORIES.forEach((c) => { state.consents[c] = Boolean(raw.consents && raw.consents[c]); });
    state.entities = Array.isArray(raw.entities) ? raw.entities : [];
    state.aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
    state.facts = Array.isArray(raw.facts) ? raw.facts : [];
    state.tombstones = Array.isArray(raw.tombstones) ? raw.tombstones : [];
    state.exemplars = Array.isArray(raw.exemplars) ? raw.exemplars.slice(-EXEMPLAR_CAP) : [];
    state.style_rules = Array.isArray(raw.style_rules) ? raw.style_rules : [];
    state.review = Array.isArray(raw.review) ? raw.review : [];
    if (raw.bandit && raw.bandit.arms) state.bandit = raw.bandit;
    state.bandit.enabled = Boolean(raw.bandit && raw.bandit.enabled);
    state.wiped_at = raw.wiped_at || 0;
    state.silentThreads = raw.silentThreads || {};
    state.approvals = Array.isArray(raw.approvals) ? raw.approvals : [];
    state.ngrams = Array.isArray(raw.ngrams) ? raw.ngrams : [];
    return state;
  }

  function copy(lang) {
    const src = (lang === 'he' || lang === 'iw') ? COPY.he : COPY.en;
    return JSON.parse(JSON.stringify(src));
  }

  return {
    SCHEMA: SCHEMA,
    CATEGORIES: CATEGORIES,
    WEIGHTS: WEIGHTS,
    RETRIEVAL: RETRIEVAL,
    GUARD: GUARD,
    THIRD_PARTY_PREDICATES: THIRD_PARTY_PREDICATES,
    create: create,
    hydrate: function (raw) { current = normalize(raw); return current; },
    snapshot: function () { return JSON.parse(JSON.stringify(current)); },
    copy: copy,
    sensitive: sensitive,
    cityOf: cityOf,
    latinKey: latinKey,
    namesMatch: namesMatch,
    isHoldout: isHoldout,
    holdoutBucket: holdoutBucket,
    reduceCalendarItems: function (items) { return live().reduceCalendarItems(items); },
    ingestHeaderSync: function (h, now) { return live().ingestHeader(h, now); },
    ingestCalendarSync: function (events, now) { return live().ingestCalendar(events, now); },
    closureAssistSync: function (input, now) { return live().closureAssist(input, now); },
    conditionDraftSync: function (text, ctx) { return live().conditionDraft(text, ctx); },
    modelAssistFor: function (intent) { return live().modelAssistFor(intent); },
    gateHold: function (result, input) { return live().gateHold(result, input); },
    confirmedFrom: function (source) { return live().confirmedFrom(source || current); },
    liftReport: function (events) { return live().liftReport(events); },
    viewSync: function (now) { return live().view(now); },
    setConsentSync: function (cat, on, opts, now) { return live().setConsent(cat, on, opts, now); },
    confirmFactSync: function (id, now) { return live().confirmFact(id, now); },
    editFactSync: function (id, object, now) { return live().editFact(id, object, now); },
    forgetFactSync: function (id, now) { return live().forgetFact(id, now); },
    neverSync: function (predicate, object, email, now) { return live().never(predicate, object, email, now); },
    forgetAllSync: function (now) { return live().forgetAll(now); },
    exportJsonSync: function () { return live().exportJson(); },
    setPlaceSync: function (city, now) { return live().setPlace(city, now); },
    setStyleRuleSync: function (rule, now) { return live().setStyleRule(rule, now); },
    setBanditEnabledSync: function (on) { return live().setBanditEnabled(on); },
    banditChooseSync: function (ctx) { return live().banditChoose(ctx); }
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowPersonalModel };
else if (typeof globalThis !== 'undefined') globalThis.FlowPersonalModel = FlowPersonalModel;
