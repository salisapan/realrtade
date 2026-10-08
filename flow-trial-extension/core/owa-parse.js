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
    // AQQk / AAQk, in either case. Outlook's address often uppercases the id
    // (AQQK… / AAQK…). That string is the conversation id, not a message id.
    const conv = /^A[AQ]Qk/i.test(id);
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
    const hits = [];
    for (const e of list) {
      const esub = norm(stripPrefix(e.subject));
      const efrom = normEmail((e.sender && e.sender.email) || (e.base && e.base.counterpart && e.base.counterpart.email) || e.from);
      if (!esub || esub !== sub) continue;
      if (from && efrom && from !== efrom) continue;
      // No address on the page (OWA keeps it in a hover card): the display name has to agree instead.
      const pname = norm(pane.senderName), ename = norm((e.sender && e.sender.name) || (e.base && e.base.counterpart && e.base.counterpart.name));
      if (!from && pname && ename && pname !== ename) continue;
      const eDay = dayKey(e.receivedDateTime || e.date || e.ts);
      if (paneDay && eDay && paneDay !== eDay) continue;
      hits.push(e);
    }
    if (hits.length !== 1) return null;
    // A receipt belongs to the message that wrote it. Subject and sender
    // are not that message when two mails share them.
    if (hits[0].outlookReceipt && !hits[0].process) return null;
    const pname = norm(pane.senderName);
    const ename = norm((hits[0].sender && hits[0].sender.name) || (hits[0].base && hits[0].base.counterpart && hits[0].base.counterpart.name));
    return { entry: hits[0], how: from ? 'subject and sender' : (pname && ename ? 'subject and sender name' : 'subject') };
  }

  // UTC minute. A page clock and a Graph receivedDateTime match on this, or not at all.
  function minuteKey(v) {
    if (v == null || v === '') return '';
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  }

  function attachmentSig(list) {
    const rows = [];
    (list || []).forEach((a) => {
      if (!a) return;
      const name = norm(a.name || a.filename || '');
      const size = typeof a.size === 'number' ? a.size : Number(a.size);
      if (!name || !isFinite(size)) return;
      rows.push(name + '|' + size);
    });
    rows.sort();
    return rows.join('\n');
  }

  // Outlook prints "3 KB", not the byte count. Round and ceil both count,
  // because the live chip and Graph disagree on which one they use.
  function shownSizeLabels(bytes) {
    const out = [];
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return out;
    if (bytes < 1024) { out.push(bytes + ' B'); return out; }
    if (bytes < 1024 * 1024) {
      const kb = bytes / 1024;
      out.push(Math.max(1, Math.round(kb)) + ' KB');
      out.push(Math.max(1, Math.ceil(kb - 1e-9)) + ' KB');
      return out;
    }
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) {
      const rounded = Math.round(mb * 10) / 10;
      const text = (rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded)) + ' MB';
      out.push(text);
      out.push(Math.max(1, Math.ceil(mb - 1e-9)) + ' MB');
      return out;
    }
    const gb = mb / 1024;
    const rounded = Math.round(gb * 10) / 10;
    out.push((rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded)) + ' GB');
    return out;
  }

  function fileRows(list) {
    const rows = [];
    (list || []).forEach((a) => {
      if (!a) return;
      const name = norm(a.name || a.filename || '');
      if (!name) return;
      let size = null;
      if (typeof a.size === 'number' && isFinite(a.size)) size = a.size;
      else if (a.size != null && a.size !== '' && isFinite(Number(a.size))) size = Number(a.size);
      rows.push({ name: name, size: size, label: norm(a.sizeLabel || a.sizeText || '').replace(/\s+/g, '') });
    });
    rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.size || 0) - (b.size || 0)));
    return rows;
  }

  // A chip that OWA has cut down ("…hwind-agreement-signed.pdf", "t-q3-alpha.pdf")
  // still names the Graph file when the visible piece is a prefix or a suffix.
  function nameFragment(name) {
    return norm(String(name || '')).replace(/^[\u2026\u2025.]+/, '').replace(/[\u2026\u2025.]+$/, '').trim();
  }

  function namesAgree(a, b) {
    const left = nameFragment(a);
    const right = nameFragment(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const short = left.length <= right.length ? left : right;
    const long = left.length <= right.length ? right : left;
    if (short.length < 12) return false;
    return long.endsWith(short) || long.startsWith(short);
  }

  // 'yes' names and sizes agree, including a KB label and a truncated name.
  // 'no' they disagree. 'unknown' the pane did not show a file.
  // A missing size is not a disagreement: the chip could not be read.
  function fileRelation(paneList, graphList) {
    const pane = fileRows(paneList);
    const graph = fileRows(graphList);
    if (!pane.length) return 'unknown';
    if (!graph.length || pane.length !== graph.length) return 'no';
    for (let i = 0; i < pane.length; i++) {
      if (!namesAgree(pane[i].name, graph[i].name)) return 'no';
      if (pane[i].size != null) {
        if (pane[i].size !== graph[i].size) return 'no';
        continue;
      }
      if (!pane[i].label) continue;
      if (graph[i].size == null) return 'no';
      const forms = shownSizeLabels(graph[i].size).map((s) => norm(s).replace(/\s+/g, ''));
      if (forms.indexOf(pane[i].label) < 0) return 'no';
    }
    return 'yes';
  }

  function filesAgree(paneList, graphList) {
    return fileRelation(paneList, graphList) === 'yes';
  }

  function subjectKey(s) {
    return norm(stripPrefix(s));
  }

  function graphSender(m) {
    return normEmail(
      (m && m.from && m.from.emailAddress && m.from.emailAddress.address)
      || (m && m.senderEmail)
      || (m && m.sender && (m.sender.email || m.sender.address))
      || ''
    );
  }

  function sameSubject(pane, m) {
    const ps = subjectKey(pane && pane.subject);
    const ms = subjectKey(m && m.subject);
    if (!ps || ps !== ms) return false;
    const open = normEmail(pane && pane.senderEmail);
    const from = graphSender(m);
    if (open && from && open !== from) return false;
    return true;
  }

  function idHit(pane, m) {
    const paneConv = canonId(pane && pane.conversationId);
    const paneNet = canonId(pane && pane.internetMessageId);
    const convOk = paneConv && canonId(m.conversationId) === paneConv;
    const netOk = paneNet && canonId(m.internetMessageId) === paneNet;
    return Boolean(convOk || netOk);
  }

  // One subject and sender is not enough. That mail links only when the
  // query already covered the mailbox and one confirming signal holds: the
  // open conversation or internet id, or a filename visible on the page that
  // is on that message. A filename corroborates only when nothing conflicts.
  // A conversation id, an internet message id, or a parsed clock that does
  // not match the candidate stays unresolved, even when the filename matches.
  // An empty chip with no id stays unresolved. A failed attachment read is
  // unknown, not an empty list. Several mails are split by the minute and
  // the attachment, after an unmarked 1–12 hour is settled. A file that
  // does not match is never the one saved.
  function proved24h(pane) {
    if (!pane) return false;
    if (pane.timeFormat === 'HH:mm') return true;
    const cycle = String(pane.hourCycle || '');
    if (cycle === 'h23' || cycle === 'h24') return true;
    return pane.pageHour24 === true;
  }

  function altMinuteOf(pane, minute) {
    if (!pane) return '';
    if (pane.clockAlt) return minuteKey(pane.clockAlt) || '';
    if (!minute || !pane.receivedDateTime) return '';
    const d = new Date(pane.receivedDateTime);
    if (isNaN(d.getTime())) return '';
    // Unmarked 12 is noon or midnight. Every other ambiguous hour is +12.
    if (d.getHours() === 12) d.setHours(0);
    else d.setHours(d.getHours() + 12);
    return minuteKey(d.toISOString()) || '';
  }

  // A missing id is not a conflict. Both sides have to carry it, and differ.
  function idConflict(pane, m) {
    const paneConv = canonId(pane && pane.conversationId);
    const msgConv = canonId(m && m.conversationId);
    if (paneConv && msgConv && paneConv !== msgConv) return 'conversation';
    const paneNet = canonId(pane && pane.internetMessageId);
    const msgNet = canonId(m && m.internetMessageId);
    if (paneNet && msgNet && paneNet !== msgNet) return 'internet';
    return '';
  }

  // A parsed clock conflicts when the candidate minute is neither the literal
  // minute nor the other half of an ambiguous hour. No clock on either side
  // is not a conflict.
  function clockConflict(pane, m, minute) {
    const got = minuteKey(m && m.receivedDateTime);
    if (!minute || !got || got === minute) return '';
    if (pane && pane.clockAmbiguous) {
      const alt = altMinuteOf(pane, minute);
      if (alt && got === alt) return '';
    }
    return 'clock';
  }

  function uniqueGraphMessage(pane, messages) {
    const list = (messages || []).filter(Boolean);
    const minute = minuteKey(pane && (pane.receivedDateTime || pane.date)) || '';
    function pack(message, why) {
      const detail = why + ' minute=' + (minute || 'none') + ' n=' + list.length;
      if (!message) return { message: null, reason: 'suggest:unresolved', detail: detail };
      return { message: message, reason: null, detail: detail };
    }
    function confirmOne(one, why) {
      if (!one) return pack(null, why || 'no-hit');
      if (one.attachmentsUnread) return pack(null, 'attachments-unknown');
      const conflict = idConflict(pane, one) || clockConflict(pane, one, minute);
      if (conflict) return pack(null, (why || 'subject-unique') + ' conflict-' + conflict);
      const rel = fileRelation(pane && pane.attachments, one.attachments || one.files);
      if (rel === 'no') return pack(null, (why || 'subject-unique') + ' file-disagree');
      if (idHit(pane, one) || rel === 'yes') return pack(one, why || 'subject-unique');
      return pack(null, (why || 'subject-unique') + ' unconfirmed');
    }
    const sub = subjectKey(pane && pane.subject);
    const bySubject = sub ? list.filter((m) => sameSubject(pane, m)) : [];
    if (bySubject.length === 1) return confirmOne(bySubject[0], 'subject-unique');
    let pool = bySubject.length ? bySubject : list.filter((m) => idHit(pane, m));
    if (!pool.length) return pack(null, 'no-hit');
    const unread = pool.filter((m) => m.attachmentsUnread);
    if (unread.length) {
      const idMatched = pool.filter((m) => idHit(pane, m) && !m.attachmentsUnread);
      if (idMatched.length === 1) pool = idMatched;
      else return pack(null, 'attachments-unknown');
    }
    // A clock was on the page and did not parse (a one-digit hour with no
    // AM/PM). Several mails stay unresolved. The file must not guess.
    if (pane && pane.clockUnread && pool.length > 1) return pack(null, 'clock-unread');
    // "10:05" with no marker is 10:05 only when 22:05 is not also a candidate,
    // or when the mailbox is known to be 24-hour. Unmarked "12:05" is the
    // same choice against "00:05". The file must not pick the hour.
    if (pane && pane.clockAmbiguous && minute) {
      const alt = altMinuteOf(pane, minute);
      const hasLit = pool.some((m) => minuteKey(m.receivedDateTime) === minute);
      const hasAlt = Boolean(alt) && pool.some((m) => minuteKey(m.receivedDateTime) === alt);
      if (hasLit && hasAlt && !proved24h(pane)) return pack(null, 'hour-ambiguous');
      if (proved24h(pane)) {
        const timed = pool.filter((m) => minuteKey(m.receivedDateTime) === minute);
        if (!timed.length) return pack(null, 'minute-miss');
        pool = timed;
      } else if (hasLit && !hasAlt) {
        pool = pool.filter((m) => minuteKey(m.receivedDateTime) === minute);
      } else if (!hasLit && hasAlt) {
        pool = pool.filter((m) => minuteKey(m.receivedDateTime) === alt);
      } else if (!hasLit && !hasAlt) {
        return pack(null, 'minute-miss');
      }
    } else if (minute) {
      const timed = pool.filter((m) => minuteKey(m.receivedDateTime) === minute);
      if (!timed.length) return pack(null, 'minute-miss');
      pool = timed;
    }
    // The hour gate has already kept both halves of an ambiguous clock.
    // An id that disagrees is still a conflict, and it outweighs a filename.
    const agreedId = pool.filter((m) => !idConflict(pane, m));
    if (pool.length && !agreedId.length) return pack(null, 'id-conflict');
    pool = agreedId;
    if (fileRows(pane && pane.attachments).length) {
      const agreed = pool.filter((m) => fileRelation(pane.attachments, m.attachments || m.files) === 'yes');
      if (agreed.length === 1) return pack(agreed[0], 'time-file');
      if (!agreed.length) return pack(null, 'file-miss');
      return pack(null, 'file-ambiguous');
    }
    if (pool.length === 1) return pack(pool[0], 'single');
    return pack(null, 'ambiguous');
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
      '[aria-label="גוף ההודעה"]',
      '#ReadingPaneContainerId [aria-label="גוף ההודעה"]',
      '#ReadingPaneContainerId [class*="MessageBody"]',
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
    if (!out.length) {
      const pane = d.querySelector('#ReadingPaneContainerId');
      if (pane && !(pane.closest && pane.closest('[role="listbox"], [role="list"], [role="grid"], [role="tree"]'))) out.push(pane);
    }
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
      if (EMAIL_RE.test(email) && ok(email)) return { email, name: looksLikeDateTime(name) ? '' : name.slice(0, 80) };
    }
    return { email: '', name: '' };
  }

  const HEADINGS = '[role="heading"], h1, h2, h3';
  const LISTS = '[role="listbox"], [role="list"], [role="grid"], [role="tree"], [role="navigation"]';
  // Bidi / RTL marks OWA drops into the date row (U+200F before the clock). They are not whitespace, so a
  // date pattern that only allows \s between the date and the time misses "ג 06/10/2026 ‏01:16".
  const BIDI_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff\u200b\u200c\u200d]/g;
  const DATE_RE = (() => {
    const wk = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)';
    const he = "[\\u05d0-\\u05ea]['׳\u05f3]?";
    const day = '(?:(?:' + wk + ')\\.?|' + he + '|יום\\s+' + he + ')';
    const clock = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[ap]\\.?m\\.?)?';
    const date = '\\d{1,4}[./]\\d{1,2}(?:[./]\\d{2,4})?';
    return new RegExp('^(?:' + day + '\\s+)?(?:' + date + '(?:[,\\s]+' + clock + ')?|' + clock + ')$', 'i');
  })();
  function looksLikeDateTime(s) {
    const t = String(s || '').replace(BIDI_RE, '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (DATE_RE.test(t)) return true;
    const stripped = t.replace(/[\u05f3\u05f4\u2018\u2019\u201c\u201d"'`]/g, '');
    if (!/(?:לפנהצ|אחהצ|לפני הצהריים|לפני הצהרים|אחרי הצהריים|אחרי הצהרים|אחר הצהרים)/.test(stripped)) return false;
    const rest = stripped
      .replace(/לפני הצהריים|לפני הצהרים|אחרי הצהריים|אחרי הצהרים|אחר הצהרים|לפנהצ|אחהצ/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return DATE_RE.test(rest);
  }
  function inList(n) { return Boolean(n && n.closest && n.closest(LISTS)); }
  function signature(n) { return (n.getAttribute && n.getAttribute('aria-level') || '') + '|' + (n.tagName || '') + '|' + (n.className && typeof n.className === 'string' ? n.className : ''); }
  function headingText(h) { return textOf(h).split('\n')[0].trim(); }
  function usable(h) { const t = headingText(h); return t && !EMAIL_RE.test(t) && !looksLikeDateTime(t); }
  // The display name. OWA's persona is not always a heading; the date row beside it sometimes is.
  function personaName(container, bodyRoot) {
    if (!container || !container.querySelectorAll) return '';
    const nodes = container.querySelectorAll('.senderName, .persona');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (bodyRoot && ((bodyRoot.contains && bodyRoot.contains(n)) || !before(n, bodyRoot))) continue;
      const lines = textOf(n).split('\n');
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j].trim();
        if (!line || line.length > 80 || EMAIL_RE.test(line) || looksLikeDateTime(line)) continue;
        return line;
      }
    }
    return '';
  }
  function pickSender(heads) {
    const named = heads.filter((h) => h.closest && (h.closest('.persona') || (h.classList && (h.classList.contains('senderName') || h.classList.contains('persona')))));
    const pool = named.length ? named : heads;
    return pool[pool.length - 1];
  }

  // Subject and sender name from the reading pane, language-neutral. Real OWA (2026-10, checked live): the subject sits in
  // the reading-pane header ABOVE the message, and inside the message the first heading is the sender's display name
  // ("flow"), with the address usually only in a hover card. A date/time row beside that name is sometimes a heading
  // too (and may carry an RTL mark); it is not a sender. The persona/name element is preferred. The subject is the
  // first heading above the message item that is not the sender.
  function headerOf(bodyRoot, d) {
    const container = containerOf(bodyRoot, d);
    const near = container ? Array.prototype.slice.call(container.querySelectorAll(HEADINGS))
      .filter((h) => before(h, bodyRoot) && !(bodyRoot.contains && bodyRoot.contains(h)) && !inList(h) && usable(h)) : [];
    let far = [];
    let n = container && container.parentElement;
    for (let i = 0; n && i < 10 && !far.length; i++) {
      far = Array.prototype.slice.call(n.querySelectorAll(HEADINGS))
        .filter((h) => !(container.contains && container.contains(h)) && before(h, container) && !inList(h) && usable(h));
      if (n.getAttribute && (n.getAttribute('role') === 'main' || n.id === 'ReadingPaneContainerId')) break;
      n = n.parentElement;
    }
    let senderHead = null, subjectHead = null;
    if (far.length && near.length) {
      senderHead = pickSender(near);
      const sig = signature(senderHead), name = headingText(senderHead);
      subjectHead = far.find((h) => headingText(h) !== name && signature(h) !== sig) || far.find((h) => headingText(h) !== name) || null;
    } else if (near.length) {
      subjectHead = near[0];
    } else if (far.length) {
      subjectHead = far[0];
    }
    return { container, subject: subjectHead ? headingText(subjectHead) : '', senderName: senderHead ? headingText(senderHead) : '' };
  }

  // opts: { own: [addresses] } so the person's own address in the header is never taken for the sender.
  function readPane(doc, href, opts) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const roots = readingPaneRoots(d);
    const bodyRoot = roots[0] || null;
    if (!bodyRoot) return null; // no message body on screen: stay silent rather than read the message list
    const head = headerOf(bodyRoot, d);
    const container = head.container;
    let subject = head.subject;
    if (!subject) {
      const fallback = d.querySelector('[role="main"] [role="heading"]') || d.querySelector('[role="main"] h1, [role="main"] h2');
      subject = fallback && !inList(fallback) ? headingText(fallback) : '';
    }
    const who = senderOf(container, bodyRoot, opts && opts.own);
    const fromWho = who.name && !looksLikeDateTime(who.name) ? who.name : '';
    const fromHead = head.senderName && !looksLikeDateTime(head.senderName) ? head.senderName : '';
    // The persona/name element wins over a heading nearer the body (that nearer heading is often the date row).
    const senderName = personaName(container, bodyRoot) || fromWho || fromHead || '';
    const body = textOf(bodyRoot.querySelector('.AllowTextSelection, [class*="UniqueMessageBody"]')) || textOf(bodyRoot);
    if (!subject && !body) return null;
    const ids = urlIds(href || (typeof location !== 'undefined' ? location.href : ''));
    const whoTo = recipientsOf(container, bodyRoot, opts);
    const when = receivedInfo(container, bodyRoot);
    return {
      itemId: ids.itemId,
      conversationId: ids.conversationId,
      pathId: ids.raw || null,
      idKind: ids.kind,
      subject: subject === senderName && head.senderName ? '' : subject,
      senderEmail: who.email,
      senderName: senderName.slice(0, 80),
      text: stripReadingChrome(body),
      to: whoTo.to,
      cc: whoTo.cc,
      receivedDateTime: when.iso,
      clockUnread: when.unread,
      clockAmbiguous: when.ambiguous === true,
      clockAlt: when.alt || '',
      pageHour24: pageProves24h(d),
      hourCycle: hourCycleOf(d),
      attachments: attachmentsOf(container, bodyRoot)
    };
  }

  // OWA's "this message is in English" line is chrome, not the commitment.
  function stripReadingChrome(text) {
    return String(text || '')
      .replace(/הודעה זו נמצאת ב[-\u05BE\s]*אנגלית\.?/g, ' ')
      .replace(/this message is in english\.?/gi, ' ')
      .replace(/^\s*תרגם(?:\s+הודעה)?\s*$/gim, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function emailsIn(text) {
    return String(text || '').toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || [];
  }

  function recipientsOf(container, bodyRoot, opts) {
    const to = [];
    const cc = [];
    if (!container || !container.querySelectorAll) return { to: to, cc: cc };
    const own = ((opts && (opts.own || opts.ownAddresses)) || []).map((a) => String(a || '').toLowerCase()).filter(Boolean);
    const userName = String((opts && opts.userName) || '').trim().toLowerCase();
    function push(bucket, email) {
      const e = String(email || '').toLowerCase();
      if (!e || bucket.indexOf(e) >= 0) return;
      bucket.push(e);
    }
    function harvest(node, bucket) {
      if (!node) return;
      const bits = [textOf(node)];
      if (node.getAttribute) bits.push(node.getAttribute('title') || '', node.getAttribute('aria-label') || '');
      if (node.querySelectorAll) {
        const marked = node.querySelectorAll('[title], [aria-label]');
        for (let i = 0; i < marked.length; i++) {
          bits.push(marked[i].getAttribute('title') || '', marked[i].getAttribute('aria-label') || '', textOf(marked[i]));
        }
      }
      emailsIn(bits.join(' ')).forEach((e) => push(bucket, e));
      if (userName && userName.indexOf(' ') >= 0 && own.length && bits.join(' ').toLowerCase().indexOf(userName) >= 0) push(bucket, own[0]);
    }
    function lineKind(raw) {
      const t = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 400) return '';
      if (/^\s*to\b/i.test(t) || /^\s*אל(?:\s|:|$)/.test(t)) return 'to';
      if (/^\s*cc\b/i.test(t) || /^\s*עותק(?:\s|:|$)/.test(t)) return 'cc';
      return '';
    }
    const nodes = container.querySelectorAll('div, p, li, span, button');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (bodyRoot && bodyRoot.contains && bodyRoot.contains(n)) continue;
      const t = textOf(n).replace(/\s+/g, ' ').trim();
      if (!t || t.length > 400) continue;
      // \b is ASCII-only, so "אל sali sapan" in one text node is not a To line
      // under (to|אל)\b. Hebrew keeps an explicit boundary. English keeps \b.
      // A persona whose visible text is only "sali sapan" still counts when
      // its aria-label or title starts with To or Cc. "To:" as its own node
      // has the address on the next node.
      const aria = n.getAttribute ? String(n.getAttribute('aria-label') || '') : '';
      const title = n.getAttribute ? String(n.getAttribute('title') || '') : '';
      const kind = lineKind(t) || lineKind(aria) || lineKind(title);
      if (!kind) continue;
      const bucket = kind === 'to' ? to : cc;
      const before = bucket.length;
      harvest(n, bucket);
      if (bucket.length === before) harvest(n.nextElementSibling, bucket);
    }
    return { to: to, cc: cc };
  }

  // English a.m./p.m. as its own token, and the Hebrew markers OWA prints
  // (לפנה"צ / אחה"צ, with gershayim or a straight quote, and the long forms).
  // Both markers on one clock is not a time.
  function meridianOf(text) {
    const raw = String(text || '');
    let am = false;
    let pm = false;
    const en = /(?:^|[^A-Za-z])([ap])\.?\s*m\.?(?![A-Za-z])/gi;
    let hit;
    while ((hit = en.exec(raw))) {
      if (hit[1].toLowerCase() === 'a') am = true;
      else pm = true;
    }
    const he = raw.replace(/[\u05f3\u05f4\u2018\u2019\u201c\u201d"'`]/g, '');
    if (/לפנהצ|לפני הצהריים|לפני הצהרים/.test(he)) am = true;
    if (/אחהצ|אחרי הצהריים|אחרי הצהרים|אחר הצהרים/.test(he)) pm = true;
    if (am && pm) return 'both';
    if (am) return 'am';
    if (pm) return 'pm';
    return '';
  }

  // A meridian wins: 12 AM is 00, 12 PM is 12, and any other PM hour adds 12.
  // With no marker, a two-digit hour is read as that number (03:05 stays 03,
  // 14:01 stays 14, 12 stays noon). Whether 10:05 also means 22:05, and
  // whether unmarked 12 also means midnight, is decided later, only when
  // both candidates are in the pool. A one-digit hour with no marker is
  // not guessed.
  function hourOnClock(hourText, meridian) {
    const token = String(hourText == null ? '' : hourText);
    if (!/^\d{1,2}$/.test(token)) return null;
    const hour = +token;
    if (meridian === 'both') return null;
    if (meridian === 'am' || meridian === 'pm') {
      if (hour < 1 || hour > 12) return null;
      if (hour === 12) return meridian === 'am' ? 0 : 12;
      return meridian === 'pm' ? hour + 12 : hour;
    }
    if (token.length >= 2 && hour <= 23) return hour;
    return null;
  }

  // Day/month, the order the Hebrew mailbox prints (08/10/2026 is 8 October).
  // A time[datetime] or data-received value is used as-is when it has a minute.
  // Returns '' when the visible clock is a one-digit hour with no AM/PM marker.
  function clockToIso(text) {
    const t = String(text || '').replace(BIDI_RE, ' ').replace(/\s+/g, ' ').trim();
    const meridian = meridianOf(t);
    if (meridian === 'both') return '';
    const iso = t.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (iso) {
      const hour = hourOnClock(iso[4], meridian);
      if (hour == null) return '';
      const d = new Date(+iso[1], +iso[2] - 1, +iso[3], hour, +iso[5], 0, 0);
      if (!isNaN(d.getTime())) return d.toISOString();
      return '';
    }
    const date = t.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    const time = t.match(/(\d{1,2}):(\d{2})/);
    if (!date || !time) return '';
    const hour = hourOnClock(time[1], meridian);
    if (hour == null) return '';
    let day = +date[1];
    let month = +date[2];
    const year = +date[3];
    if (day <= 12 && month > 12) { const swap = day; day = month; month = swap; }
    const d = new Date(year, month - 1, day, hour, +time[2], 0, 0);
    if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return '';
    return d.toISOString();
  }

  // The literal clock, plus the other half of an unmarked 1–11 hour.
  // Unmarked 12 is noon or midnight (00 the same local day, not +12).
  // 00, 13–23, and any AM/PM or Hebrew meridian are not ambiguous.
  // A one-digit hour with no marker is unread, not a guess.
  function clockPair(text) {
    const raw = String(text || '');
    const iso = clockToIso(raw);
    const meridian = meridianOf(raw.replace(BIDI_RE, ' '));
    const time = raw.replace(BIDI_RE, ' ').match(/(\d{1,2}):(\d{2})/);
    if (!iso) {
      return { iso: '', altIso: '', ambiguous: false, unread: Boolean(time) };
    }
    if (!time || meridian) return { iso: iso, altIso: '', ambiguous: false, unread: false };
    const token = time[1];
    const hour = +token;
    if (token.length < 2 || hour < 1 || hour > 12) {
      return { iso: iso, altIso: '', ambiguous: false, unread: false };
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { iso: iso, altIso: '', ambiguous: false, unread: false };
    if (hour === 12) d.setHours(0);
    else d.setHours(d.getHours() + 12);
    return { iso: iso, altIso: d.toISOString(), ambiguous: true, unread: false };
  }

  // Another unmarked hour of 13–23, or 00, on an OWA list-row time or the
  // reading-pane header clock means this page is a 24-hour clock. A time
  // inside the email body is the message, not the chrome.
  function inMessageBody(n) {
    let p = n;
    while (p) {
      const role = p.getAttribute && p.getAttribute('role');
      const section = p.getAttribute && p.getAttribute('data-app-section');
      const cls = (p.className && typeof p.className === 'string') ? p.className : '';
      if (role === 'document' || section === 'MessageBody') return true;
      if (cls.indexOf('UniqueMessageBody') >= 0 || /(^|\s)AllowTextSelection(\s|$)/.test(cls)) return true;
      p = p.parentElement || p.parentNode || null;
      if (p && p.nodeType === 9) break;
    }
    return false;
  }

  function wrapsMessageBody(n) {
    if (!n || typeof n.querySelector !== 'function') return false;
    try {
      return Boolean(n.querySelector('[role="document"], [data-app-section="MessageBody"], [class*="UniqueMessageBody"], .AllowTextSelection'));
    } catch (e) { return false; }
  }

  function textProves24h(text) {
    const re = /(?:^|[^\d])(\d{2}):(\d{2})(?!\d)/g;
    let m;
    const raw = String(text || '');
    while ((m = re.exec(raw))) {
      const hour = +m[1];
      if (hour === 0 || (hour >= 13 && hour <= 23)) return true;
    }
    return false;
  }

  function pageProves24h(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || typeof d.querySelectorAll !== 'function') return false;
    const sel = [
      '[role="list"] [role="option"]',
      '[role="list"] [role="row"]',
      '[role="list"] [role="listitem"]',
      '[role="listbox"] [role="option"]',
      '[role="listbox"] [role="row"]',
      '[role="listbox"] [role="listitem"]',
      '[role="grid"] [role="row"]',
      '[role="grid"] [role="gridcell"]',
      '#ReadingPaneContainerId time',
      '#ReadingPaneContainerId div',
      '#ReadingPaneContainerId span',
      '#ReadingPaneContainerId p'
    ].join(', ');
    let nodes = [];
    try { nodes = d.querySelectorAll(sel) || []; } catch (e) { return false; }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n || inMessageBody(n) || wrapsMessageBody(n)) continue;
      const t = textOf(n);
      if (!t || t.length > 400) continue;
      if (textProves24h(t)) return true;
    }
    return false;
  }

  function hourCycleOf(doc) {
    try {
      const lang = doc && doc.documentElement && doc.documentElement.getAttribute && doc.documentElement.getAttribute('lang');
      const opt = new Intl.DateTimeFormat(lang || undefined, { hour: 'numeric' }).resolvedOptions();
      return (opt && opt.hourCycle) || '';
    } catch (e) { return ''; }
  }

  function headerTextNodes(container, bodyRoot) {
    const nodes = container.querySelectorAll('time, div, span, p');
    const out = [];
    for (let i = 0; i < nodes.length && out.length < 40; i++) {
      const n = nodes[i];
      if (bodyRoot && bodyRoot.contains && bodyRoot.contains(n)) continue;
      if (inList(n)) continue;
      const t = textOf(n);
      if (!t || t.length > 80) continue;
      out.push({ node: n, text: t });
    }
    return out;
  }

  function receivedInfo(container, bodyRoot) {
    const none = { iso: '', unread: false, ambiguous: false, alt: '' };
    if (!container || !container.querySelector) return none;
    const marked = container.querySelector('[data-received]');
    if (marked && !(bodyRoot && bodyRoot.contains && bodyRoot.contains(marked))) {
      const raw = marked.getAttribute('data-received') || '';
      if (minuteKey(raw)) return { iso: raw, unread: false, ambiguous: false, alt: '' };
    }
    const timed = container.querySelector('time[datetime]');
    if (timed && !(bodyRoot && bodyRoot.contains && bodyRoot.contains(timed))) {
      const raw = timed.getAttribute('datetime') || '';
      if (minuteKey(raw)) return { iso: raw, unread: false, ambiguous: false, alt: '' };
    }
    const bits = [];
    let sawClock = false;
    const nodes = headerTextNodes(container, bodyRoot);
    for (let i = 0; i < nodes.length; i++) {
      if (/\d{1,2}:\d{2}/.test(nodes[i].text)) sawClock = true;
      const pair = clockPair(nodes[i].text);
      if (pair.iso) return { iso: pair.iso, unread: false, ambiguous: pair.ambiguous, alt: pair.altIso || '' };
      if (sawClock || /\d{1,2}[./]\d{1,2}[./]\d{4}/.test(nodes[i].text)) bits.push(nodes[i].text);
    }
    const joined = clockPair(bits.join(' '));
    if (/\d{1,2}:\d{2}/.test(bits.join(' '))) sawClock = true;
    if (joined.iso) return { iso: joined.iso, unread: false, ambiguous: joined.ambiguous, alt: joined.altIso || '' };
    return { iso: '', unread: Boolean(sawClock), ambiguous: false, alt: '' };
  }

  function receivedOf(container, bodyRoot) {
    return receivedInfo(container, bodyRoot).iso;
  }

  const FILE_NAME_RE = /([^\s\\/:"<>|]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|png|jpe?g|heic|zip))/i;
  const SIZE_LABEL_RE = /(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB)\b/i;

  function attachmentsOf(container, bodyRoot) {
    if (!container || !container.querySelectorAll) return [];
    const marked = container.querySelectorAll('[data-name][data-size]');
    const exact = [];
    for (let i = 0; i < marked.length; i++) {
      const n = marked[i];
      if (bodyRoot && bodyRoot.contains && bodyRoot.contains(n)) continue;
      if (inList(n)) continue;
      const name = String(n.getAttribute('data-name') || '').trim();
      const size = Number(n.getAttribute('data-size'));
      if (!name || !isFinite(size)) continue;
      exact.push({ name: name, size: size });
    }
    if (exact.length) return exact;
    const nodes = container.querySelectorAll('[role="option"], button, a, div, span');
    const out = [];
    const seen = {};
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (bodyRoot && bodyRoot.contains && bodyRoot.contains(n)) continue;
      if (inList(n)) continue;
      const blob = ((n.getAttribute && ((n.getAttribute('title') || '') + ' ' + (n.getAttribute('aria-label') || ''))) + ' ' + textOf(n)).replace(/\s+/g, ' ').trim();
      if (!blob || blob.length > 240) continue;
      const sizeM = blob.match(SIZE_LABEL_RE);
      if (!sizeM) continue;
      if (n.querySelector && n.querySelector('[role="option"], .attachmentChip')) continue;
      const bits = [blob];
      if (n.parentElement && n.parentElement.getAttribute) {
        bits.push(n.parentElement.getAttribute('title') || '', n.parentElement.getAttribute('aria-label') || '');
      }
      let name = '';
      for (let b = 0; b < bits.length; b++) {
        const nameM = String(bits[b] || '').match(FILE_NAME_RE);
        if (!nameM) continue;
        const cleaned = nameM[1].replace(/^[\u2026\u2025.]+/, '').replace(/[\u2026\u2025.]+$/, '');
        if (cleaned.length > name.length) name = cleaned;
      }
      if (!name) continue;
      const label = sizeM[1].replace(',', '.') + ' ' + sizeM[2].toUpperCase();
      const key = norm(name) + '|' + norm(label).replace(/\s+/g, '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ name: name, sizeLabel: label });
    }
    return out;
  }

  return { itemIdFromUrl, urlIds, canonId, matchEntry, matchEntryHow, uniqueGraphMessage, minuteKey, clockToIso, clockPair, pageProves24h, stripReadingChrome, readingPaneRoots, rootsReport, readPane, senderOf, looksLikeDateTime, norm, normEmail, textOf, dayKey };
})();

if (typeof module !== 'undefined') module.exports = { FlowOwaParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowOwaParse = FlowOwaParse;
