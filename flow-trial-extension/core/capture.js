// "Stay on this", from anywhere. Portable: no chrome.*, no DOM, no network.
//
// Not every app can be read. For the ones that cannot (or that Glance should not read), the person selects a sentence on any page,
// chooses "Glance: stay on this" from the browser's right-click menu, says who it is with, and a loop opens exactly like any other.
// Nothing is read from the page except the selection the person chose; the page's address is kept WITHOUT its query or fragment (those
// often carry tokens); and a loop opened this way is closed by hand (or by the person's own answer once they are known by an address or
// a number), never by guessing.
const FlowCapture = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const followUp = sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');

  const MIN_WORDS = 3;
  const MAX_CHARS = 400;
  const PENDING_TTL_MS = 24 * 3600 * 1000;

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }

  // https://app.slack.com/client/T1/C2?token=abc#x -> https://app.slack.com/client/T1/C2 . Anything that is not http(s) is dropped.
  function cleanUrl(raw) {
    try {
      const u = new URL(String(raw || ''));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch (e) { return null; }
  }
  function hostOf(raw) {
    try { return new URL(String(raw || '')).hostname.replace(/^www\./, '') || null; } catch (e) { return null; }
  }

  // The selection as the person chose it: collapsed whitespace, bounded. null when it is too little to be a request.
  function cleanSelection(text) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (words(t) < MIN_WORDS) return null;
    return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS - 1).replace(/\s+\S*$/, '') + '…' : t;
  }

  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  // What the right-click handler stores until the popup asks the one question ("who, and whose move is it?").
  function pending(info, now) {
    const text = cleanSelection(info && info.text);
    if (!text) return null;
    const url = cleanUrl(info && info.pageUrl);
    return { text, url, host: hostOf(info && info.pageUrl), at: typeof now === 'number' ? now : Date.now() };
  }
  function fresh(p, now) { return Boolean(p && p.text && (typeof now === 'number' ? now : Date.now()) - p.at < PENDING_TTL_MS); }

  // The answer to the question -> everything a loop needs, in the shapes core/follow-up.js builds from.
  // answer: { who (a name, optional), mine (true when YOU owe it) }.
  function toLoop(p, answer, now) {
    if (!followUp || !p || !p.text) return null;
    const t = typeof now === 'number' ? now : Date.now();
    const mine = Boolean(answer && answer.mine);
    const who = String((answer && answer.who) || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
    const ask = followUp.fromProposal({ act: mine ? 'PROMISE' : 'ASK', action: 'reply', tier: 'capture', deadlineIso: null, amount: null, sentence: p.text }, t);
    if (!ask) return null;
    ask.tier = 'capture';
    ask.lang = hasHebrew(p.text) ? 'he' : 'en';
    return {
      ask,
      base: {
        threadId: 'web:' + hash((p.url || '') + '|' + p.text),
        messageId: null,
        subject: p.host ? p.host : 'A page',
        counterpart: { name: who, email: null, phone: null },
        channel: 'web',
        personKey: null,
        threadUrl: p.url || null
      },
      now: t
    };
  }

  return { MIN_WORDS, MAX_CHARS, PENDING_TTL_MS, cleanUrl, hostOf, cleanSelection, pending, fresh, toLoop };
})();

if (typeof module !== 'undefined') module.exports = { FlowCapture };
