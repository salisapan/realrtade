// One decision for "someone asked you something", the same on every mail surface. Portable: no chrome.*, no DOM, no network.
//
// Gmail's in-thread chip (src/content-gmail.js scanReadingPane) runs this chain: the message's own text (quoted history
// removed, at least 20 characters) -> FlowIntent.classify(text, { senderEmail, senderName, subject, calibration,
// calibrationByType, attachmentCount }) -> FlowIntent.shouldShowChip -> the file gate (a request about an unclear file is
// silent; a receipt or another multi-step document belongs to core/resolution.js) -> FlowActions.planFor. This file is that
// chain as a pure function, so Outlook (the Graph planner core/outlook-sync.js and the Outlook-on-the-web card
// src/content-outlook.js) cannot drift from Gmail: same judgment, same process, same draft wording. Only the connector differs:
// forSurface() renames the draft step (gmailDraft -> outlookDraft) and draftPayload() builds the exact payload Gmail's
// buildActionPayload hands to FlowDraftReply.draftBodyText.
//
// What Outlook cannot do yet, and therefore stays silent on (never a weaker substitute): a request that needs a file from
// Drive (Gmail searches Drive first; the Outlook draft writer attaches nothing), and a fact ask that Gmail answers from one
// Sheet cell (FlowFactReply.blocksInbox: no lookup happened, so no generic reply stands in for the fact), and a close with no
// reply draft and no task in it (a calendar event: Gmail writes that with the Google writer). A task-only close is a
// Microsoft To Do task. A process that still has a draft stays a draft.
const FlowIncomingJudge = (() => {
  const MIN_TEXT = 20;

  // Invisible formatting is not part of the sentence. One pass, before the
  // decision, on every mail path that calls this (the Gmail page, the Outlook
  // page, the mailbox check, and judge itself). The same characters give the
  // same decision as the text without them.
  function prepareForJudge(text) {
    return String(text == null ? '' : text)
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u202F]/g, ' ')
      // A run of spaces or tabs is one space: the patterns below assume single spaces, and a metamorphic check (2026-11-11) found that doubling the spaces
      // of a mail flipped about 10% of the engine's decisions (53 of 600 acts went silent). Newlines are kept.
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  // A line that is only a phone signature is not part of the ask.
  // "Sent from my iPhone" and "נשלח מה-iPhone שלי" drop.
  // A request on that same line stays: the line is the ask.
  function withoutPhoneSignature(text) {
    return String(text || '').split('\n').filter((line) => {
      if (/^\s*sent from my (?:iphone|ipad|android)\s*\.?\s*$/i.test(line)) return false;
      if (/^\s*נשלח מה[-\u05BE\s]*(?:iphone|אייפון|אנדרואיד)(?:\s+שלי)?\s*\.?\s*$/i.test(line)) return false;
      return true;
    }).join('\n').trim();
  }

  // A short body still carries the subject when the subject itself is the slot:
  // a meeting noun, or a slash date that is a day in one locale only.
  function subjectCarriesSlot(subject) {
    const s = String(subject || '');
    if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(s)) return true;
    const m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (!m) return false;
    const a = +m[1];
    const b = +m[2];
    return (a > 12 && a <= 31 && b >= 1 && b <= 12) || (b > 12 && b <= 31 && a >= 1 && a <= 12);
  }

  // A note to yourself with the sentence in the subject line and little or
  // nothing in the body. The subject is the note. Someone else's subject is not.
  function selfSent(input) {
    const i = input || {};
    const from = String((i.sender && i.sender.email) || i.senderEmail || '').trim().toLowerCase();
    const own = (i.ownAddresses || []).map((a) => String(a || '').trim().toLowerCase()).filter(Boolean);
    if (!from || own.indexOf(from) === -1) return false;
    const to = (i.to || i.toRecipients || []).map((a) => String(a || '').trim().toLowerCase()).filter(Boolean);
    const cc = (i.cc || i.ccRecipients || []).map((a) => String(a || '').trim().toLowerCase()).filter(Boolean);
    const rest = to.concat(cc);
    if (!rest.length) {
      if (i.headerToSelf === true) return true;
      return to.length > 0 && to.every((a) => own.indexOf(a) !== -1);
    }
    return rest.every((a) => own.indexOf(a) !== -1);
  }

  function buriedReaderRememberAsk(text) {
    const raw = String(text || '');
    if (/\bplease remember to\b/i.test(raw) && !/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\b/i.test(raw)) return true;
    if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+ל(?!הזכיר|זכיר|שאול|הודיע|עדכן|תזכר)|אל\s+תשכח(?:י|ו)?\s+ל)/.test(raw)) {
      if (/(?:תזכור|תזכיר|אל\s+תשכח)\s+(?:ל)?(?:הזכיר|להזכיר|לשאול|להודיע|לעדכן|לתזכר)\s+/i.test(raw)) return false;
      return true;
    }
    return false;
  }

  function relayTargetIsThirdParty(who) {
    const name = String(who || '').toLowerCase().replace(/[^\w\u0590-\u05FF'’\s-]/g, '').trim();
    if (!name) return false;
    if (/^(you|ya|u|me|us|your|yours|yourself|yourselves)$/.test(name)) return false;
    if (/^(לך|לכם|לי|לנו|אותך|אתכם|אותי)$/.test(name)) return false;
    return true;
  }

  // A sign-off line plus "please remember to remind/tell/ask …" is a relay to
  // someone else, not a buried task for the reader.
  function buriedRememberRelayQuiet(text) {
    const raw = String(text || '');
    const heNotReader = '(?!י(?:\\s|[,،.!?]|$)|כם(?:\\s|[,،.!?]|$)|נו(?:\\s|[,،.!?]|$)|ך(?:\\s|[,،.!?]|$)|אותך|אתכם|אותי)';
    if (/\b(?:please\s+)?remind\s+me\b/i.test(raw)) return false;
    if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+לי|להזכיר\s+לי|אל\s+תשכח(?:י|ו)?\s+לי)\b/.test(raw)) return false;
    const enForgetRelay = raw.match(/\b(?:please\s+)?(?:do not|don't|dont)\s+forget\s+to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
    if (enForgetRelay && relayTargetIsThirdParty(enForgetRelay[1])) return true;
    const enRememberRelay = raw.match(/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
    if (enRememberRelay && relayTargetIsThirdParty(enRememberRelay[1])) return true;
    const enVerb = raw.match(/\b(?:remind|tell|ask|notify|ping|nudge)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\s+(?:to|that)\b/i);
    if (enVerb && relayTargetIsThirdParty(enVerb[1])) return true;
    if (/אל\s+תשכח\s+להזכיר\s+ל/.test(raw) && !/אל\s+תשכח\s+להזכיר\s+ל(?:י|כם|נו|ך|אותך|אתכם|אותי)\b/.test(raw)) return true;
    if (/תזכור\s+ל(?:הזכיר|זכיר)\s+ל/.test(raw) && new RegExp('תזכור\\s+ל(?:הזכיר|זכיר)\\s+ל' + heNotReader).test(raw)) return true;
    if (/תזכור\s+לשאול\s+את\s+/.test(raw) && !/תזכור\s+לשאול\s+אתכם/.test(raw)) return true;
    if (/תזכור\s+להגיד\s+ל(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותי|אותנו)/.test(raw)) return true;
    if (new RegExp('להזכיר\\s+ל' + heNotReader).test(raw)) return true;
    if (new RegExp('(?:^|[^\\u0590-\\u05FF])(?:תזכיר|תזכירי|תזכירו)\\s+ל' + heNotReader).test(raw)) return true;
    if (/לשאול\s+את\s+[\u0590-\u05FF]{2,}/.test(raw) && !/לשאול\s+אתכם/.test(raw)) return true;
    if (/להגיד\s+ל(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותי|אותנו)[\u0590-\u05FF]{2,}/.test(raw)) return true;
    if (/לעדכן\s+אות(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|כם)/.test(raw)) return true;
    return false;
  }

  // A send-by deadline plus "tell us/me when it is ready" is reply-track, not
  // a Drive file chain. Outlook must offer the same card Gmail shows after classify.
  function notifyWhenDoneOnSendAsk(text) {
    const raw = String(text || '');
    if (/\b(?:do not|don't|dont)\s+forget\s+to\s+tell\s+(?:us|me)\s+when\b/i.test(raw)) return true;
    if (/אל\s+תשכח(?:י|ו)?\s+ל(?:הגיד|הודיע|עדכן)\s+ל(?:נו|י|כם|ך)(?:\s|$|[,،.!?])/.test(raw)) return true;
    return false;
  }

  // "Prepare the quarterly report and send it to me by Sunday" asks the reader to make something. That is a reply and
  // a tracked task, not a lookup of an existing file, so the Drive search is not the answer to it.
  function authoringAsk(text) {
    const raw = String(text || '');
    return /(?:^|[\s,.;:!?("'])(?:ל|ש|ו|ת)?(?:הכין|הכן|תכין|תכיני|תכינו)(?:\s|$)/.test(raw)
      || /\b(?:prepare|put together|compile)\s+(?:the|a|an|our|my|this)\b/i.test(raw);
  }

  // A mail the general classifier could not read as an ask still has a plain reason the person can be shown: a hedge ("we
  // might catch up at some point, no rush"), a service notice ("see who is looking at your profile") or a closing line that
  // asks nothing more ("signed and returned, nothing else needed").
  const CONTACTS_EN = /\b[Ww]hat(?:(?:'|’)s| is)\s+[A-Z][\w.-]{0,40}(?:\s+[A-Z][\w.-]{0,40})?(?:'|’)s\s+(?:e-?mail(?: address)?|phone(?: number)?|number)\b|\b(?:e-?mail(?: address)?)\s+(?:for|of)\s+[A-Z][\w.-]{0,40}\b/;
  const CONTACTS_HE = /מה\s+(?:ה)?(?:כתובת\s+)?(?:המייל|אימייל|דוא["']?ל|הטלפון|המספר)\s+של\s+[\u0590-\u05FF]/;
  function contactsAsk(raw) {
    const s = String(raw || '').slice(0, 600);
    return CONTACTS_HE.test(s) || CONTACTS_EN.test(s);
  }

  function namedQuietOf(rawText, i) {
    const raw = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const hasDeadline = /\b(?:by|before|until|tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[:\/]\d{2})\b|עד\s|מחר|היום|ביום|בשעה/i.test(raw);
    if (/\b(?:nothing (?:else|more) (?:is )?needed|no (?:further )?(?:action|reply|response) (?:is )?(?:needed|required|necessary)|all set|all done|that'?s (?:all|it))\b/i.test(raw)
      || /(?:אין צורך בעוד|לא\s+צריך\s+(?:עוד\s+)?כלום|הכול\s+(?:מוכן|סגור)|הכל\s+(?:מוכן|סגור))/.test(raw)) {
      if (/\b(?:signed|sent|paid|done|returned|completed|received)\b|חתמתי|שלחתי|שילמתי|סיימתי|קיבלתי/i.test(raw)) return 'resolution';
    }
    if (!hasDeadline) {
      if (/\b(?:might|maybe|perhaps|possibly)\b[^.!?]*\b(?:at some point|sometime|whenever|no rush|eventually|one day)\b/i.test(raw)
        || /\bno rush\b[^.!?]*\bwhenever\b|\bwhenever (?:you|it)[^.!?]*\bno rush\b/i.test(raw)
        || /(?:^|\s)(?:אולי|מתישהו)(?:\s|$)[^.!?]*\bלא דחוף\b/.test(raw)
        || /(?:^|\s)אולי(?:\s|$)/.test(raw) && /מתישהו|לא דחוף|אם יהיה זמן|כשיהיה זמן/.test(raw)) return 'hedge';
    }
    // A person's address asked for by name ("What's Dana's email?") is a contacts lookup. Contacts are not in v1, so the
    // mail ends in a visible reason, never a silent skip and never a guessed address.
    if (contactsAsk(raw)) return 'contacts-unavailable';
    if (/\b(?:see who(?:'|’)?s|who(?:'|’)?s (?:looking|viewed|viewing)|people (?:also )?viewed|you appeared in \d+|your profile (?:was|has been) viewed|new connection suggestions?)\b/i.test(raw)
      || /מי\s+(?:צפה|הסתכל)\s+ב/.test(raw)) return 'noise';
    return null;
  }

  function textForJudge(rawText, subject, selfNote) {
    const body = withoutPhoneSignature(prepareForJudge(rawText));
    const sub = String(prepareForJudge(subject || '')).replace(/\s+/g, ' ').trim();
    if (body.length >= MIN_TEXT || !sub) return body;
    if (body.indexOf(sub) !== -1) return body;
    if (selfNote && sub.length >= MIN_TEXT) return (sub + '\n' + body).trim();
    if (!subjectCarriesSlot(sub)) return body;
    return (sub + '\n' + body).trim();
  }

  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }

  function pick(deps, key, globalValue) { return (deps && deps[key]) || globalValue || null; }

  // input: { text, subject, sender:{name,email}, attachmentCount, calibration, calibrationByType, now, threadUrl,
  //          hasThreadAttachment, executionMemory, surface ('gmail' | 'outlook') }
  // deps:  { intent, actions, factReply, fileAttach, resolution, quietMetrics } (each falls back to its global)
  // -> { show:true, intent, process } | { show:false, reason, intent }
  // A request that names a thing for the person to DO is the task. Gmail's chip path calls this after its own classify, so both
  // mailboxes turn the same ask into the same Log It card.
  function doItOverride(i, intent, isRequest) {
    if (isRequest === undefined) isRequest = Boolean(intent && intent.type === 'request');
    if (!(isRequest && !intent.googleClose && !intent.selfTask && !intent.noReplyDraft && !intent.inviteFile
      && i.senderIsUser !== true && i.inbound !== false && !(i.attachmentCount > 0))) return null;
    const doIt = doItAsk(i, prepareForJudge(i.text));
    if (!doIt) return null;
    const card = doItCard(i, doIt);
    return { intent: Object.assign({}, intent, card.intent, { signals: intent.signals, facts: intent.facts }), process: card.process };
  }

  // The readers that run after the general classifier found nothing: a do-it ask with a named day, a timed proposal asked back,
  // an answer-needing ask with a date. Gmail's chip path calls this too, so both mailboxes share one second read.
  // The labs readers (booking notice, task ask, payment ask) stay behind their own switches, which default OFF.
  function secondRead(i, q0) {
    if (q0 && q0 !== 'noise') return null;
    if (q0 || i.senderIsUser === true || i.inbound === false || i.noteToSelf === true) return null;
    const body0 = prepareForJudge(i.text);
    return ((hit0) => (hit0 ? doItCard(i, hit0) : null))(doItAsk(i, body0))
      || ((hitD) => (hitD ? doItCard(i, hitD) : null))(decideAsk(i, body0))
      || ((hit1) => (hit1 ? holdCard(i, hit1) : null))(holdProposal(i, body0))
      || ((hit2) => (hit2 ? replyCard(i, hit2) : null))(answerAsk(i, body0))
      || ((hit3) => (hit3 ? inviteCard(i, hit3) : null))(inviteAccept(i, body0))
      || (i.directAskOn === true ? directAskCard(i, body0) : null);
  }

  // ---- direct ask (owner 2026-11-12, after the first run on his real mailbox): the two shapes the classifier does not read ----
  //   1. plain information questions a PERSON puts to the reader ("מה ההבדלים בין...?", "What is the price of...?"): the close is a reply.
  //      At least two such questions, or one in a mail that greets the reader by name. No date is needed and none is invented.
  //   2. a Hebrew bare imperative with a day ("מלא את הטופס, חתום והחזר עד מחר", "תשלם את החשבונית עד יום חמישי"): work is a task,
  //      a payment or a send-back is a reply.
  // Strict about who and where: a person (not an automated sender, not an auto-reply, bounce or calendar notice), a mail addressed To the
  // reader with at most three recipients, only the mail's own text above any quoted or forwarded header. A sentence that hedges, cancels or
  // sells is skipped. Last of the second reads, so every earlier reader and every quiet wins. Off unless the host passes directAskOn.
  const DIRECT_AUTO_SUBJECT = /^(?:\s*(?:re|fw|fwd)\s*:\s*)*(?:automatic reply|auto(?:matic)?[- ]reply|out of (?:the )?office|undeliverable|delivery status|declined:|accepted:|tentative|מענה אוטומטי|תשובה אוטומטית|[\u200e\u200f]*לא ניתן למסירה)/i;
  const DIRECT_CUT = /\n(?:-{2,}\s*(?:Original|Forwarded|הודעה)|From:\s|מאת:\s|On .{4,80} wrote:|ב[-־]?.{4,60} כתב)/;
  const DIRECT_Q_EN = /^(?:what|why|how|when|where|which|who|is there|are there|do you have|does it|does the)\b/i;
  const DIRECT_Q_HE = /^(?:ו)?(?:מה|למה|מדוע|איך|כיצד|האם|מתי|איפה|היכן|כמה|מי|איזה|איזו|אילו|יש|אנחנו יכולים|נוכל)(?![\u0590-\u05FF])/;
  const DIRECT_Q_NO = /\b(?:was this you|did you (?:know|request|just)|ready to|want to|looking for|need help|have you (?:tried|heard)|why not|what'?s new|how are you|how's it going|what do you think if)\b|מה שלומ|מה נשמע|מה קורה|ידעת ש|רוצים ל|מוכנים ל/i;
  const DIRECT_IMP_WORK_HE = /^(?:מלא|מלאי|חתום|חתמי|הכן|הכיני|תכין|תכיני|בדוק|בדקי|תבדוק|תבדקי|עדכן|עדכני|קבע|קבעי|הזמן|הזמיני|תזמין|תזמיני)(?![\u0590-\u05FF])/;
  const DIRECT_IMP_BACK_HE = /^(?:שלם|שלמי|תשלם|תשלמי|החזר|החזירי|תחזיר|תחזירי)(?![\u0590-\u05FF])/;
  function directAsk(i, body) {
    const X = typeof FlowExtract !== 'undefined' ? FlowExtract : null;
    const sender = String((i.sender && i.sender.email) || '').toLowerCase();
    const own = (i.ownAddresses || []).map((a) => String(a).toLowerCase());
    const to = (i.to || []).map((a) => String(a).toLowerCase());
    if (!sender || !own.length || own.indexOf(sender) >= 0) return null;
    if (!to.some((a) => own.indexOf(a) >= 0) || to.length > 3) return null;
    if (DIRECT_AUTO_SUBJECT.test(String(i.subject || ''))) return null;
    if (X && typeof X.senderIsAutomated === 'function' && X.senderIsAutomated(sender, String(body || ''))) return null;
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const raw = String(body || '');
    const cut = raw.search(DIRECT_CUT);
    const ownText = cut >= 0 ? raw.slice(0, cut) : raw;
    const sents = sentencesOf(ownText).map((x) => x.replace(/^(?:\d{1,2}[.)]|[-*•])\s*/, '').trim()).filter((x) => x.length >= 8 && x.length <= 220);
    const names = (i.ownNames || []).filter(Boolean).map((n) => String(n).toLowerCase());
    const head = ownText.slice(0, 60).toLowerCase();
    const greetsReader = names.some((n) => head.indexOf(n) >= 0);
    const skip = (x, he) => (he ? ANSWER_NO_HE.test(x) : ANSWER_NO_EN.test(x)) || DIRECT_Q_NO.test(x);
    // 2. a Hebrew bare imperative with its day
    for (const x0 of sents) {
      const x = x0.replace(/^(?:שלום|היי|הי)[^,]{0,20},\s*/, '');
      if (!/[\u0590-\u05FF]/.test(x) || skip(x, true) || /(?:^|\s)(?:אל|לא)\s/.test(x)) continue;
      const work = DIRECT_IMP_WORK_HE.test(x), back = DIRECT_IMP_BACK_HE.test(x);
      if (!work && !back) continue;
      const d = dayOf(x, now0).date;
      if (!d || d < ymdOf(now0)) continue;
      return { kind: work ? 'task' : 'reply', what: x.slice(0, 200), title: x.replace(/[.!?\s]+$/, '').slice(0, 80), dateIso: d, lang: 'he' };
    }
    // 1. plain information questions
    const qs = sents.filter((x) => /\?\s*$/.test(x)).map((x) => x.replace(/\s+\?\s*$/, '?')).filter((x) => {
      const he = /[\u0590-\u05FF]/.test(x);
      // A question that names a clock is a meeting proposal: the hold readers and the calendar path own it, not a reply.
      return (he ? DIRECT_Q_HE.test(x) : DIRECT_Q_EN.test(x)) && !skip(x, he) && !dayOf(x, now0).time;
    });
    if (qs.length >= 2 || (qs.length === 1 && greetsReader)) return { kind: 'reply', what: qs[0].slice(0, 200), dateIso: null, lang: /[\u0590-\u05FF]/.test(qs[0]) ? 'he' : 'en', questions: qs.length, questionList: qs.slice(0, 8).map((q) => q.slice(0, 200)) };
    return null;
  }
  function directAskCard(i, body) {
    const hit = directAsk(i, body);
    if (!hit) return null;
    if (hit.kind === 'task') { const c = doItCard(i, hit); c.intent.directAsk = true; return c; }
    const c = replyCard(i, hit);
    c.intent.directAsk = true; c.intent.questions = hit.questions || null;
    // What the draft step needs to be written well: the mail's language, and every question for the answer frame (core/draft-reply.js).
    for (const st of c.process.steps) if (st.kind === 'gmailDraft' || st.kind === 'outlookDraft') { st.params.lang = hit.lang; if (hit.questionList) st.params.questions = hit.questionList; }
    // No day in the words: the reply draft alone (owner C-4). A task with no date is not invented.
    if (!hit.dateIso) c.process.steps = c.process.steps.filter((st) => st.kind !== 'googleTask');
    return c;
  }

  function judge(input, deps) {
    const i = input || {};
    const d = deps || {};
    const intentApi = pick(d, 'intent', typeof FlowIntent !== 'undefined' ? FlowIntent : null);
    const actionsApi = pick(d, 'actions', typeof FlowActions !== 'undefined' ? FlowActions : null);
    const factReply = pick(d, 'factReply', typeof FlowFactReply !== 'undefined' ? FlowFactReply : null);
    const fileAttach = pick(d, 'fileAttach', sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach'));
    const resolution = pick(d, 'resolution', sibling(typeof FlowResolution !== 'undefined' ? FlowResolution : null, './resolution.js', 'FlowResolution'));
    const quiet = pick(d, 'quietMetrics', typeof FlowQuietMetrics !== 'undefined' ? FlowQuietMetrics : null);
    if (!intentApi || typeof intentApi.classify !== 'function') return { show: false, reason: 'no-intent-api', intent: null };
    if (!actionsApi || typeof actionsApi.planFor !== 'function') return { show: false, reason: 'no-actions-api', intent: null };

    // A service's notice with a deadline and an action that prevents the loss ("your project will be paused on Oct 28 unless
    // you update billing"). Known services only; a task with the date, never a payment. Runs before the person-to-person quiets
    // because the sender is a no-reply address by nature. Off unless the host passes systemNoticeOn (glanceSwitches.SYSTEM_NOTICE).
    const noticeApi = pick(d, 'systemNotice', sibling(typeof FlowSystemNotice !== 'undefined' ? FlowSystemNotice : null, './system-notice.js', 'FlowSystemNotice'));
    if (i.systemNoticeOn === true && noticeApi && typeof noticeApi.detect === 'function' && i.senderIsUser !== true) {
      const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
      const notice = noticeApi.detect({ text: prepareForJudge(i.text), subject: prepareForJudge(i.subject || ''), sender: i.sender || {}, now: now0, knownSenders: i.knownSenders || null });
      if (notice) return { show: true, intent: noticeIntent(intentApi, notice), process: forSurface(noticeProcess(notice, i.threadUrl), i.surface || 'gmail') };
    }

    // A booking the person is told about ("Your appointment is confirmed for Sunday at 10:00") becomes a hold on their own
    // calendar, an invitation to an event the same, and a pickup with a last day ("Your order is ready for pickup until Friday") a task due that day. The same
    // readers the chat card uses (core/chat-appointment-notice.js, core/chat-pickup-notice.js). Off unless the host passes
    // bookingNoticeOn (glanceSwitches.BOOKING_NOTICE). Nobody is invited and nothing is sent.
    if (i.bookingNoticeOn === true && i.senderIsUser !== true && i.inbound !== false) {
      const booking = bookingNotice(i, prepareForJudge(i.text));
      if (booking) return { show: true, intent: booking.intent, process: forSurface(booking.process, i.surface || 'gmail') };
    }

    // A reminder or a deadline asked without a question ("Don't forget to bring the signed form on Monday", "I need the signed
    // contract by Wednesday") and a request to call back on a day become a task due that day (core/chat-reminder.js,
    // chat-deadline-ask.js, chat-callback-ask.js). Only for a mail addressed to the person (their address on To, not Cc-only).
    // Off unless the host passes taskAskOn (glanceSwitches.TASK_ASK).
    if (i.taskAskOn === true && i.senderIsUser !== true && i.inbound !== false) {
      const ask = taskAsk(i, prepareForJudge(i.text));
      if (ask) return { show: true, intent: ask.intent, process: forSurface(ask.process, i.surface || 'gmail') };
    }

    // A payment asked of the person with an amount and a day ("Please transfer 500 NIS by Sunday") becomes a task "Pay 500 NIS"
    // due that day (core/chat-payment-ask.js). Glance never pays. Off unless the host passes paymentAskOn (glanceSwitches.PAYMENT_ASK).
    if (i.paymentAskOn === true && i.senderIsUser !== true && i.inbound !== false) {
      const pay = paymentAsk(i, prepareForJudge(i.text));
      if (pay) return { show: true, intent: pay.intent, process: forSurface(pay.process, i.surface || 'gmail') };
    }

    const bodyOnly = withoutPhoneSignature(prepareForJudge(i.text));
    const text = textForJudge(i.text, i.subject, selfSent(i));
    const factProbe = (bodyOnly.length >= 12 && factReply && typeof factReply.detect === 'function') ? factReply.detect(bodyOnly) : null;
    const shortAsk = typeof FlowJudgment !== 'undefined' && typeof FlowJudgment.shortAskText === 'function' && FlowJudgment.shortAskText(bodyOnly);
    if (text.length < MIN_TEXT && !factProbe && !shortAsk) return { show: false, reason: 'too-short', intent: null };

    const sender = i.sender || {};
    // A Date from another realm (a test sandbox, an iframe) fails instanceof and used to fall back to the real clock.
    const now = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    let intent = intentApi.classify(text, {
      senderEmail: sender.email || null,
      senderName: sender.name || null,
      subject: i.subject || '',
      calibration: i.calibration || null,
      calibrationByType: i.calibrationByType || null,
      attachmentCount: i.attachmentCount || 0,
      now,
      to: i.to || i.toRecipients || null,
      cc: i.cc || i.ccRecipients || null,
      ownAddresses: i.ownAddresses || i.own || null,
      userName: i.userName || null,
      ownNames: i.ownNames || null,
      autoReply: i.autoReply === true,
      noteToSelf: i.noteToSelf === true,
      senderIsUser: i.senderIsUser === true,
      inbound: i.inbound,
      direction: i.direction || null,
      inSent: i.inSent === true,
      onBehalfOf: i.onBehalfOf || null,
      graphSender: i.graphSender || null,
      forwarded: i.forwarded === true,
      namesPending: i.namesPending === true,
      namesWaitDone: i.namesWaitDone === true,
      confirmedAmountSilent: i.confirmedAmountSilent === true,
      readerEmail: i.readerEmail || null
    });
    // The profile names are not cached yet. No card, and not a quiet.
    // The host judges this mail again when the names land.
    if (intent && intent.namesPending) return { show: false, reason: 'names-pending', intent };
    if (buriedRememberRelayQuiet(text)) {
      return { show: false, reason: 'quiet:relay', intent: intent || null };
    }
    if (!intent || !intent.type) {
      // The general classifier found nothing, or only a notice sender. The structural readers the chat card uses run
      // second, each strict about its own shape: a booking told to the person, a pickup with a last day, a reminder or a
      // deadline asked without a question, a call-back day, a payment asked with its amount and day. Only a mail addressed
      // to the person; nothing is read when the mail carries a calibrated or named quiet other than notice noise.
      const q0 = intent && intent.quiet ? intent.quiet : null;
      const second = secondRead(i, q0);
      if (second) return { show: true, intent: second.intent, process: forSurface(second.process, i.surface || 'gmail') };
      if (!q0) {
        const named = namedQuietOf(prepareForJudge(i.text), i);
        if (named) return { show: false, reason: 'quiet:' + named, intent: intent || null };
      }
      return { show: false, reason: q0 ? 'quiet:' + q0 : 'intent-null', intent: intent || null };
    }
    // A self-sent webinar or launch blast stays quiet. The task rule does
    // not cover marketing.
    const marketBlob = ((i.subject ? String(i.subject) + '\n' : '') + text);
    if (intent.selfTask && typeof intentApi.marketingWebinar === 'function' && intentApi.marketingWebinar(marketBlob)) {
      return { show: false, reason: 'quiet:marketing', intent };
    }
    if (!intentApi.shouldShowChip(intent)) {
      const named = quiet && typeof quiet.reasonFor === 'function' ? quiet.reasonFor(intent) : null;
      return { show: false, reason: named ? 'quiet:' + named : 'chip-low-confidence', intent };
    }
    // Gmail answers a fact ask from one Sheet cell in the open thread (FlowFactReply.apply); a surface without that lookup
    // stays quiet instead of offering a generic reply in its place.
    if ((i.surface || 'gmail') !== 'gmail' && factReply && typeof factReply.blocksInbox === 'function' && factReply.blocksInbox(intent, text)) {
      return { show: false, reason: 'fact-reply-block', intent };
    }
    const isRequest = intentApi.TYPES ? intent.type === intentApi.TYPES.REQUEST : intent.type === 'request';
    const vetoText = ((i.subject ? String(i.subject) + '\n' : '') + text);
    // Phishing and a bank-change payment stay quiet before any plan.
    // The Outlook task path and the Gmail path both stop here.
    if (typeof intentApi.phishingOrNegative === 'function' && intentApi.phishingOrNegative(vetoText)) {
      return { show: false, reason: 'quiet:family', intent };
    }
    // A request that names a thing for the person to DO (fill in a form, upload a file, renew a subscription) is the task,
    // not a reply. An ask for an answer, a signed copy back or a file sent stays the reply.
    const doItHit = doItOverride(i, intent, isRequest);
    if (doItHit) return { show: true, intent: doItHit.intent, process: forSurface(doItHit.process, i.surface || 'gmail') };
    // "No need to send" stands the ask down before the untimed-reply rule
    // can turn "Following up on our call" into a draft.
    if (/\b(?:do not|don't|no need to)\s+(?:send|attach|forward|share|resend|provide)\b/i.test(text)) {
      return { show: false, reason: 'quiet:hedge', intent };
    }
    const gate = fileAttach && typeof fileAttach.gate === 'function' ? fileAttach.gate(text) : { kind: 'ignore' };
    // "Following up on our call" is not the event. The ask under it, with
    // no parsed clock, is the reply. A file ask that does not use that
    // frame stays on the file chain.
    const noParsedClock = !(intent.entities && Number.isInteger(intent.entities.hour) && Number.isInteger(intent.entities.minute));
    const followUpCall = /\bfollowing up on (?:our|the|that) call\b/i.test(text);
    const replyInsteadOfFile = isRequest && noParsedClock && intent.personalClose === 'follow-up-ask' && !intent.inviteFile && followUpCall;
    // A self-sent attach is a task. Other file asks stay on the file chain.
    const selfAttachTask = Boolean(intent && intent.selfAttachTask);
    const selfSentTask = Boolean(intent && intent.selfTask);
    if (!selfAttachTask && !selfSentTask && !replyInsteadOfFile && isRequest && gate.kind === 'block') return { show: false, reason: gate.reason === 'third-party' ? 'third-party' : 'file', intent };
    // A deadline whose day was dropped (31/2, or a weekday that is not that
    // calendar day) is still the reply. The file chain is not that close.
    const droppedDeadline = Boolean(intent.facts && intent.facts.date && intent.facts.date.dropped);
    if (!selfAttachTask && !selfSentTask && !replyInsteadOfFile && isRequest && gate.kind === 'clear' && !droppedDeadline && !(intent && intent.inviteFile) && !buriedReaderRememberAsk(text)) {
      if (resolution && typeof resolution.attestsPayment === 'function' && resolution.attestsPayment(gate.ask.id)) return { show: false, reason: 'file', intent };
      // Gmail searches Drive in the open thread before it offers this. Outlook's page and mailbox check do the same search and attach only when Graph returns an attachment id. Until that search runs, the silence is file-chain-not-run (the chain has not been called). A failed search is drive-not-granted or drive-search-failed, written by the host that called Drive, not here.
      // Putting a file on an invite that already exists is the file track
      // (task + short attached draft), on Outlook as well as Gmail.
      if (i.surface && i.surface !== 'gmail' && !(intent && intent.inviteFile) && !notifyWhenDoneOnSendAsk(text) && !authoringAsk(text)) {
        return { show: false, reason: 'file-chain-not-run', intent };
      }
      // A contract, a quote, a proposal, or a signed copy is not a reply.
      // The page still searches Drive. The judge stays quiet until that search runs.
      if ((i.surface || 'gmail') === 'gmail' && resolution && typeof resolution.owns === 'function' && resolution.owns(gate.ask.id)) return { show: false, reason: 'file', intent };
    }
    // Same classifier as planFor. A meeting that was cancelled, postponed,
    // already held, or an out-of-office note does not show. A marketing
    // webinar with no personal ask does not show. A second event that is
    // still on, together with an ask, does show. These gates run before
    // any plan, so a plan cannot create an offer they withhold.
    // An event with a day and no clock that the meeting gate would veto. When the sender is asking the reader for a time
    // ("are you available for a call Tuesday afternoon?") it is a request, and the card is a reply that offers times.
    // Every other event keeps the path it had (a named hold, or the Schedule meeting task).
    if (intent.type === 'event' && typeof intentApi.meetingPlanVeto === 'function' && intentApi.meetingPlanVeto(vetoText)) {
      if (intent.signals && intent.signals.slotAsk && !(intent.facts && intent.facts.time)) {
        intent = Object.assign({}, intent, { type: 'request', label: 'Reply requested', entities: Object.assign({}, intent.entities || {}, { requestWhat: null, what: null }) });
      } else {
        return { show: false, reason: 'meeting-veto', intent };
      }
    }
    const planCtx = {
      threadUrl: i.threadUrl || null,
      hasThreadAttachment: Boolean(i.hasThreadAttachment),
      executionMemory: i.executionMemory || null,
      text: vetoText
    };
    // The show decision uses the unrewritten plan. A later Meeting or task
    // rewrite must not open a surface this plan leaves quiet.
    const baseProcess = actionsApi.planFor(intent, Object.assign({ baseOnly: true }, planCtx));
    if (!baseProcess || !baseProcess.steps || !baseProcess.steps.length) return { show: false, reason: 'no-process', intent };
    // Outlook's Do It writes a reply draft when the process has one. A task-only
    // close writes Microsoft To Do. A calendar event with no draft and no task
    // stays quiet rather than offering a reply in its place.
    // An explicit hold is the card. Missing Calendars.ReadWrite does not silence it.
    // A sender's promise, a postpone, or a file dropped on a calendar is not this exemption.
    const calendarHold = intent && intent.personalClose === 'calendar-hold' && intent.explicitHold === true;
    const outlookInboundMeeting = outlookInboundMeetingClose(baseProcess, vetoText, actionsApi, intent);
    if ((i.surface || 'gmail') !== 'gmail' && !draftStepOf(baseProcess) && !taskOnlyProcess(baseProcess) && !calendarHold && !outlookInboundMeeting) {
      return { show: false, reason: 'no-draft-close', intent };
    }
    // OneDrive was named. Gmail must not save that file to Drive. Outlook still writes OneDrive.
    const asked = intent.googleClose;
    if (!selfSentTask && (i.surface || 'gmail') !== 'outlook' && asked && asked.target === 'onedrive') {
      return { show: false, reason: 'onedrive-target-on-gmail', intent };
    }
    // The judge has already said offer. planFor may change the kind:
    // a Meeting only with a noun, an explicit date, and a clock; a
    // commitment or a task keeps that kind.
    const process = actionsApi.planFor(intent, planCtx);
    if (!process || !process.steps || !process.steps.length) return { show: false, reason: 'no-process', intent };
    return { show: true, intent, process: forSurface(process, i.surface || 'gmail') };
  }

  // A real mail is longer than the one-line messages the readers were written for (greeting, a sentence, directions,
  // a signature). Each reader is asked about one sentence, and about two neighbouring sentences, never the whole body, so a
  // line that states a booking is found and the rest of the mail cannot add or take away from it.
  function windowsOf(body) {
    const text = String(body || '').replace(/\r/g, '');
    const parts = text.split(/\n+|(?<=[.!?؟:;])\s+/).map((x) => x.trim()).filter((x) => x.length >= 8);
    const out = [];
    if (text.replace(/\s+/g, ' ').trim().length <= 200) out.push(text.replace(/\s+/g, ' ').trim());
    for (let k = 0; k < parts.length && out.length < 60; k++) {
      out.push(parts[k]);
      const bare = parts[k].replace(/^(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening)|שלום|היי|הי|בוקר\s+טוב|ערב\s+טוב)(?:\s+[^\s,]+)?\s*,\s*/i, '');
      if (bare.length >= 8 && bare.length < parts[k].length) out.push(bare);
      const lead = parts[k].split(/,\s+|\s+(?:so|because|since|as|and then)\s+/)[0];
      if (lead && lead.length >= 8 && lead.length < parts[k].length) out.push(lead);
      if (k + 1 < parts.length) out.push(parts[k] + ' ' + parts[k + 1]);
    }
    return out;
  }

  function firstHit(api, body, now, kind, fn) {
    const method = fn || 'recognize';
    if (!api || typeof api[method] !== 'function') return null;
    const wins = windowsOf(body);
    for (let k = 0; k < wins.length; k++) {
      const r = api[method](wins[k], now);
      if (r && r.kind === kind) return r;
    }
    return null;
  }

  function addressedOnTo(i) {
    const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;,\s]+/)).map((x) => String(x || '').trim().toLowerCase()).filter((x) => x.indexOf('@') > 0);
    const own = list(i.ownAddresses);
    const to = list(i.to);
    if (!own.length || !to.length || !to.some((a) => own.indexOf(a) !== -1)) return false;
    const intentApi = typeof FlowIntent !== 'undefined' ? FlowIntent : null;
    if (intentApi && typeof intentApi.copiedOnly === 'function' && intentApi.copiedOnly(i.text, i)) return false;
    return true;
  }

  function taskCard(i, title, dateIso, he) {
    return {
      intent: { type: 'request', label: title, confidence: 0.9, taskAsk: true, personalClose: 'task-ask', signals: { score: 90, threshold: 50 }, entities: { what: title, deadline: dateIso }, facts: { date: { iso: dateIso } } },
      process: { id: 'log-it', name: 'Log It', closingLine: he ? 'מוסיף למשימות.' : 'Logging this so it stays tracked.', closedLine: he ? 'במשימות.' : 'Logged and tracked.', needsDateChoice: false, dateChoices: null, taskAsk: true,
        steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title: title, dateIso: dateIso, amount: null, what: title, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

  // A thing the person is asked to DO (fill in a form, upload a file, renew a subscription), not a question to answer. The
  // person does it, so the card is the task and no reply is drafted. One sentence, anchored at the verb; a request for an
  // answer, a look back, a hedge or a promise never matches. Returns { title, dateIso, lang } or null.
  const DOIT_EN = '(?:fill\\s+(?:in|out|up)|upload|renew|submit|complete|register\\s+for|sign\\s+up\\s+for|apply\\s+(?:for|to))';
  const DOIT_HE = '(?:תחדש(?:י|ו)?|לחדש|תעלה|תעלי|תעלו|להעלות|תמלא|תמלאי|תמלאו|למלא|תגיש|תגישי|תגישו|להגיש|תשלים|תשלימי|להשלים|תירשם|תירשמי|להירשם)';
  const DOIT_NO_EN = /\b(?:yesterday|last\s+(?:week|night|time)|forgot|already|never\s*mind|forget\s+it|i'?ll|i\s+will|maybe|might|if\s+you\s+want|cancel(?:l?ed)?|let\s+me\s+know|reply|get\s+back\s+to\s+me|tell\s+me|send\s+me|confirm|whether)\b/i;
  const DOIT_NO_HE = /(?:אתמול|שבוע שעבר|שכחתי|כבר\s|אולי|בוטל|לבטל|תגיד לי|תודיע לי|תחזור אלי|תשיב|תאשר|תשלח לי|האם)/;
  function doItTitle(obj) {
    return String(obj || '')
      .split(/\s+(?:by|before|until|no\s+later\s+than|so\s+(?:that\s+)?we|so\s+i|next\s+(?:week|month)|this\s+(?:week|month)|today|tomorrow|tonight|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|עד|לפני|ביום|בשבוע\s+הבא|בחודש\s+הבא|היום|מחר)(?![A-Za-z\u0590-\u05FF])/i)[0]
      .replace(/[\s,;:.!?]+$/, '').replace(/\s+בבקשה(?=\s|$)/, '').trim();
  }
  function doItAsk(i, body) {
    const text = String(body || '').trim();
    if (!text) return null;
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
    const lead = '^(?:(?:hi|hello|hey|dear|שלום|היי|הי)\\b[^,.!?\\n]{0,30}[,.!:]\\s*)?';
    const reEn = new RegExp(lead + '(?:please\\s+|kindly\\s+)?(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?|you\\s+(?:need|have)\\s+to\\s+|(?:please\\s+)?(?:don\'?t\\s+forget|remember)\\s+to\\s+)?(' + DOIT_EN + '\\b.+)$', 'i');
    // A bare "don't forget to <anything>" is the TASK_ASK reader (labs, off by default); only a named do-it verb is read here.
    const reWait = /\b(?:i(?:'|’)?m|we(?:'|’)?re|i\s+am|we\s+are)\s+waiting\s+for\s+(?:an?\s+|the\s+)?(.+?)\s+from\s+you\b/i;
    const reHe = new RegExp('^(?:[\\u0590-\\u05FF]{2,12},\\s*)?(?:נא\\s+|אנא\\s+|בבקשה\\s+)?(?:תוכל(?:י|ו)?\\s+)?(' + DOIT_HE + '(?![\\u0590-\\u05FF])(?:\\s+בבקשה)?\\s+\\S.*)$');
    const reWaitHe = /מחכה\s+ל([\u0590-\u05FF][^\n.!?]*?)\s+ממך(?![\u0590-\u05FF])/;
    for (let k = 0; k < sentences.length; k++) {
      const sent = sentences[k];
      const he = /[\u0590-\u05FF]/.test(sent);
      if (he ? DOIT_NO_HE.test(sent) : DOIT_NO_EN.test(sent)) continue;
      let title = '';
      let m = null;
      if (he) {
        if ((m = sent.match(reHe))) title = doItTitle(m[1]);
        else if ((m = sent.match(reWaitHe))) title = 'לשלוח ' + doItTitle(m[1]);
      } else if ((m = sent.match(reEn))) {
        title = doItTitle(m[1]);
      } else if ((m = sent.match(reWait))) {
        title = 'Send ' + doItTitle(m[1]);
      }
      if (!title || title.split(/\s+/).length < 2) continue;
      let dateIso = null;
      let pastDate = false;
      try {
        const D = typeof FlowDayWords !== 'undefined' ? FlowDayWords : null;
        const X = typeof FlowExtract !== 'undefined' ? FlowExtract : null;
        if (X && typeof X.parseDate === 'function') {
          const norm = D && typeof D.normalize === 'function' ? D.normalize(sent, now0) : sent;
          const d = X.parseDate(norm, now0);
          if (d && d.iso && !d.dropped) dateIso = d.iso;
          if (d && (d.dropped || (d.iso && d.iso < ymdOf(now0)))) pastDate = true;
        }
      } catch (e) { dateIso = null; }
      // A reminder without a day is not a task; a day already gone is not one either.
      if (pastDate) continue;
      if (/\b(?:eod|cob|end\s+of\s+(?:the\s+)?day)\b|סוף\s+היום/i.test(sent)) dateIso = null;
      // Only a task with a named day (or this/next week) is a Log It; "by EOD" or no day is the plain ask, left to the reply track.
      if (!dateIso && !/\b(?:this|next)\s+week\b|(?:^|[^\u0590-\u05FF])(?:השבוע|שבוע\s+הבא)(?![\u0590-\u05FF])|סוף\s+השבוע/i.test(sent)) continue;
      return { title: title.slice(0, 120), dateIso, lang: he ? 'he' : 'en' };
    }
    return null;
  }
  // An ask to approve, accept or decide that carries a deadline is a task (owner rule of 24/10): "the policy renews next week,
  // approve whether to continue", "please approve the quote by Thursday". The person decides; Glance logs it with the day the mail
  // names (a named day is resolved; this/next week stays the span, as in the do-it ask). No day, a hedge or a past day: not read.
  const DECIDE_EN = /\b(?:(?:please|kindly)\s+(?:approve|accept|decide)|(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:approve|accept|decide)|(?:need|want)\s+you\s+to\s+(?:approve|accept|decide)|need\s+your\s+(?:approval|decision)|(?:approve|accept|decide)\s+(?:by|before|until))\b/i;
  // Hebrew: only a request to the reader ("תאשר לי", "נא לאשר", "תוכל להחליט"); "אם דנה תאשר" is a condition, not an ask.
  const DECIDE_VERB_HE = '(?:תאשר(?:י|ו)?|לאשר|אשר(?:י|ו)?|תסכים|תסכימי|להסכים|תחליט|תחליטי|תחליטו|להחליט)';
  const DECIDE_HE = new RegExp('(?:^|[^\\u0590-\\u05FF])(?:' + DECIDE_VERB_HE + '\\s+לי|(?:נא|אנא|בבקשה|תוכל(?:י|ו)?|תוכלו)\\s+' + DECIDE_VERB_HE + ')(?![\\u0590-\\u05FF])');
  const DECIDE_NO_EN = /\b(?:yesterday|last\s+(?:week|night)|already|never\s*mind|cancel(?:l?ed)?|maybe|might|if\s+you\s+(?:want|like)|no\s+rush|whenever|i'?ll|i\s+will)\b/i;
  const DECIDE_NO_HE = /(?:אתמול|שבוע\s+שעבר|כבר\s|אולי|בוטל|לבטל|לא\s+דחוף|אין\s+לחץ)/;
  function decideAsk(i, body) {
    const text = String(body || '').trim();
    if (!text) return null;
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const sents = sentencesOf(text).filter((x) => !/^(?:-{3,}|>)/.test(x));
    const head = sents.findIndex((x) => /^(?:-{3,}\s*)?(?:forwarded message|from:)/i.test(x));
    const own = head > 0 ? sents.slice(0, head) : sents;
    for (let k = 0; k < own.length; k++) {
      const sent = own[k];
      const he = /[\u0590-\u05FF]/.test(sent);
      if (he ? DECIDE_NO_HE.test(sent) : DECIDE_NO_EN.test(sent)) continue;
      if (!(he ? DECIDE_HE.test(sent) : DECIDE_EN.test(sent))) continue;
      const when = dayOf(sent, now0);
      const span = /\b(?:this|next)\s+week\b|(?:^|[^\u0590-\u05FF])(?:השבוע|בשבוע\s+הבא|שבוע\s+הבא)(?![\u0590-\u05FF])|סוף\s+השבוע/i.test(sent);
      if (!when.date && !span) continue;
      if (when.date && when.date < ymdOf(now0)) continue;
      const subj = String(i.subject || '').replace(/^\s*(?:(?:re|fw|fwd|השב|תשובה|הועבר)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim();
      const title = (subj && subj.length >= 3 ? subj : sent).slice(0, 120);
      return { title, dateIso: when.date || null, lang: he ? 'he' : 'en' };
    }
    return null;
  }
  // The card for a do-it ask: the task, due that day when the mail names one.
  function doItCard(i, hit) {
    const he = hit.lang === 'he';
    const card = taskCard(i, hit.title, hit.dateIso, he);
    card.intent.taskAsk = false;
    card.intent.doItAsk = true;
    card.intent.personalClose = 'do-it-ask';
    card.process.taskAsk = false;
    return card;
  }

  // ---- second read: an answer the person owes, a call or meeting proposed with its day and clock ----
  function dayOf(sentence, now0) {
    try {
      const D = typeof FlowDayWords !== 'undefined' ? FlowDayWords : null;
      const X = typeof FlowExtract !== 'undefined' ? FlowExtract : null;
      if (!X || typeof X.parseDate !== 'function') return { date: null, time: null };
      const norm = D && typeof D.normalize === 'function' ? D.normalize(sentence, now0) : sentence;
      let d = X.parseDate(norm, now0);
      if (!(d && d.iso) && /(?:\b(?:today|tonight)\b|(?:^|[^\u0590-\u05FF])היום(?![\u0590-\u05FF]))/i.test(sentence)) d = { iso: ymdOf(now0) };
      const t = typeof X.parseTime === 'function' ? X.parseTime(norm) : null;
      return { date: d && d.iso && !d.dropped ? d.iso : null, time: t && Number.isInteger(t.hour) ? t : null };
    } catch (e) { return { date: null, time: null }; }
  }
  function sentencesOf(body) { return String(body || '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean); }
  function whenLabel(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] + ' ' + Number(m[3]);
  }
  const ANSWER_NO_EN = /\b(?:yesterday|last\s+(?:week|night)|already|never\s*mind|cancel(?:l?ed)?|maybe|might|if\s+you\s+(?:want|like)|no\s+rush|whenever)\b/i;
  const ANSWER_NO_HE = /(?:אתמול|כבר\s|אולי|בוטל|לבטל|לא\s+דחוף|אין\s+לחץ)/;
  // A question for a fact or a "can you confirm / tell me" with the day it is needed by. The person answers it; the reply is
  // drafted and tracked. A decision on an offer (approve, accept, agree) is never read here.
  function answerAsk(i, body) {
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const sents = sentencesOf(body).filter((x) => !/^(?:-{3,}|>)/.test(x));
    if (!sents.length) return null;
    const head = sents.findIndex((x) => /^(?:-{3,}\s*)?(?:forwarded message|from:)/i.test(x));
    const own = head > 0 ? sents.slice(0, head) : sents;
    for (let k = 0; k < own.length; k++) {
      const sent = own[k];
      const he = /[\u0590-\u05FF]/.test(sent);
      if (he ? ANSWER_NO_HE.test(sent) : ANSWER_NO_EN.test(sent)) continue;
      let hit = false;
      let dateIso = null;
      if (!he) {
        const confirmAsk = /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:confirm|let\s+me\s+know|tell\s+me|advise)\b/i.test(sent) && !/\b(?:approve|accept|agree)\b/i.test(sent);
        const factQ = /^(?:what|where|when|which|who|how\s+(?:much|many))(?:'s|’s|\s+is|\s+are|\s+was)\b[^?]*\?$/i.test(sent);
        const signBack = /\b(?:please\s+)?sign(?:\s+(?:it|them|this))?\s+and\s+(?:return|send)(?:\s+(?:it|them))?(?:\s+back)?\b/i.test(sent);
        if (signBack) { dateIso = dayOf(sent, now0).date; hit = Boolean(dateIso); }
        else if (confirmAsk) { hit = true; dateIso = dayOf(sent, now0).date; if (!dateIso) hit = false; }
        else if (factQ) {
          const need = own.find((x, j) => j !== k && /\b(?:need\s+(?:it|this|that)|by|before|until|asap)\b/i.test(x) && dayOf(x, now0).date);
          if (need) { hit = true; dateIso = dayOf(need, now0).date; }
        }
      } else {
        const askHe = /(?:תגיד|תגידי|תודיע|תודיעי|תעדכן|תעדכני)\s+(?:לי|אותי)|תעדכן\s+אותי|תחזור\s+אליי?\s+(?:עם|ו)/.test(sent) && !/(?:תאשר|אשר)\s+לי\s+אם\s+(?:להמשיך|לאשר|להסכים)/.test(sent);
        const signBackHe = /(?:תחתום|תחתמי|תחתמו)\s+ו(?:תחזיר|תחזירי|תשלח|תשלחי)/.test(sent);
        if (signBackHe) { dateIso = dayOf(sent, now0).date; hit = Boolean(dateIso); }
        else if (askHe) { dateIso = dayOf(sent, now0).date; hit = Boolean(dateIso); }
      }
      if (!hit) continue;
      if (dateIso < ymdOf(now0)) continue;
      return { what: sent.slice(0, 200), dateIso, lang: he ? 'he' : 'en' };
    }
    return null;
  }
  function ymdOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function replyCard(i, hit) {
    const when = whenLabel(hit.dateIso);
    const title = 'Reply requested' + (when ? ' by ' + when : '');
    const he = hit.lang === 'he';
    return {
      intent: { type: 'request', label: title, confidence: 0.9, answerAsk: true, personalClose: 'follow-up-ask', signals: { score: 90, threshold: 50, handoff: true }, entities: { what: hit.what, requestWhat: hit.what, when, dateIso: hit.dateIso }, facts: { date: { iso: hit.dateIso } } },
      process: { id: 'reply-track', name: 'Reply & Track', closingLine: 'Drafting your reply and tracking it as a task.', closedLine: 'Drafted and tracked.', needsDateChoice: false, dateChoices: null,
        steps: [
          { id: 'draft', kind: 'gmailDraft', label: 'Draft reply', hint: 'Prepare reply draft', params: { intentType: 'request', what: hit.what, when, amount: null, threadUrl: i.threadUrl || null, includeAttachment: false, requestedObjectTerm: null, driveFileId: null, driveFileName: null, driveMimeType: null, attachSource: null }, dependsOn: null },
          { id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title, dateIso: hit.dateIso, amount: null, what: hit.what, threadUrl: i.threadUrl || null }, dependsOn: null }
        ] }
    };
  }
  // "נדבר מחר ב-16:00? אני אתקשר", "Let's do the interview next Thursday at 14:30 on Zoom. Does that work?": a call or a meeting
  // proposed with its day and its clock, asked as a question. The hold goes on the calendar; nobody is invited.
  function holdProposal(i, body) {
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const text = String(body || '');
    if (!/[?؟]/.test(text)) return null;
    const sents = sentencesOf(text);
    for (let k = 0; k < sents.length; k++) {
      const sent = sents[k];
      const he = /[\u0590-\u05FF]/.test(sent);
      if (he ? /(?:אולי|בוטל|לבטל|לדחות|נדחה)/.test(sent) : /\b(?:cancel(?:l?ed)?|postpone|reschedul\w*|maybe|might|if\s+you)\b/i.test(sent)) continue;
      const cue = he
        ? /(?:^|\s)(?:נדבר|נפגש|ניפגש|נתקשר|נקבע|נשוחח)(?![\u0590-\u05FF])/.test(sent)
        : /\b(?:let'?s|shall\s+we|how\s+about)\s+(?:do|meet|talk|speak|call|have|catch|schedule|sync|chat)\b/i.test(sent);
      if (!cue) continue;
      const when = dayOf(sent, now0);
      if (!when.date || !when.time || when.date < ymdOf(now0)) continue;
      const rest = sents.slice(k).join(' ');
      if (!he && !/\b(?:does\s+(?:that|this|it)\s+work|work\s+for\s+you|ok\??|good\s+for\s+you)\b/i.test(rest) && !/\?/.test(sent)) continue;
      const subj = String(i.subject || '').replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '').trim();
      const title = he ? (/נפגש|ניפגש/.test(sent) ? 'פגישה' : 'שיחה') : (subj && subj.length <= 80 ? subj : 'Meeting');
      return { title, dateIso: when.date, hour: when.time.hour, minute: when.time.minute || 0, lang: he ? 'he' : 'en' };
    }
    return null;
  }
  // A mail that is itself a calendar invitation ("Invitation: Steering committee", "You're invited: ... Wednesday 15:00. Accept /
  // Tentative / Decline"). The card is "Accept the invitation": the event goes on the person's own calendar at the day and
  // clock the mail names, read back, with Undo. Glance never answers the organizer: no RSVP is sent and no mail goes out.
  // Outlook only (Gmail shows its own invitation mail through Google Calendar). Both the frame and the invitation controls
  // must be there, so a party invitation in a chat-like mail without them stays on the labs switch it had.
  function inviteAccept(i, body) {
    if ((i.surface || 'gmail') === 'gmail') return null;
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const subject = String(i.subject || '').replace(/\s+/g, ' ').trim();
    const raw = String(body || '');
    const subjectFrame = /^(?:updated\s+)?invitation\s*:\s*\S/i.test(subject) || /^(?:הזמנה)\s*:\s*\S/.test(subject);
    const controls = /\baccept\b[\s\S]{0,40}\bdecline\b/i.test(raw) || /(?:אשר|אישור)[\s\S]{0,40}(?:דחה|סרב|דחייה)/.test(raw);
    if (!subjectFrame && !controls) return null;
    const invApi = sibling(typeof FlowChatInvitationNotice !== 'undefined' ? FlowChatInvitationNotice : null, './chat-invitation-notice.js', 'FlowChatInvitationNotice');
    // The response buttons are not a hedge: "Tentative" is a button here, not "maybe".
    const cleaned = raw.replace(/\b(?:accept|tentative|decline)\b(?:\s*\/\s*)?/gi, ' ').replace(/\s+/g, ' ').trim();
    // "Wednesday 15:00" is the clock the invitation names; the reader wants "at".
    const spoken = cleaned
      .replace(/\b((?:mon|tues|wednes|thurs|fri|satur|sun)day)\s*,?\s+(\d{1,2}:\d{2})\b/gi, '$1 at $2')
      .replace(/((?:ביום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))\s*,?\s+(\d{1,2}:\d{2})/g, '$1 בשעה $2');
    const inv = firstHit(invApi, spoken, now0, 'invitation');
    if (!inv) return null;
    const he = inv.lang === 'he';
    let title = subject.replace(/^(?:updated\s+)?invitation\s*:\s*/i, '').replace(/^הזמנה\s*:\s*/, '').trim();
    if (!title) {
      const m = cleaned.match(/(?:invited|מוזמנים?)\s*:?\s*(?:to\s+)?([^,.\n]{3,80})/i);
      title = m ? m[1].trim() : (he ? 'הזמנה' : 'Invitation');
    }
    title = title.replace(/\s*@.*$/, '').slice(0, 120);
    return { inv, title, he };
  }

  function inviteCard(i, hit) {
    const inv = hit.inv;
    const he = hit.he;
    const title = hit.title;
    return {
      intent: { type: 'event', label: title, confidence: 0.9, inviteAccept: true, personalClose: 'invite-accept', signals: { score: 90, threshold: 50 }, entities: { dateIso: inv.dateIso, hour: inv.hour, minute: inv.minute }, facts: { date: { iso: inv.dateIso } } },
      process: { id: 'accept-invite', name: 'Accept the invitation', closingLine: he ? 'מוסיף ליומן. לא נשלחת תשובה למזמין.' : 'Putting it on your calendar. No reply is sent to the organizer.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null,
        steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title, dateIso: inv.dateIso, hour: inv.hour, minute: inv.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, noRsvp: true, durationMinutes: inv.durationMinutes || undefined, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

  function holdCard(i, hit) {
    const he = hit.lang === 'he';
    const title = hit.title;
    return {
      intent: { type: 'event', label: title, confidence: 0.9, holdProposal: true, personalClose: 'calendar-hold', signals: { score: 90, threshold: 50 }, entities: { dateIso: hit.dateIso, hour: hit.hour, minute: hit.minute }, facts: { date: { iso: hit.dateIso } } },
      process: { id: 'hold', name: 'Hold It', closingLine: he ? 'מוסיף ליומן.' : 'Putting this on your calendar.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null,
        steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title, dateIso: hit.dateIso, hour: hit.hour, minute: hit.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

  function taskAsk(i, body) {
    if (!addressedOnTo(i)) return null;
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const remApi = sibling(typeof FlowChatReminder !== 'undefined' ? FlowChatReminder : null, './chat-reminder.js', 'FlowChatReminder');
    const dlApi = sibling(typeof FlowChatDeadlineAsk !== 'undefined' ? FlowChatDeadlineAsk : null, './chat-deadline-ask.js', 'FlowChatDeadlineAsk');
    const cbApi = sibling(typeof FlowChatCallbackAsk !== 'undefined' ? FlowChatCallbackAsk : null, './chat-callback-ask.js', 'FlowChatCallbackAsk');
    const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
    let title = '';
    let dateIso = '';
    let lang = 'en';
    const rem = firstHit(remApi, body, now0, 'reminder');
    if (rem) { title = rem.what; dateIso = rem.dateIso; lang = rem.lang; }
    if (!title) { const dl = firstHit(dlApi, body, now0, 'ask'); if (dl) { title = dl.what; dateIso = dl.dateIso; lang = dl.lang; } }
    if (!title) { const cb = firstHit(cbApi, body, now0, 'ask'); if (cb) { title = (cb.lang === 'he' ? 'להתקשר' : 'Call back') + (who ? ' · ' + who : ''); dateIso = cb.dateIso; lang = cb.lang; } }
    if (!title) return null;
    title = title.slice(0, 120);
    const he = lang === 'he';
    return taskCard(i, title, dateIso, he);
  }

  function paymentAsk(i, body) {
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const api = sibling(typeof FlowChatPaymentAsk !== 'undefined' ? FlowChatPaymentAsk : null, './chat-payment-ask.js', 'FlowChatPaymentAsk');
    const pay = firstHit(api, body, now0, 'ask') || firstHit(api, body, now0, 'ask', 'recognizeBill');
    if (!pay) return null;
    const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
    const what = pay.ref ? (pay.lang === 'he' ? 'חשבונית ' : 'invoice ') + pay.ref : pay.amount + ' ' + pay.currency;
    const title = ((pay.lang === 'he' ? 'לשלם ' : 'Pay ') + what + (who ? ' · ' + who : '')).slice(0, 120);
    return {
      intent: { type: 'request', label: title, confidence: 0.9, paymentAsk: true, personalClose: 'payment-ask', signals: { score: 90, threshold: 50 }, entities: { what: title, deadline: pay.dateIso }, facts: { date: { iso: pay.dateIso } } },
      process: { id: 'log-it', name: 'Log It', closingLine: pay.lang === 'he' ? 'מוסיף למשימות.' : 'Logging this so it stays tracked.', closedLine: pay.lang === 'he' ? 'במשימות.' : 'Logged and tracked.', needsDateChoice: false, dateChoices: null, paymentAsk: true,
        steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title: title, dateIso: pay.dateIso, amount: null, what: title, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function bookingNotice(i, body) {
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const apptApi = sibling(typeof FlowChatAppointmentNotice !== 'undefined' ? FlowChatAppointmentNotice : null, './chat-appointment-notice.js', 'FlowChatAppointmentNotice');
    const pickApi = sibling(typeof FlowChatPickupNotice !== 'undefined' ? FlowChatPickupNotice : null, './chat-pickup-notice.js', 'FlowChatPickupNotice');
    const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
    const tail = who ? ' · ' + who : '';
    const appt = firstHit(apptApi, body, now0, 'appointment');
    if (appt) {
      const he = appt.lang === 'he';
      const title = ((he ? 'תור' : 'Appointment') + tail).slice(0, 120);
      return {
        intent: { type: 'event', label: title, confidence: 0.9, bookingNotice: 'appointment', personalClose: 'booking-notice', signals: { score: 90, threshold: 50 }, entities: { dateIso: appt.dateIso, hour: appt.hour, minute: appt.minute }, facts: { date: { iso: appt.dateIso } } },
        process: { id: 'hold', name: 'Hold It', closingLine: he ? 'מוסיף ליומן.' : 'Putting this on your calendar.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null, bookingNotice: true,
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: appt.dateIso, hour: appt.hour, minute: appt.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, durationMinutes: appt.durationMinutes || undefined, threadUrl: i.threadUrl || null }, dependsOn: null }] }
      };
    }
    const tripApi = sibling(typeof FlowChatTravelNotice !== 'undefined' ? FlowChatTravelNotice : null, './chat-travel-notice.js', 'FlowChatTravelNotice');
    const trip = firstHit(tripApi, body, now0, 'trip');
    if (trip) {
      const he = trip.lang === 'he';
      const title = ((he ? 'נסיעה' : 'Trip') + tail).slice(0, 120);
      return {
        intent: { type: 'event', label: title, confidence: 0.9, bookingNotice: 'trip', personalClose: 'booking-notice', signals: { score: 90, threshold: 50 }, entities: { dateIso: trip.dateIso, hour: trip.hour, minute: trip.minute }, facts: { date: { iso: trip.dateIso } } },
        process: { id: 'hold', name: 'Hold It', closingLine: he ? 'מוסיף ליומן.' : 'Putting this on your calendar.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null, bookingNotice: true,
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: trip.dateIso, hour: trip.hour, minute: trip.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, threadUrl: i.threadUrl || null }, dependsOn: null }] }
      };
    }
    const dlvApi = sibling(typeof FlowChatDeliveryWindow !== 'undefined' ? FlowChatDeliveryWindow : null, './chat-delivery-window.js', 'FlowChatDeliveryWindow');
    const dlv = firstHit(dlvApi, body, now0, 'delivery');
    if (dlv) {
      const he = dlv.lang === 'he';
      const win = dlv.endHour != null ? ' ' + pad2(dlv.hour) + ':' + pad2(dlv.minute) + '–' + pad2(dlv.endHour) + ':' + pad2(dlv.endMinute) : '';
      const title = ((he ? (dlv.visit ? 'ביקור' : 'משלוח') : (dlv.visit ? 'Visit' : 'Delivery')) + win + tail).slice(0, 120);
      return {
        intent: { type: 'event', label: title, confidence: 0.9, bookingNotice: 'delivery', personalClose: 'booking-notice', signals: { score: 90, threshold: 50 }, entities: { dateIso: dlv.dateIso, hour: dlv.hour, minute: dlv.minute }, facts: { date: { iso: dlv.dateIso } } },
        process: { id: 'hold', name: 'Hold It', closingLine: he ? 'מוסיף ליומן.' : 'Putting this on your calendar.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null, bookingNotice: true,
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: dlv.dateIso, hour: dlv.hour, minute: dlv.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, durationMinutes: dlv.durationMinutes || undefined, threadUrl: i.threadUrl || null }, dependsOn: null }] }
      };
    }
    const invApi = sibling(typeof FlowChatInvitationNotice !== 'undefined' ? FlowChatInvitationNotice : null, './chat-invitation-notice.js', 'FlowChatInvitationNotice');
    const inv = firstHit(invApi, body, now0, 'invitation');
    if (inv) {
      const he = inv.lang === 'he';
      const title = ((he ? 'הזמנה' : 'Invitation') + tail).slice(0, 120);
      return {
        intent: { type: 'event', label: title, confidence: 0.9, bookingNotice: 'invitation', personalClose: 'booking-notice', signals: { score: 90, threshold: 50 }, entities: { dateIso: inv.dateIso, hour: inv.hour, minute: inv.minute }, facts: { date: { iso: inv.dateIso } } },
        process: { id: 'hold', name: 'Hold It', closingLine: he ? 'מוסיף ליומן.' : 'Putting this on your calendar.', closedLine: he ? 'ביומן.' : 'On your calendar.', needsDateChoice: false, dateChoices: null, bookingNotice: true,
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: inv.dateIso, hour: inv.hour, minute: inv.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, durationMinutes: inv.durationMinutes || undefined, threadUrl: i.threadUrl || null }, dependsOn: null }] }
      };
    }
    const pick = firstHit(pickApi, body, now0, 'pickup');
    if (pick) {
      const he = pick.lang === 'he';
      const title = ((he ? 'לאסוף הזמנה' : 'Pick up the order') + tail).slice(0, 120);
      return {
        intent: { type: 'request', label: title, confidence: 0.9, bookingNotice: 'pickup', personalClose: 'booking-notice', signals: { score: 90, threshold: 50 }, entities: { what: title, deadline: pick.dateIso }, facts: { date: { iso: pick.dateIso } } },
        process: { id: 'log-it', name: 'Log It', closingLine: he ? 'מוסיף למשימות.' : 'Logging this so it stays tracked.', closedLine: he ? 'במשימות.' : 'Logged and tracked.', needsDateChoice: false, dateChoices: null, bookingNotice: true,
          steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title: title, dateIso: pick.dateIso, amount: null, what: title, threadUrl: i.threadUrl || null }, dependsOn: null }] }
      };
    }
    return null;
  }

  function noticeIntent(intentApi, notice) {
    return {
      type: intentApi.TYPES ? intentApi.TYPES.REQUEST : 'request', label: 'Deadline notice', confidence: 0.9,
      systemNotice: true, notice: notice, personalClose: 'system-notice', entities: { what: notice.action, deadline: notice.dueIso },
      facts: { date: { iso: notice.dueIso } }
    };
  }

  // Same step shape as the Log It task, so every surface's existing task writer carries it (Google Tasks, Microsoft To Do).
  function noticeProcess(notice, threadUrl) {
    return {
      id: 'log-it', name: 'Log It', closingLine: 'Logging this so it stays tracked.', closedLine: 'Logged and tracked.',
      needsDateChoice: false, dateChoices: null, systemNotice: true,
      steps: [{
        id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + notice.title,
        params: { title: notice.title, dateIso: notice.dueIso, amount: null, what: notice.action, threadUrl: threadUrl || null },
        dependsOn: null
      }]
    };
  }

  function taskOnlyProcess(process) {
    const steps = (process && process.steps) || [];
    return steps.length > 0 && steps.every((s) => s && (s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'outlookTask'));
  }

  function meetingClockInText(text, intent) {
    const e = intent && intent.entities;
    if (e && Number.isInteger(e.hour) && Number.isInteger(e.minute)) return true;
    if (typeof FlowCloseFamilies !== 'undefined' && typeof FlowCloseFamilies.readSlot === 'function') {
      const slot = FlowCloseFamilies.readSlot(String(text || ''), new Date());
      if (slot && slot.time && Number.isInteger(slot.time.hour) && Number.isInteger(slot.time.minute)) return true;
    }
    const extractApi = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
    if (extractApi && typeof extractApi.extract === 'function') {
      const facts = extractApi.extract(String(text || ''), {});
      if (facts && facts.time && Number.isInteger(facts.time.hour) && Number.isInteger(facts.time.minute)) return true;
    }
    if (extractApi && typeof extractApi.parseTime === 'function') {
      const t = extractApi.parseTime(String(text || ''));
      if (t && Number.isInteger(t.hour) && Number.isInteger(t.minute)) return true;
    }
    return false;
  }

  function outlookInboundMeetingClose(process, text, actionsApi, intent) {
    const id = process && process.id;
    if (!process || draftStepOf(process)) return false;
    const src = String(text || '');
    const announce = actionsApi && typeof actionsApi.inboundMeetingAnnouncement === 'function' && actionsApi.inboundMeetingAnnouncement(src);
    const timed = meetingClockInText(src, intent);
    if (id === 'hold' && timed) return true;
    // A time proposed with its clock and asked back ("Does that work?") is a hold the person can place; there is no reply to draft.
    if (id === 'schedule' && timed && /\b(?:does\s+(?:that|this|it)\s+work|work(?:s)?\s+for\s+you)\b/i.test(src)) return true;
    if (id === 'schedule' && announce && !timed) return false;
    if (announce && (id === 'hold' || id === 'schedule')) return false;
    return false;
  }

  // The connector is the only difference: Outlook writes its reply draft through Graph instead of the Gmail API.
  // A task-only process writes Microsoft To Do. A process that still has a draft keeps its task step unused.
  function forSurface(process, surface) {
    if (!process || surface !== 'outlook') return process;
    const tasks = taskOnlyProcess(process);
    // Saving the attachment on OneDrive is a file save and nothing else: the Drive link-draft that
    // follows a Drive save has no counterpart here, so a draft that waits on the file step is dropped.
    const fileIds = (process.steps || []).filter((s) => s && s.kind === 'driveFile').map((s) => s.id);
    const saveOnly = fileIds.length > 0;
    const steps = (process.steps || []).filter((s) => !(saveOnly && s && s.kind === 'gmailDraft' && fileIds.indexOf(s.dependsOn) >= 0)).map((s) => {
      if (s && s.kind === 'gmailDraft') {
        return Object.assign({}, s, { kind: 'outlookDraft', id: String(s.id || 'draft').replace(/^gmail/i, 'outlook') });
      }
      if (tasks && s && (s.kind === 'googleTask' || s.kind === 'googleTasks')) {
        return Object.assign({}, s, { kind: 'outlookTask', id: 'outlookTask' });
      }
      if (s && s.kind === 'driveFile') {
        return Object.assign({}, s, {
          kind: 'onedriveFile',
          id: 'onedriveFile',
          label: 'OneDrive',
          hint: 'Save the attached file to OneDrive'
        });
      }
      return s;
    });
    const out = Object.assign({}, process, { steps: steps });
    if (steps.some((s) => s && s.kind === 'onedriveFile')) {
      out.closedLine = 'Saved on OneDrive.';
      const he = /[\u0590-\u05FF]/.test(String(out.closingLine || ''));
      out.closingLine = he ? 'שומר את הקובץ המצורף ב-OneDrive.' : 'Saving the attached file to OneDrive.';
    }
    return out;
  }

  function draftStepOf(process) {
    return ((process && process.steps) || []).find((s) => s && (s.kind === 'gmailDraft' || s.kind === 'outlookDraft')) || null;
  }

  // Exactly what content-gmail.js buildActionPayload() sends for a gmailDraft step with no file: the step's params minus
  // the attach-chooser fields, plus who it answers and the subject. background.js turns it into text with
  // FlowDraftReply.draftBodyText for Gmail AND for Outlook.
  function draftPayload(process, ctx) {
    const c = ctx || {};
    const step = draftStepOf(process);
    const params = Object.assign({}, (step && step.params) || {});
    delete params.selectedAttachment; delete params.driveFileId; delete params.driveFileName; delete params.driveMimeType;
    const sender = c.sender || {};
    return { params, senderEmail: sender.email || null, senderName: sender.name || null, subject: c.subject || null };
  }

  function draftText(process, ctx, drafter) {
    const D = drafter || (typeof FlowDraftReply !== 'undefined' ? FlowDraftReply : sibling(null, './draft-reply.js', 'FlowDraftReply'));
    if (!D || typeof D.draftBodyText !== 'function') return null;
    return D.draftBodyText(draftPayload(process, ctx), null, null, null);
  }

  // The Gmail page asks this instead of classifying a receipt on its own.
  // True only when the ask attests a payment (a receipt or a transfer).
  function silencesReceipt(text) {
    const fileAttach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
    const resolution = sibling(typeof FlowResolution !== 'undefined' ? FlowResolution : null, './resolution.js', 'FlowResolution');
    const gate = fileAttach && typeof fileAttach.gate === 'function' ? fileAttach.gate(prepareForJudge(text)) : { kind: 'ignore' };
    if (!gate || gate.kind !== 'clear' || !gate.ask || !gate.ask.id) return false;
    return Boolean(resolution && typeof resolution.attestsPayment === 'function' && resolution.attestsPayment(gate.ask.id));
  }

  // Gmail asks this before the file-attach chip: contracts, quotes, and other
  // deliverables the resolution card owns. Receipts use silencesReceipt above.
  function silencesOwnedDeliverable(text) {
    const fileAttach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
    const resolution = sibling(typeof FlowResolution !== 'undefined' ? FlowResolution : null, './resolution.js', 'FlowResolution');
    const gate = fileAttach && typeof fileAttach.gate === 'function' ? fileAttach.gate(prepareForJudge(text)) : { kind: 'ignore' };
    if (!gate || gate.kind !== 'clear' || !gate.ask || !gate.ask.id) return false;
    return Boolean(resolution && typeof resolution.owns === 'function' && resolution.owns(gate.ask.id));
  }

  return { MIN_TEXT, bookingNotice, paymentAsk, taskAsk, prepareForJudge, namedQuietOf, contactsAsk, secondRead, doItOverride, selfSent, textForJudge, judge, noticeIntent, noticeProcess, forSurface, draftStepOf, taskOnlyProcess, draftPayload, draftText, silencesReceipt, silencesOwnedDeliverable };
})();

if (typeof module !== 'undefined') module.exports = { FlowIncomingJudge };
else if (typeof globalThis !== 'undefined') globalThis.FlowIncomingJudge = FlowIncomingJudge;
