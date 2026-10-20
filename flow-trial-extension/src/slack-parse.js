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
    const m = /^\/client\/([A-Z0-9]+)\/([A-Z0-9]+)(\/thread\/.*)?\/?$/.exec(u.pathname);
    if (!m) return null;
    return { team: m[1], conversation: m[2], oneToOne: /^D/.test(m[2]), inThread: Boolean(m[3]) };
  }

  // Slack's message timestamp "1700000000.000100": seconds since the epoch, then a counter that makes it unique in its conversation.
  function parseTs(ts) {
    const m = /^(\d{9,11})\.(\d{6})$/.exec(String(ts || ''));
    return m ? { ms: Number(m[1]) * 1000, id: m[1] + '.' + m[2] } : null;
  }

  // A stable thread id for the conversation.
  function threadIdFor(url) {
    const p = typeof url === 'string' ? parseUrl(url) : url;
    return p && p.oneToOne ? 'slack:' + p.team + ':' + p.conversation : null;
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

  return { parseUrl, parseTs, threadIdFor, fillSenders, isOwn, joinText };
})();

if (typeof module !== 'undefined') module.exports = { FlowSlackParse };
