// Outlook on the web (OWA) reading-pane helpers. Portable: no chrome.*.
// Selectors are best-effort against outlook.live.com / outlook.office.com markup,
// which is not a public interface and can change without notice.
const FlowOwaParse = (() => {
  // Prefer ItemID / id / popout id from the URL hash or search.
  function itemIdFromUrl(href) {
    const raw = String(href || '');
    const patterns = [
      /[?&#]ItemID=([^&]+)/i,
      /[?&#]id=([^&]+)/i,
      /\/id\/([^/?#]+)/i,
      /restid=([^&]+)/i
    ];
    for (const re of patterns) {
      const m = raw.match(re);
      if (m && m[1]) {
        try { return decodeURIComponent(m[1]).replace(/\+/g, ' '); }
        catch (e) { return m[1]; }
      }
    }
    return null;
  }

  function textOf(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || '').replace(/\s+\n/g, '\n').trim();
  }

  // Normalize for matching against Graph/sync entries.
  function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normEmail(s) {
    const m = String(s || '').toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
    return m ? m[0] : norm(s);
  }

  function dayKey(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const s = String(v);
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  // Match an open-pane snapshot to a sync incoming/still-open entry.
  // Prefer Graph message id / internetMessageId / conversation id; else subject+sender (+ optional day).
  // OWA URL ItemID often differs from Graph id — subject fallback must still work.
  function matchEntry(pane, entries) {
    const list = entries || [];
    if (!pane || !list.length) return null;
    const paneId = pane.itemId || pane.messageId || null;
    const paneInternet = pane.internetMessageId || null;
    const paneConv = pane.conversationId || null;
    if (paneId) {
      const byId = list.find((e) => e && (
        e.messageId === paneId || e.outlookIncomingId === paneId || e.id === paneId ||
        e.internetMessageId === paneId
      ));
      if (byId) return byId;
    }
    if (paneInternet) {
      const byInternet = list.find((e) => e && (
        e.internetMessageId === paneInternet || e.messageId === paneInternet || e.outlookIncomingId === paneInternet
      ));
      if (byInternet) return byInternet;
    }
    if (paneConv) {
      const byConv = list.find((e) => e && (e.outlookConversationId === paneConv || e.conversationId === paneConv || e.threadId === 'ol:' + paneConv));
      if (byConv) return byConv;
    }
    const sub = norm(pane.subject);
    const from = normEmail(pane.senderEmail || pane.from);
    const paneDay = dayKey(pane.receivedDateTime || pane.date || pane.ts);
    if (!sub && !from) return null;
    let best = null;
    for (const e of list) {
      if (!e) continue;
      const esub = norm(e.subject);
      const efrom = normEmail((e.sender && e.sender.email) || (e.base && e.base.counterpart && e.base.counterpart.email) || e.from);
      if (sub && esub && sub !== esub && esub.indexOf(sub) < 0 && sub.indexOf(esub) < 0) continue;
      if (from && efrom && from !== efrom) continue;
      const eDay = dayKey(e.receivedDateTime || e.date || e.ts);
      if (paneDay && eDay && paneDay !== eDay) continue;
      best = e;
      break;
    }
    return best;
  }

  // Reading-pane message-body candidates (newest first). Used by the content script; fixtures pass a fake document.
  // Only message-body containers: the whole [role="main"] region also holds the message list, and judging that text would
  // be judging the inbox, not the open message.
  function readingPaneRoots(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelectorAll) return [];
    const sels = [
      '[role="main"] [aria-label="Message body"]',
      '[role="main"] [aria-label*="Message body"]',
      '[role="main"] [data-app-section="MessageBody"]',
      '[role="main"] .ReadingPaneContents',
      'div[aria-label="Message body"]',
      '[data-testid="message-body"]'
    ];
    const out = [];
    sels.forEach((sel) => {
      d.querySelectorAll(sel).forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    });
    return out;
  }

  const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

  function before(a, b) {
    if (!a || !b || a === b || typeof a.compareDocumentPosition !== 'function') return true;
    // 4 = DOCUMENT_POSITION_FOLLOWING: b comes after a.
    return Boolean(a.compareDocumentPosition(b) & 4);
  }

  // The part of the page that belongs to the open message: the nearest ancestor of the body that also holds a heading.
  function containerOf(bodyRoot, d) {
    let n = bodyRoot;
    for (let i = 0; n && i < 14; i++) {
      if (n.querySelector && n !== bodyRoot && n.querySelector('[role="heading"], h1, h2')) return n;
      n = n.parentElement;
    }
    return (d && d.querySelector && d.querySelector('[role="main"]')) || null;
  }

  // Sender of the open message: a mailto link, an element whose title/aria-label carries an address, or "Name <address>"
  // text in the message header, above the body, that is not one of the person's own addresses.
  function senderOf(container, bodyRoot, own) {
    const mine = new Set((own || []).map((a) => String(a || '').toLowerCase()));
    const ok = (e) => e && !mine.has(e);
    if (!container || !container.querySelectorAll) return { email: '', name: '' };
    const nodes = container.querySelectorAll('a[href^="mailto:"], [title*="@"], [aria-label*="@"], span, button');
    for (const n of nodes) {
      if (bodyRoot && (n === bodyRoot || (bodyRoot.contains && bodyRoot.contains(n)) || !before(n, bodyRoot))) continue;
      let email = '';
      let name = '';
      const href = n.getAttribute && n.getAttribute('href');
      if (href && /^mailto:/i.test(href)) { email = href.replace(/^mailto:/i, '').split('?')[0]; name = textOf(n); }
      if (!email) {
        const t = (n.getAttribute && (n.getAttribute('title') || n.getAttribute('aria-label'))) || '';
        const m = t.match(EMAIL_RE);
        if (m) {
          email = m[0];
          name = t.replace(m[0], '').replace(/[<>()"]/g, '').replace(/^(from|מאת)\s*:?\s*/i, '').trim();
          // OWA puts the address in the title and the display name in the text: <span title="dana@acme.com">Dana Cohen</span>.
          if (!name) { const shown = textOf(n); if (shown && !EMAIL_RE.test(shown) && shown.length <= 80) name = shown; }
        }
      }
      if (!email && n.children && n.children.length === 0) {
        const t = textOf(n);
        const m = t.match(/^(.{0,80}?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
        if (m) { email = m[2]; name = m[1].trim(); }
      }
      email = normEmail(email);
      if (EMAIL_RE.test(email) && ok(email)) return { email, name: name.slice(0, 80) };
    }
    return { email: '', name: '' };
  }

  // opts: { own: [addresses] } so the person's own address in the header is never taken for the sender.
  function readPane(doc, href, opts) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const roots = readingPaneRoots(d);
    const bodyRoot = roots[0] || null;
    if (!bodyRoot) return null; // no message body on screen: stay silent rather than read the message list
    const container = containerOf(bodyRoot, d);
    let subjectEl = null;
    if (container) {
      const heads = Array.prototype.slice.call(container.querySelectorAll('[role="heading"], h1, h2'));
      subjectEl = heads.find((h) => textOf(h) && before(h, bodyRoot) && !(bodyRoot.contains && bodyRoot.contains(h))) || heads.find((h) => textOf(h)) || null;
    }
    if (!subjectEl) subjectEl = d.querySelector('[role="main"] [role="heading"]') || d.querySelector('[role="main"] h1, [role="main"] h2');
    const subject = textOf(subjectEl).split('\n')[0].trim();
    const who = senderOf(container, bodyRoot, opts && opts.own);
    const body = textOf(bodyRoot.querySelector('.AllowTextSelection, [class*="UniqueMessageBody"]')) || textOf(bodyRoot);
    if (!subject && !body) return null;
    return {
      itemId: itemIdFromUrl(href || (typeof location !== 'undefined' ? location.href : '')),
      subject: subject,
      senderEmail: who.email,
      senderName: who.name,
      text: body,
      conversationId: null
    };
  }

  return { itemIdFromUrl, matchEntry, readingPaneRoots, readPane, senderOf, norm, normEmail, textOf, dayKey };
})();

if (typeof module !== 'undefined') module.exports = { FlowOwaParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowOwaParse = FlowOwaParse;
