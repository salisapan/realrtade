// Block a task-only Outlook card when the open mail is a file ask but OneDrive
// scopes or attachment evidence are not ready. Portable: no chrome.*, no DOM.
// The host paints guard.line and records taskFallbackBlocked on the decision.
const FlowOutlookFileAskGuard = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const closes = sibling(typeof FlowGoogleCloses !== 'undefined' ? FlowGoogleCloses : null, './google-closes.js', 'FlowGoogleCloses');
  const onedriveFile = sibling(typeof FlowOnedriveFile !== 'undefined' ? FlowOnedriveFile : null, './onedrive-file.js', 'FlowOnedriveFile');
  const onedriveFind = sibling(typeof FlowOnedriveFind !== 'undefined' ? FlowOnedriveFind : null, './onedrive-find.js', 'FlowOnedriveFind');

  const TASK_FALLBACK_BLOCKED = 'task-only-on-file-ask';

  const LINES = {
    'files-not-granted': {
      en: 'Reconnect Outlook to allow OneDrive',
      he: 'התחבר מחדש ל-Outlook כדי לאפשר OneDrive'
    },
    'attachments-pending': {
      en: 'Loading attachments…',
      he: 'טוען קבצים מצורפים…'
    }
  };

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasFilesRead(scopes) {
    if (onedriveFind && typeof onedriveFind.hasReadScope === 'function') {
      return onedriveFind.hasReadScope(scopes);
    }
    const list = scopeList(scopes);
    if (!list) return null;
    const read = ['Files.Read', 'Files.ReadWrite', 'Files.Read.All', 'Files.ReadWrite.All'];
    return list.some((s) => read.some((r) => s === r || s === 'https://graph.microsoft.com/' + r));
  }

  function hasFilesWrite(scopes) {
    if (onedriveFile && typeof onedriveFile.hasWriteScope === 'function') {
      return onedriveFile.hasWriteScope(scopes);
    }
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === 'Files.ReadWrite' || s === 'https://graph.microsoft.com/Files.ReadWrite');
  }

  function isTaskOnlyProcess(process) {
    const steps = (process && process.steps) || [];
    return steps.length > 0 && steps.every((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
  }

  function fileAskShape(text) {
    const body = String(text || '');
    if (!body.trim()) return null;
    if (attach && typeof attach.gate === 'function') {
      const g = attach.gate(body);
      if (g && g.kind === 'clear' && g.ask) return { kind: 'send-file', save: false };
      if (g && g.kind === 'block') return null;
    }
    if (closes && typeof closes.needsOneAttachment === 'function' && closes.needsOneAttachment(body)) {
      return { kind: 'save-attachment', save: true };
    }
    return null;
  }

  function attachmentsPendingReason(pageReason, attachmentsPending) {
    if (attachmentsPending === true) return true;
    const r = String(pageReason || '');
    return r === 'page:attachment-count-unread' || r === 'outlook:attachments-unread';
  }

  // Host calls before painting a task-only card or after decideFromText when the plan is task-only.
  function evaluate(input) {
    input = input || {};
    if (!isTaskOnlyProcess(input.process)) return { allowTaskCard: true };
    const shape = fileAskShape(input.text);
    if (!shape) return { allowTaskCard: true };

    if (attachmentsPendingReason(input.pageReason, input.attachmentsPending)) {
      return {
        allowTaskCard: false,
        taskFallbackBlocked: TASK_FALLBACK_BLOCKED,
        guard: 'attachments-pending',
        pageReason: String(input.pageReason || 'page:attachment-count-unread'),
        line: LINES['attachments-pending'],
        retry: true
      };
    }

    const scopes = input.scopes;
    if (shape.save) {
      if (hasFilesWrite(scopes) === false) {
        return {
          allowTaskCard: false,
          taskFallbackBlocked: TASK_FALLBACK_BLOCKED,
          guard: 'files-not-granted',
          pageReason: 'files-not-granted',
          line: LINES['files-not-granted'],
          retry: false
        };
      }
    } else if (hasFilesRead(scopes) === false) {
      return {
        allowTaskCard: false,
        taskFallbackBlocked: TASK_FALLBACK_BLOCKED,
        guard: 'files-not-granted',
        pageReason: 'files-not-granted',
        line: LINES['files-not-granted'],
        retry: false
      };
    }

    return { allowTaskCard: true };
  }

  return {
    TASK_FALLBACK_BLOCKED: TASK_FALLBACK_BLOCKED,
    evaluate: evaluate,
    isTaskOnlyProcess: isTaskOnlyProcess,
    fileAskShape: fileAskShape
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookFileAskGuard = FlowOutlookFileAskGuard;
if (typeof module !== 'undefined') module.exports = { FlowOutlookFileAskGuard };
