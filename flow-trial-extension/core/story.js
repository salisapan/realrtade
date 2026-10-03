// One story, many messages — portable, no chrome.*, no DOM, no network.
//
// A loop is about a SUBJECT, not about a Gmail thread. People drop "Re:", edit a
// subject, start a fresh message ("paid INV-204") or answer from a new thread.
// If Glance only follows thread ids it keeps chasing someone who already
// answered, and it opens a second loop for the same invoice.
//
// This file answers one question: does this message belong to a loop that is
// already open? It needs the SAME person, and then one of: the same normalised
// subject, a shared reference number (INV-204, PO 7731, חשבונית 2041), or the
// same amount. Ties are never guessed: two plausible loops means no match.
const FlowStory = (() => {
  const PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|sv|vs|rv|השב|תשובה|הועבר|הע)\s*[:：-]\s*)+/i;
  const TAGS = /\[(?:external|ext|secure|encrypted|spam)\]|\((?:external|ext)\)/ig;
  const GENERIC = /^(?:hi|hello|hey|question|quick question|update|follow ?up|checking in|thanks|thank you|hello there|no subject|\(no subject\)|שלום|היי|שאלה|עדכון|תודה|בלי נושא)$/i;

  function normalizeSubject(subject) {
    let t = String(subject || '').replace(TAGS, ' ').trim();
    let prev;
    do { prev = t; t = t.replace(PREFIX, ''); } while (t !== prev);
    return t.toLowerCase().replace(/[^a-z0-9֐-׿\s#-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Reference numbers a human would use to name the same thing: INV-204, PO 7731,
  // #4521, "invoice 2041", "חשבונית 2041". Lower-cased, separators removed.
  function refs(text) {
    const t = String(text || '');
    const out = new Set();
    const add = (v) => { const x = String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (x.length >= 3 && /\d/.test(x)) out.add(x); };
    let m;
    const re1 = /\b([A-Z]{2,5})[-\s#:]?(\d{2,})\b/g;
    while ((m = re1.exec(t))) add(m[1] + m[2]);
    const re2 = /(?:\binvoice|\binv|\bpo|\border|\bticket|\bref(?:erence)?|\bcase|חשבונית|הזמנה|פנייה|אסמכתא|תיק)\s*(?:no\.?|number|num|מס(?:פר)?['.]?|#|:)?\s*([A-Za-z]{0,4}[-]?\d{3,})/gi;
    while ((m = re2.exec(t))) add(m[1]);
    const re3 = /#(\d{3,})/g;
    while ((m = re3.exec(t))) add(m[1]);
    return out;
  }

  function sameAmount(watch, text, ex) {
    if (!watch || !watch.amount || !(watch.amount.value > 0) || !ex || !ex.parseMoney) return false;
    const m = ex.parseMoney(String(text || ''));
    if (!m || !(m.value > 0)) return false;
    const cur = watch.amount.currency;
    return Math.abs(m.value - watch.amount.value) < 0.005 && (!cur || !m.currency || cur === m.currency);
  }

  const lower = (v) => String(v || '').toLowerCase();

  // watches: stored watches. msg: { email, subject, text }. opts: { extract?, samePerson? }. samePerson(counterpart) says whether a
  // loop's counterpart is the sender, across apps (core/identity-graph.js); without it the email address decides, as before.
  // Returns { watch, score, why } or null.
  function match(watches, msg, opts) {
    const m = msg || {};
    const email = lower(m.email);
    const samePerson = opts && typeof opts.samePerson === 'function' ? opts.samePerson : null;
    if (!email && !samePerson) return null;
    const ex = opts && opts.extract;
    const subj = normalizeSubject(m.subject);
    const mrefs = refs((m.subject || '') + ' ' + (m.text || ''));
    const scored = [];
    (Array.isArray(watches) ? watches : []).forEach((w) => {
      if (!w || w.status !== 'waiting' || w.direction === 'mine' || w.direction === 'clock') return;
      if (samePerson ? !samePerson(w.counterpart || {}) : lower(w.counterpart && w.counterpart.email) !== email) return;
      let score = 0; const why = [];
      const ws = normalizeSubject(w.subject);
      if (subj && ws && subj.length >= 8 && !GENERIC.test(subj) && subj === ws) { score += 3; why.push('subject'); }
      else if (subj && ws && subj.length >= 12 && ws.length >= 12 && (subj.includes(ws) || ws.includes(subj))) { score += 2; why.push('subject-part'); }
      const wrefs = refs((w.subject || '') + ' ' + (w.what || ''));
      const shared = Array.from(mrefs).filter((r) => wrefs.has(r));
      if (shared.length) { score += 3; why.push('ref:' + shared[0]); }
      // The same amount, from the same person, on a payment loop, is how people name the same invoice.
      if (sameAmount(w, m.text, ex)) { score += w.kind === 'payment' ? 3 : 2; why.push('amount'); }
      if (score >= 3) scored.push({ watch: w, score, why: why.join('+') });
    });
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 1 && scored[1].score === scored[0].score) return null; // two plausible loops: do not guess
    return scored[0];
  }

  return { normalizeSubject, refs, match };
})();

if (typeof module !== 'undefined') module.exports = { FlowStory };
