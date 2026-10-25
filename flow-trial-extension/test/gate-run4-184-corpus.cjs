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
console.log('gate-run4-184 expectation edits (logged):');
console.log('  gate-run4-184-corpus.cjs:46-55 | restored behavioural display-copy rows (note-to-self HE+EN, OneDrive reconnect HE+EN, To Do failed-after-draft HE+EN) | ruling: #184 verify copy rows');
console.log('  gate-run4-184-corpus.cjs:238-262 | before: note-to-self with-task allowed מוצע fallback | after: exact D.noteToSelfLine only + paint bite | ruling: @9204196e');
console.log('  gate-run4-184-corpus.cjs:362-364 | before: keepActiveDraftReceipt regex on outlookSrc | after: storage slot pin row only | ruling: #184 verify');
console.log('  gate-run4-184-corpus.cjs:526-528 | before: N1 bite hard-coded subject Gate Run 4 | after: pane subject === row.subject | ruling: #184 verify generic N1');
console.log('  gate-run4-184-corpus.cjs:487/501/516/534 | before: pathRestGraphId FlowOwaParse.canonId(...) | after: literal REST ids | ruling: #184 F2b');
console.log('  gate-run4-184-corpus.cjs (addon) | before: reply identity rows deleted | after: re-added in gate-184-verifier-addon.cjs | ruling: #184 verify');
check('mergeCount uses DOM when Graph list is null',
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).count === 2 &&
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).unread === true);
check('display-copy has HE+EN attachments-not-read',
  D.attachmentsNotReadLine('he').indexOf('לא הצלחתי') >= 0 && /Could not read/.test(D.attachmentsNotReadLine('en')));
check('display-copy has HE+EN reply-target-unsure fail-closed',
  D.whyNotShownLine('page:reply-target-unsure', 'he').indexOf('לא נוצרה') >= 0 &&
  /nothing was drafted/i.test(D.whyNotShownLine('page:reply-target-unsure', 'en')));
check('display-copy has HE+EN note-to-self short and task-suggested',
  D.noteToSelfLine('he').indexOf('ממך') >= 0 && D.noteToSelfLine('he').indexOf('הוצעה') < 0 &&
  D.noteToSelfLine('he', { taskSuggested: true }).indexOf('הוצעה') >= 0 &&
  /From you to you/.test(D.noteToSelfLine('en')) && !/task was suggested/.test(D.noteToSelfLine('en')) &&
  /task was suggested/.test(D.noteToSelfLine('en', { taskSuggested: true })));
check('display-copy has HE+EN OneDrive reconnect',
  D.missingScopeLine('Files.ReadWrite', 'OneDrive', 'en').indexOf('OneDrive') >= 0 &&
  D.missingScopeLine('Files.ReadWrite', 'וואן־דרייב', 'he').indexOf('וואן') >= 0);
check('display-copy has HE+EN To Do failed after draft warning',
  D.outlookTodoFailedAfterDraftLine('he').indexOf('טיוטה') >= 0 &&
  /draft is ready/i.test(D.outlookTodoFailedAfterDraftLine('en')));

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

async function runBehavioral(opts) {
  const addonOnly = opts && opts.addonOnly;
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
  const outlookSrc = fs.readFileSync(outlookPath, 'utf8');
  function patchOutlook(mutator) {
    return mutator(outlookSrc);
  }
  function reprobeFinalDisabledSrc(src) {
    return src.replace(
      '    if (attachmentsUnread) {\n      const reprobe = unreadAttachmentReprobe();\n      if (reprobe) return reprobe;\n    }\n    return { none: true, reason: (r && r.reason) || \'intent-null\'',
      '    if (attachmentsUnread && false) {\n      const reprobe = unreadAttachmentReprobe();\n      if (reprobe) return reprobe;\n    }\n    return { none: true, reason: (r && r.reason) || \'intent-null\''
    );
  }
  function reprobeShowBranchDisabledSrc(src) {
    const block = 'if (fileDroppedForUnread && attachmentsUnread) {\n        const reprobe = unreadAttachmentReprobe();\n        if (reprobe) return reprobe;\n        return { none: true, reason: \'page:attachment-count-unread\', attachmentsUnread: true };\n      }';
    const stripped = 'if (fileDroppedForUnread && attachmentsUnread) {\n        return { none: true, reason: \'page:attachment-count-unread\', attachmentsUnread: true };\n      }';
    return src.includes(block) ? src.replace(block, stripped) : src;
  }
  function silentUnreadDropSrc(src) {
    return src.replace(
      'if (fileDroppedForUnread && attachmentsUnread) {',
      'if (fileDroppedForUnread && attachmentsUnread) { return { none: true, reason: \'intent-null\' }; if (false) {'
    );
  }
  function graphFetches(sent) {
    return (sent || []).filter((m) => m && m.type === 'flow:outlook-fetch').map((m) => String(m.url || ''));
  }
  function graphEndpointSummary(sent) {
    const urls = graphFetches(sent).map((u) => decodeURIComponent(u));
    const convFilter = urls.filter((u) => /conversationId eq/.test(u)).length;
    const inboxList = urls.filter((u) => /mailFolders\/inbox\/messages/.test(u)).length;
    const attachments = urls.filter((u) => /\/attachments/.test(u));
    const fromSearch = urls.filter((u) => /\/me\/messages\?\$filter=.*from\//.test(u) || (/\/me\/messages\?\$filter=/.test(u) && /from\//.test(u))).length;
    return { total: urls.length, convFilter, inboxList, fromSearch, attachments: attachments.length, urls };
  }
  function row31MixedUnreadCard(page) {
    const proc = (page.store.log || []).find((e) => e && e.kind === 'shown');
    const steps = proc && proc.process && proc.process.steps ? proc.process.steps.map((s) => s.kind) : [];
    const chip = page.chip ? String(page.chip.textContent || '') : '';
    const hint = page.chip && page.chip.querySelector('.flow-chip-undo-hint');
    const hintText = hint ? String(hint.textContent || '') : '';
    const hasMix = steps.some((k) => k === 'outlookDraft' || k === 'gmailDraft') &&
      steps.some((k) => k === 'outlookTask' || k === 'googleTask');
    const hasLine = chip.indexOf(attachUnreadHe) >= 0 || hintText.indexOf(attachUnreadHe) >= 0;
    return hasMix && hasLine;
  }
  function f3SaveCard(page) {
    const kinds = ((page.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
    const steps = kinds && kinds.steps && kinds.steps.map((s) => s.kind);
    return Boolean(page.chip) && steps && steps.indexOf('onedriveFile') >= 0;
  }
  function mutateFnSpellsRawOnly(src, fnName) {
    const needle = 'async function ' + fnName;
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const nextFn = src.indexOf('\n  async function ', start + needle.length);
    const end = nextFn > start ? nextFn : src.length;
    const chunk = src.slice(start, end).replace(/const spells = idSpellings\((\w+)\);/g, (_, v) => 'const spells = [String(' + v + ' || "")];');
    return src.slice(0, start) + chunk + src.slice(end);
  }
  const attachUnreadHe = D.attachmentsNotReadLine('he');
  const GATE_CONV = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX/C+aXV';
  const GATE_CONV_REST = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX_C-aXV';
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
  const gateBasePathRest = Object.assign({}, gateBase, {
    pathRestHit: true, pathRestId: GATE_CONV, pathRestGraphId: GATE_CONV_REST, pathRestResponseId: 'M1'
  });
  const PATH_REST_OTHER = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX_C-aXV-OTHER';
  const PATH_REST_OTHER2 = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX_C-aXV-OTHER2';
  const PATH_REST_HELD_SUBJ = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEACS7fLEBJtdQIrOsX_C-aXV-HELD-SUBJ';
  const WRONG_TARGET_CONV_ADDON = GATE_CONV + '-WT2';
  const paneClockIsoAddon = FlowOwaParse.clockToIso('ג 06/10/2026 01:16') || '2026-10-05T22:16:00.000Z';
  const olderDtAddon = paneClockIsoAddon;
  const newerDtAddon = new Date(Date.parse(paneClockIsoAddon) + 3600e3).toISOString();
  const wtDateRowAddon = '\u05d2 06/10/2026 \u200f01:16';
  const contractEarly = 'Please sign the contract and return the appendix by Friday.';
  const attachDomEarly = (h) => gateHtml(contractEarly)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="a.pdf" data-size="1024"></div><div data-name="appendix.pdf" data-size="2048"></div');
  if (addonOnly) {
    await require('./gate-184-verifier-addon.cjs')({
      check, runPage, patchOutlook, gateBase, cleanStore, FROM, ME, HME, file, graphFetches,
      logGateRun4Bite, WRONG_TARGET_CONV: WRONG_TARGET_CONV_ADDON, olderDt: olderDtAddon, newerDt: newerDtAddon,
      paneClockIso: paneClockIsoAddon, wtDateRow: wtDateRowAddon, gateHtml,
      attachDom: attachDomEarly, contract: contractEarly, attachUnreadHe, F3_RAW_MSG: 'AQMkADBm/j3F3Plus+Underscore_Spelling==',
      F3_REST_MSG: 'AQMkADBm_j3F3Plus-Underscore_Spelling', GATE_CONV, FlowDisplay: D
    });
    return;
  }

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
  const noteSelfTaskLine = D.noteToSelfLine('he', { taskSuggested: true });
  const noteSelfTaskUi = selfHintText + selfChipText;
  check('(D) note-to-self with task row: full task-suggested line',
    Boolean(selfToSelf.chip) && selfHasTask &&
    noteSelfTaskUi.indexOf(noteSelfTaskLine) >= 0,
    { hint: selfHintText.slice(0, 200), text: selfChipText.slice(0, 200), kinds: selfStepKinds, note: noteSelfTaskLine });
  function noteSelfTaskMutedSrc(src) {
    const needle = 'paintNoteHint(painted, FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: hasTaskRow }));';
    const repl = 'paintNoteHint(painted, FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: false }));';
    return src.includes(needle) ? src.split(needle).join(repl) : src;
  }
  const selfToSelfMut = await runPage(Object.assign({
    htmlPatch: selfHtmlPatch(selfTask),
    mailBody: selfTask,
    graphFrom: { name: 'Sali', address: HME },
    urlId: GATE_CONV, listedConversationId: GATE_CONV, messageId: 'M-self-task-mut',
    waitMs: 4500,
    store: Object.assign({}, cleanStore, { glanceOwnNames: ['Sali'] })
  }, { contentOutlookSrc: patchOutlook(noteSelfTaskMutedSrc) }));
  const selfMutHint = selfToSelfMut.chip && selfToSelfMut.chip.querySelector('.flow-chip-note-hint');
  const selfMutUi = (selfMutHint ? String(selfMutHint.textContent || '') : '') +
    (selfToSelfMut.chip ? String(selfToSelfMut.chip.textContent || '') : '');
  const selfMutPatch = patchOutlook(noteSelfTaskMutedSrc) !== outlookSrc;
  check('(D) note-to-self bite: muting task-suggested line fails with-task row',
    selfMutPatch && Boolean(selfToSelf.chip) && selfHasTask &&
    noteSelfTaskUi.indexOf(noteSelfTaskLine) >= 0 &&
    selfMutUi.indexOf(noteSelfTaskLine) < 0,
    { patch: selfMutPatch, mutUi: selfMutUi.slice(0, 200) });

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

  const imm = await runPage(Object.assign({}, gateBasePathRest, {
    pathRestNeedsImmutable: true, pathRestHit: true, pathRestId: GATE_CONV, pathRestGraphId: GATE_CONV_REST, pathRestResponseId: 'M1', waitMs: 4500
  }));
  const immKinds = ((imm.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const immStepKinds = immKinds && immKinds.steps && immKinds.steps.map((s) => s.kind);
  check('(b) ImmutableId-only Graph: file card shows (OneDrive save)',
    Boolean(imm.chip) && /OneDrive|Do It/.test(String(imm.chip.textContent || '')) &&
    immStepKinds && immStepKinds.indexOf('onedriveFile') >= 0,
    { text: imm.chip && imm.chip.textContent, kinds: immStepKinds });

  const F3_URL = GATE_CONV;
  const F3_RAW_MSG = 'AQMkADBm/j3F3Plus+Underscore_Spelling==';
  const F3_REST_MSG = 'AQMkADBm_j3F3Plus-Underscore_Spelling';
  const F3_GRAPH_MSG = F3_REST_MSG;
  const f3PaneIso = FlowOwaParse.clockToIso('ג 06/10/2026 01:16') || '2026-10-05T22:16:00.000Z';
  const f3AttachStubAccepts = (asked, acceptId) => String(asked || '') === String(acceptId || '');
  logGateRun4Bite('211-235', 'F3 attachment GET REST id', 'stub accepts only hard-coded REST id; EWS URL spelling 400');
  check('F3 counterfactual: raw EWS URL id is not the Graph REST attachment id',
    F3_RAW_MSG !== F3_REST_MSG && !f3AttachStubAccepts(F3_RAW_MSG, F3_REST_MSG),
    { raw: F3_RAW_MSG.slice(0, 40), rest: F3_REST_MSG.slice(0, 40) });
  check('F3 idSpellings tries REST before raw EWS on the wire',
    outlookMessageIdSpellings(F3_RAW_MSG)[0] === F3_REST_MSG,
    { spells: outlookMessageIdSpellings(F3_RAW_MSG).map((s) => s.slice(0, 36)) });
  const f3PathBody = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
  const f3ConvBody = "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?";
  const f3PathDom = (h) => gateHtml(f3PathBody)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-0935-signed-NDA.pdf" data-size="1024"></div><div data-name="appendix.pdf" data-size="2048"></div>');
  const f3ConvDom = (h) => gateHtml(f3ConvBody)(h);
  const f3Thread = [{ id: F3_GRAPH_MSG, conversationId: GATE_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
    from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: f3PaneIso, body: { contentType: 'text', content: f3ConvBody } }];
  // F3 message URL: path-rest GET uses raw EWS once (stub 400); attachments use REST literal only.
  // contentOutlookSrc patches replace the whole module — they do not change this wire path unless
  // they alter messageIdFromPathRest / openPaneGraphMessageId routing before the attachment GET.
  const f3PathOpts = {
    htmlPatch: f3PathDom, mailBody: f3PathBody,
    urlId: F3_URL, listedConversationId: F3_URL,
    messageId: F3_RAW_MSG, attachmentGraphMessageId: F3_REST_MSG, attachmentsGraphEwsId: F3_RAW_MSG,
    pathRestHit: true, pathRestId: F3_RAW_MSG, pathRestGraphId: F3_REST_MSG,
    gateAttachments: true, attachmentsGraphIdOnly: true, waitMs: 4500
  };
  const f3Page = await runPage(Object.assign({}, gateBase, f3PathOpts, {
    urlId: F3_RAW_MSG,
    listedConversationId: GATE_CONV,
    pathRestId: F3_RAW_MSG,
    attachmentFiles: [file]
  }));
  const f3DriveFile = { id: 'drive-q4', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' };
  const f3ConvOpts = {
    htmlPatch: f3ConvDom, mailBody: f3ConvBody,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, listedSubject: 'Gate Run 4',
    messageId: F3_GRAPH_MSG, driveFiles: [f3DriveFile], pathRestHit: false, pathRestMisses: 2, inboxLookupEmpty: true,
    threadMessages: f3Thread,
    waitMs: 6000, store: { glanceOutlookFileTrace: 1 }
  };
  console.log('Gate Run 4 bite: gate-run4-184-corpus.cjs:273-295 [F3 conv path] | before: inbox fallback masked filter-only gap | after: inboxLookupEmpty + conv filter Graph spelling + control row | CTO item 4 F3');
  const f3ConvPage = await runPage(Object.assign({}, gateBase, f3ConvOpts));
  const f3ConvTraceLine = (f3ConvPage.logs || []).find((l) => String(l).indexOf('Glance: file-trace ') === 0) || '';
  let f3ConvTrace = null;
  try { f3ConvTrace = JSON.parse(f3ConvTraceLine.slice('Glance: file-trace '.length)); } catch (e) { f3ConvTrace = null; }
  check('F3 conv path control: conversation idSpellings resolve message and show file card',
    f3ConvTrace && f3ConvTrace.messageIdFrom === 'conversation-filter' &&
    f3ConvTrace.showFilePrepare === 'shown' && f3ConvTrace.final === 'prepare' &&
    Boolean(f3ConvPage.chip) && (f3ConvPage.chip.getAttribute('data-glance-chain') === 'prepare' ||
      /Do It|בצע/.test(String(f3ConvPage.chip.textContent || ''))),
    { text: f3ConvPage.chip && f3ConvPage.chip.textContent, trace: f3ConvTrace });
  const f3Kinds = ((f3Page.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const f3StepKinds = f3Kinds && f3Kinds.steps && f3Kinds.steps.map((s) => s.kind);
  const f3AttachUrls = graphFetches(f3Page.sent).filter((u) => /\/attachments/.test(u));
  const f3SpellOnWire = outlookMessageIdSpellings(F3_RAW_MSG).some((spell) =>
    f3AttachUrls.some((u) => decodeURIComponent(u).indexOf(spell) >= 0 || decodeURIComponent(u).indexOf(encodeURIComponent(spell)) >= 0));
  const f3ConvMut = await runPage(Object.assign({}, gateBase, f3ConvOpts, {
    contentOutlookSrc: patchOutlook((src) => mutateFnSpellsRawOnly(src, 'messageIdForConversation'))
  }));
  const f3ConvMutTraceLine = (f3ConvMut.logs || []).find((l) => String(l).indexOf('Glance: file-trace ') === 0) || '';
  let f3ConvMutTrace = null;
  try { f3ConvMutTrace = JSON.parse(f3ConvMutTraceLine.slice('Glance: file-trace '.length)); } catch (e) { f3ConvMutTrace = null; }
  check('F3 mutation messageIdForConversation raw-only: file card missing (idSpellings required)',
    !(f3ConvMut.chip && f3ConvMut.chip.getAttribute('data-glance-chain') === 'prepare' && /Do It/.test(String(f3ConvMut.chip.textContent || ''))) ||
    (f3ConvMutTrace && f3ConvMutTrace.messageIdFrom !== 'conversation-filter'),
    { text: f3ConvMut.chip && f3ConvMut.chip.textContent, trace: f3ConvMutTrace });
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
  const one = await runPage(Object.assign({}, gateBasePathRest, {
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
  const promiseOnly = 'האם תוכל לעדכן אותי לגבי החוזה עד יום ראשון?';
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
  (heldDraftStore.log || []).forEach((e) => {
    if (e && e.connectorId === 'outlookDraft') e.subject = 'Gate Run 4';
  });
  const otherInvoice = await runPage({
    htmlPatch: (h) => gateHtml('Please send the October invoice by Friday.')(h),
    mailBody: 'Please send the October invoice by Friday.',
    urlId: GATE_CONV + '-OTHER', listedConversationId: GATE_CONV + '-OTHER', messageId: 'MSG-OTHER-INVOICE',
    pathRestHit: true, pathRestId: GATE_CONV + '-OTHER', pathRestGraphId: PATH_REST_OTHER, pathRestResponseId: 'MSG-OTHER-INVOICE',
    listedSubject: 'Invoice for October', waitMs: 6000,
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
    pathRestHit: true, pathRestId: GATE_CONV + '-OTHER2', pathRestGraphId: PATH_REST_OTHER2, pathRestResponseId: 'MSG-OTHER-INVOICE-2',
    listedSubject: 'Invoice for October', waitMs: 6000,
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
    pathRestHit: true, pathRestId: GATE_CONV + '-HELD-SUBJ', pathRestGraphId: PATH_REST_HELD_SUBJ, pathRestResponseId: 'MSG-SAME-SUBJ-AS-HELD',
    listedSubject: heldSubj, waitMs: 6000,
    store: heldDraftStore
  });
  const sameSubjHeldText = sameSubjAsHeld.chip ? String(sameSubjAsHeld.chip.textContent || '') : '';
  check('N1: other mail with same subject as held draft (different ids) shows Do It not draft receipt',
    sameSubjAsHeld.chip && (sameSubjAsHeld.chip.querySelector('.do-halo') || sameSubjAsHeld.chip.querySelector('button.flow-chip')) &&
    !sameSubjAsHeld.chip.querySelector('.flow-chip-undo') &&
    !/Reply draft ready|Draft ready|טיוטה מוכנה/.test(sameSubjHeldText),
    { text: sameSubjHeldText.slice(0, 200) });
  const subjectOnlySrc = patchOutlook((src) => src.replace(
    'function draftMatchesPane(row, pane) {',
    'function draftMatchesPane(row, pane) {\n    const subjOnly = String((pane && pane.subject) || "").trim();\n    const rowSubj = String((row && row.subject) || "").trim();\n    if (row && row.connectorId === "outlookDraft" && subjOnly && rowSubj && subjOnly === rowSubj) return true;'
  ));
  const subjectLeak = await runPage({
    htmlPatch: (h) => gateHtml('Please send the October invoice by Friday.')(h),
    mailBody: 'Please send the October invoice by Friday.',
    urlId: GATE_CONV + '-HELD-SUBJ', listedConversationId: GATE_CONV + '-HELD-SUBJ', messageId: 'MSG-SUBJ-MUT',
    pathRestHit: true, pathRestId: GATE_CONV + '-HELD-SUBJ', pathRestGraphId: PATH_REST_HELD_SUBJ, pathRestResponseId: 'MSG-SUBJ-MUT',
    listedSubject: heldSubj, waitMs: 6000,
    store: heldDraftStore,
    contentOutlookSrc: subjectOnlySrc
  });
  const subjectLeakText = subjectLeak.chip ? String(subjectLeak.chip.textContent || '') : '';
  check('N1 bite: subject-only draftMatchesPane leaks receipt onto same-subject mail (mutation must fail)',
    /Reply draft ready|Draft ready|טיוטה מוכנה/.test(subjectLeakText) && subjectLeak.chip && subjectLeak.chip.querySelector('.flow-chip-undo'),
    { text: subjectLeakText.slice(0, 200) });
  const attachUnreadGate = {
    htmlPatch: attachDom, mailBody: contract,
    urlId: GATE_CONV, listedConversationId: GATE_CONV, listedSubject: 'Gate Run 4', messageId: 'M-row31',
    gateAttachments: true, attachmentFiles: twoFiles, attachmentReads: 'fail', attachmentsUnread: true,
    hasAttachments: true, waitMs: 4500
  };
  const row31SaveBody = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
  const row31SaveUnreadGate = Object.assign({}, attachUnreadGate, {
    mailBody: row31SaveBody,
    attachmentFiles: [file],
    htmlPatch: (h) => gateHtml(row31SaveBody)(h)
      .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-0935-signed-NDA.pdf" data-size="1024"></div>')
  });
  const row31Ctrl = await runPage(attachUnreadGate);
  const row31CtrlProc = (row31Ctrl.store.log || []).find((e) => e && e.kind === 'shown');
  const row31CtrlSteps = row31CtrlProc && row31CtrlProc.process && row31CtrlProc.process.steps ? row31CtrlProc.process.steps.map((s) => s.kind) : [];
  const row31CtrlChip = row31Ctrl.chip ? String(row31Ctrl.chip.textContent || '') : '';
  const row31CtrlHint = row31Ctrl.chip && row31Ctrl.chip.querySelector('.flow-chip-undo-hint');
  const row31CtrlHintText = row31CtrlHint ? String(row31CtrlHint.textContent || '') : '';
  console.log('Gate Run 4 bite: gate-run4-184-corpus.cjs:537-620 [reprobe + silent] | scenario: attachUnreadGate only; bite = same scenario + outlook patch | CTO item 6e');
  check('row 31 control: unread attachments show reply draft and To Do steps',
    row31MixedUnreadCard(row31Ctrl),
    { kinds: row31CtrlSteps, hint: row31CtrlHintText });
  const reprobeFinalOnlyGate = Object.assign({}, attachUnreadGate, {
    mailBody: row31SaveBody,
    htmlPatch: (h) => gateHtml(row31SaveBody)(h),
    attachmentFiles: [file]
  });
  const reprobeUnreadSaveGate = row31SaveUnreadGate;
  const reprobeFinalCtrl = await runPage(reprobeFinalOnlyGate);
  const reprobeFinalOff = await runPage(Object.assign({}, reprobeFinalOnlyGate, {
    contentOutlookSrc: patchOutlook(reprobeFinalDisabledSrc)
  }));
  logGateRun4Bite('556-565', 'reprobe final', 'row31SaveUnreadGate only; patch disables final unread re-probe');
  check('reprobe bite: disabling final unread re-probe drops judged card vs same-scenario control',
    Boolean(reprobeFinalCtrl.chip) && !Boolean(reprobeFinalOff.chip),
    { ctrl: reprobeFinalCtrl.chip && reprobeFinalCtrl.chip.textContent, mut: reprobeFinalOff.chip && reprobeFinalOff.chip.textContent });
  const reprobeFinalNoOp = await runPage(Object.assign({}, reprobeFinalOnlyGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  check('reprobe final bite: identity outlook patch does not satisfy bite',
    !(Boolean(reprobeFinalCtrl.chip) && !Boolean(reprobeFinalNoOp.chip)),
    { ctrl: Boolean(reprobeFinalCtrl.chip), noop: Boolean(reprobeFinalNoOp.chip) });
  const reprobeShowCtrl = await runPage(reprobeUnreadSaveGate);
  const reprobeShowOff = await runPage(Object.assign({}, reprobeUnreadSaveGate, {
    contentOutlookSrc: patchOutlook(reprobeShowBranchDisabledSrc)
  }));
  logGateRun4Bite('566-575', 'reprobe r.show branch', 'row31SaveUnreadGate only; patch disables show-branch re-probe');
  function reprobeJudgedShown(page) {
    const sh = (page.store.log || []).find((e) => e && e.kind === 'shown');
    return Boolean(sh && sh.process && sh.intent);
  }
  const showPatchApplied = patchOutlook(reprobeShowBranchDisabledSrc) !== outlookSrc;
  check('reprobe bite: disabling r.show file-dropped re-probe drops judged card vs same-scenario control',
    showPatchApplied && reprobeJudgedShown(reprobeShowCtrl) && !reprobeJudgedShown(reprobeShowOff),
    { patch: showPatchApplied, ctrlShown: reprobeJudgedShown(reprobeShowCtrl), mutShown: reprobeJudgedShown(reprobeShowOff),
      ctrl: reprobeShowCtrl.chip && reprobeShowCtrl.chip.textContent, mut: reprobeShowOff.chip && reprobeShowOff.chip.textContent });
  const reprobeShowNoOp = await runPage(Object.assign({}, reprobeUnreadSaveGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  check('reprobe show-branch bite: identity outlook patch does not satisfy bite',
    !(showPatchApplied && reprobeJudgedShown(reprobeShowCtrl) && !reprobeJudgedShown(reprobeShowNoOp)),
    { ctrl: reprobeJudgedShown(reprobeShowCtrl), noop: reprobeJudgedShown(reprobeShowNoOp) });
  const silentUnreadCtrl = await runPage(row31SaveUnreadGate);
  const silentCtrlWhy = (silentUnreadCtrl.store.outlookPageDiag || []).map((d) => d.reason);
  const silentCtrlChip = silentUnreadCtrl.chip ? String(silentUnreadCtrl.chip.textContent || '') : '';
  check('silent control: unread file-drop still shows card with attachments-not-read (not intent-null)',
    Boolean(silentUnreadCtrl.chip) && silentCtrlChip.indexOf(attachUnreadHe) >= 0 &&
    !silentCtrlWhy.some((r) => r === 'page:intent-null' || r === 'intent-null'),
    { text: silentCtrlChip.slice(0, 200), why: silentCtrlWhy });
  const silentMut = await runPage(Object.assign({}, row31SaveUnreadGate, {
    contentOutlookSrc: patchOutlook(silentUnreadDropSrc)
  }));
  const silentMutWhy = (silentMut.store.outlookPageDiag || []).map((d) => d.reason);
  const silentMutChip = silentMut.chip ? String(silentMut.chip.textContent || '') : '';
  logGateRun4Bite('576-592', 'silent unread drop', 'same attachUnreadGate; patch forces intent-null on file-drop');
  check('silent bite: silent unread file-drop loses card or attachments-not-read line vs control',
    Boolean(silentUnreadCtrl.chip) && silentCtrlChip.indexOf(attachUnreadHe) >= 0 &&
    (!Boolean(silentMut.chip) || silentMutChip.indexOf(attachUnreadHe) < 0 ||
      silentMutWhy.some((r) => r === 'page:intent-null' || r === 'intent-null')),
    { text: silentMutChip.slice(0, 200), why: silentMutWhy, ctrlWhy: silentCtrlWhy });
  const silentNoOp = await runPage(Object.assign({}, row31SaveUnreadGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const silentNoOpChip = silentNoOp.chip ? String(silentNoOp.chip.textContent || '') : '';
  const silentNoOpWhy = (silentNoOp.store.outlookPageDiag || []).map((d) => d.reason);
  check('silent bite: identity outlook patch does not satisfy bite',
    !(Boolean(silentUnreadCtrl.chip) && silentCtrlChip.indexOf(attachUnreadHe) >= 0 &&
      (!Boolean(silentNoOp.chip) || silentNoOpChip.indexOf(attachUnreadHe) < 0 ||
        silentNoOpWhy.some((r) => r === 'page:intent-null' || r === 'intent-null'))),
    { ctrlLine: silentCtrlChip.indexOf(attachUnreadHe) >= 0, noopLine: silentNoOpChip.indexOf(attachUnreadHe) >= 0 });
  const WRONG_TARGET_CONV = GATE_CONV + '-WT2';
  const paneClockIso = FlowOwaParse.clockToIso('ג 06/10/2026 01:16') || '2026-10-05T22:16:00.000Z';
  const olderDt = paneClockIso;
  const newerDt = new Date(Date.parse(paneClockIso) + 3600e3).toISOString();
  const wtSaveBody = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
  const wtDriveBody = "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?";
  const wtDateRow = '\u05d2 06/10/2026 \u200f01:16';
  const wtDom = (h) => gateHtml(wtSaveBody)(h)
    .replace('id="ReadingPaneContainerId"', 'id="ReadingPaneContainerId"><div data-name="Gate-OLDER-nda.pdf" data-size="1024"></div>')
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + olderDt + '"></time>')
    .replace('<div class="date">\u05d2 06/10/2026 01:16</div>',
      '<div class="date" data-received="' + olderDt + '">' + wtDateRow + '</div>');
  const wtOlderFile = { id: 'att-old', name: 'Gate-OLDER-nda.pdf', isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
  const wtNewerFile = { id: 'att-new', name: 'Gate-NEWER-nda.pdf', isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
  const wtThread = [
    { id: 'M-older', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: true,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: olderDt, body: { contentType: 'text', content: wtSaveBody } },
    { id: 'M-newer', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: true,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: newerDt, body: { contentType: 'text', content: 'Please save the NEW attachment to OneDrive.' } }
  ];
  function wtAttachReply(asked) {
    if (String(asked) === 'M-older') return { ok: true, status: 200, body: JSON.stringify({ value: [wtOlderFile] }) };
    if (String(asked) === 'M-newer') return { ok: true, status: 200, body: JSON.stringify({ value: [wtNewerFile] }) };
    return { ok: false, status: 404, body: '{}' };
  }
  const wtReplyBody = 'Can you confirm by October 9 whether we can proceed? Thanks';
  const soleNoClockDom = (h) => gateHtml(wtReplyBody)(h)
    .replace(/<div class="date">[\s\S]*?<\/div>/, '')
    .replace(/<time datetime="[^"]*"><\/time>/, '');
  const soleOlderRow = {
    id: 'M-newer', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
    from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: olderDt, bodyPreview: wtReplyBody,
    body: { contentType: 'text', content: wtReplyBody }
  };
  const soleNoClockGate = {
    htmlPatch: soleNoClockDom, mailBody: wtReplyBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    threadMessages: [soleOlderRow], pathRestMisses: 2, inboxLookupEmpty: true,
    store: Object.assign({}, cleanStore, { glanceOutlookFileTrace: 1 }),
    waitMs: 7000, clickDoIt: true
  };
  const soleNoClockDoIt = await runPage(soleNoClockGate);
  const soleNoClockActs = (soleNoClockDoIt.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload);
  const soleNoClockWhy = (soleNoClockDoIt.store.outlookPageDiag || []).map((d) => d.reason);
  logGateRun4Bite('soleNoClock', 'single Graph row, no pane clock', 'exact-or-unsure fail-closed');
  console.log('gate-run4-184 expectation: gate-run4-184-corpus.cjs:soleNoClock | before: save+attach sole M-older drafts | after: reply sole row fail-closed unsure | ruling: #184 delete sole rule');
  console.log('gate-run4-184 expectation: gate-run4-184-corpus.cjs:711-720 | before: drafts M-older | after: page:reply-target-unsure | ruling: #184 delete sole rule');
  check('sole conv-filter row without pane clock: Do It fails closed (exact-or-unsure)',
    !soleNoClockActs.some((m) => m.payload.connectorId === 'outlookDraft') &&
    soleNoClockWhy.some((r) => r === 'page:reply-target-unsure' || r === 'suggest:unresolved'),
    {
      connectors: soleNoClockActs.map((m) => m.payload.connectorId),
      chip: Boolean(soleNoClockDoIt.chip),
      vmb: soleNoClockDoIt.parsed && soleNoClockDoIt.parsed.visibleMessageBodies,
      why: soleNoClockWhy
    });
  const wtAttachBase = {
    htmlPatch: wtDom, mailBody: wtSaveBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt,
    threadMessages: wtThread, pathRestMisses: 2, inboxLookupEmpty: true,
    gateAttachments: true, hasAttachments: true, waitMs: 6000,
    store: Object.assign({}, cleanStore, { glanceOutlookFileTrace: 1 }),
    graphFetchReply: wtAttachReply
  };
  const wtCtrlThread = [
    { id: 'M-older', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: olderDt, body: { contentType: 'text', content: wtDriveBody } },
    { id: 'M-newer', conversationId: WRONG_TARGET_CONV, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: newerDt, body: { contentType: 'text', content: wtDriveBody } }
  ];
  const wtCtrlBase = {
    htmlPatch: (h) => gateHtml(wtDriveBody)(h),
    mailBody: wtDriveBody,
    urlId: WRONG_TARGET_CONV, listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    threadMessages: wtCtrlThread, pathRestHit: false, pathRestMisses: 2, inboxLookupEmpty: true,
    driveFiles: [{ id: 'drive-wt', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' }],
    waitMs: 6000,
    store: Object.assign({}, cleanStore, { glanceOutlookFileTrace: 1 })
  };
  console.log('Gate Run 4 bite: gate-run4-184-corpus.cjs:549-598 [wrong-target] | before: newest-from-sender + urlOnlyId | after: exact pane match + url-only gate | N1 class');
  const wtCtrl = await runPage(Object.assign({}, gateBase, wtCtrlBase));
  const wtAtt = graphFetches(wtCtrl.sent).filter((u) => /\/attachments/.test(u));
  const wtUsedOlder = wtAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0);
  const wtUsedNewer = wtAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtTraceLine = (wtCtrl.logs || []).find((l) => String(l).indexOf('Glance: file-trace ') === 0) || '';
  let wtTrace = null;
  try { wtTrace = JSON.parse(wtTraceLine.slice('Glance: file-trace '.length)); } catch (e) { wtTrace = null; }
  const wtChip = wtCtrl.chip ? String(wtCtrl.chip.textContent || '') : '';
  const wtGraphJson = wtTrace && wtTrace.graph ? JSON.stringify(wtTrace.graph) : '';
  check('wrong-target control: file prepare resolves open minute (conversation-filter) not newest attachment id',
    wtTrace && wtTrace.messageIdFrom === 'conversation-filter' &&
    wtGraphJson.indexOf('M-newer') < 0 &&
    (wtTrace.showFilePrepare === 'shown' || wtTrace.showFilePrepare === 'shown-without-message-id' || wtChip.indexOf(attachUnreadHe) >= 0),
    { att: wtAtt, trace: wtTrace, text: wtChip.slice(0, 200) });
  const wtProduct = await runPage(Object.assign({}, gateBase, wtAttachBase));
  const wtProdAtt = graphFetches(wtProduct.sent).filter((u) => /\/attachments/.test(u));
  const wtProdNewer = wtProdAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtProdOlder = wtProdAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0);
  logGateRun4Bite('649-656', 'wrong-target product older pane', 'unmodified product must not attach from newer same-sender message; fails on bfbdd757 urlOnlyId/newest');
  check('wrong-target product: open older message does not use newer attachments (bfbdd757 fails)',
    wtProdOlder && !wtProdNewer,
    { att: wtProdAtt });
  const WRONG_TARGET_CONV_REST = FlowOwaParse.canonId(WRONG_TARGET_CONV);
  function wtThreadForConv(convId) {
    return wtThread.map((m) => Object.assign({}, m, { conversationId: convId }));
  }
  async function wtAttachInboxBothRow(transportLabel, convId) {
    const thread = wtThreadForConv(convId);
    const base = Object.assign({}, gateBase, wtAttachBase, {
      urlId: convId, listedConversationId: convId,
      threadMessages: thread,
      inboxLookupEmpty: false,
      clickDoIt: true,
      waitMs: 8000
    });
    const page = await runPage(base);
    const shown = (page.store.log || []).find((e) => e && e.kind === 'shown');
    const att = graphFetches(page.sent).filter((u) => /\/attachments/.test(u));
    const olderAtt = att.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0);
    const exec = (page.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload);
    const draftAct = exec.find((m) => m.payload.connectorId === 'outlookDraft');
    const saveAct = exec.find((m) => /onedriveFile|driveFile|attachmentSave/i.test(String(m.payload.connectorId || '')));
    const saveBlob = saveAct ? JSON.stringify(saveAct.payload) : '';
    const kinds = shown && shown.process && shown.process.steps && shown.process.steps.map((s) => s.kind);
    logGateRun4Bite('wtAttachInboxBoth:' + transportLabel, 'inbox lists both; pane older minute', 'card M-older; Gate-OLDER attachment only');
    check('wtAttach inbox both ' + transportLabel + ': shown card M-older; Do It saves Gate-OLDER not M-newer',
      shown && shown.outlookIncomingId === 'M-older' && olderAtt &&
      kinds && kinds.indexOf('onedriveFile') >= 0 &&
      (!draftAct || draftAct.payload.outlookIncomingId === 'M-older') &&
      saveBlob.indexOf('Gate-OLDER') >= 0 && saveBlob.indexOf('Gate-NEWER') < 0,
      { id: shown && shown.outlookIncomingId, att, kinds, draft: draftAct && draftAct.payload.outlookIncomingId, save: saveBlob.slice(0, 200) });
    const skewThread = [
      Object.assign({}, thread[0], { receivedDateTime: new Date(Date.parse(paneClockIso) + 7 * 60 * 1000).toISOString() }),
      thread[1]
    ];
    const skewPage = await runPage(Object.assign({}, base, { threadMessages: skewThread, waitMs: 8000 }));
    const skewWhy = (skewPage.store.outlookPageDiag || []).map((d) => d.reason);
    const skewAtt = graphFetches(skewPage.sent).filter((u) => /\/attachments/.test(u));
    logGateRun4Bite('wtAttachInboxBothSkew:' + transportLabel, 'inbox both +7min skew', 'reply-target-unsure; no M-newer attachment');
    const skewExec = (skewPage.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload);
    check('wtAttach inbox both skew ' + transportLabel + ': reply-target-unsure; no Do It on M-newer',
      skewWhy.some((r) => r === 'page:reply-target-unsure') &&
      !skewExec.some((m) => m.payload.outlookIncomingId === 'M-newer'),
      { why: skewWhy, att: skewAtt, exec: skewExec.map((m) => m.payload.outlookIncomingId) });
    console.log('gate-run4-184 expectation: gate-run4-184-corpus.cjs:wtAttachInboxBothSkew:' + transportLabel + ' bite | before: exact pin | after: pin-revert alone | ruling: #184 fix B');
    const skewPinMut = await runPage(Object.assign({}, base, {
      threadMessages: skewThread, waitMs: 8000,
      contentOutlookSrc: patchOutlook(conversationIncomingIdPinDisabledSrc)
    }));
    const skewPinExec = (skewPinMut.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload);
    const skewPinAtt = graphFetches(skewPinMut.sent).filter((u) => /\/attachments/.test(u));
    const skewPinNewer = skewPinAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0) ||
      skewPinExec.some((m) => m.payload.outlookIncomingId === 'M-newer');
    const skewPinPatch = patchOutlook(conversationIncomingIdPinDisabledSrc) !== outlookSrc;
    check('wtAttach inbox both skew ' + transportLabel + ' bite: reverting pin alone allows M-newer on skew',
      skewPinPatch && skewPinNewer,
      { att: skewPinAtt, exec: skewPinExec.map((m) => m.payload.outlookIncomingId) });
    const skewPinNoOp = await runPage(Object.assign({}, base, {
      threadMessages: skewThread, waitMs: 8000,
      contentOutlookSrc: patchOutlook((s) => s)
    }));
    const skewPinNoOpExec = (skewPinNoOp.sent || []).filter((m) => m.type === 'flow:execute-action' && m.payload);
    const skewPinNoOpNewer = skewPinNoOpExec.some((m) => m.payload.outlookIncomingId === 'M-newer');
    check('wtAttach inbox both skew ' + transportLabel + ' bite: identity outlook patch does not satisfy bite',
      !(skewPinNoOpNewer && skewPinNewer),
      { mutNewer: skewPinNewer, noopNewer: skewPinNoOpNewer });
  }
  await wtAttachInboxBothRow('EWS', WRONG_TARGET_CONV);
  await wtAttachInboxBothRow('REST', WRONG_TARGET_CONV_REST);
  const bidiSubject = 'Gate Run 4\u200f';
  const bidiThread = wtThread.map((m, i) => (i === 0 ? Object.assign({}, m, { subject: bidiSubject }) : m));
  const bidiInbox = await runPage(Object.assign({}, gateBase, wtAttachBase, {
    listedSubject: bidiSubject,
    threadMessages: bidiThread,
    inboxLookupEmpty: false,
    waitMs: 7000
  }));
  const bidiShown = (bidiInbox.store.log || []).find((e) => e && e.kind === 'shown');
  const bidiAtt = graphFetches(bidiInbox.sent).filter((u) => /\/attachments/.test(u));
  logGateRun4Bite('wtAttachBidiSubject', 'U+200F in pane subject', 'exact minute still resolves M-older');
  check('wtAttach bidi subject mark: still resolves M-older with inbox listing both',
    bidiShown && bidiShown.outlookIncomingId === 'M-older' &&
    bidiAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0),
    { id: bidiShown && bidiShown.outlookIncomingId, att: bidiAtt });
  function newestOnlyResolveSrc(src) {
    const needle = 'async function messageIdForOpenPane(convId, own, openSender, pane) {';
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const nextFn = src.indexOf('\n  async function ', start + needle.length);
    const end = nextFn > start ? nextFn : src.length;
    let chunk = src.slice(start, end);
    const pickNeedle = 'const pickExactOnly = (list) => exactOpenMessageInList(list, pane, openSender);';
    if (chunk.indexOf(pickNeedle) >= 0) {
      chunk = chunk.replace(
        pickNeedle,
        'const known = await loadUserAddresses();\n      const pickExactOnly = (list) => Promise.resolve(newestOther(list, own, openSender, known));'
      );
    }
    const filterNeedle = 'const fromFilter = await exactOpenMessageInList(convList, pane, openSender);';
    if (chunk.indexOf(filterNeedle) >= 0) {
      chunk = chunk.replace(
        filterNeedle,
        'const knownFilter = await loadUserAddresses();\n          const fromFilter = newestOther(convList, own, openSender, knownFilter);'
      );
    }
    return src.slice(0, start) + chunk + src.slice(end);
  }
  const wtMut = await runPage(Object.assign({}, gateBase, wtAttachBase, {
    contentOutlookSrc: patchOutlook(newestOnlyResolveSrc)
  }));
  const wtMutAtt = graphFetches(wtMut.sent).filter((u) => /\/attachments/.test(u));
  const wtMutNewer = wtMutAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtMutChip = wtMut.chip ? String(wtMut.chip.textContent || '') : '';
  check('wrong-target bite: newest-from-sender resolution uses newer message attachments',
    wtMutNewer || (wtMutChip.indexOf('Gate-NEWER') >= 0 && wtMutChip.indexOf('Gate-OLDER') < 0),
    { att: wtMutAtt, text: wtMutChip.slice(0, 200) });
  const wtMutNoOp = await runPage(Object.assign({}, gateBase, wtAttachBase, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtMutNoOpAtt = graphFetches(wtMutNoOp.sent).filter((u) => /\/attachments/.test(u));
  const wtMutNoOpNewer = wtMutNoOpAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  check('wrong-target newest bite: identity outlook patch does not satisfy bite',
    !(wtMutNoOpNewer || (String(wtMutNoOp.chip && wtMutNoOp.chip.textContent || '').indexOf('Gate-NEWER') >= 0)),
    { newer: wtMutNoOpNewer, att: wtMutNoOpAtt });
  const wtConvOnlyNewerCtrl = await runPage(Object.assign({}, wtAttachBase, { threadMessages: [wtThread[1]] }));
  const wtConvOnlyNewerAtt = graphFetches(wtConvOnlyNewerCtrl.sent).filter((u) => /\/attachments/.test(u));
  const wtConvOnlyNewerHitNewer = wtConvOnlyNewerAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtConvOnlyNewerChip = wtConvOnlyNewerCtrl.chip ? String(wtConvOnlyNewerCtrl.chip.textContent || '') : '';
  logGateRun4Bite('740-752', 'conv URL only newer listed', 'open older minute absent from Graph; never M-newer attachment GET');
  check('wrong-target control: conversation URL with only newer in list does not fetch newer attachments',
    !wtConvOnlyNewerHitNewer && wtConvOnlyNewerChip.indexOf(attachUnreadHe) >= 0,
    { att: wtConvOnlyNewerAtt, text: wtConvOnlyNewerChip.slice(0, 200) });
  function convSenderFallbackSrc(src) {
    if (src.indexOf('convSender.length === 1') >= 0) return src;
    let out = src;
    if (out.indexOf('function openPaneConversationRow') < 0) {
      out = out.replace(
        'function openPaneExactGraphRow(pane, m) {',
        'function openPaneConversationRow(pane, m) {\n    if (!pane || !m) return false;\n    const parse = typeof FlowOwaParse !== \'undefined\' ? FlowOwaParse : null;\n    const canon = parse && parse.canonId ? parse.canonId.bind(parse) : (id) => String(id || \'\');\n    const wantConv = canon(pane.conversationId || pane.pathId);\n    const gotConv = canon(m.conversationId);\n    return Boolean(wantConv && gotConv && wantConv === gotConv);\n  }\n\n  function openPaneExactGraphRow(pane, m) {'
      );
    }
    const needle = 'async function exactOpenMessageInList(list, pane, openSender) {';
    const start = out.indexOf(needle);
    if (start < 0) return out;
    let nextFn = out.indexOf('\n  function paneFileAttachments', start + needle.length);
    if (nextFn < 0) nextFn = out.indexOf('\n  function paneUrlOnlyMessageTarget', start + needle.length);
    const end = nextFn > start ? nextFn : out.length;
    let chunk = out.slice(start, end);
    chunk = chunk.replace(
      'const hits = [];',
      'const hits = [];\n    const convSender = [];'
    ).replace(
      'if (behalfSplit(m.from, m.sender)) continue;\n      if (!(await sameOpenSender(from, open, senderAddress(m)))) continue;\n      if (!openPaneExactGraphRow(pane, m)) continue;\n      hits.push(m);',
      'if (behalfSplit(m.from, m.sender)) continue;\n      if (!(await sameOpenSender(from, open, senderAddress(m)))) continue;\n      if (openPaneConversationRow(pane, m)) convSender.push(m);\n      if (!openPaneExactGraphRow(pane, m)) continue;\n      hits.push(m);'
    );
    if (chunk.indexOf('if (convSender.length === 1) return convSender[0];') < 0) {
      chunk = chunk.replace(
        'if (hits.length > 1) return null;',
        'if (hits.length > 1) return null;\n    if (convSender.length === 1) return convSender[0];'
      );
    }
    return out.slice(0, start) + chunk + out.slice(end);
  }
  const wtConvOnlyNewerMut = await runPage(Object.assign({}, wtAttachBase, { threadMessages: [wtThread[1]] }, {
    contentOutlookSrc: patchOutlook(convSenderFallbackSrc)
  }));
  const wtConvOnlyNewerMutAtt = graphFetches(wtConvOnlyNewerMut.sent).filter((u) => /\/attachments/.test(u));
  const wtConvOnlyNewerMutNewer = wtConvOnlyNewerMutAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtConvOnlyNewerMutPatch = patchOutlook(convSenderFallbackSrc) !== outlookSrc;
  check('wrong-target bite: convSender length===1 fallback fetches newer attachments when older is open',
    wtConvOnlyNewerMutPatch && wtConvOnlyNewerMutNewer,
    { patch: wtConvOnlyNewerMutPatch, att: wtConvOnlyNewerMutAtt });
  const wtConvOnlyNewerNoOp = await runPage(Object.assign({}, wtAttachBase, { threadMessages: [wtThread[1]] }, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtConvOnlyNewerNoOpAtt = graphFetches(wtConvOnlyNewerNoOp.sent).filter((u) => /\/attachments/.test(u));
  check('wrong-target convSender bite: identity outlook patch does not satisfy bite',
    !wtConvOnlyNewerNoOpAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0),
    { att: wtConvOnlyNewerNoOpAtt });
  const wtBothListedCtrl = await runPage(Object.assign({}, wtAttachBase));
  const wtBothListedKinds = ((wtBothListedCtrl.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const wtBothListedSteps = wtBothListedKinds && wtBothListedKinds.steps && wtBothListedKinds.steps.map((s) => s.kind);
  const wtBothListedAtt = graphFetches(wtBothListedCtrl.sent).filter((u) => /\/attachments/.test(u));
  logGateRun4Bite('754-762', 'both messages listed save', 'exact open minute keeps onedriveFile when M-older attachments read');
  check('wrong-target control: both messages listed keeps save step on open message attachments',
    wtBothListedSteps && wtBothListedSteps.indexOf('onedriveFile') >= 0 &&
    !wtBothListedAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0),
    { kinds: wtBothListedSteps, att: wtBothListedAtt });
  function minuteMatchDisabledSrc(src) {
    return src.replace(
      'let minOk = Boolean(minute && minuteOf(m.receivedDateTime) === minute);',
      'let minOk = true;'
    );
  }
  const wtBothListedMut = await runPage(Object.assign({}, wtAttachBase, {
    contentOutlookSrc: patchOutlook(minuteMatchDisabledSrc)
  }));
  const wtBothListedMutKinds = ((wtBothListedMut.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const wtBothListedMutSteps = wtBothListedMutKinds && wtBothListedMutKinds.steps && wtBothListedMutKinds.steps.map((s) => s.kind);
  const wtBothListedMutAtt = graphFetches(wtBothListedMut.sent).filter((u) => /\/attachments/.test(u));
  logGateRun4Bite('754-762b', 'both listed minute gate', 'openPaneExactGraphRow minute match required for onedriveFile');
  check('wrong-target bite: disabling received-minute match drops onedriveFile on both-listed save',
    !wtBothListedMutSteps || wtBothListedMutSteps.indexOf('onedriveFile') < 0 ||
    wtBothListedMutAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0),
    { kinds: wtBothListedMutSteps, att: wtBothListedMutAtt });
  const wtBothListedNoOp = await runPage(Object.assign({}, wtAttachBase, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const wtBothListedNoOpKinds = ((wtBothListedNoOp.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const wtBothListedNoOpSteps = wtBothListedNoOpKinds && wtBothListedNoOpKinds.steps && wtBothListedNoOpKinds.steps.map((s) => s.kind);
  check('wrong-target both-listed bite: identity outlook patch does not satisfy bite',
    wtBothListedNoOpSteps && wtBothListedNoOpSteps.indexOf('onedriveFile') >= 0,
    { kinds: wtBothListedNoOpSteps });
  console.log('R5 ruling: gate-run4-184-corpus.cjs | mutations: gall + g791/g835/g866/g903/g907 survived; g936 patch-not-applied artefact | decision: DELETE graphSaveAttachConfirmed and all uses; reprobe/silent bites retarget fileDroppedForUnread block');
  logGateRun4Bite('764-772', 'reply target open message', 'conversation URL: judged card targets M-older not M-newer when older pane is open');
  await require('./gate-184-verifier-addon.cjs')({
    check, runPage, patchOutlook, gateBase, cleanStore, FROM, ME, HME, file, graphFetches,
    logGateRun4Bite, WRONG_TARGET_CONV, olderDt, newerDt, paneClockIso, wtDateRow, gateHtml,
    attachDom, contract, attachUnreadHe, F3_RAW_MSG: 'AQMkADBm/j3F3Plus+Underscore_Spelling==',
    F3_REST_MSG: 'AQMkADBm_j3F3Plus-Underscore_Spelling', GATE_CONV, FlowDisplay: D
  });
  const CONV_EWS_URL = GATE_CONV;
  const convEwsBody = 'Please update me on the contract by Sunday.';
  const convEwsDom = (h) => gateHtml(convEwsBody)(h)
    .replace('<div class="hdr">', '<div class="hdr"><time datetime="' + paneClockIso + '"></time>');
  const convEwsGate = {
    htmlPatch: convEwsDom, mailBody: convEwsBody,
    urlId: CONV_EWS_URL, listedConversationId: GATE_CONV_REST, listedSubject: 'Gate Run 4',
    gateAttachments: false, hasAttachments: false,
    graphReceivedDateTime: paneClockIso,
    threadMessages: [{ id: 'M-ews-conv', conversationId: GATE_CONV_REST, subject: 'Gate Run 4', isDraft: false, hasAttachments: false,
      from: { emailAddress: { name: 'flow', address: FROM } }, toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
      receivedDateTime: olderDt, body: { contentType: 'text', content: convEwsBody } }],
    convFilterGraphIdOnly: true, convFilterAcceptId: GATE_CONV_REST,
    inboxLookupEmpty: true,
    waitMs: 4500, clickDoIt: true
  };
  const convEwsCtrl = await runPage(Object.assign({}, convEwsGate, {
    store: cleanStore,
    waitMs: 6000
  }));
  const convEwsDraft = (convEwsCtrl.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft')[0] || {}).payload;
  logGateRun4Bite('774-788', 'EWS conversation URL reply resolve', 'messageIdForConversation must try REST spelling of conversation id');
  check('wrong-target control: EWS-spelled conversation URL resolves reply target via REST idSpellings',
    convEwsDraft && convEwsDraft.outlookIncomingId === 'M-ews-conv',
    { id: convEwsDraft && convEwsDraft.outlookIncomingId });
  function exactOpenPaneDisabledSrc(src) {
    const needle = 'async function resolveExactOpenPaneMessageId(pane, own, openSender) {';
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const insert = needle + '\n    return null;\n    /* bite-disabled */';
    return src.slice(0, start) + insert + src.slice(start + needle.length);
  }
  function noOutlookIdResolveSrc(src) {
    const needle = 'async function resolveOutlookMessageId(pathId, convId, own, openSender) {';
    const start = src.indexOf(needle);
    if (start < 0) return src;
    const insert = needle + '\n    return null;\n    /* bite-disabled */';
    return src.slice(0, start) + insert + src.slice(start + needle.length);
  }
  const convEwsMut = await runPage(Object.assign({}, convEwsGate, {
    store: cleanStore,
    waitMs: 6000,
    contentOutlookSrc: patchOutlook((s) => noOutlookIdResolveSrc(exactOpenPaneDisabledSrc(s)))
  }));
  const convEwsMutDraft = (convEwsMut.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft')[0] || {}).payload;
  check('wrong-target bite: exact open-pane resolve required for EWS conversation URL reply (Do It)',
    convEwsDraft && !convEwsMutDraft,
    { ctrl: convEwsDraft && convEwsDraft.outlookIncomingId, mut: convEwsMutDraft && convEwsMutDraft.outlookIncomingId });
  const convEwsNoOp = await runPage(Object.assign({}, convEwsGate, {
    store: cleanStore,
    waitMs: 6000,
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const convEwsNoOpDraft = (convEwsNoOp.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft')[0] || {}).payload;
  check('wrong-target messageIdForConversation bite: identity outlook patch does not satisfy bite',
    convEwsNoOpDraft && convEwsNoOpDraft.outlookIncomingId === 'M-ews-conv',
    { id: convEwsNoOpDraft && convEwsNoOpDraft.outlookIncomingId });
  const convEwsOpenGate = Object.assign({}, {
    htmlPatch: wtDom, mailBody: wtSaveBody,
    urlId: CONV_EWS_URL, listedConversationId: GATE_CONV_REST, listedSubject: 'Gate Run 4',
    graphReceivedDateTime: olderDt,
    threadMessages: [Object.assign({}, wtThread[0], { conversationId: GATE_CONV_REST, id: 'M-older' })],
    convFilterGraphIdOnly: true, convFilterAcceptId: GATE_CONV_REST,
    gateAttachments: true, hasAttachments: true, graphFetchReply: wtAttachReply, pathRestMisses: 2, inboxLookupEmpty: true,
    waitMs: 6000,
    store: Object.assign({}, cleanStore, { glanceOutlookFileTrace: 1 })
  });
  const convEwsOpenCtrl = await runPage(convEwsOpenGate);
  const convEwsOpenAtt = graphFetches(convEwsOpenCtrl.sent).filter((u) => /\/attachments/.test(u));
  const convEwsOpenKinds = ((convEwsOpenCtrl.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const convEwsOpenSteps = convEwsOpenKinds && convEwsOpenKinds.steps && convEwsOpenKinds.steps.map((s) => s.kind);
  check('wrong-target control: EWS conversation URL open-pane file resolve uses REST spelling (messageIdForOpenPane)',
    convEwsOpenAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0) &&
    convEwsOpenSteps && convEwsOpenSteps.indexOf('onedriveFile') >= 0,
    { att: convEwsOpenAtt, kinds: convEwsOpenSteps });
  const convEwsOpenMut = await runPage(Object.assign({}, convEwsOpenGate, {
    contentOutlookSrc: patchOutlook((src) => mutateFnSpellsRawOnly(src, 'messageIdForOpenPane'))
  }));
  const convEwsOpenMutAtt = graphFetches(convEwsOpenMut.sent).filter((u) => /\/attachments/.test(u));
  const convEwsOpenMutProc = ((convEwsOpenMut.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const convEwsOpenMutKinds = convEwsOpenMutProc && convEwsOpenMutProc.steps && convEwsOpenMutProc.steps.map((s) => s.kind);
  check('wrong-target bite: messageIdForOpenPane raw-only fails EWS conversation URL file resolve',
    !convEwsOpenMutAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0) ||
    !convEwsOpenMutKinds || convEwsOpenMutKinds.indexOf('onedriveFile') < 0,
    { att: convEwsOpenMutAtt, kinds: convEwsOpenMutKinds });
  const convEwsOpenNoOp = await runPage(Object.assign({}, convEwsOpenGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const convEwsOpenNoOpAtt = graphFetches(convEwsOpenNoOp.sent).filter((u) => /\/attachments/.test(u));
  const convEwsOpenNoOpKinds = ((convEwsOpenNoOp.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const convEwsOpenNoOpSteps = convEwsOpenNoOpKinds && convEwsOpenNoOpKinds.steps && convEwsOpenNoOpKinds.steps.map((s) => s.kind);
  check('wrong-target messageIdForOpenPane bite: identity outlook patch does not satisfy bite',
    convEwsOpenNoOpAtt.some((u) => decodeURIComponent(u).indexOf('/M-older/') >= 0) &&
    convEwsOpenNoOpSteps && convEwsOpenNoOpSteps.indexOf('onedriveFile') >= 0,
    { att: convEwsOpenNoOpAtt, kinds: convEwsOpenNoOpSteps });
  const tzMismatchCtrl = await runPage(Object.assign({}, wtAttachBase, {
    threadMessages: [Object.assign({}, wtThread[0], { receivedDateTime: newerDt })],
    graphReceivedDateTime: newerDt
  }));
  const tzMismatchWhy = (tzMismatchCtrl.store.outlookPageDiag || []).map((d) => d.reason);
  const tzMismatchChip = tzMismatchCtrl.chip ? String(tzMismatchCtrl.chip.textContent || '') : '';
  const tzMismatchKinds = ((tzMismatchCtrl.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const tzMismatchSteps = tzMismatchKinds && tzMismatchKinds.steps && tzMismatchKinds.steps.map((s) => s.kind);
  logGateRun4Bite('790-802', 'received-minute TZ mismatch', 'Graph minute != pane clock minute → files-not-read, never silent');
  check('wrong-target control: mismatched Graph received minute fails safe with attachments-not-read (not silent)',
    Boolean(tzMismatchCtrl.chip) && tzMismatchChip.indexOf(attachUnreadHe) >= 0 &&
    (!tzMismatchSteps || tzMismatchSteps.indexOf('onedriveFile') < 0) &&
    !tzMismatchWhy.some((r) => r === 'page:intent-null' || r === 'intent-null'),
    { text: tzMismatchChip.slice(0, 200), why: tzMismatchWhy, kinds: tzMismatchSteps });
  const ilDstPane = 'א 25/10/2026 \u200f01:30';
  const ilDstIso = FlowOwaParse.clockToIso(ilDstPane);
  const ilDstMismatch = await runPage(Object.assign({}, wtAttachBase, {
    threadMessages: [Object.assign({}, wtThread[0], { receivedDateTime: ilDstIso ? new Date(Date.parse(ilDstIso) + 3600e3).toISOString() : newerDt })],
    htmlPatch: (h) => wtDom(h).replace(wtDateRow, ilDstPane),
    graphReceivedDateTime: ilDstIso ? new Date(Date.parse(ilDstIso) + 3600e3).toISOString() : newerDt
  }));
  const ilDstChip = ilDstMismatch.chip ? String(ilDstMismatch.chip.textContent || '') : '';
  const ilDstWhy = (ilDstMismatch.store.outlookPageDiag || []).map((d) => d.reason);
  const ilDstKinds = ((ilDstMismatch.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const ilDstSteps = ilDstKinds && ilDstKinds.steps && ilDstKinds.steps.map((s) => s.kind);
  check('wrong-target control: Israel fall-back hour minute mismatch fails safe (attachments-not-read, not silent)',
    Boolean(ilDstMismatch.chip) && ilDstChip.indexOf(attachUnreadHe) >= 0 &&
    (!ilDstSteps || ilDstSteps.indexOf('onedriveFile') < 0) &&
    !ilDstWhy.some((r) => r === 'page:intent-null' || r === 'intent-null'),
    { text: ilDstChip.slice(0, 200), why: ilDstWhy, paneIso: ilDstIso, kinds: ilDstSteps });
  const msgUrlGraphGate = Object.assign({}, gateBase, f3PathOpts, {
    urlId: F3_RAW_MSG, listedConversationId: GATE_CONV, messageId: F3_GRAPH_MSG,
    pathRestHit: true, pathRestId: F3_RAW_MSG, pathRestGraphId: F3_GRAPH_MSG,
    driveFiles: [{ id: 'drive-q4', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' }]
  });
  const msgUrlGraphCtrl = await runPage(msgUrlGraphGate);
  const msgUrlGraphSum = graphEndpointSummary(msgUrlGraphCtrl.sent);
  const msgUrlAttachForOpen = msgUrlGraphSum.urls.filter((u) => /\/attachments/.test(u)).every((u) => {
    const dec = decodeURIComponent(u);
    return dec.indexOf(F3_GRAPH_MSG) >= 0 || outlookMessageIdSpellings(F3_RAW_MSG).some((s) => dec.indexOf(s) >= 0);
  });
  logGateRun4Bite('690-710', 'message URL graph budget', 'total Graph calls + endpoints; same gate for urlOnlyId bite');
  const msgUrlGraphTotal = msgUrlGraphSum.total;
  // gate-run4-184-corpus.cjs:753-755 | before: total>=30 (conv fallback traffic) | after: total>=8 with openPaneGraphMessageId direct reads | reason: message URL carries Graph message id
  check('wrong-target control: message URL with path id Graph call budget (total + endpoints)',
    msgUrlGraphSum.convFilter === 0 && msgUrlAttachForOpen && msgUrlGraphTotal >= 8 && msgUrlGraphSum.fromSearch <= 3,
    msgUrlGraphSum);
  function conversationIncomingIdPinDisabledSrc(src) {
    let s = src;
    s = s.replace(
      'if (decided && !decided.none && decided.process && conversationPanePathKey(pane) && !pane.itemId\n        && processNeedsConversationMessageId(decided.process)) {',
      'if (false && decided && !decided.none && decided.process && conversationPanePathKey(pane) && !pane.itemId\n        && processNeedsConversationMessageId(decided.process)) {'
    );
    s = s.replace(
      'if (processNeedsConversationMessageId((decided && decided.process) || (entry && entry.process))\n          && conversationPanePathKey(pane) && !pane.itemId) {',
      'if (false && processNeedsConversationMessageId((decided && decided.process) || (entry && entry.process))\n          && conversationPanePathKey(pane) && !pane.itemId) {'
    );
    s = s.replace(
      'if (conversationPanePathKey(pane) && processNeedsConversationMessageId(proc)) {\n              replyTarget = await exactConversationPaneMessageId(pane, own, pane.senderEmail);\n            } else {',
      'if (false && conversationPanePathKey(pane) && processNeedsConversationMessageId(proc)) {\n              replyTarget = await exactConversationPaneMessageId(pane, own, pane.senderEmail);\n            } else {'
    );
    return s;
  }
  function urlOnlyIdRegressionSrc(src) {
    const needle = 'if (countGate) {\n      let id = openPaneGraphMessageId(pane);\n      if (!id && conversationPanePathKey(pane)) {\n        const open = await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail);\n        id = open && open.id;\n      }\n      if (!id) {\n        const found = conversationPanePathKey(pane)\n          ? await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail)\n          : (paneUrlOnlyMessageTarget(pane)\n            ? await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail)\n            : await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail));\n        if (found && found.unread) return { none: true, reason: found.reason };\n        id = found && found.id;\n      }\n      const ev = typeof FlowOutlookAttachmentEvidence';
    const repl = 'if (countGate) {\n      let id = openPaneGraphMessageId(pane);\n      const pathKey = String(pane.pathId || pane.conversationId || \'\');\n      const urlOnlyId = Boolean(id && pathKey && messageUrlPathKey(pane));\n      if (!id && conversationPanePathKey(pane)) {\n        const open = await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail);\n        id = open && open.id;\n      }\n      if (!id) {\n        const found = conversationPanePathKey(pane)\n          ? await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail)\n          : (paneUrlOnlyMessageTarget(pane)\n            ? await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail)\n            : await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail));\n        if (found && found.unread) return { none: true, reason: found.reason };\n        id = found && found.id;\n      }\n      const ev = typeof FlowOutlookAttachmentEvidence';
    let out = src.replace(needle, repl);
    const extra = 'if (urlOnlyId) {\n        await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail);\n      }';
    const anchor = 'if (merged.count == null) {\n        attachmentsUnread = true;';
    if (out.includes(anchor) && !out.includes('if (urlOnlyId) {\n        await resolveOutlookMessageId')) {
      out = out.replace(anchor, extra + '\n      ' + anchor);
    }
    return out;
  }
  const msgUrlGraphMut = await runPage(Object.assign({}, msgUrlGraphGate, {
    contentOutlookSrc: patchOutlook(urlOnlyIdRegressionSrc)
  }));
  const msgUrlGraphMutSum = graphEndpointSummary(msgUrlGraphMut.sent);
  check('wrong-target bite: urlOnlyId regression adds conversation-filter Graph lookups on same message URL scenario',
    msgUrlGraphMutSum.convFilter > msgUrlGraphSum.convFilter || msgUrlGraphMutSum.total > msgUrlGraphSum.total,
    { ctrl: msgUrlGraphSum, mut: msgUrlGraphMutSum });
  const msgUrlGraphNoOp = await runPage(Object.assign({}, msgUrlGraphGate, {
    contentOutlookSrc: patchOutlook((s) => s)
  }));
  const msgUrlGraphNoOpSum = graphEndpointSummary(msgUrlGraphNoOp.sent);
  check('wrong-target urlOnlyId bite: identity outlook patch does not satisfy bite',
    !(msgUrlGraphNoOpSum.convFilter > msgUrlGraphSum.convFilter || msgUrlGraphNoOpSum.total > msgUrlGraphSum.total),
    { ctrl: msgUrlGraphSum, noop: msgUrlGraphNoOpSum });
  console.log('gate-run4-184 expectation: gate-run4-184-corpus.cjs:1134-1170 | before: message URL reply fell through to conversation-filter | after: path-rest id + zero convFilter | ruling: #184 urlOnlyId');
  const msgUrlReplyGate = Object.assign({}, gateBase, {
    htmlPatch: (h) => gateHtml(h1Body)(h),
    mailBody: h1Body,
    urlId: F3_RAW_MSG,
    listedConversationId: GATE_CONV,
    messageId: F3_GRAPH_MSG,
    pathRestHit: true, pathRestId: F3_RAW_MSG, pathRestGraphId: F3_GRAPH_MSG, pathRestResponseId: F3_GRAPH_MSG,
    gateAttachments: false, hasAttachments: false, attachmentFiles: [],
    inboxLookupEmpty: true,
    waitMs: 6000, clickDoIt: true,
    store: cleanStore
  });
  const msgUrlReplyCtrl = await runPage(msgUrlReplyGate);
  const msgUrlReplySum = graphEndpointSummary(msgUrlReplyCtrl.sent);
  const msgUrlReplyDraft = (msgUrlReplyCtrl.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookDraft')[0] || {}).payload;
  logGateRun4Bite('urlOnlyId-reply', 'message URL H1 Do It', 'path-rest Graph id; never conversation id or conv filter');
  function urlOnlyMessageIdOk(id) {
    const s = String(id || '');
    return s && (s === F3_GRAPH_MSG || s === F3_RAW_MSG || outlookMessageIdSpellings(F3_RAW_MSG).indexOf(s) >= 0);
  }
  check('urlOnlyId control: message URL reply Do It uses path-rest message id (zero conversation-filter)',
    msgUrlReplySum.convFilter === 0 &&
    msgUrlReplyDraft && urlOnlyMessageIdOk(msgUrlReplyDraft.outlookIncomingId) &&
    String(msgUrlReplyDraft.outlookIncomingId) !== String(GATE_CONV),
    { sum: msgUrlReplySum, id: msgUrlReplyDraft && msgUrlReplyDraft.outlookIncomingId });
  const wtAbsentBase = Object.assign({}, row31SaveUnreadGate, {
    urlId: 'M-older', listedConversationId: WRONG_TARGET_CONV, listedSubject: 'Gate Run 4',
    messageId: 'M-older',
    htmlPatch: wtDom, mailBody: wtSaveBody,
    threadMessages: [wtThread[1]],
    convFilterEmpty: true, inboxLookupEmpty: true, pathRestMisses: 2,
    graphFetchReply: wtAttachReply, waitMs: 6000
  });
  const wtAbsentCtrl = await runPage(wtAbsentBase);
  const wtAbsentAtt = graphFetches(wtAbsentCtrl.sent).filter((u) => /\/attachments/.test(u));
  const wtAbsentNewer = wtAbsentAtt.some((u) => decodeURIComponent(u).indexOf('/M-newer/') >= 0);
  const wtAbsentKinds = ((wtAbsentCtrl.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const wtAbsentSteps = wtAbsentKinds && wtAbsentKinds.steps && wtAbsentKinds.steps.map((s) => s.kind);
  const wtAbsentChip = wtAbsentCtrl.chip ? String(wtAbsentCtrl.chip.textContent || '') : '';
  logGateRun4Bite('712-725', 'open message absent from list', 'only newer same-sender row in Graph pages; exact match only');
  check('wrong-target control: open message missing from fetched list shows files-not-read without newer attachments',
    !wtAbsentNewer && wtAbsentChip.indexOf(attachUnreadHe) >= 0 &&
    (!wtAbsentSteps || wtAbsentSteps.indexOf('onedriveFile') < 0),
    { att: wtAbsentAtt, text: wtAbsentChip.slice(0, 200), kinds: wtAbsentSteps });
  const attachListFailCtrl = await runPage(Object.assign({}, attachUnreadGate, {
    messageId: 'M-attach-list-fail', urlId: 'M-attach-list-fail'
  }));
  const attachListFailAtt = graphFetches(attachListFailCtrl.sent).filter((u) => /\/attachments/.test(u));
  const attachListFailConv = graphFetches(attachListFailCtrl.sent).filter((u) => /conversationId eq/.test(decodeURIComponent(u)));
  const attachListFailKinds = ((attachListFailCtrl.store.log || []).find((e) => e && e.kind === 'shown') || {}).process;
  const attachListFailSteps = attachListFailKinds && attachListFailKinds.steps && attachListFailKinds.steps.map((s) => s.kind);
  const attachListFailChip = attachListFailCtrl.chip ? String(attachListFailCtrl.chip.textContent || '') : '';
  logGateRun4Bite('726-738', 'attachment list fail with item id', 'no alt message resolve; files-not-read card');
  check('wrong-target control: attachment list failure with message id present does not fetch another message',
    attachListFailConv.length === 0 && attachListFailAtt.every((u) => decodeURIComponent(u).indexOf('M-attach-list-fail') >= 0) &&
    attachListFailChip.indexOf(attachUnreadHe) >= 0 &&
    (!attachListFailSteps || attachListFailSteps.indexOf('onedriveFile') < 0),
    { att: attachListFailAtt, conv: attachListFailConv, text: attachListFailChip.slice(0, 200) });
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
  const lateChips = await runPage(Object.assign({}, gateBasePathRest, {
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

  const f3RestOnWire = f3AttachUrls.some((u) => decodeURIComponent(u).indexOf(F3_REST_MSG) >= 0);
  check('F3 behavioral: message URL save card uses REST attachment GET (idSpellings), not raw EWS id',
    f3RestOnWire && Boolean(f3Page.chip) && /OneDrive|Do It|וואן|בצע/.test(String(f3Page.chip.textContent || '')) &&
    f3StepKinds && f3StepKinds.indexOf('onedriveFile') >= 0,
    { spellUrls: f3AttachUrls.slice(0, 3), text: f3Page.chip && f3Page.chip.textContent, kinds: f3StepKinds });

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
  const addonOnly = process.argv.includes('--verifier-addon-only');
  if (!addonOnly) console.log('\n--- behavioral bite checks (Outlook page + Gmail card) ---\n');
  await runBehavioral({ addonOnly });
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nAll gate-run4-184 corpus checks passed.');
})();
