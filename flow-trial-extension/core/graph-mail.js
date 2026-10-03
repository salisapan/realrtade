// Outlook mail as plain utterances, from Microsoft's own mail API (Microsoft Graph). Portable: no chrome.*, no DOM, no network.
//
// This is the stable way into Outlook: an official API with a documented message shape, rather than reading Outlook's page, whose
// markup is not a public interface. This file only turns a Graph message into core/channel.js's utterance and strips the quoted
// history, so that every rule that works on an email (core/follow-up.js) works on it. It is NOT yet wired to anything: reading a
// mailbox needs a Microsoft app registration and the person's consent (docs/multi-platform.md, "Outlook"), which are the owner's to set up.
const FlowGraphMail = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const channel = sibling(typeof FlowChannel !== 'undefined' ? FlowChannel : null, './channel.js', 'FlowChannel');

  const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

  // HTML body -> text. Blocks become line breaks; tags, styles and scripts go; common entities are decoded.
  function htmlToText(html) {
    return String(html == null ? '' : html)
      .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] || m)
      .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Only what the sender wrote THIS time: cut at the first line that starts the quoted history (Outlook's "From: … Sent: …" block, a
  // reply header such as "On … wrote:", a Hebrew "מאת:" header, a separator line, or a ">" quote).
  const CUT = [
    /^\s*(?:from|מאת)\s*[:：]\s*.+/i,
    /^\s*on .{5,120} wrote:\s*$/i,
    /^\s*ב-?.{5,80}\s*(?:כתב|כתבה)\s*[:：]?\s*$/,
    /^\s*-{2,}\s*(?:original message|forwarded message|הודעה מקורית).*$/i,
    /^\s*_{5,}\s*$/,
    /^\s*>/
  ];
  function ownText(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (const l of lines) { if (CUT.some((re) => re.test(l))) break; out.push(l); }
    return out.join('\n').trim();
  }

  // msg: a Graph message resource. me: the mailbox owner's address. Returns an utterance, or null for a draft or something unusable.
  function toUtterance(msg, me) {
    if (!msg || msg.isDraft) return null;
    const fa = msg.from && msg.from.emailAddress;
    const from = channel.party({ channel: 'outlook', name: fa && fa.name, email: fa && fa.address });
    if (!from.email) return null;
    const own = Boolean(me) && from.email === channel.normalizeEmail(me);
    const raw = msg.body && msg.body.content != null ? (String(msg.body.contentType).toLowerCase() === 'html' ? htmlToText(msg.body.content) : String(msg.body.content)) : String(msg.bodyPreview || '');
    const ts = Date.parse(msg.sentDateTime || msg.receivedDateTime || '');
    return channel.utterance({ channel: 'outlook', thread: msg.conversationId, id: msg.id, ts: Number.isFinite(ts) ? ts : null, direction: own ? 'out' : 'in', from: own ? Object.assign({}, from, { name: from.name }) : from, text: ownText(raw) });
  }

  // The other person of a conversation, from the messages in it (everyone but the mailbox owner, the most recent first).
  function counterpartOf(msgs, me) {
    const meE = channel.normalizeEmail(me);
    for (let i = (msgs || []).length - 1; i >= 0; i--) {
      const m = msgs[i];
      const recips = [(m.from && m.from.emailAddress)].concat((m.toRecipients || []).map((r) => r.emailAddress)).filter(Boolean);
      const other = recips.find((r) => channel.normalizeEmail(r.address) && channel.normalizeEmail(r.address) !== meE);
      if (other) return channel.party({ channel: 'outlook', name: other.name, email: other.address });
    }
    return null;
  }

  return { htmlToText, ownText, toUtterance, counterpartOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowGraphMail };
