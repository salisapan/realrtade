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
const { FlowOwaParse } = require('../core/owa-parse.js');
const BITE_REF = '26ee0527';
function logGateRun4Bite(line, name, ruling) {
  console.log('Gate Run 4 bite: gate-run4-184-corpus.cjs:' + line + ' [' + name + '] | ruling: ' + ruling + ' | ref: ' + BITE_REF);
}
function outlookMessageIdSpellings(id) {
  const raw = String(id || '');
  const canon = FlowOwaParse.canonId(raw);
  const out = [];
  if (canon) out.push(canon);
  if (raw && raw !== canon) out.push(raw);
  return out;
}
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
check('display-copy has HE+EN To Do failed after draft warning',
  D.outlookTodoFailedAfterDraftLine('he').indexOf('טיוטה') >= 0 &&
  /draft is ready/i.test(D.outlookTodoFailedAfterDraftLine('en')));
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
  const outlookPath = path.join(ROOT, 'src/content-outlook.js');
  function patchOutlook(mutator) {
    return mutator(fs.readFileSync(outlookPath, 'utf8'));
  }
  function reprobeDisabledSrc(src) {
    return src.replace(
      'if (attachmentsUnread && !owaHarnessFlag(\'disableUnreadReprobe\')) {',
      'if (attachmentsUnread && false) {'
    );
  }
  function unreadHandlerRemovedSrc(src) {
    return src.replace(
      /\} else if \(decided && decided\.attachmentsUnread\) \{[\s\S]*?\} else if \(decided && decided\.reason === 'page:attachment-count-unread' && !decided\.intent\) \{/,
      '} else if (decided && decided.reason === \'page:attachment-count-unread\' && !decided.intent) {'
    );
  }
  function mutateFnSpellsRawOnly(src, fnName) {
    const needle = 'async function ' + fnName;
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const nextFn = src.indexOf('\n  async function ', start + needle.length);
    const end = nextFn > start ? nextFn : src.length;
    const chunk = src.slice(start, end).replace(/const spells = owaHarnessIdSpells\((\w+)\);/g, (_, v) => 'const spells = [String(' + v + ' || "")];');
    return src.slice(0, start) + chunk + src.slice(end);
  }
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

  const F3_URL = GATE_CONV;
  const F3_RAW_MSG = 'AQMkADBm/j3F3Plus+Underscore_Spelling==';
  const F3_GRAPH_MSG = FlowOwaParse.canonId(F3_RAW_MSG);
  const f3AttachStubAccepts = (asked, acceptId) => String(asked || '') === String(acceptId || '');
  logGateRun4Bite('211-235', 'F3 attachments GET idSpellings vs Graph-only stub', 'CTO item 4 F3: attachment list must try REST spelling, not raw URL id only');
  check('F3 counterfactual: single encodeURIComponent on raw URL id does not hit Graph-only attachment stub',
    F3_RAW_MSG !== F3_GRAPH_MSG && !f3AttachStubAccepts(F3_RAW_MSG, F3_GRAPH_MSG),
    { raw: F3_RAW_MSG.slice(0, 40), graph: F3_GRAPH_MSG.slice(0, 40) });
  check('F3 idSpellings reaches Graph-only attachment stub',
    outlookMessageIdSpellings(F3_RAW_MSG).some((s) => f3AttachStubAccepts(s, F3_GRAPH_MSG)),
    { spells: outlookMessageIdSpellings(F3_RAW_MSG).map((s) => s.slice(0, 36)) });
  const f3Signed = 'Attached is the signed NDA. Please save it to OneDrive.';
  const f3Dom = (h) => gateHtml(f3Signed)(h).replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-0935-signed-NDA.pdf" data-size="1024"></div');
  const f3Thread = [{ id: F3_GRAPH_MSG, conversationId: F3_GRAPH_MSG, subject: 'Gate Run 4', isDraft: false, hasAttachments: true,
    from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: new Date().toISOString(), body: { contentType: 'text', content: f3Signed } }];
  const f3PathOpts = {
    htmlPatch: f3Dom, mailBody: f3Signed,
    urlId: F3_URL, listedConversationId: F3_URL,
    messageId: F3_RAW_MSG, attachmentGraphMessageId: F3_GRAPH_MSG,
    pathRestHit: true, pathRestId: F3_RAW_MSG, pathRestGraphId: F3_RAW_MSG,
    gateAttachments: true, attachmentsGraphIdOnly: true, waitMs: 4500
  };
  const f3Page = await runPage(Object.assign({}, gateBase, f3PathOpts));
  const f3ConvOpts = {
    htmlPatch: f3Dom, mailBody: f3Signed,
    urlId: F3_RAW_MSG, listedConversationId: F3_RAW_MSG,
    messageId: F3_GRAPH_MSG, attachmentGraphMessageId: F3_GRAPH_MSG,
    threadMessages: f3Thread, pathRestMisses: 99,
    convFilterGraphIdOnly: true, convFilterAcceptId: F3_GRAPH_MSG,
    gateAttachments: true, attachmentsGraphIdOnly: true, waitMs: 4500
  };
  const f3Kinds = ((f3Page.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const f3StepKinds = f3Kinds && f3Kinds.steps && f3Kinds.steps.map((s) => s.kind);
  check('F3 behavioral: attachments GET via idSpellings shows file card when stub accepts only Graph message id',
    Boolean(f3Page.chip) && /OneDrive|Do It/.test(String(f3Page.chip.textContent || '')) &&
    f3StepKinds && f3StepKinds.indexOf('onedriveFile') >= 0,
    { text: f3Page.chip && f3Page.chip.textContent, kinds: f3StepKinds });
  const f3ConvMut = await runPage(Object.assign({}, gateBase, f3ConvOpts, {
    contentOutlookSrc: patchOutlook((src) => mutateFnSpellsRawOnly(src, 'messageIdForConversation'))
  }));
  const f3ConvKinds = ((f3ConvMut.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const f3ConvStepKinds = f3ConvKinds && f3ConvKinds.steps && f3ConvKinds.steps.map((s) => s.kind);
  check('F3 mutation messageIdForConversation raw-only: file card missing (idSpellings required)',
    !(f3ConvMut.chip && /OneDrive|Do It/.test(String(f3ConvMut.chip.textContent || ''))) ||
    !f3ConvStepKinds || f3ConvStepKinds.indexOf('onedriveFile') < 0,
    { text: f3ConvMut.chip && f3ConvMut.chip.textContent, kinds: f3ConvStepKinds });
  const f3AttachMut = await runPage(Object.assign({}, gateBase, f3PathOpts, {
    contentOutlookSrc: patchOutlook((src) => mutateFnSpellsRawOnly(src, 'attachmentListFor'))
  }));
  const f3AttachKinds = ((f3AttachMut.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const f3AttachStepKinds = f3AttachKinds && f3AttachKinds.steps && f3AttachKinds.steps.map((s) => s.kind);
  check('F3 mutation attachmentListFor raw-only: file card missing (idSpellings required)',
    !(f3AttachMut.chip && /OneDrive|Do It/.test(String(f3AttachMut.chip.textContent || ''))) ||
    !f3AttachStepKinds || f3AttachStepKinds.indexOf('onedriveFile') < 0,
    { text: f3AttachMut.chip && f3AttachMut.chip.textContent, kinds: f3AttachStepKinds });
  check('keepActiveDraftReceipt uses getActiveOutlookReceipts only (no raw log scan)',
    /getActiveOutlookReceipts\(\)/.test(outlookSrc) &&
    !/keepActiveDraftReceipt[\s\S]{0,400}\(bag && bag\.log\)/.test(outlookSrc));
  const { FlowStorage } = require('../src/storage.js');
  const getActiveOutlookReceiptsFrom = FlowStorage.getActiveOutlookReceiptsFrom;
  const pinLog = [
    { kind: 'written', messageId: 'mix', connectorId: 'outlookDraft', ref: 'd1', ts: 100, outlookReceipt: true },
    { kind: 'written', messageId: 'mix', connectorId: 'outlookDraft', ref: 'd2', ts: 200, outlookReceipt: true }
  ];
  const slotPin = getActiveOutlookReceiptsFrom({ log: pinLog });
  check('storage receiptSlotKey keeps newest draft per message (slot key pinned in storage.js)',
    slotPin.length === 1 && slotPin[0].ref === 'd2',
    { slot: slotPin });

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

  const todoWarnHe = D.outlookTodoFailedAfterDraftLine('he');
  logGateRun4Bite('244-262', 'mixed Do It draft ok To Do fail receipt warning', 'CTO item 6: warning line EN+HE on receipt when To Do write fails after draft');
  const mixedTodoFail = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-todo-fail',
    waitMs: 4500, clickDoIt: true, outlookTaskWriteFail: true,
    store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [HME] } }
  });
  const mixFailActs = mixedTodoFail.sent.filter((m) => m.type === 'flow:execute-action');
  const mixFailChip = mixedTodoFail.chip ? String(mixedTodoFail.chip.textContent || '') : '';
  const mixFailHost = mixedTodoFail.chip && mixedTodoFail.chip.querySelector('.flow-chip-host-inner, .flow-chip');
  const mixFailWritten = mixFailHost ? String(mixFailHost.textContent || '') : mixFailChip;
  check('(A2) mixed Do It: draft write succeeds, To Do fails — receipt shows task-not-created warning',
    mixFailActs.some((m) => m.payload && m.payload.connectorId === 'outlookDraft') &&
    mixFailActs.some((m) => m.payload && m.payload.connectorId === 'outlookTask') &&
    (mixFailChip.indexOf(todoWarnHe) >= 0 || mixFailWritten.indexOf(todoWarnHe) >= 0 ||
      /To Do task wasn't created/i.test(mixFailChip) || /To Do task wasn't created/i.test(mixFailWritten)),
    { acts: mixFailActs.map((m) => m.payload && m.payload.connectorId), text: mixFailChip.slice(0, 280) });
  const todoWarnEn = D.outlookTodoFailedAfterDraftLine('en');
  const mixedTodoFailEn = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-todo-fail-en',
    waitMs: 4500, clickDoIt: true, outlookTaskWriteFail: true, uiLang: 'en-US',
    store: { glanceUiLanguage: 'en', outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [HME] } }
  });
  const enChip = mixedTodoFailEn.chip ? String(mixedTodoFailEn.chip.textContent || '') : '';
  check('(A2-EN) To Do fail after draft shows EN warning on EN UI page',
    /To Do task wasn't created/i.test(enChip) && /draft is ready/i.test(enChip),
    { text: enChip.slice(0, 280), expected: todoWarnEn });
  const mixedTodoUndoFail = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-h1-todo-undo-fail',
    waitMs: 4500, clickDoIt: true, clickUndo: true,
    outlookTaskUndoFail: true,
    store: { outlookAuth: { token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: ['Tasks.ReadWrite', 'Mail.ReadWrite'] }, account: { address: ME }, ownAddresses: [HME] } }
  });
  const undoFailText = mixedTodoUndoFail.chip ? String(mixedTodoUndoFail.chip.textContent || '') : '';
  const undoFailDraftCalls = mixedTodoUndoFail.sent.filter((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookDraft');
  check('(A2-undo) failed task Undo leaves draft receipt and does not call draft Undo',
    mixedTodoUndoFail.sent.some((m) => m.type === 'flow:undo-action' && m.connectorId === 'outlookTask') &&
    undoFailDraftCalls.length === 0 &&
    (/Reply draft ready|Draft ready|טיוטה/.test(undoFailText) || mixedTodoUndoFail.chip.querySelector('.flow-chip-undo')),
    { text: undoFailText.slice(0, 280), undos: mixedTodoUndoFail.sent.filter((m) => m.type === 'flow:undo-action').map((m) => m.connectorId) });

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
  const todoInReceipt = /To Do|משימה|Reply requested|הוצעה/.test(reloadText);
  check('H1 reload: one receipt shows draft + To Do in receipt text (not Handled-only To Do)',
    Boolean(h1Reload.chip) &&
    /Draft ready|Reply draft ready|טיוטה/.test(reloadText) &&
    todoInReceipt &&
    reloadWritten.some((e) => e.connectorId === 'outlookDraft') &&
    reloadWritten.some((e) => e.connectorId === 'outlookTask'),
    { text: reloadText.slice(0, 240), written: reloadWritten.map((e) => e.connectorId) });
  console.log('H1 parity bite: gate-run4-184-corpus.cjs:375-381 [H1 reload receipt text] | before: Handled-only / log-only To Do | after: draft+To Do in DOM receipt (incl. טיוטה) | CTO parity e456 item1');
  const heldDraftStore = JSON.parse(JSON.stringify(h1Done.store));
  const otherInvoice = await runPage({
    htmlPatch: (h) => gateHtml('Please send the October invoice by Friday.')(h),
    mailBody: 'Please send the October invoice by Friday.',
    urlId: GATE_CONV + '-OTHER', listedConversationId: GATE_CONV + '-OTHER', messageId: 'MSG-OTHER-INVOICE',
    listedSubject: 'Invoice for October', waitMs: 4500,
    store: heldDraftStore
  });
  const otherText = otherInvoice.chip ? String(otherInvoice.chip.textContent || '') : '';
  const otherHasDo = otherInvoice.chip && (otherInvoice.chip.querySelector('.do-halo') || otherInvoice.chip.querySelector('button.flow-chip'));
  check('N1: held draft on another mail does not show that draft receipt or Undo',
    otherHasDo && !otherInvoice.chip.querySelector('.flow-chip-undo') &&
    !/Reply draft ready|Draft ready/.test(otherText),
    { text: otherText.slice(0, 200), why: (otherInvoice.store.outlookPageDiag || []).map((d) => d.reason) });
  const sameSubjOtherId = await runPage({
    htmlPatch: (h) => gateHtml('Please send the October invoice by Friday.')(h).replace('Invoice for October', 'Invoice for October'),
    mailBody: 'Please send the October invoice by Friday.',
    urlId: GATE_CONV + '-OTHER2', listedConversationId: GATE_CONV + '-OTHER2', messageId: 'MSG-OTHER-INVOICE-2',
    listedSubject: 'Invoice for October', waitMs: 4500,
    store: heldDraftStore
  });
  const sameSubjText = sameSubjOtherId.chip ? String(sameSubjOtherId.chip.textContent || '') : '';
  check('N1: same subject different ids still shows Do It (not held draft receipt)',
    sameSubjOtherId.chip && (sameSubjOtherId.chip.querySelector('.do-halo') || sameSubjOtherId.chip.querySelector('button.flow-chip')) &&
    !sameSubjOtherId.chip.querySelector('.flow-chip-undo') &&
    !/Reply draft ready/.test(sameSubjText),
    { text: sameSubjText.slice(0, 200) });
  const heldSubj = 'Gate Run 4';
  const sameSubjAsHeld = await runPage({
    htmlPatch: (h) => gateHtml('Please send the October invoice by Friday.')(h),
    mailBody: 'Please send the October invoice by Friday.',
    urlId: GATE_CONV + '-HELD-SUBJ', listedConversationId: GATE_CONV + '-HELD-SUBJ', messageId: 'MSG-SAME-SUBJ-AS-HELD',
    listedSubject: heldSubj, waitMs: 4500,
    store: heldDraftStore
  });
  const sameSubjHeldText = sameSubjAsHeld.chip ? String(sameSubjAsHeld.chip.textContent || '') : '';
  check('N1: other mail with same subject as held draft (different ids) shows Do It not draft receipt',
    sameSubjAsHeld.chip && (sameSubjAsHeld.chip.querySelector('.do-halo') || sameSubjAsHeld.chip.querySelector('button.flow-chip')) &&
    !sameSubjAsHeld.chip.querySelector('.flow-chip-undo') &&
    !/Reply draft ready|Draft ready|טיוטה מוכנה/.test(sameSubjHeldText),
    { text: sameSubjHeldText.slice(0, 200) });
  const subjectOnlySrc = patchOutlook((src) => src.replace(
    'return want.some((w) => have.some((h) => sameExchangeId(w, h)));',
    'const subj = String((pane && pane.subject) || "").trim(); const rowSubj = String(row.subject || "").trim(); if (subj && rowSubj && subj === rowSubj) return true; return want.some((w) => have.some((h) => sameExchangeId(w, h)));'
  ));
  const subjectLeak = await runPage({
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: GATE_CONV + '-HELD-SUBJ', listedConversationId: GATE_CONV + '-HELD-SUBJ', messageId: 'MSG-SUBJ-MUT',
    listedSubject: heldSubj, waitMs: 4500,
    store: heldDraftStore,
    contentOutlookSrc: subjectOnlySrc
  });
  const subjectLeakText = subjectLeak.chip ? String(subjectLeak.chip.textContent || '') : '';
  check('N1 bite: subject-only draftMatchesPane leaks receipt onto same-subject mail (mutation must fail)',
    /Reply draft ready|Draft ready|טיוטה מוכנה/.test(subjectLeakText) && subjectLeak.chip && subjectLeak.chip.querySelector('.flow-chip-undo'),
    { text: subjectLeakText.slice(0, 200) });
  const pilotBody = 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week?\n\nThanks,\nFlow team';
  const attachUnreadGate = Object.assign({}, gateBase, {
    htmlPatch: (h) => gateHtml(pilotBody)(h).replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="pilot.pdf" data-size="1024"></div'),
    mailBody: pilotBody,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-row31',
    attachmentReads: 'fail', attachmentsUnread: true, waitMs: 4500
  });
  const row31HandlerOn = await runPage(Object.assign({}, attachUnreadGate, {
    harnessFlags: { forceAttachmentUnreadNone: true, disableUnreadReprobe: true }
  }));
  const row31HandlerOff = await runPage(Object.assign({}, attachUnreadGate, {
    harnessFlags: { forceAttachmentUnreadNone: true, disableUnreadReprobe: true },
    contentOutlookSrc: patchOutlook(unreadHandlerRemovedSrc)
  }));
  const row31OnProc = (row31HandlerOn.store.log || []).find((e) => e && e.kind === 'shown');
  const row31OffProc = (row31HandlerOff.store.log || []).find((e) => e && e.kind === 'shown');
  const row31OnSteps = row31OnProc && row31OnProc.process && row31OnProc.process.steps ? row31OnProc.process.steps.map((s) => s.kind) : [];
  const row31OffSteps = row31OffProc && row31OffProc.process && row31OffProc.process.steps ? row31OffProc.process.steps.map((s) => s.kind) : [];
  check('row 31 bite: removing :4840 unread handler drops reply+task when re-probe is off',
    row31OnSteps.some((k) => k === 'outlookDraft' || k === 'gmailDraft') && row31OnSteps.some((k) => k === 'outlookTask' || k === 'googleTask') &&
    (!row31OffSteps.some((k) => k === 'outlookTask' || k === 'googleTask') || !row31OffSteps.some((k) => k === 'outlookDraft' || k === 'gmailDraft')),
    { on: row31OnSteps, off: row31OffSteps, offWhy: (row31HandlerOff.store.outlookPageDiag || []).map((d) => d.reason) });
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
