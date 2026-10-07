// Own-computer proof of close (0.9.32). One allowlisted page.
// Handled only when a DOM re-read sets fetchedBack. A click is not the
// gate. A screenshot hash is audit only. The live page driver is not wired.
// Run: node test/computer-proof-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'proof-of-close.js'), 'utf8'), sandbox, { filename: 'proof-of-close.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'quiet-metrics.js'), 'utf8'), sandbox, { filename: 'quiet-metrics.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'receipt-copy.js'), 'utf8'), sandbox, { filename: 'receipt-copy.js' });
const FlowProofOfClose = vm.runInContext('FlowProofOfClose', sandbox);
const FlowReceipt = vm.runInContext('FlowReceipt', sandbox);
const FlowQuietMetrics = vm.runInContext('FlowQuietMetrics', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const VERIFIED = '2026-10-07T18:00:00.000Z';
const HOST = 'example.com';
const PAGE = '/fixture/glance-close';
const ACTION = 'mark-done';
const HREF = 'https://example.com/fixture/glance-close';
const DONE = '[data-glance-close="done"]';
const IDSEL = '[data-glance-close-id]';
const OPEN = '[data-glance-close="open"]';

function reader(extra) {
  extra = extra || {};
  const nodes = extra.nodes || {};
  return {
    href: extra.href !== undefined ? extra.href : HREF,
    clicked: extra.clicked === true,
    screenshotHash: extra.screenshotHash,
    wall: extra.wall,
    query(selector) {
      if (extra.throwOnQuery) throw new Error('query failed');
      return nodes[selector] || { found: false };
    }
  };
}

function input(extra) {
  return Object.assign({
    host: HOST,
    path: PAGE,
    actionId: ACTION,
    verifiedAt: VERIFIED
  }, extra || {});
}

const list = FlowProofOfClose.computerAllowlist();
const seam = FlowProofOfClose.computerDriverSeam();

console.log('\n--- allowlisted page, driver not live ---\n');
{
  check('one host and one action', list.length === 1 && list[0].host === HOST && list[0].path === PAGE && list[0].actionId === ACTION, list);
  check('the success selector and the inverse are on that action',
    list[0].successSelector === DONE && list[0].idSelector === IDSEL && list[0].inverse && list[0].inverse.actionId === 'mark-open' && list[0].inverse.successSelector === OPEN,
    list[0]);
  check('the live page driver is not wired', seam.live === false && seam.mode === 'scaffold' && seam.id === 'computer_ui', seam);
  const mutated = FlowProofOfClose.computerAllowlist();
  mutated[0].host = 'evil.test';
  check('the allowlist copy does not change the stub', FlowProofOfClose.computerAllowlist()[0].host === HOST);
  check('system is computer/example.com', FlowProofOfClose.computerSystem(HOST) === 'computer/example.com');
  check('a local-file system is not this wedge', FlowProofOfClose.computerSystem('local') === '' && FlowProofOfClose.isComputerSystem('computer/local/notes') === false);
}

console.log('\n--- verify miss is not Handled ---\n');
{
  const clicked = FlowProofOfClose.computerClose(input(), reader({ clicked: true, nodes: {} }));
  check('a click with no success selector is not Handled',
    clicked.ok === false && clicked.reason === 'verify_failed' && clicked.proof === null && clicked.askSali === false &&
    FlowProofOfClose.allowsHandled(clicked) === false, clicked);
  check('that miss is not a trusted close',
    FlowProofOfClose.shouldRecordTrustedClose([{ action: { kind: 'computerClose' }, response: clicked }]) === false);
  check('a miss stores no activity proof', FlowProofOfClose.activityFields(clicked.proof) === null);
  check('a miss stores no remount fields', FlowProofOfClose.receiptLogFields(clicked.proof, { status: 'Handled.' }) === null);

  const shot = FlowProofOfClose.computerClose(input(), reader({ screenshotHash: 'hash-1', clicked: true, nodes: {} }));
  check('a screenshot hash is not the gate',
    shot.ok === false && shot.proof === null && shot.audit && shot.audit.screenshotHash === 'hash-1' &&
    FlowProofOfClose.allowsHandled(shot) === false, shot);

  const otherHost = FlowProofOfClose.computerClose(input(), reader({
    href: 'https://evil.test/fixture/glance-close',
    nodes: { [DONE]: { found: true } }
  }));
  check('a success node on another host is not Handled', otherHost.ok === false && otherHost.proof === null, otherHost);

  const http = FlowProofOfClose.computerClose(input(), reader({
    href: 'http://example.com/fixture/glance-close',
    nodes: { [DONE]: { found: true } }
  }));
  check('plain http is not a computer proof', http.ok === false && http.proof === null, http);

  const wrongPath = FlowProofOfClose.computerClose(input(), reader({
    href: 'https://example.com/other',
    nodes: { [DONE]: { found: true } }
  }));
  check('the wrong path is not Handled', wrongPath.ok === false && wrongPath.proof === null, wrongPath);

  const notListed = FlowProofOfClose.computerClose(input({ host: 'evil.test', path: '/', actionId: ACTION }), reader({
    href: 'https://evil.test/',
    nodes: { [DONE]: { found: true } }
  }));
  check('a host that is not allowlisted is not Handled', notListed.ok === false && notListed.reason === 'not_allowlisted' && notListed.askSali === false, notListed);

  const lied = FlowProofOfClose.buildProof({
    system: 'computer/evil.test',
    externalId: 'row-x',
    fetchedBack: true,
    verifiedAt: VERIFIED
  });
  check('a computer proof for a host outside the allowlist is not a proof', lied === null);

  const localShape = FlowProofOfClose.localFileCloseShape('notes');
  const local = FlowProofOfClose.computerClose({ host: 'local', app: 'notes', verifiedAt: VERIFIED }, reader());
  check('a local-file close is deferred and not Handled',
    local.ok === false && local.reason === 'local_file_deferred' && local.proof === null &&
    localShape && localShape.system === 'computer/local/notes' && localShape.fetchedBack === false && localShape.deferred === true &&
    FlowProofOfClose.buildProof({ system: localShape.system, externalId: 'n1', fetchedBack: true, verifiedAt: VERIFIED }) === null,
    local);

  const threw = FlowProofOfClose.computerClose(input(), reader({ throwOnQuery: true, nodes: { [DONE]: { found: true } } }));
  check('a reader that throws is not Handled', threw.ok === false && threw.proof === null, threw);

  let quiet = FlowQuietMetrics.emptyState();
  if (FlowProofOfClose.allowsHandled(clicked)) {
    quiet = FlowQuietMetrics.noteHandled(quiet, { messageId: 'm-miss', ts: Date.parse(VERIFIED) });
  }
  const snap = FlowQuietMetrics.snapshot(quiet, Date.parse(VERIFIED));
  check('a computer verify miss is not counted as a trusted close', snap.trusted.trusted === 0 && snap.trusted.handled === 0, snap.trusted);
}

console.log('\n--- DOM re-read success is Handled ---\n');
{
  const dom = reader({
    href: HREF + '?ready=1',
    clicked: true,
    screenshotHash: 'hash-audit',
    nodes: {
      [DONE]: { found: true },
      [IDSEL]: { found: true, id: 'row-42' }
    }
  });
  const read = FlowProofOfClose.verifyComputerDom(dom, list[0]);
  check('the DOM helper re-reads the URL and the success selector',
    read.ok === true && read.fetchedBack === true && read.visibleId === 'row-42' && read.url === HREF, read);
  const out = FlowProofOfClose.computerClose(input(), dom);
  check('DOM re-read success is Handled',
    out.ok === true && out.askSali === false && out.proof && out.proof.fetchedBack === true &&
    out.proof.system === 'computer/example.com' && out.proof.externalId === 'row-42' &&
    out.proof.verifiedAt === VERIFIED && out.proof.url === HREF && out.proof.screenshotHash === undefined &&
    FlowProofOfClose.allowsHandled(out) === true, out);
  check('the screenshot stays audit and is not the proof',
    out.audit && out.audit.screenshotHash === 'hash-audit' && !Object.prototype.hasOwnProperty.call(out.proof, 'screenshotHash'), out.proof);
  check('a computer step with fetchedBack is a trusted close',
    FlowProofOfClose.isComputerKind('computerClose') === true &&
    FlowProofOfClose.isProofTaskKind('computerClose') === true &&
    FlowProofOfClose.stepCountsAsHandled({ action: { kind: 'computerClose' }, response: out }) === true &&
    FlowProofOfClose.shouldRecordTrustedClose([{ action: { kind: 'computerClose' }, response: out }]) === true);
  const fields = FlowProofOfClose.activityFields(out.proof);
  check('activity stores system, externalId, and verifiedAt',
    fields && fields.system === 'computer/example.com' && fields.externalId === 'row-42' && fields.verifiedAt === VERIFIED && fields.fetchedBack === undefined,
    fields);
  const copy = FlowReceipt.confirmation({
    succeeded: 1, total: 1, priorCloses: 5, requireProof: true, proofs: [out.proof]
  });
  check('the receipt says Handled when fetchedBack is true', copy.status === 'Handled.' && copy.full === true, copy);
  const he = FlowReceipt.confirmation({
    succeeded: 1, total: 1, priorCloses: 5, lang: 'he', requireProof: true, proofs: [out.proof]
  });
  check('the Hebrew receipt says טופל when fetchedBack is true', he.status === 'טופל.' && he.full === true, he);

  const noId = FlowProofOfClose.computerClose(input(), reader({
    nodes: { [DONE]: { found: true } }
  }));
  const digest = FlowProofOfClose.actionDigest(ACTION);
  const fallback = FlowProofOfClose.fallbackExternalId(HOST, PAGE, ACTION);
  check('with no visible id the externalId is host:path:actionDigest',
    noId.ok === true && noId.proof.externalId === fallback && fallback === HOST + ':' + PAGE + ':' + digest && digest !== ACTION,
    noId.proof);

  const trailing = FlowProofOfClose.computerClose(input(), reader({
    href: HREF + '/',
    nodes: { [DONE]: { found: true }, [IDSEL]: { found: true, id: 'row-7' } }
  }));
  check('a trailing slash still matches the allowlisted path', trailing.ok === true && trailing.proof.externalId === 'row-7', trailing.proof);

  const stepMiss = { action: { kind: 'computerClose' }, response: { ok: true, proof: null } };
  check('a computer step without fetchedBack is not Handled', FlowProofOfClose.stepCountsAsHandled(stepMiss) === false);
}

console.log('\n--- login wall pauses ---\n');
{
  const password = FlowProofOfClose.computerClose(input(), reader({
    wall: { password: true },
    nodes: { [DONE]: { found: true }, [IDSEL]: { found: true, id: 'row-42' } }
  }));
  check('a password wall is proof_pending and not Handled',
    password.ok === false && password.reason === 'proof_pending' && password.escalate === 'cos' &&
    password.askSali === false && password.proof === null && FlowProofOfClose.allowsHandled(password) === false, password);
  const approve = FlowProofOfClose.computerClose(input(), reader({
    wall: { label: 'מאשר' },
    nodes: { [DONE]: { found: true } }
  }));
  check('מאשר pauses for CoS and does not ask Sali',
    approve.ok === false && approve.reason === 'proof_pending' && approve.escalate === 'cos' && approve.askSali === false && approve.proof === null, approve);
  const signIn = FlowProofOfClose.verifyComputerDom(reader({ wall: { label: 'Sign in' }, nodes: { [DONE]: { found: true } } }), list[0]);
  check('a sign-in wall is not a DOM success', signIn.ok === false && signIn.fetchedBack === false && signIn.escalate === 'cos' && signIn.askSali === false, signIn);
}

console.log('\n--- remount by message id ---\n');
{
  const out = FlowProofOfClose.computerClose(input(), reader({
    nodes: { [DONE]: { found: true }, [IDSEL]: { found: true, id: 'row-42' } }
  }));
  const logged = FlowProofOfClose.receiptLogFields(out.proof, {
    writtenLine: 'example.com · mark-done',
    processName: 'Do It',
    closedLine: 'Closed on the page.',
    status: 'Handled.'
  });
  const oldHash = 'h-old';
  const newHash = 'h-new';
  const legacy = '18f3abc';
  const threadId = 'thread-computer';
  const stored = Object.assign({
    kind: 'written',
    messageId: oldHash,
    legacyMessageId: legacy,
    threadId: threadId,
    connectorId: 'computerClose',
    ref: out.ref,
    url: HREF
  }, logged);
  check('a proved computer row remounts by message id', FlowProofOfClose.taskReceiptFromLog([stored], legacy) === stored);
  const reload = { messageIds: [newHash, legacy], threadIds: [threadId] };
  check('a changed text-hash still finds the computer receipt by legacy id and thread id',
    FlowProofOfClose.taskReceiptFromLog([stored], reload) === stored);
  check('terminal with no chip mounts the computer receipt',
    FlowProofOfClose.scanReceiptDecision({
      log: [stored], messageIds: [newHash], threadIds: [threadId], hasHost: false, terminal: true
    }) === 'mount');
  const copy = FlowProofOfClose.remountCopy(stored);
  check('the remounted banner says Handled and keeps the page id',
    copy && copy.status === 'Handled.' && copy.connectorId === 'computerClose' && copy.externalId === 'row-42' &&
    copy.writtenLine === 'example.com · mark-done' && copy.undoAvailable === true &&
    copy.undoHint === FlowProofOfClose.COMPUTER_UNDO_HINT && copy.ref.inverse.actionId === 'mark-open' &&
    copy.url === HREF, copy);
  const he = FlowProofOfClose.remountCopy(Object.assign({}, stored, { receiptStatus: 'טופל.' }));
  check('a Hebrew computer receipt stays טופל', he && he.status === 'טופל.', he);
  check('fetchedBack false is not a computer receipt',
    FlowProofOfClose.remountCopy(Object.assign({}, stored, { fetchedBack: false })) === null);
  check('a computer row without fetchedBack is not a receipt',
    FlowProofOfClose.taskReceiptFromLog([Object.assign({}, stored, { fetchedBack: undefined })], legacy) === null);
  check('a newer undo hides the computer banner',
    FlowProofOfClose.taskReceiptFromLog([
      { kind: 'undone', messageId: oldHash, threadId: threadId, connectorId: 'computerClose', system: 'computer/example.com', undone: true },
      stored
    ], reload) === null);
  check('a later shown line does not hide the computer receipt',
    FlowProofOfClose.taskReceiptFromLog([{ kind: 'shown', messageId: legacy }, stored], legacy) === stored);
  check('another message does not supply this receipt',
    FlowProofOfClose.taskReceiptFromLog([stored], 'other-message') === null);
}

console.log('\n--- Undo inverse or unavailable clears HANDLED ---\n');
{
  const out = FlowProofOfClose.computerClose(input(), reader({
    nodes: { [DONE]: { found: true }, [IDSEL]: { found: true, id: 'row-42' } }
  }));
  const logged = FlowProofOfClose.receiptLogFields(out.proof, { writtenLine: 'example.com · mark-done', status: 'Handled.' });
  const row = Object.assign({
    kind: 'written',
    messageId: 'm1',
    threadId: 't1',
    connectorId: 'computerClose',
    ref: out.ref,
    url: HREF
  }, logged);
  const openReader = reader({
    nodes: { [OPEN]: { found: true } }
  });
  const inverse = FlowProofOfClose.applyComputerUndo([row], { messageId: 'm1', threadId: 't1' }, row.ref, openReader);
  check('an inverse re-read clears HANDLED and names the inverse action',
    inverse.ok === true && inverse.hit === true && inverse.available === true && inverse.inverseVerified === true &&
    inverse.stayedHandled === false && inverse.askSali === false && inverse.inverse && inverse.inverse.actionId === 'mark-open' &&
    inverse.log[0].kind === 'undone' && inverse.log[0].fetchedBack === false && inverse.log[0].label === FlowProofOfClose.COMPUTER_UNDONE_LINE &&
    row.kind === 'written', inverse);
  check('the inverse undo does not remount Handled',
    FlowProofOfClose.taskReceiptFromLog(inverse.log, 'm1') === null && FlowProofOfClose.remountCopy(inverse.log[0]) === null);

  const planned = FlowProofOfClose.applyComputerUndo([row], 'm1', row.ref, null);
  check('without a page reader the inverse is still the plan and HANDLED is cleared',
    planned.available === true && planned.inverseVerified === false && planned.stayedHandled === false &&
    planned.inverse.actionId === 'mark-open' && planned.log[0].kind === 'undone' &&
    planned.log[0].label === FlowProofOfClose.COMPUTER_ACTIVITY_CLEARED, planned);

  const noInverse = Object.assign({}, row, { ref: Object.assign({}, row.ref, { inverse: null }), inverse: null });
  const unavailable = FlowProofOfClose.applyComputerUndo([noInverse], { messageId: 'm1', threadId: 't1', externalId: 'row-42' });
  check('Undo unavailable rewrites Activity so it does not stay HANDLED',
    unavailable.ok === true && unavailable.available === false && unavailable.stayedHandled === false &&
    unavailable.log[0].kind === 'undone' && unavailable.log[0].undoUnavailable === true &&
    unavailable.log[0].label === FlowProofOfClose.COMPUTER_UNDO_UNAVAILABLE &&
    FlowProofOfClose.taskReceiptFromLog(unavailable.log, 'm1') === null, unavailable);

  const google = {
    kind: 'written', messageId: 'm1', threadId: 't1', connectorId: 'googleTask', system: 'google/tasks',
    externalId: 'task_1', verifiedAt: VERIFIED, fetchedBack: true, ref: { externalId: 'task_1', taskId: 'task_1' }
  };
  const left = FlowProofOfClose.applyComputerUndo([google], 'm1');
  check('a computer undo does not rewrite a Google Task row', left.hit === false && left.log[0].kind === 'written' && left.log[0].system === 'google/tasks', left);
}

console.log('\n--- wiring stays a scaffold ---\n');
{
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  const storage = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8');
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('the extension version is 0.9.37', /"version": "0\.9\.37"/.test(manifest));
  const start = gmail.indexOf("copy.connectorId === 'computerClose'");
  const send = gmail.indexOf('chrome.runtime.sendMessage', start);
  const block = start > 0 && send > start ? gmail.slice(start, send) : '';
  check('the thread Undo rewrites the computer Activity row and does not call a writer first',
    block.indexOf('markComputerUndone') > 0 && block.indexOf('Mail.Send') === -1, { start: start, send: send });
  check('Google Task undo is still the task path', gmail.indexOf('markGoogleTaskUndone') > send);
  check('Activity Undo rewrites a computer row',
    storage.indexOf('markComputerUndone') > 0 && popup.indexOf('markComputerUndone') > 0);
  check('the computer close is not registered as an API writer',
    bg.indexOf('computerClose:') === -1 && bg.indexOf('outlookTask: outlookTaskWrite') > 0 && bg.indexOf('googleTask: googleTasksWrite') > 0);
  const core = fs.readFileSync(path.join(__dirname, '..', 'core', 'proof-of-close.js'), 'utf8');
  check('this path does not ask Sali', core.indexOf('askSali: true') === -1 && core.indexOf('askSali: false') > 0);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
