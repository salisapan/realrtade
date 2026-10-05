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

  // The ids an OWA address carries. outlook.live.com/mail/0/inbox/id/<id>: with conversation view on (the default) <id> is
  // the CONVERSATION id (AQQk… personal, AAQk… work), otherwise a message id (AQMk… / AAMk…). Same strings Graph returns
  // in conversationId / id, up to the base64 alphabet (REST ids use - and _, EWS ids + and /) and URL encoding.
  function urlIds(href) {
    const raw = String(href || '');
    let id = null;
    const m = raw.match(/\/id\/([^/?#&]+)/i) || raw.match(/[?&#]ItemID=([^&#]+)/i) || raw.match(/[?&#]id=([^&#]+)/i) || raw.match(/restid=([^&#]+)/i);
    if (m && m[1]) { try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; } }
    if (!id) return { itemId: null, conversationId: null, kind: null };
    const conv = /^A[AQ]Qk/.test(id);
    return { itemId: conv ? null : id, conversationId: conv ? id : null, kind: conv ? 'conversation' : 'message', raw: id };
  }

  // One spelling for an Exchange id, whatever alphabet and padding it arrived in.
  function canonId(id) {
    if (!id) return '';
    let s = String(id);
    try { s = decodeURIComponent(s); } catch (e) { /* already decoded */ }
    return s.replace(/^ol:/, '').replace(/[+\-]/g, '-').replace(/[/_]/g, '_').replace(/=+$/, '').trim();
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

  // Match an open-pane snapshot to a sync incoming/still-open entry: { entry, how } or null.
  // 1. the message id in the URL, 2. the internet message id, 3. the conversation id in the URL (OWA's default address),
  // 4. subject + sender (+ received day). Ids are compared in one canonical spelling (canonId).
  function matchEntryHow(pane, entries) {
    const list = (entries || []).filter(Boolean);
    if (!pane || !list.length) return null;
    const ids = (e) => [e.messageId, e.outlookIncomingId, e.id].map(canonId).filter(Boolean);
    const convs = (e) => [e.outlookConversationId, e.conversationId, e.threadId, e.base && e.base.threadId].map(canonId).filter(Boolean);
    const paneId = canonId(pane.itemId || pane.messageId);
    if (paneId) {
      const hit = list.find((e) => ids(e).indexOf(paneId) >= 0 || canonId(e.internetMessageId) === paneId);
      if (hit) return { entry: hit, how: 'message id' };
    }
    const paneInternet = canonId(pane.internetMessageId);
    if (paneInternet) {
      const hit = list.find((e) => canonId(e.internetMessageId) === paneInternet);
      if (hit) return { entry: hit, how: 'internet message id' };
    }
    const paneConv = canonId(pane.conversationId);
    if (paneConv) {
      // Several entries of one conversation: the newest ask in it.
      const hits = list.filter((e) => convs(e).indexOf(paneConv) >= 0);
      if (hits.length) {
        hits.sort((a, b) => (Date.parse(b.receivedDateTime || 0) || 0) - (Date.parse(a.receivedDateTime || 0) || 0));
        return { entry: hits.find((e) => e.process && !e.outlookReceipt) || hits[0], how: 'conversation id' };
      }
    }
    const sub = norm(stripPrefix(pane.subject));
    const from = pane.senderEmail || pane.from ? normEmail(pane.senderEmail || pane.from) : '';
    const paneDay = dayKey(pane.receivedDateTime || pane.date || pane.ts);
    if (!sub) return null; // a sender alone is not enough: the same person may have several asks open
    for (const e of list) {
      const esub = norm(stripPrefix(e.subject));
      const efrom = normEmail((e.sender && e.sender.email) || (e.base && e.base.counterpart && e.base.counterpart.email) || e.from);
      if (!esub || (sub !== esub && esub.indexOf(sub) < 0 && sub.indexOf(esub) < 0)) continue;
      if (from && efrom && from !== efrom) continue;
      const eDay = dayKey(e.receivedDateTime || e.date || e.ts);
      if (paneDay && eDay && paneDay !== eDay) continue;
      return { entry: e, how: from ? 'subject and sender' : 'subject' };
    }
    return null;
  }

  function matchEntry(pane, entries) {
    const r = matchEntryHow(pane, entries);
    return r ? r.entry : null;
  }

  function stripPrefix(s) {
    return String(s || '').replace(/^\s*((re|fw|fwd|השב|העבר|תשובה)\s*:\s*)+/i, '');
  }

  // Reading-pane message-body candidates (newest first). Used by the content script; fixtures pass a fake document.
  // Only message-body containers: the whole [role="main"] region also holds the message list, and judging that text would
  // be judging the inbox, not the open message.
  function readingPaneRoots(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelectorAll) return [];
    // Language-neutral anchors first: OWA localizes aria-label ("Message body" is "גוף ההודעה" in Hebrew), so a label
    // can only ever be a last resort. The body is div[role="document"] inside the reading pane; class names carrying
    // allowTextSelection / UniqueMessageBody are older and newer OWA builds.
    const sels = [
      '#ReadingPaneContainerId div[role="document"]',
      '[role="main"] div[role="document"]',
      'div[role="document"].allowTextSelection',
      '[role="main"] [class*="allowTextSelection"]',
      '[role="main"] [id^="UniqueMessageBody"]',
      '[role="main"] [class*="UniqueMessageBody"]',
      '[role="main"] [data-app-section="MessageBody"]',
      '[role="main"] [aria-label="Message body"]',
      '[role="main"] [aria-label*="Message body"]',
      '[role="main"] .ReadingPaneContents',
      'div[aria-label="Message body"]',
      '[data-testid="message-body"]'
    ];
    const out = [];
    sels.forEach((sel) => {
      let found = [];
      try { found = d.querySelectorAll(sel); } catch (e) { found = []; }
      found.forEach((n) => {
        if (out.indexOf(n) >= 0) return;
        // Never the message list, and never a reply being written.
        if (n.closest && (n.closest('[role="listbox"], [role="list"], [role="grid"], [role="tree"]') || n.closest('[contenteditable="true"]'))) return;
        if (n.getAttribute && n.getAttribute('contenteditable') === 'true') return;
        // A body wrapper that contains another candidate: keep the inner one only.
        for (let i = out.length - 1; i >= 0; i--) { if (n.contains && n.contains(out[i])) return; if (out[i].contains && out[i].contains(n)) out.splice(i, 1); }
        out.push(n);
      });
    });
    return out;
  }

  // Which anchor found the body, for the debug log.
  function rootsReport(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelectorAll) return {};
    const q = (sel) => { try { return d.querySelectorAll(sel).length; } catch (e) { return -1; } };
    return { main: q('[role="main"]'), document: q('div[role="document"]'), readingPane: q('#ReadingPaneContainerId'), allowTextSelection: q('[class*="allowTextSelection"]'), headings: q('[role="heading"]') };
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
    const ids = urlIds(href || (typeof location !== 'undefined' ? location.href : ''));
    return {
      itemId: ids.itemId,
      conversationId: ids.conversationId,
      idKind: ids.kind,
      subject: subject,
      senderEmail: who.email,
      senderName: who.name,
      text: body
    };
  }

  return { itemIdFromUrl, urlIds, canonId, matchEntry, matchEntryHow, readingPaneRoots, rootsReport, readPane, senderOf, norm, normEmail, textOf, dayKey };
})();

if (typeof module !== 'undefined') module.exports = { FlowOwaParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowOwaParse = FlowOwaParse;
