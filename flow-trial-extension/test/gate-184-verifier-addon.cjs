'use strict';

module.exports = async function runGate184VerifierAddon(ctx) {
  const {
    check, runPage, patchOutlook, gateBase, cleanStore, FROM, ME, HME, file, graphFetches,
    logGateRun4Bite, WRONG_TARGET_CONV, olderDt, newerDt, paneClockIso, wtDateRow, gateHtml,
    attachDom, contract, attachUnreadHe, F3_RAW_MSG, F3_REST_MSG, GATE_CONV
  } = ctx;

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
  const wtReplySkewCtrl = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread }));
  check('wrong-target reply Do It: Graph minute skew fails closed (no draft on M-newer)',
    replyDraftActs(wtReplySkewCtrl).length === 0 || !replyDraftActs(wtReplySkewCtrl).some((m) => m.payload && m.payload.outlookIncomingId === 'M-newer'),
    { drafts: replyDraftActs(wtReplySkewCtrl).map((m) => m.payload && m.payload.outlookIncomingId) });
  const wtReplySkewMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread }, {
    contentOutlookSrc: patchOutlook(failClosedDisabledSrc)
  }));
  const wtReplySkewMutDraft = replyDraftActs(wtReplySkewMut)[0] && replyDraftActs(wtReplySkewMut)[0].payload;
  check('wrong-target reply bite: disabling exact-match fail-closed drafts M-newer on minute skew',
    wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId === 'M-newer',
    { id: wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId });

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
  const f3SuggestAtt = graphFetches(f3SuggestPage.sent).filter((u) => /\/attachments/.test(u));
  const f3SuggestCtrlRestN = f3SuggestAtt.filter((u) => decodeURIComponent(u).indexOf(F3_REST_MSG) >= 0).length;
  logGateRun4Bite('211-248', 'F3 suggest attachmentListFor raw id', 'signed-save suggest path calls attachmentListFor with pane.itemId EWS spelling');
  check('F3 suggest path: attachmentListFor on raw pane.itemId uses REST id on Graph wire',
    f3SuggestCtrlRestN >= 1,
    { ctrlRestN: f3SuggestCtrlRestN });
  const f3SuggestMutSecond = await runPage(Object.assign({}, gateBase, {
    htmlPatch: f3SuggestDom, mailBody: signedSuggestBody,
    urlId: F3_RAW_MSG, listedConversationId: GATE_CONV,
    gateAttachments: true, attachmentsGraphIdOnly: true,
    attachmentGraphMessageId: F3_REST_MSG, attachmentsGraphEwsId: F3_RAW_MSG,
    attachmentFiles: [file], hasAttachments: true, waitMs: 7000
  }, { contentOutlookSrc: patchOutlook(attachmentListWireSecondSrc) }));
  const f3SuggestMutSecondAtt = graphFetches(f3SuggestMutSecond.sent).filter((u) => /\/attachments/.test(u));
  const f3SuggestMutSecondRestN = f3SuggestMutSecondAtt.filter((u) => decodeURIComponent(u).indexOf(F3_REST_MSG) >= 0).length;
  check('F3 suggest bite: attachmentListFor wire id [1] loses REST suggest listing vs control',
    f3SuggestCtrlRestN >= 1 && f3SuggestMutSecondRestN < f3SuggestCtrlRestN,
    { ctrlRestN: f3SuggestCtrlRestN, mutRestN: f3SuggestMutSecondRestN });

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
  const f3SuggestMutRawAtt = graphFetches(f3SuggestMutRaw.sent).filter((u) => /\/attachments/.test(u));
  const f3SuggestMutRawRestN = f3SuggestMutRawAtt.filter((u) => decodeURIComponent(u).indexOf(F3_REST_MSG) >= 0).length;
  check('F3 suggest bite: attachmentListFor raw wire id loses REST listing vs control',
    f3SuggestCtrlRestN >= 1 && f3SuggestMutRawRestN < f3SuggestCtrlRestN,
    { ctrlRestN: f3SuggestCtrlRestN, mutRestN: f3SuggestMutRawRestN });
};
