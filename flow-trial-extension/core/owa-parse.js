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

  // Match an open-pane snapshot to a sync incoming/still-open entry.
  // Prefer Graph message id / conversation id; else subject+sender (+ optional day).
  function matchEntry(pane, entries) {
    const list = entries || [];
    if (!pane || !list.length) return null;
    const paneId = pane.itemId || pane.messageId || null;
    const paneConv = pane.conversationId || null;
    if (paneId) {
      const byId = list.find((e) => e && (e.messageId === paneId || e.outlookIncomingId === paneId || e.id === paneId));
      if (byId) return byId;
    }
    if (paneConv) {
      const byConv = list.find((e) => e && (e.outlookConversationId === paneConv || e.conversationId === paneConv || e.threadId === 'ol:' + paneConv));
      if (byConv) return byConv;
    }
    const sub = norm(pane.subject);
    const from = normEmail(pane.senderEmail || pane.from);
    if (!sub && !from) return null;
    let best = null;
    for (const e of list) {
      if (!e) continue;
      const esub = norm(e.subject);
      const efrom = normEmail((e.sender && e.sender.email) || (e.base && e.base.counterpart && e.base.counterpart.email) || e.from);
      if (sub && esub && sub !== esub && esub.indexOf(sub) < 0 && sub.indexOf(esub) < 0) continue;
      if (from && efrom && from !== efrom) continue;
      best = e;
      break;
    }
    return best;
  }

  // Reading-pane root candidates (newest first). Used by the content script;
  // fixtures pass a fake document.
  function readingPaneRoots(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelectorAll) return [];
    const sels = [
      '[role="main"] [aria-label*="Message body"]',
      '[role="main"] [data-app-section="MessageBody"]',
      '[role="main"] .ReadingPaneContents',
      '[role="main"] [class*="ReadingPane"]',
      'div[aria-label="Message body"]',
      '[data-testid="message-body"]'
    ];
    const out = [];
    sels.forEach((sel) => {
      d.querySelectorAll(sel).forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    });
    return out;
  }

  function readPane(doc, href) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const roots = readingPaneRoots(d);
    const root = roots[0] || d.querySelector('[role="main"]');
    if (!root) return null;
    // Subject: heading near the reading pane
    const subjectEl =
      d.querySelector('[role="main"] [role="heading"]') ||
      d.querySelector('[role="main"] h1, [role="main"] h2') ||
      root.querySelector('[role="heading"]');
    const subject = textOf(subjectEl);
    // Sender: mailto link or aria person button
    let senderEmail = '';
    let senderName = '';
    const mail = d.querySelector('[role="main"] a[href^="mailto:"]');
    if (mail) {
      senderEmail = (mail.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0];
      senderName = textOf(mail);
    }
    const body =
      textOf(root.querySelector('.AllowTextSelection, [aria-label*="Message body"], [class*="UniqueMessageBody"]')) ||
      textOf(root);
    if (!subject && !body) return null;
    return {
      itemId: itemIdFromUrl(href || (typeof location !== 'undefined' ? location.href : '')),
      subject: subject,
      senderEmail: senderEmail,
      senderName: senderName,
      text: body,
      conversationId: null
    };
  }

  return { itemIdFromUrl, matchEntry, readingPaneRoots, readPane, norm, normEmail, textOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowOwaParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowOwaParse = FlowOwaParse;
