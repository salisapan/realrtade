// The parts of reading Slack on the web that need no DOM: which conversation the address is, whether it is a one-to-one direct
// message, and what the message timestamps say. Pure functions, tested in test/slack-corpus.cjs; src/content-slack.js feeds them from
// the page. Same stance as WhatsApp: ONE-TO-ONE direct messages only (never a channel, a group direct message or a thread), read-only,
// and only to see whether something you asked was answered.
const FlowSlackParse = (() => {
  // https://app.slack.com/client/<team>/<conversation>[/thread/...]. A one-to-one direct message has a conversation id that starts with D.
  // A channel starts with C, a group direct message or a private channel with G.
  function parseUrl(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    if (!/(^|\.)slack\.com$/.test(u.hostname)) return null;
    // /client/<team>/dms is the DMs view. The open conversation id is not in the path.
    const dms = /^\/client\/([A-Z0-9]+)\/dms\/?$/i.exec(u.pathname);
    if (dms) return { team: dms[1], conversation: null, oneToOne: false, inThread: false, needsDom: true, view: 'dms' };
    const m = /^\/client\/([A-Z0-9]+)\/([A-Z0-9]+)(\/thread\/.*)?\/?$/.exec(u.pathname);
    if (!m) return null;
    return { team: m[1], conversation: m[2], oneToOne: /^D/.test(m[2]), inThread: Boolean(m[3]), needsDom: false, view: 'client' };
  }

  // A direct-message id from the selected sidebar row or the message pane. Channels and groups are not taken.
  function conversationIdFrom(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    for (let i = 0; i < list.length; i++) {
      const id = String(list[i] || '').trim();
      if (/^D[A-Z0-9]+$/.test(id)) return id;
    }
    return '';
  }

  // The DMs view borrows the open conversation from the DOM. A /D… address already has it.
  function resolveConversation(parsed, domId) {
    if (!parsed) return null;
    if (!parsed.needsDom) return parsed;
    const id = conversationIdFrom(domId);
    if (!id) return Object.assign({}, parsed, { conversation: null, oneToOne: false, unresolved: true });
    return Object.assign({}, parsed, { conversation: id, oneToOne: true, unresolved: false, needsDom: false });
  }

  // Slack's message timestamp "1700000000.000100": seconds since the epoch, then a counter that makes it unique in its conversation.
  function parseTs(ts) {
    const m = /^(\d{9,11})\.(\d{6})$/.exec(String(ts || ''));
    return m ? { ms: Number(m[1]) * 1000, id: m[1] + '.' + m[2] } : null;
  }

  // A stable thread id for the conversation.
  function threadIdFor(url) {
    const p = typeof url === 'string' ? parseUrl(url) : url;
    return p && p.oneToOne && p.conversation ? 'slack:' + p.team + ':' + p.conversation : null;
  }

  // localConfig_v2 or a boot blob. Only a user id comes back. Tokens stay in the object.
  function selfIdFromStore(raw, team) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch (e) { data = null; }
    }
    if (!data || typeof data !== 'object') return '';
    const teams = data.teams && typeof data.teams === 'object' ? data.teams : data;
    const row = team && teams[team] && typeof teams[team] === 'object' ? teams[team] : null;
    const candidates = [];
    if (row) candidates.push(row.user_id, row.userId, row.user && row.user.id, row.user && row.user.user_id);
    candidates.push(data.user_id, data.userId);
    for (let i = 0; i < candidates.length; i++) {
      const id = String(candidates[i] || '').trim();
      if (/^U[A-Z0-9]+$/.test(id)) return id;
    }
    return '';
  }

  // Primary: the open DM's counterpart is the signed-in user. Title text is only a backup.
  function isSelfDm(signals) {
    const s = signals || {};
    const selfId = String(s.selfId || '').trim();
    const otherId = String(s.counterpartId || '').trim();
    if (selfId && otherId && selfId === otherId) return true;
    if (s.titleBlob && isSelfTitle(s.titleBlob)) return true;
    return false;
  }

  // Slack shows the sender once and then leaves it out of the messages that follow from the same person. Fill the blanks forward.
  function fillSenders(rows) {
    let last = null;
    return (rows || []).map((r) => { const name = (r && r.sender ? String(r.sender).trim() : '') || last; if (name) last = name; return Object.assign({}, r, { sender: name || null }); });
  }

  // In a one-to-one direct message there are two people. The conversation title is the other person, so a message from anyone else is yours.
  function isOwn(sender, title) {
    const norm = (s) => String(s || '').replace(/[​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const s = norm(sender), t = norm(title);
    if (!s || !t) return null;                       // cannot tell: the caller stays silent
    return s !== t;
  }

  function joinText(pieces) {
    return (pieces || []).filter((p) => p && !p.quoted).map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  }

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // A self direct message: Slack's header suffix "(you)", or the compose box that says you are writing to yourself.
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

  // The words Do It places in the compose box. Not a send.
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

  return { parseUrl, parseTs, threadIdFor, fillSenders, isOwn, joinText, isSelfTitle, isFyi, isAsk, selfDraft, conversationIdFrom, resolveConversation, selfIdFromStore, isSelfDm };
})();

if (typeof module !== 'undefined') module.exports = { FlowSlackParse };
