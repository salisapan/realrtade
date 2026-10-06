// One close, or silence. This file is the add-on's decision adapter.
// It calls the same FlowIntent / FlowActions the Chrome extension uses,
// then refuses any plan that is not a Calendar event, a Google Task, or a
// Gmail draft. Apps Script cannot require() the extension, so
// scripts/build-bundle.js concatenates this file after the core sources.
//
// The adapter sends nothing. It does not call a model. Drive, Docs, and
// Sheets closes stay silent: this host has no Drive scope, and a close
// that drops the file is not the close.

var GlanceDecide = (function () {
  var QUIET_EN = 'Nothing to close.';
  var QUIET_HE = 'אין מה לסגור.';
  var ALLOWED = { calendar: true, gmailDraft: true, googleTask: true };

  function hebrew(text) {
    return /[\u0590-\u05FF]/.test(String(text || ''));
  }

  function silence(reason, text) {
    return {
      speak: false,
      reason: reason,
      quiet: hebrew(text) ? QUIET_HE : QUIET_EN,
      lang: hebrew(text) ? 'he' : 'en',
      steps: []
    };
  }

  function stepAllowed(step) {
    if (!step || !ALLOWED[step.kind]) return false;
    var p = step.params || {};
    if (p.fileTerm || p.shareLink || p.replyFact || p.driveFileId || p.templateId) return false;
    if (p.includeAttachment) return false;
    if (p.send === true) return false;
    return true;
  }

  function copyStep(step) {
    var params = {};
    var src = step.params || {};
    for (var key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) params[key] = src[key];
    }
    params.send = false;
    params.includeAttachment = false;
    return {
      id: step.id,
      kind: step.kind,
      label: step.label,
      dependsOn: step.dependsOn || null,
      params: params
    };
  }

  function decide(text, ctx) {
    ctx = ctx || {};
    var raw = String(text || '');
    var trimmed = raw.trim();
    var factAsk = (typeof FlowFactReply !== 'undefined' && trimmed.length >= 12)
      ? FlowFactReply.detect(raw)
      : null;
    if (trimmed.length < 20 && !factAsk) return silence('short', raw);

    var intent = FlowIntent.classify(raw, {
      senderEmail: ctx.senderEmail || null,
      senderName: ctx.senderName || null,
      now: ctx.now || new Date(),
      calibration: null,
      calibrationByType: null
    });

    if (!intent || !intent.type) {
      return silence(intent && intent.googleWait ? 'drive' : 'none', raw);
    }

    // A fact ask is one cell from a Sheet or Doc. This host cannot read
    // that cell, so it does not substitute a generic reply.
    if (typeof FlowFactReply !== 'undefined' && FlowFactReply.ownsClose(factAsk || FlowFactReply.detect(raw), intent, true)) {
      return silence('fact', raw);
    }

    // A file ask needs one Drive match or one template. Neither is available
    // here, and a draft that pretends the file is attached is a wrong close.
    if (intent.type === 'request' && typeof FlowFileAttach !== 'undefined') {
      var gate = FlowFileAttach.gate(raw);
      if (gate && (gate.kind === 'block' || gate.kind === 'clear')) return silence('file', raw);
    }

    if (intent.googleClose) return silence('drive', raw);

    var plan = FlowActions.planFor(intent, {
      threadUrl: ctx.threadUrl || null,
      hasThreadAttachment: false,
      executionMemory: null
    });
    if (!plan || !plan.steps || !plan.steps.length) return silence('none', raw);

    var steps = [];
    for (var i = 0; i < plan.steps.length; i++) {
      if (!stepAllowed(plan.steps[i])) return silence('scope', raw);
      steps.push(copyStep(plan.steps[i]));
    }

    return {
      speak: true,
      reason: null,
      quiet: null,
      lang: hebrew(raw) ? 'he' : 'en',
      processId: plan.id,
      name: plan.name,
      closingLine: plan.closingLine,
      closedLine: plan.closedLine,
      intentType: intent.type,
      personalClose: intent.personalClose || null,
      steps: steps
    };
  }

  return { decide: decide, QUIET_EN: QUIET_EN, QUIET_HE: QUIET_HE, stepAllowed: stepAllowed };
})();
