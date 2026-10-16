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
    if (id === 'attach-invite' || (intent && intent.inviteFile)) {
      return { title: (intent && intent.label) || name, sentence: null, fileCard: false, logIt: false };
    }
    // A calendar hold is a meeting. The button stays Hold It / השהה.
    if (id === 'hold') {
      const blob = String((extra && (extra.bodyText || extra.text)) || '');
      return { title: /[\u0590-\u05FF]/.test(blob) ? 'פגישה' : 'Meeting', sentence: null, fileCard: false, logIt: false };
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
      couldnt: 'Couldn’t confirm', couldntPlain: "Couldn't confirm", retry: 'Retry', outlookOff: 'Outlook is not connected',
      couldntUnchanged: "Couldn't confirm it's unchanged. Undo left it alone.",
      couldntVerify: "Couldn't verify, try again",
      createdUnverified: "Created, couldn't verify",
      youEdited: 'You edited this. Undo left it alone.',
      stillThere: 'Still there — the To Do task was not removed.',
      verifyNote: "couldn't verify",
      verifyingNow: 'Verifying…',
      draftReady: 'Draft ready.',
      draftReadyLong: 'Reply draft ready in Outlook Drafts. Not sent.',
      draftReadyNotSent: 'Draft ready. Not sent.',
      draftWithFile: 'Reply draft ready in Outlook Drafts, with the file attached. Not sent.',
      draftRemoved: 'Reply draft removed. Not sent.',
      draftGone: 'Draft was already gone. Nothing left to undo.',
      couldntRemove: 'Could not remove the draft.',
      partlyHandled: 'Partly handled.',
      undoGoogle: 'Undo removes the Google Task.',
      undoTodo: 'Undo removes the To Do task.',
      undoFile: 'Undo removes the OneDrive file.',
      undoRestore: 'Undo restores the previous OneDrive file.',
      undoneGoogle: 'Undone — the Google Task was removed.',
      undoneTodo: 'Undone — the To Do task was removed.',
      undoneFile: 'Undone — the OneDrive file was removed.',
      undoneRestored: 'Undone — the previous OneDrive file was restored.',
      stillFile: 'Still there — the OneDrive file was not removed.',
      undoClears: 'Undo clears Handled.',
      undonePage: 'Undone — that step was reversed on the page.',
      undoneActivity: 'Undone — Activity no longer says Handled.',
      holdingReply: 'Draft a holding reply',
      needsAddress: 'Needs an address',
      workingNow: 'Working…',
      couldntFind: 'Could not find that message',
      couldntAttach: 'Could not attach that file.',
      couldntDraft: 'Could not create draft',
      couldntDraftRetry: 'Could not create the draft. Try again.',
      alreadyClosed: 'Already closed elsewhere — nothing to do.',
      nothingWritten: 'Nothing was written. A required field is still empty.',
      somethingWrong: 'Something went wrong. Try again.',
      onCalendar: 'On your calendar.',
      preparingNow: 'Preparing…',
      markKept: 'Mark kept',
      markPaid: 'Mark paid',
      markDone: 'Mark done',
      stopTracking: 'Stop tracking',
      earlyLine: 'Nothing else to open, nothing else to check — that’s handled.',
      undoCalendar: 'Undo removes the Calendar event.',
      undoGmail: 'Undo removes the Gmail draft.',
      undoDoc: 'Undo removes the Doc.',
      undoSheet: 'Undo removes the Sheet.',
      undoDrive: 'Undo removes the Drive file.',
      undoWritten: 'Undo removes what was just written.',
      undoAllWritten: 'Undo all removes what was just written.',
      undoneCalendar: 'Undone — the Calendar event was removed.',
      undoneGmail: 'Undone — the Gmail draft was removed.',
      undoneDoc: 'Undone — the Doc was removed.',
      undoneSheet: 'Undone — the Sheet was removed.',
      undoneDrive: 'Undone — the Drive file was removed.',
      undoneNothing: 'Undone — nothing was kept.',
      stillCalendar: 'Still there — the Calendar event was not removed.',
      stillGoogle: 'Still there — the Google Task was not removed.',
      stillGmail: 'Still there — the Gmail draft was not removed.',
      stillDoc: 'Still there — the Doc was not removed.',
      stillSheet: 'Still there — the Sheet was not removed.',
      stillDrive: 'Still there — the Drive file was not removed.',
      stillUndo: 'Still there — Undo didn’t remove it.',
      stillNothing: 'Still there — nothing was removed.',
      deletedIn: 'Deleted in {name}',
      manualOne: '{n} manual step left for you',
      manualMany: '{n} manual steps left for you',
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
      couldnt: 'לא אומת', couldntPlain: 'לא אומת', retry: 'נסה שוב', outlookOff: 'Outlook לא מחובר',
      couldntUnchanged: 'לא אומת שהרשומה לא השתנתה. הביטול השאיר אותה.',
      couldntVerify: 'לא הצלחתי לאשר, נסה שוב',
      createdUnverified: 'נוצר, לא אומת',
      youEdited: 'ערכת את זה. הביטול השאיר את זה.',
      stillThere: 'המשימה עדיין ב-To Do.',
      verifyNote: 'לא אומת',
      verifyingNow: 'מאמת…',
      draftReady: 'טיוטה מוכנה.',
      draftReadyLong: 'טיוטת תשובה מוכנה ב-Outlook. לא נשלח.',
      draftReadyNotSent: 'הטיוטה מוכנה. לא נשלח.',
      draftWithFile: 'טיוטת תשובה מוכנה ב-Outlook, עם הקובץ המצורף. לא נשלח.',
      draftRemoved: 'טיוטת התשובה הוסרה. לא נשלח.',
      draftGone: 'הטיוטה כבר לא שם. אין מה לבטל.',
      couldntRemove: 'לא הצלחתי להסיר את הטיוטה.',
      partlyHandled: 'טופל חלקית.',
      undoGoogle: 'הביטול מסיר את המשימה ב-Google.',
      undoTodo: 'הביטול מסיר את המשימה ב-To Do.',
      undoFile: 'הביטול מסיר את הקובץ ב-OneDrive.',
      undoRestore: 'הביטול משחזר את הקובץ הקודם ב-OneDrive.',
      undoneGoogle: 'בוטל — המשימה ב-Google הוסרה.',
      undoneTodo: 'בוטל — המשימה ב-To Do הוסרה.',
      undoneFile: 'בוטל — הקובץ ב-OneDrive הוסר.',
      undoneRestored: 'בוטל — הקובץ הקודם ב-OneDrive שוחזר.',
      stillFile: 'הקובץ עדיין ב-OneDrive.',
      undoClears: 'הביטול מסיר את הסימון טופל.',
      undonePage: 'בוטל — הצעד שוחזר בדף.',
      undoneActivity: 'בוטל — הרשימה כבר לא אומרת טופל.',
      holdingReply: 'טיוטת תשובת ביניים',
      needsAddress: 'חסרה כתובת',
      workingNow: 'עובד…',
      couldntFind: 'לא מצאתי את ההודעה',
      couldntAttach: 'לא הצלחתי לצרף את הקובץ.',
      couldntDraft: 'לא הצלחתי ליצור טיוטה',
      couldntDraftRetry: 'לא הצלחתי ליצור את הטיוטה. נסה שוב.',
      alreadyClosed: 'כבר נסגר במקום אחר — אין מה לעשות.',
      nothingWritten: 'שום דבר לא נכתב. שדה חובה עדיין ריק.',
      somethingWrong: 'משהו השתבש. נסה שוב.',
      onCalendar: 'ביומן שלך.',
      preparingNow: 'מכין…',
      markKept: 'סמן שנשמר',
      markPaid: 'סמן כשולם',
      markDone: 'סמן כבוצע',
      stopTracking: 'הפסק מעקב',
      earlyLine: 'אין עוד מה לפתוח ואין עוד מה לבדוק — זה טופל.',
      undoCalendar: 'הביטול מסיר את האירוע ביומן.',
      undoGmail: 'הביטול מסיר את הטיוטה ב-Gmail.',
      undoDoc: 'הביטול מסיר את המסמך.',
      undoSheet: 'הביטול מסיר את הגיליון.',
      undoDrive: 'הביטול מסיר את הקובץ ב-Drive.',
      undoWritten: 'הביטול מסיר את מה שנכתב עכשיו.',
      undoAllWritten: 'ביטול הכל מסיר את מה שנכתב עכשיו.',
      undoneCalendar: 'בוטל — האירוע ביומן הוסר.',
      undoneGmail: 'בוטל — הטיוטה ב-Gmail הוסרה.',
      undoneDoc: 'בוטל — המסמך הוסר.',
      undoneSheet: 'בוטל — הגיליון הוסר.',
      undoneDrive: 'בוטל — הקובץ ב-Drive הוסר.',
      undoneNothing: 'בוטל — שום דבר לא נשמר.',
      stillCalendar: 'האירוע עדיין ביומן.',
      stillGoogle: 'המשימה עדיין ב-Google.',
      stillGmail: 'הטיוטה עדיין ב-Gmail.',
      stillDoc: 'המסמך עדיין שם.',
      stillSheet: 'הגיליון עדיין שם.',
      stillDrive: 'הקובץ עדיין ב-Drive.',
      stillUndo: 'עדיין שם — הביטול לא הסיר את זה.',
      stillNothing: 'עדיין שם — שום דבר לא הוסר.',
      deletedIn: 'נמחק ב-{name}',
      manualOne: '{n} צעד ידני נשאר לך',
      manualMany: '{n} צעדים ידניים נשארו לך',
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
    const host = s.hostLanguage == null ? '' : String(s.hostLanguage).trim();
    const ui = s.uiLanguage == null ? '' : String(s.uiLanguage).trim();
    const nav = s.navigatorLanguage == null ? '' : String(s.navigatorLanguage).trim();
    const raw = (setting || host || ui || nav).toLowerCase();
    if (raw === 'he' || raw.indexOf('he-') === 0 || raw === 'iw' || raw.indexOf('iw-') === 0) return 'he';
    return 'en';
  }

  function chrome(lang) {
    return CHROME[uiLangFrom({ setting: lang })] || CHROME.en;
  }

  // Stored receipts keep the English sentence. The paint reads it back in
  // the UI language. A mail-language title is not in the table, so it stays.
  function showChrome(lang, text) {
    const raw = String(text == null ? '' : text);
    if (!raw) return raw;
    const L = chrome(lang);
    const en = CHROME.en;
    const he = CHROME.he;
    const keys = Object.keys(en);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const sample = en[key];
      if (typeof sample !== 'string' || sample.indexOf('{') >= 0) continue;
      if (raw === sample || raw === he[key]) return L[key] || raw;
    }
    const deleted = raw.match(/^Deleted in (.+)$/) || raw.match(/^נמחק ב-(.+)$/);
    if (deleted) return fillChrome(L.deletedIn || 'Deleted in {name}', { name: deleted[1] });
    return raw;
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
    fillChrome: fillChrome,
    showChrome: showChrome
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowDisplay: FlowDisplay };
if (typeof globalThis !== 'undefined') globalThis.FlowDisplay = FlowDisplay;
