'use strict';
// «Ask Glance» (docs/glance-ai/ai-product.md M7): the person asks about their own open loops ("what do I owe Dana?", "who owes me money?",
// "מה פתוח השבוע?") and gets an answer built only from those loops, each line citing the loop it came from. Nothing else is a source: no
// mail text, no memory, no model's own knowledge. A question it cannot place, a name it does not know from the loops, or a topic no loop
// carries is refused in one line ("I can't answer that from your loops"), never guessed.
//
// Device first: the question is read here (English and Hebrew: who owes whom, a person, a day, money, a topic, open or closed). A model may
// propose a reading of the question through deps.parse(question) -> { ask, person, when, money, topic }; it is checked against the same
// enums and the loops themselves (a person must be a counterpart of one of the loops, a topic must be words some loop carries) and the
// answer is still built here from the loops. The model never writes the answer and never cites anything.
// Nothing here closes, writes or sends. Off switch: SWITCH ('aiAskV1'), default off: answer() returns { used:false }.
// Portable: no chrome.*, no DOM, no network.
const FlowLoopAnswer = (() => {
  const SWITCH = 'aiAskV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const MAX_ITEMS = 5;
  const ASKS = ['owe', 'owed', 'all', 'status'];
  const WHENS = ['today', 'tomorrow', 'week', 'overdue'];

  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const nameSound = () => sibling(typeof FlowNameSound !== 'undefined' ? FlowNameSound : null, './name-sound.js', 'FlowNameSound');

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }
  const isHe = (s) => /[֐-׿]/.test(String(s || ''));
  const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}'@.\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Who owes whom. 'owe' = what the person owes (direction 'mine'); 'owed' = what others owe the person (direction 'theirs').
  const OWE = [
    /\bwhat (?:do|did|should) i (?:owe|need to (?:send|do|answer|reply)|have to (?:send|do))(?=\s|$)/, /\bwhat am i (?:supposed|meant) to\b/,
    /\bwhat (?:did|have) i promise/, /\bwhat (?:should|must|do) i (?:send|give|answer|reply)(?=\s|$)/, /\bmy promises\b/, /\bwhat'?s on me\b/, /\bam i late\b/, /\bi'?m late\b/, /\bwhat is on me\b/, /\bwho (?:am i|do i) (?:owe|keeping waiting)(?=\s|$)/,
    /\b(?:is|are) \S+(?: \S+)? waiting (?:on|for) me\b/, /\bwaiting (?:on|for) me\b/, /\bwaiting (?:on|for)(?: \S+){0,3} from me\b/, /\bneeds? from me\b/, /\bdo i owe\b/, /\bi owe\b/, /\bowe \S+\b.*\?/,
    /מה אני (?:חייב|חייבת|צריך|צריכה)/, /מה הבטחתי/, /מה עליי/, /מה עלי(?=\s|$)/, /מחכ(?:ה|ים|ות) לי(?=\s|$)/, /מחכ(?:ה|ים|ות) ממני/, /על מי אני מעכב/, /אני חייב/, /אני חייבת/
  ];
  const OWED = [
    /\bwho owes me\b/, /\bwhat (?:do|does) \S+(?: \S+)? owe me\b/, /\bowes? me\b/, /\bwhat am i waiting (?:on|for)(?=\s|$)/, /\bwho am i waiting (?:on|for)(?=\s|$)/,
    /\bwaiting (?:on|for) (?!me\b)\S+/, /\bwho (?:hasn'?t|has not|didn'?t|did not) (?:answer|reply|replied|answered|pay|paid|send|sent)/, /\bwho (?:still )?needs to (?:pay|answer|send)/,
    /\bwhat (?:did|has) \S+(?: \S+)? promise/, /\bpromised (?:me|to send me)(?=\s|$)/,
    /\bwhat (?:does|do) (?!i\b)\S+(?: \S+)? (?:need|have) to\b/, /מי חייב לי/, /מי (?:עוד |עדיין )?לא (?:ענה|ענתה|שילם|שילמה|שלח|שלחה|החזיר|החזירה)/, /חייב(?:ת|ים)? לי/, /על מה אני מחכה/, /למה אני מחכה/, /אני מחכה ל/, /מחכה ל(?!י(?=\s|$))/, /מי לא (?:ענה|ענתה|שילם|שילמה|שלח|שלחה)/, /מה \S+ הבטיח(?:ה)?/
  ];
  const STATUS = [/\bdid \S+(?: \S+)? (?:answer|reply|respond|pay|send|get back)(?=\s|$)/, /\b(?:has|have) \S+(?: \S+)? (?:answered|replied|responded|paid|sent)(?=\s|$)/,
    /\bis (?:the |my )?\S+(?: \S+)? (?:closed|done|handled|settled|paid)(?=\s|$)/, /\bwhat happened (?:with|to)(?=\s|$)/,
    /האם \S+ (?:ענה|ענתה|שילם|שילמה|שלח|שלחה)/, /(?:^|\s)\S+ (?:ענה|ענתה|שילם|שילמה|שלח|שלחה) (?:על|לגבי|כבר|את)/, /מה קרה עם/, /^האם\s/, /(?:נסגר|סגור|טופל)(?=\s|$)/];
  const ALL = [/\bwhat'?s (?:still )?open\b/, /\bwhat is (?:still )?open\b/, /\bopen loops\b/, /\bwhat'?s (?:due|pending|left)(?=\s|$)/, /\bwhat is (?:due|pending|left)(?=\s|$)/,
    /\bwhat (?:do i|should i) (?:need to )?(?:do|handle)(?=\s|$)/, /\b(?:which|what) \S+(?: \S+)? (?:are|is) (?:still )?(?:open|pending|due|late|outstanding|unpaid)(?=\s|$)/, /\bwhat'?s overdue\b/, /\bwhat is overdue\b/, /\banything (?:due|overdue|open|late)(?=\s|$)/, /\bwhat (?:is|'s) late\b/,
    /מה פתוח/, /מה נשאר/, /מה תלוי/, /מה באיחור/, /מה מחכה/, /מה יש לי (?:היום|מחר|השבוע)/, /מה צריך לעשות/];
  const WHEN = [['overdue', /\b(?:overdue|late|past due|missed)(?=\s|$)|באיחור|עבר(?: ה)?(?:מועד|זמן)|איחר/], ['today', /\btoday\b|היום/],
    ['tomorrow', /\btomorrow\b|מחר/], ['week', /\bthis week\b|\bthe week\b|השבוע/]];
  const MONEY = /\b(?:money|pay|paid|payment|payments|invoice|invoices|owes? me money|bill|bills)(?=\s|$)|כסף|תשלום|תשלומים|שילם|שילמה|לשלם|חשבונית|חשבוניות/;
  const STOP = new Set(('what whats what\'s who whom whose which is are am was were do does did done have has had i me my mine you your he she they them their it its the a an ' +
    'to of on for from about with by in at and or still yet any anything something open closed close loop loops owe owes owed owing waiting wait ' +
    'promise promised promises need needs needed send sent sending answer answered reply replied respond responded pay paid payment money ' +
    'today tomorrow week this that late overdue due past missed pending left handle handled settled happened get back supposed meant should ' +
    'could would will can please tell show list glance hasn\'t has not didn\'t did not haven\'t keeping on\'s right now currently there else anyone someone people ' +
    'hey also just all everything things thing stuff back urgent asap').split(' '));
  const STOP_HE = new Set(('מה מי על את של עם לי ממני אני אתה את הוא היא הם הן זה זו כבר עוד עדיין האם למה איך יש אין צריך צריכה חייב חייבת חייבים ' +
    'מחכה מחכים מחכות הבטחתי הבטיח הבטיחה פתוח פתוחה פתוחים נשאר נשארו תלוי באיחור היום מחר השבוע ענה ענתה שילם שילמה שלח שלחה לשלם כסף ' +
    'תשלום תשלומים חשבונית חשבוניות נסגר סגור טופל קרה לגבי עליי עלי לעשות לשלוח לענות להחזיר לתת דחוף דחופה דחופים בהקדם').split(' '));

  function firstName(c) { return String((c && c.name) || '').trim().split(/\s+/)[0] || ''; }
  function partyKeys(c) {
    if (!c) return [];
    const keys = new Set();
    const name = norm(c.name);
    if (name) { keys.add(name); for (const p of name.split(' ')) if (p.length >= 2) keys.add(p); }
    const local = String(c.email || '').toLowerCase().split('@')[0];
    if (local) { keys.add(local); for (const p of local.split(/[._-]/)) if (p.length >= 3) keys.add(p); }
    return [...keys];
  }
  // Hebrew attaches ל/מ/ש/ו/ה/ב/כ to the next word ("לדנה", "מדנה"): a token that is not a key is tried once without it.
  function tokenVariants(t) { const out = [t]; if (isHe(t) && t.length > 2 && /^[למשוהבכ]/.test(t)) out.push(t.slice(1)); return out; }

  // The people named in the question that some loop knows. Returns { keys:Set, words:Set } (words: tokens taken by a name).
  function findPeople(q, loops) {
    const toks = norm(q).split(' ').filter(Boolean);
    const byKey = new Map();
    for (const w of loops) for (const k of partyKeys(w.counterpart)) { if (!byKey.has(k)) byKey.set(k, new Set()); byKey.get(k).add(w.id); }
    const ids = new Set(), words = new Set();
    const nq = ' ' + toks.join(' ') + ' ';
    for (const [k, set] of byKey) if (k.includes(' ') && nq.includes(' ' + k + ' ')) { set.forEach((x) => ids.add(x)); k.split(' ').forEach((x) => words.add(x)); }
    for (const t of toks) for (const v of tokenVariants(t.replace(/'s$/, ''))) if (byKey.has(v) && !STOP.has(v) && !STOP_HE.has(v)) { byKey.get(v).forEach((x) => ids.add(x)); words.add(t); }
    if (ids.size) return { ids, words, ambiguous: false };
    // The same person in the other script («מה אבי חייב לי?» for Avi Levi, "what does Shai owe me?" for «שי כהן»), by sound
    // (core/name-sound.js). Kept only when exactly one person fits; two people who sound alike is a refusal, never a guess.
    const NS = nameSound();
    if (!NS) return { ids, words, ambiguous: false };
    const people = new Map();
    for (const t0 of toks) {
      const t = t0.replace(/'s$/, '');
      if (t.length < 2 || STOP.has(t) || STOP_HE.has(t) || loops.some((w) => topicHits(w, [t]) > 0)) continue;
      for (const w of loops) {
        const c = w.counterpart || {};
        const parts = norm(c.name).split(' ').filter((p) => p.length >= 2);
        if (!parts.some((p) => tokenVariants(t).some((v) => NS.same(v, p)))) continue;
        const who = String(c.email || c.name || '').toLowerCase();
        if (!people.has(who)) people.set(who, new Set());
        people.get(who).add(w.id);
        words.add(t0);
      }
    }
    if (people.size === 1) for (const set of people.values()) set.forEach((x) => ids.add(x));
    return { ids, words, ambiguous: people.size > 1 };
  }

  const DAYS = new Set(['i', 'glance', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow']);
  function unknownName(q, loops) {
    const m = String(q).match(/\b(?:does|did|has|is|from|to|with|on|for|owe)\s+([A-Z][a-z]{1,20})(?=\s|$)(?!\s+(?:me|you)(?=\s|$)\s*$)/);
    if (!m) return false;
    const w = m[1].toLowerCase();
    if (DAYS.has(w) || STOP.has(w)) return false;
    const NS = nameSound();
    return !loops.some((x) => partyKeys(x.counterpart).includes(w) || topicHits(x, [w]) > 0
      || (NS && norm((x.counterpart || {}).name).split(' ').some((p) => NS.same(w, p))));
  }
  function contentWords(q, taken) {
    return norm(q).split(' ').filter((t) => t && t.length >= 3 && !taken.has(t) && !STOP.has(t) && !STOP_HE.has(t) && !/^\d+$/.test(t))
      .map((t) => t.replace(/'s$/, ''));
  }
  function loopText(w) { return norm([w.what, w.subject, w.amount && w.amount.raw].filter(Boolean).join(' ')); }
  function topicHits(w, words) {
    const text = ' ' + loopText(w) + ' ';
    return words.filter((t) => tokenVariants(t).some((v) => text.includes(' ' + v) || (v.length >= 5 && text.includes(v.slice(0, -1))))).length;
  }

  // The device reading of a question: { ask, when, money, personIds:Set|null, topic:[words] } or null when no reading fits.
  function readQuestion(q) {
    const s = norm(q);
    if (!s) return null;
    let ask = null;
    if (/\bwho\b.*\b(?:not|hasn'?t|haven'?t|didn'?t)(?=\s|$)/.test(s) || /מי (?:עוד |עדיין )?לא/.test(s)) ask = 'owed'; // "who has not answered me": open loops, not a status
    else if (STATUS.some((r) => r.test(s))) ask = 'status';
    else if (OWED.some((r) => r.test(s)) && !OWE.some((r) => r.test(s))) ask = 'owed';
    else if (OWE.some((r) => r.test(s))) ask = 'owe';
    else if (ALL.some((r) => r.test(s))) ask = 'all';
    const whenHit = WHEN.find(([, r]) => r.test(s));
    const when = whenHit ? whenHit[0] : null;
    const money = MONEY.test(s);
    if (!ask && when) ask = 'all';
    if (!ask && money && /\?|^(?:who|what|any|מי|מה|יש)(?=\s|$)/.test(s)) ask = 'all';
    return ask ? { ask, when, money } : null;
  }

  const dayOf = (w) => w.promisedIso || w.deadlineIso || null;
  function todayIso(ctx) {
    if (ctx && typeof ctx.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ctx.today)) return ctx.today;
    const d = new Date(ctx && typeof ctx.now === 'number' ? ctx.now : Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekEnd(iso) { const d = new Date(iso + 'T12:00:00Z'); return addDays(iso, 6 - d.getUTCDay()); } // Sunday-first week, ends Saturday
  function whenFits(w, when, today) {
    if (!when) return true;
    const d = dayOf(w);
    if (!d) return false;
    if (when === 'overdue') return d < today;
    if (when === 'today') return d === today;
    if (when === 'tomorrow') return d === addDays(today, 1);
    if (when === 'week') return d >= today && d <= weekEnd(today);
    return false;
  }
  const isMoney = (w) => w.kind === 'payment' || Boolean(w.amount && w.amount.value);
  const isOpen = (w) => w.status === 'waiting';
  const owesOf = (w) => (w.direction === 'mine' ? 'owe' : 'owed');

  // One line per loop, from its own fields only.
  function lineFor(w, lang, today) {
    const who = firstName(w.counterpart) || (lang === 'he' ? 'מישהו' : 'someone');
    const what = String(w.what || w.subject || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const d = dayOf(w);
    if (lang === 'he') {
      const day = d ? (d < today && isOpen(w) ? ' (באיחור, מ־' + d + ')' : ' (עד ' + d + ')') : '';
      if (!isOpen(w)) return (w.closedAs === 'declined' ? 'נסגר בסירוב: ' : w.closedAs === 'paid' ? 'שולם: ' : 'נסגר: ') + who + ', ' + what + (w.resolvedAt ? ' (' + new Date(w.resolvedAt).toISOString().slice(0, 10) + ')' : '');
      return (w.direction === 'mine' ? 'את/ה חייב/ת ל' + who + ': ' : who + ' חייב/ת לך: ') + what + day;
    }
    const day = d ? (d < today && isOpen(w) ? ' (overdue since ' + d + ')' : ' (by ' + d + ')') : '';
    if (!isOpen(w)) return (w.closedAs === 'declined' ? 'Closed, they said no: ' : w.closedAs === 'paid' ? 'Paid: ' : 'Closed: ') + who + ', ' + what + (w.resolvedAt ? ' (' + new Date(w.resolvedAt).toISOString().slice(0, 10) + ')' : '');
    return (w.direction === 'mine' ? 'You owe ' + who + ': ' : who + ' owes you: ') + what + day;
  }
  function cite(w) { return { id: w.id, threadId: w.threadId || null, channel: w.channel || 'gmail', messageId: w.messageId || null, threadUrl: w.threadUrl || null }; }

  function refuse(reason, lang) {
    return { refused: true, reason, items: [], text: lang === 'he' ? 'אין לי תשובה לזה מהמשימות הפתוחות שלך.' : "I can't answer that from your loops." };
  }

  // A model's reading is a proposal: it is kept only where it fits the enums and the loops.
  function checkParse(p, loops) {
    if (!p || typeof p !== 'object' || !ASKS.includes(p.ask)) return null;
    const out = { ask: p.ask, when: WHENS.includes(p.when) ? p.when : null, money: p.money === true };
    if (p.person != null) {
      const f = findPeople(String(p.person), loops);
      if (!f.ids.size) return null; // a person no loop knows: no reading
      out.personIds = f.ids;
    }
    if (Array.isArray(p.topic) && p.topic.length) out.topic = p.topic.map((t) => norm(t)).filter(Boolean);
    return out;
  }

  // answer(flags, question, loops, ctx) -> { used:false } | { used:true, lang, ask, items:[{id,line,cite}], more, text, refused?, reason? }
  // ctx: { now, today?, lang?, deps?: { parse?(question) -> reading } }. loops: the person's watches (open and closed).
  function answer(flags, question, loops, ctx) {
    if (!enabled(flags)) return { used: false };
    const c = ctx || {};
    const q = String(question || '').slice(0, 300);
    const lang = c.lang === 'he' || c.lang === 'en' ? c.lang : (isHe(q) ? 'he' : 'en');
    const all = (Array.isArray(loops) ? loops : []).filter((w) => w && w.id && w.status !== 'stopped');
    const today = todayIso(c);
    const out = (o) => Object.assign({ used: true, lang }, o);
    if (!q.trim()) return out(refuse('empty', lang));

    const people = findPeople(q, all);
    let r = readQuestion(q);
    let source = 'device';
    if (!r && c.deps && typeof c.deps.parse === 'function') {
      let p = null;
      try { p = c.deps.parse(q); } catch (e) { p = null; }
      const checked = checkParse(p, all);
      if (checked) { r = checked; source = 'model'; }
    }
    if (!r) return out(refuse('not-understood', lang));
    if (!r.personIds && people.ambiguous) return out(refuse('ambiguous-person', lang));
    const personIds = r.personIds || (people.ids.size ? people.ids : null);
    // A capitalised word that reads as a name no loop knows ("what does Moshe owe me?"): refuse rather than answer for everyone.
    if (!personIds && unknownName(q, all)) return out(refuse('unknown-person', lang));
    let pool = all;
    if (personIds) pool = pool.filter((w) => personIds.has(w.id));
    if (r.ask === 'status') {
      // "did Dana answer about the lease?" reads open and closed loops; every other question only open ones.
    } else pool = pool.filter(isOpen);
    if (r.ask === 'owe' || r.ask === 'owed') pool = pool.filter((w) => owesOf(w) === r.ask);
    if (r.money) pool = pool.filter(isMoney);
    pool = pool.filter((w) => whenFits(w, r.when, today));
    // Words left after the question words and the names: what the question is about. A topic no loop carries is refused
    // (or, when a person is named, answered as "nothing open that fits with <name>"), never widened to every loop.
    // A topic word is compared only with loops written in its own script: «החשבונית» cannot be checked against "Payment of invoice
    // 118", so it neither picks nor rules out an English loop (it is dropped for that comparison, never read as "nothing fits").
    const topicAll = source === 'model' ? (r.topic || []) : contentWords(q, people.words);
    const poolHe = pool.some((w) => isHe(loopText(w))), poolEn = pool.some((w) => /[a-z]/.test(loopText(w)));
    const topic = topicAll.filter((t) => (isHe(t) ? poolHe : poolEn));
    if (!topic.length && topicAll.length && !personIds && !r.when && !r.money && r.ask === 'status') return out(refuse('unknown-topic', lang));
    if (topic.length) {
      const scored = pool.map((w) => [w, topicHits(w, topic)]);
      const best = Math.max(0, ...scored.map((x) => x[1]));
      if (best > 0) pool = scored.filter((x) => x[1] === best).map((x) => x[0]);
      else if (personIds && r.ask !== 'status') pool = [];
      else return out(refuse('unknown-topic', lang));
    }
    pool.sort((a, b) => String(dayOf(a) || '9999').localeCompare(String(dayOf(b) || '9999')) || (a.createdAt || 0) - (b.createdAt || 0));
    const items = pool.slice(0, MAX_ITEMS).map((w) => ({ id: w.id, line: lineFor(w, lang, today), cite: cite(w) }));
    const more = Math.max(0, pool.length - items.length);
    let text;
    if (!items.length) {
      const whoName = personIds ? firstName((all.find((w) => personIds.has(w.id)) || {}).counterpart) : '';
      text = lang === 'he' ? ('אין משימה פתוחה שמתאימה' + (whoName ? ' עם ' + whoName : '') + '.') : ('Nothing open that fits' + (whoName ? ' with ' + whoName : '') + '.');
    } else {
      text = items.map((x) => x.line).join('\n') + (more ? (lang === 'he' ? '\nועוד ' + more + '.' : '\nand ' + more + ' more.') : '');
    }
    return out({ ask: r.ask, when: r.when || null, source, items, more, text });
  }

  return { SWITCH, DEFAULTS, MAX_ITEMS, enabled, readQuestion, answer };
})();

if (typeof module !== 'undefined') module.exports = { FlowLoopAnswer };
