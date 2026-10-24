'use strict';
const fs = require('fs');
const path = require('path');
const OUTLOOK_PRODUCT_SRC = fs.readFileSync(path.join(__dirname, '..', 'src/content-outlook.js'), 'utf8');

module.exports = async function runGate184VerifierAddon(ctx) {
  const {
    check, runPage, patchOutlook, gateBase, cleanStore, FROM, ME, HME, file, graphFetches,
    logGateRun4Bite, WRONG_TARGET_CONV, olderDt, newerDt, paneClockIso, wtDateRow, gateHtml,
    attachDom, contract, attachUnreadHe, F3_RAW_MSG, F3_REST_MSG, GATE_CONV, FlowDisplay
  } = ctx;
  const D = FlowDisplay || require('../core/display-copy.js').FlowDisplay;
  const unsureEn = D.whyNotShownLine('page:reply-target-unsure', 'en');
  const unsureHe = D.whyNotShownLine('page:reply-target-unsure', 'he');
  function pageWhyText(page) {
    const el = page.doc && page.doc.querySelector('.flow-why-not');
    return el ? String(el.textContent || '').trim() : '';
  }
  function replyReadyText(page) {
    const chip = page.chip ? String(page.chip.textContent || '') : '';
    const written = (page.store.log || []).filter((e) => e && e.kind === 'written').map((e) => String(e.writtenLine || e.label || '')).join(' ');
    return chip + ' ' + written;
  }
  function f3AttachmentsWireOk(sent, restId, rawId) {
    const att = graphFetches(sent).filter((u) => /\/attachments/.test(u));
    const dec = att.map((u) => decodeURIComponent(u));
    const related = dec.filter((u) => u.indexOf(restId) >= 0 || u.indexOf(rawId) >= 0 || u.indexOf(encodeURIComponent(rawId)) >= 0);
    if (!related.length) return { ok: false, att: dec, related };
    const allRest = related.every((u) => u.indexOf(restId) >= 0);
    const noRaw = related.every((u) => u.indexOf(rawId) < 0 && u.indexOf(encodeURIComponent(rawId)) < 0);
    return { ok: allRest && noRaw, att: dec, related };
  }

  function replyDraftActs(page) {
    return (page.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft');
  }
  function failClosedDisabledSrc(src) {
    return src.replace('if (conversationUrlNeedsRestSpelling(pane)) return null;', 'if (false && conversationUrlNeedsRestSpelling(pane)) return null;');
  }
  function legacyReplyOnlySrc(src) {
    const needle = 'async function resolveJudgedReplyMessageId(pane, own, openSender) {';
    const start = src.indexOf(needle);
    if (start < 0) return src;
    let depth = 0;
    let end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const replacement = needle + '\n    return resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, own, openSender || pane.senderEmail);\n  }';
    return src.slice(0, start) + replacement + src.slice(end);
  }
  function attachmentListWireSecondSrc(src) {
    const needle = 'async function attachmentListFor(id) {\n    if (!id) return null;\n    const wireId = (typeof idSpellings === \'function\' ? (idSpellings(id)[0] || id) : id);';
    const repl = 'async function attachmentListFor(id) {\n    if (!id) return null;\n    const spells = typeof idSpellings === \'function\' ? idSpellings(id) : [id];\n    const wireId = (String(id).indexOf(\'+\') >= 0 || String(id).indexOf(\'/\') >= 0) ? (spells[1] || spells[0] || id) : (spells[0] || id);';
    return src.includes(needle) ? src.replace(needle, repl) : src;
  }
  function attachmentListWireRawSrc(src) {
    const needle = 'async function attachmentListFor(id) {\n    if (!id) return null;\n    const wireId = (typeof idSpellings === \'function\' ? (idSpellings(id)[0] || id) : id);';
    const repl = 'async function attachmentListFor(id) {\n    if (!id) return null;\n    const wireId = (String(id).indexOf(\'+\') >= 0 || String(id).indexOf(\'/\') >= 0) ? id : (typeof idSpellings === \'function\' ? (idSpellings(id)[0] || id) : id);';
    return src.includes(needle) ? src.replace(needle, repl) : src;
  }
  function nomsgStrictSrc(src) {
    return src.replace(
      'if (!msgId && !(decided && decided.attachmentsUnread)) {',
      'if (!msgId) {'
    );
  }

  const wtReplyBody = 'Could you confirm the contract status by Sunday?';
  const wtReplyDom = (h) => gateHtml(wtReplyBody)(h)
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const wtReplyThread = [
    { id: 'M-older', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: olderDt, body: { contentType: 'text', content: wtReplyBody } },
    { id: 'M-newer', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: newerDt, body: { contentType: 'text', content: 'Please send an update on the contract.' } }
  ];
  const wtReplyShownBase = {
    htmlPatch: wtReplyDom, mailBody: wtReplyBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt,
    threadMessages: wtReplyThread, pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: false, hasAttachments: false, waitMs: 6000,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    })
  };
  const wtReplyCtrl = await runPage(Object.assign({}, gateBase, wtReplyShownBase));
  const wtReplyShown = (wtReplyCtrl.store.log || []).find((e) => e && e.kind === 'shown');
  check('wrong-target control: judged-card on conversation URL targets open message id (M-older), not newest in thread',
    wtReplyShown && wtReplyShown.outlookIncomingId === 'M-older',
    { id: wtReplyShown && wtReplyShown.outlookIncomingId });
  const wtReplyMut = await runPage(Object.assign({}, gateBase, wtReplyShownBase, {
    contentOutlookSrc: patchOutlook(legacyReplyOnlySrc)
  }));
  const wtReplyMutShown = (wtReplyMut.store.log || []).find((e) => e && e.kind === 'shown');
  check('wrong-target reply bite: legacy newest-from-sender on conversation URL targets M-newer while older pane is open',
    wtReplyMutShown && wtReplyMutShown.outlookIncomingId === 'M-newer',
    { id: wtReplyMutShown && wtReplyMutShown.outlookIncomingId });
  const wtReplyLegacyNoOp = await runPage(Object.assign({}, gateBase, wtReplyShownBase, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtReplyLegacyNoOpShown = (wtReplyLegacyNoOp.store.log || []).find((e) => e && e.kind === 'shown');
  check('wrong-target reply bite: identity outlook patch does not satisfy legacy bite',
    !(wtReplyMutShown && wtReplyMutShown.outlookIncomingId === 'M-newer' &&
      wtReplyLegacyNoOpShown && wtReplyLegacyNoOpShown.outlookIncomingId === 'M-newer'),
    { mut: wtReplyMutShown && wtReplyMutShown.outlookIncomingId, noop: wtReplyLegacyNoOpShown && wtReplyLegacyNoOpShown.outlookIncomingId });

  const wtReplyDoItBase = Object.assign({}, wtReplyShownBase, { clickDoIt: true, waitMs: 6000 });
  const wtReplyDoItCtrl = await runPage(Object.assign({}, gateBase, wtReplyDoItBase));
  const wtReplyDoItDraft = replyDraftActs(wtReplyDoItCtrl)[0] && replyDraftActs(wtReplyDoItCtrl)[0].payload;
  logGateRun4Bite('861-878', 'reply Do It open message', 'conversation URL + clickDoIt drafts M-older when both listed and minute match');
  check('wrong-target reply Do It control: draft targets M-older on conversation URL',
    wtReplyDoItDraft && wtReplyDoItDraft.outlookIncomingId === 'M-older' && wtReplyDoItDraft.messageId === 'M-older',
    { id: wtReplyDoItDraft && wtReplyDoItDraft.outlookIncomingId });
  const wtReplySkewThread = [
    Object.assign({}, wtReplyThread[0], { receivedDateTime: new Date(Date.parse(paneClockIso) + 7 * 60 * 1000).toISOString() }),
    wtReplyThread[1]
  ];
  const wtReplySkewShownCtrl = await runPage(Object.assign({}, gateBase, wtReplyShownBase, { threadMessages: wtReplySkewThread, waitMs: 8000 }));
  const wtReplySkewWhy = pageWhyText(wtReplySkewShownCtrl);
  const wtReplySkewDiag = (wtReplySkewShownCtrl.store.outlookPageDiag || []).map((d) => d.reason);
  check('wrong-target reply shown: Graph minute skew paints reply-target-unsure (not intent-null copy)',
    !wtReplySkewShownCtrl.chip && (wtReplySkewWhy.indexOf(unsureEn) >= 0 || wtReplySkewWhy.indexOf(unsureHe) >= 0 ||
      wtReplySkewDiag.indexOf('page:reply-target-unsure') >= 0) &&
    wtReplySkewDiag.indexOf('page:no-message-id') < 0,
    { why: wtReplySkewWhy.slice(0, 200), diag: wtReplySkewDiag });
  const wtReplySkewCtrl = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread, waitMs: 8000 }));
  const wtReplySkewWhyDoIt = pageWhyText(wtReplySkewCtrl);
  const wtReplySkewDiagDoIt = (wtReplySkewCtrl.store.outlookPageDiag || []).map((d) => d.reason);
  check('wrong-target reply Do It: Graph minute skew fails closed (no draft on M-newer)',
    !replyDraftActs(wtReplySkewCtrl).some((m) => m.payload && m.payload.outlookIncomingId === 'M-newer') &&
    !/Reply draft ready|טיוטת תשובה מוכנה/.test(replyReadyText(wtReplySkewCtrl)) &&
    (wtReplySkewWhyDoIt.indexOf(unsureEn) >= 0 || wtReplySkewWhyDoIt.indexOf(unsureHe) >= 0 ||
      wtReplySkewDiagDoIt.indexOf('page:reply-target-unsure') >= 0),
    { drafts: replyDraftActs(wtReplySkewCtrl).map((m) => m.payload && m.payload.outlookIncomingId), why: wtReplySkewWhyDoIt.slice(0, 120), diag: wtReplySkewDiagDoIt });
  const wtReplySkewMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread }, {
    contentOutlookSrc: patchOutlook(failClosedDisabledSrc)
  }));
  const wtReplySkewMutDraft = replyDraftActs(wtReplySkewMut)[0] && replyDraftActs(wtReplySkewMut)[0].payload;
  check('wrong-target reply bite: disabling exact-match fail-closed drafts M-newer on minute skew',
    wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId === 'M-newer',
    { id: wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId });
  const wtReplySkewMutNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread }, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtReplySkewMutNoOpDraft = replyDraftActs(wtReplySkewMutNoOp)[0] && replyDraftActs(wtReplySkewMutNoOp)[0].payload;
  check('wrong-target reply failclosed bite: identity outlook patch does not satisfy bite',
    !(wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId === 'M-newer' &&
      wtReplySkewMutNoOpDraft && wtReplySkewMutNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId, noop: wtReplySkewMutNoOpDraft && wtReplySkewMutNoOpDraft.outlookIncomingId });

  const syncNewerEntry = {
    messageId: 'M-newer', outlookIncomingId: 'M-newer', outlookConversationId: WRONG_TARGET_CONV,
    threadId: 'ol:' + WRONG_TARGET_CONV, subject: 'Gate Run 4',
    sender: { name: 'flow', email: FROM },
    intent: { type: 'request', label: 'Reply requested by Sunday' },
    process: { id: 'reply-track', name: 'Reply', steps: [{ kind: 'outlookDraft', id: 'outlookDraft' }, { kind: 'outlookTask', id: 'outlookTask' }] }
  };
  const wtReplySyncCtrl = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    })
  }));
  const wtReplySyncDraft = replyDraftActs(wtReplySyncCtrl)[0] && replyDraftActs(wtReplySyncCtrl)[0].payload;
  check('wrong-target reply Do It: sync entry for M-newer still drafts M-older when older pane is open',
    wtReplySyncDraft && wtReplySyncDraft.outlookIncomingId === 'M-older',
    { id: wtReplySyncDraft && wtReplySyncDraft.outlookIncomingId });
  const wtReplySyncMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    }),
    contentOutlookSrc: patchOutlook(legacyReplyOnlySrc)
  }));
  const wtReplySyncMutDraft = replyDraftActs(wtReplySyncMut)[0] && replyDraftActs(wtReplySyncMut)[0].payload;
  check('wrong-target reply sync-entry bite: legacy resolver drafts M-newer while older pane is open',
    wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId === 'M-newer',
    { id: wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId });
  const wtReplySyncNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    }),
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtReplySyncNoOpDraft = replyDraftActs(wtReplySyncNoOp)[0] && replyDraftActs(wtReplySyncNoOp)[0].payload;
  check('wrong-target reply sync-entry bite: identity outlook patch does not satisfy bite',
    !(wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId === 'M-newer' &&
      wtReplySyncNoOpDraft && wtReplySyncNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId, noop: wtReplySyncNoOpDraft && wtReplySyncNoOpDraft.outlookIncomingId });

  const g2SaveBody = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
  const g2Dom = (h) => gateHtml(g2SaveBody)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-0935-signed-NDA.pdf" data-size="1024"></div>')
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const g2UnreadBase = {
    htmlPatch: g2Dom, mailBody: g2SaveBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, threadMessages: wtReplyThread, pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, attachmentFiles: [file], attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 7000, store: Object.assign({}, cleanStore)
  };
  logGateRun4Bite('G2', 'attachments-unread Do It exact', 'no outlookDraft on M-newer; no Reply draft ready');
  const g2DoItCtrl = await runPage(Object.assign({}, gateBase, g2UnreadBase, { clickDoIt: true, waitMs: 7000 }));
  const g2Drafts = replyDraftActs(g2DoItCtrl);
  check('R3 G2: attachments-unread Do It exact does not draft M-newer (may draft M-older when pinned)',
    !g2Drafts.some((m) => m.payload && m.payload.outlookIncomingId === 'M-newer'),
    { drafts: g2Drafts.map((m) => m.payload && m.payload.outlookIncomingId), text: replyReadyText(g2DoItCtrl).slice(0, 200) });
  const g5Body = 'Attached is the contract. Could you confirm the status by Sunday?';
  const g5Dom = (h) => gateHtml(g5Body)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="contract.pdf" data-size="1024"></div>')
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const g5SkewThread = [
    Object.assign({}, wtReplyThread[0], { receivedDateTime: new Date(Date.parse(paneClockIso) + 7 * 60 * 1000).toISOString(), body: { contentType: 'text', content: g5Body } }),
    wtReplyThread[1]
  ];
  const g5UnreadBase = Object.assign({}, g2UnreadBase, {
    htmlPatch: g5Dom, mailBody: g5Body, threadMessages: g5SkewThread,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    })
  });
  logGateRun4Bite('G5', 'attachments-unread reply+To Do +7min', 'no draft on M-newer; no Reply draft ready / To Do logged');
  const g5DoItCtrl = await runPage(Object.assign({}, gateBase, g5UnreadBase, { clickDoIt: true, waitMs: 8000 }));
  const g5Drafts = replyDraftActs(g5DoItCtrl);
  check('R3 G5: attachments-unread reply+To Do +7min fails closed (no M-newer draft, no ready line)',
    g5Drafts.length === 0 && !/Reply draft ready|טיוטת תשובה מוכנה|To Do task logged/.test(replyReadyText(g5DoItCtrl)),
    { drafts: g5Drafts.map((m) => m.payload && m.payload.outlookIncomingId), text: replyReadyText(g5DoItCtrl).slice(0, 220) });

  const signedSuggestBody = 'Attached is the signed NDA. Please save it to OneDrive.';
  const f3SuggestDom = (h) => gateHtml(signedSuggestBody)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-0935-signed-NDA.pdf" data-size="1024"></div>');
  const f3SuggestPage = await runPage(Object.assign({}, gateBase, {
    htmlPatch: f3SuggestDom, mailBody: signedSuggestBody,
    urlId: F3_RAW_MSG, listedConversationId: GATE_CONV,
    gateAttachments: true, attachmentsGraphIdOnly: true,
    attachmentGraphMessageId: F3_REST_MSG, attachmentsGraphEwsId: F3_RAW_MSG,
    attachmentFiles: [file], hasAttachments: true, waitMs: 7000
  }));
  const f3SuggestWire = f3AttachmentsWireOk(f3SuggestPage.sent, F3_REST_MSG, F3_RAW_MSG);
  logGateRun4Bite('211-248', 'F3 suggest attachmentListFor raw id', 'every /attachments fetch uses REST id only');
  check('F3 suggest path: every /attachments fetch uses REST id and none uses raw EWS id',
    f3SuggestWire.ok,
    f3SuggestWire);
  const f3SuggestMutSecond = await runPage(Object.assign({}, gateBase, {
    htmlPatch: f3SuggestDom, mailBody: signedSuggestBody,
    urlId: F3_RAW_MSG, listedConversationId: GATE_CONV,
    gateAttachments: true, attachmentsGraphIdOnly: true,
    attachmentGraphMessageId: F3_REST_MSG, attachmentsGraphEwsId: F3_RAW_MSG,
    attachmentFiles: [file], hasAttachments: true, waitMs: 7000
  }, { contentOutlookSrc: patchOutlook(attachmentListWireSecondSrc) }));
  const f3MutSecondWire = f3AttachmentsWireOk(f3SuggestMutSecond.sent, F3_REST_MSG, F3_RAW_MSG);
  const f3MutSecondPatch = patchOutlook(attachmentListWireSecondSrc) !== OUTLOOK_PRODUCT_SRC;
  check('F3 suggest bite: attachmentListFor wire id [1] fails REST-only attachment wire audit',
    f3MutSecondPatch && !f3MutSecondWire.ok,
    { patch: f3MutSecondPatch, wire: f3MutSecondWire });

  const nomsgUnreadGate = {
    htmlPatch: attachDom, mailBody: contract,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, listedSubject: 'Gate Run 4',
    gateAttachments: true, attachmentFiles: [file, Object.assign({}, file, { id: 'att2', name: 'appendix.pdf' })],
    attachmentReads: 'fail', attachmentsUnread: true, hasAttachments: true, waitMs: 6000,
    store: Object.assign({}, cleanStore)
  };
  const nomsgUnreadCtrl = await runPage(nomsgUnreadGate);
  const nomsgChip = nomsgUnreadCtrl.chip ? String(nomsgUnreadCtrl.chip.textContent || '') : '';
  const nomsgCtrlShown = (nomsgUnreadCtrl.store.log || []).find((e) => e && e.kind === 'shown');
  check('nomsg control: attachments-unread card mounts without message id and shows fail-safe line',
    Boolean(nomsgUnreadCtrl.chip) && nomsgChip.indexOf(attachUnreadHe) >= 0 &&
    nomsgCtrlShown && !nomsgCtrlShown.messageId,
    { text: nomsgChip.slice(0, 200), messageId: nomsgCtrlShown && nomsgCtrlShown.messageId });
  const nomsgUnreadMut = await runPage(Object.assign({}, nomsgUnreadGate, {
    contentOutlookSrc: patchOutlook(nomsgStrictSrc)
  }));
  const nomsgMutChip = nomsgUnreadMut.chip ? String(nomsgUnreadMut.chip.textContent || '') : '';
  check('nomsg bite: strict no-message-id gate drops attachments-not-read line vs control',
    Boolean(nomsgUnreadCtrl.chip) && nomsgChip.indexOf(attachUnreadHe) >= 0 &&
    nomsgCtrlShown && !nomsgCtrlShown.messageId &&
    (!Boolean(nomsgUnreadMut.chip) || nomsgMutChip.indexOf(attachUnreadHe) < 0),
    { mutChip: Boolean(nomsgUnreadMut.chip) });
  const nomsgUnreadNoOp = await runPage(Object.assign({}, nomsgUnreadGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const nomsgNoOpChip = nomsgUnreadNoOp.chip ? String(nomsgUnreadNoOp.chip.textContent || '') : '';
  check('nomsg bite: identity outlook patch does not satisfy bite',
    !(Boolean(nomsgUnreadCtrl.chip) && nomsgChip.indexOf(attachUnreadHe) >= 0 &&
      (!Boolean(nomsgUnreadNoOp.chip) || nomsgNoOpChip.indexOf(attachUnreadHe) < 0)),
    { ctrlLine: nomsgChip.indexOf(attachUnreadHe) >= 0, noopLine: nomsgNoOpChip.indexOf(attachUnreadHe) >= 0 });
  const f3SuggestMutRaw = await runPage(Object.assign({}, gateBase, {
    htmlPatch: f3SuggestDom, mailBody: signedSuggestBody,
    urlId: F3_RAW_MSG, listedConversationId: GATE_CONV,
    gateAttachments: true, attachmentsGraphIdOnly: true,
    attachmentGraphMessageId: F3_REST_MSG, attachmentsGraphEwsId: F3_RAW_MSG,
    attachmentFiles: [file], hasAttachments: true, waitMs: 7000
  }, { contentOutlookSrc: patchOutlook(attachmentListWireRawSrc) }));
  const f3MutRawWire = f3AttachmentsWireOk(f3SuggestMutRaw.sent, F3_REST_MSG, F3_RAW_MSG);
  const f3MutRawPatch = patchOutlook(attachmentListWireRawSrc) !== OUTLOOK_PRODUCT_SRC;
  check('F3 suggest bite: attachmentListFor raw wire id fails REST-only attachment wire audit',
    f3MutRawPatch && !f3MutRawWire.ok,
    { patch: f3MutRawPatch, wire: f3MutRawWire });
};
