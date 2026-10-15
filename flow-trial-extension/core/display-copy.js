// What a person reads on a card, in Activity, and under Why not shown.
// Portable: no chrome.*, no DOM, no network. Each row is titled from that
// row's own action. A raw message id or a mailbox route is never a subject.
const FlowDisplay = (() => {
  const SAVE_TITLE = 'Save the file?';
  const GENERIC_LOG = /^Log commitment for\b/i;
  const MAIL_PATH = /^\/mail(?:\/|$)/i;
  const RAW_ID = /^[A-Za-z0-9+/=_-]{24,}$/;
  const FILE_KINDS = { onedriveFile: 1, driveFile: 1, attachmentSave: 1, googleDriveFile: 1 };
  const PROOF_IDS = { outlookTask: 1, microsoftTodo: 1, onedriveFile: 1, attachmentSave: 1 };
  const LOOP_IDS = {
    outlookDraft: 1, outlookCalendar: 1, outlookTask: 1, microsoftTodo: 1, onedriveFile: 1, attachmentSave: 1
  };

  function genericLabel(value) {
    return GENERIC_LOG.test(String(value || '').trim());
  }

  function looksLikeRawId(value) {
    const t = String(value || '').trim();
    if (!t || t === '(no subject)') return true;
    if (MAIL_PATH.test(t)) return true;
    if (RAW_ID.test(t) && !/\s/.test(t)) return true;
    return false;
  }

  function diagSubject(subject) {
    const t = String(subject || '').trim();
    if (looksLikeRawId(t)) return 'Untitled message';
    return t;
  }

  function sanitizeStoredSubject(subject) {
    const t = String(subject || '').trim();
    if (looksLikeRawId(t)) return '';
    return t.slice(0, 120);
  }

  function whyNotShownHeader(total, shown) {
    const n = Number(total) || 0;
    const s = shown == null ? n : (Number(shown) || 0);
    if (n <= s) return 'Why not shown (' + n + ')';
    return 'Why not shown (showing ' + s + ' of ' + n + ')';
  }

  function commitmentTitle(entry) {
    const CT = typeof FlowCommitmentTitle !== 'undefined' ? FlowCommitmentTitle : null;
    if (!CT) return '';
    const body = (entry && (entry.text || entry.bodyText)) || '';
    if (body && typeof CT.titleFromBody === 'function') {
      const t = CT.titleFromBody(body);
      if (t) return t;
    }
    if (typeof CT.fromPayload === 'function') {
      const t = CT.fromPayload(entry || {});
      if (t && !genericLabel(t)) return t;
    }
    return '';
  }

  function taskTitleFrom(entry) {
    const steps = (entry && entry.process && entry.process.steps) || (entry && entry.steps) || [];
    for (let i = 0; i < steps.length; i++) {
      const title = steps[i] && steps[i].params && steps[i].params.title;
      if (title && String(title).trim() && !genericLabel(title)) return String(title).trim();
    }
    const own = entry && entry.params && entry.params.title;
    if (own && String(own).trim() && !genericLabel(own)) return String(own).trim();
    return '';
  }

  function fileNameFrom(entry) {
    const written = String((entry && (entry.writtenLine || entry.written)) || '');
    const marked = written.match(/^OneDrive · (.+)$/) || written.match(/Saved (.+?) to OneDrive/i);
    if (marked && marked[1]) return marked[1].trim();
    const steps = (entry && entry.process && entry.process.steps) || [];
    for (let i = 0; i < steps.length; i++) {
      const p = steps[i] && steps[i].params;
      if (!p) continue;
      if (p.fileName) return String(p.fileName);
      if (p.name && /\.[A-Za-z0-9]{2,5}$/.test(String(p.name))) return String(p.name);
      if (p.files && p.files[0] && p.files[0].name) return String(p.files[0].name);
    }
    if (entry && entry.files && entry.files[0] && entry.files[0].name) return String(entry.files[0].name);
    const ownFiles = entry && entry.params && entry.params.files;
    if (ownFiles && ownFiles[0] && ownFiles[0].name) return String(ownFiles[0].name);
    return '';
  }

  function isFileConnector(id) {
    return id === 'onedriveFile' || id === 'attachmentSave' || id === 'googleDriveFile' || id === 'driveFile';
  }

  function isTaskConnector(id) {
    return id === 'outlookTask' || id === 'microsoftTodo' || id === 'googleTask' || id === 'googleTasks';
  }

  // One entry, one title. A shared chip label is not this entry's action.
  function activityTitle(entry) {
    if (!entry) return 'Untitled message';
    if (entry.actionTitle && String(entry.actionTitle).trim() && !genericLabel(entry.actionTitle)) {
      return String(entry.actionTitle).trim();
    }
    const cid = String(entry.connectorId || '');
    if (isFileConnector(cid)) {
      const name = fileNameFrom(entry);
      if (name) return 'Saved ' + name + ' to OneDrive';
      if (entry.writtenLine && !genericLabel(entry.writtenLine)) return String(entry.writtenLine);
    }
    if (isTaskConnector(cid)) {
      const task = taskTitleFrom(entry);
      if (task) return task;
    }
    const own = taskTitleFrom(entry) || commitmentTitle(entry);
    if (own && !genericLabel(own)) return own;
    if (entry.label && !genericLabel(entry.label)) return String(entry.label);
    if (entry.subject && !looksLikeRawId(entry.subject)) return String(entry.subject);
    if (entry.writtenLine && !genericLabel(entry.writtenLine)) return String(entry.writtenLine);
    if (entry.intent && entry.intent.label) return String(entry.intent.label);
    return entry.label ? String(entry.label) : 'Untitled message';
  }

  function onlyFileSteps(process) {
    const steps = (process && process.steps) || [];
    return steps.length > 0 && steps.every((s) => s && FILE_KINDS[s.kind]);
  }

  function cardFace(process, intent, extra) {
    const p = process || {};
    const id = p.id || '';
    const name = String(p.name || '');
    const fileCard = id === 'file-it' || id === 'suggest-save' || onlyFileSteps(p) || (extra && extra.fileCard === true) || /file it/i.test(name);
    if (fileCard) return { title: SAVE_TITLE, sentence: '', fileCard: true, logIt: false };
    const logIt = id === 'log-it' || /^log it$/i.test(name);
    if (logIt) {
      const titled = commitmentTitle({ text: extra && (extra.bodyText || extra.text), intent: intent });
      const title = titled || ((intent && intent.label && !genericLabel(intent.label)) ? intent.label : '') || (intent && intent.label) || name || 'Log It';
      return { title: title, sentence: p.closingLine || '', fileCard: false, logIt: true };
    }
    return { title: name, sentence: null, fileCard: false, logIt: false };
  }

  function isPanelReceipt(entry) {
    if (!entry || entry.kind !== 'written' || !entry.messageId) return false;
    if (entry.undone || entry.outlookSent || entry.outlookReceipt === false) return false;
    if (entry.connectorId === 'outlookDraft') return true;
    const proved = entry.fetchedBack === true || (entry.proof && entry.proof.fetchedBack === true);
    if (!proved) return false;
    if (PROOF_IDS[entry.connectorId]) return true;
    return entry.system === 'microsoft/todo' || entry.system === 'microsoft/onedrive';
  }

  function dropOutlookLoopRow(entry) {
    if (!entry || entry.app === 'gmail') return false;
    if (entry.app === 'outlook') return true;
    return !!LOOP_IDS[entry.connectorId];
  }

  function dropAlreadyHandledDiag(row) {
    return !!(row && row.reason === 'page:already-handled');
  }

  // Why not shown lists quiet decisions only. A page record for a mail
  // removes the mailbox-sync line for that same id. A sync line is kept
  // only for mail the page has not decided.
  // One short Hebrew line for a quiet mail. The page and Setup both call this.
  // A missing To Do or Calendar scope is named. It is not "stayed quiet".
  const WHY_HE = {
    'context-dead': 'התוסף התעדכן',
    'not-connected': 'לא מחובר',
    'no-token': 'לא מחובר',
    'intent-null': 'לא זוהתה בקשה',
    'too-short': 'לא זוהתה בקשה',
    'tasks-not-granted': 'אין הרשאת To Do',
    'third-party': 'משתמש חיצוני',
    'calendar-write-not-granted': 'צריך הרשאה ליומן',
    'outlook-calendar-write-not-granted': 'צריך הרשאה ליומן',
    'scan-skipped': 'עדיין קורא את המייל'
  };

  function whyNotShownLine(reason) {
    let r = String(reason || '');
    r = r.replace(/^(?:page:|quiet:|outlook:)/, '');
    if (WHY_HE[r]) return WHY_HE[r];
    const bare = r.replace(/^outlook-/, '');
    if (WHY_HE[bare]) return WHY_HE[bare];
    return WHY_HE['intent-null'];
  }

  // Card dates are Hebrew. A deadline is "עד 23 באוק׳". A hold prints the
  // day and the clock, and an empty string means there is no hold to show.
  const HE_MON = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

  function hebrewDay(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
    return d + ' ב' + HE_MON[mo - 1];
  }

  function cardDateLine(iso) {
    const day = hebrewDay(iso);
    return day ? ('עד ' + day) : '';
  }

  // Chrome (buttons, headings, receipts) follows the UI language. The action
  // title stays in the mail's language. A stored setting wins, then
  // chrome.i18n.getUILanguage, then navigator.language. The host passes
  // those three strings; this file does not read chrome or the DOM.
  const CHROME = {
    en: {
      brand: 'Glance', intentLabel: 'Detected intent', will: 'Glance will', prepared: 'Prepared · nothing sent', done: 'Done',
      hold: 'Hold It', add: '+ Add a step', addPh: 'Type a step…',
      suggested: 'Suggested', added: 'Added', manual: 'Manual · for you',
      dismiss: 'Dismiss', dismissing: 'Dismissing…', doIt: 'Do It', view: 'View',
      undo: 'Undo', undoAll: 'Undo all', undoing: 'Undoing…', closing: 'Closing…',
      fromOutlook: 'From Outlook', expired: 'Expired', openDraft: 'Open draft', openEvent: 'Open event', show: 'View',
      handled: 'Handled.', approve: 'Approve close',
      kindHandled: 'Handled', kindUndone: 'Undone', kindClicked: 'Clicked', kindDismissed: 'Dismissed', kindDraft: 'Draft',
      couldnt: 'Couldn’t confirm', retry: 'Retry', outlookOff: 'Outlook is not connected',
      saveFiles: 'Save {on} of {all} attachments', attachments: 'Attachments', less: 'Less', newStep: 'New step', afterApprove: 'after Approve',
      calendarApp: 'Calendar', youApp: 'You', undoUnavailable: 'Undo unavailable.',
      justNow: 'just now', minsAgo: '{n}m ago', hrsAgo: '{n}h ago', writtenTo: 'Written to ',
      queued: 'Queued', preparing: 'Preparing', verifying: 'Verifying', verified: 'Verified',
      seeOpen: 'See what’s open'
    },
    he: {
      brand: 'Glance', intentLabel: 'כוונה שזוהתה', will: 'Glance יבצע', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע',
      hold: 'השהה', add: '+ הוסף צעד', addPh: 'הקלד צעד…',
      suggested: 'מוצע', added: 'נוסף', manual: 'ידני · בשבילך',
      dismiss: 'הסתר', dismissing: 'מסתיר…', doIt: 'בצע', view: 'הצג',
      undo: 'בטל', undoAll: 'בטל הכל', undoing: 'מבטל…', closing: 'סוגר…',
      fromOutlook: 'מ-Outlook', expired: 'פג תוקף', openDraft: 'פתח טיוטה', openEvent: 'פתח אירוע', show: 'הצג',
      handled: 'טופל.', approve: 'אשר סגירה',
      kindHandled: 'טופל', kindUndone: 'בוטל', kindClicked: 'נלחץ', kindDismissed: 'הוסתר', kindDraft: 'טיוטה',
      couldnt: 'לא אומת', retry: 'נסה שוב', outlookOff: 'Outlook לא מחובר',
      saveFiles: 'שמור {on} מתוך {all} קבצים', attachments: 'קבצים', less: 'פחות', newStep: 'צעד חדש', afterApprove: 'אחרי אישור',
      calendarApp: 'יומן', youApp: 'אתה', undoUnavailable: 'אין ביטול.',
      justNow: 'עכשיו', minsAgo: 'לפני {n} דק׳', hrsAgo: 'לפני {n} שע׳', writtenTo: 'נכתב אל ',
      queued: 'בתור', preparing: 'מכין', verifying: 'מאמת', verified: 'אומת',
      seeOpen: 'מה פתוח'
    }
  };

  function fillChrome(template, map) {
    return String(template || '').replace(/\{(\w+)\}/g, function (_, key) {
      return map && map[key] != null ? String(map[key]) : '';
    });
  }

  function uiLangFrom(sources) {
    const s = sources || {};
    const setting = s.setting == null ? '' : String(s.setting).trim();
    const ui = s.uiLanguage == null ? '' : String(s.uiLanguage).trim();
    const nav = s.navigatorLanguage == null ? '' : String(s.navigatorLanguage).trim();
    const raw = (setting || ui || nav).toLowerCase();
    if (raw === 'he' || raw.indexOf('he-') === 0 || raw === 'iw' || raw.indexOf('iw-') === 0) return 'he';
    return 'en';
  }

  function chrome(lang) {
    return CHROME[uiLangFrom({ setting: lang })] || CHROME.en;
  }

  function holdWhenLine(iso, hour, minute) {
    const day = hebrewDay(iso);
    if (!day) return '';
    if (hour == null || minute == null || hour === '' || minute === '') return '';
    const h = Number(hour);
    const min = Number(minute);
    if (!Number.isInteger(h) || h < 0 || h > 23) return '';
    if (!Number.isInteger(min) || min < 0 || min > 59) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return day + ' ' + pad(h) + ':' + pad(min);
  }

  function whyNotShownRows(pageDiagnostics, diagnostics) {
    const page = Array.isArray(pageDiagnostics) ? pageDiagnostics : [];
    const claimed = Object.create(null);
    page.forEach((d) => {
      if (!d) return;
      [d.id, d.priorConversationId, d.conversationId, d.messageId].forEach((id) => {
        if (id) claimed[String(id)] = true;
      });
    });
    const quiet = page.filter((d) => d && d.reason && d.verdict !== 'show');
    const sync = [];
    (Array.isArray(diagnostics) ? diagnostics : []).forEach((d) => {
      if (!d || !d.reason) return;
      const ids = [d.id, d.conversationId, d.messageId].filter(Boolean).map(String);
      if (ids.some((id) => claimed[id])) return;
      sync.push(Object.assign({ source: 'sync', verdict: 'quiet' }, d));
    });
    return quiet.concat(sync);
  }

  return {
    SAVE_TITLE: SAVE_TITLE,
    genericLabel: genericLabel,
    looksLikeRawId: looksLikeRawId,
    diagSubject: diagSubject,
    sanitizeStoredSubject: sanitizeStoredSubject,
    whyNotShownHeader: whyNotShownHeader,
    activityTitle: activityTitle,
    cardFace: cardFace,
    commitmentTitle: commitmentTitle,
    isPanelReceipt: isPanelReceipt,
    dropOutlookLoopRow: dropOutlookLoopRow,
    dropAlreadyHandledDiag: dropAlreadyHandledDiag,
    whyNotShownLine: whyNotShownLine,
    whyNotShownRows: whyNotShownRows,
    hebrewDay: hebrewDay,
    cardDateLine: cardDateLine,
    holdWhenLine: holdWhenLine,
    uiLangFrom: uiLangFrom,
    chrome: chrome,
    fillChrome: fillChrome
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowDisplay: FlowDisplay };
if (typeof globalThis !== 'undefined') globalThis.FlowDisplay = FlowDisplay;
