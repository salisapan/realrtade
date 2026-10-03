// "What Glance learned from you": a short, plain list of every time the engine moved because of something this
// person did. Portable: no chrome.*, no DOM. The caller stores the list (src/storage.js, on this device only).
//
// Why it exists: the engine adapts to its owner (core/intent-model.js learn(), core/outcome-labels.js,
// core/person-model.js). That is only worth anything if the person can SEE it happen and undo it. Each entry is one
// state of a loop ("a reply closed it, so requests phrased like this count more"), never a claim about cleverness
// (docs/product-identity.md), and it would still be true if the model behind it were swapped for rules.
//
// What an entry holds: a time, a kind, one sentence, and optionally a short phrase. The phrase is the sentence the
// engine learned from, masked by core/privacyShield.js, with the other person's name removed, cut to 60 characters,
// and left out entirely for Hebrew (the shield has no Hebrew name rules). It lives on this device with the loop it
// came from, and is deleted by "Reset".
const FlowLedger = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const shield = sibling(typeof FlowPrivacyShield !== 'undefined' ? FlowPrivacyShield : null, './privacyShield.js', 'FlowPrivacyShield');

  const CAP = 40;
  const PHRASE_MAX = 60;
  const KINDS = ['heldOpen', 'askConfirmed', 'promiseConfirmed', 'askMissed', 'promiseMissed', 'accepted', 'turnedDown', 'reopened', 'timing', 'answered', 'style'];

  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // The sentence as it may be shown: masked, the person's name gone, short. null when it cannot be made safe.
  function phrase(text, counterpart) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || hasHebrew(t) || !shield) return null;
    try { t = shield.mask(t).maskedText; } catch (e) { return null; }
    t = t.replace(/^(?:hi|hello|hey|dear)?\s*[A-Z][a-z]{1,20}\s*,\s*/, '');                    // "Dana, could you…"
    const names = [];
    if (counterpart && counterpart.name) String(counterpart.name).split(/\s+/).forEach((p) => { if (p.length >= 2) names.push(p); });
    if (counterpart && counterpart.email) names.push(String(counterpart.email).split('@')[0]);
    names.forEach((n) => { t = t.replace(new RegExp('\\b' + esc(n) + '\\b', 'gi'), '[NAME]'); });
    t = t.replace(/\d/g, '#');
    if (t.length > PHRASE_MAX) t = t.slice(0, PHRASE_MAX - 1).replace(/\s+\S*$/, '') + '…';
    return t.length >= 6 ? t : null;
  }

  function quote(p) { return p ? '“' + p + '”' : null; }

  // info: { text, counterpart, about, who, days, expectDays }
  function line(kind, info, p) {
    const q = quote(p);
    const about = info.about ? info.about : 'something';
    switch (kind) {
      case 'heldOpen': return 'A reply' + (q ? ' ' + q : '') + ' did not answer it (' + (info.reason || 'not an answer') + '), so I kept the loop open.';
      case 'askConfirmed': return 'A reply closed a request of yours' + (q ? ' ' + q : ' about ' + about) + ', so requests phrased like it count more.';
      case 'promiseConfirmed': return 'You kept a promise' + (q ? ' ' + q : ' about ' + about) + ', so promises phrased like it count more.';
      case 'askMissed': return 'You chased by hand where I had no loop' + (q ? ' for ' + q : '') + '. Requests phrased like that now count.';
      case 'promiseMissed': return 'You delivered something you had promised, and I had no loop for it' + (q ? ' ' + q : '') + '. Promises phrased like that now count.';
      case 'accepted': return 'You tapped Stay on it' + (q ? ' on ' + q : '') + ', so wording like that counts as a request.';
      case 'turnedDown': return 'You turned down ' + (q || 'a loop') + ': a small push against treating wording like that as a request.';
      case 'reopened': return 'You reopened a loop I had closed' + (info.who ? ' (' + info.who + ')' : '') + '. I count it as my mistake; if it keeps happening I stop closing on weak evidence.';
      case 'timing': return (info.who || 'They') + ' took ' + info.days + (info.days === 1 ? ' day' : ' days') + ' to answer. I now expect about ' + info.expectDays + ' from them.';
      case 'answered': return 'You answered my question' + (q ? ' ' + q : '') + '. That wording now counts as ' + (info.yes ? 'a request' : 'ordinary talk') + '.';
      case 'style': return 'Drafts now follow how you write: ' + (info.note || 'your usual greeting and sign-off') + '.';
      default: return null;
    }
  }

  function make(kind, info, now) {
    if (KINDS.indexOf(kind) < 0) return null;
    const i = info || {};
    const p = i.text ? phrase(i.text, i.counterpart) : null;
    const l = line(kind, i, p);
    if (!l) return null;
    return { t: typeof now === 'number' ? now : Date.now(), kind, line: l };
  }

  // Newest last. The same kind with the same line twice in one day is one entry.
  function append(list, entry) {
    const cur = Array.isArray(list) ? list.slice() : [];
    if (!entry || !entry.line) return cur;
    const day = 24 * 3600 * 1000;
    if (cur.some((e) => e.kind === entry.kind && e.line === entry.line && entry.t - e.t < day)) return cur;
    cur.push({ t: entry.t, kind: entry.kind, line: String(entry.line).slice(0, 260) });
    return cur.length > CAP ? cur.slice(-CAP) : cur;
  }

  function recent(list, n) { return (Array.isArray(list) ? list : []).slice(-(n || 8)).reverse(); }

  function summary(list) {
    const l = Array.isArray(list) ? list : [];
    return l.length ? l.length + (l.length === 1 ? ' adjustment' : ' adjustments') + ' so far' : null;
  }

  return { CAP, PHRASE_MAX, KINDS, phrase, make, append, recent, summary };
})();

if (typeof module !== 'undefined') module.exports = { FlowLedger };
