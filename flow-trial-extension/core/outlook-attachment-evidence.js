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

  const BANNER_EN = 'Attachments could not be read from Outlook; steps may be limited until they load.';
  const BANNER_HE = 'לא הצלחתי לקרוא את הקבצים המצורפים; ייתכן שהשלבים יהיו מוגבלים עד שהם ייטענו.';

  function attachUnreadBanner(lang) {
    return (lang === 'he' || lang === 'iw') ? BANNER_HE : BANNER_EN;
  }

  const NOTE_SELF_EN = 'From you to you — a task was suggested.';
  const NOTE_SELF_HE = 'ממך אליך — הוצעה משימה.';

  function noteToSelfLine(lang) {
    return (lang === 'he' || lang === 'iw') ? NOTE_SELF_HE : NOTE_SELF_EN;
  }

  return {
    nonInlineFileRows,
    localAttachmentCount,
    fallbackCount,
    mergeCount,
    attachUnreadBanner,
    noteToSelfLine,
    REASON_ATTACH_UNREAD: 'outlook:attachments-not-read',
    REASON_ATTACH_COUNT_UNREAD: 'page:attachment-count-unread'
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookAttachmentEvidence };
