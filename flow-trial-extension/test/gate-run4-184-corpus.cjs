'use strict';
// Gate Run 4 (#184): attachment evidence, reply+task, note-to-self, scope lines.
// Bite checks are behavioral (Outlook page path + Gmail card hint). Source-grep rows are extra.
// Run: node test/gate-run4-184-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : ''); }
}

const ROOT = path.join(__dirname, '..');
const { FlowOutlookAttachmentEvidence: E } = require('../core/outlook-attachment-evidence.js');
const { FlowDisplay: D } = require('../core/display-copy.js');
const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
const displaySrc = fs.readFileSync(path.join(ROOT, 'core/display-copy.js'), 'utf8');
const gmailSrc = fs.readFileSync(path.join(ROOT, 'src/content-gmail.js'), 'utf8');
const popupSrc = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');

console.log('\n--- source wiring (extra, not bite) ---\n');
check('mergeCount uses DOM when Graph list is null',
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).count === 2 &&
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).unread === true);
check('display-copy has HE+EN attachments-not-read',
  D.attachmentsNotReadLine('he').indexOf('לא הצלחתי') >= 0 && /Could not read/.test(D.attachmentsNotReadLine('en')));
check('display-copy has HE+EN note-to-self short and task-suggested',
  D.noteToSelfLine('he').indexOf('ממך') >= 0 && D.noteToSelfLine('he').indexOf('הוצעה') < 0 &&
  D.noteToSelfLine('he', { taskSuggested: true }).indexOf('הוצעה') >= 0 &&
  /From you to you/.test(D.noteToSelfLine('en')) && !/task was suggested/.test(D.noteToSelfLine('en')) &&
  /task was suggested/.test(D.noteToSelfLine('en', { taskSuggested: true })));
check('display-copy has HE+EN OneDrive reconnect',
  D.missingScopeLine('Files.ReadWrite', 'OneDrive', 'en').indexOf('OneDrive') >= 0 &&
  D.missingScopeLine('Files.ReadWrite', 'וואן־דרייב', 'he').indexOf('וואן') >= 0);
check('decideFromText uses attachmentListFor not bare graphValues',
  /attachmentListFor\(id\)/.test(outlookSrc) && !/save-count'\)\s*:\s*null/.test(outlookSrc));
check('signed-save-suggest triggers recordSuggestNote',
  /signed-save-suggest/.test(outlookSrc) && /recordSuggestNote/.test(outlookSrc));
check('buildCtx keeps task steps with reply draft (H1)',
  /taskSteps/.test(outlookSrc) && /draftSteps\.concat\(taskSteps\)/.test(outlookSrc));
check('F3 path REST and office read use idSpellings + ImmutableId fallback',
  /function idSpellings/.test(outlookSrc) && /idSpellings\(read\.messageId\)/.test(outlookSrc) &&
  /prefers = \[null, GRAPH_IMMUTABLE\]/.test(outlookSrc));
check('note-to-self does not return before decideFromText',
  !/pane\.noteToSelf = true[\s\S]{0,40}return;/.test(outlookSrc));
check('paintMissingScope mentions OneDrive Files.ReadWrite',
  /Files\.ReadWrite/.test(outlookSrc) && /onedriveFile/.test(outlookSrc));
check('Gmail paints Drive reconnect on file cards',
  /paintMissingDriveScope/.test(gmailSrc) && /SCOPE_DRIVE_FILE/.test(gmailSrc));
check('background loads outlook-attachment-evidence.js',
  /outlook-attachment-evidence\.js/.test(bgSrc));
check('popup lists all own addresses not only primary',
  /ownAddresses\.join/.test(popupSrc));

const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const ME = 'glance.salisapan@outlook.com';
const FROM = 'ai.local.flow@gmail.com';

function judge(text, attachmentCount, opts) {
  const o = opts || {};
  return J.judge({
    text,
    subject: 'Gate Run 4',
    sender: o.sender || { name: 'flow', email: FROM },
    surface: 'outlook',
    to: o.to || [ME],
    cc: [],
    ownAddresses: o.ownAddresses || [ME, 'salisapan1@gmail.com'],
    userName: 'Sali',
    direction: o.direction || 'inbound',
    inbound: o.inbound !== false,
    attachmentCount: attachmentCount == null ? 0 : attachmentCount,
    hasThreadAttachment: attachmentCount === 1,
    now: new Date('2026-10-20T12:00:00Z')
  });
}

const h1 = 'האם תוכל לעדכן אותי לגבי החוזה עד יום ראשון?';
const jH = judge(h1, 0);
const hSurf = jH.show && jH.process ? J.forSurface(jH.process, 'outlook') : null;
const hKinds = hSurf && hSurf.steps && hSurf.steps.map((s) => s.kind);
check('H1 Hebrew reply-track includes outlookTask row (not googleTask on Outlook)',
  jH.show && hKinds && hKinds.indexOf('outlookTask') >= 0 && hKinds.some((k) => k === 'outlookDraft' || k === 'gmailDraft') && hKinds.indexOf('googleTask') < 0,
  { show: jH.show, kinds: hKinds, label: jH.intent && jH.intent.label });

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }

async function runBehavioral() {
  if (!JSDOM) {
    check('jsdom present for Gate Run 4 bite checks', false, 'missing jsdom');
    return;
  }
  let harness;
  try { harness = require('./owa-page-harness.cjs'); }
  catch (e) {
    check('owa-page-harness loads for bite checks', false, e.message);
    return;
  }
  const { runPage, ME: HME } = harness;
  const attachUnreadHe = D.attachmentsNotReadLine('he');
  const GATE_CONV = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX/C+aXV';
  const file = { id: 'att1', name: 'Gate-0935-signed-NDA.pdf', isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
  const gateHtml = (text) => (h) => h
    .replace('title="Pilot proposal">Pilot proposal', 'title="Gate Run 4">Gate Run 4')
    .replace(/<div>Hi Sali,<\/div>[\s\S]*?<div>Flow team<\/div>/, '<div>' + text + '</div>');
  function selfHtmlPatch(body) {
    return (h) => gateHtml(body)(h)
      .replace(/ai\.local\.flow@gmail\.com/g, HME)
      .replace(/title="flow &lt;ai\.local\.flow@gmail\.com&gt;"/g, 'title="' + HME + '"')
      .replace(/מאת: flow/g, 'מאת: Sali')
      .replace(/>flow</g, '>Sali<')
      .replace(/אל: <span>glance\.salisapan@outlook\.com<\/span>/, 'אל: <span>' + HME + '</span>')
      .replace('<div class="to">', '<div data-testid="RecipientWell"><div aria-label="אל: ' + HME + '"><span title="' + HME + '">Sali</span></div></div><div class="to" hidden>');
  }
  const cleanStore = {
    log: [], stillOpenScan: [], stillOpenMetrics: { v: 1, days: {} },
    glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 },
    outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] }
  };
  const gateBase = {
    htmlPatch: gateHtml('Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks'),
    urlId: GATE_CONV, listedConversationId: GATE_CONV,
    listedSubject: 'Gate Run 4', messageId: 'M1',
    mailBody: 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks',
    gateAttachments: true, attachmentFiles: [file], hasAttachments: true, waitMs: 4500
  };

  const selfTask = 'תזכיר לי לשלוח את החוזה ביום ראשון.';
  const selfToSelf = await runPage({
    htmlPatch: selfHtmlPatch(selfTask),
    mailBody: selfTask,
    graphFrom: { name: 'Sali', address: HME },
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-self-task',
    waitMs: 4500,
    store: Object.assign({}, cleanStore, { glanceOwnNames: ['Sali'] })
  });
  const selfChipText = selfToSelf.chip ? String(selfToSelf.chip.textContent || '') : '';
  const selfHint = selfToSelf.chip && selfToSelf.chip.querySelector('.flow-chip-note-hint');
  const selfHintText = selfHint ? String(selfHint.textContent || '') : '';
  const selfKinds = ((selfToSelf.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const selfStepKinds = selfKinds && selfKinds.steps && selfKinds.steps.map((s) => s.kind);
  const selfHasTask = selfStepKinds && selfStepKinds.some((k) => k === 'outlookTask' || k === 'googleTask');
  check('(D) note-to-self with task row: full task-suggested line',
    Boolean(selfToSelf.chip) && selfHasTask &&
    (selfHintText.indexOf('הוצעה') >= 0 || selfChipText.indexOf('הוצעה') >= 0),
    { hint: selfHintText.slice(0, 200), text: selfChipText.slice(0, 200), kinds: selfStepKinds, note: D.noteToSelfLine('he', { taskSuggested: true }) });

  const selfNoteOnly = await runPage({
    htmlPatch: selfHtmlPatch('תודה על העדכון — אעקוב מכאן.'),
    mailBody: 'תודה על העדכון — אעקוב מכאן.',
    graphFrom: { name: 'Sali', address: HME },
    urlId: GATE_CONV + '-D2', listedConversationId: GATE_CONV + '-D2', messageId: 'M-self-note-only',
    waitMs: 4500,
    store: {
      outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: HME }, ownAddresses: [HME] },
      glanceTodoConsent: { mode: 'always', scope: 'Tasks.ReadWrite', revoked: false, at: 1 }
    }
  });
  const noteOnlyHint = selfNoteOnly.chip && selfNoteOnly.chip.querySelector('.flow-chip-note-hint');
  const noteOnlyText = noteOnlyHint ? String(noteOnlyHint.textContent || '') : '';
  const noteOnlyKinds = ((selfNoteOnly.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const noteOnlyStepKinds = noteOnlyKinds && noteOnlyKinds.steps && noteOnlyKinds.steps.map((s) => s.kind);
  const noteOnlyHasTask = noteOnlyStepKinds && noteOnlyStepKinds.some((k) => k === 'outlookTask' || k === 'googleTask');
  const noteOnlyChipText = selfNoteOnly.chip ? String(selfNoteOnly.chip.textContent || '') : '';
  check('(D) note-to-self without task row: judged WITH short line only',
    Boolean(selfNoteOnly.chip) && !noteOnlyHasTask &&
    (noteOnlyText.indexOf('ממך אליך') >= 0 || noteOnlyChipText.indexOf('ממך אליך') >= 0) &&
    noteOnlyText.indexOf('הוצעה') < 0 && noteOnlyChipText.indexOf('הוצעה') < 0,
    { hint: noteOnlyText, text: noteOnlyChipText.slice(0, 200), kinds: noteOnlyStepKinds, copy: D.noteToSelfLine('he', { taskSuggested: false }) });

  const contract = 'Please sign the contract and return the appendix by Friday.';
  const twoFiles = [file, Object.assign({}, file, { id: 'att2', name: 'appendix.pdf' })];
  const attachDom = (h) => gateHtml(contract)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="a.pdf" data-size="1024"></div><div data-name="appendix.pdf" data-size="2048"></div');
  const unread = await runPage({
    htmlPatch: attachDom, mailBody: contract,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, listedSubject: 'Gate Run 4', messageId: 'M1',
    gateAttachments: true, attachmentFiles: twoFiles, attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 4500
  });
  const unreadKinds = (unread.store.log || []).find((e) => e && e.kind === 'shown');
  const stepKinds = unreadKinds && unreadKinds.process && unreadKinds.process.steps && unreadKinds.process.steps.map((s) => s.kind);
  const chipText = unread.chip ? String(unread.chip.textContent || '') : '';
  const unreadHint = unread.chip && unread.chip.querySelector('.flow-chip-undo-hint');
  const unreadHintText = unreadHint ? String(unreadHint.textContent || '') : '';
  check('(a) Graph attachments fail: card shows with reply + To Do and attachments-not-read line',
    Boolean(unread.chip) && (chipText.indexOf(attachUnreadHe) >= 0 || unreadHintText.indexOf(attachUnreadHe) >= 0) &&
    stepKinds && stepKinds.some((k) => k === 'outlookDraft' || k === 'gmailDraft') &&
    stepKinds.some((k) => k === 'outlookTask' || k === 'googleTask'),
    { text: chipText.slice(0, 200), hint: unreadHintText, kinds: stepKinds });

  const imm = await runPage(Object.assign({}, gateBase, {
    pathRestNeedsImmutable: true, pathRestHit: true, pathRestId: GATE_CONV, pathRestGraphId: 'M1', waitMs: 4500
  }));
  const immKinds = ((imm.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const immStepKinds = immKinds && immKinds.steps && immKinds.steps.map((s) => s.kind);
  check('(b) ImmutableId-only Graph: file card shows (OneDrive save)',
    Boolean(imm.chip) && /OneDrive|Do It/.test(String(imm.chip.textContent || '')) &&
    immStepKinds && immStepKinds.indexOf('onedriveFile') >= 0,
    { text: imm.chip && imm.chip.textContent, kinds: immStepKinds });

  const signed = 'Attached is the signed NDA. Please save it to OneDrive.';
  const one = await runPage(Object.assign({}, gateBase, {
    htmlPatch: gateHtml(signed), mailBody: signed, waitMs: 4500
  }));
  const oneKinds = ((one.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const oneStepKinds = oneKinds && oneKinds.steps && oneKinds.steps.map((s) => s.kind);
  check('(c) single signed copy shows Save to OneDrive on the page',
    Boolean(one.chip) && /OneDrive/.test(String(one.chip.textContent || '')) &&
    oneStepKinds && oneStepKinds.indexOf('onedriveFile') >= 0,
    { text: one.chip && one.chip.textContent, kinds: oneStepKinds });

  const attachLoadingHe = D.attachmentsLoadingLine('he');
  const h1Body = 'האם תוכל לעדכן אותי לגבי החוזה עד יום ראשון?';
  const mixedDo = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-mix',
    waitMs: 4500, clickDoIt: true, clickUndo: true, undoCount: 2,
    store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [HME] } }
  });
  const mixActs = mixedDo.sent.filter((m) => m.type === 'flow:execute-action');
  const mixUndos = mixedDo.sent.filter((m) => m.type === 'flow:undo-action');
  check('(A) mixed reply+task Do It: two writes (draft + To Do) both read back',
    mixActs.length === 2 &&
    mixActs.some((m) => m.payload && m.payload.connectorId === 'outlookDraft') &&
    mixActs.some((m) => m.payload && m.payload.connectorId === 'outlookTask'),
    mixActs.map((m) => m.payload && m.payload.connectorId));
  check('(A) Undo on mixed receipt removes draft and To Do',
    mixUndos.length >= 2 &&
    mixUndos.some((m) => m.connectorId === 'outlookDraft') &&
    mixUndos.some((m) => m.connectorId === 'outlookTask'),
    mixUndos.map((m) => m.connectorId));

  const h1Done = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-reload',
    waitMs: 4500, clickDoIt: true,
    store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [HME] } }
  });
  const h1Reload = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-reload',
    waitMs: 4500,
    store: JSON.parse(JSON.stringify(h1Done.store))
  });
  const reloadText = h1Reload.chip ? String(h1Reload.chip.textContent || '') : '';
  const reloadWritten = (h1Reload.store.log || []).filter((e) => e && e.kind === 'written' && !e.undone);
  check('H1 reload: one receipt shows draft + To Do (not Handled-only To Do)',
    Boolean(h1Reload.chip) &&
    /Draft ready|Reply draft ready/.test(reloadText) &&
    reloadWritten.some((e) => e.connectorId === 'outlookDraft') &&
    reloadWritten.some((e) => e.connectorId === 'outlookTask'),
    { text: reloadText.slice(0, 240), written: reloadWritten.map((e) => e.connectorId) });
  const h1UndoReload = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-reload',
    waitMs: 4500, clickUndo: true, undoCount: 2,
    store: JSON.parse(JSON.stringify(h1Done.store))
  });
  const h1UndoCalls = h1UndoReload.sent.filter((m) => m.type === 'flow:undo-action');
  const h1SecondDraft = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-reload',
    waitMs: 4500, clickDoIt: true,
    store: JSON.parse(JSON.stringify(h1UndoReload.store))
  });
  const h1DraftWrites = h1SecondDraft.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft');
  check('H1 reload Undo removes draft and To Do; a fresh Do It creates only one draft',
    h1UndoCalls.some((m) => m.connectorId === 'outlookDraft') &&
    h1UndoCalls.some((m) => m.connectorId === 'outlookTask') &&
    h1DraftWrites.length === 1,
    { undos: h1UndoCalls.map((m) => m.connectorId), drafts: h1DraftWrites.length });

  const bBody = 'Please sign the contract and return the appendix by Friday.';
  const bDom = (h) => gateHtml(bBody)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="a.pdf" data-size="1024"></div><div data-name="appendix.pdf" data-size="2048"></div');
  const convCanon = await runPage({
    htmlPatch: bDom, mailBody: bBody,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-b-conv',
    convFilterCanonOnly: true,
    gateAttachments: true, attachmentFiles: twoFiles, attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 5000,
    store: Object.assign({}, cleanStore)
  });
  const convChip = convCanon.chip ? String(convCanon.chip.textContent || '') : '';
  const convKinds = ((convCanon.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const convStepKinds = convKinds && convKinds.steps && convKinds.steps.map((s) => s.kind);
  const convWhy = (convCanon.store.outlookPageDiag || []).map((d) => d.reason);
  check('(B) conversation-view id (+/=): REST canon filter + attachment unread still shows judged card (not silence)',
    Boolean(convCanon.chip) && !convWhy.some((r) => r === 'page:intent-null' || r === 'intent-null') &&
    convStepKinds && (convStepKinds.some((k) => k === 'outlookDraft' || k === 'gmailDraft') || convChip.indexOf(attachUnreadHe) >= 0),
    { text: convChip.slice(0, 240), kinds: convStepKinds, why: convWhy });

  const promiseOnly = 'האם תוכל לעדכן אותי לגבי החוזה עד יום ראשון?';
  const unknownAttach = await runPage({
    htmlPatch: gateHtml(promiseOnly), mailBody: promiseOnly,
    urlId: GATE_CONV + '-C', listedConversationId: GATE_CONV + '-C', messageId: 'M-prom-c',
    gateAttachments: true, attachmentReads: 'fail', waitMs: 4500,
    store: Object.assign({}, cleanStore)
  });
  const unkKinds = ((unknownAttach.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const unkStepKinds = unkKinds && unkKinds.steps && unkKinds.steps.map((s) => s.kind);
  check('(C) no DOM chips + unknown attachments: judged reply + task (not silence)',
    Boolean(unknownAttach.chip) && unkStepKinds &&
    unkStepKinds.some((k) => k === 'outlookDraft' || k === 'gmailDraft') &&
    unkStepKinds.some((k) => k === 'outlookTask' || k === 'googleTask'),
    { kinds: unkStepKinds, why: (unknownAttach.store.outlookPageDiag || []).map((d) => d.reason) });

  const lateSigned = 'Attached is the signed NDA. Please save it to OneDrive.';
  const lateChips = await runPage(Object.assign({}, gateBase, {
    htmlPatch: (h) => gateHtml(lateSigned)(h),
    mailBody: lateSigned,
    mutate: (doc) => {
      const pane = doc.getElementById('ReadingPaneContainerId');
      if (!pane || pane.querySelector('[data-name="Gate-0935-signed-NDA.pdf"]')) return;
      const chip = doc.createElement('div');
      chip.setAttribute('data-name', 'Gate-0935-signed-NDA.pdf');
      chip.setAttribute('data-size', '1024');
      pane.appendChild(chip);
    },
    afterMs: 600,
    waitMs: 7000,
    rescan: true
  }));
  const lateKinds = ((lateChips.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const lateStepKinds = lateKinds && lateKinds.steps && lateKinds.steps.map((s) => s.kind);
  check('(E) late attachment chips upgrade to OneDrive file card',
    Boolean(lateChips.chip) && /OneDrive/.test(String(lateChips.chip.textContent || '')) &&
    lateStepKinds && lateStepKinds.indexOf('onedriveFile') >= 0,
    { text: lateChips.chip && lateChips.chip.textContent, kinds: lateStepKinds, hints: lateChips.chip && lateChips.chip.textContent });

  console.log('\n--- Gmail: Drive scope reconnect on a file card (bite) ---\n');
  const GME = 'me@x.com';
  function gmailScripts() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0].js;
  }
  function materialize(store, keys) {
    const snap = {};
    Object.keys(store).forEach((k) => { if (k.charAt(0) !== '_') snap[k] = store[k]; });
    if (keys == null) return snap;
    if (typeof keys === 'string') return { [keys]: snap[keys] };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((k) => { out[k] = snap[k]; });
      return out;
    }
    const out = {};
    Object.keys(keys).forEach((k) => { out[k] = snap[k] !== undefined ? snap[k] : keys[k]; });
    return out;
  }
  function attachChrome(w, store, lang) {
    w.chrome = {
      runtime: {
        id: 'ext', lastError: null, getURL: (s) => s,
        getManifest: () => ({ version: '0.9.56' }),
        onMessage: { addListener() {} },
        sendMessage(msg, cb) {
          let result = { ok: true };
          if (msg && msg.type === 'flow:connector-status') result = { googleTasks: { connected: true, configured: true } };
          if (msg && msg.type === 'flow:pro-status') result = { ok: true, active: false };
          if (msg && msg.type === 'flow:search-drive') {
            result = { ok: true, status: 200, files: [], fileCount: 0 };
          }
          if (cb) setTimeout(() => cb(result), 0);
          return Promise.resolve(result);
        }
      },
      storage: {
        local: {
          get(keys, cb) {
            const result = materialize(store, keys);
            const p = Promise.resolve(result);
            if (typeof cb === 'function') p.then((value) => cb(value));
            return p;
          },
          set(patch, cb) {
            Object.assign(store, JSON.parse(JSON.stringify(patch)));
            if (typeof cb === 'function') setTimeout(cb, 0);
            return Promise.resolve();
          },
          remove(keys, cb) {
            [].concat(keys).forEach((k) => { delete store[k]; });
            if (typeof cb === 'function') setTimeout(cb, 0);
            return Promise.resolve();
          }
        },
        onChanged: { addListener() {} },
        sync: { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); } }
      },
      i18n: { getUILanguage: () => lang, getMessage: () => '' }
    };
  }
  const saveBody = 'Attached is the signed NDA. Please save it to Google Drive.';
  const html = `<!doctype html><html><body>
    <a aria-label="Google Account: Me (${GME})" href="https://accounts.google.com/SignOutOptions"></a>
    <h2 class="hP">Vendor contract</h2>
    <div role="main">
      <div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m1">
        <span email="vendor@example.com" name="Vendor">Vendor</span>
        <span email="${GME}">me</span>
        <div class="a3s">${saveBody}</div>
        <span download_url="application/pdf:contract.pdf:https://mail.google.com/mail/u/0?ui=2&attid=0.1">contract.pdf</span>
      </div>
    </div>
  </body></html>`;
  const store = {
    onboarded: true,
    connectorId: 'googleTasks',
    log: [],
    googleGrantedScopes: {
      status: 'granted',
      version: 'openid\nhttps://www.googleapis.com/auth/tasks\nhttps://www.googleapis.com/auth/calendar.events\n'
    }
  };
  const dom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0/#inbox', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const fixed = new Date(2026, 9, 20, 12, 0, 0).getTime();
  class FixedDate extends w.Date {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  w.Date = FixedDate;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent || ''; } });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  attachChrome(w, store, 'en');
  const ctx = dom.getInternalVMContext();
  for (const file of gmailScripts()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(ctx);
  }
  await new Promise((r) => setTimeout(r, 4500));
  const host = w.document.querySelector('.flow-chip-host');
  const hint = host && host.querySelector('.flow-chip-undo-hint');
  const reconnectLine = D.missingScopeLine('https://www.googleapis.com/auth/drive.file', 'Drive', 'en');
  const shownLog = (store.log || []).find((e) => e && e.kind === 'shown');
  const gmailStepKinds = shownLog && shownLog.process && shownLog.process.steps && shownLog.process.steps.map((s) => s.kind);
  check('Gmail missing Drive scope: file card shows Drive reconnect line',
    Boolean(host) && gmailStepKinds && gmailStepKinds.some((k) => k === 'driveFile' || k === 'attachmentSave') &&
    Boolean(hint) && String(hint.textContent || '').indexOf('Drive') >= 0 &&
    String(hint.textContent || '') === reconnectLine,
    { host: Boolean(host), kinds: gmailStepKinds, hint: hint && hint.textContent, expected: reconnectLine });
  w.close();
}

(async () => {
  console.log('\n--- behavioral bite checks (Outlook page + Gmail card) ---\n');
  await runBehavioral();
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nAll gate-run4-184 corpus checks passed.');
})();
