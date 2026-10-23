// Outlook attachment evidence for the judge: DOM + Graph, never a silent zero.
// Portable (no chrome.*, no DOM).
const FlowOutlookAttachmentEvidence = (() => {
  function nonInlineFileRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter((a) => {
      if (!a || a.isInline === true) return false;
      return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
    });
  }

  function localAttachmentCount(pane) {
    const list = (pane && pane.attachments) || [];
    return list.filter((a) => {
      if (!a || a.isInline === true) return false;
      return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
    }).length;
  }

  // Graph list failed: use the pane and mailbox flags, not zero.
  function fallbackCount(pane, mailbox) {
    const dom = localAttachmentCount(pane);
    if (dom >= 1) return { count: dom, source: 'dom', unread: true };
    if (mailbox && mailbox.hasAttachments === true) return { count: 1, source: 'mailbox-flag', unread: true };
    if (mailbox && mailbox.hasAttachments === false) return { count: 0, source: 'mailbox-flag', unread: false };
    return { count: null, source: 'unknown', unread: true };
  }

  function mergeCount(graphRows, pane, mailbox) {
    if (Array.isArray(graphRows)) {
      return { count: nonInlineFileRows(graphRows).length, source: 'graph', unread: false, rows: graphRows };
    }
    const fb = fallbackCount(pane, mailbox);
    if (fb.count == null) return Object.assign({ rows: null }, fb);
    return Object.assign({ rows: null }, fb);
  }

  function attachUnreadBanner(lang) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.attachmentsNotReadLine === 'function') {
      return FlowDisplay.attachmentsNotReadLine(lang);
    }
    const he = lang === 'he' || lang === 'iw';
    return he
      ? 'לא הצלחתי לקרוא את הקבצים המצורפים'
      : 'Could not read the attachments from Outlook';
  }

  function noteToSelfLine(lang, opts) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.noteToSelfLine === 'function') {
      return FlowDisplay.noteToSelfLine(lang, opts);
    }
    const he = lang === 'he' || lang === 'iw';
    const withTask = opts && (opts.taskSuggested === true || opts.withTask === true);
    if (withTask) return he ? 'ממך אליך — הוצעה משימה.' : 'From you to you — a task was suggested.';
    return he ? 'ממך אליך' : 'From you to you';
  }

  function attachmentsLoadingLine(lang) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.attachmentsLoadingLine === 'function') {
      return FlowDisplay.attachmentsLoadingLine(lang);
    }
    const he = lang === 'he' || lang === 'iw';
    return he ? 'עד שייטענו את הקבצים המצורפים' : 'Until the attachments finish loading';
  }

  return {
    nonInlineFileRows,
    localAttachmentCount,
    fallbackCount,
    mergeCount,
    attachUnreadBanner,
    noteToSelfLine,
    attachmentsLoadingLine,
    REASON_ATTACH_UNREAD: 'outlook:attachments-not-read',
    REASON_ATTACH_COUNT_UNREAD: 'page:attachment-count-unread'
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookAttachmentEvidence };
