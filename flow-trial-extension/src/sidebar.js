// The injected sidebar pane — one persistent panel per Gmail tab, distinct
// from the per-message "Do It" chip in content-gmail.js. The chip answers
// "does this specific message decide something"; the sidebar is where the
// broader, message-scoped tools live: the Privacy Shield status, the
// Draft-It box (Feature 2), and the attachment X-ray hover card (Feature 3).
//
// There used to be a fourth section here — a second, independent "Do It: Log
// to CRM & Generate Next Step Document" button (Feature 4) that ran its own
// separate write to whatever CRM was connected, plus a local .docx download.
// It duplicated the chip's own write (the chip already logs the message; this
// ran a second, independent judgment pass and could write a second row for
// the same email if both were clicked) and its document generation was never
// more useful than a filled-in receipt. Removed rather than fixed — the chip
// is the one polished, correct path for "log this," and this panel should
// only hold things that aren't already covered by it.
//
// Bi-directional layout: every section sets its own `dir` from the content
// it is actually showing (a Hebrew draft renders rtl; the English badge/label
// chrome around it stays ltr) rather than inheriting one fixed direction for
// the whole panel, because a single thread can legitimately contain both.
// All spacing in sidebar.css uses CSS logical properties (inset-inline-*,
// margin-inline-*, text-align: start/end) for exactly this reason.
//
// Gmail DOM resilience: this file never assumes anything about Gmail's own
// markup beyond what content-gmail.js already reads (the reading-pane root
// content-gmail.js locates and hands in). If that lookup ever fails, mount()
// simply doesn't attach anything — the rest of the extension (chip, judgment)
// keeps working unaffected.

const FlowSidebar = (() => {
  const HOST_ID = 'flow-sidebar-host';
  let host = null;
  let els = {};

  function isRTLText(sample) {
    // Hebrew and Arabic block ranges. A short heuristic on the first
    // strongly-directional characters found is enough here — this decides
    // panel layout, not correctness of an assistive-tech ARIA property.
    const s = String(sample || '');
    const rtlChars = (s.match(/[֐-׿؀-ۿ]/g) || []).length;
    const ltrChars = (s.match(/[A-Za-z]/g) || []).length;
    return rtlChars > ltrChars;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgShield() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'flow-sb-shield-icon');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 2l8 3.5v6c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5v-6L12 2z');
    const check = document.createElementNS(ns, 'path');
    check.setAttribute('d', 'M8.5 12.2l2.4 2.4 4.6-4.9');
    check.setAttribute('fill', 'none');
    svg.appendChild(path);
    svg.appendChild(check);
    return svg;
  }

  // Mounts once per tab. Idempotent: a second call from a re-init (e.g. the
  // onboarded-state watcher in content-gmail.js re-running init()) returns
  // the already-mounted host instead of duplicating it.
  function mount() {
    if (host && document.body.contains(host)) return host;

    host = el('div', 'flow-sb-host');
    host.id = HOST_ID;
    host.setAttribute('dir', 'ltr'); // shell chrome (badge label, section headers) is always English today

    const badge = el('div', 'flow-sb-badge');
    badge.appendChild(svgShield());
    badge.appendChild(el('span', 'flow-sb-badge-label', 'Local Privacy Shield Active'));
    const tooltip = el('div', 'flow-sb-tooltip',
      'PII and sensitive parameters are stripped locally on your machine before semantic processing. Zero-data-retention sandbox active.');
    badge.appendChild(tooltip);
    host.appendChild(badge);

    const draftSection = el('div', 'flow-sb-section flow-sb-draft');
    draftSection.hidden = true;
    host.appendChild(draftSection);

    document.body.appendChild(host);
    els = { host, badge, draftSection };
    return host;
  }

  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    els = {};
  }

  // ---- Feature 2: Draft-It box --------------------------------------------

  // state: 'idle' | 'loading' | 'ready' | 'error'
  function renderDraft(state, opts) {
    if (!els.draftSection) return;
    opts = opts || {};
    els.draftSection.hidden = false;
    els.draftSection.replaceChildren();

    const header = el('div', 'flow-sb-section-head', 'Draft-It');
    els.draftSection.appendChild(header);

    if (state === 'idle') {
      const btn = el('button', 'flow-sb-btn flow-sb-btn-primary', 'Draft-It');
      btn.type = 'button';
      btn.addEventListener('click', () => opts.onDraft && opts.onDraft());
      els.draftSection.appendChild(btn);
      return;
    }

    if (state === 'loading') {
      els.draftSection.appendChild(el('div', 'flow-sb-muted', 'Drafting a reply…'));
      return;
    }

    if (state === 'error') {
      els.draftSection.appendChild(el('div', 'flow-sb-error', opts.message || 'Could not draft a reply.'));
      const retry = el('button', 'flow-sb-btn', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => opts.onDraft && opts.onDraft());
      els.draftSection.appendChild(retry);
      return;
    }

    if (state === 'ready') {
      const box = el('div', 'flow-sb-draft-text');
      box.setAttribute('dir', isRTLText(opts.text) ? 'rtl' : 'ltr');
      box.textContent = opts.text || '';
      els.draftSection.appendChild(box);

      const actions = el('div', 'flow-sb-draft-actions');
      const insert = el('button', 'flow-sb-btn flow-sb-btn-primary', 'Insert into Reply');
      insert.type = 'button';
      insert.addEventListener('click', () => opts.onInsert && opts.onInsert(opts.text));
      actions.appendChild(insert);

      const redo = el('button', 'flow-sb-btn', 'Redraft');
      redo.type = 'button';
      redo.addEventListener('click', () => opts.onDraft && opts.onDraft());
      actions.appendChild(redo);

      els.draftSection.appendChild(actions);
    }
  }

  function hideDraft() {
    if (els.draftSection) { els.draftSection.hidden = true; els.draftSection.replaceChildren(); }
  }

  // ---- Feature 3: floating attachment hover card ---------------------------
  // Not part of the fixed sidebar panel — it has to track the pointer's own
  // position over an attachment chip, which is a different placement problem
  // than the sidebar's fixed spot. Lives here anyway because it is the same
  // kind of thing (an injected, self-contained overlay) and this is where the
  // rest of the injection-layout code already lives.

  let floatingCard = null;

  function showFloatingCard(anchorRect, opts) {
    hideFloatingCard();
    opts = opts || {};
    const card = el('div', 'flow-sb-floatcard');
    card.setAttribute('dir', isRTLText(opts.summary) ? 'rtl' : 'ltr');

    if (opts.state === 'loading') {
      card.appendChild(el('div', 'flow-sb-muted', 'Reading attachment…'));
    } else if (opts.state === 'unsupported') {
      card.appendChild(el('div', 'flow-sb-muted', opts.message || 'Preview isn’t available for this file type yet.'));
    } else if (opts.state === 'error') {
      card.appendChild(el('div', 'flow-sb-error', opts.message || 'Couldn’t read this attachment.'));
    } else if (opts.state === 'ready') {
      card.appendChild(el('div', 'flow-sb-floatcard-summary', opts.summary || ''));
      if (opts.entities && opts.entities.length) {
        const table = el('div', 'flow-sb-entity-table');
        opts.entities.forEach(([k, v]) => {
          const row = el('div', 'flow-sb-entity-row');
          row.appendChild(el('span', 'flow-sb-entity-key', k));
          row.appendChild(el('span', 'flow-sb-entity-val', v));
          table.appendChild(row);
        });
        card.appendChild(table);
      }
    }

    document.body.appendChild(card);
    const cardRect = card.getBoundingClientRect();
    const gap = 8;
    let top = anchorRect.bottom + gap;
    if (top + cardRect.height > innerHeight) top = Math.max(gap, anchorRect.top - cardRect.height - gap);
    let left = anchorRect.left;
    if (left + cardRect.width > innerWidth) left = Math.max(gap, innerWidth - cardRect.width - gap);
    card.style.top = top + 'px';
    card.style.left = left + 'px';

    floatingCard = card;
  }

  function hideFloatingCard() {
    if (floatingCard && floatingCard.parentNode) floatingCard.parentNode.removeChild(floatingCard);
    floatingCard = null;
  }

  return {
    mount, unmount,
    renderDraft, hideDraft,
    showFloatingCard, hideFloatingCard,
    isRTLText
  };
})();
