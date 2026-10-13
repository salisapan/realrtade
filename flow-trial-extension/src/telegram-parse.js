// The parts of reading Telegram Web that need no DOM: which chat the address names, whether it is a one-to-one chat, and what a
// message id says. Pure functions, tested in test/telegram-corpus.cjs; src/content-telegram.js feeds them from the page.
// Same stance as WhatsApp: ONE-TO-ONE chats with a person only (never a group, a channel or a bot), read-only, and only to see whether
// something you asked was answered.
const FlowTelegramParse = (() => {
  // Telegram Web A: https://web.telegram.org/a/#12345 . A positive number is a person; a negative one is a group or a channel
  // (-100… for supergroups and channels). Web K: https://web.telegram.org/k/#12345 , the same rule. An @username can be a person, a
  // channel or a bot and the address does not say which, so it is left alone.
  function parseHash(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    if (u.hostname !== 'web.telegram.org') return null;
    const m = /^#(-?\d{4,})$/.exec(u.hash);
    if (!m) return { peer: null, oneToOne: false };
    return { peer: m[1], oneToOne: !m[1].startsWith('-') };
  }

  function threadIdFor(href) {
    const p = typeof href === 'string' ? parseHash(href) : href;
    return p && p.oneToOne ? 'tg:' + p.peer : null;
  }

  // Message elements carry an id such as "message-4242" (Web A) or a data-mid (Web K).
  function messageId(raw) {
    const m = /^(?:message-)?(\d{1,12})$/.exec(String(raw || ''));
    return m ? m[1] : null;
  }

  function joinText(pieces) {
    return (pieces || []).filter((p) => p && !p.quoted).map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  }

  return { parseHash, threadIdFor, messageId, joinText };
})();

if (typeof module !== 'undefined') module.exports = { FlowTelegramParse };
