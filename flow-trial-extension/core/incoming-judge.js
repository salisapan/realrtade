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
      namesWaitDone: i.namesWaitDone === true
    });
    // The profile names are not cached yet. No card, and not a quiet.
    // The host judges this mail again when the names land.
    if (intent && intent.namesPending) return { show: false, reason: 'names-pending', intent };
    if (!intent || !intent.type) {
      return { show: false, reason: intent && intent.quiet ? 'quiet:' + intent.quiet : 'intent-null', intent: intent || null };
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
    if (!selfAttachTask && !selfSentTask && !replyInsteadOfFile && isRequest && gate.kind === 'clear' && !droppedDeadline && !(intent && intent.inviteFile)) {
      if (resolution && typeof resolution.attestsPayment === 'function' && resolution.attestsPayment(gate.ask.id)) return { show: false, reason: 'file', intent };
      // Gmail searches Drive in the open thread before it offers this. Outlook's page and mailbox check do the same search and attach only when Graph returns an attachment id. Until that search runs, the silence is file-chain-not-run (the chain has not been called). A failed search is drive-not-granted or drive-search-failed, written by the host that called Drive, not here.
      // Putting a file on an invite that already exists is the file track
      // (task + short attached draft), on Outlook as well as Gmail.
      if (i.surface && i.surface !== 'gmail' && !(intent && intent.inviteFile)) return { show: false, reason: 'file-chain-not-run', intent };
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
    if ((i.surface || 'gmail') !== 'gmail' && !draftStepOf(baseProcess) && !taskOnlyProcess(baseProcess) && !calendarHold) {
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

  function firstHit(api, body, now, kind) {
    if (!api || typeof api.recognize !== 'function') return null;
    const wins = windowsOf(body);
    for (let k = 0; k < wins.length; k++) {
      const r = api.recognize(wins[k], now);
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
    return {
      intent: { type: 'request', label: title, confidence: 0.9, taskAsk: true, personalClose: 'task-ask', signals: { score: 90, threshold: 50 }, entities: { what: title, deadline: dateIso }, facts: { date: { iso: dateIso } } },
      process: { id: 'log-it', name: 'Log It', closingLine: he ? 'מוסיף למשימות.' : 'Logging this so it stays tracked.', closedLine: he ? 'במשימות.' : 'Logged and tracked.', needsDateChoice: false, dateChoices: null, taskAsk: true,
        steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title: title, dateIso: dateIso, amount: null, what: title, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

  function paymentAsk(i, body) {
    const now0 = (i.now && typeof i.now.getTime === 'function') ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const api = sibling(typeof FlowChatPaymentAsk !== 'undefined' ? FlowChatPaymentAsk : null, './chat-payment-ask.js', 'FlowChatPaymentAsk');
    const pay = firstHit(api, body, now0, 'ask');
    if (!pay) return null;
    const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
    const title = ((pay.lang === 'he' ? 'לשלם ' : 'Pay ') + pay.amount + ' ' + pay.currency + (who ? ' · ' + who : '')).slice(0, 120);
    return {
      intent: { type: 'request', label: title, confidence: 0.9, paymentAsk: true, personalClose: 'payment-ask', signals: { score: 90, threshold: 50 }, entities: { what: title, deadline: pay.dateIso }, facts: { date: { iso: pay.dateIso } } },
      process: { id: 'log-it', name: 'Log It', closingLine: pay.lang === 'he' ? 'מוסיף למשימות.' : 'Logging this so it stays tracked.', closedLine: pay.lang === 'he' ? 'במשימות.' : 'Logged and tracked.', needsDateChoice: false, dateChoices: null, paymentAsk: true,
        steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Create task: ' + title, params: { title: title, dateIso: pay.dateIso, amount: null, what: title, threadUrl: i.threadUrl || null }, dependsOn: null }] }
    };
  }

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
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: appt.dateIso, hour: appt.hour, minute: appt.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, threadUrl: i.threadUrl || null }, dependsOn: null }] }
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
          steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + title, params: { title: title, dateIso: inv.dateIso, hour: inv.hour, minute: inv.minute, calendarOp: null, quote: '', requireTime: true, meeting: true, threadUrl: i.threadUrl || null }, dependsOn: null }] }
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

  // The connector is the only difference: Outlook writes its reply draft through Graph instead of the Gmail API.
  // A task-only process writes Microsoft To Do. A process that still has a draft keeps its task step unused.
  function forSurface(process, surface) {
    if (!process || surface !== 'outlook') return process;
    const tasks = taskOnlyProcess(process);
    const steps = (process.steps || []).map((s) => {
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

  return { MIN_TEXT, bookingNotice, paymentAsk, taskAsk, prepareForJudge, selfSent, textForJudge, judge, noticeIntent, noticeProcess, forSurface, draftStepOf, taskOnlyProcess, draftPayload, draftText, silencesReceipt };
})();

if (typeof module !== 'undefined') module.exports = { FlowIncomingJudge };
else if (typeof globalThis !== 'undefined') globalThis.FlowIncomingJudge = FlowIncomingJudge;
