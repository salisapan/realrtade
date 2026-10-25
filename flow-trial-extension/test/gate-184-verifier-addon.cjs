'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOwaParse } = require('../core/owa-parse.js');
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
    if (page && page.replyTargetUnsureLine) return String(page.replyTargetUnsureLine).trim();
    const el = page.doc && page.doc.querySelector('.flow-why-not[data-glance-why="page:reply-target-unsure"]');
    return el ? String(el.textContent || '').trim() : '';
  }
  function expectsUnsureLine(page) {
    const line = pageWhyText(page);
    return line === unsureHe || line === unsureEn;
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
    return src.replace('if (conversationPanePathKey(pane)) return null;', 'if (false && conversationPanePathKey(pane)) return null;');
  }
  function bareConvGuardRemovedSrc(src) {
    return src.replace(
      'if (bareKey && isConversationId(bareKey)) return null;',
      'if (false && bareKey && isConversationId(bareKey)) return null;'
    );
  }
  function bareConvPanelessCtxSrc(src) {
    const needle = 'const ctx = {\n      app: \'outlook\',\n      doLabel: \'Do It\',\n      pane: pane || null,';
    const repl = 'const ctx = {\n      app: \'outlook\',\n      doLabel: \'Do It\',\n      pane: null,';
    return src.includes(needle) ? src.replace(needle, repl) : src;
  }
  function fileitLegacyResolverOrderSrc(src) {
    const needle = `const replyTarget = judged
              ? await resolveJudgedReplyMessageId(pane, own, pane.senderEmail)
              : await resolveMessageIdForFilePrepare(pane, own, pane.senderEmail);`;
    const repl = `const replyTarget = judged
              ? await resolveMessageIdForFilePrepare(pane, own, pane.senderEmail)
              : await resolveJudgedReplyMessageId(pane, own, pane.senderEmail);`;
    return src.includes(needle) ? src.replace(needle, repl) : src;
  }
  function newestOnlyResolveSrc(src) {
    const needle = 'async function messageIdForOpenPane(convId, own, openSender, pane) {';
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const nextFn = src.indexOf('\n  async function ', start + needle.length);
    const end = nextFn > start ? nextFn : src.length;
    let chunk = src.slice(start, end);
    const pickNeedle = 'const pickExactOnly = (list) => exactOpenMessageInList(list, pane, openSender, { soleConvFilterComplete: false });';
    if (chunk.indexOf(pickNeedle) >= 0) {
      chunk = chunk.replace(
        pickNeedle,
        'const known = await loadUserAddresses();\n      const pickExactOnly = (list) => Promise.resolve(newestOther(list, own, openSender, known));'
      );
    }
    const filterNeedle = 'const fromFilter = await exactOpenMessageInList(convList, pane, openSender, { soleConvFilterComplete: soleComplete });';
    if (chunk.indexOf(filterNeedle) >= 0) {
      chunk = chunk.replace(
        filterNeedle,
        'const knownFilter = await loadUserAddresses();\n          const fromFilter = newestOther(convList, own, openSender, knownFilter);'
      );
    }
    return src.slice(0, start) + chunk + src.slice(end);
  }
  function legacyFailClosedSrc(src) {
    let s = legacyReplyOnlySrc(src);
    const exactBlock = 'const exact = await resolveExactOpenPaneMessageId(pane, own, openSender);\n    if (exact && exact.id) return exact;';
    if (s.includes(exactBlock)) s = s.split(exactBlock).join('');
    return failClosedDisabledSrc(s);
  }
  function legacySkewDraftsNewerSrc(src) {
    return newestOnlyResolveSrc(legacyFailClosedSrc(src));
  }
  function graphOnlyNewerBiteSrc(src) {
    return legacyFailClosedSrc(src).replace(
      'if (!openPaneBodyOrSubjectMatch(pane, sole)) return null;',
      'if (false) return null;'
    );
  }
  function legacyReplyOnlySrc(src) {
    const pickNeedle = 'const pick = (list) => exactOpenMessageInList(list, pane, openSender);';
    const pickRepl = 'const pick = async (list) => { const known = await loadUserAddresses(); return newestOther(list, own, openSender, known); };';
    let s = src.includes(pickNeedle) ? src.replace(pickNeedle, pickRepl) : src;
    const needle = 'async function resolveJudgedReplyMessageId(pane, own, openSender) {';
    const start = s.indexOf(needle);
    if (start < 0) return s;
    let depth = 0;
    let end = start;
    for (let i = start; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const replacement = needle + `
    if (!pane) return null;
    const pathId = pane.pathId || pane.conversationId;
    const convId = pane.conversationId;
    if (paneUrlOnlyMessageTarget(pane) && (pathId || convId)) {
      const found = await messageIdForOpenPane(convId || pathId, own, openSender, pane);
      if (!found || !found.id) return null;
      if (!(await sameOpenSender(found.from, openSender || pane.senderEmail, found.sender))) {
        return senderMismatch(found, openSender || pane.senderEmail);
      }
      return found;
    }
    return resolveOutlookMessageId(pathId || convId, convId, own, openSender || pane.senderEmail);
  }`;
    return s.slice(0, start) + replacement + s.slice(end);
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
      'if (!msgId && !(decided && decided.attachmentsUnread) && needsJudgedReplyTarget(decided && decided.process)) {',
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
    contentOutlookSrc: patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s)))
  }));
  const wtReplyMutShown = (wtReplyMut.store.log || []).find((e) => e && e.kind === 'shown');
  const wtReplyMutPatch = patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('wrong-target reply bite: legacy newest-from-sender on conversation URL targets M-newer while older pane is open',
    wtReplyMutPatch && wtReplyMutShown && wtReplyMutShown.outlookIncomingId === 'M-newer',
    { patch: wtReplyMutPatch, id: wtReplyMutShown && wtReplyMutShown.outlookIncomingId });
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
    !wtReplySkewShownCtrl.chip && expectsUnsureLine(wtReplySkewShownCtrl) &&
    wtReplySkewDiag.indexOf('page:no-message-id') < 0,
    { why: wtReplySkewWhy.slice(0, 200), diag: wtReplySkewDiag });
  const wtReplySkewCtrl = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread, waitMs: 8000 }));
  const wtReplySkewWhyDoIt = pageWhyText(wtReplySkewCtrl);
  const wtReplySkewDiagDoIt = (wtReplySkewCtrl.store.outlookPageDiag || []).map((d) => d.reason);
  check('wrong-target reply Do It: Graph minute skew fails closed (no draft on M-newer)',
    !replyDraftActs(wtReplySkewCtrl).some((m) => m.payload && m.payload.outlookIncomingId === 'M-newer') &&
    !/Reply draft ready|טיוטת תשובה מוכנה/.test(replyReadyText(wtReplySkewCtrl)) &&
    expectsUnsureLine(wtReplySkewCtrl),
    { drafts: replyDraftActs(wtReplySkewCtrl).map((m) => m.payload && m.payload.outlookIncomingId), why: wtReplySkewWhyDoIt.slice(0, 120), diag: wtReplySkewDiagDoIt });
  const wtReplySkewMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, { threadMessages: wtReplySkewThread }, {
    contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc)
  }));
  const wtReplySkewMutDraft = replyDraftActs(wtReplySkewMut)[0] && replyDraftActs(wtReplySkewMut)[0].payload;
  const wtReplySkewMutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
  check('wrong-target reply bite: disabling exact-match fail-closed drafts M-newer on minute skew',
    wtReplySkewMutPatch && wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId === 'M-newer',
    { patch: wtReplySkewMutPatch, id: wtReplySkewMutDraft && wtReplySkewMutDraft.outlookIncomingId });
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
    contentOutlookSrc: patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s)))
  }));
  const wtReplySyncMutDraft = replyDraftActs(wtReplySyncMut)[0] && replyDraftActs(wtReplySyncMut)[0].payload;
  const wtReplySyncMutPatch = patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('wrong-target reply sync-entry bite: legacy resolver drafts M-newer while older pane is open',
    wtReplySyncMutPatch && wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId === 'M-newer',
    { patch: wtReplySyncMutPatch, id: wtReplySyncMutDraft && wtReplySyncMutDraft.outlookIncomingId });
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

  const WRONG_TARGET_CONV_REST = FlowOwaParse.canonId(WRONG_TARGET_CONV);
  function skewConvThread(convId) {
    return wtReplySkewThread.map((m) => Object.assign({}, m, { conversationId: convId }));
  }
  function assertSkewFailClosed(name, page, extra) {
    const drafts = replyDraftActs(page);
    check(name,
      !drafts.some((m) => m.payload && m.payload.outlookIncomingId === 'M-newer') &&
      !/Reply draft ready|טיוטת תשובה מוכנה/.test(replyReadyText(page)) &&
      expectsUnsureLine(page),
      Object.assign({ drafts: drafts.map((m) => m.payload && m.payload.outlookIncomingId), why: pageWhyText(page).slice(0, 160) }, extra || {}));
  }

  const restSkewDoIt = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST), waitMs: 8000
  }));
  logGateRun4Bite('restSkewDoIt', 'REST conv URL +7min Do It', 'no M-newer draft; visible reply-target-unsure');
  assertSkewFailClosed('restSkewDoIt: REST conversation URL +7min Do It fails closed (never M-newer)', restSkewDoIt);
  const restSkewDoItMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST), waitMs: 8000,
    contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc)
  }));
  const restSkewDoItMutDraft = replyDraftActs(restSkewDoItMut)[0] && replyDraftActs(restSkewDoItMut)[0].payload;
  const restSkewDoItMutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
  check('restSkewDoIt bite: disabling conversation fail-closed drafts M-newer on REST URL skew',
    restSkewDoItMutPatch && restSkewDoItMutDraft && restSkewDoItMutDraft.outlookIncomingId === 'M-newer',
    { patch: restSkewDoItMutPatch, id: restSkewDoItMutDraft && restSkewDoItMutDraft.outlookIncomingId });
  const restSkewDoItNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST), waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const restSkewDoItNoOpDraft = replyDraftActs(restSkewDoItNoOp)[0] && replyDraftActs(restSkewDoItNoOp)[0].payload;
  check('restSkewDoIt bite: identity outlook patch does not satisfy bite',
    !(restSkewDoItMutDraft && restSkewDoItMutDraft.outlookIncomingId === 'M-newer' &&
      restSkewDoItNoOpDraft && restSkewDoItNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: restSkewDoItMutDraft && restSkewDoItMutDraft.outlookIncomingId, noop: restSkewDoItNoOpDraft && restSkewDoItNoOpDraft.outlookIncomingId });

  const g5SkewRestDom = (h) => gateHtml(g5Body)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="contract.pdf" data-size="1024"></div>')
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const g5SkewRestThread = skewConvThread(WRONG_TARGET_CONV_REST).map((m, i) =>
    i === 0 ? Object.assign({}, m, { body: { contentType: 'text', content: g5Body } }) : m);
  const restG5skew = await runPage(Object.assign({}, gateBase, {
    htmlPatch: g5SkewRestDom, mailBody: g5Body,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, threadMessages: g5SkewRestThread, pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, attachmentFiles: [file], attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 8000, clickDoIt: true,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    })
  }));
  logGateRun4Bite('restG5skew', 'REST conv G5 +7min', 'no M-newer draft; visible unsure');
  assertSkewFailClosed('restG5skew: REST conversation URL attachments-unread +7min fails closed', restG5skew);
  const restG5skewMut = await runPage(Object.assign({}, gateBase, {
    htmlPatch: g5SkewRestDom, mailBody: g5Body,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: g5SkewRestThread, waitMs: 8000, clickDoIt: true,
    contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc)
  }, {
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    })
  }));
  const restG5skewMutDraft = replyDraftActs(restG5skewMut)[0] && replyDraftActs(restG5skewMut)[0].payload;
  const restG5skewMutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
  check('restG5skew bite: disabling conversation fail-closed drafts M-newer',
    restG5skewMutPatch && restG5skewMutDraft && restG5skewMutDraft.outlookIncomingId === 'M-newer',
    { patch: restG5skewMutPatch, id: restG5skewMutDraft && restG5skewMutDraft.outlookIncomingId });
  const restG5skewNoOp = await runPage(Object.assign({}, gateBase, {
    htmlPatch: g5SkewRestDom, mailBody: g5Body,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: g5SkewRestThread, waitMs: 8000, clickDoIt: true,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const restG5skewNoOpDraft = replyDraftActs(restG5skewNoOp)[0] && replyDraftActs(restG5skewNoOp)[0].payload;
  check('restG5skew bite: identity outlook patch does not satisfy bite',
    !(restG5skewMutDraft && restG5skewMutDraft.outlookIncomingId === 'M-newer' &&
      restG5skewNoOpDraft && restG5skewNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: restG5skewMutDraft && restG5skewMutDraft.outlookIncomingId, noop: restG5skewNoOpDraft && restG5skewNoOpDraft.outlookIncomingId });

  const syncSkewEws = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    threadMessages: wtReplySkewThread,
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000
  }));
  logGateRun4Bite('syncSkewEws', 'sync M-newer + EWS conv +7min', 'no M-newer draft; unsure line');
  assertSkewFailClosed('syncSkewEws: sync entry M-newer + EWS conversation URL +7min fails closed', syncSkewEws);
  const syncSkewEwsMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    threadMessages: wtReplySkewThread,
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s)))
  }));
  const syncSkewEwsMutDraft = replyDraftActs(syncSkewEwsMut)[0] && replyDraftActs(syncSkewEwsMut)[0].payload;
  const syncSkewEwsMutPatch = patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('syncSkewEws bite: legacy newest-from-sender drafts M-newer on sync skew',
    syncSkewEwsMutPatch && syncSkewEwsMutDraft && syncSkewEwsMutDraft.outlookIncomingId === 'M-newer',
    { patch: syncSkewEwsMutPatch, id: syncSkewEwsMutDraft && syncSkewEwsMutDraft.outlookIncomingId });
  const syncSkewEwsNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    threadMessages: wtReplySkewThread,
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [syncNewerEntry] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const syncSkewEwsNoOpDraft = replyDraftActs(syncSkewEwsNoOp)[0] && replyDraftActs(syncSkewEwsNoOp)[0].payload;
  check('syncSkewEws bite: identity outlook patch does not satisfy bite',
    !(syncSkewEwsMutDraft && syncSkewEwsMutDraft.outlookIncomingId === 'M-newer' &&
      syncSkewEwsNoOpDraft && syncSkewEwsNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: syncSkewEwsMutDraft && syncSkewEwsMutDraft.outlookIncomingId, noop: syncSkewEwsNoOpDraft && syncSkewEwsNoOpDraft.outlookIncomingId });

  const syncSkewRest = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000
  }));
  logGateRun4Bite('syncSkewRest', 'sync M-newer + REST conv +7min', 'no M-newer draft');
  assertSkewFailClosed('syncSkewRest: sync entry M-newer + REST conversation URL +7min fails closed', syncSkewRest);
  const syncSkewRestMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s)))
  }));
  const syncSkewRestMutDraft = replyDraftActs(syncSkewRestMut)[0] && replyDraftActs(syncSkewRestMut)[0].payload;
  const syncSkewRestMutPatch = patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('syncSkewRest bite: legacy newest-from-sender drafts M-newer on REST sync skew',
    syncSkewRestMutPatch && syncSkewRestMutDraft && syncSkewRestMutDraft.outlookIncomingId === 'M-newer',
    { patch: syncSkewRestMutPatch, id: syncSkewRestMutDraft && syncSkewRestMutDraft.outlookIncomingId });
  const syncSkewRestNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const syncSkewRestNoOpDraft = replyDraftActs(syncSkewRestNoOp)[0] && replyDraftActs(syncSkewRestNoOp)[0].payload;
  check('syncSkewRest bite: identity outlook patch does not satisfy bite',
    !(syncSkewRestMutDraft && syncSkewRestMutDraft.outlookIncomingId === 'M-newer' &&
      syncSkewRestNoOpDraft && syncSkewRestNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: syncSkewRestMutDraft && syncSkewRestMutDraft.outlookIncomingId, noop: syncSkewRestNoOpDraft && syncSkewRestNoOpDraft.outlookIncomingId });

  const syncExactRest = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST).map((m, i) =>
      i === 0 ? Object.assign({}, m, { receivedDateTime: olderDt }) : m),
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000
  }));
  const syncExactRestDraft = replyDraftActs(syncExactRest)[0] && replyDraftActs(syncExactRest)[0].payload;
  logGateRun4Bite('syncExactRest', 'sync M-newer + REST conv exact minute', 'draft M-older or fail closed, never M-newer');
  check('syncExactRest: sync entry M-newer + REST conversation URL exact minute drafts M-older only',
    syncExactRestDraft && syncExactRestDraft.outlookIncomingId === 'M-older',
    { id: syncExactRestDraft && syncExactRestDraft.outlookIncomingId, why: pageWhyText(syncExactRest).slice(0, 120) });
  const syncExactRestMut = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST).map((m, i) =>
      i === 0 ? Object.assign({}, m, { receivedDateTime: olderDt }) : m),
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s)))
  }));
  const syncExactRestMutDraft = replyDraftActs(syncExactRestMut)[0] && replyDraftActs(syncExactRestMut)[0].payload;
  const syncExactRestMutPatch = patchOutlook((s) => newestOnlyResolveSrc(legacyReplyOnlySrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('syncExactRest bite: legacy resolver drafts M-newer while older pane is open',
    syncExactRestMutPatch && syncExactRestMutDraft && syncExactRestMutDraft.outlookIncomingId === 'M-newer',
    { patch: syncExactRestMutPatch, id: syncExactRestMutDraft && syncExactRestMutDraft.outlookIncomingId });
  const syncExactRestExactThread = skewConvThread(WRONG_TARGET_CONV_REST).map((m, i) =>
    i === 0 ? Object.assign({}, m, { receivedDateTime: olderDt }) : m);
  const syncExactRestNoOp = await runPage(Object.assign({}, gateBase, wtReplyDoItBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: syncExactRestExactThread,
    store: Object.assign({}, wtReplyDoItBase.store, {
      outlookPending: { offers: [], asks: [], incoming: [Object.assign({}, syncNewerEntry, { outlookConversationId: WRONG_TARGET_CONV_REST, threadId: 'ol:' + WRONG_TARGET_CONV_REST })] },
      outlookSync: { stateVersion: 4 }
    }),
    waitMs: 8000,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const syncExactRestNoOpDraft = replyDraftActs(syncExactRestNoOp)[0] && replyDraftActs(syncExactRestNoOp)[0].payload;
  check('syncExactRest bite: identity outlook patch does not satisfy bite',
    !(syncExactRestMutDraft && syncExactRestMutDraft.outlookIncomingId === 'M-newer' &&
      syncExactRestNoOpDraft && syncExactRestNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: syncExactRestMutDraft && syncExactRestMutDraft.outlookIncomingId, noop: syncExactRestNoOpDraft && syncExactRestNoOpDraft.outlookIncomingId });

  const prepBody = 'Can you send me the signed contract by Thursday?';
  const prepDriveFile = { id: 'drive-contract', name: 'contract signed.pdf', mimeType: 'application/pdf' };
  const prepDom = (h) => gateHtml(prepBody)(h)
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const prepSkewBase = {
    htmlPatch: prepDom, mailBody: prepBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, pathRestMisses: 2, inboxLookupEmpty: true,
    driveFiles: [prepDriveFile], waitMs: 8000, clickDoIt: true,
    store: Object.assign({}, wtReplyShownBase.store, { glanceOutlookFileTrace: 1 })
  };
  const prepSkew = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, { threadMessages: wtReplySkewThread }));
  logGateRun4Bite('prepSkew', 'file prepare EWS conv +7min', 'no M-newer draft with file attached');
  assertSkewFailClosed('prepSkew: file prepare EWS conversation URL +7min Do It fails closed', prepSkew);
  const prepSkewMut = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    threadMessages: wtReplySkewThread,
    contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc)
  }));
  const prepSkewMutDraft = replyDraftActs(prepSkewMut)[0] && replyDraftActs(prepSkewMut)[0].payload;
  const prepSkewMutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
  check('prepSkew bite: disabling conversation fail-closed drafts M-newer on file-prepare skew',
    prepSkewMutPatch && prepSkewMutDraft && prepSkewMutDraft.outlookIncomingId === 'M-newer',
    { patch: prepSkewMutPatch, id: prepSkewMutDraft && prepSkewMutDraft.outlookIncomingId });
  const prepSkewNoOp = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    threadMessages: wtReplySkewThread,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const prepSkewNoOpDraft = replyDraftActs(prepSkewNoOp)[0] && replyDraftActs(prepSkewNoOp)[0].payload;
  check('prepSkew bite: identity outlook patch does not satisfy bite',
    !(prepSkewMutDraft && prepSkewMutDraft.outlookIncomingId === 'M-newer' &&
      prepSkewNoOpDraft && prepSkewNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: prepSkewMutDraft && prepSkewMutDraft.outlookIncomingId, noop: prepSkewNoOpDraft && prepSkewNoOpDraft.outlookIncomingId });

  const prepRestSkew = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST)
  }));
  logGateRun4Bite('prepRestSkew', 'file prepare REST conv +7min', 'no M-newer draft');
  assertSkewFailClosed('prepRestSkew: file prepare REST conversation URL +7min Do It fails closed', prepRestSkew);
  const prepRestSkewMut = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc)
  }));
  const prepRestSkewMutDraft = replyDraftActs(prepRestSkewMut)[0] && replyDraftActs(prepRestSkewMut)[0].payload;
  const prepRestSkewMutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
  check('prepRestSkew bite: disabling conversation fail-closed drafts M-newer on REST file-prepare skew',
    prepRestSkewMutPatch && prepRestSkewMutDraft && prepRestSkewMutDraft.outlookIncomingId === 'M-newer',
    { patch: prepRestSkewMutPatch, id: prepRestSkewMutDraft && prepRestSkewMutDraft.outlookIncomingId });
  const prepRestSkewNoOp = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST,
    threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const prepRestSkewNoOpDraft = replyDraftActs(prepRestSkewNoOp)[0] && replyDraftActs(prepRestSkewNoOp)[0].payload;
  check('prepRestSkew bite: identity outlook patch does not satisfy bite',
    !(prepRestSkewMutDraft && prepRestSkewMutDraft.outlookIncomingId === 'M-newer' &&
      prepRestSkewNoOpDraft && prepRestSkewNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: prepRestSkewMutDraft && prepRestSkewMutDraft.outlookIncomingId, noop: prepRestSkewNoOpDraft && prepRestSkewNoOpDraft.outlookIncomingId });

  const prepSkewCanon = await runPage(Object.assign({}, wtReplyShownBase, prepSkewBase, {
    threadMessages: wtReplySkewThread, convFilterCanonOnly: true
  }));
  logGateRun4Bite('prepSkewCanon', 'file prepare EWS conv +7min canon filter', 'fail closed on minute skew');
  assertSkewFailClosed('prepSkewCanon: file prepare EWS conversation +7min with canon-only filter fails closed', prepSkewCanon);

  const saveJudgedSkewDom = (h) => gateHtml(g2SaveBody)(h)
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const saveJudgedSkew = await runPage(Object.assign({}, gateBase, {
    htmlPatch: saveJudgedSkewDom, mailBody: g2SaveBody,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, attachmentFiles: [file], attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 8000, clickDoIt: true,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    })
  }));
  logGateRun4Bite('saveJudgedSkew', 'conv URL save judged path +7min (no onedriveFile chain)', 'no M-newer draft; unsure line');
  assertSkewFailClosed('saveJudgedSkew: conversation URL save without file chain +7min Do It fails closed', saveJudgedSkew);
  const saveJudgedSkewMut = await runPage(Object.assign({}, gateBase, {
    htmlPatch: saveJudgedSkewDom, mailBody: g2SaveBody,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, attachmentFiles: [file], attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 8000, clickDoIt: true,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    }),
    contentOutlookSrc: patchOutlook((s) => fileitLegacyResolverOrderSrc(legacySkewDraftsNewerSrc(s)))
  }));
  const saveJudgedSkewMutDraft = replyDraftActs(saveJudgedSkewMut)[0] && replyDraftActs(saveJudgedSkewMut)[0].payload;
  const saveJudgedSkewMutPatch = patchOutlook((s) => fileitLegacyResolverOrderSrc(legacySkewDraftsNewerSrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('saveJudgedSkew bite: fileit_legacy newest-from-sender drafts M-newer on judged save skew',
    saveJudgedSkewMutPatch && saveJudgedSkewMutDraft && saveJudgedSkewMutDraft.outlookIncomingId === 'M-newer',
    { patch: saveJudgedSkewMutPatch, id: saveJudgedSkewMutDraft && saveJudgedSkewMutDraft.outlookIncomingId });
  const saveJudgedSkewNoOp = await runPage(Object.assign({}, gateBase, {
    htmlPatch: saveJudgedSkewDom, mailBody: g2SaveBody,
    urlId: WRONG_TARGET_CONV_REST, listedConversationId: WRONG_TARGET_CONV_REST, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt, threadMessages: skewConvThread(WRONG_TARGET_CONV_REST),
    pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, attachmentFiles: [file], attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 8000, clickDoIt: true,
    store: Object.assign({}, cleanStore, {
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
    }),
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const saveJudgedSkewNoOpDraft = replyDraftActs(saveJudgedSkewNoOp)[0] && replyDraftActs(saveJudgedSkewNoOp)[0].payload;
  check('saveJudgedSkew bite: identity outlook patch does not satisfy bite',
    !(saveJudgedSkewMutDraft && saveJudgedSkewMutDraft.outlookIncomingId === 'M-newer' &&
      saveJudgedSkewNoOpDraft && saveJudgedSkewNoOpDraft.outlookIncomingId === 'M-newer'),
    { mut: saveJudgedSkewMutDraft && saveJudgedSkewMutDraft.outlookIncomingId, noop: saveJudgedSkewNoOpDraft && saveJudgedSkewNoOpDraft.outlookIncomingId });

  const wtReplySkewEn = await runPage(Object.assign({}, gateBase, wtReplyShownBase, {
    threadMessages: wtReplySkewThread, waitMs: 8000, uiLang: 'en',
    store: Object.assign({}, wtReplyShownBase.store, { glanceUiLanguage: 'en' })
  }));
  check('wrong-target reply shown EN UI: visible reply-target-unsure line matches display-copy EN',
    !wtReplySkewEn.chip && pageWhyText(wtReplySkewEn) === unsureEn,
    { why: pageWhyText(wtReplySkewEn).slice(0, 200) });
  const wtReplySkewHe = await runPage(Object.assign({}, gateBase, wtReplyShownBase, {
    threadMessages: wtReplySkewThread, waitMs: 8000, uiLang: 'he',
    store: Object.assign({}, wtReplyShownBase.store, { glanceUiLanguage: 'he' })
  }));
  check('wrong-target reply shown HE UI: visible reply-target-unsure line matches display-copy HE',
    !wtReplySkewHe.chip && pageWhyText(wtReplySkewHe) === unsureHe,
    { why: pageWhyText(wtReplySkewHe).slice(0, 200) });

  const graphOnlyNewerRow = [wtReplyThread[1]];

  function graphOnlyNewerBiteCheck(label, mutPage, noopPage, mutDraft) {
    const noopDraft = replyDraftActs(noopPage)[0] && replyDraftActs(noopPage)[0].payload;
    check(label + ' bite: identity outlook patch does not satisfy bite',
      !(mutDraft && mutDraft.outlookIncomingId === 'M-newer' &&
        noopDraft && noopDraft.outlookIncomingId === 'M-newer'),
      { mut: mutDraft && mutDraft.outlookIncomingId, noop: noopDraft && noopDraft.outlookIncomingId });
  }
  async function graphOnlyNewerMatrix(label, convId, skew) {
    const skewPaneIso = wtReplySkewThread[0].receivedDateTime;
    const htmlPatch = skew
      ? (h) => wtReplyDom(h)
        .replace('datetime="' + olderDt + '"', 'datetime="' + skewPaneIso + '"')
        .replace('data-received="' + olderDt + '"', 'data-received="' + skewPaneIso + '"')
      : wtReplyDom;
    const threadMessages = graphOnlyNewerRow;
    const base = Object.assign({}, gateBase, wtReplyDoItBase, {
      urlId: convId, listedConversationId: convId,
      htmlPatch, threadMessages, pathRestMisses: 2, inboxLookupEmpty: true, waitMs: 8000
    });
    const page = await runPage(base);
    logGateRun4Bite('graphOnlyNewer:' + label, 'Graph lists only M-newer ' + label, 'unsure line; no M-newer draft');
    assertSkewFailClosed('Graph lists only M-newer ' + label + ': Do It fails closed (never M-newer)', page);
    const mut = await runPage(Object.assign({}, base, { contentOutlookSrc: patchOutlook(legacySkewDraftsNewerSrc) }));
    const mutDraft = replyDraftActs(mut)[0] && replyDraftActs(mut)[0].payload;
    const mutPatch = patchOutlook(legacySkewDraftsNewerSrc) !== OUTLOOK_PRODUCT_SRC;
    check('Graph lists only M-newer ' + label + ' bite: legacy fail-closed disabled drafts M-newer',
      mutPatch && mutDraft && mutDraft.outlookIncomingId === 'M-newer',
      { patch: mutPatch, id: mutDraft && mutDraft.outlookIncomingId });
    const noop = await runPage(Object.assign({}, base, { contentOutlookSrc: patchOutlook((s) => s) }));
    graphOnlyNewerBiteCheck('Graph lists only M-newer ' + label, mut, noop, mutDraft);
  }
  await graphOnlyNewerMatrix('EWS exact', WRONG_TARGET_CONV, false);
  await graphOnlyNewerMatrix('EWS skew', WRONG_TARGET_CONV, true);
  await graphOnlyNewerMatrix('REST exact', WRONG_TARGET_CONV_REST, false);
  await graphOnlyNewerMatrix('REST skew', WRONG_TARGET_CONV_REST, true);

  const fileitInboxSkewBase = Object.assign({}, prepSkewBase, {
    threadMessages: wtReplySkewThread,
    inboxLookupEmpty: false,
    pathRestMisses: 2
  });
  const fileitInboxSkew = await runPage(Object.assign({}, wtReplyShownBase, fileitInboxSkewBase));
  logGateRun4Bite('fileitInboxSkew', 'OneDrive conv URL +7min non-empty inbox', 'fail closed; no M-newer draft');
  assertSkewFailClosed('file prepare conversation URL +7min with non-empty inbox fails closed (OneDrive chain)', fileitInboxSkew);
  const fileitInboxSkewMut = await runPage(Object.assign({}, wtReplyShownBase, fileitInboxSkewBase, {
    contentOutlookSrc: patchOutlook((s) => fileitLegacyResolverOrderSrc(legacySkewDraftsNewerSrc(s)))
  }));
  const fileitInboxSkewMutDraft = replyDraftActs(fileitInboxSkewMut)[0] && replyDraftActs(fileitInboxSkewMut)[0].payload;
  const fileitInboxSkewMutPatch = patchOutlook((s) => fileitLegacyResolverOrderSrc(legacySkewDraftsNewerSrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('fileitInboxSkew bite: fileit_legacy resolver order drafts M-newer on skewed OneDrive prepare',
    fileitInboxSkewMutPatch && fileitInboxSkewMutDraft && fileitInboxSkewMutDraft.outlookIncomingId === 'M-newer',
    { patch: fileitInboxSkewMutPatch, id: fileitInboxSkewMutDraft && fileitInboxSkewMutDraft.outlookIncomingId });
  const fileitInboxSkewNoOp = await runPage(Object.assign({}, wtReplyShownBase, fileitInboxSkewBase, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  graphOnlyNewerBiteCheck('fileitInboxSkew', fileitInboxSkewMut, fileitInboxSkewNoOp, fileitInboxSkewMutDraft);

  const bareConvInboxNewer = [wtReplyThread[1]];
  const bareConvBase = Object.assign({}, gateBase, prepSkewBase, {
    threadMessages: bareConvInboxNewer, convFilterEmpty: true, pathRestMisses: 2,
    inboxLookupEmpty: false, clickDoIt: true, waitMs: 8000,
    contentOutlookSrc: patchOutlook(bareConvPanelessCtxSrc)
  });
  const bareConvCtrl = await runPage(bareConvBase);
  const bareConvCtrlDraft = replyDraftActs(bareConvCtrl)[0] && replyDraftActs(bareConvCtrl)[0].payload;
  logGateRun4Bite('bareConvGuard', 'pane-less bare conversation key + inbox M-newer', 'ensureOutlookMessageId guard blocks M-newer');
  check('bare conversation key without pane: Do It does not draft M-newer from inbox list',
    !bareConvCtrlDraft || bareConvCtrlDraft.outlookIncomingId !== 'M-newer',
    { id: bareConvCtrlDraft && bareConvCtrlDraft.outlookIncomingId });
  const bareConvMut = await runPage(Object.assign({}, bareConvBase, {
    contentOutlookSrc: patchOutlook((s) => bareConvGuardRemovedSrc(bareConvPanelessCtxSrc(s)))
  }));
  const bareConvMutDraft = replyDraftActs(bareConvMut)[0] && replyDraftActs(bareConvMut)[0].payload;
  const bareConvMutPatch = patchOutlook((s) => bareConvGuardRemovedSrc(bareConvPanelessCtxSrc(s))) !== OUTLOOK_PRODUCT_SRC;
  check('bareConvGuard bite: removing conversation-id guard drafts M-newer from inbox-only list',
    bareConvMutPatch && bareConvMutDraft && bareConvMutDraft.outlookIncomingId === 'M-newer',
    { patch: bareConvMutPatch, id: bareConvMutDraft && bareConvMutDraft.outlookIncomingId });
  const bareConvNoOp = await runPage(Object.assign({}, bareConvBase, {
    contentOutlookSrc: patchOutlook(bareConvPanelessCtxSrc)
  }));
  graphOnlyNewerBiteCheck('bareConvGuard', bareConvMut, bareConvNoOp, bareConvMutDraft);
};
