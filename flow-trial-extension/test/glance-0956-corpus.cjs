// Glance 0.9.56. Subject fallback, Graph from as sender, and the two drafts.
// Run: node test/glance-0956-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowOwaParse } = require('../core/owa-parse.js');
const { FlowOutlookSync } = require('../core/outlook-sync.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : '');
  }
}

const MINUTE = '2026-10-08T14:01:00.000Z';
const pane = {
  conversationId: 'AQQkCONFIRMED',
  receivedDateTime: MINUTE,
  subject: 'Lease renewal'
};
const rows = [
  { id: 'wrong-conv', conversationId: 'AQQkOTHER', receivedDateTime: MINUTE, subject: 'Lease renewal', from: { emailAddress: { address: 'bob@other.example', name: 'Bob' } } },
  { id: 'wrong-minute', conversationId: 'AQQkCONFIRMED', receivedDateTime: '2026-10-08T13:00:00.000Z', subject: 'Lease renewal', from: { emailAddress: { address: 'dana@acme.com', name: 'Dana' } } },
  { id: 'right', conversationId: 'AQQkCONFIRMED', receivedDateTime: '2026-10-08T14:01:30.000Z', subject: 'Lease renewal', from: { emailAddress: { address: 'dana@acme.com', name: 'Dana Levi' } } }
];

console.log('--- subject fallback ---\n');
{
  const kept = FlowOwaParse.subjectFallbackRows(pane, rows);
  check('a different conversation is rejected', kept.every((r) => r.id !== 'wrong-conv'), kept.map((r) => r.id));
  check('a different minute is rejected', kept.every((r) => r.id !== 'wrong-minute'), kept.map((r) => r.id));
  check('the confirmed conversation in the same minute is kept', kept.length === 1 && kept[0].id === 'right', kept.map((r) => r.id));
  check('graph-lag: no clock accepts nothing', FlowOwaParse.subjectFallbackRows({ conversationId: 'AQQkCONFIRMED', subject: 'Lease renewal' }, rows).length === 0);
  check('graph-wrong-row: only the other conversation accepts nothing',
    FlowOwaParse.subjectFallbackRows(pane, [rows[0]]).length === 0);
}

console.log('\n--- the two drafts ---\n');
{
  const explained = FlowOutlookSync.explainDrafts([
    { id: 'draft-known', conversationId: 'conv-1' },
    { id: 'draft-ref', conversationId: 'conv-unknown' },
    { id: 'draft-odd', conversationId: 'conv-odd' }
  ], { conversations: ['conv-1'], refs: ['draft-ref'] });
  const byId = {};
  explained.forEach((row) => { byId[row.id] = row.reason; });
  check('a draft in a known conversation is draft-for-loop', byId['draft-known'] === 'draft-for-loop', byId);
  check('a stored draft ref is draft-for-loop', byId['draft-ref'] === 'draft-for-loop', byId);
  check('a draft Glance did not create is draft-unexplained', byId['draft-odd'] === 'draft-unexplained', byId);
}

console.log('\n--- sender is not a recipient ---\n');
{
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { JSDOM = null; }
  if (!JSDOM) {
    check('jsdom is installed for the sender fixture', false);
  } else {
    const html = '<!doctype html><body><div id="ReadingPaneContainerId">' +
      '<div role="heading">Lease</div>' +
      '<div class="persona"><span>Dana Levi</span></div>' +
      '<div data-testid="RecipientWell"><div id="MSG_k_TO" aria-label="אל: me@contoso.com"><span title="me@contoso.com">Me</span></div>' +
      '<div id="MSG_k_CC" aria-label="עותק: bob@other.example"><span title="bob@other.example">Bob</span></div></div>' +
      '<div role="document">Hi</div></div></body>';
    const dom = new JSDOM(html, { url: 'https://outlook.live.com/mail/0/inbox/' });
    const paneRead = FlowOwaParse.readPane(dom.window.document, 'https://outlook.live.com/mail/0/inbox/', { own: ['me@contoso.com'], userName: 'Sali' });
    check('the recipient well is not the sender', !paneRead || paneRead.senderEmail !== 'bob@other.example', paneRead && paneRead.senderEmail);
    const withFrom = html.replace('<span>Dana Levi</span>', '<span title="dana@acme.com">Dana Levi</span>');
    const dom2 = new JSDOM(withFrom, { url: 'https://outlook.live.com/mail/0/inbox/' });
    const fromPane = FlowOwaParse.readPane(dom2.window.document, 'https://outlook.live.com/mail/0/inbox/', { own: ['me@contoso.com'], userName: 'Sali' });
    check('Graph-shaped From outside the well is the sender', fromPane && fromPane.senderEmail === 'dana@acme.com', fromPane && fromPane.senderEmail);
  }
}

console.log('\n--- a missing jsdom fails the regression ---\n');
{
  const { spawnSync } = require('child_process');
  [
    'test/mail-switch-race-corpus.cjs',
    'test/cc-only-recipients-corpus.cjs',
    'test/owa-page-harness.cjs'
  ].forEach((file) => {
    const r = spawnSync(process.execPath, ['-e', [
      'const Module = require("module");',
      'const orig = Module.prototype.require;',
      'Module.prototype.require = function (id) {',
      '  if (id === "jsdom") { const err = new Error("Cannot find module \'jsdom\'"); err.code = "MODULE_NOT_FOUND"; throw err; }',
      '  return orig.apply(this, arguments);',
      '};',
      'require("./' + file + '");'
    ].join('\n')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000 });
    const out = String(r.stdout || '') + String(r.stderr || '');
    check(file + ' exits 1 when jsdom is missing',
      r.status === 1 && /jsdom is not installed/.test(out) && !/SKIPPED: jsdom/.test(out),
      { status: r.status, out: out.slice(0, 400) });
  });
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
