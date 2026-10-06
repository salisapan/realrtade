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
// reply draft in it (a calendar event or a Task: Gmail writes those with the Google writers; Outlook's Do It is a draft).
const FlowIncomingJudge = (() => {
  const MIN_TEXT = 20;

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

    const text = String(i.text || '').trim();
    const factProbe = (text.length >= 12 && factReply && typeof factReply.detect === 'function') ? factReply.detect(text) : null;
    if (text.length < MIN_TEXT && !factProbe) return { show: false, reason: 'too-short', intent: null };

    const sender = i.sender || {};
    const now = i.now instanceof Date ? i.now : new Date(typeof i.now === 'number' ? i.now : Date.now());
    const intent = intentApi.classify(text, {
      senderEmail: sender.email || null,
      senderName: sender.name || null,
      subject: i.subject || '',
      calibration: i.calibration || null,
      calibrationByType: i.calibrationByType || null,
      attachmentCount: i.attachmentCount || 0,
      now
    });
    if (!intent || !intent.type) {
      return { show: false, reason: intent && intent.quiet ? 'quiet:' + intent.quiet : 'intent-null', intent: intent || null };
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
    const gate = fileAttach && typeof fileAttach.gate === 'function' ? fileAttach.gate(text) : { kind: 'ignore' };
    if (isRequest && gate.kind === 'block') return { show: false, reason: gate.reason === 'third-party' ? 'third-party' : 'file', intent };
    if (isRequest && gate.kind === 'clear') {
      if (resolution && typeof resolution.owns === 'function' && resolution.owns(gate.ask.id)) return { show: false, reason: 'file', intent };
      // Gmail searches Drive in the open thread before it offers this. Outlook's page and mailbox check do the same search and attach only when Graph returns an attachment id. Until that search runs, the silence is file-chain-not-run (the chain has not been called). A failed search is drive-not-granted or drive-search-failed, written by the host that called Drive, not here.
      if (i.surface && i.surface !== 'gmail') return { show: false, reason: 'file-chain-not-run', intent };
    }
    const process = actionsApi.planFor(intent, {
      threadUrl: i.threadUrl || null,
      hasThreadAttachment: Boolean(i.hasThreadAttachment),
      executionMemory: i.executionMemory || null
    });
    if (!process || !process.steps || !process.steps.length) return { show: false, reason: 'no-process', intent };
    // Outlook's Do It writes one thing: a reply draft. A close whose process has no draft step (a calendar event, a Task
    // with no reply) is Gmail's Google writers' job; Outlook stays quiet rather than offering a reply in its place.
    if ((i.surface || 'gmail') !== 'gmail' && !draftStepOf(process)) return { show: false, reason: 'no-draft-close', intent };
    return { show: true, intent, process: forSurface(process, i.surface || 'gmail') };
  }

  // The connector is the only difference: Outlook writes its reply draft through Graph instead of the Gmail API.
  function forSurface(process, surface) {
    if (!process || surface !== 'outlook') return process;
    return Object.assign({}, process, {
      steps: (process.steps || []).map((s) => (s && s.kind === 'gmailDraft')
        ? Object.assign({}, s, { kind: 'outlookDraft', id: String(s.id || 'draft').replace(/^gmail/i, 'outlook') })
        : s)
    });
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

  return { MIN_TEXT, judge, forSurface, draftStepOf, draftPayload, draftText };
})();

if (typeof module !== 'undefined') module.exports = { FlowIncomingJudge };
else if (typeof globalThis !== 'undefined') globalThis.FlowIncomingJudge = FlowIncomingJudge;
