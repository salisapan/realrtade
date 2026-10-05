// Outlook mail as plain utterances, from Microsoft's own mail API (Microsoft Graph). Portable: no chrome.*, no DOM, no network.
//
// This is the stable way into Outlook: an official API with a documented message shape, rather than reading Outlook's page, whose
// markup is not a public interface. This file only turns a Graph message into core/channel.js's utterance and strips the quoted
// history, so that every rule that works on an email (core/follow-up.js) works on it.
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

  // Only what the sender wrote THIS time: cut at the first line that starts the quoted history.
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

  // me may be a string (one address, backward compatible) or a Set/array of normalized addresses.
  function meSetOf(me) {
    if (!me) return null;
    if (me instanceof Set) return me;
    if (Array.isArray(me)) {
      const s = new Set();
      me.forEach((a) => { const e = channel.normalizeEmail(a); if (e) s.add(e); });
      return s.size ? s : null;
    }
    const e = channel.normalizeEmail(me);
    return e ? new Set([e]) : null;
  }

  function isOwn(email, meSet) {
    if (!meSet || !email) return false;
    return meSet.has(channel.normalizeEmail(email));
  }

  // msg: a Graph message resource (may carry _folder from the runner). me: string | Set | array.
  // direction 'out' if the message came from sentitems OR its from-address is in meSet; otherwise 'in'.
  function toUtterance(msg, me) {
    if (!msg || msg.isDraft) return null;
    const fa = msg.from && msg.from.emailAddress;
    const from = channel.party({ channel: 'outlook', name: fa && fa.name, email: fa && fa.address });
    if (!from.email) return null;
    const meSet = meSetOf(me);
    const fromSent = msg._folder === 'sentitems';
    const own = fromSent || isOwn(from.email, meSet);
    const raw = msg.body && msg.body.content != null ? (String(msg.body.contentType).toLowerCase() === 'html' ? htmlToText(msg.body.content) : String(msg.body.content)) : String(msg.bodyPreview || '');
    const ts = Date.parse(msg.sentDateTime || msg.receivedDateTime || '');
    return channel.utterance({ channel: 'outlook', thread: msg.conversationId, id: msg.id, ts: Number.isFinite(ts) ? ts : null, direction: own ? 'out' : 'in', from: own ? Object.assign({}, from, { name: from.name }) : from, text: ownText(raw) });
  }

  // The other person of a conversation: everyone but addresses in meSet. A conversation whose parties are all in meSet (note to self) yields null.
  function counterpartOf(msgs, me) {
    const meSet = meSetOf(me) || new Set();
    for (let i = (msgs || []).length - 1; i >= 0; i--) {
      const m = msgs[i];
      const recips = [(m.from && m.from.emailAddress)].concat((m.toRecipients || []).map((r) => r.emailAddress)).filter(Boolean);
      const other = recips.find((r) => channel.normalizeEmail(r.address) && !isOwn(r.address, meSet));
      if (other) return channel.party({ channel: 'outlook', name: other.name, email: other.address });
    }
    return null;
  }

  // Build the own-address set from profile fields + optional learned sentitems senders.
  // Ignores empty / refused fields. proxyAddresses entries starting with smtp: (case-insensitive) are included.
  function ownAddressesFrom(profile, learned) {
    const s = new Set();
    function add(a) {
      const e = channel.normalizeEmail(a);
      if (e) s.add(e);
    }
    const p = profile || {};
    add(p.mail);
    add(p.userPrincipalName);
    (p.otherMails || []).forEach(add);
    (p.proxyAddresses || []).forEach((raw) => {
      const m = String(raw || '').match(/^smtp:(.+)$/i);
      if (m) add(m[1]);
    });
    (learned || []).forEach(add);
    return s;
  }

  // Learn mailbox aliases from fetched mail when /me lacks them (common on personal MSA).
  // - sentitems from-address
  // - inbox toRecipient that is not the sender (safe heuristic: an address that receives
  //   inbox mail and is not the sender counts as me)
  function learnOwnFromMessages(inbox, sent) {
    const out = [];
    const seen = new Set();
    function add(a) {
      const e = channel.normalizeEmail(a);
      if (!e || seen.has(e)) return;
      seen.add(e);
      out.push(e);
    }
    (sent || []).forEach((m) => {
      const a = m && m.from && m.from.emailAddress && m.from.emailAddress.address;
      if (a) add(a);
    });
    // Inbox: prefer sole toRecipient (≠ sender). Multi-recipient rows only count
    // toward a frequency vote so we do not treat every CC/To coworker as me.
    const freq = Object.create(null);
    (inbox || []).forEach((m) => {
      if (!m) return;
      const from = channel.normalizeEmail(m.from && m.from.emailAddress && m.from.emailAddress.address);
      const tos = (m.toRecipients || []).map((r) => channel.normalizeEmail(r && r.emailAddress && r.emailAddress.address)).filter((e) => e && e !== from);
      if (tos.length === 1) add(tos[0]);
      tos.forEach((e) => { freq[e] = (freq[e] || 0) + 1; });
    });
    Object.keys(freq).forEach((e) => { if (freq[e] >= 2) add(e); });
    return out;
  }

  // Prefer a non-UPN mailbox alias as primary when we have one (outlook.com etc.),
  // else the most common inbox-received address, else first learned, else profile mail/UPN.
  function pickPrimary(ownList, profile, inboxLearned) {
    const list = (ownList || []).map((a) => channel.normalizeEmail(a)).filter(Boolean);
    const inboxSet = new Set((inboxLearned || []).map((a) => channel.normalizeEmail(a)).filter(Boolean));
    const alias = list.find((e) => inboxSet.has(e) && !/@gmail\.com$/i.test(e));
    if (alias) return alias;
    const inboxFirst = (inboxLearned || []).map((a) => channel.normalizeEmail(a)).filter(Boolean)[0];
    if (inboxFirst) return inboxFirst;
    const p = profile || {};
    const mail = channel.normalizeEmail(p.mail);
    if (mail) return mail;
    return list[0] || channel.normalizeEmail(p.userPrincipalName) || null;
  }

  return { htmlToText, ownText, toUtterance, counterpartOf, meSetOf, ownAddressesFrom, isOwn, learnOwnFromMessages, pickPrimary };
})();

if (typeof module !== 'undefined') module.exports = { FlowGraphMail };
