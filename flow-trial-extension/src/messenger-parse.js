// Messenger on the web (messenger.com and facebook.com/messages). Pure checks: which
// address is a direct conversation, and which titles are a group. The content script
// reads the page. This file does not type or send.
const FlowMessengerParse = (() => {
  function page(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'messenger.com') return { host: 'messenger' };
    if (host === 'facebook.com' && (u.pathname === '/messages' || u.pathname.indexOf('/messages/') === 0)) return { host: 'messenger' };
    return null;
  }

  function isGroupTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/\d+\s+participants/i.test(t) || /קבוצה|משתתפים/.test(t)) return true;
    if (/\band\b.+\band\b/i.test(t)) return true;
    if (/,\s*.+,/.test(t)) return true;
    return false;
  }

  function authorOf(row) {
    const a = row && row.author;
    if (a === 'me' || a === 'them') return a;
    const label = String(row && row.label || '');
    if (/^you(?: sent|:)/i.test(label)) return 'me';
    if (row && row.outgoing) return 'me';
    if (row && row.incoming) return 'them';
    return null;
  }

  function joinText(pieces) {
    return (pieces || []).filter((p) => p && !p.quoted).map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  }

  function threadIdFor(href, title) {
    const where = page(href);
    if (!where) return null;
    let path = '';
    try { path = new URL(String(href)).pathname; } catch (e) { path = ''; }
    const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return 'ms:' + (path || name || 'open');
  }

  return { page, isGroupTitle, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowMessengerParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowMessengerParse = FlowMessengerParse;
