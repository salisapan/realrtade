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
  function localizeHeading(lang, title) {
    const raw = String(title == null ? '' : title);
    if (!raw || uiLangFrom({ setting: lang }) !== 'he') return raw;
    let matched = raw.match(/^Log (.+) agreed$/);
    if (matched) return 'רשום ' + matched[1] + ' שסוכם';
    if (raw === 'Log this decision') return 'רשום את ההחלטה';
    if (raw === 'Log that this is not going ahead') return 'רשום שזה לא מתקדם';
    if (raw === 'Log agreement executed') return 'רשום שההסכם נחתם';
    if (raw === 'Log discrepancy raised') return 'רשום שהועלתה אי התאמה';
    matched = raw.match(/^Log commitment for (.+)$/);
    if (matched) return 'רשום התחייבות ל-' + matched[1];
    matched = raw.match(/^Log (.+), (.+)$/);
    if (matched) return 'רשום ' + matched[1] + ', ' + matched[2];
    if (/^log it$/i.test(raw)) return 'רשום';
    if (raw === 'Save the file?') return 'לשמור את הקובץ?';
    return raw;
  }

  function activityTitle(entry, lang) {
    return localizeHeading(lang, activityTitleRaw(entry));
  }

  function activityTitleRaw(entry) {
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
      if (intent && intent.label === 'Log commitment') {
        return { title: 'Log commitment', sentence: p.closingLine || '', fileCard: false, logIt: true };
      }
      if (intent && (intent.label === 'Call' || intent.label === 'שיחה')) {
        return { title: intent.label, sentence: p.closingLine || '', fileCard: false, logIt: true };
      }
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
    'scan-skipped': 'עדיין קורא את המייל',
    'names-pending': 'ממתין לשם'
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

  const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EN_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HE_WD = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  function ymd(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y: y, mo: mo, d: d, wd: dt.getDay() };
  }

  function clockPad(hour, minute) {
    if (hour == null || minute == null || hour === '' || minute === '') return '';
    const h = Number(hour);
    const min = Number(minute);
    if (!Number.isInteger(h) || h < 0 || h > 23) return '';
    if (!Number.isInteger(min) || min < 0 || min > 59) return '';
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  function cardDateLine(iso, lang) {
    if (arguments.length >= 2 && uiLangFrom({ setting: lang }) === 'en') {
      const day = ymd(iso);
      if (!day) return '';
      return 'until ' + EN_MON[day.mo - 1] + ' ' + day.d;
    }
    const day = hebrewDay(iso);
    return day ? ('עד ' + day) : '';
  }

  // Chrome (buttons, headings, receipts) follows the UI language. The action
  // title stays in the mail's language. A stored setting wins, then
  // the host page language, then chrome.i18n.getUILanguage, then
  // navigator.language. The host passes those strings; this file does not
  // read chrome or the DOM.
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
      stepCalendar: 'Calendar', stepTask: 'Task', stepDraft: 'Draft', stepFile: 'File',
      todoApp: 'To Do', outlookApp: 'Outlook', gmailApp: 'Gmail', onedriveApp: 'OneDrive', driveApp: 'Drive',
      justNow: 'just now', minsAgo: '{n}m ago', hrsAgo: '{n}h ago', writtenTo: 'Written to ',
      queued: 'Queued', preparing: 'Preparing', verifying: 'Verifying', verified: 'Verified',
      seeOpen: 'See what’s open',
      holdAt: 'Hold',
      steps: '{n} steps', hideSteps: 'Hide steps',
      saveAsk: 'Save {on} of {all} attachments to {target}?', pickFile: 'Pick at least one file',
      weekLogged: ' logged this week', weekAll: '{n} all-time',
      logEmpty: 'Nothing yet. Glance stays quiet until a loop really closes.',
      senseLabel: 'Sensitivity',
      senseMore: 'Speaking up more — you keep clicking',
      senseLess: 'Holding back — you keep dismissing',
      senseEven: 'Balanced',
      learned: 'Glance has adjusted {n} {noun} about how it works for you.',
      learnedOne: 'thing', learnedMany: 'things',
      insight: 'Glance noticed you usually remove {step} in {process} processes — keep it that way?',
      insightYes: 'Yes, keep it', insightNo: 'No, suggest again',
      activityTab: 'Activity',
      ledgerTitle: 'What Glance learned from you',
      ledgerHint: 'On this device only. Reset forgets every match, how mail opens and closes, links between people, and this list.',
      ledgerReset: 'Reset what Glance learned',
      closeMemHint: 'Close memory and Outlook cards stay on this device. Clearing lets Glance speak again about what already closed, and drops draft receipts that remained.',
      closeMem: 'Clear close memory',
      clearMemConfirm: 'Clear personal close memory and Outlook loop cards on this device? Draft receipts and From Outlook offers will be removed. This cannot be undone.',
      referralTxt: 'Someone else on the team probably has the same open loop.',
      referralCopy: 'Copy a Glance link', referralExport: 'Export the setup',
      copied: 'Copied', exported: 'Exported',
      closeQualityTitle: 'On this device only. A full close, a return, a refusal, and a false close.',
      quietTitle: 'On this device only. Trusted closes this week, and silence is a reason code.',
      stillTitle: 'On this device only. Open cards, closes, and undos.',
      lmOn: 'The model built into this browser also reads wording nothing else recognises, for {langs} (it passed a precision check on this device). It only suggests; you decide.',
      lmOff: 'The model built into this browser did not pass the precision check on this device, so it stays off.',
      lmAnd: ' and ', langEn: 'English', langHe: 'Hebrew'
    },
    he: {
      brand: 'Glance', intentLabel: 'כוונה שזוהתה', will: 'Glance יבצע', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע',
      hold: 'השהה', add: '+ הוסף צעד', addPh: 'הקלד צעד…',
      suggested: 'מוצע', added: 'נוסף', manual: 'ידני · בשבילך',
      dismiss: 'הסתר', dismissing: 'מסתיר…', doIt: 'בצע', view: 'הצג',
      undo: 'בטל', undoAll: 'בטל הכל', undoing: 'מבטל…', closing: 'סוגר…',
      fromOutlook: 'מהדואר', expired: 'פג תוקף', openDraft: 'פתח טיוטה', openEvent: 'פתח אירוע', show: 'הצג',
      handled: 'טופל.', approve: 'אשר סגירה',
      kindHandled: 'טופל', kindUndone: 'בוטל', kindClicked: 'נלחץ', kindDismissed: 'הוסתר', kindDraft: 'טיוטה',
      couldnt: 'לא אומת', couldntPlain: 'לא אומת', retry: 'נסה שוב', outlookOff: 'הדואר לא מחובר',
      couldntUnchanged: 'לא אומת שהרשומה לא השתנתה. הביטול השאיר אותה.',
      couldntVerify: 'לא הצלחתי לאשר, נסה שוב',
      createdUnverified: 'נוצר, לא אומת',
      youEdited: 'ערכת את זה. הביטול השאיר את זה.',
      stillThere: 'המשימה עדיין שם.',
      verifyNote: 'לא אומת',
      verifyingNow: 'מאמת…',
      draftReady: 'טיוטה מוכנה.',
      draftReadyLong: 'טיוטת תשובה מוכנה. לא נשלח.',
      draftReadyNotSent: 'הטיוטה מוכנה. לא נשלח.',
      draftWithFile: 'טיוטת תשובה מוכנה, עם הקובץ. לא נשלח.',
      draftRemoved: 'טיוטת התשובה הוסרה. לא נשלח.',
      draftGone: 'הטיוטה כבר לא שם. אין מה לבטל.',
      couldntRemove: 'לא הצלחתי להסיר את הטיוטה.',
      partlyHandled: 'טופל חלקית.',
      undoGoogle: 'הביטול מסיר את המשימה.',
      undoTodo: 'הביטול מסיר את המשימה.',
      undoFile: 'הביטול מסיר את הקובץ.',
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
      undoGmail: 'הביטול מסיר את הטיוטה.',
      undoDoc: 'הביטול מסיר את המסמך.',
      undoSheet: 'הביטול מסיר את הגיליון.',
      undoDrive: 'הביטול מסיר את הקובץ.',
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
      stepCalendar: 'יומן', stepTask: 'משימה', stepDraft: 'טיוטה', stepFile: 'קובץ',
      todoApp: 'משימות', outlookApp: 'אאוטלוק', gmailApp: 'ג׳ימייל', onedriveApp: 'וואן־דרייב', driveApp: 'דרייב',
      justNow: 'עכשיו', minsAgo: 'לפני {n} דק׳', hrsAgo: 'לפני {n} שע׳', writtenTo: 'נכתב אל ',
      queued: 'בתור', preparing: 'מכין', verifying: 'מאמת', verified: 'אומת',
      seeOpen: 'מה פתוח',
      holdAt: 'שריין',
      steps: '{n} צעדים', hideSteps: 'הסתר צעדים',
      saveAsk: 'לשמור {on} מתוך {all} קבצים ב-{target}?', pickFile: 'בחר לפחות קובץ אחד',
      weekLogged: ' נרשמו השבוע', weekAll: '{n} בסך הכל',
      logEmpty: 'עדיין אין. Glance שותק עד שלולאה באמת נסגרת.',
      senseLabel: 'רגישות',
      senseMore: 'מדבר יותר — אתה ממשיך ללחוץ',
      senseLess: 'ממתין — אתה ממשיך להסתיר',
      senseEven: 'מאוזן',
      learned: 'Glance התאים {n} {noun} באופן שבו הוא עובד בשבילך.',
      learnedOne: 'דבר', learnedMany: 'דברים',
      insight: 'Glance שם לב שאתה בדרך כלל מסיר {step} בתהליכי {process} — להשאיר כך?',
      insightYes: 'כן, כך', insightNo: 'לא, הצע שוב',
      activityTab: 'פעילות',
      ledgerTitle: 'מה Glance למד ממך',
      ledgerHint: 'על המכשיר הזה בלבד. איפוס שוכח כל התאמה, איך נפתחים ונסגרים מיילים, הקשרים בין אנשים, ואת הרשימה הזו.',
      ledgerReset: 'אפס את מה ש-Glance למד',
      closeMemHint: 'זיכרון הסגירה וכרטיסי הדואר נשארים על המכשיר. ניקוי נותן ל-Glance לדבר שוב על מה שכבר נסגר, ומוריד קבלות טיוטה שנשארו.',
      closeMem: 'נקה זיכרון סגירה',
      clearMemConfirm: 'לנקות את זיכרון הסגירה ואת כרטיסי Outlook במכשיר הזה? קבלות טיוטה והצעות מ-Outlook יוסרו. אי אפשר לבטל.',
      referralTxt: 'מישהו נוסף בצוות כנראה עם אותה לולאה פתוחה.',
      referralCopy: 'העתק קישור ל-Glance', referralExport: 'ייצא את ההגדרה',
      copied: 'הועתק', exported: 'יוצא',
      closeQualityTitle: 'על המכשיר בלבד. סגירה מלאה, חזרה, סירוב, וסגירה שגויה.',
      quietTitle: 'על המכשיר בלבד. סגירות מהימנות השבוע, והשקט הוא קוד סיבה.',
      stillTitle: 'על המכשיר בלבד. כרטיסים פתוחים, סגירות, וביטולים.',
      lmOn: 'המודל שבדפדפן הזה גם קורא ניסוח ששום דבר אחר לא מזהה, עבור {langs} (הוא עבר בדיקת דיוק במכשיר הזה). הוא רק מציע; אתה מחליט.',
      lmOff: 'המודל שבדפדפן הזה לא עבר את בדיקת הדיוק במכשיר הזה, אז הוא נשאר כבוי.',
      lmAnd: ' ו-', langEn: 'אנגלית', langHe: 'עברית'
    }
  };

  function fillChrome(template, map) {
    return String(template || '').replace(/\{(\w+)\}/g, function (_, key) {
      return map && map[key] != null ? String(map[key]) : '';
    });
  }

  // The age on a still-open row. Same picker as the chrome: a Hebrew UI
  // says לפני 11 שע׳, an English UI says 11h ago. A day past that is
  // 17 באוק׳ or Oct 17. The mail's own title is not this string.
  function ageLine(ts, lang, now) {
    const which = uiLangFrom({ setting: lang });
    const L = chrome(which);
    const at = Number(ts);
    const clock = Number(now);
    const base = Number.isFinite(clock) ? clock : Date.now();
    if (!Number.isFinite(at)) return '';
    const mins = Math.round((base - at) / 60000);
    if (mins < 1) return L.justNow;
    if (mins < 60) return fillChrome(L.minsAgo, { n: mins });
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return fillChrome(L.hrsAgo, { n: hrs });
    const day = new Date(at);
    if (which === 'he') {
      const iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      return hebrewDay(iso);
    }
    return EN_MON[day.getMonth()] + ' ' + day.getDate();
  }

  // A greeting cannot be judged until userinfo (or the me chip) has a name.
  // This line is that hold. It is not a quiet.
  function namesPendingLine(lang) {
    return uiLangFrom({ setting: lang }) === 'he' ? 'ממתין לשם' : 'Waiting for your name';
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

  // The primary button follows the plan and the UI language. A To Do
  // task says Do It. A calendar hold says Hold It.
  function actionLabel(process, lang) {
    const L = chrome(lang);
    const steps = (process && process.steps) || [];
    const taskOnly = steps.length > 0 && steps.every((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'task'));
    if (taskOnly) return L.doIt;
    const id = process && process.id;
    if (id === 'hold' || id === 'schedule' || id === 'schedule-confirm' || id === 'clear-it' || id === 'move-it') return L.hold;
    if (steps.some((s) => s && s.kind === 'calendar')) return L.hold;
    return L.doIt;
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

  function holdWhenLine(iso, hour, minute, lang) {
    const clock = clockPad(hour, minute);
    if (!clock) return '';
    const which = arguments.length >= 4 ? uiLangFrom({ setting: lang }) : 'he';
    if (which === 'en') {
      const day = ymd(iso);
      if (!day) return '';
      return EN_MON[day.mo - 1] + ' ' + day.d + ' ' + clock;
    }
    const day = hebrewDay(iso);
    if (!day) return '';
    return day + ' ' + clock;
  }

  // The card text itself: "Hold Mon 10:00", or "שריין ב׳ 10:00".
  // השהה is the Hold It button only. A missing day or clock is empty.
  function holdCardText(lang, iso, hour, minute) {
    const day = ymd(iso);
    const clock = clockPad(hour, minute);
    if (!day || !clock) return '';
    const which = uiLangFrom({ setting: lang });
    const word = (chrome(which).holdAt) || (which === 'he' ? 'שריין' : 'Hold');
    const wd = which === 'he' ? HE_WD[day.wd] : EN_WD[day.wd];
    return word + ' ' + wd + ' ' + clock;
  }

  function readClock(bag) {
    if (!bag) return null;
    const dateIso = bag.dateIso || (bag.date && bag.date.iso) || null;
    const hour = bag.hour != null ? bag.hour : (bag.time && bag.time.hour);
    const minute = bag.minute != null ? bag.minute : (bag.time && bag.time.minute);
    if (!dateIso) return null;
    return { dateIso: dateIso, hour: hour, minute: minute };
  }

  function holdClockFrom(ctx) {
    if (!ctx) return null;
    const bags = [];
    if (ctx.holdClock) bags.push(ctx.holdClock);
    if (ctx.calendarHold && ctx.calendarHold.params) bags.push(ctx.calendarHold.params);
    ((ctx.process && ctx.process.steps) || []).forEach(function (step) { if (step && step.params) bags.push(step.params); });
    if (ctx.intent) {
      bags.push(ctx.intent);
      if (ctx.intent.entities) bags.push(ctx.intent.entities);
      if (ctx.intent.facts) bags.push(ctx.intent.facts);
      const rem = ctx.intent.entities && ctx.intent.entities.reminder;
      if (rem) bags.push(rem);
    }
    for (let i = 0; i < bags.length; i++) {
      const found = readClock(bags[i]);
      if (found) return found;
    }
    return null;
  }

  function cardTitle(lang, ctx, fallback) {
    const hold = ctx && (ctx.glanceChain === 'calendar-hold' || (ctx.process && ctx.process.id === 'hold'));
    if (hold) {
      const clock = holdClockFrom(ctx);
      const line = clock ? holdCardText(lang, clock.dateIso, clock.hour, clock.minute) : '';
      if (line) return line;
    }
    return localizeHeading(lang, fallback == null ? '' : String(fallback));
  }

  function activityMetric(lang, text) {
    const raw = String(text == null ? '' : text);
    if (!raw || uiLangFrom({ setting: lang }) !== 'he') return raw;
    let line = raw;
    line = line.replace(/Full closes (\d+) · Returns (\d+) · Turned down (\d+)( · False-close (\d+)%)?/, function (_m, a, b, c, _tail, d) {
      let out = 'סגירות מלאות ' + a + ' · חזרות ' + b + ' · סירובים ' + c;
      if (d != null && d !== '') out += ' · סגירה שגויה ' + d + '%';
      return out;
    });
    line = line.replace(/Trusted closes (\d+) this week · Undo (\d+)/g, 'סגירות מהימנות $1 השבוע · ביטולים $2');
    line = line.replace(/Silence this week /g, 'שקט השבוע ');
    line = line.replace(/Silence /g, 'שקט ');
    line = line.replace(/Still open — shown (\d+) · Do It (\d+) · undo (\d+) · false-close (\d+)/g, 'עדיין פתוח — הוצגו $1 · בצע $2 · ביטול $3 · סגירה שגויה $4');
    const reasons = [
      ['outlook-file-found-no-attach', 'קובץ בלי צירוף'],
      ['third-party', 'צד שלישי'],
      ['calibrated', 'מכויל'],
      ['memory', 'זיכרון'],
      ['noise', 'רעש'],
      ['hedge', 'גידור'],
      ['family', 'משפחה'],
      ['google', 'גוגל'],
      ['file', 'קובץ'],
      ['fact', 'עובדה'],
      ['low', 'נמוך']
    ];
    reasons.forEach(function (pair) {
      const code = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      line = line.replace(new RegExp('(^| · )' + code + ' (?=\\d)', 'g'), '$1' + pair[1] + ' ');
    });
    return line;
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
    holdCardText: holdCardText,
    holdClockFrom: holdClockFrom,
    cardTitle: cardTitle,
    localizeHeading: localizeHeading,
    activityMetric: activityMetric,
    uiLangFrom: uiLangFrom,
    ageLine: ageLine,
    namesPendingLine: namesPendingLine,
    chrome: chrome,
    actionLabel: actionLabel,
    fillChrome: fillChrome,
    showChrome: showChrome
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowDisplay: FlowDisplay };
if (typeof globalThis !== 'undefined') globalThis.FlowDisplay = FlowDisplay;
