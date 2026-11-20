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

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // Saved Messages is the self chat on Telegram Web A and Web K.
  function isSelfTitle(blob) {
    return /\(you\)|\byourself\b|saved messages|jot something down|הודעות שמורות|\(אתה\)|\(את\)|לעצמך/i.test(norm(blob));
  }

  function isFyi(text) {
    return /\bfyi\b|for your information|no action needed|no need to reply|no need to do anything|לידיעתך|אין צורך/i.test(norm(text));
  }

  function isAsk(text) {
    if (isFyi(text)) return false;
    return /\b(?:can you|could you|would you|please|send me)\b|תוכל|תוכלי|תשלח|בבקשה|אפשר/i.test(norm(text));
  }

  function selfDraft(text) {
    let body = norm(text)
      .replace(/^(?:can you|could you|would you|please)\s+/i, '')
      .replace(/^(?:תוכל|תוכלי|אפשר|בבקשה)\s+/, '')
      .replace(/[?؟]\s*$/, '')
      .trim();
    if (!body) return /[\u0590-\u05FF]/.test(String(text || '')) ? 'אטפל בזה.' : "I'll take care of it.";
    if (!/[\u0590-\u05FF]/.test(body)) body = body.charAt(0).toUpperCase() + body.slice(1);
    if (!/[.!?]$/.test(body)) body += '.';
    return body.slice(0, 500);
  }

  return { parseHash, threadIdFor, messageId, joinText, isSelfTitle, isFyi, isAsk, selfDraft };
})();

if (typeof module !== 'undefined') module.exports = { FlowTelegramParse };
