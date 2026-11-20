'use strict';
// Decompose v1 (owner, 2026-11-12: «לפרק כל משימה לגורמים ולהציע את השלבים הכי נכונים לכל זיהוי כוונה»): one mail can carry more than one
// intention ("send me the contract by Thursday. Also, let's meet Monday at 10:00"). The shared judge reads the mail as one piece and answers
// with one decision, so a second intention is lost, and two intentions of different kinds can silence each other. This module splits the
// mail's own new text into clauses, asks the SAME judge about each clause, and returns every intention it finds, each broken into its parts
// (who acts, what, for whom, by when, what closes it) with the steps the product's own planner (core/actions.js) builds for it.
//
// Floor, unchanged:
//   - the judge decides every intention; this file never invents a kind, a step, a date or a word: every part is read from the judge's
//     intent or from the mail's own text, and every evidence clause is a substring of the mail;
//   - the whole-mail decision comes first. A clause pass runs only when the whole mail SHOWS (to find the other intentions), when the judge
//     found no intent at all (`intent-null`), or when the close-family gate held the mail for ONE reason only: two clock times in one mail
//     (`quiet:family`, family H, rule `ambiguousClocks`: two meetings), and only when the host hands in both checks (familyHit and phishing).
//     Every other family quiet stands ("Could you send the invoice? Please don't." is a family quiet; found 2026-11-12 on the natural
//     multi-clause set), and so does every other named quiet of the whole mail (hedge, noise, marketing, relay, own sender, names pending,
//     addressee, a meeting veto, a file chain, a no-need-to-send). A phishing or bank-change mail never gets a clause pass;
//   - a clause that takes something back anywhere in the mail (don't, no need, never mind, instead, ignore, cancel, "or could you";
//     «אל ת», «לא צריך», «במקום», «תתעלם») stops the clause pass for the whole mail: a clause read alone cannot see what a later one cancelled;
//   - an intention beyond the first is offered only when its own clause carries its own day or clock; an undated second ask is left to the
//     first card (one reply answers it), so a context sentence ("We need your sign-off.") never becomes a second card;
//   - a clause intention never replaces the whole mail's decision: it is added after it, at most MAX_INTENTIONS in all;
//   - nothing here writes, sends or closes. Each step still needs the person's click, and a loop closes only on its real proof
//     (docs/true-close.md; `doneWhen` names that proof).
//
// Off switch: SWITCH ('aiDecomposeV1'), default off: decompose() returns { used:false } and the host keeps the whole-mail decision.
// Nothing in the extension calls it yet. Portable: no chrome.*, no DOM, no network. The host injects judgeText(text) -> the judge's result.
const FlowIntentDecompose = (() => {
  const SWITCH = 'aiDecomposeV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const MAX_INTENTIONS = 3;
  const MIN_CLAUSE = 12;
  const CLAUSE_PASS_REASONS = new Set(['intent-null']);
  // `quiet:family` is the close-family gate (core/close-families.js). Only its two-clocks rule (two meetings in one mail) is an ambiguity that
  // reading each clause resolves; its other rules read a cancel, a correction or an alternative ACROSS clauses and must stand.
  const FAMILY_CLAUSE_RULES = new Set(['ambiguousClocks']);
  // A clause that takes something back. Broad on purpose: it only ever removes the clause pass (silence), never adds an offer.
  const TAKES_BACK = /\b(?:don'?t|do not|no need|never ?mind|nevermind|ignore|disregard|instead|cancel(?:led|ed)?|scratch that|hold off|not yet|forget (?:it|that)|or (?:could|can|would|maybe) (?:you|we))\b|(?:^|[\s,.;:!?])(?:אל ת|לא צריך|אין צורך|במקום|תתעלמ|תתעלם|להתעלם|בטל|מבוטל|לא משנה|עזוב|עזבי|או ש(?:ת|א))/i;
  const FILE_CHAIN_REASONS = new Set(['file', 'file-chain-not-run']);
  const STEP_NEUTRAL = { gmailDraft: 'draft', outlookDraft: 'draft', googleTask: 'task', googleTasks: 'task', outlookTask: 'task', calendar: 'calendar', outlookCalendar: 'calendar', driveFile: 'file_save', onedriveFile: 'file_save' };
  // What really closes each anchor (docs/true-close.md §7). A prepared draft, a hold or a task alone is not completion.
  const DONE_WHEN = {
    draft: { kind: 'reply-sent', en: 'Your reply is sent in this thread', he: 'התשובה שלך נשלחה בשרשור הזה' },
    task: { kind: 'work-done', en: 'The work is done and you mark it done', he: 'העבודה בוצעה וסימנת אותה' },
    calendar: { kind: 'event-held', en: 'The event is on your calendar and read back', he: 'האירוע ביומן ונקרא בחזרה' },
    file_save: { kind: 'file-saved', en: 'The file is saved and read back', he: 'הקובץ נשמר ונקרא בחזרה' }
  };
  const GREETING = /^\s*((?:hi|hey|hello|dear|good (?:morning|afternoon|evening)|greetings|שלום|היי|הי|בוקר טוב|ערב טוב)(?=[\s,!])[^,\n.!?]{0,40}(?:[,!]|(?=\n)))\s*/i;
  const SIGN_OFF = /^(?:thanks|thank you|thx|cheers|best|best regards|regards|kind regards|many thanks|תודה(?: רבה)?|בברכה|יום (?:נעים|טוב)|המשך יום טוב|שבוע טוב)\b[\s\S]{0,40}$/i;
  // A clause starts after the end of a sentence, a line break, or a connector that opens a new ask ("Also,", "In addition,", «בנוסף,», «וגם,»).
  const CONNECTOR = /\s+(?=(?:and also|also|in addition|additionally|separately|one more thing|בנוסף|וגם|ועוד דבר|דבר נוסף)[,:]?\s)/gi;  // no \b: it does not see Hebrew letters

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }
  const neutral = (k) => STEP_NEUTRAL[k] || k || null;

  // clauses(text) -> { greeting, clauses:[{ text }] } in the mail's order. The greeting is returned apart, so each clause is read as addressed
  // the same way ("Hi all" stays a group mail in every clause). Every clause is a substring of the mail.
  function clauses(text) {
    const src = String(text || '');
    const g = src.match(GREETING);
    const greeting = g ? g[1].trim() : '';
    const body = g ? src.slice(g[0].length) : src;
    const out = [];
    for (const sentence of body.split(/(?<=[.!?])\s+|\n+/)) {
      for (const part of String(sentence || '').split(CONNECTOR)) {
        const t = String(part || '').trim();
        if (t.length < MIN_CLAUSE || SIGN_OFF.test(t)) continue;
        out.push({ text: t });
      }
    }
    return { greeting, clauses: out };
  }

  const LEAD = /^(?:(?:and also|also|in addition|additionally|separately|one more thing|בנוסף|וגם|ועוד דבר|דבר נוסף)[,:]?\s+)/i;
  function cleanWhat(w, greeting) {
    let t = String(w || '').trim();
    if (greeting && t.toLowerCase().startsWith(greeting.toLowerCase())) t = t.slice(greeting.length).trim();
    return t.replace(LEAD, '').trim() || null;
  }

  // The parts of one intention, read from the judge's own result. `clause` is the evidence (a substring of the mail).
  function partsOf(res, clause, ctx) {
    const intent = (res && res.intent) || {};
    const process = (res && res.process) || {};
    const steps = (process.steps || []).map((s) => neutral(s && s.kind)).filter(Boolean);
    const anchor = steps[0] || null;
    const e = intent.entities || {};
    const f = intent.facts || {};
    const date = e.dateIso || (f.date && f.date.iso) || null;
    const hour = Number.isInteger(e.hour) ? e.hour : (f.time && Number.isInteger(f.time.hour) ? f.time.hour : null);
    const minute = Number.isInteger(e.minute) ? e.minute : (f.time && Number.isInteger(f.time.minute) ? f.time.minute : null);
    const type = intent.type || null;
    // Who has to act: an ask of the person and the person's own promise are the person's; a promise made TO the person is the sender's.
    const actor = type === 'followup' ? 'sender' : (type === 'event' ? 'both' : 'me');
    const money = f.money && (f.money.amount != null) ? { amount: f.money.amount, currency: f.money.currency || null } : null;
    const sender = (ctx && ctx.sender) || {};
    return {
      kind: type,
      family: intent.personalClose || (intent.googleClose && intent.googleClose.personalClose) || type,
      actor,
      what: cleanWhat(e.what || e.requestWhat || intent.label, ctx && ctx.greeting),
      counterpart: sender.name || sender.email || null,
      due: date || hour != null ? { dateIso: date, hour, minute } : null,
      money,
      anchor,
      steps,
      process: { id: process.id || null, name: process.name || null },
      doneWhen: anchor && DONE_WHEN[anchor] ? DONE_WHEN[anchor] : null,
      evidence: clause ? clause.text : null,
      needsClick: true,
      closes: false,
      // The judge's own result for this intention ({ intent, process }): the one thing merge() builds a card from. Never invented here.
      card: res && res.show && res.process && (res.process.steps || []).length ? { intent: res.intent, process: res.process } : null
    };
  }

  // Two readings are one intention when they anchor the same way and name the same time, or, with no time, the same thing (or one names
  // nothing): one reply draft answers two undated asks of the same sender.
  const sameIntention = (a, b) => a === b || (a.anchor === b.anchor && ((a.due && b.due && a.due.dateIso === b.due.dateIso && a.due.hour === b.due.hour) || (!a.due && !b.due && (!a.what || !b.what || a.what === b.what))));

  // decompose(flags, input, deps) -> { used:false } | { used:true, intentions:[parts...], primary, whole:{show, reason}, reason? }
  //   input: { text (the mail's new text, quoted history already removed by the host), whole (the judge's result on the whole mail), sender, vetoText }
  //   deps:  { judgeText(text) -> judge result (the same judge, the same host context, only the text changed); phishing(text) -> bool (optional) }
  function guardSibling() {
    if (typeof FlowTier0Guard !== 'undefined') return FlowTier0Guard;
    try { return typeof require !== 'undefined' ? require('./tier0-guard.js').FlowTier0Guard : null; } catch (e) { return null; }
  }
  function decompose(flags, input, deps) {
    if (!enabled(flags)) return { used: false };
    const i = input || {}, d = deps || {};
    const whole = i.whole || {};
    const ctx = { sender: i.sender || null };
    const intentions = [];
    if (whole.show) intentions.push(Object.assign(partsOf(whole, null, ctx), { source: 'whole' }));
    const reason = whole.show ? null : (whole.reason || null);
    const text = String(i.text || '');
    let pass = !!whole.show || CLAUSE_PASS_REASONS.has(reason);
    if (!pass && reason === 'quiet:family' && typeof d.familyHit === 'function' && typeof d.phishing === 'function') {
      let hit = null; try { hit = d.familyHit(text); } catch (e) { hit = null; }
      pass = !!(hit && hit.suppress && FAMILY_CLAUSE_RULES.has(hit.rule));
    }
    if (!pass) return { used: true, intentions, primary: null, whole: { show: false, reason }, reason: 'whole-mail-quiet' };
    if (typeof d.judgeText !== 'function') return { used: true, intentions, primary: intentions[0] || null, whole: { show: !!whole.show, reason }, reason: 'no-judge' };
    // Red team 2026-11-13 (docs/glance-ai/red-team.md): with no phishing check from the host, a bank-change or gift-card mail whose
    // whole reading was quiet still had each clause read alone ("Please pay invoice 552 by Friday" -> a Pay card). The whole-mail veto
    // now always runs: the host's check when it passes one, else Glance's own guard (core/tier0-guard.js: injection and fraud shapes);
    // with neither available, no clause pass at all.
    const vetoText = String(i.vetoText || text);
    const guard = guardSibling();
    const vetoed = typeof d.phishing === 'function' ? d.phishing(vetoText)
      : (guard && typeof guard.check === 'function' ? guard.check({ text: vetoText, subject: '' }) !== null : null);
    if (vetoed === null) return { used: true, intentions, primary: intentions[0] || null, whole: { show: !!whole.show, reason }, reason: 'no-veto-available' };
    if (vetoed) return { used: true, intentions, primary: intentions[0] || null, whole: { show: !!whole.show, reason }, reason: 'whole-mail-veto' };
    if (TAKES_BACK.test(text)) return { used: true, intentions, primary: intentions[0] || null, whole: { show: !!whole.show, reason }, reason: 'takes-back' };
    const split = clauses(text);
    if (split.clauses.length < 2) return { used: true, intentions, primary: intentions[0] || null, whole: { show: !!whole.show, reason }, reason: 'one-clause' };
    ctx.greeting = split.greeting;
    const found = [];
    for (const c of split.clauses) {
      let r = null;
      // The connector that opened the clause ("Also,", «בנוסף,») is not part of the ask; the judge reads the clause without it.
      try { r = d.judgeText((split.greeting ? split.greeting + ' ' : '') + c.text.replace(LEAD, '')); } catch (e) { r = null; }
      if (!r) continue;
      let p = null;
      if (r.show && r.process && (r.process.steps || []).length) p = Object.assign(partsOf(r, c, ctx), { source: 'clause' });
      // An ask for a file back that the file chain owns (core/file-attach.js, core/resolution.js): the judge holds the card for that chain,
      // so the clause is the chain's intention: find the one right file, then the reply draft with it. Only a request of the person.
      else if (FILE_CHAIN_REASONS.has(r.reason) && r.intent && r.intent.type === 'request') {
        p = Object.assign(partsOf({ intent: r.intent, process: { id: 'file-chain', name: 'Find & Attach', steps: [{ kind: 'gmailDraft' }] } }, c, ctx),
          { source: 'clause', owner: 'file-chain', steps: ['find_file', 'draft'] });
      }
      if (p && p.anchor && !found.some((x) => sameIntention(x, p))) found.push(p);
    }
    // The whole mail's decision stays: its anchor is kept. When a clause reads the same anchor, that clause's parts replace the whole mail's
    // (a whole-mail reading of two intentions can mix the ask of one with the clock of the other).
    let out = intentions;
    if (whole.show && found.length) {
      const k = found.findIndex((x) => x.anchor === intentions[0].anchor);
      if (k >= 0) out = [Object.assign({}, found[k], { source: 'whole+clause' })].concat(found.filter((_, j) => j !== k));
      else out = intentions.concat(found);
    } else if (!whole.show) out = found;
    out = out.filter((x, j) => out.findIndex((y) => sameIntention(x, y)) === j);
    // Beyond the first, only an intention whose own clause carries its own day or clock.
    out = out.filter((x, j) => j === 0 || (x.due && (x.due.dateIso || x.due.hour != null))).slice(0, MAX_INTENTIONS);
    return { used: true, intentions: out, primary: out[0] || null, whole: { show: !!whole.show, reason } };
  }

  // ---- merge: one card for a mail that asks for more than one thing --------------------------------------------------------------------------
  // The hosts show one card per mail, and a card already carries a list of steps the person can tick. So several intentions become ONE card whose
  // steps are every intention's own steps (from the judge, never invented), in the mail's order, each step id and dependency prefixed by its intention
  // so they stay apart. The process name and its two lines come from the product's own catalog (core/actions.js), so every surface already has them
  // in both languages: a meeting plus a reply is "Schedule & Confirm", a meeting alone "Schedule It", a reply "Reply & Track". Nothing new to translate.
  // At most MAX_STEPS steps (core/actions.js MAX_ACTIONS); an intention that would not fit whole is left out, never cut in half.
  // Only intentions the judge itself offered (`card`) are merged: a file ask handed to the file chain has no real steps here and stays on its own path.
  const MAX_STEPS = 5;
  function catalogFor(kinds) {
    let A = null;
    try { A = typeof FlowActions !== 'undefined' ? FlowActions : (typeof require !== 'undefined' ? require('./actions.js').FlowActions : null); } catch (e) { A = null; }
    const cat = A && A.PROCESS_CATALOG;
    if (!cat) return null;
    const has = (re) => kinds.some((k) => re.test(k));
    const id = has(/calendar/i) ? (has(/draft/i) ? 'schedule-confirm' : 'schedule') : (has(/draft/i) ? 'reply-track' : null);
    return id && cat[id] ? Object.assign({ id }, cat[id]) : null;
  }
  function merge(intentions) {
    const cards = (Array.isArray(intentions) ? intentions : []).filter((x) => x && x.card && x.card.process);
    if (cards.length < 2) return null;
    const steps = [];
    const used = [];
    cards.forEach((x, n) => {
      const mine = (x.card.process.steps || []).map((st) => Object.assign({}, st, {
        id: 'i' + (n + 1) + '-' + (st.id || st.kind),
        dependsOn: st.dependsOn ? 'i' + (n + 1) + '-' + st.dependsOn : null
      }));
      if (steps.length + mine.length > MAX_STEPS) return;
      mine.forEach((st) => steps.push(st));
      used.push(x);
    });
    if (used.length < 2) return null;
    const cat = catalogFor(steps.map((st) => st.kind));
    const first = used[0].card.process;
    const process = {
      id: cat ? cat.id : first.id,
      name: cat ? cat.name : first.name,
      closingLine: cat ? cat.closingLine : first.closingLine,
      closedLine: cat ? cat.closedLine : first.closedLine,
      needsDateChoice: false,
      dateChoices: null,
      steps,
      decomposed: used.length
    };
    const intent = Object.assign({}, used[0].card.intent, { decomposed: true, intentions: used.length, evidence: used.map((x) => x.evidence).filter(Boolean) });
    return { intent, process, used: used.length };
  }

  return { decompose, clauses, partsOf, cleanWhat, merge, MAX_STEPS, enabled, SWITCH, DEFAULTS, MAX_INTENTIONS, DONE_WHEN, CLAUSE_PASS_REASONS, FAMILY_CLAUSE_RULES, TAKES_BACK };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntentDecompose };
