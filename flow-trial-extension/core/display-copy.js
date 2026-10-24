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
  // A card with no sentence of its own is titled by its process name.
  const PROCESS_NAME_HE = {
    'Reply & Track': 'מענה ומעקב',
    'Schedule It': 'לתזמן',
    'Schedule & Confirm': 'לתזמן ולאשר',
    'Follow Through': 'לעקוב עד הסוף',
    'Move It': 'להזיז',
    'Clear It': 'לפנות',
    'Attach it': 'לצרף',
    'Reply with it': 'להשיב עם הקובץ',
    'Draft it': 'לנסח טיוטה',
    'Note it': 'לרשום הערה',
    'File it': 'לשמור את הקובץ'
  };

  function localizeHeading(lang, title, extra) {
    const raw = String(title == null ? '' : title);
    if (!raw || uiLangFrom({ setting: lang }) !== 'he') return raw;
    let matched = raw.match(/^Log (.+) agreed$/);
    if (matched) return 'רשום ' + matched[1] + ' שסוכם';
    if (raw === 'Log this decision') return 'רשום את ההחלטה';
    if (raw === 'Log decision') return 'לתעד החלטה';
    if (raw === 'Handle this note') return 'לטפל בהערה';
    if (raw === 'Log commitment') return 'לתעד התחייבות';
    if (raw === 'Follow up') return 'מעקב';
    if (raw === 'Save the file') return 'לשמור את הקובץ';
    if (raw === 'Log that this is not going ahead') return 'רשום שזה לא מתקדם';
    if (raw === 'Log agreement executed') return 'רשום שההסכם נחתם';
    if (raw === 'Log discrepancy raised') return 'רשום שהועלתה אי התאמה';
    matched = raw.match(/^Log commitment for (.+)$/);
    if (matched) return 'רשום התחייבות ל-' + matched[1];
    matched = raw.match(/^Log (.+), (.+)$/);
    if (matched) return 'רשום ' + matched[1] + ', ' + matched[2];
    if (/^log it$/i.test(raw)) return 'רשום';
    if (raw === 'Save the file?') return 'לשמור את הקובץ?';
    if (Object.prototype.hasOwnProperty.call(PROCESS_NAME_HE, raw)) return PROCESS_NAME_HE[raw];
    matched = raw.match(/^Call about (.+)$/);
    if (matched) return hebrewCallAbout(matched[1], extra);
    matched = raw.match(/^Call with (.+)$/);
    if (matched) {
      if (ownNote(extra) && isOwnPerson(matched[1], extra)) return hebrewSelfCall(extra);
      return 'שיחה עם ' + matched[1];
    }
    const when = hebrewCallWhen(raw);
    if (when) return 'שיחה ' + when;
    if (raw === 'Call') return 'שיחה';
    matched = raw.match(/^Call (.+)$/);
    if (matched) {
      const verb = hebrewCallVerb(matched[1]);
      return verb || raw;
    }
    return raw;
  }

  // A topic is one whole phrase, in Hebrew word order, or it is not
  // translated. A name or a brand inside that phrase stays as written.
  // There is no word-by-word pass.
  const CALL_TOPIC_PHRASE_HE = [
    ['the new pricing plan', 'תוכנית התמחור החדשה'],
    ['new pricing plan', 'תוכנית התמחור החדשה'],
    ['the pricing plan', 'תוכנית התמחור'],
    ['pricing plan', 'תוכנית התמחור'],
    ['the q4 budget plan', 'תוכנית תקציב Q4'],
    ['the q4 budget', 'תקציב Q4'],
    ['q4 budget', 'תקציב Q4'],
    ["dana's contract renewal", 'חידוש החוזה של Dana'],
    ['the globex renewal', 'חידוש Globex'],
    ['globex renewal', 'חידוש Globex'],
    ['the contract with initech', 'החוזה עם Initech'],
    ['the hiring plan for glance', 'תוכנית הגיוס של Glance'],
    ['initech onboarding', 'קליטת Initech'],
    ['the new website', 'האתר החדש'],
    ['new website', 'האתר החדש'],
    ['the launch checklist', 'רשימת ההשקה'],
    ['launch checklist', 'רשימת ההשקה'],
    ['the campaign', 'הקמפיין'],
    ['the pilot', 'הפיילוט'],
    ['the contract', 'החוזה'],
    ['the renewal', 'החידוש'],
    ['the invoice', 'החשבונית'],
    ['onboarding', 'קליטה'],
    ['campaign', 'הקמפיין'],
    ['pilot', 'הפיילוט'],
    ['contract', 'החוזה'],
    ['renewal', 'החידוש'],
    ['invoice', 'החשבונית']
  ];
  const CALL_VERB_HE = {
    'the bank': 'לבנק',
    'a bank': 'לבנק',
    bank: 'לבנק',
    'the accountant': 'לרואה החשבון',
    'an accountant': 'לרואה החשבון',
    accountant: 'לרואה החשבון'
  };
  const CALL_DAY_HE = {
    monday: 'יום שני',
    tuesday: 'יום שלישי',
    wednesday: 'יום רביעי',
    thursday: 'יום חמישי',
    friday: 'יום שישי',
    saturday: 'יום שבת',
    sunday: 'יום ראשון',
    tomorrow: 'מחר',
    today: 'היום',
    tonight: 'הלילה'
  };
  const CALL_MONTH_HE = {
    january: 'בינואר', jan: 'בינו׳',
    february: 'בפברואר', feb: 'בפבר׳',
    march: 'במרץ', mar: 'במרץ',
    april: 'באפריל', apr: 'באפר׳',
    may: 'במאי',
    june: 'ביוני', jun: 'ביוני',
    july: 'ביולי', jul: 'ביולי',
    august: 'באוגוסט', aug: 'באוג׳',
    september: 'בספטמבר', sep: 'בספט׳', sept: 'בספט׳',
    october: 'באוקטובר', oct: 'באוק׳',
    november: 'בנובמבר', nov: 'בנוב׳',
    december: 'בדצמבר', dec: 'בדצ׳'
  };

  function personName(extra) {
    if (!extra || typeof extra !== 'object') return '';
    const raw = extra.senderName || (extra.sender && extra.sender.name) || '';
    const name = String(raw).replace(/\s+/g, ' ').trim();
    if (!name || name.indexOf('@') >= 0 || /^me$/i.test(name)) return '';
    return name;
  }

  // A note the person sent to their own address. The sender is then
  // themselves, and the Hebrew title does not say שיחה עם that name.
  function ownNote(extra) {
    if (!extra || typeof extra !== 'object') return false;
    if (extra.self === true) return true;
    if (extra.intent && extra.intent.selfTask) return true;
    const who = personName(extra).toLowerCase();
    if (!who) return false;
    const names = [];
    if (extra.userName) names.push(String(extra.userName));
    if (Array.isArray(extra.ownNames)) {
      for (let i = 0; i < extra.ownNames.length; i++) names.push(String(extra.ownNames[i] || ''));
    }
    for (let i = 0; i < names.length; i++) {
      const n = names[i].replace(/\s+/g, ' ').trim().toLowerCase();
      if (!n) continue;
      if (who === n) return true;
      const first = n.split(' ')[0];
      if (first.length > 1 && who.split(' ')[0] === first) return true;
    }
    return false;
  }

  function isOwnPerson(name, extra) {
    const who = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!who) return false;
    const sender = personName(extra).toLowerCase();
    if (ownNote(extra) && sender && (who === sender || sender.indexOf(who) >= 0 || who.indexOf(sender) >= 0)) return true;
    const names = [];
    if (extra && extra.userName) names.push(String(extra.userName));
    if (extra && Array.isArray(extra.ownNames)) {
      for (let i = 0; i < extra.ownNames.length; i++) names.push(String(extra.ownNames[i] || ''));
    }
    for (let i = 0; i < names.length; i++) {
      const n = String(names[i] || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (n && who === n) return true;
    }
    return false;
  }

  function translateCallTopic(phrase) {
    const raw = String(phrase || '').replace(/\s+/g, ' ').replace(/[’']/g, "'").trim();
    if (!raw || /[\u0590-\u05FF]/.test(raw)) return '';
    const lower = raw.toLowerCase();
    for (let i = 0; i < CALL_TOPIC_PHRASE_HE.length; i++) {
      if (lower === CALL_TOPIC_PHRASE_HE[i][0]) return CALL_TOPIC_PHRASE_HE[i][1];
    }
    return '';
  }

  function localCallTopic(phrase, lang) {
    const raw = String(phrase || '').replace(/\s+/g, ' ').trim();
    if (!raw || uiLangFrom({ setting: lang }) !== 'he') return raw;
    if (/[\u0590-\u05FF]/.test(raw)) return raw;
    const he = translateCallTopic(raw);
    return he || raw;
  }

  function hebrewCallAbout(phrase, extra) {
    const raw = String(phrase || '').replace(/\s+/g, ' ').trim();
    if (/[\u0590-\u05FF]/.test(raw)) return 'שיחה בנושא ' + raw;
    const he = translateCallTopic(raw);
    if (he) return 'שיחה בנושא ' + he;
    if (ownNote(extra)) return hebrewSelfCall(extra);
    const who = personName(extra);
    if (who) return 'שיחה עם ' + who;
    return 'Call about ' + raw;
  }

  function hebrewSelfCall(extra) {
    const body = extra && (extra.bodyText || extra.text || extra.body || '');
    const when = hebrewWhenFromText(body);
    return when ? ('שיחה ' + when) : 'שיחה';
  }

  function hebrewClockToken(token) {
    const t = String(token || '').replace(/\s+/g, '').toLowerCase();
    const am = /am$/.test(t);
    const pm = /pm$/.test(t);
    if (!am && !pm) return t;
    const num = t.replace(/am$|pm$/, '');
    const bits = num.split(':');
    let hour = parseInt(bits[0], 10);
    const minute = bits.length > 1 ? bits[1] : '00';
    if (!isFinite(hour)) return t;
    if (pm && hour < 12) hour += 12;
    if (am && hour === 12) hour = 0;
    return hour + ':' + (minute.length === 1 ? '0' + minute : minute);
  }

  function hebrewCallWhen(title) {
    let m = String(title || '').match(/^Call (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight)(?: (\d{1,2}(?::\d{2})?(?:am|pm)?))?$/i);
    if (m) {
      const day = m[1].toLowerCase();
      const clock = m[2] ? hebrewClockToken(m[2]) : '';
      const bare = (day === 'tomorrow' || day === 'today' || day === 'tonight')
        ? CALL_DAY_HE[day]
        : ('ב' + CALL_DAY_HE[day]);
      return clock ? (bare + ' ' + clock) : bare;
    }
    m = String(title || '').match(/^Call (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec) (\d{1,2})(?: (\d{1,2}(?::\d{2})?(?:am|pm)?))?$/i);
    if (!m) return '';
    const clock = m[3] ? hebrewClockToken(m[3]) : '';
    const dated = 'ב-' + m[2] + ' ' + CALL_MONTH_HE[m[1].toLowerCase()];
    return clock ? (dated + ' ' + clock) : dated;
  }

  function hebrewWhenFromText(text) {
    const raw = String(text || '');
    let m = raw.match(/\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (m) return hebrewCallWhen('Call ' + m[1] + ' ' + m[2].replace(/\s+/g, ''));
    m = raw.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!m) return '';
    return hebrewCallWhen('Call ' + m[1] + ' ' + m[2] + ' ' + m[3].replace(/\s+/g, ''));
  }

  function hebrewCallVerb(object) {
    const raw = String(object || '').replace(/\s+/g, ' ').replace(/[.,!?]+$/g, '').trim();
    if (/^(?:her|him|them|you|me|us|she|he|they)$/i.test(raw)) return '';
    if (/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight)$/i.test(raw)) return '';
    const known = CALL_VERB_HE[raw.toLowerCase()];
    if (known) return 'להתקשר ' + known;
    if (/^[\u0590-\u05FF][\u0590-\u05FF'’.-]{1,40}$/.test(raw)) return 'להתקשר ל' + raw;
    if (/^[A-Z][A-Za-z'’.-]{1,40}(?:\s+[A-Z][A-Za-z'’.-]{1,40})?$/.test(raw)) return 'להתקשר ל-' + raw;
    return '';
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
    // Schedule It is the process name. A call titled by the engine keeps
    // that title. Other schedule cards still use the process name.
    if (id === 'schedule') {
      const titled = intent && String(intent.label || '').trim();
      if (/^Call about\b/.test(titled) || /^Call with\b/.test(titled) || /^Call\s+\S/.test(titled) || /^שיחה\b/.test(titled)) {
        return { title: titled.replace(/[.,\s]+$/g, ''), sentence: null, fileCard: false, logIt: false };
      }
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
    'attachments-not-read': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'attachment-count-unread': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'too-short': 'לא זוהתה בקשה',
    'tasks-not-granted': 'אין הרשאת To Do',
    'third-party': 'משתמש חיצוני',
    'calendar-write-not-granted': 'צריך הרשאה ליומן',
    'outlook-calendar-write-not-granted': 'צריך הרשאה ליומן',
    'suggest:no-consent': 'יש קובץ מצורף. צריך הרשאת OneDrive כדי לשמור אותו',
    'suggest:attachments-unread': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'suggest:unresolved': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'suggest:graph-400': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'suggest:graph-0': 'לא הצלחתי לקרוא את הקבצים המצורפים',
    'suggest:too-large': 'הקובץ המצורף גדול מדי לשמירה',
    'scan-skipped': 'עדיין קורא את המייל',
    'names-pending': 'ממתין לשם',
    'reply-target-unsure': 'לא הצלחתי לוודא על איזה מייל פתוח — לא נוצרה טיוטה'
  };

  const WHY_EN = {
    'context-dead': 'The extension updated',
    'not-connected': 'Not connected',
    'no-token': 'Not connected',
    'intent-null': 'No request recognised',
    'attachments-not-read': 'Could not read the attachments from Outlook',
    'attachment-count-unread': 'Could not read the attachments from Outlook',
    'too-short': 'No request recognised',
    'tasks-not-granted': 'To Do permission is missing',
    'third-party': 'External user',
    'calendar-write-not-granted': 'Calendar permission is needed',
    'outlook-calendar-write-not-granted': 'Calendar permission is needed',
    'suggest:no-consent': 'There is an attachment. OneDrive permission is needed to save it',
    'suggest:attachments-unread': 'Could not read the attachments from Outlook',
    'suggest:unresolved': 'Could not read the attachments from Outlook',
    'suggest:graph-400': 'Could not read the attachments from Outlook',
    'suggest:graph-0': 'Could not read the attachments from Outlook',
    'suggest:too-large': 'The attachment is too large to save',
    'scan-skipped': 'Still reading the mail',
    'names-pending': 'Waiting for your name',
    'reply-target-unsure': "I couldn't confirm which message is open — nothing was drafted."
  };

  function whyNotShownLine(reason, lang) {
    let r = String(reason || '');
    r = r.replace(/^(?:page:|quiet:|outlook:)/, '');
    const which = arguments.length >= 2 ? uiLangFrom({ setting: lang }) : 'he';
    const table = which === 'he' ? WHY_HE : WHY_EN;
    if (table[r]) return table[r];
    const bare = r.replace(/^outlook-/, '');
    if (table[bare]) return table[bare];
    return table['intent-null'];
  }

  const ATTACH_UNREAD_HE = 'לא הצלחתי לקרוא את הקבצים המצורפים';
  const ATTACH_UNREAD_EN = 'Could not read the attachments from Outlook';
  const NOTE_SELF_SHORT_HE = 'ממך אליך';
  const NOTE_SELF_SHORT_EN = 'From you to you';
  const NOTE_SELF_TASK_HE = 'ממך אליך — הוצעה משימה';
  const NOTE_SELF_TASK_EN = 'From you to you — a task was suggested.';
  const ATTACH_LOADING_HE = 'עד שייטענו את הקבצים המצורפים';
  const ATTACH_LOADING_EN = 'Until the attachments finish loading';
  const MISSING_SCOPE_HE = '{scope} לא כלול בכניסה. בהגדרות, סמן {service}.';
  const MISSING_SCOPE_EN = '{scope} is not included in your sign-in. In Settings, check {service}.';
  const TODO_AFTER_DRAFT_FAIL_HE = 'משימת To Do לא נוצרה. הטיוטה מוכנה.';
  const TODO_AFTER_DRAFT_FAIL_EN = "To Do task wasn't created. The draft is ready.";

  function attachmentsNotReadLine(lang) {
    const which = uiLangFrom({ setting: lang });
    return which === 'he' ? ATTACH_UNREAD_HE : ATTACH_UNREAD_EN;
  }

  function noteToSelfLine(lang, opts) {
    const which = uiLangFrom({ setting: lang });
    const withTask = opts && (opts.taskSuggested === true || opts.withTask === true);
    if (withTask) return which === 'he' ? NOTE_SELF_TASK_HE : NOTE_SELF_TASK_EN;
    return which === 'he' ? NOTE_SELF_SHORT_HE : NOTE_SELF_SHORT_EN;
  }

  function outlookTodoFailedAfterDraftLine(lang) {
    const which = uiLangFrom({ setting: lang });
    return which === 'he' ? TODO_AFTER_DRAFT_FAIL_HE : TODO_AFTER_DRAFT_FAIL_EN;
  }

  function attachmentsLoadingLine(lang) {
    const which = uiLangFrom({ setting: lang });
    return which === 'he' ? ATTACH_LOADING_HE : ATTACH_LOADING_EN;
  }

  function missingScopeLine(scope, service, lang) {
    const name = String(scope || '').trim();
    const box = String(service || '').trim();
    if (!name || !box) return '';
    const which = arguments.length >= 3 ? uiLangFrom({ setting: lang }) : 'he';
    const tpl = which === 'he' ? MISSING_SCOPE_HE : MISSING_SCOPE_EN;
    return tpl.replace('{scope}', name).replace('{service}', box);
  }

  // Card dates are Hebrew. A deadline is "עד 23 באוק׳". A hold prints the
  // day and the clock, and an empty string means there is no hold to show.
  const HE_MON = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

  // The day follows the UI locale. Hebrew is 17 באוק׳. English is Oct 17.
  // A different year adds the year. The clock stays off this string.
  function localeDay(iso, lang, now) {
    const day = ymd(iso);
    if (!day) return '';
    const which = arguments.length >= 2 ? uiLangFrom({ setting: lang }) : 'he';
    const dt = new Date(day.y, day.mo - 1, day.d);
    const clock = now == null ? null : new Date(now);
    const sameYear = !clock || Number.isNaN(clock.getTime()) || dt.getFullYear() === clock.getFullYear();
    const opts = { day: 'numeric', month: 'short' };
    if (!sameYear) opts.year = 'numeric';
    return new Intl.DateTimeFormat(which === 'he' ? 'he' : 'en', opts).format(dt);
  }

  function hebrewDay(iso) {
    return localeDay(iso, 'he');
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
    const which = arguments.length >= 2 ? uiLangFrom({ setting: lang }) : 'he';
    const day = localeDay(iso, which);
    if (!day) return '';
    return which === 'en' ? ('until ' + day) : ('עד ' + day);
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
      composeDraftOpened: 'Draft opened in compose. You send it.',
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
      nothingWrittenShort: 'Nothing was written.',
      stepDraftLink: 'Draft link',
      stepReplyDraft: 'Reply draft',
      stepDraftFile: 'Draft reply + file',
      notConfirmed: 'Not closed — the task was not confirmed.',
      notReadBack: 'Not closed — Glance could not read that task back.',
      notWired: 'That action isn’t wired up yet.',
      couldntComplete: 'Couldn’t complete that action.',
      composeClosed: 'Open Reply first. Glance does not press Send.',
      missingPermission: 'Google is missing permission for this action. Reconnect Google with the required access.',
      composeEmpty: 'The compose window is still empty.',
      driveFileScope: 'Glance can’t open that Drive file with the access in this version. Use a thread attachment, or a file Glance already saved for you.',
      skippedEarlier: 'Skipped — an earlier step in this process didn’t complete.',
      todoUiCache: 'Microsoft To Do can keep that task on screen for about two minutes. A reload shows it gone.',
      notAllGone: 'Not all of it is gone. Undo again to remove what’s left.',
      lineCalOff: 'Off your calendar.',
      lineCalMoved: 'Moved on your calendar.',
      lineSchedDraftTrack: 'Scheduled, drafted, and tracked.',
      lineSchedReminder: 'Scheduled, with a reminder set.',
      lineDraftTrack: 'Drafted and tracked.',
      lineReminderReply: 'Reminder set, reply ready.',
      lineFactDraft: 'The fact is in a reply draft.',
      lineLogTrack: 'Logged and tracked.',
      lineCalFile: 'On your calendar, with the file.',
      lineTaskFile: 'On the task, with the file.',
      lineDriveLink: 'Saved to Drive, link drafted.',
      lineTemplateLink: 'Drafted from the template, link ready.',
      lineOneDrive: 'Saved on OneDrive.',
      lineDraftFile: 'Drafted, with the file attached.',
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
      stillOpenOne: '1 thing still open',
      stillOpenMany: '{n} things still open',
      resurface: 'Still open from this thread',
      moreOpenOne: '1 more still open — close these first and it moves up',
      moreOpenMany: '{n} more still open — close these first and they move up',
      close: 'Close',
      promisedBy: 'You promised this by {when}',
      promisedOpen: 'A dated promise is still open',
      replyOwed: 'A reply is still owed',
      amountOpen: 'A confirmed amount is still open',
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
      composeDraftOpened: 'הטיוטה מוכנה בחלון ההודעה. אתה שולח.',
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
      nothingWrittenShort: 'שום דבר לא נכתב.',
      stepDraftLink: 'קישור בטיוטה',
      stepReplyDraft: 'טיוטת תשובה',
      stepDraftFile: 'טיוטת תשובה + קובץ',
      notConfirmed: 'לא נסגר — המשימה לא אומתה.',
      notReadBack: 'לא נסגר — Glance לא הצליח לקרוא את המשימה בחזרה.',
      notWired: 'הפעולה הזו עדיין לא מחוברת.',
      couldntComplete: 'לא הצלחתי להשלים את הפעולה.',
      composeClosed: 'פתח קודם תשובה. Glance לא לוחץ על שליחה.',
      missingPermission: 'חסרה הרשאה ל-Google לפעולה הזו. חבר מחדש את Google עם ההרשאות הנדרשות.',
      composeEmpty: 'חלון הכתיבה עדיין ריק.',
      driveFileScope: 'Glance עדיין לא יכול לפתוח את קובץ Drive הזה עם ההרשאות בגרסה הזו. השתמש בקובץ מצורף בשרשור, או בקובץ ש-Glance כבר שמר עבורך.',
      skippedEarlier: 'דולג — שלב קודם בתהליך לא הושלם.',
      todoUiCache: 'ב-Microsoft To Do המשימה יכולה להישאר על המסך כשתי דקות. אחרי רענון היא נעלמת.',
      notAllGone: 'לא הכול הוסר. בטל שוב כדי להסיר את מה שנשאר.',
      lineCalOff: 'הוסר מהיומן שלך.',
      lineCalMoved: 'הוזז ביומן שלך.',
      lineSchedDraftTrack: 'נקבע ביומן, נוצרה טיוטה, והמעקב פעיל.',
      lineSchedReminder: 'נקבע ביומן, עם תזכורת.',
      lineDraftTrack: 'נוצרה טיוטה, והמעקב פעיל.',
      lineReminderReply: 'התזכורת נקבעה, התשובה מוכנה.',
      lineFactDraft: 'הפרט מופיע בטיוטת תשובה.',
      lineLogTrack: 'נרשם, והמעקב פעיל.',
      lineCalFile: 'ביומן שלך, עם הקובץ.',
      lineTaskFile: 'על המשימה, עם הקובץ.',
      lineDriveLink: 'נשמר ב-Drive, הקישור בטיוטה.',
      lineTemplateLink: 'נוצרה טיוטה מהתבנית, הקישור מוכן.',
      lineOneDrive: 'נשמר ב-OneDrive.',
      lineDraftFile: 'נוצרה טיוטה, עם הקובץ מצורף.',
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
      stillOpenOne: 'דבר אחד עדיין פתוח',
      stillOpenMany: '{n} דברים עדיין פתוחים',
      resurface: 'עדיין פתוח מהשרשור הזה',
      moreOpenOne: 'עוד דבר אחד עדיין פתוח — סגור את אלה קודם והוא יעלה',
      moreOpenMany: '{n} נוספים עדיין פתוחים — סגור את אלה קודם והם יעלו',
      close: 'סגור',
      promisedBy: 'התחייבת עד {when}',
      promisedOpen: 'התחייבות עם תאריך עדיין פתוחה',
      replyOwed: 'עדיין חייבים תשובה',
      amountOpen: 'סכום שסוכם עדיין פתוח',
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
    const iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    return localeDay(iso, which);
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
    if (uiLangFrom({ setting: lang }) === 'he') return showReceiptHe(raw);
    return raw;
  }

  const DONE_VERB_HE = {
    'scheduled': 'נקבעה פגישה',
    'drafted a reply': 'נוצרה טיוטת תשובה',
    'set a reminder': 'נקבעה תזכורת',
    'wrote the doc': 'נכתב המסמך',
    'wrote the sheet': 'נכתב הגיליון',
    'saved the file': 'נשמר הקובץ',
    'completed one step': 'הושלם צעד אחד'
  };

  const NOUN_HE = {
    'Google Task': 'המשימה ב-Google',
    'To Do task': 'המשימה ב-To Do',
    'Gmail draft': 'הטיוטה ב-Gmail',
    'Calendar event': 'האירוע ביומן',
    'Doc': 'המסמך',
    'Sheet': 'הגיליון',
    'Drive file': 'הקובץ ב-Drive',
    'OneDrive file': 'הקובץ ב-OneDrive'
  };

  function splitEnglishList(text) {
    return String(text).replace(/, and /g, ', ').split(/, | and /);
  }

  function joinHebrewList(items) {
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' ו' + items[items.length - 1];
  }

  function nounsHe(list, withEt) {
    const out = [];
    const parts = splitEnglishList(list);
    for (let i = 0; i < parts.length; i++) {
      const noun = NOUN_HE[parts[i].replace(/^the /, '')];
      if (!noun) return null;
      out.push(withEt ? 'את ' + noun : noun);
    }
    return out;
  }

  // Receipt sentences that are built from a list of what was written
  // (receipt-copy.js and the Closed summary in content-gmail.js). A list with
  // a word this table does not know is left as it came: a half-translated
  // sentence would name the wrong thing.
  function showReceiptHe(raw) {
    let m = raw.match(/^Closed — (.+)\.$/);
    if (m) {
      const verbs = splitEnglishList(m[1]).map((v) => DONE_VERB_HE[v]);
      if (verbs.every(Boolean)) return 'נסגר — ' + joinHebrewList(verbs) + '.';
      return raw;
    }
    m = raw.match(/^Partly done — (.+)\.$/);
    if (m) {
      const verbs = splitEnglishList(m[1]).map((v) => DONE_VERB_HE[v]);
      if (verbs.every(Boolean)) return 'בוצע חלקית — ' + joinHebrewList(verbs) + '.';
      return raw;
    }
    m = raw.match(/^Closing — (.+)…$/);
    if (m) {
      if (m[1] === 'working') return 'סוגר — עובד…';
      const verbs = splitEnglishList(m[1]).map((v) => DONE_VERB_HE[v]);
      return verbs.every(Boolean) ? 'סוגר — ' + joinHebrewList(verbs) + '…' : raw;
    }
    m = raw.match(/^No matching contact for (.+)\.$/);
    if (m) return 'אין איש קשר מתאים עבור ' + m[1] + '.';
    m = raw.match(/^Undo all removes (.+)\.$/);
    if (m) {
      const nouns = nounsHe(m[1], true);
      return nouns ? 'ביטול הכל מסיר ' + joinHebrewList(nouns) + '.' : raw;
    }
    m = raw.match(/^Undone — (.+) (?:was|were) removed\.$/);
    if (m) {
      const nouns = nounsHe(m[1], false);
      return nouns ? 'בוטל — ' + joinHebrewList(nouns) + ' הוסרו.' : raw;
    }
    m = raw.match(/^The (.+) is still there\. Undo again to remove it\.$/);
    if (m) {
      const nouns = nounsHe(m[1], false);
      return nouns ? nouns[0] + ' עדיין שם. בטל שוב כדי להסיר.' : raw;
    }
    m = raw.match(/^Saved (.+?) to OneDrive$/i);
    if (m) return 'נשמר ' + m[1] + ' ב-OneDrive';
    if (raw === 'Save the file?') return 'לשמור את הקובץ?';
    return raw;
  }

  function holdWhenLine(iso, hour, minute, lang) {
    const clock = clockPad(hour, minute);
    if (!clock) return '';
    const which = arguments.length >= 4 ? uiLangFrom({ setting: lang }) : 'he';
    const day = localeDay(iso, which);
    if (!day) return '';
    return day + ' ' + clock;
  }

  // The panel line David reads on a live account. English on purpose.
  // source is profile, aria-label, or none. The aria name is not stored
  // as glanceOwnNames.
  function namesDiagFrom(profileNames, ariaName) {
    const names = [];
    function add(raw) {
      const name = String(raw || '').trim();
      if (!name) return;
      const low = name.toLowerCase();
      if (low === 'me' || low === 'glance') return;
      if (names.some((n) => n.toLowerCase() === low)) return;
      names.push(name);
    }
    (Array.isArray(profileNames) ? profileNames : []).forEach(add);
    if (names.length) return { names: names, source: 'profile' };
    add(ariaName);
    if (names.length) return { names: names, source: 'aria-label' };
    return { names: [], source: 'none' };
  }

  function namesDiagLine(diag) {
    const d = diag || {};
    const names = Array.isArray(d.names) ? d.names.map((n) => String(n || '').trim()).filter(Boolean) : [];
    const source = d.source === 'profile' || d.source === 'aria-label' ? d.source : 'none';
    return 'Names: ' + (names.join(', ') || '—') + ', source: ' + source;
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
    return localizeHeading(lang, fallback == null ? '' : String(fallback), ctx);
  }

  // What Glance writes (a calendar event, a Google Task, a To Do) is titled
  // exactly as the card shows it. A hold keeps the sentence it closes.
  function mailContentLang(ctx) {
    const blob = String((ctx && (ctx.bodyText || ctx.text || ctx.body)) || '');
    if (/[\u0590-\u05FF]/.test(blob)) return 'he';
    if (ctx && ctx.intent && ctx.intent.lang === 'he') return 'he';
    return 'en';
  }

  function artifactTitle(lang, ctx, title) {
    const raw = title == null ? '' : String(title);
    if (!raw) return raw;
    const hold = ctx && (ctx.glanceChain === 'calendar-hold' || (ctx.process && ctx.process.id === 'hold'));
    if (hold) return raw;
    const contentLang = mailContentLang(ctx);
    const headingLang = contentLang === 'he' || uiLangFrom({ setting: lang }) === 'he' ? 'he' : lang;
    const p = ctx && ctx.process;
    if (p && (p.id === 'file-it' || p.id === 'suggest-save' || /file it/i.test(String(p.name || '')))) return localizeHeading(contentLang === 'he' ? 'he' : headingLang, SAVE_TITLE, ctx);
    return localizeHeading(headingLang, raw, ctx);
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
    attachmentsNotReadLine: attachmentsNotReadLine,
    outlookTodoFailedAfterDraftLine: outlookTodoFailedAfterDraftLine,
    noteToSelfLine: noteToSelfLine,
    attachmentsLoadingLine: attachmentsLoadingLine,
    missingScopeLine: missingScopeLine,
    whyNotShownRows: whyNotShownRows,
    hebrewDay: hebrewDay,
    localeDay: localeDay,
    namesDiagFrom: namesDiagFrom,
    namesDiagLine: namesDiagLine,
    cardDateLine: cardDateLine,
    holdWhenLine: holdWhenLine,
    holdCardText: holdCardText,
    holdClockFrom: holdClockFrom,
    cardTitle: cardTitle,
    artifactTitle: artifactTitle,
    localCallTopic: localCallTopic,
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
