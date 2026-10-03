// The parts of reading a WhatsApp Web chat that need no DOM: what a message id says, who the chat title is, which chats Glance must
// leave alone. Pure functions, tested in test/whatsapp-corpus.cjs; src/content-whatsapp.js feeds them from the page.
//
// What Glance reads there is deliberately narrow: ONE-TO-ONE chats only (never a group, a broadcast list, a channel or a status),
// read-only (it never types, sends, reacts or marks anything), and only to see whether a request you made was answered.
const FlowWhatsAppParse = (() => {
  // WhatsApp's own message id: "<true|false>_<chat>@<server>_<hash>" for a 1:1 chat, with more parts for a group.
  // true = sent by you. The chat part is the other person's number for a normal contact.
  function parseDataId(id) {
    const parts = String(id || '').split('_');
    if (parts.length < 3 || (parts[0] !== 'true' && parts[0] !== 'false')) return null;
    const jid = parts[1];
    const m = /^([^@]+)@(c\.us|s\.whatsapp\.net|lid|g\.us|broadcast|newsletter)$/.exec(jid);
    if (!m) return null;
    const server = m[2];
    const oneToOne = server === 'c.us' || server === 's.whatsapp.net' || server === 'lid';
    return { fromMe: parts[0] === 'true', jid, user: m[1], server, oneToOne, hasPhone: server === 'c.us' || server === 's.whatsapp.net', hash: parts.slice(2).join('_') };
  }

  // A chat whose every message belongs to a 1:1 conversation. A group message id carries a third part (the sender inside the group).
  function isOneToOne(ids) {
    const parsed = (ids || []).map(parseDataId).filter(Boolean);
    if (!parsed.length) return false;
    return parsed.every((p) => p.oneToOne) && (ids || []).every((id) => String(id).split('_').length === 3);
  }

  // The chat title is the contact's name, or the number itself for someone who is not in your contacts.
  function partyFromChat(title, ids) {
    const parsed = (ids || []).map(parseDataId).filter((p) => p && p.oneToOne);
    const withPhone = parsed.find((p) => p.hasPhone);
    const t = String(title == null ? '' : title).replace(/[‎‏‪-‮]/g, '').trim();
    const looksLikeNumber = /^\+?[\d\s\-().]{8,}$/.test(t);
    return {
      name: looksLikeNumber ? null : (t || null),
      phone: withPhone ? withPhone.user : (looksLikeNumber ? t : null),
      email: null,
      lidOnly: !withPhone && parsed.some((p) => p.server === 'lid')
    };
  }

  // A stable thread id for the chat: the number when there is one, otherwise the title.
  function threadIdFor(title, ids) {
    const parsed = (ids || []).map(parseDataId).filter((p) => p && p.oneToOne);
    if (!parsed.length) return null;
    return 'wa:' + parsed[0].jid;
  }

  // Message text from the pieces the page shows: drop the quoted message a reply carries, join the rest.
  function joinText(pieces) {
    return (pieces || []).filter((p) => p && !p.quoted).map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  }

  return { parseDataId, isOneToOne, partyFromChat, threadIdFor, joinText };
})();

if (typeof module !== 'undefined') module.exports = { FlowWhatsAppParse };
